import { useQuery } from "convex/react";
import {
  AnimatePresence,
  motion,
  useInView,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
} from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  Landmark,
  Lock,
  Menu,
  Package,
  Percent,
  Scale,
  Shapes,
  ShieldCheck,
  Sparkles,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";

import { useAuth } from "@/hooks/use-auth";
import { IsiBrankas } from "@/components/landing/IsiBrankas";
import { AnnouncementModal, FloatingWidget } from "@/components/landing/PerayaanLanding";
import { PromoSection } from "@/components/landing/PromoLanding";
import { BrandWordmark, SectionHeading } from "@/components/landing/bagian-landing";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { RoleDashboardMenu } from "@/components/RoleDashboardMenu";
import { Reveal } from "@/components/Reveal";
import { HeroBoundary, LandingHero } from "@/components/landing/LandingHero";
import { LiveCalculator } from "@/components/landing/LiveCalculator";
import { VaultLogo } from "@/components/VaultLogo";
import { HAK_CIPTA_PINDAI, PENAFIAN_PINDAI } from "@/lib/branding";
import { CMS_DEFAULTS } from "@/lib/cms-defaults";
import { CONTRACT_TERMS_VERSION } from "@/lib/contract";
import { LATE_FEE_POLICY } from "@/lib/loan";
import { EASE_OUT } from "@/lib/motion";
import { ADMIN_ROUTE, kombinasiAdmin } from "@/lib/routes";

/** Dua kolom pembanding di bagian "Batas yang jelas": apa yang dikerjakan
 *  aplikasi dan apa yang sepenuhnya berjalan di luar aplikasi. */
const DIJALANKAN = [
  { judul: "Mencatat pengajuan", isi: "Parameter pinjaman, gadai, atau kredit tersimpan di akun Anda." },
  {
    judul: "Menghitung biaya",
    isi: "Bunga, potongan di muka, dan cicilan dihitung sistem, bukan diketik manual.",
  },
  {
    judul: "Meninjau status",
    isi: "Keputusan tim PINDAI tercatat pada audit log beserta waktu dan pelakunya.",
  },
  {
    judul: "Menyimpan riwayat",
    isi: "Riwayat pengajuan hanya dapat dibuka oleh akun terkait dan tim PINDAI.",
  },
] as const;

const DI_LUAR_APLIKASI = [
  {
    judul: "Perpindahan dana",
    isi: "Pencairan dan pelunasan ditangani di luar aplikasi; PINDAI tidak mengirim uang.",
  },
  { judul: "Penyimpanan barang", isi: "Barang jaminan gadai tidak disimpan oleh PINDAI." },
  {
    judul: "Pemeriksaan & lelang",
    isi: "Pemeriksaan fisik dan pelelangan barang belum dijalankan aplikasi.",
  },
  { judul: "Penyedia pembayaran", isi: "Belum ada kanal pembayaran yang terhubung ke sistem." },
] as const;

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

/** Fakta ringkas dalam angka — semuanya bisa ditelusuri di halaman ini. */
const PITA_ANGKA = [
  { to: 3, suffix: "", label: "Skema tercatat", ket: "Harian · Bulanan · Kredit barang" },
  { to: 98, suffix: "%", label: "Nilai bersih harian", ket: "Setelah potongan 2% di muka" },
  { to: 2, suffix: "%", label: "Potongan di muka", ket: "Biaya admin 2% (platform dihapus)" },
  { to: 0, suffix: "", label: "Biaya tersembunyi", ket: "Semua rincian terbuka di awal" },
] as const;

