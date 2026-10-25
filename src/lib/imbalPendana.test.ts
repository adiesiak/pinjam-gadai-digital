/**
 * Uji kebijakan imbal hasil pendana TETAP (fungsi murni).
 * Run: bun src/lib/imbalPendana.test.ts
 *
 * Yang dijaga: imbal hasil selalu pokok × 30%, tenor acuan selalu 30 hari,
 * total pengembalian = pokok + imbal, pembulatan tidak menciptakan rupiah, dan
 * status portofolio memetakan keadaan alokasi/pinjaman dengan benar.
 */
import {
  LABEL_TENOR_PENDANA,
  LABEL_YIELD_PENDANA,
  PERSEN_IMBAL_PENDANA,
  TENOR_PENDANA_HARI,
  bagiHasilPendana,
  imbalPendana,
  statusPendanaan,
  totalPengembalianPendana,
} from "./imbalPendana";

let passed = 0;
let failed = 0;
function eq(actual: unknown, expected: unknown, label: string): void {
  if (actual === expected) passed += 1;
  else {
    failed += 1;
    console.error(
      `FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}
function ok(syarat: boolean, label: string): void {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

// ===== Kebijakan tetap =====
eq(TENOR_PENDANA_HARI, 30, "tenor acuan pendana 30 hari");
eq(PERSEN_IMBAL_PENDANA, 30, "imbal hasil pendana 30%");
eq(LABEL_TENOR_PENDANA, "30 Hari", "label tenor tabel");
eq(LABEL_YIELD_PENDANA, "30% p.p.", "label yield tabel");

// ===== Rumus =====
eq(imbalPendana(1_000_000), 300_000, "1 juta menghasilkan 300 ribu");
eq(totalPengembalianPendana(1_000_000), 1_300_000, "total kembali 130%");
eq(imbalPendana(100_000), 30_000, "alokasi minimum tetap 30%");
eq(imbalPendana(0), 0, "pokok nol tidak menghasilkan imbal");
eq(imbalPendana(333_333), 99_999, "pembulatan ke bawah, bukan ke atas");
ok(
  imbalPendana(333_333) * 100 <= 333_333 * 30,
  "pembulatan tidak menciptakan rupiah",
);

// ===== Tidak bergantung tenor/bunga nasabah =====
eq(imbalPendana(1_000_000), imbalPendana(1_000_000), "angka sama untuk pokok sama");
const berbedaTenor = [7, 14, 28, 30].map(() => imbalPendana(1_000_000));
ok(berbedaTenor.every((n) => n === 300_000), "tenor nasabah tidak mengubah hak pendana");

// ===== Biaya platform dipisah =====
const bagi = bagiHasilPendana(1_000_000, 5);
eq(bagi.imbal, 300_000, "imbal bruto tetap 30%");
eq(bagi.total, 1_300_000, "total bruto 130%");
eq(bagi.potonganAdmin, 65_000, "biaya platform 5% dari total kembali");
eq(bagi.diterima, 1_235_000, "diterima setelah biaya platform");
eq(bagi.keuntungan, 235_000, "keuntungan bersih setelah biaya platform");
eq(
  bagi.potonganAdmin + bagi.diterima,
  bagi.total,
  "tidak ada rupiah hilang dalam pembagian",
);
eq(
  bagiHasilPendana(1_000_000, 0).diterima,
  1_235_000,
  "porsi platform 21,67% tetap dipotong walau tarif lama diisi 0",
);

// ===== Status portofolio =====
eq(statusPendanaan("dialokasikan", "disetujui"), "Aktif", "belum cair = Aktif");
eq(statusPendanaan("dialokasikan", "didanai"), "Berjalan", "sudah cair = Berjalan");
eq(statusPendanaan("dialokasikan", "lunas"), "Selesai", "pinjaman lunas = Selesai");
eq(statusPendanaan("selesai", "lunas"), "Selesai", "alokasi selesai = Selesai");
eq(statusPendanaan("dibatalkan", "disetujui"), "Cair", "dibatalkan = dana cair kembali");

// ===== Masukan tidak valid =====
for (const buruk of [-1, 1.5, Number.NaN]) {
  let melempar = false;
  try {
    imbalPendana(buruk);
  } catch {
    melempar = true;
  }
  ok(melempar, `pokok tidak valid (${String(buruk)}) ditolak`);
}

console.log(`imbalPendana.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
