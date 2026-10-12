import { motion } from "framer-motion";
import { useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  CircleDollarSign,
  ClipboardList,
  Landmark,
  Loader2,
  Package,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { Link } from "react-router";

import { CountUp } from "@/components/CountUp";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatRupiah } from "@/lib/money";
import { fadeUpItem, staggerContainer } from "@/lib/motion";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { RoleDashboardMenu } from "@/components/RoleDashboardMenu";
import { VaultLogo } from "@/components/VaultLogo";

export type AdminStatsData = {
  pinjamanBaru: number;
  gadaiProses: number;
  totalPinjaman: number;
  totalGadai: number;
  pinjamanDisetujui: number;
  /** Total pokok pinjaman yang sedang berjalan (sudah didanai). */
  totalPinjamanBerjalan: number;
  /** Total pokok pinjaman yang diajukan (menunggu keputusan). */
  totalPinjamanDiajukan: number;
  /** Keuntungan admin dari pinjaman lunas (sudah dibukukan). */
  keuntunganAdminTercatat: number;
  /** Keuntungan admin dari pinjaman berjalan (belum dibukukan). */
  keuntunganAdminBelumTercatat: number;
  pinjamanTerlambat: number;
  nilaiTaksiranDisetujui: number;
  /** Total pokok gadai yang masih berjalan (sisa pokok, gadai aktif). */
  totalGadaiBerjalan: number;
  /** Total pokok dibiayai kredit barang yang sedang berjalan. */
  totalKreditBerjalan: number;
  gpsMismatch: number;
  /** Pinjaman aktif yang titik GPS-nya kedaluwarsa (lokasi dimatikan). */
  pinjamanTanpaLokasi: number;
  titikDicurigai: number;
  peringatanLokasiAktif: number;
};

