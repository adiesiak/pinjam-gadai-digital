/**
 * Pengingat WhatsApp voucher yang hampir kedaluwarsa (H-3).
 *
 * Kenapa ada: voucher adalah janji — hadiah apresiasi pelunasan, referral, atau
 * pemberian admin. Sebelum ini tidak ada satu pun pemberitahuan, jadi voucher
 * hangus tanpa pernah diketahui pemiliknya. Pengingat in-app dihitung dari masa
 * berlaku (`convex/notifikasi.ts`); modul ini yang mengirim WhatsApp-nya.
 *
 * Aturan yang dipegang:
 *  - Hanya voucher AKTIF yang masih punya sisa kuota. Voucher yang sudah habis
 *    dipakai tidak diingatkan — tidak ada yang bisa diselamatkan.
 *  - Satu voucher dikirimi SEKALI, dijaga kunci `voucher:<id>:h3`.
 *  - Kegagalan infrastruktur (gateway mati/token kosong) tidak dicatat, supaya
 *    pengingat dicoba lagi pada jadwal berikutnya; kegagalan per nomor dicatat
 *    supaya nomor bermasalah tidak dispam tiap hari.
 *  - Volume per putaran dibatasi: cron ini melayani voucher, bukan kampanye
 *    massal, dan penjadwal tidak boleh berjalan lebih lama dari jendela kirim.
 *
 * Menjalankan manual dari dashboard Convex:
 *   internal.pengingatVoucher.jalankanPengingatVoucher
 */
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import {
  PENGINGAT_VOUCHER,
  pesanPengingatVoucher,
} from "../lib/pengingatVoucher";
import { dalamJamKirim, jamWib } from "../lib/templatePesanWa";

const HARI_MS = 86_400_000;

/** Satu voucher yang perlu dikabari pada putaran ini. */
type Kandidat = {
  voucherId: Id<"voucher">;
  userId: Id<"users">;
  kunci: string;
  nomor: string;
  nama: string;
  judul: string;
  kode: string;
  berlakuSampai: number;
};

/**
 * Voucher yang jatuh tempo dalam tiga hari dan belum pernah dikabari.
 *
 * Nomor diambil dari KYC lebih dulu, lalu profil akun — sama dengan sumber nomor
 * yang dipakai pengingat tagihan, supaya satu nasabah tidak punya dua nomor
 * berbeda tergantung modul yang mengirim.
 */
export const _kandidat = internalQuery({
  args: {},
  handler: async (ctx): Promise<Kandidat[]> => {
    const sekarang = Date.now();
    const batas = sekarang + PENGINGAT_VOUCHER.hari * HARI_MS;
    const rows = await ctx.db
      .query("voucher")
      .withIndex("by_status", (q) => q.eq("status", "aktif"))
      .take(PENGINGAT_VOUCHER.batasKandidat);

    const hasil: Kandidat[] = [];
    for (const row of rows) {
      if (row.terpakai >= row.batasPemakaian) continue;
      if (row.berlakuSampai < sekarang || row.berlakuSampai > batas) continue;

      const kunci = `voucher:${row._id}:h3`;
      const sudah = await ctx.db
        .query("pengingatVoucher")
        .withIndex("by_kunci", (q) => q.eq("kunci", kunci))
        .first();
      if (sudah !== null) continue;

      const user = await ctx.db.get(row.pemilikId);
      if (user === null || user.isAnonymous === true || user.role === "admin") continue;

      // Gerbang yang sama dengan pengingat tagihan: sakelar global admin DAN
      // pengaturan per nasabah. Voucher tidak boleh jadi celah untuk menembus
      // pilihan nasabah yang sudah mematikan WhatsApp.
      const bolehWa = await ctx.runQuery(internal.notifikasiNasabah._kanalAktif, {
        userId: row.pemilikId,
        kanal: "whatsapp",
      });
      if (!bolehWa) continue;

      const kyc = await ctx.db
        .query("kycProfil")
        .withIndex("by_user", (q) => q.eq("userId", row.pemilikId))
        .first();
      const nomor = (kyc?.nomorWhatsApp ?? user.nomorWhatsApp ?? "").trim();
      if (!/^62\d{8,13}$/.test(nomor)) continue;

      hasil.push({
        voucherId: row._id,
        userId: row.pemilikId,
        kunci,
        nomor,
        nama: user.name?.trim() || "Nasabah",
        judul: row.judul,
        kode: row.kode,
        berlakuSampai: row.berlakuSampai,
      });
    }
    return hasil;
  },
});

