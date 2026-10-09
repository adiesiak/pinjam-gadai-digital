/**
 * Batasan & tipe KYC pengajuan pinjaman — dipakai bersama oleh form nasabah
 * dan validasi server. Struktur data selaras dengan field opsional di
 * schema loans (nik, nomorWhatsApp, penghasilan, dokumen, lokasi).
 *
 * Berkas ini MURNI (tanpa React/DOM/Convex) dan memegang dua lapis aturan:
 *  1. bentuk ISIAN — validateKycInput (NIK, WhatsApp, penghasilan), dipakai
 *     form dan server;
 *  2. bentuk BERKAS — GAMBAR_DITERIMA, jenisGambarDariByte, dan
 *     periksaBerkasIdentitas. Pemeriksaan berkas dijalankan SERVER setelah
 *     membaca berkas dari Convex storage (lihat convex/berkasIdentitas.ts),
 *     sebab batas ukuran dan jenis berkas yang hanya diperiksa di peramban
 *     bisa dilewati siapa pun yang mengirim langsung ke URL unggah.
 *
 * Batas yang jujur: tipe MIME ditentukan klien saat mengunggah, jadi tipe itu
 * bukan bukti. Karena itu isi berkas tetap diperiksa dari magic bytes-nya.
 */

/** Batas ukuran file dokumen: 5 MB. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** Jenis gambar kamera yang diterima untuk setiap dokumen KYC. */
export const KYC_FILES = [
  { key: "ktp", label: "Foto KTP", accept: "image/*", max: MAX_FILE_BYTES },
  { key: "selfie", label: "Selfie dengan KTP", accept: "image/*", max: MAX_FILE_BYTES },
  {
    key: "slip",
    label: "Bukti penghasilan (contoh: slip gaji)",
    accept: "image/*",
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
    return "Nomor KTP harus terdiri dari 16 angka.";
  }
  const wa = input.nomorWhatsApp.replace(/[\s-]/g, "");
  if (!/^62\d{8,13}$/.test(wa)) {
    return "Masukkan nomor WhatsApp yang diawali 62, tanpa tanda +. Contoh: 6281234567890.";
  }
  if (!Number.isInteger(input.penghasilanBulanan) || input.penghasilanBulanan <= 0) {
    return "Masukkan jumlah penghasilan per bulan dalam angka rupiah yang benar.";
  }
  if (input.sumberPenghasilan.trim().length < 3) {
    return "Ceritakan sumber penghasilan Anda (minimal 3 karakter), misalnya gaji atau usaha.";
  }
  return null;
}

/** Label format gambar yang diterima untuk dokumen identitas. */
export const GAMBAR_DITERIMA = ["JPG", "PNG", "WEBP", "GIF", "HEIC"] as const;

/** Brand ISO-BMFF yang berarti foto kamera iPhone/Android (HEIC/HEIF/AVIF). */
const BRAND_HEIC = ["heic", "heix", "hevc", "hevx", "mif1", "msf1", "avif", "avis"];

/**
 * Kenali format gambar dari beberapa byte pertama berkas (magic bytes).
 *
 * Tipe MIME saja tidak cukup: nilai itu dikirim klien saat mengunggah, jadi
 * berkas apa pun bisa mengaku `image/png`. Tanda tangan berkas inilah yang
 * menunjukkan isinya benar-benar gambar.
 *
 * `head` cukup 16 byte pertama; mengembalikan null bila tidak dikenali (termasuk
 * video MP4 yang juga memakai kotak `ftyp`, tetapi brand-nya bukan brand foto).
 */
export function jenisGambarDariByte(head: Uint8Array): string | null {
  const b = Array.from(head);
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return "gif";
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    return "webp";
  }
  if (
    b.length >= 12 &&
    b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70 &&
    BRAND_HEIC.includes(String.fromCharCode(b[8], b[9], b[10], b[11]))
  ) {
    return "heic";
  }
  return null;
}

/**
 * Periksa satu berkas identitas: ada, tidak kosong, ≤ 5 MB, bertipe gambar, dan
 * isinya benar-benar gambar.
 *
 * `bolehPdf` dipakai HANYA untuk bukti penghasilan (bank statement/surat
 * keterangan sering dikirim sebagai PDF). KTP dan selfie selalu wajib gambar:
 * berkas identitas berisi wajah/NIK, jadi tidak ada alasan menerima format
 * lain — dan pemanggil tidak perlu mengubah aturan per slot.
 *
 * @param label nama dokumen apa adanya untuk pengguna (mis. "Foto KTP").
 * @param meta  `{ size, contentType }` dari storage; `null` bila tidak ada.
 * @param opsi  `bolehPdf` untuk dokumen non-identitas (bukti penghasilan).
 * @returns `null` bila lolos, atau kalimat galat siap tampil.
 */
export function periksaBerkasIdentitas(
  label: string,
  meta: { size: number; contentType: string } | null,
  opsi: { bolehPdf?: boolean } = {},
): string | null {
  if (meta === null) {
    return `${label} tidak ditemukan di penyimpanan. Unggah ulang berkasnya.`;
  }
  if (meta.size <= 0) {
    return `${label} kosong. Unggah ulang berkasnya.`;
  }
  if (meta.size > MAX_FILE_BYTES) {
    return `${label} maksimal ${Math.round(MAX_FILE_BYTES / (1024 * 1024))} MB.`;
  }
  const tipe = meta.contentType.toLowerCase();
  const gambar = tipe.startsWith("image/");
  const pdf = opsi.bolehPdf === true && tipe === "application/pdf";
  if (!gambar && !pdf) {
    return `${label} harus berupa gambar (${GAMBAR_DITERIMA.join(", ")})${
      opsi.bolehPdf === true ? " atau PDF" : ""
    }.`;
  }
  return null;
}

/**
 * Pesan galat bila ISI berkas (16 byte pertama) bukan gambar yang diterima;
 * `null` bila lolos.
 *
 * Dipakai action pemeriksaan isi berkas (`berkasIdentitas.periksaIsiBerkasKyc`),
 * yang membaca isi berkas dari storage — hanya action yang boleh membaca isi
 * berkas di Convex, sedangkan mutation hanya dapat membaca metadata.
 */
export function periksaIsiGambar(label: string, head: Uint8Array | null): string | null {
  if (head === null || jenisGambarDariByte(head) === null) {
    return `${label} tidak dikenali sebagai gambar (${GAMBAR_DITERIMA.join(", ")}). Unggah ulang berkasnya.`;
  }
  return null;
}
