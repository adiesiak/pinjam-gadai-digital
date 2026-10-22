/**
 * Nisbah bagi hasil produk SYARIAH.
 *
 * Aturan produk: margin/ujrah dibagi 85% untuk Shahibul Maal (pendana) dan 15%
 * untuk platform sebagai ujrah pengelola. Bagian platform dihitung dengan
 * pembulatan KE BAWAH, sehingga sisa pecahan rupiah selalu kembali ke pendana.
 * Tidak ada rupiah yang hilang atau diciptakan.
 *
 * File ini murni: tanpa React, tanpa Convex, dan seluruh nilainya rupiah bulat.
 */
import type { Rupiah } from "../money";

/** Porsi pendana (Shahibul Maal) atas margin/ujrah, dalam persen. */
export const NISBAH_PENDANA_PERSEN = 85;

/** Porsi platform (ujrah pengelola) atas margin/ujrah, dalam persen. */
export const NISBAH_PLATFORM_PERSEN = 15;

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
 * Identitas: `nisbahPendana + nisbahPlatform = nilai`.
 */
export function bagiNisbah(nilai: Rupiah): BagiNisbah {
  pastikanRupiah(nilai, "Nilai bagi hasil");
  const nisbahPlatform = floorPersen(nilai, NISBAH_PLATFORM_PERSEN);
  return {
    nisbahPlatform,
    nisbahPendana: nilai - nisbahPlatform,
  };
}
