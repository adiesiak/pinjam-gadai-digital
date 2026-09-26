import {
  BellRing,
  ClipboardList,
  Coins,
  Database,
  Gavel,
  Landmark,
  Lock,
  Map as MapIcon,
  MessageSquare,
  Package,
  Send,
  Settings2,
  ShieldCheck,
  Wallet,
} from "lucide-react";

import { AnnouncementCms, LoginSecurityPanel } from "@/components/admin/ContentPanels";
import {
  DpdTab,
  LedgerTab,
  LiveLocationMap,
  LelangTab,
  PencairanTab,
} from "@/components/admin/OperationsTabs";
import {
  AuditTrailPanel,
  BackupPanel,
  SystemConfigPanel,
  WhatsAppPanel,
} from "@/components/admin/SystemPanels";
import { type LoanRow, type PawnRow } from "@/components/admin/admin-shared";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { LoanQueueSection, PawnQueueSection } from "./queue-views";
import {
  SetoranSection,
  type LedgerSummary,
  type PendingDeposit,
  type PendingWithdrawal,
} from "./setoran-views";
import { type AdminStatsData } from "./admin-shell";

type TabIcon = typeof ClipboardList;

/** Tab navigasi + seluruh konten tab panel admin. */
export function AdminTabs({
  overview,
  stats,
  ledger,
  pendingDeposits,
  pendingWd,
  onOpenLoan,
  onOpenPawn,
  onOpenSetup,
}: {
  overview: { loans: LoanRow[]; pawns: PawnRow[] };
  stats: AdminStatsData | undefined;
  ledger: LedgerSummary | undefined;
  pendingDeposits: PendingDeposit[] | undefined;
  pendingWd: PendingWithdrawal[] | undefined;
  onOpenLoan: (l: LoanRow) => void;
  onOpenPawn: (p: PawnRow) => void;
  onOpenSetup: () => void;
}) {
  return (
    <Tabs defaultValue="pinjaman" className="mt-8 flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
      <TabsList className="sticky top-20 z-30 -mx-6 h-auto w-auto flex flex-row flex-wrap items-center gap-2 overflow-x-auto rounded-none border-y border-slate-200 bg-white/90 px-6 py-2 backdrop-blur lg:mx-0 lg:w-64 lg:flex-col lg:items-stretch lg:gap-1 lg:overflow-visible lg:rounded-2xl lg:border lg:border-slate-200 lg:px-2 lg:py-2 lg:shadow-sm">
        {(
          [
            ["pinjaman", "Pinjaman", `${overview.loans.filter((l) => l.status === "diajukan").length}`, ClipboardList],
            ["gadai", "Gadai", `${overview.pawns.filter((p) => p.status === "diajukan" || p.status === "sedang_dinilai").length}`, Package],
            ["lokasi", "Live Location Map", null, MapIcon],
            ["pencairan", "Pencairan", stats ? `${stats.antreanPencairan}` : null, Wallet],
            ["dpd", "Koleksi / DPD", stats ? `${stats.pinjamanTerlambat}` : null, BellRing],
            ["lelang", "Lelang Jaminan", null, Gavel],
            ["ledger", "Ledger & Keuangan", ledger?.seimbang ? "OK" : "!", Landmark],
            ["backup", "Backup & Keamanan", null, Database],
            ["config", "Pengaturan System", null, Settings2],
            ["audit", "Audit Trail", null, Lock],
            ["loglogin", "Keamanan Login", null, ShieldCheck],
            ["setoran", "Setoran", `${pendingDeposits?.length ?? 0}`, Coins],
            ["pengumuman", "Pengumuman", null, MessageSquare],
            ["whatsapp", "WhatsApp", null, Send],
          ] as Array<[string, string, string | null, TabIcon]>
        ).map(([value, label, badge, Icon]) => (
          <TabsTrigger
            key={value}
            value={value}
            className="h-9 w-auto flex-none justify-start gap-2.5 rounded-xl px-3.5 text-left text-xs font-medium text-navy shadow-none transition-colors hover:bg-slate-50 data-[state=active]:gradient-primary data-[state=active]:text-white data-[state=active]:shadow-none data-[state=active]:hover:bg-none lg:w-full"
          >
            <Icon className="size-3.5" />
            {label}
            {badge !== null && badge !== undefined && badge !== "0" && (
              <span
                className={`ml-auto inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
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

      <TabsContent value="pinjaman" className="min-w-0">
        <LoanQueueSection loans={overview.loans} onOpen={onOpenLoan} />
      </TabsContent>

      <TabsContent value="gadai" className="min-w-0">
        <PawnQueueSection pawns={overview.pawns} onOpen={onOpenPawn} />
      </TabsContent>

      <TabsContent value="setoran" className="min-w-0">
        <SetoranSection pendingDeposits={pendingDeposits} pendingWd={pendingWd} ledger={ledger} />
      </TabsContent>

      <TabsContent value="pengumuman" className="min-w-0">
        <AnnouncementCms />
      </TabsContent>

      <TabsContent value="whatsapp" className="min-w-0">
        <WhatsAppPanel />
      </TabsContent>

      <TabsContent value="lokasi" className="min-w-0">
        <LiveLocationMap />
      </TabsContent>

      <TabsContent value="pencairan" className="min-w-0">
        <PencairanTab onOpen={onOpenLoan} />
      </TabsContent>

      <TabsContent value="dpd" className="min-w-0">
        <DpdTab />
      </TabsContent>

      <TabsContent value="lelang" className="min-w-0">
        <LelangTab />
      </TabsContent>

      <TabsContent value="ledger" className="min-w-0">
        <LedgerTab />
      </TabsContent>

      <TabsContent value="backup" className="min-w-0">
        <BackupPanel />
      </TabsContent>

      <TabsContent value="config" className="min-w-0">
        <SystemConfigPanel />
      </TabsContent>

      <TabsContent value="audit" className="min-w-0">
        <AuditTrailPanel />
      </TabsContent>

      <TabsContent value="loglogin" className="min-w-0">
        <LoginSecurityPanel onOpenSetup={onOpenSetup} />
      </TabsContent>
    </Tabs>
  );
}
