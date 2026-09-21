import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ROLES } from "./schema";

/** Gerbang admin untuk CMS pengumuman. */
async function requireAdmin(ctx: { db: any }) {
  const userId = await getAuthUserId(ctx as never);
  if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
  const user = await ctx.db.get(userId);
  if (user === null || user.role !== ROLES.ADMIN) {
    throw new Error("Akses khusus tim Pinjam Gadai Digital (admin).");
  }
  return { userId };
}

const SLOT = "global";

/** Teks default — dipakai saat admin belum pernah menyimpan pengumuman. */
export const DEFAULT_ANNOUNCEMENT = {
  teks: "Pengajuan pinjaman tunai & gadai digital kini lebih cepat — dilayani dari rumah, ditinjau tim sesegera mungkin. Daftar gratis dan ajukan hari ini.",
  tautan: "/auth" as const,
};

/**
 * Pengumuman aktif untuk bar berjalan di atas semua halaman — publik,
 * tanpa auth. Selalu mengembalikan sesuatu (fallback default) supaya bar
 * tidak pernah hilang karena belum dikonfigurasi.
 */
export const getActive = query({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query("pengumuman")
      .withIndex("by_slot", (q: any) => q.eq("slot", SLOT))
      .first();
    if (row === null || !row.aktif) {
      return { ...DEFAULT_ANNOUNCEMENT, aktif: true, sumber: "default" as const };
    }
    return { teks: row.teks, tautan: row.tautan, aktif: true, sumber: "cms" as const };
  },
});

/** Baris mentah untuk editor CMS di panel admin. */
export const getCmsRow = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const me = await ctx.db.get(userId);
    if (me === null || me.role !== ROLES.ADMIN) return null;
    const row = await ctx.db
      .query("pengumuman")
      .withIndex("by_slot", (q: any) => q.eq("slot", SLOT))
      .first();
    return row ?? null;
  },
});

/** Simpan pengumuman dari editor CMS (upsert pada slot global). */
export const save = mutation({
  args: {
    teks: v.string(),
    tautan: v.optional(v.string()),
    aktif: v.boolean(),
  },
  handler: async (ctx, { teks, tautan, aktif }) => {
    const { userId } = await requireAdmin(ctx);
    const teksBersih = teks.trim().slice(0, 240);
    if (teksBersih.length === 0) {
      throw new Error("Teks pengumuman tidak boleh kosong.");
    }
    const tautanBersih = tautan?.trim() ? tautan.trim().slice(0, 120) : undefined;
    const now = Date.now();
    const existing = await ctx.db
      .query("pengumuman")
      .withIndex("by_slot", (q: any) => q.eq("slot", SLOT))
      .first();
    if (existing === null) {
      await ctx.db.insert("pengumuman", {
        slot: SLOT,
        teks: teksBersih,
        tautan: tautanBersih,
        aktif,
        diperbaruiPada: now,
      });
    } else {
      await ctx.db.patch(existing._id, {
        teks: teksBersih,
        tautan: tautanBersih,
        aktif,
        diperbaruiPada: now,
      });
    }
    void userId;
    return { ok: true };
  },
});
