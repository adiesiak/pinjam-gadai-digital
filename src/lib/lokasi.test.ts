/**
 * Uji kebijakan lokasi: batas wilayah Indonesia, deteksi lompatan mustahil
 * (anti lokasi palsu), dan label umur titik.
 */
import {
  batasRetensiMs,
  INDONESIA_BOUNDS,
  kecepatanKmJam,
  koordinatIndonesia,
  labelUmurLokasi,
  LOKASI_RETENSI,
  titikBolehDihapus,
} from "./lokasi";

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

// ===== Wilayah Indonesia =====
ok("Jakarta di Indonesia", koordinatIndonesia(-6.2, 106.816666));
ok("Jayapura di Indonesia", koordinatIndonesia(-2.53, 140.71));
ok("Banda Aceh di Indonesia", koordinatIndonesia(5.55, 95.32));
// Catatan: batas ini bounding box KASAR. Semenanjung Malaysia & Singapura
// secara koordinat ikut masuk kotak — verifikasi presisi tetap lewat KYC,
// alamat penilaian, dan petugas; fungsinya menolak titik yang jelas jauh.
eq("Kuala Lumpur masih dalam kotak kasar", koordinatIndonesia(3.14, 101.69), true);
eq("New York di luar", koordinatIndonesia(40.71, -74.0), false);
eq("Dubai di luar", koordinatIndonesia(25.2, 55.27), false);
eq("lat kosong ditolak", koordinatIndonesia(Number.NaN, 106), false);
eq("lng kosong ditolak", koordinatIndonesia(-6.2, Number.POSITIVE_INFINITY), false);
eq(
  "batas bawah lintang masih diterima",
  koordinatIndonesia(INDONESIA_BOUNDS.latMin, INDONESIA_BOUNDS.lngMin),
  true,
);

// ===== Anti-spoof: kecepatan antar titik =====
const jakarta = { lat: -6.2, lng: 106.816666, waktu: 0 };
const bogor = { lat: -6.6, lng: 106.816666, waktu: 60 * 60 * 1000 }; // ±44 km / 1 jam
const kecepatanWajar = kecepatanKmJam(jakarta, bogor);
ok("perjalanan 1 jam ke Bogor wajar", kecepatanWajar < 80 && kecepatanWajar > 30);

const lompatSekejap = kecepatanKmJam(jakarta, {
  lat: -6.6,
  lng: 106.816666,
  waktu: 1000,
});
ok("lompatan 44 km dalam 1 detik tidak wajar", lompatSekejap > 200);

eq("jarak nol = kecepatan nol", kecepatanKmJam(jakarta, { ...jakarta, waktu: 5000 }), 0);
eq(
  "titik identik tanpa jeda waktu tidak dianggap lompatan",
  kecepatanKmJam(jakarta, { ...jakarta, waktu: 0 }),
  0,
);

// ===== Label umur =====
eq("baru saja", labelUmurLokasi(0), "baru saja");
eq("negatif dianggap baru", labelUmurLokasi(-3), "baru saja");
eq("menit", labelUmurLokasi(7), "7 menit lalu");
eq("jam", labelUmurLokasi(185), "3 jam lalu");

// ===== Retensi jejak lokasi (job cron harian) =====
const SEKARANG = 1_800_000_000_000;
const hariLalu = (hari: number): number => SEKARANG - hari * 86_400_000;

// Titik lama tanpa pinjaman: dihapus setelah lewat 90 hari.
ok(
  "titik biasa 91 hari dihapus",
  titikBolehDihapus({ waktu: hariLalu(91), pinjamanAktif: false }, SEKARANG),
);
ok(
  "titik biasa 89 hari dipertahankan",
  !titikBolehDihapus({ waktu: hariLalu(89), pinjamanAktif: false }, SEKARANG),
);
ok(
  "titik tepat di batas 90 hari dipertahankan",
  !titikBolehDihapus(
    { waktu: batasRetensiMs(SEKARANG, LOKASI_RETENSI.jejakHari), pinjamanAktif: false },
    SEKARANG,
  ),
);
// Pinjaman berjalan menahan bukti lokasinya lebih lama.
ok(
  "titik pinjaman berjalan 120 hari ditahan",
  !titikBolehDihapus({ waktu: hariLalu(120), pinjamanAktif: true }, SEKARANG),
);
ok(
  "titik pinjaman berjalan 401 hari dihapus",
  titikBolehDihapus({ waktu: hariLalu(401), pinjamanAktif: true }, SEKARANG),
);
ok(
  "titik pinjaman lunas 120 hari dihapus",
  titikBolehDihapus({ waktu: hariLalu(120), pinjamanAktif: false }, SEKARANG),
);
// Batas retensi bisa di-override (dipakai cron/manual).
eq("batas 30 hari", batasRetensiMs(SEKARANG, 30), SEKARANG - 30 * 86_400_000);
ok(
  "override 7 hari menghapus titik 10 hari",
  titikBolehDihapus({ waktu: hariLalu(10), pinjamanAktif: false }, SEKARANG, 7),
);
ok(
  "batas bukti lebih panjang dari retensi biasa",
  LOKASI_RETENSI.buktiPinjamanHari > LOKASI_RETENSI.jejakHari,
);

console.log(`lokasi tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
