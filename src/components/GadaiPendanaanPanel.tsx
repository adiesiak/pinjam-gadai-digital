import { GadaiPendanaanCard } from "./gadai/GadaiPendanaanCard";
import type { GadaiPendanaanRow } from "./gadai/types";

/**
 * Skema B — pendanaan gadai (LTV ≤ 70%) & pencairan dana bersih 99%.
 *
 * Alur: admin menetapkan pokok + sewa modal (5–10%/30 hari), dana bersih 99%
 * dicairkan, lalu barang berstatus AKTIF. Setelah AKTIF, tagihan sewa modal
 * (decreasing principal) muncul di dashboard Peminjam.
 */
export type { GadaiPendanaanRow };

export function GadaiPendanaanPanel({ pawns }: { pawns: GadaiPendanaanRow[] }) {
  const disetujui = pawns.filter((p) => p.status === "disetujui");
  if (disetujui.length === 0) return null;

  return (
    <section className="mt-8 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-navy">
          Pendanaan gadai (Skema B)
        </h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Tetapkan pokok ≤ LTV 70% &amp; sewa modal 5–10% per 30 hari, lalu
          cairkan dana bersih 99% ke nasabah. Barang menjadi <b>AKTIF</b> setelah
          dana cair.
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
