import { motion } from "framer-motion";
import {
  ArrowLeft,
  BadgeCheck,
  BellRing,
  CircleDollarSign,
  ClipboardList,
  Clock3,
  Database,
  Landmark,
  Loader2,
  MapPin,
  Package,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { Link } from "react-router";

import { CountUp } from "@/components/CountUp";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatRupiah } from "@/lib/money";
import { fadeUpItem, staggerContainer } from "@/lib/motion";
import { RoleDashboardMenu } from "@/components/RoleDashboardMenu";

/** Pemformat hitungan biasa pada kartu statistik (tanpa pemisah ribuan). */
const formatJumlah = (n: number) => `${n}`;

export type AdminStatsData = {
  pinjamanBaru: number;
  gadaiProses: number;
  totalPinjaman: number;
  totalGadai: number;
  pinjamanDisetujui: number;
  pinjamanTerlambat: number;
  nilaiTaksiranDisetujui: number;
  gpsMismatch: number;
  /** Pinjaman aktif yang titik GPS-nya kedaluwarsa (lokasi dimatikan). */
  pinjamanTanpaLokasi: number;
  titikDicurigai: number;
  peringatanLokasiAktif: number;
};

/** Layar bootstrap admin pertama. */
export function BootstrapAdminView({
  busy,
  onActivate,
}: {
  busy: boolean;
  onActivate: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="animate-masuk w-full max-w-md rounded-lg border border-border/60 p-8">
        <ShieldCheck className="size-5 text-muted-foreground" />
        <h1 className="mt-4 text-xl font-semibold tracking-tight">Setup tim PINDAI</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Belum ada admin di sistem. Masuk dengan email terverifikasi
          (bukan akun tamu), lalu aktifkan panel admin dari halaman ini.
        </p>
        <Button className="mt-6 w-full rounded-full" disabled={busy} onClick={onActivate}>
          {busy ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Mengaktifkan…
            </>
          ) : (
            <>
              <BadgeCheck className="mr-2 size-4" />
              Aktifkan panel admin
            </>
          )}
        </Button>
        <p className="mt-4 text-center text-xs leading-5 text-muted-foreground">
          Tombol ini hanya berfungsi untuk akun email terverifikasi dan hanya
          selama belum ada admin. Setelah itu, admin baru hanya bisa
          ditambahkan oleh admin yang ada.
        </p>
      </div>
    </main>
  );
}

/** Layar penolakan akses untuk bukan admin. */
export function NotAdminView() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="animate-masuk max-w-md text-center">
        <ShieldCheck className="mx-auto size-5 text-muted-foreground" />
        <h1 className="mt-4 text-xl font-semibold tracking-tight">Akses khusus tim</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Halaman ini hanya untuk tim Pinjam Gadai Digital. Silakan kembali
          ke ruang nasabah.
        </p>
        <Button asChild variant="outline" className="mt-6 rounded-full">
          <Link to="/dashboard">
            <ArrowLeft className="mr-2 size-4" />
            Ke ruang nasabah
          </Link>
        </Button>
      </div>
    </main>
  );
}

/** Header panel admin: brand, kill switch, tautan profil. */
export function AdminHeader({
  killSwitch,
  ready,
  killBusy,
  killConfirm,
  onToggleKill,
}: {
  killSwitch: boolean;
  ready: boolean;
  killBusy: boolean;
  killConfirm: boolean;
  onToggleKill: () => void;
}) {
  return (
    <header className="animate-masuk sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex min-h-14 w-full max-w-7xl items-center justify-between gap-2 px-3 py-2 sm:min-h-16 sm:gap-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-emerald-700 text-base font-bold text-primary-foreground sm:size-10">
            P
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-bold tracking-[0.1em] text-navy sm:text-sm sm:tracking-[0.12em]">PANEL ADMIN</p>
            <p className="hidden truncate text-[11px] text-muted-foreground min-[360px]:block">PINDAI · Pinjam & Gadai Digital</p>
          </div>
          <Badge className="hidden border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-50 md:inline-flex">
            <ShieldCheck className="mr-1 size-3.5" /> Admin terverifikasi
          </Badge>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <RoleDashboardMenu />
          <Button
            size="sm"
            aria-label={killSwitch ? "Matikan kill switch" : killConfirm ? "Konfirmasi aktivasi kill switch" : "Aktifkan kill switch darurat"}
            className={
              killConfirm
                ? "rounded-full border-0 bg-red-700 text-white hover:bg-red-800"
                : "rounded-full border-0 bg-red-600 text-white hover:bg-red-700"
            }
            disabled={killBusy || !ready}
            onClick={onToggleKill}
          >
            {killBusy ? (
              <Loader2 className="size-4 animate-spin sm:mr-2" />
            ) : (
              <ShieldAlert className="size-4 sm:mr-2" />
            )}
            <span className="hidden sm:inline">
              {killSwitch
                ? "Matikan Kill Switch"
                : killConfirm
                  ? "Klik lagi untuk konfirmasi!"
                  : "Kill Switch Darurat"}
            </span>
            <span className="sm:hidden">{killSwitch ? "Matikan" : killConfirm ? "Konfirmasi" : "Darurat"}</span>
          </Button>
        </div>
      </div>
    </header>
  );
}

