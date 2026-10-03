/** Run: bun src/lib/bagiHasil.test.ts */
import {
  BUNGA_PINJAMAN_DEFAULT_PERSEN,
  POTONGAN_ADMIN_DEFAULT_PERSEN,
  bagiHasilPinjaman,
  bagiImbalHasil,
} from "./bagiHasil";

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

// ===== Bagi hasil pinjaman (model 1 pinjaman = 1 pendana) =====
// Contoh acuan: pokok Rp1.000.000, bunga 30% → total Rp1.300.000,
// potongan admin 5% dari total = Rp65.000, penyedia dana menerima Rp1.235.000.
eq(BUNGA_PINJAMAN_DEFAULT_PERSEN, 30, "bunga pinjaman bawaan 30%");
const acuan = bagiHasilPinjaman(1_000_000, 30, 5);
eq(acuan.bunga, 300_000, "bunga = 30% dari pokok");
eq(acuan.totalLunas, 1_300_000, "total lunas = pokok + bunga");
eq(acuan.potonganAdmin, 65_000, "potongan admin = 5% dari TOTAL (bukan dari bunga)");
eq(acuan.pendanaTerima, 1_235_000, "yang diterima penyedia dana = total − potongan");
eq(acuan.keuntunganPendana, 235_000, "keuntungan bersih penyedia dana");
eq(acuan.keuntunganAdmin, 65_000, "keuntungan admin = potongan");

// Pendana menerima pokok kembali utuh + keuntungan; admin tidak menyentuh pokok.
eq(
  acuan.pendanaTerima - acuan.keuntunganPendana,
  1_000_000,
  "pokok kembali utuh ke penyedia dana",
);

// Pembulatan selalu ke bawah: sisa rupiah milik penyedia dana, bukan admin.
const ganjilPinjam = bagiHasilPinjaman(500_150, 30, 5);
eq(ganjilPinjam.bunga, 150_045, "30% dari Rp500.150 dibulatkan ke bawah");
eq(ganjilPinjam.totalLunas, 650_195, "total lunas akurat");
eq(
  ganjilPinjam.potonganAdmin + ganjilPinjam.pendanaTerima,
  ganjilPinjam.totalLunas,
  "tidak ada rupiah hilang antara admin dan penyedia",
);

// Kebijakan dinonaktifkan & batas ekstrem.
eq(bagiHasilPinjaman(1_000_000, 30, 0).keuntunganAdmin, 0, "0% admin tidak memotong");
eq(
  bagiHasilPinjaman(1_000_000, 30, 0).keuntunganPendana,
  300_000,
  "0% admin menyisakan bunga penuh untuk penyedia",
);

// Invariant: potongan + pendanaTerima = totalLunas; keuntunganPendana = bunga − potongan.
for (const pokok of [0, 1, 500_150, 1_000_000, 2_000_000, 999_999_999]) {
  for (const persenBunga of [0, 7.5, 10, 30]) {
    for (const persenAdmin of [0, 2.5, 5]) {
      const h = bagiHasilPinjaman(pokok, persenBunga, persenAdmin);
      eq(
        h.potonganAdmin + h.pendanaTerima,
        h.totalLunas,
        `potongan + diterima = total (pokok ${pokok}, bunga ${persenBunga}%, admin ${persenAdmin}%)`,
      );
      eq(
        h.keuntunganPendana,
        h.bunga - h.potonganAdmin,
        `keuntungan pendana = bunga − potongan (pokok ${pokok})`,
      );
    }
  }
}

throws(() => bagiHasilPinjaman(-1, 30, 5), "pokok negatif ditolak");
throws(() => bagiHasilPinjaman(1.5, 30, 5), "pokok pecahan ditolak");
throws(() => bagiHasilPinjaman(1_000_000, -1, 5), "bunga negatif ditolak");
throws(() => bagiHasilPinjaman(1_000_000, 30, 101), "potongan admin >100 ditolak");

console.log(`bagiHasil.test.ts: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
