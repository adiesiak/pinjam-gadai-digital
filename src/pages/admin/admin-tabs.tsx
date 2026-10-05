import { Fragment, useState } from "react";
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

/** Satu menu operasional: nilai tab, label, penjelasan singkat, lencana, ikon. */
type AdminTabItem = {
  value: string;
  label: string;
  /** Penjelasan satu baris — muncul saat tab aktif agar tim tahu isinya. */
  hint: string;
  badge: string | null;
  Icon: TabIcon;
};

/** Kelompok menu agar daftar panjang tidak membingungkan. */
type AdminTabGroup = {
  judul: string;
  items: AdminTabItem[];
};

/** Ringkasan ledger internal untuk lencana tab — mengikuti `admin.ledgerSummary`. */
type LedgerSummary = {
  totalDebit: number;
  totalKredit: number;
  entryCount: number;
  seimbang: boolean;
  /** Total biaya platform yang sudah dijurnal (platform:FEE, sisi debit). */
  pendapatanPlatform: number;
};

/** Kelas bersama untuk tombol menu (sidebar desktop). */
const KELAS_TRIGGER =
  "h-10 w-full justify-start gap-2.5 rounded-xl px-3 text-left text-xs font-medium text-navy shadow-none transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 data-[state=active]:gradient-primary data-[state=active]:text-white data-[state=active]:shadow-none data-[state=active]:hover:bg-none lg:min-h-10 lg:text-sm";

