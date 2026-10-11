/** Uji profil risiko nasabah (pure, tanpa server). */
import {
  AMBANG_RISIKO,
  BOBOT_RISIKO,
  PANJANG_MIN_ALASAN_OVERRIDE,
  gradeRisiko,
  profilRisiko,
  ringkasRisiko,
  validasiOverrideRisiko,
} from "./risikoNasabah";

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

// --- Bobot model tetap 25/25/15/10/10/5/10 = 100 ---------------------------
const daftarBobot = Object.values(BOBOT_RISIKO);
eq("tujuh komponen penilaian", daftarBobot.length, 7);
eq("total bobot = 100", daftarBobot.reduce((a, b) => a + b, 0), 100);
eq("bobot pelunasan 25", BOBOT_RISIKO.pelunasanTepatWaktu, 25);
eq("bobot keterlambatan 25", BOBOT_RISIKO.keterlambatan, 25);
eq("bobot keputusan 15", BOBOT_RISIKO.riwayatKeputusan, 15);
eq("bobot data diri 10", BOBOT_RISIKO.kelengkapanDataDiri, 10);
eq("bobot KYC 10", BOBOT_RISIKO.verifikasiIdentitas, 10);
eq("bobot keaktifan 5", BOBOT_RISIKO.keaktifanRiwayat, 5);
eq("bobot beban kewajiban 10", BOBOT_RISIKO.bebanKewajiban, 10);

// --- Ambang grade A–E ------------------------------------------------------
eq("skor 100 → grade A", gradeRisiko(100), "A");
eq("skor 85 → grade A (batas)", gradeRisiko(85), "A");
eq("skor 84 → grade B", gradeRisiko(84), "B");
eq("skor 75 → grade B (batas)", gradeRisiko(75), "B");
eq("skor 74 → grade C", gradeRisiko(74), "C");
eq("skor 45 → grade C (batas)", gradeRisiko(45), "C");
eq("skor 44 → grade D", gradeRisiko(44), "D");
eq("skor 25 → grade D (batas)", gradeRisiko(25), "D");
eq("skor 24 → grade E", gradeRisiko(24), "E");
eq("skor 0 → grade E", gradeRisiko(0), "E");

// Nasabah tanpa riwayat → BARU, tidak dihukum dan TIDAK diberi grade penilaian.
const baru = profilRisiko([]);
eq("tanpa riwayat → kategori BARU", baru.kategori, "BARU");
eq("tanpa riwayat → skor netral", baru.skor, 50);
eq("tanpa riwayat → dinilai=false", baru.dinilai, false);
eq("tanpa riwayat → tanpa komponen", baru.komponen.length, 0);
eq("tanpa riwayat → faktor menjelaskan", baru.faktor.length, 1);

// Nasabah dengan satu pinjaman lunas tepat waktu → grade baik.
const baik = profilRisiko([{ status: "lunas", tepatWaktu: true }]);
eq("lunas tepat waktu → kategori RENDAH", baik.kategori, "RENDAH");
ok("lunas tepat waktu → grade B atau lebih baik", baik.grade === "A" || baik.grade === "B");
ok("lunas tepat waktu menaikkan skor di atas ambang", baik.skor >= AMBANG_RISIKO.rendah);
eq("lunas dihitung", baik.jumlah.lunas, 1);
eq("tepat waktu dihitung", baik.jumlah.tepatWaktu, 1);
eq("tujuh komponen dihitung", baik.komponen.length, 7);
eq(
  "jumlah kontribusi = skor (tanpa pembulatan liar)",
  Math.round(baik.komponen.reduce((a, k) => a + k.kontribusi, 0)),
  baik.skor,
);

// Konteks lengkap: data diri + KYC terverifikasi menaikkan skor.
const denganKonteks = profilRisiko([{ status: "lunas", tepatWaktu: true }], {
  dataDiriLengkap: true,
  kycTerverifikasi: true,
});
ok("KYC + data diri lengkap menaikkan skor", denganKonteks.skor > baik.skor);
eq(
  "KYC terverifikasi memberi kontribusi penuh",
  denganKonteks.komponen.find((k) => k.kunci === "verifikasiIdentitas")?.kontribusi,
  10,
);
eq(
  "data diri lengkap memberi kontribusi penuh",
  denganKonteks.komponen.find((k) => k.kunci === "kelengkapanDataDiri")?.kontribusi,
  10,
);

