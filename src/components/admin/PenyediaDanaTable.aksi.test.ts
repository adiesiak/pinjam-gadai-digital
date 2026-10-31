/**
 * Uji susunan AKSI tabel "Daftar Akun Pendana & Pemantau".
 * Run: bun src/components/admin/PenyediaDanaTable.aksi.test.ts
 *
 * Keluhan yang dijaga: tiap baris menampilkan dua tombol lebar (isi/ubah data
 * login dan Masuk sebagai), sehingga kolom lain terdesak di layar 1366. Pola
 * yang dipakai sekarang sama dengan Plafon Nasabah: satu pemicu "Kelola".
 *
 * Komponen ini membaca Convex, jadi tidak bisa dirender di luar aplikasi. Yang
 * diperiksa adalah sumbernya: satu pemicu per baris, kedua aksi tetap ada DI
 * DALAM menu, dan dialognya dibuka dari menu tanpa tombol pemicu sendiri.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

let passed = 0;
let failed = 0;
function ok(syarat: boolean, label: string): void {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

const sumber = readFileSync(
  fileURLToPath(new URL("./PenyediaDanaTable.tsx", import.meta.url)),
  "utf8",
);

/** Teks tanpa komentar, supaya penjelasan di docblock tidak dihitung sebagai kode. */
const kode = sumber
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

ok(
  kode.split("<MenuKelolaPendana").length - 1 === 1,
  "kolom tindakan memakai satu menu Kelola",
);
ok(
  kode.split("<DropdownMenuTrigger").length - 1 === 1,
  "hanya ada satu pemicu menu",
);
ok(
  kode.includes("h-9 gap-1.5 rounded-lg bg-primary"),
  "tombol Kelola memakai ukuran dan warna yang sama dengan Plafon Nasabah",
);
ok(
  kode.includes("aria-label={`Kelola ${nama}`}"),
  "pemicu menyebut nama akun untuk pembaca layar",
);

// Kedua aksi lama tetap ada, tidak dikurangi, dan berada di dalam menu.
const posisiMenu = kode.indexOf("<DropdownMenuContent");
for (const label of ["data login", "Masuk sebagai"]) {
  const posisi = kode.indexOf(label);
  ok(posisi > posisiMenu && posisiMenu !== -1, `aksi "${label}" berada DI DALAM menu`);
}
ok(
  kode.includes('email === null ? "Isi data login" : "Ubah data login"'),
  "label data login mengikuti ada/tidaknya email akun",
);

// Dialog tetap komponen yang sama, dibuka dari menu tanpa tombol pemicu.
ok(
  kode.split("tampilkanTombol={false}").length - 1 === 2,
  "kedua dialog disembunyikan pemicunya karena dibuka dari menu",
);
ok(
  kode.split("onTerbukaChange=").length - 1 === 2,
  "kedua dialog dikendalikan state menu baris itu",
);
ok(
  !kode.includes(">Masuk sebagai</Button>"),
  "tidak ada tombol Masuk sebagai berdiri sendiri",
);
ok(
  !kode.includes("justify-end gap-2\">"),
  "deretan dua tombol lama sudah tidak dirender",
);

if (failed > 0) {
  console.error(`\n${failed} gagal, ${passed} lulus`);
  process.exit(1);
}
console.log(`PenyediaDanaTable.aksi: ${passed} lulus`);
