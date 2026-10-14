import {
  ArrowRight,
  BadgeCheck,
  Calculator,
  FileText,
  LockKeyhole,
  Menu,
  ShieldCheck,
} from "lucide-react";
import { Link } from "react-router";

import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { VaultLogo } from "@/components/VaultLogo";
import { LandingHero } from "@/components/landing/LandingHero";
import { CONTRACT_TERMS_VERSION } from "@/lib/contract";

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
  const accountHref =
    isAuthenticated && user?.role === "admin"
      ? "/admin"
      : isAuthenticated
        ? "/dashboard"
        : "/auth";
  const accountLabel = isAuthenticated ? "Buka dashboard" : "Buat akun";

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <a className="skip-link" href="#konten">
        Lewati ke konten utama
      </a>
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link
            to="/"
            aria-label="PINDAI, beranda"
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
            <Link className="hover:text-slate-950" to="/layanan/pinjaman-tunai">
              Layanan
            </Link>
            <Link className="hover:text-slate-950" to="/biaya">
              Biaya
            </Link>
            <Link className="hover:text-slate-950" to="/cara-kerja">
              Cara kerja
            </Link>
            <Link className="hover:text-slate-950" to="/keamanan">
              Keamanan
            </Link>
            <Link className="hover:text-slate-950" to="/faq">
              FAQ
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <details className="group relative lg:hidden">
              <summary
                className="flex size-11 cursor-pointer list-none items-center justify-center rounded-lg border border-slate-200 text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-800"
                aria-label="Buka menu informasi"
              >
                <Menu className="size-5" aria-hidden="true" />
              </summary>
              <nav
                aria-label="Menu informasi"
                className="absolute right-0 top-full z-50 mt-2 grid w-56 gap-1 rounded-xl border border-slate-200 bg-white p-2 text-sm shadow-lg"
              >
                <Link
                  className="rounded-lg px-3 py-3 hover:bg-slate-50"
                  to="/layanan/pinjaman-tunai"
                >
                  Pinjaman tunai
                </Link>
                <Link
                  className="rounded-lg px-3 py-3 hover:bg-slate-50"
                  to="/layanan/gadai"
                >
                  Gadai
                </Link>
                <Link
                  className="rounded-lg px-3 py-3 hover:bg-slate-50"
                  to="/layanan/kredit-barang"
                >
                  Kredit barang
                </Link>
                <Link
                  className="rounded-lg px-3 py-3 hover:bg-slate-50"
                  to="/biaya"
                >
                  Biaya
                </Link>
                <Link
                  className="rounded-lg px-3 py-3 hover:bg-slate-50"
                  to="/cara-kerja"
                >
                  Cara kerja
                </Link>
                <Link
                  className="rounded-lg px-3 py-3 hover:bg-slate-50"
                  to="/keamanan"
                >
                  Keamanan
                </Link>
                <Link
                  className="rounded-lg px-3 py-3 hover:bg-slate-50"
                  to="/faq"
                >
                  FAQ
                </Link>
              </nav>
            </details>
            <Button
              asChild
              disabled={isLoading}
              className="min-h-11 bg-primary text-white hover:bg-primary/90"
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
          className="border-t border-slate-200 bg-slate-50/70"
        >
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-18">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-800">
              Tiga jenis catatan
            </p>
            <h2
              id="layanan-title"
              className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl"
            >
              Pilih layanan untuk ditinjau
            </h2>
            <div className="mt-7 grid gap-4 md:grid-cols-3">
              {layanan.map((item) => (
                <article
                  key={item.href}
                  className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"
                >
                  <h3 className="text-lg font-semibold">{item.judul}</h3>
                  <p className="mt-2 flex-1 text-sm leading-6 text-slate-600">
                    {item.ringkasan}
                  </p>
                  <p className="mt-4 border-t border-slate-100 pt-3 text-xs font-medium text-slate-600">
                    {item.detail}
                  </p>
                  <Link
                    className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-emerald-900 hover:text-emerald-700"
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
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-800">
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
                  className="min-h-11 bg-primary text-white hover:bg-primary/90"
                >
                  <Link to="/biaya">Buka kalkulator</Link>
                </Button>
                <Button asChild variant="outline" className="min-h-11">
                  <Link to="/syarat-ketentuan">Baca syarat</Link>
                </Button>
              </div>
            </div>
            <ul className="divide-y divide-slate-200 border-y border-slate-200">
              {panduan.map(({ href, ikon: Icon, judul, isi }) => (
                <li key={href}>
                  <Link
                    to={href}
                    className="flex min-h-20 items-start gap-4 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-800"
                  >
                    <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-900">
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

        <section className="border-y border-slate-200 bg-slate-50/70">
          <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex items-start gap-3">
              <BadgeCheck
                className="mt-0.5 size-5 shrink-0 text-emerald-800"
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
              className="min-h-11 shrink-0 self-start text-sm font-semibold text-emerald-900 underline underline-offset-4 sm:self-center"
            >
              Baca pertanyaan umum
            </Link>
          </div>
        </section>
      </main>

      <footer className="bg-white">
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
