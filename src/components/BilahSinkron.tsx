import { CloudOffIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useStatusSinkron } from "@/hooks/use-status-sinkron";

/**
 * Bilah keadaan sambungan — satu-satunya indikator GLOBAL di PINDAI.
 *
 * Sengaja hanya dipakai untuk dua hal yang memang perlu diketahui seluruh
 * layar, dan keduanya jarang:
 *
 * 1. **Terputus** — sambungan ke server mati cukup lama. Ini penting: angka di
 *    layar masih yang terakhir diketahui, dan pengguna berhak tahu sebelum
 *    mengambil keputusan. Ada tombol muat ulang sebagai jalan keluar nyata.
 * 2. **Proses panjang** — mutasi/aksi milik pengguna berjalan lebih dari ~2,5
 *    detik (mis. penyimpanan besar). Bukan untuk pembacaan ulang query rutin.
 *
 * Karena itu pemuatan awal, penyegaran data biasa, dan pengiriman formulir yang
 * cepat TIDAK pernah memunculkan bilah ini — masing-masing punya umpan baliknya
 * sendiri (rangka, `IndikatorSibuk`, dan tombol sibuk). Tidak ada overlay yang
 * menutupi halaman dan tidak ada permintaan kecil yang menahan pengguna.
 *
 * Bilahnya tidak menangkap klik (`pointer-events-none`) kecuali tombolnya
 * sendiri, jadi tetap bisa bekerja sambil menunggu.
 */
export function BilahSinkron() {
  const { menyinkron, terputus } = useStatusSinkron();

  if (!terputus && !menyinkron) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center px-3 pt-2">
      <div
        role="status"
        aria-live="polite"
        className={`pointer-events-auto flex max-w-[calc(100vw-1.5rem)] items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-medium shadow-sm backdrop-blur ${
          terputus
            ? "border-amber-300 bg-amber-50/95 text-amber-900"
            : "border-slate-200 bg-white/95 text-slate-700"
        }`}
      >
        {terputus ? (
          <>
            <CloudOffIcon className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">
              Koneksi terputus — menampilkan data terakhir. Menyambung ulang otomatis…
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 shrink-0 rounded-full border-amber-300 bg-white px-2 text-[11px] text-amber-900 hover:bg-amber-50 hover:text-amber-900"
              onClick={() => window.location.reload()}
            >
              Muat ulang
            </Button>
          </>
        ) : (
          <>
            <Spinner className="size-3.5 shrink-0 text-slate-500" />
            <span className="truncate">Proses panjang sedang berjalan — jangan tutup halaman…</span>
          </>
        )}
      </div>
    </div>
  );
}
