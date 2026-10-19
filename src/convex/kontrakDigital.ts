import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { CONTRACT_TERMS_VERSION } from "../lib/contract";
import {
  hashDokumen,
  kodeDariHash,
  payloadKontrakGadai,
  payloadKontrakPinjaman,
} from "../lib/kontrakDigital";
import { ROLES } from "./schema";

/**
 * Penerbitan dan pembacaan sidik jari kontrak.
 *
 * Hash dihitung dari payload kanonik `lib/kontrakDigital` — bukan dari HTML
 * yang dirender klien. Dengan begitu angka yang dibandingkan di halaman
 * verifikasi berasal dari data yang tersimpan di server, dan dokumen cetak
 * hanya membawa salinan hash itu.
 */

/** Kode unik: turunan hash, dengan akhiran angka bila bertabrakan. */
async function kodeUnik(
  ctx: MutationCtx,
  hash: string,
  jenis: "pinjaman" | "gadai",
  refId: string,
): Promise<string> {
  let kode = kodeDariHash(hash);
  for (let percobaan = 0; percobaan < 50; percobaan += 1) {
    const ada = await ctx.db
      .query("kontrakDigital")
      .withIndex("by_kode", (q) => q.eq("kode", kode))
      .first();
    if (ada === null) return kode;
    if (ada.jenis === jenis && ada.refId === refId) return kode;
    kode = `${hash.slice(0, 7)}${percobaan.toString(36)}`.toUpperCase();
  }
  throw new Error("Gagal membuat kode verifikasi unik.");
}

/** Terbitkan (sekali) sidik jari untuk pinjaman yang baru ditandatangani. */
export async function terbitkanKontrakPinjaman(
  ctx: MutationCtx,
  loan: Doc<"loans">,
  waktu: number,
): Promise<{ kode: string; hash: string }> {
  const sudah = await ctx.db
    .query("kontrakDigital")
    .withIndex("by_ref", (q) => q.eq("refId", loan._id))
    .first();
  if (sudah !== null && sudah.jenis === "pinjaman") {
    return { kode: sudah.kode, hash: sudah.hash };
  }
  const hash = hashDokumen(
    payloadKontrakPinjaman({
      nomorReferensi: loan.nomorReferensi,
      namaLengkap: loan.namaLengkap,
      nik: loan.nik ?? null,
      pokokPinjaman: loan.pokokPinjaman,
      tenorHari: loan.tenorHari,
      tenorBulan: loan.tenorBulan ?? null,
      persenBunga: loan.persenBunga ?? null,
      tandaTanganPada: waktu,
    }),
  );
  const kode = await kodeUnik(ctx, hash, "pinjaman", loan._id);
  await ctx.db.insert("kontrakDigital", {
    kode,
    jenis: "pinjaman",
    refId: loan._id,
    nomorReferensi: loan.nomorReferensi,
    hash,
    versi: CONTRACT_TERMS_VERSION,
    diterbitkanPada: waktu,
    pokok: loan.pokokPinjaman,
  });
  return { kode, hash };
}

/** Terbitkan (sekali) sidik jari untuk akad gadai yang baru ditandatangani. */
export async function terbitkanKontrakGadai(
  ctx: MutationCtx,
  pawn: Doc<"pawns">,
  waktu: number,
): Promise<{ kode: string; hash: string }> {
  const sudah = await ctx.db
    .query("kontrakDigital")
    .withIndex("by_ref", (q) => q.eq("refId", pawn._id))
    .first();
  if (sudah !== null && sudah.jenis === "gadai") {
    return { kode: sudah.kode, hash: sudah.hash };
  }
  const hash = hashDokumen(
    payloadKontrakGadai({
      nomorReferensi: pawn.nomorReferensi,
      namaLengkap: pawn.namaLengkap,
      nilaiTaksiran: pawn.nilaiTaksiran ?? 0,
      hargaPasar: pawn.hargaPasar ?? null,
      pokokGadai: pawn.pokokGadai ?? null,
      persenSewaModal: pawn.persenSewaModal ?? null,
      tandaTanganPada: waktu,
    }),
  );
  const kode = await kodeUnik(ctx, hash, "gadai", pawn._id);
  await ctx.db.insert("kontrakDigital", {
    kode,
    jenis: "gadai",
    refId: pawn._id,
    nomorReferensi: pawn.nomorReferensi,
    hash,
    versi: CONTRACT_TERMS_VERSION,
    diterbitkanPada: waktu,
    pokok: pawn.pokokGadai ?? 0,
  });
  return { kode, hash };
}

export type VerifikasiKontrak = {
  kode: string;
  jenis: "pinjaman" | "gadai";
  nomorReferensi: string;
  hash: string;
  versi: string;
  diterbitkanPada: number;
  pokok: number;
};

function tampil(baris: Doc<"kontrakDigital">): VerifikasiKontrak {
  return {
    kode: baris.kode,
    jenis: baris.jenis,
    nomorReferensi: baris.nomorReferensi,
    hash: baris.hash,
    versi: baris.versi,
    diterbitkanPada: baris.diterbitkanPada,
    pokok: baris.pokok,
  };
}

/** Boleh melihat: pemilik baris atau admin. */
async function bolehMelihat(
  ctx: QueryCtx,
  userId: Id<"users">,
  pemilikId: Id<"users">,
): Promise<boolean> {
  if (pemilikId === userId) return true;
  const user = await ctx.db.get(userId);
  return user?.role === ROLES.ADMIN;
}

/** Sidik jari tersimpan untuk satu pinjaman (pemilik atau admin). */
export const infoPinjaman = query({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const loan = await ctx.db.get(loanId);
    if (loan === null) return null;
    if (!(await bolehMelihat(ctx, userId, loan.userId))) return null;
    const baris = await ctx.db
      .query("kontrakDigital")
      .withIndex("by_ref", (q) => q.eq("refId", loanId))
      .first();
    return baris === null ? null : tampil(baris);
  },
});

/** Sidik jari tersimpan untuk satu akad gadai (pemilik atau admin). */
export const infoGadai = query({
  args: { pawnId: v.id("pawns") },
  handler: async (ctx, { pawnId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const pawn = await ctx.db.get(pawnId);
    if (pawn === null) return null;
    if (!(await bolehMelihat(ctx, userId, pawn.userId))) return null;
    const baris = await ctx.db
      .query("kontrakDigital")
      .withIndex("by_ref", (q) => q.eq("refId", pawnId))
      .first();
    return baris === null ? null : tampil(baris);
  },
});

/**
 * Halaman verifikasi publik: hanya field non-pribadi. Tidak ada nama, NIK,
 * rekening, atau tautan ke dokumen — kode saja tidak membuka data nasabah.
 */
export const verifikasiPublik = query({
  args: { kode: v.string() },
  handler: async (ctx, { kode }) => {
    const normal = kode.trim().toUpperCase();
    if (normal.length < 6 || normal.length > 24) return null;
    const baris = await ctx.db
      .query("kontrakDigital")
      .withIndex("by_kode", (q) => q.eq("kode", normal))
      .first();
    return baris === null ? null : tampil(baris);
  },
});
