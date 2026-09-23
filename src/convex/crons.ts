import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

/**
 * Cron harian PINDAI (UTC 00:00):
 * - tulis pengingat jatuh tempo (append-only, idempoten per hari) untuk semua
 *   pinjaman berstatus Didanai — H-3, hari jatuh tempo, dan keterlambatan.
 *
 * Cron STOP-UP!:
 * - tiap 5 menit: tutup tagihan QRIS yang kedaluwarsa (25 menit → EXPIRED).
 * - tiap 30 menit: kirim Telegram Alert bila saldo supplier H2H rendah atau
 *   printer terminal bermasalah (kertas habis / terputus).
 */
const crons = cronJobs();

crons.daily(
  "daily-due-reminders",
  { hourUTC: 0, minuteUTC: 0 },
  internal.loans.generateDueReminders,
);

crons.interval(
  "stopup-expire-invoices",
  { minutes: 5 },
  internal.stopup.transactions.expireStale,
);

crons.interval(
  "stopup-telegram-alert",
  { minutes: 30 },
  internal.stopup.alerts.cekDanKirimAlert,
);

export default crons;
