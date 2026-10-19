import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { internalQuery, mutation, query, type QueryCtx } from "./_generated/server";
import { requireAdminSession } from "./adminAuthz";
import { audit, getConfig } from "./system";
import { kanalAktif, kanalEfektif } from "../lib/preferensiNotifikasi";

/**
 * Override notifikasi PER NASABAH — hanya dapat dibaca dan diubah admin.
 *
 * Sakelar global di Pengaturan Sistem tetap berlaku untuk semua akun. Baris di
 * sini adalah pengecualian untuk satu nasabah, dan nilai efektifnya selalu
 * `global && override`: mematikan global tidak bisa dilawan dengan menghidupkan
 * override nasabah.
 *
 * Pengirim otomatis memakai `_kanalAktif` (internal) sehingga satu aturan yang
 * sama dipakai WhatsApp dan email — tidak ada jalur yang lupa memeriksa.
 */

async function dataNasabah(ctx: QueryCtx, userId: Id<"users">) {
  const user = await ctx.db.get(userId);
  if (user === null) throw new Error("Nasabah tidak ditemukan.");
  const kyc = await ctx.db
    .query("kycProfil")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  return {
    user,
    nomorWhatsapp: kyc?.nomorWhatsApp ?? user.nomorWhatsApp ?? null,
    emailAlamat: user.email ?? null,
  };
}

/** Keadaan sakelar nasabah + sakelar global yang sedang berlaku. */
export const preferensiNasabah = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await requireAdminSession(ctx);
    const { user, nomorWhatsapp, emailAlamat } = await dataNasabah(ctx, userId);
    const cfg = await getConfig(ctx);
    const whatsapp = kanalAktif(user.notifWhatsapp);
    const email = kanalAktif(user.notifEmail);
    return {
      whatsapp,
      email,
      globalWhatsapp: cfg.notifWhatsappAktif,
      globalEmail: cfg.notifEmailAktif,
      // Keadaan akhir, supaya panel tidak menghitung ulang aturan `&&`.
      efektifWhatsapp: kanalEfektif(cfg.notifWhatsappAktif, user.notifWhatsapp),
      efektifEmail: kanalEfektif(cfg.notifEmailAktif, user.notifEmail),
      nomorWhatsapp,
      emailAlamat,
    };
  },
});

/** Simpan override satu nasabah — admin saja, dengan jejak audit. */
export const simpanPreferensiNasabah = mutation({
  args: {
    userId: v.id("users"),
    whatsapp: v.boolean(),
    email: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { userId: adminId, user: admin } = await requireAdminSession(ctx);
    const target = await ctx.db.get(args.userId);
    if (target === null) throw new Error("Nasabah tidak ditemukan.");

    const sebelum = {
      whatsapp: kanalAktif(target.notifWhatsapp),
      email: kanalAktif(target.notifEmail),
    };
    await ctx.db.patch(args.userId, {
      notifWhatsapp: args.whatsapp,
      notifEmail: args.email,
    });
    await audit(
      ctx,
      adminId,
      admin.email ?? admin.name ?? "admin",
      "ubah_notifikasi_nasabah",
      `users:${args.userId}`,
      `Notifikasi nasabah: WhatsApp ${sebelum.whatsapp ? "aktif" : "nonaktif"} → ${
        args.whatsapp ? "aktif" : "nonaktif"
      }, Email ${sebelum.email ? "aktif" : "nonaktif"} → ${
        args.email ? "aktif" : "nonaktif"
      }`,
    );
    return { whatsapp: args.whatsapp, email: args.email };
  },
});

/**
 * Gerbang pengiriman efektif untuk satu nasabah dan satu kanal.
 *
 * Dipakai action cron lewat `runQuery`. Menggabungkan kebijakan global dengan
 * pengecualian nasabah; kanal yang dimatikan di level mana pun tidak dikirimi.
 */
export const _kanalAktif = internalQuery({
  args: {
    userId: v.id("users"),
    kanal: v.union(v.literal("whatsapp"), v.literal("email")),
  },
  handler: async (ctx, { userId, kanal }): Promise<boolean> => {
    const user = await ctx.db.get(userId);
    if (user === null) return false;
    const cfg = await getConfig(ctx);
    return kanal === "whatsapp"
      ? kanalEfektif(cfg.notifWhatsappAktif, user.notifWhatsapp)
      : kanalEfektif(cfg.notifEmailAktif, user.notifEmail);
  },
});
