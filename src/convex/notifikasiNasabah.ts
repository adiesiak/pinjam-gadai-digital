import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { internalQuery, mutation, query, type QueryCtx } from "./_generated/server";
import { requireAdminSession } from "./adminAuthz";
import { audit, getConfig } from "./system";
import { kanalAktif, kanalEfektif } from "../lib/preferensiNotifikasi";

/**
 * Preferensi notifikasi PER NASABAH.
 *
 * Hanya Super Admin yang dapat menyalakan atau mematikan pengingat satu nasabah,
 * lewat panel nasabah di dashboard admin. Nasabah tidak punya jalur untuk
 * mengubahnya sendiri; modul ini sengaja tidak menyediakan mutation milik
 * nasabah. Sakelar global di Pengaturan Sistem tetap berlaku untuk semua akun;
 * nilai efektifnya selalu `global && preferensi`: mematikan global tidak bisa
 * dilawan dengan menghidupkan pengingat satu nasabah.
 *
 * Pengirim otomatis memakai `_kanalAktif` (internal) sehingga satu aturan yang
 * sama dipakai WhatsApp dan email. OTP dan pesan keamanan tidak melewati
 * gerbang ini.
 */

async function dataNasabah(ctx: QueryCtx, userId: Id<"users">) {
  const user = await ctx.db.get(userId);
  if (user === null) throw new Error("Nasabah tidak ditemukan.");
  const kyc = await ctx.db
    .query("kycProfil")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  const profil = await ctx.db
    .query("nasabahProfil")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  return {
    user,
    nomorWhatsapp:
      kyc?.nomorWhatsApp ?? profil?.nomorWhatsApp ?? user.nomorWhatsApp ?? null,
    emailAlamat: user.email ?? null,
  };
}

/** Keadaan pengaturan nasabah + sakelar global yang sedang berlaku. */
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

/** Simpan pengingat satu nasabah; hanya Super Admin yang boleh memanggilnya. */
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
 * pengaturan per nasabah yang ditetapkan Super Admin; kanal yang dimatikan di
 * level mana pun tidak dikirimi.
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
