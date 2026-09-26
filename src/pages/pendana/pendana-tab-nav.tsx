import { Coins, FileText, ScrollText, Store, Wallet } from "lucide-react";

import { TabsList, TabsTrigger } from "@/components/ui/tabs";

/** Item navigasi tab: [nilai, label, ikon]. */
const TABS: Array<[string, string, React.ReactNode]> = [
  ["marketplace", "Marketplace Pinjaman & Gadai", <Store key="i" className="size-4" />],
  ["portofolio", "Portofolio Pendanaan Saya", <Wallet key="i" className="size-4" />],
  ["kontrak", "E-Contract Pendanaan", <FileText key="i" className="size-4" />],
  ["dompet", "Dompet & Penarikan", <Coins key="i" className="size-4" />],
  ["riwayat", "Riwayat Transaksi", <ScrollText key="i" className="size-4" />],
];

/** Navigasi tab ruang Pendana (pills) — dirender di dalam <Tabs>. */
export function PendanaTabNav() {
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
