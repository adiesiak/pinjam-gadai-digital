/**
 * Uji aturan sakelar notifikasi otomatis (fungsi murni).
 * Run: bun src/lib/preferensiNotifikasi.test.ts
 *
 * Yang dijaga: konfigurasi lama tanpa kolom tetap mengirim pengingat, hanya
 * `false` eksplisit yang mematikan kanal, dan preferensi nasabah tetap tunduk
 * pada sakelar global.
 */
import {
  PREFERENSI_BAWAAN,
  kanalAktif,
  kanalEfektif,
  labelKanalAktif,
} from "./preferensiNotifikasi";

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

// ===== Gabungan global + override nasabah =====
eq(kanalEfektif(true, true), true, "global dan nasabah aktif = kanal berjalan");
eq(kanalEfektif(true, undefined), true, "nasabah tanpa override mengikuti global");
eq(kanalEfektif(true, false), false, "nasabah dapat mematikan kanal");
eq(kanalEfektif(false, true), false, "override nasabah tidak melawan sakelar global");
eq(kanalEfektif(false, undefined), false, "global mati menahan semua nasabah");
eq(kanalEfektif(false, false), false, "dua-duanya mati tetap mati");

eq(labelKanalAktif(true), "Aktif", "sakelar aktif berlabel teks");
eq(labelKanalAktif(false), "Nonaktif", "sakelar mati berlabel teks");

console.log(`preferensiNotifikasi.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
