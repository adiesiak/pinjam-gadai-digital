import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

/**
 * Cron harian PINDAI (UTC 00:00):
 * - tulis pengingat jatuh tempo (append-only, idempoten per hari) untuk semua
 *   pinjaman berstatus Didanai — H-3, hari jatuh tempo, dan keterlambatan.
 */
const crons = cronJobs();

crons.daily(
  "daily-due-reminders",
  { hourUTC: 0, minuteUTC: 0 },
  internal.loans.generateDueReminders,
);

export default crons;
