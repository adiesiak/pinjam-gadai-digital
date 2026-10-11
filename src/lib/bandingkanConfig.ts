/**
 * Bandingkan dua snapshot konfigurasi sistem — logika MURNI (tanpa React,
 * Convex, DOM) supaya riwayat perubahan bisa diuji sebagai skrip biasa.
 *
 * Kenapa berkas ini ada: panel konfigurasi sebelumnya hanya menulis "Konfigurasi
 * sistem diperbarui" ke audit trail. Itu tidak menjawab pertanyaan yang paling
 * sering muncul saat ada angka aneh: **"siapa mengubah apa, dari nilai berapa ke
 * berapa?"** Fungsi di sini menghasilkan daftar itu, dan hanya itu — ia tidak
 * menyentuh basis data, jadi daftar yang dilihat admin berasal dari hitungan
 * yang sama dengan yang dipakai untuk menyimpan riwayat.
 */

/** Satu kunci yang nilainya berbeda antara dua snapshot. */
export type PerubahanConfig = {
  kunci: string;
  lama: unknown;
  baru: unknown;
};

/** Label Bahasa Indonesia untuk setiap kunci konfigurasi yang dikenal. */
export const LABEL_CONFIG: Record<string, string> = {
  tema: "Tema visual",
  killSwitch: "Kill switch",
  maintenanceMode: "Mode perawatan",
  persenAdmin: "Persentase biaya admin (%)",
  persenPlatform: "Persentase biaya platform (%)",
  persenBunga: "Persentase bunga (%)",
  persenBiayaIntegrasi: "Biaya integrasi pinjaman lama (%)",
  maxLtvPersen: "LTV maksimum gadai (%)",
  sessionTimeoutMenit: "Timeout sesi admin (menit)",
  vaultLat: "Latitude vault",
  vaultLng: "Longitude vault",
  gpsMismatchKm: "Radius mismatch GPS (km)",
  pencairanMaxKm: "Jarak maks pencairan (km)",
  lokasiWajib: "Gerbang lokasi wajib",
  lokasiMaxUmurMenit: "Umur maks titik lokasi (menit)",
  wajibAplikasiNative: "Wajib aplikasi native",
  retensiLokasiHari: "Retensi jejak lokasi (hari)",
  plafonPinjaman: "Plafon awal pinjaman (Rp)",
  rekeningUsahaNama: "Nama rekening usaha",
  rekeningUsahaBank: "Bank rekening usaha",
  rekeningUsahaNomor: "Nomor rekening usaha",
  qrisMerchantNama: "Nama merchant QRIS",
  qrisImageId: "Gambar QRIS",
  manualDepositEnabled: "Setoran manual aktif",
};

/** Label tampil satu kunci; kunci tak dikenal dikembalikan apa adanya. */
export function labelConfig(kunci: string): string {
  return LABEL_CONFIG[kunci] ?? kunci;
}

function samakah(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Daftar perubahan dari `sebelum` ke `sesudah`, diurut berdasarkan kunci supaya
 * tampilannya stabil (tidak bergantung urutan penyimpanan objek).
 */
export function bandingkanConfig(
  sebelum: Record<string, unknown>,
  sesudah: Record<string, unknown>,
): PerubahanConfig[] {
  const kunci = Array.from(
    new Set([...Object.keys(sebelum), ...Object.keys(sesudah)]),
  ).sort();
  const hasil: PerubahanConfig[] = [];
  for (const k of kunci) {
    if (!samakah(sebelum[k], sesudah[k])) {
      hasil.push({ kunci: k, lama: sebelum[k], baru: sesudah[k] });
    }
  }
  return hasil;
}

/** Nilai untuk ditampilkan di UI — `null`/`undefined` menjadi "—". */
export function nilaiConfigTampil(nilai: unknown): string {
  if (nilai === null || nilai === undefined || nilai === "") return "—";
  if (typeof nilai === "boolean") return nilai ? "Aktif" : "Nonaktif";
  if (typeof nilai === "number") return String(nilai);
  return String(nilai);
}
