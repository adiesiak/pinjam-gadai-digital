/**
 * AKUN UJI PINJAMAN — seed internal untuk pengujian alur peminjam.
 *
 * Akun ini sengaja dibuat dengan KYC `VERIFIED` dan tiga dokumen contoh agar
 * seluruh alur pinjaman (pengajuan, kontrak, pencairan, angsuran) bisa dicoba
 * tanpa mengunggah KTP/selfie sungguhan. Ia TIDAK punya email maupun nomor
 * WhatsApp di `users`, jadi tidak ada jalur masuk selain pratinjau admin
 * ("Masuk sebagai") dan tidak bisa dipakai untuk login OTP.
 *
 * Hanya internalAction/internalMutation: tidak diekspos ke klien. Jalankan lewat CLI:
 *
 *   bunx convex run akunUji:buatAkunUjiPinjaman \
 *     '{"adminEmail":"...","konfirmasi":"BUAT_AKUN_UJI_PINJAMAN"}'
 *
 * Idempoten: bila akun uji sudah ada, fungsi mengembalikan akun yang sama tanpa
 * membuat duplikat maupun berkas baru.
 */
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { ROLES } from "./schema";
import { simpanDataDiriProfil } from "./dataDiriProfil";
import { ensureKodePeminjam } from "./peminjamCode";
import { audit } from "./system";
import { PLAFON_BATAS } from "../lib/plafon";
import { VERSI_PERSETUJUAN_KYC } from "../lib/persetujuanKyc";

/** Identitas tetap akun uji — dipakai juga untuk mencari baris yang sudah ada. */
const NAMA_UJI = "AKUN UJI PINJAMAN";
const NIK_UJI = "3200000000000002";
const WA_UJI = "628000000002";

/**
 * PNG 300×200 (pola hijau) untuk ketiga berkas KYC. Ukurannya > 1 KB dan
 * bertipe gambar, jadi lolos gerbang metadata yang sama dengan unggahan nyata;
 * isinya hanya pola, bukan dokumen siapa pun.
 */
const GAMBAR_UJI_BASE64 =
  "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";

function gambarUji(): Uint8Array {
  const biner = atob(GAMBAR_UJI_BASE64);
  const byte = new Uint8Array(biner.length);
  for (let i = 0; i < biner.length; i += 1) byte[i] = biner.charCodeAt(i);
  return byte;
}

function blobUji(): Blob {
  const bytes = gambarUji();
  return new Blob([bytes.buffer as ArrayBuffer], { type: "image/png" });
}

/** Admin ber-email terverifikasi yang menjalankan seed; dipakai sebagai aktor audit. */
export const verifikasiAdminUji = internalQuery({
  args: { adminEmail: v.string() },
  handler: async (ctx, { adminEmail }) => {
    const email = adminEmail.trim().toLowerCase();
    const admin = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .first();
    if (
      admin === null ||
      admin.role !== ROLES.ADMIN ||
      admin.emailVerificationTime === undefined
    ) {
      throw new Error(
        "Hanya admin dengan email terverifikasi yang boleh menjalankan seed akun uji.",
      );
    }
    return {
      adminId: admin._id,
      adminLabel: admin.name?.trim() || admin.email || "Admin",
    };
  },
});

/** Akun uji yang sudah ada, dicari lewat nomor WhatsApp tetapnya. */
export const cekAkunUji = internalQuery({
  args: {},
  handler: async (ctx) => {
    const profil = await ctx.db
      .query("nasabahProfil")
      .withIndex("by_nomorWhatsApp", (q) => q.eq("nomorWhatsApp", WA_UJI))
      .first();
    if (profil === null) return null;
    if (profil.namaLengkap !== NAMA_UJI) {
      throw new Error(
        `Nomor WhatsApp akun uji sudah dipakai ${profil.namaLengkap}. Periksa data sebelum menjalankan seed lagi.`,
      );
    }
    return { userId: profil.userId, nama: NAMA_UJI };
  },
});

