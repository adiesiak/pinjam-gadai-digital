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
  bolehKirimPeringatanLokasi,
  labelTandaLokasi,
  LOKASI_PERINGATAN_JEDA_JAM,
  LOKASI_RETENSI,
  periksaLokasiPalsu,
  pesanLokasiPalsu,
  TANDA_LOKASI_PALSU,
  titikBolehDihapus,
  type TitikDiperiksa,
} from "./lokasi";
import { DEFAULT_CONFIG, RETENSI_LOKASI_BATAS } from "./system-config";

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

// ===== Deteksi lokasi palsu =====
const T0 = 1_800_000_000_000;
const titikDi = (
  lat: number,
  lng: number,
  akurasi: number,
  menitLalu: number,
  extra: Partial<TitikDiperiksa> = {},
): TitikDiperiksa => ({ lat, lng, akurasi, waktu: T0 - menitLalu * 60_000, ...extra });

// 1. Perangkat melaporkan sendiri titiknya dari mock location.
const mock = periksaLokasiPalsu({ lat: -6.2, lng: 106.816666, akurasi: 5, mock: true }, null, T0);
ok("mock location ditolak", mock.palsu);
ok("pesan mock menyebut lokasi palsu", (mock.alasan ?? "").includes("lokasi palsu"));

// 2. Akurasi di bawah kemampuan sensor GPS konsumen.
const sempurna = periksaLokasiPalsu({ lat: -6.2, lng: 106.816666, akurasi: 0 }, null, T0);
ok("akurasi 0 m ditolak", sempurna.palsu);
ok("pesan akurasi menyebut 1 meter", (sempurna.alasan ?? "").includes("1 meter"));
const nyata = periksaLokasiPalsu({ lat: -6.2, lng: 106.816666, akurasi: 8 }, null, T0);
ok("akurasi normal diterima", !nyata.palsu);
eq("titik pertama tanpa tanda", nyata.tanda.length, 0);
eq("titik pertama tanpa jarak lompat", nyata.jarakLompatKm, null);

// 3. Lompatan mustahil tetap ditolak lewat jalur baru ini.
const sebelumnyaJakarta = titikDi(-6.2, 106.816666, 10, 1);
const lompat = periksaLokasiPalsu(
  { lat: -6.6, lng: 106.816666, akurasi: 10 },
  sebelumnyaJakarta,
  T0,
);
ok("lompatan 44 km dalam 1 menit ditolak", lompat.palsu);
ok("pesan lompatan dipertahankan", (lompat.alasan ?? "").includes("melompat tidak wajar"));
ok("jarak lompat dilaporkan", (lompat.jarakLompatKm ?? 0) > 40);

// 4. Jarak jauh setelah jeda panjang = perjalanan nyata, bukan lompatan.
const perjalanan = periksaLokasiPalsu(
  { lat: -7.2575, lng: 112.7521, akurasi: 25 },
  titikDi(-6.2, 106.816666, 20, 180),
  T0,
);
ok("Jakarta → Surabaya dalam 3 jam bukan lokasi palsu", !perjalanan.palsu);

