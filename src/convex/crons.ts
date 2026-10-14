import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

/**
 * Cron harian PINDAI:
 * - UTC 00:00 — tulis pengingat jatuh tempo (append-only, idempoten per hari)
 *   untuk semua pinjaman berstatus Didanai: H-3, hari jatuh tempo, dan
 *   keterlambatan.
 * - UTC 17:30 (00:30 WIB) — retensi jejak lokasi: hapus titik lebih tua dari
 *   LOKASI_RETENSI.jejakHari (90 hari), kecuali titik milik pinjaman yang
 *   masih berjalan (ditahan sampai 400 hari sebagai bukti audit).
 * - UTC 18:00 — retensi kunci idempotensi: buang kunci lebih tua dari 7 hari
 *   (jauh melewati jendela retry jaringan mana pun).
 * - UTC 18:15 — retensi jejak gerbang pengiriman: buang baris pembatas laju
 *   yang lebih tua dari 7 hari (jejak `auditLog` pelanggarannya tetap ada).
 */
const crons = cronJobs();

crons.daily(
  "daily-due-reminders",
  { hourUTC: 0, minuteUTC: 0 },
  internal.loans.generateDueReminders,
);

crons.daily(
  "bersihkan-kunci-idempotensi",
  { hourUTC: 18, minuteUTC: 0 },
  internal.idempotensi.bersihkanKunciLama,
  {},
);

crons.daily(
  "bersihkan-jejak-gerbang",
  { hourUTC: 18, minuteUTC: 15 },
  internal.gerbangKirim.bersihkanJejakGerbang,
  {},
);

crons.daily(
  "retensi-lokasi-jejak",
  { hourUTC: 17, minuteUTC: 30 },
  internal.tracking.bersihkanLokasiLama,
  // Argumen kosong = pakai kebijakan LOKASI_RETENSI (satu sumber di lib).
  {},
);

export default crons;
