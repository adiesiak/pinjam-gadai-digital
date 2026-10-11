/** Run: bun src/lib/biMetrik.test.ts — register metrik BI + matematika periode (pure). */
import {
  KODE_METRIK_SIAP,
  METRIK_BI,
  METRIK_TUNDA,
  PERIODE_BI,
  dalamRentang,
  definisiMetrik,
  labelMetrik,
  rentangPeriode,
} from "./biMetrik";

let passed = 0;
let failed = 0;
function eq(label: string, actual: unknown, expected: unknown): void {
  if (actual === expected) passed += 1;
  else {
    failed += 1;
    console.error(`✗ ${label}: diharapkan ${JSON.stringify(expected)}, dapat ${JSON.stringify(actual)}`);
  }
}
function ok(label: string, kondisi: boolean): void {
  eq(label, kondisi, true);
}

// --- Register: lengkap, unik, dan setiap metrik bisa dipertanggungjawabkan ---
ok("register tidak kosong", METRIK_BI.length >= 15);
const kode = METRIK_BI.map((m) => m.kode);
eq("kode unik", new Set(kode).size, kode.length);
ok(
  "semua kode berawalan BI-",
  kode.every((k) => /^BI-[A-Z]\d+$/.test(k)),
);
ok(
  "setiap metrik menyebut sumber",
  METRIK_BI.every((m) => m.sumber.trim().length > 0),
);
ok(
  "setiap metrik punya catatan",
  METRIK_BI.every((m) => m.catatan.trim().length > 0),
);
ok(
  "setiap metrik punya label manusia",
  METRIK_BI.every((m) => m.label.trim().length > 0 && !m.label.includes("_")),
);
eq(
  "kesiapan hanya siap/tunda",
  METRIK_BI.every((m) => m.kesiapan === "siap" || m.kesiapan === "tunda"),
  true,
);
eq("metrik siap + tunda = seluruh register", KODE_METRIK_SIAP.length + METRIK_TUNDA.length, METRIK_BI.length);
ok("ada metrik siap", KODE_METRIK_SIAP.length > 0);
ok("ada metrik tunda (jujur belum siap)", METRIK_TUNDA.length > 0);
ok(
  "metrik tunda punya alasan yang menjelaskan",
  METRIK_TUNDA.every((m) => m.catatan.length > 20),
);
// Metrik yang dinyatakan siap di dokumen harus benar-benar siap di kode.
for (const k of ["BI-L1", "BI-L2", "BI-L3", "BI-L4", "BI-P1", "BI-P2", "BI-K1", "BI-K2", "BI-C1", "BI-C2", "BI-A1"]) {
  ok(`${k} dinyatakan siap`, KODE_METRIK_SIAP.includes(k));
}
ok("BI-F1 tetap tunda", METRIK_TUNDA.some((m) => m.kode === "BI-F1"));

eq("definisiMetrik menemukan kode", definisiMetrik("BI-L1")?.label, "Pengajuan pinjaman baru");
eq("definisiMetrik kode tak dikenal → null", definisiMetrik("BI-X9"), null);
eq("labelMetrik memakai label manusia", labelMetrik("BI-C1"), "Nasabah terverifikasi (KYC)");
eq("labelMetrik kode tak dikenal apa adanya", labelMetrik("BI-ZZ"), "BI-ZZ");

// --- Periode: batas hari & bulan menurut WIB -------------------------------
eq("tiga periode didukung", PERIODE_BI.length, 3);

// 2026-10-10 03:00 WIB = 2026-10-09 20:00 UTC.
const sekarang = Date.UTC(2026, 9, 9, 20, 0, 0);
const kumulatif = rentangPeriode("kumulatif", sekarang);
eq("kumulatif mulai dari nol", kumulatif.mulai, 0);
eq("kumulatif berakhir di sekarang", kumulatif.selesai, sekarang);

const harian = rentangPeriode("harian", sekarang);
eq("awal hari WIB = 00:00 WIB (17:00 UTC hari sebelumnya)", harian.mulai, Date.UTC(2026, 9, 9, 17, 0, 0));
eq("akhir rentang = waktu sekarang", harian.selesai, sekarang);
ok("sekarang termasuk rentang harian", dalamRentang(sekarang - 1, harian));
ok("kemarin 23:59 WIB tidak termasuk hari ini", !dalamRentang(Date.UTC(2026, 9, 9, 16, 59, 0), harian));

const bulanan = rentangPeriode("bulanan", sekarang);
eq("awal bulan WIB = 1 Oktober 00:00 WIB", bulanan.mulai, Date.UTC(2026, 8, 30, 17, 0, 0));
ok("awal bulan termasuk rentang", dalamRentang(bulanan.mulai, bulanan));
ok("bulan lalu tidak termasuk", !dalamRentang(Date.UTC(2026, 8, 30, 16, 59, 0), bulanan));

// --- Perilaku `dalamRentang` ----------------------------------------------
eq("waktu undefined tidak dihitung", dalamRentang(undefined, harian), false);
eq("tepat di batas selesai tidak dihitung", dalamRentang(harian.selesai, harian), false);
eq("tepat di batas mulai dihitung", dalamRentang(harian.mulai, harian), true);
eq("semua waktu lampau dihitung pada kumulatif", dalamRentang(1_000, kumulatif), true);

console.log(`biMetrik tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
