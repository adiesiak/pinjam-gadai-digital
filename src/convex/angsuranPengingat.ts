import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { sisaHariAngsuran, dendaAngsuran } from "../lib/angsuran";
import { formatRupiah } from "../lib/money";
import {
  formatTanggalWIB,
  OFFSET_WIB_MS,
  tanggalWIB,
} from "../lib/waktu";

const DAY_MS = 86_400_000;
const BATAS_PERCOBAAN = 3;

/** Awal hari kalender WIB sebagai epoch ms UTC. */
function awalHariWIB(ms: number): number {
  return Date.parse(`${tanggalWIB(ms)}T00:00:00Z`);
}

export type KandidatPengingatAngsuran = {
  angsuranId: Id<"angsuran">;
  loanId: Id<"loans">;
  userId: Id<"users">;
  nomor: number;
  nomorReferensi: string;
  namaLengkap: string;
  nomorWhatsApp: string | null;
  jatuhTempoPada: number;
  jenis: "h_minus_3" | "hari_h" | "terlambat_h1";
  sisaHari: number;
  jumlah: number;
  denda: number;
  tanggal: number;
};

/**
 * Angsuran yang berhak diingatkan HARI INI menurut kalender WIB.
 *
 * Hanya angsuran `belum_dibayar`: yang sudah mengirim bukti tidak perlu ditagih
 * lagi, dan yang sudah lunas tentu tidak. Rentang indeks dibatasi ±beberapa
 * hari supaya cron tidak memindai seluruh tabel.
 */
export const _kandidat = internalQuery({
  args: {},
  handler: async (ctx): Promise<KandidatPengingatAngsuran[]> => {
    const now = Date.now();
    const rows = await ctx.db
      .query("angsuran")
      .withIndex("by_jatuh_tempo", (q) =>
        q
          .gte("jatuhTempoPada", now - 2 * DAY_MS)
          .lte("jatuhTempoPada", now + 4 * DAY_MS),
      )
      .collect();

    const tarif = (await ctx.runQuery(internal.system._tarifDenda, {})) as number;
    const hasil: KandidatPengingatAngsuran[] = [];
    for (const row of rows) {
      if (row.status !== "belum_dibayar") continue;
      const sisa = sisaHariAngsuran(row.jatuhTempoPada, now);
      const jenis =
        sisa === 3
          ? "h_minus_3"
          : sisa === 0
            ? "hari_h"
            : sisa === -1
              ? "terlambat_h1"
              : null;
      if (jenis === null) continue;
      const loan = await ctx.db.get(row.loanId);
      if (loan === null || loan.status !== "didanai") continue;
      const denda = dendaAngsuran(row.pokok, row.jatuhTempoPada, now, tarif);
      hasil.push({
        angsuranId: row._id,
        loanId: loan._id,
        userId: row.userId,
        nomor: row.nomor,
        nomorReferensi: loan.nomorReferensi,
        namaLengkap: loan.namaLengkap,
        nomorWhatsApp: loan.nomorWhatsApp ?? null,
        jatuhTempoPada: row.jatuhTempoPada,
        jenis,
        sisaHari: sisa,
        jumlah: row.total + denda,
        denda,
        tanggal: awalHariWIB(now),
      });
    }
    return hasil;
  },
});

/**
 * Catat satu pengingat (append-only, idempoten per angsuran/tanggal/jenis).
 * `bolehKirim` false bila baris sudah ada dan sudah terkirim/dinonaktifkan —
 * atau bila percobaannya sudah mencapai batas.
 */
export const _catat = internalMutation({
  args: {
    angsuranId: v.id("angsuran"),
    loanId: v.id("loans"),
    userId: v.id("users"),
    tanggal: v.number(),
    jenis: v.string(),
    sisaHari: v.number(),
    jumlah: v.number(),
  },
  handler: async (ctx, args) => {
    const ada = await ctx.db
      .query("pengingatAngsuran")
      .withIndex("by_angsuran", (q) => q.eq("angsuranId", args.angsuranId))
      .collect();
    const sama = ada.find(
      (p) => p.tanggal === args.tanggal && p.jenis === args.jenis,
    );
    if (sama !== undefined) {
      const bolehKirim =
        (sama.waStatus === undefined || sama.waStatus === "gagal") &&
        sama.percobaan < BATAS_PERCOBAAN;
      return { dibuat: false as const, pengingatId: sama._id, bolehKirim };
    }
    const pengingatId = await ctx.db.insert("pengingatAngsuran", {
      angsuranId: args.angsuranId,
      loanId: args.loanId,
      userId: args.userId,
      tanggal: args.tanggal,
      jenis: args.jenis,
      sisaHari: args.sisaHari,
      jumlahKewajiban: args.jumlah,
      percobaan: 0,
      waktu: Date.now(),
    });
    return { dibuat: true as const, pengingatId, bolehKirim: true as const };
  },
});

