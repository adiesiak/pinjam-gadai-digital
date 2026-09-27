import {
  CalendarClock,
  FileText,
  Package,
  ScrollText,
  Send,
  Wallet,
} from "lucide-react";

import { TabsList, TabsTrigger } from "@/components/ui/tabs";

/** Item navigasi tab: [nilai, label, ikon]. */
const TABS: Array<[string, string, React.ReactNode]> = [
  ["pinjaman", "Pinjaman Aktif", <Wallet key="i" className="size-4" />],
  ["jadwal", "Jadwal Angsuran", <CalendarClock key="i" className="size-4" />],
  ["gadai", "Jaminan Gadai Saya", <Package key="i" className="size-4" />],
  ["kontrak", "E-Contract Saya", <FileText key="i" className="size-4" />],
  ["form", "Form Pengajuan Baru", <Send key="i" className="size-4" />],
  ["riwayat", "Riwayat Transaksi", <ScrollText key="i" className="size-4" />],
];

/**
 * Navigasi tab dashboard (sisi kiri) — dirender di dalam <Tabs>.
 * Vertikal di layar lebar, dapat digulir mendatar di layar sempit.
 */
export function DashboardTabNav() {
  return (
    <TabsList className="flex h-auto w-full flex-row items-stretch justify-start gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm lg:flex-col lg:overflow-visible">
      {TABS.map(([value, label, icon]) => (
        <TabsTrigger
          key={value}
          value={value}
          className="h-auto w-auto flex-none shrink-0 justify-start gap-2.5 rounded-xl px-3 py-2.5 text-xs font-medium text-slate-600 transition-all hover:bg-slate-50 hover:text-slate-900 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm lg:w-full"
        >
          <span className="inline-flex align-middle">{icon}</span>
          <span className="whitespace-nowrap lg:whitespace-normal lg:text-left">{label}</span>
        </TabsTrigger>
      ))}
    </TabsList>
  );
}
