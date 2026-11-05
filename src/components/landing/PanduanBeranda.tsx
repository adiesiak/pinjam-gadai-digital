/**
 * Tiga pintu panduan sebelum mengajukan.
 *
 * Ditempatkan langsung setelah bagian dokumen supaya syarat, alur, dan
 * perhitungan dibaca sebagai satu blok — bukan bagian promosi yang terpisah di
 * bawah halaman.
 *
 * Redesign beranda melepas kartu dari tiga pintu ini. Kolom dipisahkan garis
 * rambut supaya tetap cepat dipindai tanpa terasa seperti tiga tombol promo.
 */
import { ArrowRight, type LucideIcon } from "lucide-react";
import { Link } from "react-router";

import type { ItemPanduan } from "@/lib/landing-cms";

import { JudulBagian } from "./JudulBagian";

export type PanduanBerandaItem = ItemPanduan & {
  href: string;
  ikon: LucideIcon;
};

export function PanduanBeranda({
  eyebrow,
  judul,
  deskripsi,
  ctaKalkulator,
  ctaSyarat,
  panduan,
}: {
  eyebrow: string;
  judul: string;
  deskripsi: string;
  ctaKalkulator: string;
  ctaSyarat: string;
  panduan: readonly PanduanBerandaItem[];
}) {
  return (
    <section
      aria-labelledby="panduan-title"
      className="pindai-bawah-lipatan border-t border-border bg-background"
    >
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2">
          <JudulBagian
            id="panduan-title"
            nomor="04"
            label={eyebrow}
            judul={judul}
            deskripsi={deskripsi}
            className="max-w-2xl border-t-0 pt-0"
          />
          <div className="mb-1 flex flex-wrap items-center gap-x-4 gap-y-1">
            <a
              href="#kalkulator"
              className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-4 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {ctaKalkulator}
            </a>
            <Link
              to="/syarat-ketentuan"
              className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-4 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {ctaSyarat}
            </Link>
          </div>
        </div>

        <ul className="mt-6 grid border-y border-border md:grid-cols-3 md:divide-x md:divide-border">
          {panduan.map(({ href, ikon: Icon, judul: judulItem, isi }, i) => (
            <li
              key={href}
              className="border-b border-border last:border-b-0 md:border-b-0"
            >
              <Link
                to={href}
                className={`group flex min-h-24 flex-col gap-4 py-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:px-5 ${
                  i === 0 ? "md:pl-0" : ""
                } ${i === panduan.length - 1 ? "md:pr-0" : ""}`}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <ArrowRight
                    className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </span>
                <span>
                  <span className="block font-judul text-lg leading-snug text-foreground">
                    {judulItem}
                  </span>
                  <span className="mt-1 block text-sm leading-6 text-muted-foreground">
                    {isi}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
