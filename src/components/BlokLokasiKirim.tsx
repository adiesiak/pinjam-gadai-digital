import { MapPin } from "lucide-react";

/** Titik GPS yang ikut terkirim bersama pengajuan. */
export type TitikLokasiKirim = {
  lat: number;
  lng: number;
  akurasi: number;
  /** Waktu titik diambil; kosong berarti titik lama tanpa cap waktu. */
  waktu?: number;
};

/** Jam WIB ringkas (mis. "17.13") untuk cap waktu titik. */
function jamWIB(ms: number): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ms));
}

/**
 * BARIS LOKASI DI POP-UP KONFIRMASI KIRIM.
 *
 * Titik GPS diambil ulang saat tombol Kirim ditekan, jadi yang tampil di sini
 * adalah titik terbaru yang benar-benar ikut terkirim, lengkap dengan jam
 * pengambilannya. Bila perangkat gagal memberi titik baru, titik terakhir yang
 * masih tersimpan dipakai — karena itu jamnya selalu ikut ditulis, supaya
 * pengguna tidak mengira angka lama diambil pada detik persetujuan. Kartunya
 * sengaja tidak duduk di badan formulir: di sana angkanya bisa basi dan tidak
 * dibaca pada saat memberi persetujuan.
 */
export function BlokLokasiKirim({ lokasi }: { lokasi: TitikLokasiKirim }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-5">
      <MapPin className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden="true" />
      <div className="min-w-0">
        <p className="font-medium text-slate-800">Lokasi yang ikut terkirim</p>
        <p className="tabular-nums text-slate-700">
          {lokasi.lat.toFixed(5)}, {lokasi.lng.toFixed(5)} · perkiraan ketelitian ±
          {Math.round(lokasi.akurasi)} meter
        </p>
        <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
          {lokasi.waktu === undefined
            ? "Tercatat dari perangkat ini dan ikut terkirim."
            : `Tercatat pukul ${jamWIB(lokasi.waktu)} WIB dari perangkat ini dan ikut terkirim.`}
        </p>
      </div>
    </div>
  );
}
