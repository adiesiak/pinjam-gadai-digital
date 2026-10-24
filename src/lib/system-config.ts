/** Konfigurasi sistem PINDAI — tipe + default bersama (server & client). */
import { TARIF_BULANAN_DEFAULT, type TarifBulanan } from "./bulanan";
import { LOKASI_RETENSI } from "./lokasi";
import { PLAFON_DEFAULT } from "./plafon";
import { NISBAH_PENDANA_PERSEN } from "./syariah/nisbah";
import { MARGIN_MURABAHAH_BAWAAN } from "./syariah/pengajuan";
import { gayaAman, type GayaPreset } from "./template-gaya";
import type { Id } from "../convex/_generated/dataModel";

/**
 * Rentang retensi jejak lokasi yang boleh disimpan admin (hari). Batas bawah
 * mencegah penghapusan agresif yang menghilangkan bukti audit yang masih segar;
 * batas atas menjaga penyimpanan tetap wajar.
 */
export const RETENSI_LOKASI_BATAS = { min: 7, maks: 730 } as const;

/**
 * Rentang nisbah pendana yang boleh disimpan admin (persen). Sisanya menjadi
 * ujrah pengelola. Batas bawah menjaga platform tetap punya porsi; batas atas
 * menyisakan setidaknya satu persen untuk pengelola.
 */
export const NISBAH_PENDANA_BATAS = { min: 50, maks: 99 } as const;

export const THEME_PRESETS = [
  "tinta",
  "pesisir",
  "terakota",
  "salju",
  "karnival",
] as const;
export type ThemePreset = (typeof THEME_PRESETS)[number];

/**
 * Normalkan nilai tema dari penyimpanan ke preset yang benar-benar ada.
 *
 * Preset yang pernah tersedia lalu dicabut masih TERSIMPAN di dokumen lama.
 * Menghapusnya dari skema akan membuat konfigurasi itu gagal dibaca dan seluruh
 * panel admin ikut mati; jadi nilai asing tidak ditolak, melainkan dikembalikan
 * ke bawaan `tinta`. Akibatnya situs selalu tampil terang, dan penyimpanan
 * berikutnya sudah menulis nilai yang sah.
 */
export { gayaAman };
export type { GayaPreset };

export function temaAman(nilai: unknown): ThemePreset {
  return typeof nilai === "string" &&
    (THEME_PRESETS as readonly string[]).includes(nilai)
    ? (nilai as ThemePreset)
    : DEFAULT_CONFIG.tema;
}

/**
 * Konfigurasi tanpa nomor versi — bentuk yang diterima `system.saveConfig`.
 *
 * `versi` dimiliki SERVER: ia dinaikkan sendiri pada setiap simpan/rollback dan
 * dicatat di riwayat. Panel admin menyimpan seluruh `SystemConfig` di state
 * formulir, jadi nomor versi itu ikut terbawa saat objeknya di-spread dan
 * ditolak validator sebagai field tak dikenal. Dibuang di sini supaya pemanggil
 * tidak perlu ingat melakukannya sendiri.
 */
export function tanpaVersiConfig<T extends object>(config: T): Omit<T, "versi"> {
  return Object.fromEntries(
    Object.entries(config).filter(([kunci]) => kunci !== "versi"),
  ) as Omit<T, "versi">;
}