// Keterlambatan menurunkan skor dan grade.
const telat = profilRisiko([
  { status: "didanai", hariTerlambat: 12 },
  { status: "didanai", hariTerlambat: 3 },
]);
eq("dua pinjaman aktif terlambat dihitung", telat.jumlah.terlambat, 2);
ok("keterlambatan menurunkan skor", telat.skor < 50);
eq("keterlambatan berat → kategori TINGGI", telat.kategori, "TINGGI");
ok("keterlambatan berat → grade D atau E", telat.grade === "D" || telat.grade === "E");
eq(
  "keterlambatan penuh memberi kontribusi nol",
  telat.komponen.find((k) => k.kunci === "keterlambatan")?.kontribusi,
  0,
);

// Penolakan mengurangi skor, tetapi tidak pernah di bawah nol.
const banyakDitolak = profilRisiko([
  { status: "ditolak" },
  { status: "ditolak" },
  { status: "ditolak" },
  { status: "ditolak" },
]);
ok("skor tidak pernah negatif", banyakDitolak.skor >= 0);
eq("penolakan dihitung", banyakDitolak.jumlah.ditolak, 4);
eq(
  "semua ditolak → komponen keputusan nol",
  banyakDitolak.komponen.find((k) => k.kunci === "riwayatKeputusan")?.kontribusi,
  0,
);

// Campuran: lunas tepat waktu + satu berjalan tanpa telat → minimal SEDANG.
const campuran = profilRisiko([
  { status: "lunas", tepatWaktu: true },
  { status: "lunas", tepatWaktu: true },
  { status: "didanai", hariTerlambat: 0 },
]);
eq("campuran menghitung lunas", campuran.jumlah.lunas, 2);
ok("campuran minimal SEDANG", campuran.kategori === "RENDAH" || campuran.kategori === "SEDANG");

// Skor selalu dalam 0–100 walau riwayat ekstrem.
const ekstrem = profilRisiko(
  Array.from({ length: 50 }, () => ({ status: "lunas", tepatWaktu: true })),
  { dataDiriLengkap: true, kycTerverifikasi: true },
);
ok("skor dibatasi 100", ekstrem.skor <= 100);
ok("riwayat sempurna → grade A", ekstrem.grade === "A");

const buruk = profilRisiko(
  Array.from({ length: 20 }, () => ({ status: "ditolak" })),
  { dataDiriLengkap: false, kycTerverifikasi: false },
);
ok("riwayat buruk tetap ≥ 0", buruk.skor >= 0);
ok("riwayat buruk → grade D atau E", buruk.grade === "D" || buruk.grade === "E");

// --- Override admin ---------------------------------------------------------
ok(
  "override grade valid + alasan panjang diterima",
  validasiOverrideRisiko("D", "Nasabah menyerahkan bukti penghasilan tambahan.").ok,
);
const gradePalsu = validasiOverrideRisiko("Z", "Alasan yang cukup panjang untuk lolos.");
eq("grade tidak dikenal ditolak", gradePalsu.ok, false);
const alasanPendek = validasiOverrideRisiko("B", "ok");
eq("alasan terlalu pendek ditolak", alasanPendek.ok, false);
ok(
  "batas alasan minimum diuji tepat di ambang",
  validasiOverrideRisiko("B", "x".repeat(PANJANG_MIN_ALASAN_OVERRIDE)).ok,
);
ok(
  "alasan satu karakter di bawah ambang ditolak",
  !validasiOverrideRisiko("B", "x".repeat(PANJANG_MIN_ALASAN_OVERRIDE - 1)).ok,
);

const tanpaOverride = ringkasRisiko("C", null);
eq("tanpa override → grade efektif = grade sistem", tanpaOverride.gradeEfektif, "C");
eq("tanpa override → ditimpa=false", tanpaOverride.ditimpa, false);

const denganOverride = ringkasRisiko("D", {
  gradeOverride: "B",
  alasan: "Nasabah menyerahkan bukti penghasilan tambahan.",
  olehLabel: "Petugas A",
  dibuatPada: 1_700_000_000_000,
});
eq("override → grade efektif dari admin", denganOverride.gradeEfektif, "B");
eq("override → grade sistem tetap terlihat", denganOverride.gradeSistem, "D");
eq("override → ditimpa=true", denganOverride.ditimpa, true);

const overrideSama = ringkasRisiko("C", {
  gradeOverride: "C",
  alasan: "Peninjauan ulang menyimpulkan grade sistem sudah tepat.",
  olehLabel: "Petugas A",
  dibuatPada: 1,
});
eq("override sama dengan sistem → ditimpa=false", overrideSama.ditimpa, false);

console.log(`risikoNasabah tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
