/**
 * Skema imbal hasil PENYEDIA DANA — tetap, terpisah dari skema nasabah.
 *
 * Keputusan produk: setiap pendanaan memakai tenor acuan 30 hari dan imbal
 * hasil 30% flat dari pokok yang didanai. Angkanya TIDAK mengikuti tenor,
 * bunga, perpanjangan, atau cicilan pokok di sisi peminjam. Karena itu hak
 * pendana bisa dicatat sekali saat alokasi dan tidak berubah ketika admin
 * mengubah kontrak nasabah.
 *
 * Rumus:
 *   Imbal Hasil     = pokok × 30%
 *   Total kembali   = pokok + Imbal Hasil (sebelum biaya platform)
 *
 * Biaya platform tetap dihitung terpisah oleh `bagiHasilPendana`, dari uang
 * yang kembali, supaya kebijakan biaya yang sudah berlaku tidak berubah diam-
 * diam. Yang fixed adalah HAK BRUTO pendana; angkanya tidak lagi diturunkan
 * dari bunga pinjaman nasabah.
 *
 * Semua nilai rupiah bulat; pembulatan imbal hasil ke bawah agar tidak ada
 * rupiah yang diciptakan.
 */
import { bagiImbalHasil } from "./bagiHasil";
import type { Rupiah } from "./money";

/** Tenor acuan pendana untuk semua portofolio. */
export const TENOR_PENDANA_HARI = 30;

/** Imbal hasil bruto pendana per siklus tenor, dalam persen. */
export const PERSEN_IMBAL_PENDANA = 30;

/** Label tenor yang dipakai tabel dan kalkulator. */
export const LABEL_TENOR_PENDANA = "30 Hari";

/** Label yield yang dipakai tabel dan kalkulator. */
export const LABEL_YIELD_PENDANA = "30% p.p.";

function validasiPokok(pokok: number): void {
  if (!Number.isInteger(pokok) || !Number.isSafeInteger(pokok) || pokok < 0) {
    throw new Error(`Pokok pendanaan harus rupiah bulat non-negatif: ${pokok}`);
  }
}

/** Imbal hasil bruto pendana: pokok × 30%, dibulatkan ke bawah. */
export function imbalPendana(pokok: number): Rupiah {
  validasiPokok(pokok);
  return Math.floor((pokok * PERSEN_IMBAL_PENDANA) / 100);
}

/** Total pengembalian bruto ke pendana: pokok + imbal hasil tetap. */
export function totalPengembalianPendana(pokok: number): Rupiah {
  return pokok + imbalPendana(pokok);
}

/**
 * Siklus hak pendana yang disimpan bersama setiap alokasi.
 *
 * Tiga angka ini sengaja dinamai seperti kontrak data: `periodDuration` dalam
 * hari, `expectedReturnRate` dalam persen, dan `lenderProfit` dalam rupiah.
 * Nilainya tidak pernah dibaca dari tenor atau bunga pinjaman nasabah.
 */
export type SiklusPendanaan = {
  periodDuration: number;
  expectedReturnRate: number;
  lenderProfit: Rupiah;
};

/** Siklus fixed untuk satu nominal pendanaan. */
export function siklusPendanaan(pokok: number): SiklusPendanaan {
  return {
    periodDuration: TENOR_PENDANA_HARI,
    expectedReturnRate: PERSEN_IMBAL_PENDANA,
    lenderProfit: imbalPendana(pokok),
  };
}

export type BagiHasilPendana = {
  /** Imbal hasil bruto tetap (pokok × 30%). */
  imbal: Rupiah;
  /** Pokok + imbal hasil, sebelum biaya platform. */
  total: Rupiah;
  /** Biaya platform dari uang yang kembali (kebijakan Pengaturan Sistem). */
  potonganAdmin: Rupiah;
  /** Uang yang benar-benar masuk dompet pendana. */
  diterima: Rupiah;
  /** Imbal hasil bersih setelah biaya platform. */
  keuntungan: Rupiah;
};

/**
 * Bagi hasil pendana dengan hak bruto TETAP.
 *
 * `potonganAdmin` memakai kebijakan biaya platform yang sama dengan seluruh
 * aplikasi; yang berbeda hanya dasar hak pendana, yang kini tidak lagi dibaca
 * dari tenor atau bunga pinjaman nasabah.
 */
export function bagiHasilPendana(
  pokok: number,
  persenPotonganAdmin: number,
): BagiHasilPendana {
  const imbal = imbalPendana(pokok);
  const total = pokok + imbal;
  const { potonganAdmin, imbalBersih } = bagiImbalHasil(total, persenPotonganAdmin);
  return {
    imbal,
    total,
    potonganAdmin,
    diterima: imbalBersih,
    keuntungan: imbalBersih - pokok,
  };
}

/** Status pendanaan yang dibaca pendana di tabel portofolio. */
export type StatusPendanaan = "Aktif" | "Berjalan" | "Selesai" | "Cair";

/**
 * Terjemahkan status alokasi + status pinjaman menjadi satu label pendanaan.
 *
 * "Aktif"   = alokasi sudah tercatat, pinjaman belum berjalan.
 * "Berjalan"= dana sudah cair ke peminjam.
 * "Selesai" = pinjaman lunas atau alokasi selesai.
 * "Cair"    = alokasi dibatalkan dan dana kembali ke dompet pendana.
 */
export function statusPendanaan(
  statusAlokasi: string,
  statusPinjaman: string,
): StatusPendanaan {
  if (statusAlokasi === "dibatalkan") return "Cair";
  if (statusAlokasi === "selesai" || statusPinjaman === "lunas") return "Selesai";
  if (statusPinjaman === "didanai") return "Berjalan";
  return "Aktif";
}
