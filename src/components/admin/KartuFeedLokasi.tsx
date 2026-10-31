import { namaHurufBesar } from "@/lib/nama";
import { formatUmurLokasi } from "@/lib/umurLokasi";

/**
 * Kartu nasabah pada umpan lokasi langsung (panel kanan halaman Peta lokasi).
 *
 * Dipisah dari `LiveLocationMap` — yang mengimpor Leaflet dan hanya bisa
 * berjalan di browser — supaya bagian tampilan murni ini bisa dirender & diuji
 * tanpa DOM (lihat `KartuFeedLokasi.render.test.tsx`).
 *
 * Dua informasi berbeda sengaja dipisah:
 *  - lencana geofence (Aman / Pola Ditandai / Di Luar Ambang Jarak) menjawab
 *    "apakah titiknya mencurigakan";
 *  - baris keaktifan (Langsung / Tidak aktif + umur) menjawab "apakah titiknya
 *    masih baru". Tanpa baris kedua, kartu berumur tiga hari terlihat sama
 *    hidupnya dengan kartu yang baru masuk semenit lalu.
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
  /**
   * Umur titik terkini dalam detik. `undefined` = pemanggil tidak mengirim
   * informasi umur, dan baris keaktifan tidak ditampilkan sama sekali.
   */
  umurDetik?: number | null;
  /** Titik perangkat yang masih dalam ambang kebijakan (bukan titik pengajuan). */
  langsung?: boolean;
  akurasi?: number | null;
  /** Ringkasan perangkat heartbeat, mis. "android · v1.3.1". */
  perangkat?: string | null;
};

/** Lencana status jarak: aman / pola ditandai / di luar ambang. */
function statusLokasi(r: {
  mismatch: boolean;
  tanda: readonly string[];
}): { label: string; kelas: string } {
  if (r.mismatch) return { label: "Di Luar Ambang Jarak", kelas: "bg-red-100 text-red-700" };
  if (r.tanda.length > 0) return { label: "Pola Ditandai", kelas: "bg-amber-100 text-amber-800" };
  return { label: "Aman", kelas: "border border-success-border bg-success-soft text-success-foreground" };
}

export function KartuFeedLokasi({
  r,
  onPilih,
}: {
  r: BarisFeedLokasi;
  onPilih: (userId: string) => void;
}) {
  const status = statusLokasi(r);
  const langsung = r.langsung === true;
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
      {r.umurDetik !== undefined && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              langsung
                ? "border border-success-border bg-success-soft text-success-foreground"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            <span
              className={langsung ? "badge-dot badge-dot--hidup" : "badge-dot bg-slate-400"}
              aria-hidden="true"
            />
            {langsung ? "Langsung" : "Tidak aktif"}
          </span>
          <span className="text-[11px] text-slate-500">
            {formatUmurLokasi(r.umurDetik)}
          </span>
          {r.akurasi !== null && r.akurasi !== undefined && (
            <span className="text-[11px] text-slate-400">
              GPS ±{Math.round(r.akurasi)} m
            </span>
          )}
          {r.perangkat !== null && r.perangkat !== undefined && (
            <span className="text-[11px] text-slate-400">{r.perangkat}</span>
          )}
        </div>
      )}
    </button>
  );
}
