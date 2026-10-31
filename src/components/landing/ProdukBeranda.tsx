/**
 * Bagian produk beranda.
 *
 * Sebelumnya beranda punya dua bagian produk yang tidak sejajar: "dua jalur"
 * (konvensional/syariah) lalu "tiga layanan" (pinjaman tunai/gadai/kredit).
 * Pengunjung harus mencocokkan sendiri dua taksonomi itu. Di sini keduanya
 * dibaca sebagai satu keputusan: lihat kebutuhan, pilih jalur akad, lalu
 * bandingkan tiga hal yang paling menentukan.
 */
import { ArrowRight, HandCoins, Wallet } from "lucide-react";
import { Link } from "react-router";

import type { KartuLayanan } from "@/lib/landing-cms";
import type { TarifBiaya } from "@/lib/loan";
import type { SorotanLayanan } from "@/lib/sorotanLayanan";

import { BandingProduk } from "./BandingProduk";
import { JudulBagian } from "./JudulBagian";

type Layanan = KartuLayanan & { href: string };

/**
 * Jalur yang benar-benar tersedia untuk tiap kebutuhan. Label ini sengaja
 * pendek: tabel banding di bawahnya yang menjelaskan perbedaan akad.
 */
const JALUR_LAYANAN = [
  "Konvensional",
  "Konvensional atau syariah",
  "Konvensional atau syariah",
] as const;

export function ProdukBeranda({
  eyebrow,
  judul,
  layanan,
  sorotan,
  tarif,
  ctaLayanan,
}: {
  eyebrow: string;
  judul: string;
  layanan: readonly Layanan[];
  sorotan: readonly SorotanLayanan[];
  tarif: TarifBiaya;
  ctaLayanan: string;
}) {
  return (
    <section
      id="produk"
      aria-labelledby="produk-title"
      className="border-t border-border bg-background"
    >
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-18">
        <JudulBagian
          id="produk-title"
          label={eyebrow}
          judul={judul}
          deskripsi="Mulai dari yang Anda perlukan. Konvensional dan syariah tetap dipisah sejak awal, tetapi tidak perlu membaca dua daftar produk yang berbeda."
          className="max-w-2xl"
        />

        <div className="mt-8 grid gap-4 md:grid-cols-3 md:gap-5">
          {layanan.map((item, i) => {
            const angka = sorotan[i];
            return (
              <article
                key={item.href}
                className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-primary/35"
              >
                <div className="border-b border-border px-5 pb-4 pt-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold-foreground">
                    {JALUR_LAYANAN[i] ?? "Produk PINDAI"}
                  </p>
                  <h3 className="mt-2 font-judul text-xl leading-snug text-foreground">
                    {item.judul}
                  </h3>
                  <p className="mt-3 flex items-baseline gap-2">
                    <span className="font-judul text-[2.4rem] leading-none tabular-nums text-foreground">
                      {angka.angka}
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-gold-foreground">
                      {angka.satuan}
                    </span>
                  </p>
                </div>
                <div className="flex flex-1 flex-col px-5 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                    {angka.label}
                  </p>
                  <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">
                    {item.ringkasan}
                  </p>
                  <p className="mt-4 border-t border-border pt-3 text-sm leading-5 text-muted-foreground">
                    {item.detail}
                  </p>
                </div>
                <Link
                  className="flex min-h-12 items-center justify-between border-t border-border px-5 text-sm font-semibold text-primary hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  to={item.href}
                >
                  {ctaLayanan}
                  <ArrowRight
                    className="size-4 transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </Link>
              </article>
            );
          })}
        </div>

        <div className="mt-6 rounded-2xl border border-border bg-muted/60 p-4 sm:p-5">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Dua jalur akad
              </h3>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                Pilih jalurnya sebelum mengajukan. Rincian biaya dan dokumen
                tetap mengikuti produk yang Anda pilih.
              </p>
            </div>
            <Link
              to="/biaya"
              className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary underline underline-offset-4 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Bandingkan biaya
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Link
              to="/pinjaman/konvensional"
              className="group flex min-h-11 items-start gap-3 rounded-xl border border-primary/20 bg-card p-4 transition-colors hover:border-primary/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                <Wallet className="size-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2 text-sm font-semibold text-foreground">
                  Konvensional
                  <ArrowRight
                    className="size-4 text-primary transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </span>
                <span className="mt-1 block text-sm leading-5 text-muted-foreground">
                  Bunga flat dan potongan di muka yang tertera sebelum akad.
                </span>
              </span>
            </Link>

            <Link
              to="/pinjaman/syariah"
              className="group flex min-h-11 items-start gap-3 rounded-xl border border-gold/45 bg-gold/5 p-4 transition-colors hover:border-gold/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gold/15 text-gold-foreground">
                <HandCoins className="size-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2 text-sm font-semibold text-foreground">
                  Syariah
                  <ArrowRight
                    className="size-4 text-gold-foreground transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </span>
                <span className="mt-1 block text-sm leading-5 text-muted-foreground">
                  Murabahah untuk barang atau rahn untuk gadai, tanpa bunga.
                </span>
              </span>
            </Link>
          </div>
        </div>

        <BandingProduk tarif={tarif} ringkas />
      </div>
    </section>
  );
}
