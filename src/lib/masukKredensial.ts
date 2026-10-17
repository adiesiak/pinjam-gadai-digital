/**
 * Deteksi jenis kredensial di medan masuk TUNGGAL halaman `/auth`: EMAIL atau
 * NOMOR WhatsApp.
 *
 * Satu kolom dipakai dua pintu — kode email (`email-otp`) dan kode WhatsApp
 * untuk peminjam lama (`whatsapp-otp`, lihat `convex/auth/whatsappOtp.ts`) —
 * supaya pengguna tidak perlu menemukan tombol khusus lebih dulu. Aturannya
 * murni dan diuji di `masukKredensial.test.ts`; halaman masuk hanya menjalankan
 * hasilnya.
 */
import { normalisasiNomorWa } from "./otpWa";

export type KredensialMasuk =
  | { jenis: "email"; email: string }
  | { jenis: "nomor"; nomor: string }
  | { jenis: "tidak-valid" };

/**
 * Tentukan jalur untuk isi medan masuk.
 *
 * Nilai ber-`@` selalu jalur email dan dipangkas apa adanya — alamatnya harus
 * cocok PERSIS dengan yang tersimpan di akun, jadi tidak ada normalisasi lain.
 * Selebihnya dicoba sebagai nomor WhatsApp lewat `normalisasiNomorWa`, fungsi
 * yang sama dengan yang dipakai server, sehingga nomor yang lolos di sini pasti
 * bentuk yang diterima gateway.
 */
export function kredensialMasuk(mentah: string): KredensialMasuk {
  const nilai = mentah.trim();
  if (nilai === "") return { jenis: "tidak-valid" };
  if (nilai.includes("@")) return { jenis: "email", email: nilai };
  const nomor = normalisasiNomorWa(nilai);
  return nomor === null ? { jenis: "tidak-valid" } : { jenis: "nomor", nomor };
}
