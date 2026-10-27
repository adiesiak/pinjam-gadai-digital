/**
 * Panel pengajuan konvensional — satu menu untuk tiga produk antrean.
 *
 * Pinjaman tunai, gadai, dan kredit barang punya mesin dan peninjau sendiri,
 * tetapi pekerjaan adminnya sama: memutuskan pengajuan yang masuk. Karena itu
 * ketiganya disatukan seperti panel syariah, dengan sub-tab produk di atas dan
 * isi tiap antrean tetap memakai komponen aslinya (`LoanQueueSection`,
 * `PawnQueueSection`, `KreditQueuePanel`) — tidak ada logika antrean yang
 * disalin ke sini.
 */
import { ClipboardList, Package, ShoppingBag } from "lucide-react";
import { useState, type ComponentType } from "react";

import { KreditQueuePanel } from "@/components/admin/KreditQueuePanel";
import {
  type AdminOverviewData,
  type LoanRow,
  type PawnRow,
} from "@/components/admin/admin-shared";
import { hitungMenunggu } from "@/lib/admin-queue";
import { cn } from "@/lib/utils";

import { LoanQueueSection, PawnQueueSection } from "./queue-views";

type TabKonvensional = "pinjaman" | "gadai" | "kredit";

/**
 * Sub-tab awal mengikuti parameter `?tab=` supaya tautan lama
 * (`?tab=gadai`, `?tab=kredit`) langsung membuka antrean yang dimaksud.
 * Modulnya sendiri sudah dipetakan ke `konvensional` oleh
 * `modulDariParameter`.
 */
function tabAwal(): TabKonvensional {
  if (typeof window === "undefined") return "pinjaman";
  const nilai = new URLSearchParams(window.location.search).get("tab");
  return nilai === "gadai" || nilai === "kredit" ? nilai : "pinjaman";
}

export function KonvensionalPanel({
  overview,
  onOpenLoan,
  onOpenPawn,
}: {
  overview: AdminOverviewData;
  onOpenLoan: (l: LoanRow) => void;
  onOpenPawn: (p: PawnRow) => void;
}) {
  const [tab, setTab] = useState<TabKonvensional>(tabAwal);

  const cacah: Record<TabKonvensional, number> = {
    pinjaman: hitungMenunggu(overview.loans, "pinjaman"),
    gadai: hitungMenunggu(overview.pawns, "gadai"),
    kredit: hitungMenunggu(overview.kredit, "kredit"),
  };

  const pilihan: Array<{
    id: TabKonvensional;
    label: string;
    Ikon: ComponentType<{ className?: string }>;
  }> = [
    { id: "pinjaman", label: "Pinjaman tunai", Ikon: ClipboardList },
    { id: "gadai", label: "Gadai", Ikon: Package },
    { id: "kredit", label: "Kredit barang", Ikon: ShoppingBag },
  ];

  return (
    <div className="min-w-0 space-y-4">
      <div
        role="group"
        aria-label="Jenis pengajuan konvensional"
        className="flex flex-wrap gap-2"
      >
        {pilihan.map(({ id, label, Ikon }) => {
          const aktif = tab === id;
          const jumlah = cacah[id];
          return (
            <button
              key={id}
              type="button"
              aria-pressed={aktif}
              onClick={() => setTab(id)}
              className={cn(
                "flex min-h-11 items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                aktif
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-slate-200 bg-white text-slate-700 hover:border-primary hover:text-primary",
              )}
            >
              <Ikon className="size-3.5 shrink-0" aria-hidden />
              {label}
              <span
                className={cn(
                  "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
                  aktif ? "bg-white/20 text-white" : "bg-amber-100 text-amber-800",
                )}
              >
                {jumlah}
              </span>
            </button>
          );
        })}
      </div>

      {tab === "pinjaman" && (
        <LoanQueueSection
          loans={overview.loans}
          onOpen={onOpenLoan}
          sekarang={overview.dihitungPada}
        />
      )}
      {tab === "gadai" && (
        <PawnQueueSection pawns={overview.pawns} onOpen={onOpenPawn} />
      )}
      {tab === "kredit" && <KreditQueuePanel />}
    </div>
  );
}
