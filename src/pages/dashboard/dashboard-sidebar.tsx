import { motion } from "framer-motion";
import { ChevronDown, LogOut, Wallet } from "lucide-react";

import { StatusKycBadge } from "@/components/StatusKycBadge";
import { Button } from "@/components/ui/button";
import type { StatusKyc } from "@/lib/kycStatus";
import { fadeUpItem, staggerContainer } from "@/lib/motion";

import { DashboardTabNav, type TabBadge } from "./dashboard-tab-nav";

/**
 * Pintasan ruang untuk peran NON-peminjam di kartu profil.
 *
 * Admin tidak ada di sini dan tidak punya grup menu di sidebar ini: pintu ke
 * panel admin cukup satu, yaitu menu profil di bar atas (`RoleDashboardMenu`),
 * dan aksesnya dijaga di server. Pintasan pendana tetap ada karena ruangnya
 * memang halaman lain, bukan bagian dashboard nasabah.
 *
 * Panel admin tidak berada di `/admin`: rutenya disamarkan di `lib/routes.ts`.
 */
const ROLE_LINKS: Record<string, { label: string; icon: React.ReactNode; href: string }> = {
  // Nilai peran yang benar-benar tersimpan adalah `dana`; `penyedia-dana` adalah
  // nama rute. Keduanya dipetakan supaya akun pendana tetap mendapat pintasannya.
  dana: { label: "Dashboard Dana", icon: <Wallet className="size-4" />, href: "/penyedia-dana" },
  "penyedia-dana": { label: "Dashboard Dana", icon: <Wallet className="size-4" />, href: "/penyedia-dana" },
};

/**
 * Sisi kiri dashboard nasabah (layar lebar): kartu profil kecil, lima menu
 * (Akun mencakup profil & KYC), menu tahap KYC selama identitas belum disetujui,
 * lalu Keluar di bawah.
 *
 * Peran admin/pendana tidak dibawa ke menu peminjam: mereka memakai pintasan
 * ruangnya sendiri di kartu profil, dan pintu panel admin ada di menu profil
 * bar atas. Di layar sempit kolom ini tidak dirender — navigasinya pindah ke
 * bilah bawah (`DashboardBottomNav`).
 */
export function DashboardSidebar({
  greetingName,
  badges,
  activeTab,
  onTabChange,
  onSignOut,
  /** Status KYC kanonik; `null` = belum terbaca (lencana disembunyikan). */
  kycStatus = null,
  /** Menu tahap KYC, ditaruh tepat di bawah menu utama. null = sembunyikan. */
  kycMenu = null,
  role = "peminjam",
}: {
  greetingName: string;
  badges?: Partial<Record<string, TabBadge>>;
  activeTab: string;
  onTabChange: (value: string) => void;
  onSignOut: () => void;
  role?: string;
  kycMenu?: React.ReactNode;
  kycStatus?: StatusKyc | null;
}) {
  const initial = greetingName.charAt(0).toUpperCase();
  const link = role === "peminjam" || role === "admin" ? null : ROLE_LINKS[role];

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="flex w-full flex-col gap-4 overflow-x-hidden"
    >
      {/* ── Kartu profil kecil ── */}
      <motion.div
        variants={fadeUpItem}
        className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3"
      >
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-800 text-sm font-bold text-white">
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{greetingName}</p>
          {/* Lencana status kanonik (`lib/kycStatus.ts`): satu-satunya penanda
              identitas di sidebar, jadi tidak ada dua sinyal yang bertentangan. */}
          {kycStatus === null || kycStatus === undefined ? null : (
            <StatusKycBadge status={kycStatus} className="mt-1" />
          )}
        </div>
        {link && (
          <a
            href={link.href}
            aria-label={link.label}
            className="flex min-h-11 shrink-0 items-center gap-1 rounded-sm text-xs font-medium text-emerald-800 hover:text-emerald-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-800 focus-visible:ring-offset-2"
            onClick={(e) => {
              e.preventDefault();
              window.location.href = link.href;
            }}
          >
            {link.icon}
            <span className="hidden lg:inline">{link.label}</span>
            <ChevronDown className="size-3.5 -rotate-90" aria-hidden />
          </a>
        )}
      </motion.div>

      {/* ── Lima menu: Ringkasan · Ajukan · Catatan Pinjaman · Profil · KYC ── */}
      {role === "peminjam" && (
        <motion.div variants={fadeUpItem}>
          <DashboardTabNav
            badges={badges}
            activeTab={activeTab}
            onTabChange={onTabChange}
          />
        </motion.div>
      )}

      {/* Menu tahap KYC hanya muncul selama identitas belum disetujui
          (`tampilkanMenuTahapKyc` di pemanggilnya). */}
      {kycMenu !== null && <motion.div variants={fadeUpItem}>{kycMenu}</motion.div>}

      {/* ── Keluar, di bawah semua menu ── */}
      <motion.div
        variants={fadeUpItem}
        className="mt-auto border-t border-slate-200 pt-4"
      >
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2 text-xs text-slate-600 hover:bg-slate-100"
          onClick={onSignOut}
        >
          <LogOut className="size-3.5" /> Keluar
        </Button>
      </motion.div>
    </motion.div>
  );
}
