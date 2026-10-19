/**
 * SURAT SOMASI — sisi server.
 *
 * Hanya admin ber-TOTP yang dapat membaca dan mengunduhnya. Surat dibuat dari
 * `pelunasanPinjaman` (mesin yang sama dengan daftar kasus penagihan), jadi
 * angka di surat tidak mungkin berbeda dari angka yang dibaca petugas.
 *
 * Tidak ada pengiriman otomatis: somasi adalah dokumen formal yang perlu
 * ditinjau petugas sebelum diserahkan. Unduhan dicatat di audit trail supaya
 * jejak "surat apa dibuat untuk siapa" tidak hilang.
 */
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  query,
  type QueryCtx,
} from "./_generated/server";
import { requireAdminSession } from "./adminAuthz";
import { pelunasanPinjaman } from "../lib/loan";
import { tarifDendaBerlaku, getConfig, audit } from "./system";
import {
  cekSomasi,
  namaBerkasSomasi,
  susunSuratSomasi,
  type SuratSomasi,
} from "../lib/suratSomasi";
import { buatPdfSomasi } from "../lib/suratSomasiPdf";

const REF_SOMASI = "PINDAI";

type HasilSusun =
  | { tersedia: true; surat: SuratSomasi }
  | { tersedia: false; alasan: string };

type HasilPratinjau =
  | { tersedia: true; surat: SuratSomasi; namaBerkas: string }
  | { tersedia: false; alasan: string };

/** Susun surat dari satu baris pinjaman; dipakai pratinjau dan unduhan. */
async function susunUntuk(ctx: QueryCtx, loanId: Id<"loans">): Promise<HasilSusun> {
  const loan = await ctx.db.get(loanId);
  if (loan === null) {
    return { tersedia: false, alasan: "Pinjaman tidak ditemukan." };
  }

  if (loan.status !== "didanai") {
    return {
      tersedia: false,
      alasan:
        loan.status === "lunas"
          ? "Pinjaman ini sudah lunas, jadi tidak ada tunggakan yang perlu disomasi."
          : "Pinjaman ini belum berjalan atau sudah ditutup, jadi belum ada tunggakan yang dapat disomasi.",
    };
  }

  const sekarang = Date.now();
  const tarifDenda = await tarifDendaBerlaku(ctx);
  const pelunasan = pelunasanPinjaman(loan, sekarang, tarifDenda);
  const cek = cekSomasi({
    hariTerlambat: pelunasan?.hariTerlambat ?? 0,
    totalKewajiban: pelunasan?.totalKewajibanDenganPenalti ?? null,
  });
  if (!cek.ok || pelunasan === null) {
    return {
      tersedia: false,
      alasan: cek.ok ? "Pinjaman ini tidak punya kewajiban aktif." : cek.alasan,
    };
  }

  const config = await getConfig(ctx);
  const nomorRekening = config.rekeningUsahaNomor.trim();
  const bank = config.rekeningUsahaBank.trim();
  const namaRekening = config.rekeningUsahaNama.trim();
  const rekening =
    nomorRekening === ""
      ? null
      : {
          nama: namaRekening === "" ? REF_SOMASI : namaRekening,
          bank,
          nomor: nomorRekening,
        };

  return {
    tersedia: true,
    surat: susunSuratSomasi(
      {
        nomorReferensi: loan.nomorReferensi,
        namaPeminjam: loan.namaLengkap,
        pokokPinjaman: loan.pokokPinjaman,
        jatuhTempoPada: pelunasan.jatuhTempoPada,
        hariTerlambat: pelunasan.hariTerlambat,
        dendaTerlambat: pelunasan.dendaTerlambat,
        totalKewajiban: pelunasan.totalKewajibanDenganPenalti,
        persenDendaPerHari: tarifDenda,
        rekening,
      },
      { sekarang },
    ),
  };
}

/** Pratinjau surat untuk panel penagihan (admin saja). */
export const dataSomasi = query({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }): Promise<HasilPratinjau> => {
    await requireAdminSession(ctx);
    const hasil = await susunUntuk(ctx, loanId);
    if (!hasil.tersedia) return hasil;
    return { ...hasil, namaBerkas: namaBerkasSomasi(hasil.surat) };
  },
});

/** Salinan untuk action, yang tidak boleh membaca basis data langsung. */
export const _susun = internalQuery({
  args: { loanId: v.id("loans") },
  handler: (ctx, { loanId }): Promise<HasilSusun> => susunUntuk(ctx, loanId),
});

/** Catat unduhan di audit trail. */
export const _catatUnduh = internalMutation({
  args: {
    loanId: v.id("loans"),
    olehUserId: v.id("users"),
    nomorSurat: v.string(),
  },
  handler: async (ctx, { loanId, olehUserId, nomorSurat }) => {
    const loan = await ctx.db.get(loanId);
    if (loan === null) return;
    const admin = await ctx.db.get(olehUserId);
    await audit(
      ctx,
      olehUserId,
      admin?.email ?? admin?.name ?? "admin",
      "somasi_dibuat",
      loan.nomorReferensi,
      `Surat somasi ${nomorSurat} dibuat untuk ${loan.namaLengkap}.`,
    );
  },
});

/** Base64 dari byte PDF; dipotong 8 KB agar `fromCharCode` tidak meluap. */
function keBase64(byte: Uint8Array): string {
  let biner = "";
  const potong = 0x2000;
  for (let i = 0; i < byte.length; i += potong) {
    biner += String.fromCharCode(...byte.subarray(i, i + potong));
  }
  return btoa(biner);
}

/** Unduh surat somasi sebagai PDF; mencatat pembuatannya di audit trail. */
export const unduhSomasi = action({
  args: { loanId: v.id("loans") },
  handler: async (
    ctx,
    { loanId },
  ): Promise<{
    namaBerkas: string;
    base64: string;
    nomorSurat: string;
    batasBayarTeks: string;
  }> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
    await ctx.runQuery(api.security.assertAdminSession, {});

    const hasil = await ctx.runQuery(internal.somasi._susun, { loanId });
    if (!hasil.tersedia) throw new Error(hasil.alasan);

    // Susun byte lebih dulu: audit hanya mencatat surat yang benar-benar jadi.
    const byte = buatPdfSomasi(hasil.surat);
    await ctx.runMutation(internal.somasi._catatUnduh, {
      loanId,
      olehUserId: userId,
      nomorSurat: hasil.surat.nomorSurat,
    });

    return {
      namaBerkas: namaBerkasSomasi(hasil.surat),
      base64: keBase64(byte),
      nomorSurat: hasil.surat.nomorSurat,
      batasBayarTeks: hasil.surat.batasBayarTeks,
    };
  },
});
