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
import {
  calculateRepayment,
  pelunasanPinjaman,
  quoteLoan,
  quotePinjaman,
  requote,
} from "./loan";

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
eq(q1.biayaExpress, 10_000, "Biaya ekspres tier tertinggi Rp10.000");
eq(
  q1.totalPotonganDiMuka,
  210_000,
  "Potongan di muka = admin 2% + biaya ekspres",
);
eq(q1.danaBersihDitransfer, 9_790_000, "Net setelah seluruh potongan di muka");
eq(q1.bunga, 3_000_000, "Bunga 30% dari 10jt");
eq(q1.totalKewajibanPelunasan, 13_000_000, "Total 130% dari 10jt");
eq(
  q1.biayaAdmin + q1.biayaPlatform + q1.biayaExpress,
  q1.totalPotonganDiMuka,
  "identitas potongan",
);
eq(
  q1.pokok - q1.totalPotonganDiMuka,
  q1.danaBersihDitransfer,
  "identitas dana bersih",
);

// ---- pilihan cair ekspres: biaya hanya bila dipilih ----
const tanpaEkspres = quoteLoan(1_000_000, { ekspres: false });
eq(tanpaEkspres.biayaAdmin, 20_000, "tanpa ekspres: admin 2% tetap");
eq(tanpaEkspres.biayaExpress, 0, "tanpa ekspres: biaya ekspres nol");
eq(tanpaEkspres.totalPotonganDiMuka, 20_000, "tanpa ekspres: potongan di muka 2% saja");
eq(tanpaEkspres.danaBersihDitransfer, 980_000, "tanpa ekspres: dana bersih Rp980.000");
eq(
  tanpaEkspres.totalKewajibanPelunasan,
  quoteLoan(1_000_000).totalKewajibanPelunasan,
  "tanpa ekspres: kewajiban pelunasan tidak berubah",
);
eq(
  quoteLoan(1_000_000, { ekspres: true }).biayaExpress,
  quoteLoan(1_000_000).biayaExpress,
  "ekspres eksplisit sama dengan bawaan",
);

// Pilihan yang tersimpan pada pinjaman harus dipakai ulang saat membaca quote.
eq(
  quotePinjaman({ pokokPinjaman: 1_000_000, cairEkspres: false }).biayaExpress,
  0,
  "quotePinjaman menghormati cairEkspres=false",
);
eq(
  quotePinjaman({ pokokPinjaman: 1_000_000 }).biayaExpress,
  10_000,
  "pinjaman lama tanpa kolom cairEkspres tetap memakai ekspres",
);
eq(
  quotePinjaman({ pokokPinjaman: 1_000_000, cairEkspres: true }).danaBersihDitransfer,
  970_000,
  "cairEkspres=true: dana bersih sama dengan sebelum pilihan ini ada",
);

// ---- requote: simulasi kalkulator landing ----
const r1 = requote(8_000_000);
eq(r1.pokok, 8_000_000, "requote pokok");
eq(r1.danaBersihDitransfer, 7_830_000, "requote net setelah admin + ekspres");

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

// ---- tarif denda dari Pengaturan Sistem dipakai apa adanya ----
const rTarif = calculateRepayment(
  10_000_000,
  30,
  didanai,
  jatuhTempo + 10 * 24 * 60 * 60 * 1000,
  undefined,
  4,
);
eq(rTarif.dendaTerlambat, 4_000_000, "tarif 4%/hari × 10 hari");

const rTarifCap = calculateRepayment(
  10_000_000,
  30,
  didanai,
  jatuhTempo + 40 * 24 * 60 * 60 * 1000,
  undefined,
  4,
);
eq(rTarifCap.dendaTerlambat, 10_000_000, "tarif 4%/hari tetap dibatasi 100% dari pokok");

const rTanpaDenda = calculateRepayment(
  10_000_000,
  30,
  didanai,
  jatuhTempo + 10 * 24 * 60 * 60 * 1000,
  undefined,
  0,
);
eq(rTanpaDenda.dendaTerlambat, 0, "tarif 0 mematikan denda");

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

// ---- Hari terlambat memakai TANGGAL KALENDER WIB ----
// Kasus nyata: cair 17 Sep 2026 pukul 20.35 WIB, tenor 30 hari → jatuh tempo
// 17 Okt 2026 pukul 20.35 WIB. Sebelum aturan kalender, pesan pagi tanggal 25
// Okt masih membaca 7 hari; seharusnya sudah 8 hari sejak tanggal 18 Okt.
const syahril = {
  pokokPinjaman: 500_000,
  status: "didanai",
  tenorHari: 30,
  didanaiPada: Date.UTC(2026, 8, 17, 13, 35),
};
const menit = 60_000;
eq(
  pelunasanPinjaman(syahril, Date.UTC(2026, 9, 17, 16, 59), 1)?.hariTerlambat,
  0,
  "pukul 23.59 WIB di hari jatuh tempo belum dihitung terlambat",
);
eq(
  pelunasanPinjaman(syahril, Date.UTC(2026, 9, 17, 17, 1), 1)?.hariTerlambat,
  1,
  "lewat tengah malam WIB jadi 1 hari, bukan menunggu 24 jam",
);
const syahrilHariIni = pelunasanPinjaman(
  syahril,
  Date.UTC(2026, 9, 25, 1, 0),
  1,
);
eq(syahrilHariIni?.hariTerlambat, 8, "25 Okt 08.00 WIB = 8 hari terlambat");
eq(syahrilHariIni?.dendaTerlambat, 40_000, "denda 8 hari × 1% × 500.000");
eq(
  syahrilHariIni?.totalKewajibanDenganPenalti,
  690_000,
  "total 650.000 + denda 40.000",
);

// formatting never breaks on integers
eq(formatRupiah(13_000_000), "Rp 13.000.000", "format id-ID");

console.log(`financial tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
