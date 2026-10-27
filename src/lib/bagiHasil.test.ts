/** Run: bun src/lib/bagiHasil.test.ts */
import {
  BUNGA_PINJAMAN_DEFAULT_PERSEN,
  bagiHasilPinjaman,
  bagiHasilPinjamanDari,
} from "./bagiHasil";
import { hitungSimulasiBulanan } from "./bulanan";
import { bagiMargin } from "./kebijakanPinjaman";
import { quotePinjaman } from "./loan";
import { percentOf } from "./money";

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

// ===== Aturan pembagian 47 : 13 =====
eq(BUNGA_PINJAMAN_DEFAULT_PERSEN, 30, "bunga pinjaman bawaan 30%");
eq(bagiMargin(300_000).pendana, 235_000, "47/60 dari Rp300.000 = Rp235.000");
eq(bagiMargin(300_000).platform, 65_000, "13/60 dari Rp300.000 = Rp65.000");
eq(bagiMargin(1).platform, 0, "pecahan kecil tidak dipungut dari pendana");
eq(bagiMargin(1).pendana, 1, "sisa pembulatan menjadi milik pendana");
eq(bagiMargin(19).platform, 4, "13/60 × 19 = 4,11 → dipungut 4");
eq(bagiMargin(19).pendana, 15, "sisa 19 − 4 kembali ke pendana");
eq(bagiMargin(6666).platform, 1444, "porsi platform dibulatkan ke bawah");
eq(bagiMargin(6666).pendana, 5222, "pendana menerima sisa pembulatan");

// ===== Contoh acuan harian =====
// Pokok Rp1.000.000, bunga 30%: marjin Rp300.000 dibagi 47 : 13.
const acuan = bagiHasilPinjaman(1_000_000, 30);
eq(acuan.bunga, 300_000, "bunga = 30% dari pokok");
eq(acuan.totalLunas, 1_300_000, "total lunas = pokok + bunga");
eq(acuan.potonganAdmin, 65_000, "porsi platform 21,67% dari marjin = Rp65.000");
eq(acuan.pendanaTerima, 1_235_000, "penyedia menerima pokok + porsi pendana");
eq(acuan.keuntunganPendana, 235_000, "keuntungan bersih penyedia = 78,33% marjin");
eq(acuan.keuntunganAdmin, 65_000, "keuntungan platform = porsi platform");
eq(
  acuan.potonganAdmin + acuan.pendanaTerima,
  acuan.totalLunas,
  "porsi platform + diterima penyedia = total kewajiban",
);
eq(
  acuan.pendanaTerima - acuan.keuntunganPendana,
  1_000_000,
  "pokok kembali utuh ke penyedia",
);
eq(
  acuan.potonganAdmin === Math.round(acuan.totalLunas * 0.05),
  true,
  "pada marjin 30% hasilnya kebetulan sama dengan 5% total kembali",
);

// Pokok tak rata tetap memakai pembulatan HALF-UP untuk bunga (sama dengan
// tagihan Peminjam) dan pembulatan KE BAWAH untuk porsi platform.
const ganjil = bagiHasilPinjaman(500_150, 30);
eq(ganjil.bunga, 150_045, "bunga 30% dari Rp500.150 = tagihan Peminjam");
eq(ganjil.totalLunas, 650_195, "total lunas akurat");
eq(ganjil.potonganAdmin, Math.floor((150_045 * 13) / 60), "porsi platform = floor(13/60 marjin)");
eq(
  ganjil.potonganAdmin + ganjil.pendanaTerima,
  ganjil.totalLunas,
  "tidak ada rupiah hilang antara platform dan penyedia",
);

