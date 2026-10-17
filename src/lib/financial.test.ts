/**
 * Financial precision tests for PINDAI (Phase 1 "Precision Calculator" style).
 * Runs with `bun test`-compatible asserts but kept dependency-free so it can
 * execute via tsx/node as a plain script.
 */
import {
  formatRupiah,
  kelompokkanDigit,
  parseNominalRupiah,
  parseRupiah,
  percentOf,
} from "./money";
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
// ---- kelompokkanDigit: tampilan kolom masukan uang ----
eq(kelompokkanDigit("8000000"), "8.000.000", "digit mentah dikelompokkan");
eq(kelompokkanDigit("8.000.000"), "8.000.000", "teks berkelompok dari server tidak berubah");
eq(kelompokkanDigit("Rp 2.500.000"), "2.500.000", "awalan Rp diabaikan");
eq(kelompokkanDigit(""), "", "kosong tetap kosong");
eq(kelompokkanDigit("abc"), "", "tanpa digit tetap kosong");

throws(() => parseRupiah("99.999"), "di bawah minimum ditolak");
throws(() => parseRupiah("abc"), "input non-numerik ditolak");
throws(() => parseRupiah("-1000"), "negatif ditolak");

// ---- parseNominalRupiah: nominal di luar pokok pinjaman ----
eq(parseNominalRupiah("50.000"), 50_000, "pembayaran sebagian Rp50.000 diterima");
eq(parseNominalRupiah("0"), 0, "nol sah untuk jenis penyelesaian tanpa nominal");
eq(parseNominalRupiah("1.234,5"), 1_235, "desimal dibulatkan half-up");
throws(() => parseNominalRupiah("abc"), "teks bukan angka ditolak");
throws(() => parseNominalRupiah("999999999"), "di atas batas atas ditolak");

// ---- quoteLoan: formula wajib PINDAI ----
const q1 = quoteLoan(10_000_000);
eq(q1.biayaAdmin, 200_000, "Admin 2% dari 10jt");
eq(q1.biayaPlatform, 0, "Platform 0% — biaya platform dihapus");
eq(q1.totalPotonganDiMuka, 200_000, "Potongan di muka 2% dari 10jt");
eq(q1.danaBersihDitransfer, 9_800_000, "Net 98% dari 10jt");
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
  "identitas dana bersih",
);

// ---- requote: simulasi kalkulator landing ----
const r1 = requote(8_000_000);
eq(r1.pokok, 8_000_000, "requote pokok");
eq(r1.danaBersihDitransfer, 7_840_000, "requote net 98%");

// requote adalah alias quoteLoan — validasi minimum terjadi di lapisan mutasi.
eq(requote(500_000).pokok, 500_000, "requote nominal kecil tetap terhitung");

// ---- kalkulasi bulat untuk nominal tak rata ----
const q2 = quoteLoan(7_777_777);
eq(q2.biayaAdmin, 155_556, "2% dari 7.777.777 (155.555,54 → 155.556)");
eq(q2.biayaPlatform, 0, "platform 0% pada nominal tak rata");
eq(
  q2.pokok - q2.totalPotonganDiMuka,
  q2.danaBersihDitransfer,
  "identitas net pada nominal tak rata",
);

// ---- calculateRepayment (pelunasan + denda) ----
const didanai = Date.UTC(2026, 0, 1, 0, 0, 0);
const jatuhTempo = didanai + 30 * 24 * 60 * 60 * 1000;

const r2 = calculateRepayment(10_000_000, 30, didanai, didanai);
eq(r2.pokok, 10_000_000, "repayment pokok");
eq(r2.bunga, 3_000_000, "repayment bunga 30%");
eq(r2.dendaTerlambat, 0, "repayment tepat waktu tanpa denda");
eq(r2.totalKewajibanDenganPenalti, 13_000_000, "repayment total 130%");

const r3 = calculateRepayment(10_000_000, 30, didanai, jatuhTempo + 10 * 24 * 60 * 60 * 1000);
eq(r3.dendaTerlambat, 2_000_000, "denda 10 hari × 2% × pokok");

const r4 = calculateRepayment(10_000_000, 30, didanai, jatuhTempo + 40 * 24 * 60 * 60 * 1000);
eq(r4.dendaTerlambat, 8_000_000, "denda 40 hari = 80% dari pokok");

const r4Cap = calculateRepayment(10_000_000, 30, didanai, jatuhTempo + 60 * 24 * 60 * 60 * 1000);
eq(r4Cap.dendaTerlambat, 10_000_000, "denda di-cap maksimum 100% dari pokok (50 hari × 2%)");

// ---- denda tidak boleh negatif / desimal ----
const r5 = calculateRepayment(333_333, 30, didanai, jatuhTempo + 1 * 24 * 60 * 60 * 1000);
eq(
  r5.dendaTerlambat,
  Math.round(333_333 * 0.02) === Math.floor(333_333 * 0.02) + 1
    ? Math.floor(333_333 * 0.02) + 1
    : Math.floor(333_333 * 0.02),
  "denda 333.333 × 2% dibulatkan half-up",
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
