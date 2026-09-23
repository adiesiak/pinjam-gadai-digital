/**
 * Tests QRIS (EMVCo) & pembangkit kode STOP-UP! — dependency-free.
 * Run: bun src/lib/stopup/qris.test.ts
 */
import { buildQrisPayload, crc16, tlv, validasiQrisPayload } from "./qris";
import {
  buatInvoiceId,
  buatKodeVoucher,
  buatRefId,
  buatSnSimulasi,
  namaSimulasi,
  tagihanSimulasi,
  tanggalWibKode,
} from "./kode";

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

// ---- CRC-16/CCITT-FALSE memiliki check value standar 0x29B1 ----
eq(crc16("123456789"), "29B1", "check value CRC-16/CCITT-FALSE");
eq(crc16(""), "FFFF", "CRC payload kosong = nilai init");
eq(crc16("A").length, 4, "CRC selalu 4 karakter hex");

// ---- TLV ----
eq(tlv("00", "01"), "000201", "TLV tag 00 panjang 02");
eq(tlv("59", "STOP-UP! DIGITAL"), "5916STOP-UP! DIGITAL", "TLV nama merchant");

// ---- payload QRIS dinamis ----
const qr = buildQrisPayload({
  merchantId: "936009990000000001",
  merchantName: "STOP-UP! DIGITAL",
  amount: 11_000,
  invoiceId: "SU-260923-ABC123",
  terminalLabel: "SU-01",
});

ok(qr.startsWith("000201"), "payload diawali 000201 (format EMVCo)");
ok(qr.includes("010212"), "method 12 = QR dinamis sekali pakai");
ok(qr.includes("5303360"), "mata uang 360 (IDR)");
ok(qr.includes("540511000"), "nominal tag 54 = 11000");
ok(qr.includes("5802ID"), "kode negara ID");
ok(qr.includes("SU-260923-ABC123"), "nomor invoice jadi bill number");
ok(validasiQrisPayload(qr), "CRC payload valid");
eq(qr.slice(-8, -4), "6304", "tag 63 ditulis sebelum CRC");

// Nominal berbeda → CRC berbeda (tidak ada tabrakan tagihan).
const qr2 = buildQrisPayload({
  merchantId: "936009990000000001",
  merchantName: "STOP-UP! DIGITAL",
  amount: 25_000,
  invoiceId: "SU-260923-ABC123",
});
ok(qr !== qr2, "nominal berbeda menghasilkan payload berbeda");

// Payload yang diubah setelah CRC dihitung harus ditolak.
ok(!validasiQrisPayload(`${qr.slice(0, -4)}0000`), "CRC rusak ditolak");

// Nominal harus rupiah bulat > 0.
let tolak = false;
try {
  buildQrisPayload({
    merchantId: "x",
    merchantName: "y",
    amount: 10_000.5,
    invoiceId: "I",
  });
} catch {
  tolak = true;
}
ok(tolak, "nominal desimal ditolak (tanpa floating-point)");

// ---- pembangkit kode ----
const invoice = buatInvoiceId(Date.UTC(2026, 8, 23, 4, 0, 0));
ok(/^SU-\d{6}-[A-Z0-9]{6}$/.test(invoice), `format invoice (${invoice})`);
ok(invoice.startsWith("SU-260923"), "invoice memakai tanggal WIB");
eq(tanggalWibKode(Date.UTC(2026, 8, 22, 20, 0, 0)), "260923", "22 Sep 20:00 UTC = 23 Sep WIB");

ok(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(buatKodeVoucher()), "format voucher XXXX-XXXX-XXXX");
ok(buatKodeVoucher() !== buatKodeVoucher(), "voucher selalu unik");
ok(buatRefId("SU-260923-ABC123").startsWith("SU-260923-ABC123-"), "refId berawalan invoice");
ok(buatSnSimulasi("SU-260923-ABC123").startsWith("SN"), "SN simulasi berawalan SN");

// ---- nama simulasi deterministik (inquiry ulang harus sama) ----
eq(namaSimulasi("PLN-14012345678"), namaSimulasi("PLN-14012345678"), "nama simulasi deterministik");
ok(namaSimulasi("PLN-14012345678") !== namaSimulasi("PLN-14012345679"), "seed berbeda → nama berbeda");
ok(namaSimulasi("X").split(" ").length === 2, "nama simulasi berpola dua kata");
ok(tagihanSimulasi("14012345678") >= 45_000, "tagihan simulasi minimal 45.000");
ok(Number.isInteger(tagihanSimulasi("14012345678")), "tagihan simulasi rupiah bulat");

console.log(`stopup qris tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
