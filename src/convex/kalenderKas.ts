/**
 * Kalender kas dan peringatan kas admin.
 *
 * Proyeksi hanya membaca sumber yang tanggalnya pasti: angsuran pinjaman yang
 * belum dibayar, siklus pendana berstatus berjalan, dan biaya operasional
 * berulang yang diisi admin. Tidak ada pengeluaran yang dikarang; tunggakan
 * yang sudah lewat tidak digeser ke hari ini — panel menyebut cakupannya.
 *
 * Peringatan otomatis memakai saldo kas yang DISIMPAN admin beserta waktu
 * pembaruannya. Saldo yang terlalu lama tidak dipakai untuk Alarm: lebih baik
 * diam daripada mengirim pesan dari angka basi.
 */
import { v } from "convex/values";

import {
  akhirHariKasWIB,
  awalHariKasWIB,
  HARI_MS,
  saldoProyeksi,
  susunKalenderKas,
  type BiayaBulanan,
} from "../lib/kalenderKas";
import { formatRupiah, type Rupiah } from "../lib/money";
import { tanggalWIB } from "../lib/waktu";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { requireAdminSession } from "./adminAuthz";
import { audit } from "./system";

/** Batas baris yang dibaca satu muat; di atas ini angka ditandai terbatas. */
const BATAS_ANGSURAN = 2_000;
const BATAS_SIKLUS = 500;

/** Saldo lebih tua dari ini tidak dipakai untuk peringatan otomatis. */
const SALDO_MAKS_UMUR_MS = 3 * HARI_MS;

const SLOT = "global";

type PengaturanKas = {
  aktif: boolean;
  saldoKas: number;
  saldoDiperbaruiPada: number | null;
  saldoMinimum: number;
  hariPeringatan: number;
  nomorWhatsApp: string | null;
  diperbaruiPada: number | null;
};

const PENGATURAN_KOSONG: PengaturanKas = {
  aktif: false,
  saldoKas: 0,
  saldoDiperbaruiPada: null,
  saldoMinimum: 0,
  hariPeringatan: 7,
  nomorWhatsApp: null,
  diperbaruiPada: null,
};

function rapikanNomor(nomor: string): string {
  return nomor.replace(/[\s\-().]/g, "");
}

async function bacaPengaturan(ctx: QueryCtx): Promise<PengaturanKas> {
  const row = await ctx.db
    .query("kasPengaturan")
    .withIndex("by_slot", (q) => q.eq("slot", SLOT))
    .first();
  if (row === null) return PENGATURAN_KOSONG;
  return {
    aktif: row.aktif,
    saldoKas: row.saldoKas,
    saldoDiperbaruiPada: row.saldoDiperbaruiPada ?? null,
    saldoMinimum: row.saldoMinimum,
    hariPeringatan: row.hariPeringatan,
    nomorWhatsApp: row.nomorWhatsApp ?? null,
    diperbaruiPada: row.diperbaruiPada,
  };
}

async function bacaBiaya(ctx: QueryCtx): Promise<BiayaBulanan[]> {
  const rows = await ctx.db
    .query("biayaOperasional")
    .withIndex("by_aktif", (q) => q.eq("aktif", true))
    .take(100);
  return rows.map((row) => ({
    hariDalamBulan: row.hariDalamBulan,
    nominal: row.nominal,
  }));
}

/**
 * Hitung proyeksi lengkap dari basis data. Dipakai query panel dan cron, supaya
 * layar dan pesan peringatan tidak pernah memakai dua rumus berbeda.
 */
