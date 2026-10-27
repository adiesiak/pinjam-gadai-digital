import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";

import { GadaiDanaCard } from "./gadai/GadaiDanaCard";
import type { GadaiDanaRow, PilihanPendanaGadai } from "./gadai/types";

/**
 * Skema B — alokasi gadai (LTV ≤ 70%) dengan nilai bersih 99%.
 *
 * Admin mencatat pokok + sewa modal (5–10%/30 hari), menetapkan satu penyedia
 * dana, lalu mencatat pembayaran yang sudah diterima di luar aplikasi.
 * Aktivasi status tidak mengirim dana dan tidak membuktikan barang diterima.
 * Tagihan sewa modal yang dihitung dari sisa pokok tampil di dashboard Peminjam.
 */
export type { GadaiDanaRow };

export function GadaiDanaPanel({ pawns }: { pawns: GadaiDanaRow[] }) {
  const kandidat = useQuery(api.penyediaDana.kandidatPendana, {});
  const pilihan: PilihanPendanaGadai[] =
    kandidat?.rows.map((row) => ({
      userId: row.userId,
      nama: row.nama,
      email: row.email,
      aksesAktif: row.aksesAktif,
    })) ?? [];

  const relevan = pawns.filter((p) => p.status === "disetujui" || p.status === "aktif");
  if (relevan.length === 0) return null;

  return (
    <section className="mt-8 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-navy">Ledger gadai (Skema B)</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Catat pokok ≤ LTV 70% dan sewa modal 5–10% per 30 hari. Tetapkan satu
          penyedia dana penanggung pokok, lalu catat pembayaran yang sudah
          diterima. Nilai bersih 99% adalah hasil hitung aplikasi; perpindahan
          uang tetap di luar aplikasi.
        </p>
      </div>
      <div className="space-y-4">
        {relevan.map((p) => (
          <GadaiDanaCard key={p._id} pawn={p} kandidatPendana={pilihan} />
        ))}
      </div>
    </section>
  );
}
