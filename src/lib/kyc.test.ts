/** Run: bun src/lib/kyc.test.ts */
import {
  MAX_FILE_BYTES,
  periksaBerkasIdentitas,
  periksaIsiGambar,
  jenisGambarDariByte,
  validateKycInput,
} from "./kyc";

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

function cocok(teks: string | null, pola: RegExp, label: string) {
  if (teks !== null && pola.test(teks)) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}: "${teks}" tidak cocok ${pola}`);
  }
}

/** Magic bytes beberapa format, dipakai apa adanya sebagai "berkas" uji. */
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const GIF = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x00, 0x00]);
const WEBP = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);
/** HEIC: kotak `ftyp` di offset 4 dengan brand "heic". */
const HEIC = Uint8Array.from([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0x00, 0x00, 0x00, 0x00,
]);
/** MP4 memakai kotak `ftyp` juga, tetapi brand-nya bukan brand foto. */
const MP4 = Uint8Array.from([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x00, 0x01,
]);
/** PDF: "%PDF-1.7". */
const PDF = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
/** Teks biasa (berkas yang mengaku gambar). */
const TEKS = Uint8Array.from([0x6b, 0x74, 0x70, 0x20, 0x70, 0x61, 0x6c, 0x73, 0x75]);

const gambar = (contentType: string) => ({ size: 1000, contentType });

// ===== 1. pengenalan format dari isi berkas =====
{
  eq(jenisGambarDariByte(PNG), "png", "PNG dikenali");
  eq(jenisGambarDariByte(JPEG), "jpeg", "JPEG dikenali");
  eq(jenisGambarDariByte(GIF), "gif", "GIF dikenali");
  eq(jenisGambarDariByte(WEBP), "webp", "WEBP dikenali");
  eq(jenisGambarDariByte(HEIC), "heic", "HEIC dikenali (foto kamera iPhone)");
  eq(jenisGambarDariByte(MP4), null, "MP4 TIDAK diterima walau sama-sama `ftyp`");
  eq(jenisGambarDariByte(PDF), null, "PDF tidak diterima");
  eq(jenisGambarDariByte(TEKS), null, "teks biasa tidak diterima");
  eq(jenisGambarDariByte(new Uint8Array(0)), null, "berkas kosong tidak diterima");
  eq(jenisGambarDariByte(Uint8Array.from([0x89, 0x50])), null, "berkas terpotong tidak diterima");
}

// ===== 2. berkas hilang / kosong / kebesaran =====
{
  cocok(
    periksaBerkasIdentitas("Foto KTP", null),
    /tidak ditemukan di penyimpanan/i,
    "berkas hilang ditolak dengan pesan unggah ulang",
  );
  cocok(
    periksaBerkasIdentitas("Selfie dengan KTP", { size: 0, contentType: "image/png" }),
    /kosong/i,
    "berkas 0 byte ditolak",
  );
  cocok(
    periksaBerkasIdentitas("Slip penghasilan", { size: MAX_FILE_BYTES + 1, contentType: "image/jpeg" }),
    /maksimal 5 MB/i,
    "berkas di atas 5 MB ditolak",
  );
  eq(
    periksaBerkasIdentitas("Foto KTP", { size: MAX_FILE_BYTES, contentType: "image/jpeg" }),
    null,
    "berkas tepat 5 MB masih diterima",
  );
}

// ===== 3. tipe MIME yang tidak menyatakan gambar =====
{
  cocok(
    periksaBerkasIdentitas("Foto KTP", gambar("application/pdf")),
    /harus berupa gambar/i,
    "content type PDF ditolak",
  );
  cocok(
    periksaBerkasIdentitas("Foto KTP", gambar("")),
    /harus berupa gambar/i,
    "content type kosong ditolak",
  );
  eq(periksaBerkasIdentitas("Foto KTP", gambar("image/png")), null, "PNG lolos");
  eq(periksaBerkasIdentitas("Selfie", gambar("image/heic")), null, "HEIC lolos");
}

// ===== 4. ISI berkas diperiksa dari magic bytes (action unggah) =====
{
  // Kasus paling penting: mengaku image/png, isinya bukan gambar. Metadata saja
  // tidak dapat menangkap ini — karena itu ada pemeriksaan isi.
  cocok(
    periksaIsiGambar("Foto KTP", TEKS),
    /tidak dikenali sebagai gambar/i,
    "berkas yang mengaku png tapi isinya teks ditolak",
  );
  cocok(periksaIsiGambar("Foto KTP", PDF), /tidak dikenali sebagai gambar/i, "isi PDF ditolak");
  cocok(
    periksaIsiGambar("Foto KTP", MP4),
    /tidak dikenali sebagai gambar/i,
    "isi video ditolak walau berkotak ftyp",
  );
  cocok(
    periksaIsiGambar("Foto KTP", null),
    /tidak dikenali sebagai gambar/i,
    "berkas yang isinya tidak terbaca ditolak",
  );
  eq(periksaIsiGambar("Foto KTP", PNG), null, "isi PNG asli lolos");
  eq(periksaIsiGambar("Selfie", JPEG), null, "isi JPEG asli lolos");
  eq(periksaIsiGambar("Selfie", HEIC), null, "isi HEIC asli lolos");
}

// ===== 5. aturan isian tetap seperti semula (tidak ada regresi) =====
{
  const dasar = {
    nik: "3271012345678901",
    nomorWhatsApp: "6281234567890",
    penghasilanBulanan: 4_000_000,
    sumberPenghasilan: "Usaha warung",
  };
  eq(validateKycInput(dasar), null, "isian lengkap lolos");
  cocok(validateKycInput({ ...dasar, nik: "123" }), /16 angka/, "NIK pendek ditolak");
  cocok(validateKycInput({ ...dasar, nomorWhatsApp: "+62812" }), /62/, "WA tanpa 62 ditolak");
  cocok(validateKycInput({ ...dasar, penghasilanBulanan: 0 }), /penghasilan/i, "penghasilan 0 ditolak");
}

console.log(`kyc.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
