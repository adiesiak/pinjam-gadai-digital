/**
 * Kalkulasi estimasi pencairan Pendana.
 * Nilai ini hanya pemodelan; tidak mengurangi saldo atau menjalankan transfer.
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
