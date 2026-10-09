/** Run: bun src/lib/duplikatNasabah.test.ts */
import {
  kelompokkanKembar,
  pilihUtama,
  type BarisKembar,
} from "./duplikatNasabah";

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

function baris(
  userId: string,
  nama: string,
  nik: string | null,
  nomorWhatsApp: string | null,
  jumlahBerkas = 0,
  dibuatAdmin = false,
): BarisKembar {
  return { userId, nama, nik, nomorWhatsApp, jumlahBerkas, dibuatAdmin };
}

// ===== Tanpa kembar =====
eq(kelompokkanKembar([]).length, 0, "daftar kosong → tanpa kelompok");
eq(
  kelompokkanKembar([
    baris("u1", "ANI", "1111111111111111", "628111111111"),
    baris("u2", "BUDI", "2222222222222222", "628222222222"),
  ]).length,
  0,
  "identitas berbeda → tanpa kelompok",
);

// Dua nasabah tanpa identitas BUKAN kembar.
eq(
  kelompokkanKembar([
    baris("u1", "ANI", null, null),
    baris("u2", "BUDI", "", ""),
  ]).length,
  0,
  "identitas kosong tidak mencocokkan",
);

// ===== Kembar karena NIK =====
const kenik = kelompokkanKembar([
  baris("u1", "ALFIAN", "3174010101900001", "628111111111", 3),
  baris("u2", "ALIFAN", "3174010101900001", "628999999999", 1, true),
  baris("u3", "ORANG LAIN", "3174010101909999", "628333333333"),
]);
eq(kenik.length, 1, "NIK sama → satu kelompok");
eq(kenik[0].baris.length, 2, "kelompok berisi dua akun");
eq(kenik[0].sebab.join(","), "nik", "sebab hanya nik");
eq(kenik[0].baris[0].userId, "u1", "akun nyata lebih dulu");
eq(kenik[0].baris[1].userId, "u2", "akun buatan admin di belakang");

// ===== Kembar karena WhatsApp (NIK salah ketik) =====
const kewa = kelompokkanKembar([
  baris("u1", "ALFIAN", "3174010101900001", "6281234567890", 2),
  baris("u2", "ALIFAN", "3174010101900019", "6281234567890", 0, true),
]);
eq(kewa.length, 1, "WhatsApp sama → satu kelompok");
eq(kewa[0].sebab.join(","), "whatsapp", "sebab whatsapp");

// Digit saja: spasi / tanda hubung / awalan + diabaikan.
const kespasi = kelompokkanKembar([
  baris("u1", "ANI", "3174 0101 0190 0001", "+62 812-3456-789"),
  baris("u2", "ANI ", "3174010101900001", "628123456789"),
]);
eq(kespasi.length, 1, "spasi & tanda hubung diabaikan");

// ===== Kembar transitif (NIK menghubungkan B & C, WA menghubungkan A & B) =====
const transitif = kelompokkanKembar([
  baris("u1", "A", "1111111111111111", "628111111111"),
  baris("u2", "B", "1111111111111111", "628222222222"),
  baris("u3", "C", "3333333333333333", "628222222222"),
]);
eq(transitif.length, 1, "transitif → satu kelompok");
eq(transitif[0].baris.length, 3, "transitif → tiga akun");
eq(transitif[0].sebab.join(","), "nik,whatsapp", "transitif → kedua sebab");

// ===== Beberapa kelompok sekaligus, diurutkan berkas terbanyak =====
const banyak = kelompokkanKembar([
  baris("a1", "SEPULUH", "1111111111111111", "628100000000", 10),
  baris("a2", "SEPULUH", "1111111111111111", "628100000001", 0, true),
  baris("b1", "SATU", "2222222222222222", "628200000000", 1),
  baris("b2", "SATU", "2222222222222222", "628200000001", 0, true),
]);
eq(banyak.length, 2, "dua kelompok kembar");
eq(banyak[0].baris[0].userId, "a1", "kelompok berkas terbanyak lebih dulu");
eq(banyak[1].baris[0].userId, "b1", "kelompok berikutnya");

// ===== pilihUtama =====
eq(
  pilihUtama([
    baris("nyata", "ALFIAN", "1111111111111111", "628111", 1),
    baris("buatan", "ALIFAN", "1111111111111111", "628111", 5, true),
  ]).userId,
  "nyata",
  "pilihUtama mengutamakan akun nyata walau berkasnya lebih sedikit",
);
eq(
  pilihUtama([
    baris("kecil", "A", "1111111111111111", "628111", 1),
    baris("besar", "A", "1111111111111111", "628111", 7),
  ]).userId,
  "besar",
  "pilihUtama memilih berkas terbanyak antar akun nyata",
);
let melempar = false;
try {
  pilihUtama([]);
} catch {
  melempar = true;
}
eq(melempar, true, "pilihUtama daftar kosong → galat");

console.log(`duplikatNasabah: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
