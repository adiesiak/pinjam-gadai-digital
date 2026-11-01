/**
 * Uji ekspor CSV laporan promo bunga.
 * Run: bun src/lib/csvPromoBunga.test.ts
 *
 * Yang dijaga: angka tetap angka (tanpa titik/format rupiah), tanggal memakai
 * WIB, dan teks yang mengandung koma/kutip tidak merusak kolom.
 */
import { csvEfektivitasPromo, selCsv } from "./csvPromoBunga";
import { OFFSET_WIB_MS } from "./waktu";

let lulus = 0;
let gagal = 0;

function ok(syarat: boolean, label: string): void {
  if (syarat) lulus += 1;
  else {
    gagal += 1;
    console.error(`FAIL ${label}`);
  }
}

function eq(hasil: unknown, acuan: unknown, label: string): void {
  ok(hasil === acuan, `${label} (dapat ${String(hasil)}, harus ${String(acuan)})`);
}

function wib(tahun: number, bulan: number, hari: number, jam = 0): number {
  return Date.UTC(tahun, bulan - 1, hari, jam) - OFFSET_WIB_MS;
}

// ===== Sel CSV =====
eq(selCsv("Bunga 15%"), "Bunga 15%", "teks biasa tanpa kutip");
eq(selCsv("Bunga, tenor 7"), '"Bunga, tenor 7"', "koma memaksa kutip");
eq(selCsv('Promo "akhir tahun"'), '"Promo ""akhir tahun"""', "kutip digandakan");
eq(selCsv(150000), "150000", "angka tanpa pemisah ribuan");

// ===== Laporan =====
const csv = csvEfektivitasPromo([
  {
    nama: "Bunga 15% tenor 7, khusus",
    status: "Berjalan",
    persenBunga: 15,
    tenor: [7, 14],
    mulai: wib(2026, 10, 25),
    selesai: wib(2026, 10, 31, 23),
    pinjaman: 3,
    pokok: 3_000_000,
    subsidi: 450_000,
  },
]);
const baris = csv.trimEnd().split("\n");
eq(baris.length, 2, "satu header dan satu baris data");
ok(baris[0].startsWith("Promo,Status,Manfaat"), "header kolom dikenali");
ok(
  baris[1].includes('"Bunga 15% tenor 7, khusus"'),
  "nama promo dengan koma tetap satu sel",
);
ok(baris[1].includes("Berjalan"), "status ditulis sebagai label manusiawi");
ok(baris[1].includes("15%"), "manfaat bunga pengganti tertulis");
ok(baris[1].includes("2026-10-25"), "tanggal mulai memakai WIB");
ok(baris[1].includes("2026-10-31"), "tanggal selesai memakai WIB");
ok(baris[1].includes(",3000000,450000"), "pokok dan subsidi berupa digit mentah");
ok(!baris[1].includes("Rp"), "tidak ada awalan Rp di sel angka");

const jumlah = lulus + gagal;
console.log(`csvPromoBunga.test: ${lulus}/${jumlah} lulus`);
if (gagal > 0) process.exit(1);
