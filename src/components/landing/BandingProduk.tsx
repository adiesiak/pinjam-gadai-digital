/**
 * Tabel banding dua jalur pembiayaan di beranda.
 *
 * Angka di sini dibaca dari konstanta mesin (`loan`, `bulanan`, `syariah`),
 * bukan ditulis ulang di komponen: tenor atau tarif yang berubah akan langsung
 * tampil di tabel. Hanya tiga baris yang dipakai di beranda karena tiga itu
 * yang menentukan pilihan; rincian lain ada di halaman produk masing-masing.
 */
import { Link } from "react-router";

import { TENOR_BULANAN_OPTIONS } from "@/lib/bulanan";
import { TENOR_OPTIONS, type TarifBiaya } from "@/lib/loan";
import {
  MARGIN_MURABAHAH_MAX_PERSEN,
  MARGIN_MURABAHAH_MIN_PERSEN,
} from "@/lib/syariah/murabahah";
import { TENOR_AKAD_OPTIONS } from "@/lib/syariah/pengajuan";
import { UJRAH_RAHN_PERSEN_PER_30_HARI } from "@/lib/syariah/rahn";
import { persenTeks } from "@/lib/tarifBiayaTeks";

import { JudulBagian } from "./JudulBagian";

type Baris = { label: string; konvensional: string; syariah: string };

function barisBanding(tarif: TarifBiaya): readonly Baris[] {
  return [
    {
      label: "Dasar biaya",
      konvensional: `Bunga flat per tenor, potongan ${persenTeks(tarif.adminPersen)} dari pokok dibayar di muka.`,
      syariah: "Margin murabahah atau ujrah rahn yang tertulis di akad.",
    },
    {
      label: "Tenor",
      konvensional: `${TENOR_OPTIONS.join(" / ")} hari, atau ${TENOR_BULANAN_OPTIONS.join(" / ")} bulan.`,
      syariah: `${TENOR_AKAD_OPTIONS.join(" / ")} hari.`,
    },
    {
      label: "Bentuk pembiayaan",
      konvensional: "Uang tunai, gadai, atau kredit barang.",
      syariah: `Barang murabahah dengan margin ${MARGIN_MURABAHAH_MIN_PERSEN}–${MARGIN_MURABAHAH_MAX_PERSEN}%, atau gadai rahn dengan ujrah ${UJRAH_RAHN_PERSEN_PER_30_HARI}% per 30 hari.`,
    },
  ];
}

function IsiBanding({ tarif }: { tarif: TarifBiaya }) {
  const baris = barisBanding(tarif);

  return (
    <>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
        Butuh dana cepat dengan kewajiban yang sudah pasti: konvensional. Ingin
        akad jual beli atau gadai tanpa bunga: syariah.
      </p>

      <div className="mt-4 hidden overflow-hidden rounded-2xl border border-border bg-card sm:block">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">
            Perbandingan pembiayaan konvensional dan syariah
          </caption>
          <thead>
            <tr className="border-b border-border bg-muted/60">
              <th
                scope="col"
                className="w-[26%] px-4 py-3 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground"
              >
                Hal
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-sm font-semibold text-foreground"
              >
                Konvensional
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-sm font-semibold text-foreground"
              >
                Syariah
              </th>
            </tr>
          </thead>
          <tbody>
            {baris.map((row) => (
              <tr
                key={row.label}
                className="border-b border-border last:border-b-0"
              >
                <th
                  scope="row"
                  className="px-4 py-3 align-top text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground"
                >
                  {row.label}
                </th>
                <td className="px-4 py-3 align-top text-sm leading-6 text-foreground">
                  {row.konvensional}
                </td>
                <td className="px-4 py-3 align-top text-sm leading-6 text-foreground">
                  {row.syariah}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 grid gap-3 sm:hidden">
        {(
          [
            ["Konvensional", "konvensional"],
            ["Syariah", "syariah"],
          ] as const
        ).map(([judul, kunci]) => (
          <div key={kunci} className="rounded-2xl border border-border bg-card p-4">
            <p className="text-sm font-semibold text-foreground">{judul}</p>
            <dl className="mt-2 divide-y divide-border">
              {baris.map((row) => (
                <div key={row.label} className="py-2">
                  <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    {row.label}
                  </dt>
                  <dd className="mt-0.5 text-sm leading-6 text-foreground">
                    {row[kunci]}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </>
  );
}

export function BandingProduk({
  tarif,
  ringkas = false,
}: {
  tarif: TarifBiaya;
  /** Versi yang menempel di bagian produk, tanpa kepala bagian sendiri. */
  ringkas?: boolean;
}) {
  if (ringkas) {
    return (
      <div className="mt-6 border-t border-border pt-5">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div>
            <h3
              id="banding-judul"
              className="font-judul text-lg leading-snug text-foreground"
            >
              Banding singkat
            </h3>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link
              to="/pinjaman/konvensional"
              className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-4 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Produk konvensional
            </Link>
            <Link
              to="/pinjaman/syariah"
              className="inline-flex min-h-11 items-center text-sm font-semibold text-gold-foreground underline underline-offset-4 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Produk syariah
            </Link>
          </div>
        </div>
        <IsiBanding tarif={tarif} />
      </div>
    );
  }

  return (
    <section
      aria-labelledby="banding-judul"
      className="border-t border-border bg-muted"
    >
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-18">
        <JudulBagian
          id="banding-judul"
          label="Banding produk"
          judul="Konvensional atau syariah, bedanya di akad."
          deskripsi="Keduanya punya formulir, dokumen, dan perhitungan sendiri. Tabel ini membantu memilih jalur sebelum masuk ke pengajuan."
          className="max-w-2xl border-t-0 pt-0"
        />
        <IsiBanding tarif={tarif} />
      </div>
    </section>
  );
}
