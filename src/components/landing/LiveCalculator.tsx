/**
 * Kalkulator pinjaman di halaman publik.
 *
 * Dipindah dari `pages/Landing.tsx` tanpa mengubah perilaku: satu komponen
 * sebesar ini membuat berkas halaman sulit dibaca, padahal batasnya jelas
 * (masukan nominal/tenor, hasil hitung, ajakan membuat akun).
 *
 * Skema harian: Rp 100 rb sampai 1 jt / maks 28 hari. Skema bulanan: sampai
 * plafon tertinggi yang boleh disimpan admin (Rp 10 jt) dengan tenor 1/3/6 bulan
 * (DP 0%, potongan di muka 2% untuk semua tenor; bunga FLAT dari pokok penuh
 * mengikuti tarif akun, bawaan 30%/35%/30% per bulan untuk tenor 1/3/6; setiap
 * pembayaran bulanan dikenai biaya admin cicilan 2%). Angka di bawah ini sengaja
 * tidak lebih besar dari plafon — lihat lib/plafon.ts.
 */
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Calculator } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import {
  BULANAN_LIMITS,
  hitungSimulasiBulanan,
  TENOR_BULANAN_OPTIONS,
  type TarifBulanan,
} from "@/lib/bulanan";
import {
  LOAN_LIMITS,
  persenBungaHarian,
  PINDAI_PRICING,
  quoteLoanBunga,
  sesuaikanTenorHarian,
  TENOR_OPTIONS,
  tenorHarianDefault,
  tenorHarianTersedia,
  type LoanQuote,
} from "@/lib/loan";
import { formatRupiah, type Rupiah } from "@/lib/money";
import { EASE_OUT } from "@/lib/motion";
import { PLAFON_BATAS } from "@/lib/plafon";

const QUICK_AMOUNTS = [100_000, 250_000, 500_000, 1_000_000];
const QUICK_AMOUNTS_BULANAN = [500_000, 1_000_000, 2_500_000, 5_000_000, 10_000_000];
const MIN_SLIDER = LOAN_LIMITS.minPokok;
const MAX_SLIDER = LOAN_LIMITS.maxPokok;
/** Plafon tertinggi per nasabah — batas atas slider bulanan di landing. */
const MAX_SLIDER_BULANAN = Math.min(BULANAN_LIMITS.maxPokok, PLAFON_BATAS.maks);
const SLIDER_STEPS = 140;
const SLIDER_STEPS_BULANAN = 200;

function sliderToRupiah(v: number, min: number, max: number, steps: number, step: number): Rupiah {
  const t = v / steps;
  const raw = min * Math.pow(max / min, t);
  return Math.round(raw / step) * step;
}

function rupiahToSlider(r: Rupiah, min: number, max: number, steps: number): number {
  const clamped = Math.min(max, Math.max(min, r));
  return Math.round((Math.log(clamped / min) / Math.log(max / min)) * steps);
}

/**
 * Kalkulator landing: tenor harian mengikuti matriks nominal–tenor, sedangkan
 * skema bulanan memakai tarif per tenor dari Pengaturan Sistem — angka yang
 * sama dengan tabel biaya publik dan mesin pengajuan.
 */
