/**
 * Uji jalur masuk NIK: normalisasi dan kalimat yang tidak membocorkan akun.
 * Run: bun src/lib/nikLogin.test.ts
 *
 * Yang dijaga:
 *  - NIK hanya sah sebagai 16 angka; spasi/titik yang diketik pengguna dibuang,
 *    sedangkan panjang lain dan huruf tidak pernah lolos ke server.
 *  - Pesan permintaan dan pesan gagal TIDAK menyebut ada/tidaknya akun. Ini
 *    yang membuat endpoint tidak bisa dipakai untuk menebak nasabah.
 *  - Tidak ada em dash di teks yang dilihat pengguna (aturan copy proyek).
 */
import {
  normalisasiNikLogin,
  PESAN_NIK_KIRIM,
  PESAN_NIK_UMUM,
} from "./nikLogin";

let passed = 0;
let failed = 0;
function ok(syarat: boolean, label: string): void {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

// ===== 1. Normalisasi =====
ok(normalisasiNikLogin("3201234567890001") === "3201234567890001", "16 angka lolos apa adanya");
ok(
  normalisasiNikLogin("3201 2345 6789 0001") === "3201234567890001",
  "spasi dibuang",
);
ok(
  normalisasiNikLogin("3201.2345.6789.0001") === "3201234567890001",
  "titik dibuang",
);
ok(normalisasiNikLogin("320123456789000") === "", "15 angka ditolak");
ok(normalisasiNikLogin("32012345678900011") === "", "17 angka ditolak");
ok(normalisasiNikLogin("32012345678900ab") === "", "huruf membuat NIK tidak sah");
ok(normalisasiNikLogin("") === "", "kosong ditolak");

// ===== 2. Pesan tidak mengonfirmasi keberadaan akun =====
const pesan = `${PESAN_NIK_KIRIM} ${PESAN_NIK_UMUM}`.toLowerCase();
ok(!pesan.includes("terdaftar sebagai nasabah"), "tidak menyebut nasabah terdaftar");
ok(!pesan.includes("belum terdaftar"), "tidak menyebut belum terdaftar");
ok(!pesan.includes("tidak ditemukan"), "tidak menyebut NIK tidak ditemukan");
ok(PESAN_NIK_KIRIM.includes("Kalau NIK ini terdaftar"), "permintaan kode bersyarat");
ok(PESAN_NIK_UMUM.includes("tidak cocok"), "gagal masuk menyebut kecocokan, bukan keberadaan");
ok(!pesan.includes("—"), "tanpa em dash");

console.log(`nikLogin: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
