import { useQuery } from "convex/react";
import { Calculator } from "lucide-react";
import { useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { PortofolioSyariah } from "@/components/penyediaDana/PortofolioSyariah";
import { api } from "@/convex/_generated/api";
import {
  LABEL_TENOR_PENDANA,
  LABEL_YIELD_PENDANA,
  PERSEN_IMBAL_PENDANA,
  TENOR_PENDANA_HARI,
  bagiHasilPendana,
} from "@/lib/imbalPendana";
import { formatRupiahAman } from "@/lib/money";

function rupiah(nilai: number): string {
  return formatRupiahAman(nilai);
}

const BULAN_SINGKAT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];

/**
 * Tanggal proyeksi return per alokasi, dari jatuh tempo pinjaman.
 * Nama bulan ditulis manual supaya hasilnya tidak bergeser antar mesin
 * (format `id-ID` bawaan bergantung data lokal yang tersedia).
 */
function tanggal(ms: number): string {
  const t = new Date(ms);
  return `${t.getDate()} ${BULAN_SINGKAT[t.getMonth()]} ${t.getFullYear()}`;
}

/** Angka contoh saat kolom masih kosong; bukan janji hasil. */
const NOMINAL_AWAL = 1_000_000;

/**
 * Kalkulator pendanaan dengan skema TETAP.
 *
 * Hanya tiga angka yang perlu dibaca pendana: nominal yang dititipkan, imbal
 * hasil 30% untuk siklus 30 hari, dan biaya platform yang dipotong dari uang
 * yang kembali. Tenor nasabah (7/14/28 hari) sengaja tidak muncul: ia tidak
 * mengubah hak pendana.
 *
 * Perhitungannya memakai `lib/imbalPendana`, modul yang sama dengan backend,
 * jadi angka di kalkulator tidak bisa berbeda dari catatan portofolio.
 */
export function KalkulatorImbalPendana({
  persenPotonganAdmin,
  nominalAwal = NOMINAL_AWAL,
}: {
  /** Biaya platform dari Pengaturan Sistem, dalam persen. */
  persenPotonganAdmin: number;
  /** Nominal awal yang ditampilkan; dipakai uji render. */
  nominalAwal?: number;
}) {
  const [nominal, setNominal] = useState(nominalAwal);

  const hasil = bagiHasilPendana(nominal, persenPotonganAdmin);

  return (
    <section
      aria-labelledby="judul-kalkulator-pendana"
      className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800">
          <Calculator className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 id="judul-kalkulator-pendana" className="text-sm font-semibold text-navy">
            Estimasi pendanaan
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
            Tenor pendana tetap {TENOR_PENDANA_HARI} hari dengan imbal hasil{" "}
            {PERSEN_IMBAL_PENDANA}% flat, terpisah dari tenor pinjaman nasabah.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] sm:items-start">
        <div>
          <label
            htmlFor="nominal-pendanaan"
            className="text-xs font-medium text-slate-700"
          >
            Nominal pendanaan
          </label>
          <div className="mt-1 flex items-center rounded-xl border border-slate-300 bg-white focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-600/20">
            <span className="pl-3 text-xs font-medium text-slate-500">Rp</span>
            <input
              id="nominal-pendanaan"
              inputMode="numeric"
              autoComplete="off"
              value={nominal === 0 ? "" : nominal.toLocaleString("id-ID")}
              onChange={(event) => {
                const angka = Number(event.target.value.replace(/[^0-9]/g, ""));
                setNominal(Number.isSafeInteger(angka) ? angka : 0);
              }}
              placeholder="1.000.000"
              className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm font-semibold tabular-nums text-navy outline-none"
            />
          </div>
          <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">
            {LABEL_TENOR_PENDANA} · {LABEL_YIELD_PENDANA}
          </p>
        </div>

        <dl className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2.5">
            <dt className="text-[11px] font-medium text-emerald-800">
              Imbal Hasil ({PERSEN_IMBAL_PENDANA}%)
            </dt>
            <dd className="mt-0.5 text-base font-semibold tabular-nums text-emerald-900">
              {rupiah(hasil.imbal)}
            </dd>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <dt className="text-[11px] font-medium text-slate-600">
              Total pengembalian
            </dt>
            <dd className="mt-0.5 text-base font-semibold tabular-nums text-navy">
              {rupiah(hasil.total)}
            </dd>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
            <dt className="text-[11px] font-medium text-slate-600">
              Biaya platform ({persenPotonganAdmin}%)
            </dt>
            <dd className="mt-0.5 text-sm font-semibold tabular-nums text-slate-800">
              {rupiah(hasil.potonganAdmin)}
            </dd>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
            <dt className="text-[11px] font-medium text-slate-600">
              Diterima bersih
            </dt>
            <dd className="mt-0.5 text-sm font-semibold tabular-nums text-navy">
              {rupiah(hasil.diterima)}
            </dd>
          </div>
        </dl>
      </div>

      <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
        Estimasi, bukan jaminan. Imbal Hasil baru menjadi uang Anda saat pinjaman
        lunas; perpanjangan atau cicil pokok nasabah tidak mengubah angkanya.
      </p>
    </section>
  );
}

