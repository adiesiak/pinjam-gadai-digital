/**
 * Kebijakan lokasi PINDAI — lokasi WAJIB aktif bagi Peminjam.
 *
 * Cara kerja gerbang ini: perangkat mengirim titik GPS berkala ke server
 * (heartbeat). Setiap aksi finansial — pengajuan pinjaman/gadai/kredit,
 * bayar cicilan, pelunasan — hanya dilayani bila titik terakhir masih segar.
 * Jadi mematikan GPS = tidak bisa bertransaksi, bukan sekadar peringatan.
 *
 * Batas platform (penting untuk tim, jangan diklaim lebih dari ini):
 *  - Browser TIDAK bisa mencegah pengguna mematikan tombol GPS di HP; yang
 *    bisa adalah memblokir transaksi (server, di sini) + menyetop UI.
 *  - Pelacakan saat tab/aplikasi ditutup tidak mungkin di web. Itu butuh
 *    aplikasi native (foreground service Android / Background Modes iOS),
 *    karena itu ada kebijakan `wajibAplikasiNative`.
 *  - Mencegah pengguna mematikan GPS sepenuhnya hanya bisa lewat perangkat
 *    terkelola (Android device owner/MDM) — di luar jangkauan aplikasi biasa.
 */
import { jarakKm } from "./geo";

export const LOKASI_KEBIJAKAN = {
  /** Titik terakhir dianggap segar selama ini (menit) — admin bisa ubah. */
  maxUmurMenit: 10,
  /** Akurasi maksimum titik yang diterima (meter). */
  maxAkurasiMeter: 1500,
  /** Interval heartbeat perangkat (detik). */
  intervalDetik: 60,
  /** Kecepatan antar titik yang masih wajar (km/jam) — deteksi lokasi palsu. */
  kecepatanMaksKmJam: 200,
  /** Toleransi jarak titik yang dikirim bersama pengajuan vs titik server (km). */
  toleransiJarakKm: 5,
} as const;

/** Bounding box Indonesia — titik di luar ini dianggap tidak sah. */
export const INDONESIA_BOUNDS = {
  latMin: -11.5,
  latMax: 6.5,
  lngMin: 94,
  lngMax: 141.5,
} as const;

/** Koordinat berada di wilayah Indonesia (termasuk laut teritorial). */
export function koordinatIndonesia(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= INDONESIA_BOUNDS.latMin &&
    lat <= INDONESIA_BOUNDS.latMax &&
    lng >= INDONESIA_BOUNDS.lngMin &&
    lng <= INDONESIA_BOUNDS.lngMax
  );
}

/**
 * Kecepatan rata-rata antar dua titik (km/jam). Dipakai server untuk menolak
 * lompatan mustahil — indikasi lokasi palsu atau perangkat di-root.
 */
export function kecepatanKmJam(
  a: { lat: number; lng: number; waktu: number },
  b: { lat: number; lng: number; waktu: number },
): number {
  const detik = Math.abs(b.waktu - a.waktu) / 1000;
  const km = jarakKm(a, b);
  if (detik < 1) return km > 1 ? Number.POSITIVE_INFINITY : 0;
  return (km / detik) * 3600;
}

/** Label umur titik lokasi untuk ditampilkan di UI. */
export function labelUmurLokasi(umurMenit: number): string {
  if (umurMenit <= 0) return "baru saja";
  if (umurMenit < 60) return `${umurMenit} menit lalu`;
  const jam = Math.floor(umurMenit / 60);
  return `${jam} jam lalu`;
}
