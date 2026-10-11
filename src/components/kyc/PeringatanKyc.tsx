/**
 * Gerbang KYC di sisi UI.
 *
 * Server menolak pengajuan finansial bila modul KYC nasabah belum `VERIFIED`
 * (lihat `requireKycTerverifikasi` di `convex/kyc.ts`). Komponen ini hanya
 * MEMBERI TAHU sebabnya lebih dulu — sebelum nasabah mengisi formulir panjang
 * yang pasti akan ditolak — dan menyediakan jalan menuju tab Verifikasi KYC.
 *
 * Bukan pengaman: pengaman sesungguhnya ada di server. Karena itu ia sengaja
 * tidak menyembunyikan formulir, hanya menonaktifkan tombol kirim.
 */
import { ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

export function PeringatanKyc({ onBukaKyc }: { onBukaKyc?: () => void }) {
  return (
    <div
      role="status"
      className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900"
    >
      <p className="flex items-start gap-2 text-sm font-semibold leading-6">
        <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        KYC diperlukan sebelum pengajuan dapat dikirim.
      </p>
      <p className="mt-1 text-xs leading-5">
        Selesaikan verifikasi identitas Anda di tab Verifikasi KYC. Setelah statusnya
        <span className="font-medium"> VERIFIED</span>, tombol kirim pengajuan aktif kembali.
      </p>
      {onBukaKyc !== undefined && (
        <Button type="button" size="sm" variant="outline" className="mt-2" onClick={onBukaKyc}>
          Buka Verifikasi KYC
        </Button>
      )}
    </div>
  );
}
