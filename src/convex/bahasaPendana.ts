/**
 * Bahasa laporan pendana, tersimpan di akun.
 *
 * Nilai ini hanya mengatur bahasa dokumen (PDF dan pesan laporan), bukan bahasa
 * antarmuka. Disimpan di akun agar pilihan yang dibuat dari satu perangkat
 * dipakai juga oleh laporan WhatsApp yang disusun server.
 */
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import { internalQuery, mutation, query } from "./_generated/server";

export const BAHASA_LAPORAN = v.union(v.literal("id"), v.literal("en"));

/** Preferensi akun yang sedang masuk; `id` bila belum pernah memilih. */
export const preferensi = query({
  args: {},
  handler: async (ctx): Promise<"id" | "en"> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return "id";
    const user = await ctx.db.get(userId);
    return user?.bahasaLaporan ?? "id";
  },
});

/** Simpan pilihan bahasa laporan untuk akun yang sedang masuk. */
export const simpan = mutation({
  args: { bahasa: BAHASA_LAPORAN },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Masuk dulu untuk menyimpan bahasa laporan.");
    await ctx.db.patch(userId, { bahasaLaporan: args.bahasa });
    return { bahasa: args.bahasa };
  },
});

/** Dipakai action laporan WhatsApp: bahasa milik pemilik laporan. */
export const _untukPengguna = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }): Promise<"id" | "en"> => {
    const user = await ctx.db.get(userId);
    return user?.bahasaLaporan ?? "id";
  },
});
