/**
 * Logika MURNI untuk kartu hero PINDAI ("Black Obsidian Glass & Luxury Batik
 * Parang") — tanpa React, jadi bisa diuji langsung (`kartuNasabah.test.ts`).
 *
 * Tiga hal dikumpulkan di sini karena kegagalannya berbahaya kalau ditulis di
 * dalam JSX:
 *
 *  1. NOMOR KARTU. Data nasabah bisa datang dalam bentuk apa pun (`0812...`,
 *     "1234-5678", atau sudah berkelompok). Digitnya dinormalkan ke kelompok
 *     4-4-4-4 supaya tata letaknya tidak pernah melebar/pecah, dan jumlah
 *     digitnya dibatasi 16.
 *  2. NAMA PEMEGANG. Nama hanya boleh tampil bila nasabahnya benar-benar
 *     terverifikasi; selain itu kartu harus jujur menulis "CARDHOLDER" —
 *     bukan menampilkan nama yang belum diverifikasi.
 *  3. MASA BERLAKU. Hanya bentuk "MM/YY" yang diterima; nilai lain jatuh ke
 *     contoh yang sah, bukan menampilkan teks mentah yang membingungkan.
 */
import { namaHurufBesar } from "./nama";

/** Panjang nomor kartu yang ditampilkan (4 kelompok × 4 digit). */
export const PANJANG_NOMOR_KARTU = 16;

/** Nomor contoh — angka yang mustahil menjadi kartu sungguhan. */
export const NOMOR_KARTU_CONTOH = "1234 5678 9012 3456";

/** Masa berlaku contoh. */
export const MASA_BERLAKU_CONTOH = "12/29";

/** Nama pengganti bila nasabah belum terverifikasi. */
export const NAMA_PEMEGANG_KOSONG = "CARDHOLDER";

/** Catatan kecil di kartu: objek merek, bukan alat bayar. */
export const CATATAN_KARTU_CONTOH = "Kartu contoh · bukan alat bayar";

/**
 * Normalkan nomor kartu ke kelompok 4-4-4-4.
 * Teks tanpa satu pun digit → nomor contoh (kartu tetap punya bentuk yang sah).
 */
export function formatNomorKartu(teks: string | null | undefined): string {
  const digit = String(teks ?? "")
    .replace(/\D/g, "")
    .slice(0, PANJANG_NOMOR_KARTU);
  if (digit === "") return NOMOR_KARTU_CONTOH;
  return digit.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

/**
 * Nama pemegang kartu: huruf besar semua, spasi dirapikan, dan SELALU
 * "CARDHOLDER" selama nasabah belum terverifikasi atau namanya kosong.
 */
export function namaPemegangKartu(
  nama: string | null | undefined,
  terverifikasi: boolean,
): string {
  if (!terverifikasi) return NAMA_PEMEGANG_KOSONG;
  const bersih = namaHurufBesar(nama ?? "");
  return bersih === "" ? NAMA_PEMEGANG_KOSONG : bersih;
}

/** Masa berlaku hanya diterima dalam bentuk "MM/YY"; selain itu → contoh. */
export function masaBerlakuKartu(teks: string | null | undefined): string {
  const bersih = String(teks ?? "").trim();
  return /^\d{2}\/\d{2}$/.test(bersih) ? bersih : MASA_BERLAKU_CONTOH;
}
