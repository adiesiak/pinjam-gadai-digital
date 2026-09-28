/**
 * Uji plafon pinjaman per nasabah (lib/plafon.ts) — murni, tanpa server:
 * clamp, override per orang, validasi pokok & kredit, dan turunan harga
 * barang maksimum dari plafon.
 */
import { BULANAN_LIMITS } from "./bulanan";
import { KREDIT_PRICING } from "./kredit";
import { LOAN_LIMITS } from "./loan";
import {
  clampPlafon,
  hargaBarangMaksDariPlafon,
  kreditDalamPlafon,
  pesanPlafonTerlampaui,
  PLAFON_BATAS,
  PLAFON_DEFAULT,
  plafonEfektif,
  pokokDalamPlafon,
} from "./plafon";

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

// ===== Default & clamp =====
eq("default = batas mesin harian", PLAFON_DEFAULT, LOAN_LIMITS.maxPokok);
eq("clamp nol ke minimum", clampPlafon(0), PLAFON_BATAS.min);
eq("clamp negatif ke minimum", clampPlafon(-5_000_000), PLAFON_BATAS.min);
eq("clamp di atas maksimum", clampPlafon(99_000_000), PLAFON_BATAS.maks);
eq("clamp NaN ke default", clampPlafon(Number.NaN), PLAFON_DEFAULT);
eq("nilai di dalam rentang utuh", clampPlafon(5_000_000), 5_000_000);
eq("pecahan dibulatkan", clampPlafon(1_234_567.89), 1_234_568);
ok(
  "default global di dalam rentang",
  PLAFON_DEFAULT >= PLAFON_BATAS.min && PLAFON_DEFAULT <= PLAFON_BATAS.maks,
);

// ===== Override per orang =====
eq("override null → global", plafonEfektif(null, 2_000_000), 2_000_000);
eq("override undefined → global", plafonEfektif(undefined, 2_000_000), 2_000_000);
eq("override menang atas global", plafonEfektif(8_000_000, 2_000_000), 8_000_000);
eq("override tetap di-clamp", plafonEfektif(50_000_000, 2_000_000), PLAFON_BATAS.maks);
eq("override kecil tetap sah", plafonEfektif(500_000, 2_000_000), 500_000);

// ===== Validasi pokok =====
ok("pokok di bawah plafon diterima", pokokDalamPlafon(1_000_000, 2_000_000));
ok("pokok tepat plafon diterima", pokokDalamPlafon(2_000_000, 2_000_000));
ok("pokok di atas plafon ditolak", !pokokDalamPlafon(2_500_000, 2_000_000));
ok("pokok di bawah minimum skema ditolak", !pokokDalamPlafon(50_000, 2_000_000));
ok("plafon tidak bisa lebih rendah dari minimum skema", PLAFON_BATAS.min === LOAN_LIMITS.minPokok);
ok("pesan menyebut plafon", pesanPlafonTerlampaui(2_000_000).includes("2.000.000"));
ok("pesan menawarkan penyesuaian", pesanPlafonTerlampaui(2_000_000).includes("penyesuaian"));

// ===== Kredit barang: pokok dibiayai, bukan harga barang =====
ok("pokok dibiayai dalam plafon diterima", kreditDalamPlafon(8_000_000, 10_000_000));
ok("pokok dibiayai di atas plafon ditolak", !kreditDalamPlafon(11_000_000, 10_000_000));
ok("pokok nol/negatif ditolak", !kreditDalamPlafon(0, 10_000_000) && !kreditDalamPlafon(-1, 10_000_000));

// Harga barang maksimum dari plafon: DP minimum 10% → harga = plafon / 0.9.
eq(
  "harga maks 10 jt plafon",
  hargaBarangMaksDariPlafon(9_000_000),
  Math.floor(9_000_000 / 0.9),
);
// Pokok dibiayai pada harga maksimum dengan DP 10% tepat plafon:
const hargaMaks = hargaBarangMaksDariPlafon(PLAFON_BATAS.maks);
eq(
  "pokok pada harga maks (DP 10%) tepat plafon atas",
  Math.floor(hargaMaks * 0.9),
  PLAFON_BATAS.maks,
);
ok(
  "harga maks tidak melebihi batas mesin kredit",
  hargaBarangMaksDariPlafon(PLAFON_BATAS.maks) <= KREDIT_PRICING.maxHargaBarang,
);
// Tenor bulanan (DP 0%): harga barang = pokok → harga maks harus di-clamp ke plafon
// saat skema bulanan yang dipakai; di sini cukup pastikan clamp bekerja untuk 1 jt.
eq("harga maks plafon 1 jt", hargaBarangMaksDariPlafon(1_000_000), Math.floor(1_000_000 / 0.9));

// ===== Konsistensi antar-batas =====
ok(
  "plafon atas di bawah mesin bulanan",
  PLAFON_BATAS.maks <= BULANAN_LIMITS.maxPokok,
);
ok(
  "batas mesin tidak lebih kecil dari plafon atas (clamp bermakna)",
  PLAFON_BATAS.maks <= Math.min(BULANAN_LIMITS.maxPokok, KREDIT_PRICING.maxHargaBarang),
);

console.log(`plafon tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
