/** Uji sidik jari dokumen kontrak. Run: bun src/lib/kontrakDigital.test.ts */
import { CONTRACT_TERMS_VERSION } from "./contract";
import {
  hashDokumen,
  kodeDariHash,
  payloadKontrakGadai,
  payloadKontrakPinjaman,
  urlVerifikasi,
  VERSI_DOKUMEN_DIGITAL,
} from "./kontrakDigital";
import { sha256Hex } from "./sha256";

let passed = 0;
let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}: expected ${expected}, got ${actual}`);
  }
}
function ok(nilai: boolean, label: string) {
  if (nilai) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

// Vektor uji resmi SHA-256.
eq(
  sha256Hex("abc"),
  "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  "sha256 abc",
);
eq(
  sha256Hex(""),
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "sha256 kosong",
);
eq(
  sha256Hex("a".repeat(1000)),
  "41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3",
  "sha256 1000 huruf a",
);

const pinjaman = {
  nomorReferensi: "PJ-001",
  namaLengkap: "siti peminjam",
  nik: "3201010101010001",
  pokokPinjaman: 1_000_000,
  tenorHari: 30,
  tenorBulan: null,
  persenBunga: 30,
  tandaTanganPada: 1_760_000_000_000,
};

const payload = payloadKontrakPinjaman(pinjaman);
ok(payload.startsWith(`PINDAI-KONTRAK|${VERSI_DOKUMEN_DIGITAL}|${CONTRACT_TERMS_VERSION}|pinjaman|`), "awalan payload");
ok(payload.includes("|SITI PEMINJAM|"), "nama dinormalkan huruf besar");
ok(!payload.includes("siti peminjam"), "nama asli tidak muncul ganda");
eq(hashDokumen(payload).length, 64, "panjang hash");

// Perubahan sekecil apa pun harus mengubah hash.
const ubahPokok = hashDokumen(payloadKontrakPinjaman({ ...pinjaman, pokokPinjaman: 1_000_001 }));
ok(ubahPokok !== hashDokumen(payload), "pokok berubah → hash berubah");
const ubahWaktu = hashDokumen(
  payloadKontrakPinjaman({ ...pinjaman, tandaTanganPada: pinjaman.tandaTanganPada + 1 }),
);
ok(ubahWaktu !== hashDokumen(payload), "waktu berubah → hash berubah");
const ubahNama = hashDokumen(
  payloadKontrakPinjaman({ ...pinjaman, namaLengkap: "SITI LAIN" }),
);
ok(ubahNama !== hashDokumen(payload), "nama berubah → hash berubah");

// Urutan field stabil: pemanggilan berulang menghasilkan hash yang sama.
eq(hashDokumen(payloadKontrakPinjaman(pinjaman)), hashDokumen(payload), "deterministik");

const gadai = {
  nomorReferensi: "GD-001",
  namaLengkap: "budi",
  nilaiTaksiran: 5_000_000,
  hargaPasar: 7_000_000,
  pokokGadai: 3_500_000,
  persenSewaModal: 8,
  tandaTanganPada: 1_760_000_000_000,
};
const payloadGadai = payloadKontrakGadai(gadai);
ok(payloadGadai.includes("|gadai|GD-001|BUDI|"), "payload gadai");
ok(hashDokumen(payloadGadai) !== hashDokumen(payload), "hash gadai berbeda dari pinjaman");

eq(kodeDariHash("abcdef0123456789"), "ABCDEF0123", "kode dari hash");
eq(
  urlVerifikasi("ABCDEF0123"),
  "https://pindai.biz.id/verifikasi-kontrak/ABCDEF0123",
  "url bawaan",
);
eq(
  urlVerifikasi("ABCDEF0123", "https://contoh.test/"),
  "https://contoh.test/verifikasi-kontrak/ABCDEF0123",
  "url dengan asal kustom",
);

console.log(`kontrakDigital: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