export async function hitungProyeksiKas(
  ctx: QueryCtx,
  args: { hari: number; sekarang: number },
) {
  const jumlahHari = Math.min(60, Math.max(1, Math.trunc(args.hari)));
  const mulai = awalHariKasWIB(args.sekarang);
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
  const biayaBulanan = await bacaBiaya(ctx);

  const hasil = susunKalenderKas({
    sekarang: args.sekarang,
    hari: jumlahHari,
    angsuran: belumDibayar.map((row) => ({
      jatuhTempoPada: row.jatuhTempoPada,
      nominal: row.total,
    })),
    siklus: berjalan.map((row) => ({
      jatuhTempoPada: row.jatuhTempoPada,
      nominal: row.totalCair,
    })),
    biayaBulanan,
  });

  return {
    ...hasil,
    hari: jumlahHari,
    mulai,
    sampai,
    dibatasi:
      angsuranRows.length >= BATAS_ANGSURAN || siklusRows.length >= BATAS_SIKLUS,
    cakupan: {
      angsuran: belumDibayar.length,
      siklus: berjalan.length,
      biaya: biayaBulanan.length,
    },
  };
}

/** Kalender kas untuk panel admin, lengkap dengan pengaturan dan peringatan terakhir. */
export const kalenderKas = query({
  args: { hari: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx);
    const sekarang = Date.now();
    const hasil = await hitungProyeksiKas(ctx, {
      hari: args.hari ?? 30,
      sekarang,
    });
    const pengaturan = await bacaPengaturan(ctx);

    const biaya = await ctx.db
      .query("biayaOperasional")
      .withIndex("by_aktif", (q) => q.eq("aktif", true))
      .take(100);
    const biayaSemua = await ctx.db.query("biayaOperasional").take(100);

    const peringatan = await ctx.db
      .query("kasPeringatan")
      .withIndex("by_tanggal")
      .order("desc")
      .take(5);

    return {
      ...hasil,
      pengaturan,
      biaya: biayaSemua.map((row) => ({
        id: String(row._id),
        judul: row.judul,
        nominal: row.nominal,
        hariDalamBulan: row.hariDalamBulan,
        aktif: row.aktif,
      })),
      biayaAktif: biaya.length,
      peringatan: peringatan.map((row) => ({
        tanggal: row.tanggal,
        tanggalKritis: row.tanggalKritis,
        saldoProyeksi: row.saldoProyeksi,
        saldoMinimum: row.saldoMinimum,
        hariKe: row.hariKe,
        terkirim: row.terkirim,
      })),
    };
  },
});

/** Simpan pengaturan peringatan kas — saldo ikut dicatat waktunya. */
export const simpanPengaturanKas = mutation({
  args: {
    aktif: v.boolean(),
    saldoKas: v.number(),
    saldoMinimum: v.number(),
    hariPeringatan: v.number(),
    nomorWhatsApp: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, user } = await requireAdminSession(ctx);
    if (!Number.isSafeInteger(args.saldoKas) || args.saldoKas < 0) {
      throw new Error("Saldo kas harus rupiah bulat, tidak negatif.");
    }
    if (!Number.isSafeInteger(args.saldoMinimum) || args.saldoMinimum < 0) {
      throw new Error("Saldo minimum harus rupiah bulat, tidak negatif.");
    }
    if (
      !Number.isSafeInteger(args.hariPeringatan) ||
      args.hariPeringatan < 1 ||
      args.hariPeringatan > 60
    ) {
      throw new Error("Rentang peringatan harus 1–60 hari.");
    }
    const nomor = args.nomorWhatsApp === undefined ? "" : rapikanNomor(args.nomorWhatsApp);
    if (nomor !== "" && !/^\+?[0-9]{8,15}$/.test(nomor)) {
      throw new Error("Nomor WhatsApp admin tidak valid. Sertakan kode negara.");
    }

    const sekarang = Date.now();
    const ada = await ctx.db
      .query("kasPengaturan")
      .withIndex("by_slot", (q) => q.eq("slot", SLOT))
      .first();
    const isi = {
      aktif: args.aktif,
      saldoKas: args.saldoKas,
      saldoDiperbaruiPada: sekarang,
      saldoMinimum: args.saldoMinimum,
      hariPeringatan: args.hariPeringatan,
      nomorWhatsApp: nomor === "" ? undefined : nomor,
      diperbaruiPada: sekarang,
      diperbaruiOleh: userId,
    };
    if (ada === null) {
      await ctx.db.insert("kasPengaturan", { slot: SLOT, ...isi });
    } else {
      await ctx.db.patch(ada._id, isi);
    }
    await audit(
      ctx,
      userId,
      user.email ?? user.name ?? "admin",
      "kas_pengaturan",
      "kas",
      `Peringatan kas ${args.aktif ? "aktif" : "nonaktif"}: saldo ${formatRupiah(args.saldoKas as Rupiah)}, minimum ${formatRupiah(args.saldoMinimum as Rupiah)}, ${args.hariPeringatan} hari${nomor === "" ? ", tanpa WhatsApp" : `, WhatsApp ${nomor}`}.`,
    );
    return { ok: true as const };
  },
});

