/**
 * Nisbah bagi hasil produk SYARIAH.
 *
 * Aturan produk: margin/ujrah dibagi 92% untuk Shahibul Maal (pendana) dan 8%
 * untuk platform sebagai ujrah pengelola. Angka ini bisa diubah admin lewat
 * konfigurasi sistem, jadi fungsi di bawah menerima porsi platform sebagai
 * parameter; bawaan di sini adalah angka yang berlaku sebelum diubah. Bagian
 * platform dihitung dengan pembulatan KE BAWAH, sehingga sisa pecahan rupiah
 * selalu kembali ke pendana. Tidak ada rupiah yang hilang atau diciptakan.
 *
 * File ini murni: tanpa React, tanpa Convex, dan seluruh nilainya rupiah bulat.
 */
import type { Rupiah } from "../money";

/** Porsi pendana (Shahibul Maal) atas margin/ujrah, dalam persen. */
export const NISBAH_PENDANA_PERSEN = 92;

/** Porsi platform (ujrah pengelola) atas margin/ujrah, dalam persen. */
export const NISBAH_PLATFORM_PERSEN = 8;

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
 * `persenPlatform` diisi dari konfigurasi sistem bila ada; tanpa itu dipakai
 * angka bawaan. Identitas: `nisbahPendana + nisbahPlatform = nilai`.
 */
export function bagiNisbah(
  nilai: Rupiah,
  persenPlatform: number = NISBAH_PLATFORM_PERSEN,
): BagiNisbah {
  pastikanRupiah(nilai, "Nilai bagi hasil");
  const nisbahPlatform = floorPersen(nilai, persenPlatform);
  return {
    nisbahPlatform,
    nisbahPendana: nilai - nisbahPlatform,
  };
}
