import { Link, useLocation } from "react-router";

import { FooterBeranda } from "@/components/landing/FooterBeranda";
import { MenuInformasiPonsel } from "@/components/MenuInformasiPonsel";
import { Button } from "@/components/ui/button";
import { VaultLogo } from "@/components/VaultLogo";
import { cn } from "@/lib/utils";

/**
 * Satu tujuan untuk memulai pengajuan dari halaman informasi.
 *
 * Jangan memakai `/auth` tanpa `returnTo`: setelah masuk, pengunjung harus
 * mendarat di formulir, bukan di ringkasan dashboard yang belum tentu ia cari.
 */
export const FORM_HREF = `/auth?returnTo=${encodeURIComponent("/dashboard?tab=form")}`;

const NAVIGASI = [
  { href: "/layanan", label: "Layanan" },
  { href: "/biaya", label: "Biaya" },
  { href: "/cara-kerja", label: "Cara kerja" },
  { href: "/keamanan", label: "Keamanan" },
  { href: "/faq", label: "FAQ" },
] as const;

const MENU_PONSEL = [
  { href: "/layanan", label: "Semua layanan", grup: "Layanan" },
  { href: "/layanan/pinjaman-tunai", label: "Pinjaman tunai", grup: "Layanan" },
  { href: "/layanan/gadai", label: "Gadai", grup: "Layanan" },
  { href: "/layanan/kredit-barang", label: "Kredit barang", grup: "Layanan" },
  { href: "/biaya", label: "Rincian biaya", grup: "Panduan" },
  { href: "/cara-kerja", label: "Cara kerja", grup: "Panduan" },
  { href: "/keamanan", label: "Keamanan", grup: "Panduan" },
  { href: "/faq", label: "Pertanyaan umum", grup: "Panduan" },
  { href: "/", label: "Beranda", grup: "Lainnya" },
  { href: FORM_HREF, label: "Buat akun", grup: "Akun" },
] as const;

function aktif(pathname: string, href: string): boolean {
  if (href === "/layanan") return pathname.startsWith("/layanan");
  return pathname === href;
}

/**
 * Kepala halaman informasi publik.
 *
 * Dulu tiap halaman informasi memasang header sendiri dan tautan navigasinya
 * hanya setinggi teks. Di sini satu header dipakai bersama, dengan sasaran
 * 44px dan penanda halaman aktif yang konsisten.
 */
export function InfoHeader() {
  const { pathname } = useLocation();

  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex min-h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link
          to="/"
          className="inline-flex min-h-11 shrink-0 items-center gap-2.5 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="PINDAI, beranda"
        >
          <VaultLogo size={32} />
          <span className="text-sm font-semibold tracking-[0.16em]">PINDAI</span>
        </Link>

        <nav
          aria-label="Navigasi informasi"
          className="hidden items-center gap-0.5 lg:flex"
        >
          {NAVIGASI.map((tautan) => {
            const halamanAktif = aktif(pathname, tautan.href);
            return (
              <Link
                key={tautan.href}
                to={tautan.href}
                aria-current={halamanAktif ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-lg px-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  halamanAktif
                    ? "font-semibold text-primary underline decoration-2 underline-offset-4"
                    : "text-muted-foreground hover:text-primary",
                )}
              >
                {tautan.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <Button
            asChild
            className="hidden min-h-11 bg-primary text-primary-foreground hover:bg-primary/90 sm:inline-flex"
          >
            <Link to={FORM_HREF}>Buat akun</Link>
          </Button>
          <MenuInformasiPonsel
            tautan={MENU_PONSEL.map((tautan) => ({
              ...tautan,
              aktif:
                tautan.href === "/layanan"
                  ? pathname === "/layanan"
                  : aktif(pathname, tautan.href),
            }))}
            kelasTombol="flex size-11 shrink-0 items-center justify-center rounded-lg border border-border text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            kelasPanel="absolute right-0 top-full z-50 mt-2 grid w-64 max-w-[calc(100vw-2rem)] gap-1 rounded-xl border border-border bg-card p-2 text-sm shadow-lg"
            kelasTautan="rounded-lg px-3 py-3 text-muted-foreground hover:bg-muted hover:text-primary"
            kelasTautanAktif="bg-secondary font-semibold text-primary"
          />
        </div>
      </div>
    </header>
  );
}

/** Footer publik yang sudah memuat alamat, email, dan kanal bantuan resmi. */
export function InfoFooter() {
  return (
    <FooterBeranda deskripsi="Informasi produk, biaya, dan batas layanan PINDAI. Catatan aplikasi bukan bukti transaksi." />
  );
}
