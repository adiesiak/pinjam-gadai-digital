/** Uji draf pesan WhatsApp pembayaran manual — tanpa server, tanpa DOM. */
import { pesanPembayaranManual, ringkasRekening } from "./waPembayaranManual";

let passed = 0;
let failed = 0;

function eq(label: string, actual: unknown, expected: unknown): void {
  if (actual === expected) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`✗ ${label}: diharapkan ${String(expected)}, dapat ${String(actual)}`);
  }
}

function ok(label: string, kondisi: boolean): void {
  eq(label, kondisi, true);
}

const REKENING = {
  namaBank: "BNI",
  nomorRekening: "1324167013",
  namaRekening: "Chatur Surya Carel Ramadhan",
};

// ===== Isi wajib =====
const dasar = pesanPembayaranManual(REKENING);
ok("menyebut bank dan nomor", dasar.includes("BNI 1324167013"));
ok("menyebut atas nama", dasar.includes("Atas nama: Chatur Surya Carel Ramadhan"));
ok("meminta bukti transfer", dasar.includes("bukti transfer"));
ok("tanpa nominal tidak menulis baris nominal", !dasar.includes("Nominal:"));
ok("tanpa catatan tidak menyisakan baris kosong ganda", !dasar.includes("\n\n\n"));
ok("tidak menyisakan placeholder", !/\[[^\]]+\]/.test(dasar));

// ===== Nominal =====
const berNominal = pesanPembayaranManual({ ...REKENING, nominal: 1_500_000 });
ok("nominal diformat rupiah", berNominal.includes("Nominal: Rp 1.500.000"));
eq(
  "nominal nol diabaikan",
  pesanPembayaranManual({ ...REKENING, nominal: 0 }).includes("Nominal:"),
  false,
);
eq(
  "nominal pecahan diabaikan",
  pesanPembayaranManual({ ...REKENING, nominal: 1_500_000.5 }).includes("Nominal:"),
  false,
);
eq(
  "nominal negatif diabaikan",
  pesanPembayaranManual({ ...REKENING, nominal: -5_000 }).includes("Nominal:"),
  false,
);
eq(
  "nominal null diabaikan",
  pesanPembayaranManual({ ...REKENING, nominal: null }).includes("Nominal:"),
  false,
);

// ===== Catatan =====
const berCatatan = pesanPembayaranManual({
  ...REKENING,
  catatan: "  Mohon transfer sebelum pukul 15.00 WIB.  ",
});
ok("catatan ditulis tanpa spasi tepi", berCatatan.includes("\n\nMohon transfer sebelum pukul 15.00 WIB."));
eq(
  "catatan spasi saja diabaikan",
  pesanPembayaranManual({ ...REKENING, catatan: "   " }),
  dasar,
);

// ===== Urutan & ringkasan =====
ok("rekening muncul sebelum permintaan bukti", dasar.indexOf("BNI") < dasar.indexOf("bukti transfer"));
eq(
  "ringkasan rekening satu baris",
  ringkasRekening(REKENING),
  "BNI 1324167013 · Chatur Surya Carel Ramadhan",
);

console.log(`waPembayaranManual tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
