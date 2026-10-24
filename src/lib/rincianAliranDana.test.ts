/**
 * Uji rincian aliran uang satu pinjaman (kartu panel admin "Ringkasan").
 * Run: bun src/lib/rincianAliranDana.test.ts
 *
 * Angka harapan di sini ditulis TANGAN dari kebijakan produk, bukan disalin
 * dari keluaran fungsi — kalau rumusnya berubah, uji ini harus gagal.
 * Contoh yang dipegang: pokok Rp1.000.000, dipotong 2% di muka → peminjam
 * menerima Rp980.000; kembali Rp1.300.000; dipotong 5% dari POKOK Rp1.000.000
 * → penyedia dana menerima Rp1.250.000.
 */
import { bagiHasilPinjaman, POTONGAN_ADMIN_DEFAULT_PERSEN } from "./bagiHasil";
import { hitungSimulasiBulanan } from "./bulanan";
import { LOAN_LIMITS, PINDAI_PRICING, quoteLoan } from "./loan";
import {
  POKOK_CONTOH_RINCIAN,
  PILIHAN_POKOK_RINCIAN,
  barisRincianAliran,
  labelPotonganRincian,
  rincianAliranDana,
  rincianPinjamanNyata,
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
eq(contoh.potonganDiMuka, 30_000, "potongan di muka = admin 2% + ekspres Rp10.000");
eq(contoh.diterimaPeminjam, 970_000, "peminjam menerima Rp970.000");
eq(contoh.persenImbalHasil, 30, "Imbal Hasil 30% flat");
eq(contoh.imbalHasil, 300_000, "Imbal Hasil = Rp300.000");
eq(contoh.totalKembali, 1_300_000, "kembali Rp1.300.000 (130%)");
eq(contoh.persenPotonganPenyedia, 5, "tarif potongan 5% (bawaan bagiHasil.ts)");
eq(contoh.potonganPenyedia, 50_000, "potongan 5% DARI POKOK = Rp50.000");
eq(contoh.diterimaPenyedia, 1_250_000, "penyedia dana menerima Rp1.250.000");
eq(contoh.imbalBersihPenyedia, 250_000, "Imbal Hasil bersih penyedia Rp250.000");
eq(contoh.pendapatanPlatform, 80_000, "pendapatan platform Rp80.000 (30.000 + 50.000)");

// Dasar potongan adalah POKOK, BUKAN Imbal Hasil.
eq(
  contoh.potonganPenyedia === Math.round(contoh.imbalHasil * 0.05),
  false,
  "dasar 5% bukan Imbal Hasil (kalau Imbal Hasil, angkanya Rp15.000)",
);

// ===== Pembulatan rupiah pada pokok yang tidak bulat =====

// 2% × 333.333 = 6.666,66 → HALF-UP 6.667; 30% × 333.333 = 99.999,9 → 100.000;
// 5% × 333.333 = 16.666,65 → KE BAWAH 16.666 (sisa rupiah milik penyedia dana,
// sama dengan yang dibukukan ledger saat pelunasan).
const ganjil = rincianAliranDana(333_333);
eq(ganjil.potonganDiMuka, 11_667, "2% dari 333.333 dibulatkan HALF-UP, ditambah ekspres Rp5.000");
eq(ganjil.diterimaPeminjam, 321_666, "dana bersih 333.333 − 11.667");
eq(ganjil.imbalHasil, 100_000, "30% dari 333.333 dibulatkan HALF-UP");
eq(ganjil.totalKembali, 433_333, "total kembali 433.333");
eq(ganjil.potonganPenyedia, 16_666, "5% dari 333.333 dibulatkan KE BAWAH (bukan 16.667)");
eq(
  ganjil.potonganPenyedia === Math.round(ganjil.pokok * 0.05),
  false,
  "potongan memakai pembulatan ledger (floor), bukan HALF-UP rupiah biasa",
);
eq(ganjil.diterimaPenyedia, 416_667, "diterima penyedia 433.333 − 16.666");
eq(ganjil.imbalBersihPenyedia, 83_334, "Imbal Hasil bersih = 100.000 − 16.666");

// Batas bisnis bawah.
const terkecil = rincianAliranDana(100_000);
eq(terkecil.potonganDiMuka, 7_000, "pokok 100rb: admin Rp2.000 + ekspres Rp5.000");
eq(terkecil.diterimaPeminjam, 93_000, "pokok 100rb: diterima peminjam Rp93.000");
eq(terkecil.totalKembali, 130_000, "pokok 100rb: kembali Rp130.000");
eq(terkecil.potonganPenyedia, 5_000, "pokok 100rb: potongan 5% = Rp5.000");
eq(terkecil.diterimaPenyedia, 125_000, "pokok 100rb: penyedia menerima Rp125.000");
eq(terkecil.pendapatanPlatform, 12_000, "pokok 100rb: platform Rp12.000");

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
eq(tanpaPotongan.pendapatanPlatform, 30_000, "potongan 0% → platform hanya potongan di muka (admin + ekspres)");

const limaBelas = rincianAliranDana(1_000_000, 15);
eq(limaBelas.potonganPenyedia, 150_000, "potongan 15% dari pokok 1jt = Rp150.000");
eq(limaBelas.diterimaPenyedia, 1_150_000, "sisa untuk penyedia Rp1.150.000");

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
  "Potongan di muka (admin 2% + ekspres)",
  "baris potongan di muka menyebut admin + ekspres",
);
eq(baris[2]?.label, "Diterima peminjam", "baris dana bersih");
eq(
  baris[4]?.label,
  "Potongan 5% dari pokok",
  "baris potongan 5% menyebut dasarnya (pokok)",
);
eq(baris[5]?.nilai, 1_250_000, "baris diterima penyedia dana = Rp1.250.000");
eq(labelPotonganRincian(baris[4]?.nilai ?? 0), "− Rp 50.000", "potongan ditulis dengan tanda −");
eq(
  baris.every((b) => Number.isInteger(b.nilai)),
  true,
  "semua baris bernilai rupiah bulat",
);