/** Lencana angka seragam: netral, "OK" hijau, "!" merah berdenyut, lain kuning. */
function LencanaTab({ badge }: { badge: string | null }) {
  if (badge === null || badge === undefined || badge === "0") return null;
  const warna =
    badge === "OK"
      ? "bg-emerald-100 text-emerald-700"
      : badge === "!"
        ? "animate-pulse bg-red-100 text-red-700"
        : "bg-amber-100 text-amber-700";
  return (
    <span
      className={`inline-flex min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${warna}`}
    >
      {badge}
    </span>
  );
}

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

  const menu: AdminTabGroup[] = [
    {
      judul: "Pengajuan & tindakan",
      items: [
        {
          value: "pinjaman",
          label: "Pinjaman",
          hint: "Tinjau dan putuskan pengajuan pinjaman tunai.",
          badge: `${overview.loans.filter((l) => l.status === "diajukan").length}`,
          Icon: ClipboardList,
        },
        {
          value: "gadai",
          label: "Gadai",
          hint: "Tinjau pengajuan gadai dan nilai barang jaminan.",
          badge: `${overview.pawns.filter((p) => p.status === "diajukan" || p.status === "sedang_dinilai").length}`,
          Icon: Package,
        },
        {
          value: "kredit",
          label: "Kredit Barang",
          hint: "Tinjau pengajuan kredit barang.",
          badge: `${overview.kredit.filter((k) => k.status === "diajukan" || k.status === "sedang_ditinjau").length}`,
          Icon: ShoppingBag,
        },
        {
          value: "alokasi",
          label: "Pinjaman disetujui (internal)",
          hint: "Pantau pinjaman yang sudah disetujui (catatan internal).",
          badge: stats ? `${stats.pinjamanDisetujui}` : null,
          Icon: Wallet,
        },
      ],
    },
    {
      judul: "Pemantauan",
      items: [
        {
          value: "lokasi",
          label: "Peta Live Location",
          hint: "Peta titik lokasi terakhir yang dilaporkan perangkat peminjam.",
          // Notifikasi lokasi: pola koordinat dicurigai, pola lokasi ditandai,
          // peringatan belum diakui, dan pinjaman tanpa titik perangkat.
          badge: stats
            ? `${stats.gpsMismatch + stats.titikDicurigai + stats.peringatanLokasiAktif + stats.pinjamanTanpaLokasi}`
            : null,
          Icon: MapIcon,
        },
        {
          value: "dpd",
          label: "Tanggal acuan",
          hint: "Pinjaman yang melewati tanggal acuan pelunasan.",
          badge: stats ? `${stats.pinjamanTerlambat}` : null,
          Icon: BellRing,
        },
        {
          value: "ledger",
          label: "Ledger internal",
          hint: "Saldo dan jurnal internal — pastikan pembukuan seimbang.",
          badge: ledger?.seimbang ? "OK" : "!",
          Icon: Landmark,
        },
        {
          value: "lelang",
          label: "Kalkulator lelang jaminan",
          hint: "Kalkulator nilai lelang untuk barang jaminan.",
          badge: null,
          Icon: Gavel,
        },
      ],
    },
    {
      judul: "Nasabah & penyedia dana",
      items: [
        {
          value: "plafon",
          label: "Plafon Nasabah",
          hint: "Atur plafon pinjaman per nasabah.",
          badge: null,
          Icon: SlidersHorizontal,
        },
        {
          value: "akses",
          label: "Kelola Penyedia Dana",
          hint: "Kelola akses dan posisi penyedia dana.",
          badge: null,
          Icon: Wallet,
        },
      ],
    },
    {
      judul: "Komunikasi",
      items: [
        {
          value: "pengumuman",
          label: "Pengumuman",
          hint: "Terbitkan pengumuman untuk pengguna aplikasi.",
          badge: null,
          Icon: MessageSquare,
        },
        {
          value: "whatsapp",
          label: "WhatsApp",
          hint: "Template pesan dan status kanal WhatsApp.",
          badge: null,
          Icon: Send,
        },
      ],
    },
    {
      judul: "Sistem & keamanan",
      items: [
        {
          value: "config",
          label: "Pengaturan Sistem",
          hint: "Kebijakan sistem: bunga, potongan admin, mode pemeliharaan.",
          badge: null,
          Icon: Settings2,
        },
        {
          value: "template",
          label: "Template Website",
          hint: "Teks dan tampilan halaman publik.",
          badge: null,
          Icon: PanelsTopLeft,
        },
        {
          value: "loglogin",
          label: "Keamanan Login",
          hint: "Riwayat login dan status verifikasi TOTP.",
          badge: null,
          Icon: ShieldCheck,
        },
        {
          value: "audit",
          label: "Audit Trail",
          hint: "Jejak seluruh tindakan admin.",
          badge: null,
          Icon: Lock,
        },
        {
          value: "backup",
          label: "Backup & Keamanan",
          hint: "Cadangan data dan pemulihan sistem.",
          badge: null,
          Icon: Database,
        },
      ],
    },
  ];

  const semuaItem = menu.flatMap((g) => g.items);
  const aktif = semuaItem.find((i) => i.value === activeTab) ?? semuaItem[0];

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
            {menu.map((grup) => (
              <optgroup key={grup.judul} label={grup.judul}>
                {grup.items.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                    {item.badge !== null && item.badge !== "0" ? ` · ${item.badge}` : ""}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        </div>
      </div>

      <TabsList
        aria-label="Navigasi panel admin"
        className="animate-masuk hidden lg:sticky lg:top-20 lg:z-30 lg:flex lg:h-auto lg:w-64 lg:shrink-0 lg:flex-col lg:items-stretch lg:gap-1 lg:self-start lg:rounded-2xl lg:border lg:border-slate-200 lg:bg-white lg:p-2"
      >
        {menu.map((grup, indeks) => (
          <Fragment key={grup.judul}>
            <p
              role="presentation"
              className={`px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground ${
                indeks === 0 ? "pt-0.5" : "pt-3"
              }`}
            >
              {grup.judul}
            </p>
            {grup.items.map(({ value, label, hint, badge, Icon }) => (
              <TabsTrigger key={value} value={value} title={hint} className={KELAS_TRIGGER}>
                <Icon className="size-3.5 shrink-0" />
                <span className="min-w-0 flex-1 whitespace-normal break-words text-left leading-5">
                  {label}
                </span>
                <LencanaTab badge={badge} />
              </TabsTrigger>
            ))}
          </Fragment>
        ))}
      </TabsList>

      <div className="min-w-0 flex-1 space-y-4 sm:space-y-5">
        {aktif && (
          <div className="animate-masuk flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <aktif.Icon className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-navy">{aktif.label}</p>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{aktif.hint}</p>
            </div>
          </div>
        )}

        <TabsContent value="pinjaman" className="min-w-0 animate-masuk">
          <LoanQueueSection loans={overview.loans} onOpen={onOpenLoan} />
        </TabsContent>

        <TabsContent value="gadai" className="min-w-0 animate-masuk">
          <PawnQueueSection pawns={overview.pawns} onOpen={onOpenPawn} />
        </TabsContent>

        <TabsContent value="kredit" className="min-w-0 animate-masuk">
          <KreditQueuePanel />
        </TabsContent>

        <TabsContent value="pengumuman" className="min-w-0 animate-masuk">
          <AnnouncementCms />
        </TabsContent>

        <TabsContent value="whatsapp" className="min-w-0 animate-masuk">
          <WhatsAppPanel />
        </TabsContent>

        <TabsContent value="lokasi" className="min-w-0 animate-masuk">
          <LiveLocationMap />
        </TabsContent>

        <TabsContent value="alokasi" className="min-w-0 animate-masuk">
          <LoanAllocationQueueTab onOpen={onOpenLoan} />
        </TabsContent>

        <TabsContent value="dpd" className="min-w-0 animate-masuk">
          <DpdTab />
        </TabsContent>

        <TabsContent value="lelang" className="min-w-0 animate-masuk">
          <LelangTab />
        </TabsContent>

        <TabsContent value="ledger" className="min-w-0 animate-masuk">
          <LedgerTab />
        </TabsContent>

        <TabsContent value="backup" className="min-w-0 animate-masuk">
          <BackupPanel />
        </TabsContent>

        <TabsContent value="template" className="min-w-0 animate-masuk">
          <WebsiteTemplatePanel />
        </TabsContent>

        <TabsContent value="config" className="min-w-0 animate-masuk">
          <SystemConfigPanel />
        </TabsContent>

        <TabsContent value="plafon" className="min-w-0 animate-masuk">
          <PlafonPanel />
        </TabsContent>

        <TabsContent value="akses" className="min-w-0 animate-masuk">
          <AksesPenyediaDanaPanel />
        </TabsContent>

        <TabsContent value="audit" className="min-w-0 animate-masuk">
          <AuditTrailPanel />
        </TabsContent>

        <TabsContent value="loglogin" className="min-w-0 animate-masuk">
          <LoginSecurityPanel onOpenSetup={onOpenSetup} />
        </TabsContent>
      </div>
    </Tabs>
  );
}
