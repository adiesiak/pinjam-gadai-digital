/**
 * Kontrak backup KYC & pinjaman ke Google Drive.
 *
 * Ini BUKAN snapshot database penuh. Cakupannya sengaja dibatasi pada data
 * yang dibutuhkan untuk memulihkan identitas nasabah, pengajuan pinjaman,
 * pembayaran, dan pendanaannya. Tabel operasional lain (lokasi, audit, log WA)
 * tetap disimpan oleh backup platform dan ekspor manual.
 *
 * Daftar tabel dipakai server untuk menolak nama tabel lain, bukan hanya untuk
 * dokumentasi. Berkas KYC diunggah terpisah dan dienkripsi sebelum meninggalkan
 * Convex.
 */

export const TABEL_BACKUP_DRIVE = [
  "users",
  "nasabahProfil",
  "kycProfil",
  "kycRiwayat",
  "kycKeputusanOtomatis",
  "berkasTerverifikasi",
  "loans",
  "angsuran",
  "pawns",
  "pawnPayments",
  "gadaiTransfers",
  "kreditBarang",
  "kreditPayments",
  "pengajuanSyariah",
  "akadSyariah",
  "kontrakDigital",
  "manualPaymentReceipts",
  "fundings",
  "kreditFundings",
  "transferPendana",
  "siklusPendana",
] as const;

export type TabelBackupDrive = (typeof TABEL_BACKUP_DRIVE)[number];

/** Sumber baris yang memiliki dokumen KYC/foto jaminan di storage. */
export const SUMBER_DOKUMEN_BACKUP_DRIVE = [
  "kycProfil",
  "nasabahProfil",
  "loans",
  "pawns",
  "manualPaymentReceipts",
] as const;

export type SumberDokumenBackupDrive =
  (typeof SUMBER_DOKUMEN_BACKUP_DRIVE)[number];

export const NAMA_FOLDER_DRIVE_BAWAAN = "PINDAI Backup";

export function apakahTabelBackupDrive(
  nilai: string,
): nilai is TabelBackupDrive {
  return (TABEL_BACKUP_DRIVE as readonly string[]).includes(nilai);
}

export function apakahSumberDokumenBackupDrive(
  nilai: string,
): nilai is SumberDokumenBackupDrive {
  return (SUMBER_DOKUMEN_BACKUP_DRIVE as readonly string[]).includes(nilai);
}

export type KesiapanBackupDrive = {
  siap: boolean;
  /** Alasan yang bisa dibaca admin; tidak pernah memuat nilai rahasia. */
  alasan: string | null;
  /** Nama folder yang dibuat di My Drive akun Google pemilik refresh token. */
  folder: string;
};

/**
 * Periksa variabel lingkungan tanpa mengembalikan nilainya.
 *
 * Panjang kunci hanya pemeriksaan awal. Validasi base64 32 byte yang sebenarnya
 * dilakukan action sebelum satu berkas pun dibuat — query admin cukup tahu
 * apakah konfigurasi sudah diisi, bukan membocorkan isi kunci.
 */
export function kesiapanBackupDrive(
  env: Record<string, string | undefined>,
): KesiapanBackupDrive {
  const folder =
    (env.GOOGLE_DRIVE_FOLDER_NAME ?? "").trim() || NAMA_FOLDER_DRIVE_BAWAAN;
  const kurang: string[] = [];
  if ((env.GOOGLE_DRIVE_CLIENT_ID ?? "").trim() === "") {
    kurang.push("GOOGLE_DRIVE_CLIENT_ID");
  }
  if ((env.GOOGLE_DRIVE_CLIENT_SECRET ?? "").trim() === "") {
    kurang.push("GOOGLE_DRIVE_CLIENT_SECRET");
  }
  if ((env.GOOGLE_DRIVE_REFRESH_TOKEN ?? "").trim() === "") {
    kurang.push("GOOGLE_DRIVE_REFRESH_TOKEN");
  }
  const kunci = (env.BACKUP_DRIVE_ENCRYPTION_KEY ?? "").trim();
  if (kunci.length < 40) {
    kurang.push("BACKUP_DRIVE_ENCRYPTION_KEY");
  }
  return {
    siap: kurang.length === 0,
    alasan:
      kurang.length === 0
        ? null
        : `Lengkapi ${kurang.join(", ")} di Keys/API keys deployment ini.`,
    folder,
  };
}
