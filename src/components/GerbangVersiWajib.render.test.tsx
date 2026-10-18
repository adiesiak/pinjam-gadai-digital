/**
 * Run: bun src/components/GerbangVersiWajib.render.test.tsx
 *
 * Uji render layar "wajib perbarui". Yang dijaga:
 *  - layar ini menjelaskan MENGAPA halaman berhenti dan versi apa yang
 *    diwajibkan, bukan sekadar menampilkan pesan kosong;
 *  - APK tanpa penanda versi (kode 0) tidak disebut "kode 0";
 *  - tanpa tautan APK, tombol unduh nonaktif dan ajakan menyalin tautan tidak
 *    muncul — lebih baik jujur daripada tombol yang tidak melakukan apa-apa.
 *
 * Komponen gerbangnya sendiri tidak diuji di sini karena memerlukan klien
 * Convex; aturan kapan ia tampil ada di `lib/pembaruanAplikasi` dan diuji di
 * `lib/pembaruanAplikasi.test.ts`.
 */
import { renderToStaticMarkup } from "react-dom/server";

import { LayarWajibPerbarui } from "./GerbangVersiWajib";

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
  ok(!html.includes("NaN"), `${label} tanpa "NaN"`);
}

// ===== 1. APK dengan kode versi =====
{
  const html = renderToStaticMarkup(
    <LayarWajibPerbarui
      terpasang={3}
      versiNama="2.0.0"
      tautan="https://pindai.example/pindai.apk"
    />,
  );
  ada(html, 'role="dialog"', "layar memakai dialog modal");
  ada(html, 'aria-modal="true"', "modal dinyatakan ke pembaca layar");
  ada(html, "PINDAI perlu diperbarui", "judul menjelaskan tindakan");
  ada(html, "Versi 2.0.0 diwajibkan", "versi wajib disebut");
  ada(html, "masih kode 3", "versi terpasang disebut");
  ada(html, "Unduh pembaruan", "tombol unduh tersedia");
  ada(html, "instal dari sumber ini", "langkah pemasangan dijelaskan");
  ada(html, "https://pindai.example/pindai.apk", "alamat unduhan bisa disalin");
  ada(html, "Salin", "tombol salin tautan tersedia");
  ada(html, "Sudah dipasang", "jalan keluar setelah memasang dijelaskan");
  bersih(html, "layar dengan tautan");
}

// ===== 2. APK tanpa penanda angka =====
{
  const html = renderToStaticMarkup(
    <LayarWajibPerbarui terpasang={0} versiNama={null} tautan={null} />,
  );
  ada(html, "tidak dikenali versinya", "kode 0 tidak ditampilkan sebagai angka");
  ok(!html.includes("kode 0"), "tidak menulis \"kode 0\"");
  ada(html, "Versi terbaru diwajibkan", "tanpa nama versi tetap terbaca");
  bersih(html, "layar tanpa nama versi");
}

// ===== 3. Tautan belum tersedia =====
{
  const html = renderToStaticMarkup(
    <LayarWajibPerbarui terpasang={3} versiNama="2.0.0" tautan={null} />,
  );
  ada(html, "Unduh pembaruan", "tombol unduh tetap tampil");
  ada(html, "disabled", "tombol unduh nonaktif tanpa tautan");
  ok(!html.includes("Salin"), "ajakan menyalin tidak muncul tanpa tautan");
  bersih(html, "layar tanpa tautan");
}

console.log(`\nGerbangVersiWajib.render: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
