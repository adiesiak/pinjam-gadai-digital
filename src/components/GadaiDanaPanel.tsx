import { GadaiDanaCard } from "./gadai/GadaiDanaCard";
import type { GadaiDanaRow } from "./gadai/types";

/**
 * Skema B — alokasi gadai (LTV ≤ 70%) dengan nilai bersih 99%.
 *
 * Admin mencatat pokok + sewa modal (5–10%/30 hari) pada ledger internal.
 * Aktivasi status tidak mengirim dana dan tidak membuktikan barang diterima.
 * Tagihan sewa modal yang dihitung dari sisa pokok tampil di dashboard Peminjam.
 */
export type { GadaiDanaRow };

export function GadaiDanaPanel({ pawns }: { pawns: GadaiDanaRow[] }) {
  const disetujui = pawns.filter((p) => p.status === "disetujui");
  if (disetujui.length === 0) return null;

  return (
    <section className="mt-8 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-navy">
          Ledger gadai (Skema B)
        </h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Catat pokok ≤ LTV 70% &amp; sewa modal 5–10% per 30 hari.
          Nilai bersih 99% adalah hasil hitung aplikasi; perubahan status dicatat
          pada ledger internal.
        </p>
      </div>
      <div className="space-y-4">
        {disetujui.map((p) => (
          <GadaiDanaCard key={p._id} pawn={p} />
        ))}
      </div>
    </section>
  );
}
