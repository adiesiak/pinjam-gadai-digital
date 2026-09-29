import { GadaiPendanaanCard } from "./gadai/GadaiPendanaanCard";
import type { GadaiPendanaanRow } from "./gadai/types";

/**
 * Skema B — simulasi alokasi gadai (LTV ≤ 70%) dengan nilai bersih 99%.
 *
 * Admin mencatat pokok + sewa modal (5–10%/30 hari) pada ledger internal.
 * Aktivasi status tidak mengirim dana dan tidak membuktikan barang diterima.
 * Tagihan sewa modal yang dihitung dari sisa pokok tampil di dashboard Peminjam.
 */
export type { GadaiPendanaanRow };

export function GadaiPendanaanPanel({ pawns }: { pawns: GadaiPendanaanRow[] }) {
  const disetujui = pawns.filter((p) => p.status === "disetujui");
  if (disetujui.length === 0) return null;

  return (
    <section className="mt-8 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-navy">
          Simulasi ledger gadai (Skema B)
        </h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Catat pokok simulasi ≤ LTV 70% &amp; sewa modal 5–10% per 30 hari.
          Nilai bersih 99% adalah hasil hitung, bukan transfer; aktivasi status
          tidak membuktikan penitipan barang atau dana diterima.
        </p>
      </div>
      <div className="space-y-4">
        {disetujui.map((p) => (
          <GadaiPendanaanCard key={p._id} pawn={p} />
        ))}
      </div>
    </section>
  );
}