export type SystemConfig = {
  /**
   * Nomor versi konfigurasi yang BERLAKU sekarang. Naik satu setiap penyimpanan
   * atau rollback; riwayat lengkapnya ada di tabel `configRiwayat`. Dipakai UI
   * untuk menunjukkan "versi berapa yang sedang berlaku" dan sebagai titik
   * balik rollback.
   */
  versi: number;
  tema: ThemePreset;
  /**
   * Gaya tampilan situs — sumbu kedua template. `tema` hanya mengubah warna;
   * `gaya` mengubah tipografi judul, radius, garis, bayangan, dan pola hero.
   * Disimpan terpisah supaya admin bisa memasangkan palet apa pun dengan gaya
   * apa pun tanpa kartu template gabungan.
   */
  gaya: GayaPreset;
  /**
   * Efek musiman (salju/konfeti) dipisah dari palet: template `salju` dan
   * `karnival` membawa warnanya sendiri, tetapi efeknya hanya dipasang bila
   * sakelar ini aktif, dan hanya di rute publik.
   */
  efekMusiman: boolean;
  killSwitch: boolean;
  maintenanceMode: boolean;
  persenAdmin: number;
  persenPlatform: number;
  persenBunga: number;
  /**
   * Biaya admin pinjaman yang dipotong di muka (% dari pokok). Terpisah dari
   * `persenAdmin` (potongan dari pokok penempatan penyedia dana).
   * Nilai ini dipakai mesin harga untuk SEMUA pengajuan baru dan ikut
   * ditampilkan di landing page.
   */
  persenBiayaAdmin: number;
  /**
   * Margin Murabahah untuk SEMUA produk syariah — barang fisik maupun
   * pulsa/PPOB, sekali dari harga pokok untuk seluruh tenor (bukan per bulan).
   * Dibaca saat pengajuan baru dibuat, lalu DIBEKUKAN pada pengajuan itu:
   * perubahan di sini tidak menggeser harga yang sudah diajukan atau akad yang
   * sudah tercatat.
   */
  persenMarginSyariah: number;
  /**
   * Porsi pendana atas margin/ujrah akad syariah, dalam persen; sisanya menjadi
   * ujrah pengelola. Dibaca saat pengajuan baru dibuat dan saat akad dicatat.
   */
  persenNisbahPendanaSyariah: number;
  /** Biaya asuransi yang dipotong di muka (% dari pokok); 0 = tidak dipotong. */
  persenAsuransi: number;
  /**
   * Tarif skema BULANAN (pinjaman tunai tenor 1/3/6 bulan dan kredit barang).
   * Dibaca mesin harga saat pengajuan baru dibuat, lalu DIBEKUKAN pada pinjaman
   * itu — perubahan di sini tidak pernah mengubah kontrak yang sudah terbit.
   */
  persenBungaBulanan1: number;
  persenBungaBulanan3: number;
  persenBungaBulanan6: number;
  persenBiayaLayananBulanan: number;
  persenBiayaAdminCicilanBulanan: number;
  /** Nominal biaya pencairan ekspres per tier pokok (Rupiah). */
  biayaEkspresTier1: number;
  biayaEkspresTier2: number;
  biayaEkspresTier3: number;
  /**
   * Denda keterlambatan per hari, dalam persen dari pokok pinjaman. Dipakai
   * `lib/loan` untuk menghitung kewajiban terlambat; totalnya tetap dibatasi
   * 100% dari pokok (lihat `LATE_FEE_POLICY.maxPercent`). Nilai 0 mematikan
   * denda tanpa mengubah tenor atau bunga.
   */
  persenDendaKeterlambatan: number;
  /**
   * Persentase biaya admin & platform yang diakui saat integrasi pinjaman
   * lama ke ledger internal (panel Ledger admin). Bukan biaya pinjaman baru —
   * hanya dipakai untuk membukukan pinjaman warisan yang belum tercatat.
   */
  persenBiayaIntegrasi: number;
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
   * Pengingat tagihan otomatis lewat WhatsApp untuk SEMUA akun. Sakelar global
   * milik admin — bukan pilihan per nasabah. Kode OTP dan peringatan keamanan
   * tidak ikut dimatikan karena keduanya bukan pengingat tagihan.
   */
  notifWhatsappAktif: boolean;
  /**
   * Pengingat tagihan otomatis lewat email akun nasabah untuk SEMUA akun.
   * Tanpa alamat email, kanal ini tidak mengirim apa pun.
   */
  notifEmailAktif: boolean;
  /**
   * Retensi jejak lokasi (hari) — job cron harian menghapus titik yang lebih
   * tua dari ini. Titik milik pinjaman belum selesai selalu ditahan minimal
   * LOKASI_RETENSI.buktiPinjamanHari (400 hari), berapa pun nilai di sini.
   */
  retensiLokasiHari: number;
  /**
   * Plafon awal pinjaman tunai semua Peminjam (rupiah bulat) — nasabah baru
   * dibatasi Rp500.000, lalu satu pelunasan tepat waktu membuka Rp1.000.000.
   * Kredit barang punya batas terpisah.
   */
  plafonPinjaman: number;
  rekeningUsahaNama: string;
  rekeningUsahaBank: string;
  rekeningUsahaNomor: string;
  /** Nama badan yang tercetak di surat resmi (somasi). */
  namaBadan: string;
  /** Alamat badan; kosong berarti tidak dicetak. */
  alamatUsaha: string;
  /** Email resmi untuk tanggapan; kosong berarti tidak dicetak. */
  emailResmi: string;
  /** Telepon resmi untuk tanggapan; kosong berarti tidak dicetak. */
  teleponResmi: string;
  qrisMerchantNama: string;
  qrisImageId: Id<"_storage"> | null;
  manualDepositEnabled: boolean;
};

