/**
 * Bagian kalkulator di beranda.
 *
 * Isinya `LiveCalculator`, komponen yang sama dengan halaman `/biaya`, jadi
 * angka yang dilihat pengunjung sebelum punya akun tidak mungkin berbeda dari
 * mesin harga yang dipakai formulir pengajuan. Tarif berlaku diletakkan di
 * sampingnya supaya pengunjung tidak perlu menggulir ke bagian lain untuk
 * menghubungkan simulasi dengan potongan resmi.
 */
import { ArrowRight, Check } from "lucide-react";
import { Link } from "react-router";

import type { TarifBulanan } from "@/lib/bulanan";
import type { TarifBiaya } from "@/lib/loan";

import { BiayaBerlaku } from "./BiayaBerlaku";
import { JudulBagian } from "./JudulBagian";
import { LiveCalculator } from "./LiveCalculator";

const CATATAN = [
  "Nominal dan tenor diubah langsung; hasilnya ikut berubah.",
  "Potongan di muka memakai tarif yang berlaku hari ini.",
  "Skema harian dan cicilan bulanan ada dalam satu tempat.",
] as const;

export function KalkulatorBeranda({
  judul,
  deskripsi,
  tarif,
  tarifBulanan,
  accountHref,
  accountLabel,
}: {
  judul: string;
  deskripsi: string;
  tarif: TarifBiaya;
  /** Tarif bulanan dari Pengaturan Parameter Bisnis; kosong berarti tarif bawaan. */
  tarifBulanan?: Partial<TarifBulanan> | null;
  accountHref: string;
  accountLabel: string;
}) {
  return (
    <section
      id="kalkulator"
      aria-labelledby="kalkulator-judul"
      className="pindai-bawah-lipatan border-y border-border bg-muted"
    >
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-18">
        <JudulBagian
          id="kalkulator-judul"
          label="Kalkulator"
          judul={judul}
          deskripsi={deskripsi}
          className="max-w-2xl border-t-0 pt-0"
          deskripsiClassName="max-w-xl"
        />

        <div className="mt-8 grid gap-5 lg:grid-cols-[1.15fr_0.85fr] lg:items-start lg:gap-8">
          <LiveCalculator
            tarifBulanan={tarifBulanan}
            accountHref={accountHref}
            accountLabel={accountLabel}
          />

          <aside className="grid gap-4">
            <ul className="space-y-2.5 rounded-2xl border border-border bg-card p-5">
              {CATATAN.map((baris) => (
                <li
                  key={baris}
                  className="flex items-start gap-2.5 text-sm leading-6 text-foreground"
                >
                  <Check
                    className="mt-1 size-4 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  {baris}
                </li>
              ))}
            </ul>

            <BiayaBerlaku tarif={tarif} ringkas />

            <Link
              to="/biaya"
              className="inline-flex min-h-11 items-center gap-1.5 px-1 text-sm font-semibold text-primary underline underline-offset-4 hover:text-primary/80 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Rincian biaya lengkap
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </aside>
        </div>
      </div>
    </section>
  );
}
