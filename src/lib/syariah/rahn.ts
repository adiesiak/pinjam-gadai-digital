/**
 * Akad RAHN (gadai syariah) dengan ujrah pemeliharaan barang.
 *
 * Aturan produk:
 *  - Pokok gadai kembali 100% ke pendana saat pelunasan. Tidak ada bunga.
 *  - Ujrah pemeliharaan (sewa tempat) = 2% dari NILAI TAKSIRAN per 30 hari.
 *    Tenor dihitung dalam blok 30 hari (30, 60, 90), sama seperti tenor
 *    pendanaan, sehingga tidak ada pecahan hari yang harus ditafsirkan.
 *  - Ujrah dibagi dengan nisbah 92:8; 92% untuk pendana yang menyediakan dana
 *    jaminan, 8% untuk platform, dan sisa pembulatan ke pendana. Porsi itu bisa
 *    diubah admin; parameter `persenPlatform` yang menentukan.
 *
 * Identitas yang selalu berlaku:
 *   `pendanaTerima + platformTerima = totalKewajiban`
 *   `pendanaTerima = pokokGadai + nisbahPendana`
 * Semua nilai rupiah bulat.
 */
import type { Rupiah } from "../money";
import {
  bagiNisbah,
  floorPersen,
  NISBAH_PLATFORM_PERSEN,
  pastikanRupiah,
} from "./nisbah";

/** Ujrah pemeliharaan per 30 hari, dalam persen dari nilai taksiran. */
export const UJRAH_RAHN_PERSEN_PER_30_HARI = 2;

/** Satu siklus ujrah Rahn, dalam hari. */
export const SIKLUS_UJRAH_RAHN_HARI = 30;

export type BagiHasilRahn = {
  /** Nilai taksiran barang jaminan. */
  nilaiTaksiran: Rupiah;
  /** Dana yang diserahkan ke peminjam, tidak boleh melebihi taksiran. */
  pokokGadai: Rupiah;
  tenorHari: number;
  /** Banyak blok 30 hari dalam tenor. */
  jumlahSiklus: number;
  /** Ujrah satu blok 30 hari (2% taksiran, dibulatkan ke bawah). */
  ujrahPerSiklus: Rupiah;
  /** Ujrah seluruh tenor. */
  ujrahTotal: Rupiah;
  nisbahPendana: Rupiah;
  nisbahPlatform: Rupiah;
  /** Pokok gadai + nisbah ujrah pendana. */
  pendanaTerima: Rupiah;
  /** Bagian platform dari ujrah. */
  platformTerima: Rupiah;
  /** Pokok + seluruh ujrah yang dibayar peminjam. */
  totalKewajiban: Rupiah;
  persenPendana: number;
  persenPlatform: number;
  persenUjrahPer30Hari: number;
};

/**
 * Hitung pembagian akad Rahn.
 *
 * `tenorHari` wajib kelipatan 30. Nilai taksiran harus menutup pokok gadai;
 * gadai tidak boleh membiayai lebih dari nilai barang yang dijaminkan.
 */
export function bagiHasilRahn({
  nilaiTaksiran,
  pokokGadai,
  tenorHari = SIKLUS_UJRAH_RAHN_HARI,
  persenPlatform = NISBAH_PLATFORM_PERSEN,
}: {
  nilaiTaksiran: Rupiah;
  pokokGadai: Rupiah;
  tenorHari?: number;
  persenPlatform?: number;
}): BagiHasilRahn {
  pastikanRupiah(nilaiTaksiran, "Nilai taksiran");
  pastikanRupiah(pokokGadai, "Pokok gadai");
  if (nilaiTaksiran <= 0) {
    throw new Error(`Nilai taksiran harus lebih dari nol: ${nilaiTaksiran}`);
  }
  if (pokokGadai <= 0) {
    throw new Error(`Pokok gadai harus lebih dari nol: ${pokokGadai}`);
  }
  if (pokokGadai > nilaiTaksiran) {
    throw new Error(
      `Pokok gadai tidak boleh melebihi nilai taksiran: ${pokokGadai} > ${nilaiTaksiran}`,
    );
  }
  if (!Number.isSafeInteger(tenorHari) || tenorHari <= 0) {
    throw new Error(`Tenor Rahn harus jumlah hari bulat positif: ${tenorHari}`);
  }
  if (tenorHari % SIKLUS_UJRAH_RAHN_HARI !== 0) {
    throw new Error(
      `Tenor Rahn harus kelipatan ${SIKLUS_UJRAH_RAHN_HARI} hari: ${tenorHari}`,
    );
  }

  const jumlahSiklus = tenorHari / SIKLUS_UJRAH_RAHN_HARI;
  const ujrahPerSiklus = floorPersen(
    nilaiTaksiran,
    UJRAH_RAHN_PERSEN_PER_30_HARI,
  );
  const ujrahTotal = ujrahPerSiklus * jumlahSiklus;
  const { nisbahPendana, nisbahPlatform } = bagiNisbah(
    ujrahTotal,
    persenPlatform,
  );

  return {
    nilaiTaksiran,
    pokokGadai,
    tenorHari,
    jumlahSiklus,
    ujrahPerSiklus,
    ujrahTotal,
    nisbahPendana,
    nisbahPlatform,
    pendanaTerima: pokokGadai + nisbahPendana,
    platformTerima: nisbahPlatform,
    totalKewajiban: pokokGadai + ujrahTotal,
    persenPendana: 100 - persenPlatform,
    persenPlatform,
    persenUjrahPer30Hari: UJRAH_RAHN_PERSEN_PER_30_HARI,
  };
}
