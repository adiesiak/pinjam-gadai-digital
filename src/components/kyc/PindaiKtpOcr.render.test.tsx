/**
 * Uji render panel OCR KTP (murni render, tanpa menjalankan tesseract).
 * Run: bun src/components/kyc/PindaiKtpOcr.render.test.tsx
 *
 * Yang dijaga: petunjuk bahwa pemindaian berjalan lokal, peringatan tetap bahwa
 * OCR bukan bukti keaslian dan tidak auto-VERIFIED, tombol nonaktif saat belum
 * ada berkas, dan tidak ada "undefined"/"NaN" di markup.
 */
import { renderToStaticMarkup } from "react-dom/server";

import { PindaiKtpOcr } from "./PindaiKtpOcr";
import { CATATAN_OCR } from "@/lib/kycOcr";

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

const form = { namaLengkap: "", nik: "", alamat: "" };
const tanpaBerkas = renderToStaticMarkup(
  <PindaiKtpOcr file={null} form={form} onTerapkan={() => {}} />,
);

ada(tanpaBerkas, "Bantu isi dari foto KTP", "judul panel tampil");
ada(tanpaBerkas, "Pindai teks KTP", "tombol pindai tampil");
ada(tanpaBerkas, "fotonya tidak dikirim ke mana pun", "menegaskan pemindaian lokal");
ok(!tanpaBerkas.includes("OCR"), "istilah teknis OCR tidak dipakai di muka nasabah");
ada(tanpaBerkas, "tidak membuktikan keaslian", "menegaskan OCR bukan bukti keaslian");
ok(tanpaBerkas.includes(CATATAN_OCR.slice(0, 20)), "catatan OCR tetap tampil");
// Tanpa berkas: tombol harus nonaktif (jangan biarkan mengklik tanpa gambar).
ok(tanpaBerkas.includes("disabled"), "tombol nonaktif saat belum ada berkas");
bersih(tanpaBerkas, "panel tanpa berkas");

const berkas = new File([new Uint8Array(8)], "ktp.png", { type: "image/png" });
const denganBerkas = renderToStaticMarkup(
  <PindaiKtpOcr file={berkas} form={form} onTerapkan={() => {}} />,
);
ada(denganBerkas, "Pindai teks KTP", "panel dengan berkas tetap menampilkan tombol");
bersih(denganBerkas, "panel dengan berkas");

console.log(`PindaiKtpOcr.render.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