/** Layar bootstrap admin pertama — wajib rahasia operator (fail-closed). */
export function BootstrapAdminView({
  busy,
  onActivate,
}: {
  busy: boolean;
  onActivate: (secret: string) => void;
}) {
  const [secret, setSecret] = useState("");
  const siap = secret.trim().length >= 24;
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="animate-masuk w-full max-w-md rounded-lg border border-border/60 p-8">
        <ShieldCheck className="size-5 text-muted-foreground" />
        <h1 className="mt-4 text-xl font-semibold tracking-tight">Setup tim PINDAI</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Belum ada admin di sistem. Masuk dengan email terverifikasi (bukan
          akun tamu), lalu masukkan rahasia bootstrap operator dari environment{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">ADMIN_BOOTSTRAP_SECRET</code>.
        </p>
        <div className="mt-6 space-y-2">
          <Label htmlFor="admin-bootstrap-secret">Rahasia bootstrap</Label>
          <Input
            id="admin-bootstrap-secret"
            type="password"
            autoComplete="off"
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
            placeholder="Minimal 24 karakter"
          />
        </div>
        <Button
          className="mt-4 w-full rounded-full"
          disabled={busy || !siap}
          onClick={() => onActivate(secret.trim())}
        >
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
          Tanpa rahasia yang cocok, bootstrap selalu ditolak. Tombol ini hanya
          berfungsi untuk akun email terverifikasi dan hanya selama belum ada
          admin — setelah itu, admin baru hanya bisa ditambahkan oleh admin
          yang ada.
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

/**
 * Header panel admin: brand, kill switch, tautan profil.
 *
 * Tombol kill switch kini membuka DIALOG pengaman ganda (mengetik `BEKUKAN`)
 * alih-alih "klik dua kali": salah klik tidak lagi cukup untuk memblokir semua
 * pengajuan. Saat kill switch sedang aktif, label tombol berubah menjadi
 * tindakan pemulihan (matikan) yang berjalan tanpa dialog.
 */
export function AdminHeader({
  killSwitch,
  ready,
  killBusy,
  onToggleKill,
}: {
  killSwitch: boolean;
  ready: boolean;
  killBusy: boolean;
  onToggleKill: () => void;
}) {
  return (
    <header className="animate-masuk glass-nav sticky top-0 z-40">
      <div className="mx-auto flex min-h-14 w-full max-w-7xl items-center justify-between gap-2 px-3 py-2 sm:min-h-16 sm:gap-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <VaultLogo size={40} className="size-9 shrink-0 sm:size-10" />
          <div className="min-w-0">
            <p className="truncate text-xs font-bold tracking-[0.1em] text-navy sm:text-sm sm:tracking-[0.12em]">PANEL ADMIN</p>
            <p className="hidden truncate text-[11px] text-muted-foreground min-[360px]:block">PINDAI · Pinjam & Gadai Digital</p>
          </div>
          <Badge className="hidden border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-50 md:inline-flex">
            <ShieldCheck className="mr-1 size-3.5" /> Admin terverifikasi
          </Badge>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {/* Lonceng yang sama dengan dashboard nasabah: sumbernya catatan milik
              pengguna yang sedang masuk, jadi tidak ada notifikasi orang lain. */}
          <NotificationBell />
          <RoleDashboardMenu />
          {/* Kill switch sengaja dibuat "ghost outline" merah, bukan tombol merah
              pejal: ini tindakan darurat yang jarang dipakai, jadi ia harus tetap
              terbaca sebagai peringatan tanpa mendominasi (dan menutupi) tombol
              kerja sehari-hari di kepala panel. */}
          <Button
            size="sm"
            variant="outline"
            aria-label={
              killSwitch ? "Matikan kill switch" : "Aktifkan kill switch darurat"
            }
            className="rounded-full border border-red-300 bg-transparent text-red-600 hover:bg-red-50 hover:text-red-700"
            disabled={killBusy || !ready}
            onClick={onToggleKill}
          >
            {killBusy ? (
              <Loader2 className="size-4 animate-spin sm:mr-2" />
            ) : (
              <ShieldAlert className="size-4 sm:mr-2" />
            )}
            <span className="hidden sm:inline">
              {killSwitch ? "Matikan Kill Switch" : "Kill Switch Darurat"}
            </span>
            <span className="sm:hidden">{killSwitch ? "Matikan" : "Darurat"}</span>
          </Button>
        </div>
      </div>
    </header>
  );
}

/**
 * Kartu statistik ringkas admin. Hanya angka penting (volume pinjaman &
 * keuntungan) yang ditampilkan sebagai kartu; sisa hitungan operasional
 * dipindah menjadi lencana angka di samping nama menu (lihat admin-tabs).
 */
export function AdminStats({ stats }: { stats: AdminStatsData }) {
  const [headlineTab, setHeadlineTab] = useState<"pinjaman" | "gadai" | "kredit">("pinjaman");

  const toneClass = {
    red: "text-red-700 bg-red-50 border-red-100",
    amber: "text-amber-700 bg-amber-50 border-amber-100",
    mint: "text-emerald-700 bg-emerald-50 border-emerald-100",
    sky: "text-sky-700 bg-sky-50 border-sky-100",
  } as const;

  // Kartu utama: satu angka "sedang berjalan" yang bisa ditukar antar produk.
  const headline = [
    { value: "pinjaman", tab: "Pinjaman", label: "Total pinjaman sedang berjalan", angka: stats.totalPinjamanBerjalan, tone: "mint", Icon: CircleDollarSign },
    { value: "gadai", tab: "Gadai", label: "Total gadai sedang berjalan", angka: stats.totalGadaiBerjalan, tone: "sky", Icon: Landmark },
    { value: "kredit", tab: "Kredit", label: "Total kredit sedang berjalan", angka: stats.totalKreditBerjalan, tone: "amber", Icon: Package },
  ] as const;

  const items = [
    { label: "Total pinjaman diajukan", angka: stats.totalPinjamanDiajukan, tone: "amber", Icon: ClipboardList, catatan: null as string | null },
    { label: "Keuntungan admin sudah tercatat", angka: stats.keuntunganAdminTercatat, tone: "mint", Icon: BadgeCheck, catatan: `Belum tercatat ${formatRupiah(stats.keuntunganAdminBelumTercatat)}` as string | null },
  ] as const;

  return (
    <motion.section
      aria-label="Statistik operasional"
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="mt-4 grid grid-cols-1 gap-2 sm:mt-5 sm:grid-cols-3 sm:gap-3"
    >
      <motion.div
        variants={fadeUpItem}
        className="glass-card micro-metric group relative overflow-hidden rounded-xl border p-3 shadow-sm min-[380px]:rounded-2xl min-[380px]:p-4 sm:p-5"
      >
        {/* Penanda emerald di tepi kiri — dipasang sebagai garis di dalam kartu
            supaya warnanya tidak ikut ditimpa tepi putih transparan `.glass-card`. */}
        <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-emerald-700" />
        <Tabs
          value={headlineTab}
          onValueChange={(value) => setHeadlineTab(value as "pinjaman" | "gadai" | "kredit")}
        >
          <TabsList
            aria-label="Pilih produk: pinjaman, gadai, atau kredit"
            className="h-auto w-fit gap-1 rounded-full bg-slate-100/80 p-1"
          >
            {headline.map((h) => (
              <TabsTrigger
                key={h.value}
                value={h.value}
                className="h-7 gap-1 rounded-full px-2.5 text-[11px] font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
              >
                <h.Icon className="size-3.5" />
                {h.tab}
              </TabsTrigger>
            ))}
          </TabsList>
          {headline.map((h) => (
            <TabsContent key={h.value} value={h.value} className="mt-1">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium leading-5 text-muted-foreground">{h.label}</p>
                <span className={`flex size-8 shrink-0 items-center justify-center rounded-xl border ${toneClass[h.tone]}`}>
                  <h.Icon className="size-4" />
                </span>
              </div>
              <p className="mt-2 break-words text-lg font-bold tracking-tight tabular-nums text-navy min-[380px]:mt-3 min-[380px]:text-xl sm:text-2xl">
                <CountUp value={h.angka} format={formatRupiah} />
              </p>
            </TabsContent>
          ))}
        </Tabs>
      </motion.div>

      {items.map(({ label, angka, tone, Icon, catatan }) => (
        <motion.div
          key={label}
          variants={fadeUpItem}
          className="glass-card micro-metric group relative overflow-hidden rounded-xl border p-3 shadow-sm min-[380px]:rounded-2xl min-[380px]:p-4 sm:p-5"
        >
          <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-emerald-700" />
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-medium leading-5 text-muted-foreground">{label}</p>
            <span className={`flex size-8 shrink-0 items-center justify-center rounded-xl border ${toneClass[tone]}`}>
              <Icon className="size-4" />
            </span>
          </div>
          <p className="mt-2 break-words text-lg font-bold tracking-tight tabular-nums text-navy min-[380px]:mt-3 min-[380px]:text-xl sm:text-2xl">
            <CountUp value={angka} format={formatRupiah} />
          </p>
          {catatan !== null && (
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{catatan}</p>
          )}
        </motion.div>
      ))}
    </motion.section>
  );
}
