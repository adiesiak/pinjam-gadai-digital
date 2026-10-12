/**
 * Uji logika murni kartu hero PINDAI.
 * Run: bun src/lib/kartuNasabah.test.ts
 *
 * Yang dijaga:
 * 1. Nomor kartu selalu tampil sebagai 4-4-4-4, apa pun bentuk masukannya
 *    (digit saja, ada tanda pisah, atau sudah berkelompok) dan tidak pernah
 *    lebih dari 16 digit.
 * 2. Nama pemegang TIDAK PERNAH tampil sebelum nasabah terverifikasi — kartu
 *    jujur menulis "CARDHOLDER".
 * 3. Masa berlaku hanya lolos dalam bentuk "MM/YY"; teks lain jatuh ke contoh.
 * 4. Masukan kosong/aneh tidak pernah menghasilkan "undefined"/"[object
 *    Object]" di layar.
 */
import {
  MASA_BERLAKU_CONTOH,
  NAMA_PEMEGANG_KOSONG,
  NOMOR_KARTU_CONTOH,
  PANJANG_NOMOR_KARTU,
  formatNomorKartu,
  masaBerlakuKartu,
  namaPemegangKartu,
} from "./kartuNasabah";

let passed = 0;
let failed = 0;
function ok(syarat: boolean, label: string): void {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}
function sama<T>(dapat: T, harap: T, label: string): void {
  ok(
    dapat === harap,
    `${label} (dapat ${JSON.stringify(dapat)}, harap ${JSON.stringify(harap)})`,
  );
}

// ===== 1. Nomor kartu =====
{
  sama(
    formatNomorKartu("1234567890123456"),
    "1234 5678 9012 3456",
    "16 digit dikelompokkan 4-4-4-4",
  );
  sama(
    formatNomorKartu("1234 5678 9012 3456"),
    NOMOR_KARTU_CONTOH,
    "nomor yang sudah berkelompok tetap sama",
  );
  sama(
    formatNomorKartu("1234-5678-9012-3456"),
    NOMOR_KARTU_CONTOH,
    "tanda pisah dibuang lalu dikelompokkan",
  );
  sama(
    formatNomorKartu("081234567890"),
    "0812 3456 7890",
    "10 digit tetap dikelompokkan tanpa memaksa 16",
  );
  sama(formatNomorKartu("12"), "12", "digit sedikit dibiarkan apa adanya");
  sama(
    formatNomorKartu("12345678901234567890"),
    "1234 5678 9012 3456",
    "kelebihan digit dipotong di 16",
  );
  sama(formatNomorKartu(""), NOMOR_KARTU_CONTOH, "kosong → nomor contoh");
  sama(formatNomorKartu(null), NOMOR_KARTU_CONTOH, "null → nomor contoh");
  sama(
    formatNomorKartu(undefined),
    NOMOR_KARTU_CONTOH,
    "undefined → nomor contoh",
  );
  sama(
    formatNomorKartu("abcd"),
    NOMOR_KARTU_CONTOH,
    "tanpa digit → nomor contoh",
  );
  ok(
    formatNomorKartu("1234567890123456").replace(/\D/g, "").length ===
      PANJANG_NOMOR_KARTU,
    "panjang digit tepat 16",
  );
  ok(
    !formatNomorKartu("abc").includes("[object"),
    "tidak pernah bocorkan [object Object]",
  );
}

// ===== 2. Nama pemegang =====
{
  sama(
    namaPemegangKartu("Budi Setiawan", true),
    "BUDI SETIAWAN",
    "nama terverifikasi → huruf besar semua",
  );
  sama(
    namaPemegangKartu("  siti   aminah ", true),
    "SITI AMINAH",
    "spasi berlebih dirapikan",
  );
  sama(
    namaPemegangKartu("Budi Setiawan", false),
    NAMA_PEMEGANG_KOSONG,
    "belum terverifikasi → CARDHOLDER meski nama ada",
  );
  sama(
    namaPemegangKartu("", true),
    NAMA_PEMEGANG_KOSONG,
    "nama kosong → CARDHOLDER",
  );
  sama(
    namaPemegangKartu(null, true),
    NAMA_PEMEGANG_KOSONG,
    "nama null → CARDHOLDER",
  );
  sama(
    namaPemegangKartu(undefined, true),
    NAMA_PEMEGANG_KOSONG,
    "nama undefined → CARDHOLDER",
  );
  sama(
    namaPemegangKartu("   ", true),
    NAMA_PEMEGANG_KOSONG,
    "nama hanya spasi → CARDHOLDER",
  );
}

// ===== 3. Masa berlaku =====
{
  sama(masaBerlakuKartu("12/29"), "12/29", "bentuk MM/YY diterima apa adanya");
  sama(masaBerlakuKartu(""), MASA_BERLAKU_CONTOH, "kosong → contoh");
  sama(masaBerlakuKartu(null), MASA_BERLAKU_CONTOH, "null → contoh");
  sama(
    masaBerlakuKartu("1229"),
    MASA_BERLAKU_CONTOH,
    "tanpa garis miring → contoh",
  );
  sama(
    masaBerlakuKartu("12/2029"),
    MASA_BERLAKU_CONTOH,
    "tahun 4 digit → contoh",
  );
  sama(masaBerlakuKartu("1/2"), MASA_BERLAKU_CONTOH, "digit tunggal → contoh");
  sama(masaBerlakuKartu("ab/cd"), MASA_BERLAKU_CONTOH, "bukan angka → contoh");
}

console.log(`kartuNasabah: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
