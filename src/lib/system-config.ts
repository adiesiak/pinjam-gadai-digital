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
 * Rentang retensi isi pesan WhatsApp (hari).
 *
 * Log pesan adalah bukti pengiriman bila nasabah membantah pernah diberi tahu,
 * jadi batas bawahnya sebulan; batas atas lima tahun menjaga baris lama yang
 * isinya sudah tidak dibutuhkan tidak menumpuk selamanya.
 */
export const RETENSI_LOG_WA_BATAS = { min: 30, maks: 1825 } as const;

/**
 * Rentang retensi jejak audit (hari). Batas bawah tiga bulan supaya pemeriksaan
 * internal masih menemukan riwayatnya; batas atas sepuluh tahun.
 */
export const RETENSI_AUDIT_BATAS = { min: 90, maks: 3650 } as const;

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
  /**
   * Sakelar ketersediaan produk pengajuan. Mati berarti formulir produk itu
   * disembunyikan dan pengajuan baru ditolak server; pinjaman yang sudah
   * berjalan tidak berubah.
   */
  produkPinjamanAktif: boolean;
  produkKreditAktif: boolean;
  produkGadaiAktif: boolean;
  /** Field lama potongan admin; hanya dipakai jalur pelunasan baris warisan. */
  persenAdmin: number;
  /**
   * Field lama biaya platform. Tidak dibaca perhitungan baru: porsi platform
   * selalu 13/60 marjin. Dipertahankan agar snapshot konfigurasi lama terbaca.
   */
  persenPlatform: number;
  persenBunga: number;
  /**
   * Biaya admin pinjaman yang dipotong di muka (% dari pokok). Terpisah dari
   * `persenAdmin` (field lama, bukan lagi biaya yang berlaku).
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
   * Field lama konfigurasi nisbah syariah.
   *
   * Sejak kebijakan 47 : 13 disamakan untuk semua produk, angka ini TIDAK
   * dibaca lagi oleh perhitungan: porsi pendana selalu 78,33% dan platform
   * 21,67% dari margin/ujrah. Dipertahankan di tipe dan basis data supaya
   * snapshot konfigurasi lama tetap bisa dibaca dan di-rollback.
   */
  persenNisbahPendanaSyariah: number;
  /** Biaya asuransi yang dipotong di muka (% dari pokok); 0 = tidak dipotong. */
  persenAsuransi: number;
  /**
   * Tarif skema BULANAN (pinjaman tunai tenor 1/3/6/9/12 bulan dan kredit
   * barang). Dibaca mesin harga saat pengajuan baru dibuat, lalu DIBEKUKAN pada
   * pinjaman itu — perubahan di sini tidak pernah mengubah kontrak yang sudah
   * terbit.
   */
  persenBungaBulanan1: number;
  persenBungaBulanan3: number;
  persenBungaBulanan6: number;
  persenBungaBulanan9: number;
  persenBungaBulanan12: number;
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
   * Kirim laporan pelunasan (PDF, memuat catatan keuntungan pendana) ke
   * WhatsApp pendana OTOMATIS saat pinjaman menjadi lunas. Bawaan MATI:
   * laporan keuangan hanya berangkat saat admin memintanya. Nyalakan bila
   * laporan boleh dikirim sendiri oleh sistem.
   */
  laporanPelunasanOtomatis: boolean;
  /**
   * Retensi jejak lokasi (hari) — job cron harian menghapus titik yang lebih
   * tua dari ini. Titik milik pinjaman belum selesai selalu ditahan minimal
   * LOKASI_RETENSI.buktiPinjamanHari (400 hari), berapa pun nilai di sini.
   */
  retensiLokasiHari: number;
  /**
   * Retensi isi pesan WhatsApp (hari) — job cron harian menghapus baris
   * `waLogs` yang lebih tua dari ini. Isi pesan memuat nomor tujuan dan teks
   * pesan yang benar-benar dikirim ke nasabah.
   */
  retensiLogWaHari: number;
  /**
   * Retensi jejak audit (hari) — job cron harian menghapus baris `auditLog`
   * yang lebih tua dari ini. Riwayat konfigurasi (`configRiwayat`) tidak ikut
   * dihapus: itu yang menjelaskan tarif mana yang berlaku pada satu tanggal.
   */
  retensiAuditHari: number;
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
    persenBungaBulanan9: cfg.persenBungaBulanan9,
    persenBungaBulanan12: cfg.persenBungaBulanan12,
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
  produkPinjamanAktif: true,
  produkKreditAktif: true,
  produkGadaiAktif: true,
  /**
   * Tarif potongan admin untuk baris LAMA yang belum punya snapshot siklus.
   *
   * Alokasi baru tidak memakai angka ini: porsi platform tetap 13/60 dari
   * marjin pinjaman dan disimpan saat alokasi. Nilai ini hanya dibaca jalur
   * pelunasan baris warisan (lib/bagiHasil.ts, repayLoan) dan dihitung dari
   * total kembali, bukan dari pokok. Pembulatan ke bawah: sisa milik pendana.
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
  persenBungaBulanan9: TARIF_BULANAN_DEFAULT.persenBungaBulanan9,
  persenBungaBulanan12: TARIF_BULANAN_DEFAULT.persenBungaBulanan12,
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
  laporanPelunasanOtomatis: false,
  retensiLokasiHari: LOKASI_RETENSI.jejakHari,
  retensiLogWaHari: 180,
  retensiAuditHari: 730,
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
