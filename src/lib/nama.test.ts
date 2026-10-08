/** Run: bun src/lib/nama.test.ts */
import { namaHurufBesar, namaTampil, sudahHurufBesar } from "./nama";

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

// ===== namaHurufBesar =====

eq(namaHurufBesar("Ai sulinah"), "AI SULINAH", "huruf kecil dijadikan besar");
eq(namaHurufBesar("  Asep   Firm an   Hanafi "), "ASEP FIRM AN HANAFI", "spasi dirapikan");
eq(namaHurufBesar("ASEP FIRMAN HANAFI"), "ASEP FIRMAN HANAFI", "sudah besar tidak berubah");
eq(namaHurufBesar(""), "", "kosong tetap kosong");
eq(namaHurufBesar("   "), "", "hanya spasi menjadi kosong");

// ===== namaTampil =====

eq(
  namaTampil(["  asep firm an hanafi  ", "ASEP FIRMAN"]),
  "ASEP FIRM AN HANAFI",
  "kandidat pertama yang berisi dipakai",
);
eq(
  namaTampil([null, undefined, "", "  ra ni "]),
  "RA NI",
  "kandidat kosong dilewati",
);
eq(namaTampil([null, undefined], "TANPA NAMA"), "TANPA NAMA", "fallback bawaan");
eq(namaTampil([undefined], "Tanpa data pinjaman"), "Tanpa data pinjaman", "fallback khusus");

// ===== sudahHurufBesar =====

eq(sudahHurufBesar("ASEP FIRMAN HANAFI"), true, "kanonik terdeteksi");
eq(sudahHurufBesar("Asep Firm an Hanafi"), false, "belum kanonik terdeteksi");
eq(sudahHurufBesar(" ASEP "), false, "spasi berlebih bukan kanonik");

if (failed > 0) {
  console.error(`\n${failed} gagal, ${passed} lulus`);
  throw new Error(`${failed} tes nama gagal`);
}
console.log(`nama: ${passed} lulus`);
