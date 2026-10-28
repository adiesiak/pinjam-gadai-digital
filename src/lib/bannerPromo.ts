/**
 * Aturan banner promo beranda — batas ukuran, jenis gambar, dan tautan.
 *
 * Dipakai tiga pihak sekaligus agar angkanya tidak berbeda diam-diam:
 * - panel admin (batas berkas sebelum mengunggah),
 * - action server (pemeriksaan isi berkas dan ukuran),
 * - halaman beranda (tautan yang boleh dirender).
 */

/** Banner adalah gambar kampanye, bukan dokumen: 3 MB sudah cukup besar. */
export const MAKS_BANNER_BYTE = 3 * 1024 * 1024;

/** Batas teks yang disimpan server. */
export const BATAS_BANNER = {
  judul: 80,
  tautan: 160,
} as const;

/** Jenis berkas yang diterima pemilih berkas di panel admin. */
export const ACCEPT_BANNER = "image/jpeg,image/png,image/webp";

export type JenisGambarBanner = "jpeg" | "png" | "webp";

/**
 * Tentukan jenis gambar dari beberapa byte pertama berkas.
 *
 * Label MIME dari peramban tidak dipercaya: unggahan langsung ke Convex
 * storage tidak melewati server, jadi berkas bernama `.jpg` bisa saja berisi
 * apa pun. Tiga tanda tangan di bawah cukup untuk format yang memang
 * ditawarkan ke admin.
 */
export function jenisGambarDariKepala(
  bytes: Uint8Array,
): JenisGambarBanner | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "png";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "webp";
  }
  return null;
}

/**
 * Tautan banner hanya boleh path internal.
 *
 * Banner dirender sebagai `<Link to>`, jadi alamat penuh atau `javascript:`
 * bukan cuma salah arah — ia tombol yang menjanjikan hal lain dari yang
 * terjadi. String kosong berarti banner tidak bisa diklik.
 */
export function tautanBannerValid(tautan: string): boolean {
  return tautan === "" || /^\/(?!\/)[^\s\\]*$/.test(tautan);
}

/** Nama berkas aman untuk disimpan dan ditampilkan di panel. */
export function namaBerkasBanner(nama: string): string {
  const bersih = nama
    .trim()
    .slice(0, 120)
    .replace(/[\\/:*?"<>|]+/g, "-");
  return bersih !== "" ? bersih : "banner-promo-pindai";
}
