import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { namaHurufBesar } from "../lib/nama";
import { normalisasiNomorWa } from "../lib/otpWa";
import { jatuhTempoSiklus } from "../lib/siklusPendana";
import { dalamJamKirim, jamWib } from "../lib/templatePesanWa";
import { awalHariWIB, formatTanggalWIB, selisihHariWIB } from "../lib/waktu";
import { apiKeyGatewayWa, kirimViaGateway, type WaSettings } from "./whatsapp";

/**
 * PENGINGAT SIKLUS PENDANA — WhatsApp ke nomor pemilik akun pendana.
 *
 * Yang diingatkan adalah jatuh tempo SIKLUS (30 hari sejak pendanaan), bukan
 * jatuh tempo pinjaman peminjam: pendana perlu tahu kapan dana dan imbal
 * hasilnya cair, dan tanggal itu sengaja tidak ikut bergeser saat tenor
 * pinjaman diubah admin.
 *
 * Aturan yang dijaga:
 *  - nomor tujuan HANYA nomor yang tersimpan pada akun pendana itu sendiri;
 *    nomor tidak pernah datang dari klien atau dari data peminjam;
 *  - pesan hanya memuat nomor referensi, tanggal, dan sisa hari — tanpa nama,
 *    NIK, rekening, atau berkas peminjam;
 *  - satu pesan per pendana per hari, diklaim sebelum gateway dipanggil, jadi
 *    cron yang berjalan bersamaan tidak mengirim dua kali;
 *  - pengingat hanya berangkat pada H-7, H-3, H-1, hari H, dan masa tenggang
 *    maksimal 7 hari. Di luar itu tidak ada pesan harian yang mengulang.
 */

/** Jenis log yang dipakai juga sebagai kunci idempotensi harian. */
const JENIS_LOG = "pengingat_pendana_harian";

/** Hari-hari ketika pengingat dikirim (sisa hari kalender). */
const HARI_PENGINGAT = new Set([7, 3, 1, 0]);
/** Keterlambatan yang masih diingatkan setiap hari, lalu diserahkan ke admin. */
const TERLAMBAT_MAKS_HARI = 7;
/** Batas baris per pesan agar satu pesan tidak menjadi daftar panjang. */
const BATAS_BARIS_PESAN = 12;

export type BarisPengingatSiklus = {
  loanId: Id<"loans">;
  nomorReferensi: string;
  jatuhTempoPada: number;
  /** Sisa hari; negatif berarti sudah melewati jatuh tempo. */
  sisaHari: number;
};

export type KandidatPengingatPendana = {
  userId: Id<"users">;
  nama: string;
  nomorWhatsApp: string;
  rows: BarisPengingatSiklus[];
};

function labelSisa(sisaHari: number): string {
  if (sisaHari < 0) return `terlambat ${Math.abs(sisaHari)} hari`;
  if (sisaHari === 0) return "jatuh tempo hari ini";
  return `${sisaHari} hari lagi`;
}

type HasilPengingatPendana = {
  terkirim: number;
  gagal: number;
  jumlahPenerima: number;
  jumlahPinjaman: number;
  alasan: "luar_jam_kirim" | "nonaktif" | "tanpa_token" | "jalan";
};

/** Apakah satu siklus masuk jadwal pengingat hari ini? */
export function masukJadwalPengingat(sisaHari: number): boolean {
  return (
    HARI_PENGINGAT.has(sisaHari) ||
    (sisaHari < 0 && sisaHari >= -TERLAMBAT_MAKS_HARI)
  );
}

/**
 * Satu baris siklus yang perlu diingatkan, dikelompokkan per akun pendana.
 *
 * Hanya pinjaman berstatus `didanai` yang punya `pendanaId` dan tanggal
 * pendanaan. Baris warisan yang hanya menyimpan `pendanaNama` tidak masuk di
 * sini: tanpa id akun, nomor tujuan tidak bisa dipastikan milik orang yang
 * benar, dan menebaknya berarti mengirim data pinjaman ke nomor orang lain.
 */
export const _kandidat = internalQuery({
  args: {},
  handler: async (ctx): Promise<KandidatPengingatPendana[]> => {
    const sekarang = Date.now();
    const pinjaman = await ctx.db
      .query("loans")
      .withIndex("by_status", (q) => q.eq("status", "didanai"))
      .take(500);

    const perPendana = new Map<Id<"users">, BarisPengingatSiklus[]>();
    for (const loan of pinjaman) {
      if (loan.pendanaId === undefined || loan.didanaiPada === undefined) continue;
      const jatuhTempoPada = jatuhTempoSiklus(loan.didanaiPada);
      // Hari KALENDER WIB, bukan selisih 24 jam: siklus yang jatuh tempo kemarin
      // siang harus terbaca "terlambat 1 hari" pagi ini, bukan "hari ini".
      const sisaHari = selisihHariWIB(sekarang, jatuhTempoPada);
      if (!masukJadwalPengingat(sisaHari)) continue;
      const rows = perPendana.get(loan.pendanaId) ?? [];
      rows.push({
        loanId: loan._id,
        nomorReferensi: loan.nomorReferensi,
        jatuhTempoPada,
        sisaHari,
      });
      perPendana.set(loan.pendanaId, rows);
    }

    const hasil: KandidatPengingatPendana[] = [];
    for (const [userId, rows] of perPendana) {
      const user = await ctx.db.get(userId);
      if (user === null || user.role !== "dana") continue;
      const nomorWhatsApp = normalisasiNomorWa(user.nomorWhatsApp);
      if (nomorWhatsApp === null) continue;
      hasil.push({
        userId,
        nama: user.name ?? "Pendana",
        nomorWhatsApp,
        rows: rows.sort((a, b) => a.jatuhTempoPada - b.jatuhTempoPada),
      });
    }
    return hasil.sort((a, b) => a.userId.localeCompare(b.userId));
  },
});

