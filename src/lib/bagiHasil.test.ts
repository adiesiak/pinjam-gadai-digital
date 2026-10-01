/** Run: bun src/lib/bagiHasil.test.ts */
import { POTONGAN_ADMIN_DEFAULT_PERSEN, bagiImbalHasil } from "./bagiHasil";

let passed = 0;
let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}: expected ${expected}, got ${actual}`);
  }
}
function throws(fn: () => unknown, label: string) {
  try {
    fn();
    failed += 1;
    console.error(`FAIL ${label}: expected to throw`);
  } catch {
    passed += 1;
  }
}

// Kebijakan bawaan 5%: Rp 5.000.000 Imbal Hasil → potongan Rp 250.000.
eq(POTONGAN_ADMIN_DEFAULT_PERSEN, 5, "kebijakan bawaan 5%");
const besar = bagiImbalHasil(5_000_000, POTONGAN_ADMIN_DEFAULT_PERSEN);
eq(besar.potonganAdmin, 250_000, "5% dari Rp 5.000.000");
eq(besar.imbalBersih, 4_750_000, "bersih = bruto − potongan");

// Ibu jari: pembulatan potongan ke BAWAH, sisa selalu milik penyedia dana.
const ganjil = bagiImbalHasil(33_333, 5);
eq(ganjil.potonganAdmin, 1_666, "floor 5% dari Rp 33.333 (bukan 1.667)");
eq(ganjil.imbalBersih, 31_667, "sisa rupiah tidak masuk ke kas admin");

// Jumlah kecil: potongan nol, tidak ada rupiah yang hilang.
const kecil = bagiImbalHasil(19, 5);
eq(kecil.potonganAdmin, 0, "Rp 19 → potongan Rp 0 (floor)");
eq(kecil.imbalBersih, 19, "penyedia dana tetap menerima penuh");

// Potongan 0% (kebijakan dinonaktifkan) dan 100% (batas ekstrem).
eq(bagiImbalHasil(1_000_000, 0).potonganAdmin, 0, "0% tidak memotong");
eq(bagiImbalHasil(1_000_000, 0).imbalBersih, 1_000_000, "0% utuh untuk penyedia");
eq(bagiImbalHasil(1_000_000, 100).potonganAdmin, 1_000_000, "100% seluruhnya potongan");
eq(bagiImbalHasil(1_000_000, 100).imbalBersih, 0, "100% menyisakan nol");

// Persentase pecahan (mis. 2,5%) tetap bilangan bulat & tepat.
const setengah = bagiImbalHasil(1_000_000, 2.5);
eq(setengah.potonganAdmin, 25_000, "2,5% dari Rp 1.000.000");
eq(setengah.imbalBersih, 975_000, "bersih 2,5%");

// Invariant yang harus selalu benar: bruto = potongan + bersih.
for (const bruto of [0, 1, 999, 100_000, 1_234_567, 999_999_999]) {
  for (const persen of [0, 2.5, 3, 5, 12.75, 100]) {
    const h = bagiImbalHasil(bruto, persen);
    eq(
      h.potonganAdmin + h.imbalBersih,
      bruto,
      `tidak ada rupiah hilang (bruto ${bruto}, ${persen}%)`,
    );
  }
}

throws(() => bagiImbalHasil(-1, 5), "Imbal Hasil negatif ditolak");
throws(() => bagiImbalHasil(1.5, 5), "Imbal Hasil pecahan ditolak");
throws(() => bagiImbalHasil(1_000_000, -1), "persentase negatif ditolak");
throws(() => bagiImbalHasil(1_000_000, 101), "persentase >100 ditolak");

console.log(`bagiHasil.test.ts: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
