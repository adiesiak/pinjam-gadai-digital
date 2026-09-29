import { useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
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
  Scale,
  ShieldCheck,
  Vault,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";

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
import { CMS_DEFAULTS } from "@/lib/cms-defaults";
import {
  BULANAN_LIMITS,
  hitungSimulasiBulanan,
  TENOR_BULANAN_OPTIONS,
} from "@/lib/bulanan";
import { LOAN_LIMITS, quoteLoan, TENOR_OPTIONS, type LoanQuote } from "@/lib/loan";
import { formatRupiah, type Rupiah } from "@/lib/money";
import { PLAFON_BATAS } from "@/lib/plafon";
import { ADMIN_ROUTE } from "@/lib/routes";

/* Logo brankas — sederhana, dua warna. */
function VaultLogo({ size = 36 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
    >
      <rect x="8" y="10" width="48" height="44" rx="10" fill="#0f3d3a" />
      <rect x="16" y="18" width="32" height="28" rx="6" fill="#ffffff" />
      <circle cx="32" cy="32" r="7" fill="#0f3d3a" />
      <circle cx="32" cy="32" r="2.4" fill="#ffffff" />
      <rect x="16" y="54" width="8" height="4" rx="2" fill="#0b2d2a" />
      <rect x="40" y="54" width="8" height="4" rx="2" fill="#0b2d2a" />
    </svg>
  );
}

const SECURITY = [
  { icon: Lock, label: "Riwayat pengajuan hanya untuk akun terkait" },
  { icon: Scale, label: "Rincian biaya dan bunga ditampilkan terpisah" },
  { icon: Vault, label: "Status gadai bukan bukti penitipan fisik" },
  { icon: ShieldCheck, label: "Persetujuan aplikasi bukan jaminan pendanaan" },
  { icon: Calculator, label: "Angka merupakan perhitungan simulasi" },
  { icon: Eye, label: "Status dashboard adalah catatan internal" },
] as const;

// Skema harian: Rp 100 rb–1 jt / maks 30 hari. Skema bulanan: sampai plafon
// tertinggi yang boleh disimpan admin (Rp 10 jt) dengan tenor 1/3/6 bulan
// (DP 0%, biaya layanan 3% diamortisasi, bunga menurun). Angka di bawah ini
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

  const gantiSkema = (next: "harian" | "bulanan") => {
    setSkema(next);
    setAmount((a) =>
      next === "bulanan"
        ? Math.min(Math.max(a, BULANAN_LIMITS.minPokok), MAX_SLIDER_BULANAN)
        : Math.min(Math.max(a, MIN_SLIDER), MAX_SLIDER),
    );
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
      <div className="flex items-center gap-2.5">
        <span className="clay-icon-blue inline-flex size-9 items-center justify-center">
          <Calculator className="size-4" strokeWidth={2} />
        </span>
        <h3 className="text-base font-semibold text-slate-900">Simulasi pinjaman</h3>
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
            className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
              skema === nilai
                ? "bg-white text-primary shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        <div className="flex items-baseline justify-between">
          <label htmlFor="calc-nominal" className="text-sm font-medium text-slate-700">
            Nominal
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
        <div className="mt-3 flex flex-wrap gap-2">
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
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    tenorBulan === t
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {t} bulan
                </button>
              ))
            : TENOR_OPTIONS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTenor(t)}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    tenor === t
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {t} hari
                </button>
              ))}
        </div>
      </div>

      <dl className="mt-6 space-y-2 border-t border-slate-200 pt-5 text-sm">
        {(
          sim !== null
            ? ([
                [
                  `Bunga ${sim.persenBungaPerBulan}%/bulan (menurun)`,
                  formatRupiah(sim.bungaTotal),
                  false,
                ],
                ["Biaya layanan 3% (diamortisasi)", formatRupiah(sim.biayaLayananTotal), false],
                ["Pokok perhitungan (DP 0%)", formatRupiah(sim.pokokDibiayai), true],
                [
                  `Cicilan per bulan (${sim.tenorBulan} bulan)`,
                  formatRupiah(sim.cicilanPerBulan),
                  true,
                ],
              ] as Array<[string, string, boolean?]>)
            : ([
                ["Bunga simulasi (30%)", formatRupiah(quote.bunga), false],
                ["Nilai bersih simulasi (95%; tidak ditransfer)", formatRupiah(quote.danaBersihDitransfer), true],
              ] as Array<[string, string, boolean?]>)
        ).map(([term, value, strong]) => (
          <div key={term} className="flex items-baseline justify-between gap-4">
            <dt className={strong ? "font-medium text-slate-900" : "text-slate-500"}>{term}</dt>
            <dd
              className={`tabular-nums ${
                strong ? "font-semibold text-slate-900" : "font-medium text-slate-700"
              }`}
            >
              {value}
            </dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-4 border-t border-slate-200 pt-2.5">
          <dt className="font-semibold text-slate-900">Total pelunasan simulasi</dt>
          <dd className="text-base font-semibold tabular-nums text-slate-900">
            {formatRupiah(sim !== null ? sim.totalPengembalian : quote.totalKewajibanPelunasan)}
          </dd>
        </div>
      </dl>

      <p className="mt-4 text-xs leading-5 text-slate-500">
        Ini simulasi perhitungan, bukan persetujuan atau pencairan dana. Skema bulanan menampilkan ilustrasi angsuran; pencatatan pelunasan di sistem dilakukan sekaligus saat jatuh tempo. Tidak ada transfer bank/e-wallet atau pembayaran eksternal.
      </p>

      <Button asChild className="mt-5 h-11 w-full bg-primary text-white hover:bg-primary/90">
        <Link to="/auth">
          Buka simulasi di akun
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
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            className="w-72 rounded-2xl border border-slate-200 bg-white p-4 shadow-lg"
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
  const c = (v: string | undefined, fallback: string) => v ?? fallback;

  const logoTeks = c(cms?.logoTeks, "PINDAI");
  const heroJudul1 = c(cms?.heroJudul, CMS_DEFAULTS.hero.judul1);
  const heroJudul2 = c(cms?.heroJudul2, CMS_DEFAULTS.hero.judul2);

  const navItems = [
    { href: "#pinjaman", label: c(cms?.nav1, "Pinjaman") },
    { href: "#gadai", label: c(cms?.nav2, "Gadai") },
    { href: "#simulasi", label: c(cms?.nav3, "Simulasi") },
    { href: "#keamanan", label: c(cms?.nav4, "Keamanan") },
  ];

  const [menuOpen, setMenuOpen] = useState(false);
  const [showAdminShortcut, setShowAdminShortcut] = useState(false);
  const headerRef = useRef<HTMLElement | null>(null);
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
    document.getElementById("simulasi")?.scrollIntoView({ behavior: "smooth" });
  };

  const steps = [
    {
      icon: Landmark,
      title: "Isi data",
      body: "Masukkan parameter simulasi dan informasi pengajuan yang ingin dicatat di akun Anda.",
    },
    {
      icon: ShieldCheck,
      title: "Tinjau rincian",
      body: "Lihat perhitungan biaya, bunga, dan status review internal. Data yang diisi bukan verifikasi identitas atau pemeriksaan fisik.",
    },
    {
      icon: Banknote,
      title: "Pantau ledger",
      body: "Ikuti perubahan status dan riwayat di dashboard. PINDAI tidak mengirim dana atau menyimpan barang.",
    },
  ];

  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* Navbar */}
      <header
        ref={headerRef}
        className="sticky top-0 z-40 border-b border-slate-200 bg-white/85 backdrop-blur"
      >
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
          {showAdminShortcut && (
            <span className="sr-only" role="status" aria-live="polite">
              Akses panel admin tersedia.
            </span>
          )}
          <Link to="/" onClick={handleBrandClick} className="flex items-center gap-2.5">
            <VaultLogo size={32} />
            <span className="text-base font-semibold tracking-tight">{logoTeks}</span>
          </Link>
          <nav className="hidden items-center gap-8 text-sm text-slate-600 md:flex">
            {navItems.map(({ href, label }) => (
              <a key={href} href={href} className="transition-colors hover:text-slate-900">
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
                className="hidden text-slate-600 hover:text-slate-900 md:inline-flex"
              >
                <Link to={ADMIN_ROUTE}>
                  <ShieldCheck className="size-4" aria-hidden="true" />
                  Admin
                </Link>
              </Button>
            )}
            <Button
              asChild
              variant="ghost"
              className="hidden text-slate-600 hover:text-slate-900 md:inline-flex"
            >
              <Link to="/auth">Masuk</Link>
            </Button>
            <Button asChild className="bg-primary text-white hover:bg-primary/90">
              <Link to="/auth">Daftar</Link>
            </Button>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-controls="nav-mobile"
              aria-label={menuOpen ? "Tutup menu navigasi" : "Buka menu navigasi"}
              className="-mr-2 inline-flex size-10 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 md:hidden"
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
              className="absolute inset-x-0 top-full overflow-hidden border-b border-slate-200 bg-white shadow-lg md:hidden"
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
                <Link
                  to="/auth"
                  onClick={() => setMenuOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900"
                >
                  Masuk
                </Link>
                <Button
                  asChild
                  className="mt-2 h-11 w-full bg-primary text-white hover:bg-primary/90"
                >
                  <Link to="/auth" onClick={() => setMenuOpen(false)}>
                    Daftar
                    <ArrowRight className="ml-1.5 size-4" />
                  </Link>
                </Button>
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto w-full max-w-6xl px-6 pb-20 pt-16 sm:pt-24">
          <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                <ShieldCheck className="size-3.5 text-primary" />
                {c(cms?.heroBadge, CMS_DEFAULTS.hero.badge)}
              </span>
              <h1 className="mt-6 text-4xl font-semibold leading-[1.1] tracking-tight text-slate-900 sm:text-5xl">
                {heroJudul1} <span className="text-primary">{heroJudul2}</span>
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-slate-600">
                {c(cms?.heroSub, CMS_DEFAULTS.hero.sub)}
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button
                  asChild
                  className="h-11 bg-primary px-6 text-white hover:bg-primary/90"
                >
                  <Link to="/auth">
                    {c(cms?.heroCta1, CMS_DEFAULTS.hero.cta1)}
                    <ArrowRight className="ml-1.5 size-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="h-11 border-slate-200 px-6 text-slate-700"
                >
                  <Link to="/auth">{c(cms?.heroCta2, CMS_DEFAULTS.hero.cta2)}</Link>
                </Button>
              </div>
              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-500">
                <li className="flex items-center gap-1.5">
                  <BadgeCheck className="size-4 text-primary" /> Rincian biaya terbuka
                </li>
                <li className="flex items-center gap-1.5">
                  <Lock className="size-4 text-primary" /> Riwayat per akun
                </li>
                <li className="flex items-center gap-1.5">
                  <Calculator className="size-4 text-primary" /> Ledger simulasi internal
                </li>
              </ul>
            </div>

            {/* Sorotan produk — pengganti ilustrasi berat */}
            <div className="card-lift rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              <div className="flex items-center gap-3">
                <VaultLogo size={44} />
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {c(cms?.chip1Label, CMS_DEFAULTS.chips.chip1.label)}
                  </p>
                  <p className="text-2xl font-semibold tracking-tight text-primary">
                    {c(cms?.chip1Nilai, CMS_DEFAULTS.chips.chip1.nilai)}
                  </p>
                </div>
              </div>
              <dl className="mt-6 divide-y divide-slate-200 border-t border-slate-200">
                {[
                  ["Tenor pinjaman", "7–30 hari (harian) · 1–6 bulan (bulanan)"],
                  [
                    c(cms?.chip2Label, CMS_DEFAULTS.chips.chip2.label),
                    c(cms?.chip2Nilai, CMS_DEFAULTS.chips.chip2.nilai),
                  ],
                  ["Taksiran gadai", "Catatan internal"],
                  ["Status transaksi", "Riwayat di dashboard"],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between py-3 text-sm">
                    <dt className="text-slate-500">{k}</dt>
                    <dd className="font-medium tabular-nums text-slate-900">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 text-xs leading-5 text-slate-500">
                Semua angka dan status di aplikasi merupakan catatan simulasi; bukan bukti transfer, pembayaran, atau penitipan barang.
              </p>
            </div>
          </div>
        </section>

        {/* Layanan */}
        <section className="border-t border-slate-200 bg-slate-50/60">
          <div className="mx-auto w-full max-w-6xl px-6 py-20">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {c(cms?.layananJudul, CMS_DEFAULTS.layanan.judul)}
              </h2>
              <p className="mt-3 text-base leading-7 text-slate-600">
                {c(cms?.layananSub, CMS_DEFAULTS.layanan.sub)}
              </p>
            </div>

            <div className="mt-10 grid gap-6 md:grid-cols-2">
              <article
                id="pinjaman"
                className="card-lift flex scroll-mt-24 flex-col rounded-2xl border border-slate-200 bg-white p-7 shadow-sm"
              >
                <span className="clay-icon-blue inline-flex size-10 items-center justify-center">
                  <Banknote className="size-5" strokeWidth={2} />
                </span>
                <h3 className="mt-4 text-lg font-semibold">
                  {c(cms?.pinjamanJudul, CMS_DEFAULTS.layanan.pinjamanJudul)}
                </h3>
                <p className="mt-2 flex-1 text-sm leading-6 text-slate-600">
                  {c(cms?.pinjamanIsi, CMS_DEFAULTS.layanan.pinjamanIsi)}
                </p>
                <Button asChild variant="link" className="mt-4 self-start px-0 text-primary">
                  <Link to="/auth">
                    {c(cms?.pinjamanCta, CMS_DEFAULTS.layanan.pinjamanCta)}
                    <ArrowRight className="ml-1 size-4" />
                  </Link>
                </Button>
              </article>

              <article
                id="gadai"
                className="card-lift flex scroll-mt-24 flex-col rounded-2xl border border-slate-200 bg-white p-7 shadow-sm"
              >
                <span className="clay-icon-mint inline-flex size-10 items-center justify-center">
                  <Package className="size-5" strokeWidth={2} />
                </span>
                <h3 className="mt-4 text-lg font-semibold">
                  {c(cms?.gadaiJudul, CMS_DEFAULTS.layanan.gadaiJudul)}
                </h3>
                <p className="mt-2 flex-1 text-sm leading-6 text-slate-600">
                  {c(cms?.gadaiIsi, CMS_DEFAULTS.layanan.gadaiIsi)}
                </p>
                <Button asChild variant="link" className="mt-4 self-start px-0 text-primary">
                  <Link to="/auth">
                    {c(cms?.gadaiCta, CMS_DEFAULTS.layanan.gadaiCta)}
                    <ArrowRight className="ml-1 size-4" />
                  </Link>
                </Button>
              </article>
            </div>
          </div>
        </section>

        {/* Simulasi + langkah */}
        <section id="simulasi" className="mx-auto w-full max-w-6xl scroll-mt-24 px-6 py-20">
          <div className="grid gap-10 lg:grid-cols-2">
            <LiveCalculator />
            <div>
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Tiga langkah
              </h2>
              <p className="mt-3 text-base leading-7 text-slate-600">
                Proses ringkas dengan angka yang sama seperti yang Anda lihat di simulasi.
              </p>
              <ol className="mt-8 space-y-6">
                {steps.map(({ icon: Icon, title, body }, i) => (
                  <li key={title} className="flex gap-4">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                      <Icon className="size-5" strokeWidth={2} />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        <span className="mr-1.5 text-slate-400">0{i + 1}</span>
                        {title}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{body}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="mt-8 rounded-xl bg-slate-50 p-4 text-xs leading-5 text-slate-600">
                Seluruh angka berikut adalah <b className="font-semibold text-slate-900">simulasi ledger internal</b>, bukan dana dari Pendana terverifikasi atau bukti pendanaan. Skema harian menghitung nilai bersih 95% dan total kewajiban 130%; tidak ada pencairan atau transfer. Skema bulanan (1/3/6 bulan, hingga Rp 10 juta) menampilkan uang muka 0%, biaya layanan 3% yang diamortisasi, dan bunga menurun 10%/8%/7,5% per bulan. Status dan rincian kontrak hanya catatan aplikasi, bukan tanda tangan digital atau transaksi eksternal.
              </p>
            </div>
          </div>
        </section>

        {/* Keamanan */}
        <section id="keamanan" className="scroll-mt-24 border-t border-slate-200 bg-slate-50/60">
          <div className="mx-auto w-full max-w-6xl px-6 py-20">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Pencatatan &amp; batas simulasi
              </h2>
              <p className="mt-3 text-base leading-7 text-slate-600">
                Ketahui apa yang dicatat aplikasi dan apa yang tidak dijalankan secara eksternal.
              </p>
            </div>
            <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 sm:grid-cols-2 lg:grid-cols-3">
              {SECURITY.map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-3 bg-white p-5">
                  <Icon className="size-5 shrink-0 text-primary" strokeWidth={2} />
                  <span className="text-sm font-medium text-slate-700">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto w-full max-w-6xl px-6 py-20">
          <div className="rounded-2xl bg-primary px-8 py-12 text-center sm:px-12">
            <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Mulai hari ini
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-primary-foreground/80">
              Buat akun untuk mencatat simulasi pengajuan, atau jelajahi tampilan ledger Pendana. Tidak ada dana yang dikirim atau dikelola melalui aplikasi.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Button
                asChild
                className="h-11 border-0 bg-white px-6 text-primary hover:bg-secondary"
              >
                <Link to="/auth">Buka akun simulasi</Link>
              </Button>
              <Button
                asChild
                className="h-11 border border-white/40 bg-transparent px-6 text-white hover:bg-white/10"
              >
                <Link to="/pendana">Lihat mode Pendana</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto w-full max-w-6xl px-6 py-12">
          <div className="grid gap-8 sm:grid-cols-3">
            <div>
              <div className="flex items-center gap-2.5">
                <VaultLogo size={28} />
                <span className="text-sm font-semibold">{logoTeks}</span>
              </div>
              <p className="mt-3 max-w-xs text-xs leading-5 text-slate-500">
                PINDAI adalah aplikasi pencatatan simulasi pinjaman, gadai, dan alokasi ledger internal.
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Produk
              </p>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                <li>
                  <a href="#pinjaman" className="hover:text-slate-900">
                    Pinjaman Tunai
                  </a>
                </li>
                <li>
                  <a href="#gadai" className="hover:text-slate-900">
                    Gadai Digital
                  </a>
                </li>
                <li>
                  <a href="#simulasi" className="hover:text-slate-900">
                    Simulasi
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
                  <a href="#keamanan" className="hover:text-slate-900">
                    Keamanan
                  </a>
                </li>
                <li className="flex items-center gap-2">
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-sky-400 opacity-70" />
                    <span className="relative inline-flex size-2 rounded-full bg-sky-500" />
                  </span>
                  <span className="text-slate-500">Simulasi ledger internal</span>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-8 flex flex-col items-center justify-between gap-2 border-t border-slate-200 pt-6 text-xs text-slate-500 sm:flex-row">
            <span>© 2026 {logoTeks}. Seluruh hak cipta.</span>
            <span>Perhitungan transparan · Status internal · Tanpa transfer eksternal</span>
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
