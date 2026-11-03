/**
 * Jalur pembayaran setoran dan penarikan pendana.
 *
 * Manual adalah jalur yang benar-benar terbuka: transfer bank, bukti, lalu
 * pencocokan admin. Otomatis sengaja dimatikan sampai adapter penyedia
 * pembayaran/payout, webhook, dan rekonsiliasi otomatis benar-benar ada.
 *
 * Jangan mengubah `JALUR_OTOMATIS_AKTIF` menjadi true hanya untuk membuka
 * tombol. Mutation otomatis tetap menolak selama adapter belum terpasang.
 */
export type JalurPembayaran = "manual" | "otomatis";

export const JALUR_OTOMATIS_AKTIF = false;

export const PESAN_JALUR_OTOMATIS =
  "Jalur otomatis dimatikan sementara. Gunakan transfer manual dan bukti pembayaran; penyedia pembayaran/payout belum terhubung.";

export const LABEL_JALUR: Record<JalurPembayaran, string> = {
  manual: "Transfer manual",
  otomatis: "Otomatis",
};
