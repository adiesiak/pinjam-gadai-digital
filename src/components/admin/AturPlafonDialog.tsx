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
import { Textarea } from "@/components/ui/textarea";
import type { Id } from "@/convex/_generated/dataModel";
import { BUNGA_BATAS, BUNGA_LANGKAH, clampPersenBunga } from "@/lib/bunga";
import { formatRupiah } from "@/lib/money";
import { clampPlafon, PLAFON_BATAS, PLAFON_LANGKAH } from "@/lib/plafon";

/**
 * MODAL ATUR PLAFON & BUNGA — satu tindakan untuk dua angka.
 *
 * Sebelumnya plafon dan bunga disimpan lewat dua tombol terpisah di dalam kartu
 * nasabah: admin harus menekan "Simpan" dua kali, dan tidak ada satu tempat yang
 * memperlihatkan akibat gabungannya. Dialog ini menyatukannya:
 *
 *  - Pilihan tunggal (radio) menentukan sumber angka: mengikuti Parameter
 *    Global System, atau atur khusus nasabah ini. Memilih global mengirim
 *    `null` ke mutation yang sama seperti tombol reset lama — jadi tidak ada
 *    jalur backend baru, hanya satu jalur yang lebih jelas.
 *  - Kalkulasi real-time [Terpakai] + [Sisa Limit] = [Total Plafon] memakai
 *    angka SERVER (`plafonTerpakai`), bukan hitungan di klien, sehingga admin
 *    melihat sisa yang benar-benar dipakai validasi pengajuan.
 *  - Catatan audit ikut dikirim sebagai `alasan` ke kedua mutation — itulah
 *    sebab catatan ini ada di dalam modal, bukan di luar.
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
  persenBungaEfektif: number;
  /** Override bunga; null = mengikuti default global. */
  persenBungaPribadi: number | null;
};

export type NilaiAturPlafon = {
  /** true = ikut Parameter Global System (override dihapus). */
  pakaiGlobal: boolean;
  /** Nominal plafon khusus (rupiah mentah; dijepit server maupun klien). */
  plafon: number;
  /** Persen bunga efektif khusus. */
  persenBunga: number;
  /** Catatan audit — dikirim sebagai `alasan` bila diisi. */
  catatan: string;
};

/** "1.000.000" → 1000000; kosong / tak valid → 0. */
function parseAngka(nilai: string): number {
  const angka = Number(nilai.replace(/[^\d]/g, ""));
  return Number.isFinite(angka) ? angka : 0;
}

/** "12,5" → 12.5; kosong / tak valid → 0. */
function parsePersen(nilai: string): number {
  const angka = Number(nilai.replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(angka) ? angka : 0;
}

/** 1000000 → "1.000.000" untuk kolom isian. */
function formatAngka(nilai: number): string {
  return new Intl.NumberFormat("id-ID").format(nilai);
}

/** 12.5 → "12,5" (tanpa tanda persen). */
function formatPersenAngka(nilai: number): string {
  return String(nilai).replace(".", ",");
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
  global: { plafon: number; bunga: number };
  busy: boolean;
  onClose: () => void;
  onSimpan: (nilai: NilaiAturPlafon) => void;
}) {
  const id = useId();
  /** Nasabah yang belum punya override apa pun otomatis mulai dari "global". */
  const [pakaiGlobal, setPakaiGlobal] = useState(
    nasabah.plafonPribadi === null && nasabah.persenBungaPribadi === null,
  );
  const [plafon, setPlafon] = useState(formatAngka(nasabah.plafonEfektif));
  const [bunga, setBunga] = useState(formatPersenAngka(nasabah.persenBungaEfektif));
  const [catatan, setCatatan] = useState("");

  const angkaPlafon = clampPlafon(parseAngka(plafon));
  const angkaBunga = clampPersenBunga(parsePersen(bunga));

  const totalPlafon = pakaiGlobal ? clampPlafon(global.plafon) : angkaPlafon;
  const bungaEfektif = pakaiGlobal ? global.bunga : angkaBunga;
  const terpakai = nasabah.plafonTerpakai;
  const sisa = Math.max(0, totalPlafon - terpakai);
  /** Plafon di bawah utang berjalan: sah disimpan, tetapi wajib diberi tanda. */
  const kurangDariTerpakai = terpakai > totalPlafon;

  const targetPlafon: number | null = pakaiGlobal ? null : angkaPlafon;
  const targetBunga: number | null = pakaiGlobal ? null : angkaBunga;
  const adaPerubahan =
    targetPlafon !== nasabah.plafonPribadi || targetBunga !== nasabah.persenBungaPribadi;

  return (
    <Dialog
      open
      onOpenChange={(terbuka) => {
        if (!terbuka && !busy) onClose();
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Atur Plafon &amp; Bunga</DialogTitle>
          <DialogDescription>
            Satu penyimpanan untuk dua angka: batas pinjaman dan bunga efektif{" "}
            <strong className="text-navy">{nasabah.nama.toUpperCase()}</strong>. Perubahan tercatat
            di Audit Trail.
          </DialogDescription>
        </DialogHeader>

        {/* ── Sumber angka: global atau khusus ── */}
        <RadioGroup
          value={pakaiGlobal ? "global" : "khusus"}
          onValueChange={(nilai) => setPakaiGlobal(nilai === "global")}
          aria-label="Sumber parameter plafon dan bunga"
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
                Plafon {formatRupiah(global.plafon)} · bunga {formatPersenAngka(global.bunga)}%.
                Override khusus nasabah ini dihapus.
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
                snapshot bunganya.
              </span>
            </span>
          </label>
        </RadioGroup>

        {/* ── Form nilai khusus ── */}
        <div className="grid gap-3 sm:grid-cols-2">
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
            <p className="mt-1.5 text-[10px] leading-4 text-muted-foreground">
              Kelipatan {formatRupiah(PLAFON_LANGKAH)} · rentang{" "}
              {formatRupiah(PLAFON_BATAS.min)}–{formatRupiah(PLAFON_BATAS.maks)}
            </p>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
            <Label htmlFor={`${id}-bunga`} className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              % Suku bunga efektif
            </Label>
            <div className="relative mt-1.5">
              <Input
                id={`${id}-bunga`}
                inputMode="decimal"
                className="pr-8 tabular-nums"
                value={pakaiGlobal ? formatPersenAngka(global.bunga) : bunga}
                disabled={pakaiGlobal || busy}
                onChange={(e) => setBunga(e.target.value.replace(/[^\d.,]/g, ""))}
                onBlur={() => setBunga(formatPersenAngka(clampPersenBunga(parsePersen(bunga))))}
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400"
              >
                %
              </span>
            </div>
            <p className="mt-1.5 text-[10px] leading-4 text-muted-foreground">
              Langkah {formatPersenAngka(BUNGA_LANGKAH)}% · rentang {BUNGA_BATAS.min}–
              {BUNGA_BATAS.maks}%
            </p>
          </div>
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
          <p className="mt-2 text-[11px] text-muted-foreground">
            Bunga efektif setelah disimpan: <strong className="text-navy">{formatPersenAngka(bungaEfektif)}%</strong>
          </p>
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
        <div className="sticky bottom-0 -mx-4 mt-1 flex shrink-0 justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:-mx-6 sm:px-6 sm:py-4">
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
                persenBunga: angkaBunga,
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
