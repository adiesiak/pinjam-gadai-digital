import {
  BadgeCheck,
  Calculator,
  ChevronDown,
  FileText,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MenuInformasiPonsel } from "@/components/MenuInformasiPonsel";
import { SkipLink } from "@/components/SkipLink";
import { VaultLogo } from "@/components/VaultLogo";
import { BatasLanding } from "@/components/landing/BatasLanding";
import { LandingHero } from "@/components/landing/LandingHero";
import { PromoPinjamanAktif } from "@/components/promo/PromoPinjamanAktif";
import { catatPeristiwaLanding } from "@/lib/analitikLanding";
import { SOROTAN_LAYANAN } from "@/lib/sorotanLayanan";
import { ProdukBeranda } from "@/components/landing/ProdukBeranda";
import { CtaLengket } from "@/components/landing/CtaLengket";
import { DokumenPerlindungan } from "@/components/landing/DokumenPerlindungan";
import { FaqBeranda } from "@/components/landing/FaqBeranda";
import { FooterBeranda } from "@/components/landing/FooterBeranda";
import { KepercayaanBeranda } from "@/components/landing/KepercayaanBeranda";
import { PanduanBeranda } from "@/components/landing/PanduanBeranda";
import { GelombangPattern } from "@/components/landing/KartuHeroPindai";
import { KalkulatorBeranda } from "@/components/landing/KalkulatorBeranda";
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
  { href: "/layanan/pinjaman-tunai", label: "Pinjaman tunai", grup: "Produk" },
  { href: "/layanan/gadai", label: "Gadai", grup: "Produk" },
  { href: "/layanan/kredit-barang", label: "Kredit barang", grup: "Produk" },
  { href: "/ppob", label: "Pulsa & PPOB", grup: "Produk" },
  {
    href: "/pinjaman/syariah",
    label: "Akad syariah",
    grup: "Produk",
  },
  { href: "/biaya", label: "Biaya", grup: "Panduan" },
  { href: "/cara-kerja", label: "Cara kerja", grup: "Panduan" },
  { href: "/keamanan", label: "Keamanan", grup: "Panduan" },
  { href: "/faq", label: "FAQ", grup: "Panduan" },
  { href: "/aplikasi", label: "Aplikasi Android", grup: "Lainnya" },
] as const;

/** Tautan desktop: enam tujuan, produk masuk ke dropdown. */
const TAUTAN_NAV = [
  { href: "/biaya", label: "Biaya" },
  { href: "/cara-kerja", label: "Cara kerja" },
  { href: "/keamanan", label: "Keamanan" },
  { href: "/faq", label: "FAQ" },
  { href: "/aplikasi", label: "Aplikasi" },
] as const;

const PRODUK_NAV = [
  {
    href: "/layanan/pinjaman-tunai",
    label: "Pinjaman tunai",
    isi: "Skema harian atau cicilan bulanan.",
  },
  { href: "/layanan/gadai", label: "Gadai", isi: "Taksiran barang dan sewa modal." },
  {
    href: "/layanan/kredit-barang",
    label: "Kredit barang",
    isi: "Cicilan untuk barang yang dipilih.",
  },
  { href: "/ppob", label: "Pulsa & PPOB", isi: "Pulsa, data, dan tagihan." },
  {
    href: "/pinjaman/syariah",
    label: "Akad syariah",
    isi: "Murabahah dan rahn tanpa bunga.",
  },
] as const;

const HREF_PANDUAN = [
  { href: "/biaya", ikon: Calculator },
  { href: "/cara-kerja", ikon: FileText },
  { href: "/keamanan", ikon: LockKeyhole },
] as const;

/**
 * Demo alur pengajuan dibuka atas permintaan, bukan langsung dirender.
 *
 * Demo memuat `framer-motion` dan lima layar animasi; isinya berguna, tetapi
 * tidak perlu menjadi tembok panjang di antara kalkulator dan dokumen. Tombol
 * "Lihat demo" memuatnya saat dibutuhkan, lalu pengunjung bisa menutupnya lagi.
 */
const DemoPengajuan = lazy(() =>
  import("@/components/landing/DemoPengajuan").then((m) => ({
    default: m.DemoPengajuan,
  })),
);

