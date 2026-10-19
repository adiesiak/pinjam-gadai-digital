import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { internalQuery, mutation, query, type QueryCtx } from "./_generated/server";
import { kanalAktif } from "../lib/preferensiNotifikasi";

export type KanalNotifikasi = "whatsapp" | "email";

/**
 * Preferensi kanal pengingat tagihan milik pengguna.
 *
 * Sumber kebenarannya kolom `notifWhatsapp`/`notifEmail` di `users` (kosong =
 * aktif). Modul ini tidak menyimpan salinan kedua: UI membaca keadaan efektif
 * dari sini, dan setiap pengirim otomatis bertanya ke `_kanalAktif` sebelum
 * mengirim — jadi sakelar di layar dan perilaku pengiriman tidak bisa berbeda.
 */
async function penggunaWajib(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
  const user = await ctx.db.get(userId);
  if (user === null) throw new Error("Pengguna tidak ditemukan.");
  if (user.isAnonymous === true) {
    throw new Error("Akun tamu tidak dapat mengatur notifikasi. Masuk dengan akun terverifikasi.");
  }
  return { userId, user };
}

/**
 * Keadaan pilihan + tujuan yang benar-benar tersedia.
 *
 * Nomor WhatsApp peminjam ada di data KYC; akun pendana mengisinya langsung di
 * `users`. Keduanya dibaca di sini supaya layar tidak menampilkan kanal
 * "aktif" tanpa tujuan yang bisa dipakai.
 */
export const saya = query({
  args: {},
  handler: async (ctx) => {
    const { userId, user } = await penggunaWajib(ctx);
    const kyc = await ctx.db
      .query("kycProfil")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    return {
      whatsapp: kanalAktif(user.notifWhatsapp),
      email: kanalAktif(user.notifEmail),
      nomorWhatsapp: kyc?.nomorWhatsApp ?? user.nomorWhatsApp ?? null,
      emailAlamat: user.email ?? null,
    };
  },
});

/**
 * Simpan kedua pilihan sekaligus.
 *
 * Keduanya wajib dikirim (bukan patch sebagian) supaya dua sakelar di satu kartu
 * tidak pernah saling menimpa keadaan yang belum dilihat pengguna.
 */
export const simpan = mutation({
  args: { whatsapp: v.boolean(), email: v.boolean() },
  handler: async (ctx, args) => {
    const { userId } = await penggunaWajib(ctx);
    await ctx.db.patch(userId, {
      notifWhatsapp: args.whatsapp,
      notifEmail: args.email,
    });
    return { whatsapp: args.whatsapp, email: args.email };
  },
});

/**
 * Gerbang pengiriman untuk proses otomatis.
 *
 * Dipanggil action cron lewat `runQuery`; sengaja internal supaya klien tidak
 * bisa menanyakan pilihan akun lain.
 */
export const _kanalAktif = internalQuery({
  args: {
    userId: v.id("users"),
    kanal: v.union(v.literal("whatsapp"), v.literal("email")),
  },
  handler: async (ctx, { userId, kanal }): Promise<boolean> => {
    const user = await ctx.db.get(userId as Id<"users">);
    if (user === null) return false;
    return kanal === "whatsapp" ? kanalAktif(user.notifWhatsapp) : kanalAktif(user.notifEmail);
  },
});
