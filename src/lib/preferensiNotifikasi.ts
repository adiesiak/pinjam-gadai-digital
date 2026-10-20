/**
 * Aturan sakelar notifikasi otomatis PINDAI (murni, tanpa React maupun Convex).
 *
 * Ada dua lapis: sakelar global di dashboard admin (`Pengaturan Sistem`) dan
 * pengaturan per nasabah yang hanya dapat diubah Super Admin dari panel
 * nasabah. Kosong berarti aktif, sehingga baris konfigurasi yang dibuat sebelum
 * kolomnya ada tetap mengirim pengingat seperti sebelumnya.
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

/**
 * Preferensi WhatsApp efektif per nasabah.
 *
 * `whatsappNotificationEnabled` adalah field baru; `notifWhatsapp` adalah nama
 * lama yang tetap dibaca agar baris data lama (dan sakelar yang sudah dimatikan
 * sebelumnya) tidak tiba-tiba aktif kembali. Kosong di keduanya berarti aktif.
 */
export function kanalWhatsappAktif(
  preferensiBaru: boolean | undefined,
  preferensiLama: boolean | undefined,
): boolean {
  return kanalAktif(preferensiBaru ?? preferensiLama);
}

/**
 * Keadaan efektif satu kanal untuk satu nasabah.
 *
 * Dua lapis sengaja: sakelar global adalah kebijakan operasional, sedangkan
 * pengaturan per nasabah adalah pengecualian yang ditetapkan Super Admin.
 * Pengecualian tidak boleh menghidupkan kembali kanal yang dimatikan global.
 * Karena itu `&&`, bukan `||`.
 */
export function kanalEfektif(
  global: boolean,
  override: boolean | undefined,
): boolean {
  return global && kanalAktif(override);
}

/** Label keadaan sakelar, dibaca sebagai teks dan bukan hanya posisi sakelar. */
export function labelKanalAktif(aktif: boolean): "Aktif" | "Nonaktif" {
  return aktif ? "Aktif" : "Nonaktif";
}
