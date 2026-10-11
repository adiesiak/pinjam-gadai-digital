/**
 * Utilitas geolokasi: haversine (jarak antar koordinat) + label status
 * mismatch GPS Peminjam terhadap radius yang diizinkan.
 */

const R_BUMI_KM = 6371;

/** Jarak dua koordinat dalam kilometer (haversine). */
export function jarakKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R_BUMI_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Status mismatch GPS — dipakai kartu statistik & daftar DPD. */
export function statusGps(
  titik: { lat: number; lng: number } | null | undefined,
  vault: { lat: number; lng: number },
  maxKm: number,
): { mismatch: boolean; jarakKm: number } {
  if (!titik) return { mismatch: false, jarakKm: 0 };
  const jarak = jarakKm(titik, vault);
  return { mismatch: jarak > maxKm, jarakKm: jarak };
}

/**
 * Bulatkan koordinat ke presisi "wilayah" (≈1 km) untuk ruang yang dibaca oleh
 * pihak di luar tim PINDAI — ruang penyedia dana dan sesi kode akses bersama.
 *
 * 2 desimal derajat ≈ 1,1 km pada garis lintang: cukup untuk orientasi area di
 * peta, tetapi tidak lagi menunjuk satu rumah. Titik presisi penuh tetap dipakai
 * panel admin yang berwenang (lihat `presisiPenuh` di `convex/penyediaDana.ts`).
 *
 * Murni: tanpa React, Convex, atau DOM.
 */
export function bulatkanTitikWilayah<T extends { lat: number; lng: number }>(
  titik: T,
): T {
  return {
    ...titik,
    lat: Math.round(titik.lat * 100) / 100,
    lng: Math.round(titik.lng * 100) / 100,
  };
}

export const KATEGORI_BARANG = [
  "Elektronik",
  "Kendaraan",
  "Perhiasan",
  "Properti",
  "Lainnya",
] as const;
