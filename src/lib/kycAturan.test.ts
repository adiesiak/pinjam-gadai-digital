/**
 * Uji aturan versi verifikasi KYC (murni, tanpa server).
 * Run: bun src/lib/kycAturan.test.ts
 *
 * Yang dijaga:
 *  - versi aturan ada, tidak kosong, dan bentuknya stabil untuk disimpan di DB;
 *  - aturan yang diumumkan menunjuk konstanta NYATA dari `lib/kyc.ts` (bukan
 *    angka salinan yang bisa berbeda diam-diam);
 *  - `aturanUsang()` membedakan \"belum ada versi\" (baris lama, jangan ditandai)
 *    dari \"versi lama\" (harus ditandai);
 *  - `keteranganAturanUsang()` menyebut kedua versi supaya petugas tahu dasarnya.
 */
import {
  ATURAN_VERIFIKASI_BERLAKU,
  aturanUsang,
  keteranganAturanUsang,
  VERSI_ATURAN_KYC,
} from "./kycAturan";
import { GAMBAR_DITERIMA, MAX_FILE_BYTES } from "./kyc";

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

// ===== 1. Versi =====
ok(VERSI_ATURAN_KYC.trim().length > 0, "versi aturan tidak kosong");
ok(/^[a-z0-9-]+$/.test(VERSI_ATURAN_KYC), "versi aturan aman disimpan (huruf kecil/angka/hubung)");
eq(
  ATURAN_VERIFIKASI_BERLAKU.versi,
  VERSI_ATURAN_KYC,
  "isi aturan memakai versi yang sama dengan konstanta versi",
);

// ===== 2. Aturan menunjuk konstanta nyata =====
eq(
  ATURAN_VERIFIKASI_BERLAKU.ukuranMaksByte,
  MAX_FILE_BYTES,
  "batas ukuran mengikuti lib/kyc.ts",
);
eq(
  ATURAN_VERIFIKASI_BERLAKU.jenisDiterima,
  GAMBAR_DITERIMA,
  "jenis gambar mengikuti lib/kyc.ts",
);
eq(ATURAN_VERIFIKASI_BERLAKU.berkasWajib.join(","), "ktp,selfie,bukti", "tiga slot berkas wajib");
eq(ATURAN_VERIFIKASI_BERLAKU.wajibPersetujuan, true, "persetujuan wajib menurut aturan");
eq(ATURAN_VERIFIKASI_BERLAKU.hanyaPetugasTotp, true, "keputusan hanya petugas ber-TOTP");

// ===== 3. aturanUsang: "belum ada versi" bukan "usang" =====
eq(aturanUsang(null), false, "versi null → tidak ditandai usang (baris lama)");
eq(aturanUsang(undefined), false, "versi undefined → tidak ditandai usang (baris lama)");
eq(aturanUsang(""), false, "versi kosong → tidak ditandai usang");
eq(aturanUsang(VERSI_ATURAN_KYC), false, "versi berlaku → tidak usang");
eq(aturanUsang("kyc-aturan-2020-01"), true, "versi lama → usang");
eq(aturanUsang(`${VERSI_ATURAN_KYC}-baru`), true, "versi berbeda (mis. lebih baru) → usang");

// ===== 4. Kalimat untuk petugas =====
eq(keteranganAturanUsang(VERSI_ATURAN_KYC), null, "aturan berlaku → tanpa peringatan");
eq(keteranganAturanUsang(null), null, "tanpa versi → tanpa peringatan");
const pesan = keteranganAturanUsang("kyc-aturan-2020-01");
ok(pesan !== null, "aturan lama → ada kalimat peringatan");
ok(
  (pesan ?? "").includes("kyc-aturan-2020-01") && (pesan ?? "").includes(VERSI_ATURAN_KYC),
  "peringatan menyebut versi lama DAN versi berlaku",
);
ok(
  (pesan ?? "").includes("verifikasi ulang"),
  "peringatan mengusulkan langkah (verifikasi ulang), bukan sekadar mengeluh",
);

if (failed > 0) {
  console.error(`\n${failed} gagal, ${passed} lulus`);
  process.exit(1);
}
console.log(`kycAturan: ${passed} lulus`);
