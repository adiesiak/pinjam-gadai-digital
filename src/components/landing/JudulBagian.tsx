/**
 * Kepala bagian beranda.
 *
 * Sebelumnya tiap bagian membuka dengan pola yang sama: label kecil, judul
 * sans yang ukurannya nyaris sama dengan isi, tanpa pemisah yang berarti. Di
 * halaman sepanjang ini pola itu membuat semua bagian terlihat setara, dan
 * halaman terasa datar walau isinya berbeda-beda.
 *
 * Satu kepala bagian dipakai bersama supaya halaman terbaca sebagai satu
 * dokumen: garis rambut di atas, label kuningan bertracking lebar, lalu judul
 * serif yang jauh lebih besar dari teks isi. Judul serif datang dari token
 * `--font-display`, jadi preset tampilan lain tetap memakai hurufnya sendiri.
 */
import { cn } from "@/lib/utils";

export function JudulBagian({
  id,
  label,
  judul,
  deskripsi,
  className,
  judulClassName,
  deskripsiClassName,
}: {
  /** Id judul; bagian merujuk balik lewat `aria-labelledby`. */
  id: string;
  /** Label pendek di atas judul, mis. "Biaya" atau "Alur & dokumen". */
  label: string;
  judul: string;
  deskripsi?: string;
  className?: string;
  judulClassName?: string;
  deskripsiClassName?: string;
}) {
  return (
    <div className={cn("border-t border-border pt-5", className)}>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-foreground">
        {label}
      </p>
      <h2
        id={id}
        className={cn(
          "font-judul mt-2.5 text-[1.7rem] leading-[1.15] tracking-tight text-foreground sm:text-[2.1rem]",
          judulClassName,
        )}
      >
        {judul}
      </h2>
      {deskripsi ? (
        <p
          className={cn(
            "mt-3 text-sm leading-6 text-slate-600",
            deskripsiClassName,
          )}
        >
          {deskripsi}
        </p>
      ) : null}
    </div>
  );
}
