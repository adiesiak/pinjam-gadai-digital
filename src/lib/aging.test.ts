/** Uji aging & konsentrasi. Run: bun src/lib/aging.test.ts */
import {
  BUCKET_AGING,
  bucketDariHari,
  csvAging,
  hariTerlambatAging,
  hitungAging,
  konsentrasiProduk,
  LABEL_BUCKET_AGING,
  type PinjamanUntukAging,
} from "./aging";

const HARI = 86_400_000;
const SEKARANG = 1_760_000_000_000;

let passed = 0;
let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}: expected ${expected}, got ${actual}`);
  }
}
function ok(nilai: boolean, label: string) {
  if (nilai) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

eq(bucketDariHari(0), "lancar", "0 hari lancar");
eq(bucketDariHari(-5), "lancar", "negatif lancar");
eq(bucketDariHari(1), "1-30", "1 hari");
eq(bucketDariHari(30), "1-30", "30 hari");
eq(bucketDariHari(31), "31-60", "31 hari");
eq(bucketDariHari(60), "31-60", "60 hari");
eq(bucketDariHari(61), "61-90", "61 hari");
eq(bucketDariHari(90), "61-90", "90 hari");
eq(bucketDariHari(91), ">90", "91 hari");
eq(BUCKET_AGING.length, 5, "lima bucket");
ok(Object.keys(LABEL_BUCKET_AGING).length === 5, "label lengkap");

const pinjaman: PinjamanUntukAging[] = [
  { status: "didanai", pokokPinjaman: 1_000_000, didanaiPada: SEKARANG - 10 * HARI, tenorHari: 30 },
  { status: "didanai", pokokPinjaman: 2_000_000, didanaiPada: SEKARANG - 40 * HARI, tenorHari: 30 },
  { status: "didanai", pokokPinjaman: 3_000_000, didanaiPada: SEKARANG - 70 * HARI, tenorHari: 30 },
  { status: "didanai", pokokPinjaman: 4_000_000, didanaiPada: SEKARANG - 100 * HARI, tenorHari: 30 },
  { status: "lunas", pokokPinjaman: 9_000_000, didanaiPada: SEKARANG - 200 * HARI, tenorHari: 30 },
  { status: "didanai", pokokPinjaman: 500_000, didanaiPada: SEKARANG - 60 * HARI, tenorBulan: 1 },
];

eq(hariTerlambatAging(pinjaman[0]!, SEKARANG), 0, "belum jatuh tempo");
eq(hariTerlambatAging(pinjaman[1]!, SEKARANG), 10, "telat 10 hari");
eq(hariTerlambatAging(pinjaman[5]!, SEKARANG), 30, "bulanan 30 hari");
eq(hariTerlambatAging({ status: "didanai", pokokPinjaman: 1, tenorHari: 30 }, SEKARANG), 0, "tanpa tanggal cair = 0");

const hasil = hitungAging(pinjaman, SEKARANG);
eq(hasil.totalPokok, 10_500_000, "total pokok hanya didanai");
eq(hasil.baris.find((b) => b.bucket === "lancar")?.jumlah, 1, "lancar 1");
eq(hasil.baris.find((b) => b.bucket === "1-30")?.jumlah, 2, "1-30 2");
eq(hasil.baris.find((b) => b.bucket === "31-60")?.jumlah, 1, "31-60 1");
eq(hasil.baris.find((b) => b.bucket === "61-90")?.jumlah, 1, "61-90 1");
eq(hasil.baris.find((b) => b.bucket === ">90")?.jumlah, 0, ">90 0");
eq(hasil.totalMenunggak, 9_500_000, "total menunggak");
eq(Math.round(hasil.rasioMenunggak * 100), 90, "rasio menunggak");

const kosong = hitungAging([], SEKARANG);
eq(kosong.totalPokok, 0, "kosong total");
eq(kosong.rasioMenunggak, 0, "kosong rasio");

const konsentrasi = konsentrasiProduk([
  { produk: "Pinjaman harian", pokok: 6_000_000 },
  { produk: "Pinjaman harian", pokok: 4_000_000 },
  { produk: "Gadai", pokok: 5_000_000 },
  { produk: "Kredit barang", pokok: 5_000_000 },
]);
eq(konsentrasi.length, 3, "tiga produk");
eq(konsentrasi[0]?.produk, "Pinjaman harian", "produk terbesar");
eq(konsentrasi[0]?.pokokTercatat, 10_000_000, "pokok terbesar");
eq(konsentrasi[0]?.jumlah, 2, "jumlah baris produk");
eq(Math.round((konsentrasi[0]?.porsi ?? 0) * 100), 50, "porsi 50%");
eq(konsentrasiProduk([]).length, 0, "konsentrasi kosong");

const csv = csvAging(hasil, konsentrasi);
ok(csv.includes("Aging portofolio PINDAI"), "csv judul");
ok(csv.includes("Lebih dari 90 hari"), "csv bucket");
ok(csv.includes("Pinjaman harian"), "csv produk");
ok(csv.endsWith("\n"), "csv diakhiri baris baru");
ok(csv.includes("10000000"), "csv angka tanpa pemisah");

console.log(`aging: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
