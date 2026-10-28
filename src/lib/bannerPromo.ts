/**
 * Aturan banner promo — penempatan, jadwal, dua rasio gambar, dan crop.
 *
 * Dipakai bersama oleh panel admin, action server, dan halaman publik supaya
 * batas ukuran, status, serta hasil potongan gambar tidak berbeda diam-diam.
 */
import { selisihHariWIB } from "./waktu";

/** Tempat banner boleh muncul. Dashboard dan /promo ikut sejak awal. */
export const PENEMPATAN_BANNER = [
  {
    id: "beranda",
    label: "Beranda publik",
    catatan: "di bawah hero halaman /",
  },
  {
    id: "dashboard",
    label: "Dashboard nasabah",
    catatan: "tab Ringkasan",
  },
  {
    id: "promo",
    label: "Halaman /promo",
    catatan: "di atas galeri poster",
  },
] as const;

export type PenempatanBanner = (typeof PENEMPATAN_BANNER)[number]["id"];

export function labelPenempatanBanner(id: PenempatanBanner): string {
  return PENEMPATAN_BANNER.find((item) => item.id === id)?.label ?? id;
}

/** Banner adalah gambar kampanye, bukan dokumen: 3 MB sudah cukup besar. */
export const MAKS_BANNER_BYTE = 3 * 1024 * 1024;

/** Batas teks yang disimpan server. */
export const BATAS_BANNER = {
  nama: 60,
  judul: 80,
  tautan: 160,
} as const;

/** Jenis berkas yang diterima pemilih berkas di panel admin. */
export const ACCEPT_BANNER = "image/jpeg,image/png,image/webp";

export type VarianGambarBanner = "desktop" | "mobile";

/**
 * Rasio bingkai banner. Desktop lebar (8:3) untuk beranda; mobile lebih tegak
 * (4:5) supaya poster kampanye tidak dipotong habis di ponsel.
 */
export const RASIO_BANNER: Record<VarianGambarBanner, number> = {
  desktop: 8 / 3,
  mobile: 4 / 5,
};

/** Ukuran simpan hasil crop; cukup tajam untuk layar 2x. */
export const UKURAN_BANNER: Record<
  VarianGambarBanner,
  { lebar: number; tinggi: number }
> = {
  desktop: { lebar: 1600, tinggi: 600 },
  mobile: { lebar: 1080, tinggi: 1350 },
};

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

export type StatusBannerPromo =
  | "berjalan"
  | "dijadwalkan"
  | "berakhir"
  | "nonaktif"
  | "menunggu_gambar"
  | "menunggu_promo";

/**
 * Urutan pemeriksaan sengaja menaruh sebab yang paling bisa ditindak admin di
 * depan: sakelar, gambar, lalu jadwal. Status "berjalan" hanya diberikan bila
 * semua syarat terpenuhi.
 */
export function statusBannerPromo(
  row: { aktif: boolean; mulai: number; selesai: number },
  sekarang: number,
  opsi: { adaGambar?: boolean; promoBerjalan?: boolean } = {},
): StatusBannerPromo {
  if (!row.aktif) return "nonaktif";
  if (opsi.adaGambar === false) return "menunggu_gambar";
  if (opsi.promoBerjalan === false) return "menunggu_promo";
  if (sekarang < row.mulai) return "dijadwalkan";
  if (sekarang > row.selesai) return "berakhir";
  return "berjalan";
}

/**
 * Label hitung mundur hari kalender WIB. Hanya muncul pada tujuh hari terakhir
 * agar banner tidak terus-menerus memasang angka yang tidak mendesak.
 */
export function labelHitungMundur(
  selesai: number,
  sekarang = Date.now(),
): string | null {
  const sisa = selisihHariWIB(sekarang, selesai);
  if (sisa < 0 || sisa > 7) return null;
  if (sisa === 0) return "Berakhir hari ini";
  if (sisa === 1) return "Berakhir besok";
  return `Berakhir ${sisa} hari lagi`;
}

/**
 * Periksa isi banner sebelum disimpan. Pesan dikembalikan, bukan dilempar,
 * supaya panel bisa menampilkan semuanya sekaligus dan server memakai aturan
 * yang sama.
 */
export function periksaIsiBannerPromo(isi: {
  nama: string;
  mulai: number;
  selesai: number;
  penempatan: readonly string[];
  tautan: string;
  prioritas: number;
}): string[] {
  const galat: string[] = [];
  if (isi.nama.trim() === "") galat.push("Nama kampanye wajib diisi.");
  if (isi.penempatan.length === 0) {
    galat.push("Pilih setidaknya satu tempat tampil.");
  }
  if (!Number.isFinite(isi.mulai) || !Number.isFinite(isi.selesai)) {
    galat.push("Tanggal mulai dan selesai wajib diisi.");
  } else if (isi.mulai > isi.selesai) {
    galat.push("Tanggal selesai harus setelah tanggal mulai.");
  }
  if (!tautanBannerValid(isi.tautan.trim())) {
    galat.push(
      "Tautan harus path internal yang diawali satu garis miring, mis. /promo.",
    );
  }
  if (
    !Number.isFinite(isi.prioritas) ||
    isi.prioritas < 1 ||
    isi.prioritas > 999
  ) {
    galat.push("Prioritas harus antara 1 dan 999.");
  }
  return galat;
}

/**
 * Hitung bagian gambar sumber yang harus digambar ke kanvas.
 *
 * `zoom` 1 berarti crop terbesar yang masih menutup bingkai; `fokus` adalah
 * titik tengah crop dalam koordinat gambar (0–1). Hasilnya selalu berada di
 * dalam batas gambar, jadi `drawImage` tidak pernah membaca piksel kosong.
 */
export function hitungPotonganGambar(args: {
  lebarAsli: number;
  tinggiAsli: number;
  rasio: number;
  zoom: number;
  fokusX: number;
  fokusY: number;
}): { sx: number; sy: number; sw: number; sh: number } {
  const lebarAsli = Math.max(1, args.lebarAsli);
  const tinggiAsli = Math.max(1, args.tinggiAsli);
  const rasio = args.rasio > 0 ? args.rasio : 1;
  const zoom = Math.min(3, Math.max(1, args.zoom));
  const fokusX = Math.min(1, Math.max(0, args.fokusX));
  const fokusY = Math.min(1, Math.max(0, args.fokusY));

  let sw: number;
  let sh: number;
  if (lebarAsli / tinggiAsli > rasio) {
    sh = tinggiAsli;
    sw = sh * rasio;
  } else {
    sw = lebarAsli;
    sh = sw / rasio;
  }
  sw /= zoom;
  sh /= zoom;

  const sx = Math.min(
    Math.max(0, fokusX * lebarAsli - sw / 2),
    lebarAsli - sw,
  );
  const sy = Math.min(
    Math.max(0, fokusY * tinggiAsli - sh / 2),
    tinggiAsli - sh,
  );
  return { sx, sy, sw, sh };
}
