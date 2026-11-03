/**
 * Kalkulasi biaya pencairan penyedia dana (5%).
 *
 * Dipakai untuk snapshot saat permintaan dibuat dan validasi saat admin
 * memproses transfer. Fungsi ini sendiri tidak menyentuh ledger atau bank.
 */
import { percentOf, type Rupiah } from "./money";

export const BIAYA_PENCAIRAN_PERSEN = 5;

export type WithdrawalBreakdown = {
  jumlahBruto: Rupiah;
  biayaPencairan: Rupiah;
  jumlahBersih: Rupiah;
};

export function hitungBiayaPencairan(jumlahBruto: Rupiah): WithdrawalBreakdown {
  if (!Number.isSafeInteger(jumlahBruto) || jumlahBruto < 0) {
    throw new Error("Jumlah pencairan harus rupiah bulat non-negatif.");
  }
  const biayaPencairan = percentOf(jumlahBruto, BIAYA_PENCAIRAN_PERSEN);
  return {
    jumlahBruto,
    biayaPencairan,
    jumlahBersih: jumlahBruto - biayaPencairan,
  };
}
