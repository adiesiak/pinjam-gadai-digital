/**
 * Persetujuan risiko pendana — catatan SERVER, append-only.
 *
 * Kenapa di server, bukan `localStorage`: penyimpanan peramban hanya terbaca di
 * satu perangkat. Pendana yang berganti ponsel akan tampak "belum pernah
 * menyetujui", dan sebaliknya persetujuan bisa hilang tanpa jejak begitu
 * penyimpanan situs dibersihkan. Yang dicatat di sini adalah persetujuan atas
 * nama AKUN, sehingga tetap terbaca dari perangkat mana pun.
 *
 * Kenapa per VERSI teks: yang disetujui pendana adalah kalimat risiko tertentu,
 * bukan "risiko" secara umum. Versinya dipegang `RISK_TEXT_VERSION` di
 * `src/lib/teksRisikoPendanaan.ts`. Bila kalimatnya berubah, versinya naik dan
 * pendana diminta menyetujui lagi — sementara baris versi lama tetap tersimpan
 * sebagai riwayat versi mana yang pernah disetujui siapa dan kapan.
 *
 * Gerbangnya SAMA dengan gerbang ruang pendana (`requirePengamat` dari
 * `convex/penyediaDana.ts`), bukan salinannya: peran `dana`, sesi kode akses
 * bersama yang masih berlaku (`pengamat`), atau `admin` untuk pratinjau.
 *
 * Admin TIDAK mencatat persetujuan: ia bukan pihak yang mendanai, jadi
 * permintaannya ditolak terus terang alih-alih disimpan diam-diam. Halaman admin
 * tetap dapat membaca status akun mana pun lewat panel yang berwenang.
 */
import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requirePengamat } from "./penyediaDana";
import { ROLES } from "./schema";
import { audit } from "./system";
import { statusPersetujuan } from "../lib/persetujuanRisiko";
import { PERNYATAAN_PERSETUJUAN, RISK_TEXT_VERSION } from "../lib/teksRisikoPendanaan";

/** Label aktor untuk audit trail — akun pendana sering tanpa `name`. */
function labelAkun(user: { email?: string; name?: string }): string {
  return user.email ?? user.name ?? "pendana";
}

/**
 * Status persetujuan risiko akun yang sedang masuk, beserta riwayat versinya.
 *
 * `perluSetuju` dihitung dari versi yang berlaku, jadi menaikkan
 * `RISK_TEXT_VERSION` cukup dilakukan di satu berkas teks dan seluruh pendana
 * otomatis diminta menyetujui lagi.
 */
export const statusPersetujuanRisiko = query({
  args: {},
  handler: async (ctx) => {
    const { userId, user } = await requirePengamat(ctx);
    const riwayat = await ctx.db
      .query("persetujuanRisikoPendana")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    return {
      ...statusPersetujuan({
        versiBerlaku: RISK_TEXT_VERSION,
        riwayat: riwayat.map((b) => ({
          versiTeks: b.versiTeks,
          peran: b.peran as string,
          disetujuiPada: b.disetujuiPada,
        })),
      }),
      /** Kalimat yang harus dibaca pendana sebelum mencentang. */
      pernyataan: PERNYATAAN_PERSETUJUAN,
      peran: user.role as string,
      /** Hanya akun pendana yang mencatat persetujuan; admin hanya meninjau. */
      bolehSetuju: user.role === ROLES.DANA || user.role === ROLES.PENGAMAT,
    };
  },
});

/**
 * Catat persetujuan pendana atas versi teks risiko yang berlaku.
 *
 * `versiTeks` datang dari klien dan WAJIB cocok dengan versi yang berlaku di
 * server. Kalau halaman yang terbuka sudah usang (teks diperbarui di tab lain),
 * permintaannya ditolak dan pemakai diminta memuat ulang — bukan disimpan
 * sebagai persetujuan versi baru, sebab yang dibaca pendana kalimat lama.
 *
 * Idempoten per versi: menekan tombol dua kali, atau menyetujui dari dua
 * perangkat, tidak menambah baris kedua. Yang dikembalikan adalah waktu
 * persetujuan yang sudah ada.
 */
export const catatPersetujuanRisiko = mutation({
  args: {
    /** Versi teks risiko yang benar-benar tampil di layar pendana. */
    versiTeks: v.number(),
  },
  handler: async (ctx, { versiTeks }) => {
    const { userId, user } = await requirePengamat(ctx);
    if (user.role !== ROLES.DANA && user.role !== ROLES.PENGAMAT) {
      throw new Error(
        "Persetujuan risiko dicatat untuk akun pendana. Akun admin hanya meninjau ruang ini.",
      );
    }
    if (versiTeks !== RISK_TEXT_VERSION) {
      throw new Error(
        "Teks risiko sudah diperbarui. Muat ulang halaman, baca versi terbaru, lalu setujui kembali.",
      );
    }

    const sebelumnya = await ctx.db
      .query("persetujuanRisikoPendana")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const sudahAda = sebelumnya.find((b) => b.versiTeks === versiTeks);
    if (sudahAda !== undefined) {
      return {
        ok: true,
        sudahAda: true,
        versiTeks,
        disetujuiPada: sudahAda.disetujuiPada,
      };
    }

    const peran: "dana" | "pengamat" = user.role;
    const sekarang = Date.now();
    await ctx.db.insert("persetujuanRisikoPendana", {
      userId,
      versiTeks,
      peran,
      // Kalimat yang disetujui disalin apa adanya: yang tersimpan bukan hanya
      // nomor versi, sehingga bunyi persetujuannya tetap dapat dibaca kembali.
      pernyataan: PERNYATAAN_PERSETUJUAN,
      disetujuiPada: sekarang,
    });

    await audit(
      ctx,
      userId,
      labelAkun(user),
      "setuju_risiko_pendana",
      `versi ${versiTeks}`,
      `Pendana menyetujui pernyataan risiko pendanaan versi ${versiTeks} sebagai ${peran}. Catatan server atas nama akun, bukan bukti transfer maupun jaminan atas dana.`,
    );

    return { ok: true, sudahAda: false, versiTeks, disetujuiPada: sekarang };
  },
});
