import {
  CalendarClock,
  FileText,
  LayoutGrid,
  Package,
  ScrollText,
  Send,
  ShoppingBag,
  Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  JENIS_PENGAJUAN_AWAL,
  jenisPengajuanUntukTab,
  type JenisPengajuan,
} from "@/lib/jenisPengajuan";
import { cn } from "@/lib/utils";

/** Item navigasi tab: [nilai, label, ikon]. */
const TABS: Array<[string, string, React.ReactNode]> = [
  ["pinjaman", "Catatan Pinjaman", <Wallet key="i" className="size-4" />],
  ["jadwal", "Jadwal Angsuran", <CalendarClock key="i" className="size-4" />],
  ["gadai", "Catatan Gadai", <Package key="i" className="size-4" />],
  ["kredit", "Kredit Barang", <ShoppingBag key="i" className="size-4" />],
  ["kontrak", "Dokumen Perjanjian", <FileText key="i" className="size-4" />],
  ["form", "Form Pengajuan", <Send key="i" className="size-4" />],
  ["riwayat", "Riwayat Ledger", <ScrollText key="i" className="size-4" />],
];

/**
 * Indikator jumlah pada item tab: `neutral` (informasi), `warning` (perlu
 * segera), `danger` (terlambat/menunggak).
 */
export type TabBadge = { count: number; tone?: "neutral" | "warning" | "danger" };

function badgeToneClass(tone: TabBadge["tone"]): string {
  if (tone === "danger") return "bg-red-100 text-red-700";
  if (tone === "warning") return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

/**
 * Navigasi tab dashboard (sisi kiri) — dirender di dalam <Tabs>.
 *
 * Layar lebar: daftar tab vertikal. Layar sempit: satu kartu menu menonjol
 * berisi pemilih bagian (dropdown) plus pintasan "Buat pengajuan baru", supaya
 * pemakai baru tidak perlu menebak menu mana yang membuka formulir.
 *
 * Pintasannya membawa jenis pengajuan yang cocok dengan tab yang sedang dibuka
 * (mis. tab Kredit Barang → Kredit barang sudah terpilih).
 */
export function DashboardTabNav({
  badges,
  activeTab,
  onTabChange,
  onBuatPengajuan,
}: {
  badges?: Partial<Record<string, TabBadge>>;
  activeTab: string;
  onTabChange: (value: string) => void;
  /** Buka halaman Form Pengajuan dengan jenis yang cocok untuk tab aktif. */
  onBuatPengajuan: (jenis: JenisPengajuan) => void;
}) {
  // Menu yang sedang aktif — ditampilkan menonjol di kartu menu layar sempit.
  const aktif = TABS.find(([value]) => value === activeTab) ?? null;

  // Teks sebuah menu: label + jumlah item. Dipakai baik oleh isi dropdown
  // maupun wajah trigger-nya, supaya keduanya tidak pernah berbeda.
  const teksMenu = (value: string, label: string) => {
    const jumlah = badges?.[value]?.count;
    return jumlah ? `${label} · ${jumlah}` : label;
  };

  return (
    <>
      <div className="rounded-2xl border border-primary/25 bg-primary/[0.05] p-3 shadow-sm lg:hidden">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <LayoutGrid className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary/70">
              Menu dashboard
            </p>
            <p className="truncate text-sm font-semibold text-slate-900">
              {aktif ? aktif[1] : "Pilih menu"}
            </p>
          </div>
        </div>
        <Select value={activeTab} onValueChange={onTabChange}>
          <SelectTrigger
            aria-label="Menu dashboard Peminjam"
            className="mt-3 h-12 w-full rounded-xl border-primary/30 bg-white text-sm font-medium"
          >
            <SelectValue placeholder="Pilih menu">
              {aktif ? teksMenu(aktif[0], aktif[1]) : "Pilih menu"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {TABS.map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {teksMenu(value, label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {activeTab !== "form" && (
          <Button
            type="button"
            size="sm"
            className="mt-2 h-10 w-full gap-1.5"
            onClick={() =>
              onBuatPengajuan(jenisPengajuanUntukTab(activeTab) ?? JENIS_PENGAJUAN_AWAL)
            }
          >
            <Send className="size-3.5" aria-hidden /> Buat pengajuan baru
          </Button>
        )}
      </div>
      <TabsList aria-label="Navigasi dashboard Peminjam" className="hidden h-auto w-full flex-col items-stretch justify-start gap-1 overflow-visible rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm lg:flex">
        {TABS.map(([value, label, icon]) => {
          const badge = badges?.[value];
          return (
            <TabsTrigger
              key={value}
              value={value}
              className="group h-auto w-auto flex-none shrink-0 justify-start gap-2.5 rounded-xl px-3 py-2.5 text-xs font-medium text-slate-600 transition-all hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm lg:w-full"
            >
              <span className="inline-flex align-middle">{icon}</span>
              <span className="whitespace-nowrap lg:whitespace-normal lg:text-left">{label}</span>
              {badge !== undefined && badge.count > 0 && (
                <span
                  aria-label={`${badge.count} item`}
                  className={cn(
                    "ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums",
                    badgeToneClass(badge.tone),
                    "group-data-[state=active]:bg-white/25 group-data-[state=active]:text-primary-foreground",
                  )}
                >
                  {badge.count > 99 ? "99+" : badge.count}
                </span>
              )}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </>
  );
}
