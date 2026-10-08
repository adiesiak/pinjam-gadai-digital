import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";

import { bacaProfilUntukForm, simpanDataDiriProfil } from "./dataDiriProfil";
import { audit } from "./system";
import type { Id } from "./_generated/dataModel";

/**
 * Data diri nasabah — jalur SUNTING MANDIRI dari dashboard.
 *
 * Berbeda dari `admin.simpanDataDiriNasabah` (gerbang admin), di sini pemilik
 * akun sendiri yang mengisi/memperbarui datanya. Aturan validasi, normalisasi,
 * dan penanganan foto KTP TIDAK disalin: keduanya memanggil
 * `convex/dataDiriProfil.ts`, jadi kedua jalur selalu menulis bentuk yang sama.
 *
 * Sumber penyuntingan tetap dicatat (`sumber`: "nasabah"), sehingga panel admin
 * bisa memberi tahu nasabah (dan dirinya sendiri) siapa terakhir mengubah.
 * Suntingan admin tetap menjadi acuan terakhir karena panel admin menimpanya
 * saat disimpan.
 */

/**
 * Gerbang jalur mandiri — meniru gerbang Peminjam lain di produk
 * (`requirePeminjam` di convex/loans.ts): cukup pengguna yang SUDAH MASUK dan
 * bukan akun tamu. Peran TIDAK diperiksa: akun baru belum punya peran dan tetap
 * harus bisa mengisi data dirinya (kalau diperiksa, halaman dashboard mereka
 * langsung gagal), dan produk sudah memperlakukan akun tanpa peran sebagai
 * Peminjam.
 */
async function requireNasabah(ctx: QueryCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
  const user = await ctx.db.get(userId);
  if (user === null) throw new Error("Akun tidak ditemukan.");
  if (user.isAnonymous === true) {
    throw new Error(
      "Akun tamu hanya dapat melihat informasi. Masuk dengan akun terverifikasi untuk mengubah data diri.",
    );
  }
  return userId;
}

/**
 * Data diri milik pengguna yang sedang masuk — untuk form dashboard.
 * Mengembalikan isian kosong bila belum pernah diisi (`ada` = false).
 */
export const dataDiriSaya = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireNasabah(ctx);
    const user = await ctx.db.get(userId);
    const row = await ctx.db
      .query("nasabahProfil")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    return {
      nama: user?.name ?? user?.email ?? "Nasabah",
      ada: row !== null,
      data: {
        ...bacaProfilUntukForm(row),
        namaLengkap: row?.namaLengkap ?? user?.name ?? "",
      },
      fotoKtpUrl: row?.fotoKtpId !== undefined ? await ctx.storage.getUrl(row.fotoKtpId) : null,
      diperbaruiPada: row?.diperbaruiPada ?? null,
      /** "admin" bila admin yang terakhir mengubah, "nasabah" bila pemiliknya. */
      sumber: row?.sumber ?? null,
      diperbaruiOlehLabel: row?.diperbaruiOlehLabel ?? null,
    };
  },
});

/** URL unggah satu berkas foto KTP data diri milik sendiri. */
export const generateUploadUrlDataDiriSaya = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireNasabah(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Isi/perbarui data diri milik sendiri. Suntingan tercatat di audit
 * (`data_diri_sendiri`) supaya tim admin tetap bisa menelusuri perubahannya.
 */
export const simpanDataDiriSaya = mutation({
  args: {
    namaLengkap: v.string(),
    nik: v.string(),
    nomorWhatsApp: v.string(),
    alamat: v.string(),
    pekerjaan: v.string(),
    penghasilanBulanan: v.union(v.number(), v.null()),
    namaBank: v.string(),
    nomorRekening: v.string(),
    fotoKtpId: v.optional(v.union(v.id("_storage"), v.null())),
  },
  handler: async (ctx, args) => {
    const userId = await requireNasabah(ctx);
    const user = await ctx.db.get(userId);
    const label = user?.email ?? user?.name ?? "nasabah";

    const { dibuat, tersimpan, fotoKtpId } = await simpanDataDiriProfil(ctx, {
      userId,
      isian: {
        namaLengkap: args.namaLengkap,
        nik: args.nik,
        nomorWhatsApp: args.nomorWhatsApp,
        alamat: args.alamat,
        pekerjaan: args.pekerjaan,
        penghasilanBulanan: args.penghasilanBulanan,
        namaBank: args.namaBank,
        nomorRekening: args.nomorRekening,
      },
      fotoKtpId: args.fotoKtpId,
      sumber: "nasabah",
      olehLabel: label,
    });

    await audit(
      ctx,
      userId,
      label,
      "data_diri_sendiri",
      label,
      `${dibuat ? "Nasabah mengisi" : "Nasabah memperbarui"} data diri sendiri: ` +
        `NIK ${tersimpan.nik.slice(0, 4)}••••${tersimpan.nik.slice(-4)}, ` +
        `WA ${tersimpan.nomorWhatsApp}` +
        (fotoKtpId === undefined ? ", tanpa foto KTP" : ", foto KTP tersimpan"),
    );
    return { ok: true };
  },
});
