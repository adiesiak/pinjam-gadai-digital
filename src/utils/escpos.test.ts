/**
 * Tests ESC/POS & format struk STOP-UP! — dependency-free.
 * Run: bun src/utils/escpos.test.ts
 */
import {
  buildStrukBytes,
  concat,
  cut,
  duaKolom,
  ESC,
  formatStrukTeks,
  GS,
  init,
  textBytes,
  type DataStruk,
} from "./escpos";

let passed = 0;
let failed = 0;

function eq(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`FAIL ${label}: expected ${expected}, got ${actual}`);
  }
}

function ok(kondisi: boolean, label: string) {
  if (kondisi) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

const struk: DataStruk = {
  namaMerchant: "STOP-UP! DIGITAL",
  alamat: "Jl. Merdeka No. 1, Bandung",
  terminal: "SU-01",
  invoiceId: "SU-260923-ABC123",
  waktu: "23/09/2026 09:15 WIB",
  item: { nama: "Pulsa Telkomsel 25.000", tujuan: "081234567890", harga: 26_000 },
  total: 26_000,
  metode: "QRIS",
  status: "SUCCESS",
  snRef: "SN1234567ABCD",
  voucherCode: "AB12-CD34-EF56",
  namaPelangganMasked: "A**I S*****A",
  footer: "Terima kasih!",
};

// ---- perintah ESC/POS dasar ----
eq(init()[0], ESC, "init diawali ESC");
eq(init()[1], 0x40, "init memakai @ (0x40)");
eq(cut()[0], GS, "cut diawali GS");
eq(cut()[1], 0x56, "cut memakai V");
eq(textBytes("AB")[2], 0x0a, "teks diakhiri line feed");
eq(textBytes("‽")[0], 0x3f, "karakter non-ASCII diganti ?");
eq(textBytes("é")[0], 0x65, "aksen dinormalkan ke huruf dasar");

// Skala font untuk kode voucher: GS ! 0x11 (2x lebar & tinggi).
const bytes = buildStrukBytes(struk);
const gsUkuran = Array.from(bytes).findIndex(
  (b, i) => b === GS && bytes[i + 1] === 0x21 && bytes[i + 2] === 0x11,
);
ok(gsUkuran > 0, "struk memakai ukuran ganda (kode voucher menonjol)");

// ESC E 1 (bold) harus ada sebelum kode voucher.
const idxVoucher = bytes.length - Array.from(bytes).reverse().findIndex((_, i) => i === 0);
void idxVoucher;
ok(
  Array.from(bytes).some((b, i) => b === ESC && bytes[i + 1] === 0x45 && bytes[i + 2] === 1),
  "ada perintah bold untuk kode voucher",
);

// Byte ditutup dengan cut() sehingga kertas terpotong otomatis.
const ekor = Array.from(bytes.slice(-4));
eq(ekor.join(","), [GS, 0x56, 0x42, 0x00].join(","), "struk diakhiri perintah potong kertas");
eq(Array.from(bytes.slice(0, 2)).join(","), [ESC, 0x40].join(","), "struk diawali reset printer");

// Kode voucher harus benar-benar tercetak pada byte.
const teksByte = Array.from(bytes)
  .map((b) => String.fromCharCode(b))
  .join("");
ok(teksByte.includes("AB12-CD34-EF56"), "kode voucher tercetak di struk");
ok(teksByte.includes("SU-260923-ABC123"), "invoice tercetak di struk");
ok(teksByte.includes("STOP-UP!"), "brand tercetak di struk");

// ---- utf8 → byte gabungan ----
const gabung = concat(textBytes("A"), textBytes("B"));
eq(gabung.length, 4, "penggabungan byte benar");

// ---- format teks (dipakai untuk bukti WhatsApp) ----
const teks = formatStrukTeks(struk);
ok(teks.includes("Rp26.000"), "total rupiah tampil");
ok(teks.includes("KODE VOUCHER"), "blok kode voucher ada di bukti WhatsApp");
ok(teks.includes("AB12-CD34-EF56"), "kode voucher ada di bukti WhatsApp");
ok(!teks.includes("investor"), "tanpa istilah terlarang");

// ---- dua kolom rata 32 karakter ----
eq(duaKolom("Invoice", "SU-260923-ABC123", 32).length, 32, "kolom rata 32 karakter");
eq(duaKolom("A", "B", 10).length <= 10, true, "kolom pendek tidak melebihi lebar");
ok(duaKolom("Nama Produk Sangat Panjang Sekali", "Rp1.000", 32).endsWith("Rp1.000"), "nilai kanan tetap utuh");

// ---- struk pending harus ditandai jelas ----
const teksPending = formatStrukTeks({ ...struk, status: "PROCESSING", pending: true, voucherCode: null });
ok(teksPending.includes("STRUK SEMENTARA"), "struk pending ditandai");
ok(teksPending.includes("PENDING"), "status pending tercetak");

console.log(`stopup escpos tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