// ===== Invarian harian lintas pokok & tarif =====
for (const pokok of [0, 1, 999, 100_000, 333_333, 500_150, 1_000_000, 1_999_999, 7_777_777]) {
  for (const persenBunga of [0, 7.5, 10, 15, 30]) {
    const h = bagiHasilPinjaman(pokok, persenBunga);
    const marjin = percentOf(pokok, persenBunga);
    const tag = `pokok ${pokok}, bunga ${persenBunga}%`;
    eq(h.bunga, marjin, `${tag}: bunga = yang ditagih ke Peminjam`);
    eq(h.potonganAdmin, Math.floor((marjin * 13) / 60), `${tag}: porsi platform 13/60 marjin`);
    eq(h.keuntunganPendana, marjin - h.potonganAdmin, `${tag}: keuntungan pendana = sisa marjin`);
    eq(h.potonganAdmin + h.pendanaTerima, h.totalLunas, `${tag}: tidak ada rupiah hilang`);
    eq(h.keuntunganAdmin, h.potonganAdmin, `${tag}: keuntungan admin = porsi platform`);
    eq(Number.isInteger(h.pendanaTerima), true, `${tag}: nilai rupiah bulat`);
  }
}

// ===== Skema bulanan: marjin SELAMA TENOR, biaya admin cicilan terpisah =====
for (const [pokok, tenorBulan, persenBulan] of [
  [1_000_000, 1, 30],
  [1_000_000, 3, 20],
  [2_000_000, 3, 10],
  [3_333_333, 3, 7.5],
  [5_000_000, 6, 8],
] as const) {
  const sim = hitungSimulasiBulanan(pokok, tenorBulan, {
    persenBungaPerBulan: persenBulan,
  });
  const panel = bagiHasilPinjamanDari({
    pokokPinjaman: pokok,
    tenorBulan,
    persenBunga: persenBulan,
  });
  const tag = `bulanan ${pokok}/${tenorBulan}bln`;
  eq(panel.bunga, sim.bungaTotal, `${tag}: Imbal Hasil = bunga total tenor`);
  eq(panel.totalLunas, sim.totalPengembalian, `${tag}: kewajiban = total simulasi`);
  eq(
    panel.potonganAdmin,
    Math.floor((sim.bungaTotal * 13) / 60),
    `${tag}: porsi platform 13/60 marjin`,
  );
  eq(
    panel.pendanaTerima,
    pokok + sim.bungaTotal - panel.potonganAdmin,
    `${tag}: penyedia menerima pokok + porsi pendana`,
  );
  eq(
    panel.keuntunganPendana,
    sim.bungaTotal - panel.potonganAdmin,
    `${tag}: keuntungan penyedia = 47/60 marjin`,
  );
  eq(
    panel.potonganAdmin + panel.pendanaTerima + sim.biayaAdminCicilanTotal,
    sim.totalPengembalian,
    `${tag}: biaya admin cicilan adalah pos terpisah, tidak ikut dibagi`,
  );
}

// Tenor 3 bulan dengan marjin 60%: porsi platform 13% pokok (Rp130.000),
// bukan lagi 5% dari total kembali (Rp80.000).
const tigaBulan = bagiHasilPinjamanDari({
  pokokPinjaman: 1_000_000,
  tenorBulan: 3,
  persenBunga: 20,
});
eq(tigaBulan.bunga, 600_000, "3 bulan @20%/bulan: marjin Rp600.000");
eq(tigaBulan.potonganAdmin, 130_000, "porsi platform 13/60 × Rp600.000 = Rp130.000");
eq(tigaBulan.keuntunganPendana, 470_000, "porsi pendana 47/60 × Rp600.000 = Rp470.000");

// ===== Perpanjangan: Imbal Hasil = akumulasi bunga =====
const diperpanjang = bagiHasilPinjamanDari({
  pokokPinjaman: 1_000_000,
  tenorBulan: null,
  persenBunga: 30,
  bungaTerbayar: 650_000,
  nextInterestAmount: 320_000,
});
eq(diperpanjang.bunga, 970_000, "bunga akumulasi periode yang sudah dan akan dibayar");
eq(diperpanjang.totalLunas, 1_970_000, "total kembali = pokok awal + seluruh bunga");
eq(diperpanjang.potonganAdmin, 210_166, "porsi platform 13/60 × Rp970.000");
eq(diperpanjang.keuntunganPendana, 759_834, "porsi pendana 47/60 × Rp970.000");

