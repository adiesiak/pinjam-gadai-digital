/** Run: bun src/lib/pencarianNasabah.test.ts */
import {
  bacaKueriNasabah,
  keNomorTersimpan,
  pesanHasilTerpotong,
  varianKueriAngka,
} from "./pencarianNasabah";

let passed = 0;
let failed = 0;
function eq(actual: unknown, expected: unknown, label: string): void {
  if (actual === expected) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ===== Kueri kosong =====
eq(bacaKueriNasabah("").jenis, "teks", "kueri kosong = teks");
eq(bacaKueriNasabah("   ").jenis, "teks", "spasi saja = teks");

// ===== NIK =====
eq(bacaKueriNasabah("3271012345678901").jenis, "nik", "16 digit = NIK");
eq(bacaKueriNasabah("3271012345678901").nilai, "3271012345678901", "NIK apa adanya");
eq(bacaKueriNasabah("3271 0123 4567 8901").jenis, "nik", "NIK berjarak = NIK");
eq(bacaKueriNasabah("3271 0123 4567 8901").nilai, "3271012345678901", "NIK dibersihkan dari spasi");
eq(bacaKueriNasabah("327101234567890").jenis, "teks", "15 digit bukan NIK dan bukan nomor ");

// ===== Nomor WhatsApp =====
eq(bacaKueriNasabah("081234567890").jenis, "whatsapp", "08… = WhatsApp");
eq(bacaKueriNasabah("081234567890").whatsapp, "6281234567890", "08… dinormalkan ke 62…");
eq(bacaKueriNasabah("+62 812-3456-7890").jenis, "whatsapp", "+62… = WhatsApp");
eq(bacaKueriNasabah("+62 812-3456-7890").whatsapp, "6281234567890", "+62… dinormalkan");
eq(bacaKueriNasabah("6281234567890").whatsapp, "6281234567890", "62… tetap");
eq(bacaKueriNasabah("81234567890").whatsapp, "6281234567890", "8… dinormalkan");
eq(bacaKueriNasabah("081234567890").angka, "081234567890", "angka mentah disimpan untuk nomor asing");

// ===== Kode peminjam =====
eq(
  bacaKueriNasabah("PMN-ABCDEF0123456789ABCD").jenis,
  "kodePeminjam",
  "kode PMN = kode peminjam",
);
eq(
  bacaKueriNasabah("pmn-abcdef0123456789abcd").nilai,
  "PMN-ABCDEF0123456789ABCD",
  "kode peminjam dihuruf-besarkan",
);
eq(bacaKueriNasabah("PMN-123").jenis, "teks", "kode cacat diperlakukan teks");

// ===== Email =====
eq(bacaKueriNasabah("sari@pindai.test").jenis, "email", "email dikenali");
eq(bacaKueriNasabah("Sari@Pindai.Test").emailKecil, "sari@pindai.test", "email versi huruf kecil");
eq(bacaKueriNasabah("sari@pindai.test").nilai, "sari@pindai.test", "email apa adanya");

// ===== Teks bebas =====
eq(bacaKueriNasabah("sari dewi").jenis, "teks", "nama = teks");
eq(bacaKueriNasabah("Sari").jenis, "teks", "sebagian nama = teks");
eq(bacaKueriNasabah("6591234567").jenis, "teks", "nomor negara lain = teks");
eq(bacaKueriNasabah("12345").jenis, "teks", "angka pendek = teks");

// ===== keNomorTersimpan =====
eq(keNomorTersimpan("021"), null, "nomor terlalu pendek ditolak");
eq(keNomorTersimpan("6591234567"), null, "kode negara lain tidak ditebak");
eq(keNomorTersimpan("0812 3456 7890"), "6281234567890", "spasi diabaikan");

// ===== Varian angka =====
eq(
  varianKueriAngka("081234").includes("6281234"),
  true,
  "awalan nol juga dicoba sebagai 62…",
);
eq(
  varianKueriAngka("628123456791").includes("08123456791"),
  true,
  "awalan 62 juga dicoba sebagai 0…",
);
eq(varianKueriAngka("sari").length, 1, "teks bukan angka tidak divariasikan");

// ===== Pesan panel =====
eq(
  pesanHasilTerpotong("teks").includes("NIK"),
  true,
  "pesan teks menyarankan identitas tepat",
);
eq(
  pesanHasilTerpotong("nik").includes("tidak ditemukan"),
  true,
  "pesan identitas tepat menyebut tidak ditemukan",
);
eq(
  pesanHasilTerpotong("teks") === pesanHasilTerpotong("email"),
  false,
  "pesan berbeda per jenis",
);

console.log(`${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
