/**
 * Uji aturan status KYC (murni, tanpa server).
 * Run: bun src/lib/kycStatus.test.ts
 *
 * Yang dijaga: transisi yang sah per aktor (terutama "nasabah tidak pernah bisa
 * memverifikasi dirinya sendiri"), kewajiban alasan pada keputusan petugas,
 * kelengkapan berkas sebagai syarat mengajukan, dan aturan verifikasi ulang saat
 * data identitas penting berubah.
 */
import {
  bolehTransisi,
  keputusanWajibAlasan,
  kekuranganKyc,
  KETERANGAN_STATUS_KYC,
  KYC_STATUS,
  LABEL_STATUS_KYC,
  lengkapKyc,
  NADA_STATUS_KYC,
  perluVerifikasiUlang,
  ringkasStatusKyc,
  statusFinal,
  statusSetelahSunting,
  stempelIdentitas,
  tujuanSah,
  type IsianKycRingkas,
  type StatusKyc,
} from "./kycStatus";

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

// ===== 1. Tujuh status lengkap, unik, punya label/keterangan/nada =====
eq(KYC_STATUS.length, 7, "tujuh status produk");
eq(new Set(KYC_STATUS).size, 7, "tidak ada status kembar");
for (const s of KYC_STATUS) {
  ok(LABEL_STATUS_KYC[s].length > 0, `label ${s} ada`);
  ok(KETERANGAN_STATUS_KYC[s].length > 20, `keterangan ${s} menjelaskan`);
  ok(NADA_STATUS_KYC[s].includes("border"), `nada ${s} punya tepi`);
}
eq(
  new Set(KYC_STATUS.map((s) => NADA_STATUS_KYC[s])).size,
  7,
  "tujuh status tidak berbagi nada yang sama",
);

// ===== 2. Transisi sah & aktor =====
eq(bolehTransisi("NOT_STARTED", "IN_PROGRESS", "nasabah"), true, "nasabah mulai KYC");
eq(bolehTransisi("NOT_STARTED", "IN_PROGRESS", "admin"), false, "admin tidak memulai KYC orang");
eq(bolehTransisi("IN_PROGRESS", "PENDING_REVIEW", "nasabah"), true, "nasabah mengajukan");
// Inti modul: tidak ada jalan menaikkan status sendiri.
eq(bolehTransisi("IN_PROGRESS", "VERIFIED", "nasabah"), false, "nasabah tidak bisa memverifikasi diri");
eq(bolehTransisi("NOT_STARTED", "VERIFIED", "nasabah"), false, "lompatan status ditolak");
eq(bolehTransisi("IN_PROGRESS", "VERIFIED", "sistem"), false, "sistem tidak memverifikasi sendiri");
eq(bolehTransisi("PENDING_REVIEW", "VERIFIED", "admin"), true, "petugas memverifikasi");
eq(bolehTransisi("PENDING_REVIEW", "REJECTED", "admin"), true, "petugas menolak");
eq(bolehTransisi("PENDING_REVIEW", "NEEDS_CORRECTION", "admin"), true, "petugas minta perbaikan");
eq(bolehTransisi("PENDING_REVIEW", "VERIFIED", "nasabah"), false, "nasabah bukan pemutus");
// Menyunting pengajuan yang sedang ditinjau = menariknya kembali (lihat
// statusSetelahSunting). Tanpa tepi ini, aturan murni akan meminta transisi
// yang justru ditolak server — persis yang tertangkap uji convex-test.
eq(bolehTransisi("PENDING_REVIEW", "IN_PROGRESS", "nasabah"), true, "nasabah menarik pengajuan yang sedang ditinjau");
eq(bolehTransisi("PENDING_REVIEW", "IN_PROGRESS", "admin"), false, "petugas tidak mengembalikan ke pengisian");
eq(bolehTransisi("NEEDS_CORRECTION", "PENDING_REVIEW", "nasabah"), true, "kirim ulang setelah perbaikan");
eq(bolehTransisi("NEEDS_CORRECTION", "VERIFIED", "admin"), false, "perbaikan tidak langsung terverifikasi");
eq(bolehTransisi("REJECTED", "IN_PROGRESS", "nasabah"), true, "peninjauan ulang dimulai dari perbaikan");
eq(bolehTransisi("REJECTED", "PENDING_REVIEW", "nasabah"), false, "tidak kirim ulang tanpa perbaikan");
eq(bolehTransisi("VERIFIED", "REVERIFICATION_REQUIRED", "sistem"), true, "sistem menandai verifikasi ulang");
eq(bolehTransisi("VERIFIED", "REVERIFICATION_REQUIRED", "admin"), true, "petugas bisa menandai juga");
eq(bolehTransisi("VERIFIED", "IN_PROGRESS", "nasabah"), false, "verifikasi tidak turun sendiri");
eq(bolehTransisi("VERIFIED", "VERIFIED", "admin"), false, "status yang sama bukan transisi");
eq(tujuanSah("PENDING_REVIEW", "admin").sort().join(","), "NEEDS_CORRECTION,REJECTED,VERIFIED", "tujuan sah petugas");
eq(tujuanSah("PENDING_REVIEW", "nasabah").join(","), "IN_PROGRESS", "nasabah hanya bisa menarik pengajuan yang ditinjau");
eq(statusFinal("VERIFIED"), true, "VERIFIED final");
eq(statusFinal("PENDING_REVIEW"), false, "menunggu tinjauan bukan final");

