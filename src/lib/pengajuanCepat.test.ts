/**
 * Uji aturan pengajuan cepat pasca-KYC (`src/lib/pengajuanCepat.ts`).
 * Run: bun src/lib/pengajuanCepat.test.ts
 *
 * Yang dijaga: setelah identitas TERVERIFIKASI, satu halaman pengajuan hanya
 * boleh menawarkan angka yang memang diterima server (batas produk ∧ SISA batas
 * pinjaman nasabah), dan data identitas yang sudah tersimpan tidak boleh diminta ulang —
 * tetapi juga tidak boleh diam-diam dianggap lengkap bila ada bagian yang kosong.
 */
import {
  batasNominalCepat,
  kekuranganKtpTerverifikasi,
  ktpTerverifikasiLengkap,
  nominalAwalCepat,
  rekeningTersimpanSiap,
  TENOR_CEPAT,
  validasiPengajuanCepat,
  type IsianPengajuanCepat,
  type KtpTerverifikasi,
} from "@/lib/pengajuanCepat";
import {
  LOAN_LIMITS,
  persenBungaHarian,
  TENOR_OPTIONS,
  tenorHarianDefault,
} from "@/lib/loan";

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
function ada(teks: string, cari: string, label: string) {
  ok(teks.includes(cari), `${label} (memuat "${cari}")`);
}

/** Data KYC terverifikasi yang lengkap — dasar setiap kasus di bawah. */
const KTP: KtpTerverifikasi = {
  namaLengkap: "Rani Puspita",
  nik: "3201234567890001",
  nomorWhatsApp: "6281234567890",
  penghasilanBulanan: 5_000_000,
  sumberPenghasilan: "gaji bulanan",
  namaBank: "BCA",
  nomorRekening: "1234567890",
  dokKtpId: "storage_ktp",
  dokSelfieKtpId: "storage_selfie",
  dokSlipGajiId: "storage_slip",
};

/** Isian pengajuan cepat yang siap kirim. */
const SIAP: IsianPengajuanCepat = {
  pokokPinjaman: 500_000,
  tenorHari: 28,
  tujuan: "modal_usaha",
  rekeningBenar: true,
  persetujuanSyarat: true,
  lokasiTercatat: true,
  ttdTersedia: true,
};

// ===== 1. Batas nominal =====
// Batas atas selalu = SISA batas nasabah, dipotong batas produk.
eq(batasNominalCepat(null).min, LOAN_LIMITS.minPokok, "batas bawah = batas produk");
eq(batasNominalCepat(null).maks, 500_000, "sisa belum termuat memakai plafon nasabah baru");
eq(batasNominalCepat(3_000_000).maks, 3_000_000, "plafon khusus menaikkan batas nominal");
eq(
  batasNominalCepat(20_000_000).maks,
  LOAN_LIMITS.maxPokokPlafon,
  "sisa besar tetap dipotong langit-langit plafon",
);
eq(batasNominalCepat(600_000).maks, 600_000, "sisa kecil menjadi batas atas");
eq(batasNominalCepat(Number.NaN).maks, 500_000, "sisa tidak wajar memakai plafon nasabah baru");

// Sisa habis BUKAN rentang palsu: ditandai supaya layar menampilkan alasannya.
eq(batasNominalCepat(0).maks, 0, "sisa nol tidak menawarkan nominal");
ok(!batasNominalCepat(0).adaSisa, "sisa nol ditandai habis");
ok(!batasNominalCepat(50_000).adaSisa, "sisa di bawah minimum produk ditandai habis");
ok(!batasNominalCepat(-500_000).adaSisa, "sisa negatif ditandai habis");
ok(batasNominalCepat(null).adaSisa, "sisa belum termuat tetap boleh diisi (batas awal)");

// Nominal awal selalu di dalam rentang dan berkelipatan 50 ribu.
for (const sisa of [null, 100_000, 400_000, 1_000_000, 5_000_000]) {
  const { min, maks } = batasNominalCepat(sisa);
  const awal = nominalAwalCepat(sisa);
  ok(awal >= min && awal <= maks, `nominal awal ${awal} berada di rentang sisa ${String(sisa)}`);
  eq(awal % 50_000, 0, `nominal awal kelipatan 50 ribu (sisa ${String(sisa)})`);
}
eq(nominalAwalCepat(1_000_000), 500_000, "sisa 1 juta menawarkan 500 ribu");
eq(nominalAwalCepat(0), 0, "sisa habis tidak menawarkan nominal awal");

