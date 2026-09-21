/**
 * Batasan & tipe KYC pengajuan pinjaman — dipakai bersama oleh form nasabah
 * dan validasi server. Struktur data selaras dengan field opsional di
 * schema loans (nik, nomorWhatsApp, penghasilan, dokumen, lokasi).
 */

/** Batas ukuran file dokumen: 5 MB. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** Jenis file yang diterima untuk setiap dokumen KYC. */
export const KYC_FILES = [
  { key: "ktp", label: "Foto KTP", accept: "image/*", max: MAX_FILE_BYTES },
  { key: "selfie", label: "Selfie dengan KTP", accept: "image/*", max: MAX_FILE_BYTES },
  {
    key: "slip",
    label: "Slip gaji / bukti penghasilan",
    accept: "image/*,application/pdf",
    max: MAX_FILE_BYTES,
  },
] as const;

export type KycFileKey = (typeof KYC_FILES)[number]["key"];

/** Validasi sisi form: NIK 16 digit, format WhatsApp 62…, penghasilan > 0. */
export function validateKycInput(input: {
  nik: string;
  nomorWhatsApp: string;
  penghasilanBulanan: number;
  sumberPenghasilan: string;
}): string | null {
  if (!/^\d{16}$/.test(input.nik.replace(/\s+/g, ""))) {
    return "NIK harus 16 digit angka sesuai KTP.";
  }
  const wa = input.nomorWhatsApp.replace(/[\s-]/g, "");
  if (!/^62\d{8,13}$/.test(wa)) {
    return "Nomor WhatsApp format internasional tanpa +, diawali 62 (mis. 6281234567890).";
  }
  if (!Number.isInteger(input.penghasilanBulanan) || input.penghasilanBulanan <= 0) {
    return "Penghasilan bulanan harus angka rupiah bulat yang valid.";
  }
  if (input.sumberPenghasilan.trim().length < 3) {
    return "Isi sumber penghasilan (mis. gaji, usaha).";
  }
  return null;
}
