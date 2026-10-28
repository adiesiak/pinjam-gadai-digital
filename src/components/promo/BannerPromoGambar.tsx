/**
 * Banner promo bergambar untuk satu penempatan.
 *
 * Server yang memilih kampanye mana yang tampil (prioritas, jadwal, promo
 * bunga yang diikat), jadi komponen ini tidak menyimpan aturan tanggal sendiri.
 * Dua sumber gambar disediakan lewat `<picture>`: ponsel memakai potongan
 * 4:5, layar lebar memakai 8:3. Bila salah satu belum diunggah, server
 * mengirim gambar yang sama untuk keduanya.
 */
import { useQuery } from "convex/react";
import { Link } from "react-router";

import { api } from "@/convex/_generated/api";
import {
  labelHitungMundur,
  type PenempatanBanner,
} from "@/lib/bannerPromo";
import { cn } from "@/lib/utils";

export function BannerPromoGambar({
  penempatan,
  className,
}: {
  penempatan: PenempatanBanner;
  className?: string;
}) {
  const banner = useQuery(api.bannerPromo.aktif, { penempatan });

  if (banner === undefined || banner === null) return null;

  const desktop: string | null = banner.desktopUrl;
  const mobile: string | null = banner.mobileUrl;
  const sumber = desktop ?? mobile;
  if (sumber === null) return null;

  // Tanpa gambar ponsel, jangan paksa rasio 4:5: materi desktop akan terpotong
  // habis. Rasio mengikuti gambar yang benar-benar tersedia.
  const kelasRasio =
    desktop !== null && mobile !== null
      ? "aspect-[4/5] sm:aspect-[8/3]"
      : mobile !== null
        ? "aspect-[4/5]"
        : "aspect-[8/3]";

  const hitungMundur = labelHitungMundur(banner.selesai);
  const isi = (
    <div
      className={`relative w-full overflow-hidden rounded-kartu border border-border bg-card shadow-sm ${kelasRasio}`}
    >
      <picture>
        {mobile !== null && (
          <source media="(max-width: 639px)" srcSet={mobile} />
        )}
        <img
          src={sumber}
          alt={banner.judul}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.015]"
        />
      </picture>
      {hitungMundur !== null && (
        <span className="absolute right-3 top-3 rounded-full bg-slate-950/75 px-2.5 py-1 text-[11px] font-semibold text-amber-100 backdrop-blur-sm">
          {hitungMundur}
        </span>
      )}
      {banner.promoNama !== null && (
        <span className="absolute bottom-3 left-3 max-w-[calc(100%-1.5rem)] truncate rounded-full bg-white/85 px-2.5 py-1 text-[11px] font-semibold text-emerald-900 backdrop-blur-sm">
          {banner.promoNama}
        </span>
      )}
    </div>
  );

  return (
    <section
      aria-label="Banner promo PINDAI"
      className={cn(
        "mx-auto mt-8 w-full max-w-6xl px-4 sm:px-6",
        className,
      )}
    >
      {banner.tautan !== "" ? (
        <Link
          to={banner.tautan}
          aria-label={banner.judul}
          className="group block rounded-kartu ring-offset-background transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {isi}
        </Link>
      ) : (
        <div className="group">{isi}</div>
      )}
    </section>
  );
}
