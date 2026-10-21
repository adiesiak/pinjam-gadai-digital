/** Uji aturan tiket & periode Doorprize triwulanan (murni, tanpa Convex). */
import {
  BATAS_NILAI_HADIAH_DOORPRIZE,
  HADIAH_DOORPRIZE_BAWAAN,
  LABEL_KATEGORI_HADIAH,
  NILAI_HADIAH_MINIMUM,
  PRESET_HADIAH_DOORPRIZE,
  TEKS_KETENTUAN_DOORPRIZE,
  akhirKuartal,
  awalKuartal,
  bacaKodeKuartal,
  bulanKuartal,
  judulDoorprizeKuartal,
  kodeKuartal,
  kuartalDariWaktu,
  kunciPeriodeKuartal,
  labelPeriodeKuartal,
  labelRentangKuartal,
  labelTanggalUndianKuartal,
  nilaiHadiahValid,
  pembukaanUndianKuartal,
  tiketPendana,
  tiketPeminjam,
} from "./doorprize";

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
function ok(syarat: boolean, label: string) {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

// ===== Kuartal menurut kalender WIB =====
eq(
  kodeKuartal(kuartalDariWaktu(Date.UTC(2026, 9, 21, 3, 0))),
  "2026-Q4",
  "21 Oktober 2026 masuk Q4",
);
eq(
  kodeKuartal(kuartalDariWaktu(Date.UTC(2025, 11, 31, 16, 0))),
  "2025-Q4",
  "31 Desember 2025 23.00 WIB masih Q4 2025",
);
eq(
  kodeKuartal(kuartalDariWaktu(Date.UTC(2025, 11, 31, 17, 30))),
  "2026-Q1",
  "1 Januari 00.30 WIB sudah Q1 2026",
);
eq(kodeKuartal({ year: 2026, quarter: 2 }), "2026-Q2", "kode kuartal Q2");
eq(bacaKodeKuartal("2026-Q3").quarter, 3, "kode Q3 dibaca kembali");

let ditolak = false;
try {
  bacaKodeKuartal("2026-13");
} catch {
  ditolak = true;
}
eq(ditolak, true, "kode periode bulanan lama ditolak saat dibaca sebagai kuartal");

// ===== Batas kuartal =====
const q4 = { year: 2026, quarter: 4 } as const;
eq(
  new Date(awalKuartal(q4)).toISOString(),
  "2026-09-30T17:00:00.000Z",
  "awal Q4 = 1 Oktober 00.00 WIB",
);
eq(
  new Date(akhirKuartal(q4)).toISOString(),
  "2026-12-31T16:59:59.999Z",
  "akhir Q4 = 31 Desember 23.59.59.999 WIB",
);
eq(
  new Date(pembukaanUndianKuartal(q4)).toISOString(),
  "2026-12-30T17:00:00.000Z",
  "pengundian dibuka 31 Desember 00.00 WIB",
);
eq(labelTanggalUndianKuartal(q4), "31 Desember 2026", "label tanggal pengundian Q4");
eq(labelPeriodeKuartal(q4), "Q4 2026", "label periode ringkas");
eq(labelRentangKuartal(q4), "Oktober – Desember 2026", "label rentang bulan");
eq(
  judulDoorprizeKuartal(q4),
  "Doorprize Utama Periode Q4 (Oktober – Desember)",
  "judul banner dashboard",
);
eq(bulanKuartal(q4).join(","), "Oktober,November,Desember", "tiga bulan kuartal");

// Jembatan data lama: kode kuartal + tiga kode bulanan.
eq(
  kunciPeriodeKuartal(q4).join("|"),
  "2026-Q4|2026-10|2026-11|2026-12",
  "tiket kuartal membaca kode kuartal dan bulan lama",
);

// ===== Preset hadiah & batas anggaran =====
ok(PRESET_HADIAH_DOORPRIZE.length >= 6, "preset hadiah cukup untuk dipilih admin");
for (const preset of PRESET_HADIAH_DOORPRIZE) {
  ok(preset.nilai < BATAS_NILAI_HADIAH_DOORPRIZE, `preset ${preset.nama} di bawah Rp1 juta`);
  ok(preset.nilai >= NILAI_HADIAH_MINIMUM, `preset ${preset.nama} di atas nilai minimum`);
  ok(
    LABEL_KATEGORI_HADIAH[preset.kategori].length > 0,
    `kategori ${preset.kategori} punya label`,
  );
}
ok(HADIAH_DOORPRIZE_BAWAAN.nilai < BATAS_NILAI_HADIAH_DOORPRIZE, "hadiah bawaan di bawah Rp1 juta");

eq(nilaiHadiahValid(999_999), true, "Rp999.999 sah");
eq(nilaiHadiahValid(1_000_000), false, "Rp1.000.000 ditolak");
eq(nilaiHadiahValid(NILAI_HADIAH_MINIMUM - 1), false, "di bawah nilai minimum ditolak");
eq(nilaiHadiahValid(250_000.5), false, "nilai pecahan ditolak");

// ===== Tiket =====
eq(tiketPendana(999_999), 0, "di bawah Rp1 juta belum dapat tiket");
eq(tiketPendana(1_000_000), 1, "Rp1 juta = 1 tiket");
eq(tiketPendana(2_500_000), 2, "Rp2,5 juta = 2 tiket (bukan 3)");
eq(tiketPendana(0), 0, "nol tidak menghasilkan tiket");
eq(tiketPendana(-1_000_000), 0, "negatif tidak menghasilkan tiket");
eq(tiketPeminjam(true), 1, "lunas tepat waktu = 1 tiket");
eq(tiketPeminjam(false), 0, "lunas terlambat = 0 tiket");

// ===== Teks kanonik =====
ok(TEKS_KETENTUAN_DOORPRIZE.includes("tenor 7, 14, & 28 hari"), "tenor disebut");
ok(TEKS_KETENTUAN_DOORPRIZE.includes("3 bulan"), "periode 3 bulan disebut");
ok(TEKS_KETENTUAN_DOORPRIZE.includes("akhir setiap kuartal"), "akhir kuartal disebut");

if (failed > 0) {
  console.error(`\n${failed} gagal, ${passed} lulus`);
  throw new Error("Tes doorprize gagal");
}
console.log(`doorprize: ${passed} lulus`);