// Penutupan manual menulis `nextInterestAmount: 0` pada pinjaman biasa.
// Nol itu bukan riwayat perpanjangan; marjin normal harus tetap dipakai.
const ditutupManual = bagiHasilPinjamanDari({
  pokokPinjaman: 1_000_000,
  tenorBulan: null,
  persenBunga: 30,
  nextInterestAmount: 0,
});
eq(ditutupManual.bunga, 300_000, "penutupan manual tidak menghapus marjin");
eq(ditutupManual.keuntunganPendana, 235_000, "pendana tetap menerima 47/60 marjin");

// ===== Promo bunga: hak pendana tetap, selisih ditanggung platform =====
const promo = bagiHasilPinjaman(1_000_000, 15, 30);
eq(promo.bunga, 150_000, "promo: tagihan Peminjam memakai tarif promo");
eq(promo.totalLunas, 1_150_000, "promo: total kewajiban Peminjam");
eq(promo.bungaPendana, 300_000, "promo: hak pendana memakai tarif normal");
eq(promo.pendanaTerima, 1_235_000, "promo: diterima pendana tidak turun");
eq(promo.keuntunganPendana, 235_000, "promo: keuntungan pendana tidak turun");
eq(promo.potonganAdmin, 65_000, "promo: porsi platform dari marjin normal");
eq(promo.subsidiPromo, 150_000, "promo: selisih bunga ditanggung platform");
eq(
  promo.potonganAdmin + promo.pendanaTerima - promo.subsidiPromo,
  promo.totalLunas,
  "promo: porsi platform + pendana − subsidi = tagihan Peminjam",
);

const promoDari = bagiHasilPinjamanDari({
  pokokPinjaman: 1_000_000,
  persenBunga: 15,
  promoBungaPersenNormal: 30,
});
eq(promoDari.keuntunganPendana, 235_000, "bagiHasilPinjamanDari: promo tidak memotong pendana");
eq(promoDari.subsidiPromo, 150_000, "bagiHasilPinjamanDari: subsidi promo terlihat");

// Tanpa tarif normal (atau tarif normal lebih rendah) promo diabaikan sebagai
// subsidi, sehingga data lama tidak menciptakan beban platform.
eq(bagiHasilPinjaman(1_000_000, 15).subsidiPromo, 0, "tanpa tarif normal: tanpa subsidi");
eq(
  bagiHasilPinjaman(1_000_000, 15, 10).subsidiPromo,
  0,
  "tarif normal di bawah promo diabaikan",
);
eq(
  bagiHasilPinjaman(1_000_000, 15, 30).keuntunganPendana,
  bagiHasilPinjaman(1_000_000, 30).keuntunganPendana,
  "promo dan normal memberi pendana angka yang sama",
);

// ===== Jalur harian tanpa tenor memakai fungsi harian yang sama =====
const harianDari = bagiHasilPinjamanDari({
  pokokPinjaman: 500_000,
  persenBunga: 30,
});
const harianLangsung = bagiHasilPinjaman(500_000, 30);
eq(harianDari.potonganAdmin, harianLangsung.potonganAdmin, "dua pintu harian sepakat");
eq(harianDari.pendanaTerima, harianLangsung.pendanaTerima, "diterima penyedia sama");
eq(
  bagiHasilPinjamanDari({ pokokPinjaman: 500_000 }).bunga,
  quotePinjaman({ pokokPinjaman: 500_000, persenBunga: 30 }).bunga,
  "tanpa snapshot bunga memakai tarif akad",
);

// ===== Masukan tidak sah =====
throws(() => bagiHasilPinjaman(-1, 30), "pokok negatif ditolak");
throws(() => bagiHasilPinjaman(1.5, 30), "pokok pecahan ditolak");
throws(() => bagiHasilPinjaman(1_000_000, -1), "bunga negatif ditolak");
throws(() => bagiHasilPinjaman(1_000_000, 101), "bunga >100 ditolak");

console.log(`bagiHasil.test.ts: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
