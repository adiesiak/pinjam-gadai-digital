/**
 * Tabel banding dua jalur pembiayaan di beranda.
 *
 * Angka di sini dibaca dari konstanta mesin (`loan`, `bulanan`, `syariah`),
 * bukan ditulis ulang di komponen: tenor atau tarif yang berubah akan langsung
 * tampil di tabel. Kalimat "bila dipilih" sengaja menyebut kebutuhan, bukan
 * janji hasil: persetujuan tetap lewat peninjauan.
 */
import { ArrowRight } from "lucide-react";
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
      label: "Rentang biaya",
      konvensional: "Bunga mengikuti matriks nominal dan tenor yang dipilih.",
      syariah: `Margin ${MARGIN_MURABAHAH_MIN_PERSEN}–${MARGIN_MURABAHAH_MAX_PERSEN}% dari harga pokok; ujrah ${UJRAH_RAHN_PERSEN_PER_30_HARI}% dari taksiran per 30 hari.`,
    },
    {
      label: "Tenor",
      konvensional: `${TENOR_OPTIONS.join(" / ")} hari, atau ${TENOR_BULANAN_OPTIONS.join(" / ")} bulan.`,
      syariah: `${TENOR_AKAD_OPTIONS.join(" / ")} hari.`,
    },
    {
      label: "Bentuk pembiayaan",
      konvensional: "Uang tunai, gadai, atau kredit barang.",
      syariah: "Barang (murabahah) atau jaminan (rahn).",
    },
    {
      label: "Bila dipilih",
      konvensional: "Butuh dana cepat dengan kewajiban yang sudah pasti.",
      syariah: "Ingin akad jual beli atau gadai tanpa bunga.",
    },
  ];
}

export function BandingProduk({ tarif }: { tarif: TarifBiaya }) {
  const baris = barisBanding(tarif);

  return (
    <section
      aria-labelledby="banding-judul"
      className="border-t border-border bg-muted"
    >
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-18">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <JudulBagian
            id="banding-judul"
            label="Banding produk"
            judul="Konvensional atau syariah, bedanya di akad."
            deskripsi="Keduanya punya formulir, dokumen, dan perhitungan sendiri. Tabel ini membantu memilih jalur sebelum masuk ke pengajuan."
            className="max-w-2xl flex-1 border-t-0 pt-0"
          />
          <div className="mb-1 flex flex-wrap gap-x-5 gap-y-2">
            <Link
              to="/pinjaman/konvensional"
              className="min-h-11 inline-flex items-center gap-1.5 text-sm font-semibold text-primary underline underline-offset-4"
            >
              Produk konvensional
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
            <Link
              to="/pinjaman/syariah"
              className="min-h-11 inline-flex items-center gap-1.5 text-sm font-semibold text-primary underline underline-offset-4"
            >
              Produk syariah
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>

        {/* Layar lebar: satu tabel, label di kiri. */}
        <div className="mt-7 hidden overflow-hidden rounded-kartu border border-border bg-card sm:block">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">
              Perbandingan pembiayaan konvensional dan syariah
            </caption>
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="w-[22%] px-4 py-3 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                  Hal
                </th>
                <th scope="col" className="px-4 py-3 text-sm font-semibold text-navy">
                  Konvensional
                </th>
                <th scope="col" className="px-4 py-3 text-sm font-semibold text-navy">
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
                    className="px-4 py-3 align-top text-xs font-semibold uppercase tracking-[0.1em] text-slate-500"
                  >
                    {row.label}
                  </th>
                  <td className="px-4 py-3 align-top text-sm leading-6 text-slate-700">
                    {row.konvensional}
                  </td>
                  <td className="px-4 py-3 align-top text-sm leading-6 text-slate-700">
                    {row.syariah}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Ponsel: dua kartu, bukan tabel yang digulir menyamping. */}
        <div className="mt-6 grid gap-3 sm:hidden">
          {(
            [
              ["Konvensional", "konvensional"],
              ["Syariah", "syariah"],
            ] as const
          ).map(([judul, kunci]) => (
            <div
              key={kunci}
              className="rounded-kartu border border-border bg-card p-4"
            >
              <p className="text-sm font-semibold text-navy">{judul}</p>
              <dl className="mt-2 divide-y divide-border">
                {baris.map((row) => (
                  <div key={row.label} className="py-2">
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                      {row.label}
                    </dt>
                    <dd className="mt-0.5 text-xs leading-5 text-slate-700">
                      {row[kunci]}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
