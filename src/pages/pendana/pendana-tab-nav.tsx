import { Coins, FileText, ScrollText, ShoppingBag, Store, Wallet } from "lucide-react";

import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** Item navigasi tab: [nilai, label, ikon]. */
const TABS: Array<[string, string, React.ReactNode]> = [
  ["marketplace", "Marketplace Pinjaman & Gadai", <Store key="i" className="size-4" />],
  ["kredit", "Kredit Barang (Skema C)", <ShoppingBag key="i" className="size-4" />],
  ["portofolio", "Portofolio Pendanaan Saya", <Wallet key="i" className="size-4" />],
  ["kontrak", "E-Contract Pendanaan", <FileText key="i" className="size-4" />],
  ["dompet", "Dompet & Penarikan", <Coins key="i" className="size-4" />],
  ["riwayat", "Riwayat Transaksi", <ScrollText key="i" className="size-4" />],
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
 * Navigasi tab ruang Pendana (sisi kiri) — dirender di dalam <Tabs>.
 * Vertikal di layar lebar, dapat digulir mendatar di layar sempit.
 */
export function PendanaTabNav({
  badges,
  activeTab,
  onTabChange,
}: {
  badges?: Partial<Record<string, TabBadge>>;
  activeTab: string;
  onTabChange: (value: string) => void;
}) {
  return (
    <>
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm lg:hidden">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Menu dashboard
        </p>
        <Select value={activeTab} onValueChange={onTabChange}>
          <SelectTrigger className="h-11 w-full rounded-xl bg-slate-50 text-sm">
            <SelectValue placeholder="Pilih menu" />
          </SelectTrigger>
          <SelectContent>
            {TABS.map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <TabsList className="hidden h-auto w-full flex-col items-stretch justify-start gap-1 overflow-visible rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm lg:flex">
        {TABS.map(([value, label, icon]) => {
          const badge = badges?.[value];
          return (
            <TabsTrigger
              key={value}
              value={value}
              className="group h-auto w-auto flex-none shrink-0 justify-start gap-2.5 rounded-xl px-3 py-2.5 text-xs font-medium text-slate-600 transition-all hover:bg-slate-50 hover:text-slate-900 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm lg:w-full"
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