/** Pita angka tepat di bawah hero. */
function PitaAngka() {
  return (
    <section aria-label="PINDAI dalam angka" className="relative bg-white">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-px bg-slate-200 sm:grid-cols-4">
        {PITA_ANGKA.map((item, i) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.45, delay: i * 0.06, ease: EASE_OUT }}
            className="bg-white px-5 py-7 sm:px-6 sm:py-9"
          >
            <p className="text-3xl font-semibold tabular-nums tracking-tight text-primary sm:text-4xl">
              <CountUp to={item.to} suffix={item.suffix} />
            </p>
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-700">
              {item.label}
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-500">{item.ket}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/** Fakta ringkas yang berjalan (marquee) di bawah hero. */
const HERO_FACTS = [
  "Skema harian 7–28 hari · biaya ekspres Rp5.000–Rp10.000 · bunga flat 26–40%",
  "Skema bulanan tenor 1/3/6 bulan · biaya 2% dipotong di muka",
  "Bunga flat dari pokok penuh · mengikuti tarif akun (bawaan 30% per bulan)",
  "Kredit barang hingga Rp 10 juta · biaya admin cicilan 2% tiap pembayaran",
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
export const FAQ_ITEMS = [
  {
    q: "Apakah PINDAI mengirim uang ke rekening saya?",
    a: "Tidak. PINDAI hanya mencatat pengajuan, perhitungan, dan status di ledger internal. Perpindahan dana ditangani di luar aplikasi; belum ada penyedia pembayaran yang terhubung.",
  },
  {
    q: "Dari mana angka cicilan di kalkulator berasal?",
    a: "Semua angka dihitung aplikasi dari nominal dan tenor yang Anda pilih, bukan angka yang diketik manual. Harian: potongan admin 2% + biaya ekspres Rp5.000–Rp10.000 di muka bila Anda memilih cair ekspres, dan bunga flat 26–40% sesuai nominal serta tenor. Bulanan: bunga flat mengikuti tarif akun, bawaan 30% per bulan untuk semua tenor.",
  },
  {
    q: "Kapan biaya dipotong?",
    a: "Biaya di muka dipotong dari dana yang diterima, bukan diangsur. Setiap pembayaran bulanan juga dikenai biaya admin cicilan 2% dari nominal cicilan.",
  },
  {
    q: "Apa yang dicatat untuk gadai?",
    a: "Deskripsi barang, nilai taksiran, pokok gadai, sewa modal, dan kode rak vault dicatat internal. PINDAI belum menjalankan pemeriksaan fisik, penyimpanan, atau pelelangan barang.",
  },
  {
    q: "Bagaimana status pengajuan ditentukan?",
    a: "Tim PINDAI meninjau pengajuan dan mengubah statusnya di panel admin; perubahannya tercatat di audit log. Persetujuan bukan jaminan pencairan dana, dan status di dashboard adalah catatan internal.",
  },
  {
    q: "Apakah data saya dibagikan ke pihak lain?",
    a: "Tidak ke publik. Riwayat pengajuan hanya bisa dibuka akun Anda, tim PINDAI, dan pendana yang diberi akses terbatas oleh admin. Di ruang pendana, nama disamarkan dan dokumen identitas (KTP, selfie, bukti penghasilan, tanda tangan) tidak dibagikan; lokasi hanya tampil per wilayah, bukan titik presisi.",
  },
] as const;

/**
 * Poin ringkas Syarat & Ketentuan untuk landing; versi lengkap di
 * /syarat-ketentuan. Denda memakai tarif yang berlaku saat halaman dibuka,
 * bukan angka tetap, supaya kalimatnya tidak bertentangan dengan tagihan.
 */
function ringkasanSyarat(denda: { perHari: number; maks: number }): Array<{
  judul: string;
  isi: string;
  Icon: typeof Scale;
}> {
  return [
  {
    judul: "Pencatatan internal, bukan transfer dana",
    isi: "PINDAI mencatat pengajuan, perhitungan, dan status di ledger internal. Perpindahan dana di luar aplikasi.",
    Icon: Landmark,
  },
  {
    judul: "Biaya transparan",
    isi: "Bunga flat 30% dari pokok; biaya dipotong di muka sesuai tenor. Angka dihitung aplikasi.",
    Icon: Percent,
  },
  {
    judul: "Akun & keamanan",
    isi: "Jaga kerahasiaan akun Anda. TOTP dan audit trail mencatat setiap tindakan admin.",
    Icon: Lock,
  },
  {
    judul: "Data pribadi",
    isi: "Riwayat pengajuan hanya dapat dibuka akun terkait dan tim PINDAI.",
    Icon: ShieldCheck,
  },
  {
    judul: "Gadai & kredit barang",
    isi: "PINDAI mencatat data barang dan taksiran. Pemeriksaan fisik, penyimpanan, dan pelelangan belum dijalankan aplikasi.",
    Icon: Package,
  },
  {
    judul: "Keputusan & pelunasan",
    isi: `Persetujuan pengajuan bukan jaminan pencairan. Keterlambatan dikenai denda ${denda.perHari}% per hari dari pokok (maksimum ${denda.maks}%).`,
    Icon: Scale,
  },
  ];
}




/**
 * Hero darurat: dipakai HANYA bila render hero gagal tak terduga.
 *
 * Isinya sengaja statis dan lengkap (judul + jalan masuk ke produk) supaya
 * pengunjung tidak pernah menerima layar putih, dan tetap tahu langkah
 * berikutnya. Tanpa gambar dan tanpa animasi — aman di perangkat apa pun,
 * termasuk Electron tanpa akselerasi.
 */
function HeroDarurat({
  judul1,
  judul2,
  ctaLabel,
  href,
}: {
  judul1: string;
  judul2: string;
  ctaLabel: string;
  href: string;
}) {
  return (
    // Pemisah ke bagian berikutnya digambar `FactRibbon` di bawahnya.
    <section
      aria-labelledby="hero-darurat-judul"
      className="bg-slate-50"
    >
      <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
        <h1
          id="hero-darurat-judul"
          className="text-[2.15rem] font-semibold leading-[1.1] tracking-[-0.035em] text-slate-900 sm:text-5xl"
        >
          {judul1}
          <br />
          <span className="font-serif font-medium italic text-primary">{judul2}</span>
        </h1>
        <p className="mt-6 max-w-xl text-sm leading-6 text-slate-600">
          Bagian ini tidak dapat dimuat sepenuhnya. PINDAI tetap dapat dipakai
          seperti biasa lewat tombol di bawah.
        </p>
        <Button asChild className="mt-8 h-12 rounded-full bg-primary px-6 text-white hover:bg-primary/90">
          <Link to={href}>
            {ctaLabel}
            <ArrowRight className="ml-2 size-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </section>
  );
}

export default function Landing() {
  const cms = useQuery(api.announcements.getPublic);
  const ketentuanBiaya = useQuery(api.system.getKetentuanBiaya, {});
  const denda = {
    perHari:
      ketentuanBiaya?.persenDendaKeterlambatan ?? LATE_FEE_POLICY.percentPerDay,
    maks: ketentuanBiaya?.maksDendaPersen ?? LATE_FEE_POLICY.maxPercent,
  };
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
      : c(cms?.heroCta1, "Ajukan Sekarang");

  const logoTeks = c(cms?.logoTeks, "PINDAI");
  const heroJudul1 = c(cms?.heroJudul, "Solusi Finansial, Lebih Jelas");
  const heroJudul2 = c(cms?.heroJudul2, "dalam Genggaman.");

  const navItems = [
    { href: "#pinjaman", label: c(cms?.nav1, "Produk") },
    { href: "#cara-kerja", label: "Cara Kerja" },
    { href: "#biaya", label: "Biaya" },
    { href: "#kalkulator", label: c(cms?.nav3, "Kalkulator") },
    { href: "#keamanan", label: c(cms?.nav4, "Keamanan") },
    { href: "#tanya", label: "FAQ" },
  ];

  const reduce = useReducedMotion();
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

  // Pintu admin alternatif: Ctrl+Alt+A. Bekerja tanpa mengekspos rutenya di
  // URL atau di markup, jadi crawler/pemindai tidak menemukannya; penjagaan
  // sesungguhnya tetap di halaman masuk (kata sandi + TOTP).
  const navigate = useNavigate();
  useEffect(() => {
    const bukaAdmin = (event: KeyboardEvent) => {
      if (!kombinasiAdmin(event)) return;
      const sasaran = event.target as HTMLElement | null;
      if (
        sasaran !== null &&
        (sasaran.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(sasaran.tagName))
      ) {
        return;
      }
      event.preventDefault();
      navigate(`/auth?returnTo=${encodeURIComponent(ADMIN_ROUTE)}`);
    };
    window.addEventListener("keydown", bukaAdmin);
    return () => window.removeEventListener("keydown", bukaAdmin);
  }, [navigate]);

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

  const scrollToSteps = () => {
    document.getElementById("cara-kerja")?.scrollIntoView({ behavior: "smooth" });
  };

  const steps = [
    {
      icon: Shapes,
      title: "Pilih layanan",
      body: "Tentukan layanan yang sesuai: pinjaman tunai, gadai barang, atau kredit barang.",
    },
    {
      icon: Landmark,
      title: "Lengkapi data",
      body: "Isi data diri, unggah dokumen KYC, dan verifikasi nomor WhatsApp lewat kode OTP.",
    },
    {
      icon: ShieldCheck,
      title: "Ikuti proses verifikasi",        body: "Petugas memeriksa pengajuan. Status terverifikasi berarti identitas sudah diproses, bukan persetujuan pinjaman.",
    },
    {
      icon: Scale,
      title: "Tinjau ketentuan",
      body: "Nominal, biaya, potongan, tenor, dan kewajiban ditampilkan sebelum Anda menyetujui.",
    },
    {
      icon: BadgeCheck,
      title: "Selesaikan proses",
      body: "Status, jadwal, dan riwayat tercatat di dashboard akun dan dapat Anda pantau kapan saja.",
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
        className={`sticky top-0 z-40 border-b pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] backdrop-blur transition-[background-color,border-color,box-shadow] duration-300 ${
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
          {/* `gap-6` di lg, `gap-8` hanya di xl: dengan enam item dan label dari
              CMS yang bisa lebih panjang, jarak 32px pada 1024px membuat baris
              ini nyaris menyentuh tombol aksi di kanan. */}
          <nav aria-label="Navigasi utama" className="hidden items-center gap-5 whitespace-nowrap text-sm text-slate-600 xl:flex xl:gap-7">
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
              className="-mr-2 inline-flex size-10 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 xl:hidden"
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
              className="absolute inset-x-0 top-full overflow-hidden border-b border-slate-200 bg-white shadow-lg xl:hidden"
            >
              <nav aria-label="Navigasi utama" className="grid gap-0.5 px-4 py-3">
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

      <main id="konten" tabIndex={-1}>
        {/* Hero — satu panggung statis (lihat components/landing/LandingHero.tsx).
            Konten, CTA, dan CMS tetap di sini. Batas kesalahan tetap dipasang
            sebagai jaring pengaman bila render hero gagal tak terduga. */}
        <HeroBoundary
          fallback={
            <HeroDarurat
              judul1={heroJudul1}
              judul2={heroJudul2}
              ctaLabel={accountCta}
              href={accountHref}
            />
          }
        >
          <LandingHero
            eyebrow={c(cms?.heroBadge, "PINDAI · Pinjaman dan Gadai Digital")}
            judul1={heroJudul1}
            judul2={heroJudul2}
            deskripsi={c(
              cms?.heroSub,
              "Kenali pilihan pinjaman, gadai, dan kredit barang, beserta biaya dan ketentuannya.",
            )}
            ctaUtama={{ label: accountCta, href: accountHref, disabled: isLoading }}
            ctaSekunder={{ label: "Pelajari Cara Kerja", onClick: scrollToSteps }}
            mikro="Biaya, ketentuan, dan hasil pengajuan mengikuti produk dan proses verifikasi."
            sudahMasuk={isAuthenticated}
          />
        </HeroBoundary>

        <FactRibbon />

        <PitaAngka />

        {/* Layanan */}
        <section className="relative border-t border-slate-200 bg-slate-50/60">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <Reveal className="max-w-2xl">
              <SectionHeading
                folio="01"
                eyebrow="Tiga skema"
                title={c(cms?.layananJudul, CMS_DEFAULTS.layanan.judul)}
                description={c(cms?.layananSub, CMS_DEFAULTS.layanan.sub)}
              />
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
                  Barang elektronik dan marketplace mitra dengan DP 0%, tenor 1/3/6 bulan, biaya admin 2% (platform dihapus) dipotong di muka, dan cicilan rata dari pokok penuh.
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

        {/* Isi brankas — contoh catatan tiap skema, bisa dipilih satu per satu. */}
        <IsiBrankas />

        {/* Rincian biaya — angka terbuka sejak awal. */}
        <section
          id="biaya"
          className="relative scroll-mt-24 overflow-hidden border-t border-slate-200 bg-slate-50/60"
        >
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <Reveal className="max-w-2xl">
              <SectionHeading
                folio="03"
                eyebrow="Rincian biaya"
                title="Angka terbuka sejak awal"
                description="Setiap potongan dihitung aplikasi dari nominal dan tenor yang Anda pilih. Dana tetap ditangani di luar aplikasi."
              />
            </Reveal>

            <div className="mt-8 grid gap-5 sm:mt-10 sm:gap-6 lg:grid-cols-2">
              <SchemeCard
                badge="Skema harian"
                title="7–28 hari · Rp 100 rb–1 jt"
                body="Untuk kebutuhan jangka pendek. Pelunasan sekali di akhir tenor, dan semua potongan terlihat sejak awal."
                rows={[
                  { label: "Biaya admin 2% (platform dihapus)", value: "2% dari pokok" },
                  { label: "Potongan di muka", value: "Admin 2% + ekspres" },
                  { label: "Bunga flat", value: "30% dari pokok" },
                ]}
                stats={[
                  { to: 2, suffix: "%", label: "potongan di muka" },
                  { to: 30, suffix: "%", label: "bunga" },
                  { to: 130, suffix: "%", label: "total kewajiban" },
                ]}
              />
              <SchemeCard
                delay={0.12}
                badge="Skema bulanan"
                title="1/3/6 bulan · hingga Rp 10 jt"
                body="Cicilan rata dari pokok penuh: angsuran berisi pokok dan bunga; biaya tenor dipotong di muka."
                rows={[
                  { label: "Biaya admin 2% (platform dihapus)", value: "2% dipotong di muka" },
                  { label: "Biaya admin cicilan (setiap pembayaran)", value: "2% per bayar" },
                  { label: "Bunga flat per bulan (semua tenor)", value: "tarif akun · bawaan 30%" },
                ]}
                stats={[
                  { to: 2, suffix: "%", label: "biaya di muka" },
                  { to: 30, suffix: "%", label: "bunga per bulan" },
                  { to: 2, suffix: "%", label: "admin cicilan" },
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
        <section
          id="kalkulator"
          className="relative mx-auto w-full max-w-6xl scroll-mt-24 px-4 py-16 sm:px-6 sm:py-20"
        >
          {/* Ambang transisi dari hero gelap ke area terang (full-bleed), lalu pola
              titik samar Deep Emerald (#064E3B) sebagai aksen latar. Keduanya
              dekoratif, `aria-hidden`, dan tidak pernah mencuri pointer. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-0 h-64 w-screen -translate-x-1/2 bg-gradient-to-b from-[#042F2E] via-slate-50 to-slate-100/90"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(#064E3B_1px,transparent_1px)] [background-size:24px_24px] opacity-15"
          />
          <div className="relative grid gap-10 lg:grid-cols-2">
            <Reveal>
              <LiveCalculator tarifBulanan={ketentuanBiaya?.tarifBulanan} />
            </Reveal>
            <div>
              <Reveal>
                <SectionHeading
                  folio="04"
                  eyebrow="Alur pengajuan"
                  title="Cara kerja"
                  description="Lima langkah, dengan angka yang sama seperti yang Anda lihat di kalkulator."
                />
              </Reveal>
              <div id="cara-kerja" className="relative mt-8 scroll-mt-24">
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
                  Seluruh angka berikut adalah <b className="font-semibold text-slate-900">perhitungan ledger internal</b> dari pencatatan PINDAI. Skema harian memotong biaya admin 2% dan biaya ekspres Rp5.000–Rp10.000 di muka bila dipilih saat mengajukan, dengan total kewajiban 126–140% dari pokok sesuai nominal serta tenor; perpindahan dana ditangani di luar aplikasi. Skema bulanan (1/3/6 bulan, hingga Rp 10 juta) menampilkan DP 0%, biaya 2% yang dipotong di muka dari dana yang diterima (biaya admin pada tenor 3/6, biaya layanan pada tenor 1), dan biaya admin cicilan 2% dari nominal cicilan pada setiap pembayaran bulanan; bunga flat dari pokok penuh mengikuti tarif akun (bawaan 30% per bulan) untuk semua tenor, jadi cicilannya rata dan tidak menurun. Status dan rincian kontrak mengikuti pencatatan pada ledger internal.
                </p>
              </Reveal>
            </div>
          </div>
        </section>

        {/* Keamanan */}
        <section id="keamanan" className="relative scroll-mt-24 border-t border-slate-200 bg-slate-50/60">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <Reveal className="max-w-2xl">
              <SectionHeading
                folio="05"
                eyebrow="Batas yang jelas"
                title="Pencatatan & batas ledger"
                description="Dua kolom ini memisahkan apa yang dikerjakan aplikasi dan apa yang berjalan di luar aplikasi."
              />
            </Reveal>
            <div className="mt-8 grid gap-4 sm:mt-10 lg:grid-cols-2 lg:gap-5">
              <Reveal>
                <div className="h-full rounded-2xl border border-primary/20 bg-white p-5 sm:p-6">
                  <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
                    <BadgeCheck className="size-4" aria-hidden="true" />
                    Dijalankan aplikasi
                  </p>
                  <ul className="mt-4 space-y-3.5">
                    {DIJALANKAN.map((item) => (
                      <li key={item.judul} className="flex gap-3">
                        <span
                          aria-hidden="true"
                          className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-slate-900">
                            {item.judul}
                          </span>
                          <span className="mt-0.5 block text-xs leading-5 text-slate-600">
                            {item.isi}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>

              <Reveal delay={0.1}>
                <div className="h-full rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-5 sm:p-6">
                  <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    <span aria-hidden="true" className="h-px w-4 bg-slate-400" />
                    Di luar aplikasi
                  </p>
                  <ul className="mt-4 space-y-3.5">
                    {DI_LUAR_APLIKASI.map((item) => (
                      <li key={item.judul} className="flex gap-3">
                        <span
                          aria-hidden="true"
                          className="mt-1.5 size-1.5 shrink-0 rounded-full bg-slate-400"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-slate-700">
                            {item.judul}
                          </span>
                          <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                            {item.isi}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* Tanya jawab */}
        <section id="tanya" className="relative scroll-mt-24 border-t border-slate-200">
          {/* Aksen pola titik di belakang tanya jawab — sama dengan kalkulator,
              supaya transisi dari hero gelap terasa satu rangkaian. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(#064E3B_1px,transparent_1px)] [background-size:24px_24px] opacity-15"
          />
          <div className="relative mx-auto w-full max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
            <Reveal>
              <SectionHeading
                folio="06"
                eyebrow="Tanya jawab"
                title="Pertanyaan yang sering muncul"
                description="Jawaban singkat tentang apa yang dihitung, dicatat, dan tidak dijalankan aplikasi."
              />
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
              <SectionHeading
                folio="07"
                eyebrow="Syarat & Ketentuan"
                title="Ketentuan singkat sebelum mengajukan"
                description="Rangkuman poin terpenting. Versi lengkap dan mengikat ada di halaman Syarat & Ketentuan."
              />
            </Reveal>

            <Reveal delay={0.08} className="mt-8">
              <motion.div
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, amount: 0.2 }}
                variants={{
                  hidden: {},
                  show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } },
                }}
                className="grid gap-4 sm:grid-cols-2"
              >
                {ringkasanSyarat(denda).map((item) => (
                  <motion.div
                    key={item.judul}
                    variants={{
                      hidden: reduce ? { opacity: 0 } : { opacity: 0, y: 16 },
                      show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE_OUT } },
                    }}
                    whileHover={reduce ? undefined : { y: -3 }}
                    className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition-shadow duration-300 hover:shadow-md"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <item.Icon className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{item.judul}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-600">{item.isi}</p>
                    </div>
                  </motion.div>
                ))}
              </motion.div>

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

        {/* Promo — materi kampanye: tumpukan poster yang menegak saat disorot. */}
        <PromoSection sudahMasuk={isAuthenticated} />

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
            <div aria-hidden="true" className="pointer-events-none absolute bottom-5 left-5 hidden size-32 opacity-80 sm:block">
              <svg viewBox="0 0 120 120" className="animate-spin-slow size-full text-[#d8c28c]">
                <defs>
                  <path id="segel-pindai" d="M60,60 m-44,0 a44,44 0 1,1 88,0 a44,44 0 1,1 -88,0" />
                </defs>
                <circle cx="60" cy="60" r="54" fill="none" stroke="currentColor" strokeOpacity="0.3" strokeWidth="0.8" />
                <circle cx="60" cy="60" r="36" fill="none" stroke="currentColor" strokeOpacity="0.22" strokeWidth="0.8" />
                <text fill="currentColor" fontSize="8.5" fontWeight="600" letterSpacing="2.2">
                  <textPath href="#segel-pindai" startOffset="0">
                    LEDGER INTERNAL · PINDAI · TERCATAT
                  </textPath>
                </text>
              </svg>
            </div>
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
          <Reveal className="grid gap-8 sm:grid-cols-3">
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
                {/* Titik biru berdenyut di baris ini DIHAPUS (audit antislop).
                    Ia meminjam bahasa indikator "sedang berjalan" untuk baris
                    keterangan statis tanpa peristiwa apa pun: titik dekoratif
                    (R-31) sekaligus pulsa tanpa ujung (R-19). Labelnya sendiri
                    sudah menjelaskan, jadi tidak perlu penanda. */}
                <li className="flex items-center gap-2">
                  <span className="text-slate-500">Perhitungan ledger internal</span>
                </li>
              </ul>
            </div>
          </Reveal>
          <p className="mt-6 max-w-3xl border-t border-slate-200 pt-5 text-xs leading-5 text-slate-500">
            {PENAFIAN_PINDAI}
          </p>
          <div className="mt-4 flex flex-col items-center justify-between gap-2 pt-2 text-xs text-slate-500 sm:flex-row">
            <span>{HAK_CIPTA_PINDAI}</span>
            <span className="flex flex-wrap items-center justify-center gap-2">
              <span>Perhitungan transparan · Status ledger internal</span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-medium">
                Ketentuan {CONTRACT_TERMS_VERSION}
              </span>
            </span>
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
