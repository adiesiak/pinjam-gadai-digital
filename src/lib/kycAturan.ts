/**
 * VERSI ATURAN VERIFIKASI KYC — aturan apa yang berlaku saat sebuah putusan
 * verifikasi diambil.
 *
 * Kenapa berkas ini ada: putusan "identitas terverifikasi" hanya bisa
 * dipertanggungjawabkan bila kita tahu ATAS DASAR ATURAN APA putusan itu
 * diambil. Aturan bisa berubah tanpa satu pun isian nasabah berubah — mis.
 * ukuran berkas maksimum diturunkan, jenis gambar yang diterima dipersempit,
 * atau syarat persetujuan diperketat. Tanpa versi, perubahan seperti itu tidak
 * meninggalkan jejak: baris lama tetap tampak "sudah diverifikasi" menurut
 * aturan yang hari ini sudah tidak berlaku.
 *
 * Karena itu setiap putusan menyimpan VERSI yang berlaku (di `kycProfil`,
 * `kycRiwayat`, dan `berkasTerverifikasi`), dan `aturanUsang()` dipakai panel
 * petugas untuk menandai putusan/berkas yang diperiksa dengan aturan lama —
 * bahan pertimbangan apakah perlu verifikasi ulang.
 *
 * Menaikkan versi: ubah `VERSI_ATURAN_KYC` DAN `ATURAN_VERIFIKASI_BERLAKU`
 * bersama-sama dalam satu perubahan, lalu jelaskan alasannya di sini.
 *
 * Berkas ini MURNI (tanpa React/DOM/Convex) supaya bisa diuji sebagai skrip
 * biasa: `bun src/lib/kycAturan.test.ts`.
 */
import { GAMBAR_DITERIMA, MAX_FILE_BYTES } from "./kyc";

/**
 * Versi aturan yang berlaku sekarang.
 *
 * Riwayat versi:
 * - `kyc-aturan-2026-10` — versi pertama yang dicatat. Berkas KTP/selfie/bukti
 *   penghasilan wajib gambar yang isinya diperiksa server (magic bytes) dan
 *   ukurannya ≤ 5 MB; isian identitas lengkap; persetujuan pemrosesan data
 *   wajib tercatat; keputusan hanya oleh petugas ber-TOTP.
 */
export const VERSI_ATURAN_KYC = "kyc-aturan-2026-10";

/** Slot berkas KYC yang diperiksa dan disimpan privat. */
export type SlotBerkasAturan = "ktp" | "selfie" | "bukti";

/** Isi aturan verifikasi yang berlaku — dipakai petugas & dokumentasi. */
export type AturanVerifikasi = {
  versi: string;
  /** Slot berkas yang WAJIB ada sebelum identitas boleh diverifikasi. */
  berkasWajib: readonly SlotBerkasAturan[];
  /** Jenis gambar (dari ISI berkas) yang diterima untuk semua slot. */
  jenisDiterima: readonly string[];
  /** Batas ukuran per berkas, byte. */
  ukuranMaksByte: number;
  /** Persetujuan pemrosesan data wajib tercatat sebelum data dikumpulkan. */
  wajibPersetujuan: boolean;
  /** Keputusan verifikasi hanya boleh diambil petugas ber-TOTP. */
  hanyaPetugasTotp: boolean;
};

/**
 * Aturan yang berlaku sekarang.
 *
 * Sengaja menunjuk konstanta yang sudah ada (`MAX_FILE_BYTES`,
 * `GAMBAR_DITERIMA`) — bukan menyalin angkanya. Aturan yang dijalankan kode dan
 * aturan yang diumumkan di sini tidak boleh berbeda.
 */
export const ATURAN_VERIFIKASI_BERLAKU: AturanVerifikasi = {
  versi: VERSI_ATURAN_KYC,
  berkasWajib: ["ktp", "selfie", "bukti"],
  jenisDiterima: GAMBAR_DITERIMA,
  ukuranMaksByte: MAX_FILE_BYTES,
  wajibPersetujuan: true,
  hanyaPetugasTotp: true,
};

/**
 * true bila sesuatu yang diperiksa/diputuskan di bawah `versi` tidak lagi
 * memakai aturan yang berlaku.
 *
 * `null`, `undefined`, dan teks kosong berarti "tidak ada versi yang tercatat"
 * — bukan "usang". Baris lama yang dibuat sebelum kolom versi ada karena itu
 * TIDAK ditandai usang, supaya migrasi tidak diam-diam memaksa semua nasabah
 * lama mengulang KYC. Yang ditandai hanya versi yang JELAS berbeda.
 */
export function aturanUsang(versi: string | null | undefined): boolean {
  if (versi === null || versi === undefined) return false;
  const bersih = versi.trim();
  if (bersih === "") return false;
  return bersih !== VERSI_ATURAN_KYC;
}

/** Kalimat siap tampil untuk petugas bila putusan ini memakai aturan lama. */
export function keteranganAturanUsang(versi: string | null | undefined): string | null {
  if (!aturanUsang(versi)) return null;
  return (
    `Diperiksa dengan aturan ${versi}, sedangkan aturan yang berlaku sekarang ` +
    `${VERSI_ATURAN_KYC}. Pertimbangkan verifikasi ulang sebelum mengandalkan putusan ini.`
  );
}
