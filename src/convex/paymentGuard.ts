/**
 * Blokir mutasi keuangan yang belum punya jalur settlement terverifikasi.
 *
 * Setoran dan penarikan manual punya jalur admin sendiri (pencocokan mutasi dan
 * bukti transfer keluar). Gerbang ini tetap menutup alokasi, pencairan,
 * pembayaran, dan gadai sampai penyedia pembayaran serta proses settlement/
 * payout terintegrasi dan diuji. Runtime selalu gagal tertutup.
 */
export function rejectUnverifiedMoneyMovement(): void {
  throw new Error(
    "Transaksi ditutup: penyedia pembayaran belum dipilih atau terintegrasi, dan belum ada settlement/payout terverifikasi. Persetujuan admin saja bukan bukti perpindahan dana; ledger dan status transaksi tidak diubah.",
  );
}
