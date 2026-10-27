/**
 * NIK sebagai pintu masuk, bukan sebagai bukti identitas.
 *
 * NIK tercetak di KTP, difotokopi, dan beredar di banyak berkas; ia tidak
 * pernah cukup untuk membuka akun. Yang dibangun di sini: NIK hanya MEMILIH
 * akun, sedangkan kepemilikannya dibuktikan kode 6 angka yang dikirim ke nomor
 * WhatsApp pada data nasabah itu.
 *
 * Karena itu pesannya sengaja seragam. NIK yang tidak terdaftar, NIK ganda, dan
 * kode yang salah dijawab dengan kalimat yang sama, jadi jalur ini tidak bisa
 * dipakai untuk menebak siapa saja yang menjadi nasabah.
 */

/** Balasan seragam untuk permintaan kode (dipakai UI setelah kirim). */
export const PESAN_NIK_KIRIM =
  "Kalau NIK ini terdaftar, kode 6 angka sudah dikirim ke WhatsApp pada data Anda.";

/** Balasan seragam untuk NIK tidak dikenal, NIK ganda, dan kode yang salah. */
export const PESAN_NIK_UMUM =
  "NIK atau kode tidak cocok. Pastikan NIK 16 angka sesuai KTP dan kode berasal dari WhatsApp yang terdaftar.";

/** NIK yang diketik pengguna (spasi/titik dibuang) menjadi 16 angka, atau "". */
export function normalisasiNikLogin(nilai: string): string {
  const angka = (nilai ?? "").replace(/\D/g, "");
  return angka.length === 16 ? angka : "";
}
