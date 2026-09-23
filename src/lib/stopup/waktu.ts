/**
 * STOP-UP! — Helper waktu (semua laporan memakai zona WIB, UTC+7).
 * Semua fungsi murni agar bisa diuji tanpa clock palsu yang rumit.
 */

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Awal hari WIB dalam epoch ms. */
export function awalHariWib(waktuMs: number = Date.now()): number {
  const wib = new Date(waktuMs + WIB_OFFSET_MS);
  wib.setUTCHours(0, 0, 0, 0);
  return wib.getTime() - WIB_OFFSET_MS;
}

/** Awal hari WIB n hari ke belakang. */
export function awalHariWibMundur(n: number, waktuMs: number = Date.now()): number {
  return awalHariWib(waktuMs) - n * 24 * 60 * 60 * 1000;
}

/** Label tanggal WIB `DD/MM` — dipakai grafik 7 hari. */
export function labelTanggalWib(waktuMs: number): string {
  const wib = new Date(waktuMs + WIB_OFFSET_MS);
  const dd = String(wib.getUTCDate()).padStart(2, "0");
  const mm = String(wib.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}

/** Label jam WIB `HH:MM`. */
export function labelJamWib(waktuMs: number): string {
  const wib = new Date(waktuMs + WIB_OFFSET_MS);
  return `${String(wib.getUTCHours()).padStart(2, "0")}:${String(wib.getUTCMinutes()).padStart(2, "0")}`;
}

/** Tanggal+jam WIB lengkap — untuk struk. */
export function labelWaktuWib(waktuMs: number): string {
  const wib = new Date(waktuMs + WIB_OFFSET_MS);
  const dd = String(wib.getUTCDate()).padStart(2, "0");
  const mm = String(wib.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = wib.getUTCFullYear();
  return `${dd}/${mm}/${yyyy} ${labelJamWib(waktuMs)} WIB`;
}

/** Detik sisa sampai `target` (0 bila sudah lewat). */
export function sisaDetik(target: number, sekarang: number = Date.now()): number {
  return Math.max(0, Math.ceil((target - sekarang) / 1000));
}
