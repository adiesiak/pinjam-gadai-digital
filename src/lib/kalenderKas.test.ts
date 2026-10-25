/**
 * Uji kalender kas 30 hari.
 * Run: bun src/lib/kalenderKas.test.ts
 */
import {
  akhirHariKasWIB,
  awalHariKasWIB,
  saldoProyeksi,
  susunKalenderKas,
} from "./kalenderKas";
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

const SEKARANG = wib(2026, 10, 25, 10);

// ===== Batas hari =====
eq(awalHariKasWIB(SEKARANG), wib(2026, 10, 25), "awal hari WIB");
eq(awalHariKasWIB(wib(2026, 10, 26, 0) - 1), wib(2026, 10, 25), "23.59 masih hari yang sama");
eq(akhirHariKasWIB(SEKARANG), wib(2026, 10, 26) - 1, "akhir hari sebelum tengah malam");

// ===== Susunan =====
const hasil = susunKalenderKas({
  sekarang: SEKARANG,
  hari: 3,
  angsuran: [
    { jatuhTempoPada: wib(2026, 10, 25, 23), nominal: 100_000 },
    { jatuhTempoPada: wib(2026, 10, 26, 9), nominal: 200_000 },
    // Di luar rentang: tidak boleh digeser ke hari terakhir.
    { jatuhTempoPada: wib(2026, 10, 29, 9), nominal: 999_000 },
    // Jatuh tempo kemarin (tunggakan) tidak masuk proyeksi.
    { jatuhTempoPada: wib(2026, 10, 24, 9), nominal: 777_000 },
  ],
  siklus: [{ jatuhTempoPada: wib(2026, 10, 27, 12), nominal: 1_235_000 }],
});

eq(hasil.baris.length, 3, "tiga hari dibuat termasuk hari kosong");
eq(hasil.baris[0].masuk, 100_000, "angsuran hari ini");
eq(hasil.baris[1].masuk, 200_000, "angsuran besok");
eq(hasil.baris[2].masuk, 0, "hari tanpa angsuran tetap ada");
eq(hasil.baris[2].keluar, 1_235_000, "siklus pendana jatuh tempo");
eq(hasil.totalMasuk, 300_000, "total masuk hanya dalam rentang");
eq(hasil.totalKeluar, 1_235_000, "total keluar");
eq(hasil.hariTerberat?.tanggal, wib(2026, 10, 27), "hari terberat = hari keluar terbesar");
eq(hasil.baris[0].jumlahAngsuran, 1, "jumlah angsuran dihitung");
eq(hasil.baris[2].jumlahSiklus, 1, "jumlah siklus dihitung");

// ===== Biaya operasional berulang =====
const denganBiaya = susunKalenderKas({
  sekarang: SEKARANG,
  hari: 7,
  angsuran: [],
  siklus: [],
  biayaBulanan: [
    { hariDalamBulan: 25, nominal: 50_000 },
    { hariDalamBulan: 31, nominal: 75_000 },
  ],
});
eq(denganBiaya.baris[0].keluar, 50_000, "biaya tanggal 25 masuk hari ini");
eq(denganBiaya.baris[0].jumlahBiaya, 1, "satu biaya pada tanggal 25");
eq(denganBiaya.baris[6].keluar, 75_000, "biaya tanggal 31 masuk di akhir Oktober");
eq(denganBiaya.totalKeluar, 125_000, "total keluar memuat biaya");

const februari = susunKalenderKas({
  sekarang: wib(2026, 2, 25, 10),
  hari: 5,
  angsuran: [],
  siklus: [],
  biayaBulanan: [{ hariDalamBulan: 31, nominal: 10_000 }],
});
eq(februari.baris[3].keluar, 10_000, "tanggal 31 digeser ke 28 Februari");
eq(februari.baris[4].keluar, 0, "biaya tidak jatuh dua kali");

// ===== Saldo proyeksi =====
const saldo = saldoProyeksi(hasil.baris, 500_000);
eq(saldo[0], 600_000, "saldo setelah masuk hari pertama");
eq(saldo[1], 800_000, "saldo setelah masuk hari kedua");
eq(saldo[2], -435_000, "saldo negatif saat kewajiban pendana melebihi kas");

const tanpaSiklus = saldoProyeksi(hasil.baris, 0);
eq(tanpaSiklus[0], 100_000, "tanpa saldo awal tetap menjumlah");

// ===== Rentang dibatasi 60 hari =====
const panjang = susunKalenderKas({ sekarang: SEKARANG, hari: 999, angsuran: [], siklus: [] });
eq(panjang.baris.length, 60, "rentang maksimal 60 hari");
const pendek = susunKalenderKas({ sekarang: SEKARANG, hari: 0, angsuran: [], siklus: [] });
eq(pendek.baris.length, 1, "minimal satu hari");

const jumlah = lulus + gagal;
console.log(`kalenderKas.test: ${lulus}/${jumlah} lulus`);
if (gagal > 0) process.exit(1);