/** Simpan hasil percobaan + jejak di `waLogs` — status apa adanya. */
export const _catatHasil = internalMutation({
  args: {
    pengingatId: v.id("pengingatAngsuran"),
    loanId: v.id("loans"),
    nomorTujuan: v.string(),
    isiPesan: v.string(),
    status: v.string(),
    respon: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.pengingatId);
    if (row === null) return;
    await ctx.db.patch(row._id, {
      waStatus: args.status,
      waKeterangan: args.respon,
      percobaan: row.percobaan + 1,
    });
    await ctx.db.insert("waLogs", {
      loanId: args.loanId,
      nomorTujuan: args.nomorTujuan,
      jenis: "pengingat_angsuran",
      isiPesan: args.isiPesan,
      status: args.status,
      respon: args.respon,
      waktu: Date.now(),
    });
  },
});

function susunPesan(
  k: KandidatPengingatAngsuran,
  rekening: {
    rekeningUsahaNama: string;
    rekeningUsahaBank: string;
    rekeningUsahaNomor: string;
  },
): string {
  const tujuan =
    rekening.rekeningUsahaNama && rekening.rekeningUsahaBank && rekening.rekeningUsahaNomor
      ? `Transfer ke ${rekening.rekeningUsahaBank} ${rekening.rekeningUsahaNomor} a.n. ${rekening.rekeningUsahaNama}, lalu unggah bukti di menu Cicilan PINDAI.`
      : "Buka menu Cicilan PINDAI untuk instruksi transfer dan unggah bukti.";
  const tanggal = formatTanggalWIB(k.jatuhTempoPada);
  const tagihan = formatRupiah(k.jumlah);
  if (k.jenis === "terlambat_h1") {
    return `Halo ${k.namaLengkap}, angsuran ke-${k.nomor} pinjaman ${k.nomorReferensi} sudah lewat 1 hari dari jatuh tempo ${tanggal}. Tagihan ${tagihan} sudah termasuk denda ${formatRupiah(k.denda)}. ${tujuan}`;
  }
  if (k.jenis === "hari_h") {
    return `Halo ${k.namaLengkap}, angsuran ke-${k.nomor} pinjaman ${k.nomorReferensi} jatuh tempo HARI INI (${tanggal}). Tagihan ${tagihan}. ${tujuan}`;
  }
  return `Halo ${k.namaLengkap}, angsuran ke-${k.nomor} pinjaman ${k.nomorReferensi} jatuh tempo dalam ${k.sisaHari} hari (${tanggal}). Tagihan ${tagihan}. ${tujuan}`;
}

/**
 * Cron tiap jam. Jendela kirim 08.00–20.00 WIB; di luar itu berhenti tanpa
 * menulis apa pun. Baris pengingat tetap idempoten per hari, jadi menjalankan
 * ulang di jam berikutnya tidak menggandakan pesan.
 */
export const jalankanPengingatAngsuran = internalAction({
  args: {},
  handler: async (ctx) => {
    const jamWIB = new Date(Date.now() + OFFSET_WIB_MS).getUTCHours();
    if (jamWIB < 8 || jamWIB >= 20) {
      return { dikirim: 0, kandidat: 0, alasan: "di_luar_jendela" as const };
    }
    const kandidat = (await ctx.runQuery(internal.angsuranPengingat._kandidat, {})) as KandidatPengingatAngsuran[];
    const rekening = (await ctx.runQuery(internal.system._penerimaanInternal, {})) as {
      rekeningUsahaNama: string;
      rekeningUsahaBank: string;
      rekeningUsahaNomor: string;
    };

    let dikirim = 0;
    for (const k of kandidat) {
      const catat = await ctx.runMutation(internal.angsuranPengingat._catat, {
        angsuranId: k.angsuranId,
        loanId: k.loanId,
        userId: k.userId,
        tanggal: k.tanggal,
        jenis: k.jenis,
        sisaHari: k.sisaHari,
        jumlah: k.jumlah,
      });
      if (!catat.bolehKirim) continue;
      if (k.nomorWhatsApp === null) {
        await ctx.runMutation(internal.angsuranPengingat._catatHasil, {
          pengingatId: catat.pengingatId,
          loanId: k.loanId,
          nomorTujuan: "-",
          isiPesan: "(tidak dikirim)",
          status: "tanpa_nomor",
          respon: "Peminjam belum punya nomor WhatsApp pada data pinjaman.",
        });
        continue;
      }
      const isi = susunPesan(k, rekening);
      const hasil = await ctx.runAction(internal.whatsapp._kirimPesanUmum, {
        nomor: k.nomorWhatsApp,
        isi,
      });
      await ctx.runMutation(internal.angsuranPengingat._catatHasil, {
        pengingatId: catat.pengingatId,
        loanId: k.loanId,
        nomorTujuan: k.nomorWhatsApp,
        isiPesan: isi,
        status: hasil.ok ? "terkirim" : "gagal",
        respon: hasil.respon,
      });
      if (hasil.ok) dikirim += 1;
    }
    return { dikirim, kandidat: kandidat.length };
  },
});