/** Grid statistik ringkas sistem. */
export function AdminStats({ stats }: { stats: AdminStatsData }) {
  const items = [
    { label: "Pengajuan pinjaman baru", angka: stats.pinjamanBaru, format: formatJumlah, tone: "amber", Icon: ClipboardList },
    { label: "Pengajuan gadai diproses", angka: stats.gadaiProses, format: formatJumlah, tone: "amber", Icon: Package },
    { label: "Catatan pinjaman", angka: stats.totalPinjaman, format: formatJumlah, tone: "sky", Icon: Landmark },
    { label: "Catatan gadai", angka: stats.totalGadai, format: formatJumlah, tone: "sky", Icon: Database },
    { label: "Pinjaman disetujui (status internal)", angka: stats.pinjamanDisetujui, format: formatJumlah, tone: "sky", Icon: CircleDollarSign },
    { label: "Tanggal acuan terlewati", angka: stats.pinjamanTerlambat, format: formatJumlah, tone: stats.pinjamanTerlambat > 0 ? "red" : "mint", Icon: Clock3 },
    { label: "Nilai taksiran internal", angka: stats.nilaiTaksiranDisetujui, format: formatRupiah, tone: "mint", Icon: CircleDollarSign },
    { label: "Pola koordinat untuk ditinjau", angka: stats.gpsMismatch, format: formatJumlah, tone: stats.gpsMismatch > 0 ? "red" : "mint", Icon: MapPin },
    { label: "Koordinat perangkat tidak tersedia", angka: stats.pinjamanTanpaLokasi, format: formatJumlah, tone: stats.pinjamanTanpaLokasi > 0 ? "red" : "mint", Icon: MapPin },
    { label: "Pola lokasi untuk ditinjau", angka: stats.titikDicurigai, format: formatJumlah, tone: stats.titikDicurigai > 0 ? "red" : "mint", Icon: TriangleAlert },
    { label: "Peringatan belum diakui", angka: stats.peringatanLokasiAktif, format: formatJumlah, tone: stats.peringatanLokasiAktif > 0 ? "amber" : "mint", Icon: BellRing },
  ] as const;

  const toneClass = {
    red: "text-red-700 bg-red-50 border-red-100",
    amber: "text-amber-700 bg-amber-50 border-amber-100",
    mint: "text-emerald-700 bg-emerald-50 border-emerald-100",
    sky: "text-sky-700 bg-sky-50 border-sky-100",
  } as const;

  return (
    <motion.section
      aria-label="Statistik operasional"
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="mt-4 grid grid-cols-2 gap-2 sm:mt-5 sm:grid-cols-3 sm:gap-3 xl:grid-cols-4"
    >
      {items.map(({ label, angka, format, tone, Icon }) => (
        <motion.div
          key={label}
          variants={fadeUpItem}
          className="group rounded-xl border border-slate-200 bg-white p-3 transition-colors hover:border-slate-300 min-[380px]:rounded-2xl min-[380px]:p-4 sm:p-5"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-medium leading-5 text-muted-foreground">{label}</p>
            <span className={`flex size-8 shrink-0 items-center justify-center rounded-xl border ${toneClass[tone]}`}>
              <Icon className="size-4" />
            </span>
          </div>
          <p className="mt-2 break-words text-lg font-bold tracking-tight tabular-nums text-navy min-[380px]:mt-3 min-[380px]:text-xl sm:text-2xl">
            <CountUp value={angka} format={format} />
          </p>
        </motion.div>
      ))}
    </motion.section>
  );
}
