import { useQuery } from "convex/react";
import { Download, Layers, TriangleAlert } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { csvAging, LABEL_BUCKET_AGING, type BucketAging } from "@/lib/aging";
import { formatRupiah } from "@/lib/money";
import { Button } from "@/components/ui/button";

import { PanelMemuat } from "./admin-shared";

/**
 * Aging pinjaman tunai + konsentrasi pokok per produk.
 *
 * Bar chart-nya CSS (bukan pustaka grafik) supaya panel ini tidak menambah
 * dependensi dan tetap terbaca di ponsel: setiap bucket satu baris, lebar bar
 * mengikuti porsi pokok terhadap bucket terbesar.
 */
export function AgingPortofolioPanel() {
  const data = useQuery(api.laporanRisiko.ringkasanRisiko, {});

  if (data === undefined) return <PanelMemuat baris={3} />;

  const maks = Math.max(1, ...data.aging.baris.map((b) => b.pokokTercatat));
  const unduh = () => {
    const isi = csvAging(data.aging, data.konsentrasi);
    const blob = new Blob([isi], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aging-portofolio-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-navy">
            <Layers className="size-4 text-primary" aria-hidden="true" />
            Aging portofolio &amp; konsentrasi
          </p>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
            Dihitung dari pokok tercatat pada pinjaman tunai yang masih berjalan.
            Bukan saldo outstanding — aplikasi tidak menyimpan sisa pokok per tanggal.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="min-h-11 rounded-full"
          onClick={unduh}
        >
          <Download className="mr-1.5 size-4" aria-hidden="true" />
          Unduh CSV
        </Button>
      </div>

      {data.aging.totalPokok === 0 ? (
        <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs leading-5 text-muted-foreground">
          Belum ada pinjaman tunai berjalan. Aging akan terisi saat ada pinjaman
          berstatus berjalan.
        </p>
      ) : (
        <>
          {data.aging.totalMenunggak > 0 && (
            <div className="mt-4 flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-950">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <p>
                <strong>{formatRupiah(data.aging.totalMenunggak)}</strong> pokok tercatat
                sudah melewati jatuh tempo ({Math.round(data.aging.rasioMenunggak * 100)}%
                dari portofolio tunai berjalan).
              </p>
            </div>
          )}

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1.5 pr-3 font-medium">Kelompok umur</th>
                  <th className="py-1.5 pr-3 font-medium">Pinjaman</th>
                  <th className="py-1.5 pr-3 font-medium">Pokok tercatat</th>
                  <th className="w-2/5 py-1.5 font-medium">Porsi</th>
                </tr>
              </thead>
              <tbody>
                {data.aging.baris.map((b) => (
                  <tr key={b.bucket} className="border-t border-slate-100">
                    <td className="py-2 pr-3 font-medium text-slate-800">
                      {LABEL_BUCKET_AGING[b.bucket as BucketAging]}
                    </td>
                    <td className="py-2 pr-3 tabular-nums text-slate-600">{b.jumlah}</td>
                    <td className="py-2 pr-3 tabular-nums text-slate-700">
                      {formatRupiah(b.pokokTercatat)}
                    </td>
                    <td className="py-2">
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-full max-w-40 overflow-hidden rounded-full bg-slate-100">
                          <span
                            className={
                              b.bucket === "lancar"
                                ? "block h-full rounded-full bg-emerald-500"
                                : b.bucket === "1-30"
                                  ? "block h-full rounded-full bg-amber-400"
                                  : "block h-full rounded-full bg-rose-500"
                            }
                            style={{ width: `${Math.round((b.pokokTercatat / maks) * 100)}%` }}
                          />
                        </span>
                        <span className="w-10 shrink-0 text-right tabular-nums text-slate-500">
                          {data.aging.totalPokok === 0
                            ? "0%"
                            : `${Math.round((b.pokokTercatat / data.aging.totalPokok) * 100)}%`}
                        </span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="mt-5 border-t border-slate-100 pt-4">
        <p className="text-xs font-semibold text-navy">Konsentrasi per produk</p>
        {data.konsentrasi.length === 0 ? (
          <p className="mt-2 text-[11px] text-muted-foreground">Belum ada pokok berjalan.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {data.konsentrasi.map((k) => (
              <li key={k.produk} className="flex flex-wrap items-center gap-2 text-xs">
                <span className="min-w-32 flex-1 font-medium text-slate-700">{k.produk}</span>
                <span className="tabular-nums text-slate-600">{formatRupiah(k.pokokTercatat)}</span>
                <span className="w-12 text-right tabular-nums text-muted-foreground">
                  {(k.porsi * 100).toFixed(1)}%
                </span>
                <span className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                  <span
                    className="block h-full rounded-full bg-emerald-700"
                    style={{ width: `${Math.round(k.porsi * 100)}%` }}
                  />
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[10px] leading-4 text-muted-foreground">
          Dihitung {new Date(data.dihitungPada).toLocaleString("id-ID")} · {data.jumlahBaris.pinjaman}{" "}
          pinjaman · {data.jumlahBaris.gadai} gadai · {data.jumlahBaris.kredit} kredit berjalan.
          Kredit dihitung dari harga barang setelah uang muka.
        </p>
      </div>
    </section>
  );
}