/**
 * Catat satu pengiriman. Mengembalikan `false` bila kuncinya sudah ada — jadi
 * dua putaran yang berjalan berdekatan tidak mengirim pesan ganda walau
 * `_kandidat` membacanya sebelum baris pertama tersimpan.
 */
export const _catatKirim = internalMutation({
  args: {
    voucherId: v.id("voucher"),
    userId: v.id("users"),
    kunci: v.string(),
    nomor: v.string(),
    status: v.string(),
    respon: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ baru: boolean }> => {
    const ada = await ctx.db
      .query("pengingatVoucher")
      .withIndex("by_kunci", (q) => q.eq("kunci", args.kunci))
      .first();
    if (ada !== null) return { baru: false };
    await ctx.db.insert("pengingatVoucher", {
      voucherId: args.voucherId,
      userId: args.userId,
      kunci: args.kunci,
      nomor: args.nomor,
      status: args.status,
      ...(args.respon === undefined ? {} : { respon: args.respon }),
      waktu: Date.now(),
    });
    return { baru: true };
  },
});

/** Pesan yang menyebut gateway belum siap — bukan salah nomor nasabah. */
function kegagalanInfrastruktur(respon: string): boolean {
  return /belum aktif|WHATSAPP_API_KEY/i.test(respon);
}

export const jalankanPengingatVoucher = internalAction({
  args: {},
  handler: async (
    ctx,
  ): Promise<{
    terkirim: number;
    gagal: number;
    kandidat: number;
    alasan?: string;
  }> => {
    // Denyut ditulis lebih dulu: gateway yang dimatikan bukan alasan cron
    // dianggap berhenti berdenyut.
    await ctx.runMutation(internal.monitoring.catatDenyutInternal, {
      nama: "pengingat-voucher-wa",
    });

    const sekarang = Date.now();
    if (!dalamJamKirim(jamWib(sekarang))) {
      return { terkirim: 0, gagal: 0, kandidat: 0, alasan: "luar_jam_kirim" };
    }

    const kandidat = await ctx.runQuery(internal.pengingatVoucher._kandidat, {});
    if (kandidat.length === 0) {
      return { terkirim: 0, gagal: 0, kandidat: 0, alasan: "tidak_ada" };
    }

    let terkirim = 0;
    let gagal = 0;
    for (const item of kandidat) {
      const isi = pesanPengingatVoucher({
        nama: item.nama,
        judul: item.judul,
        kode: item.kode,
        berlakuSampai: item.berlakuSampai,
        sekarang,
      });
      const hasil = await ctx.runAction(internal.whatsapp._kirimPesanUmum, {
        nomor: item.nomor,
        isi,
      });

      if (hasil.ok) {
        terkirim += 1;
        await ctx.runMutation(internal.pengingatVoucher._catatKirim, {
          voucherId: item.voucherId,
          userId: item.userId,
          kunci: item.kunci,
          nomor: item.nomor,
          status: "terkirim",
          respon: hasil.respon,
        });
        continue;
      }

      gagal += 1;
      if (!kegagalanInfrastruktur(hasil.respon)) {
        // Nomor bermasalah / ditolak gateway: dicatat supaya tidak dicoba tiap
        // hari. Infrastruktur yang mati TIDAK dicatat — voucher ini masih layak
        // diingatkan besok.
        await ctx.runMutation(internal.pengingatVoucher._catatKirim, {
          voucherId: item.voucherId,
          userId: item.userId,
          kunci: item.kunci,
          nomor: item.nomor,
          status: "gagal",
          respon: hasil.respon,
        });
      }
    }

    return { terkirim, gagal, kandidat: kandidat.length };
  },
});
