/**
 * Tests partial masking STOP-UP! — dependency-free.
 * Run: bun src/utils/masking.test.ts
 */
import {
  keFormatWhatsapp,
  maskEmail,
  maskIdPelanggan,
  maskNama,
  maskNik,
  maskNomorHp,
  normalisasiNomorHp,
  tautanWhatsApp,
} from "./masking";
import { deteksiOperator, validasiNomorHp } from "../lib/stopup/operator";

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

function ok(kondisi: boolean, label: string) {
  if (kondisi) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

// ---- masking nama sesuai contoh spesifikasi ----
eq(maskNama("ANDI SAPUTRA"), "A**I S*****A", "ANDI SAPUTRA → A**I S*****A");
eq(maskNama("BUDI"), "B**I", "empat huruf tetap menyisakan huruf terakhir");
eq(maskNama("AB"), "A*", "dua huruf → A*");
eq(maskNama("A"), "A", "satu huruf dibiarkan");
eq(maskNama("  andi   saputra  "), "a**i s*****a", "spasi berlebih dirapikan");
eq(maskNama(""), "", "string kosong aman");
eq(maskNama(null), "", "null aman");
ok(!maskNama("ANDI SAPUTRA").includes("SAPUTRA"), "nama belakang tidak bocor utuh");

// ---- nomor HP ----
eq(maskNomorHp("081234567890"), "0812****7890", "0812****7890");
eq(maskNomorHp("+62 812-3456-7890"), "0812****7890", "format internasional dinormalkan");
eq(maskNomorHp("0812345"), "08*****", "nomor pendek tetap tersamarkan");
eq(maskNomorHp(""), "", "kosong aman");

// ---- email ----
eq(maskEmail("andi.saputra@gmail.com"), "an**********@gm***.com", "local & host disamarkan, TLD terlihat");
ok(maskEmail("ab@cd.id").includes("@"), "email tanpa domain panjang tetap valid");
eq(maskEmail("").length, 0, "email kosong aman");

// ---- ID pelanggan & NIK ----
eq(maskIdPelanggan("14012345678"), "1401****678", "ID PLN disamarkan");
eq(maskIdPelanggan("12345"), "***45", "ID pendek disamarkan sebagian");
eq(maskNik("3276010101990001"), "3276********0001", "NIK 16 digit → 3276********0001");
ok(maskNik("3276010101990001").length === 16, "panjang NIK tetap 16 karakter");

// ---- normalisasi nomor ----
eq(normalisasiNomorHp("+6281234567890"), "081234567890", "+62 → 08");
eq(normalisasiNomorHp("6281234567890"), "081234567890", "62 → 08");
eq(normalisasiNomorHp("8123456789"), "08123456789", "8… → 08…");
eq(normalisasiNomorHp("0812 3456 7890"), "081234567890", "spasi dibuang");
eq(normalisasiNomorHp("0812345678901234"), "0812345678901", "dipotong di 13 digit");
eq(keFormatWhatsapp("081234567890"), "6281234567890", "format WhatsApp memakai 62");
ok(tautanWhatsApp("081234567890", "Halo Dunia").startsWith("https://wa.me/6281234567890?text="), "tautan WA langsung");
ok(tautanWhatsApp("0812", "a b").includes("a%20b"), "teks pesan di-encode");

// ---- auto-detect operator ----
eq(deteksiOperator("081234567890")?.kode, "TELKOMSEL", "0812 = Telkomsel");
eq(deteksiOperator("6281234567890")?.kode, "TELKOMSEL", "format 62 tetap terdeteksi");
eq(deteksiOperator("081711112222")?.kode, "XL", "0817 = XL");
eq(deteksiOperator("085711112222")?.kode, "INDOSAT", "0857 = Indosat");
eq(deteksiOperator("083811112222")?.kode, "AXIS", "0838 = Axis");
eq(deteksiOperator("089511112222")?.kode, "TRI", "0895 = Tri");
eq(deteksiOperator("088111112222")?.kode, "SMARTFREN", "0881 = Smartfren");
eq(deteksiOperator("081"), null, "kurang dari 4 digit belum terdeteksi");
eq(deteksiOperator("0299123456"), null, "nomor rumah tidak dikenali");

// ---- validasi nomor ----
eq(validasiNomorHp("0812345678").valid, true, "10 digit valid");
eq(validasiNomorHp("0812345678901").valid, true, "13 digit valid");
eq(validasiNomorHp("081234567").valid, false, "9 digit ditolak");
eq(validasiNomorHp("08123456789012").valid, false, "14 digit ditolak");
eq(validasiNomorHp("1234567890").valid, false, "tidak diawali 08 ditolak");
eq(validasiNomorHp("").valid, false, "kosong ditolak");
ok(Boolean(validasiNomorHp("1234567890").pesan), "pesan kesalahan disertakan");

console.log(`stopup masking tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
