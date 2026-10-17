/**
 * Run: bun src/components/BlokLokasiKirim.render.test.tsx
 *
 * Uji blok lokasi di pop-up konfirmasi kirim. Yang dijaga: angka yang tampil
 * adalah titik yang ikut terkirim (lima desimal, akurasi dibulatkan), ada
 * keterangan kapan titik itu diambil, dan tidak ada "undefined"/"NaN" saat
 * akurasi atau koordinat bernilai ekstrem.
 */
import { renderToStaticMarkup } from "react-dom/server";

import { BlokLokasiKirim } from "./BlokLokasiKirim";

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
  ok(!html.includes("[object Object]"), `${label} tanpa "[object Object]"`);
}

// ===== Titik yang dilaporkan nasabah =====
{
  const html = renderToStaticMarkup(
    <BlokLokasiKirim
      lokasi={{
        lat: -6.77175,
        lng: 106.77827,
        akurasi: 153.2,
        waktu: Date.parse("2026-10-17T10:13:00Z"),
      }}
    />,
  );
  ada(html, "Lokasi yang ikut terkirim", "label blok");
  ada(html, "-6.77175, 106.77827", "koordinat lima desimal");
  ada(html, "±153 meter", "akurasi dibulatkan ke meter");
  ada(html, "pukul 17.13 WIB", "cap waktu dalam WIB");
  ada(html, "ikut terkirim", "tujuan titik dijelaskan");
  bersih(html, "titik normal");
}

// ===== Titik lama tanpa cap waktu =====
{
  const html = renderToStaticMarkup(
    <BlokLokasiKirim lokasi={{ lat: -6.2, lng: 106.816666, akurasi: 12.5 }} />,
  );
  ada(html, "-6.20000, 106.81667", "koordinat selalu lima desimal");
  ada(html, "±13 meter", "pembulatan akurasi ke atas dari 12,5");
  ada(html, "Tercatat dari perangkat ini", "tanpa cap waktu tetap jujur");
  ok(!html.includes("pukul"), "tidak mengarang jam saat waktunya tidak ada");
  bersih(html, "titik pecahan");
}

console.log(`\nBlokLokasiKirim.render: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