function DemoPengajuanTerlihat({ tarif }: { tarif: TarifBiaya }) {
  const [tampil, setTampil] = useState(false);

  if (!tampil) {
    return (
      <section
        aria-labelledby="demo-ringkas-judul"
        className="pindai-bawah-lipatan border-t border-border bg-background"
      >
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-12">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold-foreground">
              Demo alur
            </p>
            <h2
              id="demo-ringkas-judul"
              className="mt-2 font-judul text-2xl leading-tight tracking-tight text-foreground sm:text-3xl"
            >
              Lima layar, satu pengajuan.
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Lihat contoh dari masuk dengan WhatsApp sampai catatan pinjaman
              tersimpan. Buka saat Anda ingin memeriksa detailnya.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              catatPeristiwaLanding({ nama: "landing_demo", aksi: "buka" });
              setTampil(true);
            }}
            className="min-h-11 shrink-0"
          >
            Lihat demo
          </Button>
        </div>
      </section>
    );
  }

  return (
    <div>
      <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            catatPeristiwaLanding({ nama: "landing_demo", aksi: "tutup" });
            setTampil(false);
          }}
          className="min-h-11"
        >
          Tutup demo
        </Button>
      </div>
      <BatasLanding nama="demo">
        <Suspense fallback={<div aria-hidden="true" className="h-96" />}>
          <DemoPengajuan tarif={tarif} />
        </Suspense>
      </BatasLanding>
    </div>
  );
}

