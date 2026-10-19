/**
 * Uji warna ikon aplikasi.
 * Run: bun src/lib/ikonAplikasi.test.ts
 *
 * Ikon PWA, apple-touch-icon, dan mipmap Android pernah memakai placeholder
 * hitam berisi bintang dan garis. Berkasnya sah sebagai PNG, jadi uji ukuran
 * saja tidak menangkap masalah itu. Di sini pikselnya dibaca langsung: ikon
 * harus memuat hijau lambang dan kuningan, bukan bidang hitam.
 *
 * Dekoder kecil ini sengaja ditulis dengan `node:zlib` supaya uji tidak
 * bergantung pada pustaka gambar yang tidak tercantum di package.json.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

const akar = fileURLToPath(new URL("../../", import.meta.url));

let lulus = 0;
let gagal = 0;
function ok(syarat: boolean, label: string): void {
  if (syarat) lulus += 1;
  else {
    gagal += 1;
    console.error(`FAIL ${label}`);
  }
}

function paeth(kiri: number, atas: number, kiriAtas: number): number {
  const perkiraan = kiri + atas - kiriAtas;
  const keKiri = Math.abs(perkiraan - kiri);
  const keAtas = Math.abs(perkiraan - atas);
  const keKiriAtas = Math.abs(perkiraan - kiriAtas);
  if (keKiri <= keAtas && keKiri <= keKiriAtas) return kiri;
  return keAtas <= keKiriAtas ? atas : kiriAtas;
}

/**
 * Baca PNG RGB 8-bit tanpa interlace menjadi deret piksel.
 * Ikon proyek selalu dihasilkan dengan format itu; format lain ditolak supaya
 * uji tidak diam-diam melewatkan berkas yang tidak bisa diperiksa.
 */
function bacaPng(jalur: string): { lebar: number; tinggi: number; piksel: Buffer } {
  const berkas = readFileSync(jalur);
  const tanda = berkas.subarray(0, 8).toString("hex");
  if (tanda !== "89504e470d0a1a0a") throw new Error(`${jalur} bukan PNG`);

  const lebar = berkas.readUInt32BE(16);
  const tinggi = berkas.readUInt32BE(20);
  const kedalaman = berkas[24];
  const jenisWarna = berkas[25];
  const interlace = berkas[28];
  if (kedalaman !== 8 || jenisWarna !== 2 || interlace !== 0) {
    throw new Error(`${jalur} bukan PNG RGB 8-bit tanpa interlace`);
  }

  let posisi = 8;
  const potongan: Buffer[] = [];
  while (posisi < berkas.length) {
    const panjang = berkas.readUInt32BE(posisi);
    const jenis = berkas.toString("ascii", posisi + 4, posisi + 8);
    if (jenis === "IDAT") {
      potongan.push(berkas.subarray(posisi + 8, posisi + 8 + panjang));
    }
    posisi += 12 + panjang;
  }

  const mentah = inflateSync(Buffer.concat(potongan));
  const langkah = lebar * 3;
  const piksel = Buffer.alloc(tinggi * langkah);
  let baca = 0;

  for (let y = 0; y < tinggi; y += 1) {
    const filter = mentah[baca];
    baca += 1;
    for (let x = 0; x < langkah; x += 1) {
      const nilai = mentah[baca];
      baca += 1;
      const kiri = x >= 3 ? piksel[y * langkah + x - 3] : 0;
      const atas = y > 0 ? piksel[(y - 1) * langkah + x] : 0;
      const kiriAtas = y > 0 && x >= 3 ? piksel[(y - 1) * langkah + x - 3] : 0;
      let tebakan = 0;
      if (filter === 1) tebakan = kiri;
      else if (filter === 2) tebakan = atas;
      else if (filter === 3) tebakan = Math.floor((kiri + atas) / 2);
      else if (filter === 4) tebakan = paeth(kiri, atas, kiriAtas);
      piksel[y * langkah + x] = (nilai + tebakan) & 255;
    }
  }

  return { lebar, tinggi, piksel };
}

/** Persentase piksel hijau lambang, kuningan, dan hitam pekat. */
function komposisi(piksel: Buffer): { hijau: number; kuningan: number; hitam: number } {
  let hijau = 0;
  let kuningan = 0;
  let hitam = 0;
  for (let i = 0; i < piksel.length; i += 3) {
    const r = piksel[i];
    const g = piksel[i + 1];
    const b = piksel[i + 2];
    // Hijau lambang #0f3d3a: hijau jelas di atas merah, dekat dengan biru.
    if (g > r + 12 && g >= b - 5) hijau += 1;
    // Kuningan #b99b62: merah di atas hijau, hijau di atas biru.
    if (r > g + 10 && g > b + 10) kuningan += 1;
    if (r < 25 && g < 25 && b < 25) hitam += 1;
  }
  const total = piksel.length / 3;
  return {
    hijau: (hijau / total) * 100,
    kuningan: (kuningan / total) * 100,
    hitam: (hitam / total) * 100,
  };
}

const ikon = [
  { jalur: "public/icon-192.png", sisi: 192 },
  { jalur: "public/icon-512.png", sisi: 512 },
  { jalur: "public/apple-touch-icon.png", sisi: 180 },
  { jalur: "android/res/mipmap-mdpi/ic_launcher.png", sisi: 48 },
  { jalur: "android/res/mipmap-hdpi/ic_launcher.png", sisi: 72 },
  { jalur: "android/res/mipmap-xhdpi/ic_launcher.png", sisi: 96 },
  { jalur: "android/res/mipmap-xxhdpi/ic_launcher.png", sisi: 144 },
  { jalur: "android/res/mipmap-xxxhdpi/ic_launcher.png", sisi: 192 },
] as const;

for (const { jalur, sisi } of ikon) {
  const png = bacaPng(`${akar}${jalur}`);
  ok(png.lebar === sisi && png.tinggi === sisi, `${jalur} berukuran ${sisi} x ${sisi}`);
  const warna = komposisi(png.piksel);
  ok(
    warna.hijau > 10,
    `${jalur} memuat hijau lambang (${warna.hijau.toFixed(1)}%)`,
  );
  ok(
    warna.kuningan > 1,
    `${jalur} memuat kuningan (${warna.kuningan.toFixed(1)}%)`,
  );
  ok(
    warna.hitam < 5,
    `${jalur} bukan bidang hitam (${warna.hitam.toFixed(1)}%)`,
  );
}

// Sumber ikon Android dan halaman tidak boleh kembali ke placeholder hitam.
for (const jalur of ["src/assets/logo.svg", "public/logo.svg"]) {
  const svg = readFileSync(`${akar}${jalur}`, "utf8");
  ok(svg.includes("#0f3d3a"), `${jalur} memuat hijau lambang`);
  ok(svg.includes("#b99b62"), `${jalur} memuat kuningan`);
  ok(!/fill="#000000"/i.test(svg), `${jalur} tidak memakai bidang hitam`);
}

{
  const halaman = readFileSync(`${akar}src/pages/UnduhAplikasi.tsx`, "utf8");
  ok(
    halaman.includes('src="/icon-192.png"'),
    "kartu unduh memakai ikon 192 px yang sudah diperbaiki",
  );
}

console.log(`ikonAplikasi.test: ${lulus} lulus, ${gagal} gagal`);
if (gagal > 0) process.exit(1);