// ===== Satu pintu uang: kartu = mesin harga + mesin bagi hasil =====
// Angka kartu tidak boleh lahir dari rumus lokal di UI. Untuk setiap pokok,
// tiap nilai harus persis sama dengan keluaran mesin yang menagih Peminjam
// (quoteLoan) dan mesin yang membukukan bagi hasil (bagiHasilPinjaman).
for (const pokok of daftarPokok) {
  const r = rincianAliranDana(pokok);
  const tagihan = quoteLoan(pokok);
  const bagi = bagiHasilPinjaman(pokok, PINDAI_PRICING.bungaPercent, POTONGAN_ADMIN_DEFAULT_PERSEN);
  const tag = `satu pintu pokok ${pokok}`;
  eq(r.potonganDiMuka, tagihan.totalPotonganDiMuka, `${tag}: potongan di muka dari harga akad`);
  eq(r.diterimaPeminjam, tagihan.danaBersihDitransfer, `${tag}: diterima peminjam dari harga akad`);
  eq(r.imbalHasil, tagihan.bunga, `${tag}: Imbal Hasil dari harga akad`);
  eq(r.totalKembali, tagihan.totalKewajibanPelunasan, `${tag}: uang kembali dari harga akad`);
  eq(r.potonganPenyedia, bagi.potonganAdmin, `${tag}: potongan = yang dibukukan ledger`);
  eq(r.diterimaPenyedia, bagi.pendanaTerima, `${tag}: diterima penyedia = yang dibayarkan ledger`);
  eq(r.imbalBersihPenyedia, bagi.keuntunganPendana, `${tag}: Imbal Hasil bersih = yang dibayarkan ledger`);
}

// ===== Pilihan pokok kartu =====

eq(PILIHAN_POKOK_RINCIAN.length >= 3, true, "kartu menyediakan beberapa pilihan pokok");
eq(
  PILIHAN_POKOK_RINCIAN.every((p) => p >= LOAN_LIMITS.minPokok && p <= LOAN_LIMITS.maxPokok),
  true,
  "semua pilihan pokok berada di dalam batas bisnis",
);
eq(
  [...PILIHAN_POKOK_RINCIAN].sort((a, b) => a - b).join(),
  PILIHAN_POKOK_RINCIAN.join(),
  "pilihan pokok urut dari kecil ke besar",
);
eq(
  new Set(PILIHAN_POKOK_RINCIAN).size,
  PILIHAN_POKOK_RINCIAN.length,
  "tidak ada pilihan pokok kembar",
);
for (const pokok of PILIHAN_POKOK_RINCIAN) {
  const r = rincianAliranDana(pokok);
  eq(r.pokok, pokok, `pilihan ${pokok} bisa dihitung kartu`);
  eq(r.potonganPenyedia + r.diterimaPenyedia, r.totalKembali, `pilihan ${pokok}: tidak ada rupiah hilang`);
}

// ===== Rincian satu pinjaman NYATA (detail pinjaman admin) =====
// Harian: pokok 500.000 @30% → admin 10.000 + ekspres 7.500 = 17.500,
// kembali 650.000, potongan 5% dari pokok = 25.000, penyedia menerima 625.000.
const nyataHarian = rincianPinjamanNyata({ pokokPinjaman: 500_000, persenBunga: 30 });
eq(nyataHarian.potonganDiMuka, 17_500, "nyata harian: admin + ekspres");
eq(nyataHarian.diterimaPeminjam, 482_500, "nyata harian: diterima peminjam");
eq(nyataHarian.imbalHasil, 150_000, "nyata harian: Imbal Hasil 30%");
eq(nyataHarian.totalKembali, 650_000, "nyata harian: uang yang kembali");
eq(nyataHarian.potonganPenyedia, 25_000, "nyata harian: potongan 5% dari pokok");
eq(nyataHarian.diterimaPenyedia, 625_000, "nyata harian: diterima penyedia");
eq(nyataHarian.imbalBersihPenyedia, 125_000, "nyata harian: Imbal Hasil bersih");

