/**
 * Uji aturan banner promo beranda (tanpa React/Convex).
 * Run: bun src/lib/bannerPromo.test.ts
 *
 * Yang dijaga: berkas yang mengaku gambar tetapi isinya bukan gambar ditolak,
 * dan banner tidak bisa diarahkan ke alamat luar lewat tautan.
 */
import {
  jenisGambarDariKepala,
  namaBerkasBanner,
  tautanBannerValid,
} from "./bannerPromo";

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
cek("JPEG terpotong ditolak", jenisGambarDariKepala(new Uint8Array([0xff, 0xd8])) === null);
cek("berkas kosong ditolak", jenisGambarDariKepala(new Uint8Array()) === null);

// --- Tautan ---
const tautanOk = ["", "/promo", "/dashboard?tab=form"];
for (const tautan of tautanOk) {
  cek(`tautan diterima: ${JSON.stringify(tautan)}`, tautanBannerValid(tautan));
}
const tautanTolak = [
  "https://contoh.id/promo",
  "javascript:alert(1)",
  "//contoh.id",
  "promo",
];
for (const tautan of tautanTolak) {
  cek(`tautan ditolak: ${JSON.stringify(tautan)}`, !tautanBannerValid(tautan));
}

// --- Nama berkas ---
cek(
  "karakter tidak sah dibuang",
  namaBerkasBanner("promo/oktober:15%.png") === "promo-oktober-15%.png",
);
cek("nama kosong memakai bawaan", namaBerkasBanner("   ") === "banner-promo-pindai");

if (gagal > 0) {
  console.error(`\n${gagal} gagal, ${lulus} lulus.`);
  process.exit(1);
}
console.log(`\n${lulus} lulus.`);
