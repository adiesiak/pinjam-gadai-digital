import { useAction, useQuery } from "convex/react";
import { FileDown, FileText, Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { unduhLewatAplikasi } from "@/lib/jembatanAndroid";
import type { SuratSomasi as IsiSuratSomasi } from "@/lib/suratSomasi";

/**
 * Panel surat somasi di dalam kasus penagihan.
 *
 * Surat hanya muncul untuk pinjaman yang benar-benar sudah melewati jatuh tempo.
 * Petugas melihat isi surat lebih dulu; tombol unduh menghasilkan PDF yang sama
 * persis, supaya tidak ada versi layar dan versi berkas yang berbeda angka.
 */

export type HasilSomasi =
  | { tersedia: false; alasan: string }
  | { tersedia: true; surat: IsiSuratSomasi; namaBerkas?: string };

function blokDariBase64(base64: string): Blob {
  const biner = atob(base64);
  const byte = new Uint8Array(biner.length);
  for (let i = 0; i < biner.length; i += 1) byte[i] = biner.charCodeAt(i);
  return new Blob([byte], { type: "application/pdf" });
}

/** Simpan berkas di perangkat; aplikasi Android memakai jembatannya sendiri. */
async function simpanPdf(namaBerkas: string, base64: string): Promise<void> {
  const blob = blokDariBase64(base64);
  if (await unduhLewatAplikasi(namaBerkas, "application/pdf", blob)) return;
  const url = URL.createObjectURL(blob);
  const tautan = document.createElement("a");
  tautan.href = url;
  tautan.download = namaBerkas;
  tautan.rel = "noopener";
  document.body.appendChild(tautan);
  tautan.click();
  tautan.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function BagianSuratSomasi({
  hasil,
  terbuka,
  sibuk,
  kabar,
  galat,
  onToggle,
  onUnduh,
}: {
  /** undefined = surat masih disusun server. */
  hasil: HasilSomasi | undefined;
  terbuka: boolean;
  sibuk: boolean;
  kabar: string | null;
  galat: string | null;
  onToggle: () => void;
  onUnduh: () => void;
}) {
  if (hasil === undefined) {
    return (
      <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> Menyusun surat somasi...
      </p>
    );
  }

  if (!hasil.tersedia) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <FileText className="size-4 text-slate-500" aria-hidden="true" />
          Surat somasi belum tersedia
        </p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{hasil.alasan}</p>
      </div>
    );
  }

  const surat = hasil.surat;

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-navy">
            <FileText className="size-4 text-primary" aria-hidden="true" />
            Surat somasi keterlambatan
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {surat.nomorSurat} · batas bayar {surat.batasBayarTeks}. Surat disusun dari catatan
            pinjaman saat ini; periksa isinya sebelum diserahkan.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-11 border-slate-200 sm:h-9"
            aria-expanded={terbuka}
            onClick={onToggle}
          >
            {terbuka ? "Tutup pratinjau" : "Pratinjau surat"}
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-11 sm:h-9"
            disabled={sibuk}
            aria-busy={sibuk}
            onClick={onUnduh}
          >
            {sibuk ? (
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
            ) : (
              <FileDown className="mr-2 size-4" aria-hidden="true" />
            )}
            Unduh PDF
          </Button>
        </div>
      </div>

      {kabar !== null && (
        <p role="status" className="mt-2 text-xs leading-5 text-emerald-700">
          {kabar}
        </p>
      )}
      {galat !== null && (
        <p role="alert" className="mt-2 text-xs leading-5 text-red-600">
          {galat}
        </p>
      )}

      {terbuka && (
        <article className="mt-3 max-h-[60vh] overflow-y-auto rounded-lg border border-slate-300 bg-[#fffdf7] px-5 py-6 text-slate-900 shadow-sm sm:px-8">
          <header className="border-b border-slate-300 pb-3">
            <p className="text-xs font-bold tracking-[0.18em] text-emerald-800">PINDAI</p>
            <h3 className="mt-1 font-serif text-lg font-semibold">Surat Somasi</h3>
            <p className="mt-1 text-[11px] leading-5 text-slate-600">
              Nomor {surat.nomorSurat}
              <br />
              Tanggal {surat.tanggalTeks}
            </p>
          </header>

          <dl className="mt-4 grid gap-1 text-xs sm:grid-cols-[5.5rem_1fr]">
            <dt className="font-semibold text-slate-600">Kepada</dt>
            <dd>{surat.kepada}</dd>
            <dt className="font-semibold text-slate-600">Perihal</dt>
            <dd>{surat.perihal}</dd>
          </dl>

          <div className="mt-4 space-y-2 font-serif text-[13px] leading-6">
            {surat.paragraf.map((paragraf, indeks) => (
              <p key={`paragraf-${indeks}`}>{paragraf}</p>
            ))}
          </div>

          <dl className="mt-3 divide-y divide-slate-200 border-y border-slate-200 text-xs">
            {surat.rincian.map((baris, indeks) => (
              <div
                key={`${baris.label}-${indeks}`}
                className={`flex flex-wrap items-baseline justify-between gap-2 py-1.5 ${
                  indeks === surat.rincian.length - 1 ? "font-semibold" : ""
                }`}
              >
                <dt>{baris.label}</dt>
                <dd className="tabular-nums">{baris.nilai}</dd>
              </div>
            ))}
          </dl>

          <ol className="mt-3 list-decimal space-y-1 pl-5 font-serif text-[13px] leading-6">
            {surat.instruksiBayar.map((instruksi, indeks) => (
              <li key={`bayar-${indeks}`}>{instruksi}</li>
            ))}
          </ol>

          <div className="mt-4 space-y-2 font-serif text-[13px] leading-6">
            {surat.penutup.map((paragraf, indeks) => (
              <p key={`penutup-${indeks}`}>{paragraf}</p>
            ))}
          </div>

          <p className="mt-6 text-xs font-semibold">{surat.pembuat}</p>
          <p className="text-[10px] leading-4 text-slate-500">
            Dibuat {surat.tanggalTeks} melalui aplikasi PINDAI.
          </p>
        </article>
      )}
    </div>
  );
}

export function SuratSomasi({ loanId }: { loanId: Id<"loans"> }) {
  const data = useQuery(api.somasi.dataSomasi, { loanId });
  const unduh = useAction(api.somasi.unduhSomasi);

  const [terbuka, setTerbuka] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [kabar, setKabar] = useState<string | null>(null);
  const [galat, setGalat] = useState<string | null>(null);

  const jalankanUnduh = async () => {
    setSibuk(true);
    setKabar(null);
    setGalat(null);
    try {
      const hasil = await unduh({ loanId });
      await simpanPdf(hasil.namaBerkas, hasil.base64);
      setKabar(
        `Surat ${hasil.nomorSurat} disimpan sebagai ${hasil.namaBerkas}. Batas bayar ${hasil.batasBayarTeks}.`,
      );
    } catch (err) {
      setGalat(err instanceof Error ? err.message : "Surat somasi gagal dibuat.");
    } finally {
      setSibuk(false);
    }
  };

  return (
    <BagianSuratSomasi
      hasil={data}
      terbuka={terbuka}
      sibuk={sibuk}
      kabar={kabar}
      galat={galat}
      onToggle={() => setTerbuka((nilai) => !nilai)}
      onUnduh={() => void jalankanUnduh()}
    />
  );
}
