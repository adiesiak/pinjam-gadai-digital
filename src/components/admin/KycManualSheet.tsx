import { useAction, useMutation, useQuery } from "convex/react";
import { CheckCircle2, IdCard, ImageUp, Loader2, Search, ShieldCheck, UserCheck } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";

import { StatusKycBadge } from "@/components/StatusKycBadge";
import {
  UnggahDokumen,
  type DokumenTerunggah,
} from "@/components/admin/pengajuan-manual/UnggahDokumen";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MemuatBaris } from "@/components/ui/loading";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useNilaiTertunda } from "@/hooks/use-validasi-tertunda";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  formDariTersimpan,
  galatDataDiri,
  penghasilanDariTeks,
  type DataDiriForm,
} from "@/lib/dataDiri";
import { LABEL_STATUS_KYC } from "@/lib/kycStatus";
import { cn } from "@/lib/utils";

/**
 * CATAT / KOREKSI KYC MANUAL — jalur petugas untuk nasabah yang identitasnya
 * diperiksa di luar alur mandiri (datang ke kantor, dokumen fisik, atau data
 * lama yang belum punya baris KYC).
 *
 * Dua mode, satu formulir:
 *  - `koreksi` kosong → pencatatan baru (status berakhir VERIFIED/manual).
 *  - `koreksi` berisi userId → perbaikan salah tulis pada baris manual yang
 *    SUDAH terverifikasi. Hanya baris manual yang boleh dikoreksi; server yang
 *    memutuskan, panel ini hanya mengirim isian.
 *
 * Foto KTP wajib ada sebelum menyimpan. Petugas boleh mengunggahnya di sini
 * (diperiksa server: bentuk, isi, ukuran) atau memakai foto yang sudah tersimpan
 * di Data Diri. Selfie dan bukti penghasilan tetap tidak diwajibkan pada jalur
 * ini karena verifikasi terjadi atas dokumen fisik.
 */