export const simpanAkunUjiPinjaman = internalMutation({
  args: {
    adminEmail: v.string(),
    ktpId: v.id("_storage"),
    selfieKtpId: v.id("_storage"),
    buktiPenghasilanId: v.id("_storage"),
  },
  handler: async (ctx, { adminEmail, ktpId, selfieKtpId, buktiPenghasilanId }) => {
    const email = adminEmail.trim().toLowerCase();
    const admin = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .first();
    if (
      admin === null ||
      admin.role !== ROLES.ADMIN ||
      admin.emailVerificationTime === undefined
    ) {
      throw new Error(
        "Hanya admin dengan email terverifikasi yang boleh menyimpan akun uji.",
      );
    }

    const profilLama = await ctx.db
      .query("nasabahProfil")
      .withIndex("by_nomorWhatsApp", (q) => q.eq("nomorWhatsApp", WA_UJI))
      .first();
    if (profilLama !== null) {
      if (profilLama.namaLengkap !== NAMA_UJI) {
        throw new Error(
          `Nomor WhatsApp akun uji sudah dipakai ${profilLama.namaLengkap}.`,
        );
      }
      return { userId: profilLama.userId, nama: NAMA_UJI, sudahAda: true as const };
    }

    const sekarang = Date.now();
    const labelAdmin = admin.name?.trim() || admin.email || "Admin";

    const userId = await ctx.db.insert("users", {
      name: NAMA_UJI,
      role: ROLES.PEMINJAM,
      isAnonymous: false,
      plafonPinjaman: PLAFON_BATAS.maks,
      dibuatAdminPada: sekarang,
    });
    const kodePeminjam = await ensureKodePeminjam(ctx, userId);

    await simpanDataDiriProfil(ctx, {
      userId,
      isian: {
        namaLengkap: NAMA_UJI,
        nik: NIK_UJI,
        nomorWhatsApp: WA_UJI,
        alamat: "Jalan Pengujian Internal No. 1, Jakarta",
        pekerjaan: "Pengujian internal PINDAI",
        penghasilanBulanan: 15_000_000,
        namaBank: "Bank Uji Internal",
        nomorRekening: "0000000001",
      },
      fotoKtpId: undefined,
      sumber: "admin",
      olehLabel: labelAdmin,
    });

    const profil = await ctx.db
      .query("nasabahProfil")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (profil !== null) {
      await ctx.db.patch(profil._id, {
        verifikasiIdentitas: {
          status: "terverifikasi",
          pada: sekarang,
          olehLabel: labelAdmin,
          catatan: "Akun uji internal — identitas bukan orang sungguhan.",
        },
      });
    }

    await ctx.db.insert("kycProfil", {
      userId,
      status: "VERIFIED",
      namaLengkap: NAMA_UJI,
      nik: NIK_UJI,
      nomorWhatsApp: WA_UJI,
      nomorWhatsAppTerverifikasi: {
        nomor: WA_UJI,
        pada: sekarang,
        metode: "wa_otp",
      },
      alamat: "Jalan Pengujian Internal No. 1, Jakarta",
      pekerjaan: "Pengujian internal PINDAI",
      penghasilanBulanan: 15_000_000,
      sumberPenghasilan: "Pengujian internal",
      namaBank: "Bank Uji Internal",
      nomorRekening: "0000000001",
      catatanPeminjam: "Akun uji internal PINDAI.",
      ktpId,
      selfieKtpId,
      buktiPenghasilanId,
      persetujuan: {
        versi: VERSI_PERSETUJUAN_KYC,
        pada: sekarang,
        olehLabel: "Pembuatan akun uji internal",
      },
      dibuatPada: sekarang,
      diperbaruiPada: sekarang,
      diajukanPada: sekarang,
      diputuskanPada: sekarang,
      diputuskanOlehLabel: labelAdmin,
      keputusanCatatan:
        "Akun uji internal: KYC terverifikasi agar alur pinjaman bisa diuji tanpa unggahan dokumen.",
      stempelTerverifikasi: {
        namaLengkap: NAMA_UJI,
        nik: NIK_UJI,
        ktpId,
        selfieKtpId,
        buktiPenghasilanId,
        pada: sekarang,
      },
    });

    await audit(
      ctx,
      admin._id,
      labelAdmin,
      "akun_uji_pinjaman_dibuat",
      NAMA_UJI,
      `Akun uji pinjaman ${kodePeminjam} dibuat dengan KYC VERIFIED, tiga dokumen contoh, dan plafon ${PLAFON_BATAS.maks}. Akun ini tidak punya email/nomor login dan hanya dapat dibuka lewat Mode Nasabah.`,
    );

    return { userId, nama: NAMA_UJI, kodePeminjam, sudahAda: false as const };
  },
});

/**
 * Pintu masuk CLI. internalAction dipakai karena hanya action yang boleh
 * menulis blob ke Convex storage; penyimpanan baris tetap lewat internalMutation.
 */
export const buatAkunUjiPinjaman = internalAction({
  args: {
    adminEmail: v.string(),
    konfirmasi: v.literal("BUAT_AKUN_UJI_PINJAMAN"),
  },
  returns: v.object({
    userId: v.id("users"),
    nama: v.string(),
    kodePeminjam: v.optional(v.string()),
    sudahAda: v.boolean(),
  }),
  handler: async (
    ctx,
    { adminEmail },
  ): Promise<{
    userId: Id<"users">;
    nama: string;
    kodePeminjam?: string;
    sudahAda: boolean;
  }> => {
    await ctx.runQuery(internal.akunUji.verifikasiAdminUji, { adminEmail });
    const ada = await ctx.runQuery(internal.akunUji.cekAkunUji, {});
    if (ada !== null) return { ...ada, sudahAda: true as const };

    const [ktpId, selfieKtpId, buktiPenghasilanId] = await Promise.all([
      ctx.storage.store(blobUji()),
      ctx.storage.store(blobUji()),
      ctx.storage.store(blobUji()),
    ]);

    return await ctx.runMutation(internal.akunUji.simpanAkunUjiPinjaman, {
      adminEmail,
      ktpId: ktpId as Id<"_storage">,
      selfieKtpId: selfieKtpId as Id<"_storage">,
      buktiPenghasilanId: buktiPenghasilanId as Id<"_storage">,
    });
  },
});
