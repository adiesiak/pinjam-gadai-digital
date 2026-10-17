import {
  ArrowRight,
  BadgeCheck,
  Calculator,
  FileText,
  LockKeyhole,
  Menu,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";

import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { VaultLogo } from "@/components/VaultLogo";
import { LandingHero } from "@/components/landing/LandingHero";
import { CONTRACT_TERMS_VERSION } from "@/lib/contract";
import { ADMIN_ROUTE, kombinasiAdmin } from "@/lib/routes";

const layanan = [
  {
    href: "/layanan/pinjaman-tunai",
    judul: "Pinjaman tunai",
    ringkasan:
      "Tinjau skema harian dan bulanan, termasuk rincian potongan dan bunga.",
    detail: "Harian 7 hingga 30 hari · Bulanan 1/3/6 bulan",
  },
  {
    href: "/layanan/gadai",
    judul: "Gadai",
    ringkasan: "Catat informasi barang, nilai taksiran, dan skema sewa modal.",
    detail: "Taksiran dan status dicatat di aplikasi",
  },
  {
    href: "/layanan/kredit-barang",
    judul: "Kredit barang",
    ringkasan:
      "Lihat cara aplikasi menghitung pembiayaan barang dan cicilannya.",
    detail: "Pilihan tenor 1, 3, atau 6 bulan",
  },
];

const panduan = [
  {
    href: "/biaya",
    ikon: Calculator,
    judul: "Periksa perhitungan",
    isi: "Ubah nominal dan tenor pada kalkulator sebelum membuat akun.",
  },
  {
    href: "/cara-kerja",
    ikon: FileText,
    judul: "Kenali alurnya",
    isi: "Baca tahapan pengajuan dan batas proses yang dilakukan aplikasi.",
  },
  {
    href: "/keamanan",
    ikon: LockKeyhole,
    judul: "Pahami pencatatan",
    isi: "Ketahui bagaimana akses akun, status, dan data ditangani.",
  },
];

export default function LandingHome() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const navigate = useNavigate();
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
    <div className="min-h-screen w-full overflow-x-hidden bg-[#fbfcfa] text-slate-900">
      <a className="skip-link" href="#konten">
        Lewati ke konten utama
      </a>
      <header className="sticky top-0 z-40 border-b border-[#dce7df] bg-[#fbfcfa]">
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
            <Link className="hover:text-[#065f46]" to="/layanan/pinjaman-tunai">
              Layanan
            </Link>
            <Link className="hover:text-[#065f46]" to="/biaya">
              Biaya
            </Link>
            <Link className="hover:text-[#065f46]" to="/cara-kerja">
              Cara kerja
            </Link>
            <Link className="hover:text-[#065f46]" to="/keamanan">
              Keamanan
            </Link>
            <Link className="hover:text-[#065f46]" to="/faq">
              FAQ
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            {showAdminShortcut && (
              <Link
                to={ADMIN_ROUTE}
                aria-label="Masuk admin"
                title="Masuk admin"
                className="inline-flex size-11 items-center justify-center rounded-lg border border-[#d5e1d8] text-[#065f46] transition-colors hover:bg-[#edf4ef] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#065f46]"
              >
                <ShieldCheck className="size-5" aria-hidden="true" />
              </Link>
            )}
            <details className="group relative lg:hidden">
              <summary
                className="flex size-11 cursor-pointer list-none items-center justify-center rounded-lg border border-[#d5e1d8] text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#065f46]"
                aria-label="Buka menu informasi"
              >
                <Menu className="size-5" aria-hidden="true" />
              </summary>
              <nav
                aria-label="Menu informasi"
                className="absolute right-0 top-full z-50 mt-2 grid w-56 gap-1 rounded-xl border border-[#d5e1d8] bg-[#fbfcfa] p-2 text-sm shadow-lg"
              >
                <Link
                  className="rounded-lg px-3 py-3 hover:bg-[#edf4ef]"
                  to="/layanan/pinjaman-tunai"
                >
                  Pinjaman tunai
                </Link>
                <Link
                  className="rounded-lg px-3 py-3 hover:bg-[#edf4ef]"
                  to="/layanan/gadai"
                >
                  Gadai
                </Link>
                <Link
                  className="rounded-lg px-3 py-3 hover:bg-[#edf4ef]"
                  to="/layanan/kredit-barang"
                >
                  Kredit barang
                </Link>
                <Link
                  className="rounded-lg px-3 py-3 hover:bg-[#edf4ef]"
                  to="/biaya"
                >
                  Biaya
                </Link>
                <Link
                  className="rounded-lg px-3 py-3 hover:bg-[#edf4ef]"
                  to="/cara-kerja"
                >
                  Cara kerja
                </Link>
                <Link
                  className="rounded-lg px-3 py-3 hover:bg-[#edf4ef]"
                  to="/keamanan"
                >
                  Keamanan
                </Link>
                <Link
                  className="rounded-lg px-3 py-3 hover:bg-[#edf4ef]"
                  to="/faq"
                >
                  FAQ
                </Link>
              </nav>
            </details>
            <Button
              asChild
              disabled={isLoading}
              className="min-h-11 bg-[#065f46] text-white hover:bg-[#064e3b]"
            >
              <Link to={accountHref}>
                {isLoading ? "Memuat…" : accountLabel}
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main id="konten" tabIndex={-1}>
        <LandingHero
          eyebrow="Informasi layanan PINDAI"
          judul1="Biaya dan status"
          judul2="terlihat sebelum melangkah."
          deskripsi="PINDAI mencatat pilihan pinjaman, gadai, dan kredit barang beserta perhitungannya. Perpindahan dana dan penanganan barang berlangsung di luar aplikasi."
          ctaUtama={{
            label: isLoading ? "Memuat…" : accountLabel,
            href: accountHref,
            disabled: isLoading,
          }}
          ctaSekunder={{
            label: "Lihat kalkulator",
            onClick: () => {
              window.location.assign("/biaya");
            },
          }}
          mikro="Kalkulator memberi ilustrasi berdasarkan nominal dan tenor pilihan, bukan persetujuan atau bukti pembayaran."
          sudahMasuk={isAuthenticated}
        />

        <section
          aria-labelledby="layanan-title"
          className="border-t border-[#dce7df] bg-[#f4f7f5]"
        >
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-18">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#065f46]">
              Tiga jenis catatan
            </p>
            <h2
              id="layanan-title"
              className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl"
            >
              Pilih layanan untuk ditinjau
            </h2>
            <div className="mt-7 grid gap-4 md:grid-cols-3">
              {layanan.map((item) => (
                <article
                  key={item.href}
                  className="flex h-full flex-col rounded-2xl border border-[#dce7df] bg-[#fbfcfa] p-5 sm:p-6"
                >
                  <h3 className="text-lg font-semibold">{item.judul}</h3>
                  <p className="mt-2 flex-1 text-sm leading-6 text-slate-600">
                    {item.ringkasan}
                  </p>
                  <p className="mt-4 border-t border-[#e8eee9] pt-3 text-xs font-medium text-slate-600">
                    {item.detail}
                  </p>
                  <Link
                    className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#064e3b] hover:text-[#047857] focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#065f46]"
                    to={item.href}
                  >
                    Lihat rincian{" "}
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section
          aria-labelledby="panduan-title"
          className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-18"
        >
          <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#065f46]">
                Sebelum mengajukan
              </p>
              <h2
                id="panduan-title"
                className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl"
              >
                Mulai dari informasi yang Anda perlukan.
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Periksa simulasi, pahami alur, dan baca batas sistem. Keputusan
                pengajuan tetap ditinjau tim PINDAI.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button
                  asChild
                  className="min-h-11 bg-[#065f46] text-white hover:bg-[#064e3b]"
                >
                  <Link to="/biaya">Buka kalkulator</Link>
                </Button>
                <Button asChild variant="outline" className="min-h-11">
                  <Link to="/syarat-ketentuan">Baca syarat</Link>
                </Button>
              </div>
            </div>
            <ul className="divide-y divide-slate-200 border-y border-[#dce7df]">
              {panduan.map(({ href, ikon: Icon, judul, isi }) => (
                <li key={href}>
                  <Link
                    to={href}
                    className="flex min-h-20 items-start gap-4 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#065f46]"
                  >
                    <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#e5f2e9] text-[#064e3b]">
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

        <section className="border-y border-[#dce7df] bg-[#f4f7f5]">
          <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex items-start gap-3">
              <BadgeCheck
                className="mt-0.5 size-5 shrink-0 text-[#065f46]"
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
              className="min-h-11 shrink-0 self-start text-sm font-semibold text-[#064e3b] underline underline-offset-4 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#065f46] sm:self-center"
            >
              Baca pertanyaan umum
            </Link>
          </div>
        </section>
      </main>

      <footer className="bg-[#fbfcfa]">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <Link to="/" className="inline-flex items-center gap-2.5">
              <VaultLogo size={30} />
              <span className="text-sm font-semibold tracking-[0.16em]">
                PINDAI
              </span>
            </Link>
            <p className="mt-3 max-w-md text-xs leading-5 text-slate-600">
              Aplikasi pencatatan pinjaman, gadai, dan kredit barang.
              Perpindahan dana serta penanganan barang berada di luar aplikasi.
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
            <Link to="/syarat-ketentuan">Syarat &amp; Ketentuan</Link>
          </nav>
          <p className="text-xs text-slate-500 md:col-span-2">
            © 2026 PINDAI · Ketentuan {CONTRACT_TERMS_VERSION}
          </p>
        </div>
      </footer>
    </div>
  );
}
