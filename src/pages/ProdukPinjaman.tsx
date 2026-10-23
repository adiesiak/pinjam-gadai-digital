/**
 * Halaman produk publik: pembiayaan KONVENSIONAL dan SYARIAH.
 *
 * Satu berkas untuk dua rute karena keduanya berbagi kerangka (header, footer,
 * penafian, kalkulator) dan hanya berbeda isi serta aturan angkanya. Seluruh
 * angka dihitung mesin yang sama dengan formulir dan server: `lib/loan.ts`,
 * `lib/bulanan.ts`, dan `lib/syariah/*`. Tidak ada tarif yang ditulis ulang di
 * JSX, sehingga halaman ini tidak bisa menjanjikan angka yang berbeda dari
 * kontrak.
 *
 * Produk syariah sudah bisa diajukan dari dashboard untuk ketiga akad. Halaman
 * ini menjelaskan skema dan angkanya lebih dulu; angka final tetap ditetapkan
 * petugas saat keputusan, bukan dijanjikan oleh kalkulator.
 */
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Calculator,
  Check,
  HandCoins,
  Info,
  Package,
  Ticket,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { useQuery } from "convex/react";

import { Button } from "@/components/ui/button";
import { VaultLogo } from "@/components/VaultLogo";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import {
  HAK_CIPTA_PINDAI,
  NAMA_ENTITAS_PINDAI,
  PENAFIAN_PINDAI,
} from "@/lib/branding";
import {
  hitungSimulasiBulanan,
  persenBungaPerBulan,
  TARIF_BULANAN_DEFAULT,
  type TarifBulanan,
} from "@/lib/bulanan";
import {
  LOAN_LIMITS,
  TENOR_OPTIONS,
  persenBungaHarian,
  quoteLoanBunga,
  sesuaikanTenorHarian,
  tarifBiayaAman,
  type TarifBiaya,
  type Tenor,
} from "@/lib/loan";
import { formatRupiahAman, kelompokkanDigit } from "@/lib/money";
import { bagiHasilMurabahah, hargaJualMurabahah } from "@/lib/syariah/murabahah";
import { MARGIN_MURABAHAH_BAWAAN } from "@/lib/syariah/pengajuan";
import { bagiHasilQardh } from "@/lib/syariah/qardh";
import { bagiHasilRahn } from "@/lib/syariah/rahn";
import {
  kalimatVoucherSyariah,
  rincianVoucherSyariah,
} from "@/lib/syariah/voucher";

type JenisProduk = "konvensional" | "syariah";

const TENOR_BULANAN = [1, 3, 6] as const;
const TENOR_RAHN = [30, 60, 90] as const;

function rupiah(nilai: number): string {
  return formatRupiahAman(nilai);
}

function persen(nilai: number): string {
  return `${nilai.toLocaleString("id-ID")}%`;
}

/** Baca nominal dari kolom berkelompok; nol bila belum ada angka. */
function bacaNominal(teks: string): number {
  const digit = teks.replace(/\D/g, "");
  if (digit === "") return 0;
  const angka = Number(digit);
  return Number.isSafeInteger(angka) ? angka : 0;
}

function BarisAngka({
  label,
  nilai,
  tebal = false,
}: {
  label: string;
  nilai: string;
  tebal?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-200 py-2 text-sm last:border-b-0">
      {/* Label boleh turun baris; angka tidak, supaya nominal panjang tetap
          utuh di kolom sempit alih-alih terpotong atau bertumpuk. */}
      <dt className="min-w-0 text-slate-600">{label}</dt>
      <dd
        className={`shrink-0 whitespace-nowrap text-right tabular-nums ${tebal ? "font-semibold text-navy" : "text-slate-800"}`}
      >
        {nilai}
      </dd>
    </div>
  );
}

