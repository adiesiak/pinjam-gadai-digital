/**
 * Data AKUN UJI PINJAMAN — pemisahan dari laporan produksi dan pembersihan
 * pengajuan yang tidak pernah menjadi uang.
 *
 * Ringkasan admin dan analitik sudah menyaring baris akun uji lewat
 * `userIdAkunUji`, jadi percobaan tidak menggeser omzet, antrean, atau rasio
 * kesehatan. Modul ini hanya menyediakan angka untuk panel dan satu tindakan
 * bersih-bersih yang aman.
 *
 * Kenapa hanya pengajuan DITOLAK/DIBATALKAN yang boleh dihapus: baris yang
 * sudah cair punya angsuran, jurnal, pengingat, dan tautan status. Menghapusnya
 * akan meninggalkan dokumen yatim; baris itu tetap disimpan sebagai jejak uji
 * dan tetap tidak dihitung di laporan.
 */
import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireAdminSession } from "./adminAuthz";
import { userIdAkunUji } from "./akunUjiInternal";
import { audit } from "./system";

/** Status yang berarti pengajuan belum pernah mencairkan uang. */
const PINJAMAN_BERSIH = ["ditolak", "dibatalkan"] as const;
const GADAI_BERSIH = ["ditolak"] as const;
const KREDIT_BERSIH = ["ditolak"] as const;

/** Angka ringkas data uji untuk panel admin. */
export const ringkasanDataUji = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminSession(ctx);
    const userId = await userIdAkunUji(ctx);
    if (userId === null) {
      return {
        akunUjiAda: false,
        total: 0,
        bisaDibersihkan: 0,
        tersimpan: 0,
        pinjaman: 0,
        gadai: 0,
        kredit: 0,
      };
    }

    const [loans, pawns, kredit] = await Promise.all([
      ctx.db
        .query("loans")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("pawns")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("kreditBarang")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
    ]);

    const pinjamanBersih = loans.filter((l) =>
      (PINJAMAN_BERSIH as readonly string[]).includes(l.status),
    ).length;
    const gadaiBersih = pawns.filter((p) =>
      (GADAI_BERSIH as readonly string[]).includes(p.status),
    ).length;
    const kreditBersih = kredit.filter((k) =>
      (KREDIT_BERSIH as readonly string[]).includes(k.status),
    ).length;
    const total = loans.length + pawns.length + kredit.length;
    const bisaDibersihkan = pinjamanBersih + gadaiBersih + kreditBersih;

    return {
      akunUjiAda: true,
      total,
      bisaDibersihkan,
      tersimpan: total - bisaDibersihkan,
      pinjaman: loans.length,
      gadai: pawns.length,
      kredit: kredit.length,
    };
  },
});

/**
 * Hapus pengajuan uji yang ditolak/dibatalkan. Tidak pernah menyentuh baris
 * yang sudah cair, sehingga jurnal dan jadwal angsuran tetap utuh.
 */
export const bersihkanDataUji = mutation({
  args: { konfirmasi: v.literal("BERSIHKAN_DATA_UJI") },
  handler: async (ctx) => {
    const { userId: adminId, user: admin } = await requireAdminSession(ctx);
    const userId = await userIdAkunUji(ctx);
    if (userId === null) {
      return { dihapus: 0, tersimpan: 0 };
    }

    const [loans, pawns, kredit] = await Promise.all([
      ctx.db
        .query("loans")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("pawns")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("kreditBarang")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
    ]);

    let dihapus = 0;
    for (const loan of loans) {
      if (!(PINJAMAN_BERSIH as readonly string[]).includes(loan.status)) continue;
      await ctx.db.delete(loan._id);
      dihapus += 1;
    }
    for (const pawn of pawns) {
      if (!(GADAI_BERSIH as readonly string[]).includes(pawn.status)) continue;
      await ctx.db.delete(pawn._id);
      dihapus += 1;
    }
    for (const baris of kredit) {
      if (!(KREDIT_BERSIH as readonly string[]).includes(baris.status)) continue;
      await ctx.db.delete(baris._id);
      dihapus += 1;
    }

    const tersimpan = loans.length + pawns.length + kredit.length - dihapus;
    await audit(
      ctx,
      adminId,
      admin.email ?? admin.name ?? "admin",
      "data_uji_bersih",
      "AKUN UJI PINJAMAN",
      `${dihapus} pengajuan uji ditolak/batal dihapus; ${tersimpan} baris uji yang sudah cair tetap disimpan dan tidak dihitung di ringkasan.`,
    );

    return { dihapus, tersimpan };
  },
});