/** Tambah satu biaya operasional berulang. */
export const tambahBiaya = mutation({
  args: {
    judul: v.string(),
    nominal: v.number(),
    hariDalamBulan: v.number(),
  },
  handler: async (ctx, args) => {
    const { userId, user } = await requireAdminSession(ctx);
    const judul = args.judul.trim();
    if (judul.length < 3 || judul.length > 80) {
      throw new Error("Nama biaya harus 3–80 karakter.");
    }
    if (!Number.isSafeInteger(args.nominal) || args.nominal <= 0) {
      throw new Error("Nominal biaya harus rupiah bulat positif.");
    }
    if (
      !Number.isSafeInteger(args.hariDalamBulan) ||
      args.hariDalamBulan < 1 ||
      args.hariDalamBulan > 31
    ) {
      throw new Error("Tanggal biaya harus 1–31.");
    }
    const sekarang = Date.now();
    await ctx.db.insert("biayaOperasional", {
      judul,
      nominal: args.nominal,
      hariDalamBulan: args.hariDalamBulan,
      aktif: true,
      dibuatPada: sekarang,
      dibuatOleh: userId,
    });
    await audit(
      ctx,
      userId,
      user.email ?? user.name ?? "admin",
      "kas_biaya_tambah",
      judul,
      `Biaya operasional ${formatRupiah(args.nominal as Rupiah)} setiap tanggal ${args.hariDalamBulan}.`,
    );
    return { ok: true as const };
  },
});

/** Ubah satu biaya: nominal, tanggal, atau sakelar aktif. */
export const ubahBiaya = mutation({
  args: {
    biayaId: v.id("biayaOperasional"),
    judul: v.string(),
    nominal: v.number(),
    hariDalamBulan: v.number(),
    aktif: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { userId, user } = await requireAdminSession(ctx);
    const row = await ctx.db.get(args.biayaId);
    if (row === null) throw new Error("Biaya tidak ditemukan.");
    const judul = args.judul.trim();
    if (judul.length < 3 || judul.length > 80) {
      throw new Error("Nama biaya harus 3–80 karakter.");
    }
    if (!Number.isSafeInteger(args.nominal) || args.nominal <= 0) {
      throw new Error("Nominal biaya harus rupiah bulat positif.");
    }
    if (
      !Number.isSafeInteger(args.hariDalamBulan) ||
      args.hariDalamBulan < 1 ||
      args.hariDalamBulan > 31
    ) {
      throw new Error("Tanggal biaya harus 1–31.");
    }
    await ctx.db.patch(args.biayaId, {
      judul,
      nominal: args.nominal,
      hariDalamBulan: args.hariDalamBulan,
      aktif: args.aktif,
    });
    await audit(
      ctx,
      userId,
      user.email ?? user.name ?? "admin",
      "kas_biaya_ubah",
      judul,
      `${args.aktif ? "Aktif" : "Nonaktif"}: ${formatRupiah(args.nominal as Rupiah)} tanggal ${args.hariDalamBulan}.`,
    );
    return { ok: true as const };
  },
});

