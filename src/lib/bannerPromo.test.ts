/**
 * Uji aturan banner promo (tanpa React/Convex).
 * Run: bun src/lib/bannerPromo.test.ts
 *
 * Yang dijaga: berkas yang mengaku gambar tetapi isinya bukan gambar ditolak,
 * tautan tidak bisa keluar aplikasi, status hanya "berjalan" saat semua syarat
 * terpenuhi, dan crop selalu berada di dalam batas gambar.
 */
import {
  hitungPotonganGambar,
  jenisGambarDariKepala,
  labelHitungMundur,
  namaBerkasBanner,
  periksaIsiBannerPromo,
  statusBannerPromo,
  tautanBannerValid,
} from "./bannerPromo";
import { awalHariWIB } from "./waktu";

let lulus = 0;
let gagal = 0;
function cek(nama: string, syarat: boolean) {
  if (syarat) {
    lulus += 1;
    console.log(`ok   ${nama}`);
  } else {
    gagal += 1;
    console.error(`FAIL ${nama}`);
  }
}

// --- Pemeriksaan isi berkas ---
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const webp = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);
cek("JPEG dikenali", jenisGambarDariKepala(jpeg) === "jpeg");
cek("PNG dikenali", jenisGambarDariKepala(png) === "png");
cek("WebP dikenali", jenisGambarDariKepala(webp) === "webp");
cek(
  "PDF ditolak",
  jenisGambarDariKepala(new Uint8Array([0x25, 0x50, 0x44, 0x46])) === null,
);
cek(
  "JPEG terpotong ditolak",
  jenisGambarDariKepala(new Uint8Array([0xff, 0xd8])) === null,
);
cek("berkas kosong ditolak", jenisGambarDariKepala(new Uint8Array()) === null);

// --- Tautan ---
for (const tautan of ["", "/promo", "/dashboard?tab=form"]) {
  cek(`tautan diterima: ${JSON.stringify(tautan)}`, tautanBannerValid(tautan));
}
for (const tautan of [
  "https://contoh.id/promo",
  "javascript:alert(1)",
  "//contoh.id",
  "promo",
]) {
  cek(`tautan ditolak: ${JSON.stringify(tautan)}`, !tautanBannerValid(tautan));
}

// --- Nama berkas ---
cek(
  "karakter tidak sah dibuang",
  namaBerkasBanner("promo/oktober:15%.png") === "promo-oktober-15%.png",
);
cek("nama kosong memakai bawaan", namaBerkasBanner("   ") === "banner-promo-pindai");

// --- Status kampanye ---
const SEKARANG = 1_800_000_000_000;
const HARI = 86_400_000;
const jadwal = { aktif: true, mulai: SEKARANG - HARI, selesai: SEKARANG + HARI };
cek(
  "semua syarat → berjalan",
  statusBannerPromo(jadwal, SEKARANG, { adaGambar: true }) === "berjalan",
);
cek(
  "sakelar mati → nonaktif",
  statusBannerPromo({ ...jadwal, aktif: false }, SEKARANG) === "nonaktif",
);
cek(
  "belum ada gambar → menunggu_gambar",
  statusBannerPromo(jadwal, SEKARANG, { adaGambar: false }) === "menunggu_gambar",
);
cek(
  "promo belum berjalan → menunggu_promo",
  statusBannerPromo(jadwal, SEKARANG, { promoBerjalan: false }) === "menunggu_promo",
);
cek(
  "baru dijadwalkan",
  statusBannerPromo({ ...jadwal, mulai: SEKARANG + HARI }, SEKARANG) ===
    "dijadwalkan",
);
cek(
  "sudah berakhir",
  statusBannerPromo({ ...jadwal, selesai: SEKARANG - HARI }, SEKARANG) ===
    "berakhir",
);

