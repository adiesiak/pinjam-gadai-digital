import { useQuery } from "convex/react";
import {
  AnimatePresence,
  motion,
  useInView,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  type Variants,
} from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  Calculator,
  Eye,
  Landmark,
  Lock,
  Megaphone,
  Menu,
  Package,
  Percent,
  Scale,
  ShieldCheck,
  Sparkles,
  Vault,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";

import { useAuth } from "@/hooks/use-auth";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/convex/_generated/api";
import { RoleDashboardMenu } from "@/components/RoleDashboardMenu";
import { Reveal } from "@/components/Reveal";
import { CMS_DEFAULTS } from "@/lib/cms-defaults";
import { CONTRACT_TERMS_VERSION } from "@/lib/contract";
import {
  BULANAN_LIMITS,
  hitungSimulasiBulanan,
  TENOR_BULANAN_OPTIONS,
} from "@/lib/bulanan";
import { LOAN_LIMITS, quoteLoan, TENOR_OPTIONS, type LoanQuote } from "@/lib/loan";
import { formatRupiah, type Rupiah } from "@/lib/money";
import { EASE_OUT } from "@/lib/motion";
import { PLAFON_BATAS } from "@/lib/plafon";
import { ADMIN_ROUTE } from "@/lib/routes";

/* Ikon brankas PINDAI — proporsi kokoh dengan detail dial yang tetap terbaca kecil.
   Saat tema "Musim Salju" aktif, dial berputar, rona logo bergeser, dan lapisan
   salju menutupi bagian atas brankas (kelas `vault-*`, lihat index.css). */
function VaultLogo({ size = 36 }: { size?: number }) {
  return (
    <svg
      className="vault-logo"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="5"
        y="6"
        width="54"
        height="50"
        rx="12"
        fill="#0f3d3a"
        stroke="#b99b62"
        strokeWidth="2"
      />
      <path d="M15 10h34" stroke="#ffffff" strokeOpacity=".18" strokeWidth="2" strokeLinecap="round" />
      <rect x="11" y="12" width="42" height="38" rx="7" fill="#f5f2e9" />
      <rect x="14" y="15" width="36" height="32" rx="5" stroke="#d9d2c1" strokeWidth="1.5" />
      <rect x="7" y="19" width="5" height="7" rx="2.5" fill="#cbb47e" />
      <rect x="7" y="36" width="5" height="7" rx="2.5" fill="#cbb47e" />
      <g className="vault-dial">
        <circle cx="31" cy="31" r="10" fill="#0f3d3a" />
        <circle cx="31" cy="31" r="7.2" stroke="#cbb47e" strokeWidth="1.5" />
        <path d="M31 31l7-5M31 24v2M38 31h-2M31 38v-2M24 31h2" stroke="#f5f2e9" strokeWidth="1.7" strokeLinecap="round" />
        <circle cx="31" cy="31" r="2.2" fill="#cbb47e" />
      </g>
      <path d="M20 57h8M36 57h8" stroke="#0b2d2a" strokeWidth="3" strokeLinecap="round" />
      <g className="vault-snow" aria-hidden="true">
        <path
          d="M6 16 C 13 9, 21 17, 31 12 C 41 7, 49 16, 58 10 L58 9 C58 7 56 6 54 6 L10 6 C8 6 6 7 6 9 Z"
          fill="#ffffff"
          opacity="0.96"
        />
        <circle cx="17" cy="13" r="2.6" fill="#ffffff" opacity="0.9" />
        <circle cx="45" cy="12" r="3" fill="#ffffff" opacity="0.92" />
      </g>
    </svg>
  );
}

function BrandWordmark({ name, compact = false }: { name: string; compact?: boolean }) {
  return (
    <span className="flex min-w-0 flex-col gap-1">
      <span className="flex items-baseline gap-1.5 leading-none">
        <span
          className={`truncate font-black uppercase text-primary ${
            compact ? "text-sm tracking-[0.16em]" : "text-lg tracking-[0.2em]"
          }`}
        >
          {name}
        </span>
        <span className="size-1.5 shrink-0 rounded-full bg-[#b99b62]" aria-hidden="true" />
      </span>
      <span
        className={`hidden items-center gap-1.5 font-semibold uppercase leading-none tracking-[0.13em] text-slate-400 sm:flex ${
          compact ? "text-[8px]" : "text-[9px]"
        }`}
      >
        <span className="h-px w-3 shrink-0 bg-[#b99b62]" aria-hidden="true" />
        Pinjam · Gadai Digital
      </span>
    </span>
  );
}

const SECURITY = [
  { icon: Lock, label: "Riwayat pengajuan hanya untuk akun terkait" },
  { icon: Scale, label: "Rincian biaya dan bunga ditampilkan terpisah" },
  { icon: Vault, label: "Status gadai tercatat pada ledger" },
  { icon: ShieldCheck, label: "Persetujuan aplikasi bukan jaminan pencairan dana" },
  { icon: Calculator, label: "Angka merupakan perhitungan aplikasi" },
  { icon: Eye, label: "Status dashboard adalah catatan internal" },
] as const;

const heroContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.04 } },
};

const heroItem: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.62, ease: EASE_OUT } },
};

/** Angka yang menghitung naik saat terlihat — mati saat reduced-motion. */
function CountUp({
  to,
  decimals = 0,
  suffix = "",
  prefix = "",
  duration = 1.3,
}: {
  to: number;
  decimals?: number;
  suffix?: string;
  prefix?: string;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const reduce = useReducedMotion();
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!inView || reduce) return;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / (duration * 1000));
      setValue(to * (1 - Math.pow(1 - t, 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, reduce, to, duration]);

  const shown = reduce ? to : value;
  return (
    <span ref={ref} className="tabular-nums">
      {prefix}
      {shown.toLocaleString("id-ID", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
      {suffix}
    </span>
  );
}

/** Lapisan cahaya latar: dua bola lembut yang mengapung perlahan. */
function GlowField() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="animate-drift absolute -left-24 top-[-6rem] size-[24rem] rounded-full bg-primary/10 blur-3xl" />
      <div className="animate-drift-reverse absolute -right-24 bottom-[-9rem] size-[30rem] rounded-full bg-[#cbb47e]/20 blur-3xl" />
    </div>
  );
}

/** Latar berpetak bergaya buku besar yang bergeser sangat lambat. */
function LedgerGrid({ className = "" }: { className?: string }) {
  const mask =
    "radial-gradient(ellipse 75% 65% at 50% 0%, #000 30%, transparent 100%)";
  return (
    <div
      aria-hidden="true"
      className={`animate-grid-pan pointer-events-none absolute inset-0 ${className}`}
      style={{
        backgroundImage:
          "linear-gradient(to right, rgba(15,61,58,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(15,61,58,0.08) 1px, transparent 1px)",
        backgroundSize: "48px 48px",
        maskImage: mask,
        WebkitMaskImage: mask,
      }}
    />
  );
}