export function LiveCalculator({
  tarifBulanan,
}: {
  tarifBulanan?: Partial<TarifBulanan> | null;
}) {
  const [skema, setSkema] = useState<"harian" | "bulanan">("harian");
  const bulanan = skema === "bulanan";
  const [amount, setAmount] = useState<Rupiah>(LOAN_LIMITS.maxPokok);
  const [tenor, setTenor] = useState<number>(tenorHarianDefault(LOAN_LIMITS.maxPokok));
  const [tenorBulan, setTenorBulan] = useState<number>(3);
  // Tenor yang ditampilkan selalu tenor sah untuk nominal saat ini.
  const tenorHarian = sesuaikanTenorHarian(amount, tenor);
  const tenorHarianOpsi = tenorHarianTersedia(amount);
  const tarifHarian = persenBungaHarian(amount, tenorHarian) ?? PINDAI_PRICING.bungaPercent;
  const quote: LoanQuote = useMemo(
    () => quoteLoanBunga(amount, tarifHarian),
    [amount, tarifHarian],
  );
  const sim = useMemo(() => {
    if (!bulanan) return null;
    try {
      return hitungSimulasiBulanan(amount, tenorBulan, {
        tarif: tarifBulanan ?? null,
      });
    } catch {
      return null;
    }
  }, [bulanan, amount, tenorBulan, tarifBulanan]);

  const min = bulanan ? BULANAN_LIMITS.minPokok : MIN_SLIDER;
  const max = bulanan ? MAX_SLIDER_BULANAN : MAX_SLIDER;
  const steps = bulanan ? SLIDER_STEPS_BULANAN : SLIDER_STEPS;
  const stepBulat = bulanan ? 500_000 : 50_000;
  const cepat = bulanan ? QUICK_AMOUNTS_BULANAN : QUICK_AMOUNTS;
  const totalPelunasan = sim !== null ? sim.totalPengembalian : quote.totalKewajibanPelunasan;

  const pilihNominal = (nilai: number) => {
    setAmount(nilai);
    setTenor((sebelumnya) => sesuaikanTenorHarian(nilai, sebelumnya));
  };

  const gantiSkema = (next: "harian" | "bulanan") => {
    const nilai =
      next === "bulanan"
        ? Math.min(Math.max(amount, BULANAN_LIMITS.minPokok), MAX_SLIDER_BULANAN)
        : Math.min(Math.max(amount, MIN_SLIDER), MAX_SLIDER);
    setSkema(next);
    setAmount(nilai);
    if (next === "harian") setTenor(sesuaikanTenorHarian(nilai, tenor));
  };

  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white p-5 sm:p-7">
      <div className="-mx-5 -mt-5 mb-5 border-b border-slate-200 bg-slate-50/80 px-5 py-5 sm:-mx-7 sm:-mt-7 sm:mb-6 sm:px-7">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <span className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary sm:tracking-[0.16em]"><Calculator className="size-3.5" /> Kalkulator interaktif</span>
          <span className="rounded-full border border-primary/15 bg-white px-2.5 py-1 text-[10px] font-medium text-primary">Hasil langsung</span>
        </div>
        <h3 className="mt-2 text-lg font-semibold text-slate-900">Kalkulator pinjaman</h3>
        <p className="mt-1 text-xs leading-5 text-slate-500">Ubah nominal dan tenor untuk melihat perhitungan sebelum masuk.</p>
      </div>

      {/* Dua skema harga: harian (1 jt / 28 hari) atau bulanan (1–6 bulan). */}
      <div className="mt-5 grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
        {([
          ["harian", "Harian · s.d. 1 jt"],
          ["bulanan", "Bulanan · s.d. 10 jt"],
        ] as const).map(([nilai, label]) => (
          <button
            key={nilai}
            type="button"
            onClick={() => gantiSkema(nilai)}
            className="relative rounded-lg px-2 py-2 text-center text-xs font-medium leading-4 transition-colors sm:px-3"
          >
            {skema === nilai && (
              <motion.span
                layoutId="calc-skema"
                className="absolute inset-0 rounded-lg bg-white shadow-sm"
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
              />
            )}
            <span className={`relative ${skema === nilai ? "text-primary" : "text-slate-500 hover:text-slate-800"}`}>
              {label}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-5">
        <div className="flex items-baseline justify-between">
          <label htmlFor="calc-nominal" className="text-sm font-medium text-slate-700">
            Pokok pinjaman
          </label>
          <span className="text-sm font-semibold tabular-nums text-slate-900">
            {formatRupiah(amount)}
          </span>
        </div>
        <input
          id="calc-nominal"
          type="range"
          min={0}
          max={steps}
          value={rupiahToSlider(amount, min, max, steps)}
          onChange={(e) =>
            pilihNominal(sliderToRupiah(Number(e.target.value), min, max, steps, stepBulat))
          }
          className="mt-3 w-full accent-primary"
        />
        <div className="mt-3 flex flex-wrap gap-1.5 sm:gap-2">
          {cepat.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => pilihNominal(q)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                amount === q
                  ? "bg-primary text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {formatRupiah(q).replace("Rp ", "")}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <p className="text-sm font-medium text-slate-700">Tenor</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {bulanan
            ? TENOR_BULANAN_OPTIONS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTenorBulan(t)}
                  className={`relative rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    tenorBulan === t
                      ? "border-primary text-primary"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {tenorBulan === t && (
                    <motion.span
                      layoutId="calc-tenor"
                      className="absolute inset-0 rounded-lg bg-primary/10"
                      transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    />
                  )}
                  <span className="relative">{t} bulan</span>
                </button>
              ))
            : TENOR_OPTIONS.map((t) => {
                const aktif = (tenorHarianOpsi as readonly number[]).includes(t);
                const dipilih = tenorHarian === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTenor(t)}
                    disabled={!aktif}
                    aria-pressed={dipilih}
                    className={`relative rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300 ${
                      dipilih
                        ? "border-primary text-primary"
                        : aktif
                          ? "border-slate-200 text-slate-600 hover:bg-slate-50"
                          : ""
                    }`}
                  >
                    {dipilih && (
                      <motion.span
                        layoutId="calc-tenor"
                        className="absolute inset-0 rounded-lg bg-primary/10"
                        transition={{ type: "spring", stiffness: 380, damping: 32 }}
                      />
                    )}
                    <span className="relative">{t} hari</span>
                  </button>
                );
              })}
        </div>
        {!bulanan && (
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Bunga <strong className="font-semibold text-slate-800">{tarifHarian}%</strong> untuk
            tenor {tenorHarian} hari. Nominal ini menerima tenor {tenorHarianOpsi.join(" / ")} hari.
          </p>
        )}
      </div>

      <div aria-hidden="true" className="mt-6 flex items-center gap-2.5">
        <span className="size-2 rounded-full bg-slate-200" />
        <span className="h-px flex-1 border-t border-dashed border-slate-300" />
        <span className="size-2 rounded-full bg-slate-200" />
      </div>
      <dl className="mt-5 space-y-2.5 text-sm sm:space-y-2">
        {(
          sim !== null
            ? ([
                [
                  `Bunga selama tenor (${sim.persenBungaPerBulan}%/bulan flat dari pokok)`,
                  formatRupiah(sim.bungaTotal),
                  false,
                ],
                [
                  sim.tenorBulan === 3 || sim.tenorBulan === 6
                    ? `Biaya admin 2% (${formatRupiah(sim.biayaAdminTotal)}) dipotong di muka (platform 0%)`
                    : "Biaya layanan 2% (dipotong di muka)",
                  formatRupiah(sim.biayaLayananTotal),
                  false,
                ],
                ["Pokok perhitungan (DP 0%)", formatRupiah(sim.pokokDibiayai), true],
                ...(sim.biayaAdminCicilanTotal > 0
                  ? ([
                      [
                        `Biaya admin cicilan 2% (${sim.tenorBulan} kali bayar)`,
                        formatRupiah(sim.biayaAdminCicilanTotal),
                        false,
                      ],
                    ] as Array<[string, string, boolean?]>)
                  : []),
                [
                  `Total bayar per bulan (${sim.tenorBulan} bulan)`,
                  formatRupiah(sim.cicilanPerBulan),
                  true,
                ],
              ] as Array<[string, string, boolean?]>)
            : ([
                [
                  `Bunga ${tarifHarian}% · tenor ${tenorHarian} hari`,
                  formatRupiah(quote.bunga),
                  false,
                ],
                ["Dana bersih (setelah seluruh potongan di muka)", formatRupiah(quote.danaBersihDitransfer), true],
              ] as Array<[string, string, boolean?]>)
        ).map(([term, value, strong]) => (
          <div key={term} className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
            <dt className={strong ? "font-medium text-slate-900" : "text-slate-500"}>{term}</dt>
            <dd
              className={`tabular-nums sm:text-right ${
                strong ? "font-semibold text-slate-900" : "font-medium text-slate-700"
              }`}
            >
              {value}
            </dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-3 border-t border-slate-200 pt-2.5 sm:gap-4">
          <dt className="font-semibold text-slate-900">Total pelunasan</dt>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.dd
              key={totalPelunasan}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: EASE_OUT }}
              className="text-base font-semibold tabular-nums text-slate-900"
            >
              {formatRupiah(totalPelunasan)}
            </motion.dd>
          </AnimatePresence>
        </div>
      </dl>

      <p className="mt-4 text-xs leading-5 text-slate-500">
        Ini perhitungan aplikasi, bukan persetujuan pinjaman. Skema bulanan menampilkan ilustrasi angsuran; pencatatan pelunasan di sistem dilakukan sekaligus saat jatuh tempo. Perpindahan dana ditangani di luar aplikasi.
      </p>

      <Button asChild className="animate-sheen mt-5 h-11 w-full bg-primary text-white transition-transform hover:-translate-y-0.5 hover:bg-primary/90">
        <Link to="/auth">
          Buat akun untuk mengajukan
          <ArrowRight className="ml-1.5 size-4" />
        </Link>
      </Button>
    </div>
  );
}
