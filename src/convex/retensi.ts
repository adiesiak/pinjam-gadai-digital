/**
 * Retensi data pribadi & jejak operasional.
 *
 * Dua tabel ini tumbuh tanpa batas sebelum ada job-nya: `waLogs` menyimpan
 * nomor tujuan dan ISI pesan yang dikirim ke nasabah, `auditLog` menyimpan
 * jejak "siapa melakukan apa". Keduanya dibersihkan job harian memakai ambang
 * yang diatur admin di Pengaturan Sistem.
 *
 * Tiap putaran menghapus maksimal 500 baris supaya transaksi tidak menembus
 * batas eksekusi Convex; sisanya dilanjutkan putaran berikutnya. Denyutnya
 * dicatat supaya panel kesehatan bisa menandai job yang berhenti berjalan.
 */
import { internalMutation } from "./_generated/server";
import { catatDenyut } from "./monitoring";
import { getConfig } from "./system";

/** Baris per putaran, sama dengan job retensi lain. */
const BATCH = 500;

const HARI_MS = 24 * 60 * 60 * 1000;

/** Buang isi pesan WhatsApp yang lebih tua dari ambang admin. */
export const bersihkanLogWhatsapp = internalMutation({
  args: {},
  handler: async (ctx) => {
    const { retensiLogWaHari } = await getConfig(ctx);
    const batas = Date.now() - retensiLogWaHari * HARI_MS;
    const lama = await ctx.db
      .query("waLogs")
      .withIndex("by_waktu", (q) => q.lt("waktu", batas))
      .take(BATCH);
    for (const baris of lama) {
      await ctx.db.delete(baris._id);
    }
    await catatDenyut(ctx, "retensi-log-wa");
    return { dihapus: lama.length };
  },
});

/**
 * Buang jejak audit yang lebih tua dari ambang admin.
 *
 * Riwayat konfigurasi (`configRiwayat`) sengaja tidak disentuh: itu yang
 * menjelaskan tarif mana yang berlaku pada satu tanggal, dan ukurannya bertambah
 * hanya saat admin menyimpan pengaturan.
 */
export const bersihkanAudit = internalMutation({
  args: {},
  handler: async (ctx) => {
    const { retensiAuditHari } = await getConfig(ctx);
    const batas = Date.now() - retensiAuditHari * HARI_MS;
    const lama = await ctx.db
      .query("auditLog")
      .withIndex("by_waktu", (q) => q.lt("waktu", batas))
      .take(BATCH);
    for (const baris of lama) {
      await ctx.db.delete(baris._id);
    }
    await catatDenyut(ctx, "retensi-audit");
    return { dihapus: lama.length };
  },
});