/** Kolom contoh catatan ledger pada pratinjau (angka ilustrasi). */
const CATATAN_CONTOH = [
  { label: "Nomor referensi", value: "PDI-••••-••" },
  { label: "Skema", value: "Bulanan · 3 bulan" },
  { label: "Pokok perhitungan", value: "Rp 5.000.000" },
  { label: "Biaya admin + platform", value: "5% · dipotong di muka" },
  { label: "Biaya admin cicilan", value: "2% per bayar" },
  { label: "Status", value: "Sedang Direview" },
] as const;

/** Fakta ringkas yang berjalan (marquee) di bawah hero. */
const HERO_FACTS = [
  "Skema harian 7–30 hari · nilai bersih 95% · kewajiban 130%",
  "Skema bulanan tenor 1/3/6 bulan · biaya 5% dipotong di muka",
  "Bunga flat dari pokok penuh · 30% / 25% / 20% per bulan",
  "Kredit barang hingga Rp 10 juta · biaya admin cicilan 2% pada tenor 3/6",
  "Semua angka adalah perhitungan ledger internal PINDAI",
] as const;

function FactRibbon() {
  const mask =
    "linear-gradient(to right, transparent 0%, #000 8%, #000 92%, transparent 100%)";
  return (
    <div
      className="marquee-paused relative overflow-hidden border-t border-slate-200/80 bg-white/70 py-3.5"
      style={{ maskImage: mask, WebkitMaskImage: mask }}
    >
      <div className="animate-marquee flex w-max items-center whitespace-nowrap">
        {[0, 1].map((dup) => (
          <div key={dup} className="flex items-center gap-10 pr-10" aria-hidden={dup === 1}>
            {HERO_FACTS.map((fact) => (
              <span
                key={fact}
                className="flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500"
              >
                <span className="size-1.5 rounded-full bg-[#b99b62]" aria-hidden="true" />
                {fact}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Kartu skema biaya: daftar potongan + tiga angka yang menghitung naik. */
function SchemeCard({
  badge,
  title,
  body,
  rows,
  stats,
  delay = 0,
}: {
  badge: string;
  title: string;
  body: string;
  rows: ReadonlyArray<{ label: string; value: string }>;
  stats: ReadonlyArray<{ to: number; suffix: string; label: string; decimals?: number }>;
  delay?: number;
}) {
  return (
    <Reveal delay={delay} className="h-full">
      <article className="card-lift group relative flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-20 -top-24 size-52 rounded-full bg-primary/5 blur-2xl transition-transform duration-500 group-hover:scale-125"
        />
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
          <Percent className="size-3.5" />
          {badge}
        </span>
        <h3 className="mt-4 text-lg font-semibold text-slate-900">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>

        <dl className="mt-5 divide-y divide-slate-100 border-y border-slate-100">
          {rows.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-3 py-2.5 sm:gap-4">
              <dt className="text-xs leading-5 text-slate-500">{row.label}</dt>
              <dd className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">
                {row.value}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-5 grid grid-cols-3 gap-px overflow-hidden rounded-xl bg-slate-200">
          {stats.map((stat) => (
            <div key={stat.label} className="bg-slate-50/80 px-1.5 py-2.5 text-center sm:px-3 sm:py-3">
              <p className="text-base font-semibold tracking-tight text-primary sm:text-lg">
                <CountUp to={stat.to} decimals={stat.decimals ?? 0} suffix={stat.suffix} />
              </p>
              <p className="mt-1 text-[10px] uppercase leading-4 tracking-[0.1em] text-slate-500">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </article>
    </Reveal>
  );
}

/** Tanya jawab ringkas — memakai Accordion bawaan proyek. */
const FAQ_ITEMS = [
  {
    q: "Apakah PINDAI mengirim uang ke rekening saya?",
    a: "Tidak. PINDAI mencatat pengajuan, perhitungan, dan status pada ledger internal. Perpindahan dana ditangani di luar aplikasi, dan belum ada penyedia pembayaran yang terhubung.",
  },
  {
    q: "Dari mana angka cicilan di kalkulator berasal?",
    a: "Seluruh angka dihitung aplikasi dari nominal dan tenor yang Anda pilih — bukan nilai yang diketik manual. Skema harian memakai 5% dipotong di muka dan bunga 30%; skema bulanan memakai bunga flat dari pokok penuh 30% (tenor 1 bulan), 25% (tenor 3 bulan), dan 20% (tenor 6 bulan).",
  },
  {
    q: "Kapan biaya dipotong?",
    a: "Biaya tenor dipotong di muka dari dana yang diterima, bukan diangsur. Tenor 3 dan 6 bulan juga dikenai biaya admin cicilan 2% dari nominal cicilan yang dibayar bersama setiap cicilan.",
  },
  {
    q: "Apa yang dicatat untuk gadai?",
    a: "Deskripsi barang, nilai taksiran, pokok gadai, sewa modal, dan kode rak vault dicatat sebagai data internal. PINDAI belum menjalankan pemeriksaan fisik, penyimpanan, atau pelelangan barang.",
  },
  {
    q: "Bagaimana status pengajuan ditentukan?",
    a: "Tim PINDAI meninjau pengajuan dan mengubah statusnya di panel admin — tercatat pada audit log. Persetujuan pengajuan bukan jaminan pencairan dana, dan status di dashboard adalah catatan internal.",
  },
  {
    q: "Apakah data saya dibagikan ke pihak lain?",
    a: "Tidak. Riwayat pengajuan hanya dapat dibuka oleh akun terkait dan tim PINDAI; data tidak ditampilkan ke pihak eksternal.",
  },
] as const;

/** Poin ringkas Syarat & Ketentuan untuk landing; versi lengkap di /syarat-ketentuan. */
const RINGKASAN_SYARAT: Array<{ judul: string; isi: string; Icon: typeof Scale }> = [
  {
    judul: "Pencatatan internal, bukan transfer dana",
    isi: "PINDAI mencatat pengajuan, perhitungan, dan status pada ledger internal. Perpindahan dana ditangani di luar aplikasi.",
    Icon: Landmark,
  },
  {
    judul: "Biaya transparan",
    isi: "Bunga flat 30% dari pokok dan biaya dipotong di muka sesuai tenor. Semua angka dihitung aplikasi, bukan diketik manual.",
    Icon: Percent,
  },
  {
    judul: "Akun & keamanan",
    isi: "Jaga kerahasiaan akun Anda; verifikasi TOTP dan audit trail melindungi setiap tindakan di sistem.",
    Icon: Lock,
  },
  {
    judul: "Data pribadi",
    isi: "Riwayat pengajuan hanya dapat dibuka oleh akun terkait dan tim PINDAI, tidak dibagikan ke pihak eksternal.",
    Icon: ShieldCheck,
  },
  {
    judul: "Gadai & kredit barang",
    isi: "PINDAI mencatat data barang dan taksiran. Pemeriksaan fisik, penyimpanan, dan pelelangan belum dijalankan aplikasi.",
    Icon: Package,
  },
  {
    judul: "Keputusan & pelunasan",
    isi: "Persetujuan pengajuan bukan jaminan pencairan. Keterlambatan dikenai denda 0,5% per hari dari pokok (maksimum 15%).",
    Icon: Scale,
  },
];

// Skema harian: Rp 100 rb–1 jt / maks 30 hari. Skema bulanan: sampai plafon
// tertinggi yang boleh disimpan admin (Rp 10 jt) dengan tenor 1/3/6 bulan
// (DP 0%, biaya 5% tenor 3/6 atau 3% tenor 1, dipotong di muka; bunga FLAT dari
// pokok penuh — 30% (tenor 1), 25% (tenor 3), 20% (tenor 6) per bulan).
// Angka di bawah ini
// sengaja tidak lebih besar dari plafon — lihat lib/plafon.ts.
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

function LiveCalculator() {
  const [skema, setSkema] = useState<"harian" | "bulanan">("harian");
  const bulanan = skema === "bulanan";
  const [amount, setAmount] = useState<Rupiah>(LOAN_LIMITS.maxPokok);
  const [tenor, setTenor] = useState<number>(30);
  const [tenorBulan, setTenorBulan] = useState<number>(3);
  const quote: LoanQuote = useMemo(() => quoteLoan(amount), [amount]);
  const sim = useMemo(() => {
    if (!bulanan) return null;
    try {
      return hitungSimulasiBulanan(amount, tenorBulan);
    } catch {
      return null;
    }
  }, [bulanan, amount, tenorBulan]);

  const min = bulanan ? BULANAN_LIMITS.minPokok : MIN_SLIDER;
  const max = bulanan ? MAX_SLIDER_BULANAN : MAX_SLIDER;
  const steps = bulanan ? SLIDER_STEPS_BULANAN : SLIDER_STEPS;
  const stepBulat = bulanan ? 500_000 : 50_000;
  const cepat = bulanan ? QUICK_AMOUNTS_BULANAN : QUICK_AMOUNTS;
  const totalPelunasan = sim !== null ? sim.totalPengembalian : quote.totalKewajibanPelunasan;

  const gantiSkema = (next: "harian" | "bulanan") => {
    setSkema(next);
    setAmount((a) =>
      next === "bulanan"
        ? Math.min(Math.max(a, BULANAN_LIMITS.minPokok), MAX_SLIDER_BULANAN)
        : Math.min(Math.max(a, MIN_SLIDER), MAX_SLIDER),
    );
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

      {/* Dua skema harga: harian (1 jt / 30 hari) atau bulanan (1–6 bulan). */}
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
            setAmount(sliderToRupiah(Number(e.target.value), min, max, steps, stepBulat))
          }
          className="mt-3 w-full accent-primary"
        />
        <div className="mt-3 flex flex-wrap gap-1.5 sm:gap-2">
          {cepat.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setAmount(q)}
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
            : TENOR_OPTIONS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTenor(t)}
                  className={`relative rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    tenor === t
                      ? "border-primary text-primary"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {tenor === t && (
                    <motion.span
                      layoutId="calc-tenor"
                      className="absolute inset-0 rounded-lg bg-primary/10"
                      transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    />
                  )}
                  <span className="relative">{t} hari</span>
                </button>
              ))}
        </div>
      </div>

      <dl className="mt-6 space-y-2.5 border-t border-slate-200 pt-5 text-sm sm:space-y-2">
        {(
          sim !== null
            ? ([
                [
                  `Bunga ${sim.persenBungaPerBulan}%/bulan (flat dari pokok)`,
                  formatRupiah(sim.bungaTotal),
                  false,
                ],
                [
                  sim.tenorBulan === 3 || sim.tenorBulan === 6
                    ? `Admin 2% (${formatRupiah(sim.biayaAdminTotal)}) + platform 3% (${formatRupiah(sim.biayaPlatformTotal)}), dipotong di muka`
                    : "Biaya layanan 3% (dipotong di muka)",
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
                ["Bunga (30%)", formatRupiah(quote.bunga), false],
                ["Nilai bersih (95% dari pokok)", formatRupiah(quote.danaBersihDitransfer), true],
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

function AnnouncementModal({
  onOpenCta,
  judul,
  isi,
  cta,
  aktif,
}: {
  onOpenCta: () => void;
  judul: string;
  isi: string;
  cta: string;
  aktif: boolean;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!aktif) return;
    const t = setTimeout(() => setOpen(true), 1500);
    return () => clearTimeout(t);
  }, [aktif]);

  if (!aktif) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md gap-0 overflow-hidden rounded-2xl border border-slate-200 p-0 sm:max-w-md">
        <div className="px-6 pb-2 pt-7">
          <span className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Megaphone className="size-5" />
          </span>
          <DialogHeader className="mt-4 space-y-2 text-left">
            <DialogTitle className="text-lg font-semibold text-slate-900">{judul}</DialogTitle>
            <DialogDescription className="text-sm leading-6 text-slate-600">
              {isi}
            </DialogDescription>
          </DialogHeader>
        </div>
        <div className="flex flex-col gap-2 px-6 pb-6 pt-4">
          <Button
            className="w-full bg-primary text-white hover:bg-primary/90"
            onClick={() => {
              setOpen(false);
              onOpenCta();
            }}
          >
            {cta}
            <ArrowRight className="ml-1.5 size-4" />
          </Button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-xs font-medium text-slate-500 hover:text-slate-700"
          >
            Nanti saja
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FloatingWidget({
  onOpenCta,
  judul,
  isi,
  cta,
  aktif,
  delayDetik,
}: {
  onOpenCta: () => void;
  judul: string;
  isi: string;
  cta: string;
  aktif: boolean;
  delayDetik: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!aktif) return;
    const t = setTimeout(() => setRevealed(true), Math.max(0, delayDetik) * 1000);
    return () => clearTimeout(t);
  }, [aktif, delayDetik]);

  if (!aktif || !revealed) return null;

  return (
    <div
      className="fixed right-4 z-50 flex flex-col items-end gap-3 sm:right-5"
      style={{ bottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
    >
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            className="w-72 overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white p-4 shadow-lg"
            style={{ maxHeight: "min(24rem, calc(100dvh - 7rem))" }}
          >
            <p className="text-sm font-semibold text-slate-900">{judul}</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">{isi}</p>
            <button
              type="button"
              onClick={() => {
                setExpanded(false);
                onOpenCta();
              }}
              className="mt-2.5 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80"
            >
              {cta}
              <ArrowRight className="size-3.5" aria-hidden />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-label={expanded ? "Tutup pengumuman" : "Buka pengumuman"}
        className="inline-flex size-12 items-center justify-center rounded-full bg-primary text-white shadow-lg transition-colors hover:bg-primary/90"
      >
        {expanded ? <X className="size-5" /> : <Megaphone className="size-5" />}
      </button>
    </div>
  );
}

export default function Landing() {
  const cms = useQuery(api.announcements.getPublic);
  const { isAuthenticated, isLoading, user } = useAuth();
  const c = (v: string | undefined, fallback: string) => v ?? fallback;
  const accountHref = isLoading || !isAuthenticated
    ? "/auth"
    : user?.role === "admin"
      ? ADMIN_ROUTE
      : "/dashboard";
  const accountCta = isLoading
    ? "Memuat ruang…"
    : isAuthenticated
      ? "Buka dashboard"
      : c(cms?.heroCta1, CMS_DEFAULTS.hero.cta1);

  const logoTeks = c(cms?.logoTeks, "PINDAI");
  const heroJudul1 = c(cms?.heroJudul, CMS_DEFAULTS.hero.judul1);
  const heroJudul2 = c(cms?.heroJudul2, CMS_DEFAULTS.hero.judul2);

  const navItems = [
    { href: "#pinjaman", label: c(cms?.nav1, "Pinjaman") },
    { href: "#gadai", label: c(cms?.nav2, "Gadai") },
    { href: "#biaya", label: "Biaya" },
    { href: "#kalkulator", label: c(cms?.nav3, "Kalkulator") },
    { href: "#keamanan", label: c(cms?.nav4, "Keamanan") },
    { href: "#tanya", label: "Tanya" },
    { href: "#syarat", label: "Ketentuan" },
  ];

  const [menuOpen, setMenuOpen] = useState(false);
  const [showAdminShortcut, setShowAdminShortcut] = useState(false);
  const headerRef = useRef<HTMLElement | null>(null);

  const [scrolled, setScrolled] = useState(false);

  /* Bilah kemajuan baca di atas + garis langkah yang tumbuh saat digulir. */
  const { scrollY, scrollYProgress } = useScroll();
  useMotionValueEvent(scrollY, "change", (v) => setScrolled(v > 12));
  const progressBar = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 26,
    mass: 0.24,
  });
  const stepsRef = useRef<HTMLOListElement | null>(null);
  const { scrollYProgress: stepsScroll } = useScroll({
    target: stepsRef,
    offset: ["start 0.85", "end 0.5"],
  });
  const stepProgress = useSpring(stepsScroll, {
    stiffness: 110,
    damping: 28,
    mass: 0.3,
  });
  const adminLogoClickCountRef = useRef(0);
  const adminLogoClickTimerRef = useRef<number | null>(null);

  const handleBrandClick = () => {
    if (showAdminShortcut) return;
    if (adminLogoClickTimerRef.current !== null) {
      window.clearTimeout(adminLogoClickTimerRef.current);
    }
    adminLogoClickCountRef.current += 1;

    if (adminLogoClickCountRef.current >= 5) {
      adminLogoClickCountRef.current = 0;
      adminLogoClickTimerRef.current = null;
      setShowAdminShortcut(true);
      if (window.matchMedia("(max-width: 767px)").matches) setMenuOpen(true);
      return;
    }

    adminLogoClickTimerRef.current = window.setTimeout(() => {
      adminLogoClickCountRef.current = 0;
      adminLogoClickTimerRef.current = null;
    }, 3000);
  };

  useEffect(() => {
    return () => {
      if (adminLogoClickTimerRef.current !== null) {
        window.clearTimeout(adminLogoClickTimerRef.current);
      }
    };
  }, []);

  /* Menu mobile: tutup dengan Esc atau klik di luar header. */
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    const onPointer = (e: PointerEvent) => {
      if (!headerRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [menuOpen]);

  const scrollToCalculator = () => {
    document.getElementById("kalkulator")?.scrollIntoView({ behavior: "smooth" });
  };

  const steps = [
    {
      icon: Landmark,
      title: "Isi data",
      body: "Masukkan parameter pinjaman dan informasi pengajuan yang ingin dicatat di akun Anda.",
    },
    {
      icon: ShieldCheck,
      title: "Tinjau rincian",
      body: "Lihat perhitungan biaya, bunga, dan status review internal. Data yang diisi tercatat pada ledger internal.",
    },
    {
      icon: Banknote,
      title: "Pantau ledger",
      body: "Ikuti perubahan status dan riwayat di dashboard. PINDAI mencatat setiap perubahan pada ledger internal.",
    },
  ];

  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* Bilah kemajuan baca */}
      <motion.div
        aria-hidden="true"
        style={{ scaleX: progressBar }}
        className="fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-gradient-to-r from-primary via-primary to-[#b99b62]"
      />

      {/* Navbar */}
      <header
        ref={headerRef}
        className={`sticky top-0 z-40 border-b backdrop-blur transition-[background-color,border-color,box-shadow] duration-300 ${
          scrolled
            ? "border-slate-200 bg-white/95 shadow-[0_10px_30px_-24px_rgba(15,61,58,0.55)]"
            : "border-slate-200/70 bg-white/80"
        }`}
      >
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          {showAdminShortcut && (
            <span className="sr-only" role="status" aria-live="polite">
              Akses panel admin tersedia.
            </span>
          )}
          <Link to="/" onClick={handleBrandClick} className="flex items-center gap-3">
            <VaultLogo size={40} />
            <BrandWordmark name={logoTeks} />
          </Link>
          <nav className="hidden items-center gap-8 text-sm text-slate-600 lg:flex">
            {navItems.map(({ href, label }) => (
              <a
                key={href}
                href={href}
                className="link-underline transition-colors hover:text-slate-900"
              >
                {label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <RoleDashboardMenu />
            {showAdminShortcut && (
              <Button
                asChild
                variant="ghost"
                className="hidden text-slate-600 hover:text-slate-900 lg:inline-flex"
              >
                <Link to={ADMIN_ROUTE}>
                  <ShieldCheck className="size-4" aria-hidden="true" />
                  Admin
                </Link>
              </Button>
            )}
            {!isAuthenticated && (
              <Button
                asChild
                variant="ghost"
                className="hidden text-slate-600 hover:text-slate-900 lg:inline-flex"
              >
                <Link to="/auth">Masuk</Link>
              </Button>
            )}
            <Button
              asChild
              disabled={isLoading}
              className={`bg-primary text-white hover:bg-primary/90 ${isAuthenticated ? "hidden sm:inline-flex" : ""}`}
            >
              <Link to={accountHref}>{isAuthenticated ? "Dashboard" : isLoading ? "Memuat…" : "Daftar"}</Link>
            </Button>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-controls="nav-mobile"
              aria-label={menuOpen ? "Tutup menu navigasi" : "Buka menu navigasi"}
              className="-mr-2 inline-flex size-10 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 lg:hidden"
            >
              {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </div>

        {/* Menu navigasi layar kecil — panel mengambang, tidak menggeser isi halaman */}
        <AnimatePresence initial={false}>
          {menuOpen && (
            <motion.div
              id="nav-mobile"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="absolute inset-x-0 top-full overflow-hidden border-b border-slate-200 bg-white shadow-lg lg:hidden"
            >
              <nav className="grid gap-0.5 px-4 py-3">
                {showAdminShortcut && (
                  <Link
                    to={ADMIN_ROUTE}
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary/5"
                  >
                    <ShieldCheck className="size-4" aria-hidden="true" />
                    Akses admin
                  </Link>
                )}
                {navItems.map(({ href, label }) => (
                  <a
                    key={href}
                    href={href}
                    onClick={() => setMenuOpen(false)}
                    className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900"
                  >
                    {label}
                  </a>
                ))}
                {!isAuthenticated && (
                  <Link
                    to="/auth"
                    onClick={() => setMenuOpen(false)}
                    className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900"
                  >
                    Masuk
                  </Link>
                )}
                <Button
                  asChild
                  className="mt-2 h-11 w-full bg-primary text-white hover:bg-primary/90"
                >
                  <Link to={accountHref} onClick={() => setMenuOpen(false)}>
                    {isAuthenticated ? "Dashboard" : "Daftar"}
                    <ArrowRight className="ml-1.5 size-4" />
                  </Link>
                </Button>
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main>
        {/* Hero — nuansa arsip finansial, tinta dan kertas. */}
        <section className="relative isolate overflow-hidden border-b border-slate-200 bg-[radial-gradient(ellipse_at_18%_0%,#edf4f0_0%,transparent_42%),linear-gradient(135deg,#fbfaf6_0%,#ffffff_52%,#f5f1e8_100%)]">
          <LedgerGrid />
          <GlowField />
          <div aria-hidden="true" className="pointer-events-none absolute -right-32 top-16 size-80 rounded-full border border-primary/10 sm:size-[30rem]" />
          <div aria-hidden="true" className="animate-spin-slow pointer-events-none absolute -right-20 top-28 size-56 rounded-full border border-dashed border-[#b99b62]/25 sm:size-96" />
          <div className="relative mx-auto grid w-full max-w-7xl items-center gap-10 px-4 py-14 sm:gap-12 sm:px-8 sm:py-24 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:py-28">
            <motion.div
              variants={heroContainer}
              initial="hidden"
              animate="show"
              className="relative z-10"
            >
              <motion.span
                variants={heroItem}
                className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-white/80 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary backdrop-blur"
              >
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#b99b62]/70" />
                  <span className="relative inline-flex size-2 rounded-full bg-[#b99b62]" />
                </span>
                {c(cms?.heroBadge, CMS_DEFAULTS.hero.badge)}
              </motion.span>
              <motion.h1
                variants={heroItem}
                className="mt-6 max-w-3xl text-[2.1rem] font-semibold leading-[1.08] tracking-[-0.04em] text-slate-950 min-[480px]:text-[2.65rem] sm:mt-7 sm:leading-[1.04] sm:tracking-[-0.045em] sm:text-6xl lg:text-[4.5rem]"
              >
                {heroJudul1}<br />
                <span className="font-serif font-medium italic text-primary">{heroJudul2}</span>
              </motion.h1>
              <motion.p
                variants={heroItem}
                className="mt-6 max-w-xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8"
              >
                {c(cms?.heroSub, CMS_DEFAULTS.hero.sub)}
              </motion.p>
              <motion.div variants={heroItem} className="mt-8 flex flex-wrap items-center gap-3">
                <Button
                  asChild
                  disabled={isLoading}
                  className="animate-sheen h-12 rounded-full bg-primary px-6 text-white transition-transform hover:-translate-y-0.5 hover:bg-primary/90"
                >
                  <Link to={accountHref}>
                    {accountCta}
                    <ArrowRight className="ml-2 size-4" />
                  </Link>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={scrollToCalculator}
                  className="group h-12 rounded-full border-slate-300 bg-white/70 px-6 text-slate-700 hover:bg-white"
                >
                  Lihat kalkulator
                  <ArrowRight className="ml-2 size-4 transition-transform group-hover:translate-x-0.5" />
                </Button>
              </motion.div>
              <motion.div
                variants={heroItem}
                className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-slate-300/70 pt-5 text-xs font-medium text-slate-600 sm:text-sm"
              >
                <span className="flex items-center gap-2"><BadgeCheck className="size-4 text-primary" />Rincian biaya terbuka</span>
                <span className="flex items-center gap-2"><Lock className="size-4 text-primary" />Riwayat per akun</span>
                <span className="flex items-center gap-2"><Calculator className="size-4 text-primary" />Angka kalkulator</span>
              </motion.div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 24, rotate: 1.5 }}
              animate={{ opacity: 1, y: 0, rotate: 0 }}
              transition={{ duration: 0.7, delay: 0.12, ease: EASE_OUT }}
              whileHover={{ y: -4 }}
              className="relative mx-auto w-full max-w-lg"
            >
              <div className="absolute -inset-3 rounded-[2rem] border border-[#b99b62]/35" aria-hidden="true" />
              <div
                aria-hidden="true"
                className="animate-spin-slow pointer-events-none absolute -right-8 -top-10 size-32 rounded-full border border-dashed border-[#b99b62]/30"
              />
              <div className="relative overflow-hidden rounded-[1.75rem] bg-[#0f3d3a] p-5 text-[#f7f4ec] sm:p-8">
                <div className="absolute -right-16 -top-24 size-64 rounded-full border border-white/10" aria-hidden="true" />
                <div className="absolute -right-6 -top-14 size-44 rounded-full border border-[#cbb47e]/20" aria-hidden="true" />
                <div className="relative">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                    <div className="flex min-w-0 items-center gap-3">
                      <VaultLogo size={46} />
                      <div className="min-w-0">
                        <p className="truncate text-[10px] font-semibold uppercase tracking-[0.2em] text-white/55">Ruang catatan PINDAI</p>
                        <p className="mt-1 text-sm font-semibold">{c(cms?.chip1Label, CMS_DEFAULTS.chips.chip1.label)}</p>
                      </div>
                    </div>
                    <span className="rounded-full border border-[#d8c28c]/35 bg-[#d8c28c]/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#e6d3a5]">Kalkulator</span>
                  </div>
                  <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.07] p-4 backdrop-blur-sm sm:mt-8 sm:p-6">
                    <p className="text-xs text-white/60">{c(cms?.chip2Label, CMS_DEFAULTS.chips.chip2.label)}</p>
                    <p className="mt-1 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{c(cms?.chip2Nilai, CMS_DEFAULTS.chips.chip2.nilai)}</p>
                    <div className="mt-4 grid grid-cols-2 gap-2.5 sm:mt-5 sm:gap-3">
                      <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                        <p className="text-[10px] uppercase tracking-[0.13em] text-white/50">Hitung biaya</p>
                        <p className="mt-1 text-sm font-medium">Terbuka di awal</p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                        <p className="text-[10px] uppercase tracking-[0.13em] text-white/50">Status</p>
                        <p className="mt-1 text-sm font-medium">Catatan internal</p>
                      </div>
                    </div>
                  </div>
                  <motion.ul
                    initial="hidden"
                    animate="show"
                    variants={{ hidden: {}, show: { transition: { staggerChildren: 0.12, delayChildren: 0.55 } } }}
                    className="mt-4 space-y-2"
                  >
                    {[
                      ["Biaya tenor", "dipotong di muka"],
                      ["Bunga", "flat dari pokok penuh"],
                      ["Status", "catatan ledger internal"],
                    ].map(([label, value]) => (
                      <motion.li
                        key={label}
                        variants={{
                          hidden: { opacity: 0, x: -10 },
                          show: { opacity: 1, x: 0, transition: { duration: 0.45, ease: EASE_OUT } },
                        }}
                        className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/10 px-3.5 py-2 text-xs"
                      >
                        <span className="text-white/55">{label}</span>
                        <span className="font-medium text-white/85">{value}</span>
                      </motion.li>
                    ))}
                  </motion.ul>
                  <div className="mt-5 flex items-start gap-3 border-t border-white/15 pt-4">
                    <Eye className="mt-0.5 size-4 shrink-0 text-[#d8c28c]" />
                    <p className="text-xs leading-5 text-white/65">Tercatat pada ledger internal PINDAI.</p>
                  </div>
                </div>
              </div>
              <motion.div
                animate={{ y: [0, -5, 0] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                className="absolute -bottom-5 -left-2 flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 sm:-left-7"
              >
                <ShieldCheck className="size-4 text-primary" /> Transparan sejak awal
              </motion.div>
            </motion.div>
          </div>
          <FactRibbon />
        </section>

        {/* Layanan */}
        <section className="relative border-t border-slate-200 bg-slate-50/60">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <Reveal className="max-w-2xl">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9c7b3a]">
                Tiga skema
              </span>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                {c(cms?.layananJudul, CMS_DEFAULTS.layanan.judul)}
              </h2>
              <p className="mt-3 text-base leading-7 text-slate-600">
                {c(cms?.layananSub, CMS_DEFAULTS.layanan.sub)}
              </p>
            </Reveal>

            <div className="mt-8 grid gap-5 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
              <motion.article
                id="pinjaman"
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.25 }}
                transition={{ duration: 0.45 }}
                className="card-lift group flex scroll-mt-24 flex-col rounded-2xl border border-slate-200 bg-white p-6 sm:p-7"
              >
                <span className="clay-icon-blue inline-flex size-10 items-center justify-center transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110">
                  <Banknote className="size-5" strokeWidth={2} />
                </span>
                <h3 className="mt-4 text-lg font-semibold">
                  {c(cms?.pinjamanJudul, CMS_DEFAULTS.layanan.pinjamanJudul)}
                </h3>
                <p className="mt-2 flex-1 text-sm leading-6 text-slate-600">
                  {c(cms?.pinjamanIsi, CMS_DEFAULTS.layanan.pinjamanIsi)}
                </p>
                <Button asChild variant="link" className="mt-4 self-start px-0 text-primary">
                  <Link to={accountHref}>
                    {isAuthenticated ? "Buka dashboard" : c(cms?.pinjamanCta, CMS_DEFAULTS.layanan.pinjamanCta)}
                    <ArrowRight className="ml-1 size-4 transition-transform group-hover:translate-x-1" />
                  </Link>
                </Button>
              </motion.article>

              <motion.article
                id="gadai"
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.25 }}
                transition={{ duration: 0.45, delay: 0.1 }}
                className="card-lift group flex scroll-mt-24 flex-col rounded-2xl border border-slate-200 bg-white p-6 sm:p-7"
              >
                <span className="clay-icon-mint inline-flex size-10 items-center justify-center transition-transform duration-300 group-hover:rotate-6 group-hover:scale-110">
                  <Package className="size-5" strokeWidth={2} />
                </span>
                <h3 className="mt-4 text-lg font-semibold">
                  {c(cms?.gadaiJudul, CMS_DEFAULTS.layanan.gadaiJudul)}
                </h3>
                <p className="mt-2 flex-1 text-sm leading-6 text-slate-600">
                  {c(cms?.gadaiIsi, CMS_DEFAULTS.layanan.gadaiIsi)}
                </p>
                <Button asChild variant="link" className="mt-4 self-start px-0 text-primary">
                  <Link to={accountHref}>
                    {isAuthenticated ? "Buka dashboard" : c(cms?.gadaiCta, CMS_DEFAULTS.layanan.gadaiCta)}
                    <ArrowRight className="ml-1 size-4 transition-transform group-hover:translate-x-1" />
                  </Link>
                </Button>
              </motion.article>

              <motion.article
                id="kredit"
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.25 }}
                transition={{ duration: 0.45, delay: 0.2 }}
                className="card-lift group flex scroll-mt-24 flex-col rounded-2xl border border-slate-200 bg-white p-6 sm:p-7"
              >
                <span className="clay-icon-blue inline-flex size-10 items-center justify-center transition-transform duration-300 group-hover:scale-110">
                  <Wallet className="size-5" strokeWidth={2} />
                </span>
                <h3 className="mt-4 text-lg font-semibold">Kredit barang</h3>
                <p className="mt-2 flex-1 text-sm leading-6 text-slate-600">
                  Barang elektronik dan marketplace mitra dengan DP 0%, tenor 1/3/6 bulan, biaya admin 2% + platform 3% dipotong di muka, dan cicilan rata dari pokok penuh.
                </p>
                <Button asChild variant="link" className="mt-4 self-start px-0 text-primary">
                  <Link to={accountHref}>
                    {isAuthenticated ? "Buka dashboard" : "Ajukan kredit barang"}
                    <ArrowRight className="ml-1 size-4 transition-transform group-hover:translate-x-1" />
                  </Link>
                </Button>
              </motion.article>
            </div>
          </div>
        </section>

        {/* Pratinjau catatan ledger */}
        <section className="relative overflow-hidden border-t border-slate-200">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-8 px-4 py-16 sm:gap-10 sm:px-6 sm:py-20 lg:grid-cols-2 lg:gap-16">
            <Reveal>
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9c7b3a]">
                Catatan internal
              </span>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                Catatan yang bisa Anda periksa
              </h2>
              <p className="mt-3 text-base leading-7 text-slate-600">
                Setiap pengajuan menyimpan parameter yang dipakai menghitung angkanya — nominal, tenor, biaya, dan status. Tidak ada kolom tersembunyi, dan tidak ada perpindahan dana di dalam aplikasi.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  "Parameter perhitungan berasal dari data pengajuan yang tersimpan",
                  "Riwayat pengajuan hanya dapat dibuka oleh akun terkait",
                  "Perubahan status oleh tim PINDAI tercatat pada audit log",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm leading-6 text-slate-600">
                    <BadgeCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </Reveal>

            <Reveal delay={0.12}>
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_40px_-32px_rgba(15,61,58,0.5)]">
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/80 px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Contoh catatan
                  </p>
                  <span className="inline-flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">
                    <span className="relative flex size-2">
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/60" />
                      <span className="relative inline-flex size-2 rounded-full bg-primary" />
                    </span>
                    Ledger internal
                  </span>
                </div>
                <ul>
                  {CATATAN_CONTOH.map((row, i) => (
                    <motion.li
                      key={row.label}
                      initial={{ opacity: 0, y: 10 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, amount: 0.6 }}
                      transition={{ duration: 0.4, delay: i * 0.08, ease: EASE_OUT }}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2 border-b border-slate-100 px-4 py-3 last:border-b-0 sm:gap-3"
                    >
                      <span className="text-xs text-slate-500">{row.label}</span>
                      <span className="text-right text-xs font-semibold tabular-nums text-slate-800">
                        {row.value}
                      </span>
                    </motion.li>
                  ))}
                </ul>
                <p className="border-t border-slate-100 bg-slate-50/60 px-4 py-3 text-[11px] leading-5 text-slate-500">
                  Contoh ilustrasi tampilan. Angka sebenarnya dihitung aplikasi dari data pengajuan Anda dan bukan tagihan atau bukti pembayaran.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* Rincian biaya — angka terbuka sejak awal. */}
        <section
          id="biaya"
          className="relative scroll-mt-24 overflow-hidden border-t border-slate-200 bg-slate-50/60"
        >
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <Reveal className="max-w-2xl">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9c7b3a]">
                Rincian biaya
              </span>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                Angka terbuka sejak awal
              </h2>
              <p className="mt-3 text-base leading-7 text-slate-600">
                Setiap potongan dihitung aplikasi dari nominal dan tenor yang Anda pilih. Tidak ada biaya tersembunyi — dan perpindahan dana tetap ditangani di luar aplikasi.
              </p>
            </Reveal>

            <div className="mt-8 grid gap-5 sm:mt-10 sm:gap-6 lg:grid-cols-2">
              <SchemeCard
                badge="Skema harian"
                title="7–30 hari · Rp 100 rb–1 jt"
                body="Cocok untuk kebutuhan jangka pendek. Satu kali pelunasan pada akhir tenor dan semua potongan terlihat sejak awal."
                rows={[
                  { label: "Biaya admin 2% + platform 3%", value: "5% dari pokok" },
                  { label: "Nilai bersih diterima", value: "95% dari pokok" },
                  { label: "Bunga flat", value: "30% dari pokok" },
                ]}
                stats={[
                  { to: 5, suffix: "%", label: "potongan di muka" },
                  { to: 30, suffix: "%", label: "bunga" },
                  { to: 130, suffix: "%", label: "total kewajiban" },
                ]}
              />
              <SchemeCard
                delay={0.12}
                badge="Skema bulanan"
                title="1/3/6 bulan · hingga Rp 10 jt"
                body="Cicilan rata dari pokok penuh: angsurannya berisi pokok dan bunga saja, karena biaya tenor dipotong di muka."
                rows={[
                  { label: "Biaya admin 2% + platform 3%", value: "5% dipotong di muka" },
                  { label: "Biaya admin cicilan (tenor 3 & 6)", value: "2% per bayar" },
                  { label: "Bunga flat per bulan (1/3/6 bulan)", value: "30% / 25% / 20%" },
                ]}
                stats={[
                  { to: 5, suffix: "%", label: "biaya di muka" },
                  { to: 25, suffix: "%", label: "bunga tenor 3" },
                  { to: 2, suffix: "%", label: "admin cicilan 3/6" },
                ]}
              />
            </div>

            <Reveal delay={0.1} className="mt-6">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-xs leading-5 text-slate-600">
                <Sparkles className="size-4 shrink-0 text-[#b99b62]" aria-hidden="true" />
                Kredit barang memakai tenor 1/3/6 bulan dengan pola biaya yang sama; seluruh angka pada halaman ini adalah perhitungan ledger internal PINDAI, bukan tagihan atau bukti pembayaran.
              </p>
            </Reveal>
          </div>
        </section>

        {/* Kalkulator + langkah */}
        <section id="kalkulator" className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 py-16 sm:px-6 sm:py-20">
          <div className="grid gap-10 lg:grid-cols-2">
            <Reveal>
              <LiveCalculator />
            </Reveal>
            <div>
              <Reveal>
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9c7b3a]">
                  Alur pengajuan
                </span>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                  Tiga langkah
                </h2>
                <p className="mt-3 text-base leading-7 text-slate-600">
                  Proses ringkas dengan angka yang sama seperti yang Anda lihat di kalkulator.
                </p>
              </Reveal>
              <div className="relative mt-8">
                <div aria-hidden="true" className="absolute bottom-3 left-5 top-3 w-px bg-slate-200" />
                <motion.div
                  aria-hidden="true"
                  style={{ scaleY: stepProgress }}
                  className="absolute bottom-3 left-5 top-3 w-px origin-top bg-primary"
                />
                <ol ref={stepsRef} className="space-y-6">
                  {steps.map(({ icon: Icon, title, body }, i) => (
                    <motion.li
                      key={title}
                      initial={{ opacity: 0, x: -14 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true, amount: 0.5 }}
                      transition={{ duration: 0.45, delay: i * 0.08, ease: EASE_OUT }}
                      className="relative flex gap-4"
                    >
                      <span className="relative z-10 flex size-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-primary shadow-sm">
                        <Icon className="size-5" strokeWidth={2} />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          <span className="mr-1.5 text-slate-400">0{i + 1}</span>
                          {title}
                        </p>
                        <p className="mt-1 text-sm leading-6 text-slate-600">{body}</p>
                      </div>
                    </motion.li>
                  ))}
                </ol>
              </div>
              <Reveal delay={0.1}>
                <p className="mt-8 rounded-xl bg-slate-50 p-4 text-xs leading-5 text-slate-600">
                  Seluruh angka berikut adalah <b className="font-semibold text-slate-900">perhitungan ledger internal</b> dari pencatatan PINDAI. Skema harian menghitung nilai bersih 95% dan total kewajiban 130%; perpindahan dana ditangani di luar aplikasi. Skema bulanan (1/3/6 bulan, hingga Rp 10 juta) menampilkan DP 0%, biaya admin 2% + platform 3% untuk tenor 3/6 bulan (atau biaya layanan 3% untuk tenor 1 bulan) yang dipotong di muka dari dana yang diterima, sehingga cicilan berisi pokok dan bunga saja; bunga flat dari pokok penuh sebesar 30% per bulan (tenor 1 bulan), 25% (tenor 3 bulan), dan 20% (tenor 6 bulan), jadi cicilannya rata dan tidak menurun. Status dan rincian kontrak mengikuti pencatatan pada ledger internal.
                </p>
              </Reveal>
            </div>
          </div>
        </section>

        {/* Keamanan */}
        <section id="keamanan" className="relative scroll-mt-24 border-t border-slate-200 bg-slate-50/60">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <Reveal className="max-w-2xl">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9c7b3a]">
                Batas yang jelas
              </span>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                Pencatatan &amp; batas ledger
              </h2>
              <p className="mt-3 text-base leading-7 text-slate-600">
                Ketahui apa yang dicatat aplikasi dan apa yang tidak dijalankan secara eksternal.
              </p>
            </Reveal>
            <motion.div
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, amount: 0.2 }}
              variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
              className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 sm:mt-10 sm:grid-cols-2 lg:grid-cols-3"
            >
              {SECURITY.map(({ icon: Icon, label }) => (
                <motion.div
                  key={label}
                  variants={{
                    hidden: { opacity: 0, y: 10 },
                    show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE_OUT } },
                  }}
                  className="group flex items-center gap-3 bg-white p-5 transition-colors hover:bg-primary/[0.03]"
                >
                  <Icon
                    className="size-5 shrink-0 text-primary transition-transform duration-300 group-hover:scale-110"
                    strokeWidth={2}
                  />
                  <span className="text-sm font-medium text-slate-700">{label}</span>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* Tanya jawab */}
        <section id="tanya" className="relative scroll-mt-24 border-t border-slate-200">
          <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
            <Reveal>
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9c7b3a]">
                Tanya jawab
              </span>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                Pertanyaan yang sering muncul
              </h2>
              <p className="mt-3 text-base leading-7 text-slate-600">
                Jawaban singkat tentang apa yang dihitung, dicatat, dan tidak dijalankan aplikasi.
              </p>
            </Reveal>
            <Reveal delay={0.08} className="mt-8">
              <Accordion
                type="single"
                collapsible
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
              >
                {FAQ_ITEMS.map((item) => (
                  <AccordionItem key={item.q} value={item.q} className="px-4 last:border-b-0 sm:px-6">
                    <AccordionTrigger className="text-left text-sm font-semibold text-slate-900 hover:text-primary hover:no-underline">
                      {item.q}
                    </AccordionTrigger>
                    <AccordionContent className="text-sm leading-6 text-slate-600">
                      {item.a}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </Reveal>
          </div>
        </section>

        {/* Syarat & Ketentuan singkat */}
        <section id="syarat" className="relative scroll-mt-24 border-t border-slate-200 bg-slate-50/60">
          <div className="mx-auto w-full max-w-4xl px-4 py-16 sm:px-6 sm:py-20">
            <Reveal>
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9c7b3a]">
                Syarat &amp; Ketentuan
              </span>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                Ketentuan singkat sebelum mengajukan
              </h2>
              <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
                Rangkuman poin terpenting. Versi lengkap dan mengikat ada di halaman Syarat &amp;
                Ketentuan.
              </p>
            </Reveal>

            <Reveal delay={0.08} className="mt-8">
              <div className="grid gap-4 sm:grid-cols-2">
                {RINGKASAN_SYARAT.map((item) => (
                  <div
                    key={item.judul}
                    className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-4"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <item.Icon className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{item.judul}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-600">{item.isi}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4">
                <p className="text-xs text-slate-500">
                  Berlaku versi {CONTRACT_TERMS_VERSION}. Dengan melanjutkan, Anda menyetujui
                  ketentuan ini.
                </p>
                <Button asChild className="h-10">
                  <Link to="/syarat-ketentuan">
                    Baca selengkapnya
                    <ArrowRight className="ml-2 size-4" aria-hidden />
                  </Link>
                </Button>
              </div>
            </Reveal>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <motion.div
            initial={{ opacity: 0, y: 26 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.6, ease: EASE_OUT }}
            className="relative isolate overflow-hidden rounded-[1.75rem] bg-[#0f3d3a] px-5 py-12 text-center sm:px-12 sm:py-14"
          >
            <div aria-hidden="true" className="animate-drift pointer-events-none absolute -left-24 -top-24 size-72 rounded-full bg-[#cbb47e]/25 blur-3xl" />
            <div aria-hidden="true" className="animate-drift-reverse pointer-events-none absolute -bottom-28 -right-20 size-80 rounded-full bg-white/10 blur-3xl" />
            <div aria-hidden="true" className="animate-spin-slow pointer-events-none absolute -right-16 -top-16 size-64 rounded-full border border-dashed border-white/15" />
            <div className="relative">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#d8c28c]/35 bg-[#d8c28c]/10 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#e6d3a5]">
                <Sparkles className="size-3.5" aria-hidden="true" />
                Rincian biaya terbuka sejak awal
              </span>
              <h2 className="mt-6 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                Mulai hari ini
              </h2>
              <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-primary-foreground/80">
                Buat akun untuk mencatat pengajuan pinjaman atau gadai. Perpindahan dana ditangani di luar aplikasi.
              </p>
              <div className="mt-7 flex flex-wrap justify-center gap-3">
                <Button
                  asChild
                  className="animate-sheen h-11 border-0 bg-white px-6 text-primary transition-transform hover:-translate-y-0.5 hover:bg-secondary"
                >
                  <Link to={accountHref}>{isAuthenticated ? "Buka dashboard" : "Buka akun"}</Link>
                </Button>
                {!isAuthenticated && (
                  <Button
                    asChild
                    className="h-11 border border-white/40 bg-transparent px-6 text-white hover:bg-white/10"
                  >
                    <a href="#biaya">Lihat rincian biaya</a>
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
          <div className="grid gap-8 sm:grid-cols-3">
            <div>
              <div className="flex items-center gap-3">
                <VaultLogo size={36} />
                <BrandWordmark name={logoTeks} compact />
              </div>
              <p className="mt-3 max-w-xs text-xs leading-5 text-slate-500">
                PINDAI adalah aplikasi pencatatan pinjaman, gadai, dan alokasi ledger internal.
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Produk
              </p>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                <li>
                  <a href="#pinjaman" className="link-underline hover:text-slate-900">
                    Pinjaman Tunai
                  </a>
                </li>
                <li>
                  <a href="#gadai" className="link-underline hover:text-slate-900">
                    Gadai Digital
                  </a>
                </li>
                <li>
                  <a href="#kredit" className="link-underline hover:text-slate-900">
                    Kredit Barang
                  </a>
                </li>
                <li>
                  <a href="#biaya" className="link-underline hover:text-slate-900">
                    Rincian Biaya
                  </a>
                </li>
                <li>
                  <a href="#kalkulator" className="link-underline hover:text-slate-900">
                    Kalkulator
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Sistem
              </p>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                <li>
                  <a href="#keamanan" className="link-underline hover:text-slate-900">
                    Keamanan
                  </a>
                </li>
                <li>
                  <a href="#tanya" className="link-underline hover:text-slate-900">
                    Tanya Jawab
                  </a>
                </li>
                <li>
                  <Link to="/syarat-ketentuan" className="link-underline hover:text-slate-900">
                    Syarat &amp; Ketentuan
                  </Link>
                </li>
                <li className="flex items-center gap-2">
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-sky-400 opacity-70" />
                    <span className="relative inline-flex size-2 rounded-full bg-sky-500" />
                  </span>
                  <span className="text-slate-500">Perhitungan ledger internal</span>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-8 flex flex-col items-center justify-between gap-2 border-t border-slate-200 pt-6 text-xs text-slate-500 sm:flex-row">
            <span>© 2026 {logoTeks}. Seluruh hak cipta.</span>
            <span>Perhitungan transparan · Status ledger internal</span>
          </div>
        </div>
      </footer>

      <AnnouncementModal
        onOpenCta={scrollToCalculator}
        judul={c(cms?.popupJudul, CMS_DEFAULTS.popup.judul)}
        isi={c(cms?.popupIsi, CMS_DEFAULTS.popup.isi)}
        cta={c(cms?.popupCta, CMS_DEFAULTS.popup.cta)}
        aktif={cms?.popupAktif ?? true}
      />
      <FloatingWidget
        onOpenCta={scrollToCalculator}
        judul={c(cms?.floatJudul, CMS_DEFAULTS.float.judul)}
        isi={c(cms?.floatIsi, CMS_DEFAULTS.float.isi)}
        cta={c(cms?.floatCta, CMS_DEFAULTS.float.cta)}
        aktif={cms?.floatAktif ?? true}
        delayDetik={cms?.floatDelayDetik ?? 6}
      />
    </div>
  );
}