/** Pesan ringkas; seluruh angka berasal dari baris di atas. */
export function susunPesanPengingatPendana(k: KandidatPengingatPendana): string {
  const tampil = k.rows.slice(0, BATAS_BARIS_PESAN);
  const sisaBaris = k.rows.length - tampil.length;
  return [
    "PINDAI - pengingat siklus pendana",
    `Halo ${namaHurufBesar(k.nama)}, ${k.rows.length} pinjaman yang Anda danai perlu dipantau:`,
    ...tampil.map(
      (r) =>
        `- ${r.nomorReferensi}: jatuh tempo ${formatTanggalWIB(
          r.jatuhTempoPada,
        )} (${labelSisa(r.sisaHari)})`,
    ),
    ...(sisaBaris > 0 ? [`- dan ${sisaBaris} pinjaman lain`] : []),
    "Buka ruang Pendana untuk melihat rincian. Ini pengingat internal PINDAI, bukan tagihan atau bukti transfer.",
  ].join("\n");
}

/**
 * Klaim satu pesan per nomor per hari.
 *
 * Log klaim ditulis SEBELUM gateway dipanggil. Bila action berhenti setelah
 * klaim, baris berstatus `mengirim` tetap terlihat di riwayat admin — lebih
 * jujur daripada pesan kedua yang tidak terlihat. Keesokan harinya klaim baru
 * boleh dibuat, sehingga kegagalan gateway tidak menghanguskan pengingat.
 */
export const _klaim = internalMutation({
  args: { nomorTujuan: v.string() },
  handler: async (
    ctx,
    { nomorTujuan },
  ): Promise<
    | { klaim: false; logId: null }
    | { klaim: true; logId: Id<"waLogs"> }
  > => {
    const sejak = awalHariWIB(Date.now());
    const logHariIni = await ctx.db
      .query("waLogs")
      .withIndex("by_waktu", (q) => q.gte("waktu", sejak))
      .collect();
    if (
      logHariIni.some(
        (row) => row.jenis === JENIS_LOG && row.nomorTujuan === nomorTujuan,
      )
    ) {
      return { klaim: false as const, logId: null };
    }
    const logId = await ctx.db.insert("waLogs", {
      nomorTujuan,
      jenis: JENIS_LOG,
      isiPesan: "(sedang dikirim)",
      status: "mengirim",
      waktu: Date.now(),
    });
    return { klaim: true as const, logId };
  },
});

/**
 * Cron harian 08.00 WIB. Tidak pernah melempar: gateway yang belum siap atau
 * di luar jam kirim hanya mengembalikan alasan, bukan menghentikan cron.
 */
export const jalankanPengingatPendana = internalAction({
  // `userId` hanya untuk operasi/uji bertarget; cron memanggil tanpa argumen
  // sehingga seluruh pendana yang masuk jadwal tetap dilayani.
  args: { userId: v.optional(v.id("users")) },
  handler: async (ctx, { userId }): Promise<HasilPengingatPendana> => {
    const now = Date.now();
    if (!dalamJamKirim(jamWib(now))) {
      return {
        terkirim: 0,
        gagal: 0,
        jumlahPenerima: 0,
        jumlahPinjaman: 0,
        alasan: "luar_jam_kirim" as const,
      };
    }

    const settings: WaSettings = await ctx.runQuery(internal.whatsapp._getSettings, {});
    const apiKey = apiKeyGatewayWa();
    const bolehWa = settings.aktif === true && !!settings.apiUrl && apiKey !== "";
    if (!bolehWa) {
      return {
        terkirim: 0,
        gagal: 0,
        jumlahPenerima: 0,
        jumlahPinjaman: 0,
        alasan: settings.aktif !== true || !settings.apiUrl ? ("nonaktif" as const) : ("tanpa_token" as const),
      };
    }

    const semuaKandidat = await ctx.runQuery(
      internal.pengingatPendana._kandidat,
      {},
    );
    const kandidat =
      userId === undefined
        ? semuaKandidat
        : semuaKandidat.filter((k) => k.userId === userId);
    let terkirim = 0;
    let gagal = 0;
    let jumlahPinjaman = 0;

    for (const k of kandidat) {
      const kanalAktif = await ctx.runQuery(internal.notifikasiNasabah._kanalAktif, {
        userId: k.userId,
        kanal: "whatsapp",
      });
      if (!kanalAktif) continue;

      const klaim = await ctx.runMutation(internal.pengingatPendana._klaim, {
        nomorTujuan: k.nomorWhatsApp,
      });
      if (!klaim.klaim) continue;

      const isi = susunPesanPengingatPendana(k);
      const hasil = await kirimViaGateway(apiKey, settings, k.nomorWhatsApp, isi);
      await ctx.runMutation(internal.whatsapp._selesaikanKlaimPengingat, {
        logId: klaim.logId,
        isiPesan: isi,
        status: hasil.ok ? "terkirim" : "gagal",
        respon: hasil.respon,
      });
      if (hasil.ok) {
        terkirim += 1;
        jumlahPinjaman += k.rows.length;
      } else {
        gagal += 1;
      }
    }

    return {
      terkirim,
      gagal,
      jumlahPenerima: kandidat.length,
      jumlahPinjaman,
      alasan: "jalan" as const,
    };
  },
});
