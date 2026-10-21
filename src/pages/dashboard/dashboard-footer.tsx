/** Footer dashboard nasabah: ringkasan ketentuan layanan dan identitas entitas. */
import { HAK_CIPTA_PINDAI, NAMA_ENTITAS_PINDAI, PENAFIAN_PINDAI } from "@/lib/branding";

export function DashboardFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 text-xs leading-5 text-muted-foreground sm:px-6">
        <p className="font-medium text-slate-600">
          PINDAI · pencatatan pinjaman &amp; gadai · {NAMA_ENTITAS_PINDAI}
        </p>
        {/* Daftar ringkas, bukan satu paragraf: tiap ketentuan berdiri sendiri
            sehingga tidak memenuhi beberapa layar ponsel dengan tembok teks. */}
        <ul className="mt-2 list-disc space-y-1 pl-4">
          <li>
            Harian (7–28 hari): potongan di muka admin 2% + biaya ekspres
            Rp5.000–Rp10.000 bila Anda memilih cair ekspres, bunga flat 26–40%
            sesuai nominal dan tenor.
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
        <p className="mt-4 max-w-3xl border-t border-slate-100 pt-3 text-[11px] leading-5 text-slate-500">
          {PENAFIAN_PINDAI}
        </p>
        <p className="mt-1 text-[11px] text-slate-500">{HAK_CIPTA_PINDAI}</p>
      </div>
    </footer>
  );
}