export function KycManualSheet({
  open,
  onOpenChange,
  onSelesai,
  koreksi = null,
}: {
  open: boolean;
  onOpenChange: (terbuka: boolean) => void;
  onSelesai: (userId: Id<"users">) => void;
  /** Isi untuk mengoreksi baris manual yang sudah terverifikasi. */
  koreksi?: { userId: Id<"users"> } | null;
}) {
  const koreksiId = koreksi?.userId ?? null;
  const modeKoreksi = koreksiId !== null;

  const [cari, setCari] = useState("");
  const cariTertunda = useNilaiTertunda(cari, 300);
  // Jangan memuat seluruh daftar nasabah saat laci masih tertutup: panel KYC
  // selalu terpasang, dan pencarian ini menyentuh tabel pengguna + data diri.
  const hasil = useQuery(
    api.kyc.cariNasabahUntukKycAdmin,
    open && !modeKoreksi
      ? { ...(cariTertunda.trim() === "" ? {} : { cari: cariTertunda.trim() }) }
      : "skip",
  );

  const [dipilih, setDipilih] = useState<Id<"users"> | null>(koreksiId);
  const dataDiri = useQuery(
    api.admin.dataDiriNasabah,
    dipilih === null ? "skip" : { userId: dipilih },
  );
  // Rincian KYC dipakai HANYA untuk mengisi awal mode koreksi: di sana ada
  // sumber penghasilan dan NIK yang tersimpan di baris KYC, bukan di data diri.
  const detail = useQuery(
    api.kyc.detailKycAdmin,
    open && koreksiId !== null ? { userId: koreksiId } : "skip",
  );

  const catat = useMutation(api.kyc.catatKycManual);
  const simpanKoreksi = useMutation(api.kyc.koreksiKycManual);
  const mintaUrl = useMutation(api.admin.generateDataDiriUploadUrl);
  const periksaIsi = useAction(api.berkasIdentitas.periksaIsiBerkasKyc);

  const [form, setForm] = useState<DataDiriForm>(FORM_KOSONG);
  const [sumberPenghasilan, setSumberPenghasilan] = useState("");
  const [catatan, setCatatan] = useState("");
  const [setuju, setSetuju] = useState(false);
  const [foto, setFoto] = useState<DokumenTerunggah | null>(null);
  const [terisiUntuk, setTerisiUntuk] = useState<Id<"users"> | null>(null);
  const [sudahCoba, setSudahCoba] = useState(false);
  const [busy, setBusy] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const bersihkan = () => {
    setCari("");
    setDipilih(null);
    setForm(FORM_KOSONG);
    setSumberPenghasilan("");
    setCatatan("");
    setSetuju(false);
    setFoto(null);
    setTerisiUntuk(null);
    setSudahCoba(false);
    setGalat(null);
  };

  // Saat laci dibuka, pilih nasabah yang diminta (mode koreksi) atau kosongkan
  // isian nasabah sebelumnya. Menutup laci selalu membersihkan: isian orang lain
  // tidak boleh muncul pada pembukaan berikutnya.
  useEffect(() => {
    if (!open) {
      bersihkan();
      return;
    }
    if (koreksiId !== null && dipilih !== koreksiId) {
      bersihkan();
      setDipilih(koreksiId);
    }
  }, [open, koreksiId, dipilih]);

  // Isian diambil dari data tersimpan supaya petugas tidak mengetik ulang.
  // Dijalankan sekali per nasabah, bukan setiap query memperbarui: mengetik di
  // tengah pemuatan tidak boleh ditimpa data lama.
  useEffect(() => {
    if (dipilih === null || terisiUntuk === dipilih) return;

    if (modeKoreksi) {
      if (detail === undefined || detail === null) return;
      setForm({
        namaLengkap: detail.namaLengkap ?? "",
        nik: detail.nik ?? "",
        nomorWhatsApp: detail.nomorWhatsApp ?? "",
        alamat: detail.alamat ?? "",
        pekerjaan: detail.pekerjaan ?? "",
        penghasilan:
          detail.penghasilanBulanan === null ? "" : String(detail.penghasilanBulanan),
        namaBank: detail.namaBank ?? "",
        nomorRekening: detail.nomorRekening ?? "",
      });
      setSumberPenghasilan(detail.sumberPenghasilan ?? "");
      setTerisiUntuk(dipilih);
      return;
    }

    if (dataDiri === undefined) return;
    setForm({
      ...formDariTersimpan(dataDiri.data),
      namaLengkap:
        dataDiri.data.namaLengkap.trim() === "" ? dataDiri.nama : dataDiri.data.namaLengkap,
    });
    setTerisiUntuk(dipilih);
  }, [dipilih, dataDiri, detail, modeKoreksi, terisiUntuk]);

  const galatIsian = galatDataDiri(form);
  const galatTampil = sudahCoba ? galatIsian : {};
  const adaFotoTersimpan = dataDiri?.fotoKtpUrl != null;
  const adaFoto = foto !== null || adaFotoTersimpan;

  const pilih = (userId: Id<"users">) => {
    const item = hasil?.find((baris) => baris.userId === userId);
    if (item?.statusKyc === "VERIFIED") return;
    setDipilih(userId);
    setForm(FORM_KOSONG);
    setSumberPenghasilan("");
    setCatatan("");
    setSetuju(false);
    setFoto(null);
    setTerisiUntuk(null);
    setSudahCoba(false);
    setGalat(null);
  };

  const tutup = () => {
    onOpenChange(false);
    bersihkan();
  };

  const kirim = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (dipilih === null) return;
    setSudahCoba(true);
    setGalat(null);

    if (Object.keys(galatIsian).length > 0) {
      setGalat("Periksa isian yang ditandai sebelum menyimpan.");
      return;
    }
    const penghasilan = penghasilanDariTeks(form.penghasilan);
    if (penghasilan === null) {
      setGalat("Penghasilan per bulan wajib diisi.");
      return;
    }
    if (sumberPenghasilan.trim().length < 3) {
      setGalat("Sumber penghasilan wajib diisi (minimal 3 karakter).");
      return;
    }
    if (catatan.trim().length < 10) {
      setGalat("Catatan verifikasi wajib diisi minimal 10 karakter.");
      return;
    }
    if (!setuju) {
      setGalat("Centang pernyataan bahwa dokumen fisik sudah diperiksa.");
      return;
    }
    if (!adaFoto) {
      setGalat("Foto KTP wajib dilampirkan sebelum menyimpan verifikasi manual.");
      return;
    }

    setBusy(true);
    try {
      const nama = form.namaLengkap.trim();
      const isian = {
        userId: dipilih,
        namaLengkap: form.namaLengkap,
        nik: form.nik,
        nomorWhatsApp: form.nomorWhatsApp,
        alamat: form.alamat,
        pekerjaan: form.pekerjaan,
        penghasilanBulanan: penghasilan,
        sumberPenghasilan: sumberPenghasilan.trim(),
        namaBank: form.namaBank,
        nomorRekening: form.nomorRekening,
        catatanVerifikasi: catatan.trim(),
        ...(foto === null ? {} : { fotoKtpId: foto.id }),
        konfirmasiDokumenFisik: true,
      };
      if (modeKoreksi) {
        await simpanKoreksi(isian);
        toast.success(`Data KYC manual ${nama} diperbarui. Status tetap terverifikasi.`);
      } else {
        await catat(isian);
        toast.success(`KYC ${nama} dicatat sebagai terverifikasi manual.`);
      }
      onSelesai(dipilih);
      tutup();
    } catch (err) {
      setGalat(err instanceof Error ? err.message : "KYC manual gagal disimpan.");
    } finally {
      setBusy(false);
    }
  };

  const judul = modeKoreksi ? "Koreksi KYC manual" : "Catat KYC manual";

  return (
    <Sheet
      open={open}
      onOpenChange={(terbuka) => {
        if (!terbuka) tutup();
      }}
    >
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto border-l border-slate-200 bg-white px-4 pb-8 sm:w-[46rem] sm:max-w-none sm:px-6"
      >
        <SheetHeader className="px-0 pb-3 pt-4 pr-10">
          <SheetTitle className="flex items-center gap-2 text-navy">
            <UserCheck className="size-4" aria-hidden /> {judul}
          </SheetTitle>
          <SheetDescription>
            {modeKoreksi
              ? "Perbaiki salah tulis pada verifikasi manual. Status TETAP terverifikasi; koreksi dicatat di riwayat KYC dan Audit Trail."
              : "Untuk nasabah yang identitasnya diperiksa langsung oleh petugas. Data, dasar verifikasi, dan nama petugas tercatat di riwayat KYC dan Audit Trail."}
          </SheetDescription>
        </SheetHeader>

        {dipilih === null ? (
          <div className="space-y-3">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400"
                aria-hidden
              />
              <Input
                value={cari}
                onChange={(e) => setCari(e.target.value)}
                placeholder="Cari nama, email, kode nasabah, NIK, atau WhatsApp"
                className="h-10 pl-8 text-sm"
                aria-label="Cari nasabah"
                autoFocus
              />
            </div>

            <p className="text-[11px] leading-4 text-slate-600">
              Hanya akun nasabah yang muncul. Nasabah yang sudah terverifikasi tidak dapat
              dipilih dari sini — gunakan tombol Koreksi data pada panel KYC.
            </p>

            {hasil === undefined ? (
              <MemuatBaris teks="Mencari nasabah…" className="py-6" />
            ) : hasil.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center">
                <p className="text-sm font-medium text-navy">Nasabah tidak ditemukan</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  Coba nama lain, email, kode nasabah, atau nomor WhatsApp yang terdaftar.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200">
                {hasil.map((item) => {
                  const terverifikasi = item.statusKyc === "VERIFIED";
                  return (
                    <li key={item.userId}>
                      <button
                        type="button"
                        disabled={terverifikasi}
                        onClick={() => pilih(item.userId)}
                        className={cn(
                          "flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors",
                          terverifikasi
                            ? "cursor-not-allowed bg-slate-50/70"
                            : "hover:bg-slate-50",
                        )}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-semibold text-navy">
                            {item.nama}
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] text-slate-600">
                            {item.email ?? "tanpa email"}
                            {item.kodePeminjam === null ? "" : ` · ${item.kodePeminjam}`}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          {item.statusKyc === null ? (
                            <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-600">
                              Belum ada KYC
                            </span>
                          ) : (
                            <StatusKycBadge status={item.statusKyc} />
                          )}
                          {terverifikasi ? null : (
                            <span className="text-[11px] font-medium text-primary">Pilih</span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : (
          <form className="space-y-4" onSubmit={(e) => void kirim(e)}>
            <div className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  <IdCard className="size-3.5" aria-hidden /> Nasabah dipilih
                </p>
                <p className="mt-1 truncate text-sm font-semibold text-navy">
                  {dataDiri === undefined ? "Memuat data nasabah…" : dataDiri.nama}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-600">
                  {dataDiri?.email ?? "tanpa email"}
                  {dataDiri?.ada === true ? " · data diri tersimpan" : " · data diri belum ada"}
                  {adaFotoTersimpan ? " · foto KTP tersedia" : ""}
                </p>
              </div>
              {modeKoreksi ? null : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setDipilih(null)}
                  disabled={busy}
                >
                  Ganti
                </Button>
              )}
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-900">
                <ShieldCheck className="size-3.5" aria-hidden />
                {modeKoreksi ? "Koreksi tanpa menurunkan status" : "Verifikasi tanpa pengajuan mandiri"}
              </p>
              <p className="mt-1 text-[11px] leading-5 text-amber-950">
                {modeKoreksi
                  ? "Hanya tulisan yang diperbaiki. Putusan terverifikasi tetap berlaku, dan stempel verifikasi ikut diperbarui agar menunjuk data yang benar."
                  : "Jalur ini menandai KYC terverifikasi. Pastikan dokumen asli sudah diperiksa dan nasabah menyetujui pemrosesan datanya."}{" "}
                Catatan verifikasi wajib menjelaskan apa yang diperiksa dan di mana.
              </p>
            </div>

            <UnggahDokumen
              label="Foto KTP"
              keterangan={
                adaFotoTersimpan
                  ? "Foto KTP sudah tersimpan dan akan dipakai ulang. Unggah berkas baru hanya bila foto lama tidak terbaca."
                  : "Wajib: unggah foto KTP asli yang diperiksa petugas. Berkas diperiksa server (harus gambar, maksimal 5 MB)."
              }
              accept="image/jpeg,image/png,image/webp"
              nilai={foto}
              onUbah={setFoto}
              mintaUrl={() => mintaUrl({})}
              periksa={async (id, label) => {
                await periksaIsi({ id, label });
              }}
              disabled={busy}
            />
            <p className="flex items-start gap-1.5 text-[11px] leading-4 text-slate-600">
              <ImageUp className="mt-0.5 size-3.5 shrink-0 text-slate-500" aria-hidden />
              {adaFoto
                ? "Foto KTP tersedia — syarat bukti untuk jalur manual terpenuhi."
                : "Belum ada foto KTP. Verifikasi manual tidak bisa disimpan tanpa satu pun bukti identitas."}
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <Kolom id="kyc-manual-nama" label="Nama sesuai KTP" galat={galatTampil.namaLengkap}>
                <Input
                  id="kyc-manual-nama"
                  value={form.namaLengkap}
                  onChange={(e) => setForm({ ...form, namaLengkap: e.target.value })}
                  className="h-9 text-sm"
                  autoComplete="name"
                  disabled={busy}
                />
              </Kolom>
              <Kolom id="kyc-manual-nik" label="NIK (16 angka)" galat={galatTampil.nik}>
                <Input
                  id="kyc-manual-nik"
                  value={form.nik}
                  onChange={(e) => setForm({ ...form, nik: e.target.value })}
                  className="h-9 text-sm tabular-nums"
                  inputMode="numeric"
                  autoComplete="off"
                  disabled={busy}
                />
              </Kolom>
              <Kolom
                id="kyc-manual-wa"
                label="Nomor WhatsApp"
                galat={galatTampil.nomorWhatsApp}
                petunjuk="Diawali 62, tanpa tanda +."
              >
                <Input
                  id="kyc-manual-wa"
                  value={form.nomorWhatsApp}
                  onChange={(e) => setForm({ ...form, nomorWhatsApp: e.target.value })}
                  className="h-9 text-sm tabular-nums"
                  inputMode="tel"
                  autoComplete="tel"
                  disabled={busy}
                />
              </Kolom>
              <Kolom
                id="kyc-manual-penghasilan"
                label="Penghasilan per bulan"
                galat={galatTampil.penghasilan}
              >
                <Input
                  id="kyc-manual-penghasilan"
                  value={form.penghasilan}
                  onChange={(e) => setForm({ ...form, penghasilan: e.target.value })}
                  className="h-9 text-sm tabular-nums"
                  inputMode="numeric"
                  placeholder="Contoh: 5.000.000"
                  disabled={busy}
                />
              </Kolom>
              <Kolom
                id="kyc-manual-alamat"
                label="Alamat"
                galat={galatTampil.alamat}
                className="sm:col-span-2"
              >
                <Textarea
                  id="kyc-manual-alamat"
                  value={form.alamat}
                  onChange={(e) => setForm({ ...form, alamat: e.target.value })}
                  rows={2}
                  className="text-sm"
                  disabled={busy}
                />
              </Kolom>
              <Kolom id="kyc-manual-kerja" label="Pekerjaan" galat={galatTampil.pekerjaan}>
                <Input
                  id="kyc-manual-kerja"
                  value={form.pekerjaan}
                  onChange={(e) => setForm({ ...form, pekerjaan: e.target.value })}
                  className="h-9 text-sm"
                  disabled={busy}
                />
              </Kolom>
              <Kolom
                id="kyc-manual-sumber"
                label="Sumber penghasilan"
                galat={
                  sudahCoba && sumberPenghasilan.trim().length < 3
                    ? "Wajib diisi minimal 3 karakter."
                    : undefined
                }
              >
                <Input
                  id="kyc-manual-sumber"
                  value={sumberPenghasilan}
                  onChange={(e) => setSumberPenghasilan(e.target.value)}
                  className="h-9 text-sm"
                  placeholder="Contoh: Gaji bulanan"
                  disabled={busy}
                />
              </Kolom>
              <Kolom id="kyc-manual-bank" label="Bank / e-wallet" galat={galatTampil.namaBank}>
                <Input
                  id="kyc-manual-bank"
                  value={form.namaBank}
                  onChange={(e) => setForm({ ...form, namaBank: e.target.value })}
                  className="h-9 text-sm"
                  disabled={busy}
                />
              </Kolom>
              <Kolom
                id="kyc-manual-rekening"
                label="Nomor rekening"
                galat={galatTampil.nomorRekening}
              >
                <Input
                  id="kyc-manual-rekening"
                  value={form.nomorRekening}
                  onChange={(e) => setForm({ ...form, nomorRekening: e.target.value })}
                  className="h-9 text-sm tabular-nums"
                  inputMode="numeric"
                  disabled={busy}
                />
              </Kolom>
            </div>

            <Kolom
              id="kyc-manual-catatan"
              label="Catatan verifikasi"
              galat={
                sudahCoba && catatan.trim().length < 10
                  ? "Wajib diisi minimal 10 karakter."
                  : undefined
              }
              petunjuk="Sebutkan dokumen yang diperiksa dan caranya. Contoh: KTP asli diperiksa tatap muka di kantor, 24 Okt 2026."
            >
              <Textarea
                id="kyc-manual-catatan"
                value={catatan}
                onChange={(e) => setCatatan(e.target.value)}
                rows={3}
                maxLength={300}
                className="text-sm"
                placeholder="Contoh: KTP asli diperiksa tatap muka di kantor, 24 Okt 2026."
                disabled={busy}
              />
            </Kolom>

            <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
              <Checkbox
                id="kyc-manual-setuju"
                checked={setuju}
                onCheckedChange={(nilai) => setSetuju(nilai === true)}
                disabled={busy}
                className="mt-0.5"
              />
              <span className="text-[11px] leading-5 text-slate-700">
                Saya sudah memeriksa dokumen asli nasabah dan nasabah menyetujui pemrosesan
                datanya untuk verifikasi ini.
              </span>
            </label>

            {galat !== null && (
              <p
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] leading-5 text-red-800"
              >
                {galat}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3">
              <p className="flex items-center gap-1.5 text-[11px] text-slate-600">
                <CheckCircle2 className="size-3.5 text-success-foreground" aria-hidden />
                Status akhir: {LABEL_STATUS_KYC.VERIFIED} (manual)
              </p>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" onClick={tutup} disabled={busy}>
                  Batal
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy ? (
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden />
                  ) : (
                    <ShieldCheck className="mr-1.5 size-3.5" aria-hidden />
                  )}
                  {modeKoreksi ? "Simpan koreksi" : "Simpan verifikasi"}
                </Button>
              </div>
            </div>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}

const FORM_KOSONG: DataDiriForm = {
  namaLengkap: "",
  nik: "",
  nomorWhatsApp: "",
  alamat: "",
  pekerjaan: "",
  penghasilan: "",
  namaBank: "",
  nomorRekening: "",
};

/** Satu isian + pesan galatnya, supaya pesan selalu berada di dekat kolomnya. */
function Kolom({
  id,
  label,
  galat,
  petunjuk,
  className,
  children,
}: {
  id: string;
  label: string;
  galat?: string;
  petunjuk?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <Label htmlFor={id} className="text-[11px] font-semibold text-slate-700">
        {label}
      </Label>
      <div className="mt-1">{children}</div>
      {galat === undefined && petunjuk !== undefined ? (
        <p className="mt-1 text-[10px] leading-4 text-slate-500">{petunjuk}</p>
      ) : null}
      {galat !== undefined ? (
        <p className="mt-1 text-[11px] leading-4 text-red-700">{galat}</p>
      ) : null}
    </div>
  );
}