/** Hapus satu biaya operasional. */
export const hapusBiaya = mutation({
  args: { biayaId: v.id("biayaOperasional") },
  handler: async (ctx, args) => {
    const { userId, user } = await requireAdminSession(ctx);
    const row = await ctx.db.get(args.biayaId);
    if (row === null) return { ok: true as const };
    await ctx.db.delete(args.biayaId);
    await audit(
      ctx,
      userId,
      user.email ?? user.name ?? "admin",
      "kas_biaya_hapus",
      row.judul,
      `Biaya ${formatRupiah(row.nominal as Rupiah)} tanggal ${row.hariDalamBulan} dihapus.`,
    );
    return { ok: true as const };
  },
});

/**
 * Peringatan yang layak dikirim saat ini.
 *
 * Mengembalikan `alasan` saat tidak ada peringatan, bukan `null` tanpa
 * keterangan: cron mencatat alasannya di log agar "tidak ada pesan" bisa
 * dibedakan dari "cron berhenti".
 */
type HasilHitungPeringatan =
  | {
      peringatan: null;
      alasan: "nonaktif" | "saldo_belum_diisi" | "saldo_basi" | "kas_aman";
    }
  | {
      peringatan: {
        tanggalKritis: number;
        saldoProyeksi: number;
        saldoMinimum: number;
        hariKe: number;
        nomorWhatsApp: string | null;
        pesan: string;
      };
      alasan: null;
    };

export const _hitungPeringatan = internalQuery({
  args: {},
  handler: async (ctx): Promise<HasilHitungPeringatan> => {
    const sekarang = Date.now();
    const pengaturan = await bacaPengaturan(ctx);
    if (!pengaturan.aktif) return { peringatan: null, alasan: "nonaktif" as const };
    if (pengaturan.saldoDiperbaruiPada === null) {
      return { peringatan: null, alasan: "saldo_belum_diisi" as const };
    }
    if (sekarang - pengaturan.saldoDiperbaruiPada > SALDO_MAKS_UMUR_MS) {
      return { peringatan: null, alasan: "saldo_basi" as const };
    }

    const hasil = await hitungProyeksiKas(ctx, {
      hari: pengaturan.hariPeringatan,
      sekarang,
    });
    const saldo = saldoProyeksi(hasil.baris, pengaturan.saldoKas);
    const hariKritis = saldo.findIndex((nilai) => nilai < pengaturan.saldoMinimum);
    if (hariKritis < 0) return { peringatan: null, alasan: "kas_aman" as const };

    const baris = hasil.baris[hariKritis];
    return {
      peringatan: {
        tanggalKritis: baris.tanggal,
        saldoProyeksi: saldo[hariKritis],
        saldoMinimum: pengaturan.saldoMinimum,
        hariKe: hariKritis + 1,
        nomorWhatsApp: pengaturan.nomorWhatsApp,
        pesan: [
          "PINDAI - peringatan kas",
          `Proyeksi saldo kas turun di bawah minimum pada ${tanggalWIB(baris.tanggal)}.`,
          `Perkiraan saldo: ${formatRupiah(saldo[hariKritis] as Rupiah)}; minimum: ${formatRupiah(pengaturan.saldoMinimum as Rupiah)}.`,
          "Periksa Kalender Kas di panel admin dan siapkan dana pencairan.",
        ].join("\n"),
      },
      alasan: null,
    };
  },
});

