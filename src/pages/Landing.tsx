import { motion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  Calculator,
  Eye,
  Landmark,
  Lock,
  MapPin,
  Package,
  Scale,
  ShieldCheck,
  Sparkles,
  Users,
  Vault,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PINDAI_PRICING, quoteLoan, TENOR_OPTIONS, type LoanQuote } from "@/lib/loan";
import { formatRupiah, parseRupiah, type Rupiah } from "@/lib/money";

/* =====================================================================
 * Logo 3D Brankas Digital — SVG kartun berlapis dengan kilau mint.
 * ===================================================================== */
function VaultLogo({ size = 44 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-label="Brankas Digital PINDAI"
      className="drop-shadow-[0_10px_16px_oklch(0.62_0.15_232/0.35)]"
    >
      {/* Badan brankas — biru metallic */}
      <rect x="6" y="10" width="52" height="46" rx="14" fill="url(#vaultBody)" />
      <rect x="6" y="10" width="52" height="46" rx="14" stroke="#0284c7" strokeWidth="2" />
      {/* Panel dalam */}
      <rect x="14" y="18" width="36" height="30" rx="10" fill="url(#vaultInner)" />
      {/* Pintu brankas */}
      <rect x="18" y="22" width="28" height="22" rx="8" fill="url(#vaultDoor)" stroke="#0369a1" strokeWidth="1.6" />
      {/* Engsel */}
      <circle cx="14" cy="20" r="2.6" fill="#0369a1" />
      <circle cx="14" cy="46" r="2.6" fill="#0369a1" />
      {/* Kombinasi roda — kilau mint */}
      <circle cx="32" cy="33" r="8.5" fill="url(#dialMint)" stroke="#059669" strokeWidth="1.8" />
      <circle cx="32" cy="33" r="3.4" fill="#ecfdf5" stroke="#10b981" strokeWidth="1.4" />
      <path d="M32 26.5v3.4M32 36.1v3.4M25.5 33h3.4M35.1 33h3.4" stroke="#047857" strokeWidth="1.6" strokeLinecap="round" />
      {/* Kilau cahaya */}
      <path d="M13 15c4-3.4 9-4.4 13-3.6-6 1.8-9.8 4.4-13 8.4V15Z" fill="#ffffff" opacity="0.55" />
      <path d="M44 49c3.6-1 6.4-3.2 8.4-6.4" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round" opacity="0.6" />
      {/* Kaki brankas */}
      <rect x="14" y="54" width="9" height="5" rx="2.5" fill="#0369a1" />
      <rect x="41" y="54" width="9" height="5" rx="2.5" fill="#0369a1" />
      <defs>
        <linearGradient id="vaultBody" x1="6" y1="10" x2="58" y2="56" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7dd3fc" />
          <stop offset="0.55" stopColor="#38bdf8" />
          <stop offset="1" stopColor="#0369a1" />
        </linearGradient>
        <linearGradient id="vaultInner" x1="14" y1="18" x2="50" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0c4a6e" />
          <stop offset="1" stopColor="#075985" />
        </linearGradient>
        <linearGradient id="vaultDoor" x1="18" y1="22" x2="46" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#e0f2fe" />
          <stop offset="1" stopColor="#7dd3fc" />
        </linearGradient>
        <radialGradient id="dialMint" cx="0.35" cy="0.3" r="1">
          <stop stopColor="#a7f3d0" />
          <stop offset="0.6" stopColor="#34d399" />
          <stop offset="1" stopColor="#059669" />
        </radialGradient>
      </defs>
    </svg>
  );
}

/* =====================================================================
 * Ilustrasi 3D kartun untuk showcase (uang tumpuk & paket gadai).
 * ===================================================================== */
