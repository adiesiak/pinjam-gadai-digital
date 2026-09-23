/**
 * Tests harga & bulk price STOP-UP! — dependency-free (konvensi financial.test.ts).
 * Run: bun src/lib/stopup/pricing.test.ts
 */
import {
  bulatkan,
  hargaJualAktif,
  hitungBulk,
  labaPerUnit,
  persenMargin,
  terapkanFormulaBulk,
} from "./pricing";

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

// ---- harga jual aktif: promo menang hanya bila benar-benar lebih murah ----
const dasar = { hppPrice: 10_000, sellPrice: 11_000, isDiscountActive: false };
eq(hargaJualAktif(dasar), 11_000, "tanpa promo memakai harga normal");
eq(
  hargaJualAktif({ ...dasar, isDiscountActive: true, discountPrice: 10_500 }),
  10_500,
  "promo aktif memakai harga promo",
);
eq(
  hargaJualAktif({ ...dasar, isDiscountActive: true, discountPrice: 12_000 }),
  11_000,
  "promo lebih mahal diabaikan (tidak boleh menaikkan harga jual)",
);
eq(
  hargaJualAktif({ ...dasar, isDiscountActive: true, discountPrice: 0 }),
  11_000,
  "promo 0 diabaikan",
);

// ---- laba & margin ----
eq(labaPerUnit(dasar), 1_000, "laba per unit 1.000");
eq(persenMargin(dasar), 9.1, "margin 1000/11000 = 9,1%");
eq(labaPerUnit({ hppPrice: 12_000, sellPrice: 11_000, isDiscountActive: false }), -1_000, "laba negatif terdeteksi");

// ---- pembulatan ----
eq(bulatkan(10_540, "none"), 10_540, "tanpa pembulatan");
eq(bulatkan(10_540, "ratus"), 10_500, "pembulatan ke ratusan");
eq(bulatkan(10_540, "ribu"), 11_000, "pembulatan ke ribuan");
eq(bulatkan(10_499, "ratus"), 10_500, "pembulatan ratusan ke atas");

// ---- formula bulk: fixed dulu, lalu persen ----
eq(terapkanFormulaBulk(10_000, { fixedAdd: 500 }), 10_500, "fixed add-on");
eq(terapkanFormulaBulk(10_000, { persenAdd: 5 }), 10_500, "percentage add-on 5%");
eq(
  terapkanFormulaBulk(10_000, { fixedAdd: 1_000, persenAdd: 10 }),
  12_100,
  "fixed dulu (11.000) lalu +10% = 12.100",
);
eq(
  terapkanFormulaBulk(10_000, { persenAdd: 5, rounding: "ratus" }),
  10_500,
  "persen + auto rounding",
);
eq(terapkanFormulaBulk(10_000, { fixedAdd: -500 }), 9_500, "penurunan harga (fixed negatif)");

// ---- hitungBulk: produk rugi DILEWATI, bukan dijual rugi ----
const hasil = hitungBulk(
  [
    { id: "a", nama: "Pulsa 10rb", hppPrice: 10_250, sellPrice: 11_000 },
    { id: "b", nama: "Margin tipis", hppPrice: 10_950, sellPrice: 11_000 },
    { id: "c", nama: "Rugi", hppPrice: 12_000, sellPrice: 11_000 },
  ],
  // minLaba 600 → produk "b" (laba menjadi 550) harus ikut dilewati.
  { target: "sell", formula: { fixedAdd: 500 }, minLaba: 600 },
);

eq(hasil.diubah, 1, "hanya 1 produk aman diubah");
eq(hasil.dilewati, 2, "2 produk dilewati (laba < minimum / rugi)");
eq(hasil.baris[0].sesudah, 11_500, "harga produk aman menjadi 11.500");
eq(hasil.baris[0].labaSesudah, 1_250, "laba setelah penyesuaian 1.250");
eq(hasil.baris[1].dilewati, true, "margin tipis dilewati");
eq(hasil.baris[2].dilewati, true, "produk rugi dilewati");

// ---- target discount memakai discountPrice bila ada ----
const diskon = hitungBulk(
  [{ id: "x", nama: "Promo", hppPrice: 9_000, sellPrice: 11_000, discountPrice: 10_000 }],
  { target: "discount", formula: { persenAdd: 10 }, minLaba: 0 },
);
eq(diskon.baris[0].sebelum, 10_000, "basis discountPrice dipakai untuk target discount");
eq(diskon.baris[0].sesudah, 11_000, "discount 10.000 + 10% = 11.000");

// ---- konsistensi nilai contoh spesifikasi ----
// Harga pulsa 10.000: HPP 10.250, jual 11.000 → masih untung 750.
eq(labaPerUnit({ hppPrice: 10_250, sellPrice: 11_000, isDiscountActive: false }), 750, "contoh pulsa 10rb");
// Token PLN 50.000: admin hanya menambah tipis, harus tetap positif.
eq(labaPerUnit({ hppPrice: 50_300, sellPrice: 51_500, isDiscountActive: false }), 1_200, "token PLN 50rb");

console.log(`stopup pricing tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
