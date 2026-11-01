import { Check, ChevronDown, Eye, LayoutDashboard, LogOut, ShieldCheck } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router";

import { useAuth } from "@/hooks/use-auth";
import { ADMIN_ROUTE } from "@/lib/routes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Ruang kerja yang bisa dibuka akun ini, dengan penanda mode yang sedang aktif. */
export function RoleDashboardMenu() {
  const { isAuthenticated, isLoading, signOut, user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const role = user?.role;

  /**
   * Mode yang sedang terbuka dibaca dari ALAMAT halaman, bukan dari role akun.
   * Akibatnya admin yang sedang bekerja di panel melihat "Mode Admin" aktif dan
   * tombol pulang ke ruang nasabah, dan sebaliknya — satu sakelar dua arah,
   * bukan daftar tautan tanpa penanda.
   */
  // `/promo` tetap bagian ruang admin meskipun menu masuknya sekarang ada di
  // panel admin: halaman itu dijaga RequireAdmin dan tidak boleh terbaca
  // sebagai mode nasabah saat dibuka lewat tautan langsung.
  const diAreaAdmin =
    pathname.startsWith(ADMIN_ROUTE) || pathname.startsWith("/promo");
  const diRuangPendana = pathname.startsWith("/penyedia-dana");
  const labelMode = diAreaAdmin
    ? "Mode Admin"
    : diRuangPendana
      ? "Ruang Pendana"
      : "Mode Nasabah";

  const modeNasabah = {
    href: "/dashboard",
    label: "Mode Nasabah",
    // Untuk admin, /dashboard adalah layar pemilih akun uji — bukan ruang
    // pribadinya. Keterangannya karena itu menyebut pekerjaannya, bukan isi
    // dashboard nasabah.
    description:
      role === "admin"
        ? "Buka satu akun nasabah untuk menguji semua alurnya"
        : "Catatan pinjaman, pengajuan, dan verifikasi identitas Anda",
    icon: LayoutDashboard,
  };

  /** Akses lihat saja: akun pendana, pemantau akun bersama (kode akses),
   *  dan admin (untuk pratinjau).
   */
  const ruangPenyediaDana = {
    href: "/penyedia-dana",
    label: "Ruang Pendana",
    description: "Pantau pengajuan nasabah (hanya baca)",
    icon: Eye,
  };

  /** Panel operasional tim — hanya untuk akun admin. */
  const modeAdmin = {
    href: ADMIN_ROUTE,
    label: "Mode Admin",
    description: "Panel operasional: antrean pengajuan, KYC, dan pengaturan sistem",
    icon: ShieldCheck,
  };

  // Editor Promo bukan lagi mode ruang kerja: pintunya ada di menu Konten
  // panel admin. Menu ini tetap tidak menawarkan rute yang pasti memantul.
  const menuSpaces =
    role === "admin"
      ? [modeAdmin, ruangPenyediaDana, modeNasabah]
      : role === "dana" || role === "pengamat"
        ? [ruangPenyediaDana, modeNasabah]
        : [modeNasabah];

  if (isLoading || !isAuthenticated) return null;

  const keluar = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          // Labelnya menyebut mode yang SEDANG terbuka, jadi pemicunya berbunyi
          // seperti sakelar, bukan seperti menu tanpa nama ("Akses Dashboard").
          aria-label={`${labelMode} aktif. Ganti mode ruang kerja PINDAI`}
          className="h-11 gap-1.5 rounded-full px-3 sm:h-9"
        >
          <LayoutDashboard className="size-4" aria-hidden />
          <span className="hidden md:inline">{labelMode}</span>
          <ChevronDown className="size-3.5" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="px-3 py-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
          Ganti mode ruang kerja
        </DropdownMenuLabel>
        {menuSpaces.map(({ href, label, description, icon: Icon }) => {
          const sedangDibuka =
            (href === ADMIN_ROUTE && diAreaAdmin) ||
            (href === "/penyedia-dana" && diRuangPendana) ||
            (href === "/dashboard" && !diAreaAdmin && !diRuangPendana);
          return (
            <DropdownMenuItem key={href} asChild className="cursor-pointer px-3 py-2.5">
              <Link
                to={href}
                className="flex items-start gap-3"
                aria-current={sedangDibuka ? "page" : undefined}
              >
                <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <span className="grid gap-0.5">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    {label}
                    {/* Penanda mode aktif: ikon centang + kalimat "Sedang
                        dibuka", bukan warna saja. */}
                    {sedangDibuka && (
                      <Check className="size-3.5 text-emerald-700" aria-hidden />
                    )}
                  </span>
                  <span className="text-xs leading-4 text-muted-foreground">
                    {sedangDibuka ? "Sedang dibuka" : description}
                  </span>
                </span>
              </Link>
            </DropdownMenuItem>
          );
        })}
        {/* Keluar ada di sini, bukan di kartu profil: di sana tempatnya dipakai
            pintasan ruang, jadi peran pendana/admin tidak punya tombol keluar.
            Menu ini terlihat di kepala bar semua peran dan semua lebar layar. */}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer items-start gap-3 px-3 py-2.5"
          onSelect={() => void keluar()}
        >
          <LogOut className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span className="grid gap-0.5">
            <span className="text-sm font-medium">Keluar</span>
            <span className="text-xs leading-4 text-muted-foreground">
              Akhiri sesi akun di perangkat ini
            </span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
