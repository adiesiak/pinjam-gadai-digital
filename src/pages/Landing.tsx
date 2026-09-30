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

import { useAuth } from "@/hooks/use-auth";

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

/* Ikon brankas PINDAI — proporsi kokoh dengan detail dial yang tetap terbaca kecil. */
function VaultLogo({ size = 36 }: { size?: number }) {
  return (
    <svg
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
      <circle cx="31" cy="31" r="10" fill="#0f3d3a" />
      <circle cx="31" cy="31" r="7.2" stroke="#cbb47e" strokeWidth="1.5" />
      <path d="M31 31l7-5M31 24v2M38 31h-2M31 38v-2M24 31h2" stroke="#f5f2e9" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="31" cy="31" r="2.2" fill="#cbb47e" />
      <path d="M20 57h8M36 57h8" stroke="#0b2d2a" strokeWidth="3" strokeLinecap="round" />
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
        className={`flex items-center gap-1.5 font-semibold uppercase leading-none tracking-[0.13em] text-slate-400 ${
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
  { icon: ShieldCheck, label: "Persetujuan aplikasi bukan jaminan pendanaan" },
  { icon: Calculator, label: "Angka merupakan perhitungan aplikasi" },
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
    <div className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white p-6 sm:p-7">
      <div className="-mx-6 -mt-6 mb-6 border-b border-slate-200 bg-slate-50/80 px-6 py-5 sm:-mx-7 sm:-mt-7 sm:px-7">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary"><Calculator className="size-3.5" /> Kalkulator interaktif</span>
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
                [
                  sim.tenorBulan === 3 || sim.tenorBulan === 6
                    ? `Admin 5% (${formatRupiah(sim.biayaAdminTotal)}) + platform 2% (${formatRupiah(sim.biayaPlatformTotal)}), diamortisasi`
                    : "Biaya layanan 3% (diamortisasi)",
                  formatRupiah(sim.biayaLayananTotal),
                  false,
                ],
                ["Pokok perhitungan (DP 0%)", formatRupiah(sim.pokokDibiayai), true],
                [
                  `Cicilan per bulan (${sim.tenorBulan} bulan)`,
                  formatRupiah(sim.cicilanPerBulan),
                  true,
                ],
              ] as Array<[string, string, boolean?]>)
            : ([
                ["Bunga (30%)", formatRupiah(quote.bunga), false],
                ["Nilai bersih (95% dari pokok)", formatRupiah(quote.danaBersihDitransfer), true],
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
          <dt className="font-semibold text-slate-900">Total pelunasan</dt>
          <dd className="text-base font-semibold tabular-nums text-slate-900">
            {formatRupiah(sim !== null ? sim.totalPengembalian : quote.totalKewajibanPelunasan)}
          </dd>
        </div>
      </dl>

      <p className="mt-4 text-xs leading-5 text-slate-500">
        Ini perhitungan aplikasi, bukan persetujuan pinjaman. Skema bulanan menampilkan ilustrasi angsuran; pencatatan pelunasan di sistem dilakukan sekaligus saat jatuh tempo. Perpindahan dana ditangani di luar aplikasi.
      </p>

      <Button asChild className="mt-5 h-11 w-full bg-primary text-white hover:bg-primary/90">
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
      className="fixed right-5 z-50 flex flex-col items-end gap-3"
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
      : user?.role === "pendana"
        ? "/pendana"
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
    { href: "#kalkulator", label: c(cms?.nav3, "Kalkulator") },
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
          <Link to="/" onClick={handleBrandClick} className="flex items-center gap-3">
            <VaultLogo size={40} />
            <BrandWordmark name={logoTeks} />
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
            {!isAuthenticated && (
              <Button
                asChild
                variant="ghost"
                className="hidden text-slate-600 hover:text-slate-900 md:inline-flex"
              >
                <Link to="/auth">Masuk</Link>
              </Button>
            )}
            <Button asChild disabled={isLoading} className="bg-primary text-white hover:bg-primary/90">
              <Link to={accountHref}>{isAuthenticated ? "Dashboard" : isLoading ? "Memuat…" : "Daftar"}</Link>
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
          <div aria-hidden="true" className="pointer-events-none absolute -right-32 top-16 size-80 rounded-full border border-primary/10 sm:size-[30rem]" />
          <div aria-hidden="true" className="pointer-events-none absolute -right-20 top-28 size-56 rounded-full border border-[#b99b62]/20 sm:size-96" />
          <div className="mx-auto grid w-full max-w-7xl items-center gap-12 px-6 py-16 sm:px-8 sm:py-24 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:py-28">
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="relative z-10"
            >
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-white/80 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
                <span className="size-1.5 rounded-full bg-[#b99b62]" />
                {c(cms?.heroBadge, CMS_DEFAULTS.hero.badge)}
              </span>
              <h1 className="mt-7 max-w-3xl text-[2.65rem] font-semibold leading-[1.04] tracking-[-0.045em] text-slate-950 sm:text-6xl lg:text-[4.5rem]">
                {heroJudul1}<br />
                <span className="font-serif font-medium italic text-primary">{heroJudul2}</span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
                {c(cms?.heroSub, CMS_DEFAULTS.hero.sub)}
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button asChild disabled={isLoading} className="h-12 rounded-full bg-primary px-6 text-white hover:bg-primary/90">
                  <Link to={accountHref}>
                    {accountCta}
                    <ArrowRight className="ml-2 size-4" />
                  </Link>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={scrollToCalculator}
                  className="h-12 rounded-full border-slate-300 bg-white/70 px-6 text-slate-700 hover:bg-white"
                >
                  Lihat kalkulator
                </Button>
              </div>
              <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-slate-300/70 pt-5 text-xs font-medium text-slate-600 sm:text-sm">
                <span className="flex items-center gap-2"><BadgeCheck className="size-4 text-primary" />Rincian biaya terbuka</span>
                <span className="flex items-center gap-2"><Lock className="size-4 text-primary" />Riwayat per akun</span>
                <span className="flex items-center gap-2"><Calculator className="size-4 text-primary" />Angka kalkulator</span>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 24, rotate: 1.5 }}
              animate={{ opacity: 1, y: 0, rotate: 0 }}
              transition={{ duration: 0.7, delay: 0.12, ease: "easeOut" }}
              className="relative mx-auto w-full max-w-lg"
            >
              <div className="absolute -inset-3 rounded-[2rem] border border-[#b99b62]/35" aria-hidden="true" />
              <div className="relative overflow-hidden rounded-[1.75rem] bg-[#0f3d3a] p-6 text-[#f7f4ec] sm:p-8">
                <div className="absolute -right-16 -top-24 size-64 rounded-full border border-white/10" aria-hidden="true" />
                <div className="absolute -right-6 -top-14 size-44 rounded-full border border-[#cbb47e]/20" aria-hidden="true" />
                <div className="relative">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <VaultLogo size={46} />
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/55">Ruang catatan PINDAI</p>
                        <p className="mt-1 text-sm font-semibold">{c(cms?.chip1Label, CMS_DEFAULTS.chips.chip1.label)}</p>
                      </div>
                    </div>
                    <span className="rounded-full border border-[#d8c28c]/35 bg-[#d8c28c]/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#e6d3a5]">Kalkulator</span>
                  </div>
                  <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.07] p-5 backdrop-blur-sm sm:p-6">
                    <p className="text-xs text-white/60">{c(cms?.chip2Label, CMS_DEFAULTS.chips.chip2.label)}</p>
                    <p className="mt-1 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{c(cms?.chip2Nilai, CMS_DEFAULTS.chips.chip2.nilai)}</p>
                    <div className="mt-5 grid grid-cols-2 gap-3">
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
              <motion.article
                id="pinjaman"
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.25 }}
                transition={{ duration: 0.45 }}
                className="card-lift flex scroll-mt-24 flex-col rounded-2xl border border-slate-200 bg-white p-7"
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
                  <Link to={accountHref}>
                    {isAuthenticated ? "Buka dashboard" : c(cms?.pinjamanCta, CMS_DEFAULTS.layanan.pinjamanCta)}
                    <ArrowRight className="ml-1 size-4" />
                  </Link>
                </Button>
              </motion.article>

              <motion.article
                id="gadai"
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.25 }}
                transition={{ duration: 0.45, delay: 0.1 }}
                className="card-lift flex scroll-mt-24 flex-col rounded-2xl border border-slate-200 bg-white p-7"
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
                  <Link to={accountHref}>
                    {isAuthenticated ? "Buka dashboard" : c(cms?.gadaiCta, CMS_DEFAULTS.layanan.gadaiCta)}
                    <ArrowRight className="ml-1 size-4" />
                  </Link>
                </Button>
              </motion.article>
            </div>
          </div>
        </section>

        {/* Kalkulator + langkah */}
        <section id="kalkulator" className="mx-auto w-full max-w-6xl scroll-mt-24 px-6 py-20">
          <div className="grid gap-10 lg:grid-cols-2">
            <LiveCalculator />
            <div>
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Tiga langkah
              </h2>
              <p className="mt-3 text-base leading-7 text-slate-600">
                Proses ringkas dengan angka yang sama seperti yang Anda lihat di kalkulator.
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
                Seluruh angka berikut adalah <b className="font-semibold text-slate-900">perhitungan ledger internal</b> dari pencatatan PINDAI. Skema harian menghitung nilai bersih 95% dan total kewajiban 130%; perpindahan dana ditangani di luar aplikasi. Skema bulanan (1/3/6 bulan, hingga Rp 10 juta) menampilkan DP 0%, biaya admin 5% + platform 2% untuk tenor 3/6 bulan (atau biaya layanan 3% untuk tenor 1 bulan), semuanya dimodelkan dalam cicilan tanpa potongan di muka; bunga menurun 30%/25%/20% per bulan sesuai tenor. Status dan rincian kontrak mengikuti pencatatan pada ledger internal.
              </p>
            </div>
          </div>
        </section>

        {/* Keamanan */}
        <section id="keamanan" className="scroll-mt-24 border-t border-slate-200 bg-slate-50/60">
          <div className="mx-auto w-full max-w-6xl px-6 py-20">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Pencatatan &amp; batas ledger
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
              Buat akun untuk mencatat pengajuan, atau jelajahi tampilan ledger Pendana. Perpindahan dana ditangani di luar aplikasi.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Button
                asChild
                className="h-11 border-0 bg-white px-6 text-primary hover:bg-secondary"
              >
                <Link to={accountHref}>{isAuthenticated ? "Buka dashboard" : "Buka akun"}</Link>
              </Button>
              {!isAuthenticated && (
                <Button
                  asChild
                  className="h-11 border border-white/40 bg-transparent px-6 text-white hover:bg-white/10"
                >
                  <Link to="/pendana">Lihat mode Pendana</Link>
                </Button>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto w-full max-w-6xl px-6 py-12">
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
                  <a href="#kalkulator" className="hover:text-slate-900">
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
                  <a href="#keamanan" className="hover:text-slate-900">
                    Keamanan
                  </a>
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
