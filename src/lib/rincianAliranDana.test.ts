/**
 * Uji rincian aliran uang satu pinjaman (kartu panel admin "Ringkasan").
 * Run: bun src/lib/rincianAliranDana.test.ts
 *
 * Angka harapan di sini ditulis TANGAN dari kebijakan produk, bukan disalin
 * dari keluaran fungsi — kalau rumusnya berubah, uji ini harus gagal.
 * Contoh yang dipegang: pokok Rp1.000.000, dipotong 2% di muka → peminjam
 * menerima Rp980.000; kembali Rp1.300.000; dipotong 5% dari uang yang kembali
 * → penyedia dana menerima Rp1.235.000.
 */
import {
  POKOK_CONTOH_RINCIAN,
  barisRincianAliran,
  labelPotonganRincian,
  rincianAliranDana,
} from "./rincianAliranDana";

let passed = 0;
let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) passed += 1;
  else {
    failed += 1;
    console.error(
      `FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

function throws(fn: () => unknown, label: string) {
  try {
    fn();
    failed += 1;
    console.error(`FAIL ${label}: seharusnya melempar, tetapi tidak`);
  } catch {
    passed += 1;
  }
}

// ===== Contoh yang diminta pemilik produk (pokok Rp1.000.000) =====

const contoh = rincianAliranDana();

eq(POKOK_CONTOH_RINCIAN, 1_000_000, "contoh memakai pokok maksimum yang bisa diajukan");
eq(contoh.pokok, 1_000_000, "pokok Rp1.000.000");
eq(contoh.persenPotonganDiMuka, 2, "tarif potongan di muka 2%");
eq(contoh.potonganDiMuka, 20_000, "potongan 2% = Rp20.000");
eq(contoh.diterimaPeminjam, 980_000, "peminjam menerima Rp980.000");
eq(contoh.persenImbalHasil, 30, "Imbal Hasil 30% flat");
eq(contoh.imbalHasil, 300_000, "Imbal Hasil = Rp300.000");
eq(contoh.totalKembali, 1_300_000, "kembali Rp1.300.000 (130%)");
eq(contoh.persenPotonganPenyedia, 5, "tarif potongan 5% (bawaan bagiHasil.ts)");
eq(contoh.potonganPenyedia, 65_000, "potongan 5% DARI UANG YANG KEMBALI = Rp65.000");
eq(contoh.diterimaPenyedia, 1_235_000, "penyedia dana menerima Rp1.235.000");
eq(contoh.imbalBersihPenyedia, 235_000, "Imbal Hasil bersih penyedia Rp235.000");
eq(contoh.pendapatanPlatform, 85_000, "pendapatan platform Rp85.000 (20.000 + 65.000)");

// Dasar potongan adalah total yang kembali, BUKAN Imbal Hasil.
eq(
  contoh.potonganPenyedia === Math.round(contoh.imbalHasil * 0.05),
  false,
  "dasar 5% bukan Imbal Hasil (kalau Imbal Hasil, angkanya Rp15.000)",
);

// ===== Pembulatan rupiah pada pokok yang tidak bulat =====

// 2% × 333.333 = 6.666,66 → HALF-UP 6.667; 30% × 333.333 = 99.999,9 → 100.000;
// 5% × 433.333 = 21.666,65 → HALF-UP 21.667.
const ganjil = rincianAliranDana(333_333);
eq(ganjil.potonganDiMuka, 6_667, "2% dari 333.333 dibulatkan HALF-UP");
eq(ganjil.diterimaPeminjam, 326_666, "dana bersih 333.333 − 6.667");
eq(ganjil.imbalHasil, 100_000, "30% dari 333.333 dibulatkan HALF-UP");
eq(ganjil.totalKembali, 433_333, "total kembali 433.333");
eq(ganjil.potonganPenyedia, 21_667, "5% dari 433.333 dibulatkan HALF-UP");
eq(ganjil.diterimaPenyedia, 411_666, "diterima penyedia 433.333 − 21.667");
eq(ganjil.imbalBersihPenyedia, 78_333, "Imbal Hasil bersih = 100.000 − 21.667");

// Batas bisnis bawah.
const terkecil = rincianAliranDana(100_000);
eq(terkecil.potonganDiMuka, 2_000, "pokok 100rb: potongan di muka Rp2.000");
eq(terkecil.diterimaPeminjam, 98_000, "pokok 100rb: diterima peminjam Rp98.000");
eq(terkecil.totalKembali, 130_000, "pokok 100rb: kembali Rp130.000");
eq(terkecil.potonganPenyedia, 6_500, "pokok 100rb: potongan 5% = Rp6.500");
eq(terkecil.diterimaPenyedia, 123_500, "pokok 100rb: penyedia menerima Rp123.500");
eq(terkecil.pendapatanPlatform, 8_500, "pokok 100rb: platform Rp8.500");

// ===== Invarian lintas pokok =====

const daftarPokok = [
  100_000, 137_000, 174_000, 211_000, 248_000, 285_000, 322_000, 359_000, 396_000, 433_000,
  470_000, 507_000, 544_000, 581_000, 618_000, 655_000, 692_000, 729_000, 766_000, 803_000,
  840_000, 877_000, 914_000, 951_000, 988_000, 1_000_000,
];

for (const pokok of daftarPokok) {
  const r = rincianAliranDana(pokok);
  const tag = `pokok ${pokok}`;

  eq(r.potonganDiMuka + r.diterimaPeminjam, r.pokok, `${tag}: potongan + diterima = pokok`);
  eq(r.imbalHasil, r.totalKembali - r.pokok, `${tag}: Imbal Hasil = total − pokok`);
  eq(r.totalKembali, r.pokok + r.imbalHasil, `${tag}: total kembali = pokok + Imbal Hasil`);
  eq(
    r.potonganPenyedia + r.diterimaPenyedia,
    r.totalKembali,
    `${tag}: potongan + diterima penyedia = total kembali (tidak ada rupiah hilang)`,
  );
  eq(
    r.imbalBersihPenyedia,
    r.imbalHasil - r.potonganPenyedia,
    `${tag}: Imbal Hasil bersih = Imbal Hasil − potongan`,
  );
  eq(
    r.imbalBersihPenyedia,
    r.diterimaPenyedia - r.pokok,
    `${tag}: Imbal Hasil bersih = diterima penyedia − pokok`,
  );
  eq(
    r.pendapatanPlatform,
    r.potonganDiMuka + r.potonganPenyedia,
    `${tag}: pendapatan platform = potongan di muka + potongan penyedia`,
  );
  eq(
    r.diterimaPenyedia > r.pokok,
    true,
    `${tag}: penyedia dana tidak pernah menerima kurang dari pokoknya`,
  );
  eq(
    Number.isInteger(r.potonganDiMuka) &&
      Number.isInteger(r.diterimaPeminjam) &&
      Number.isInteger(r.imbalHasil) &&
      Number.isInteger(r.totalKembali) &&
      Number.isInteger(r.potonganPenyedia) &&
      Number.isInteger(r.diterimaPenyedia) &&
      Number.isInteger(r.imbalBersihPenyedia) &&
      Number.isInteger(r.pendapatanPlatform),
    true,
    `${tag}: semua nilai rupiah bulat (tanpa desimal)`,
  );
}

// ===== Tarif potongan yang bisa berbeda =====

const tanpaPotongan = rincianAliranDana(1_000_000, 0);
eq(tanpaPotongan.potonganPenyedia, 0, "potongan 0% → Rp0");
eq(tanpaPotongan.diterimaPenyedia, 1_300_000, "potongan 0% → penyedia menerima Rp1.300.000");
eq(tanpaPotongan.pendapatanPlatform, 20_000, "potongan 0% → platform hanya potongan di muka");

const limaBelas = rincianAliranDana(1_000_000, 15);
eq(limaBelas.potonganPenyedia, 195_000, "potongan 15% dari 1,3jt = Rp195.000");
eq(limaBelas.diterimaPenyedia, 1_105_000, "sisa untuk penyedia Rp1.105.000");

// ===== Masukan tidak sah =====

throws(() => rincianAliranDana(0), "pokok 0 ditolak");
throws(() => rincianAliranDana(-1_000_000), "pokok negatif ditolak");
throws(() => rincianAliranDana(50_000), "pokok di bawah batas bisnis ditolak");
throws(() => rincianAliranDana(2_000_000), "pokok di atas batas bisnis ditolak");
throws(() => rincianAliranDana(1_000_000.5), "pokok berdesimal ditolak");
throws(() => rincianAliranDana(1_000_000, -5), "persen potongan negatif ditolak");

// ===== Baris siap tampil =====

const baris = barisRincianAliran(contoh);
eq(baris.length, 8, "8 baris rincian");
eq(baris[0]?.label, "Pokok pinjaman", "baris pertama: pokok");
eq(
  baris[1]?.label,
  "Potongan di muka 2% (biaya admin)",
  "baris potongan di muka menyebut persennya",
);
eq(baris[2]?.label, "Diterima peminjam", "baris dana bersih");
eq(
  baris[4]?.label,
  "Potongan 5% dari uang yang kembali",
  "baris potongan 5% menyebut dasarnya (uang yang kembali)",
);
eq(baris[5]?.nilai, 1_235_000, "baris diterima penyedia dana = Rp1.235.000");
eq(labelPotonganRincian(baris[4]?.nilai ?? 0), "− Rp 65.000", "potongan ditulis dengan tanda −");
eq(
  baris.every((b) => Number.isInteger(b.nilai)),
  true,
  "semua baris bernilai rupiah bulat",
);

console.log(`rincianAliranDana.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
