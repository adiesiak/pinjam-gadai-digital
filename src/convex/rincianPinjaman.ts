import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, query, type QueryCtx } from "./_generated/server";
import { getAdminGateStatus, requireAdminSession } from "./adminAuthz";
import { tarifDendaBerlaku } from "./system";
import { susunRincianPinjaman } from "../lib/rincianPinjaman";

/**
 * RINCIAN PINJAMAN — sisi server.
 *
 * Angka dokumen disusun di sini (lewat lib/rincianPinjaman) supaya PDF, email,
 * dan pesan WhatsApp memakai perhitungan yang sama dengan dashboard. Pengiriman
 * email/WhatsApp-nya sendiri ada di `convex/rincianKirim.ts`.
 */

const kanalValidator = v.union(v.literal("email"), v.literal("whatsapp"));

/** Jeda minimum antar pengiriman ke peminjam yang sama. */
const JEDA_KIRIM_MS = 60_000;

/** Batas pengiriman per kanal per admin per hari. */
const MAKS_KIRIM_PER_HARI = 10;

/**
 * Dokumen dari satu baris pinjaman. Semua jalur baca memakai fungsi ini supaya
 * PDF, email, dan WhatsApp tidak pernah berbeda angka.
 */
async function dokumenRincian(ctx: QueryCtx, loan: Doc<"loans">) {
  return susunRincianPinjaman(
    {
      nomorReferensi: loan.nomorReferensi,
      namaLengkap: loan.namaLengkap,
      status: loan.status,
      pokokPinjaman: loan.pokokPinjaman,
      tenorHari: loan.tenorHari,
      tenorBulan: loan.tenorBulan ?? null,
      persenBunga: loan.persenBunga ?? null,
      cairEkspres: loan.cairEkspres ?? null,
      didanaiPada: loan.didanaiPada ?? null,
      diajukanPada: loan.diajukanPada ?? loan._creationTime,
      tujuan: loan.tujuan,
      namaBank: loan.namaBank ?? null,
      nomorRekening: loan.nomorRekening,
    },
    { sekarang: Date.now(), dendaPerHari: await tarifDendaBerlaku(ctx) },
  );
}

/** Kontak kirim milik peminjam: email akun dan nomor dari KYC lebih dulu. */
async function kontakPeminjam(ctx: QueryCtx, loan: Doc<"loans">) {
  const pemilik = await ctx.db.get(loan.userId);
  return {
    email: pemilik?.email ?? null,
    whatsapp: loan.nomorWhatsApp ?? pemilik?.nomorWhatsApp ?? null,
  };
}

/**
 * Dokumen rincian satu pinjaman + kesiapan kanal kirimnya.
 *
 * Pemilik pinjaman boleh membaca rinciannya sendiri; pengiriman ke peminjam
 * hanya dibuka untuk admin yang sudah lolos TOTP (`bolehKirim`).
 */
export const dataRincian = query({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Harus masuk terlebih dahulu.");

    const loan = await ctx.db.get(loanId);
    if (loan === null) throw new Error("Pinjaman tidak ditemukan.");
    if (loan.userId !== userId) await requireAdminSession(ctx);

    const gerbang = await getAdminGateStatus(ctx);
    const kontak = await kontakPeminjam(ctx, loan);

    return {
      dokumen: await dokumenRincian(ctx, loan),
      bolehKirim: gerbang.isAdmin && gerbang.verified,
      email: kontak.email,
      whatsapp: kontak.whatsapp,
    };
  },
});

/**
 * Data kiriman untuk action otomatis. Tidak memeriksa sesi: dipanggil penjadwal
 * setelah admin menandai pinjaman tersalurkan, bukan oleh peramban.
 */
export const _dataKirim = internalQuery({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const loan = await ctx.db.get(loanId);
    if (loan === null) return null;
    const kontak = await kontakPeminjam(ctx, loan);
    return {
      dokumen: await dokumenRincian(ctx, loan),
      email: kontak.email,
      whatsapp: kontak.whatsapp,
    };
  },
});

/**
 * Riwayat kiriman rincian satu pinjaman, terbaru dulu. Dipakai panel admin
 * supaya admin tahu kiriman mana yang sudah diterima dan mana yang gagal
 * sebelum menekan tombol lagi.
 */