/** Catat peringatan sekali per tanggal WIB; kembalikan `null` bila sudah ada. */
export const _catatPeringatan = internalMutation({
  args: {
    tanggalKritis: v.number(),
    saldoProyeksi: v.number(),
    saldoMinimum: v.number(),
    hariKe: v.number(),
  },
  handler: async (ctx, args) => {
    const sekarang = Date.now();
    const tanggal = tanggalWIB(sekarang);
    const sudah = await ctx.db
      .query("kasPeringatan")
      .withIndex("by_tanggal", (q) => q.eq("tanggal", tanggal))
      .first();
    if (sudah !== null) return null;
    return await ctx.db.insert("kasPeringatan", {
      tanggal,
      tanggalKritis: args.tanggalKritis,
      saldoProyeksi: args.saldoProyeksi,
      saldoMinimum: args.saldoMinimum,
      hariKe: args.hariKe,
      dibuatPada: sekarang,
      terkirim: false,
    });
  },
});

/** Simpan hasil pengiriman WhatsApp pada baris peringatan. */
export const _catatKiriman = internalMutation({
  args: { id: v.id("kasPeringatan"), terkirim: v.boolean(), respon: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      terkirim: args.terkirim,
      respon: args.respon.slice(0, 300),
    });
  },
});

/**
 * Cron harian: hitung proyeksi, catat peringatan, lalu kirim WhatsApp bila
 * nomor admin diisi dan gateway aktif. Kegagalan gateway dicatat apa adanya,
 * bukan dilempar — cron berikutnya tetap berjalan.
 */
export const jalankanPeringatanKas = internalAction({
  args: {},
  handler: async (ctx): Promise<{ terkirim: boolean; alasan: string | null }> => {
    const hasil: HasilHitungPeringatan = await ctx.runQuery(
      internal.kalenderKas._hitungPeringatan,
      {},
    );
    if (hasil.peringatan === null) return { terkirim: false, alasan: hasil.alasan };

    const id = await ctx.runMutation(internal.kalenderKas._catatPeringatan, {
      tanggalKritis: hasil.peringatan.tanggalKritis,
      saldoProyeksi: hasil.peringatan.saldoProyeksi,
      saldoMinimum: hasil.peringatan.saldoMinimum,
      hariKe: hasil.peringatan.hariKe,
    });
    if (id === null) return { terkirim: false, alasan: "sudah_diperingatkan" as const };

    const nomor = hasil.peringatan.nomorWhatsApp;
    if (nomor === null) {
      await ctx.runMutation(internal.kalenderKas._catatKiriman, {
        id,
        terkirim: false,
        respon: "Nomor WhatsApp admin belum diisi.",
      });
      return { terkirim: false, alasan: "tanpa_nomor" as const };
    }

    const kirim: { ok: boolean; respon: string } = await ctx.runAction(
      internal.whatsapp._kirimPesanUmum,
      { nomor, isi: hasil.peringatan.pesan },
    );
    await ctx.runMutation(internal.kalenderKas._catatKiriman, {
      id,
      terkirim: kirim.ok,
      respon: kirim.respon,
    });
    return { terkirim: kirim.ok, alasan: kirim.ok ? null : "gagal_kirim" };
  },
});

/** Tipe balikan query dipakai panel; diekspor agar UI tidak menebak bentuknya. */
export type DataKalenderKas = {
  pengaturan: PengaturanKas;
  biaya: Array<{
    id: string;
    judul: string;
    nominal: number;
    hariDalamBulan: number;
    aktif: boolean;
  }>;
  biayaAktif: number;
  peringatan: Array<{
    tanggal: string;
    tanggalKritis: number;
    saldoProyeksi: number;
    saldoMinimum: number;
    hariKe: number;
    terkirim: boolean;
  }>;
  baris: Array<{
    tanggal: number;
    masuk: number;
    keluar: number;
    jumlahAngsuran: number;
    jumlahSiklus: number;
    jumlahBiaya: number;
  }>;
  totalMasuk: number;
  totalKeluar: number;
  hariTerberat: { tanggal: number; keluar: number } | null;
  hari: number;
  mulai: number;
  sampai: number;
  dibatasi: boolean;
  cakupan: { angsuran: number; siklus: number; biaya: number };
};

/** Dipakai mutation lain yang perlu memastikan tipe ctx. */
export type KonteksKas = MutationCtx;
