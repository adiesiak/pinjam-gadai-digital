/**
 * KLAIM & LOGIN PEMINJAM LAMA — logika MURNI (tanpa Convex, React, atau DOM).
 *
 * Kenapa dipisah dari `convex/klaimPeminjam.ts`: aturan yang menentukan
 * "apakah berkas ini masih berjalan atau sudah lunas", "berapa berkas lama yang
 * berpindah", dan "seperti apa nomor ditampilkan" harus bisa diuji sebagai
 * skrip biasa (`bun src/lib/klaimLama.test.ts`) dan dipakai bersama server,
 * panel, dan formulir — bukan ditulis ulang tiga kali.
 *
 * Catatan privasi: nomor WhatsApp di layar SELALU ditopeng. Isi pesan OTP tidak
 * pernah memuat nama, NIK, atau nominal — hanya kode dan tujuan penggunaannya.
 */

/** Jendela pembatas laju permintaan kode klaim. */
export const KLAIM_JENDELA_MS = 60 * 60 * 1000;

/** Batas permintaan kode per nomor per jendela (nomor tidak boleh dibanjiri). */
export const KLAIM_MAKS_PER_NOMOR = 5;

/** Batas permintaan kode per IP per jendela (IP dikirim klien — lihat server). */
export const KLAIM_MAKS_PER_IP = 10;

/** Batas TOTAL percobaan verifikasi gagal per nomor per jendela. */
export const KLAIM_MAKS_GAGAL = 10;

/** Retensi baris tantangan klaim — cukup untuk audit & pembatas laju. */
export const KLAIM_RETENSI_MS = 24 * 60 * 60 * 1000;

/** Status kirim tantangan klaim (BUKAN status klaim). */
export const STATUS_KIRIM_KLAIM = ["menunggu", "terkirim", "gagal"] as const;
export type StatusKirimKlaim = (typeof STATUS_KIRIM_KLAIM)[number];

/**
 * Nomor untuk ditampilkan: `628123456789` → `62812•••••789`.
 *
 * Sengaja hanya membuka 5 digit depan dan 3 digit belakang: cukup bagi pemilik
 * nomor untuk mengenali nomornya sendiri, dan tidak cukup untuk
 * mengonfirmasi/menebak nomor orang lain dari layar.
 */
export function topengNomor(nomor: string | null | undefined): string {
  const digit = (nomor ?? "").replace(/\D/g, "");
  if (digit.length < 8) return digit === "" ? "" : "•••";
  return `${digit.slice(0, 5)}${"•".repeat(Math.max(3, digit.length - 8))}${digit.slice(-3)}`;
}

/**
 * Isi pesan WhatsApp untuk kode klaim. Satu-satunya rahasia di pesan ini adalah
 * kodenya sendiri; tidak ada nama, nomor pinjaman, atau nominal — pesan yang
 * bocor tidak mengungkap data nasabah.
 */
export function pesanOtpKlaim(kode: string): string {
  return (
    `Kode PINDAI untuk masuk & memulihkan data akun lama: ${kode}\n\n` +
    "Berlaku 5 menit dan hanya bisa dipakai sekali. " +
    "Jangan bagikan kode ini kepada siapa pun, termasuk yang mengaku petugas PINDAI."
  );
}

/**
 * Status pinjaman yang MASIH berjalan (belum tuntas). Dipakai untuk ringkasan
 * historis peminjam lama supaya jumlah "aktif" dan "lunas" tidak pernah
 * berbeda antara server dan layar.
 */
export function pinjamanMasihBerjalan(status: string): boolean {
  return status !== "lunas" && status !== "ditolak" && status !== "dibatalkan";
}

/** Status gadai yang masih berjalan (barang belum dilepas ke nasabah). */
export function gadaiMasihBerjalan(status: string): boolean {
  return status === "aktif" || status === "menunggu_pelepasan" || status === "disetujui";
}

/** Status kredit barang yang masih berjalan. */
export function kreditMasihBerjalan(status: string): boolean {
  return status === "didanai" || status === "disetujui";
}

/** Berkas lama yang ditemukan untuk sebuah nomor WhatsApp. */
export type BerkasLama = {
  /** Jumlah baris per produk. */
  pinjaman: number;
  gadai: number;
  kredit: number;
  /** Jumlah baris master nasabah (identitas) yang ikut berpindah. */
  masterNasabah: number;
  /** Total pokok pinjaman yang berpindah — rupiah bulat. */
  pokokPinjaman: number;
  /** Pinjaman yang masih berjalan / sudah lunas. */
  pinjamanAktif: number;
  pinjamanLunas: number;
  /** Jumlah akun berbeda yang mengaku pemilik nomor ini (deteksi ganda). */
  akunKandidat: number;
};

/** Berkas lama kosong — titik awal penghitungan. */
export const BERKAS_LAMA_KOSONG: BerkasLama = {
  pinjaman: 0,
  gadai: 0,
  kredit: 0,
  masterNasabah: 0,
  pokokPinjaman: 0,
  pinjamanAktif: 0,
  pinjamanLunas: 0,
  akunKandidat: 0,
};

/** Jumlah total berkas (tanpa menghitung master identitas). */
export function totalBerkas(berkas: BerkasLama): number {
  return berkas.pinjaman + berkas.gadai + berkas.kredit;
}

/**
 * Apakah nomor ini punya jejak data lama yang layak diklaim. Ambangnya satu
 * berkas produktif ATAU satu baris master identitas: master saja tetap berarti
 * (mis. nasabah lama yang pinjamannya sudah lama dihapus admin).
 */
export function adaDataLama(berkas: BerkasLama): boolean {
  return totalBerkas(berkas) > 0 || berkas.masterNasabah > 0;
}

/**
 * Kalimat ringkas untuk layar & audit: "2 pinjaman, 1 gadai, dan Rp3.500.000
 * pokok pinjaman" — dipakai apa adanya supaya angka di layar, di notifikasi,
 * dan di audit trail tidak pernah berbeda.
 */
export function kalimatBerkasLama(berkas: BerkasLama, rupiah: (nilai: number) => string): string {
  const bagian: string[] = [];
  if (berkas.pinjaman > 0) bagian.push(`${berkas.pinjaman} pinjaman`);
  if (berkas.gadai > 0) bagian.push(`${berkas.gadai} gadai`);
  if (berkas.kredit > 0) bagian.push(`${berkas.kredit} kredit barang`);
  if (bagian.length === 0) {
    return berkas.masterNasabah > 0
      ? "data identitas nasabah"
      : "belum ada berkas yang bisa dipulihkan";
  }
  const daftar =
    bagian.length === 1
      ? bagian[0]
      : `${bagian.slice(0, -1).join(", ")} dan ${bagian[bagian.length - 1]}`;
  if (berkas.pokokPinjaman > 0) {
    return `${daftar} dengan total pokok ${rupiah(berkas.pokokPinjaman)}`;
  }
  return daftar;
}

/** Alasan klaim ditolak karena data ganda — dipakai server dan formulir. */
export function pesanDataGanda(jumlahAkun: number): string {
  return (
    `Nomor ini tercatat pada ${jumlahAkun} akun berbeda, sehingga klaim otomatis ` +
    "dihentikan agar tidak ada data yang tergabung keliru. Hubungi admin PINDAI " +
    "untuk menggabungkan data lama Anda."
  );
}
