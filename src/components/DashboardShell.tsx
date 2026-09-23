import { useQuery } from "convex/react";
import {
  ArrowRight,
  BadgeCheck,
  Bell,
  CalendarClock,
  Landmark,
  LogOut,
  ScrollText,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Wallet,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import { formatRupiah, type Rupiah } from "@/lib/money";

/**
 * DashboardShell — kerangka halaman ter-autentikasi PINDAI dengan gaya
 * 3D Cartoon Claymorphism (Clean Light Mode):
 *  - Header sticky: logo 3D + badge status kapsul + profile pill + notifikasi + keluar.
 *  - Hero greeting: sapaan personal + tombol aksi cepat.
 *  - Summary cards 3D (desktop grid 3 kolom; mobile carousel swipe).
 *  - Dock navigasi melayang (desktop pill atas; mobile bottom nav ramah jempol).
 */

export interface SummaryCard {
  label: string;
  nilai: Rupiah;
  keterangan: string;
  /** Tona aksen kartu. */
  tone: "sky" | "amber" | "mint";
  icon: ReactNode;
}

export interface DockTab {
  key: string;
  label: string;
  /** Label pendek untuk bottom nav mobile. */
  shortLabel: string;
  icon: ReactNode;
  /** Jumlah tugas pending — merender badge merah di pojok ikon. */
  badge?: number;
  onSelect: () => void;
  active: boolean;
}

function summaryTone(tone: SummaryCard["tone"]): { text: string; glow: string; ring: string } {
  switch (tone) {
    case "mint":
      return {
        text: "text-emerald-600",
        glow: "shadow-[8px_8px_16px_rgba(16,185,129,0.12),-4px_-4px_12px_rgba(255,255,255,0.9)]",
        ring: "border-emerald-100",
      };
    case "amber":
      return {
        text: "text-amber-600",
        glow: "shadow-[8px_8px_16px_rgba(245,158,11,0.12),-4px_-4px_12px_rgba(255,255,255,0.9)]",
        ring: "border-amber-100",
      };
    default:
      return {
        text: "text-sky-600",
        glow: "shadow-[8px_8px_16px_rgba(56,189,248,0.15),-4px_-4px_12px_rgba(255,255,255,0.9)]",
        ring: "border-sky-100",
      };
  }
}

/* =====================================================================
 * Kartu ringkasan 3D — ikon embossed pojok kanan atas + kilau kaca
 * ===================================================================== */

function SummaryCardView({ card }: { card: SummaryCard }) {
  const tone = summaryTone(card.tone);
  return (
    <div
      className={`clay-sheen card-lift relative overflow-hidden rounded-2xl border bg-white p-5 ${tone.glow} ${tone.ring}`}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{card.label}</p>
          <p className={`mt-2 truncate text-2xl font-bold tabular-nums ${tone.text}`}>
            {formatRupiah(card.nilai)}
          </p>
        </div>
        <span className="clay-icon-blue clay-shine relative flex size-11 shrink-0 items-center justify-center rounded-2xl">
          {card.icon}
        </span>
      </div>
      <p className="mt-3 line-clamp-2 text-xs leading-5 text-muted-foreground">
        {card.keterangan}
      </p>
    </div>
  );
}

/* =====================================================================
 * Notifikasi — popover berisi pengingat jatuh tempo & status sistem
 * ===================================================================== */

function NotifikasiPopover({
  children,
  reminder,
  killSwitch,
}: {
  children: ReactNode;
  reminder:
    | {
        nomorReferensi: string;
        sisaHari: number;
        hariTerlambat: number;
        totalKewajibanDenganPenalti: Rupiah;
      }
    | null;
  killSwitch: boolean;
}) {
  const count = (reminder ? 1 : 0) + (killSwitch ? 1 : 0);
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="end" className="w-80 rounded-2xl border-sky-100 p-0">
        <div className="flex items-center justify-between border-b border-sky-100 px-4 py-3">
          <p className="text-sm font-semibold">Notifikasi</p>
          {count > 0 && (
            <Badge className="border-0 bg-red-100 text-[10px] text-red-600 hover:bg-red-100">
              {count} baru
            </Badge>
          )}
        </div>
        <div className="max-h-72 space-y-2 overflow-y-auto p-3">
          {count === 0 && (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              Tidak ada notifikasi — semua aman.
            </p>
          )}
          {killSwitch && (
            <div className="rounded-xl border border-red-100 bg-red-50/70 p-3">
              <p className="text-xs font-bold text-red-700">
                🛑 Layanan pengajuan dijeda
              </p>
              <p className="mt-1 text-xs leading-5 text-red-600/80">
                Admin menahan pengajuan baru sementara. Dana & tagihan Anda tetap aman.
              </p>
            </div>
          )}
          {reminder && (
            <Link
              to="/dashboard"
              className="block rounded-xl border border-sky-100 bg-sky-50/60 p-3 transition hover:border-sky-200"
            >
              <p className="text-xs font-bold text-sky-900">
                {reminder.hariTerlambat > 0
                  ? `⚠️ Terlambat ${reminder.hariTerlambat} hari — ${reminder.nomorReferensi}`
                  : `📅 Jatuh tempo ${reminder.sisaHari === 0 ? "hari ini" : `${reminder.sisaHari} hari lagi`} — ${reminder.nomorReferensi}`}
              </p>
              <p className="mt-1 text-xs tabular-nums text-sky-700">
                Total kewajiban {formatRupiah(reminder.totalKewajibanDenganPenalti)}
              </p>
            </Link>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* =====================================================================
 * Shell utama
 * ===================================================================== */

export function DashboardShell({
  greeting,
  subGreeting,
  quickActions,
  summary,
  tabs,
  reminder,
  footer,
  children,
}: {
  /** Nama depan pengguna, mis. "Budi". */
  greeting: string;
  subGreeting: string;
  /** Tombol aksi cepat hero, mis. [+ Pengajuan Baru]. */
  quickActions: ReactNode;
  /** 3 kartu ringkasan (desktop grid, mobile carousel). */
  summary: SummaryCard[];
  /** Tab dock — urutan sama untuk desktop & mobile. */
  tabs: DockTab[];
  /** Pengingat jatuh tempo (Peminjam) atau null (Pendana). */
  reminder:
    | {
        nomorReferensi: string;
        sisaHari: number;
        hariTerlambat: number;
        totalKewajibanDenganPenalti: Rupiah;
      }
    | null;
  /** Konten footer opsional. */
  footer?: ReactNode;
  children: ReactNode;
}) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const sysStatus = useQuery(api.system.getStatusPublic);
  const [signingOut, setSigningOut] = useState(false);

  const name = greeting || user?.name || "Nasabah";
  const initial = name.charAt(0).toUpperCase();

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      navigate("/");
    } finally {
      setSigningOut(false);
    }
  };

  const notifCount = (reminder ? 1 : 0) + (sysStatus?.killSwitch ? 1 : 0);

  return (
    <div className="flex min-h-screen flex-col bg-[#F0F9FF] text-[#0F172A]">
      {/* Bar pengumuman global dirender di main.tsx (AnnouncementBar). */}

      {/* ===== Header sticky ===== */}
      <header className="sticky top-0 z-40 border-b border-sky-100 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/" className="flex shrink-0 items-center gap-2.5">
            <span className="clay-icon-blue flex size-9 items-center justify-center rounded-xl">
              <Landmark className="size-5" />
            </span>
            <span className="hidden text-sm font-bold tracking-[0.16em] sm:block">
              PINDAI
            </span>
            {/* Badge status kapsul running text */}
            <Badge className="ml-1 hidden items-center gap-1.5 overflow-hidden rounded-full border-0 bg-sky-50 px-2.5 py-1 text-[10px] font-medium text-sky-700 md:inline-flex">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
              </span>
              <span className="animate-marquee whitespace-nowrap">
                Vault Custody Aktif · Ledger Seimbang · Pencairan 99%
              </span>
            </Badge>
          </Link>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
            {/* Profile pill */}
            <div className="flex items-center gap-2 rounded-full border border-sky-100 bg-white py-1 pl-1 pr-2.5 shadow-sm">
              <span className="gradient-primary flex size-8 items-center justify-center rounded-full text-sm font-bold text-primary-foreground shadow-glow">
                {initial}
              </span>
              <div className="hidden min-w-0 sm:block">
                <p className="max-w-28 truncate text-xs font-semibold leading-tight">
                  {name}
                </p>
                <p className="flex items-center gap-1 text-[10px] leading-tight text-emerald-600">
                  <BadgeCheck className="size-3" />
                  WA & KTP Terverifikasi
                </p>
              </div>
            </div>

            <NotifikasiPopover reminder={reminder} killSwitch={sysStatus?.killSwitch === true}>
              <Button
                variant="outline"
                size="icon"
                aria-label={`Notifikasi${notifCount > 0 ? ` (${notifCount} baru)` : ""}`}
                className="relative rounded-full border-sky-100"
              >
                <Bell className="size-4 text-sky-600" />
                {notifCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white shadow-sm">
                    {notifCount}
                  </span>
                )}
              </Button>
            </NotifikasiPopover>

            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground"
              disabled={signingOut}
              onClick={handleSignOut}
            >
              <LogOut className="size-3.5" />
              <span className="hidden sm:inline">Keluar</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-40 pt-6 sm:px-6 md:pb-28">
        {/* ===== Hero greeting & quick action banner ===== */}
        <section className="clay-sheen relative overflow-hidden rounded-3xl border border-sky-100 bg-white p-6 shadow-[8px_8px_16px_rgba(56,189,248,0.12),-4px_-4px_12px_rgba(255,255,255,0.9)] sm:p-7">
          <Sparkles className="absolute right-6 top-6 size-5 text-sky-200" aria-hidden />
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-500">
                Dashboard Utama
              </p>
              <h1 className="mt-1.5 text-xl font-extrabold tracking-tight sm:text-2xl">
                Selamat Datang Kembali, {name} 👋
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">{subGreeting}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">{quickActions}</div>
          </div>
        </section>

        {/* ===== Summary cards — desktop grid 3 kolom, mobile carousel swipe ===== */}
        <section className="mt-6">
          {/* Mobile: carousel swipe horizontal */}
          <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 md:hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {summary.map((card) => (
              <div key={card.label} className="w-[85%] shrink-0 snap-center">
                <SummaryCardView card={card} />
              </div>
            ))}
          </div>
          {/* Desktop: grid 3 kolom */}
          <div className="hidden gap-4 md:grid md:grid-cols-3">
            {summary.map((card) => (
              <SummaryCardView key={card.label} card={card} />
            ))}
          </div>
        </section>

        {/* ===== Dock desktop — pill melayang sticky di atas konten ===== */}
        <nav
          aria-label="Navigasi dashboard"
          className="sticky top-20 z-30 mt-8 hidden md:block"
        >
          <div className="mx-auto flex w-fit max-w-full flex-wrap items-center justify-center gap-2 rounded-full border border-sky-100 bg-white/95 p-2 shadow-2xl shadow-sky-200/60 backdrop-blur">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={tab.onSelect}
                aria-current={tab.active ? "page" : undefined}
                className={`relative flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-all duration-200 hover:-translate-y-1 ${
                  tab.active
                    ? "gradient-primary shadow-glow scale-[1.04] text-white"
                    : "text-slate-500 hover:bg-sky-50 hover:text-sky-700"
                }`}
              >
                {tab.icon}
                {tab.label}
                {tab.active && (
                  <span className="absolute -bottom-0.5 right-2.5 flex size-1.5">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-300 opacity-75" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-emerald-400" />
                  </span>
                )}
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white shadow-sm">
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </nav>

        {/* ===== Konten halaman ===== */}
        <div className="mt-8">{children}</div>

        {footer}
      </main>

      {/* ===== Dock mobile — bottom nav 3D melayang ramah jempol ===== */}
      <nav
        aria-label="Navigasi utama"
        className="fixed inset-x-0 bottom-6 z-50 px-4 md:hidden"
      >
        <div className="mx-auto flex max-w-md items-center justify-between gap-1 rounded-full border border-sky-100 bg-white/95 p-2 shadow-2xl shadow-sky-200/70 backdrop-blur">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={tab.onSelect}
              aria-current={tab.active ? "page" : undefined}
              className={`relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-full px-1 py-1.5 text-[10px] font-semibold transition-all duration-200 active:scale-95 ${
                tab.active
                  ? "gradient-primary shadow-glow text-white"
                  : "text-slate-500"
              }`}
            >
              <span className="relative">
                {tab.icon}
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex size-3.5 items-center justify-center rounded-full bg-red-500 text-[8px] font-bold text-white">
                    {tab.badge}
                  </span>
                )}
                {tab.active && (
                  <span className="absolute -bottom-1 left-1/2 flex size-1 -translate-x-1/2">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-300 opacity-75" />
                    <span className="relative inline-flex size-1 rounded-full bg-emerald-400" />
                  </span>
                )}
              </span>
              <span className="w-full truncate text-center">{tab.shortLabel}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

/** Ikon dock siap pakai (ukuran seragam) agar pemakaian konsisten. */
export const DockIcons = {
  marketplace: <ShoppingBag className="size-4" />,
  portfolio: <Wallet className="size-4" />,
  jadwal: <CalendarClock className="size-4" />,
  kontrak: <ScrollText className="size-4" />,
  riwayat: <ScrollText className="size-4" />,
  vault: <Landmark className="size-4" />,
  goto: <ArrowRight className="size-4" />,
  proteksi: <ShieldCheck className="size-4" />,
} as const;