// 5. Koordinat persis sama berulang-ulang → dicatat (titik tetap diterima).
const beku = titikDi(-6.2, 106.816666, 6, 1, { identikBerturut: 4 });
const lanjutBeku = periksaLokasiPalsu({ lat: -6.2, lng: 106.816666, akurasi: 6 }, beku, T0);
ok("titik identik ke-5 tidak ditolak", !lanjutBeku.palsu);
eq("hitungan identik bertambah", lanjutBeku.identikBerturut, 5);
ok(
  "titik identik ke-5 ditandai perlu ditinjau",
  lanjutBeku.tanda.includes(TANDA_LOKASI_PALSU.koordinatIdentik),
);
const baruEmpat = periksaLokasiPalsu(
  { lat: -6.2, lng: 106.816666, akurasi: 6 },
  titikDi(-6.2, 106.816666, 6, 1, { identikBerturut: 3 }),
  T0,
);
eq("titik identik ke-4 belum ditandai", baruEmpat.tanda.length, 0);
// Akurasi buruk memang boleh berulang persis (posisi jaringan yang di-cache).
const bekuAkurasiBuruk = periksaLokasiPalsu(
  { lat: -6.2, lng: 106.816666, akurasi: 800 },
  titikDi(-6.2, 106.816666, 800, 1, { identikBerturut: 9 }),
  T0,
);
eq("identik dengan akurasi buruk tidak ditandai", bekuAkurasiBuruk.tanda.length, 0);
// Koordinat bergeser → hitungan direset.
const bergeser = periksaLokasiPalsu(
  { lat: -6.20002, lng: 106.816666, akurasi: 6 },
  titikDi(-6.2, 106.816666, 6, 1, { identikBerturut: 9 }),
  T0,
);
eq("koordinat bergeser mereset hitungan", bergeser.identikBerturut, 1);

// ===== Peringatan lokasi dicurigai (anti-spam + label admin) =====
ok("peringatan pertama selalu boleh", bolehKirimPeringatanLokasi(null, T0));
ok(
  "peringatan 1 jam lalu ditahan",
  !bolehKirimPeringatanLokasi(T0 - 3_600_000, T0),
);
ok(
  "peringatan 25 jam lalu boleh lagi",
  bolehKirimPeringatanLokasi(T0 - 25 * 3_600_000, T0),
);
ok(
  "jeda bisa diatur (uji/manual)",
  bolehKirimPeringatanLokasi(T0 - 2 * 3_600_000, T0, 1),
);
ok(
  "jeda default = 24 jam",
  LOKASI_PERINGATAN_JEDA_JAM === 24 &&
    !bolehKirimPeringatanLokasi(T0 - 23 * 3_600_000, T0),
);
eq(
  "label tanda beku",
  labelTandaLokasi(TANDA_LOKASI_PALSU.koordinatIdentik),
  "Koordinat beku berulang",
);
eq(
  "label tanda mock",
  labelTandaLokasi(TANDA_LOKASI_PALSU.mockDilaporkan),
  "Perangkat melaporkan mock location",
);
eq("tanda tak dikenal ditampilkan apa adanya", labelTandaLokasi("tanda_baru"), "tanda_baru");

// ===== Pesan galat → instruksi yang tepat di UI =====
ok("pesan mock dikenali", pesanLokasiPalsu("Lokasi perangkat terdeteksi berasal dari aplikasi lokasi palsu (mock location)"));
ok("pesan lompatan dikenali", pesanLokasiPalsu("Lokasi terdeteksi melompat tidak wajar."));
ok("pesan akurasi mustahil dikenali", pesanLokasiPalsu("Akurasi GPS yang dilaporkan tidak wajar (di bawah 1 meter)"));
eq("pesan GPS kedaluwarsa bukan lokasi palsu", pesanLokasiPalsu("Lokasi wajib aktif untuk transaksi ini"), false);
eq("pesan akurasi buruk bukan lokasi palsu", pesanLokasiPalsu("Akurasi GPS terlalu rendah (±900 m)"), false);

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
// Default harus sah menurut batas yang divalidasi server — kalau tidak,
// menyimpan Pengaturan Sistem akan gagal walau admin tidak mengubah apa pun.
eq(
  "default retensi mengikuti kebijakan lokasi",
  DEFAULT_CONFIG.retensiLokasiHari,
  LOKASI_RETENSI.jejakHari,
);
ok(
  "default retensi di dalam batas yang diizinkan",
  DEFAULT_CONFIG.retensiLokasiHari >= RETENSI_LOKASI_BATAS.min &&
    DEFAULT_CONFIG.retensiLokasiHari <= RETENSI_LOKASI_BATAS.maks,
);
ok(
  "batas atas retensi menutupi masa bukti pinjaman",
  RETENSI_LOKASI_BATAS.maks > LOKASI_RETENSI.buktiPinjamanHari,
);

console.log(`lokasi tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
