/**
 * Tests Skema B Gadai Digital — dependency-free (konvensi financial.test.ts).
 * Run: bun src/lib/gadai.test.ts
 */
import {
  GADAI_PRICING,
  limitPinjamanGadai,
  proyeksiJadwalGadai,
  quoteGadai,
  rencanaBayarGadai,
  sewaModalBerikutnya,
  statusCustody,
} from "./gadai";
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

function throws(fn: () => unknown, label: string) {
  try {
    fn();
    failed += 1;
    console.error(`FAIL ${label}: expected to throw`);
  } catch {
    passed += 1;
  }
}

// ---- limitPinjamanGadai: LTV 70% dari harga pasar ----
eq(limitPinjamanGadai(10_000_000), 7_000_000, "LTV 70% dari 10jt = 7jt");
eq(limitPinjamanGadai(7_500_000), 5_250_000, "LTV 70% dari 7,5jt = 5,25jt");

// ---- quoteGadai: potongan 1%, net 99% ----
const q = quoteGadai(10_000_000, 5);
eq(q.potonganDiMuka, 100_000, "potongan muka 1% = 100rb");
eq(q.danaBersihDitransfer, 9_900_000, "dana bersih 99% = 9,9jt");
eq(q.sewaModalPeriode, 500_000, "sewa modal 5% dari 10jt = 500rb");
eq(q.totalKewajibanAwal, 10_500_000, "kewajiban awal = pokok + sewa");

const q10 = quoteGadai(10_000_000, 10);
eq(q10.sewaModalPeriode, 1_000_000, "sewa modal 10% = 1jt");

throws(() => quoteGadai(10_000_000, 4), "sewa 4% ditolak");
throws(() => quoteGadai(10_000_000, 11), "sewa 11% ditolak");
throws(() => quoteGadai(0, 5), "pokok 0 ditolak");
throws(() => quoteGadai(-1000, 5), "pokok negatif ditolak");

// ---- sewa modal berbasis SISA pokok (decreasing principal) ----
eq(sewaModalBerikutnya(10_000_000, 5), 500_000, "sewa dari 10jt = 500rb");
eq(sewaModalBerikutnya(5_000_000, 5), 250_000, "sewa dari 5jt = 250rb (turun)");
eq(sewaModalBerikutnya(1_000_000, 5), 50_000, "sewa dari 1jt = 50rb");
eq(sewaModalBerikutnya(0, 5), 0, "sisa 0 → sewa 0");
// Pembulatan half-up: 5% dari 999.999 = 49.999,95 → 50.000
eq(sewaModalBerikutnya(999_999, 5), 50_000, "half-up 49.999,95 → 50.000");

// ---- rencanaBayarGadai: bayar sewa saja (perpanjang tenor) ----
const sewaOnly = rencanaBayarGadai(10_000_000, 5, { bayarHanyaSewa: true });
eq(sewaOnly.pokokDicicil, 0, "sewa saja: pokok tidak berkurang");
eq(sewaOnly.sewaDibayar, 500_000, "sewa saja: bayar 500rb");
eq(sewaOnly.totalBayar, 500_000, "total bayar = sewa");
eq(sewaOnly.sisaPokokSetelah, 10_000_000, "sisa pokok tetap 10jt");
eq(sewaOnly.sewaModalBerikut, 500_000, "sewa berikutnya tetap 500rb");
eq(sewaOnly.custody, "DALAM_VAULT", "masih dalam vault");

// ---- cicil pokok: sewa berikutnya otomatis turun ----
const cicil3jt = rencanaBayarGadai(10_000_000, 5, { cicilPokok: 3_000_000 });
eq(cicil3jt.pokokDicicil, 3_000_000, "cicil 3jt tercatat");
eq(cicil3jt.totalBayar, 3_500_000, "total = cicil + sewa (3,5jt)");
eq(cicil3jt.sisaPokokSetelah, 7_000_000, "sisa pokok 7jt");
eq(cicil3jt.sewaModalBerikut, 350_000, "sewa berikutnya 5% × 7jt = 350rb (OTOMATIS TURUN)");
eq(cicil3jt.custody, "DALAM_VAULT", "7jt sisa → masih vault");

// ---- lunas penuh: SIAP_DIAMBIL ----
const lunas = rencanaBayarGadai(10_000_000, 5, { cicilPokok: 10_000_000 });
eq(lunas.sisaPokokSetelah, 0, "sisa pokok Rp0");
eq(lunas.sewaModalBerikut, 0, "sewa berikutnya Rp0");
eq(lunas.custody, "SIAP_DIAMBIL", "status SIAP_DIAMBIL");

throws(
  () => rencanaBayarGadai(10_000_000, 5, { cicilPokok: 10_000_001 }),
  "cicil melebihi sisa pokok ditolak",
);
throws(() => rencanaBayarGadai(0, 5, {}), "bayar saat sudah lunas ditolak");

// ---- statusCustody ----
eq(statusCustody(0), "SIAP_DIAMBIL", "0 → SIAP_DIAMBIL");
eq(statusCustody(1), "DALAM_VAULT", "1 → DALAM_VAULT");

// ---- proyeksi jadwal: sewa menurun tiap periode ----
const jadwal = proyeksiJadwalGadai(12_000_000, 5, 4_000_000);
eq(jadwal.length, 3, "12jt cicil 4jt/periode = 3 periode");
eq(jadwal[0].sewaModal, 600_000, "periode 1: 5% × 12jt");
eq(jadwal[1].sewaModal, 400_000, "periode 2: 5% × 8jt (menurun)");
eq(jadwal[2].sewaModal, 200_000, "periode 3: 5% × 4jt (menurun)");
eq(jadwal[2].custody, "SIAP_DIAMBIL", "periode akhir SIAP_DIAMBIL");
// Total sewa menurun < sewa flat: bukti decreasing principal menghemat
const totalSewa = jadwal.reduce((a, r) => a + r.sewaModal, 0);
const sewaFlat = 3 * percentOf(12_000_000, 5);
if (totalSewa < sewaFlat) {
  passed += 1;
} else {
  failed += 1;
  console.error(`FAIL decreasing principal menghemat: ${totalSewa} vs ${sewaFlat}`);
}

// ---- konstanta bisnis ----
eq(GADAI_PRICING.upfrontDeductionPercent, 1, "potongan muka gadai 1%");
eq(GADAI_PRICING.netDisbursementPercent, 99, "net gadai 99%");
eq(GADAI_PRICING.ltvMaxPercent, 70, "LTV maks 70%");

console.log(`gadai tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
