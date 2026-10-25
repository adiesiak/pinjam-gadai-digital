import { useId, useState } from "react";
import { Calculator, Globe, Loader2, TriangleAlert, UserCog } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import type { Id } from "@/convex/_generated/dataModel";
import { formatRupiah } from "@/lib/money";
import {
  clampPlafon,
  LABEL_SUMBER_PLAFON,
  PLAFON_BATAS,
  PLAFON_LANGKAH,
  sumberPlafon,
} from "@/lib/plafon";

/**
 * MODAL ATUR PLAFON — satu angka, satu sumber.
 *
 * Bunga TIDAK diatur di sini: tarif pinjaman mengikuti tabel tenor website
 * (harian 7/14/21/28 hari sesuai nominal, bulanan mengikuti tenor), jadi angka
 * yang diketik admin tidak boleh menimpanya. Dialog ini hanya menetapkan batas
 * pinjaman nasabah; konsekuensi tarifnya dijelaskan sebagai catatan, bukan
 * sebagai isian.
 *
 *  - Pilihan tunggal (radio) menentukan sumber plafon: mengikuti Parameter
 *    Global System, atau khusus nasabah ini. Memilih global mengirim `null` ke
 *    mutation yang sama dengan tombol reset lama.
 *  - Kalkulasi real-time [Terpakai] + [Sisa Limit] = [Total Plafon] memakai
 *    angka SERVER (`plafonTerpakai`), bukan hitungan di klien, sehingga admin
 *    melihat sisa yang benar-benar dipakai validasi pengajuan.
 *  - Catatan audit ikut dikirim sebagai `alasan`.
 *
 * Komponen ini murni tampilan + keadaan form: seluruh penyimpanan dikerjakan
 * pemanggil lewat `onSimpan` supaya hanya ada SATU tempat yang memanggil
 * mutation (dan menangani kegagalannya).
 */

/** Bagian baris nasabah yang dibutuhkan dialog — struktur, bukan tipe Convex. */
export type NasabahPlafon = {
  userId: Id<"users">;
  nama: string;
  /** Plafon efektif saat ini (override atau progresif), dari server. */
  plafonEfektif: number;
  /** Pokok pinjaman aktif yang menahan plafon, dari server. */
  plafonTerpakai: number;
  /** Override plafon; null = mengikuti default/progresif. */
  plafonPribadi: number | null;
};

export type NilaiAturPlafon = {
  /** true = ikut Parameter Global System (override dihapus). */
  pakaiGlobal: boolean;
  /** Nominal plafon khusus (rupiah mentah; dijepit server maupun klien). */
  plafon: number;
  /** Catatan audit — dikirim sebagai `alasan` bila diisi. */
  catatan: string;
};

/** "1.000.000" → 1000000; kosong / tak valid → 0. */
function parseAngka(nilai: string): number {
  const angka = Number(nilai.replace(/[^\d]/g, ""));
  return Number.isFinite(angka) ? angka : 0;
}

/** 1000000 → "1.000.000" untuk kolom isian. */
function formatAngka(nilai: number): string {
  return new Intl.NumberFormat("id-ID").format(nilai);
}

