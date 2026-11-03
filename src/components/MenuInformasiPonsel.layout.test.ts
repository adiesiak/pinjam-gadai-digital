/**
 * Penjaga layout menu informasi ponsel.
 *
 * Run: bun src/components/MenuInformasiPonsel.layout.test.ts
 *
 * Panel menu pernah terpotong di layar 375px karena diposisikan dari tombol
 * yang masih punya CTA di sebelah kanannya. Uji ini menjaga tiga hal di sumber:
 * panel tumbuh dari tepi kanan, lebarnya dibatasi viewport, dan tingginya bisa
 * digulir di layar pendek.
 *
 * Batas: uji ini membaca kelas, bukan piksel. Pengukuran geometri tetap perlu
 * dilakukan di peramban saat mengubah susunan header.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

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

function sumber(berkas: string): string {
  return readFileSync(fileURLToPath(new URL(berkas, import.meta.url)), "utf8");
}

const komponen = sumber("./MenuInformasiPonsel.tsx");
cek(
  "pembungkus menu tidak menyusut di samping CTA",
  komponen.includes("relative shrink-0"),
);
cek(
  "panel dibatasi tinggi viewport dinamis",
  komponen.includes("max-h-[calc(100dvh-5.5rem)]"),
);
cek(
  "panel bisa digulir di layar pendek",
  komponen.includes("overflow-y-auto") && komponen.includes("overscroll-contain"),
);

const halaman = [
  ["./../pages/LandingHome.tsx", "w-64"],
  ["./../components/informasi/InfoShell.tsx", "w-64"],
  ["./../pages/JadiPendana.tsx", "w-56"],
  ["./../pages/UnduhAplikasi.tsx", "w-56"],
] as const;

for (const [berkas, lebar] of halaman) {
  const isi = sumber(berkas);
  const nama = berkas
    .replace("./../pages/", "")
    .replace("./../components/", "");
  cek(`${nama} memakai menu ponsel bersama`, isi.includes("<MenuInformasiPonsel"));
  cek(
    `${nama} menambatkan panel ke tepi kanan`,
    isi.includes('kelasPanel="absolute right-0 top-full'),
  );
  cek(
    `${nama} membatasi panel selebar viewport`,
    isi.includes("max-w-[calc(100vw-2rem)]"),
  );
  cek(`${nama} memakai lebar panel ${lebar}`, isi.includes(lebar));
}

const beranda = sumber("./../pages/LandingHome.tsx");
cek(
  "CTA beranda mengecil di layar sangat sempit",
  beranda.includes("px-3 text-xs") && beranda.includes("sm:px-4 sm:text-sm"),
);

console.log(`MenuInformasiPonsel.layout: ${lulus} lulus, ${gagal} gagal`);
if (gagal > 0) process.exit(1);
