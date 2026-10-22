import {
  ArrowRight,
  BadgeCheck,
  Calculator,
  FileText,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { MenuInformasiPonsel } from "@/components/MenuInformasiPonsel";
import { VaultLogo } from "@/components/VaultLogo";
import { PasangAplikasi } from "@/components/landing/PasangAplikasi";
import { LandingHero } from "@/components/landing/LandingHero";
import { DoorprizeRingkas } from "@/components/landing/DoorprizeRingkas";
import { PromoPinjamanAktif } from "@/components/promo/PromoPinjamanAktif";
import { SOROTAN_LAYANAN } from "@/lib/sorotanLayanan";
import { CONTRACT_TERMS_VERSION } from "@/lib/contract";
import { HAK_CIPTA_PINDAI, PENAFIAN_PINDAI } from "@/lib/branding";
import { BiayaBerlaku } from "@/components/landing/BiayaBerlaku";
import { tarifBiayaAman, type TarifBiaya } from "@/lib/loan";
import {
  JUMLAH_KARTU_LAYANAN,
  JUMLAH_PANDUAN,
  KONTEN_LANDING_DEFAULT,
} from "@/lib/landing-cms";
import { ADMIN_ROUTE, kombinasiAdmin } from "@/lib/routes";

/**
 * Tujuan kartu layanan dan panduan. Rute tinggal di kode — CMS hanya mengganti
 * tulisan, bukan arah tautan — jadi urutan di sini harus sama dengan urutan
 * kartu pada `KONTEN_LANDING_DEFAULT`.
 */
const HREF_LAYANAN = [
  "/layanan/pinjaman-tunai",
  "/layanan/gadai",
  "/layanan/kredit-barang",
] as const;

/** Menu ponsel: satu daftar untuk tombol pemicu di header. */
const TAUTAN_MENU = [
  { href: "/jadi-pendana", label: "Jadi pendana" },
  { href: "/layanan/pinjaman-tunai", label: "Pinjaman tunai" },
  { href: "/layanan/gadai", label: "Gadai" },
  { href: "/layanan/kredit-barang", label: "Kredit barang" },
  { href: "/biaya", label: "Biaya" },
  { href: "/cara-kerja", label: "Cara kerja" },
  { href: "/keamanan", label: "Keamanan" },
  { href: "/faq", label: "FAQ" },
  { href: "/aplikasi", label: "Aplikasi Android" },
] as const;

const HREF_PANDUAN = [
  { href: "/biaya", ikon: Calculator },
  { href: "/cara-kerja", ikon: FileText },
  { href: "/keamanan", ikon: LockKeyhole },
] as const;

/**
 * Demo alur pengajuan dimuat saat hampir terlihat, bukan saat beranda dibuka.
 *
 * Komponen ini menarik `framer-motion` (puluhan KB) untuk animasi contoh yang
 * baru berguna setelah pengunjung menggulir. Menundanya membuat paint pertama
 * hanya membawa hero dan daftar layanan, sementara animasinya tetap tersedia
 * sebelum bagian itu benar-benar terbaca (`rootMargin` 400px).
 */
const DemoPengajuan = lazy(() =>
  import("@/components/landing/DemoPengajuan").then((m) => ({
    default: m.DemoPengajuan,
  })),
);

function DemoPengajuanTerlihat({ tarif }: { tarif: TarifBiaya }) {
  const wadah = useRef<HTMLDivElement>(null);
  // Peramban tanpa IntersectionObserver langsung menampilkan demo: tidak ada
  // sinyal "hampir terlihat" yang bisa ditunggu di sana.
  const [tampil, setTampil] = useState(
    () => typeof IntersectionObserver === "undefined",
  );

  useEffect(() => {
    const el = wadah.current;
    if (el === null || tampil) return;
    const pengamat = new IntersectionObserver(
      (entri) => {
        if (entri.some((satu) => satu.isIntersecting)) {
          setTampil(true);
          pengamat.disconnect();
        }
      },
      { rootMargin: "400px 0px" },
    );
    pengamat.observe(el);
    return () => pengamat.disconnect();
  }, [tampil]);

  return (
    <div ref={wadah}>
      {tampil ? (
        <Suspense fallback={<div aria-hidden="true" className="h-96" />}>
          <DemoPengajuan tarif={tarif} />
        </Suspense>
      ) : null}
    </div>
  );
}

export default function LandingHome() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const navigate = useNavigate();
  /**
   * Teks beranda dari CMS. Selama query belum termuat (atau server belum punya
   * baris CMS), bawaan dari `lib/landing-cms` yang dirender — halaman tidak
   * pernah kosong hanya untuk menunggu teks.
   */
  const cms = useQuery(api.announcements.getPublic);
  const konten = cms?.landing ?? KONTEN_LANDING_DEFAULT;
  /**
   * Tarif potongan di muka dari Pengaturan Parameter Bisnis. Beranda memakai
   * angka yang sama dengan kalkulator `/biaya`, formulir pengajuan, dan demo
   * alur, supaya materi kampanye tidak menjanjikan tarif lama. Selama query
   * belum termuat, tarif bawaan yang dirender, bukan angka kosong.
   */
  const ketentuanBiaya = useQuery(api.system.getKetentuanBiaya, {});
  const tarif = tarifBiayaAman(ketentuanBiaya?.tarifBiaya);
  /** Teks CMS dipasangkan dengan rute/ikon tetap; CMS tidak mengubah tujuan. */
  const layanan = Array.from({ length: JUMLAH_KARTU_LAYANAN }, (_, i) => ({
    ...konten.layanan[i],
    href: HREF_LAYANAN[i],
  }));
  const panduan = Array.from({ length: JUMLAH_PANDUAN }, (_, i) => ({
    ...HREF_PANDUAN[i],
    ...konten.panduan[i],
  }));
  /**
   * Pintu admin TIDAK muncul di markup sampai diminta: 5× ketuk logo (jeda
   * maksimal 3 detik antar ketukan) atau Ctrl+Alt+A. Rute panel sendiri tetap
   * tidak pernah dirender sebelum pintu ini dibuka, dan gerbang sesungguhnya
   * ada di halaman masuk (kata sandi + TOTP).
   */
  const [showAdminShortcut, setShowAdminShortcut] = useState(false);
  const logoClickCountRef = useRef(0);
  const logoClickTimerRef = useRef<number | null>(null);

  const handleBrandClick = () => {
    if (showAdminShortcut) return;
    if (logoClickTimerRef.current !== null) window.clearTimeout(logoClickTimerRef.current);
    logoClickCountRef.current += 1;
    if (logoClickCountRef.current >= 5) {
      logoClickCountRef.current = 0;
      logoClickTimerRef.current = null;
      setShowAdminShortcut(true);
      return;
    }
    logoClickTimerRef.current = window.setTimeout(() => {
      logoClickCountRef.current = 0;
      logoClickTimerRef.current = null;
    }, 3000);
  };

  useEffect(() => {
    return () => {
      if (logoClickTimerRef.current !== null) window.clearTimeout(logoClickTimerRef.current);
    };
  }, []);

  // Jalur kedua: Ctrl+Alt+A. Diabaikan saat fokus di medan isian supaya tidak
  // mencuri pintasan dari pengguna yang sedang mengetik.
  useEffect(() => {
    const bukaAdmin = (event: KeyboardEvent) => {
      if (!kombinasiAdmin(event)) return;
      const sasaran = event.target as HTMLElement | null;
      if (
        sasaran !== null &&
        (sasaran.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(sasaran.tagName))
      ) {
        return;
      }
      event.preventDefault();
      navigate(`/auth?returnTo=${encodeURIComponent(ADMIN_ROUTE)}`);
    };
    window.addEventListener("keydown", bukaAdmin);
    return () => window.removeEventListener("keydown", bukaAdmin);
  }, [navigate]);
  const accountHref =
    isAuthenticated && user?.role === "admin"
      ? ADMIN_ROUTE
      : isAuthenticated
        ? "/dashboard"
        : "/auth";
  const accountLabel = isAuthenticated ? "Buka dashboard" : "Buat akun";

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-background text-foreground">
      <a className="skip-link" href="#konten">
        Lewati ke konten utama
      </a>
      <header className="sticky top-0 z-40 border-b border-border bg-background">
        <div className="mx-auto flex min-h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link
            to="/"
            aria-label="PINDAI, beranda"
            onClick={handleBrandClick}
            className="flex shrink-0 items-center gap-2.5"
          >
            <VaultLogo size={34} />
            <span className="text-sm font-semibold tracking-[0.16em]">
              PINDAI
            </span>
          </Link>
          <nav
            aria-label="Navigasi utama"
            className="hidden items-center gap-5 text-sm text-slate-600 lg:flex"
          >
            <Link className="hover:text-primary" to="/layanan/pinjaman-tunai">
              Layanan
            </Link>
            <Link className="hover:text-primary" to="/biaya">
              Biaya
            </Link>
            <Link className="hover:text-primary" to="/cara-kerja">
              Cara kerja
            </Link>
            <Link className="hover:text-primary" to="/keamanan">
              Keamanan
            </Link>
            <Link className="hover:text-primary" to="/faq">
              FAQ
            </Link>
            <Link className="hover:text-primary" to="/aplikasi">
              Aplikasi
            </Link>
            <Link className="font-semibold text-primary hover:text-primary/80" to="/jadi-pendana">
              Jadi pendana
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            {showAdminShortcut && (
              <Link
                to={ADMIN_ROUTE}
                aria-label="Masuk admin"
                title="Masuk admin"
                className="inline-flex size-11 items-center justify-center rounded-lg border border-border text-primary transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ShieldCheck className="size-5" aria-hidden="true" />
              </Link>
            )}
            <MenuInformasiPonsel
              tautan={TAUTAN_MENU}
              kelasTombol="flex size-11 items-center justify-center rounded-lg border border-border text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              kelasPanel="absolute right-0 top-full z-50 mt-2 grid w-56 gap-1 rounded-xl border border-border bg-background p-2 text-sm shadow-lg"
              kelasTautan="rounded-lg px-3 py-3 hover:bg-muted"
            />
            {isLoading ? (
              <Button
                disabled
                aria-busy="true"
                className="min-h-11 bg-primary text-primary-foreground"
              >
                Memuat…
              </Button>
            ) : (
              <Button
                asChild
                className="min-h-11 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Link to={accountHref}>{accountLabel}</Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      <main id="konten" tabIndex={-1}>
        <LandingHero
          eyebrow={konten.heroEyebrow}
          judul1={konten.heroJudul1}
          judul2={konten.heroJudul2}
          deskripsi={konten.heroDeskripsi}
          ctaUtama={{
            label: isLoading ? "Memuat…" : accountLabel,
            href: accountHref,
            disabled: isLoading,
          }}
          ctaSekunder={{
            label: konten.heroCtaSekunder,
            href: "/biaya",
          }}
          mikro={konten.heroMikro}
          sudahMasuk={isAuthenticated}
        />

        {/* Kampanye hanya muncul saat admin benar-benar menerbitkannya. */}
        <PromoPinjamanAktif
          penempatan="beranda"
          className="mx-auto mt-8 w-full max-w-6xl px-4 sm:px-6"
        />

        <section
          aria-labelledby="layanan-title"
          className="border-t border-border bg-muted"
        >
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-18">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              {konten.layananEyebrow}
            </p>
            <h2
              id="layanan-title"
              className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl"
            >
              {konten.layananJudul}
            </h2>
            <div className="mt-7 grid gap-4 md:grid-cols-3">
              {layanan.map((item, i) => {
                // Angka utama tiap kartu datang dari konstanta mesin, sehingga
                // tiga kartu tidak lagi tampak seragam tanpa isi.
                const sorotan = SOROTAN_LAYANAN[i];
                return (
                  <article
                    key={item.href}
                    className="shadow-kartu flex h-full flex-col rounded-kartu border border-border bg-card p-5 sm:p-6"
                  >
                    <h3 className="text-lg font-semibold">{item.judul}</h3>
                    <p className="mt-4 font-display text-3xl leading-none tabular-nums text-slate-900">
                      {sorotan.angka}
                      <span className="ml-1.5 text-sm font-medium text-slate-600">
                        {sorotan.satuan}
                      </span>
                    </p>
                    <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
                      {sorotan.label}
                    </p>
                    <p className="mt-3 flex-1 text-sm leading-6 text-slate-600">
                      {item.ringkasan}
                    </p>
                    <p className="mt-4 border-t border-border pt-3 text-xs font-medium text-muted-foreground">
                      {item.detail}
                    </p>
                    <Link
                      className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:text-primary/80 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      to={item.href}
                    >
                      {konten.layananCta}
                    </Link>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <BiayaBerlaku tarif={tarif} />

        <DemoPengajuanTerlihat tarif={tarif} />

        <DoorprizeRingkas
          accountHref={accountHref}
          sudahMasuk={isAuthenticated}
        />

        <section
          aria-labelledby="panduan-title"
          className="pindai-bawah-lipatan mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-18"
        >
          <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                {konten.panduanEyebrow}
              </p>
              <h2
                id="panduan-title"
                className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl"
              >
                {konten.panduanJudul}
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                {konten.panduanDeskripsi}
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button
                  asChild
                  className="min-h-11 bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Link to="/biaya">{konten.panduanCtaKalkulator}</Link>
                </Button>
                <Button asChild variant="outline" className="min-h-11">
                  <Link to="/syarat-ketentuan">
                    {konten.panduanCtaSyarat}
                  </Link>
                </Button>
              </div>
            </div>
            <ul className="divide-y divide-border border-y border-border">
              {panduan.map(({ href, ikon: Icon, judul, isi }) => (
                <li key={href}>
                  <Link
                    to={href}
                    className="flex min-h-20 items-start gap-4 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">
                        {judul}
                      </span>
                      <span className="mt-1 block text-sm leading-6 text-slate-600">
                        {isi}
                      </span>
                    </span>
                    <ArrowRight
                      className="mt-1 size-4 shrink-0 text-slate-500"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <div className="pindai-bawah-lipatan">
          <PasangAplikasi />
        </div>

        <section className="border-y border-border bg-background">
          <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex items-start gap-3">
              <BadgeCheck
                className="mt-0.5 size-5 shrink-0 text-primary"
                aria-hidden="true"
              />
              <p className="max-w-2xl text-sm leading-6 text-slate-700">
                Semua angka pada kalkulator adalah ilustrasi dari aturan yang
                tercantum. Persetujuan dan perpindahan dana tidak dilakukan
                otomatis oleh aplikasi.
              </p>
            </div>
            <Link
              to="/faq"
              className="min-h-11 shrink-0 self-start text-sm font-semibold text-primary underline underline-offset-4 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:self-center"
            >
              Baca pertanyaan umum
            </Link>
          </div>
        </section>
      </main>

      <footer className="bg-background">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <Link to="/" className="inline-flex items-center gap-2.5">
              <VaultLogo size={30} />
              <span className="text-sm font-semibold tracking-[0.16em]">
                PINDAI
              </span>
            </Link>
            <p className="mt-3 max-w-md text-xs leading-5 text-slate-600">
              {konten.footerDeskripsi}
            </p>
          </div>
          <nav
            aria-label="Tautan informasi"
            className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600"
          >
            <Link to="/biaya">Biaya</Link>
            <Link to="/cara-kerja">Cara kerja</Link>
            <Link to="/keamanan">Keamanan</Link>
            <Link to="/faq">FAQ</Link>
            <Link to="/aplikasi">Aplikasi Android</Link>
            <Link to="/syarat-ketentuan">Syarat &amp; Ketentuan</Link>
            <Link to="/jadi-pendana">Jadi pendana</Link>
          </nav>
          <p className="max-w-2xl text-xs leading-5 text-slate-500 md:col-span-2">
            {PENAFIAN_PINDAI}
          </p>
          <p className="text-xs text-slate-500 md:col-span-2">
            {HAK_CIPTA_PINDAI} · Ketentuan {CONTRACT_TERMS_VERSION}
          </p>
        </div>
      </footer>
    </div>
  );
}
