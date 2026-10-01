import { useState } from "react";
import {
  BellRing,
  ChevronDown,
  ClipboardList,
  Database,
  Gavel,
  Landmark,
  Lock,
  Map as MapIcon,
  MessageSquare,
  Package,
  ReceiptText,
  Send,
  SlidersHorizontal,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  PanelsTopLeft,
  Wallet,
} from "lucide-react";

import { AksesPenyediaDanaPanel } from "@/components/admin/AksesPenyediaDanaPanel";
import { AnnouncementCms } from "@/components/admin/AnnouncementCms";
import { AuditTrailPanel } from "@/components/admin/AuditTrailPanel";
import { BackupPanel } from "@/components/admin/BackupPanel";
import { LiveLocationMap } from "@/components/admin/LiveLocationMap";
import { KreditQueuePanel } from "@/components/admin/KreditQueuePanel";
import { LoginSecurityPanel } from "@/components/admin/LoginSecurityPanel";
import { ManualEvidenceQueue } from "@/components/admin/ManualEvidenceQueue";
import { DpdTab, LedgerTab, LelangTab, LoanAllocationQueueTab } from "@/components/admin/OperationsTabs";
import { SystemConfigPanel } from "@/components/admin/SystemConfigPanel";
import { PlafonPanel } from "@/components/admin/PlafonPanel";
import { WhatsAppPanel } from "@/components/admin/WhatsAppPanel";
import { WebsiteTemplatePanel } from "@/components/admin/WebsiteTemplatePanel";
import {
  type KreditRow,
  type LoanRow,
  type PawnRow,
} from "@/components/admin/admin-shared";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { LoanQueueSection, PawnQueueSection } from "./queue-views";
import { type AdminStatsData } from "./admin-shell";

type TabIcon = typeof ClipboardList;
type AdminTabItem = [value: string, label: string, badge: string | null, Icon: TabIcon];

/** Ringkasan ledger internal untuk lencana tab — mengikuti `admin.ledgerSummary`. */
type LedgerSummary = {
  totalDebit: number;
  totalKredit: number;
  entryCount: number;
  seimbang: boolean;
  /** Total biaya platform yang sudah dijurnal (platform:FEE, sisi debit). */
  pendapatanPlatform: number;
};