// Harian tanpa snapshot bunga memakai tarif bawaan akad (30%).
eq(
  rincianPinjamanNyata({ pokokPinjaman: 500_000 }).imbalHasil,
  rincianPinjamanNyata({ pokokPinjaman: 500_000, persenBunga: 30 }).imbalHasil,
  "tanpa snapshot bunga memakai tarif akad",
);

// Bulanan: Imbal Hasil = bunga SELAMA TENOR (bukan satu bulan), dasarnya tetap
// pokok penempatan, dan potongannya dibulatkan ke bawah.
for (const [pokok, tenorBulan, persenBulan] of [
  [1_000_000, 1, 10],
  [2_000_000, 3, 10],
  [3_333_333, 3, 7.5],
] as const) {
  const sim = hitungSimulasiBulanan(pokok, tenorBulan, { persenBungaPerBulan: persenBulan });
  const r = rincianPinjamanNyata({ pokokPinjaman: pokok, tenorBulan, persenBunga: persenBulan });
  const tag = `nyata bulanan ${pokok}/${tenorBulan}bln`;
  // Dasar pembayaran pendana = pokok + Imbal Hasil tenor (biaya admin cicilan
  // sudah milik platform, jadi tidak ikut dibayarkan).
  const dasar = sim.totalPengembalian - sim.biayaAdminCicilanTotal;
  eq(dasar, pokok + sim.bungaTotal, `${tag}: dasar potongan = pokok + Imbal Hasil tenor`);
  eq(r.imbalHasil, sim.bungaTotal, `${tag}: Imbal Hasil = bunga total tenor`);
  eq(r.totalKembali, sim.totalPengembalian, `${tag}: kembali = Σ cicilan simulasi`);
  eq(
    r.potonganPenyedia,
    Math.floor((pokok * 5) / 100),
    `${tag}: potongan 5% dari pokok (floor)`,
  );
  eq(
    r.potonganPenyedia + r.diterimaPenyedia,
    dasar,
    `${tag}: potongan + diterima penyedia = pokok + Imbal Hasil tenor`,
  );
  eq(
    r.imbalBersihPenyedia,
    r.imbalHasil - r.potonganPenyedia,
    `${tag}: Imbal Hasil bersih = Imbal Hasil − potongan`,
  );
}

// Label baris bulanan tidak boleh menyebut tarif bulanan sebagai "Imbal Hasil".
const barisBulanan = barisRincianAliran(
  rincianPinjamanNyata({ pokokPinjaman: 2_000_000, tenorBulan: 3, persenBunga: 10 }),
  { tenorBulan: 3 },
);
eq(
  barisBulanan[3]?.label,
  "Kembali (pokok + Imbal Hasil 3 bulan @10%)",
  "baris bulanan menyebut tenor dan tarif per bulan",
);
eq(
  barisRincianAliran(rincianPinjamanNyata({ pokokPinjaman: 1_000_000, persenBunga: 30 }))[3]?.label,
  "Kembali (pokok + Imbal Hasil 30%)",
  "baris harian tetap seperti semula",
);

// Peminjam yang melepas cair ekspres: hanya biaya admin yang dipotong, dan
// label baris tidak boleh menyebut "+ ekspres" untuk angka yang tidak ada.
const tanpaEkspres = rincianPinjamanNyata({
  pokokPinjaman: 500_000,
  persenBunga: 30,
  cairEkspres: false,
});
eq(tanpaEkspres.potonganDiMuka, 10_000, "tanpa ekspres: hanya admin 2% dari Rp500.000");
eq(tanpaEkspres.diterimaPeminjam, 490_000, "tanpa ekspres: diterima peminjam Rp490.000");
eq(tanpaEkspres.adaEkspres, false, "tanpa ekspres: penanda ekspres mati");
eq(
  barisRincianAliran(tanpaEkspres)[1]?.label,
  "Potongan di muka (admin 2%)",
  "label potongan tidak menyebut ekspres bila tidak dipakai",
);
eq(
  rincianPinjamanNyata({ pokokPinjaman: 500_000, persenBunga: 30 }).adaEkspres,
  true,
  "data lama tanpa pilihan tetap dihitung ekspres",
);

// Data warisan: pokok tidak sah tidak merobohkan detail pinjaman (tanpa hitungan).
const warisan = rincianPinjamanNyata({ pokokPinjaman: 0 });
eq(warisan.potonganPenyedia, 0, "pokok warisan 0: tidak ada potongan");
eq(warisan.diterimaPenyedia, 0, "pokok warisan 0: penyedia menerima apa adanya");
eq(warisan.pendapatanPlatform, 0, "pokok warisan 0: platform tidak mengaku pendapatan");

console.log(`rincianAliranDana.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
