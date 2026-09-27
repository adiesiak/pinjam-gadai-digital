/**
 * Tests engine simulasi bulanan (DP 0%, layanan 3%, bunga 10/8/7,5) —
 * dependency-free (konvensi kredit.test.ts / financial.test.ts).
 * Run: bun src/lib/bulanan.test.ts
 */
import {
  BULANAN_PRICING,
  hitungSimulasiBulanan,
  persenBungaPerBulan,
  TENOR_BULANAN_OPTIONS,
} from "./bulanan";
import { percentOf } from "./money";

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

function ok(cond: boolean, label: string) {
  if (cond) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`FAIL ${label}`);
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

// ============================================================
// 1. Persen bunga per tenor — formula user verbatim
// ============================================================
eq(persenBungaPerBulan(1), 10, "bunga tenor 1 bln = 10%");
eq(persenBungaPerBulan(2), 10, "bunga tenor 2 bln default 10%");
eq(persenBungaPerBulan(3), 8, "bunga tenor 3 bln = 8%");
eq(persenBungaPerBulan(5), 8, "bunga tenor 5 bln = 8%");
eq(persenBungaPerBulan(6), 7.5, "bunga tenor 6 bln = 7,5%");
eq(persenBungaPerBulan(12), 7.5, "bunga tenor 12 bln = 7,5%");
throws(() => persenBungaPerBulan(0), "tenor 0 ditolak");
throws(() => persenBungaPerBulan(-3), "tenor negatif ditolak");
throws(() => persenBungaPerBulan(1.5), "tenor pecahan ditolak");

// ============================================================
// 2. Contoh user: Rp 5 jt / 6 bulan → cicilan 1.233.333, profit 48%
// ============================================================
{
  const q = hitungSimulasiBulanan(5_000_000, 6);
  eq(q.dp, 0, "5jt/6bln: DP 0");
  eq(q.pokokDibiayai, 5_000_000, "5jt/6bln: pokok dibiayai = pokok");
  eq(q.persenBungaPerBulan, 7.5, "5jt/6bln: bunga 7,5%/bln");
  eq(q.biayaLayananTotal, 150_000, "5jt/6bln: layanan total 3% = 150rb");
  eq(q.biayaLayananPerBulan, 25_000, "5jt/6bln: layanan/bln 25rb");
  eq(q.bungaPerBulan, 375_000, "5jt/6bln: bunga/bln 375rb");
  eq(q.jadwal[0].pokok, 833_333, "5jt/6bln: pokok/bln 833.333");
  eq(q.cicilanPerBulan, 1_233_333, "5jt/6bln: cicilan 1.233.333 (sesuai user)");
  // Bulan terakhir menyerap sisa: 833.333×5 = 4.166.665 → terakhir 833.335.
  eq(q.jadwal[5].pokok, 833_335, "5jt/6bln: pokok bulan terakhir 833.335");
  eq(q.cicilanTerakhir, 1_233_335, "5jt/6bln: cicilan terakhir menyerap sisa");
  eq(q.totalPengembalian, 7_400_000, "5jt/6bln: total ±7,4jt");
  eq(q.totalKeuntunganBersih, 2_400_000, "5jt/6bln: profit 2,4jt");
  eq(q.persentaseProfitTotal, 48, "5jt/6bln: profit 48%");
  eq(q.bungaTotal, 2_250_000, "5jt/6bln: bunga total 6×375rb");
  // Identitas: Σ pokok jadwal = pokok dibiayai.
  eq(
    q.jadwal.reduce((a, r) => a + r.pokok, 0),
    q.pokokDibiayai,
    "5jt/6bln: Σ pokok jadwal = pokok dibiayai",
  );
  eq(
    q.jadwal.reduce((a, r) => a + r.total, 0),
    q.totalPengembalian,
    "5jt/6bln: Σ total jadwal = total pengembalian",
  );
  // Profit selalu di bawah batas 50%.
  ok(q.persentaseProfitTotal < BULANAN_PRICING.maxProfitTotalPersen, "profit < 50%");
}

// ============================================================
// 3. Tenor 1 bulan (bunga 10%) — skema paling pendek
// ============================================================
{
  const q = hitungSimulasiBulanan(1_000_000, 1);
  eq(q.persenBungaPerBulan, 10, "1jt/1bln: bunga 10%");
  eq(q.bungaPerBulan, 100_000, "1jt/1bln: bunga 100rb");
  eq(q.biayaLayananTotal, 30_000, "1jt/1bln: layanan 30rb");
  eq(q.cicilanPerBulan, 1_130_000, "1jt/1bln: cicilan 1.130.000");
  eq(q.cicilanTerakhir, 1_130_000, "1jt/1bln: cicilan tunggal = terakhir");
  eq(q.totalPengembalian, 1_130_000, "1jt/1bln: total 113%");
  eq(q.persentaseProfitTotal, 13, "1jt/1bln: profit 13%");
}

