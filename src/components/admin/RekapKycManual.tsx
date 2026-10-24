import { useQuery } from "convex/react";
import { UserCheck } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";

/**
 * REKAP PEKERJAAN MANUAL — satu baris pengawasan di kepala panel KYC.
 *
 * Jalur manual bisa memverifikasi nasabah tanpa pengajuan mandiri, jadi angka
 * "siapa mencatat berapa hari ini" harus terlihat tanpa membuka satu per satu.
 * Baris ini juga menyebut berapa baris manual yang belum punya foto KTP — angka
 * yang seharusnya nol; bila tidak nol, itu daftar kerja, bukan hiasan.
 *
 * Tidak ditampilkan sama sekali saat belum ada satu pun baris manual: panel
 * tidak boleh menampilkan angka nol yang tidak berarti apa-apa.
 */
export function RekapKycManual({ className }: { className?: string }) {
  const rekap = useQuery(api.kyc.rekapKycManualAdmin, {});

  if (rekap === undefined || rekap.totalManual === 0) return null;

  const petugas = rekap.hariIni.perPetugas
    .map((p) => `${p.label} ${p.jumlah}`)
    .join(" · ");

  return (
    <p
      className={cn(
        "flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] leading-4 text-slate-600",
        className,
      )}
    >
      <UserCheck className="size-3.5 shrink-0 text-slate-500" aria-hidden />
      <span className="tabular-nums">
        Verifikasi manual: {rekap.totalManual} nasabah
      </span>
      <span aria-hidden>·</span>
      <span className="tabular-nums">
        hari ini {rekap.hariIni.total}
        {petugas === "" ? "" : ` (${petugas})`}
      </span>
      {rekap.tujuhHari.total > 0 && (
        <>
          <span aria-hidden>·</span>
          <span className="tabular-nums">7 hari {rekap.tujuhHari.total} catatan</span>
        </>
      )}
      {rekap.tanpaFotoKtp > 0 && (
        <>
          <span aria-hidden>·</span>
          <span className="font-medium tabular-nums text-amber-800">
            {rekap.tanpaFotoKtp} tanpa foto KTP
          </span>
        </>
      )}
    </p>
  );
}
