/**
 * Tanggal kalender Indonesia (WIB, UTC+7).
 *
 * Server Convex berjalan di UTC tanpa zona perangkat, sedangkan nasabah dan
 * tim membaca tanggal menurut WIB. Tanpa konversi eksplisit, pengajuan pukul
 * 01.00 WIB tercatat bertanggal kemarin — pada nomor referensi, pesan WhatsApp,
 * dan audit.
 */

export const OFFSET_WIB_MS = 7 * 60 * 60 * 1000;

/** Tanggal WIB sebagai "YYYY-MM-DD". */
export function tanggalWIB(ms: number): string {
  return new Date(ms + OFFSET_WIB_MS).toISOString().slice(0, 10);
}

/** Tanggal WIB tanpa pemisah, untuk nomor referensi "YYYYMMDD". */
export function kodeTanggalWIB(ms: number): string {
  return tanggalWIB(ms).replace(/-/g, "");
}

/** Tanggal panjang bahasa Indonesia menurut kalender WIB. */
export function formatTanggalWIB(
  ms: number,
  opsi: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" },
): string {
  return new Date(ms).toLocaleDateString("id-ID", { ...opsi, timeZone: "Asia/Jakarta" });
}

/** Tanggal + jam WIB, untuk jejak audit dan pesan sesi. */
export function formatWaktuWIB(ms: number): string {
  return new Date(ms).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
}