// Tenor pada pengajuan cepat = tenor produk; pilihan yang sah menyempit
// mengikuti nominal (lihat pemeriksaan matriks di bawah).
eq(TENOR_CEPAT, TENOR_OPTIONS, "pilihan tenor memakai daftar tenor produk");

// ===== 2. Rekening tersimpan =====
ok(rekeningTersimpanSiap("BCA", "1234567890"), "rekening lengkap dianggap siap");
ok(!rekeningTersimpanSiap("", "1234567890"), "nama bank kosong belum siap");
ok(!rekeningTersimpanSiap("B", "1234567890"), "nama bank terlalu pendek belum siap");
ok(!rekeningTersimpanSiap("BCA", "123"), "rekening terlalu pendek belum siap");
ok(!rekeningTersimpanSiap("BCA", "1234 5678 9012 3456 7890 1"), "rekening terlalu panjang belum siap");
ok(!rekeningTersimpanSiap(null, null), "rekening kosong belum siap");

// ===== 3. Kelengkapan data KYC terverifikasi =====
ok(ktpTerverifikasiLengkap(KTP), "data KYC lengkap dikenali");
ok(kekuranganKtpTerverifikasi(KTP).length === 0, "tidak ada kekurangan pada data lengkap");
for (const [nama, ubah] of [
  ["nama lengkap", { namaLengkap: "  " }],
  ["foto KTP", { dokKtpId: null }],
  ["selfie", { dokSelfieKtpId: null }],
  ["bukti penghasilan", { dokSlipGajiId: null }],
  ["rekening", { nomorRekening: "" }],
] as const) {
  const kurang = kekuranganKtpTerverifikasi({ ...KTP, ...ubah });
  ok(kurang.length === 1, `tanpa ${nama}, tepat satu kekurangan dilaporkan`);
}
ok(
  kekuranganKtpTerverifikasi({ ...KTP, dokKtpId: null, dokSlipGajiId: null }).length === 2,
  "dua dokumen hilang dilaporkan dua",
);

// ===== 4. Validasi pengajuan siap kirim =====
eq(validasiPengajuanCepat(SIAP, KTP, 1_000_000), null, "isian lengkap lolos tanpa galat");

const tolak = (ubah: Partial<IsianPengajuanCepat>, ktp: KtpTerverifikasi = KTP, plafon: number | null = 1_000_000) =>
  validasiPengajuanCepat({ ...SIAP, ...ubah }, ktp, plafon) ?? "";

ada(tolak({ pokokPinjaman: 50_000 }), "minimal", "nominal di bawah minimum ditolak");
ada(tolak({ pokokPinjaman: 2_000_000 }), "maksimal", "nominal di atas batas ditolak");
ada(tolak({ pokokPinjaman: 700_000 }, KTP, 600_000), "Sisa batas pinjaman Anda", "sisa batas nasabah disebut saat jadi batas");
ada(tolak({ pokokPinjaman: 700_000 }, KTP, 600_000), "600.000", "angka sisa batas yang sama ikut disebut");
ada(
  tolak({ pokokPinjaman: 2_000_000 }, KTP, 1_500_000),
  "Sisa batas pinjaman Anda",
  "plafon khusus di atas Rp1 juta tetap disebut sebagai batas nasabah",
);
eq(
  validasiPengajuanCepat({ ...SIAP, pokokPinjaman: 2_000_000, tenorHari: 28 }, KTP, 2_000_000),
  null,
  "plafon khusus Rp2 juta membuka pengajuan harian Rp2 juta",
);
// Sisa habis: disarankan melunasi, bukan disuruh mengurangi nominal.
ada(tolak({ pokokPinjaman: 500_000 }, KTP, 0), "Sisa batas pinjaman Anda belum cukup", "sisa habis dijelaskan alasannya");
ada(tolak({ pokokPinjaman: 500_000 }, KTP, 0), "Lunasi pinjaman berjalan", "sisa habis menunjuk jalan keluarnya");
ok(
  !tolak({ pokokPinjaman: 500_000 }, KTP, 0).includes("maksimal"),
  "sisa habis tidak menawarkan nominal maksimal palsu",
);
ada(tolak({ pokokPinjaman: 500_000.5 }), "minimal", "nominal pecahan ditolak");
ada(tolak({ tenorHari: 51 }), "7–50", "tenor di atas H+50 ditolak");
ada(tolak({ tenorHari: 6 }), "7–50", "tenor di bawah 7 hari ditolak");
ok(
  !tolak({ tenorHari: 20 }).includes("tenor yang tersedia"),
  "tanggal bebas 20 hari diterima",
);
ok(
  !tolak({ pokokPinjaman: 500_000, tenorHari: 30 }).includes("tenor yang tersedia"),
  "Rp500.000 menerima tenor 30 hari sebagai perpanjangan",
);
ok(
  !tolak({ pokokPinjaman: 1_000_000, tenorHari: 30 }).includes("tenor yang tersedia"),
  "Rp1 juta menerima tenor 30 hari sebagai perpanjangan",
);
ada(tolak({ tujuan: "" }), "keperluan", "keperluan kosong ditolak");
ada(tolak({ rekeningBenar: false }), "rekening bank", "konfirmasi rekening wajib");
ada(tolak({ lokasiTercatat: false }), "Lokasi", "lokasi wajib");
ada(tolak({ ttdTersedia: false }), "Tanda tangan wajib", "tanda tangan wajib");
ada(tolak({ persetujuanSyarat: false }), "Syarat & Ketentuan", "persetujuan S&K wajib");

