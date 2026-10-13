import { motion } from "framer-motion";
import { LogOut, ShieldCheck } from "lucide-react";
import { ChevronDown, Wallet } from "lucide-react";

import { StatusKycBadge } from "@/components/StatusKycBadge";
import { Button } from "@/components/ui/button";
import type { JenisPengajuan } from "@/lib/jenisPengajuan";
import type { StatusKyc } from "@/lib/kycStatus";
import { fadeUpItem, staggerContainer } from "@/lib/motion";
import { ADMIN_ROUTE } from "@/lib/routes";
import { cn } from "@/lib/utils";

import { DashboardTabNav, type TabBadge } from "./dashboard-tab-nav";

/**
 * Pintasan ruang untuk peran NON-admin di kartu profil.
 *
 * Akun admin sengaja TIDAK ada di daftar ini: area admin punya grup menu sendiri
 * (`MenuAdminNav`) supaya hanya ada satu pintu masuk. Sebelumnya akun admin
 * mendapat pintasan "Panel Admin" di kartu profil sekaligus kartu "Menu khusus"
 * statis, dan keduanya menuju rute yang sama.
 *
 * Panel admin tidak berada di `/admin`: rutenya disamarkan di `lib/routes.ts`
 * (sengaja tidak ditautkan dari halaman publik). Jalur yang masih menulis
 * `/admin` akan mendarat di halaman "tidak ditemukan".
 */
const ROLE_LINKS: Record<string, { label: string; icon: React.ReactNode; href: string }> = {
  // Nilai peran yang benar-benar tersimpan adalah `dana`; `penyedia-dana` adalah
  // nama rute. Keduanya dipetakan supaya akun pendana tetap mendapat pintasannya.
  dana: { label: "Dashboard Dana", icon: <Wallet className="size-4" />, href: "/penyedia-dana" },
  "penyedia-dana": { label: "Dashboard Dana", icon: <Wallet className="size-4" />, href: "/penyedia-dana" },
};

/** Apakah halaman yang sedang terbuka adalah panel admin. */
function sedangDiPanelAdmin(): boolean {
  // Panel admin dibuka lewat tautan biasa (muat ulang halaman penuh), jadi path
  // saat ini sudah cukup untuk menandai item aktif. Dijaga supaya render di luar
  // peramban (uji render statis) tidak menyentuh `window`.
  return typeof window !== "undefined" && window.location.pathname === ADMIN_ROUTE;
}

/**
 * Grup menu area admin — satu pintu masuk ke panel operasional.
 *
 * Isinya HANYA tujuan yang benar-benar ada: "Panel Admin" (ringkasan operasional
 * di `ADMIN_ROUTE`). Antrean verifikasi KYC dan kelola pinjaman belum punya rute
 * sendiri — keduanya masih bagian di dalam panel — jadi tidak dirender di sini
 * supaya tidak ada item yang tampil tetapi tidak mengarah ke mana pun.
 *
 * Lencana hitungan sengaja belum dipasang: query cacahannya
 * (`kyc.daftarKycAdmin`) hanya boleh dibaca sesi admin yang sudah lolos TOTP,
 * sedangkan menu ini hidup di dashboard peminjam. Angka itu tetap tampil sebagai
 * lencana di dalam panel admin.
 */
export function MenuAdminNav() {
  const aktif = sedangDiPanelAdmin();

  return (
    <nav aria-label="Menu admin">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
        Admin
      </p>
      <ul className="mt-2.5 space-y-1 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
        <li>
          <a
            href={ADMIN_ROUTE}
            aria-current={aktif ? "page" : undefined}
            className={cn(
              // Penanda aktif memakai dua hal sekaligus (latar + garis aksen),
              // bukan warna saja; cincin fokusnya sama dengan menu layanan di
              // `dashboard-tab-nav.tsx` supaya wajah fokusnya satu bahasa.
              "relative flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
              aktif && "bg-primary/10 text-primary",
            )}
          >
            {aktif && (
              <span
                aria-hidden
                className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-primary"
              />
            )}
            <ShieldCheck className="size-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1 truncate">Panel Admin</span>
            <span className="text-[10px] font-medium text-muted-foreground">Ringkasan</span>
          </a>
        </li>
      </ul>
    </nav>
  );
}

/**
 * Sisi kiri dashboard nasabah: kartu profil (sapaan, avatar, status KYC, keluar),
 * menu layanan lima pintu (lihat `dashboard-tab-nav.tsx`), grup menu admin untuk
 * akun admin, lalu menu tahap KYC selama verifikasinya belum selesai.
 * Admin & Penyedia Dana tidak melihat menu utama Peminjam.
 */
export function DashboardSidebar({
  greetingName,
  badges,
  activeTab,
  onTabChange,
  onBuatPengajuan,
  onSignOut,
  /** Status KYC kanonik; `null` = belum terbaca (lencana disembunyikan). */
  kycStatus = null,
  /** Menu tahap KYC, ditaruh tepat di bawah menu peran. null = sembunyikan. */
  kycMenu = null,
  /** Role yang sebenarnya merender menu Peminjam; admin/penyedia dana punya
      link tersendiri di sini agar mereka tidak kebawa ke menu tidak bermakna. */
  role = "peminjam",
  /**
   * Hasil pemeriksaan SERVER (`security.totpGateStatus.isAdmin`), bukan `role`
   * dari dokumen profil. Grup menu admin hanya dirender bila server mengenali
   * akun ini sebagai admin — menyembunyikan di UI saja tidak dianggap cukup.
   */
  adminTerverifikasi = false,
}: {
  greetingName: string;
  badges?: Partial<Record<string, TabBadge>>;
  activeTab: string;
  onTabChange: (value: string) => void;
  /** Pintasan "Buat pengajuan baru" di menu layar sempit. */
  onBuatPengajuan: (jenis: JenisPengajuan) => void;
  onSignOut: () => void;
  role?: string;
  kycMenu?: React.ReactNode;
  kycStatus?: StatusKyc | null;
  adminTerverifikasi?: boolean;
}) {
  const initial = greetingName.charAt(0).toUpperCase();
  // Akun admin tidak memakai pintasan di kartu profil: satu pintu saja ke area
  // admin, yaitu grup menu di bawah ini.
  const link = role === "admin" || role === "peminjam" ? null : ROLE_LINKS[role];
  const tampilkanMenuAdmin = role === "admin" && adminTerverifikasi;

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
            {/* Lencana status kanonik. Sebelumnya di sini ada teks tetap
                "Identitas dari pengisian mandiri" yang berbunyi sama walau
                statusnya sudah terverifikasi maupun ditolak. */}
            {kycStatus === null || kycStatus === undefined ? null : (
              <StatusKycBadge status={kycStatus} className="mt-1" />
            )}
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

      {/* Grup menu admin — dirender HANYA untuk akun yang server-nya mengenali
          sebagai admin. Nasabah biasa tidak melihat apa pun di sini. */}
      {tampilkanMenuAdmin && (
        <motion.div variants={fadeUpItem}>
          <MenuAdminNav />
        </motion.div>
      )}

      {/* Menu tahap KYC menempel TEPAT di bawah menu peran/admin: ia hilang
          sendiri begitu identitas terverifikasi (`tampilkanMenuTahapKyc`), jadi
          setelah selesai yang tersisa di sidebar hanya menu layanan. */}
      {kycMenu !== null && <motion.div variants={fadeUpItem}>{kycMenu}</motion.div>}
    </motion.div>
  );
}