/** Satu baris portofolio pendanaan yang dibaca tabel. */
export type BarisPortofolioPendanaan = {
  id: string;
  nomorReferensi: string;
  pokok: number;
  imbalHasil: number;
  status: string;
  /** Jatuh tempo pinjaman sebagai proyeksi tanggal return; null bila tidak ada. */
  tanggalReturn: number | null;
};

/**
 * Tabel portofolio pendanaan dengan kolom tetap: tenor 30 hari, yield 30%
 * p.p., dan status pendanaan. Nominal serta imbal hasil datang dari server.
 */
export function TabelPortofolioPendanaan({
  rows,
}: {
  rows: readonly BarisPortofolioPendanaan[];
}) {
  return (
    <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="w-full min-w-[42rem] border-collapse text-left text-xs">
        <caption className="sr-only">
          Portofolio pendanaan Anda dengan tenor {LABEL_TENOR_PENDANA} dan yield{" "}
          {LABEL_YIELD_PENDANA}
        </caption>
        <thead className="bg-slate-50">
          <tr className="text-[11px] uppercase tracking-[0.08em] text-slate-600">
            <th scope="col" className="px-3 py-2 font-semibold">Pinjaman</th>
            <th scope="col" className="px-3 py-2 font-semibold">Nominal</th>
            <th scope="col" className="px-3 py-2 font-semibold">Tenor</th>
            <th scope="col" className="px-3 py-2 font-semibold">Yield pendana</th>
            <th scope="col" className="px-3 py-2 font-semibold">Estimasi imbal</th>
            <th scope="col" className="px-3 py-2 font-semibold">Proyeksi return</th>
            <th scope="col" className="px-3 py-2 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                Belum ada pendanaan. Portofolio muncul setelah alokasi dana dicatat.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id} className="align-top">
                <th scope="row" className="px-3 py-2.5 text-left font-medium text-navy">
                  {row.nomorReferensi}
                </th>
                <td className="px-3 py-2.5 tabular-nums text-slate-900">
                  {rupiah(row.pokok)}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap text-slate-700">
                  {LABEL_TENOR_PENDANA}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap text-slate-700">
                  {LABEL_YIELD_PENDANA}
                </td>
                <td className="px-3 py-2.5 tabular-nums font-medium text-emerald-800">
                  {rupiah(row.imbalHasil)}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap tabular-nums text-slate-700">
                  {row.status === "Selesai"
                    ? "Selesai"
                    : row.tanggalReturn === null
                      ? "Belum ada"
                      : tanggal(row.tanggalReturn)}
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={
                      row.status === "Selesai" || row.status === "Cair"
                        ? "inline-flex rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700"
                        : row.status === "Berjalan"
                          ? "inline-flex rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800"
                          : "inline-flex rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800"
                    }
                  >
                    {row.status}
                  </span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Pembungkus data portofolio pendanaan milik akun yang sedang masuk.
 *
 * Hanya dirender untuk peran pendana; server sendiri sudah membatasi query ke
 * alokasi atas nama pembaca.
 */
export function PortofolioPendanaanSection() {
  const data = useQuery(api.alokasiDana.myPortfolio);
  const [produk, setProduk] = useState<"konvensional" | "syariah">(
    "konvensional",
  );

  if (data === undefined) {
    return (
      <div className="mt-4 space-y-2 rounded-2xl border border-slate-200 bg-white p-4">
        <span className="sr-only">Memuat portofolio pendanaan…</span>
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  return (
    <section aria-labelledby="judul-portofolio-pendanaan" className="mt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id="judul-portofolio-pendanaan"
          className="text-sm font-semibold text-navy"
        >
          Portofolio pendanaan
        </h2>
        <p className="text-[11px] text-muted-foreground">
          {data.length} alokasi · tenor {LABEL_TENOR_PENDANA} · yield{" "}
          {LABEL_YIELD_PENDANA}
        </p>
      </div>

      {/* Filter portofolio per produk. Data yang tersimpan saat ini hanya
          berisi penempatan konvensional; tab Syariah menampilkan keadaan
          kosong yang menjelaskan sebabnya, bukan tabel palsu. */}
      <div
        className="mt-3 flex flex-wrap gap-2"
        role="group"
        aria-label="Produk portofolio"
      >
        {(
          [
            { id: "konvensional", label: "Portofolio konvensional" },
            { id: "syariah", label: "Portofolio syariah" },
          ] as const
        ).map((pilihan) => (
          <button
            key={pilihan.id}
            type="button"
            aria-pressed={produk === pilihan.id}
            onClick={() => setProduk(pilihan.id)}
            className={`min-h-11 rounded-lg border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              produk === pilihan.id
                ? "border-emerald-700/50 bg-emerald-50 text-emerald-900"
                : "border-border bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {pilihan.label}
          </button>
        ))}
      </div>

      {produk === "syariah" ? (
        <PortofolioSyariah />
      ) : (
        <TabelPortofolioPendanaan
          rows={data.map((row) => ({
            id: String(row._id),
            nomorReferensi: row.loanRef || row.nomorReferensi,
            pokok: row.jumlahAlokasi,
            imbalHasil: row.imbalHasil,
            status: row.statusPendanaan,
            tanggalReturn: row.pelunasan?.jatuhTempoPada ?? null,
          }))}
        />
      )}
      <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
        Tanggal return adalah jatuh tempo pinjaman, bukan janji pembayaran.
        Pembayaran dapat lebih lambat bila peminjam menunggak.
      </p>
    </section>
  );
}