export function AturPlafonDialog({
  nasabah,
  global,
  busy,
  onClose,
  onSimpan,
}: {
  nasabah: NasabahPlafon;
  /** Parameter global yang sedang berlaku — acuan pilihan "ikut global". */
  global: { plafon: number };
  busy: boolean;
  onClose: () => void;
  onSimpan: (nilai: NilaiAturPlafon) => void;
}) {
  const id = useId();
  /** Nasabah yang belum punya override otomatis mulai dari "global". */
  const [pakaiGlobal, setPakaiGlobal] = useState(nasabah.plafonPribadi === null);
  const [plafon, setPlafon] = useState(formatAngka(nasabah.plafonEfektif));
  const [catatan, setCatatan] = useState("");

  const angkaPlafon = clampPlafon(parseAngka(plafon));

  const totalPlafon = pakaiGlobal ? clampPlafon(global.plafon) : angkaPlafon;
  const terpakai = nasabah.plafonTerpakai;
  const sisa = Math.max(0, totalPlafon - terpakai);
  /** Plafon di bawah utang berjalan: sah disimpan, tetapi wajib diberi tanda. */
  const kurangDariTerpakai = terpakai > totalPlafon;

  const targetPlafon: number | null = pakaiGlobal ? null : angkaPlafon;
  const adaPerubahan = targetPlafon !== nasabah.plafonPribadi;
  /** Sumber angka yang SEDANG berlaku — sama dengan lencana di daftar nasabah. */
  const sumberSekarang = sumberPlafon(
    nasabah.plafonPribadi,
    nasabah.plafonEfektif,
    global.plafon,
  );

  return (
    <Dialog
      open
      onOpenChange={(terbuka) => {
        if (!terbuka && !busy) onClose();
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Atur Plafon</DialogTitle>
          <DialogDescription>
            Batas pinjaman untuk{" "}
            <strong className="text-navy">{nasabah.nama.toUpperCase()}</strong>. Bunga tidak diatur di
            sini; tarifnya mengikuti tenor yang dipilih saat pengajuan. Perubahan tercatat di Audit
            Trail.
          </DialogDescription>
        </DialogHeader>

        {/* ── Urutan sumber angka: override → progresif → global ── */}
        <ol
          aria-label="Urutan sumber plafon"
          className="flex flex-wrap items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em]"
        >
          {(Object.keys(LABEL_SUMBER_PLAFON) as Array<keyof typeof LABEL_SUMBER_PLAFON>).map(
            (kunci, i) => (
              <li key={kunci} className="flex items-center gap-1.5">
                {i > 0 && (
                  <span aria-hidden className="text-slate-300">
                    ›
                  </span>
                )}
                <span
                  className={
                    sumberSekarang === kunci
                      ? "rounded-md border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-emerald-800"
                      : "rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-slate-500"
                  }
                >
                  {LABEL_SUMBER_PLAFON[kunci]}
                </span>
              </li>
            ),
          )}
        </ol>

        {/* ── Sumber angka: global atau khusus ── */}
        <RadioGroup
          value={pakaiGlobal ? "global" : "khusus"}
          onValueChange={(nilai) => setPakaiGlobal(nilai === "global")}
          aria-label="Sumber parameter plafon"
          className="gap-2"
        >
          <label
            htmlFor={`${id}-global`}
            className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
              pakaiGlobal ? "border-emerald-300 bg-emerald-50/70" : "border-slate-200 bg-white"
            }`}
          >
            <RadioGroupItem id={`${id}-global`} value="global" className="mt-0.5" />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-navy">
                <Globe className="size-3.5 text-emerald-700" /> Ikut Parameter Global System
              </span>
              <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                Plafon {formatRupiah(global.plafon)}. Override khusus nasabah ini dihapus.
              </span>
            </span>
          </label>

          <label
            htmlFor={`${id}-khusus`}
            className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
              !pakaiGlobal ? "border-emerald-300 bg-emerald-50/70" : "border-slate-200 bg-white"
            }`}
          >
            <RadioGroupItem id={`${id}-khusus`} value="khusus" className="mt-0.5" />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-navy">
                <UserCog className="size-3.5 text-emerald-700" /> Atur Khusus Nasabah Ini
              </span>
              <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                Override berlaku untuk pengajuan berikutnya; pinjaman yang sudah cair tetap memakai
                snapshot-nya. Bunga tetap mengikuti tenor 7/14/21/28 hari (harian) atau tenor bulan
                yang dipilih.
              </span>
            </span>
          </label>
        </RadioGroup>

        {/* ── Form nilai khusus ── */}
        <div className="grid gap-3">
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
            <Label htmlFor={`${id}-plafon`} className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Nominal plafon maksimal
            </Label>
            <div className="relative mt-1.5">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400"
              >
                Rp
              </span>
              <Input
                id={`${id}-plafon`}
                inputMode="numeric"
                className="pl-8 tabular-nums"
                value={pakaiGlobal ? formatAngka(clampPlafon(global.plafon)) : plafon}
                disabled={pakaiGlobal || busy}
                onChange={(e) => setPlafon(e.target.value.replace(/\D/g, ""))}
                onBlur={() => setPlafon(formatAngka(clampPlafon(parseAngka(plafon))))}
              />
            </div>
            {/* Slider dan kolom isian menggerakkan state yang sama: admin bisa
                menggeser kasar lalu mengetik angka tepat, tanpa dua nilai. */}
            <Slider
              className="mt-3"
              aria-label="Geser plafon maksimal"
              min={PLAFON_BATAS.min}
              max={PLAFON_BATAS.maks}
              step={PLAFON_LANGKAH}
              value={[pakaiGlobal ? clampPlafon(global.plafon) : angkaPlafon]}
              disabled={pakaiGlobal || busy}
              onValueChange={([nilai]) => setPlafon(String(nilai))}
            />
            <div className="mt-2 flex items-center justify-between text-[10px] tabular-nums text-muted-foreground">
              <span>{formatRupiah(PLAFON_BATAS.min)}</span>
              <span>{formatRupiah(PLAFON_BATAS.maks)}</span>
            </div>
            <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
              Kelipatan {formatRupiah(PLAFON_LANGKAH)} · rentang{" "}
              {formatRupiah(PLAFON_BATAS.min)}–{formatRupiah(PLAFON_BATAS.maks)}
            </p>
          </div>

          <p className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[11px] leading-5 text-muted-foreground">
            Bunga pinjaman mengikuti tabel tenor website: harian 7/14/21/28 hari (26–40% sesuai
            nominal) dan bulanan 30/20/12% per bulan untuk tenor 1/3/6 bulan (marjin total 30/60/72%). Plafon hanya
            menentukan batas pokok, bukan tarifnya.
          </p>
        </div>

        {/* ── Kalkulasi real-time ── */}
        <section
          aria-label="Kalkulasi plafon"
          className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4"
        >
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            <Calculator className="size-3.5 text-emerald-700" /> Kalkulasi real-time
          </p>
          <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-amber-50 px-2 py-2">
              <dt className="text-[10px] uppercase tracking-[0.1em] text-amber-700">Terpakai</dt>
              <dd className="mt-0.5 break-words text-xs font-semibold tabular-nums text-amber-800 sm:text-sm">
                {formatRupiah(terpakai)}
              </dd>
            </div>
            <div className="rounded-lg bg-emerald-50 px-2 py-2">
              <dt className="text-[10px] uppercase tracking-[0.1em] text-emerald-700">Sisa limit</dt>
              <dd className="mt-0.5 break-words text-xs font-semibold tabular-nums text-emerald-800 sm:text-sm">
                {formatRupiah(sisa)}
              </dd>
            </div>
            <div className="rounded-lg bg-slate-100 px-2 py-2">
              <dt className="text-[10px] uppercase tracking-[0.1em] text-slate-600">Total plafon</dt>
              <dd className="mt-0.5 break-words text-xs font-semibold tabular-nums text-navy sm:text-sm">
                {formatRupiah(totalPlafon)}
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-center text-[11px] tabular-nums text-muted-foreground">
            {formatRupiah(terpakai)} + {formatRupiah(sisa)} = {formatRupiah(totalPlafon)}
          </p>
          {kurangDariTerpakai && (
            <p
              role="alert"
              className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] leading-4 text-amber-800"
            >
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span>
                Plafon di bawah utang berjalan. Pengajuan baru tidak akan muat sampai pinjaman
                aktif dilunasi — angka ini tetap boleh disimpan.
              </span>
            </p>
          )}

        </section>

        {/* ── Catatan audit ── */}
        <div>
          <Label htmlFor={`${id}-catatan`} className="text-xs font-medium text-slate-600">
            Catatan audit <span className="font-normal text-muted-foreground">(opsional)</span>
          </Label>
          <Textarea
            id={`${id}-catatan`}
            className="mt-1.5"
            rows={2}
            value={catatan}
            disabled={busy}
            onChange={(e) => setCatatan(e.target.value)}
            placeholder="mis. penyesuaian setelah verifikasi KYC dan pengecekan slip penghasilan."
          />
        </div>

        {/* Kaki tetap: satu tombol simpan untuk plafon DAN bunga. */}
        <div className="glass-dock sticky bottom-0 -mx-4 mt-1 flex shrink-0 justify-end gap-2 px-4 py-3 sm:-mx-6 sm:px-6 sm:py-4">
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            Batal
          </Button>
          <Button
            type="button"
            disabled={busy || !adaPerubahan}
            className="rounded-xl bg-emerald-700 text-white hover:bg-emerald-800"
            onClick={() =>
              onSimpan({
                pakaiGlobal,
                plafon: angkaPlafon,
                catatan: catatan.trim(),
              })
            }
          >
            {busy ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
            Simpan Perubahan
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
