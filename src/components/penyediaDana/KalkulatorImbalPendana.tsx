import { useQuery } from "convex/react";
import { Calculator, ChevronDown } from "lucide-react";
import { Fragment, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { PortofolioSyariah } from "@/components/penyediaDana/PortofolioSyariah";
import { api } from "@/convex/_generated/api";
import { potonganDariKembali } from "@/lib/bagiHasil";
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
  /** Keadaan pelunasan dari server; null bila tenor tidak terbaca. */
  statusPelunasan: "lancar" | "berjalan" | "menunggak" | null;
  /** Hari lewat jatuh tempo; 0 selama belum terlambat. */
  hariTerlambat: number;
  /** Sisa hari ke jatuh tempo; negatif berarti sudah lewat. */
  sisaHari: number | null;
};

/** Saringan yang ditawarkan di atas tabel portofolio. */
type SaringPortofolio = "semua" | "berjalan" | "selesai" | "menunggak";

const DAFTAR_SARING: readonly { kunci: SaringPortofolio; label: string }[] = [
  { kunci: "semua", label: "Semua" },
  { kunci: "berjalan", label: "Berjalan" },
  { kunci: "selesai", label: "Selesai" },
  { kunci: "menunggak", label: "Menunggak" },
];

/** Pinjaman yang sudah tidak berjalan tidak perlu badge jatuh tempo. */
function sudahSelesai(row: BarisPortofolioPendanaan): boolean {
  return row.status === "Selesai" || row.status === "Cair";
}

function cocokSaring(row: BarisPortofolioPendanaan, saring: SaringPortofolio): boolean {
  if (saring === "semua") return true;
  if (saring === "selesai") return sudahSelesai(row);
  if (saring === "menunggak") return !sudahSelesai(row) && row.hariTerlambat > 0;
  return !sudahSelesai(row);
}

/** Satu angka desimal dengan koma, tanpa bergantung data lokal mesin. */
function persenSatuDesimal(nilai: number): string {
  if (!Number.isFinite(nilai)) return "0,0";
  return (Math.round(nilai * 10) / 10).toFixed(1).replace(".", ",");
}

/** Yield efektif = keuntungan bersih dibagi pokok, bukan yield bruto di layar. */
function yieldEfektif(pokok: number, keuntungan: number): string {
  if (pokok <= 0) return "0,0%";
  return `${persenSatuDesimal((keuntungan / pokok) * 100)}%`;
}

/** Badge hanya untuk yang mendesak: terlambat, atau jatuh tempo dalam 7 hari. */
function badgeJatuhTempo(
  row: BarisPortofolioPendanaan,
): { teks: string; kelas: string } | null {
  if (sudahSelesai(row)) return null;
  if (row.hariTerlambat > 0) {
    return {
      teks: `Terlambat ${row.hariTerlambat} hari`,
      kelas: "border-red-200 bg-red-50 text-red-700",
    };
  }
  if (row.sisaHari === null) return null;
  const kelas = "border-amber-200 bg-amber-50 text-amber-800";
  if (row.sisaHari === 0) return { teks: "Jatuh tempo hari ini", kelas };
  if (row.sisaHari > 0 && row.sisaHari <= 7) {
    return { teks: `Jatuh tempo ${row.sisaHari} hari lagi`, kelas };
  }
  return null;
}

/**
 * Tabel portofolio pendanaan dengan kolom tetap: tenor 30 hari, yield 30%
 * p.p., dan status pendanaan. Nominal serta imbal hasil bruto datang dari
 * server; biaya platform dan penerimaan bersih dihitung dengan aturan yang
 * sama seperti pencairan (`lib/bagiHasil`), supaya angka tabel tidak berbeda
 * dari uang yang benar-benar masuk dompet pendana.
 */
