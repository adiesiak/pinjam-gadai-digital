/** Konfigurasi sistem PINDAI — tipe + default bersama (server & client). */
import { LOKASI_RETENSI } from "./lokasi";
import { PLAFON_DEFAULT } from "./plafon";
import type { Id } from "../convex/_generated/dataModel";

/**
 * Rentang retensi jejak lokasi yang boleh disimpan admin (hari). Batas bawah
 * mencegah penghapusan agresif yang menghilangkan bukti audit yang masih segar;
 * batas atas menjaga penyimpanan tetap wajar.
 */
export const RETENSI_LOKASI_BATAS = { min: 7, maks: 730 } as const;

export const THEME_PRESETS = ["tinta", "pesisir", "terakota"] as const;
export type ThemePreset = (typeof THEME_PRESETS)[number];

export type SystemConfig = {
  tema: ThemePreset;
  killSwitch: boolean;
  maintenanceMode: boolean;
  persenAdmin: number;
  persenPlatform: number;
  persenBunga: number;
  maxLtvPersen: number;
  sessionTimeoutMenit: number;
  vaultLat: number;
  vaultLng: number;
  gpsMismatchKm: number;
  pencairanMaxKm: number;
  /** Gerbang lokasi wajib: Peminjam tidak bisa bertransaksi tanpa GPS aktif. */
  lokasiWajib: boolean;
  /** Umur maksimum titik lokasi yang masih dianggap segar (menit). */
  lokasiMaxUmurMenit: number;
  /** Wajib transaksi dari aplikasi native — aktifkan setelah app dirilis. */
  wajibAplikasiNative: boolean;
  /**
   * Retensi jejak lokasi (hari) — job cron harian menghapus titik yang lebih
   * tua dari ini. Titik milik pinjaman belum selesai selalu ditahan minimal
   * LOKASI_RETENSI.buktiPinjamanHari (400 hari), berapa pun nilai di sini.
   */
  retensiLokasiHari: number;
  /**
   * Plafon awal pinjaman tunai semua Peminjam (rupiah bulat) — setiap pinjaman
   * pokok minimal Rp1 juta yang lunas penuh paling lambat saat jatuh tempo
   * menaikkan plafon dasar Rp1 juta, maksimal Rp10 juta. Kredit barang punya batas terpisah.
   */
  plafonPinjaman: number;
  rekeningUsahaNama: string;
  rekeningUsahaBank: string;
  rekeningUsahaNomor: string;
  qrisMerchantNama: string;
  qrisImageId: Id<"_storage"> | null;
  manualDepositEnabled: boolean;
};

export const DEFAULT_CONFIG: SystemConfig = {
  tema: "tinta",
  killSwitch: false,
  maintenanceMode: false,
  persenAdmin: 2,
  persenPlatform: 3,
  persenBunga: 30,
  maxLtvPersen: 70,
  sessionTimeoutMenit: 30,
  vaultLat: -6.249511,
  vaultLng: 106.830711,
  gpsMismatchKm: 50,
  pencairanMaxKm: 75,
  lokasiWajib: true,
  lokasiMaxUmurMenit: 10,
  wajibAplikasiNative: false,
  retensiLokasiHari: LOKASI_RETENSI.jejakHari,
  plafonPinjaman: PLAFON_DEFAULT,
  rekeningUsahaNama: "Chatur Surya Carel Ramadhan",
  rekeningUsahaBank: "BNI",
  rekeningUsahaNomor: "1324167013",
  qrisMerchantNama: "Toko koedoes",
  qrisImageId: null,
  manualDepositEnabled: false,
};
