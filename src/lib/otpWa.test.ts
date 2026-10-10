/**
 * Uji logika murni OTP WhatsApp (tanpa server).
 * Run: bun src/lib/otpWa.test.ts
 *
 * Yang dijaga: normalisasi nomor (nomor tidak wajar tidak boleh sampai ke
 * gateway), kode selalu 6 digit acak kriptografis, penyimpanan hanya berupa
 * hash ber-salt, perbandingan konstan-waktu, cooldown kirim ulang, dan
 * pembacaan balasan Fonnte (sukses/gagal/token salah/bukan JSON).
 */
import {
  buatSaltOtp,
  cocokKodeOtp,
  hashKodeOtp,
  kodeOtpEnamDigit,
  normalisasiNomorWa,
  OTP_MASA_BERLAKU_MS,
  pesanOtp,
  sisaDetikCooldown,
  tujuanOtpValid,
  uraiResponFonnte,
} from "./otpWa";

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
function ok(syarat: boolean, label: string) {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

// ===== 1. Normalisasi nomor WhatsApp =====
eq(normalisasiNomorWa("08123456789"), "628123456789", "awalan 0 → 62");
eq(normalisasiNomorWa("6281234567890"), "6281234567890", "62 sudah benar");
eq(normalisasiNomorWa("+62 812-3456-7890"), "6281234567890", "plus/spasi/strip dibuang");
eq(normalisasiNomorWa("8123456789"), "628123456789", "awalan 8 diberi kode negara");
eq(normalisasiNomorWa(""), null, "kosong ditolak");
eq(normalisasiNomorWa("   "), null, "spasi saja ditolak");
eq(normalisasiNomorWa("123"), null, "terlalu pendek ditolak");
eq(normalisasiNomorWa("6281234"), null, "terlalu pendek setelah kode negara ditolak");
eq(normalisasiNomorWa("14155552671"), null, "kode negara lain ditolak");
eq(normalisasiNomorWa("62" + "9".repeat(20)), null, "terlalu panjang ditolak");

// ===== 2. Kode 6 digit acak =====
for (let i = 0; i < 250; i += 1) {
  const kode = kodeOtpEnamDigit();
  if (!/^\d{6}$/.test(kode)) {
    failed += 1;
    console.error(`FAIL kode ke-${i} tidak 6 digit: ${kode}`);
    break;
  }
  passed += 1;
}
const contoh = new Set(Array.from({ length: 50 }, () => kodeOtpEnamDigit()));
ok(contoh.size > 1, "kode tidak selalu sama (ada keacakan)");

// ===== 3. Salt & hash =====
const salt = buatSaltOtp();
ok(/^[0-9a-f]{32}$/.test(salt), "salt 16 byte heksadesimal");
ok(buatSaltOtp() !== salt, "salt berbeda tiap panggilan");

const h1 = await hashKodeOtp(salt, "123456");
const h2 = await hashKodeOtp(salt, "123456");
const h3 = await hashKodeOtp(salt, "123457");
const h4 = await hashKodeOtp(buatSaltOtp(), "123456");
eq(h1, h2, "hash sama untuk salt & kode sama");
ok(h1 !== h3, "kode berbeda → hash berbeda");
ok(h1 !== h4, "salt berbeda → hash berbeda");
ok(/^[0-9a-f]{64}$/.test(h1), "hash SHA-256 heksadesimal 64 karakter");
ok(!h1.includes("123456"), "hash tidak memuat kode aslinya");

// ===== 4. Perbandingan konstan-waktu =====
ok(cocokKodeOtp(h1, h2), "hash identik cocok");
eq(cocokKodeOtp(h1, h3), false, "hash berbeda tidak cocok");
eq(cocokKodeOtp(h1, h1.slice(0, 10)), false, "panjang berbeda tidak cocok");
eq(cocokKodeOtp("", ""), false, "hash kosong tidak pernah cocok");
eq(cocokKodeOtp(h1.toUpperCase(), h1), false, "perbandingan peka huruf");

// ===== 5. Cooldown & masa berlaku =====
const sekarang = 1_700_000_000_000;
eq(sisaDetikCooldown(null, sekarang), 0, "belum pernah kirim → boleh");
eq(sisaDetikCooldown(sekarang - 30_000, sekarang), 30, "30 detik lagi");
eq(sisaDetikCooldown(sekarang, sekarang), 60, "baru saja kirim → tunggu penuh");
eq(sisaDetikCooldown(sekarang - 61_000, sekarang), 0, "lewat cooldown → boleh");
eq(OTP_MASA_BERLAKU_MS, 300_000, "masa berlaku 5 menit");

// ===== 6. Pesan OTP =====
const pesan = pesanOtp("verifikasi_nomor", "123456");
ok(pesan.includes("123456"), "pesan memuat kode");
ok(pesan.includes("5 menit"), "pesan menyebut masa berlaku");
ok(pesan.toLowerCase().includes("sekali"), "pesan menyebut sekali pakai");
ok(!/token|bearer|api[-_ ]?key/i.test(pesan), "pesan tidak memuat token/API key");
ok(
  pesanOtp("transaksi", "654321").includes("transaksi"),
  "pesan tujuan transaksi menyebut transaksinya",
);

// ===== 7. Tujuan =====
eq(tujuanOtpValid("verifikasi_nomor"), true, "tujuan verifikasi nomor sah");
eq(tujuanOtpValid("transaksi"), true, "tujuan transaksi sah");
eq(tujuanOtpValid("login"), false, "tujuan tak dikenal ditolak");

// ===== 8. Balasan Fonnte =====
const sukses = uraiResponFonnte(
  200,
  JSON.stringify({ detail: "success! message in queue", status: true, id: ["1"] }),
);
eq(sukses.terkirim, true, "status true = terkirim");

eq(uraiResponFonnte(200, JSON.stringify({ status: false, reason: "token invalid" })).terkirim, false, "token invalid bukan terkirim");
ok(
  uraiResponFonnte(200, JSON.stringify({ status: false, reason: "token invalid" })).pesan.includes(
    "FONNTE_TOKEN",
  ),
  "token invalid menjelaskan env var mana",
);
ok(
  uraiResponFonnte(200, JSON.stringify({ status: false, reason: "target invalid" })).pesan.includes(
    "Nomor",
  ),
  "nomor tidak valid dijelaskan",
);
eq(
  uraiResponFonnte(200, JSON.stringify({ status: false, reason: "insufficient quota" })).terkirim,
  false,
  "kuota habis bukan terkirim",
);
eq(uraiResponFonnte(200, "{bukan json").terkirim, false, "balasan bukan JSON bukan terkirim");
ok(
  uraiResponFonnte(500, "gateway sedang bermasalah").pesan.includes("menolak"),
  "HTTP gagal tanpa JSON tetap dilaporkan menolak",
);
eq(uraiResponFonnte(200, "").terkirim, false, "balasan kosong bukan terkirim");
eq(
  uraiResponFonnte(200, JSON.stringify({ Status: false, reason: "token invalid" })).terkirim,
  false,
  "huruf besar Status ikut dibaca",
);
eq(
  uraiResponFonnte(200, JSON.stringify({ status: true, detail: "ok" })).terkirim,
  true,
  "HTTP 200 + status true = terkirim",
);

console.log(`otpWa.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
