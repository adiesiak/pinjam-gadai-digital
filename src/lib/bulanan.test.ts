/**
 * Tests engine simulasi bulanan (DP 0%, fee 2% di muka — admin pada tenor 3/6,
 * layanan pada tenor 1, platform dihapus; biaya admin cicilan 2% pada SETIAP
 * pembayaran bulanan; bunga flat per tenor) — dependency-free (konvensi
 * kredit.test.ts / financial.test.ts).
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
eq(persenBungaPerBulan(3), 35, "bunga tenor 3 bln = 35% per bulan");
eq(persenBungaPerBulan(5), 35, "bunga tenor 5 bln = 35% per bulan");
eq(persenBungaPerBulan(6), 30, "bunga tenor 6 bln = 30% per bulan");
eq(persenBungaPerBulan(12), 30, "bunga tenor 12 bln = 30% per bulan");
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
// 2. Contoh: Rp 5 jt / 6 bulan, bunga 30%/bulan FLAT dari pokok penuh
// ============================================================
{
  const q = hitungSimulasiBulanan(5_000_000, 6);
  eq(q.dp, 0, "5jt/6bln: DP 0");
  eq(q.pokokDibiayai, 5_000_000, "5jt/6bln: pokok dibiayai = pokok");
  eq(q.persenBungaPerBulan, 30, "5jt/6bln: bunga 30%/bln");
  eq(q.metodeBunga, "flat", "5jt/6bln: metode bunga flat dari pokok penuh");
  eq(q.biayaAdminTotal, 100_000, "5jt/6bln: biaya admin 2% = 100rb");
  eq(q.biayaPlatformTotal, 0, "5jt/6bln: biaya platform 0% (dihapus)");
  eq(q.biayaLayananTotal, 100_000, "5jt/6bln: total potongan di muka 2% = 100rb");
  eq(q.potonganDiMuka, 100_000, "5jt/6bln: seluruh biaya dipotong di muka");
  eq(q.danaDiterima, 4_900_000, "5jt/6bln: dana diterima = pokok − 2%");
  eq(q.biayaLayananPerBulan, 0, "5jt/6bln: biaya tidak diangsur (0 per bulan)");
  eq(q.jadwal[0].biayaAdmin, 0, "5jt/6bln: admin tidak masuk cicilan");
  eq(q.jadwal[0].biayaPlatform, 0, "5jt/6bln: platform tidak masuk cicilan");
  eq(q.jadwal[5].biayaAdmin, 0, "5jt/6bln: admin bulan terakhir juga nol");
  eq(q.jadwal[5].biayaPlatform, 0, "5jt/6bln: platform bulan terakhir juga nol");
  eq(q.bungaPerBulan, 1_500_000, "5jt/6bln: bunga bulan pertama 1,5jt (30% pokok penuh)");
  eq(q.jadwal[1].bunga, 1_500_000, "5jt/6bln: bunga bulan kedua tetap 1,5jt (bukan menurun)");
  eq(q.jadwal[2].bunga, 1_500_000, "5jt/6bln: bunga bulan ketiga tetap 1,5jt");
  eq(q.jadwal[3].bunga, 1_500_000, "5jt/6bln: bunga bulan keempat tetap 1,5jt");
  eq(q.jadwal[4].bunga, 1_500_000, "5jt/6bln: bunga bulan kelima tetap 1,5jt");
  eq(q.jadwal[5].bunga, 1_500_000, "5jt/6bln: bunga bulan keenam tetap 1,5jt");
  eq(
    q.jadwal.map((r) => r.total).join(","),
    "2380000,2380000,2380000,2380000,2380000,2380002",
    "5jt/6bln: total bayar rata = cicilan + biaya admin cicilan 2%",
  );
  eq(q.jadwal[0].pokok, 833_333, "5jt/6bln: pokok/bln 833.333");
  eq(q.biayaAdminCicilanPerBulan, 46_667, "5jt/6bln: biaya admin cicilan 2% dari 2.333.333");
  eq(q.biayaAdminCicilanTotal, 280_002, "5jt/6bln: total biaya admin cicilan 6 bulan");
  eq(
    q.cicilanPerBulan,
    2_380_000,
    "5jt/6bln: bayar bulan pertama = pokok + bunga + admin 2%",
  );
  // Bulan terakhir menyerap sisa: 833.333×5 = 4.166.665 → terakhir 833.335.
  eq(q.jadwal[5].pokok, 833_335, "5jt/6bln: pokok bulan terakhir 833.335");
  eq(q.cicilanTerakhir, 2_380_002, "5jt/6bln: bayar bulan terakhir termasuk sisa pokok");
  eq(q.totalPengembalian, 14_280_002, "5jt/6bln: total bayar = bunga 9jt + biaya cicilan");
  eq(
    q.totalKeuntunganBersih,
    9_380_002,
    "5jt/6bln: biaya total = potongan di muka + bunga + admin cicilan",
  );
  eq(q.persentaseProfitTotal, 187.6, "5jt/6bln: biaya total 187,6% dari pokok");
  eq(q.bungaTotal, 9_000_000, "5jt/6bln: bunga total flat 30% × 6 bulan");
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
  // Biaya total tenor resmi tetap di bawah batas profit.
  ok(
    q.persentaseProfitTotal < BULANAN_PRICING.maxProfitTotalPersen,
    "biaya total < batas profit",
  );
}

// ============================================================
// 3. Tenor 1 bulan (bunga 30% per bulan) — skema paling pendek
// ============================================================
{
  const q = hitungSimulasiBulanan(1_000_000, 1);
  eq(q.persenBungaPerBulan, 30, "1jt/1bln: bunga 30% per bulan");
  eq(q.bungaPerBulan, 300_000, "1jt/1bln: bunga 300rb");
  eq(q.biayaLayananTotal, 20_000, "1jt/1bln: layanan tenor pendek 2% = 20rb");
  eq(q.biayaAdminTotal, 0, "1jt/1bln: tidak ada biaya admin baru");
  eq(q.biayaPlatformTotal, 0, "1jt/1bln: tidak ada biaya platform baru");
  eq(q.potonganDiMuka, 20_000, "1jt/1bln: layanan 2% dipotong di muka");
  eq(q.danaDiterima, 980_000, "1jt/1bln: dana diterima 980rb");
  eq(q.biayaAdminCicilanPerBulan, 26_000, "1jt/1bln: admin cicilan 2% dari 1.300.000");
  eq(q.biayaAdminCicilanTotal, 26_000, "1jt/1bln: satu pembayaran bulanan tetap dikenai admin cicilan");
  eq(q.cicilanPerBulan, 1_326_000, "1jt/1bln: cicilan = pokok + bunga + admin cicilan");
  eq(q.cicilanTerakhir, 1_326_000, "1jt/1bln: cicilan tunggal = terakhir");
  eq(q.totalPengembalian, 1_326_000, "1jt/1bln: total cicilan = pokok + bunga 30% + admin cicilan");
  eq(q.persentaseProfitTotal, 34.6, "1jt/1bln: biaya total 34,6% (bunga 30% + layanan 2% + admin cicilan 2,6%)");
}

// ============================================================
// 4. Tenor 3 bulan (bunga 35% flat dari pokok penuh)
// ============================================================
{
  const q = hitungSimulasiBulanan(1_000_000, 3);
  eq(q.persenBungaPerBulan, 35, "1jt/3bln: bunga 35% per bulan");
  eq(q.metodeBunga, "flat", "1jt/3bln: metode bunga flat dari pokok penuh");
  eq(q.bungaPerBulan, 350_000, "1jt/3bln: bunga bulan pertama 350.000 (35% pokok penuh)");
  eq(q.jadwal[1].bunga, 350_000, "1jt/3bln: bunga bulan kedua tetap 350.000");
  eq(q.jadwal[2].bunga, 350_000, "1jt/3bln: bunga bulan ketiga tetap 350.000");
  eq(q.jadwal[0].pokok, 333_333, "1jt/3bln: pokok/bln 333.333");
  eq(q.jadwal[2].pokok, 333_334, "1jt/3bln: bulan terakhir 333.334");
  eq(q.biayaAdminTotal, 20_000, "1jt/3bln: biaya admin 2% = 20rb");
  eq(q.biayaPlatformTotal, 0, "1jt/3bln: biaya platform 0% (dihapus)");
  eq(q.biayaLayananTotal, 20_000, "1jt/3bln: total potongan di muka 2% = 20rb");
  eq(q.danaDiterima, 980_000, "1jt/3bln: dana diterima 980rb");
  eq(q.biayaAdminCicilanPerBulan, 13_667, "1jt/3bln: biaya admin cicilan 2% dari 683.333");
  eq(q.biayaAdminCicilanTotal, 41_001, "1jt/3bln: total biaya admin cicilan 3 bulan");
  eq(q.cicilanPerBulan, 697_000, "1jt/3bln: bayar bulan pertama = 683.333 + 2%");
  eq(q.jadwal[1].total, 697_000, "1jt/3bln: bayar bulan kedua rata");
  eq(q.jadwal[2].total, 697_001, "1jt/3bln: bayar bulan terakhir menyerap sisa pokok");
  eq(q.totalPengembalian, 2_091_001, "1jt/3bln: total = bunga flat + biaya admin cicilan");
  eq(q.bungaTotal, 1_050_000, "1jt/3bln: bunga total = 35% × 3 bulan");
  eq(q.persentaseProfitTotal, 111.1, "1jt/3bln: biaya total 111,1%");
  // Identitas tiap baris jadwal: total = pokok + bunga + biaya admin cicilan.
  for (const r of q.jadwal) {
    eq(
      r.total,
      r.pokok + r.bunga + r.biayaAdminCicilan,
      `1jt/3bln bulan ${r.bulan}: total = komponen`,
    );
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
      q.potonganDiMuka + q.bungaTotal + q.biayaAdminCicilanTotal,
      `${pokok}/${tenor}bln: biaya total = potongan di muka + bunga + admin cicilan`,
    );
    // Biaya admin cicilan berlaku pada setiap pembayaran bulanan tenor resmi.
    ok(
      q.jadwal.every((r) => r.biayaAdminCicilan > 0),
      `${pokok}/${tenor}bln: setiap bulan dikenai biaya admin cicilan 2%`,
    );
    eq(
      q.biayaAdminCicilanTotal,
      q.jadwal.reduce((a, r) => a + r.biayaAdminCicilan, 0),
      `${pokok}/${tenor}bln: Σ biaya admin cicilan = totalnya`,
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
