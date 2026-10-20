/** Uji aturan biaya platform: ekspres, roll-over, dan dana proteksi risiko. */
import {
  BIAYA_ROLLOVER,
  PERSEN_DANA_PROTEKSI_RISIKO,
  biayaEkspres,
  biayaRollover,
  porsiDanaProteksiRisiko,
} from "./ekonomiPlatform";

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

// Biaya ekspres mengikuti tier nominal pinjaman harian.
eq(biayaEkspres(100_000), 5_000, "tier 1 bawah: Rp5.000");
eq(biayaEkspres(499_999), 5_000, "tier 1 atas: Rp5.000");
eq(biayaEkspres(500_000), 7_500, "tier 2 bawah: Rp7.500");
eq(biayaEkspres(999_999), 7_500, "tier 2 atas: Rp7.500");
eq(biayaEkspres(1_000_000), 10_000, "tier 3: Rp10.000");
eq(biayaEkspres(10_000_000), 10_000, "nominal warisan besar memakai tarif tertinggi");
eq(biayaEkspres(999), 0, "di bawah pokok minimum tidak dikenai biaya");

let ditolak = false;
try {
  biayaEkspres(0);
} catch {
  ditolak = true;
}
eq(ditolak, true, "pokok nol ditolak");

// Roll-over hanya untuk mode bayar bunga saja.
eq(biayaRollover("bunga_saja"), BIAYA_ROLLOVER, "bayar bunga saja dikenai roll-over");
eq(biayaRollover("cicil_pokok"), 0, "cicil pokok tidak dikenai roll-over");
eq(biayaRollover("pelunasan_total"), 0, "pelunasan total tidak dikenai roll-over");
eq(BIAYA_ROLLOVER, 5_000, "biaya roll-over flat Rp5.000");

// Dana proteksi risiko: 2,5% dari margin, pembulatan ke bawah.
eq(porsiDanaProteksiRisiko(0), 0, "margin nol tidak mengisi pool");
eq(porsiDanaProteksiRisiko(-10_000), 0, "margin negatif tidak mengisi pool");
eq(porsiDanaProteksiRisiko(50_000), 1_250, "2,5% x 50.000 = 1.250");
eq(porsiDanaProteksiRisiko(1_001), 25, "pembulatan ke bawah: 25,025 → 25");
eq(PERSEN_DANA_PROTEKSI_RISIKO, 2.5, "tarif pool 2,5%");

if (failed > 0) {
  console.error(`\n${failed} gagal, ${passed} lulus`);
  throw new Error("Tes ekonomi platform gagal");
}
console.log(`ekonomiPlatform: ${passed} lulus`);
