/** Footer dashboard nasabah: ringkasan ketentuan layanan. */
export function DashboardFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 text-xs leading-5 text-muted-foreground sm:px-6">
        PINDAI — ledger simulasi pinjaman & gadai. Skema harian (7–30 hari) menghitung nilai bersih 95% dan kewajiban 130%; skema bulanan (1–6 bulan) menghitung DP 0%, biaya layanan 3% diamortisasi, dan bunga menurun 10%/8%/7,5% per bulan. Angka dan status hanya catatan internal: tidak ada transfer, Pendana atau dana terverifikasi, verifikasi identitas, maupun pemeriksaan lokasi/barang.
      </div>
    </footer>
  );
}
