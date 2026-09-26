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

/** Navigasi tab dashboard (pills) — dirender di dalam <Tabs>. */
export function DashboardTabNav() {
  return (
    <TabsList className="flex w-full flex-wrap gap-2 overflow-x-auto bg-transparent p-0">
      {TABS.map(([value, label, icon]) => (
        <TabsTrigger
          key={value}
          value={value}
          className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium shadow-sm transition-all data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
        >
          <span className="mr-1.5 inline-flex align-middle">{icon}</span>
          {label}
        </TabsTrigger>
      ))}
    </TabsList>
  );
}
