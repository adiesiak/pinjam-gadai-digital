/**
 * Tanggal kalender Indonesia (WIB, UTC+7).
 *
 * Server Convex berjalan di UTC tanpa zona perangkat, sedangkan nasabah dan
 * tim membaca tanggal menurut WIB. Tanpa konversi eksplisit, pengajuan pukul
 * 01.00 WIB tercatat bertanggal kemarin — pada nomor referensi, pesan WhatsApp,
 * dan audit.
 */

export const OFFSET_WIB_MS = 7 * 60 * 60 * 1000;

const HARI_MS = 86_400_000;

/**
 * Awal hari KALENDER WIB dari satu waktu (epoch ms).
 *
 * Dipakai menghitung umur hari: pergantian hari terjadi pukul 00.00 WIB, bukan
 * 24 jam setelah kejadian. Tanpa ini, tagihan yang jatuh tempo pukul 20.35 baru
 * bertambah sehari pada pukul 20.35 besoknya, sehingga pagi harinya nasabah
 * membaca angka kemarin.
 */
export function awalHariWIB(ms: number): number {
  return Math.floor((ms + OFFSET_WIB_MS) / HARI_MS) * HARI_MS - OFFSET_WIB_MS;
}

/**
 * Selisih hari kalender WIB, `b` dikurangi `a`.
 *
 * Hasilnya bilangan bulat: 0 untuk dua waktu di tanggal WIB yang sama, 1 untuk
 * besoknya, dan -1 untuk kemarin. Karena kedua sisi dinormalkan ke awal hari
 * lebih dulu, jam kejadian tidak lagi memengaruhi hasil.
 */
export function selisihHariWIB(a: number, b: number): number {
  return Math.round((awalHariWIB(b) - awalHariWIB(a)) / HARI_MS);
}

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
