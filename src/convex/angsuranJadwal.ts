import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { jadwalAngsuranPinjaman } from "../lib/angsuran";

/**
 * Pastikan satu pinjaman yang sudah cair punya baris angsuran.
 *
 * Idempoten: bila sudah ada baris untuk pinjaman ini, tidak ada yang ditulis.
 * Dipanggil dari SEMUA jalur pencairan (ubah status, `danaiPinjaman`, dan
 * alokasi dana penuh) serta dari backfill peminjam untuk data lama. Jadwalnya
 * berasal dari `lib/angsuran` — sumber angka yang sama dengan form dan kontrak,
 * jadi tabel ini tidak pernah menghitung ulang nominal di klien.
 */
export async function pastikanAngsuran(
  ctx: MutationCtx,
  loan: Doc<"loans">,
): Promise<void> {
  if (loan.status !== "didanai" || loan.didanaiPada === undefined) return;

  const ada = await ctx.db
    .query("angsuran")
    .withIndex("by_loan", (q) => q.eq("loanId", loan._id))
    .first();
  if (ada !== null) return;

  const jadwal = jadwalAngsuranPinjaman(loan);
  for (const row of jadwal) {
    await ctx.db.insert("angsuran", {
      userId: loan.userId,
      loanId: loan._id,
      nomor: row.nomor,
      jatuhTempoPada: row.jatuhTempoPada,
      pokok: row.pokok,
      bunga: row.bunga,
      biayaAdmin: row.biayaAdmin,
      total: row.total,
      status: "belum_dibayar",
    });
  }
}