// ===== 3. Alasan wajib pada keputusan yang menuntut perbaikan/penolakan =====
eq(keputusanWajibAlasan("NEEDS_CORRECTION"), true, "perbaikan wajib beralasan");
eq(keputusanWajibAlasan("REJECTED"), true, "penolakan wajib beralasan");
eq(keputusanWajibAlasan("VERIFIED"), false, "persetujuan tidak wajib beralasan");

// ===== 4. Kelengkapan isian =====
const LENGKAP: IsianKycRingkas = {
  namaLengkap: "Rani Puspita",
  nik: "3271012345678901",
  nomorWhatsApp: "6281234567890",
  penghasilanBulanan: 5_000_000,
  sumberPenghasilan: "Karyawan swasta",
  ktpId: "ktp",
  selfieKtpId: "selfie",
  buktiPenghasilanId: "slip",
};
eq(lengkapKyc(LENGKAP), true, "isian lengkap lolos");
eq(kekuranganKyc(LENGKAP).length, 0, "tanpa kekurangan");
eq(lengkapKyc({}), false, "isian kosong belum lengkap");
const kurang = kekuranganKyc({ namaLengkap: "Rani", nik: "123", nomorWhatsApp: "0812" });
ok(kurang.includes("NIK 16 angka"), "NIK salah dilaporkan");
ok(kurang.includes("Nomor WhatsApp format 62…"), "WhatsApp salah dilaporkan");
ok(kurang.includes("Penghasilan per bulan (rupiah bulat)"), "penghasilan kosong dilaporkan");
ok(kurang.includes("Foto KTP") && kurang.includes("Selfie dengan KTP") && kurang.includes("Bukti penghasilan"), "ketiga berkas wajib dilaporkan");
eq(lengkapKyc({ ...LENGKAP, penghasilanBulanan: 0 }), false, "penghasilan nol belum lengkap");
eq(lengkapKyc({ ...LENGKAP, penghasilanBulanan: 5.5 }), false, "penghasilan berkoma belum lengkap");
eq(lengkapKyc({ ...LENGKAP, nik: "3271 0123 4567 8901" }), true, "spasi pada NIK tidak menolak");
eq(lengkapKyc({ ...LENGKAP, nomorWhatsApp: "+62 812-3456-7890" }), true, "tanda pada WhatsApp tidak menolak");

