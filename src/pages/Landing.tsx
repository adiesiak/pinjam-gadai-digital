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
  MapPin,
  Megaphone,
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
import { api } from "@/convex/_generated/api";
import { CMS_DEFAULTS } from "@/lib/cms-defaults";
import { quoteLoan, TENOR_OPTIONS, type LoanQuote } from "@/lib/loan";
import { formatRupiah, type Rupiah } from "@/lib/money";

/* Logo brankas — sederhana, dua warna. */
function VaultLogo({ size = 36 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-label="Logo PINDAI"
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
  { icon: Lock, label: "Enkripsi SSL 256-bit" },
  { icon: Scale, label: "Jurnal debit–kredit seimbang" },
  { icon: Vault, label: "Barang gadai di brankas custody" },
  { icon: ShieldCheck, label: "Callback pembayaran bertanda tangan" },
  { icon: Calculator, label: "Rupiah bulat, tanpa error float" },
  { icon: Eye, label: "Potongan di muka terbuka" },
] as const;

const QUICK_AMOUNTS = [1_000_000, 5_000_000, 10_000_000, 50_000_000];
const MIN_SLIDER = 100_000;
const MAX_SLIDER = 100_000_000;
const SLIDER_STEPS = 140;

function sliderToRupiah(v: number): Rupiah {
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
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
      <div className="flex items-center gap-2.5">
        <span className="clay-icon-blue inline-flex size-9 items-center justify-center">
          <Calculator className="size-4" strokeWidth={2} />
        </span>
        <h3 className="text-base font-semibold text-slate-900">Simulasi pinjaman</h3>
      </div>

      <div className="mt-6">
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
          max={SLIDER_STEPS}
          value={rupiahToSlider(amount)}
          onChange={(e) => setAmount(sliderToRupiah(Number(e.target.value)))}
          className="mt-3 w-full accent-primary"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {QUICK_AMOUNTS.map((q) => (
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
          {TENOR_OPTIONS.map((t) => (
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
          [
            ["Biaya admin (3%)", formatRupiah(quote.biayaAdmin), false],
            ["Biaya platform (2%)", formatRupiah(quote.biayaPlatform), false],
            ["Bunga (hak Pendana)", formatRupiah(quote.bunga), false],
            ["Dana bersih diterima (95%)", formatRupiah(quote.danaBersihDitransfer), true],
          ] as Array<[string, string, boolean?]>
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
            {formatRupiah(quote.totalKewajibanPelunasan)}
          </dd>
        </div>
      </dl>

      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-full bg-primary" style={{ width: "76.9%" }} />
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        Dana bersih 95% dari pokok — sisanya potongan di muka yang ditampilkan terbuka.
      </p>

      <Button asChild className="mt-5 w-full bg-primary text-white hover:bg-primary/90">
        <Link to="/auth">
          Ajukan pinjaman
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
            <Sparkles className="size-5" />
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
              className="mt-2.5 text-xs font-semibold text-primary hover:text-primary"
            >
              {cta} →
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

  const scrollToCalculator = () => {
    document.getElementById("simulasi")?.scrollIntoView({ behavior: "smooth" });
  };

  const steps = [
    {
      icon: Landmark,
      title: "Ajukan",
      body: "Pilih nominal dan tenor. Rincian potongan dan dana bersih tampil sebelum dikirim.",
    },
    {
      icon: ShieldCheck,
      title: "Verifikasi",
      body: "Tim menelaah pengajuan. Barang gadai dinilai petugas di lokasi Anda.",
    },
    {
      icon: Banknote,
      title: "Cair",
      body: "Dana bersih ke rekening. Pantau jatuh tempo dengan pengingat otomatis.",
    },
  ];

  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* Navbar */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <VaultLogo size={32} />
            <span className="text-base font-semibold tracking-tight">{logoTeks}</span>
          </Link>
          <nav className="hidden items-center gap-8 text-sm text-slate-600 md:flex">
            <a href="#pinjaman" className="transition-colors hover:text-slate-900">
              {c(cms?.nav1, "Pinjaman")}
            </a>
            <a href="#gadai" className="transition-colors hover:text-slate-900">
              {c(cms?.nav2, "Gadai")}
            </a>
            <a href="#simulasi" className="transition-colors hover:text-slate-900">
              {c(cms?.nav3, "Simulasi")}
            </a>
            <a href="#keamanan" className="transition-colors hover:text-slate-900">
              {c(cms?.nav4, "Keamanan")}
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" className="text-slate-600 hover:text-slate-900">
              <Link to="/auth">Masuk</Link>
            </Button>
            <Button asChild className="bg-primary text-white hover:bg-primary/90">
              <Link to="/auth">Daftar</Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto w-full max-w-6xl px-6 pb-20 pt-16 sm:pt-24">
          <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                <Sparkles className="size-3.5 text-primary" />
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
                  className="bg-primary px-6 text-white hover:bg-primary/90"
                >
                  <Link to="/auth">
                    {c(cms?.heroCta1, CMS_DEFAULTS.hero.cta1)}
                    <ArrowRight className="ml-1.5 size-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="border-slate-200 px-6 text-slate-700"
                >
                  <Link to="/auth">{c(cms?.heroCta2, CMS_DEFAULTS.hero.cta2)}</Link>
                </Button>
              </div>
              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-500">
                <li className="flex items-center gap-1.5">
                  <BadgeCheck className="size-4 text-primary" /> Verifikasi berjenjang
                </li>
                <li className="flex items-center gap-1.5">
                  <MapPin className="size-4 text-primary" /> Live location gadai
                </li>
                <li className="flex items-center gap-1.5">
                  <Users className="size-4 text-primary" /> Didanai Pendana terverifikasi
                </li>
              </ul>
            </div>

            {/* Ringkasan angka — pengganti ilustrasi berat */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
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
                  ["Potongan di muka", c(cms?.chip2Nilai, CMS_DEFAULTS.chips.chip2.nilai)],
                  ["Total pelunasan", "130% dari pokok"],
                  ["Biaya admin + platform", "3% + 2%"],
                  ["Tenor", "30 / 60 / 90 hari"],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between py-3 text-sm">
                    <dt className="text-slate-500">{k}</dt>
                    <dd className="font-medium tabular-nums text-slate-900">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 text-xs leading-5 text-slate-500">
                Semua angka dipakai langsung oleh mesin perhitungan PINDAI.
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
                className="flex flex-col rounded-2xl border border-slate-200 bg-white p-7 shadow-sm"
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
                className="flex flex-col rounded-2xl border border-slate-200 bg-white p-7 shadow-sm"
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
        <section id="simulasi" className="mx-auto w-full max-w-6xl px-6 py-20">
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
                Dana berasal dari <b className="font-semibold text-slate-900">Pendana</b>{" "}
                terverifikasi yang menerima{" "}
                <b className="font-semibold text-slate-900">Bunga / Imbal Hasil</b> 30%. PINDAI
                memungut biaya admin 3% dan platform 2%.
              </p>
            </div>
          </div>
        </section>

        {/* Keamanan */}
        <section id="keamanan" className="border-t border-slate-200 bg-slate-50/60">
          <div className="mx-auto w-full max-w-6xl px-6 py-20">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Keamanan &amp; transparansi
              </h2>
              <p className="mt-3 text-base leading-7 text-slate-600">
                Enam hal yang berlaku di setiap transaksi.
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
              Buat akun untuk mengajukan pinjaman atau mendaftar sebagai Pendana.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Button
                asChild
                className="border-0 bg-white px-6 text-primary hover:bg-primary/10"
              >
                <Link to="/auth">Daftar sebagai Peminjam</Link>
              </Button>
              <Button
                asChild
                className="border border-white/40 bg-transparent px-6 text-white hover:bg-white/10"
              >
                <Link to="/pendana">Jadi Pendana</Link>
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
                Pinjam &amp; Gadai Digital — menghubungkan Peminjam dengan Pendana terverifikasi.
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
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
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
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
                  <span className="text-slate-500">Semua sistem normal</span>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-8 flex flex-col items-center justify-between gap-2 border-t border-slate-200 pt-6 text-xs text-slate-400 sm:flex-row">
            <span>© 2026 {logoTeks}. Seluruh hak cipta.</span>
            <span>Potongan 5% · Dana bersih 95% · Pelunasan 130%</span>
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
