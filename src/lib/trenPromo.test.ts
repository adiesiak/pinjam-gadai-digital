/**
 * Uji minggu kalender WIB untuk tren promo.
 * Run: bun src/lib/trenPromo.test.ts
 */
import {
  akhirMingguWIB,
  awalMingguWIB,
  kelompokkanMingguan,
} from "./trenPromo";
import { OFFSET_WIB_MS, tanggalWIB } from "./waktu";

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

function wib(tahun: number, bulan: number, hari: number, jam = 0, menit = 0): number {
  return Date.UTC(tahun, bulan - 1, hari, jam, menit) - OFFSET_WIB_MS;
}

const SENIN = wib(2026, 10, 19);
const MINGGU = wib(2026, 10, 25, 23, 59) + 59_999;

// 19 Oktober 2026 adalah Senin; 25 Oktober Minggu.
eq(awalMingguWIB(wib(2026, 10, 21, 9)), SENIN, "Rabu memakai Senin sebelumnya");
eq(awalMingguWIB(SENIN), SENIN, "Senin tepat di awal minggu");
eq(awalMingguWIB(MINGGU), SENIN, "Minggu malam masih minggu yang sama");
eq(awalMingguWIB(wib(2026, 10, 26, 0, 1)), wib(2026, 10, 26), "Senin berikutnya mulai minggu baru");
eq(
  awalMingguWIB(wib(2026, 10, 24, 23, 59)),
  SENIN,
  "Sabtu malam tidak bergeser ke minggu lain",
);
// Lewat tengah malam WIB tetapi masih tanggal UTC kemarin.
eq(
  awalMingguWIB(Date.UTC(2026, 9, 18, 17, 0)),
  SENIN,
  "Senin 00.00 WIB memakai tanggal WIB, bukan UTC",
);
eq(
  akhirMingguWIB(SENIN),
  MINGGU,
  "akhir minggu = Minggu 23.59.59.999 WIB",
);
eq(tanggalWIB(akhirMingguWIB(SENIN)), "2026-10-25", "tanggal akhir minggu");

// ===== Pengelompokan =====
const tren = kelompokkanMingguan([
  { waktu: wib(2026, 10, 26, 10), subsidi: 15_000 },
  { waktu: wib(2026, 10, 21, 10), subsidi: 45_000 },
  { waktu: wib(2026, 10, 25, 22), subsidi: 5_000 },
]);
eq(tren.length, 2, "dua minggu terpisah");
eq(tanggalWIB(tren[0].mulai), "2026-10-19", "minggu pertama diurut lebih dulu");
eq(tren[0].pinjaman, 2, "dua pinjaman di minggu pertama");
eq(tren[0].subsidi, 50_000, "subsidi minggu pertama dijumlahkan");
eq(tanggalWIB(tren[1].mulai), "2026-10-26", "minggu kedua mengikuti");
eq(tren[1].pinjaman, 1, "satu pinjaman di minggu kedua");

const jumlah = lulus + gagal;
console.log(`trenPromo.test: ${lulus}/${jumlah} lulus`);
if (gagal > 0) process.exit(1);
