/**
 * Uji validasi & normalisasi data diri nasabah.
 * Run: bun src/lib/dataDiri.test.ts
 *
 * Semua harapan ditulis TANGAN dari aturan produk — bukan disalin dari
 * keluaran fungsi. Kalau aturannya berubah, uji ini harus gagal.
 */
import {
  DATA_DIRI_KOSONG,
  DATA_DIRI_BATAS,
  bacaDataDiri,
  formDariTersimpan,
  penghasilanDariTeks,
  type DataDiriForm,
} from "./dataDiri";

let passed = 0;
let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else {
    failed += 1;
    console.error(
      `FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

/** Form lengkap yang valid, lalu ditimpa sebagian. */
function form(overrides: Partial<DataDiriForm> = {}): DataDiriForm {
  return {
    namaLengkap: "Rani Puspita",
    nik: "3271012345678901",
    nomorWhatsApp: "6281234567890",
    alamat: "Jalan Merdeka No. 10, Bandung",
    pekerjaan: "Karyawan swasta",
    penghasilan: "5.000.000",
    namaBank: "BCA",
    nomorRekening: "1234567890",
    ...overrides,
  };
}

// ===== penghasilanDariTeks =====
eq(penghasilanDariTeks(""), null, "penghasilan kosong → null");
eq(penghasilanDariTeks("2.500.000"), 2_500_000, "penghasilan berpemisah titik");
eq(penghasilanDariTeks("Rp 3.000.000"), 3_000_000, "penghasilan dengan awalan Rp");
eq(penghasilanDariTeks("abc"), null, "penghasilan tanpa digit → null");

// ===== Isian lengkap valid =====
{
  const { tersimpan, pesan } = bacaDataDiri(form());
  eq(pesan, null, "form lengkap → tanpa pesan");
  eq(tersimpan, {
    // Nama disimpan HURUF BESAR (lib/nama.ts) — sama dengan ruang penyedia dana.
    namaLengkap: "RANI PUSPITA",
    nik: "3271012345678901",
    nomorWhatsApp: "6281234567890",
    alamat: "Jalan Merdeka No. 10, Bandung",
    pekerjaan: "Karyawan swasta",
    penghasilanBulanan: 5_000_000,
    namaBank: "BCA",
    nomorRekening: "1234567890",
  }, "form lengkap → nilai tersimpan");
}

// ===== Normalisasi =====
{
  const { tersimpan } = bacaDataDiri(
    form({
      namaLengkap: "  Rani   Puspita  ",
      nik: "3271 0123 4567 8901",
      nomorWhatsApp: "62 812-3456-7890",
      nomorRekening: "1234-567-890",
      penghasilan: "2.500.000",
    }),
  );
  eq(tersimpan?.namaLengkap, "RANI PUSPITA", "nama dirapikan spasinya & jadi huruf besar");
  eq(tersimpan?.nik, "3271012345678901", "NIK dinormalkan jadi digit");
  eq(tersimpan?.nomorWhatsApp, "6281234567890", "WhatsApp dinormalkan jadi digit");
  eq(tersimpan?.nomorRekening, "1234567890", "rekening dinormalkan jadi digit");
  eq(tersimpan?.penghasilanBulanan, 2_500_000, "penghasilan diekstrak angkanya");
}

// ===== Bidang opsional kosong → null =====
{
  const { tersimpan, pesan } = bacaDataDiri(
    form({
      alamat: "",
      pekerjaan: "   ",
      penghasilan: "",
      namaBank: "",
      nomorRekening: "",
    }),
  );
  eq(pesan, null, "opsional kosong tetap sah");
  eq(tersimpan?.alamat, null, "alamat kosong → null");
  eq(tersimpan?.pekerjaan, null, "pekerjaan spasi → null");
  eq(tersimpan?.penghasilanBulanan, null, "penghasilan kosong → null");
  eq(tersimpan?.namaBank, null, "bank kosong → null");
  eq(tersimpan?.nomorRekening, null, "rekening kosong → null");
}

// ===== Penolakan: identitas wajib =====
eq(bacaDataDiri(form({ namaLengkap: "Al" })).tersimpan, null, "nama terlalu pendek ditolak");
eq(
  bacaDataDiri(form({ namaLengkap: "Al" })).pesan,
  `Nama lengkap wajib ${DATA_DIRI_BATAS.namaMin}–${DATA_DIRI_BATAS.namaMaks} karakter.`,
  "pesan nama terlalu pendek",
);

eq(bacaDataDiri(form({ nik: "32710123456789" })).tersimpan, null, "NIK <16 angka ditolak");
eq(
  bacaDataDiri(form({ nik: "32710123456789" })).pesan,
  "Nomor KTP (NIK) harus terdiri dari 16 angka.",
  "pesan NIK pendek",
);
eq(bacaDataDiri(form({ nik: "32710123456789ab" })).tersimpan, null, "NIK berhuruf ditolak");

eq(bacaDataDiri(form({ nomorWhatsApp: "081234567890" })).tersimpan, null, "WA tanpa 62 ditolak");
eq(
  bacaDataDiri(form({ nomorWhatsApp: "081234567890" })).pesan,
  "Nomor WhatsApp harus diawali 62 tanpa tanda +, contoh: 6281234567890.",
  "pesan WA salah awalan",
);
eq(bacaDataDiri(form({ nomorWhatsApp: "621234" })).tersimpan, null, "WA terlalu pendek ditolak");

// ===== Penolakan: bidang opsional yang diisi tapi tidak sah =====
eq(bacaDataDiri(form({ alamat: "Jl." })).tersimpan, null, "alamat terlalu pendek ditolak");
eq(bacaDataDiri(form({ pekerjaan: "ab" })).tersimpan, null, "pekerjaan terlalu pendek ditolak");
eq(bacaDataDiri(form({ namaBank: "B" })).tersimpan, null, "bank terlalu pendek ditolak");
eq(bacaDataDiri(form({ nomorRekening: "12345" })).tersimpan, null, "rekening terlalu pendek ditolak");

// ===== Penolakan: batas angka =====
eq(bacaDataDiri(form({ penghasilan: "0" })).tersimpan, null, "penghasilan 0 ditolak");
eq(
  bacaDataDiri(form({ penghasilan: "0" })).pesan,
  "Penghasilan per bulan harus angka rupiah bulat positif.",
  "pesan penghasilan 0",
);
eq(
  bacaDataDiri(form({ penghasilan: "1.000.000.001" })).tersimpan,
  null,
  "penghasilan di atas batas ditolak",
);
eq(
  bacaDataDiri(form({ penghasilan: "1.000.000.001" })).pesan,
  "Penghasilan per bulan tidak boleh melebihi Rp 1.000.000.000.",
  "pesan penghasilan di atas batas",
);

// ===== formDariTersimpan =====
{
  const f = formDariTersimpan({
    namaLengkap: "Rani Puspita",
    nik: "3271012345678901",
    nomorWhatsApp: "6281234567890",
    alamat: null,
    pekerjaan: null,
    penghasilanBulanan: 5_000_000,
    namaBank: "BCA",
    nomorRekening: null,
  });
  eq(f.alamat, "", "alamat null → isian kosong");
  eq(f.pekerjaan, "", "pekerjaan null → isian kosong");
  eq(f.nomorRekening, "", "rekening null → isian kosong");
  eq(f.penghasilan, "5.000.000", "penghasilan diformat pemisah ribuan");
}

// Isian kosong tidak lolos (berguna untuk memastikan form kosong tak bisa simpan).
eq(bacaDataDiri(DATA_DIRI_KOSONG).tersimpan, null, "form kosong ditolak");

console.log(`\ndataDiri: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
