/**
 * Kalkulator pinjaman di halaman publik.
 *
 * Dipindah dari `pages/Landing.tsx` dengan mesin harga yang sama: satu komponen
 * sebesar ini membuat berkas halaman sulit dibaca, padahal batasnya jelas
 * (masukan nominal/tenor, hasil hitung, ajakan membuat akun).
 *
 * Skema harian: Rp 100 rb sampai 1 jt / tenor 7–50 hari. Skema bulanan: sampai
 * plafon tertinggi yang boleh disimpan admin (Rp 10 jt) dengan tenor
 * 1/3/6/9/12 bulan (DP 0%, potongan di muka 2% untuk semua tenor; bunga FLAT
 * dari pokok penuh mengikuti tarif akun, bawaan 30%/8%/12%/10%/8% per bulan
 * untuk tenor 1/3/6/9/12 (marjin total 30%/24%/72%/90%/96%); setiap
 * pembayaran bulanan dikenai biaya admin cicilan 2%). Angka di bawah ini sengaja
 * tidak lebih besar dari plafon — lihat lib/plafon.ts.
 */
import { ArrowRight } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link } from "react-router";

import { PemilihTanggalJatuhTempo } from "@/components/PemilihTanggalJatuhTempo";
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
  TENOR_HARIAN_MAKS,
  TENOR_OPTIONS,
  tenorHarianDefault,
  tenorHarianEfektif,
  type LoanQuote,
  type TarifBiaya,
} from "@/lib/loan";
import { catatPeristiwaLanding } from "@/lib/analitikLanding";
import { formatRupiah, percentOf, type Rupiah } from "@/lib/money";
import { PLAFON_BATAS } from "@/lib/plafon";
import {
  bungaSetelahPromo,
  pilihPromoBunga,
  type PromoBungaRingkas,
} from "@/lib/promoBunga";
import { simpanSimulasiPengajuan } from "@/lib/simulasiPengajuan";

