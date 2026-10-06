/** Footer dashboard nasabah: ringkasan ketentuan layanan. */
export function DashboardFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 text-xs leading-5 text-muted-foreground sm:px-6">
        PINDAI — ledger pinjaman & gadai. Skema harian (7–30 hari) menghitung nilai bersih 98% (potongan di muka 2%) dan kewajiban 130%; skema bulanan (1–6 bulan) menghitung DP 0%, potongan di muka 2% (biaya admin; biaya platform dihapus) untuk semua tenor resmi, dan bunga flat dari pokok penuh 30% (tenor 1 bulan) / 25% (tenor 3 bulan) / 20% (tenor 6 bulan) per bulan. Angka dan status mengikuti pencatatan ledger internal PINDAI.
      </div>
    </footer>
  );
}
