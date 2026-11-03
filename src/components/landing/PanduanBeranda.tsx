/**
 * Tiga pintu panduan sebelum mengajukan.
 *
 * Ditempatkan langsung setelah bagian dokumen supaya syarat, alur, dan
 * perhitungan dibaca sebagai satu blok — bukan bagian promosi yang terpisah di
 * bawah halaman.
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
  ctaSyarat,
  panduan,
}: {
  eyebrow: string;
  judul: string;
  deskripsi: string;
  ctaSyarat: string;
  panduan: readonly PanduanBerandaItem[];
}) {
  return (
    <section
      aria-labelledby="panduan-title"
      className="pindai-bawah-lipatan bg-background"
    >
      <div className="mx-auto max-w-6xl px-4 pb-12 pt-0 sm:px-6 sm:pb-16 sm:pt-0">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2">
          <JudulBagian
            id="panduan-title"
            label={eyebrow}
            judul={judul}
            deskripsi={deskripsi}
            className="max-w-2xl border-t-0 pt-0"
          />
          <Link
            to="/syarat-ketentuan"
            className="mb-1 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-4 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {ctaSyarat}
          </Link>
        </div>
        <ul className="mt-5 grid gap-3 md:grid-cols-3">
          {panduan.map(({ href, ikon: Icon, judul: judulItem, isi }) => (
            <li key={href}>
              <Link
                to={href}
                className="group flex min-h-24 items-start gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/35 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">
                    {judulItem}
                  </span>
                  <span className="mt-1 block text-sm leading-5 text-muted-foreground">
                    {isi}
                  </span>
                </span>
                <ArrowRight
                  className="mt-2.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
