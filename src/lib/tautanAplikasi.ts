/**
 * Alamat resmi PINDAI dan tautan halaman unduh.
 *
 * Dipakai halaman `/aplikasi`, tombol bagikan, dan pembuat QR. Satu tempat
 * berarti QR, pesan WhatsApp, dan teks di halaman tidak bisa menunjuk alamat
 * yang berbeda.
 */

/** Domain produksi. Ganti di sini bila domain berpindah. */
export const SITUS_RESMI = "https://pindai.biz.id";

/** Jalur halaman unduh di dalam situs. */
export const HALAMAN_UNDUH = "/aplikasi";

/** Alamat utuh halaman unduh yang dibagikan dan di-encode ke QR. */
export const URL_HALAMAN_UNDUH = `${SITUS_RESMI}${HALAMAN_UNDUH}`;

/** Isi pesan bagikan; satu tautan, satu tindakan. */
export const TEKS_BAGIKAN_APLIKASI = `Unduh PINDAI untuk Android: ${URL_HALAMAN_UNDUH}`;

/** Tautan WhatsApp tanpa nomor tujuan, jadi pengirim memilih percakapannya. */
export function tautanWhatsappAplikasi(): string {
  return `https://wa.me/?text=${encodeURIComponent(TEKS_BAGIKAN_APLIKASI)}`;
}
