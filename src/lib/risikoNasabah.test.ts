/** Uji profil risiko nasabah (pure, tanpa server). */
import { AMBANG_RISIKO, profilRisiko } from "./risikoNasabah";

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

// Nasabah tanpa riwayat → BARU, tidak dihukum.
const baru = profilRisiko([]);
eq("tanpa riwayat → kategori BARU", baru.kategori, "BARU");
eq("tanpa riwayat → skor netral", baru.skor, 50);
eq("tanpa riwayat → faktor menjelaskan", baru.faktor.length, 1);

// Nasabah dengan satu pinjaman lunas tepat waktu → RENDAH.
const baik = profilRisiko([{ status: "lunas", tepatWaktu: true }]);
eq("lunas tepat waktu → kategori RENDAH", baik.kategori, "RENDAH");
ok("lunas tepat waktu menaikkan skor di atas ambang", baik.skor >= AMBANG_RISIKO.rendah);
eq("lunas dihitung", baik.jumlah.lunas, 1);
eq("tepat waktu dihitung", baik.jumlah.tepatWaktu, 1);

// Keterlambatan menurunkan skor dan kategori.
const telat = profilRisiko([
  { status: "didanai", hariTerlambat: 12 },
  { status: "didanai", hariTerlambat: 3 },
]);
eq("dua pinjaman aktif terlambat dihitung", telat.jumlah.terlambat, 2);
ok("keterlambatan menurunkan skor", telat.skor < 50);
eq("keterlambatan berat → kategori TINGGI", telat.kategori, "TINGGI");

// Penolakan mengurangi skor, tetapi tidak pernah di bawah nol.
const banyakDitolak = profilRisiko([
  { status: "ditolak" },
  { status: "ditolak" },
  { status: "ditolak" },
  { status: "ditolak" },
]);
ok("skor tidak pernah negatif", banyakDitolak.skor >= 0);
eq("penolakan dihitung", banyakDitolak.jumlah.ditolak, 4);

// Campuran: lunas tepat waktu + satu berjalan tanpa telat → minimal SEDANG.
const campuran = profilRisiko([
  { status: "lunas", tepatWaktu: true },
  { status: "lunas", tepatWaktu: true },
  { status: "didanai", hariTerlambat: 0 },
]);
eq("campuran menghitung lunas", campuran.jumlah.lunas, 2);
ok("campuran minimal SEDANG", campuran.kategori === "RENDAH" || campuran.kategori === "SEDANG");

// Skor selalu dalam 0–100 walau riwayat ekstrem.
const ekstrem = profilRisiko(Array.from({ length: 50 }, () => ({ status: "lunas", tepatWaktu: true })));
ok("skor dibatasi 100", ekstrem.skor <= 100);
eq("skor maksimum tercapai", ekstrem.skor, 100);

console.log(`risikoNasabah tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
