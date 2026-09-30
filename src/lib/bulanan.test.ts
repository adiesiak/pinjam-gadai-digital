/**
 * Tests engine simulasi bulanan (DP 0%, fee 2% admin + 3% platform tenor 3/6,
 * tenor lain layanan 3%, SELURUHNYA dipotong di muka, bunga 30%/25% menurun
 * untuk tenor 1–5 bulan dan 20% FLAT dari pokok penuh untuk tenor ≥ 6 bulan) —
 * dependency-free (konvensi kredit.test.ts / financial.test.ts).
 * Run: bun src/lib/bulanan.test.ts
 */
import {
  BULANAN_PRICING,
  hitungSimulasiBulanan,
  metodeBungaBulanan,
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
// 1b. Metode bunga per tenor — FLAT dari pokok penuh untuk semua tenor
eq(metodeBungaBulanan(1), "flat", "tenor 1 bln: bunga flat dari pokok penuh");
eq(metodeBungaBulanan(3), "flat", "tenor 3 bln: bunga flat dari pokok penuh");
eq(metodeBungaBulanan(5), "flat", "tenor 5 bln: bunga flat dari pokok penuh");
eq(metodeBungaBulanan(6), "flat", "tenor 6 bln: bunga flat dari pokok penuh");
eq(metodeBungaBulanan(12), "flat", "tenor 12 bln: bunga flat dari pokok penuh");
throws(() => metodeBungaBulanan(0), "metode: tenor 0 ditolak");
throws(() => metodeBungaBulanan(2.5), "metode: tenor pecahan ditolak");

// ============================================================
// 2. Contoh: Rp 5 jt / 6 bulan, bunga 20%/bulan FLAT dari pokok penuh
// ============================================================
{
  const q = hitungSimulasiBulanan(5_000_000, 6);
  eq(q.dp, 0, "5jt/6bln: DP 0");
  eq(q.pokokDibiayai, 5_000_000, "5jt/6bln: pokok dibiayai = pokok");
  eq(q.persenBungaPerBulan, 20, "5jt/6bln: bunga 20%/bln");
  eq(q.metodeBunga, "flat", "5jt/6bln: metode bunga flat dari pokok penuh");
  eq(q.biayaAdminTotal, 100_000, "5jt/6bln: biaya admin 2% = 100rb");
  eq(q.biayaPlatformTotal, 150_000, "5jt/6bln: biaya platform 3% = 150rb");
  eq(q.biayaLayananTotal, 250_000, "5jt/6bln: total biaya tenor 5% = 250rb");
  eq(q.potonganDiMuka, 250_000, "5jt/6bln: seluruh biaya dipotong di muka");
  eq(q.danaDiterima, 4_750_000, "5jt/6bln: dana diterima = pokok − 5%");
  eq(q.biayaLayananPerBulan, 0, "5jt/6bln: biaya tidak diangsur (0 per bulan)");
  eq(q.jadwal[0].biayaAdmin, 0, "5jt/6bln: admin tidak masuk cicilan");
  eq(q.jadwal[0].biayaPlatform, 0, "5jt/6bln: platform tidak masuk cicilan");
  eq(q.jadwal[5].biayaAdmin, 0, "5jt/6bln: admin bulan terakhir juga nol");
  eq(q.jadwal[5].biayaPlatform, 0, "5jt/6bln: platform bulan terakhir juga nol");
  eq(q.bungaPerBulan, 1_000_000, "5jt/6bln: bunga bulan pertama 1jt (20% pokok penuh)");
  eq(q.jadwal[1].bunga, 1_000_000, "5jt/6bln: bunga bulan kedua tetap 1jt (bukan menurun)");
  eq(q.jadwal[2].bunga, 1_000_000, "5jt/6bln: bunga bulan ketiga tetap 1jt");
  eq(q.jadwal[3].bunga, 1_000_000, "5jt/6bln: bunga bulan keempat tetap 1jt");
  eq(q.jadwal[4].bunga, 1_000_000, "5jt/6bln: bunga bulan kelima tetap 1jt");
  eq(q.jadwal[5].bunga, 1_000_000, "5jt/6bln: bunga bulan keenam tetap 1jt");
  eq(
    q.jadwal.map((r) => r.total).join(","),
    "1833333,1833333,1833333,1833333,1833333,1833335",
    "5jt/6bln: cicilan rata karena bunga flat dari pokok penuh",
  );
  eq(q.jadwal[0].pokok, 833_333, "5jt/6bln: pokok/bln 833.333");
  eq(q.cicilanPerBulan, 1_833_333, "5jt/6bln: cicilan bulan pertama = pokok + bunga");
  // Bulan terakhir menyerap sisa: 833.333×5 = 4.166.665 → terakhir 833.335.
  eq(q.jadwal[5].pokok, 833_335, "5jt/6bln: pokok bulan terakhir 833.335");
  eq(q.cicilanTerakhir, 1_833_335, "5jt/6bln: cicilan terakhir = sisa pokok + bunga flat");
  eq(q.totalPengembalian, 11_000_000, "5jt/6bln: total cicilan = pokok + bunga flat 6×1jt");
  eq(q.totalKeuntunganBersih, 6_250_000, "5jt/6bln: biaya total = potongan di muka + bunga");
  eq(q.persentaseProfitTotal, 125, "5jt/6bln: biaya total 125% dari pokok");
  eq(q.bungaTotal, 6_000_000, "5jt/6bln: bunga total flat 20% × 6 bulan");
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
  // Biaya total tenor resmi tetap di bawah batas profit 130%.
  ok(
    q.persentaseProfitTotal < BULANAN_PRICING.maxProfitTotalPersen,
    "biaya total < batas 130%",
  );
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
  eq(q.potonganDiMuka, 30_000, "1jt/1bln: layanan 3% dipotong di muka");
  eq(q.danaDiterima, 970_000, "1jt/1bln: dana diterima 970rb");
  eq(q.cicilanPerBulan, 1_300_000, "1jt/1bln: cicilan 1.300.000 (pokok + bunga)");
  eq(q.cicilanTerakhir, 1_300_000, "1jt/1bln: cicilan tunggal = terakhir");
  eq(q.totalPengembalian, 1_300_000, "1jt/1bln: total cicilan = pokok + bunga 30%");
  eq(q.persentaseProfitTotal, 33, "1jt/1bln: biaya total 33% (bunga 30% + layanan 3%)");
}

// ============================================================
// 4. Tenor 3 bulan (bunga 25% flat dari pokok penuh)
// ============================================================
{
  const q = hitungSimulasiBulanan(1_000_000, 3);
  eq(q.persenBungaPerBulan, 25, "1jt/3bln: bunga 25% per bulan");
  eq(q.metodeBunga, "flat", "1jt/3bln: metode bunga flat dari pokok penuh");
  eq(q.bungaPerBulan, 250_000, "1jt/3bln: bunga bulan pertama 250.000 (25% pokok penuh)");
  eq(q.jadwal[1].bunga, 250_000, "1jt/3bln: bunga bulan kedua tetap 250.000");
  eq(q.jadwal[2].bunga, 250_000, "1jt/3bln: bunga bulan ketiga tetap 250.000");
  eq(q.jadwal[0].pokok, 333_333, "1jt/3bln: pokok/bln 333.333");
  eq(q.jadwal[2].pokok, 333_334, "1jt/3bln: bulan terakhir 333.334");
  eq(q.biayaAdminTotal, 20_000, "1jt/3bln: biaya admin 2% = 20rb");
  eq(q.biayaPlatformTotal, 30_000, "1jt/3bln: biaya platform 3% = 30rb");
  eq(q.biayaLayananTotal, 50_000, "1jt/3bln: total biaya 5% = 50rb");
  eq(q.danaDiterima, 950_000, "1jt/3bln: dana diterima 950rb");
  eq(q.cicilanPerBulan, 583_333, "1jt/3bln: cicilan pertama = pokok + bunga");
  eq(q.jadwal[1].total, 583_333, "1jt/3bln: cicilan kedua rata");
  eq(q.jadwal[2].total, 583_334, "1jt/3bln: cicilan terakhir menyerap sisa pokok");
  eq(q.totalPengembalian, 1_750_000, "1jt/3bln: total = pokok + 3 × bunga flat");
  eq(q.bungaTotal, 750_000, "1jt/3bln: bunga total = 25% × 3 bulan");
  eq(q.persentaseProfitTotal, 80, "1jt/3bln: biaya total 80%");
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
      q.potonganDiMuka,
      tenor === 1
        ? q.biayaLayananTotal
        : q.biayaAdminTotal + q.biayaPlatformTotal,
      `${pokok}/${tenor}bln: potongan di muka = admin + platform (atau layanan)`,
    );
    eq(
      q.danaDiterima,
      pokok - q.potonganDiMuka,
      `${pokok}/${tenor}bln: dana diterima = pokok − potongan di muka`,
    );
    eq(
      q.jadwal.reduce((a, r) => a + r.biayaLayanan, 0),
      0,
      `${pokok}/${tenor}bln: tidak ada biaya di dalam cicilan`,
    );
    eq(
      q.jadwal.reduce((a, r) => a + r.total, 0),
      q.totalPengembalian,
      `${pokok}/${tenor}bln: Σ total = totalPengembalian`,
    );
    // Bunga flat: cicilan rata; bulan terakhir hanya menyerap pembulatan pokok.
    ok(
      q.cicilanTerakhir >= q.cicilanPerBulan &&
        q.cicilanTerakhir - q.cicilanPerBulan < tenor,
      `${pokok}/${tenor}bln: cicilan rata (selisih hanya pembulatan pokok)`,
    );
    eq(
      q.totalKeuntunganBersih,
      q.potonganDiMuka + q.bungaTotal,
      `${pokok}/${tenor}bln: biaya total = potongan di muka + bunga`,
    );
    ok(
      q.persentaseProfitTotal < BULANAN_PRICING.maxProfitTotalPersen,
      `${pokok}/${tenor}bln: biaya total < batas profit`,
    );
    // Seluruh tenor memakai bunga flat: setiap baris sama besar.
    eq(q.metodeBunga, "flat", `${pokok}/${tenor}bln: metode bunga flat`);
    ok(
      q.jadwal.every((r) => r.bunga === q.bungaPerBulan),
      `${pokok}/${tenor}bln: bunga setiap bulan sama (flat dari pokok penuh)`,
    );
    eq(
      q.bungaTotal,
      q.bungaPerBulan * tenor,
      `${pokok}/${tenor}bln: bunga total = bunga bulanan × tenor`,
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