/** Tarif bulanan yang berlaku dari satu konfigurasi — bentuk siap pakai mesin. */
export function tarifBulananDariConfig(cfg: SystemConfig): TarifBulanan {
  return {
    persenBungaBulanan1: cfg.persenBungaBulanan1,
    persenBungaBulanan3: cfg.persenBungaBulanan3,
    persenBungaBulanan6: cfg.persenBungaBulanan6,
    persenBiayaLayananBulanan: cfg.persenBiayaLayananBulanan,
    persenBiayaAdminCicilanBulanan: cfg.persenBiayaAdminCicilanBulanan,
  };
}

export const DEFAULT_CONFIG: SystemConfig = {
  versi: 1,
  tema: "tinta",
  gaya: "lembaga",
  efekMusiman: false,
  killSwitch: false,
  maintenanceMode: false,
  /**
   * Potongan admin dari POKOK penempatan penyedia dana. Contoh pokok
   * Rp1.000.000 @30%: uang yang kembali Rp1.300.000 → potongan 5% = Rp50.000,
   * penyedia dana menerima Rp1.250.000.
   * Dibaca saat pelunasan pinjaman — lihat lib/bagiHasil.ts dan repayLoan di
   * convex/loans.ts. Pembulatan selalu ke bawah: sisa rupiah milik penyedia dana.
   */
  persenAdmin: 5,
  persenPlatform: 3,
  persenBunga: 30,
  /** Bawaan sama dengan harga yang berlaku sebelum bisa diatur admin. */
  persenBiayaAdmin: 2,
  persenMarginSyariah: MARGIN_MURABAHAH_BAWAAN,
  persenNisbahPendanaSyariah: NISBAH_PENDANA_PERSEN,
  /** Asuransi mati secara bawaan; admin menyalakannya bila produk memakainya. */
  persenAsuransi: 0,
  biayaEkspresTier1: 5_000,
  biayaEkspresTier2: 7_500,
  biayaEkspresTier3: 10_000,
  persenDendaKeterlambatan: 2,
  // Tarif bulanan bawaan = angka yang sudah dipakai mesin sebelum bisa diatur.
  persenBungaBulanan1: TARIF_BULANAN_DEFAULT.persenBungaBulanan1,
  persenBungaBulanan3: TARIF_BULANAN_DEFAULT.persenBungaBulanan3,
  persenBungaBulanan6: TARIF_BULANAN_DEFAULT.persenBungaBulanan6,
  persenBiayaLayananBulanan: TARIF_BULANAN_DEFAULT.persenBiayaLayananBulanan,
  persenBiayaAdminCicilanBulanan:
    TARIF_BULANAN_DEFAULT.persenBiayaAdminCicilanBulanan,
  /** Biaya integrasi default saat membukukan pinjaman lama ke ledger. */
  persenBiayaIntegrasi: 2,
  maxLtvPersen: 70,
  sessionTimeoutMenit: 30,
  vaultLat: -6.249511,
  vaultLng: 106.830711,
  gpsMismatchKm: 50,
  pencairanMaxKm: 75,
  lokasiWajib: true,
  lokasiMaxUmurMenit: 10,
  wajibAplikasiNative: false,
  notifWhatsappAktif: true,
  notifEmailAktif: true,
  retensiLokasiHari: LOKASI_RETENSI.jejakHari,
  plafonPinjaman: PLAFON_DEFAULT,
  rekeningUsahaNama: "Chatur Surya Carel Ramadhan",
  rekeningUsahaBank: "BNI",
  rekeningUsahaNomor: "1324167013",
  namaBadan: "PINDAI",
  alamatUsaha: "",
  emailResmi: "",
  teleponResmi: "",
  qrisMerchantNama: "Toko koedoes",
  qrisImageId: null,
  manualDepositEnabled: false,
};
