/**
 * Proyeksi kas 30 hari untuk admin.
 *
 * Hanya membaca dua sumber yang tanggalnya pasti: angsuran pinjaman yang belum
 * dibayar dan siklus pendana berstatus berjalan. Tidak ada pengeluaran
 * operasional yang dikarang, dan tunggakan yang sudah lewat tidak digeser ke
 * hari ini — panel menyebut cakupannya.
 */
import { v } from "convex/values";

import {
  akhirHariKasWIB,
  awalHariKasWIB,
  HARI_MS,
  susunKalenderKas,
} from "../lib/kalenderKas";
import { query } from "./_generated/server";
import { requireAdminSession } from "./adminAuthz";

/** Batas baris yang dibaca satu muat; di atas ini angka ditandai terbatas. */
const BATAS_ANGSURAN = 2_000;
const BATAS_SIKLUS = 500;

export const kalenderKas = query({
  args: { hari: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx);
    const jumlahHari = Math.min(60, Math.max(1, Math.trunc(args.hari ?? 30)));
    const sekarang = Date.now();
    const mulai = awalHariKasWIB(sekarang);
    const sampai = akhirHariKasWIB(mulai + (jumlahHari - 1) * HARI_MS);

    const angsuranRows = await ctx.db
      .query("angsuran")
      .withIndex("by_jatuh_tempo", (q) =>
        q.gte("jatuhTempoPada", mulai).lte("jatuhTempoPada", sampai),
      )
      .take(BATAS_ANGSURAN);

    const siklusRows = await ctx.db
      .query("siklusPendana")
      .withIndex("by_jatuhTempo", (q) =>
        q.gte("jatuhTempoPada", mulai).lte("jatuhTempoPada", sampai),
      )
      .take(BATAS_SIKLUS);

    const belumDibayar = angsuranRows.filter((row) => row.status !== "lunas");
    const berjalan = siklusRows.filter((row) => row.status === "berjalan");

    const hasil = susunKalenderKas({
      sekarang,
      hari: jumlahHari,
      angsuran: belumDibayar.map((row) => ({
        jatuhTempoPada: row.jatuhTempoPada,
        nominal: row.total,
      })),
      siklus: berjalan.map((row) => ({
        jatuhTempoPada: row.jatuhTempoPada,
        nominal: row.totalCair,
      })),
    });

    return {
      ...hasil,
      hari: jumlahHari,
      mulai,
      sampai,
      // Panel menyebut ini bila tercapai, bukan menyajikan angka seolah lengkap.
      dibatasi: angsuranRows.length >= BATAS_ANGSURAN || siklusRows.length >= BATAS_SIKLUS,
      cakupan: {
        angsuran: belumDibayar.length,
        siklus: berjalan.length,
      },
    };
  },
});
