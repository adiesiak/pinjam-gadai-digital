import { namaHurufBesar } from "@/lib/nama";

/**
 * Kartu nasabah pada "Live Geofence Feed" (panel kanan halaman Peta Live
 * Location).
 *
 * Dipisah dari `LiveLocationMap` — yang mengimpor Leaflet dan hanya bisa
 * berjalan di browser — supaya bagian tampilan murni ini bisa dirender & diuji
 * tanpa DOM (lihat `KartuFeedLokasi.render.test.tsx`).
 *
 * Tata letak: kartu mandiri berkolom flex, TANPA `position: absolute` maupun
 * margin negatif, sehingga nama, kode referensi, dan jarak menumpuk rapi dan
 * tidak pernah saling menimpa di lebar panel yang sempit.
 */

/** Bentuk minimal baris feed yang dibaca kartu. */
export type BarisFeedLokasi = {
  userId: string;
  namaLengkap: string;
  nomorReferensi: string;
  jarakVaultKm: number | null;
  mismatch: boolean;
  tanda: readonly string[];
};

/** Lencana status jarak: aman / pola ditandai / di luar ambang. */
function statusLokasi(r: {
  mismatch: boolean;
  tanda: readonly string[];
}): { label: string; kelas: string } {
  if (r.mismatch) return { label: "Di Luar Ambang Jarak", kelas: "bg-red-100 text-red-700" };
  if (r.tanda.length > 0) return { label: "Pola Ditandai", kelas: "bg-amber-100 text-amber-800" };
  return { label: "Aman", kelas: "bg-emerald-100 text-emerald-800" };
}

export function KartuFeedLokasi({
  r,
  onPilih,
}: {
  r: BarisFeedLokasi;
  onPilih: (userId: string) => void;
}) {
  const status = statusLokasi(r);
  return (
    <button
      type="button"
      onClick={() => onPilih(r.userId)}
      className="flex w-full cursor-pointer flex-col gap-1.5 rounded-xl border border-slate-200 bg-white p-3.5 text-left shadow-sm transition-all hover:bg-slate-50"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-bold text-slate-900">
          {namaHurufBesar(r.namaLengkap)}
        </span>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${status.kelas}`}
        >
          {status.label}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
        <span className="truncate">{r.nomorReferensi}</span>
        <span className="shrink-0 font-medium text-slate-700">
          {r.jarakVaultKm !== null
            ? `${r.jarakVaultKm.toFixed(1)} km dari titik acuan`
            : "jarak tidak diketahui"}
        </span>
      </div>
    </button>
  );
}
