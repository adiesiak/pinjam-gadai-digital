import { CalendarRange } from "lucide-react";

import { formatRupiah } from "@/lib/money";

/** Satu baris jadwal yang sudah dihitung mesin harga kontrak. */
export type JadwalPembayaranBulanan = {
  bulan: number;
  pokok: number;
  bunga: number;
  /** Biaya admin cicilan 2% pada bulan itu (0 untuk kontrak warisan). */
  biayaAdmin: number;
  total: number;
};

/**
 * Rincian pembayaran untuk kontrak BULANAN di ruang pendana.
 *
 * Pinjaman bulanan dan kredit barang memakai mesin harga yang sama
 * (`hitungSimulasiBulanan`), tetapi selama ini rinciannya hanya terlihat di
 * panel admin atau tersebar sebagai baris angka di detail. Komponen ini
 * menaruh angka yang dibutuhkan pendana di satu tempat: angsuran bulanan,
 * bunga per bulan, total bunga, biaya admin cicilan, total bayar, dan jadwal.
 *
 * Seluruh angka dihitung dari `jadwal` yang diberikan — bukan dijumlahkan
 * ulang dari tarif — supaya total di sini selalu sama dengan kontrak dan
 * pembulatan cicilan terakhir ikut terbaca.
 */
export function RincianPembayaranBulanan({
  tenorBulan,
  persenBungaPerBulan,
  potonganDiMuka = 0,
  uangMuka = 0,
  jadwal,
}: {
  tenorBulan: number;
  persenBungaPerBulan: number;
  /** Biaya 2% (atau tarif kontrak) yang dipotong di muka. */
  potonganDiMuka?: number;
  /** DP kredit barang; 0 untuk pinjaman tunai dan kredit skema bulanan. */
  uangMuka?: number;
  jadwal: readonly JadwalPembayaranBulanan[];
}) {
  if (jadwal.length === 0) return null;

  const pokok = jadwal.reduce((total, row) => total + row.pokok, 0);
  const totalBunga = jadwal.reduce((total, row) => total + row.bunga, 0);
  const totalBiayaAdmin = jadwal.reduce(
    (total, row) => total + row.biayaAdmin,
    0,
  );
  const totalAngsuran = jadwal.reduce((total, row) => total + row.total, 0);
  const totalDibayar = totalAngsuran + potonganDiMuka + uangMuka;
  const angsuranPertama = jadwal[0].total;
  const angsuranTerakhir = jadwal[jadwal.length - 1].total;
  const adaPembulatan = angsuranPertama !== angsuranTerakhir;

  return (
    <section
      aria-label="Rincian pembayaran bulanan"
      className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white"
    >
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-slate-100 px-4 py-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
            <CalendarRange className="size-3.5 text-emerald-700" aria-hidden />
            Rincian pembayaran
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Bulanan {tenorBulan} bulan · bunga flat {persenBungaPerBulan}% per
            bulan
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
            Angsuran / bulan
          </p>
          <p className="mt-0.5 text-lg font-bold tabular-nums leading-tight text-navy">
            {formatRupiah(angsuranPertama)}
          </p>
          {adaPembulatan && (
            <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
              terakhir {formatRupiah(angsuranTerakhir)}
            </p>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-5 gap-y-2 border-b border-slate-100 px-4 py-3 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Pokok kontrak</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-slate-900">
            {formatRupiah(pokok)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Bunga / bulan</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-slate-900">
            {formatRupiah(jadwal[0].bunga)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Total bunga {tenorBulan} bln</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-slate-900">
            {formatRupiah(totalBunga)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Total dibayar</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-emerald-800">
            {formatRupiah(totalDibayar)}
          </dd>
        </div>
      </dl>

      {(potonganDiMuka > 0 || uangMuka > 0) && (
        <p className="border-b border-slate-100 px-4 py-1.5 text-[11px] leading-5 text-muted-foreground">
          Total dibayar mencakup
          {uangMuka > 0 ? ` uang muka ${formatRupiah(uangMuka)}` : ""}
          {uangMuka > 0 && potonganDiMuka > 0 ? " dan" : ""}
          {potonganDiMuka > 0
            ? ` biaya di muka ${formatRupiah(potonganDiMuka)}`
            : ""}
          .
        </p>
      )}

      <details open className="group">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-700">
          <span>Jadwal {jadwal.length} cicilan</span>
          <span className="font-medium text-muted-foreground">
            Buka / tutup
          </span>
        </summary>
        <div className="overflow-x-auto border-t border-slate-100">
          <table className="w-full min-w-[420px] text-left text-xs">
            <caption className="sr-only">
              Jadwal pembayaran bulanan kontrak
            </caption>
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-1.5 font-semibold">
                  Bulan
                </th>
                <th scope="col" className="px-2 py-1.5 text-right font-semibold">
                  Pokok
                </th>
                <th scope="col" className="px-2 py-1.5 text-right font-semibold">
                  Bunga
                </th>
                <th scope="col" className="px-2 py-1.5 text-right font-semibold">
                  Biaya cicilan
                </th>
                <th scope="col" className="px-4 py-1.5 text-right font-semibold">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {jadwal.map((row) => (
                <tr key={row.bulan} className="hover:bg-slate-50">
                  <td className="px-4 py-1.5 tabular-nums text-slate-600">
                    {`${row.bulan}/${tenorBulan}`}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">
                    {formatRupiah(row.pokok)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">
                    {formatRupiah(row.bunga)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">
                    {row.biayaAdmin === 0 ? "—" : formatRupiah(row.biayaAdmin)}
                  </td>
                  <td className="px-4 py-1.5 text-right font-semibold tabular-nums text-slate-900">
                    {formatRupiah(row.total)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-slate-200 bg-slate-50/70">
              <tr>
                <th scope="row" className="px-4 py-1.5 text-left font-semibold text-slate-600">
                  Jumlah
                </th>
                <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">
                  {formatRupiah(pokok)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">
                  {formatRupiah(totalBunga)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">
                  {totalBiayaAdmin === 0 ? "—" : formatRupiah(totalBiayaAdmin)}
                </td>
                <td className="px-4 py-1.5 text-right font-semibold tabular-nums text-navy">
                  {formatRupiah(totalAngsuran)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </details>
    </section>
  );
}
