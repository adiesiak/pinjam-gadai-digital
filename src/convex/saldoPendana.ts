import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { danaWalletBalance } from "./ledger";
import { kewajibanSiklusAktif } from "./siklusPendana";

export type RincianSaldoPendana = {
  /** Saldo ledger saat ini, sebelum reservasi apa pun. */
  saldo: number;
  /** Pokok + imbal siklus berjalan yang belum boleh ditarik. */
  terkunci: number;
  /** Penarikan menunggu proses yang sudah memesan saldo. */
  tertahanPenarikan: number;
  /** Saldo yang boleh dipakai untuk alokasi atau penarikan baru. */
  bisaDitarik: number;
};

/**
 * Satu bacaan saldo untuk alokasi, penarikan, dan panel admin.
 *
 * Penarikan yang masih `menunggu_proses` adalah reservasi. Tanpa mengurangi
 * angka itu, pendana bisa mengajukan dua penarikan atau mengalokasikan dana
 * yang sudah dijanjikan keluar; admin lalu menemukan saldo tidak cukup saat
 * mencairkan. `kecualikanPenarikanId` dipakai saat admin memproses satu
 * penarikan: reservasi miliknya sendiri tidak boleh dihitung dua kali.
 */
export async function rincianSaldoPendana(
  ctx: QueryCtx,
  danaId: Id<"users">,
  opsi: { kecualikanPenarikanId?: Id<"withdrawals"> } = {},
): Promise<RincianSaldoPendana> {
  const saldo = await danaWalletBalance(ctx, danaId);
  const terkunci = await kewajibanSiklusAktif(ctx, danaId);
  const rows = await ctx.db
    .query("withdrawals")
    .withIndex("by_dana", (q) => q.eq("danaId", danaId))
    .collect();
  const tertahanPenarikan = rows
    .filter(
      (row) =>
        row.status === "menunggu_proses" &&
        row._id !== opsi.kecualikanPenarikanId,
    )
    .reduce((total, row) => total + row.jumlah, 0);
  return {
    saldo,
    terkunci,
    tertahanPenarikan,
    bisaDitarik: Math.max(0, saldo - terkunci - tertahanPenarikan),
  };
}
