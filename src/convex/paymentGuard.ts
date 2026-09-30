/**
 * Fail closed until real Xendit payment creation, authenticated callbacks,
 * and payout reconciliation are implemented and verified.
 */
export function rejectUnverifiedMoneyMovement(): never {
  throw new Error(
    "Transaksi ditutup: Xendit belum terintegrasi dan belum ada konfirmasi pembayaran atau payout yang terverifikasi. Tidak ada perubahan ledger atau status transaksi.",
  );
}
