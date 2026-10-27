/**
 * Hak subjek data: frasa konfirmasi & aturan "masih ada kewajiban".
 *
 * Modul MURNI (tanpa React/Convex/DOM) supaya aturannya bisa diuji sebagai
 * skrip biasa, dan supaya server serta tampilan memakai daftar status yang
 * sama. Server tetap memeriksa sendiri setiap syaratnya — tampilan hanya
 * menjelaskan sebab penolakan lebih dulu, bukan penentu keputusan.
 */

/**
 * Frasa yang harus diketik pemilik akun sebelum penghapusan dijalankan.
 * Diketik, bukan sekadar ditekan, karena tindakan ini tidak bisa dibatalkan
 * dari sisi pengguna.
 */
export const KONFIRMASI_HAPUS_AKUN = "HAPUS AKUN SAYA";

/** Jenis catatan keuangan yang bisa menahan penghapusan akun. */
export type JenisCatatan = "pinjaman" | "gadai" | "kredit barang";

/** Status pinjaman yang berarti posisinya sudah tertutup. */
export const STATUS_PINJAMAN_TERTUTUP: readonly string[] = [
  "lunas",
  "ditolak",
  "dibatalkan",
];

/** Status gadai yang berarti posisinya sudah tertutup. */
export const STATUS_GADAI_TERTUTUP: readonly string[] = ["ditolak", "lunas_dilepas"];

/** Status kredit barang yang berarti posisinya sudah tertutup. */
export const STATUS_KREDIT_TERTUTUP: readonly string[] = [
  "lunas",
  "ditolak",
  "dibatalkan",
];

/** Daftar status tertutup untuk satu jenis catatan. */
export function statusTertutup(jenis: JenisCatatan): readonly string[] {
  if (jenis === "gadai") return STATUS_GADAI_TERTUTUP;
  if (jenis === "kredit barang") return STATUS_KREDIT_TERTUTUP;
  return STATUS_PINJAMAN_TERTUTUP;
}

/** True bila status ini berarti tidak ada kewajiban berjalan. */
export function posisiTertutup(jenis: JenisCatatan, status: string): boolean {
  return statusTertutup(jenis).includes(status);
}

/** True bila frasa konfirmasi cocok (spasi tepi & besar-kecil huruf diabaikan). */
export function konfirmasiCocok(masukan: string): boolean {
  return masukan.trim().toUpperCase() === KONFIRMASI_HAPUS_AKUN;
}

/** Nama berkas salinan data pribadi, mis. `pindai-data-saya-2026-10-27.json`. */
export function namaBerkasSalinanData(tanggal: string): string {
  return `pindai-data-saya-${tanggal}.json`;
}
