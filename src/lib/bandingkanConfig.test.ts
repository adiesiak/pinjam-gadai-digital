/** Uji pembanding konfigurasi (pure, tanpa server). */
import {
  bandingkanConfig,
  labelConfig,
  nilaiConfigTampil,
} from "./bandingkanConfig";

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

const sebelum = { persenBunga: 30, killSwitch: false, tema: "tinta", plafonPinjaman: 1_000_000 };

// Tidak ada perubahan → daftar kosong (panel tidak boleh menampilkan "berubah").
eq("snapshot identik → tanpa perubahan", bandingkanConfig(sebelum, { ...sebelum }).length, 0);

// Perubahan angka terbaca lama → baru dengan kunci yang tepat.
const angka = bandingkanConfig(sebelum, { ...sebelum, persenBunga: 25 });
eq("satu perubahan terdeteksi", angka.length, 1);
eq("kunci perubahan benar", angka[0].kunci, "persenBunga");
eq("nilai lama tercatat", angka[0].lama, 30);
eq("nilai baru tercatat", angka[0].baru, 25);

// Beberapa perubahan sekaligus, urut berdasarkan kunci (stabil di UI).
const banyak = bandingkanConfig(sebelum, {
  ...sebelum,
  persenBunga: 25,
  killSwitch: true,
  tema: "pesisir",
});
eq("tiga perubahan terdeteksi", banyak.length, 3);
eq("urut kunci (1)", banyak[0].kunci, "killSwitch");
eq("urut kunci (2)", banyak[1].kunci, "persenBunga");
eq("urut kunci (3)", banyak[2].kunci, "tema");

// Boolean & string ikut terdeteksi, bukan hanya angka.
ok(
  "kill switch true terdeteksi",
  bandingkanConfig(sebelum, { ...sebelum, killSwitch: true }).some(
    (p) => p.kunci === "killSwitch" && p.lama === false && p.baru === true,
  ),
);

// Kunci yang HILANG atau MUNCUL tetap dilaporkan (bukan diabaikan).
const hilang = bandingkanConfig(sebelum, { persenBunga: 30, killSwitch: false, tema: "tinta" });
eq("kunci hilang dilaporkan", hilang.length, 1);
eq("kunci hilang teridentifikasi", hilang[0].kunci, "plafonPinjaman");
eq("nilai baru saat hilang = undefined", hilang[0].baru, undefined);

// Objek bersarang dibandingkan isinya, bukan referensinya.
const nestedLama = { qris: { nama: "A", aktif: false } };
const nestedBaru = { qris: { nama: "A", aktif: true } };
eq("objek bersarang berbeda terdeteksi", bandingkanConfig(nestedLama, nestedBaru).length, 1);
eq(
  "objek bersarang sama tidak terdeteksi",
  bandingkanConfig(nestedLama, { qris: { nama: "A", aktif: false } }).length,
  0,
);

// Label & tampilan nilai.
eq("label kunci dikenal", labelConfig("persenBunga"), "Persentase bunga (%)");
eq("label kunci tak dikenal apa adanya", labelConfig("kunciBaru"), "kunciBaru");
eq("nilai kosong ditampilkan sebagai strip", nilaiConfigTampil(null), "—");
eq("undefined ditampilkan sebagai strip", nilaiConfigTampil(undefined), "—");
eq("boolean true → Aktif", nilaiConfigTampil(true), "Aktif");
eq("boolean false → Nonaktif", nilaiConfigTampil(false), "Nonaktif");
eq("angka → string", nilaiConfigTampil(30), "30");

console.log(`bandingkanConfig tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
