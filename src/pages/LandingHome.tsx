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
import { PilihanProdukSection } from "@/components/landing/PilihanProduk";
import { DoorprizeRingkas } from "@/components/landing/DoorprizeRingkas";
import { PromoBungaAktif } from "@/components/promo/PromoBungaAktif";
import { PromoPinjamanAktif } from "@/components/promo/PromoPinjamanAktif";
import { SOROTAN_LAYANAN } from "@/lib/sorotanLayanan";
import { BiayaBerlaku } from "@/components/landing/BiayaBerlaku";
import { BandingProduk } from "@/components/landing/BandingProduk";
import { CtaLengket } from "@/components/landing/CtaLengket";
import { DokumenPerlindungan } from "@/components/landing/DokumenPerlindungan";
import { FaqBeranda } from "@/components/landing/FaqBeranda";
import { FooterBeranda } from "@/components/landing/FooterBeranda";
import { JudulBagian } from "@/components/landing/JudulBagian";
import { GelombangPattern } from "@/components/landing/KartuHeroPindai";
import { KalkulatorBeranda } from "@/components/landing/KalkulatorBeranda";
import { RuangPendanaBeranda } from "@/components/landing/RuangPendanaBeranda";
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
  const accountHref =
    isAuthenticated && user?.role === "admin"
      ? ADMIN_ROUTE
      : isAuthenticated
        ? "/dashboard"
        : "/auth";
  // Tamu melihat aksi yang sebenarnya mereka tuju; satu klik langsung ke
  // halaman masuk dengan tujuan yang sudah terisi.
  const accountLabel = isAuthenticated ? "Buka dashboard" : "Ajukan pinjaman";

  return (
    // Ruang bawah ekstra di ponsel: bilah aksi lengket tidak boleh menutupi
    // baris terakhir footer.
    <div className="min-h-screen w-full overflow-x-hidden bg-background pb-24 text-foreground sm:pb-0">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
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
            className="hidden items-center gap-3 whitespace-nowrap text-[13px] text-slate-600 lg:flex xl:gap-5 xl:text-sm"
          >
            <Link className="hover:text-primary" to="/layanan/pinjaman-tunai">
              Pinjaman tunai
            </Link>
            <Link className="hover:text-primary" to="/layanan/gadai">
              Gadai
            </Link>
            <Link className="hover:text-primary" to="/layanan/kredit-barang">
              Kredit barang
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

        {/* Dua jalur produk dipisah sebelum pengunjung masuk ke formulir:
            konvensional dan syariah punya aturan serta kalkulator sendiri. */}
        <PilihanProdukSection />

        {/* Dua banner kampanye berbagi satu kolom dan satu jarak: kalau hanya
            salah satu yang terbit, tidak ada celah ganda yang tersisa. */}
        <div className="mx-auto mt-8 w-full max-w-6xl space-y-3 px-4 sm:px-6">
          <PromoPinjamanAktif penempatan="beranda" />
          <PromoBungaAktif
            onAjukan={() => navigate("/dashboard?tab=form")}
            labelAksi="Ajukan pinjaman"
          />
        </div>

        {/* Kalkulator memakai mesin harga yang sama dengan `/biaya`, jadi
            angka di beranda tidak bisa berbeda dari formulir pengajuan. */}
        <KalkulatorBeranda
          judul={konten.kalkulatorJudul}
          deskripsi={konten.kalkulatorDeskripsi}
          tarifBulanan={tarifBulanan}
        />

        <section
          aria-labelledby="layanan-title"
          className="border-t border-border bg-muted"
        >
          <div className="mx-auto max-w-6xl px-4 pb-14 pt-10 sm:px-6 sm:pb-18 sm:pt-12">
            <JudulBagian
              id="layanan-title"
              label={konten.layananEyebrow}
              judul={konten.layananJudul}
              className="max-w-2xl border-t-0 pt-0"
            />
            <div className="mt-8 grid gap-4 md:grid-cols-3 md:gap-5">
              {layanan.map((item, i) => {
                // Angka utama tiap kartu datang dari konstanta mesin, sehingga
                // tiga kartu tidak lagi tampak seragam tanpa isi.
                const sorotan = SOROTAN_LAYANAN[i];
                return (
                  <article
                    key={item.href}
                    className="group flex h-full flex-col overflow-hidden rounded-kartu border border-border bg-card transition-colors hover:border-primary/35"
                  >
                    {/* Kepala kartu memuat nama produk dan angka mesin: itu
                        dua hal yang dicari orang lebih dulu, jadi keduanya
                        dinaikkan di atas daftar penjelasan. */}
                    <div className="border-b border-border px-5 pb-4 pt-5">
                      <h3 className="font-judul text-xl leading-snug text-foreground">
                        {item.judul}
                      </h3>
                      <p className="mt-3 flex items-baseline gap-2">
                        <span className="font-judul text-[2.6rem] leading-none tabular-nums text-foreground">
                          {sorotan.angka}
                        </span>
                        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gold-foreground">
                          {sorotan.satuan}
                        </span>
                      </p>
                    </div>
                    <div className="flex flex-1 flex-col px-5 py-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
                        {sorotan.label}
                      </p>
                      <p className="mt-2 flex-1 text-sm leading-6 text-slate-600">
                        {item.ringkasan}
                      </p>
                      <p className="mt-4 border-t border-border pt-3 text-xs font-medium text-muted-foreground">
                        {item.detail}
                      </p>
                    </div>
                    <Link
                      className="flex min-h-12 items-center justify-between border-t border-border px-5 text-sm font-semibold text-primary hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                      to={item.href}
                    >
                      {konten.layananCta}
                      <ArrowRight
                        className="size-4 transition-transform group-hover:translate-x-0.5"
                        aria-hidden="true"
                      />
                    </Link>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <BiayaBerlaku tarif={tarif} />

        <BandingProduk tarif={tarif} />

        <DemoPengajuanTerlihat tarif={tarif} />

        <DokumenPerlindungan
          judul={konten.dokumenJudul}
          deskripsi={konten.dokumenDeskripsi}
        />

        <FaqBeranda
          judul={konten.faqJudul}
          deskripsi={konten.faqDeskripsi}
          tarif={tarif}
        />

        <DoorprizeRingkas
          accountHref={accountHref}
          sudahMasuk={isAuthenticated}
        />

        <section
          aria-labelledby="panduan-title"
          className="pindai-bawah-lipatan mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-18"
        >
          <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start lg:gap-14">
            <div>
              <JudulBagian
                id="panduan-title"
                label={konten.panduanEyebrow}
                judul={konten.panduanJudul}
                deskripsi={konten.panduanDeskripsi}
              />
              <div className="mt-6 flex flex-wrap gap-3">
                <Button
                  asChild
                  className="min-h-11 bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Link to="/biaya">{konten.panduanCtaKalkulator}</Link>
                </Button>
                <Button asChild variant="outline" className="min-h-11">
                  <Link to="/syarat-ketentuan">{konten.panduanCtaSyarat}</Link>
                </Button>
              </div>
            </div>
            <ul className="divide-y divide-border overflow-hidden rounded-kartu border border-border bg-card">
              {panduan.map(({ href, ikon: Icon, judul, isi }) => (
                <li key={href}>
                  <Link
                    to={href}
                    className="group flex min-h-24 items-start gap-4 px-4 py-4 transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:px-5"
                  >
                    <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
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
                      className="mt-2.5 size-4 shrink-0 text-slate-500 transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <RuangPendanaBeranda />

        <div className="pindai-bawah-lipatan">
          <PasangAplikasi />
        </div>

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
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold-foreground">
                Sebelum mengajukan
              </p>
              <h2
                id="penutup-judul"
                className="mt-2.5 font-judul text-[1.9rem] leading-[1.1] tracking-tight text-foreground sm:text-[2.5rem]"
              >
                Angkanya dulu,
                <br className="hidden sm:block" /> keputusannya kemudian.
              </h2>
              <p className="mt-4 flex max-w-xl items-start gap-2.5 text-sm leading-6 text-slate-700">
                <BadgeCheck
                  className="mt-0.5 size-4 shrink-0 text-primary"
                  aria-hidden="true"
                />
                <span>
                  Semua angka pada kalkulator adalah ilustrasi dari aturan yang
                  tercantum. Persetujuan dan perpindahan dana tidak dilakukan
                  otomatis oleh aplikasi.
                </span>
              </p>
            </div>

            <div className="rounded-kartu border border-gold/40 bg-card p-5 shadow-kartu">
              <p className="text-sm font-semibold text-foreground">
                Mulai dari hitungan Anda.
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                Nominal dan tenor bisa diubah kapan saja sebelum dikirim.
              </p>
              <div className="mt-4 grid gap-2">
                <Button
                  asChild
                  className="min-h-11 bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Link to={accountHref}>{accountLabel}</Link>
                </Button>
                <Button asChild variant="outline" className="min-h-11">
                  <Link to="/biaya">Hitung biaya dulu</Link>
                </Button>
              </div>
              <Link
                to="/faq"
                className="mt-2 inline-flex min-h-11 items-center text-xs font-semibold text-primary underline underline-offset-4 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Baca pertanyaan umum
              </Link>
            </div>
          </div>
        </section>
      </main>

      <FooterBeranda deskripsi={konten.footerDeskripsi} />

      <CtaLengket href={accountHref} label={accountLabel} />
    </div>
  );
}
