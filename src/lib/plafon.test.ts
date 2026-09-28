/** Uji kebijakan plafon tunai dan kredit barang (tanpa server). */
import { LOAN_LIMITS } from "./loan";
import {
  clampPlafon,
  pesanPlafonTerlampaui,
  PLAFON_BATAS,
  PLAFON_DEFAULT,
  PLAFON_NAIK_SETELAH_LUNAS,
  PLAFON_POKOK_MINIMUM_LUNAS,
  plafonEfektif,
  pokokDalamPlafon,
} from "./plafon";
import {
  KREDIT_BARANG_POKOK_MAKS,
  KREDIT_TENOR_MAKS_BULAN,
  KREDIT_TENOR_PENGAJUAN_OPTIONS,
} from "./kredit";

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

eq("default tunai = Rp1 juta", PLAFON_DEFAULT, 1_000_000);
eq("trigger kenaikan = pokok Rp1 juta", PLAFON_POKOK_MINIMUM_LUNAS, 1_000_000);
eq("plafon otomatis setelah lunas = Rp10 juta", PLAFON_NAIK_SETELAH_LUNAS, 10_000_000);
eq("batas maksimum admin = Rp10 juta", PLAFON_BATAS.maks, 10_000_000);
eq("batas minimum admin = Rp100 ribu", PLAFON_BATAS.min, 100_000);
eq("clamp nol ke minimum", clampPlafon(0), PLAFON_BATAS.min);
eq("clamp di atas maksimum", clampPlafon(99_000_000), PLAFON_BATAS.maks);
eq("clamp NaN ke default", clampPlafon(Number.NaN), PLAFON_DEFAULT);
eq("clamp nilai dalam rentang", clampPlafon(5_000_000), 5_000_000);

// Plafon sebelum/sesudah kualifikasi pelunasan penuh.
eq("global berlaku sebelum pinjaman 1 juta lunas", plafonEfektif(undefined, 1_000_000), 1_000_000);
eq("kualifikasi lunas menaikkan plafon dasar ke 10 juta", plafonEfektif(undefined, 1_000_000, true), 10_000_000);
eq("override admin menang sebelum lunas", plafonEfektif(3_000_000, 1_000_000), 3_000_000);
eq("override admin tetap menang setelah lunas", plafonEfektif(4_000_000, 1_000_000, true), 4_000_000);
eq("reset override sesudah lunas kembali ke 10 juta", plafonEfektif(null, 1_000_000, true), 10_000_000);
eq("reset override sebelum lunas kembali ke global", plafonEfektif(null, 2_000_000), 2_000_000);

ok("pokok tunai dalam plafon diterima", pokokDalamPlafon(900_000, 1_000_000));
ok("pokok tunai tepat plafon diterima", pokokDalamPlafon(1_000_000, 1_000_000));
ok("pokok tunai di atas plafon ditolak", !pokokDalamPlafon(1_000_001, 1_000_000));
ok("pokok tunai di bawah minimum ditolak", !pokokDalamPlafon(50_000, 1_000_000));
ok("default sama dengan batas mesin tunai awal", PLAFON_DEFAULT === LOAN_LIMITS.maxPokok);
ok("pesan menyebut plafon", pesanPlafonTerlampaui(2_000_000).includes("2.000.000"));

// Kebijakan penerbitan kredit barang tak lagi diwarisi dari plafon tunai.
eq("batas pokok kredit barang tetap Rp10 juta", KREDIT_BARANG_POKOK_MAKS, 10_000_000);
eq("tenor maksimal penerbitan kredit barang 6 bulan", KREDIT_TENOR_MAKS_BULAN, 6);
eq("tenor baru hanya 1/3/6 bulan", KREDIT_TENOR_PENGAJUAN_OPTIONS.join(","), "1,3,6");

console.log(`plafon tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