// Data KYC yang tidak lengkap ditolak lebih dulu, dengan menyebut apa yang kurang
// — bukan diteruskan ke server lalu gagal di sana.
const kurangKtp = tolak({}, { ...KTP, dokKtpId: null });
ada(kurangKtp, "Data KYC terverifikasi belum lengkap", "data KYC kurang ditolak sebelum dikirim");
ada(kurangKtp, "Foto KTP", "bagian yang kurang disebut namanya");

// Aturan identitas memakai sumber yang sama dengan formulir panjang & server.
ada(
  tolak({}, { ...KTP, nik: "123" }),
  "Nomor KTP harus terdiri dari 16 angka",
  "NIK salah memakai pesan aturan bersama",
);
ada(
  tolak({}, { ...KTP, nomorWhatsApp: "0812345678" }),
  "diawali 62",
  "nomor WhatsApp 08xx yang belum ternormalisasi ditolak",
);
ada(
  tolak({}, { ...KTP, sumberPenghasilan: "" }),
  "KYC terverifikasi belum lengkap",
  "sumber penghasilan kosong dianggap data KYC kurang",
);

// Kombinasi nominal–tenor mengikuti matriks, bukan semua tenor bebas.
eq(tenorHarianDefault(250_000), 7, "di bawah Rp500.000: tenor bawaan 7 hari");
eq(tenorHarianDefault(500_000), 14, "Rp500.000: tenor bawaan 14 hari");
eq(tenorHarianDefault(1_000_000), 28, "Rp1 juta: tenor bawaan 28 hari");
eq(persenBungaHarian(250_000, 7), 30, "Rp250.000/7 hari: bunga 30%");
eq(persenBungaHarian(250_000, 14), 35, "Rp250.000/14 hari: bunga naik ke 35%");
eq(persenBungaHarian(250_000, 28), 40, "Rp250.000/28 hari: bunga naik ke 40%");
eq(persenBungaHarian(500_000, 7), 28, "Rp500.000/7 hari: bunga 28%");
eq(persenBungaHarian(500_000, 14), 32, "Rp500.000/14 hari: bunga 32%");
eq(persenBungaHarian(500_000, 28), 35, "Rp500.000/28 hari: bunga 35%");
eq(persenBungaHarian(1_000_000, 7), 26, "Rp1 juta/7 hari: bunga 26%");
eq(persenBungaHarian(1_000_000, 14), 28, "Rp1 juta/14 hari: bunga 28%");
eq(persenBungaHarian(1_000_000, 28), 30, "Rp1 juta/28 hari: bunga 30%");
for (const [pokok, tenor] of [
  [250_000, 7],
  [250_000, 14],
  [250_000, 28],
  [500_000, 7],
  [500_000, 14],
  [500_000, 28],
  [1_000_000, 7],
  [1_000_000, 14],
  [1_000_000, 28],
  [2_000_000, 7],
  [2_000_000, 14],
  [2_000_000, 28],
] as const) {
  eq(
    validasiPengajuanCepat(
      { ...SIAP, pokokPinjaman: pokok, tenorHari: tenor },
      KTP,
      Math.max(1_000_000, pokok),
    ),
    null,
    `kombinasi ${pokok}/${tenor} hari diterima`,
  );
}
// Seluruh rentang nominal yang sah diterima.
for (const pokok of [100_000, 250_000, 500_000, 1_000_000]) {
  eq(validasiPengajuanCepat({ ...SIAP, pokokPinjaman: pokok }, KTP, 1_000_000), null, `nominal ${pokok} diterima`);
}

console.log(`pengajuanCepat.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