// ===== 5. Verifikasi ulang saat data penting berubah =====
const stempel = stempelIdentitas(LENGKAP);
eq(perluVerifikasiUlang(stempel, LENGKAP), false, "data yang sama tidak minta verifikasi ulang");
eq(perluVerifikasiUlang(null, LENGKAP), false, "belum pernah diverifikasi → tanpa stempel");
eq(perluVerifikasiUlang(stempel, { ...LENGKAP, namaLengkap: "Rani P." }), true, "nama berubah → verifikasi ulang");
eq(perluVerifikasiUlang(stempel, { ...LENGKAP, nik: "3271012345678999" }), true, "NIK berubah → verifikasi ulang");
eq(perluVerifikasiUlang(stempel, { ...LENGKAP, ktpId: "ktp-baru" }), true, "foto KTP berubah → verifikasi ulang");
eq(perluVerifikasiUlang(stempel, { ...LENGKAP, selfieKtpId: "selfie-baru" }), true, "selfie berubah → verifikasi ulang");
eq(perluVerifikasiUlang(stempel, { ...LENGKAP, buktiPenghasilanId: "slip-baru" }), true, "bukti penghasilan berubah → verifikasi ulang");
// Data non-identitas: boleh berubah tanpa membatalkan putusan.
eq(perluVerifikasiUlang(stempelIdentitas({ ...LENGKAP, alamat: "Jl. A" } as never), LENGKAP), false, "alamat tidak membatalkan verifikasi");
eq(perluVerifikasiUlang(stempel, { ...LENGKAP, sumberPenghasilan: "Usaha" }), false, "sumber penghasilan tidak membatalkan verifikasi");
ok(perluVerifikasiUlang(stempel, { ...LENGKAP, namaLengkap: "  rani puspita  " }) === false, "huruf besar/spasi tepi bukan perubahan penting");

// ===== 6. Status setelah suntingan nasabah =====
eq(statusSetelahSunting("NOT_STARTED", null, LENGKAP), "IN_PROGRESS", "sunting pertama → sedang diisi");
eq(statusSetelahSunting("IN_PROGRESS", null, LENGKAP), "IN_PROGRESS", "tetap sedang diisi");
eq(statusSetelahSunting("NEEDS_CORRECTION", null, LENGKAP), "NEEDS_CORRECTION", "tetap perlu perbaikan sampai dikirim ulang");
eq(statusSetelahSunting("PENDING_REVIEW", null, LENGKAP), "IN_PROGRESS", "pengajuan ditarik bila diubah saat ditinjau");
eq(statusSetelahSunting("REJECTED", null, LENGKAP), "IN_PROGRESS", "penolakan → peninjauan ulang");
eq(statusSetelahSunting("VERIFIED", stempel, LENGKAP), "VERIFIED", "verifikasi bertahan bila identitas tidak berubah");
eq(
  statusSetelahSunting("VERIFIED", stempel, { ...LENGKAP, ktpId: "ktp-baru" }),
  "REVERIFICATION_REQUIRED",
  "verifikasi turun ke verifikasi ulang saat foto KTP berubah",
);
eq(
  statusSetelahSunting("REVERIFICATION_REQUIRED", stempel, LENGKAP),
  "REVERIFICATION_REQUIRED",
  "tetap perlu verifikasi ulang sampai dikirim ulang",
);

// ===== 7. Ringkasan status untuk halaman lain =====
ok(ringkasStatusKyc("VERIFIED").includes("bukan persetujuan pinjaman"), "ringkasan VERIFIED menegaskan batasnya");
ok(ringkasStatusKyc("PENDING_REVIEW").includes("menunggu peninjauan"), "ringkasan menunggu tinjauan");
ok(ringkasStatusKyc("NOT_STARTED").includes("belum dimulai"), "ringkasan belum dimulai");
for (const s of KYC_STATUS as readonly StatusKyc[]) {
  ok(ringkasStatusKyc(s).length > 5, `ringkasan ${s} terisi`);
}

console.log(`kycStatus.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
