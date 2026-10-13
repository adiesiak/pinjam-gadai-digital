/** Footer dashboard nasabah: ringkasan ketentuan layanan. */
export function DashboardFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 text-xs leading-5 text-muted-foreground sm:px-6">
        <p className="font-medium text-slate-600">
          PINDAI · pencatatan pinjaman &amp; gadai.
        </p>
        {/* Daftar ringkas, bukan satu paragraf: tiap ketentuan berdiri sendiri
            sehingga tidak memenuhi beberapa layar ponsel dengan tembok teks. */}
        <ul className="mt-2 list-disc space-y-1 pl-4">
          <li>
            Harian (7–30 hari): nilai bersih 98% (potongan di muka 2%),
            kewajiban 130%.
          </li>
          <li>
            Bulanan (1–6 bulan): DP 0%, potongan di muka 2% (biaya admin; biaya
            platform dihapus).
          </li>
          <li>
            Bunga flat dari pokok penuh: 30% (tenor 1 bulan), 25% (tenor 3
            bulan), 20% (tenor 6 bulan) per bulan.
          </li>
          <li>Angka dan status mengikuti catatan PINDAI.</li>
        </ul>
      </div>
    </footer>
  );
}
