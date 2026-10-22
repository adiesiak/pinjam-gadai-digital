/**
 * Portofolio akad syariah milik pendana.
 *
 * Data dibaca dari `syariahAkad.portofolioSaya`, yang hanya mengirim akad atas
 * nama akun ini (admin menerima seluruhnya untuk dukungan). Angka nisbah adalah
 * SNAPSHOT saat akad dicatat, bukan hitungan ulang dari taksiran yang mungkin
 * berubah.
 *
 * Selama belum ada akad, bagian ini menjelaskan sebabnya dan menautkan skema
 * akad — bukan menampilkan tabel kosong tanpa keterangan.
 */
import { useQuery } from "convex/react";
import { Info } from "lucide-react";
import { Link } from "react-router";

import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import { tanggalRingkas } from "@/lib/jatuhTempo";
import { formatRupiahAman } from "@/lib/money";

const LABEL_JENIS: Record<string, string> = {
  murabahah: "Murabahah",
  rahn: "Rahn",
  qardh: "Qardh",
};

const LABEL_STATUS: Record<string, string> = {
  aktif: "Berjalan",
  selesai: "Selesai",
  dibatalkan: "Dibatalkan",
};

function rupiah(nilai: number): string {
  return formatRupiahAman(nilai);
}

export function PortofolioSyariah() {
  const data = useQuery(api.syariahAkad.portofolioSaya);

  if (data === undefined) {
    return (
      <div className="mt-3 space-y-2 rounded-2xl border border-slate-200 bg-white p-4">
        <span className="sr-only">Memuat portofolio syariah…</span>
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (data.baris.length === 0) {
    return (
      <div className="mt-3 rounded-2xl border border-[#c9a86a]/45 bg-[#fbf7ec] p-4">
        <p className="flex items-start gap-2 text-sm font-semibold text-navy">
          <Info className="mt-0.5 size-4 shrink-0 text-amber-900" aria-hidden />
          Belum ada penempatan syariah
        </p>
        <p className="mt-1.5 max-w-2xl text-xs leading-6 text-slate-700">
          Akad Murabahah, Rahn, dan Qardh dicatat admin setelah akad disepakati.
          Pengajuan daring akad syariah belum dibuka, jadi tab ini terisi lewat
          pencatatan, bukan lewat tombol ajukan. Penempatan konvensional tetap
          ada di tab konvensional.
        </p>
        <Link
          to="/pinjaman/syariah"
          className="mt-2 inline-flex min-h-11 items-center text-xs font-semibold text-amber-900 underline underline-offset-4 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Baca skema akad syariah
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-3">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
          <dt className="text-[11px] text-slate-500">Akad berjalan</dt>
          <dd className="mt-0.5 text-sm font-semibold tabular-nums text-navy">
            {data.ringkasan.jumlahAktif}
          </dd>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
          <dt className="text-[11px] text-slate-500">Pokok ditempatkan</dt>
          <dd className="mt-0.5 text-sm font-semibold tabular-nums text-navy">
            {rupiah(data.ringkasan.totalPokok)}
          </dd>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
          <dt className="text-[11px] text-slate-500">Nisbah pendana</dt>
          <dd className="mt-0.5 text-sm font-semibold tabular-nums text-emerald-800">
            {rupiah(data.ringkasan.totalNisbah)}
          </dd>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
          <dt className="text-[11px] text-slate-500">Return terdekat</dt>
          <dd className="mt-0.5 text-sm font-semibold tabular-nums text-navy">
            {data.ringkasan.proyeksiReturnTerdekat === null
              ? "Belum ada"
              : tanggalRingkas(data.ringkasan.proyeksiReturnTerdekat)}
          </dd>
        </div>
      </dl>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[44rem] text-left text-xs">
          <caption className="sr-only">
            Akad syariah atas nama Anda beserta pokok, nisbah, jatuh tempo, dan
            statusnya
          </caption>
          <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-[0.08em] text-slate-500">
            <tr>
              <th scope="col" className="px-3 py-2 font-semibold">Akad</th>
              <th scope="col" className="px-3 py-2 font-semibold">Peminjam</th>
              <th scope="col" className="px-3 py-2 font-semibold">Pokok</th>
              <th scope="col" className="px-3 py-2 font-semibold">
                Nisbah pendana
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                Jatuh tempo
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.baris.map((row) => (
              <tr key={row._id} className="align-top">
                <th scope="row" className="px-3 py-2.5 text-left font-medium text-navy">
                  <span className="block">{row.nomorReferensi}</span>
                  <span className="text-[11px] font-normal text-slate-500">
                    {LABEL_JENIS[row.jenis] ?? row.jenis} · {row.tenorHari} hari
                  </span>
                </th>
                <td className="px-3 py-2.5 text-slate-700">{row.peminjamNama}</td>
                <td className="px-3 py-2.5 tabular-nums text-slate-900">
                  {rupiah(row.pokok)}
                </td>
                <td className="px-3 py-2.5 tabular-nums font-medium text-emerald-800">
                  {rupiah(row.nisbahPendana)}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap tabular-nums text-slate-700">
                  {row.status === "selesai"
                    ? "Selesai"
                    : tanggalRingkas(row.jatuhTempoPada)}
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={
                      row.status === "selesai"
                        ? "inline-flex rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700"
                        : row.status === "aktif"
                          ? "inline-flex rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800"
                          : "inline-flex rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800"
                    }
                  >
                    {LABEL_STATUS[row.status] ?? row.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] leading-5 text-muted-foreground">
        Nisbah adalah snapshot saat akad dicatat. Jatuh tempo adalah proyeksi
        return, bukan janji pembayaran.
      </p>
    </div>
  );
}