/** Tab navigasi + seluruh konten tab panel admin. */
export function AdminTabs({
  overview,
  stats,
  ledger,
  onOpenLoan,
  onOpenPawn,
  onOpenSetup,
}: {
  overview: { loans: LoanRow[]; pawns: PawnRow[]; kredit: KreditRow[] };
  stats: AdminStatsData | undefined;
  ledger: LedgerSummary | undefined;
  onOpenLoan: (l: LoanRow) => void;
  onOpenPawn: (p: PawnRow) => void;
  onOpenSetup: () => void;
}) {
  const [activeTab, setActiveTab] = useState("pinjaman");
  const tabItems: AdminTabItem[] = [
    ["pinjaman", "Pinjaman", `${overview.loans.filter((l) => l.status === "diajukan").length}`, ClipboardList],
    ["gadai", "Gadai", `${overview.pawns.filter((p) => p.status === "diajukan" || p.status === "sedang_dinilai").length}`, Package],
    ["kredit", "Kredit Barang", `${overview.kredit.filter((k) => k.status === "diajukan" || k.status === "sedang_ditinjau").length}`, ShoppingBag],
    ["lokasi", "Peta Live Location", null, MapIcon],
    ["alokasi", "Pinjaman disetujui (internal)", stats ? `${stats.pinjamanDisetujui}` : null, Wallet],
    ["dpd", "Tanggal acuan", stats ? `${stats.pinjamanTerlambat}` : null, BellRing],
    ["lelang", "Kalkulator lelang jaminan", null, Gavel],
    ["ledger", "Ledger internal", ledger?.seimbang ? "OK" : "!", Landmark],
    ["backup", "Backup & Keamanan", null, Database],
    ["template", "Template Website", null, PanelsTopLeft],
    ["config", "Pengaturan Sistem", null, Settings2],
    ["audit", "Audit Trail", null, Lock],
    ["loglogin", "Keamanan Login", null, ShieldCheck],
    ["bukti", "Pencocokan bukti manual", null, ReceiptText],
    ["plafon", "Plafon Nasabah", null, SlidersHorizontal],
    ["akses", "Kelola Penyedia Dana", null, Wallet],
    ["pengumuman", "Pengumuman", null, MessageSquare],
    ["whatsapp", "WhatsApp", null, Send],
  ];

  return (
    <Tabs
      value={activeTab}
      onValueChange={setActiveTab}
      className="mt-4 flex min-w-0 flex-col gap-4 sm:mt-6 sm:gap-5 lg:flex-row lg:items-start lg:gap-6"
    >
      <div className="animate-masuk sticky top-16 z-30 -mx-3 border-y border-slate-200 bg-white/95 px-3 py-2.5 backdrop-blur sm:-mx-6 sm:px-6 lg:hidden">
        <label htmlFor="admin-tab-select" className="mb-1.5 block text-[11px] font-medium text-muted-foreground">
          Menu operasional
        </label>
        <div className="relative">
          <select
            id="admin-tab-select"
            value={activeTab}
            onChange={(event) => setActiveTab(event.target.value)}
            aria-label="Menu operasional admin"
            className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 pr-10 text-sm font-semibold text-navy outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            {tabItems.map(([value, label, badge]) => (
              <option key={value} value={value}>
                {label}{badge !== null && badge !== "0" ? ` · ${badge}` : ""}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        </div>
      </div>

      <TabsList aria-label="Navigasi panel admin" className="animate-masuk hidden lg:sticky lg:top-20 lg:z-30 lg:flex lg:h-auto lg:w-64 lg:shrink-0 lg:flex-col lg:items-stretch lg:gap-1 lg:self-start lg:rounded-2xl lg:border lg:border-slate-200 lg:bg-white lg:p-2">
        {tabItems.map(([value, label, badge, Icon]) => (
          <TabsTrigger
            key={value}
            value={value}
            className="h-10 w-full justify-start gap-2.5 rounded-xl px-3 text-left text-xs font-medium text-navy shadow-none transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 data-[state=active]:gradient-primary data-[state=active]:text-white data-[state=active]:shadow-none data-[state=active]:hover:bg-none lg:min-h-10 lg:text-sm"
          >
            <Icon className="size-3.5 shrink-0" />
            <span className="min-w-0 flex-1 whitespace-normal break-words text-left leading-5">{label}</span>
            {badge !== null && badge !== undefined && badge !== "0" && (
              <span
                className={`inline-flex min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                  badge === "OK"
                    ? "bg-emerald-100 text-emerald-700"
                    : badge === "!"
                      ? "animate-pulse bg-red-100 text-red-700"
                      : "bg-amber-100 text-amber-700"
                }`}
              >
                {badge}
              </span>
            )}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="pinjaman" className="min-w-0 flex-1 animate-masuk">
        <LoanQueueSection loans={overview.loans} onOpen={onOpenLoan} />
      </TabsContent>

      <TabsContent value="gadai" className="min-w-0 flex-1 animate-masuk">
        <PawnQueueSection pawns={overview.pawns} onOpen={onOpenPawn} />
      </TabsContent>

      <TabsContent value="kredit" className="min-w-0 flex-1 animate-masuk">
        <KreditQueuePanel />
      </TabsContent>

      <TabsContent value="bukti" className="min-w-0 flex-1 animate-masuk">
        <ManualEvidenceQueue />
      </TabsContent>

      <TabsContent value="pengumuman" className="min-w-0 flex-1 animate-masuk">
        <AnnouncementCms />
      </TabsContent>

      <TabsContent value="whatsapp" className="min-w-0 flex-1 animate-masuk">
        <WhatsAppPanel />
      </TabsContent>

      <TabsContent value="lokasi" className="min-w-0 flex-1 animate-masuk">
        <LiveLocationMap />
      </TabsContent>

      <TabsContent value="alokasi" className="min-w-0 flex-1 animate-masuk">
        <LoanAllocationQueueTab onOpen={onOpenLoan} />
      </TabsContent>

      <TabsContent value="dpd" className="min-w-0 flex-1 animate-masuk">
        <DpdTab />
      </TabsContent>

      <TabsContent value="lelang" className="min-w-0 flex-1 animate-masuk">
        <LelangTab />
      </TabsContent>

      <TabsContent value="ledger" className="min-w-0 flex-1 animate-masuk">
        <LedgerTab />
      </TabsContent>

      <TabsContent value="backup" className="min-w-0 flex-1 animate-masuk">
        <BackupPanel />
      </TabsContent>

      <TabsContent value="template" className="min-w-0 flex-1 animate-masuk">
        <WebsiteTemplatePanel />
      </TabsContent>

      <TabsContent value="config" className="min-w-0 flex-1 animate-masuk">
        <SystemConfigPanel />
      </TabsContent>

      <TabsContent value="plafon" className="min-w-0 flex-1 animate-masuk">
        <PlafonPanel />
      </TabsContent>

      <TabsContent value="akses" className="min-w-0 flex-1 animate-masuk">
        <AksesPenyediaDanaPanel />
      </TabsContent>

      <TabsContent value="audit" className="min-w-0 flex-1 animate-masuk">
        <AuditTrailPanel />
      </TabsContent>

      <TabsContent value="loglogin" className="min-w-0 flex-1 animate-masuk">
        <LoginSecurityPanel onOpenSetup={onOpenSetup} />
      </TabsContent>
    </Tabs>
  );
}
