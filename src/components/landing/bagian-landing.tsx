/**
 * Potongan tipografi landing yang dipakai lebih dari satu seksi.
 *
 * Keduanya dulu tinggal di `pages/Landing.tsx`. Setelah seksi brankas dan promo
 * dipindah ke berkas sendiri, keduanya butuh judul berfolio yang sama — jadi
 * definisinya diangkat ke sini alih-alih disalin dua kali.
 */
import type { ReactNode } from "react";

/**
 * Tautan seksi yang berdiri sendiri. Garis bawah muncul saat hover/fokus,
 * bukan permanen: satu halaman dengan banyak tautan bergaris bawah terbaca
 * seperti daftar promo, bukan dokumen. Tautan di dalam paragraf tetap memakai
 * garis bawah supaya tetap dikenali tanpa mengandalkan warna.
 */
export const KELAS_TAUTAN_SEKSI =
  "inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 transition-colors hover:text-primary/80 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function BrandWordmark({ name, compact = false }: { name: string; compact?: boolean }) {
  return (
    <span className="flex min-w-0 flex-col gap-1">
      <span className="flex items-baseline gap-1.5 leading-none">
        <span
          className={`truncate font-black uppercase text-primary ${
            compact ? "text-sm tracking-[0.16em]" : "text-lg tracking-[0.2em]"
          }`}
        >
          {name}
        </span>
        <span className="size-1.5 shrink-0 rounded-full bg-[#b99b62]" aria-hidden="true" />
      </span>
      <span
        className={`hidden items-center gap-1.5 font-semibold uppercase leading-none tracking-[0.13em] text-slate-400 sm:flex ${
          compact ? "text-[8px]" : "text-[9px]"
        }`}
      >
        <span className="h-px w-3 shrink-0 bg-[#b99b62]" aria-hidden="true" />
        Pinjam · Gadai Digital
      </span>
    </span>
  );
}

/** Judul bagian dengan penomoran folio gaya buku besar. Dipakai konsisten di
 *  seluruh landing supaya irama tipografinya sama; set `gelap` untuk bagian
 *  yang berlatar hijau tua. */
export function SectionHeading({
  folio,
  eyebrow,
  title,
  description,
  gelap = false,
  align = "left",
}: {
  folio: string;
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  gelap?: boolean;
  align?: "left" | "center";
}) {
  const tengah = align === "center";
  return (
    <div className="min-w-0">
      <div className={`flex items-center gap-2.5 ${tengah ? "justify-center" : ""}`}>
        <span
          className={`font-mono text-xs font-semibold tracking-[0.18em] tabular-nums ${
            gelap ? "text-[#d8c28c]" : "text-[#b99b62]"
          }`}
        >
          {folio}
        </span>
        <span
          aria-hidden="true"
          className={`h-px w-6 ${gelap ? "bg-[#d8c28c]/50" : "bg-[#b99b62]/50"}`}
        />
        <span
          className={`text-xs font-semibold uppercase tracking-[0.18em] ${
            gelap ? "text-[#e6d3a5]" : "text-[#9c7b3a]"
          }`}
        >
          {eyebrow}
        </span>
      </div>
      <h2
        className={`mt-3 text-2xl font-semibold tracking-tight sm:text-3xl ${
          gelap ? "text-white" : "text-slate-950"
        } ${tengah ? "text-center" : ""}`}
      >
        {title}
      </h2>
      {description ? (
        <p
          className={`mt-3 text-base leading-7 ${gelap ? "text-white/70" : "text-slate-600"} ${
            tengah ? "mx-auto max-w-2xl text-center" : "max-w-2xl"
          }`}
        >
          {description}
        </p>
      ) : null}
    </div>
  );
}
