/**
 * Uji render bagian MURNI panel riwayat konfigurasi.
 * Run: bun src/components/admin/RiwayatConfigPanel.render.test.tsx
 *
 * Panel yang tersambung Convex tidak bisa dirender di luar aplikasi, jadi
 * `DaftarPerubahan` — bagian yang justru paling penting bagi admin ("dari nilai
 * berapa ke berapa") — diuji langsung. Yang dijaga:
 *  - tiap perubahan memakai LABEL manusia, bukan nama field mentah;
 *  - nilai lama → baru selalu terlihat, termasuk boolean yang jadi kata;
 *  - versi tanpa perubahan menyatakan itu secara eksplisit (bukan tabel kosong);
 *  - tidak ada "undefined"/"NaN"/"[object Object]".
 */
import { renderToStaticMarkup } from "react-dom/server";

import { DaftarPerubahan } from "./RiwayatConfigPanel";

let passed = 0;
let failed = 0;
function ok(syarat: boolean, label: string): void {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}
function ada(html: string, teks: string, label: string): void {
  ok(html.includes(teks), `${label} (memuat "${teks}")`);
}
function bersih(html: string, label: string): void {
  ok(!html.includes("undefined"), `${label} tanpa "undefined"`);
  ok(!html.includes("[object Object]"), `${label} tanpa "[object Object]"`);
  ok(!html.includes("NaN"), `${label} tanpa "NaN"`);
}

// ===== 1. Perubahan angka & boolean =====
{
  const html = renderToStaticMarkup(
    <DaftarPerubahan
      perubahan={[
        { kunci: "persenBunga", lama: 30, baru: 25 },
        { kunci: "killSwitch", lama: false, baru: true },
      ]}
    />,
  );
  ada(html, "Persentase bunga (%)", "kunci memakai label manusia");
  ada(html, "30", "nilai lama angka tampil");
  ada(html, "25", "nilai baru angka tampil");
  ada(html, "Kill switch", "label kill switch tampil");
  ada(html, "Nonaktif", "boolean lama jadi kata");
  ada(html, "Aktif", "boolean baru jadi kata");
  ok(!html.includes("persenBunga"), "nama field mentah tidak bocor ke UI");
  bersih(html, "daftar perubahan");
}

// ===== 2. Kunci tak dikenal tetap tampil apa adanya (bukan kosong) =====
{
  const html = renderToStaticMarkup(
    <DaftarPerubahan perubahan={[{ kunci: "kunciBaru", lama: "a", baru: "b" }]} />,
  );
  ada(html, "kunciBaru", "kunci tak dikenal tetap tampil");
  ada(html, "a", "nilai lama kunci tak dikenal tampil");
  bersih(html, "perubahan kunci tak dikenal");
}

// ===== 3. Nilai kosong =====
{
  const html = renderToStaticMarkup(
    <DaftarPerubahan perubahan={[{ kunci: "qrisImageId", lama: null, baru: "abc" }]} />,
  );
  ada(html, "—", "nilai kosong ditampilkan sebagai strip");
  bersih(html, "perubahan nilai kosong");
}

// ===== 4. Tanpa perubahan =====
{
  const html = renderToStaticMarkup(<DaftarPerubahan perubahan={[]} />);
  ada(html, "Tidak ada nilai yang berubah", "versi tanpa perubahan dinyatakan jelas");
  bersih(html, "versi tanpa perubahan");
}

if (failed > 0) {
  console.error(`\n${failed} gagal, ${passed} lulus`);
  throw new Error(`${failed} tes render riwayat konfigurasi gagal`);
}
console.log(`RiwayatConfigPanel: ${passed} lulus`);