const QUICK_AMOUNTS = [100_000, 250_000, 500_000, 1_000_000];
const QUICK_AMOUNTS_BULANAN = [500_000, 1_000_000, 2_500_000, 5_000_000, 10_000_000];
const MIN_SLIDER = LOAN_LIMITS.minPokok;
const MAX_SLIDER = LOAN_LIMITS.maxPokok;
/** Plafon tertinggi per nasabah — batas atas slider bulanan di landing. */
const MAX_SLIDER_BULANAN = Math.min(BULANAN_LIMITS.maxPokok, PLAFON_BATAS.maks);
const SLIDER_STEPS = 140;
const SLIDER_STEPS_BULANAN = 200;
/** Waktu acuan promo; stabil selama halaman kalkulator terbuka. */
const WAKTU_MUAT_KALKULATOR = Date.now();

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
  tarifBiaya,
  promos = [],
  accountHref = "/auth",
  accountLabel = "Buat akun untuk mengajukan",
}: {
  tarifBulanan?: Partial<TarifBulanan> | null;
  /** Tarif potongan di muka dari Pengaturan Parameter Bisnis. */
  tarifBiaya?: TarifBiaya | null;
  /** Promo bunga yang sedang berlaku; ikut dihitung di kalkulator. */
  promos?: readonly PromoBungaRingkas[];
  /** Tujuan CTA; landing mengisi formulir setelah sesi dibuat. */
  accountHref?: string;
  accountLabel?: string;
}) {
  const idBantuan = useId();
  const [skema, setSkema] = useState<"harian" | "bulanan">("harian");
  const bulanan = skema === "bulanan";
  /** Cincin fokus yang sama untuk semua kontrol native di kalkulator. */
  const kelasFokus =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
  const [amount, setAmount] = useState<Rupiah>(LOAN_LIMITS.maxPokok);
  const [tenor, setTenor] = useState<number>(tenorHarianDefault(LOAN_LIMITS.maxPokok));
  const [tenorBulan, setTenorBulan] = useState<number>(3);
  // Tenor yang ditampilkan selalu tenor sah untuk nominal saat ini. Tenor bebas
  // 8–27 dan perpanjangan 29–50 dipertahankan, bukan digeser ke 7/14/21/28.
  const tenorHarian = tenorHarianEfektif(amount, tenor);
  const tarifNormalHarian =
    persenBungaHarian(amount, tenorHarian) ?? PINDAI_PRICING.bungaPercent;
  // Promo dipilih dari tenor hasil tanggal, bukan dari tombol tenor lama: satu
  // pengajuan tetap memakai satu kampanye, dan tanggal yang sama selalu
  // menghasilkan angka yang sama dengan formulir.
  const promoBunga = pilihPromoBunga(promos, {
    tenor: tenorHarian,
    sekarang: WAKTU_MUAT_KALKULATOR,
    persenNormal: tarifNormalHarian,
  });
  const tarifHarian = bungaSetelahPromo(tarifNormalHarian, promoBunga);
  const diskonAdminPromo =
    promoBunga?.jenis === "bebas_admin"
      ? percentOf(
          amount,
          tarifBiaya?.adminPersen ?? PINDAI_PRICING.adminFeePercent,
        )
      : 0;
  const quote: LoanQuote = useMemo(
    () =>
      quoteLoanBunga(amount, tarifHarian, {
        ...(tarifBiaya ? { tarif: tarifBiaya } : {}),
        ...(diskonAdminPromo > 0 ? { diskonAdmin: diskonAdminPromo } : {}),
      }),
    [amount, tarifHarian, tarifBiaya, diskonAdminPromo],
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
  // Simpan setiap perubahan, bukan hanya saat CTA kalkulator diklik. Dengan
  // begitu tombol header dan CTA lengket juga membawa hitungan terakhir ke
  // formulir. Efek pertama tidak menulis apa pun supaya nilai bawaan tidak
  // dianggap pilihan pengunjung.
  const awalSimulasi = useRef({ skema, amount, tenorHarian, tenorBulan });
  const pernahBerubah = useRef(false);
  useEffect(() => {
    const awal = awalSimulasi.current;
    const samaDenganAwal =
      awal.skema === skema &&
      awal.amount === amount &&
      awal.tenorHarian === tenorHarian &&
      awal.tenorBulan === tenorBulan;
    if (!pernahBerubah.current && samaDenganAwal) return;
    pernahBerubah.current = true;
    simpanSimulasiPengajuan({ skema, pokok: amount, tenorHari: tenorHarian, tenorBulan });
  }, [skema, amount, tenorHarian, tenorBulan]);

  const pilihNominal = (nilai: number) => {
    setAmount(nilai);
    setTenor((sebelumnya) => tenorHarianEfektif(nilai, sebelumnya));
  };

  const gantiSkema = (next: "harian" | "bulanan") => {
    const nilai =
      next === "bulanan"
        ? Math.min(Math.max(amount, BULANAN_LIMITS.minPokok), MAX_SLIDER_BULANAN)
        : Math.min(Math.max(amount, MIN_SLIDER), MAX_SLIDER);
    setSkema(next);
    setAmount(nilai);
    if (next === "harian") setTenor((sebelumnya) => tenorHarianEfektif(nilai, sebelumnya));
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card p-4 sm:p-6">
      {/* Dua skema harga: harian (s.d. 1 jt / 7–50 hari) atau bulanan. */}
      <div
        role="group"
        aria-label="Skema pinjaman"
        className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-muted p-1"
      >
        {([
          ["harian", "Harian · s.d. 1 jt"],
          ["bulanan", "Bulanan · s.d. 10 jt"],
        ] as const).map(([nilai, label]) => (
          <button
            key={nilai}
            type="button"
            onClick={() => gantiSkema(nilai)}
            aria-pressed={skema === nilai}
            className={`relative min-h-11 rounded-lg px-2 py-2 text-center text-xs font-medium leading-4 transition-colors sm:px-3 ${kelasFokus}`}
          >
            {skema === nilai && (
              <span
                aria-hidden="true"
                className="absolute inset-0 rounded-lg bg-card shadow-sm"
              />
            )}
            <span className={`relative ${skema === nilai ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>
              {label}
            </span>
          </button>
        ))}
      </div>

      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Untuk akad syariah,{" "}
        <Link
          to="/pinjaman/syariah"
          className="inline-flex min-h-11 items-center font-semibold text-gold-foreground underline underline-offset-4 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          lihat simulasi murabahah dan rahn
        </Link>
        .
      </p>

      <div className="mt-5">
        <div className="flex items-baseline justify-between">
          <label htmlFor="calc-nominal" className="text-sm font-medium text-foreground">
            Pokok pinjaman
          </label>
          <span className="text-sm font-semibold tabular-nums text-foreground">
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
          aria-valuetext={formatRupiah(amount)}
          aria-describedby={idBantuan}
          className={`mt-3 h-11 w-full accent-primary ${kelasFokus}`}
        />
        <p id={idBantuan} className="mt-1 text-sm leading-6 text-muted-foreground">
          Batas {formatRupiah(min)} sampai {formatRupiah(max)}. Geser atau pilih nominal cepat.
        </p>
        <div
          role="group"
          aria-label="Nominal cepat"
          className="mt-3 flex flex-wrap gap-1.5 sm:gap-2"
        >
          {cepat.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => pilihNominal(q)}
              aria-pressed={amount === q}
              className={`min-h-11 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${kelasFokus} ${
                amount === q
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              {formatRupiah(q).replace("Rp ", "")}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <p className="text-sm font-medium text-foreground">
          {bulanan ? "Tenor" : "Tanggal jatuh tempo"}
        </p>
        {bulanan ? (
          <div role="group" aria-label="Pilih tenor" className="mt-2 grid grid-cols-3 gap-2">
            {TENOR_BULANAN_OPTIONS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTenorBulan(t)}
                aria-pressed={tenorBulan === t}
                className={`relative min-h-11 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${kelasFokus} ${
                  tenorBulan === t
                    ? "border-primary text-primary"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {tenorBulan === t && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 rounded-lg bg-primary/10"
                  />
                )}
                <span className="relative">{t} bulan</span>
              </button>
            ))}
          </div>
        ) : (
          <>
            <div className="mt-2">
              <PemilihTanggalJatuhTempo
                pokok={amount}
                tenor={tenorHarian}
                onPilih={setTenor}
                promos={promos}
              />
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Bunga <strong className="font-semibold text-foreground">{tarifHarian}%</strong> flat
              untuk tenor {tenorHarian} hari (bukan bunga per tahun). Pilih tanggal{" "}
              {TENOR_OPTIONS[0]}–{TENOR_HARIAN_MAKS} hari dari hari ini; semakin lama tenor,
              semakin besar bunga. Hari ke-29 dan seterusnya memakai tarif perpanjangan.
            </p>
            {promoBunga !== null && (
              <p className="mt-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs leading-5 text-foreground">
                Promo <strong className="font-semibold">{promoBunga.nama}</strong>{" "}
                {promoBunga.jenis === "bebas_admin"
                  ? `membebaskan biaya admin di muka; bunga tetap ${tarifNormalHarian}%.`
                  : `menurunkan bunga dari ${tarifNormalHarian}% menjadi ${tarifHarian}%.`}{" "}
                Angka di bawah sudah memakainya.
              </p>
            )}
          </>
        )}
      </div>

      <div aria-hidden="true" className="mt-6 flex items-center gap-2.5">
        <span className="size-2 rounded-full bg-border" />
        <span className="h-px flex-1 border-t border-dashed border-border" />
        <span className="size-2 rounded-full bg-border" />
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
                  `Bunga ${tarifHarian}% · tenor ${tenorHarian} hari (flat)`,
                  formatRupiah(quote.bunga),
                  false,
                ],
                [
                  "Biaya admin (dipotong di muka)",
                  formatRupiah(quote.biayaAdmin - quote.diskonAdmin),
                  false,
                ],
                [
                  "Cair ekspres (bila dipilih, dipotong di muka)",
                  formatRupiah(quote.biayaExpress),
                  false,
                ],
                ["Total potongan di muka", formatRupiah(quote.totalPotonganDiMuka), false],
                ["Dana bersih diterima", formatRupiah(quote.danaBersihDitransfer), true],
                [
                  "Total biaya pinjaman (bunga + potongan)",
                  formatRupiah((quote.bunga + quote.totalPotonganDiMuka) as Rupiah),
                  false,
                ],
              ] as Array<[string, string, boolean?]>)
        ).map(([term, value, strong]) => (
          <div key={term} className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
            <dt className={strong ? "font-medium text-foreground" : "text-muted-foreground"}>{term}</dt>
            <dd
              className={`tabular-nums sm:text-right ${
                strong ? "font-semibold text-foreground" : "font-medium text-foreground"
              }`}
            >
              {value}
            </dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-3 border-t border-border pt-2.5 sm:gap-4">
          <dt className="font-semibold text-foreground">Total pelunasan</dt>
          <dd className="text-base font-semibold tabular-nums text-foreground">
            {formatRupiah(totalPelunasan)}
          </dd>
        </div>
      </dl>

      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        Total pelunasan {formatRupiah(totalPelunasan)}
      </p>

      <p className="mt-4 text-sm leading-6 text-muted-foreground">
        Ini perhitungan aplikasi, bukan persetujuan pinjaman. Skema bulanan
        menampilkan ilustrasi angsuran; pencatatan pelunasan di sistem dilakukan
        sekaligus saat jatuh tempo. Perpindahan dana ditangani di luar aplikasi.
        Hitungan ini dibawa ke formulir setelah masuk; pengajuan pertama
        memerlukan verifikasi identitas (KYC).
      </p>

      <Button
        asChild
        className="mt-5 h-11 w-full rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
      >
        <Link
          to={accountHref}
          onClick={() => {
            catatPeristiwaLanding({
              nama: "landing_cta",
              tempat: "kalkulator",
            });
            simpanSimulasiPengajuan({
              skema,
              pokok: amount,
              tenorHari: tenorHarian,
              tenorBulan,
            });
          }}
        >
          {accountLabel}
          <ArrowRight className="ml-1.5 size-4" aria-hidden="true" />
        </Link>
      </Button>
    </div>
  );
}
