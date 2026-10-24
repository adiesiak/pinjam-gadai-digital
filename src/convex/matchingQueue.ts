/**
 * Antrean auto-matching — pokok pinjaman 7/14 hari yang lunas kembali ke pool
 * dan siap disalurkan ke peminjam berikutnya.
 *
 * Yang dicatat adalah JEJAK operasional, bukan uang baru: pelunasan sudah
 * memindahkan pokok + imbal hasil ke dompet penyedia dana di ledger. Baris di
 * sini menjawab pertanyaan "dana mana yang sudah bebas dan menunggu borrower
 * berikutnya", supaya admin bisa mencocokkannya tanpa menghitung ulang.
 *
 * Idempoten per pinjaman (`by_loan`), jadi pelunasan yang tercatat dua kali
 * tidak menggandakan antrean. Tenor cepat 7, 14, dan 21 hari masuk antrean;
 * tenor 28 hari tetap menunggu keputusan admin.
 */
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { requireAdminRole } from "./adminAuthz";

export const TENOR_ANTREAN_CEPAT: readonly number[] = [7, 14, 21];

/**
 * Catat dana pokok yang kembali ke pool setelah pinjaman lunas. Dipanggil dari
 * jalur pelunasan nasabah maupun pencocokan admin. `undefined` berarti tenor
 * ini tidak masuk antrean cepat.
 */
export async function catatDanaKembali(
  ctx: MutationCtx,
  loan: Pick<Doc<"loans">, "_id" | "nomorReferensi" | "pokokPinjaman" | "tenorHari">,
  waktu: number,
): Promise<Id<"matchingQueue"> | null> {
  if (!TENOR_ANTREAN_CEPAT.includes(loan.tenorHari)) return null;
  const sudah = await ctx.db
    .query("matchingQueue")
    .withIndex("by_loan", (q) => q.eq("loanId", loan._id))
    .first();
  if (sudah !== null) return sudah._id;
  return await ctx.db.insert("matchingQueue", {
    loanId: loan._id,
    nomorReferensi: loan.nomorReferensi,
    pokok: loan.pokokPinjaman,
    tenorHari: loan.tenorHari,
    tersediaPada: waktu,
    status: "tersedia",
  });
}

/** Pool dana yang siap disalurkan + riwayat pencocokan terakhir. */
export const ringkasanAntrean = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminRole(ctx);
    const rows = await ctx.db.query("matchingQueue").collect();
    const tersedia = rows
      .filter((row) => row.status === "tersedia")
      .sort((a, b) => a.tersediaPada - b.tersediaPada);
    return {
      jumlahTersedia: tersedia.length,
      totalTersedia: tersedia.reduce((acc, row) => acc + row.pokok, 0),
      tersedia: tersedia.slice(0, 20).map((row) => ({
        id: row._id,
        nomorReferensi: row.nomorReferensi,
        pokok: row.pokok,
        tenorHari: row.tenorHari,
        tersediaPada: row.tersediaPada,
      })),
      sudahTersalurkan: rows.filter((row) => row.status === "tersalurkan").length,
    };
  },
});

/**
 * Tandai satu entri pool sudah dipakai pinjaman berikutnya.
 * `loanTujuanId` opsional: admin boleh mencatat penyaluran tanpa mengikat
 * nomor pinjaman tertentu (mis. dana digabung ke pool lebih besar).
 */
export const tandaiTersalurkan = mutation({
  args: {
    id: v.id("matchingQueue"),
    loanTujuanId: v.optional(v.id("loans")),
  },
  handler: async (ctx, args) => {
    const { user } = await requireAdminRole(ctx);
    const row = await ctx.db.get(args.id);
    if (row === null) throw new Error("Entri antrean tidak ditemukan.");
    if (row.status !== "tersedia") {
      throw new Error("Dana ini sudah ditandai tersalurkan.");
    }
    if (args.loanTujuanId !== undefined) {
      const tujuan = await ctx.db.get(args.loanTujuanId);
      if (tujuan === null) throw new Error("Pinjaman tujuan tidak ditemukan.");
      if (tujuan.status !== "disetujui" && tujuan.status !== "didanai") {
        throw new Error("Pinjaman tujuan harus berstatus Disetujui atau Didanai.");
      }
    }
    await ctx.db.patch(args.id, {
      status: "tersalurkan",
      ...(args.loanTujuanId === undefined ? {} : { loanTujuanId: args.loanTujuanId }),
      dicocokkanPada: Date.now(),
      dicocokkanOleh: user.email ?? user.name ?? "admin",
    });
    return { ok: true as const };
  },
});
