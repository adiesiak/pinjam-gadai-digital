/** Uji kalender WIB: kode tanggal tidak boleh bergeser ke hari sebelumnya. */
import { formatTanggalWIB, kodeTanggalWIB, tanggalWIB } from "./waktu";

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

// 2026-10-16 18:30 UTC = 2026-10-17 01:30 WIB.
const diniHari = Date.UTC(2026, 9, 16, 18, 30, 0);
eq(kodeTanggalWIB(diniHari), "20261017", "pukul 01.30 WIB tetap tanggal 17");
eq(tanggalWIB(diniHari), "2026-10-17", "tanggal WIB dengan pemisah");
eq(
  kodeTanggalWIB(Date.UTC(2026, 9, 17, 16, 59, 0)),
  "20261017",
  "23.59 WIB masih tanggal 17",
);
eq(
  kodeTanggalWIB(Date.UTC(2026, 9, 17, 17, 0, 0)),
  "20261018",
  "00.00 WIB sudah tanggal 18",
);
eq(formatTanggalWIB(diniHari), "17 Oktober 2026", "tanggal panjang memakai WIB");

if (failed > 0) {
  console.error(`${failed} gagal, ${passed} lulus`);
  process.exit(1);
}
console.log(`${passed} uji kalender WIB lulus`);