function MoneyStack3D() {
  return (
    <svg width="120" height="96" viewBox="0 0 120 96" fill="none" className="drop-shadow-[0_14px_20px_oklch(0.62_0.15_232/0.3)]">
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(0 ${-i * 12})`}>
          <rect x="18" y={58 - i * 0} width="84" height="22" rx="10" fill="url(#noteG)" stroke="#0369a1" strokeWidth="1.6" />
          <circle cx="60" cy="69" r="7.5" fill="#bae6fd" stroke="#0284c7" strokeWidth="1.4" />
          <text x="60" y="73" textAnchor="middle" fontSize="9" fontWeight="700" fill="#075985">P</text>
        </g>
      ))}
      <circle cx="98" cy="26" r="9" fill="url(#coinMint)" stroke="#059669" strokeWidth="1.6" />
      <text x="98" y="30" textAnchor="middle" fontSize="10" fontWeight="800" fill="#065f46">%</text>
      <defs>
        <linearGradient id="noteG" x1="18" y1="58" x2="102" y2="80" gradientUnits="userSpaceOnUse">
          <stop stopColor="#e0f2fe" />
          <stop offset="1" stopColor="#7dd3fc" />
        </linearGradient>
        <radialGradient id="coinMint" cx="0.35" cy="0.3" r="1">
          <stop stopColor="#a7f3d0" />
          <stop offset="1" stopColor="#10b981" />
        </radialGradient>
      </defs>
    </svg>
  );
}

function VaultPackage3D() {
  return (
    <svg width="120" height="96" viewBox="0 0 120 96" fill="none" className="drop-shadow-[0_14px_20px_oklch(0.7_0.14_165/0.3)]">
      {/* Kotak klaim asuransi / brankas mini */}
      <rect x="24" y="30" width="72" height="50" rx="12" fill="url(#pkgG)" stroke="#047857" strokeWidth="1.8" />
      <rect x="24" y="30" width="72" height="14" rx="7" fill="#34d399" opacity="0.75" />
      <rect x="52" y="22" width="16" height="12" rx="5" fill="#059669" />
      <circle cx="60" cy="58" r="10" fill="#ecfdf5" stroke="#059669" strokeWidth="2" />
      <path d="M60 52.5v11M54.5 58H65.5" stroke="#047857" strokeWidth="2" strokeLinecap="round" />
      <circle cx="92" cy="18" r="7" fill="url(#gemMint)" stroke="#047857" strokeWidth="1.4" />
      <defs>
        <linearGradient id="pkgG" x1="24" y1="30" x2="96" y2="80" gradientUnits="userSpaceOnUse">
          <stop stopColor="#a7f3d0" />
          <stop offset="1" stopColor="#34d399" />
        </linearGradient>
        <radialGradient id="gemMint" cx="0.35" cy="0.3" r="1">
          <stop stopColor="#d1fae5" />
          <stop offset="1" stopColor="#10b981" />
        </radialGradient>
      </defs>
    </svg>
  );
}

/* =====================================================================
 * Trust badges — 8 indikator keamanan + tooltip hover melayang.
 * ===================================================================== */
const TRUST_BADGES = [
  {
    icon: Lock,
    tint: "clay-icon-blue",
    title: "SSL 256-bit",
    tip: "Koneksi data nasabah terenkripsi TLS/SSL 256-bit end-to-end.",
  },
  {
    icon: Scale,
    tint: "clay-icon-mint",
    title: "Double-Entry Ledger",
    tip: "Setiap rupiah tercatat berpasangan debit–kredit dan wajib seimbang.",
  },
  {
    icon: Vault,
    tint: "clay-icon-blue",
    title: "Brankas Custody",
    tip: "Barang gadai tersimpan di custody resmi dengan pencatatan diaudit.",
  },
  {
    icon: ShieldCheck,
    tint: "clay-icon-mint",
    title: "HMAC SHA-256",
    tip: "Callback pembayaran diverifikasi tanda tangan kriptografi.",
  },
  {
    icon: Calculator,
    tint: "clay-icon-blue",
    title: "Zero Floating Error",
    tip: "Semua hitungan rupiah bulat — presisi sampai satu rupiah.",
  },
  {
    icon: Eye,
    tint: "clay-icon-mint",
    title: "Transparansi 95% Net",
    tip: "Potongan di muka 5% terbuka — dana bersih 95% sampai ke Peminjam.",
  },
] as const;

function TrustBadgesBar() {
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
      {TRUST_BADGES.map(({ icon: Icon, tint, title, tip }) => (
        <div key={title} className="group relative">
          {/* Tooltip melayang di atas kartu saat hover */}
          <div className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-3 w-52 -translate-x-1/2 translate-y-1 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
            <div className="clay-card relative rounded-2xl px-3.5 py-2.5">
              <p className="text-[11px] font-semibold text-sky-900">{title}</p>
              <p className="mt-0.5 text-[11px] leading-4 text-slate-600">{tip}</p>
              <span className="absolute -bottom-1.5 left-1/2 size-3 -translate-x-1/2 rotate-45 rounded-[3px] border-b border-r border-sky-100 bg-white" />
            </div>
          </div>
          <div className="clay-card flex flex-col items-center gap-2 rounded-2xl px-2 py-4 text-center transition-transform duration-200 group-hover:-translate-y-1">
            <span className={`clay-shine relative inline-flex size-9 items-center justify-center ${tint}`}>
              <Icon className="size-4" strokeWidth={2.2} />
            </span>
            <span className="text-[11px] font-semibold leading-3.5 text-slate-800">{title}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* =====================================================================
 * Kalkulator live — real-time dari mesin finansial yang sama.
 * ===================================================================== */
const QUICK_AMOUNTS = [1_000_000, 5_000_000, 10_000_000, 50_000_000];
const MIN_SLIDER = 100_000;
const MAX_SLIDER = 100_000_000;
const SLIDER_STEPS = 140;

function sliderToRupiah(v: number): Rupiah {
  // Skala eksponensial agar 100rb–100jt nyaman digeser.
  const t = v / SLIDER_STEPS;
  const raw = MIN_SLIDER * Math.pow(MAX_SLIDER / MIN_SLIDER, t);
  return Math.round(raw / 50_000) * 50_000;
}

function rupiahToSlider(r: Rupiah): number {
  const clamped = Math.min(MAX_SLIDER, Math.max(MIN_SLIDER, r));
  return Math.round(
    (Math.log(clamped / MIN_SLIDER) / Math.log(MAX_SLIDER / MIN_SLIDER)) * SLIDER_STEPS,
  );
}

function LiveCalculator() {
  const [amount, setAmount] = useState<Rupiah>(10_000_000);
  const [tenor, setTenor] = useState<number>(30);
  const quote: LoanQuote = useMemo(() => quoteLoan(amount), [amount]);

  return (
    <div className="clay-card p-6 sm:p-8">
      <div className="flex items-center gap-3">
        <span className="clay-shine clay-icon-blue relative inline-flex size-11 items-center justify-center">
          <Calculator className="size-5" strokeWidth={2.2} />
        </span>
        <div>
          <h3 className="text-base font-bold text-navy">Kalkulator Pinjaman Live</h3>
          <p className="text-xs text-slate-500">Hitungan real-time — sama dengan yang dipakai sistem.</p>
        </div>
      </div>

      {/* Nominal */}
      <div className="mt-6">
        <div className="flex items-baseline justify-between">
          <label htmlFor="calc-nominal" className="text-sm font-semibold text-slate-700">
            Nominal pengajuan
          </label>
          <span className="rounded-full bg-sky-100 px-3 py-1 text-sm font-bold tabular-nums text-sky-800">
            {formatRupiah(amount)}
          </span>
        </div>
        <input
          id="calc-nominal"
          type="range"
          min={0}
          max={SLIDER_STEPS}
          value={rupiahToSlider(amount)}
          onChange={(e) => setAmount(sliderToRupiah(Number(e.target.value)))}
          className="mt-3 w-full accent-sky-500"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {QUICK_AMOUNTS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setAmount(q)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                amount === q
                  ? "clay-btn-blue shadow-glow-blue"
                  : "bg-sky-50 text-sky-700 hover:bg-sky-100"
              }`}
            >
              {formatRupiah(q).replace("Rp ", "")}
            </button>
          ))}
        </div>
      </div>

      {/* Tenor */}
      <div className="mt-5">
        <p className="text-sm font-semibold text-slate-700">Tenor pelunasan</p>
        <div className="mt-2 flex gap-2">
          {TENOR_OPTIONS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTenor(t)}
              className={`flex-1 rounded-2xl px-3 py-2.5 text-sm font-bold transition-all ${
                tenor === t
                  ? "clay-btn-mint"
                  : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              }`}
            >
              {t} hari
            </button>
          ))}
        </div>
      </div>

      {/* Hasil real-time */}
      <div className="clay-inset mt-6 bg-sky-50/70 p-4">
        <dl className="space-y-2 text-sm">
          {([
            ["Biaya Admin (3%)", formatRupiah(quote.biayaAdmin), false],
            ["Biaya Platform (2%)", formatRupiah(quote.biayaPlatform), false],
            ["Dana Bersih Diterima (95%)", formatRupiah(quote.danaBersihDitransfer), true],
            [`Bunga ${tenor} hari (30%)`, formatRupiah(quote.bunga), false],
          ] as Array<[string, string, boolean?]>).map(([term, value, strong]) => (
            <div key={term} className="flex items-baseline justify-between gap-4">
              <dt className={strong ? "font-semibold text-emerald-700" : "text-slate-500"}>{term}</dt>
              <dd className={`tabular-nums ${strong ? "font-bold text-emerald-700" : "font-medium text-slate-700"}`}>
                {value}
              </dd>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-4 border-t border-sky-200 pt-2">
            <dt className="font-bold text-navy">Total Kewajiban Pelunasan</dt>
            <dd className="text-base font-extrabold tabular-nums text-navy">
              {formatRupiah(quote.totalKewajibanPelunasan)}
            </dd>
          </div>
        </dl>

        {/* Bar visual komposisi dana */}
        <div className="mt-4">
          <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-sky-100">
            <div className="h-full bg-emerald-400" style={{ width: "76.9%" }} title="Dana bersih 95%" />
            <div className="h-full bg-sky-400" style={{ width: "3.85%" }} title="Biaya admin 3%" />
            <div className="h-full bg-sky-200" style={{ width: "2.55%" }} title="Biaya platform 2%" />
            <div className="h-full bg-navy/80" style={{ width: "16.7%" }} title="Bunga 30%" />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-medium text-slate-500">
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-emerald-400" /> Dana bersih 95%</span>
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-sky-400" /> Admin 3%</span>
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-sky-200" /> Platform 2%</span>
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-navy/80" /> Bunga 30% (hak Pendana)</span>
          </div>
        </div>
      </div>

      <Button asChild className="clay-btn-blue mt-6 w-full px-6 py-3 text-sm font-bold">
        <Link to="/auth">
          Ajukan pinjaman ini
          <ArrowRight className="ml-1.5 size-4" />
        </Link>
      </Button>
      <p className="mt-3 text-center text-[11px] leading-4 text-slate-500">
        Simulasi edukasi — persetujuan akhir setelah verifikasi tim. Potongan di
        muka 5% selalu ditampilkan di muka; dana bersih yang Anda terima 95%.
      </p>
    </div>
  );
}

/* =====================================================================
 * Modal pengumuman — muncul otomatis setelah 1,5 detik.
 * ===================================================================== */
function AnnouncementModal({ onOpenCta }: { onOpenCta: () => void }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setOpen(true), 1500);
    return () => clearTimeout(t);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="clay-card max-w-md rounded-3xl border-0 p-0 sm:max-w-md">
        <div className="gradient-hero-modal relative overflow-hidden rounded-t-3xl px-6 pb-6 pt-8 text-center">
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Tutup pengumuman"
            className="absolute right-4 top-4 inline-flex size-8 items-center justify-center rounded-full bg-white/70 text-slate-600 transition hover:bg-white"
          >
            <X className="size-4" />
          </button>
          <motion.span
            initial={{ scale: 0.6, rotate: -8 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 16 }}
            className="clay-shine relative mx-auto inline-flex size-16 items-center justify-center rounded-2xl"
            style={{ background: "linear-gradient(180deg,#bae6fd,#7dd3fc)", boxShadow: "0 14px 24px -10px oklch(0.62 0.15 232/0.55)" }}
          >
            <Sparkles className="size-7 text-sky-800" />
          </motion.span>
          <DialogHeader className="mt-4 space-y-2 text-center">
            <DialogTitle className="text-xl font-extrabold text-navy">
              Ajukan Sekarang, Cair Tanpa Antre
            </DialogTitle>
            <DialogDescription className="text-sm leading-6 text-slate-600">
              Buat pengajuan pinjaman tunai atau gadai digital langsung dari
              rumah — cukup beberapa menit. Tim kami menindak cepat, barang
              gadai tersimpan aman di brankas custody, dan pengingat jatuh
              tempo berjalan otomatis supaya Anda tidak pernah terlambat.
            </DialogDescription>
          </DialogHeader>
        </div>
        <div className="flex flex-col gap-2 px-6 pb-6 pt-4">
          <Button
            className="clay-btn-blue w-full px-6 py-3 text-sm font-bold"
            onClick={() => {
              setOpen(false);
              onOpenCta();
            }}
          >
            Mengerti, coba simulasi pinjaman saya
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

/* =====================================================================
 * Halaman utama
 * ===================================================================== */
export default function Landing() {
  const [calcKey, setCalcKey] = useState(0);

  const scrollToCalculator = () => {
    document.getElementById("simulasi")?.scrollIntoView({ behavior: "smooth" });
    // Re-render kecil agar fokus kembali ke kalkulator.
    setCalcKey((k) => k + 1);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="clay-hero flex min-h-screen flex-col text-navy"
    >
      {/* ================= Navbar ================= */}
      <header className="sticky top-0 z-40 border-b border-sky-100/80 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-18 w-full max-w-6xl items-center justify-between px-6 py-3">
          <a href="#" className="flex items-center gap-2.5">
            <VaultLogo size={44} />
            <span className="text-base font-extrabold tracking-wide">
              PINDAI
              <span className="block text-[10px] font-semibold tracking-[0.22em] text-sky-600">
                PINJAM &amp; GADAI DIGITAL
              </span>
            </span>
          </a>
          <nav className="hidden items-center gap-7 text-sm font-medium text-slate-600 lg:flex">
            <a href="#pinjaman" className="transition hover:text-sky-600">Pinjaman Tunai</a>
            <a href="#gadai" className="transition hover:text-sky-600">Gadai Digital</a>
            <a href="#simulasi" className="transition hover:text-sky-600">Simulasi</a>
            <a href="#keamanan" className="transition hover:text-sky-600">Keamanan</a>
          </nav>
          <div className="flex items-center gap-2.5">
            <Button
              asChild
              variant="ghost"
              className="rounded-full font-semibold text-slate-700 hover:bg-sky-50 hover:text-sky-700"
            >
              <Link to="/auth">Masuk</Link>
            </Button>
            <Button asChild className="clay-btn-blue px-5 py-2.5 text-sm font-bold">
              <Link to="/auth">Daftar</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* ================= Hero ================= */}
        <section className="mx-auto w-full max-w-6xl px-6 pb-16 pt-14 sm:pt-20">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.05 }}
            >
              <span className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-sky-700 shadow-sm">
                <Sparkles className="size-3.5" />
                Platform Pendanaan &amp; Penggadaian Terpercaya
              </span>
              <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl">
                Pinjam &amp; Gadai Digital{" "}
                <span className="bg-gradient-to-r from-sky-500 via-sky-400 to-emerald-500 bg-clip-text text-transparent">
                  Transparan
                </span>
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-slate-600">
                Ajukan pinjaman tunai atau gadaikan barang dengan potongan di
                muka yang dinyatakan terbuka: <b className="text-navy">5%</b> —
                sisanya <b className="text-emerald-600">95% dana bersih</b>{" "}
                langsung ke rekening Anda. Didanai oleh Pendana terverifikasi,
                dicatat dalam jurnal yang dapat diaudit.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button asChild className="clay-btn-blue px-7 py-3.5 text-sm font-bold">
                  <Link to="/auth">
                    Ajukan Pinjaman
                    <ArrowRight className="ml-1.5 size-4" />
                  </Link>
                </Button>
                <Button asChild className="clay-btn-mint px-7 py-3.5 text-sm font-bold">
                  <Link to="/auth">
                    Mulai Gadai Digital
                    <ArrowRight className="ml-1.5 size-4" />
                  </Link>
                </Button>
              </div>
              <div className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-xs font-medium text-slate-500">
                <span className="flex items-center gap-1.5">
                  <BadgeCheck className="size-4 text-emerald-500" /> Sertifikasi wajib
                </span>
                <span className="flex items-center gap-1.5">
                  <MapPin className="size-4 text-sky-500" /> Live location saat pemeriksaan
                </span>
                <span className="flex items-center gap-1.5">
                  <Users className="size-4 text-emerald-500" /> Pendana terverifikasi
                </span>
              </div>
            </motion.div>

            {/* Maskot 3D: brankas besar mengambang */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.15 }}
              className="relative mx-auto"
            >
              <div className="animate-float">
                <div className="clay-card flex items-center justify-center rounded-[2.5rem] p-10">
                  <VaultLogo size={190} />
                </div>
              </div>
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ repeat: Infinity, duration: 5, delay: 0.6 }}
                className="clay-card absolute -left-6 top-8 rounded-2xl px-4 py-2.5"
              >
                <p className="text-[10px] font-semibold text-slate-500">Dana bersih</p>
                <p className="text-sm font-extrabold text-emerald-600">95% selalu</p>
              </motion.div>
              <motion.div
                animate={{ y: [0, 9, 0] }}
                transition={{ repeat: Infinity, duration: 6, delay: 1.1 }}
                className="clay-card absolute -right-4 bottom-10 rounded-2xl px-4 py-2.5"
              >
                <p className="text-[10px] font-semibold text-slate-500">Potongan di muka</p>
                <p className="text-sm font-extrabold text-sky-600">5% terbuka</p>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* ================= Trust Badges ================= */}
        <section id="keamanan" className="mx-auto w-full max-w-6xl px-6 pb-20">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-extrabold tracking-tight">
              Keamanan tingkat infrastruktur
            </h2>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">
              Delapan lapis perlindungan berjalan di setiap transaksi — arahkan
              kursor ke badge untuk detailnya.
            </p>
          </div>
          <TrustBadgesBar />
        </section>

        {/* ================= Kalkulator + Dual Showcase ================= */}
        <section id="simulasi" className="mx-auto w-full max-w-6xl px-6 pb-20">
          <div className="grid gap-10 lg:grid-cols-2">
            <div key={calcKey}>
              <LiveCalculator />
            </div>

            <div className="flex flex-col gap-6">
              <div>
                <h2 className="text-2xl font-extrabold tracking-tight">
                  Dua layanan, satu standar transparansi
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Pilih jalur yang paling sesuai — keduanya memakai mesin
                  perhitungan dan jurnal audit yang sama.
                </p>
              </div>

              {/* Pinjaman Tunai Digital */}
              <article
                id="pinjaman"
                className="clay-card card-lift flex gap-5 rounded-3xl p-6"
              >
                <div className="hidden shrink-0 sm:block">
                  <MoneyStack3D />
                </div>
                <div>
                  <span className="clay-shine clay-icon-blue relative inline-flex size-10 items-center justify-center sm:hidden">
                    <Banknote className="size-5" strokeWidth={2.2} />
                  </span>
                  <h3 className="text-lg font-extrabold">Pinjaman Tunai Digital</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Ajukan tanpa agunan dengan tenor 30/60/90 hari. Setelah
                    disetujui tim, dana bersih 95% dari pokok langsung ke
                    rekening Anda. Lunasi 130% (pokok + Bunga 30% — Imbal Hasil
                    Pendana).
                  </p>
                  <Button asChild className="clay-btn-blue mt-4 px-5 py-2.5 text-xs font-bold">
                    <Link to="/auth">
                      Ajukan sekarang
                      <ArrowRight className="ml-1 size-3.5" />
                    </Link>
                  </Button>
                </div>
              </article>

              {/* Gadai Digital */}
              <article
                id="gadai"
                className="clay-card card-lift flex gap-5 rounded-3xl p-6"
              >
                <div className="hidden shrink-0 sm:block">
                  <VaultPackage3D />
                </div>
                <div>
                  <span className="clay-shine clay-icon-mint relative inline-flex size-10 items-center justify-center sm:hidden">
                    <Package className="size-5" strokeWidth={2.2} />
                  </span>
                  <h3 className="text-lg font-extrabold">Gadai Digital</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Elektronik, kendaraan, perhiasan, hingga properti. Taksiran
                    resmi oleh petugas berwenang dengan live location wajib,
                    barang tersimpan di Brankas Custody sampai Anda lunasi.
                  </p>
                  <Button asChild className="clay-btn-mint mt-4 px-5 py-2.5 text-xs font-bold">
                    <Link to="/auth">
                      Gadaikan barang
                      <ArrowRight className="ml-1 size-3.5" />
                    </Link>
                  </Button>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* ================= Cara kerja + model Pendana ================= */}
        <section className="mx-auto w-full max-w-6xl px-6 pb-20">
          <div className="clay-card rounded-[2rem] p-8 sm:p-10">
            <h2 className="text-center text-2xl font-extrabold tracking-tight">
              Tiga langkah, semua angka jelas
            </h2>
            <div className="mt-8 grid gap-6 sm:grid-cols-3">
              {[
                {
                  icon: Landmark,
                  tint: "clay-icon-blue",
                  step: "01",
                  title: "Ajukan",
                  body: "Isi nominal dan tenor — rincian potongan 5%, dana bersih 95%, dan total kewajiban tampil sebelum Anda kirim.",
                },
                {
                  icon: ShieldCheck,
                  tint: "clay-icon-mint",
                  step: "02",
                  title: "Verifikasi",
                  body: "Tim menelaah pengajuan; barang gadai diperiksa petugas di lokasi Anda dengan pencatatan live location wajib.",
                },
                {
                  icon: Banknote,
                  tint: "clay-icon-blue",
                  step: "03",
                  title: "Cair & Pantau",
                  body: "Dana bersih 95% masuk rekening. Pantau jatuh tempo dengan pengingat otomatis di ruang nasabah.",
                },
              ].map(({ icon: Icon, tint, step, title, body }) => (
                <div key={step} className="card-lift rounded-3xl border border-sky-100 bg-white p-6">
                  <div className="flex items-center justify-between">
                    <span className={`clay-shine relative inline-flex size-11 items-center justify-center ${tint}`}>
                      <Icon className="size-5" strokeWidth={2.2} />
                    </span>
                    <span className="text-xs font-extrabold tracking-widest text-sky-300">{step}</span>
                  </div>
                  <h3 className="mt-4 text-base font-bold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{body}</p>
                </div>
              ))}
            </div>
            <p className="mx-auto mt-8 max-w-2xl text-center text-xs leading-5 text-slate-500">
              Dana berasal dari <b>Pendana</b> — pihak terverifikasi yang
              menyalurkan dana melalui skema Pendanaan kami dan menerima{" "}
              <b>Bunga / Imbal Hasil</b> 30% dari pokok sebagai hak finansialnya.
              PINDAI sebagai wadah hanya memungut biaya admin 3% dan biaya
              platform 2%.
            </p>
          </div>
        </section>

        {/* ================= CTA akhir ================= */}
        <section className="mx-auto w-full max-w-6xl px-6 pb-20">
          <div className="relative overflow-hidden rounded-[2rem] p-10 text-center shadow-glow-blue"
            style={{ background: "linear-gradient(135deg,#38bdf8 0%,#0ea5e9 55%,#10b981 130%)" }}
          >
            <h2 className="text-2xl font-extrabold text-white sm:text-3xl">
              Siap mencoba transparansi 95% net?
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-sky-50">
              Buat akun Peminjam untuk pinjaman tunai atau gadai digital — atau
              daftar sebagai Pendana untuk mulai menyalurkan dana.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Button asChild className="rounded-full border-0 bg-white px-7 py-3.5 text-sm font-bold text-sky-700 shadow-lg hover:bg-sky-50">
                <Link to="/auth">Daftar sebagai Peminjam</Link>
              </Button>
              <Button asChild className="rounded-full border-0 bg-navy px-7 py-3.5 text-sm font-bold text-white shadow-lg hover:bg-navy/90">
                <Link to="/pendana">Jadi Pendana</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      {/* ================= Footer ================= */}
      <footer className="border-t border-sky-100 bg-white/70">
        <div className="mx-auto w-full max-w-6xl px-6 py-10">
          <div className="grid gap-8 sm:grid-cols-3">
            <div>
              <div className="flex items-center gap-2.5">
                <VaultLogo size={34} />
                <span className="text-sm font-extrabold">PINDAI</span>
              </div>
              <p className="mt-3 max-w-xs text-xs leading-5 text-slate-500">
                Pinjam &amp; Gadai Digital — wadah resmi yang menghubungkan
                Peminjam dengan Pendana terverifikasi.
              </p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Produk</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                <li><a href="#pinjaman" className="hover:text-sky-600">Pinjaman Tunai</a></li>
                <li><a href="#gadai" className="hover:text-sky-600">Gadai Digital</a></li>
                <li><a href="#simulasi" className="hover:text-sky-600">Simulasi</a></li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Legalitas &amp; Sistem</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                <li><a href="#keamanan" className="hover:text-sky-600">Keamanan &amp; Kepatuhan</a></li>
                <li className="flex items-center gap-2">
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                  </span>
                  Semua sistem beroperasi normal
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-8 flex flex-col items-center justify-between gap-2 border-t border-sky-100 pt-6 text-xs text-slate-400 sm:flex-row">
            <span>© 2026 PINDAI — Pinjam &amp; Gadai Digital. Seluruh hak cipta.</span>
            <span>Potongan di muka 5% · Dana bersih 95% · Total kewajiban 130%</span>
          </div>
        </div>
      </footer>

      <AnnouncementModal onOpenCta={scrollToCalculator} />
    </motion.div>
  );
}
