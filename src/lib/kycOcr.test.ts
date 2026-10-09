/**
 * Uji logika OCR KTP (murni, tanpa tesseract/DOM).
 * Run: bun src/lib/kycOcr.test.ts
 *
 * Karena OCR asli butuh model + WASM, uji ini bekerja pada TEKS yang mewakili
 * keluaran tesseract untuk lima situasi nyata: gambar jelas, buram, terpotong,
 * rotasi, dan hasil ekstraksi yang salah. Yang dijaga: penguraian lapangan,
 * pemeriksaan BENTUK NIK (bukan keaslian), penandaan ketidaksesuaian dengan
 * formulir, tingkat keyakinan, dan keputusan minta foto ulang/pemeriksaan manual.
 */
import {
  bandingkanKtpDenganForm,
  CATATAN_NIK,
  CATATAN_OCR,
  nikBertopeng,
  nilaiHasilOcr,
  normalkanTeksKtp,
  perbaikiDigitNik,
  periksaFormatNik,
  ringkasOcrKtp,
  tingkatKeyakinan,
  uraikanKtp,
  uraikanTempatTanggalLahir,
} from "./kycOcr";

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
function cocok(teks: string | null, pola: RegExp, label: string) {
  if (teks !== null && pola.test(teks)) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}: "${teks}" tidak cocok ${pola}`);
  }
}

/* ==========================================================================
 * 1. Gambar JELAS — semua lapangan terbaca
 * ========================================================================== */
const TEKS_JELAS = `PROVINSI DKI JAKARTA
KOTA JAKARTA PUSAT
NIK : 3271010101900001
Nama : RANI PUSPITA
Tempat/Tgl Lahir : JAKARTA, 01-01-1990
Jenis Kelamin : PEREMPUAN
Golongan Darah : O
Alamat : JL MERDEKA NO 10
RT/RW : 001/002
Kel/Desa : KELAPA GADING
Kecamatan : KELAPA GADING
Agama : ISLAM
Status Perkawinan : KAWIN
Pekerjaan : KARYAWAN SWASTA
Kewarganegaraan : WNI
Berlaku Hingga : SEUMUR HIDUP`;

{
  const ktp = uraikanKtp(TEKS_JELAS);
  eq(ktp.nik, "3271010101900001", "NIK terbaca utuh");
  eq(ktp.nama, "RANI PUSPITA", "nama terbaca");
  eq(ktp.tempatLahir, "JAKARTA", "tempat lahir terbaca");
  eq(ktp.tanggalLahir, "1990-01-01", "tanggal lahir ternormalisasi");
  eq(ktp.jenisKelamin, "PEREMPUAN", "jenis kelamin terbaca");
  eq(ktp.alamat, "JL MERDEKA NO 10", "alamat terbaca");
  eq(ktp.rtRw, "001/002", "RT/RW terbaca");
  eq(ktp.kecamatan, "KELAPA GADING", "kecamatan terbaca");
  eq(ktp.agama, "ISLAM", "agama terbaca");
  eq(ktp.pekerjaan, "KARYAWAN SWASTA", "pekerjaan terbaca");
  eq(ktp.kewarganegaraan, "WNI", "kewarganegaraan terbaca");
  eq(ktp.berlakuHingga, "SEUMUR HIDUP", "masa berlaku terbaca");

  const nik = periksaFormatNik(ktp.nik);
  ok(nik.ok, "NIK jelas lolos bentuk 16 digit");
  ok(nik.catatan.includes("Dukcapil"), "catatan menegaskan bukan verifikasi Dukcapil");

  const nilai = nilaiHasilOcr(ktp, 92);
  eq(tingkatKeyakinan(92), "tinggi", "keyakinan 92 → tinggi");
  eq(nilai.perluFotoUlang, false, "gambar jelas tidak minta foto ulang");
  eq(nilai.perluPeriksaManual, false, "gambar jelas & lengkap tidak perlu periksa manual");

  const beda = bandingkanKtpDenganForm(ktp, {
    namaLengkap: "RANI PUSPITA",
    nik: "3271010101900001",
    alamat: "JL MERDEKA NO 10",
  });
  eq(beda.length, 0, "isian formulir yang sama → tanpa ketidaksesuaian");
}

/* ==========================================================================
 * 2. Gambar BURAM — NIK tidak terbaca, keyakinan rendah
 * ========================================================================== */
const TEKS_BURAM = `PR0V1N51 DK1 JAKARTA
NlK : 32710101019
Nama : RANl PUSPlTA
Tempat/Tgl Lahir : JAKARTA, 0l-0l-l990`;

{
  const ktp = uraikanKtp(TEKS_BURAM);
  eq(ktp.nik, null, "NIK buram (11 angka) tidak dipaksakan jadi 16");
  const nilai = nilaiHasilOcr(ktp, 34);
  eq(tingkatKeyakinan(34), "rendah", "keyakinan 34 → rendah");
  eq(nilai.perluFotoUlang, true, "buram → minta foto ulang");
  ok(nilai.alasan.length > 0, "buram memberi alasan yang bisa ditampilkan");
  ok(
    nilai.alasan.some((a) => a.toLowerCase().includes("nik")),
    "alasan buram menyebut NIK tidak terbaca",
  );
}

/* ==========================================================================
 * 3. Gambar TERPOTONG — sebagian lapangan hilang
 * ========================================================================== */
const TEKS_TERPOTONG = `NIK : 3271010101900001
Nama : RANI PUSPITA`;

{
  const ktp = uraikanKtp(TEKS_TERPOTONG);
  eq(ktp.nik, "3271010101900001", "terpotong: NIK masih terbaca");
  eq(ktp.nama, "RANI PUSPITA", "terpotong: nama masih terbaca");
  eq(ktp.alamat, null, "terpotong: alamat hilang → null, bukan dikarang");
  eq(ktp.tanggalLahir, null, "terpotong: tanggal lahir hilang → null");
  const nilai = nilaiHasilOcr(ktp, 88);
  eq(nilai.perluPeriksaManual, true, "terpotong → perlu pemeriksaan manual");
  ok(
    nilai.alasan.some((a) => a.toLowerCase().includes("alamat")),
    "alasan terpotong menyebut alamat tidak terbaca",
  );
}

/* ==========================================================================
 * 4. ROTASI — kartu miring & kartu terbalik
 * ========================================================================== */
// 4a. Dipindai miring: label dan nilai terpisah baris (tetap urut) → tetap terbaca.
const TEKS_MIRING = `NIK
3271010101900001
NAMA
RANI PUSPITA
ALAMAT
JL MERDEKA NO 10`;

{
  const ktp = uraikanKtp(TEKS_MIRING);
  eq(ktp.nik, "3271010101900001", "miring: NIK terbaca dari baris di bawah label");
  eq(ktp.nama, "RANI PUSPITA", "miring: nama terbaca");
  eq(ktp.alamat, "JL MERDEKA NO 10", "miring: alamat terbaca");
  eq(nilaiHasilOcr(ktp, 85).perluFotoUlang, false, "miring & lengkap → tidak minta foto ulang");
}

// 4b. Kartu benar-benar terbalik: label terbaca terbalik → tidak dikenali.
const TEKS_TERBALIK = `KIN
0000001910101723
AMAN`;

{
  const ktp = uraikanKtp(TEKS_TERBALIK);
  eq(ktp.nama, null, "terbalik: nama tidak dikenali (label dibalik)");
  eq(ktp.nik, "0000001910101723", "terbalik: deret 16 angka tetap terbaca sebagai NIK");
  eq(nilaiHasilOcr(ktp, 62).perluFotoUlang, true, "terbalik tanpa nama → minta foto ulang");
}

/* ==========================================================================
 * 5. HASIL EKSTRAKSI SALAH — huruf mirip angka & ketidaksesuaian formulir
 * ========================================================================== */
{
  // Huruf O/I menggantikan angka 0/1 pada NIK.
  eq(perbaikiDigitNik("3271O1O1O19OOO12"), "3271010101900012", "huruf O/I diperbaiki jadi angka");
  const ktp = uraikanKtp(
    "NIK : 3271O1O1O19OOO12\nNama : RANI PUSPITASARI\nAlamat : JL MERDEKA NO 10",
  );
  eq(ktp.nik, "3271010101900012", "NIK dengan huruf mirip angka tetap terbaca");

  const beda = bandingkanKtpDenganForm(ktp, {
    namaLengkap: "RANI PUSPITA",
    nik: "3271010101900013",
    alamat: "JALAN SUDIRMAN 5",
  });
  ok(beda.some((b) => b.field === "nik"), "NIK berbeda → ditandai");
  ok(beda.some((b) => b.field === "nama"), "nama berbeda → ditandai");
  ok(beda.some((b) => b.field === "alamat"), "alamat berbeda jauh → ditandai");
}

/* ==========================================================================
 * 6. Validasi BENTUK NIK — bukan keaslian
 * ========================================================================== */
{
  ok(periksaFormatNik("3271010101900001").ok, "16 digit dengan tanggal wajar → bentuk sah");
  eq(periksaFormatNik("3271010101900001").catatan, CATATAN_NIK, "catatan NIK konsisten");
  eq(periksaFormatNik("123").panjang16, false, "NIK pendek → panjang 16 salah");
  eq(periksaFormatNik("3271O10101900001").huruf, true, "NIK berhuruf → ditandai");
  eq(periksaFormatNik(null).ada, false, "NIK null → tidak ada");
  // Tanggal mustahil (hari 99) → bentuk tidak sah walau 16 digit.
  eq(periksaFormatNik("3271019901900001").ok, false, "hari 99 → bentuk tidak sah");
  // Tanggal > 40 = penanda lahir perempuan; tetap wajar.
  ok(periksaFormatNik("3271014101900001").tanggalWajar, "tanggal +40 (perempuan) tetap wajar");
  eq(nikBertopeng("3271010101900001"), "3271••••••••0001", "NIK bertopeng menyembunyikan tengah");
}

/* ==========================================================================
 * 7. Normalisasi & utilitas
 * ========================================================================== */
{
  eq(normalkanTeksKtp("NIK | 123"), "NIK I 123", "pipa dibaca sebagai huruf I");
  const ttl = uraikanTempatTanggalLahir("BANDUNG, 31/12/1985");
  eq(ttl.tempatLahir, "BANDUNG", "tempat lahir terpisah dari tanggal");
  eq(ttl.tanggalLahir, "1985-12-31", "tanggal format lain dinormalisasi");
  eq(uraikanTempatTanggalLahir("SURABAYA").tanggalLahir, null, "tanpa tanggal → null");

  const ktp = uraikanKtp(TEKS_JELAS);
  const ringkas = ringkasOcrKtp(ktp);
  eq(ringkas.length, 14, "ringkasan memuat semua 14 lapangan");
  ok(ringkas[0].label === "NIK", "ringkasan dimulai dari NIK");
  cocok(CATATAN_OCR, /tidak membuktikan keaslian/i, "catatan OCR menegaskan bukan bukti keaslian");
  cocok(CATATAN_OCR, /VERIFIED/, "catatan OCR menegaskan tidak auto-VERIFIED");
}

console.log(`kycOcr.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