export const riwayatKirim = query({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Harus masuk terlebih dahulu.");

    const loan = await ctx.db.get(loanId);
    if (loan === null) throw new Error("Pinjaman tidak ditemukan.");
    if (loan.userId !== userId) await requireAdminSession(ctx);

    const baris = await ctx.db
      .query("rincianKirimLog")
      .withIndex("by_loan", (q) => q.eq("loanId", loanId))
      .order("desc")
      .take(8);

    return baris.map((b) => ({
      kanal: b.kanal,
      tujuan: b.tujuan,
      status: b.status,
      respon: b.respon ?? null,
      otomatis: b.otomatis === true,
      pada: b.pada,
    }));
  },
});

/**
 * Buka satu baris log sekaligus sebagai pembatas laju. Dipanggil SEBELUM
 * kirim: kiriman yang ditolak di sini tidak pernah menyentuh gateway, dan
 * email yang tiba-tiba dibanjiri klik berulang tidak dibayar dua kali.
 */
export const mulaiKirim = internalMutation({
  args: {
    loanId: v.id("loans"),
    kanal: kanalValidator,
    tujuan: v.string(),
    olehUserId: v.id("users"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ ok: true; logId: Id<"rincianKirimLog"> } | { ok: false; pesan: string }> => {
    const sekarang = Date.now();

    const terakhir = await ctx.db
      .query("rincianKirimLog")
      .withIndex("by_loan_kanal", (q) => q.eq("loanId", args.loanId).eq("kanal", args.kanal))
      .order("desc")
      .first();
    if (
      terakhir !== null &&
      terakhir.olehUserId === args.olehUserId &&
      sekarang - terakhir.pada < JEDA_KIRIM_MS
    ) {
      const sisa = Math.ceil((JEDA_KIRIM_MS - (sekarang - terakhir.pada)) / 1000);
      return {
        ok: false,
        pesan: `Rincian baru saja dikirim ke kanal ini. Tunggu ${sisa} detik sebelum mengirim lagi.`,
      };
    }

    const awalHari = Math.floor(sekarang / 86_400_000) * 86_400_000;
    const hariIni = await ctx.db
      .query("rincianKirimLog")
      .withIndex("by_oleh", (q) => q.eq("olehUserId", args.olehUserId).gte("pada", awalHari))
      .collect();
    if (hariIni.filter((baris) => baris.kanal === args.kanal).length >= MAKS_KIRIM_PER_HARI) {
      return {
        ok: false,
        pesan: `Batas ${MAKS_KIRIM_PER_HARI} pengiriman rincian lewat ${args.kanal} per hari sudah tercapai.`,
      };
    }

    const logId = await ctx.db.insert("rincianKirimLog", {
      loanId: args.loanId,
      kanal: args.kanal,
      tujuan: args.tujuan,
      status: "diproses",
      olehUserId: args.olehUserId,
      pada: sekarang,
    });
    return { ok: true, logId };
  },
});

/**
 * Buka baris log untuk kiriman otomatis. Berbeda dari `mulaiKirim`, tidak ada
 * batas per admin: pencairan hanya terjadi sekali per pinjaman, dan kiriman
 * yang sudah berhasil tidak diulang bila penjadwal sempat berjalan dua kali.
 */
export const mulaiKirimOtomatis = internalMutation({
  args: {
    loanId: v.id("loans"),
    kanal: kanalValidator,
    tujuan: v.string(),
    olehUserId: v.id("users"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ ok: true; logId: Id<"rincianKirimLog"> } | { ok: false; sudah: boolean }> => {
    const sebelumnya = await ctx.db
      .query("rincianKirimLog")
      .withIndex("by_loan", (q) => q.eq("loanId", args.loanId))
      .collect();
    if (sebelumnya.some((baris) => baris.otomatis === true && baris.status === "terkirim")) {
      return { ok: false, sudah: true };
    }

    const logId = await ctx.db.insert("rincianKirimLog", {
      loanId: args.loanId,
      kanal: args.kanal,
      tujuan: args.tujuan,
      status: "diproses",
      otomatis: true,
      olehUserId: args.olehUserId,
      pada: Date.now(),
    });
    return { ok: true, logId };
  },
});

/** Tutup baris log dengan hasil sebenarnya dari gateway. */
export const selesaikanKirim = internalMutation({
  args: {
    logId: v.id("rincianKirimLog"),
    status: v.string(),
    respon: v.optional(v.string()),
  },
  handler: async (ctx, { logId, status, respon }) => {
    const baris = await ctx.db.get(logId);
    if (baris === null) return;
    await ctx.db.patch(logId, {
      status,
      ...(respon === undefined ? {} : { respon: respon.slice(0, 500) }),
    });
  },
});
