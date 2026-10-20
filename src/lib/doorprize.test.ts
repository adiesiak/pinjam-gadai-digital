/** Uji aturan tiket & periode Doorprize Emas (murni, tanpa Convex). */
import {
  akhirPeriodeUndian,
  labelTanggalUndian,
  periodeUndian,
  tiketPendana,
  tiketPeminjam,
} from "./doorprize";

let passed = 0;
let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) passed += 1;
  else {
    failed += 1;
    console.error(
      `FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

// 31 Januari 2026 23:30 WIB = 16:30 UTC.
const akhirJanuari = Date.UTC(2026, 0, 31, 16, 30);
eq(periodeUndian(akhirJanuari), "2026-01", "akhir Januari masuk periode 2026-01");

// 1 Februari 2026 00:30 WIB = 31 Januari 17:30 UTC — bulan WIB yang menang.
eq(
  periodeUndian(Date.UTC(2026, 0, 31, 17, 30)),
  "2026-02",
  "01.30 WIB sudah Februari walau UTC masih Januari",
);

const akhir = akhirPeriodeUndian("2026-02");
eq(
  new Date(akhir).toISOString(),
  "2026-02-28T17:00:00.000Z",
  "akhir Februari = 1 Maret 00:00 WIB",
);
eq(labelTanggalUndian("2026-02"), "28 Februari 2026", "label pengundian akhir bulan");

let ditolak = false;
try {
  akhirPeriodeUndian("2026-13");
} catch {
  ditolak = true;
}
eq(ditolak, true, "periode dengan bulan 13 ditolak");

// Tiket pendana: satu per kelipatan Rp1 juta yang selesai siklus.
eq(tiketPendana(999_999), 0, "di bawah Rp1 juta belum dapat tiket");
eq(tiketPendana(1_000_000), 1, "Rp1 juta = 1 tiket");
eq(tiketPendana(2_500_000), 2, "Rp2,5 juta = 2 tiket (bukan 3)");
eq(tiketPendana(0), 0, "nol tidak menghasilkan tiket");
eq(tiketPendana(-1_000_000), 0, "negatif tidak menghasilkan tiket");

// Tiket peminjam hanya untuk pelunasan tepat waktu.
eq(tiketPeminjam(true), 1, "lunas tepat waktu = 1 tiket");
eq(tiketPeminjam(false), 0, "lunas terlambat = 0 tiket");

if (failed > 0) {
  console.error(`\n${failed} gagal, ${passed} lulus`);
  throw new Error("Tes doorprize gagal");
}
console.log(`doorprize: ${passed} lulus`);
