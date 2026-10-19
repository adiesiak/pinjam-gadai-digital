/**
 * Aturan preferensi kanal notifikasi PINDAI (murni, tanpa React maupun Convex).
 *
 * Pilihan disimpan sebagai boolean OPSIONAL di `users`: kosong berarti aktif.
 * Itu disengaja — akun lama tidak berubah perilaku hanya karena kolom baru
 * ditambahkan, dan pemilik akun hanya perlu menulis pilihan saat ia benar-benar
 * mematikannya.
 *
 * Yang diatur di sini hanya kanal PENGINGAT TAGIHAN (WhatsApp dan email).
 * Notifikasi di dalam aplikasi tetap tersimpan, dan pesan keamanan seperti kode
 * OTP tidak pernah dimatikan oleh preferensi ini.
 */

export type KanalNotifikasi = "whatsapp" | "email";

export type PreferensiNotifikasi = Record<KanalNotifikasi, boolean>;

/** Bawaan untuk akun yang belum pernah memilih: kedua kanal aktif. */
export const PREFERENSI_BAWAAN: PreferensiNotifikasi = {
  whatsapp: true,
  email: true,
};

/** Satu kanal aktif kecuali pemilik akun menyatakannya mati (`false`). */
export function kanalAktif(disimpan: boolean | undefined): boolean {
  return disimpan !== false;
}

/** Pilihan efektif dari baris pengguna — satu tempat untuk server dan UI. */
export function preferensiDariUser(
  user: { notifWhatsapp?: boolean; notifEmail?: boolean } | null | undefined,
): PreferensiNotifikasi {
  return {
    whatsapp: kanalAktif(user?.notifWhatsapp),
    email: kanalAktif(user?.notifEmail),
  };
}

/** Label keadaan kanal — dibaca sebagai teks, bukan hanya posisi sakelar. */
export function labelKanalAktif(aktif: boolean): "Aktif" | "Nonaktif" {
  return aktif ? "Aktif" : "Nonaktif";
}
