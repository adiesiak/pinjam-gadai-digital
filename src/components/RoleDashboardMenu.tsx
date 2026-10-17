import { Check, ChevronDown, Eye, LayoutDashboard, LogOut, Megaphone, ShieldCheck } from "lucide-react";
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
  const diAreaAdmin = pathname.startsWith(ADMIN_ROUTE);
  const diRuangPendana = pathname.startsWith("/penyedia-dana");
  const diPromo = pathname.startsWith("/promo");
  const labelMode = diAreaAdmin
    ? "Mode Admin"
    : diRuangPendana
      ? "Ruang Pendana"
      : diPromo
        ? "Editor Promo"
        : "Mode Nasabah";

  const modeNasabah = {
    href: "/dashboard",
    label: "Mode Nasabah",
    description: "Catatan pinjaman, pengajuan, dan verifikasi identitas Anda",
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

  /** Ruang pamer promosi singkat (title/subtitle/peringatan/cta/link).
   *  Buka editor, lihat preview 2D canvas langsung, unduh PNG, dan bagikan
   *  ke WhatsApp/Instagram lewat Web Share + deep-link fallback.
   *  Hanya untuk akun admin — ini ruang internal brand, bukan fitur nasabah.
   */
  const ruangPromo = {
    href: "/promo",
    label: "Editor Promo",
    description: "Susun kartu promosi & bagikan ke media sosial",
    icon: Megaphone,
  };

  /** Panel operasional tim — hanya untuk akun admin. */
  const modeAdmin = {
    href: ADMIN_ROUTE,
    label: "Mode Admin",
    description: "Panel operasional: antrean pengajuan, KYC, dan pengaturan sistem",
    icon: ShieldCheck,
  };

  // `/promo` hanya milik admin (rutenya dijaga `RequireAdmin`), jadi tautannya
  // pun tidak ditawarkan ke peran lain — menu tidak boleh menawarkan pintu yang
  // pasti memantul kembali ke dashboard.
  const menuSpaces =
    role === "admin"
      ? [modeAdmin, ruangPromo, ruangPenyediaDana, modeNasabah]
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
          className="h-9 gap-1.5 rounded-full px-3"
        >
          <LayoutDashboard className="size-4" aria-hidden />
          <span className="hidden md:inline">{labelMode}</span>
          <ChevronDown className="size-3.5" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          Ganti mode ruang kerja
        </DropdownMenuLabel>
        {menuSpaces.map(({ href, label, description, icon: Icon }) => {
          const sedangDibuka =
            (href === ADMIN_ROUTE && diAreaAdmin) ||
            (href === "/penyedia-dana" && diRuangPendana) ||
            (href === "/promo" && diPromo) ||
            (href === "/dashboard" && !diAreaAdmin && !diRuangPendana && !diPromo);
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
