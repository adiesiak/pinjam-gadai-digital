import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Identitas kontak akun (nomor WhatsApp + NIK) — dipakai halaman /login
 * untuk menghubungkan identitas nasabah ke akun setelah login sukses.
 *
 * Aturan jujur (Zero Fake Data): nilai hanya ditulis dari input pengguna,
 * dinormalisasi ke format 62… untuk WhatsApp. NIK disimpan penuh (16 digit)
 * karena dipakai pencocokan KYC pengajuan; tidak pernah ditampilkan publik.
 */

function normalizeWa(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "");
  // 08… → 628… ; sudah 62 → biarkan; selain itu tolak.
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  if (digits.startsWith("62")) return digits;
  return digits;
}

/** Simpan/perbarui nomor WhatsApp & NIK akun yang sedang login. */
export const upsertContact = mutation({
  args: {
    whatsapp: v.string(),
    nik: v.optional(v.string()),
  },
  handler: async (ctx, { whatsapp, nik }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
    const wa = normalizeWa(whatsapp);
    if (wa.length < 10 || wa.length > 15) {
      throw new Error("Nomor WhatsApp tidak valid (10–15 digit, format 62…).");
    }
    if (nik !== undefined && nik.length > 0) {
      if (!/^\d{16}$/.test(nik)) {
        throw new Error("NIK harus tepat 16 digit angka.");
      }
    }
    const cleanNik = nik !== undefined && nik.length === 16 ? nik : undefined;
    await ctx.db.patch(userId, {
      whatsapp: wa,
      ...(cleanNik !== undefined ? { nik: cleanNik } : {}),
    });
    return { ok: true, wa };
  },
});

/** Baca kontak akun saat ini (dipakai dashboard untuk menampilkan status). */
export const myContact = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const user = await ctx.db.get(userId);
    if (user === null) return null;
    return {
      whatsapp: user.whatsapp ?? null,
      nik: user.nik ?? null,
    };
  },
});
