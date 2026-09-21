/**
 * Financial precision tests for PINDAI (Phase 1 "Precision Calculator" style).
 * Runs with `bun test`-compatible asserts but kept dependency-free so it can
 * execute via tsx/node as a plain script.
 */
import { formatRupiah, parseRupiah, percentOf } from "./money";
import { calculateRepayment, quoteLoan, requote } from "./loan";

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

function throws(fn: () => unknown, label: string) {
  try {
    fn();
    failed += 1;
    console.error(`FAIL ${label}: expected to throw`);
  } catch {
    passed += 1;
  }
}

// ---- percentOf: exact integer half-up rounding ----
eq(percentOf(100_000, 3), 3_000, "3% dari 100.000");
eq(percentOf(100_000, 2), 2_000, "2% dari 100.000");
eq(percentOf(100_000, 30), 30_000, "30% dari 100.000");
eq(percentOf(1, 5), 0, "5% dari Rp1 = 0,05 → 0 (half-up di ≥0,5)");
eq(percentOf(10, 5), 1, "5% dari Rp10 = 0,5 → half-up ke Rp1");
eq(percentOf(33, 50), 17, "50% dari 33 → half-up 16.5 → 17");
eq(percentOf(999_999, 3), 30_000, "3% dari 999.999 (29.999,97 → 30.000)");

// ---- parseRupiah ----
eq(parseRupiah("2.500.000"), 2_500_000, "parse format Indonesia");
eq(parseRupiah("2500000"), 2_500_000, "parse digit polos");
throws(() => parseRupiah("99.999"), "di bawah minimum ditolak");
throws(() => parseRupiah("abc"), "input non-numerik ditolak");
throws(() => parseRupiah("-1000"), "negatif ditolak");

// ---- quoteLoan: formula wajib PINDAI ----
const q1 = quoteLoan(10_000_000);
eq(q1.biayaAdmin, 300_000, "Admin 3% dari 10jt");
eq(q1.biayaPlatform, 200_000, "Platform 2% dari 10jt");
eq(q1.totalPotonganDiMuka, 500_000, "Potongan 5% dari 10jt");
eq(q1.danaBersihDitransfer, 9_500_000, "Net 95% dari 10jt");
eq(q1.bunga, 3_000_000, "Bunga 30% dari 10jt");
eq(q1.totalKewajibanPelunasan, 13_000_000, "Total 130% dari 10jt");
eq(
  q1.biayaAdmin + q1.biayaPlatform,
  q1.totalPotonganDiMuka,
  "identitas potongan",
);
eq(
  q1.pokok - q1.totalPotonganDiMuka,
  q1.danaBersihDitransfer,
  "identitas net disbursement",
);
eq(
  q1.pokok + q1.bunga,
  q1.totalKewajibanPelunasan,
  "identitas total kewajiban",
);

// Odd-principal invariants must hold (no drift from float math)
for (const pokok of [123_457, 999_999, 1_000_001, 7_777_777]) {
  const q = quoteLoan(pokok);
  eq(
    q.biayaAdmin + q.biayaPlatform + q.danaBersihDitransfer,
    pokok,
    `potongan+net == pokok untuk ${pokok}`,
  );
  eq(
    q.pokok + q.bunga,
    q.totalKewajibanPelunasan,
    `pokok+bunga == total untuk ${pokok}`,
  );
  eq(q.bunga, percentOf(pokok, 30), `bunga == 30% langsung untuk ${pokok}`);
}

// requote must be deterministic from stored principal
const stored = requote(10_000_000);
eq(JSON.stringify(stored), JSON.stringify(q1), "requote identik dengan quote");

// ---- calculateRepayment: jatuh tempo, keterlambatan, denda integer exact ----
const DAY = 86_400_000;
const didanai = 1_700_000_000_000; // epoch tetap agar tes deterministik

// Belum terlambat: sisa 5 hari, denda 0.
const r1 = calculateRepayment(1_000_000, 30, didanai, didanai + 25 * DAY);
eq(r1.sisaHari, 5, "sisa 5 hari sebelum jatuh tempo");
eq(r1.hariTerlambat, 0, "belum terlambat");
eq(r1.dendaTerlambat, 0, "denda 0 saat belum terlambat");
eq(r1.totalKewajibanDenganPenalti, 1_300_000, "total tetap 130% saat belum terlambat");

// Jatuh tempo persis: sisa 0, belum terlambat, denda 0.
const r2 = calculateRepayment(1_000_000, 30, didanai, didanai + 30 * DAY);
eq(r2.sisaHari, 0, "jatuh tempo hari ini → sisa 0");
eq(r2.hariTerlambat, 0, "jatuh tempo persis belum terlambat");
eq(r2.dendaTerlambat, 0, "denda 0 pada hari jatuh tempo");

// Terlambat 1 hari: denda 0,5% = 5.000; total 1.305.000.
const r3 = calculateRepayment(1_000_000, 30, didanai, didanai + 31 * DAY);
eq(r3.hariTerlambat, 1, "terlambat 1 hari");
eq(r3.dendaTerlambat, 5_000, "denda 0,5% × 1 hari = 5.000");
eq(r3.totalKewajibanDenganPenalti, 1_305_000, "total 130% + denda = 1.305.000");

// Terlambat 45 hari: 0,5% × 45 = 22,5% → di-cap 15% = 150.000.
const r4 = calculateRepayment(1_000_000, 30, didanai, didanai + 75 * DAY);
eq(r4.hariTerlambat, 45, "terlambat 45 hari");
eq(r4.dendaTerlambat, 150_000, "denda di-cap 15% = 150.000");

// Principal ganjil: denda tetap integer exact (half-up per rupiah).
const r5 = calculateRepayment(333_333, 30, didanai, didanai + 31 * DAY);
eq(
  r5.dendaTerlambat,
  Math.round(333_333 * 0.005) === Math.floor(333_333 * 0.005) + 1
    ? Math.floor(333_333 * 0.005) + 1
    : Math.floor(333_333 * 0.005),
  "denda 333.333 × 0,5% dibulatkan half-up",
);
eq(
  r5.pokok + r5.bunga + r5.dendaTerlambat,
  r5.totalKewajibanDenganPenalti,
  "identitas total dengan penalti",
);

// Argumen tidak valid ditolak.
throws(() => calculateRepayment(1_000_000, 0, didanai, didanai), "tenor 0 ditolak");
throws(() => calculateRepayment(1_000_000, 30, 0, didanai), "didanaiPada tidak valid ditolak");

// formatting never breaks on integers
eq(formatRupiah(13_000_000), "Rp 13.000.000", "format id-ID");

console.log(`financial tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
