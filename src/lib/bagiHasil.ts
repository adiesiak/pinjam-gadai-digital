/**
 * Bagi hasil Imbal Hasil — potongan admin atas keuntungan penyedia dana.
 *
 * Kebijakan produk: dari Imbal Hasil (keuntungan) yang menjadi hak penyedia
 * dana, admin mengambil sekian persen. Persentasenya dibaca dari Pengaturan
 * Sistem (`persenAdmin`), bukan ditulis di kode, supaya kebijakan bisa berubah
 * tanpa menyentuh logika uang.
 *
 * Aturan pembulatan mengikuti filosofi PINDAI "pecahan tidak pernah masuk ke
 * kas": potongan admin dibulatkan KE BAWAH (floor), sehingga sisa rupiah selalu
 * menjadi milik penyedia dana. Dengan begitu `potongan + bersih = bruto` tepat,
 * tanpa rupiah yang hilang atau diciptakan.
 *
 * Semua nilai adalah rupiah bulat (integer) — tidak ada floating point.
 */
import type { Rupiah } from "./money";

/** Potongan admin bawaan bila Pengaturan Sistem belum diubah. */
export const POTONGAN_ADMIN_DEFAULT_PERSEN = 5;

export type BagiImbalHasil = {
  /** Bagian admin atas keuntungan ini (rupiah bulat, pembulatan ke bawah). */
  potonganAdmin: Rupiah;
  /** Hak penyedia dana setelah potongan (`bruto − potongan`). */
  imbalBersih: Rupiah;
};

/**
 * Hitung potongan admin atas satu Imbal Hasil bruto.
 * Melempar bila masukan bukan rupiah bulat atau persentase di luar 0–100.
 */
export function bagiImbalHasil(
  imbalBruto: Rupiah,
  persenPotonganAdmin: number,
): BagiImbalHasil {
  if (!Number.isInteger(imbalBruto) || !Number.isSafeInteger(imbalBruto) || imbalBruto < 0) {
    throw new Error(`Imbal Hasil harus rupiah bulat non-negatif: ${imbalBruto}`);
  }
  if (
    !Number.isFinite(persenPotonganAdmin) ||
    persenPotonganAdmin < 0 ||
    persenPotonganAdmin > 100
  ) {
    throw new Error(
      `Persentase potongan admin harus di antara 0–100: ${persenPotonganAdmin}`,
    );
  }
  // Persen → basis poin (1% = 100 bp) supaya aritmetikanya bilangan bulat.
  const basisPoin = BigInt(Math.round(persenPotonganAdmin * 100));
  const potonganAdmin =
    basisPoin === 0n ? 0 : Number((BigInt(imbalBruto) * basisPoin) / 10_000n);
  return { potonganAdmin, imbalBersih: imbalBruto - potonganAdmin };
}
