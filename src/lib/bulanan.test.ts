/**
 * Tests engine simulasi bulanan (DP 0%, fee 5% admin + 2% platform tenor 3/6,
 * tenor lain layanan 3%, bunga 30/25/20 per bulan) —
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
eq(persenBungaPerBulan(1), 30, "bunga tenor 1 bln = 30% per bulan");
eq(persenBungaPerBulan(2), 30, "bunga tenor 2 bln default 30% per bulan");
eq(persenBungaPerBulan(3), 25, "bunga tenor 3 bln = 25% per bulan");
eq(persenBungaPerBulan(5), 25, "bunga tenor 5 bln = 25% per bulan");
eq(persenBungaPerBulan(6), 20, "bunga tenor 6 bln = 20% per bulan");
eq(persenBungaPerBulan(12), 20, "bunga tenor 12 bln = 20% per bulan");
throws(() => persenBungaPerBulan(0), "tenor 0 ditolak");
throws(() => persenBungaPerBulan(-3), "tenor negatif ditolak");
throws(() => persenBungaPerBulan(1.5), "tenor pecahan ditolak");

// ============================================================
// 2. Contoh: Rp 5 jt / 6 bulan, bunga 20%/bulan dari sisa pokok
// ============================================================
{
  const q = hitungSimulasiBulanan(5_000_000, 6);
  eq(q.dp, 0, "5jt/6bln: DP 0");
  eq(q.pokokDibiayai, 5_000_000, "5jt/6bln: pokok dibiayai = pokok");
  eq(q.persenBungaPerBulan, 20, "5jt/6bln: bunga 20%/bln");
  eq(q.biayaAdminTotal, 250_000, "5jt/6bln: biaya admin 5% = 250rb");
  eq(q.biayaPlatformTotal, 100_000, "5jt/6bln: biaya platform 2% = 100rb");
  eq(q.biayaLayananTotal, 350_000, "5jt/6bln: total biaya tenor 7% = 350rb");
  eq(q.biayaLayananPerBulan, 58_333, "5jt/6bln: rata-rata biaya tenor/bln dibulatkan bawah");
  eq(q.jadwal[0].biayaAdmin, 41_666, "5jt/6bln: admin bulan pertama");
  eq(q.jadwal[0].biayaPlatform, 16_666, "5jt/6bln: platform bulan pertama");
  eq(q.jadwal[5].biayaAdmin, 41_670, "5jt/6bln: admin bulan terakhir menyerap sisa");
  eq(q.jadwal[5].biayaPlatform, 16_670, "5jt/6bln: platform bulan terakhir menyerap sisa");
  eq(q.bungaPerBulan, 1_000_000, "5jt/6bln: bunga bulan pertama 1jt");
  eq(q.jadwal[1].bunga, 833_333, "5jt/6bln: bunga bulan kedua atas sisa pokok");
  eq(q.jadwal[2].bunga, 666_667, "5jt/6bln: bunga bulan ketiga atas sisa pokok");
  eq(q.jadwal[3].bunga, 500_000, "5jt/6bln: bunga bulan keempat atas sisa pokok");
  eq(q.jadwal[4].bunga, 333_334, "5jt/6bln: bunga bulan kelima dibulatkan HALF-UP");
  eq(q.jadwal[5].bunga, 166_667, "5jt/6bln: bunga bulan keenam atas sisa pokok");
  eq(
    q.jadwal.map((r) => r.total).join(","),
    "1891665,1724998,1558332,1391665,1224999,1058342",
    "5jt/6bln: seluruh cicilan menurun sesuai saldo pokok",
  );
  eq(q.jadwal[0].pokok, 833_333, "5jt/6bln: pokok/bln 833.333");
  eq(q.cicilanPerBulan, 1_891_665, "5jt/6bln: cicilan bulan pertama termasuk biaya 7%");
  // Bulan terakhir menyerap sisa: 833.333×5 = 4.166.665 → terakhir 833.335.
  eq(q.jadwal[5].pokok, 833_335, "5jt/6bln: pokok bulan terakhir 833.335");
  eq(q.cicilanTerakhir, 1_058_342, "5jt/6bln: cicilan terakhir dari sisa pokok dan biaya");
  eq(q.totalPengembalian, 8_850_001, "5jt/6bln: total dengan bunga saldo menurun dan biaya 7%");
  eq(q.totalKeuntunganBersih, 3_850_001, "5jt/6bln: keuntungan termasuk biaya admin/platform");
  eq(q.persentaseProfitTotal, 77, "5jt/6bln: profit 77%");
  eq(q.bungaTotal, 3_500_001, "5jt/6bln: bunga total saldo menurun");
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
  // Profit pada tenor resmi tetap di bawah batas simulasi 125%.
  ok(q.persentaseProfitTotal < BULANAN_PRICING.maxProfitTotalPersen, "profit < 125%");
}

// ============================================================
// 3. Tenor 1 bulan (bunga 30% per bulan) — skema paling pendek
// ============================================================
{
  const q = hitungSimulasiBulanan(1_000_000, 1);
  eq(q.persenBungaPerBulan, 30, "1jt/1bln: bunga 30% per bulan");
  eq(q.bungaPerBulan, 300_000, "1jt/1bln: bunga 300rb");
  eq(q.biayaLayananTotal, 30_000, "1jt/1bln: layanan tenor pendek tetap 3% = 30rb");
  eq(q.biayaAdminTotal, 0, "1jt/1bln: tidak ada biaya admin baru");
  eq(q.biayaPlatformTotal, 0, "1jt/1bln: tidak ada biaya platform baru");
  eq(q.cicilanPerBulan, 1_330_000, "1jt/1bln: cicilan 1.330.000");
  eq(q.cicilanTerakhir, 1_330_000, "1jt/1bln: cicilan tunggal = terakhir");
  eq(q.totalPengembalian, 1_330_000, "1jt/1bln: total 133%");
  eq(q.persentaseProfitTotal, 33, "1jt/1bln: profit 33%");
}

// ============================================================
// 4. Tenor 3 bulan (bunga 25% per bulan) — pembulatan tidak rata
// ============================================================
{
  const q = hitungSimulasiBulanan(1_000_000, 3);
  eq(q.persenBungaPerBulan, 25, "1jt/3bln: bunga 25% per bulan");
  eq(q.bungaPerBulan, 250_000, "1jt/3bln: bunga bulan pertama 250.000");
  eq(q.jadwal[1].bunga, 166_667, "1jt/3bln: bunga bulan kedua dari sisa pokok");
  eq(q.jadwal[2].bunga, 83_334, "1jt/3bln: bunga bulan ketiga dibulatkan HALF-UP");
  eq(q.jadwal[0].pokok, 333_333, "1jt/3bln: pokok/bln 333.333");
  eq(q.jadwal[2].pokok, 333_334, "1jt/3bln: bulan terakhir 333.334");
  eq(q.biayaAdminTotal, 50_000, "1jt/3bln: biaya admin 5% = 50rb");
  eq(q.biayaPlatformTotal, 20_000, "1jt/3bln: biaya platform 2% = 20rb");
  eq(q.biayaLayananTotal, 70_000, "1jt/3bln: total biaya 7% = 70rb");
  eq(q.cicilanPerBulan, 606_665, "1jt/3bln: cicilan pertama termasuk biaya tenor 7%");
  eq(q.jadwal[1].total, 523_332, "1jt/3bln: cicilan kedua menurun");
  eq(q.jadwal[2].total, 440_004, "1jt/3bln: cicilan terakhir menyerap sisa biaya");
  eq(q.totalPengembalian, 1_570_001, "1jt/3bln: total bunga saldo menurun + biaya 7%");
  eq(q.persentaseProfitTotal, 57, "1jt/3bln: profit 57%");
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
      q.jadwal.reduce((a, r) => a + r.biayaAdmin, 0),
      q.biayaAdminTotal,
      `${pokok}/${tenor}bln: Σ admin = adminTotal`,
    );
    eq(
      q.jadwal.reduce((a, r) => a + r.biayaPlatform, 0),
      q.biayaPlatformTotal,
      `${pokok}/${tenor}bln: Σ platform = platformTotal`,
    );
    eq(
      q.jadwal.reduce((a, r) => a + r.biayaLayanan, 0),
      q.biayaLayananTotal,
      `${pokok}/${tenor}bln: Σ biaya tenor = biayaTotal`,
    );
    eq(
      q.jadwal.reduce((a, r) => a + r.total, 0),
      q.totalPengembalian,
      `${pokok}/${tenor}bln: Σ total = totalPengembalian`,
    );
    ok(
      q.jadwal[0].total >= q.cicilanTerakhir,
      `${pokok}/${tenor}bln: cicilan pertama ≥ cicilan terakhir`,
    );
    eq(
      q.totalKeuntunganBersih,
      q.totalPengembalian - pokok,
      `${pokok}/${tenor}bln: profit = total − pokok`,
    );
    ok(
      q.persentaseProfitTotal < BULANAN_PRICING.maxProfitTotalPersen,
      `${pokok}/${tenor}bln: profit < 125%`,
    );
    // Setiap komponen rupiah bulat.
    for (const r of q.jadwal) {
      ok(
        Number.isInteger(r.pokok) &&
          Number.isInteger(r.bunga) &&
          Number.isInteger(r.biayaAdmin) &&
          Number.isInteger(r.biayaPlatform) &&
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
// 6. Pembulatan HALF-UP pada bunga 20% — percentOf yang sama
// ============================================================
eq(percentOf(150_000, 20), 30_000, "20% dari 150rb = 30.000");
eq(percentOf(1_000_000, 20), 200_000, "20% dari 1jt = 200.000");
eq(percentOf(10, 20), 2, "20% dari Rp10 = Rp2");
eq(percentOf(1, 20), 0, "20% dari Rp1 = Rp0,2 → dibulatkan ke 0");

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
