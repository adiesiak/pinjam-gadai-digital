/**
 * Block financial mutations until a payment provider and a verifiable
 * settlement/payout process are selected, authorized, integrated, and tested.
 * The broad return type keeps existing mutation result types available to the
 * client while the runtime always fails closed here.
 */
export function rejectUnverifiedMoneyMovement(): void {
  throw new Error(
    "Transaksi ditutup: penyedia pembayaran belum dipilih atau terintegrasi, dan belum ada settlement/payout terverifikasi. Persetujuan admin saja bukan bukti perpindahan dana; ledger dan status transaksi tidak diubah.",
  );
}
