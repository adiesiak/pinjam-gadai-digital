/** Run: bun src/lib/grafikKeuntungan.test.ts */
import { barKeuntungan, type SumberBarKeuntungan } from "./grafikKeuntungan";

let passed = 0;
let failed = 0;
function eq(actual: unknown, expected: unknown, label: string): void {
  if (actual === expected) passed += 1;
  else {
    failed += 1;
    console.error(
      `FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}
function ok(syarat: boolean, label: string): void {
  eq(syarat, true, label);
}

function sumber(
  nama: string,
  lunas: number,
  belumLunas: number,
): SumberBarKeuntungan {
  return { nama, keuntunganPendanaLunas: lunas, keuntunganPendanaBelumLunas: belumLunas };
}

// ===== Panjang bar relatif terhadap nilai terbesar =====
{
  const bars = barKeuntungan([
    sumber("CHARELSOERYA@GMAIL.COM", 0, 235_000),
    sumber("ROBERT", 235_000, 1_410_000),
    sumber("ASEP FIRMAN HANAFI", 470_000, 705_000),
  ]);
  // Robert 1.645.000 (terbesar) → bar penuh; Asep 1.175.000; Charelsoerya 235.000.
  eq(bars.length, 3, "tiga bar");
  eq(bars[0].nama, "ROBERT", "nilai terbesar lebih dulu");
  eq(bars[0].persen, 100, "penyedia terbesar memakai bar penuh");
  eq(bars[1].nama, "ASEP FIRMAN HANAFI", "urutan kedua");
  eq(bars[1].total, 1_175_000, "total Asep");
  eq(bars[1].persen, 71.43, "bar Asep relatif terhadap Robert");
  eq(bars[2].nama, "CHARELSOERYA@GMAIL.COM", "urutan terakhir");
  eq(bars[2].persen, 14.29, "bar terkecil tetap terlihat");

  // Porsi yang sudah cair menggambarkan komposisi penyedia ITU, bukan yang lain.
  eq(bars[0].persenSudahCair, 14.29, "porsi sudah cair Robert (235rb dari 1,645jt)");
  eq(bars[2].persenSudahCair, 0, "belum ada yang cair → tidak ada porsi emerald");
  ok(bars[2].perkiraan === 235_000 && bars[2].sudahCair === 0, "bagian cair & perkiraan dipisah");
  for (const b of bars) {
    ok(b.persenSudahCair <= b.persen, `porsi cair ${b.nama} tidak melebihi panjang bar`);
    ok(b.total === b.sudahCair + b.perkiraan, `total ${b.nama} = jumlah kedua bagian`);
    // Kedua segmen harus berjumlah panjang bar, tanpa sisa pecahan biner.
    ok(
      b.persenSudahCair + b.persenPerkiraan === b.persen,
      `segmen ${b.nama} berjumlah panjang bar (${b.persenSudahCair} + ${b.persenPerkiraan} = ${b.persen})`,
    );
  }
  eq(bars[0].persenPerkiraan, 85.71, "sisa bar Robert tetap kuning (100 − 14,29)");
  eq(bars[1].persenPerkiraan, 42.86, "sisa bar Asep (71,43 − 28,57)");
  eq(bars[2].persenPerkiraan, 14.29, "seluruh bar Charel kuning (belum ada yang cair)");
}

// ===== Seri: nama sebagai pemecah supaya urutan stabil =====
{
  const bars = barKeuntungan([
    sumber("BETA", 100_000, 0),
    sumber("ALFA", 0, 100_000),
  ]);
  eq(bars[0].nama, "ALFA", "seri diurutkan menurut nama (ALFA dulu)");
  eq(bars[1].nama, "BETA", "seri kedua");
  eq(bars[0].persen, 100, "seri: keduanya bar penuh");
  eq(bars[1].persen, 100, "seri: keduanya bar penuh");
}

// ===== Semua nol: tidak ada bar, bukan bar penuh karena bagi nol =====
{
  const bars = barKeuntungan([sumber("KOSONG", 0, 0)]);
  eq(bars[0].persen, 0, "nilai nol → panjang bar nol");
  eq(bars[0].persenSudahCair, 0, "nilai nol → tidak ada porsi cair");
  ok(!Number.isNaN(bars[0].persen), "tidak ada NaN saat rekap kosong");
}

// ===== Masukan kosong =====
{
  const bars = barKeuntungan([]);
  eq(bars.length, 0, "rekap kosong → tanpa bar");
}

// ===== Satu penyedia: harganya tetap penuh (grafik bisa dipakai apa adanya) =====
{
  const bars = barKeuntungan([sumber("TUNGGAL", 0, 700_000)]);
  eq(bars.length, 1, "satu penyedia → satu bar");
  eq(bars[0].persen, 100, "satu penyedia memakai bar penuh");
  eq(bars[0].persenSudahCair, 0, "seluruhnya perkiraan");
}

const jumlah = barKeuntungan;
ok(typeof jumlah === "function", "barKeuntungan dapat dipanggil sebagai fungsi murni");

console.log(`grafikKeuntungan.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
