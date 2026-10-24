/**
 * Uji penyaring konsol KYC admin (logika murni).
 * Run: bun src/lib/kycAdmin.test.ts
 *
 * Yang dijaga: pencarian (nama/email/kode nasabah), saringan status, rentang
 * tanggal yang INKLUSIF, saringan hasil pemeriksaan (termasuk hasil mesin
 * otomatis), cacah per status yang selalu lengkap, dan status dokumen yang
 * tidak pernah menyebut "siap" untuk berkas yang belum diperiksa server.
 */
import {
  adaFilterKyc,
  cacahPerStatus,
  cocokHasil,
  cocokKata,
  cocokTanggal,
  cocokTanpaStatus,
  FILTER_KYC_KOSONG,
  hasilDariTeks,
  LABEL_FILTER_HASIL_KYC,
  LABEL_STATUS_DOKUMEN_KYC,
  rentangTanggal,
  ringkasFilterKyc,
  ringkasJumlahKyc,
  saringKycAdmin,
  statusDariTeks,
  statusDokumenKyc,
  STATUS_DOKUMEN_KYC,
  type BarisSaringKyc,
  type FilterKyc,
} from "./kycAdmin";
import { KYC_STATUS, type StatusKyc } from "./kycStatus";

let passed = 0;
let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}: expected ${b}, got ${a}`);
  }
}
function ok(syarat: boolean, label: string) {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

const HARI = 24 * 60 * 60 * 1000;
const TGL_1 = new Date(2026, 9, 1, 10, 0, 0).getTime(); // 1 Okt 2026 10:00
const TGL_5 = new Date(2026, 9, 5, 9, 30, 0).getTime();
const TGL_10 = new Date(2026, 9, 10, 23, 0, 0).getTime();

function baris(over: Partial<BarisSaringKyc> = {}): BarisSaringKyc {
  return {
    nama: "RANI PUSPITA",
    email: "rani@pindai.test",
    kodePeminjam: "PGD-20261001-AB12",
    status: "PENDING_REVIEW" as StatusKyc,
    kekurangan: [],
    aturanUsang: false,
    nomorWhatsAppTerbukti: true,
    verifikasiUlangTertunda: false,
    dokumenBelumDiperiksa: false,
    diajukanPada: TGL_5,
    diperbaruiPada: TGL_5,
    keputusanOtomatis: null,
    ...over,
  };
}

function filter(over: Partial<FilterKyc> = {}): FilterKyc {
  return { ...FILTER_KYC_KOSONG, ...over };
}

// ===== 1. Nilai saringan dari klien tidak dipercaya apa adanya =====
{
  eq(statusDariTeks("VERIFIED"), "VERIFIED", "status sah diterima");
  eq(statusDariTeks(" verified "), "VERIFIED", "spasi & huruf kecil dirapikan");
  eq(statusDariTeks("SEDANG_DIPERIKSA"), null, "status tak dikenal diabaikan");
  eq(statusDariTeks(""), null, "status kosong = tanpa saringan");
  eq(statusDariTeks(undefined), null, "status undefined = tanpa saringan");

  eq(hasilDariTeks("aturan_lama"), "aturan_lama", "hasil sah diterima");
  eq(hasilDariTeks("semua"), "semua", "semua tetap semua");
  eq(hasilDariTeks("hasil_ajaib"), "semua", "hasil tak dikenal jatuh ke semua");
  eq(hasilDariTeks(undefined), "semua", "hasil undefined = semua");
}

// ===== 2. Rentang tanggal: inklusif, dan tanggal palsu ditolak =====
{
  const rentang = rentangTanggal("2026-10-01", "2026-10-05");
  eq(rentang.dari, new Date(2026, 9, 1).getTime(), "batas bawah = awal hari");
  eq(
    rentang.sampai,
    new Date(2026, 9, 5).getTime() + HARI - 1,
    "batas atas = akhir hari yang dipilih (inklusif)",
  );
  ok(cocokTanggal(TGL_1, rentang.dari, rentang.sampai), "hari pertama ikut");
  ok(cocokTanggal(TGL_5, rentang.dari, rentang.sampai), "hari terakhir ikut");
  ok(
    !cocokTanggal(new Date(2026, 9, 6).getTime(), rentang.dari, rentang.sampai),
    "hari setelah rentang tidak ikut",
  );

  eq(rentangTanggal(null, null), { dari: null, sampai: null }, "tanpa tanggal = tanpa batas");
  eq(rentangTanggal("", "  "), { dari: null, sampai: null }, "teks kosong diabaikan");
  eq(rentangTanggal("kemarin", "besok"), { dari: null, sampai: null }, "teks bukan tanggal diabaikan");
  eq(
    rentangTanggal("2026-02-31", null).dari,
    null,
    "tanggal yang meluber (31 Feb) ditolak, bukan dibulatkan",
  );
  eq(rentangTanggal("2026-13-01", null).dari, null, "bulan 13 ditolak");
}

// ===== 3. Rentang terbalik = daftar kosong, bukan diam-diam ditukar =====
{
  const terbalik = rentangTanggal("2026-10-10", "2026-10-01");
  const hasil = saringKycAdmin([baris({ diajukanPada: TGL_5 })], filter(terbalik));
  eq(hasil.length, 0, "rentang terbalik tidak mengembalikan baris apa pun");
  ok(adaFilterKyc(filter(terbalik)), "rentang terbalik tetap dihitung sebagai saringan aktif");
}

// ===== 4. Pencarian: nama, email, kode nasabah =====
{
  ok(cocokKata("rani", baris()), "cocok nama tanpa peduli huruf besar");
  ok(cocokKata("  PUSPITA ", baris()), "spasi berlebih & huruf besar disamakan");
  ok(cocokKata("rani@pindai", baris()), "cocok email");
  ok(cocokKata("pgd-20261001-ab12", baris()), "cocok kode nasabah");
  ok(cocokKata("PGD-2026", baris()), "cocok sebagian kode nasabah");
  ok(!cocokKata("budi", baris()), "nama lain tidak cocok");
  ok(cocokKata("", baris()), "kata kunci kosong = semua cocok");
  ok(
    cocokKata("budi", baris({ email: null, kodePeminjam: null, nama: "BUDI SANTOSO" })),
    "baris tanpa email/kode tetap bisa dicari dari nama",
  );
}

// ===== 5. Saringan hasil pemeriksaan =====
{
  const mesinVerifikasi = baris({ keputusanOtomatis: { keputusan: "VERIFIED" } });
  const mesinPerbaikan = baris({ keputusanOtomatis: { keputusan: "NEEDS_CORRECTION" } });
  const mesinMenunggu = baris({ keputusanOtomatis: { keputusan: "PENDING_REVIEW" } });

  ok(cocokHasil(mesinVerifikasi, "otomatis_verifikasi"), "hasil mesin VERIFIED cocok");
  ok(!cocokHasil(mesinPerbaikan, "otomatis_verifikasi"), "hasil mesin lain tidak cocok");
  ok(cocokHasil(mesinPerbaikan, "otomatis_perlu_perbaikan"), "hasil mesin perlu perbaikan cocok");
  ok(cocokHasil(mesinMenunggu, "otomatis_menunggu"), "hasil mesin belum pasti cocok");
  ok(
    !cocokHasil(baris({ keputusanOtomatis: undefined }), "otomatis_verifikasi"),
    "keputusan mesin yang belum dimuat TIDAK dianggap cocok",
  );
  ok(
    !cocokHasil(baris({ keputusanOtomatis: null }), "otomatis_menunggu"),
    "belum pernah diperiksa mesin tidak dianggap 'belum bisa dipastikan'",
  );

  ok(!cocokHasil(baris({ nomorWhatsAppTerbukti: false }), "otomatis_verifikasi"), "hasil lain aman");
  ok(cocokHasil(baris({ nomorWhatsAppTerbukti: false }), "belum_otp"), "WA belum OTP cocok");
  ok(!cocokHasil(baris(), "belum_otp"), "WA terbukti tidak ikut saringan belum OTP");
  ok(cocokHasil(baris({ kekurangan: ["NIK 16 angka"] }), "isian_kurang"), "isian kurang cocok");
  ok(!cocokHasil(baris(), "isian_kurang"), "isian lengkap tidak ikut");
  ok(cocokHasil(baris({ aturanUsang: true }), "aturan_lama"), "aturan lama cocok");
  ok(cocokHasil(baris({ verifikasiUlangTertunda: true }), "verifikasi_ulang"), "verifikasi ulang cocok");
  ok(
    cocokHasil(baris({ dokumenBelumDiperiksa: true }), "dokumen_belum_diperiksa"),
    "dokumen belum diperiksa cocok",
  );
  ok(
    cocokHasil(baris({ sumberVerifikasi: "manual_admin" }), "manual_admin"),
    "baris manual cocok",
  );
  ok(
    !cocokHasil(baris({ sumberVerifikasi: null }), "manual_admin"),
    "baris bukan manual tidak ikut saringan manual",
  );
  for (const pilihan of Object.keys(LABEL_FILTER_HASIL_KYC)) {
    ok(LABEL_FILTER_HASIL_KYC[pilihan as keyof typeof LABEL_FILTER_HASIL_KYC].length > 0, `label ${pilihan} terisi`);
  }
}

// ===== 6. Kombinasi: kata kunci + status + tanggal + hasil =====
{
  const daftar = [
    baris({ nama: "RANI PUSPITA", status: "PENDING_REVIEW", diajukanPada: TGL_5 }),
    baris({
      nama: "RANI PUSPITA",
      email: "rani2@pindai.test",
      kodePeminjam: "PGD-20261010-ZZ99",
      status: "VERIFIED",
      diajukanPada: TGL_10,
      keputusanOtomatis: { keputusan: "VERIFIED" },
    }),
    baris({
      nama: "BUDI SANTOSO",
      email: "budi@pindai.test",
      kodePeminjam: "PGD-20261010-BB01",
      status: "VERIFIED",
      diajukanPada: TGL_10,
      keputusanOtomatis: { keputusan: "VERIFIED" },
    }),
  ];

  eq(saringKycAdmin(daftar, filter()).length, 3, "tanpa saringan = semua baris");
  eq(saringKycAdmin(daftar, filter({ cari: "rani" })).length, 2, "cari menyaring nama");
  eq(saringKycAdmin(daftar, filter({ status: "VERIFIED" })).length, 2, "status menyaring");
  eq(
    saringKycAdmin(daftar, filter({ status: "VERIFIED", cari: "budi" })).length,
    1,
    "kata kunci + status digabung",
  );
  eq(
    saringKycAdmin(daftar, filter(rentangTanggal("2026-10-10", "2026-10-10"))).length,
    2,
    "rentang satu hari ikut",
  );
  eq(
    saringKycAdmin(
      daftar,
      filter({ hasil: "otomatis_verifikasi", ...rentangTanggal("2026-10-01", "2026-10-09") }),
    ).length,
    0,
    "hasil + tanggal digabung",
  );
  ok(
    cocokTanpaStatus(daftar[0]!, filter({ status: "VERIFIED" })),
    "cocokTanpaStatus mengabaikan status (dasar cacah)",
  );
}

// ===== 7. Cacah per status selalu lengkap =====
{
  const cacah = cacahPerStatus([
    baris({ status: "PENDING_REVIEW" }),
    baris({ status: "PENDING_REVIEW" }),
    baris({ status: "VERIFIED" }),
  ]);
  eq(Object.keys(cacah).sort(), [...KYC_STATUS].sort(), "semua status ada di cacah");
  eq(cacah.PENDING_REVIEW, 2, "cacah PENDING_REVIEW");
  eq(cacah.VERIFIED, 1, "cacah VERIFIED");
  eq(cacah.REJECTED, 0, "status tanpa baris tetap nol");
  eq(cacahPerStatus([]).NOT_STARTED, 0, "cacah daftar kosong tetap lengkap");
}

// ===== 8. Ringkasan saringan & jumlah =====
{
  ok(!adaFilterKyc(filter()), "saringan kosong terdeteksi");
  ok(adaFilterKyc(filter({ cari: "rani" })), "kata kunci dihitung aktif");
  ok(adaFilterKyc(filter({ status: "REJECTED" })), "status dihitung aktif");
  ok(adaFilterKyc(filter({ hasil: "belum_otp" })), "hasil dihitung aktif");
  ok(adaFilterKyc(filter({ dari: TGL_1, sampai: null })), "tanggal dihitung aktif");

  const bagian = ringkasFilterKyc(
    filter({ cari: "rani", status: "VERIFIED", hasil: "belum_otp", ...rentangTanggal("2026-10-01", "2026-10-05") }),
  );
  eq(bagian.length, 4, "empat bagian saringan dilaporkan");
  ok(bagian[0]!.includes("rani"), "kata kunci disebut");
  ok(bagian[1]!.includes("Terverifikasi"), "label status bersama dipakai");
  ok(bagian[2]!.includes("whatsapp belum terverifikasi"), "label hasil dipakai apa adanya");
  ok(bagian[3]!.startsWith("tanggal "), "rentang tanggal disebut");
  ok(ringkasFilterKyc(filter()).length === 0, "tanpa saringan = tanpa kalimat");

  eq(ringkasJumlahKyc(2, 13), "Menampilkan 2 dari 13 pengajuan KYC", "kalimat jumlah");
}

// ===== 9. Status dokumen: "siap" hanya bila isi berkas sudah diperiksa =====
{
  eq(
    statusDokumenKyc({ diunggah: false, diperiksaServer: false, aturanUsang: false }),
    "belum_diunggah",
    "berkas kosong",
  );
  eq(
    statusDokumenKyc({ diunggah: true, diperiksaServer: false, aturanUsang: false }),
    "belum_diperiksa",
    "terunggah tapi belum diperiksa server",
  );
  eq(
    statusDokumenKyc({ diunggah: true, diperiksaServer: true, aturanUsang: true }),
    "perlu_diperiksa_ulang",
    "diperiksa dengan aturan lama",
  );
  eq(
    statusDokumenKyc({ diunggah: true, diperiksaServer: true, aturanUsang: false }),
    "siap",
    "berkas siap",
  );
  for (const status of STATUS_DOKUMEN_KYC) {
    ok(LABEL_STATUS_DOKUMEN_KYC[status].length > 0, `label dokumen ${status} terisi`);
  }
}

console.log(`kycAdmin.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