/** Tiga tier tarif harian, dari matriks mesin harga yang sama dengan server. */
function TabelTarifHarian() {
  const tier = [
    { label: "Rp100.000 sampai Rp499.999", pokok: 300_000 },
    { label: "Rp500.000 sampai Rp999.999", pokok: 700_000 },
    { label: "Rp1.000.000 sampai Rp10.000.000", pokok: 1_000_000 },
  ];
  return (
    <div className="mt-4 divide-y divide-slate-200 border-y border-slate-200">
      {tier.map((baris) => (
        <div
          key={baris.label}
          className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,7rem))] sm:items-center"
        >
          <p className="text-sm font-medium text-slate-800">{baris.label}</p>
          <div className="grid grid-cols-3 gap-2 sm:contents">
            {TENOR_OPTIONS.map((tenor) => (
              <p
                key={tenor}
                className="rounded-lg bg-slate-50 px-2 py-1.5 text-center text-xs tabular-nums text-slate-700 sm:bg-transparent sm:p-0 sm:text-right"
              >
                <span className="block text-[10px] uppercase tracking-[0.1em] text-slate-500 sm:hidden">
                  {tenor} hari
                </span>
                <span className="font-semibold">
                  {persen(persenBungaHarian(baris.pokok, tenor) ?? 0)}
                </span>
              </p>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TabelTarifBulanan({ tarif }: { tarif: TarifBulanan }) {
  return (
    <div className="mt-4 divide-y divide-slate-200 border-y border-slate-200">
      {TENOR_BULANAN.map((tenor) => (
        <div
          key={tenor}
          className="flex flex-wrap items-baseline justify-between gap-2 py-2.5 text-sm"
        >
          <p className="font-medium text-slate-800">{tenor} bulan</p>
          <p className="text-xs text-slate-600">
            Bunga flat{" "}
            <strong className="font-semibold tabular-nums text-navy">
              {persen(persenBungaPerBulan(tenor, tarif))}
            </strong>{" "}
            per bulan, biaya admin cicilan{" "}
            <strong className="font-semibold tabular-nums text-navy">
              {persen(tarif.persenBiayaAdminCicilanBulanan)}
            </strong>{" "}
            per bulan
          </p>
        </div>
      ))}
    </div>
  );
}

function KalkulatorKonvensional({
  tarifBiaya,
  tarifBulanan,
}: {
  tarifBiaya: TarifBiaya;
  tarifBulanan: TarifBulanan;
}) {
  const [skema, setSkema] = useState<"harian" | "bulanan">("harian");
  const [nominalTeks, setNominalTeks] = useState("1.000.000");
  const [tenorHari, setTenorHari] = useState<Tenor>(28);
  const [tenorBulan, setTenorBulan] = useState<(typeof TENOR_BULANAN)[number]>(3);
  const [ekspres, setEkspres] = useState(false);

  const nominal = bacaNominal(nominalTeks);
  const dalamBatas =
    nominal >= LOAN_LIMITS.minPokok && nominal <= LOAN_LIMITS.maxPokokPlafon;

  let isi: React.ReactNode = null;
  if (dalamBatas) {
    try {
      if (skema === "harian") {
        const tenor = sesuaikanTenorHarian(nominal, tenorHari);
        const bunga = persenBungaHarian(nominal, tenor) ?? 0;
        const q = quoteLoanBunga(nominal, bunga, { ekspres, tarif: tarifBiaya });
        isi = (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2.5">
                <p className="text-[11px] font-medium text-emerald-800">
                  Dana diterima
                </p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums text-emerald-900">
                  {rupiah(q.danaBersihDitransfer)}
                </p>
                <p className="mt-0.5 text-[11px] leading-4 text-emerald-900/80">
                  Pokok {rupiah(q.pokok)} dipotong biaya di muka{" "}
                  {rupiah(q.totalPotonganDiMuka)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                <p className="text-[11px] font-medium text-slate-600">
                  Total kembali
                </p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums text-navy">
                  {rupiah(q.totalKewajibanPelunasan)}
                </p>
                <p className="mt-0.5 text-[11px] leading-4 text-slate-600">
                  {rupiah(q.pokok)} pokok + {rupiah(q.bunga)} bunga ({persen(bunga)}{" "}
                  untuk {tenor} hari)
                </p>
              </div>
            </div>
            <dl className="mt-3">
              <BarisAngka label="Biaya admin" nilai={rupiah(q.biayaAdmin)} />
              <BarisAngka
                label="Biaya asuransi"
                nilai={rupiah(q.biayaAsuransi)}
              />
              <BarisAngka
                label="Biaya cair ekspres"
                nilai={rupiah(q.biayaExpress)}
              />
              <BarisAngka
                label="Bunga"
                nilai={rupiah(q.bunga)}
                tebal
              />
            </dl>
          </>
        );
      } else {
        const q = hitungSimulasiBulanan(nominal, tenorBulan, {
          tarif: tarifBulanan,
        });
        isi = (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2.5">
                <p className="text-[11px] font-medium text-emerald-800">
                  Dana diterima
                </p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums text-emerald-900">
                  {rupiah(q.danaDiterima)}
                </p>
                <p className="mt-0.5 text-[11px] leading-4 text-emerald-900/80">
                  Pokok {rupiah(nominal)} dipotong biaya layanan{" "}
                  {rupiah(q.potonganDiMuka)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                <p className="text-[11px] font-medium text-slate-600">
                  Cicilan per bulan
                </p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums text-navy">
                  {rupiah(q.cicilanPerBulan)}
                </p>
                <p className="mt-0.5 text-[11px] leading-4 text-slate-600">
                  {tenorBulan} kali bayar, termasuk biaya admin cicilan{" "}
                  {persen(tarifBulanan.persenBiayaAdminCicilanBulanan)}
                </p>
              </div>
            </div>
            <dl className="mt-3">
              <BarisAngka
                label={`Bunga ${tenorBulan} bulan`}
                nilai={rupiah(q.bungaTotal)}
              />
              <BarisAngka
                label="Biaya admin cicilan"
                nilai={rupiah(q.biayaAdminCicilanTotal)}
              />
              <BarisAngka
                label="Total dibayar"
                nilai={rupiah(
                  q.totalPengembalian + q.biayaAdminCicilanTotal,
                )}
                tebal
              />
            </dl>
          </>
        );
      }
    } catch (error) {
      isi = (
        <p role="alert" className="text-xs leading-5 text-destructive">
          {error instanceof Error
            ? error.message
            : "Nominal ini belum bisa dihitung."}
        </p>
      );
    }
  }

  return (
    <section
      aria-labelledby="judul-kalkulator"
      className="rounded-kartu border border-border bg-white p-4 shadow-kartu sm:p-6"
    >
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
        <Calculator className="size-3.5" aria-hidden /> Kalkulator
      </p>
      <h2
        id="judul-kalkulator"
        className="mt-2 text-xl font-semibold tracking-tight text-navy"
      >
        Hitung sebelum mengajukan
      </h2>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
        Angka di bawah memakai mesin yang sama dengan formulir pengajuan. Hasil
        akhir tetap ditentukan setelah petugas memeriksa pengajuan.
      </p>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Skema">
        {(
          [
            { id: "harian", label: "Harian (7/14/28)" },
            { id: "bulanan", label: "Cicilan bulanan" },
          ] as const
        ).map((pilihan) => (
          <button
            key={pilihan.id}
            type="button"
            aria-pressed={skema === pilihan.id}
            onClick={() => setSkema(pilihan.id)}
            className={`min-h-11 rounded-lg border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              skema === pilihan.id
                ? "border-emerald-700/50 bg-emerald-50 text-emerald-900"
                : "border-border bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {pilihan.label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-start">
        <div>
          <label
            htmlFor="produk-nominal"
            className="text-xs font-medium text-slate-700"
          >
            Jumlah pinjaman
          </label>
          <div className="mt-1 flex min-h-11 items-center rounded-xl border border-slate-300 bg-white focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-600/20">
            <span className="pl-3 text-sm text-slate-500" aria-hidden>
              Rp
            </span>
            <input
              id="produk-nominal"
              inputMode="numeric"
              autoComplete="off"
              value={nominalTeks}
              onChange={(event) =>
                setNominalTeks(kelompokkanDigit(event.target.value))
              }
              className="min-w-0 flex-1 bg-transparent px-2 py-2.5 text-base font-semibold tabular-nums text-navy outline-none"
            />
          </div>
          <p className="mt-1.5 text-[11px] leading-4 text-slate-500">
            {rupiah(LOAN_LIMITS.minPokok)} sampai{" "}
            {rupiah(LOAN_LIMITS.maxPokokPlafon)}. Batas per akun mengikuti
            plafon yang tersedia.
          </p>

          {skema === "harian" ? (
            <>
              <p className="mt-4 text-xs font-medium text-slate-700">Tenor</p>
              <div className="mt-1.5 flex flex-wrap gap-2" role="group" aria-label="Tenor hari">
                {TENOR_OPTIONS.map((tenor) => (
                  <button
                    key={tenor}
                    type="button"
                    aria-pressed={tenorHari === tenor}
                    onClick={() => setTenorHari(tenor)}
                    className={`min-h-11 rounded-lg border px-3 text-xs font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      tenorHari === tenor
                        ? "border-emerald-700/50 bg-emerald-50 text-emerald-900"
                        : "border-border bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {tenor} hari
                  </button>
                ))}
              </div>
              <label className="mt-4 flex items-start gap-2 text-xs leading-5 text-slate-700">
                <input
                  type="checkbox"
                  checked={ekspres}
                  onChange={(event) => setEkspres(event.target.checked)}
                  className="mt-0.5 size-4 rounded border-slate-300"
                />
                <span>
                  Cair ekspres. Biaya ekspres dipotong di muka dan nominalnya
                  mengikuti tier pinjaman.
                </span>
              </label>
            </>
          ) : (
            <>
              <p className="mt-4 text-xs font-medium text-slate-700">
                Tenor cicilan
              </p>
              <div className="mt-1.5 flex flex-wrap gap-2" role="group" aria-label="Tenor bulan">
                {TENOR_BULANAN.map((tenor) => (
                  <button
                    key={tenor}
                    type="button"
                    aria-pressed={tenorBulan === tenor}
                    onClick={() => setTenorBulan(tenor)}
                    className={`min-h-11 rounded-lg border px-3 text-xs font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      tenorBulan === tenor
                        ? "border-emerald-700/50 bg-emerald-50 text-emerald-900"
                        : "border-border bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {tenor} bulan
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50/60 p-3 sm:p-4">
          {dalamBatas ? (
            isi
          ) : (
            <p className="text-xs leading-5 text-slate-600">
              Masukkan nominal antara {rupiah(LOAN_LIMITS.minPokok)} dan{" "}
              {rupiah(LOAN_LIMITS.maxPokokPlafon)} untuk melihat rincian.
            </p>
          )}
          <p className="mt-3 text-[11px] leading-5 text-slate-500">
            Perhitungan memakai tarif yang berlaku saat halaman dibuka. Pinjaman
            yang sudah terbit memakai tarif yang dibekukan saat pengajuan.
          </p>
        </div>
      </div>
    </section>
  );
}

/**
 * Preset voucher untuk simulasi akad. Nilainya contoh, bukan ketentuan promo:
 * voucher sungguhan diterbitkan admin atau lahir dari pelunasan tepat waktu,
 * dan hanya berlaku untuk akun pemiliknya.
 */
const VOUCHER_SIMULASI = [
  { id: "tanpa", label: "Tanpa voucher", jenis: null, nilai: 0 },
  { id: "ujrah", label: "Ujrah −Rp10.000", jenis: "diskon_ujrah" as const, nilai: 10_000 },
  { id: "margin", label: "Margin −Rp25.000", jenis: "diskon_margin" as const, nilai: 25_000 },
] as const;

function KalkulatorSyariah() {
  const [akad, setAkad] = useState<"murabahah" | "rahn" | "qardh">("murabahah");
  const [nilaiTeks, setNilaiTeks] = useState("1.000.000");
  const [marginTeks, setMarginTeks] = useState(
    String(MARGIN_MURABAHAH_BAWAAN),
  );
  const [taksiranTeks, setTaksiranTeks] = useState("2.000.000");
  const [pokokGadaiTeks, setPokokGadaiTeks] = useState("1.600.000");
  const [tenorRahn, setTenorRahn] = useState<(typeof TENOR_RAHN)[number]>(30);
  const [voucherSimId, setVoucherSimId] =
    useState<(typeof VOUCHER_SIMULASI)[number]["id"]>("tanpa");

  const nilai = bacaNominal(nilaiTeks);
  const taksiran = bacaNominal(taksiranTeks);
  const pokokGadai = bacaNominal(pokokGadaiTeks);
  const margin = Number(marginTeks.replace(/[^0-9.]/g, "").replace(",", "."));

  let isi: React.ReactNode = null;
  let judul = "";
  try {
    if (akad === "murabahah") {
      judul = "Murabahah";
      if (nilai < LOAN_LIMITS.minPokok) {
        isi = (
          <p className="text-xs leading-5 text-slate-600">
            Masukkan harga pokok minimal {rupiah(LOAN_LIMITS.minPokok)}.
          </p>
        );
      } else {
        const hargaJual = hargaJualMurabahah(
          nilai,
          Number.isFinite(margin) && margin >= 0 ? margin : 0,
        );
        const hasil = bagiHasilMurabahah({ hargaPokok: nilai, hargaJual });
        isi = (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2.5">
                <p className="text-[11px] font-medium text-amber-900">
                  Harga jual akhir
                </p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums text-amber-950">
                  {rupiah(hasil.hargaJual)}
                </p>
                <p className="mt-0.5 text-[11px] leading-4 text-amber-900/80">
                  Harga pokok {rupiah(hasil.hargaPokok)} + margin{" "}
                  {rupiah(hasil.marginTotal)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                <p className="text-[11px] font-medium text-slate-600">
                  Nisbah pendana ({hasil.persenPendana}%)
                </p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums text-navy">
                  {rupiah(hasil.pendanaTerima)}
                </p>
                <p className="mt-0.5 text-[11px] leading-4 text-slate-600">
                  Pokok kembali + {rupiah(hasil.nisbahPendana)} dari margin
                </p>
              </div>
            </div>
            <dl className="mt-3">
              <BarisAngka
                label="Margin keuntungan total"
                nilai={rupiah(hasil.marginTotal)}
              />
              <BarisAngka
                label={`Nisbah pendana (${hasil.persenPendana}%)`}
                nilai={rupiah(hasil.nisbahPendana)}
              />
              <BarisAngka
                label={`Ujrah pengelola (${hasil.persenPlatform}%)`}
                nilai={rupiah(hasil.platformTerima)}
                tebal
              />
            </dl>
          </>
        );
      }
    } else if (akad === "rahn") {
      judul = "Rahn";
      if (taksiran < LOAN_LIMITS.minPokok) {
        isi = (
          <p className="text-xs leading-5 text-slate-600">
            Masukkan nilai taksiran minimal {rupiah(LOAN_LIMITS.minPokok)}.
          </p>
        );
      } else if (pokokGadai > taksiran) {
        isi = (
          <p role="alert" className="text-xs leading-5 text-destructive">
            Pokok gadai tidak boleh melebihi nilai taksiran.
          </p>
        );
      } else {
        const hasil = bagiHasilRahn({
          nilaiTaksiran: taksiran,
          pokokGadai: Math.max(pokokGadai, 1),
          tenorHari: tenorRahn,
        });
        isi = (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2.5">
                <p className="text-[11px] font-medium text-amber-900">
                  Ujrah pemeliharaan
                </p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums text-amber-950">
                  {rupiah(hasil.ujrahTotal)}
                </p>
                <p className="mt-0.5 text-[11px] leading-4 text-amber-900/80">
                  {persen(hasil.persenUjrahPer30Hari)} dari taksiran per 30 hari,{" "}
                  {hasil.jumlahSiklus} siklus
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                <p className="text-[11px] font-medium text-slate-600">
                  Nisbah pendana ({hasil.persenPendana}%)
                </p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums text-navy">
                  {rupiah(hasil.pendanaTerima)}
                </p>
                <p className="mt-0.5 text-[11px] leading-4 text-slate-600">
                  Pokok {rupiah(hasil.pokokGadai)} + ujrah{" "}
                  {rupiah(hasil.nisbahPendana)}
                </p>
              </div>
            </div>
            <dl className="mt-3">
              <BarisAngka
                label="Pokok gadai"
                nilai={rupiah(hasil.pokokGadai)}
              />
              <BarisAngka
                label={`Nisbah pendana (${hasil.persenPendana}%)`}
                nilai={rupiah(hasil.nisbahPendana)}
              />
              <BarisAngka
                label={`Ujrah pengelola (${hasil.persenPlatform}%)`}
                nilai={rupiah(hasil.platformTerima)}
              />
              <BarisAngka
                label="Total kewajiban peminjam"
                nilai={rupiah(hasil.totalKewajiban)}
                tebal
              />
            </dl>
          </>
        );
      }
    } else {
      judul = "Qardh";
      if (nilai < LOAN_LIMITS.minPokok) {
        isi = (
          <p className="text-xs leading-5 text-slate-600">
            Masukkan pokok minimal {rupiah(LOAN_LIMITS.minPokok)}.
          </p>
        );
      } else {
        const hasil = bagiHasilQardh(nilai);
        isi = (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2.5">
                <p className="text-[11px] font-medium text-amber-900">
                  Margin keuntungan
                </p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums text-amber-950">
                  Rp 0
                </p>                  <p className="mt-0.5 text-[11px] leading-4 text-amber-900/80">
                  Akad kebajikan tanpa margin tambahan.
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                <p className="text-[11px] font-medium text-slate-600">
                  Tiket doorprize
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 text-lg font-semibold tabular-nums text-navy">
                  <Ticket className="size-4" aria-hidden />
                  {hasil.tiketDoorprize}
                </p>
                <p className="mt-0.5 text-[11px] leading-4 text-slate-600">
                  Satu tiket per {rupiah(hasil.kelipatanTiket)} dana aktif.
                </p>
              </div>
            </div>
            <dl className="mt-3">
              <BarisAngka
                label="Pokok dikembalikan"
                nilai={rupiah(hasil.pendanaTerima)}
                tebal
              />
              <BarisAngka
                label="Bagian platform"
                nilai={rupiah(hasil.platformTerima)}
              />
            </dl>
          </>
        );
      }
    }
  } catch (error) {
    isi = (
      <p role="alert" className="text-xs leading-5 text-destructive">
        {error instanceof Error ? error.message : "Angka belum bisa dihitung."}
      </p>
    );
  }

  // ===== Simulasi voucher =====
  // Dasar potongan mengikuti akad yang sedang dihitung: margin Murabahah atau
  // ujrah Rahn. Qardh tidak punya keduanya, jadi tidak ada yang dipotong.
  const pilihanVoucher =
    VOUCHER_SIMULASI.find((pilihan) => pilihan.id === voucherSimId) ??
    VOUCHER_SIMULASI[0];
  const marginSimulasi =
    akad === "murabahah"
      ? Math.max(
          0,
          hargaJualMurabahah(
            nilai,
            Number.isFinite(margin) && margin >= 0 ? margin : 0,
          ) - nilai,
        )
      : 0;
  const ujrahSimulasi =
    akad === "rahn" && taksiran >= LOAN_LIMITS.minPokok && pokokGadai <= taksiran
      ? bagiHasilRahn({
          nilaiTaksiran: taksiran,
          pokokGadai: Math.max(pokokGadai, 1),
          tenorHari: tenorRahn,
        }).ujrahTotal
      : 0;
  const rincianVoucher = rincianVoucherSyariah({
    pokok: akad === "rahn" ? Math.max(pokokGadai, 0) : Math.max(nilai, 0),
    marginTotal: marginSimulasi,
    ujrahTotal: ujrahSimulasi,
    voucher:
      pilihanVoucher.jenis === null
        ? null
        : { jenis: pilihanVoucher.jenis, nilai: pilihanVoucher.nilai },
  });

  return (
    <section
      id="kalkulator-syariah"
      aria-labelledby="judul-kalkulator-syariah"
      className="scroll-mt-24 rounded-kartu border border-gold/40 bg-white p-4 shadow-kartu sm:p-6"
    >
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-amber-800">
        <Calculator className="size-3.5" aria-hidden /> Kalkulator akad
      </p>
      <h2
        id="judul-kalkulator-syariah"
        className="mt-2 text-xl font-semibold tracking-tight text-navy"
      >
        Rincian {judul}
      </h2>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
        Nisbah 85:15 berlaku untuk margin Murabahah dan ujrah Rahn. Qardh tidak
        mengambil margin.
      </p>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Akad">
        {(
          [
            { id: "murabahah", label: "Murabahah" },
            { id: "rahn", label: "Rahn" },
            { id: "qardh", label: "Qardh" },
          ] as const
        ).map((pilihan) => (
          <button
            key={pilihan.id}
            type="button"
            aria-pressed={akad === pilihan.id}
            onClick={() => setAkad(pilihan.id)}
            className={`min-h-11 rounded-lg border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              akad === pilihan.id
                ? "border-amber-700/50 bg-amber-50 text-amber-950"
                : "border-border bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {pilihan.label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-start">
        <div className="space-y-3">
          {akad === "rahn" ? (
            <div>
              <label
                htmlFor="syariah-taksiran"
                className="text-xs font-medium text-slate-700"
              >
                Nilai taksiran barang
              </label>
              <div className="mt-1 flex min-h-11 items-center rounded-xl border border-slate-300 bg-white focus-within:border-amber-600 focus-within:ring-2 focus-within:ring-amber-600/20">
                <span className="pl-3 text-sm text-slate-500" aria-hidden>
                  Rp
                </span>
                <input
                  id="syariah-taksiran"
                  inputMode="numeric"
                  autoComplete="off"
                  value={taksiranTeks}
                  onChange={(event) =>
                    setTaksiranTeks(kelompokkanDigit(event.target.value))
                  }
                  className="min-w-0 flex-1 bg-transparent px-2 py-2.5 text-base font-semibold tabular-nums text-navy outline-none"
                />
              </div>

              <label
                htmlFor="syariah-pokok-gadai"
                className="mt-3 block text-xs font-medium text-slate-700"
              >
                Pokok gadai
              </label>
              <div className="mt-1 flex min-h-11 items-center rounded-xl border border-slate-300 bg-white focus-within:border-amber-600 focus-within:ring-2 focus-within:ring-amber-600/20">
                <span className="pl-3 text-sm text-slate-500" aria-hidden>
                  Rp
                </span>
                <input
                  id="syariah-pokok-gadai"
                  inputMode="numeric"
                  autoComplete="off"
                  value={pokokGadaiTeks}
                  onChange={(event) =>
                    setPokokGadaiTeks(kelompokkanDigit(event.target.value))
                  }
                  className="min-w-0 flex-1 bg-transparent px-2 py-2.5 text-base font-semibold tabular-nums text-navy outline-none"
                />
              </div>
              <p className="mt-4 text-xs font-medium text-slate-700">Tenor</p>
              <div className="mt-1.5 flex flex-wrap gap-2" role="group" aria-label="Tenor Rahn">
                {TENOR_RAHN.map((tenor) => (
                  <button
                    key={tenor}
                    type="button"
                    aria-pressed={tenorRahn === tenor}
                    onClick={() => setTenorRahn(tenor)}
                    className={`min-h-11 rounded-lg border px-3 text-xs font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      tenorRahn === tenor
                        ? "border-amber-700/50 bg-amber-50 text-amber-950"
                        : "border-border bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {tenor} hari
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div>
                <label
                  htmlFor="syariah-nilai"
                  className="text-xs font-medium text-slate-700"
                >
                  {akad === "murabahah"
                    ? "Harga pokok barang"
                    : "Pokok pinjaman kebajikan"}
                </label>
                <div className="mt-1 flex min-h-11 items-center rounded-xl border border-slate-300 bg-white focus-within:border-amber-600 focus-within:ring-2 focus-within:ring-amber-600/20">
                  <span className="pl-3 text-sm text-slate-500" aria-hidden>
                    Rp
                  </span>
                  <input
                    id="syariah-nilai"
                    inputMode="numeric"
                    autoComplete="off"
                    value={nilaiTeks}
                    onChange={(event) =>
                      setNilaiTeks(kelompokkanDigit(event.target.value))
                    }
                    className="min-w-0 flex-1 bg-transparent px-2 py-2.5 text-base font-semibold tabular-nums text-navy outline-none"
                  />
                </div>
              </div>

              {akad === "murabahah" && (
                <div>
                  <label
                    htmlFor="syariah-margin"
                    className="text-xs font-medium text-slate-700"
                  >
                    Margin keuntungan total (%)
                  </label>
                  <input
                    id="syariah-margin"
                    inputMode="numeric"
                    autoComplete="off"
                    value={marginTeks}
                    onChange={(event) =>
                      setMarginTeks(event.target.value.replace(/[^0-9.,]/g, ""))
                    }
                    className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base font-semibold tabular-nums text-navy focus:border-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-600/20"
                  />
                  <p className="mt-1.5 text-[11px] leading-4 text-slate-500">
                    Margin disepakati di akad dan tidak berubah selama tenor.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        <div
          className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50/60 p-3 sm:p-4"
          aria-live="polite"
        >
          {isi}

          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/40 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-900">
              Simulasi voucher
            </p>
            <div
              className="mt-1.5 flex flex-wrap gap-2"
              role="group"
              aria-label="Voucher simulasi"
            >
              {VOUCHER_SIMULASI.map((pilihan) => (
                <button
                  key={pilihan.id}
                  type="button"
                  aria-pressed={voucherSimId === pilihan.id}
                  onClick={() => setVoucherSimId(pilihan.id)}
                  className={`min-h-11 rounded-lg border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    voucherSimId === pilihan.id
                      ? "border-amber-700/50 bg-white text-amber-950"
                      : "border-amber-200 bg-white/70 text-slate-700 hover:bg-white"
                  }`}
                >
                  {pilihan.label}
                </button>
              ))}
            </div>
            <dl className="mt-2">
              <BarisAngka
                label="Diskon voucher"
                nilai={`−${rupiah(rincianVoucher.diskon)}`}
              />
              <BarisAngka
                label="Total kewajiban setelah voucher"
                nilai={rupiah(rincianVoucher.totalKewajiban)}
                tebal
              />
            </dl>
            <p className="mt-1.5 text-[11px] leading-5 text-amber-950/80">
              {akad === "qardh"
                ? "Qardh tidak mengambil margin atau ujrah, jadi voucher tidak memotong apa pun."
                : kalimatVoucherSyariah(rincianVoucher)}
            </p>
          </div>

          <p className="mt-3 text-[11px] leading-5 text-slate-500">
            Angka ini ilustrasi skema. Margin Murabahah dan taksiran Rahn
            ditetapkan petugas sebelum akad; pengajuan dikirim dari dashboard.
          </p>
        </div>
      </div>
    </section>
  );
}

function KerangkaHalaman({
  produk,
  tarifBiaya,
  tarifBulanan,
  akunHref,
  akunLabel,
  memuatAkun,
}: {
  produk: JenisProduk;
  tarifBiaya: TarifBiaya;
  tarifBulanan: TarifBulanan;
  /** Tujuan tombol akun di kepala halaman. */
  akunHref: string;
  akunLabel: string;
  memuatAkun: boolean;
}) {
  const syariah = produk === "syariah";

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-background text-foreground">
      <a className="skip-link" href="#konten">
        Lewati ke konten utama
      </a>

      <header className="sticky top-0 z-40 border-b border-border bg-background">
        <div className="mx-auto flex min-h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link
            to="/"
            className="flex shrink-0 items-center gap-2.5"
            aria-label="PINDAI, beranda"
          >
            <VaultLogo size={34} />
            <span className="text-sm font-semibold tracking-[0.16em]">
              PINDAI
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              to="/"
              className="hidden min-h-11 items-center gap-1.5 px-2 text-sm font-medium text-slate-600 hover:text-primary sm:inline-flex"
            >
              <ArrowLeft className="size-4" aria-hidden /> Beranda
            </Link>
            <Button
              asChild
              className="min-h-11 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Link to={akunHref}>{memuatAkun ? "Memuat…" : akunLabel}</Link>
            </Button>
          </div>
        </div>
      </header>

      <main id="konten" tabIndex={-1}>
        <section
          className={`border-b border-border ${syariah ? "bg-[#fbf7ec]" : "bg-muted"}`}
        >
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
            <p
              className={`text-xs font-semibold uppercase tracking-[0.16em] ${syariah ? "text-amber-800" : "text-primary"}`}
            >
              {syariah ? "Pembiayaan syariah" : "Pembiayaan konvensional"}
            </p>
            <h1 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight tracking-tight text-navy sm:text-4xl">
              {syariah
                ? "Akad yang jelas, dengan margin dan ujrah yang disepakati."
                : "Biaya pinjaman yang terbaca sebelum Anda menandatangani."}
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-700 sm:text-base">
              {syariah
                ? "Pinjaman syariah PINDAI memakai tiga akad: Murabahah untuk kredit barang, Rahn untuk gadai, dan Qardh untuk pinjaman kebajikan. Margin dan ujrah dibagi 85% untuk pendana, 15% untuk pengelola."
                : "Pinjaman tunai harian 7, 14, atau 28 hari dan cicilan bulanan 1, 3, atau 6 bulan. Bunga flat, biaya admin 2% dipotong di muka, dan biaya platform 5% dihitung dari uang yang kembali ke sistem."}
            </p>

            {syariah ? (
              <>
                <div className="mt-5 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-950">
                  <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <p>
                    Murabahah, Rahn, dan Qardh dapat diajukan dari dashboard.
                    Angka di halaman ini adalah ilustrasi; margin, taksiran, dan
                    angka final disepakati sebelum akad dicatat.
                  </p>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button
                    asChild
                    className="min-h-11 bg-amber-800 text-white hover:bg-amber-900"
                  >
                    <Link to="/dashboard?tab=form&jalur=syariah">
                      Ajukan akad syariah <ArrowRight className="size-4" aria-hidden />
                    </Link>
                  </Button>
                  <a
                    href="#kalkulator-syariah"
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-amber-700/40 px-3 text-sm font-semibold text-amber-900 transition-colors hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Coba kalkulator akad
                    <ArrowRight className="size-4 rotate-90" aria-hidden />
                  </a>
                </div>
              </>
            ) : (
              <div className="mt-6 flex flex-wrap gap-3">
                <Button
                  asChild
                  className="min-h-11 bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Link to="/dashboard">
                    Ajukan pinjaman <ArrowRight className="size-4" aria-hidden />
                  </Link>
                </Button>
                <Button asChild variant="outline" className="min-h-11">
                  <Link to="/biaya">Lihat semua biaya</Link>
                </Button>
              </div>
            )}

            <dl className="mt-8 grid gap-4 sm:grid-cols-3">
              {(syariah
                ? [
                    {
                      label: "Murabahah",
                      nilai: "Margin 85 : 15",
                      detail: "Harga pokok kembali, margin dibagi nisbah.",
                    },
                    {
                      label: "Rahn",
                      nilai: "Ujrah 2% / 30 hari",
                      detail: "Dihitung dari nilai taksiran barang.",
                    },
                    {
                      label: "Qardh",
                      nilai: "Margin 0%",
                      detail: "Pokok kembali utuh, plus tiket doorprize.",
                    },
                  ]
                : [
                    {
                      label: "Tenor harian",
                      nilai: "7 / 14 / 28 hari",
                      detail: "Bunga flat 26% sampai 40% sesuai nominal.",
                    },
                    {
                      label: "Cicilan bulanan",
                      nilai: "1 / 3 / 6 bulan",
                      detail: "Bunga flat per bulan, admin cicilan 2%.",
                    },
                    {
                      label: "Biaya di muka",
                      nilai: "Admin 2%",
                      detail: "Ditambah biaya ekspres bila Anda memilihnya.",
                    },
                  ]
              ).map((item) => (
                <div
                  key={item.label}
                  className="rounded-kartu border border-border bg-white p-4"
                >
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    {item.label}
                  </dt>
                  <dd className="mt-1.5 font-display text-xl leading-tight text-navy">
                    {item.nilai}
                  </dd>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    {item.detail}
                  </p>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          {/*
           * Syariah memakai kalkulator selebar konten, bukan kolom samping
           * 26rem: tiga akad, dua kolom input, dan kartu hasil tidak muat di
           * kolom sempit — angka rupiah saling menimpa saat dituang ke sana.
           * Konvensional tetap memakai kolom samping yang lengket.
           */}
          <div
            className={
              syariah
                ? ""
                : "grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start"
            }
          >
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-navy">
                {syariah ? "Tiga akad, satu aturan pembagian" : "Dua skema, satu mesin hitung"}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                {syariah
                  ? "Yang ada margin yang disepakati, ujrah pemeliharaan, dan nisbah bagi hasil. Tidak ada tambahan di luar akad."
                  : "Skema harian dipakai untuk pinjaman di bawah plafon 1 juta selama 28 hari. Di atas itu, pengajuan memakai skema cicilan bulanan dengan persetujuan petugas."}
              </p>

              {syariah ? (
                <div className="mt-5 grid gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-3">
                  {[
                    {
                      ikon: Package,
                      judul: "Murabahah: kredit barang",
                      isi: "PINDAI membeli barang yang Anda pilih, lalu menjualnya dengan harga jual yang disepakati. Margin total adalah harga jual dikurangi harga pokok; 85% margin menjadi hak pendana, 15% menjadi ujrah pengelola.",
                    },
                    {
                      ikon: HandCoins,
                      judul: "Rahn: gadai syariah",
                      isi: "Barang jaminan ditaksir, lalu dana diserahkan dengan ujrah pemeliharaan. Ujrah 2% dari nilai taksiran per 30 hari. Pokok gadai kembali 100% ke pendana saat pelunasan.",
                    },
                    {
                      ikon: Wallet,
                      judul: "Qardh: pinjaman kebajikan",
                      isi: "Dana dipinjamkan tanpa margin. Pendana menerima pokok kembali utuh, dan setiap kelipatan Rp1.000.000 dana aktif menambah satu tiket doorprize triwulanan.",
                    },
                  ].map((item) => (
                    <article
                      key={item.judul}
                      className="rounded-kartu border border-border bg-white p-4"
                    >
                      <h3 className="flex items-center gap-2 text-sm font-semibold text-navy">
                        <span className="flex size-8 items-center justify-center rounded-lg bg-amber-50 text-amber-900">
                          <item.ikon className="size-4" aria-hidden />
                        </span>
                        {item.judul}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {item.isi}
                      </p>
                    </article>
                  ))}
                </div>
              ) : (
                <>
                  <h3 className="mt-6 text-sm font-semibold text-slate-900">
                    Tarif harian per tier
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    Persentase bunga flat dari pokok, bukan per bulan. Tenor
                    menentukan persentase yang berlaku.
                  </p>
                  <TabelTarifHarian />

                  <h3 className="mt-8 text-sm font-semibold text-slate-900">
                    Tarif cicilan bulanan
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    Bunga flat dari pokok penuh setiap bulan, ditambah biaya
                    admin cicilan yang dibayar bersama cicilan.
                  </p>
                  <TabelTarifBulanan tarif={tarifBulanan} />

                  <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-xs leading-6 text-emerald-950">
                    <p className="flex items-start gap-2">
                      <BadgeCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
                      <span>
                        Contoh: pokok {rupiah(1_000_000)} tenor 28 hari, bunga
                        30%, menghasilkan uang kembali {rupiah(1_300_000)}.
                        Potongan platform 5% dari uang kembali menjadi{" "}
                        {rupiah(65_000)}, sehingga pendana menerima{" "}
                        {rupiah(1_235_000)}.
                      </span>
                    </p>
                  </div>
                </>
              )}
            </div>

            {!syariah && (
              <div className="lg:sticky lg:top-20">
                <KalkulatorKonvensional
                  tarifBiaya={tarifBiaya}
                  tarifBulanan={tarifBulanan}
                />
              </div>
            )}
          </div>

          {syariah && (
            <div className="mt-8">
              <KalkulatorSyariah />
            </div>
          )}
        </section>

        <section className="border-t border-border bg-muted">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex items-start gap-3">
              <Check className="mt-0.5 size-5 shrink-0 text-emerald-700" aria-hidden />
              <p className="max-w-2xl text-sm leading-6 text-slate-700">
                {syariah
                  ? "Skema syariah di halaman ini belum menjadi akad. Nisbah, ujrah, dan tata cara ta'zir dicantumkan di akad dan disetujui kedua pihak sebelum pencairan."
                  : "Semua angka adalah ilustrasi dari aturan yang berlaku. Persetujuan pinjaman dan pencairan dana tidak dilakukan otomatis oleh aplikasi."}
              </p>
            </div>
            <Link
              to="/syarat-ketentuan"
              className="min-h-11 shrink-0 self-start text-sm font-semibold text-primary underline underline-offset-4 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:self-center"
            >
              Baca syarat dan ketentuan
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-background">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Link to="/" className="inline-flex items-center gap-2.5">
              <VaultLogo size={30} />
              <span className="text-sm font-semibold tracking-[0.16em]">
                PINDAI
              </span>
            </Link>
            <nav
              aria-label="Tautan produk"
              className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600"
            >
              <Link to="/pinjaman/konvensional">Konvensional</Link>
              <Link to="/pinjaman/syariah">Syariah</Link>
              <Link to="/biaya">Biaya</Link>
              <Link to="/cara-kerja">Cara kerja</Link>
            </nav>
          </div>
          <p className="max-w-3xl text-xs leading-5 text-slate-500">
            {PENAFIAN_PINDAI} Produk diterbitkan oleh {NAMA_ENTITAS_PINDAI}.
          </p>
          <p className="text-xs text-slate-500">{HAK_CIPTA_PINDAI}</p>
        </div>
      </footer>
    </div>
  );
}

/**
 * Tampilan murni dengan tarif eksplisit supaya bisa dirender di uji tanpa
 * klien Convex.
 */
export function ProdukPinjamanView({
  produk,
  tarifBiaya = tarifBiayaAman(undefined),
  tarifBulanan = TARIF_BULANAN_DEFAULT,
  akunHref = "/auth",
  akunLabel = "Masuk",
  memuatAkun = false,
}: {
  produk: JenisProduk;
  tarifBiaya?: TarifBiaya;
  tarifBulanan?: TarifBulanan;
  akunHref?: string;
  akunLabel?: string;
  memuatAkun?: boolean;
}) {
  return (
    <KerangkaHalaman
      produk={produk}
      tarifBiaya={tarifBiaya}
      tarifBulanan={tarifBulanan}
      akunHref={akunHref}
      akunLabel={akunLabel}
      memuatAkun={memuatAkun}
    />
  );
}

/** Rute publik: tarif dibaca dari Pengaturan Sistem yang sama dengan server. */
export default function ProdukPinjaman({ produk }: { produk: JenisProduk }) {
  const ketentuan = useQuery(api.system.getKetentuanBiaya);
  const { isAuthenticated, isLoading } = useAuth();
  return (
    <ProdukPinjamanView
      produk={produk}
      tarifBiaya={tarifBiayaAman(ketentuan?.tarifBiaya)}
      tarifBulanan={ketentuan?.tarifBulanan ?? TARIF_BULANAN_DEFAULT}
      akunHref={isAuthenticated ? "/dashboard" : "/auth"}
      akunLabel={isAuthenticated ? "Buka dashboard" : "Masuk"}
      memuatAkun={isLoading}
    />
  );
}
