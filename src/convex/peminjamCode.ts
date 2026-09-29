import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

/**
 * Terbitkan satu kode acak yang tetap untuk setiap Peminjam.
 * Kode tidak diturunkan dari nama, nomor pengguna, NIK, atau data pengajuan.
 */
export async function ensureKodePeminjam(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<string> {
  const user = await ctx.db.get(userId);
  if (user === null) throw new Error("Pengguna tidak ditemukan.");
  if (user.kodePeminjam !== undefined) return user.kodePeminjam;

  // 64 bit acak dari UUID kriptografis; periksa indeks sebelum menyimpan.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const kodePeminjam = `PMN-${crypto
      .randomUUID()
      .replace(/-/g, "")
      .slice(0, 20)
      .toUpperCase()}`;
    const sudahDipakai = await ctx.db
      .query("users")
      .withIndex("by_kodePeminjam", (q) => q.eq("kodePeminjam", kodePeminjam))
      .first();
    if (sudahDipakai !== null) continue;

    await ctx.db.patch(userId, { kodePeminjam });
    return kodePeminjam;
  }

  throw new Error("Kode peminjam belum dapat diterbitkan. Silakan coba lagi.");
}
