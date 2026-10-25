/**
 * Bagian kalkulator di beranda.
 *
 * Isinya `LiveCalculator`, komponen yang sama dengan halaman `/biaya`, jadi
 * angka yang dilihat pengunjung sebelum punya akun tidak mungkin berbeda dari
 * mesin harga yang dipakai formulir pengajuan. Bagian ini hanya menyediakan
 * kepala bagian dan tautan ke rincian biaya; tidak ada rumus kedua di sini.
 */
import { ArrowRight, Check } from "lucide-react";
import { Link } from "react-router";

import type { TarifBulanan } from "@/lib/bulanan";

import { LiveCalculator } from "./LiveCalculator";

const CATATAN = [
  "Nominal dan tenor diubah langsung; hasilnya ikut berubah.",
  "Potongan di muka memakai tarif yang berlaku hari ini.",
  "Skema harian dan cicilan bulanan ada dalam satu tempat.",
] as const;

export function KalkulatorBeranda({
  judul,
  deskripsi,
  tarifBulanan,
}: {
  judul: string;
  deskripsi: string;
  /** Tarif bulanan dari Pengaturan Parameter Bisnis; kosong → tarif bawaan. */
  tarifBulanan?: Partial<TarifBulanan> | null;
}) {
  return (
    <section
      id="kalkulator"
      aria-labelledby="kalkulator-judul"
      className="pindai-bawah-lipatan border-t border-border bg-muted"
    >
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:px-6 sm:py-18 lg:grid-cols-[0.8fr_1.2fr] lg:items-start lg:gap-12">
        <div className="lg:sticky lg:top-24">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            Kalkulator
          </p>
          <h2
            id="kalkulator-judul"
            className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl"
          >
            {judul}
          </h2>
          <p className="mt-3 max-w-md text-sm leading-6 text-slate-600">
            {deskripsi}
          </p>
          <ul className="mt-5 space-y-2.5">
            {CATATAN.map((baris) => (
              <li
                key={baris}
                className="flex items-start gap-2.5 text-sm leading-6 text-slate-700"
              >
                <Check
                  className="mt-1 size-3.5 shrink-0 text-primary"
                  aria-hidden="true"
                />
                {baris}
              </li>
            ))}
          </ul>
          <Link
            to="/biaya"
            className="mt-5 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary underline underline-offset-4 hover:text-primary/80 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Rincian biaya lengkap
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>

        <LiveCalculator tarifBulanan={tarifBulanan} />
      </div>
    </section>
  );
}
