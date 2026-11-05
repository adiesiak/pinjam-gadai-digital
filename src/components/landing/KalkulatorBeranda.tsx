/**
 * Bagian kalkulator di beranda.
 *
 * Isinya `LiveCalculator`, komponen yang sama dengan halaman `/biaya`, jadi
 * angka yang dilihat pengunjung sebelum punya akun tidak mungkin berbeda dari
 * mesin harga yang dipakai formulir pengajuan. Tarif berlaku diletakkan di
 * bawahnya supaya pengunjung tidak perlu menggulir ke bagian lain untuk
 * menghubungkan simulasi dengan potongan resmi.
 *
 * Sejak redesign beranda, bagian ini memakai bidang hijau kertas yang sama
 * dengan kalkulator `/biaya`: judul dan catatan di kiri, alat hitung di kanan,
 * lalu kuitansi tarif sebagai penutup.
 */
import type { TarifBulanan } from "@/lib/bulanan";
import type { TarifBiaya } from "@/lib/loan";
import type { PromoBungaRingkas } from "@/lib/promoBunga";

import { BiayaBerlaku } from "./BiayaBerlaku";
import { JudulBagian } from "./JudulBagian";
import { LiveCalculator } from "./LiveCalculator";

const CATATAN = [
  "Kalkulator ini untuk pinjaman tunai; gadai, kredit barang, dan syariah dihitung di halamannya.",
  "Nominal dan tanggal jatuh tempo diubah langsung; hasilnya ikut berubah.",
  "Potongan di muka memakai tarif yang berlaku hari ini.",
] as const;

export function KalkulatorBeranda({
  judul,
  deskripsi,
  tarif,
  tarifBulanan,
  promos = [],
  accountHref,
  accountLabel,
}: {
  judul: string;
  deskripsi: string;
  tarif: TarifBiaya;
  /** Tarif bulanan dari Pengaturan Parameter Bisnis; kosong berarti tarif bawaan. */
  tarifBulanan?: Partial<TarifBulanan> | null;
  /** Promo bunga dibaca pemanggil agar slot promo beranda bisa dijaga satu. */
  promos?: readonly PromoBungaRingkas[];
  accountHref: string;
  accountLabel: string;
}) {
  return (
    <section
      id="kalkulator"
      aria-labelledby="kalkulator-judul"
      className="pindai-bawah-lipatan scroll-mt-20 border-t border-sky-200 bg-sky-100"
    >
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-18">
        <div className="grid gap-8 lg:grid-cols-[0.7fr_1.3fr] lg:items-start lg:gap-12">
          <div>
            <JudulBagian
              id="kalkulator-judul"
              nomor="02"
              label="Kalkulator"
              judul={judul}
              deskripsi={deskripsi}
              className="max-w-xl border-t-0 pt-0"
              deskripsiClassName="max-w-xl text-slate-700"
            />

            <ol className="mt-7 divide-y divide-sky-200 border-y border-sky-200">
              {CATATAN.map((baris, i) => (
                <li
                  key={baris}
                  className="flex items-start gap-3 py-3 text-sm leading-6 text-slate-700"
                >
                  <span className="mt-0.5 font-mono text-xs tabular-nums text-gold-foreground">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span>{baris}</span>
                </li>
              ))}
            </ol>

          </div>

          <div className="grid gap-4">
            <LiveCalculator
              tarifBulanan={tarifBulanan}
              tarifBiaya={tarif}
              promos={promos}
              accountHref={accountHref}
              accountLabel={accountLabel}
            />
            <BiayaBerlaku tarif={tarif} ringkas />
          </div>
        </div>
      </div>
    </section>
  );
}
