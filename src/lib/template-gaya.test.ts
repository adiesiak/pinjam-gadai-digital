/**
 * Uji sumbu gaya template (tanpa React/Convex).
 * Run: bun src/lib/template-gaya.test.ts
 *
 * Yang dijaga: nilai asing dari penyimpanan tidak pernah merusak halaman, dan
 * setiap gaya punya token bentuk lengkap di stylesheet — kalau satu gaya lupa
 * didefinisikan, memilihnya akan diam-diam kembali ke tampilan bawaan.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { GAYA_PRESETS, INFO_GAYA, gayaAman } from "./template-gaya";

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

// Nilai sah dipertahankan.
for (const gaya of GAYA_PRESETS) {
  cek(`gaya "${gaya}" diterima apa adanya`, gayaAman(gaya) === gaya);
}

// Nilai asing/kosong kembali ke bawaan, bukan diteruskan.
cek("null → lembaga", gayaAman(null) === "lembaga");
cek("string asing → lembaga", gayaAman("neon") === "lembaga");
cek("angka → lembaga", gayaAman(42) === "lembaga");
cek("objek → lembaga", gayaAman({ gaya: "tenang" }) === "lembaga");

// Setiap preset punya info yang dipakai kartu panel admin.
cek(
  "setiap gaya punya info",
  GAYA_PRESETS.every((gaya) => INFO_GAYA.some((info) => info.id === gaya)),
);
cek(
  "setiap info punya nama, ringkasan, dan ciri",
  INFO_GAYA.every(
    (info) => info.nama !== "" && info.ringkasan !== "" && info.ciri.length > 0,
  ),
);

// Token bentuk: setiap gaya (kecuali bawaan yang ada di :root) harus punya blok.
const css = readFileSync(
  fileURLToPath(new URL("../index.css", import.meta.url)),
  "utf8",
);
const tokenWajib = [
  "--font-display",
  "--radius-kartu",
  "--radius-tombol",
  "--garis-tebal",
  "--bayangan-kartu",
  "--hero-pola",
];
for (const token of tokenWajib) {
  cek(`token ${token} didefinisikan`, css.includes(token));
}
for (const gaya of GAYA_PRESETS) {
  if (gaya === "lembaga") continue;
  cek(
    `stylesheet punya blok [data-gaya="${gaya}"]`,
    css.includes(`[data-gaya="${gaya}"]`),
  );
}

// Utilitas turunan gaya yang dipakai landing.
for (const utilitas of [
  "font-display",
  "rounded-kartu",
  "rounded-tombol",
  "shadow-kartu",
  "bg-hero",
]) {
  cek(
    `utilitas @utility ${utilitas} ada`,
    new RegExp(`@utility\\s+${utilitas}\\b`).test(css),
  );
}

console.log(`template-gaya: ${lulus} lulus, ${gagal} gagal`);
if (gagal > 0) process.exit(1);
