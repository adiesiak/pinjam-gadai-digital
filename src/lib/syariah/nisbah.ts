/**
 * Nisbah bagi hasil produk SYARIAH.
 *
 * Aturan produk: margin/ujrah dibagi dengan rasio yang sama dengan produk
 * konvensional, 47 : 13 dari 60. Pendana (Shahibul Maal) menerima 78,33% dan
 * platform 21,67% sebagai ujrah pengelola. Angka ini TIDAK lagi dibaca dari
 * konfigurasi: porsi platform dihitung dengan pembagian bilangan bulat 13/60,
 * sehingga sisa pecahan rupiah selalu kembali ke pendana dan tidak ada rupiah
 * yang hilang atau diciptakan.
 *
 * Biaya layanan atau biaya admin platform adalah pos terpisah dan tidak diambil
 * dari angka ini.
 *
 * File ini murni: tanpa React, tanpa Convex, dan seluruh nilainya rupiah bulat.
 */
import { bagiMargin } from "../kebijakanPinjaman";
import type { Rupiah } from "../money";

/** Porsi pendana (Shahibul Maal) atas margin/ujrah, dalam persen. */
export const NISBAH_PENDANA_PERSEN = (47 / 60) * 100;

/** Porsi platform (ujrah pengelola) atas margin/ujrah, dalam persen. */
export const NISBAH_PLATFORM_PERSEN = (13 / 60) * 100;

export type BagiNisbah = {
  /** Bagian pendana; selalu menerima sisa pembulatan. */
  nisbahPendana: Rupiah;
  /** Bagian platform; dibulatkan ke bawah. */
  nisbahPlatform: Rupiah;
};

/** Pastikan nilai yang masuk memang rupiah bulat non-negatif. */
export function pastikanRupiah(nilai: number, label: string): void {
  if (!Number.isSafeInteger(nilai) || nilai < 0) {
    throw new Error(`${label} harus rupiah bulat non-negatif: ${nilai}`);
  }
}

/** Persentase bulat dari rupiah, dibulatkan KE BAWAH (tanpa floating point). */
export function floorPersen(nilai: Rupiah, persen: number): Rupiah {
  pastikanRupiah(nilai, "Nilai");
  if (!Number.isFinite(persen) || persen < 0 || persen > 100) {
    throw new Error(`Persentase harus di antara 0-100: ${persen}`);
  }
  const basisPoin = BigInt(Math.round(persen * 100));
  return Number((BigInt(nilai) * basisPoin) / 10_000n);
}

/**
 * Bagi satu nilai margin/ujrah menjadi hak pendana dan hak platform.
 *
 * Pembagian memakai rasio 47 : 13 (bukan persen desimal) supaya angkanya sama
 * dengan produk konvensional. Identitas: `nisbahPendana + nisbahPlatform = nilai`.
 */
export function bagiNisbah(nilai: Rupiah): BagiNisbah {
  pastikanRupiah(nilai, "Nilai bagi hasil");
  const { pendana, platform } = bagiMargin(nilai);
  return { nisbahPendana: pendana, nisbahPlatform: platform };
}