// ============================================================
// 4. Tenor 3 bulan (bunga 8%) — pembulatan tidak rata
// ============================================================
{
  const q = hitungSimulasiBulanan(1_000_000, 3);
  eq(q.persenBungaPerBulan, 8, "1jt/3bln: bunga 8%");
  eq(q.jadwal[0].pokok, 333_333, "1jt/3bln: pokok/bln 333.333");
  eq(q.jadwal[2].pokok, 333_334, "1jt/3bln: bulan terakhir 333.334");
  eq(q.cicilanPerBulan, 333_333 + 80_000 + 10_000, "1jt/3bln: cicilan 423.333");
  eq(q.totalPengembalian, 1_270_000, "1jt/3bln: total 1.270.000");
  eq(q.persentaseProfitTotal, 27, "1jt/3bln: profit 27%");
  // Identitas tiap baris jadwal.
  for (const r of q.jadwal) {
    eq(r.total, r.pokok + r.bunga + r.biayaLayanan, `1jt/3bln bulan ${r.bulan}: total = komponen`);
  }
}

// ============================================================
// 5. Identitas eksak untuk seluruh matriks pokok × tenor
// ============================================================
const POKOK_LIST = [100_000, 150_000, 1_000_000, 2_500_000, 7_777_777, 100_000_000];
for (const pokok of POKOK_LIST) {
  for (const tenor of TENOR_BULANAN_OPTIONS) {
    const q = hitungSimulasiBulanan(pokok, tenor);
    eq(q.dp, 0, `${pokok}/${tenor}bln: DP 0`);
    eq(q.pokokDibiayai, pokok, `${pokok}/${tenor}bln: pokok dibiayai`);
    eq(
      q.jadwal.reduce((a, r) => a + r.pokok, 0),
      pokok,
      `${pokok}/${tenor}bln: Σ pokok = pokok`,
    );
    eq(
      q.jadwal.reduce((a, r) => a + r.bunga, 0),
      q.bungaTotal,
      `${pokok}/${tenor}bln: Σ bunga = bungaTotal`,
    );
    eq(
      q.jadwal.reduce((a, r) => a + r.biayaLayanan, 0),
      q.biayaLayananTotal,
      `${pokok}/${tenor}bln: Σ layanan = layananTotal`,
    );
    eq(
      q.jadwal.reduce((a, r) => a + r.total, 0),
      q.totalPengembalian,
      `${pokok}/${tenor}bln: Σ total = totalPengembalian`,
    );
    eq(
      q.totalPengembalian,
      q.cicilanPerBulan * (tenor - 1) + q.cicilanTerakhir,
      `${pokok}/${tenor}bln: total = (n−1)×cicilan + cicilan terakhir`,
    );
    eq(
      q.totalKeuntunganBersih,
      q.totalPengembalian - pokok,
      `${pokok}/${tenor}bln: profit = total − pokok`,
    );
    ok(
      q.persentaseProfitTotal < BULANAN_PRICING.maxProfitTotalPersen,
      `${pokok}/${tenor}bln: profit < 50%`,
    );
    // Setiap komponen rupiah bulat.
    for (const r of q.jadwal) {
      ok(
        Number.isInteger(r.pokok) &&
          Number.isInteger(r.bunga) &&
          Number.isInteger(r.biayaLayanan) &&
          Number.isInteger(r.total) &&
          Number.isInteger(r.sisaPokok),
        `${pokok}/${tenor}bln bulan ${r.bulan}: semua komponen integer`,
      );
    }
    // Sisa pokok menurun monoton hingga nol.
    eq(q.jadwal[q.jadwal.length - 1].sisaPokok, 0, `${pokok}/${tenor}bln: sisa akhir 0`);
  }
}

// ============================================================
// 6. Pembulatan HALF-UP pada bunga 7,5% — percentOf yang sama
// ============================================================
eq(percentOf(150_000, 7.5), 11_250, "7,5% dari 150rb = 11.250 (HALF-UP)");
eq(percentOf(1_000_000, 7.5), 75_000, "7,5% dari 1jt = 75.000");
eq(percentOf(10, 7.5), 1, "7,5% dari Rp10 = 0,75 → membulat naik ke 1 (HALF-UP)");
eq(percentOf(1, 7.5), 0, "7,5% dari Rp1 = 0,075 → membulat turun ke 0 (ambang 0,5)");

// ============================================================
// 7. Validasi input
// ============================================================
throws(() => hitungSimulasiBulanan(0, 3), "pokok 0 ditolak");
throws(() => hitungSimulasiBulanan(50_000, 3), "pokok di bawah minimum ditolak");
throws(() => hitungSimulasiBulanan(600_000_000, 3), "pokok di atas maksimum ditolak");
throws(() => hitungSimulasiBulanan(1_000_000, 0), "tenor 0 ditolak");
throws(() => hitungSimulasiBulanan(1_000_000, -1), "tenor negatif ditolak");
throws(() => hitungSimulasiBulanan(1_000.5 as never, 3), "pokok desimal ditolak");

console.log(`bulanan.test.ts: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