export function TabelPortofolioPendanaan({
  rows,
  persenPotonganAdmin,
  saringAwal = "semua",
  batasAwal = 10,
  bukaAwal = [],
}: {
  rows: readonly BarisPortofolioPendanaan[];
  /** Tarif biaya platform dari Pengaturan Sistem, dalam persen. */
  persenPotonganAdmin: number;
  /** Saringan awal tabel; dipakai uji render. */
  saringAwal?: SaringPortofolio;
  /** Jumlah baris per halaman; dipakai uji render. */
  batasAwal?: number;
  /** Baris yang rinciannya sudah terbuka; dipakai uji render. */
  bukaAwal?: readonly string[];
}) {
  const [saring, setSaring] = useState<SaringPortofolio>(saringAwal);
  const [batas, setBatas] = useState(batasAwal);
  const [halaman, setHalaman] = useState(0);
  const [buka, setBuka] = useState<readonly string[]>(bukaAwal);

  /** Biaya platform dihitung dari total kembali (pokok + imbal), bukan imbal saja. */
  const hitung = (row: BarisPortofolioPendanaan) => {
    const total = row.pokok + row.imbalHasil;
    const potongan = potonganDariKembali(total, persenPotonganAdmin);
    const diterima = total - potongan;
    return { total, potongan, diterima, keuntungan: diterima - row.pokok };
  };

  const tersaring = rows.filter((row) => cocokSaring(row, saring));
  const totalHalaman = Math.max(1, Math.ceil(tersaring.length / batas));
  const halamanAktif = Math.min(halaman, totalHalaman - 1);
  const mulai = halamanAktif * batas;
  const tampil = tersaring.slice(mulai, mulai + batas);

  const jumlah = tersaring.reduce(
    (t, row) => {
      const h = hitung(row);
      return {
        pokok: t.pokok + row.pokok,
        imbal: t.imbal + row.imbalHasil,
        potongan: t.potongan + h.potongan,
        diterima: t.diterima + h.diterima,
        keuntungan: t.keuntungan + h.keuntungan,
      };
    },
    { pokok: 0, imbal: 0, potongan: 0, diterima: 0, keuntungan: 0 },
  );

  const cacah = {
    semua: rows.length,
    berjalan: rows.filter((row) => cocokSaring(row, "berjalan")).length,
    selesai: rows.filter((row) => cocokSaring(row, "selesai")).length,
    menunggak: rows.filter((row) => cocokSaring(row, "menunggak")).length,
  };

  const toggleBuka = (id: string) => {
    setBuka((lama) =>
      lama.includes(id) ? lama.filter((x) => x !== id) : [...lama, id],
    );
  };

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
        <div role="group" aria-label="Saring portofolio" className="flex flex-wrap gap-1.5">
          {DAFTAR_SARING.map((pilihan) => (
            <button
              key={pilihan.kunci}
              type="button"
              aria-pressed={saring === pilihan.kunci}
              onClick={() => {
                setSaring(pilihan.kunci);
                setHalaman(0);
              }}
              className={`min-h-8 rounded-md border px-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                saring === pilihan.kunci
                  ? "border-emerald-700/50 bg-emerald-50 text-emerald-900"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {pilihan.label}{" "}
              <span className="tabular-nums opacity-60">{cacah[pilihan.kunci]}</span>
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
          Baris per halaman
          <select
            value={batas}
            onChange={(event) => {
              setBatas(Number(event.target.value));
              setHalaman(0);
            }}
            className="h-8 rounded-md border border-slate-300 bg-white px-1.5 text-xs tabular-nums text-navy"
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
          </select>
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[64rem] border-collapse text-left text-xs">
        <caption className="sr-only">
          Portofolio pendanaan Anda dengan tenor {LABEL_TENOR_PENDANA}, yield{" "}
          {LABEL_YIELD_PENDANA}, dan biaya platform {persenPotonganAdmin}% dari
          total kembali.
        </caption>
        <thead className="bg-slate-50">
          <tr className="text-[11px] uppercase tracking-[0.08em] text-slate-600">
            <th scope="col" className="px-3 py-2 font-semibold">Pinjaman</th>
            <th scope="col" className="px-3 py-2 font-semibold">Nominal</th>
            <th scope="col" className="px-3 py-2 font-semibold">Tenor</th>
            <th scope="col" className="px-3 py-2 font-semibold">Yield pendana</th>
            <th scope="col" className="px-3 py-2 font-semibold">Imbal bruto</th>
            <th scope="col" className="whitespace-nowrap px-3 py-2 font-semibold">
              Biaya platform ({persenPotonganAdmin}%)
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">Diterima bersih</th>
            <th scope="col" className="px-3 py-2 font-semibold">Keuntungan bersih</th>
            <th scope="col" className="px-3 py-2 font-semibold">Proyeksi return</th>
            <th scope="col" className="px-3 py-2 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {tampil.length === 0 ? (
            <tr>
              <td colSpan={10} className="px-3 py-6 text-center text-muted-foreground">
                {rows.length === 0
                  ? "Belum ada pendanaan. Portofolio muncul setelah alokasi dana dicatat."
                  : "Tidak ada alokasi yang cocok dengan saringan ini."}
                {rows.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setSaring("semua");
                      setHalaman(0);
                    }}
                    className="ml-2 font-semibold text-emerald-800 underline decoration-emerald-700/40 underline-offset-2 hover:decoration-emerald-700"
                  >
                    Tampilkan semua
                  </button>
                )}
              </td>
            </tr>
          ) : (
            tampil.map((row) => {
              const h = hitung(row);
              const badge = badgeJatuhTempo(row);
              const terbuka = buka.includes(row.id);
              return (
                <Fragment key={row.id}>
                  <tr className={terbuka ? "bg-slate-50/60 align-top" : "align-top"}>
                    <th scope="row" className="px-3 py-2.5 text-left font-medium text-navy">
                      <div className="flex items-start gap-1.5">
                        <button
                          type="button"
                          aria-expanded={terbuka}
                          aria-controls={`rincian-portofolio-${row.id}`}
                          onClick={() => toggleBuka(row.id)}
                          className="mt-0.5 rounded p-0.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <ChevronDown
                            className={`size-3.5 shrink-0 transition-transform ${terbuka ? "rotate-180" : ""}`}
                            aria-hidden
                          />
                          <span className="sr-only">Rincian {row.nomorReferensi}</span>
                        </button>
                        <span>{row.nomorReferensi}</span>
                      </div>
                    </th>
                    <td className="px-3 py-2.5 tabular-nums text-slate-900">
                      {rupiah(row.pokok)}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-slate-700">
                      {LABEL_TENOR_PENDANA}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-slate-700">
                      <span className="block">{LABEL_YIELD_PENDANA}</span>
                      <span className="mt-0.5 block text-[10px] text-muted-foreground">
                        efektif {yieldEfektif(row.pokok, h.keuntungan)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums font-medium text-emerald-800">
                      {rupiah(row.imbalHasil)}
                    </td>
                    <td
                      className="px-3 py-2.5 whitespace-nowrap tabular-nums text-red-700"
                      title={`${persenPotonganAdmin}% dari total kembali ${rupiah(h.total)}`}
                    >
                      −{rupiah(h.potongan)}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap tabular-nums font-semibold text-navy">
                      {rupiah(h.diterima)}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap tabular-nums font-semibold text-emerald-800">
                      {rupiah(h.keuntungan)}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap tabular-nums text-slate-700">
                      {row.status === "Selesai"
                        ? "Selesai"
                        : row.tanggalReturn === null
                          ? "Belum ada"
                          : tanggal(row.tanggalReturn)}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-col items-start gap-1">
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
                        {badge !== null && (
                          <span
                            className={`inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${badge.kelas}`}
                          >
                            {badge.teks}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                  {terbuka && (
                    <tr id={`rincian-portofolio-${row.id}`} className="bg-slate-50/70">
                      <td colSpan={10} className="px-3 pb-3 pt-1">
                        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                          {[
                            { label: "Pokok", nilai: rupiah(row.pokok), kelas: "text-navy" },
                            {
                              label: "Imbal bruto",
                              nilai: rupiah(row.imbalHasil),
                              kelas: "text-emerald-800",
                            },
                            {
                              label: `Biaya platform ${persenPotonganAdmin}%`,
                              nilai: `−${rupiah(h.potongan)}`,
                              kelas: "text-red-700",
                            },
                            {
                              label: "Diterima bersih",
                              nilai: rupiah(h.diterima),
                              kelas: "text-navy",
                            },
                            {
                              label: "Keuntungan bersih",
                              nilai: rupiah(h.keuntungan),
                              kelas: "text-emerald-800",
                            },
                          ].map((item) => (
                            <div key={item.label}>
                              <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                                {item.label}
                              </dt>
                              <dd className={`mt-0.5 text-xs font-semibold tabular-nums ${item.kelas}`}>
                                {item.nilai}
                              </dd>
                            </div>
                          ))}
                        </dl>
                        <p className="mt-2 text-[11px] leading-5 text-slate-600">
                          Pokok {rupiah(row.pokok)} + imbal {rupiah(row.imbalHasil)} ={" "}
                          {rupiah(h.total)}. Biaya platform dipotong dari total itu, bukan dari
                          imbal saja.{" "}
                          {sudahSelesai(row)
                            ? "Sudah dibukukan."
                            : "Masih perkiraan sampai pinjaman lunas."}
                        </p>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })
          )}
        </tbody>
        {tersaring.length > 0 && (
          <tfoot className="border-t-2 border-slate-300 bg-slate-50">
            <tr className="align-top">
              <th scope="row" className="px-3 py-2.5 text-left font-semibold text-navy">
                Total
                <span className="mt-0.5 block text-[10px] font-normal tracking-normal text-slate-500">
                  {tersaring.length} alokasi
                </span>
              </th>
              <td className="px-3 py-2.5 tabular-nums text-slate-900">
                {rupiah(jumlah.pokok)}
              </td>
              <td />
              <td className="px-3 py-2.5 whitespace-nowrap text-slate-700">
                <span className="block">efektif</span>
                <span className="mt-0.5 block text-[10px] text-muted-foreground">
                  {yieldEfektif(jumlah.pokok, jumlah.keuntungan)}
                </span>
              </td>
              <td className="px-3 py-2.5 tabular-nums font-medium text-emerald-800">
                {rupiah(jumlah.imbal)}
              </td>
              <td className="px-3 py-2.5 whitespace-nowrap tabular-nums text-red-700">
                −{rupiah(jumlah.potongan)}
              </td>
              <td className="px-3 py-2.5 whitespace-nowrap tabular-nums font-semibold text-navy">
                {rupiah(jumlah.diterima)}
              </td>
              <td className="px-3 py-2.5 whitespace-nowrap tabular-nums font-semibold text-emerald-800">
                {rupiah(jumlah.keuntungan)}
              </td>
              <td />
              <td />
            </tr>
          </tfoot>
        )}
      </table>
      </div>

      {tersaring.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-3 py-2 text-xs text-slate-600">
          <p className="tabular-nums">
            {mulai + 1}–{Math.min(mulai + batas, tersaring.length)} dari{" "}
            {tersaring.length} alokasi
          </p>
          {totalHalaman > 1 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={halamanAktif === 0}
                onClick={() => setHalaman(Math.max(0, halamanAktif - 1))}
                className="min-h-8 rounded-md border border-slate-300 bg-white px-2.5 font-semibold text-navy transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Sebelumnya
              </button>
              <span className="tabular-nums">
                Halaman {halamanAktif + 1} / {totalHalaman}
              </span>
              <button
                type="button"
                disabled={halamanAktif >= totalHalaman - 1}
                onClick={() => setHalaman(halamanAktif + 1)}
                className="min-h-8 rounded-md border border-slate-300 bg-white px-2.5 font-semibold text-navy transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Berikutnya
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Pembungkus data portofolio pendanaan milik akun yang sedang masuk.
 *
 * Hanya dirender untuk peran pendana; server sendiri sudah membatasi query ke
 * alokasi atas nama pembaca.
 */
export function PortofolioPendanaanSection({
  persenPotonganAdmin,
}: {
  /** Tarif biaya platform dari Pengaturan Sistem, dalam persen. */
  persenPotonganAdmin: number;
}) {
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
          persenPotonganAdmin={persenPotonganAdmin}
          rows={data.map((row) => ({
            id: String(row._id),
            nomorReferensi: row.loanRef || row.nomorReferensi,
            pokok: row.jumlahAlokasi,
            imbalHasil: row.imbalHasil,
            status: row.statusPendanaan,
            tanggalReturn: row.pelunasan?.jatuhTempoPada ?? null,
            statusPelunasan: row.statusPelunasan,
            hariTerlambat: row.pelunasan?.hariTerlambat ?? 0,
            sisaHari: row.pelunasan?.sisaHari ?? null,
          }))}
        />
      )}
      <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
        Biaya platform {persenPotonganAdmin}% dihitung dari total kembali (pokok
        + Imbal Hasil), bukan dari imbal saja. Diterima bersih adalah pokok
        ditambah keuntungan bersih; yield efektif dihitung dari keuntungan
        bersih dibagi pokok. Tanggal return adalah jatuh tempo pinjaman, bukan
        janji pembayaran, dan pembayaran dapat lebih lambat bila peminjam
        menunggak.
      </p>
    </section>
  );
}
