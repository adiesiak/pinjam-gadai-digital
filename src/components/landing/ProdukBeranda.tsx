/**
 * Bagian produk beranda.
 *
 * Sebelumnya beranda punya dua bagian produk yang tidak sejajar: "dua jalur"
 * (konvensional/syariah) lalu "tiga layanan" (pinjaman tunai/gadai/kredit).
 * Pengunjung harus mencocokkan sendiri dua taksonomi itu. Di sini keduanya
 * dibaca sebagai satu keputusan: lihat kebutuhan, pilih jalur akad, lalu
 * bandingkan tiga hal yang paling menentukan.
 *
 * Tampilannya sengaja seperti lembar ledger, bukan tiga kartu sejajar: nomor
 * baris, garis rambut, dan angka sorotan di kanan membuat tiap layanan bisa
 * dibandingkan dengan mata saja.
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
        <div className="grid gap-8 lg:grid-cols-[0.78fr_1.22fr] lg:items-start lg:gap-14">
          <div>
            <JudulBagian
              id="produk-title"
              nomor="01"
              label={eyebrow}
              judul={judul}
              deskripsi="Mulai dari yang Anda perlukan. Konvensional dan syariah tetap dipisah sejak awal, tetapi tidak perlu membaca dua daftar produk yang berbeda."
              className="max-w-xl"
            />
            <Link
              to="/biaya"
              className="mt-6 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary underline underline-offset-4 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Bandingkan biaya
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>

          <div>
            <div className="border-t border-border">
              {layanan.map((item, i) => {
                const angka = sorotan[i];
                return (
                  <article
                    key={item.href}
                    className="group grid gap-4 border-b border-border py-6 sm:grid-cols-[2.5rem_1fr_auto] sm:gap-6"
                  >
                    <span className="font-mono text-xs font-medium tabular-nums text-gold-foreground">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                        {JALUR_LAYANAN[i] ?? "Produk PINDAI"}
                      </p>
                      <h3 className="mt-2 font-judul text-2xl leading-snug text-foreground">
                        {item.judul}
                      </h3>
                      <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                        {item.ringkasan}
                      </p>
                      <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                        {item.detail}
                      </p>
                    </div>
                    <div className="flex items-end justify-between gap-4 sm:min-w-36 sm:flex-col sm:items-end">
                      <div className="text-left sm:text-right">
                        <p className="font-judul text-[2rem] leading-none tabular-nums text-foreground">
                          {angka.angka}
                        </p>
                        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-gold-foreground">
                          {angka.satuan}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {angka.label}
                        </p>
                      </div>
                      <Link
                        to={item.href}
                        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {ctaLayanan}
                        <ArrowRight className="size-4" aria-hidden="true" />
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="mt-8">
              <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-foreground">
                Dua jalur akad
              </h3>
              <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
                Pilih jalurnya sebelum mengajukan. Rincian biaya dan dokumen
                tetap mengikuti produk yang Anda pilih.
              </p>

              <div className="mt-4 grid border-y border-border sm:grid-cols-2 sm:divide-x sm:divide-border">
                <Link
                  to="/pinjaman/konvensional"
                  className="group flex min-h-24 flex-col justify-between gap-5 py-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:pr-6"
                >
                  <span className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.14em] text-gold-foreground">
                    Konvensional
                    <Wallet className="size-4 text-primary" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-foreground underline-offset-4 group-hover:underline">
                      Bunga flat dan potongan di muka
                    </span>
                    <span className="mt-1 block text-sm leading-6 text-muted-foreground">
                      Angka kewajiban terlihat sebelum akad, tanpa biaya yang
                      muncul belakangan.
                    </span>
                  </span>
                </Link>

                <Link
                  to="/pinjaman/syariah"
                  className="group flex min-h-24 flex-col justify-between gap-5 border-t border-border py-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:border-t-0 sm:pl-6"
                >
                  <span className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.14em] text-gold-foreground">
                    Syariah
                    <HandCoins
                      className="size-4 text-primary"
                      aria-hidden="true"
                    />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-foreground underline-offset-4 group-hover:underline">
                      Murabahah atau rahn tanpa bunga
                    </span>
                    <span className="mt-1 block text-sm leading-6 text-muted-foreground">
                      Margin jual beli atau ujrah gadai yang tertulis di akad.
                    </span>
                  </span>
                </Link>
              </div>
            </div>

            <BandingProduk tarif={tarif} ringkas />
          </div>
        </div>
      </div>
    </section>
  );
}
