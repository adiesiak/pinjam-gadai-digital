/**
 * Aturan sakelar notifikasi otomatis PINDAI (murni, tanpa React maupun Convex).
 *
 * Sakelar ini GLOBAL dan hanya ada di dashboard admin (`Pengaturan Sistem`).
 * Pemilik akun tidak memiliki pilihan kanal sendiri: kosong berarti aktif,
 * sehingga baris konfigurasi yang dibuat sebelum kolomnya ada tetap mengirim
 * pengingat seperti sebelumnya.
 *
 * Yang diatur hanya pengingat tagihan. Notifikasi di dalam aplikasi tetap
 * tersimpan, dan pesan keamanan seperti kode OTP tidak pernah dimatikan oleh
 * sakelar ini.
 */

export type KanalNotifikasi = "whatsapp" | "email";

/** Bawaan saat konfigurasi belum pernah menyimpan pilihan. */
export const PREFERENSI_BAWAAN = {
  whatsapp: true,
  email: true,
} as const;

/** Sakelar aktif kecuali admin menyatakannya mati (`false`). */
export function kanalAktif(disimpan: boolean | undefined): boolean {
  return disimpan !== false;
}