// --- Hitung mundur (hari kalender WIB) ---
const hariIni = awalHariWIB(SEKARANG) + 10 * 3_600_000;
cek("berakhir hari ini", labelHitungMundur(hariIni, hariIni) === "Berakhir hari ini");
cek(
  "berakhir besok",
  labelHitungMundur(hariIni + HARI, hariIni) === "Berakhir besok",
);
cek(
  "tiga hari lagi",
  labelHitungMundur(hariIni + 3 * HARI, hariIni) === "Berakhir 3 hari lagi",
);
cek(
  "lebih dari sepekan tidak diberi label",
  labelHitungMundur(hariIni + 8 * HARI, hariIni) === null,
);
cek(
  "sudah lewat tidak diberi label",
  labelHitungMundur(hariIni - HARI, hariIni) === null,
);

// --- Validasi isi ---
const isiSah = {
  nama: "Payday",
  mulai: SEKARANG,
  selesai: SEKARANG + 7 * HARI,
  penempatan: ["beranda"],
  tautan: "/promo",
  prioritas: 10,
};
cek("isi sah tanpa galat", periksaIsiBannerPromo(isiSah).length === 0);
cek(
  "tempat tampil wajib dipilih",
  periksaIsiBannerPromo({ ...isiSah, penempatan: [] }).some((pesan) =>
    pesan.includes("tempat tampil"),
  ),
);
cek(
  "tanggal terbalik ditolak",
  periksaIsiBannerPromo({ ...isiSah, selesai: SEKARANG - 1 }).some((pesan) =>
    pesan.includes("setelah tanggal mulai"),
  ),
);
cek(
  "prioritas di luar batas ditolak",
  periksaIsiBannerPromo({ ...isiSah, prioritas: 0 }).some((pesan) =>
    pesan.includes("Prioritas"),
  ),
);

// --- Crop ---
{
  // Gambar 2000×1000 ke bingkai 8:3 (2,67): tinggi dipotong, lebar penuh.
  const hasil = hitungPotonganGambar({
    lebarAsli: 2000,
    tinggiAsli: 1000,
    rasio: 8 / 3,
    zoom: 1,
    fokusX: 0.5,
    fokusY: 0.5,
  });
  cek("crop lebar memakai lebar penuh", Math.abs(hasil.sw - 2000) < 0.001);
  cek("crop lebar memotong tinggi", Math.abs(hasil.sh - 750) < 0.001);
  cek("crop lebar menyisakan ruang vertikal", Math.abs(hasil.sy - 125) < 0.001);
}
{
  // Gambar tegak 1000×2000 ke bingkai ponsel 4:5: crop horizontal.
  const hasil = hitungPotonganGambar({
    lebarAsli: 1000,
    tinggiAsli: 2000,
    rasio: 4 / 5,
    zoom: 2,
    fokusX: 0.5,
    fokusY: 0.5,
  });
  cek("zoom 2 memotong setengah lebar", Math.abs(hasil.sw - 500) < 0.001);
  cek("zoom 2 memotong setengah tinggi", Math.abs(hasil.sh - 625) < 0.001);
  cek(
    "crop berada di dalam gambar",
    hasil.sx >= 0 &&
      hasil.sy >= 0 &&
      hasil.sx + hasil.sw <= 1000.001 &&
      hasil.sy + hasil.sh <= 2000.001,
  );
}
{
  // Fokus di pojok tidak boleh membaca piksel di luar gambar.
  const hasil = hitungPotonganGambar({
    lebarAsli: 3000,
    tinggiAsli: 1000,
    rasio: 8 / 3,
    zoom: 3,
    fokusX: 0,
    fokusY: 1,
  });
  cek("fokus pojok tetap di dalam", hasil.sx === 0 && hasil.sy >= 0);
  cek("tepi kanan tidak melewati gambar", hasil.sx + hasil.sw <= 3000.001);
  cek("tepi bawah tidak melewati gambar", hasil.sy + hasil.sh <= 1000.001);
}

if (gagal > 0) {
  console.error(`\n${gagal} gagal, ${lulus} lulus.`);
  process.exit(1);
}
console.log(`\n${lulus} lulus.`);
