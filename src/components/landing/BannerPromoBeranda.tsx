/**
 * Banner promo beranda — gambar kampanye yang diunggah admin.
 *
 * Satu-satunya tempat yang memutuskan kapan banner tampil adalah server
 * (`announcements.bannerPromoBerjalan`): gambar harus ada, sakelar admin
 * menyala, dan promo yang diikat masih berjalan. Komponen ini tidak menyimpan
 * aturan tanggal sendiri, jadi banner tidak bisa tertinggal setelah promonya
 * berakhir.
 *
 * Tidak ada kerangka kosong saat query belum termuat: banner yang muncul
 * belakangan menggeser isi halaman, dan itu lebih mengganggu daripada jeda
 * sepersekian detik tanpa banner.
 */
import { useQuery } from "convex/react";
import { Link } from "react-router";

import { api } from "@/convex/_generated/api";

export function BannerPromoBeranda() {
  const banner = useQuery(api.announcements.bannerPromoBerjalan);

  if (banner === undefined || banner === null) return null;

  const gambar = (
    <img
      src={banner.url}
      alt={banner.judul}
      loading="lazy"
      decoding="async"
      className="block h-auto w-full object-cover transition-transform duration-500 group-hover:scale-[1.015] sm:max-h-[380px]"
    />
  );

  return (
    <section
      aria-label="Banner promo PINDAI"
      className="mx-auto mt-8 w-full max-w-6xl px-4 sm:px-6"
    >
      {banner.tautan !== "" ? (
        <Link
          to={banner.tautan}
          className="group block overflow-hidden rounded-kartu border border-border bg-card shadow-sm ring-offset-background transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {gambar}
        </Link>
      ) : (
        <div className="group overflow-hidden rounded-kartu border border-border bg-card shadow-sm">
          {gambar}
        </div>
      )}
    </section>
  );
}