export default function LandingHome() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
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
  /** Tarif bulanan untuk kalkulator beranda; kosong → tarif bawaan. */
  const tarifBulanan = ketentuanBiaya?.tarifBulanan;
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
    if (logoClickTimerRef.current !== null)
      window.clearTimeout(logoClickTimerRef.current);
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
      if (logoClickTimerRef.current !== null)
        window.clearTimeout(logoClickTimerRef.current);
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
  const formHref = `/auth?returnTo=${encodeURIComponent("/dashboard?tab=form")}`;
  const accountHref =
    isAuthenticated && user?.role === "admin"
      ? ADMIN_ROUTE
      : isAuthenticated
        ? "/dashboard"
        : formHref;
  // Tamu melihat aksi yang sebenarnya mereka tuju; satu klik langsung ke
  // halaman masuk dengan tujuan formulir yang sudah terisi.
  const accountLabel = isAuthenticated ? "Buka dashboard" : "Ajukan pinjaman";
  /**
   * Pengguna lama butuh pintu "Masuk" yang tenang, bukan hanya CTA pengajuan.
   * Di ponsel pintu itu masuk ke menu karena ruang header habis; di layar lebih
   * lebar ia tampil sebagai tautan teks di samping CTA utama.
   */
  const tautanMenu = isAuthenticated
    ? TAUTAN_MENU
    : [{ href: "/auth", label: "Masuk", grup: "Akun" }, ...TAUTAN_MENU];

  return (
    // Ruang bawah ekstra di ponsel: bilah aksi lengket tidak boleh menutupi
    // baris terakhir footer.
    <div className="min-h-screen w-full overflow-x-hidden scroll-pb-28 bg-background pb-24 text-foreground sm:scroll-pb-0 sm:pb-0">
      <SkipLink />
      <header className="sticky top-0 z-40 border-b border-border bg-background">
        <div className="mx-auto flex min-h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link
            to="/"
            aria-label="PINDAI, beranda"
            onClick={handleBrandClick}
            className="flex min-h-11 shrink-0 items-center gap-2.5"
          >
            <VaultLogo size={34} />
            <span className="text-sm font-semibold tracking-[0.16em]">
              PINDAI
            </span>
          </Link>
          <nav
            aria-label="Navigasi utama"
            className="hidden items-center gap-1 whitespace-nowrap text-sm text-muted-foreground lg:flex"
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={`inline-flex min-h-11 items-center gap-1 rounded-sm px-2.5 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                    pathname.startsWith("/layanan") ||
                    pathname.startsWith("/pinjaman") ||
                    pathname === "/ppob"
                      ? "text-primary"
                      : ""
                  }`}
                >
                  Produk
                  <ChevronDown className="size-4" aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" sideOffset={8} className="w-72 p-2">
                {PRODUK_NAV.map((item) => (
                  <DropdownMenuItem key={item.href} asChild>
                    <Link
                      to={item.href}
                      aria-current={pathname === item.href ? "page" : undefined}
                      className="flex min-h-11 flex-col items-start gap-0.5 rounded-lg px-3 py-2.5"
                    >
                      <span className="text-sm font-semibold text-foreground">
                        {item.label}
                      </span>
                      <span className="text-xs leading-5 text-muted-foreground">
                        {item.isi}
                      </span>
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {TAUTAN_NAV.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                aria-current={pathname === item.href ? "page" : undefined}
                className={`inline-flex min-h-11 items-center rounded-sm px-2.5 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                  pathname === item.href ? "text-primary" : ""
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {!isLoading && !isAuthenticated && (
              <Link
                to="/auth"
                className="hidden min-h-11 items-center rounded-sm px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:inline-flex"
              >
                Masuk
              </Link>
            )}
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
            {isLoading ? (
              <Button
                disabled
                aria-busy="true"
                className="min-h-11 bg-primary px-3 text-xs text-primary-foreground sm:px-4 sm:text-sm"
              >
                Memuat…
              </Button>
            ) : (
              <Button
                asChild
                className="min-h-11 bg-primary px-3 text-xs text-primary-foreground hover:bg-primary/90 sm:px-4 sm:text-sm"
              >
                <Link
                  to={accountHref}
                  onClick={() =>
                    catatPeristiwaLanding({
                      nama: "landing_cta",
                      tempat: "header",
                    })
                  }
                >
                  {accountLabel}
                </Link>
              </Button>
            )}
            {/* Menu ponsel diletakkan paling kanan supaya panelnya tumbuh ke kiri
                dari tepi layar, bukan dari tombol yang masih punya tombol aksi
                di sebelah kanan. Tanpa ini, panel 16rem terpotong di layar 375px. */}
            <MenuInformasiPonsel
              tautan={tautanMenu}
              kelasTombol="flex size-11 shrink-0 items-center justify-center rounded-lg border border-border text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              kelasPanel="absolute right-0 top-full z-50 mt-2 grid w-64 max-w-[calc(100vw-2rem)] gap-1 rounded-xl border border-border bg-background p-2 text-sm shadow-lg"
              kelasTautan="rounded-lg px-3 py-3 hover:bg-muted"
            />
          </div>
        </div>
      </header>

      <main id="konten" tabIndex={-1}>
        <LandingHero
          eyebrow={konten.heroEyebrow}
          judul1={konten.heroJudul1}
          judul2={konten.heroJudul2}
          deskripsi={konten.heroDeskripsi}
          ctaUtama={
            isAuthenticated
              ? {
                  label: isLoading ? "Memuat…" : accountLabel,
                  href: accountHref,
                  disabled: isLoading,
                }
              : { label: "Hitung dulu", href: "#kalkulator" }
          }
          ctaSekunder={{
            label: konten.heroCtaSekunder,
            href: "/biaya",
          }}
          mikro={konten.heroMikro}
          sudahMasuk={isAuthenticated}
          onCtaUtamaClick={() =>
            catatPeristiwaLanding({ nama: "landing_cta", tempat: "hero" })
          }
        />

        <KepercayaanBeranda />

        {/* Satu slot kampanye: banner gambar dan promo bunga tidak lagi
            ditumpuk di atas kalkulator. Komponennya menyembunyikan diri bila
            tidak ada kampanye berjalan. */}
        <div className="mx-auto mt-6 w-full max-w-6xl px-4 sm:px-6">
          <BatasLanding nama="promo" cadangan={null}>
            <PromoPinjamanAktif
              penempatan="beranda"
              onAjukan={() => navigate(formHref)}
              className="mt-0"
            />
          </BatasLanding>
        </div>

        {/* Produk, jalur akad, dan banding dibaca sebagai satu keputusan. */}
        <ProdukBeranda
          eyebrow={konten.layananEyebrow}
          judul={konten.layananJudul}
          layanan={layanan}
          sorotan={SOROTAN_LAYANAN}
          tarif={tarif}
          ctaLayanan={konten.layananCta}
        />

        {/* Kalkulator memakai mesin harga yang sama dengan `/biaya`, jadi
            angka di beranda tidak bisa berbeda dari formulir pengajuan. */}
        <KalkulatorBeranda
          judul={konten.kalkulatorJudul}
          deskripsi={konten.kalkulatorDeskripsi}
          tarif={tarif}
          tarifBulanan={tarifBulanan}
          accountHref={accountHref}
          accountLabel={accountLabel}
        />

        <DemoPengajuanTerlihat tarif={tarif} />

        <DokumenPerlindungan
          judul={konten.dokumenJudul}
          deskripsi={konten.dokumenDeskripsi}
        />

        <PanduanBeranda
          eyebrow={konten.panduanEyebrow}
          judul={konten.panduanJudul}
          deskripsi={konten.panduanDeskripsi}
          ctaSyarat={konten.panduanCtaSyarat}
          panduan={panduan}
        />

        <FaqBeranda
          judul={konten.faqJudul}
          deskripsi={konten.faqDeskripsi}
          tarif={tarif}
        />

        {/* Penutup: satu panel, bukan pita teks. Panel ini memakai motif ombak
            yang sama dengan hero sebagai penanda akhir halaman, dan catatan
            kejujuran angka tetap dibawa apa adanya. */}
        <section
          aria-labelledby="penutup-judul"
          className="relative overflow-hidden border-t border-border bg-secondary"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
          >
            <GelombangPattern
              ragam="latar"
              opacity={0.16}
              preserveAspectRatio="xMidYMid slice"
              style={{
                maskImage:
                  "radial-gradient(120% 110% at 100% 0%, rgba(0,0,0,0.9), transparent 64%)",
                WebkitMaskImage:
                  "radial-gradient(120% 110% at 100% 0%, rgba(0,0,0,0.9), transparent 64%)",
              }}
            />
          </div>

          <div className="relative mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 sm:py-20 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:gap-14">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-foreground">
                Sebelum mengajukan
              </p>
              <h2
                id="penutup-judul"
                className="mt-2.5 font-judul text-[1.9rem] leading-[1.1] tracking-tight text-foreground sm:text-[2.5rem]"
              >
                Angkanya dulu,
                <br className="hidden sm:block" /> keputusannya kemudian.
              </h2>
              <p className="mt-4 flex max-w-xl items-start gap-2.5 text-sm leading-6 text-foreground">
                <BadgeCheck
                  className="mt-0.5 size-4 shrink-0 text-primary"
                  aria-hidden="true"
                />
                <span>
                  Semua angka pada kalkulator adalah ilustrasi dari aturan yang
                  tercantum. Persetujuan dan perpindahan dana tidak dilakukan
                  otomatis oleh aplikasi. Pinjaman adalah kewajiban; pastikan
                  kemampuan bayar sebelum mengajukan.
                </span>
              </p>
            </div>

            <div className="rounded-kartu border border-gold/40 bg-card p-5 shadow-kartu">
              <p className="text-sm font-semibold text-foreground">
                Mulai dari hitungan Anda.
              </p>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">
                Nominal dan tenor bisa diubah kapan saja sebelum dikirim.
              </p>
              <Button
                asChild
                className="mt-4 min-h-11 w-full bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Link
                  to={accountHref}
                  onClick={() =>
                    catatPeristiwaLanding({
                      nama: "landing_cta",
                      tempat: "penutup",
                    })
                  }
                >
                  {accountLabel}
                </Link>
              </Button>
              <Link
                to="/biaya"
                className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-4 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Lihat rincian biaya
              </Link>
            </div>
          </div>
        </section>
      </main>

      <FooterBeranda deskripsi={konten.footerDeskripsi} />

      <CtaLengket
        href={accountHref}
        label={accountLabel}
        onClick={() =>
          catatPeristiwaLanding({ nama: "landing_cta", tempat: "lengket" })
        }
      />
    </div>
  );
}
