/** Run: bun src/lib/nama.test.ts */
import {
  kunciNama,
  namaHurufBesar,
  namaRuangan,
  namaTampil,
  samarkanNama,
  sudahHurufBesar,
} from "./nama";

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
eq(namaTampil([undefined], "Tanpa data pinjaman"), "Tanpa data pinjaman", "fallback khusus");// ===== sudahHurufBesar =====
eq(sudahHurufBesar("ASEP FIRMAN HANAFI"), true, "kanonik terdeteksi");
eq(sudahHurufBesar("Asep Firm an Hanafi"), false, "belum kanonik terdeteksi");
eq(sudahHurufBesar(" ASEP "), false, "spasi berlebih bukan kanonik");

// ===== samarkanNama =====
eq(
  samarkanNama("MUHAMMAD IBRAHIM ANUAZAR"),
  "MU****** IB***** AN*****",
  "tiap kata menyisakan dua huruf depan",
);
eq(samarkanNama("BUDI"), "BU**", "kata tiga huruf ke atas menyisakan dua huruf");
eq(samarkanNama("AL"), "A*", "kata dua huruf menyisakan satu huruf");
eq(samarkanNama("A"), "A", "kata satu huruf dibiarkan apa adanya");
eq(samarkanNama("  BUDI   SANTOSO  "), "BU** SA*****", "spasi berlebih dirapikan lebih dulu");
eq(samarkanNama(""), "", "nama kosong tetap kosong");
eq(samarkanNama("   "), "", "hanya spasi menjadi kosong");

// ===== namaRuangan =====
eq(
  namaRuangan("Asep Firm an Hanafi", true),
  "AS** FI** A* HA****",
  "kanonik dulu, lalu disamarkan",
);
eq(
  namaRuangan("asep firm an hanafi", false),
  "ASEP FIRM AN HANAFI",
  "tanpa samar hanya dibesarkan",
);

// ===== kunciNama =====
eq(kunciNama("  Asep   Firm an Hanafi "), "asep firm an hanafi", "kunci nama seragam");
eq(kunciNama(null), "", "null menjadi kunci kosong");
eq(kunciNama(undefined), "", "undefined menjadi kunci kosong");

if (failed > 0) {
  console.error(`\n${failed} gagal, ${passed} lulus`);
  throw new Error(`${failed} tes nama gagal`);
}
console.log(`nama: ${passed} lulus`);
