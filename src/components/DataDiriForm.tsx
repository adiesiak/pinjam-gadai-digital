import { CheckCircle2, ImageUp, Loader2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BilahProgres } from "@/components/ui/loading";
import { Textarea } from "@/components/ui/textarea";
import type { Id } from "@/convex/_generated/dataModel";
import { useCegahTinggalkan, useKirimSekali } from "@/hooks/use-cegah-tinggalkan";
import { useValidasiAsinkron } from "@/hooks/use-validasi-tertunda";
import { adaPerubahan, progresPersen } from "@/lib/formInteraksi";
import type { ProgresUnggah } from "@/lib/unggahDokumen";
import {
  bacaDataDiri,
  galatDataDiri,
  type DataDiriForm as IsianDataDiri,
  type IsianDataDiri as KunciIsian,
} from "@/lib/dataDiri";

/**
 * Form data diri — murni presentasional (tanpa hook Convex) supaya dipakai
 * bersama oleh panel ADMIN (`DataDiriDialog`), pencatatan pemohon baru
 * (`FormNasabahBaru`), dan sunting MANDIRI nasabah (dashboard), sekaligus bisa
 * diuji sebagai markup.
 *
 * Interaksi yang sengaja dibuat seragam dengan formulir lain (lihat
 * `lib/formInteraksi.ts`):
 *
 * - **Pesan galat muncul DI BAWAH isian yang salah**, bukan hanya sebagai satu
 *   kalimat di ujung form. Aturannya tetap milik `lib/dataDiri.ts` — server
 *   memakai fungsi yang sama — jadi tampilan ini tidak pernah "lebih longgar"
 *   atau "lebih ketat" daripada yang akan diterima server.
 * - **Galat baru muncul setelah isian disentuh atau setelah Simpan ditekan.**
 *   Formulir yang langsung merah sejak dibuka menghukum pengguna yang belum
 *   sempat mengisi apa pun.
 * - **Pemeriksaan nasabah kembar berjalan tertunda** (debounce, hanya setelah
 *   pengguna berhenti mengetik NIK) dan jawaban yang datang terlambat dibuang.
 *   Ini pemberitahuan lebih awal, BUKAN pengganti validasi server.
 * - **Perubahan yang belum disimpan diperingatkan** sebelum halaman ditinggalkan.
 * - **Kiriman tidak bisa ganda** (klik dua kali atau Enter berulang), dan tombol
 *   hanya selesai setelah pemanggil (`onSimpan`) memutuskan — tidak ada
 *   "berhasil" yang muncul sebelum server menjawab.
 */
const KELAS_LABEL = "text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400";
const KELAS_HINT = "text-[11px] leading-4 text-muted-foreground";

/** Perubahan foto KTP: `undefined` = biarkan, `null` = kosongkan, id = ganti. */
export type PerubahanFotoKtp = Id<"_storage"> | null | undefined;

export type FormDataDiriProps = {
  nama: string;
  awal: IsianDataDiri;
  /** URL foto KTP yang sudah tersimpan (sementara), atau null. */
  fotoKtpUrl: string | null;
  /** Keterangan singkat kapan/oleh siapa terakhir diperbarui. */
  sebelumnya: string;
  /**
   * Unggah satu berkas; mengembalikan storage id. Parameter kedua opsional
   * menerima laporan byte nyata dari lapisan pengiriman (bila pemanggil
   * meneruskannya lewat `unggahDokumen`), sehingga bilah progres bisa memakai
   * persen sebenarnya — dan tetap tak tentu bila total byte tidak diketahui.
   */
  unggah: (file: File, onProgres?: (progres: ProgresUnggah) => void) => Promise<Id<"_storage">>;
  busy: boolean;
  error: string | null;
  /** Label tombol simpan — mis. "Simpan data diri". */
  labelSimpan?: string;
  /**
   * Paksa tampilkan SEMUA galat per isian tanpa menunggu disentuh. Dipakai
   * pemanggil yang sudah tahu isiannya perlu dibetulkan, dan oleh uji render
   * (state "sudah disentuh" tidak bisa dicapai lewat markup statis).
   */
  tampilkanGalat?: boolean;
  /**
   * Pemeriksa asinkron opsional atas satu isian (mis. NIK sudah terdaftar?).
   * Mengembalikan kalimat peringatan, atau null bila tidak ada temuan. Dipanggil
   * hanya setelah pengguna berhenti mengetik.
   */
  periksaKembar?: (nilai: string) => Promise<string | null>;
  onSimpan: (form: IsianDataDiri, foto: PerubahanFotoKtp) => void;
  /** Batal opsional: dashboard tidak punya dialog untuk ditutup. */
  onBatal?: () => void;
};

