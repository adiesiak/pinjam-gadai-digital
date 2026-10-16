import { cn } from "@/lib/utils";

import { FOLIO, nomorFolio } from "@/components/penyediaDana/folio";
import { formatRupiahAman } from "@/lib/money";
import { pangsaBerjalan } from "@/lib/tabelPendana";

/**
 * Kepala bagian folio: nomor indeks, judul, dan catatan pendamping pada satu
 * garis rambut. Semua bagian ruang pendana memakainya supaya irama halaman
 * konsisten tanpa perlu setiap bagian mengarang kepalanya sendiri.
 */
export function KepalaFolio({
  nomor,
  judul,
  catatan,
  aksi,
  className,
}: {
  nomor: number;
  judul: string;
  catatan?: string;
  aksi?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-slate-200 pb-2",
        className,
      )}
    >
      <h2 className={cn("flex items-baseline gap-2.5", FOLIO.judul)}>
        <span aria-hidden className={cn("text-xs text-emerald-700", FOLIO.kode)}>
          {nomorFolio(nomor)}
        </span>
        {judul}
      </h2>
      {catatan !== undefined && (
        <p className="max-w-md text-xs leading-5 text-muted-foreground">{catatan}</p>
      )}
      {aksi}
    </div>
  );
}

/**
 * Dana tersalurkan sekaligus susunannya: berapa yang masih berjalan.
 *
 * "Masih berjalan" bukan angka kedua yang bisa dibandingkan dengan dana
 * tersalurkan — ia BAGIAN dari angka itu. Karena itu ia tidak pernah dicetak
 * sebagai kolom di sebelahnya, melainkan sebagai keterangan di bawah angka
 * induknya, dengan bilah yang menunjukkan porsinya sekilas. Latar bilahnya abu
 * dan bagian yang gelap adalah yang belum kembali, jadi arah bacaannya sama
 * seperti angka di bawahnya: yang terisi = yang masih berjalan.
 */
export function BilahDana({
  tersalurkan,
  berjalan,
}: {
  tersalurkan: number;
  berjalan: number;
}) {
  const persen = Math.round(pangsaBerjalan({ totalDisalurkan: tersalurkan, saldoBerjalan: berjalan }) * 100);
  return (
    <div className="mt-1">
      {tersalurkan > 0 && (
        <span
          role="img"
          aria-label={`${persen}% dana tersalurkan masih berjalan`}
          className="block h-1 w-full overflow-hidden rounded-sm bg-slate-200"
        >
          <span className="block h-full bg-navy" style={{ width: `${persen}%` }} />
        </span>
      )}
      <p className="mt-1 text-xs tabular-nums text-muted-foreground">
        {formatRupiahAman(berjalan)} masih berjalan
      </p>
    </div>
  );
}

const NADA_CATATAN = {
  amber: {
    kotak: "border-amber-300/70 bg-amber-50/60",
    label: "text-amber-900",
    isi: "text-amber-950",
  },
  emerald: {
    kotak: "border-emerald-300/70 bg-emerald-50/50",
    label: "text-emerald-800",
    isi: "text-emerald-900",
  },
  red: {
    kotak: "border-red-300/70 bg-red-50/50",
    label: "text-red-800",
    isi: "text-red-900",
  },
  netral: {
    kotak: "border-slate-200 bg-slate-50/70",
    label: "text-slate-600",
    isi: "text-slate-700",
  },
} as const;

/**
 * Catatan kebijakan satu bagian atau satu tab.
 *
 * Bentuknya kotak berbingkai dengan label di atas, bukan garis warna di tepi
 * kiri: bingkai memisahkan catatan dari data secara utuh, sedangkan garis tepi
 * hanya menambah warna tanpa menambah arti.
 */
export function CatatanKebijakan({
  label,
  nada = "netral",
  className,
  children,
}: {
  label: string;
  nada?: keyof typeof NADA_CATATAN;
  className?: string;
  children: React.ReactNode;
}) {
  const gaya = NADA_CATATAN[nada];
  return (
    <div className={cn("rounded-lg border px-4 py-3", gaya.kotak, className)}>
      <p className={cn("text-xs font-semibold uppercase tracking-[0.16em]", gaya.label)}>
        {label}
      </p>
      <div className={cn("mt-1.5 text-xs leading-6", gaya.isi)}>{children}</div>
    </div>
  );
}
