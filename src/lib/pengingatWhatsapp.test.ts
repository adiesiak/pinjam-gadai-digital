/** Run: bun src/lib/pengingatWhatsapp.test.ts */
import { CS_WHATSAPP, urlChatCs } from "./kontak";
import {
  normalkanNomorWa,
  pesanInfoTagihan,
  pesanPengingatH1,
  pesanPengingatH3,
  sapaan,
  templateSesuaiSisaHari,
  teksRupiah,
  urlCekStatus,
  urlWhatsapp,
} from "./pengingatWhatsapp";

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
  eq(syarat, true, label);
}

const TOKEN = "0123456789abcdef0123456789abcdef";
const TAUTAN = urlCekStatus("https://pindai.example.com", TOKEN) ?? "";

const DATA = {
  namaPeminjam: "Asep Firman Hanafi",
  nomorReferensi: "PNJ-2026-0012",
  tanggalTeks: "12 Sep 2026",
  totalKewajiban: 1_250_000,
  tautan: TAUTAN,
};

// ===== Template info tagihan (pesan tombol admin) =====
const INFO = pesanInfoTagihan(DATA);
ok(INFO.startsWith("Halo Asep,"), "info tagihan menyapa nama panggilan");
ok(INFO.includes("ringkasan status pinjaman aktif Anda di PINDAI PNJ-2026-0012"), "info tagihan memuat referensi");
ok(INFO.includes(TAUTAN), "info tagihan memuat tautan cek status");
ok(INFO.includes("kwitansi digital"), "info tagihan menyebut kwitansi digital");
ok(!INFO.includes("["), "tidak ada placeholder tersisa di info tagihan");
ok(!INFO.includes("undefined") && !INFO.includes("NaN"), "info tagihan bersih dari nilai rusak");

// ===== Template H-3 & H-1 =====
const H3 = pesanPengingatH3(DATA);
ok(H3.includes("jatuh tempo dalam 3 hari"), "H-3 menyebut hitungan 3 hari");
ok(H3.includes("(tanggal 12 Sep 2026)"), "H-3 memuat tanggal jatuh tempo");
ok(H3.includes("Total kewajiban sebesar Rp 1.250.000"), "H-3 memuat total kewajiban terformat");
ok(H3.includes("Mohon lakukan pembayaran tepat waktu"), "H-3 menutup dengan ajakan membayar");
ok(!H3.includes("["), "tidak ada placeholder tersisa di H-3");

const H1 = pesanPengingatH1(DATA);
ok(H1.startsWith("PERHATIAN:"), "H-1 dibuka dengan penanda perhatian");
ok(H1.includes("jatuh tempo BESOK (12 Sep 2026)"), "H-1 menyebut jatuh tempo besok");
ok(H1.includes("Hindari denda keterlambatan harian"), "H-1 menyebut denda harian");
ok(!H1.includes("["), "tidak ada placeholder tersisa di H-1");

// Nilai yang tidak diketahui tidak boleh jadi lubang di pesan.
const KOSONG = pesanPengingatH3({ ...DATA, tanggalTeks: null, totalKewajiban: null });
ok(KOSONG.includes("belum tercatat"), "tanggal kosong ditulis apa adanya");
ok(!KOSONG.includes("null") && !KOSONG.includes("NaN"), "nilai kosong tidak bocor sebagai null/NaN");

// ===== Pemilih template =====
eq(templateSesuaiSisaHari(3, DATA).jenis, "h3", "sisa 3 hari memakai template H-3");
eq(templateSesuaiSisaHari(1, DATA).jenis, "h1", "sisa 1 hari memakai template H-1");
eq(templateSesuaiSisaHari(9, DATA).jenis, "info", "sisa jauh memakai info tagihan");
eq(templateSesuaiSisaHari(0, DATA).jenis, "info", "jatuh tempo hari ini memakai info tagihan");
eq(templateSesuaiSisaHari(-4, DATA).jenis, "info", "keterlambatan tidak memakai template H-3/H-1");
eq(templateSesuaiSisaHari(1, DATA).pesan, pesanPengingatH1(DATA), "pemilih mengembalikan pesan yang sama");

// ===== Pembantu teks =====
eq(teksRupiah(1_250_000), "Rp 1.250.000", "rupiah diformat gaya Indonesia");
eq(teksRupiah(null), "belum tercatat", "rupiah kosong jadi teks jujur");
eq(teksRupiah(Number.NaN), "belum tercatat", "rupiah rusak jadi teks jujur");
eq(sapaan("Siti Aminah"), "Siti", "sapaan memakai nama pertama");

// ===== URL cek status =====
eq(urlCekStatus("https://pindai.example.com/", TOKEN), `https://pindai.example.com/cek-status/${TOKEN}`, "garis miring tepi dibersihkan");
eq(urlCekStatus("http://localhost:5173", TOKEN), `http://localhost:5173/cek-status/${TOKEN}`, "asal http lokal diterima");
eq(urlCekStatus("https://pindai.example.com", TOKEN.toUpperCase()), `https://pindai.example.com/cek-status/${TOKEN}`, "token dinormalkan");
eq(urlCekStatus("", TOKEN), null, "asal kosong ditolak");
eq(urlCekStatus("pindai.example.com", TOKEN), null, "asal tanpa skema ditolak");
eq(urlCekStatus("javascript:alert(1)", TOKEN), null, "skema asing ditolak");
eq(urlCekStatus("https://pindai.example.com", "   "), null, "token kosong ditolak");

// ===== Nomor WhatsApp =====
eq(normalkanNomorWa("081234567890"), "6281234567890", "awalan 0 dinormalkan ke 62");
eq(normalkanNomorWa("+62 812-3456-7890"), "6281234567890", "tanda + dan pemisah dibersihkan");
eq(normalkanNomorWa("6281234567890"), "6281234567890", "nomor 62 dibiarkan");
eq(normalkanNomorWa("8123456789"), "628123456789", "nomor tanpa awalan ditambah 62");
eq(normalkanNomorWa(""), null, "nomor kosong ditolak");
eq(normalkanNomorWa(null), null, "nomor null ditolak");
eq(normalkanNomorWa("12345"), null, "nomor terlalu pendek ditolak");

const WA = urlWhatsapp("081234567890", INFO);
ok((WA ?? "").startsWith("https://wa.me/6281234567890?text="), "tautan WA memakai nomor ternormalkan");
ok((WA ?? "").includes(encodeURIComponent(TAUTAN)), "pesan WA di-encode dan memuat tautan");
eq(urlWhatsapp("", INFO), null, "nomor tidak sah tidak menghasilkan tautan WA");

// ===== Kontak CS =====
const CS = urlChatCs("Halo CS PINDAI, saya ingin bertanya.");
ok(CS.startsWith(`https://wa.me/${CS_WHATSAPP}?text=`), "tautan CS memakai nomor resmi");
ok(
  CS.includes(encodeURIComponent("Halo CS PINDAI, saya ingin bertanya.")),
  "pesan CS di-encode utuh",
);
eq(normalkanNomorWa(CS_WHATSAPP), CS_WHATSAPP, "nomor CS sudah format internasional");

if (failed > 0) {
  console.error(`\n${failed} gagal, ${passed} lulus`);
  throw new Error(`${failed} tes pengingat WhatsApp gagal`);
}
console.log(`pengingatWhatsapp: ${passed} lulus`);
