/**
 * Uji paginasi daftar admin (10 baris/halaman) — dependency-free, mengikuti
 * konvensi plafon.test.ts / admin-queue.test.ts.
 * Run: bun src/lib/paginasi.test.ts
 */
import { BARIS_PER_HALAMAN, labelRentang, potongHalaman } from "./paginasi";

let passed = 0;
let failed = 0;

function eq(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`FAIL ${label}: expected ${expected}, got ${actual}`);
  }
}

function ok(syarat: boolean, label: string) {
  if (syarat) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

const daftar = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

// ---- Ukuran halaman tetap 10 ----
eq(BARIS_PER_HALAMAN, 10, "bawaan 10 baris per halaman");
eq(potongHalaman(daftar(25), 0).baris.length, 10, "halaman penuh berisi 10 baris");
eq(potongHalaman(daftar(25), 0, 5).baris.length, 5, "ukuran halaman bisa diubah");

// ---- 18 nasabah (kasus nyata panel plafon) ----
{
  const h = potongHalaman(daftar(18), 0);
  eq(h.totalHalaman, 2, "18 baris → 2 halaman");
  eq(h.halaman, 0, "halaman pertama = 0");
  eq(h.baris.length, 10, "halaman 1 berisi 10 baris");
  eq(h.baris[0], 1, "baris pertama halaman 1 = data ke-1");
  eq(h.awal, 0, "awal halaman 1 = indeks 0");
  eq(labelRentang(h, 18), "Menampilkan 1–10 dari 18", "label rentang halaman 1");

  const h2 = potongHalaman(daftar(18), 1);
  eq(h2.baris.length, 8, "halaman 2 berisi sisa 8 baris");
  eq(h2.baris[0], 11, "halaman 2 mulai dari data ke-11");
  eq(h2.baris[7], 18, "halaman 2 berakhir di data ke-18");
  eq(h2.awal, 10, "awal halaman 2 = indeks 10");
  eq(labelRentang(h2, 18), "Menampilkan 11–18 dari 18", "label rentang halaman 2");
}

// ---- Batas: kelipatan pas, satu baris, kosong ----
eq(potongHalaman(daftar(20), 1).totalHalaman, 2, "20 baris → tepat 2 halaman");
eq(potongHalaman(daftar(20), 1).baris.length, 10, "halaman terakhir penuh saat pas");
eq(potongHalaman(daftar(21), 2).baris.length, 1, "21 baris → halaman 3 berisi 1");
eq(potongHalaman(daftar(1), 0).totalHalaman, 1, "satu baris → 1 halaman");
eq(potongHalaman(daftar(0), 0).totalHalaman, 1, "kosong tetap 1 halaman");
eq(potongHalaman(daftar(0), 0).baris.length, 0, "kosong → tanpa baris");
eq(labelRentang(potongHalaman(daftar(0), 0), 0), "Tidak ada data", "label saat kosong");

// ---- Penjepitan: halaman di luar rentang tidak pernah kosong ----
{
  const h = potongHalaman(daftar(18), 9);
  eq(h.halaman, 1, "halaman 9 dijepit ke halaman terakhir (1)");
  eq(h.baris.length, 8, "halaman terjepit tetap berisi data");
  const h2 = potongHalaman(daftar(18), 2);
  eq(h2.halaman, 1, "halaman 2 dari 2 halaman dijepit ke 1");
}
{
  // Daftar menyusut (pencarian) saat admin berada di halaman belakang.
  const sebelum = potongHalaman(daftar(18), 1);
  eq(sebelum.halaman, 1, "admin di halaman 2 sebelum menyaring");
  const sesudah = potongHalaman(daftar(3), sebelum.halaman);
  eq(sesudah.halaman, 0, "setelah daftar menyusut, halaman dijepit ke 0");
  eq(sesudah.baris.length, 3, "daftar tersaring tetap tampil seluruhnya");
}
{
  // 100 baris (batas server) → 10 halaman, halaman terakhir penuh.
  const h = potongHalaman(daftar(100), 9);
  eq(h.totalHalaman, 10, "100 baris → 10 halaman");
  eq(h.baris.length, 10, "halaman terakhir dari 100 baris penuh");
  eq(h.baris[9], 100, "data terakhir tampil di halaman terakhir");
}

// ---- Halaman tidak sah ----
eq(potongHalaman(daftar(18), -3).halaman, 0, "halaman negatif → 0");
eq(potongHalaman(daftar(18), 1.6).halaman, 1, "halaman pecahan dibulatkan ke bawah");
eq(potongHalaman(daftar(18), Number.NaN).halaman, 0, "halaman NaN → 0");
eq(potongHalaman(daftar(18), 0, 0).baris.length, 10, "perHalaman 0 → bawaan 10");
eq(potongHalaman(daftar(18), 0, -5).baris.length, 10, "perHalaman negatif → bawaan 10");
ok(
  potongHalaman(daftar(18), 0, Number.NaN).baris.length === 10,
  "perHalaman NaN → bawaan 10",
);

// ---- Potongan tidak memodifikasi sumber & tetap berurutan ----
{
  const sumber = daftar(18);
  const h = potongHalaman(sumber, 1);
  eq(sumber.length, 18, "daftar sumber tidak berubah");
  eq(h.baris.join(","), "11,12,13,14,15,16,17,18", "urutan baris tetap");
}

console.log(`paginasi tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
