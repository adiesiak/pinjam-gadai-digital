/** Footer ruang Pendana: ringkasan skema pendanaan + jaminan keamanan inti. */
export function PendanaFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 text-xs leading-5 text-muted-foreground sm:px-6">
        <p>
          PINDAI — Pendana menyediakan dana melalui skema Alokasi Dana dan menerima
          Imbal Hasil 30% dari pokok (skema harian 7–30 hari) atau bunga menurun
          10%/8%/7,5% per bulan (skema bulanan 1–6 bulan) sebagai hak finansialnya.
          Setiap pergerakan dana tercatat berpasangan di jurnal append-only.
        </p>
        <p className="mt-2">
          Keamanan dana Anda: jurnal keuangan append-only berpasangan, alokasi
          anti-ganda, OTP WhatsApp untuk setiap alokasi & penarikan, serta
          verifikasi lokasi peminjam (GPS wajib, anti-lokasi palsu) di sisi
          server. Imbal Hasil mengikuti kinerja pelunasan Peminjam dan bukan
          merupakan jaminan.
        </p>
      </div>
    </footer>
  );
}
