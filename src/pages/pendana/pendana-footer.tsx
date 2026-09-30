/** Footer ruang Pendana: ringkasan skema pendanaan + jaminan keamanan inti. */
export function PendanaFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 text-xs leading-5 text-muted-foreground sm:px-6">
        <p>
          PINDAI Pendana adalah pencatatan pada ledger internal. Nominal alokasi, pokok, dan Imbal Hasil adalah hasil perhitungan/pencatatan aplikasi; bukan dana yang ditempatkan, bunga yang diterima, atau hasil investasi.
        </p>
        <p className="mt-2">
          Tidak ada integrasi pembayaran, transfer masuk/keluar, verifikasi saldo bank, KYC/identitas, GPS live, atau pembayaran Imbal Hasil. Status transaksi hanya menggambarkan catatan internal PINDAI.
        </p>
      </div>
    </footer>
  );
}
