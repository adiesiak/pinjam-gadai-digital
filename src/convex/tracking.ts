import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ROLES } from "./schema";

/**
 * Pelacakan lokasi berkelanjutan Peminjam (opt-in).
 *
 * Privasi: hanya pemilik jejak yang bisa mendorong/membaca jejaknya;
 * admin membaca via query terpisah di admin.ts. Nonaktif menghentikan
 * penerimaan titik baru namun jejak lama tetap tersimpan (append-only).
 */

/** Status persetujuan tracking — satu baris per pengguna. */
export const getStatus = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
    const row = await ctx.db
      .query("trackingConsents")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    return {
      aktif: row?.aktif ?? false,
      disetujuiPada: row?.disetujuiPada,
      dinonaktifkanPada: row?.dinonaktifkanPada,
    };
  },
});

/** Setujui pelacakan berkelanjutan (opt-in eksplisit). */
export const setuju = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
    const existing = await ctx.db
      .query("trackingConsents")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        aktif: true,
        disetujuiPada: Date.now(),
        dinonaktifkanPada: undefined,
      });
    } else {
      await ctx.db.insert("trackingConsents", {
        userId,
        aktif: true,
        disetujuiPada: Date.now(),
      });
    }
    return { ok: true };
  },
});

/** Cabut persetujuan — push titik baru ditolak. */
export const cabut = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
    const existing = await ctx.db
      .query("trackingConsents")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        aktif: false,
        dinonaktifkanPada: Date.now(),
      });
    }
    return { ok: true };
  },
});

/** Push satu titik GPS (device memanggil tiap beberapa menit saat aktif). */
export const pushTitik = mutation({
  args: {
    lat: v.number(),
    lng: v.number(),
    akurasi: v.number(),
    loanId: v.optional(v.id("loans")),
  },
  handler: async (ctx, { lat, lng, akurasi, loanId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
    const consent = await ctx.db
      .query("trackingConsents")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!consent?.aktif) {
      throw new Error("Pelacakan lokasi tidak aktif — beri persetujuan dulu.");
    }
    const valid =
      lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && akurasi >= 0;
    if (!valid) {
      throw new Error("Titik lokasi tidak valid.");
    }
    await ctx.db.insert("lokasiJejak", {
      userId,
      loanId,
      lat,
      lng,
      akurasi,
      waktu: Date.now(),
    });
    return { ok: true };
  },
});

/** Riwayat titik milik sendiri (terbaru dulu, dibatasi). */
export const riwayatSaya = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
    const rows = await ctx.db
      .query("lokasiJejak")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(Math.min(limit ?? 100, 500));
    return rows;
  },
});

/** Titik terakhir (untuk status live di dashboard nasabah). */
export const terakhir = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
    const row = await ctx.db
      .query("lokasiJejak")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .first();
    return row;
  },
});
