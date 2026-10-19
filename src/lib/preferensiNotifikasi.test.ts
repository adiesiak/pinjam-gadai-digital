/**
 * Uji aturan sakelar notifikasi global (fungsi murni).
 * Run: bun src/lib/preferensiNotifikasi.test.ts
 *
 * Yang dijaga: konfigurasi lama tanpa kolom tetap mengirim pengingat, dan hanya
 * `false` eksplisit yang mematikan kanal. Sakelar ini milik admin, bukan
 * pilihan per akun.
 */
import { PREFERENSI_BAWAAN, kanalAktif } from "./preferensiNotifikasi";

let passed = 0;
let failed = 0;
function ok(syarat: boolean, label: string): void {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}
function eq(actual: unknown, expected: unknown, label: string): void {
  if (actual === expected) passed += 1;
  else {
    failed += 1;
    console.error(
      `FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

eq(PREFERENSI_BAWAAN.whatsapp, true, "WhatsApp aktif secara bawaan");
eq(PREFERENSI_BAWAAN.email, true, "email aktif secara bawaan");
eq(kanalAktif(undefined), true, "kolom kosong = aktif (konfigurasi lama)");
eq(kanalAktif(true), true, "sakelar yang dinyatakan aktif tetap aktif");
eq(kanalAktif(false), false, "hanya false eksplisit yang mematikan kanal");

ok(kanalAktif(undefined) && !kanalAktif(false), "bawaan dan pilihan admin dibedakan");

console.log(`preferensiNotifikasi.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