/**
 * Satu isian: label, petunjuk, isi, dan pesan galatnya sendiri.
 *
 * `galatId` dipasang lewat `aria-describedby` oleh pemanggil (`IsianDataDiri`
 * mengirimnya sebagai prop), dan pesannya memakai `role="alert"` supaya pembaca
 * layar mengumumkan kesalahan tepat saat muncul — bukan menunggu pengguna
 * menemukannya sendiri.
 */
function Kolom({
  id,
  label,
  galat,
  hint,
  children,
}: {
  id: string;
  label: string;
  galat: string | null;
  hint?: string;
  children: ReactNode;
}) {
  const galatId = `${id}-galat`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className={KELAS_LABEL}>
        {label}
      </Label>
      {children}
      {hint !== undefined && (
        <p id={`${id}-hint`} className={KELAS_HINT}>
          {hint}
        </p>
      )}
      {galat !== null && (
        <p id={galatId} role="alert" className="text-[11px] leading-4 font-medium text-destructive">
          {galat}
        </p>
      )}
    </div>
  );
}

export function FormDataDiri({
  nama,
  awal,
  fotoKtpUrl,
  sebelumnya,
  unggah,
  busy,
  error,
  labelSimpan = "Simpan data diri",
  tampilkanGalat = false,
  periksaKembar,
  onSimpan,
  onBatal,
}: FormDataDiriProps) {
  const [form, setForm] = useState<IsianDataDiri>(awal);
  /** Perubahan foto KTP yang belum disimpan. */
  const [foto, setFoto] = useState<PerubahanFotoKtp>(undefined);
  /** Pratinjau foto (URL lokal saat baru diunggah, atau URL tersimpan). */
  const [preview, setPreview] = useState<string | null>(fotoKtpUrl);
  const [fotoBusy, setFotoBusy] = useState(false);
  const [progresFoto, setProgresFoto] = useState<ProgresUnggah | null>(null);
  const [galatLokal, setGalatLokal] = useState<string | null>(null);
  const inputFotoRef = useRef<HTMLInputElement | null>(null);

  /** Isian yang sudah disentuh — galatnya baru boleh tampil. */
  const [disentuh, setDisentuh] = useState<Partial<Record<KunciIsian, boolean>>>({});
  /** true setelah Simpan ditekan: saat itu SEMUA galat ditampilkan. */
  const [pernahCobaSimpan, setPernahCobaSimpan] = useState(false);
  const kirimSekali = useKirimSekali();

  // Kunci kiriman dibuka lagi begitu pemanggil tidak lagi sibuk, jadi kegagalan
  // server tetap bisa dicoba ulang — yang dikunci hanya kiriman yang berbarengan.
  const bukaKunci = kirimSekali.buka;
  useEffect(() => {
    if (!busy) bukaKunci();
  }, [busy, bukaKunci]);

  const galat = useMemo(() => galatDataDiri(form), [form]);
  const tampilGalat = (kunci: KunciIsian): string | null =>
    tampilkanGalat || pernahCobaSimpan || disentuh[kunci] === true
      ? (galat[kunci] ?? null)
      : null;

  /** Deskripsi isian: hint + galat, hanya yang benar-benar tampil. */
  const deskripsi = (id: string, punyaHint: boolean, galatTampil: string | null): string | undefined => {
    const ids: string[] = [];
    if (punyaHint) ids.push(`${id}-hint`);
    if (galatTampil !== null) ids.push(`${id}-galat`);
    return ids.length === 0 ? undefined : ids.join(" ");
  };

  // ===== Pemeriksaan asinkron tertunda: NIK yang mungkin sudah terdaftar =====
  const periksa = useCallback(
    async (nilai: string) => (periksaKembar === undefined ? null : periksaKembar(nilai)),
    [periksaKembar],
  );
  const { tahap: tahapKembar, hasil: temuanKembar } = useValidasiAsinkron({
    nilai: form.nik,
    minimalKarakter: 16,
    periksa,
  });

  const ubah = (kunci: KunciIsian) => (nilai: string) => {
    setForm((p) => ({ ...p, [kunci]: nilai }));
    setDisentuh((p) => (p[kunci] === true ? p : { ...p, [kunci]: true }));
  };

  const kotor = adaPerubahan(awal, form) || foto !== undefined;
  const perluDicegah = useCegahTinggalkan(kotor);

  const pilihFoto = async (file: File | undefined) => {
    if (!file) return;
    setFotoBusy(true);
    setGalatLokal(null);
    setProgresFoto(null);
    try {
      const id = await unggah(file, setProgresFoto);
      setFoto(id);
      setPreview(typeof URL !== "undefined" && "createObjectURL" in URL ? URL.createObjectURL(file) : null);
    } catch (err) {
      setGalatLokal(err instanceof Error ? err.message : "Foto KTP gagal diunggah.");
    } finally {
      setFotoBusy(false);
      setProgresFoto(null);
      // Izinkan memilih berkas yang sama lagi setelah gagal.
      if (inputFotoRef.current) inputFotoRef.current.value = "";
    }
  };

  const simpan = () => {
    setPernahCobaSimpan(true);
    const { tersimpan, pesan } = bacaDataDiri(form);
    if (tersimpan === null) {
      setGalatLokal(pesan);
      return;
    }
    if (!kirimSekali.kunci()) return;
    setGalatLokal(null);
    // Data yang sudah dinormalkan yang dikirim — sama dengan yang dilihat server.
    onSimpan(form, foto);
  };

  const pesanGalat = galatLokal ?? error;
  const adaFoto = preview !== null;

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        simpan();
      }}
    >
      <p className={KELAS_HINT}>
        Nasabah: <span className="font-semibold text-navy">{nama}</span> · {sebelumnya}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Kolom
            id="dd-nama"
            label="Nama lengkap (sesuai KTP)"
            galat={tampilGalat("namaLengkap")}
          >
            <Input
              id="dd-nama"
              value={form.namaLengkap}
              onChange={(e) => ubah("namaLengkap")(e.target.value)}
              onBlur={() => setDisentuh((p) => ({ ...p, namaLengkap: true }))}
              placeholder="Mis. Rani Puspita"
              autoComplete="name"
              required
              aria-required="true"
              aria-invalid={tampilGalat("namaLengkap") !== null}
              aria-describedby={deskripsi("dd-nama", false, tampilGalat("namaLengkap"))}
              disabled={busy}
            />
          </Kolom>
        </div>

        <div>
          <Kolom id="dd-nik" label="Nomor KTP (NIK)" galat={tampilGalat("nik")}>
            <Input
              id="dd-nik"
              inputMode="numeric"
              className="tabular-nums"
              value={form.nik}
              onChange={(e) => ubah("nik")(e.target.value)}
              onBlur={() => setDisentuh((p) => ({ ...p, nik: true }))}
              placeholder="16 angka"
              autoComplete="off"
              required
              aria-required="true"
              aria-invalid={tampilGalat("nik") !== null}
              aria-describedby={deskripsi("dd-nik", false, tampilGalat("nik"))}
              disabled={busy}
            />
          </Kolom>
          {/* Hasil pemeriksaan asinkron: tidak pernah menyimpulkan "aman" saat
              server belum menjawab, dan tidak pernah menuduh tanpa temuan. */}
          {periksaKembar !== undefined && tahapKembar !== "diam" && (
            <p
              role="status"
              aria-live="polite"
              className={
                temuanKembar === null
                  ? "mt-1 flex items-center gap-1 text-[11px] leading-4 text-muted-foreground"
                  : "mt-1 flex items-start gap-1 text-[11px] leading-4 font-medium text-amber-700"
              }
            >
              {tahapKembar === "memvalidasi" ? (
                <>
                  <Loader2 className="size-3 shrink-0 animate-spin" aria-hidden />
                  Memeriksa apakah NIK ini sudah terdaftar…
                </>
              ) : tahapKembar === "galat" ? (
                "Pemeriksaan NIK gagal dijalankan — simpan tetap divalidasi server."
              ) : temuanKembar === null ? (
                <>
                  <CheckCircle2 className="size-3 shrink-0" aria-hidden />
                  Tidak ada catatan nasabah yang cocok dengan NIK ini.
                </>
              ) : (
                temuanKembar
              )}
            </p>
          )}
        </div>

        <div>
          <Kolom id="dd-wa" label="Nomor WhatsApp" galat={tampilGalat("nomorWhatsApp")}>
            <Input
              id="dd-wa"
              inputMode="tel"
              className="tabular-nums"
              value={form.nomorWhatsApp}
              onChange={(e) => ubah("nomorWhatsApp")(e.target.value)}
              onBlur={() => setDisentuh((p) => ({ ...p, nomorWhatsApp: true }))}
              placeholder="6281234567890"
              autoComplete="tel"
              required
              aria-required="true"
              aria-invalid={tampilGalat("nomorWhatsApp") !== null}
              aria-describedby={deskripsi("dd-wa", false, tampilGalat("nomorWhatsApp"))}
              disabled={busy}
            />
          </Kolom>
        </div>

        <div className="sm:col-span-2">
          <Kolom id="dd-alamat" label="Alamat" galat={tampilGalat("alamat")} hint="Opsional.">
            <Textarea
              id="dd-alamat"
              rows={2}
              value={form.alamat}
              onChange={(e) => ubah("alamat")(e.target.value)}
              onBlur={() => setDisentuh((p) => ({ ...p, alamat: true }))}
              placeholder="Alamat sesuai KTP (opsional)"
              autoComplete="street-address"
              aria-invalid={tampilGalat("alamat") !== null}
              aria-describedby={deskripsi("dd-alamat", true, tampilGalat("alamat"))}
              disabled={busy}
            />
          </Kolom>
        </div>

        <div>
          <Kolom id="dd-pekerjaan" label="Pekerjaan" galat={tampilGalat("pekerjaan")} hint="Opsional.">
            <Input
              id="dd-pekerjaan"
              value={form.pekerjaan}
              onChange={(e) => ubah("pekerjaan")(e.target.value)}
              onBlur={() => setDisentuh((p) => ({ ...p, pekerjaan: true }))}
              placeholder="Mis. Karyawan swasta (opsional)"
              aria-invalid={tampilGalat("pekerjaan") !== null}
              aria-describedby={deskripsi("dd-pekerjaan", true, tampilGalat("pekerjaan"))}
              disabled={busy}
            />
          </Kolom>
        </div>

        <div>
          <Kolom
            id="dd-penghasilan"
            label="Penghasilan per bulan"
            galat={tampilGalat("penghasilan")}
            hint="Opsional, rupiah bulat."
          >
            <div className="relative">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400"
              >
                Rp
              </span>
              <Input
                id="dd-penghasilan"
                inputMode="numeric"
                className="pl-8 tabular-nums"
                value={form.penghasilan}
                onChange={(e) => ubah("penghasilan")(e.target.value.replace(/\D/g, ""))}
                onBlur={() => {
                  setDisentuh((p) => ({ ...p, penghasilan: true }));
                  setForm((p) => ({
                    ...p,
                    penghasilan:
                      p.penghasilan === ""
                        ? ""
                        : new Intl.NumberFormat("id-ID").format(Number(p.penghasilan)),
                  }));
                }}
                placeholder="Opsional"
                aria-invalid={tampilGalat("penghasilan") !== null}
                aria-describedby={deskripsi("dd-penghasilan", true, tampilGalat("penghasilan"))}
                disabled={busy}
              />
            </div>
          </Kolom>
        </div>

        <div>
          <Kolom id="dd-bank" label="Nama bank / e-wallet" galat={tampilGalat("namaBank")} hint="Opsional.">
            <Input
              id="dd-bank"
              value={form.namaBank}
              onChange={(e) => ubah("namaBank")(e.target.value)}
              onBlur={() => setDisentuh((p) => ({ ...p, namaBank: true }))}
              placeholder="Mis. BCA (opsional)"
              aria-invalid={tampilGalat("namaBank") !== null}
              aria-describedby={deskripsi("dd-bank", true, tampilGalat("namaBank"))}
              disabled={busy}
            />
          </Kolom>
        </div>

        <div>
          <Kolom id="dd-rekening" label="Nomor rekening" galat={tampilGalat("nomorRekening")} hint="Opsional.">
            <Input
              id="dd-rekening"
              inputMode="numeric"
              className="tabular-nums"
              value={form.nomorRekening}
              onChange={(e) => ubah("nomorRekening")(e.target.value.replace(/\D/g, ""))}
              onBlur={() => setDisentuh((p) => ({ ...p, nomorRekening: true }))}
              placeholder="Opsional"
              aria-invalid={tampilGalat("nomorRekening") !== null}
              aria-describedby={deskripsi("dd-rekening", true, tampilGalat("nomorRekening"))}
              disabled={busy}
            />
          </Kolom>
        </div>
      </div>

      {/* Foto KTP: unggah, pratinjau, dan tombol kosongkan. */}
      <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label className={KELAS_LABEL}>Foto KTP</Label>
          <div className="flex gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-1 px-2.5"
              disabled={busy || fotoBusy}
              onClick={() => inputFotoRef.current?.click()}
            >
              {fotoBusy ? <Loader2 className="size-3.5 animate-spin" /> : <ImageUp className="size-3.5" />}
              {adaFoto ? "Ganti foto" : "Unggah foto"}
            </Button>
            {adaFoto && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 gap-1 px-2.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={busy || fotoBusy}
                onClick={() => {
                  setFoto(null);
                  setPreview(null);
                }}
              >
                <Trash2 className="size-3.5" />
                Hapus
              </Button>
            )}
          </div>
        </div>
        <input
          ref={inputFotoRef}
          type="file"
          accept="image/*"
          className="hidden"
          aria-label="Berkas foto KTP"
          onChange={(e) => void pilihFoto(e.target.files?.[0])}
        />
        {adaFoto ? (
          <img
            src={preview ?? ""}
            alt="Pratinjau foto KTP"
            className="mt-2 max-h-56 w-full rounded-lg border border-slate-200 object-contain"
          />
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            Belum ada foto KTP. Format gambar apa pun, maksimal 5 MB.
          </p>
        )}
        {fotoBusy && (
          <BilahProgres
            className="mt-2"
            nilai={progresFoto === null ? null : progresPersen(progresFoto.dimuat, progresFoto.total)}
            label="Mengunggah foto KTP… jangan tutup jendela ini."
          />
        )}
        {foto === null && fotoKtpUrl !== null && (
          <p className="mt-1 text-[11px] text-amber-700">
            Foto KTP lama akan dihapus saat Anda menyimpan.
          </p>
        )}
      </div>

      {/* Galat dari server (atau validasi lokal) tetap ditampilkan sebagai satu
          kalimat; galat per isian sudah tampil di isiannya masing-masing. */}
      {pesanGalat !== null && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
          {pesanGalat}
        </p>
      )}

      {/* Penanda perubahan belum disimpan — terlihat sebelum peringatan keluar. */}
      {perluDicegah && !busy && (
        <p className="text-[11px] leading-4 text-amber-700">
          Ada perubahan yang belum disimpan. Menutup halaman ini akan menghilangkannya.
        </p>
      )}

      <DialogFooter>
        {onBatal !== undefined && (
          <Button type="button" variant="outline" disabled={busy} onClick={onBatal}>
            Batal
          </Button>
        )}
        <Button type="submit" disabled={busy || fotoBusy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {busy ? "Menyimpan…" : labelSimpan}
        </Button>
      </DialogFooter>
    </form>
  );
}
