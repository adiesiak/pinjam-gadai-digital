import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { internalQuery, mutation, query, type QueryCtx } from "./_generated/server";
import { requireAdminSession } from "./adminAuthz";
import { audit, getConfig } from "./system";
import { kanalAktif, kanalEfektif } from "../lib/preferensiNotifikasi";

/**
 * Preferensi notifikasi PER NASABAH.
 *
 * Nasabah dapat mematikan pengingat WhatsApp dari tab Profil & Rekening.
 * Admin membaca dan mengubah nilai yang sama dari panel nasabah, sehingga
 * tidak ada dua sakelar yang bisa saling bertentangan. Sakelar global di
 * Pengaturan Sistem tetap berlaku untuk semua akun; nilai efektifnya selalu
 * `global && preferensi`: mematikan global tidak bisa dilawan dengan
 * menghidupkan preferensi nasabah.
 *
 * Pengirim otomatis memakai `_kanalAktif` (internal) sehingga satu aturan yang
 * sama dipakai WhatsApp dan email. OTP dan pesan keamanan tidak melewati
 * gerbang ini.
 */

async function requireNasabahSendiri(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
  const user = await ctx.db.get(userId);
  if (user === null) throw new Error("Pengguna tidak ditemukan.");
  if (user.isAnonymous === true) {
    throw new Error("Akun tamu tidak dapat mengubah preferensi notifikasi.");
  }
  return { userId, user };
}

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

/** Simpan preferensi satu nasabah lewat jalur admin, dengan jejak audit. */
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

/** Preferensi pengingat WhatsApp milik pengguna yang sedang masuk. */
export const preferensiSaya = query({
  args: {},
  handler: async (ctx) => {
    const { userId, user } = await requireNasabahSendiri(ctx);
    const { nomorWhatsapp } = await dataNasabah(ctx, userId);
    const cfg = await getConfig(ctx);
    return {
      whatsapp: kanalAktif(user.notifWhatsapp),
      efektifWhatsapp: kanalEfektif(cfg.notifWhatsappAktif, user.notifWhatsapp),
      globalWhatsapp: cfg.notifWhatsappAktif,
      nomorWhatsapp,
    };
  },
});

/**
 * Simpan preferensi pengingat WhatsApp milik sendiri.
 *
 * Nilai yang disimpan adalah preferensi nasabah, bukan keputusan admin. Admin
 * melihat nilai yang sama di panel nasabah dan tetap dapat menimpanya bila
 * perlu. Perubahan dicatat dengan aktor nasabah agar jejaknya tidak tertukar
 * dengan tindakan admin.
 */
export const simpanPreferensiSaya = mutation({
  args: { whatsapp: v.boolean() },
  handler: async (ctx, { whatsapp }) => {
    const { userId, user } = await requireNasabahSendiri(ctx);
    const sebelum = kanalAktif(user.notifWhatsapp);
    if (sebelum !== whatsapp) {
      await ctx.db.patch(userId, { notifWhatsapp: whatsapp });
      await audit(
        ctx,
        userId,
        user.email ?? user.name ?? "nasabah",
        "ubah_preferensi_notifikasi_saya",
        `users:${userId}`,
        `Pengingat WhatsApp: ${sebelum ? "aktif" : "nonaktif"} → ${
          whatsapp ? "aktif" : "nonaktif"
        }`,
      );
    }
    return { whatsapp };
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
