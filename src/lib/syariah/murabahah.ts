/**
 * Akad MURABAHAH (jual beli dengan margin yang disepakati).
 *
 * Rumus produk:
 *   Margin Keuntungan Total = Harga Jual Akhir - Harga Pokok Barang
 *   Margin yang boleh disepakati 15-20% dari harga pokok (bukan per bulan).
 *   Hak Pendana (Shahibul Maal) = Harga Pokok + 78,33% Margin
 *   Hak Platform (Ujrah Pengelola) = 21,67% Margin (13/60, pembulatan ke bawah)
 *   Porsi ini tetap dan sama dengan produk konvensional.
 *
 * Harga pokok kembali 100% ke pendana karena dialah yang membeli barang lebih
 * dulu. Identitas yang selalu berlaku:
 *   `pendanaTerima + platformTerima = hargaJual`
 * dan `marginTotal = pendanaNisbah + nisbahPlatform` dengan sisa pecahan ke
 * pendana. Semua nilai rupiah bulat.
 */
import type { Rupiah } from "../money";
import {
  PERSEN_PORSI_PENDANA,
  PERSEN_PORSI_PLATFORM,
} from "../kebijakanPinjaman";
import { bagiNisbah, floorPersen, pastikanRupiah } from "./nisbah";

/**
 * Rentang margin yang boleh disepakati: persen dari harga pokok untuk SELURUH
 * tenor, bukan persentase bulanan. Batas bawah menjaga imbal hasil pendana
 * tidak terlalu tipis; batas atas menjaga harga jual tetap masuk akal bagi
 * peminjam dibanding bunga pinjaman konvensional.
 */
export const MARGIN_MURABAHAH_MIN_PERSEN = 15;
export const MARGIN_MURABAHAH_MAX_PERSEN = 20;

export type BagiHasilMurabahah = {
  /** Harga pokok barang yang dibiayai pendana. */
  hargaPokok: Rupiah;
  /** Harga jual akhir yang dibayar peminjam. */
  hargaJual: Rupiah;
  /** Harga jual dikurangi harga pokok. */
  marginTotal: Rupiah;
  /** Porsi pendana atas margin, ditambah sisa pembulatan. */
  nisbahPendana: Rupiah;
  /** Porsi platform atas margin, dibulatkan ke bawah. */
  nisbahPlatform: Rupiah;
  /** Harga pokok + nisbah pendana: uang yang kembali ke pendana. */
  pendanaTerima: Rupiah;
  /** Bagian platform dari margin. */
  platformTerima: Rupiah;
  /** Porsi yang dipakai, agar rincian di layar tidak menulis ulang angkanya. */
  persenPendana: number;
  persenPlatform: number;
};

/**
 * Hitung pembagian akad murabahah dari harga pokok dan harga jual.
 * Melempar bila harga bukan rupiah bulat atau harga jual di bawah harga pokok.
 */
export function bagiHasilMurabahah({
  hargaPokok,
  hargaJual,
}: {
  hargaPokok: Rupiah;
  hargaJual: Rupiah;
}): BagiHasilMurabahah {
  pastikanRupiah(hargaPokok, "Harga pokok");
  pastikanRupiah(hargaJual, "Harga jual");
  if (hargaPokok <= 0) {
    throw new Error(`Harga pokok harus lebih dari nol: ${hargaPokok}`);
  }
  if (hargaJual < hargaPokok) {
    throw new Error(
      `Harga jual tidak boleh di bawah harga pokok: ${hargaJual} < ${hargaPokok}`,
    );
  }

  const marginTotal = hargaJual - hargaPokok;
  const { nisbahPendana, nisbahPlatform } = bagiNisbah(marginTotal);

  return {
    hargaPokok,
    hargaJual,
    marginTotal,
    nisbahPendana,
    nisbahPlatform,
    pendanaTerima: hargaPokok + nisbahPendana,
    platformTerima: nisbahPlatform,
    persenPendana: PERSEN_PORSI_PENDANA,
    persenPlatform: PERSEN_PORSI_PLATFORM,
  };
}

/**
 * Harga jual dari harga pokok dan margin total (persen dari harga pokok).
 * Margin dibulatkan ke bawah supaya peminjam tidak pernah membayar lebih dari
 * persentase yang disepakati.
 */
export function hargaJualMurabahah(
  hargaPokok: Rupiah,
  marginPersen: number,
): Rupiah {
  pastikanRupiah(hargaPokok, "Harga pokok");
  if (hargaPokok <= 0) {
    throw new Error(`Harga pokok harus lebih dari nol: ${hargaPokok}`);
  }
  return hargaPokok + floorPersen(hargaPokok, marginPersen);
}
