import { ArrowLeft, BadgeCheck, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { Link } from "react-router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatRupiah } from "@/lib/money";

export type AdminStatsData = {
  pinjamanBaru: number;
  gadaiProses: number;
  totalPinjaman: number;
  totalGadai: number;
  antreanPencairan: number;
  pinjamanTerlambat: number;
  nilaiTaksiranDisetujui: number;
  gpsMismatch: number;
  /** Pinjaman aktif yang titik GPS-nya kedaluwarsa (lokasi dimatikan). */
  pinjamanTanpaLokasi: number;
  titikDicurigai: number;
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
      <div className="w-full max-w-md rounded-lg border border-border/60 p-8">
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
      <div className="max-w-md text-center">
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
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            P
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-[0.14em] text-navy">PANEL ADMIN</p>
            <p className="truncate text-[11px] text-muted-foreground">PINDAI · Pinjam & Gadai Digital</p>
          </div>
          <Badge className="hidden bg-emerald-100 text-emerald-800 hover:bg-emerald-100 sm:inline-flex">
            <ShieldCheck className="mr-1 size-3.5" /> Super Admin (akses penuh)
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className={
              killConfirm
                ? "rounded-full border-0 bg-red-600 text-white hover:bg-red-700"
                : "rounded-full border-0 bg-red-500/95 text-white hover:bg-red-600"
            }
            disabled={killBusy || !ready}
            onClick={onToggleKill}
          >
            {killBusy ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <ShieldAlert className="mr-2 size-4" />
            )}
            {killSwitch
              ? "Matikan Kill Switch"
              : killConfirm
                ? "Klik lagi untuk konfirmasi!"
                : "Kill Switch Darurat"}
          </Button>
          <Link
            to="/dashboard"
            className="flex size-9 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-xs font-bold text-navy"
            title="Profil & kembali ke ruang nasabah"
          >
            A
          </Link>
        </div>
      </div>
    </header>
  );
}

/** Grid statistik ringkas sistem. */
export function AdminStats({ stats }: { stats: AdminStatsData }) {
  return (
    <section className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[
        ["Pinjaman Baru", `${stats.pinjamanBaru}`, "amber"],
        ["Gadai Diproses", `${stats.gadaiProses}`, "amber"],
        ["Total Pinjaman", `${stats.totalPinjaman}`, "sky"],
        ["Total Gadai", `${stats.totalGadai}`, "sky"],
        ["Antrean Pencairan", `${stats.antreanPencairan}`, "sky"],
        ["Wanprestasi / DPD", `${stats.pinjamanTerlambat}`, "red"],
        ["Taksiran Disetujui", formatRupiah(stats.nilaiTaksiranDisetujui), "mint"],
        ["Peringatan GPS Mismatch", `${stats.gpsMismatch}`, stats.gpsMismatch > 0 ? "red" : "mint"],
        [
          "Lokasi Tidak Mengalir",
          `${stats.pinjamanTanpaLokasi}`,
          stats.pinjamanTanpaLokasi > 0 ? "red" : "mint",
        ],
        [
          "Titik Lokasi Dicurigai",
          `${stats.titikDicurigai}`,
          stats.titikDicurigai > 0 ? "red" : "mint",
        ],
      ].map(([label, value, tone]) => (
        <div
          key={label as string}
          className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm"
        >
          <p className="text-xs text-muted-foreground">{label as string}</p>
          <p
            className={`mt-2 text-lg font-semibold tabular-nums ${
              tone === "red"
                ? "text-red-600"
                : tone === "mint"
                  ? "text-emerald-600"
                  : tone === "amber"
                    ? "text-amber-600"
                    : "text-navy"
            }`}
          >
            {value as string}
          </p>
        </div>
      ))}
    </section>
  );
}
