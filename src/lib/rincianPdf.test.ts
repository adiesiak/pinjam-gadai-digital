/**
 * Uji dokumen PDF rincian pinjaman.
 * Run: bun src/lib/rincianPdf.test.ts
 *
 * Yang dijaga: berkas yang dilampirkan ke email dan WhatsApp benar-benar PDF
 * yang bisa dibuka, memuat nomor referensi dan nominal yang sama dengan dokumen
 * sumber, dan tidak menjadi kosong saat nama peminjam memuat karakter di luar
 * Latin-1 (font standar PDF tidak mengenal emoji).
 */
import { susunRincianPinjaman, type PinjamanUntukRincian } from "./rincianPinjaman";
import { buatPdfRincian } from "./rincianPdf";
import { teksPdf } from "./pdfSederhana";

let passed = 0;
let failed = 0;
function ok(syarat: boolean, label: string): void {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

const SEKARANG = Date.UTC(2026, 9, 19, 4, 0, 0);

const pinjaman: PinjamanUntukRincian = {
  nomorReferensi: "PNJ-2026-0042",
  namaLengkap: "Rani Peminjam",
  status: "didanai",
  pokokPinjaman: 1_000_000,
  tenorHari: 90,
  tenorBulan: 3,
  didanaiPada: SEKARANG - 5 * 86_400_000,
  diajukanPada: SEKARANG - 8 * 86_400_000,
  nomorRekening: "1234567890",
};

const dokumen = susunRincianPinjaman(pinjaman, { sekarang: SEKARANG, dendaPerHari: 2 });
const byte = buatPdfRincian(dokumen);
const teks = teksPdf(byte);

ok(teks.startsWith("%PDF-1.4"), "berkas dimulai dengan penanda PDF");
ok(teks.trimEnd().endsWith("%%EOF"), "berkas ditutup dengan penanda akhir");
ok(teks.includes("/Count 1") || /\/Count \d/.test(teks), "jumlah halaman tercatat di katalog");
ok(teks.includes("PNJ-2026-0042"), "nomor referensi ada di dokumen");
ok(teks.includes("Rani Peminjam"), "nama peminjam ada di dokumen");
ok(teks.includes("Rp 1.000.000"), "pokok pinjaman ada di dokumen");
ok(teks.includes("Jadwal cicilan"), "skema bulanan memuat jadwal cicilan");
ok(teks.includes("Bulan 1"), "baris cicilan pertama ada");
ok(teks.includes("bukan bukti pembayaran"), "catatan penutup ikut tercetak");
ok(teks.includes("RINCIAN PINJAMAN DIGITAL"), "banner dokumen tercetak");
ok(teks.includes("Rincian Dana Yang Diterima"), "bagian dana diterima ada");
ok(teks.includes("Rincian Kewajiban Pengembalian"), "bagian kewajiban ada");
ok(teks.includes("Himbauan Keamanan Transaksi"), "peringatan keamanan ada");
ok(
  teks.includes("PINDAI tidak pernah meminta kode OTP, PIN, atau kata sandi"),
  "pesan keamanan memakai kalimat lengkap",
);
ok(teks.includes("Dana bersih ke rekening"), "baris dana bersih ada");
ok(teks.includes("-Rp "), "potongan biaya diberi tanda minus");
ok(teks.includes("Halaman 1 dari"), "kaki halaman menyebut nomor halaman");
ok(teks.includes("**** 7890"), "rekening tujuan tampil dalam bentuk tersamarkan");

// Nama warisan bisa memuat emoji atau tanda kutip miring. Font standar PDF
// memakai Latin-1, jadi karakter di luarnya harus dinormalkan, bukan
// menggagalkan seluruh berkas.
const aneh = teksPdf(
  buatPdfRincian({ ...dokumen, namaPeminjam: "Rani “Emoji” 😀 <Test>" }),
);
ok(aneh.startsWith("%PDF-1.4"), "nama dengan karakter asing tetap menghasilkan PDF");
ok(aneh.includes('Rani "Emoji" ? <Test>'), "karakter asing dinormalkan ke Latin-1");

// Skema harian tanpa tabel cicilan tetap menghasilkan dokumen satu halaman.
const harian = teksPdf(
  buatPdfRincian(
    susunRincianPinjaman(
      { ...pinjaman, tenorBulan: null, tenorHari: 30, pokokPinjaman: 500_000 },
      { sekarang: SEKARANG, dendaPerHari: 2 },
    ),
  ),
);
ok(harian.startsWith("%PDF-1.4"), "skema harian menghasilkan PDF");
ok(harian.includes("Rp 650.000"), "total kewajiban harian tercetak");
ok(!harian.includes("Jadwal cicilan"), "skema harian tanpa tabel cicilan");

console.log(`rincianPdf: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
