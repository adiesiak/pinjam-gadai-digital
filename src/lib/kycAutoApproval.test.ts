/**
 * Uji mesin keputusan otomatis KYC (logika murni). Run: bun src/lib/kycAutoApproval.test.ts
 *
 * Yang dijaga: kombinasi LULUS, GAGAL, dan TIDAK PASTI untuk setiap pemeriksaan;
 * prioritas (gagal menang atas tidak pasti); status yang dituju; dan sifat
 * IDEMPOTEN lewat sidik jari yang stabil serta TIDAK memuat data pribadi.
 */
import {
  AMBANG_KEYAKINAN_OCR_OTOMATIS,
  bolehTerapkanOtomatis,
  CATATAN_AUTO_KYC,
  putuskanKycOtomatis,
  VERSI_ATURAN_AUTO_KYC,
  type HasilRuleKyc,
  type IdRuleKyc,
  type MasukanKeputusanKyc,
  type TeknisBerkas,
} from "./kycAutoApproval";

let passed = 0;
let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
function ok(syarat: boolean, label: string) {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

/** NIK 16 angka dengan komponen tanggal lahir yang wajar (dd=01, mm=01). */
const NIK_SAH = "3271010101000001";
const NAMA = "BUDI SANTOSO";
const ALAMAT = "JL MERDEKA NO 1 JAKARTA";
const WA = "6281234567890";

function teknisOk(): TeknisBerkas {
  return { ada: true, terverifikasiServer: true, lebar: 1200, tinggi: 800 };
}

function isianLengkap(): MasukanKeputusanKyc["isian"] {
  return {
    namaLengkap: NAMA,
    nik: NIK_SAH,
    nomorWhatsApp: WA,
    alamat: ALAMAT,
    penghasilanBulanan: 5_000_000,
    sumberPenghasilan: "gaji bulanan",
    ktpId: "ktp-id",
    selfieKtpId: "selfie-id",
    buktiPenghasilanId: "bukti-id",
  };
}

function masukan(over: Partial<MasukanKeputusanKyc> = {}): MasukanKeputusanKyc {
  return {
    isian: isianLengkap(),
    persetujuanAktif: true,
    nomorWaTerverifikasi: true,
    teknis: { ktp: teknisOk(), selfie: teknisOk(), bukti: teknisOk() },
    ocr: { konfidensi: 92, nik: NIK_SAH, nama: NAMA, alamat: ALAMAT },
    ...over,
  };
}

function rule(k: { aturan: HasilRuleKyc[] }, id: IdRuleKyc): HasilRuleKyc {
  const r = k.aturan.find((a) => a.id === id);
  if (r === undefined) throw new Error(`rule ${id} tidak ada`);
  return r;
}

// ===== 1. Semua lulus → VERIFIED =====
{
  const k = putuskanKycOtomatis(masukan());
  eq(k.target, "VERIFIED", "semua lulus → VERIFIED");
  eq(k.alasan, "otomatis_semua_pemeriksaan_lulus", "kode alasan VERIFIED");
  eq(k.versiAturan, VERSI_ATURAN_AUTO_KYC, "versi aturan tercatat");
  eq(k.aturan.length, 9, "sembilan pemeriksaan (8 wajib + 1 agregat)");
  eq(k.aturan.filter((a) => a.status !== "lulus").length, 0, "tidak ada pemeriksaan selain lulus");
  eq(rule(k, "pemeriksaan_wajib_selesai").status, "lulus", "agregat lulus");
  ok(k.ringkasan.toLowerCase().includes("bukan persetujuan"), "ringkasan menegaskan bukan persetujuan pinjaman");
}

// ===== 2. Data identitas tidak lengkap → NEEDS_CORRECTION =====
{
  const isian = isianLengkap();
  delete isian.sumberPenghasilan;
  const k = putuskanKycOtomatis(masukan({ isian }));
  eq(k.target, "NEEDS_CORRECTION", "data kurang → NEEDS_CORRECTION");
  eq(rule(k, "data_identitas_lengkap").status, "gagal", "rule kelengkapan gagal");
  ok(rule(k, "data_identitas_lengkap").detail.some((d) => d.includes("Sumber penghasilan")), "detail menyebut sumber penghasilan");
}

// ===== 3. Persetujuan belum tercatat → NEEDS_CORRECTION =====
{
  const k = putuskanKycOtomatis(masukan({ persetujuanAktif: false }));
  eq(k.target, "NEEDS_CORRECTION", "tanpa persetujuan → NEEDS_CORRECTION");
  ok(rule(k, "data_identitas_lengkap").detail.some((d) => d.includes("Persetujuan")), "detail menyebut persetujuan");
}

// ===== 4. Format NIK: tanggal tidak wajar → gagal (bukan LULUS) =====
{
  // dd=99, mm=99 → komponen tanggal tidak wajar walau tetap 16 angka.
  const nikBuruk = "327101" + "99" + "99" + "000001";
  const k = putuskanKycOtomatis(masukan({ isian: { ...isianLengkap(), nik: nikBuruk } }));
  eq(rule(k, "format_nik_valid").status, "gagal", "NIK tanggal tak wajar → gagal");
  ok(rule(k, "format_nik_valid").pesan.includes("bukan bukti NIK resmi"), "pesan menegaskan bukan bukti resmi");
}

// ===== 5. NIK kosong / ada huruf =====
{
  const k = putuskanKycOtomatis(masukan({ isian: { ...isianLengkap(), nik: "" } }));
  eq(rule(k, "format_nik_valid").status, "gagal", "NIK kosong → gagal");
  const k2 = putuskanKycOtomatis(masukan({ isian: { ...isianLengkap(), nik: "327101010100000A" } }));
  eq(rule(k2, "format_nik_valid").status, "gagal", "NIK berhuruf → gagal");
}

// ===== 6. KTP belum diunggah / belum diperiksa server =====
{
  const k = putuskanKycOtomatis(masukan({ isian: { ...isianLengkap(), ktpId: null } }));
  eq(k.target, "NEEDS_CORRECTION", "KTP kosong → NEEDS_CORRECTION");
  eq(rule(k, "ktp_terbaca").status, "gagal", "KTP kosong → ktp_terbaca gagal");

  const belum = { ...teknisOk(), terverifikasiServer: false };
  const k2 = putuskanKycOtomatis(masukan({ teknis: { ktp: belum, selfie: teknisOk(), bukti: teknisOk() } }));
  eq(rule(k2, "ktp_terbaca").status, "gagal", "KTP belum diverifikasi server → gagal");
}

// ===== 7. Dimensi KTP tidak tercatat → TIDAK PASTI → PENDING_REVIEW =====
{
  const tanpaDimensi: TeknisBerkas = { ada: true, terverifikasiServer: true, lebar: null, tinggi: null };
  const k = putuskanKycOtomatis(masukan({ teknis: { ktp: tanpaDimensi, selfie: teknisOk(), bukti: teknisOk() } }));
  eq(rule(k, "ktp_terbaca").status, "tidak_pasti", "dimensi tak tercatat → tidak_pasti");
  eq(k.target, "PENDING_REVIEW", "dimensi tak tercatat → PENDING_REVIEW");
}

// ===== 8. Selfie/bukti: hilang atau terlalu kecil =====
{
  const k = putuskanKycOtomatis(masukan({ isian: { ...isianLengkap(), selfieKtpId: null } }));
  eq(rule(k, "dokumen_validasi_teknis").status, "gagal", "selfie kosong → gagal");
  eq(k.target, "NEEDS_CORRECTION", "selfie kosong → NEEDS_CORRECTION");

  const kecil: TeknisBerkas = { ada: true, terverifikasiServer: true, lebar: 100, tinggi: 100 };
  const k2 = putuskanKycOtomatis(masukan({ teknis: { ktp: teknisOk(), selfie: kecil, bukti: teknisOk() } }));
  eq(rule(k2, "dokumen_validasi_teknis").status, "gagal", "selfie terlalu kecil → gagal");
  ok(rule(k2, "dokumen_validasi_teknis").detail.some((d) => d.includes("terlalu kecil")), "detail menyebut terlalu kecil");
}

// ===== 9. OCR tidak tersedia → TIDAK PASTI → PENDING_REVIEW =====
{
  const k = putuskanKycOtomatis(masukan({ ocr: null }));
  eq(rule(k, "ocr_tersedia_threshold").status, "tidak_pasti", "OCR kosong → tidak_pasti");
  eq(rule(k, "ocr_konsisten").status, "tidak_pasti", "OCR kosong → konsistensi tidak_pasti");
  eq(rule(k, "tanpa_ketidaksesuaian_material").status, "tidak_pasti", "OCR kosong → material tidak_pasti");
  eq(k.target, "PENDING_REVIEW", "OCR kosong → PENDING_REVIEW");
  eq(k.alasan, "otomatis_menunggu_peninjauan", "kode alasan PENDING_REVIEW");
}

// ===== 10. Keyakinan OCR rendah → TIDAK PASTI =====
{
  const k = putuskanKycOtomatis(masukan({ ocr: { konfidensi: 40, nik: NIK_SAH, nama: NAMA, alamat: ALAMAT } }));
  eq(rule(k, "ocr_tersedia_threshold").status, "tidak_pasti", "keyakinan rendah → tidak_pasti");
  eq(k.target, "PENDING_REVIEW", "keyakinan rendah → PENDING_REVIEW");
  ok(AMBANG_KEYAKINAN_OCR_OTOMATIS > 40, "ambang otomatis di atas keyakinan rendah");
}
{
  // Tepat di ambang: nilai keyakinan OCR tidak boleh pula memicu foto ulang.
  const k = putuskanKycOtomatis(masukan({ ocr: { konfidensi: AMBANG_KEYAKINAN_OCR_OTOMATIS, nik: NIK_SAH, nama: NAMA, alamat: ALAMAT } }));
  eq(rule(k, "ocr_tersedia_threshold").status, "lulus", "keyakinan tepat ambang → lulus");
}

// ===== 11. OCR tidak memuat NIK → TIDAK PASTI =====
{
  const k = putuskanKycOtomatis(masukan({ ocr: { konfidensi: 92, nik: null, nama: NAMA, alamat: ALAMAT } }));
  eq(rule(k, "ocr_tersedia_threshold").status, "tidak_pasti", "NIK OCR kosong → tidak_pasti");
  eq(k.target, "PENDING_REVIEW", "NIK OCR kosong → PENDING_REVIEW");
}

// ===== 12. Ketidaksesuaian MATERIAL (NIK berbeda) → NEEDS_CORRECTION =====
{
  const k = putuskanKycOtomatis(
    masukan({ ocr: { konfidensi: 92, nik: "3271010101009999", nama: NAMA, alamat: ALAMAT } }),
  );
  eq(rule(k, "ocr_konsisten").status, "gagal", "NIK tidak cocok → konsisten gagal");
  eq(rule(k, "tanpa_ketidaksesuaian_material").status, "gagal", "NIK tidak cocok → material gagal");
  eq(k.target, "NEEDS_CORRECTION", "mismatch material → NEEDS_CORRECTION");
}

// ===== 13. Nama berbeda → NEEDS_CORRECTION =====
{
  const k = putuskanKycOtomatis(
    masukan({ ocr: { konfidensi: 92, nik: NIK_SAH, nama: "ANDI WIJAYA", alamat: ALAMAT } }),
  );
  eq(rule(k, "tanpa_ketidaksesuaian_material").status, "gagal", "nama berbeda → material gagal");
  eq(k.target, "NEEDS_CORRECTION", "nama berbeda → NEEDS_CORRECTION");
}

// ===== 14. Hanya alamat berbeda (non-material) → TIDAK PASTI → PENDING_REVIEW =====
{
  const k = putuskanKycOtomatis(
    masukan({ ocr: { konfidensi: 92, nik: NIK_SAH, nama: NAMA, alamat: "JL SUDIRMAN NO 99 BANDUNG" } }),
  );
  eq(rule(k, "ocr_konsisten").status, "tidak_pasti", "alamat beda → konsisten tidak_pasti");
  eq(rule(k, "tanpa_ketidaksesuaian_material").status, "lulus", "alamat beda bukan material");
  eq(k.target, "PENDING_REVIEW", "alamat beda → PENDING_REVIEW");
}

// ===== 15. WhatsApp belum terverifikasi → NEEDS_CORRECTION =====
{
  const k = putuskanKycOtomatis(masukan({ nomorWaTerverifikasi: false }));
  eq(rule(k, "nomor_wa_terverifikasi").status, "gagal", "WA belum OTP → gagal");
  eq(k.target, "NEEDS_CORRECTION", "WA belum OTP → NEEDS_CORRECTION");
  // Pesan LULUS menegaskan bahwa OTP hanya membuktikan kontrol atas nomor.
  const lulusWa = putuskanKycOtomatis(masukan());
  ok(rule(lulusWa, "nomor_wa_terverifikasi").pesan.includes("kontrol atas nomor"), "pesan OTP menegaskan batasnya");
}

// ===== 16. Prioritas: gagal menang atas tidak pasti =====
{
  const k = putuskanKycOtomatis(
    masukan({ nomorWaTerverifikasi: false, ocr: null }),
  );
  eq(k.target, "NEEDS_CORRECTION", "gagal + tidak pasti → NEEDS_CORRECTION");
  eq(rule(k, "pemeriksaan_wajib_selesai").status, "gagal", "agregat gagal bila ada gagal");
}

// ===== 17. Agregat lulus hanya bila semuanya lulus =====
{
  const k = putuskanKycOtomatis(masukan());
  eq(rule(k, "pemeriksaan_wajib_selesai").status, "lulus", "agregat lulus");
}

// ===== 18. Idempoten: sidik jari stabil & tanpa data pribadi =====
{
  const a = putuskanKycOtomatis(masukan());
  const b = putuskanKycOtomatis(masukan());
  eq(a.sidikJari, b.sidikJari, "sidik jari stabil untuk masukan identik");
  ok(!a.sidikJari.includes(NIK_SAH), "sidik jari tidak memuat NIK");
  ok(!a.sidikJari.includes(NAMA), "sidik jari tidak memuat nama");
  ok(!a.sidikJari.includes(WA), "sidik jari tidak memuat nomor WhatsApp");
  ok(a.sidikJari.includes(VERSI_ATURAN_AUTO_KYC), "sidik jari memuat versi aturan");

  const beda = putuskanKycOtomatis(masukan({ nomorWaTerverifikasi: false }));
  ok(beda.sidikJari !== a.sidikJari, "sidik jari berubah saat hasil pemeriksaan berubah");
}

// ===== 19. Kebijakan penerapan: hanya VERIFIED yang boleh mengubah status =====
// Mesin tidak pernah menurunkan status: NEEDS_CORRECTION tetap keputusan petugas
// supaya pengajuan tidak tertutup dari jalur verifikasi petugas.
{
  ok(bolehTerapkanOtomatis("VERIFIED"), "VERIFIED boleh diterapkan mesin");
  ok(!bolehTerapkanOtomatis("NEEDS_CORRECTION"), "NEEDS_CORRECTION tetap milik petugas");
  ok(!bolehTerapkanOtomatis("PENDING_REVIEW"), "PENDING_REVIEW tidak mengubah status");
  ok(!bolehTerapkanOtomatis("REJECTED"), "REJECTED tidak pernah diterapkan mesin");
  ok(!bolehTerapkanOtomatis("IN_PROGRESS"), "status lain tidak pernah diterapkan mesin");
}

// ===== 20. Catatan batas wajib ada & menyebut hal yang tidak diklaim =====
{
  const t = CATATAN_AUTO_KYC.toLowerCase();
  ok(t.includes("dukcapil"), "catatan menyebut Dukcapil tidak diverifikasi");
  ok(t.includes("bukan bukti"), "catatan menegaskan bukan bukti");
  ok(t.includes("pending_review"), "catatan menyebut PENDING_REVIEW untuk ketidakpastian");
  ok(t.includes("petugas"), "catatan menegaskan keputusan tetap di tangan petugas");
}

console.log(`kycAutoApproval.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
