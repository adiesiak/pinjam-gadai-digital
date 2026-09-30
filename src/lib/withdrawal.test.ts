/** Run: bun src/lib/withdrawal.test.ts */
import { hitungBiayaPencairan } from "./withdrawal";

let passed = 0;
let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) passed += 1;
  else {
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

eq(hitungBiayaPencairan(1_000_000).biayaPencairan, 50_000, "fee 5% dari Rp1 juta");
eq(hitungBiayaPencairan(1_000_000).jumlahBersih, 950_000, "net 95% dari Rp1 juta");
eq(hitungBiayaPencairan(1).biayaPencairan, 0, "pembulatan rupiah terdekat");
eq(hitungBiayaPencairan(0).jumlahBersih, 0, "jumlah nol tetap nol");
throws(() => hitungBiayaPencairan(-1), "jumlah negatif ditolak");
throws(() => hitungBiayaPencairan(1.5), "rupiah pecahan ditolak");

console.log(`withdrawal.test.ts: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
