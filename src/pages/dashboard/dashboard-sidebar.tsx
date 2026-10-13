import { motion } from "framer-motion";
import { LogOut, ShieldCheck } from "lucide-react";
import { Building2, ChevronDown, Wallet } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { JenisPengajuan } from "@/lib/jenisPengajuan";
import { fadeUpItem, staggerContainer } from "@/lib/motion";
import { ADMIN_ROUTE } from "@/lib/routes";

import { DashboardTabNav, type TabBadge } from "./dashboard-tab-nav";

const ROLE_LINKS: Record<string, { label: string; icon: React.ReactNode; href: string }> = {
  // Panel admin TIDAK berada di `/admin`: rutenya disamarkan di `lib/routes.ts`
  // (sengaja tidak ditautkan dari halaman publik). Jalur admin yang masih
  // menulis `/admin` akan mendarat di halaman "tidak ditemukan".
  admin: { label: "Panel Admin", icon: <Building2 className="size-4" />, href: ADMIN_ROUTE },
  // Nilai peran yang benar-benar tersimpan adalah `dana`; `penyedia-dana` adalah
  // nama rute. Keduanya dipetakan supaya akun pendana tetap mendapat pintasannya.
  dana: { label: "Dashboard Dana", icon: <Wallet className="size-4" />, href: "/penyedia-dana" },
  "penyedia-dana": { label: "Dashboard Dana", icon: <Wallet className="size-4" />, href: "/penyedia-dana" },
};

/**
 * Sisi kiri dashboard nasabah: kartu profil (sapaan, avatar, status KTP,
 * tautan peran, keluar) lalu navigasi tab vertikal yang dikelompokkan.
 * Admin & Penyedia Dana tidak melihat menu utama Peminjam.
 */
export function DashboardSidebar({
  greetingName,
  badges,
  activeTab,
  onTabChange,
  onBuatPengajuan,
  onSignOut,
  /** Role yang sebenarnya merender menu Peminjam; admin/penyedia dana punya
      link tersendiri di sini agar mereka tidak kebawa ke menu tidak bermakna. */
  role = "peminjam",
}: {
  greetingName: string;
  badges?: Partial<Record<string, TabBadge>>;
  activeTab: string;
  onTabChange: (value: string) => void;
  /** Pintasan "Buat pengajuan baru" di menu layar sempit. */
  onBuatPengajuan: (jenis: JenisPengajuan) => void;
  onSignOut: () => void;
  role?: string;
}) {
  const initial = greetingName.charAt(0).toUpperCase();
  const link = role === "peminjam" ? null : ROLE_LINKS[role];

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="flex flex-col gap-5"
    >
      {/* ── Kartu profil ── */}
      <motion.div variants={fadeUpItem} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-emerald-800 text-base font-bold text-white">
            {initial}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">Halo, {greetingName}</p>
            <Badge className="mt-1 border-0 bg-emerald-100 text-[10px] text-emerald-700 hover:bg-emerald-100">
              <ShieldCheck className="mr-1 size-3" /> Identitas dari pengisian mandiri
            </Badge>
          </div>
        </div>

        {link && (
          <a
            href={link.href}
            className="mt-3 flex items-center gap-2.5 text-xs font-medium text-primary hover:text-primary-foreground"
            onClick={(e) => {
              e.preventDefault();
              window.location.href = link.href;
            }}
          >
            {link.icon}
            {link.label}
            <ChevronDown className="size-3.5 -rotate-90" />
          </a>
        )}
        {/* Tombol keluar selalu ada di kartu profil. Dulu ia dirender hanya
            untuk peran Peminjam (sebagai cabang `else` dari pintasan ruang),
            jadi akun pendana/admin kehilangan jalan keluar di sini. */}
        <Button
          variant="outline"
          size="sm"
          className="mt-3 w-full justify-start gap-2 text-xs text-slate-600 hover:bg-slate-100"
          onClick={onSignOut}
        >
          <LogOut className="size-3.5" /> Keluar
        </Button>
      </motion.div>

      {/* ── Navigasi yang dikelompokkan ── */}
      {role === "peminjam" && (
        <motion.div variants={fadeUpItem}>
          <DashboardTabNav
            badges={badges}
            activeTab={activeTab}
            onTabChange={onTabChange}
            onBuatPengajuan={onBuatPengajuan}
          />
        </motion.div>
      )}

      {/* Kotak "Menu khusus" HANYA dirender bila peran ini benar-benar punya
          pintasan menu. Tanpa penjaga ini, peran yang tidak ada di ROLE_LINKS
          (mis. `member`/`pengamat`) mendapat kotak berbingkai KOSONG — melayang
          dan memakan ruang di layar ponsel. */}
      {role !== "peminjam" && link && (
        <motion.div variants={fadeUpItem}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
            Menu khusus
          </p>
          <div className="mt-2.5 rounded-xl border border-slate-200 bg-white p-3 text-xs">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg border border-slate-200 px-3 py-2">
              {link.icon}
              <span className="min-w-0 flex-1 truncate font-medium text-slate-700">
                {link.label}
              </span>
              <span className="text-primary"> &bull; </span>
              <span className="min-w-0 truncate">Lihat menu untuk {greetingName}</span>
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
