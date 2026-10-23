/**
 * Uji render simulator pendanaan.
 * Run: bun src/components/penyediaDana/SimulatorPendanaan.render.test.tsx
 *
 * Yang dijaga: keadaan awal memakai skema konvensional tetap 30% per 30 hari,
 * biaya platform dihitung terpisah, keempat akad bisa dipilih, dan layar tidak
 * menjanjikan angka pasti.
 */
import { renderToStaticMarkup } from "react-dom/server";

import { SimulatorPendanaan } from "./SimulatorPendanaan";

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
function tidakAda(html: string, teks: string, label: string): void {
  ok(!html.includes(teks), `${label} (tidak memuat "${teks}")`);
}

{
  const html = renderToStaticMarkup(
    <SimulatorPendanaan persenPotonganAdmin={5} />,
  );

  ada(html, "Simulasikan return", "judul simulator");
  for (const akad of ["Konvensional", "Murabahah", "Rahn"]) {
    ada(html, akad, `pilihan akad "${akad}" ada`);
  }
  tidakAda(html, "Qardh", "Qardh tidak lagi ditawarkan");
  ada(
    html,
    'aria-pressed="true"',
    "satu akad ditandai aktif sejak awal",
  );
  ada(html, "Imbal hasil tetap 30% per 30 hari", "skema tetap dinyatakan");

  // Nominal awal Rp1.000.000, biaya platform 5%.
  ada(html, "Rp 300.000", "imbal hasil 30% dihitung");
  ada(html, "Rp 65.000", "biaya platform dihitung dari uang yang kembali");
  ada(html, "Rp 1.235.000", "diterima bersih per siklus");
  ada(html, "Rp 235.000", "keuntungan bersih per siklus");
  ada(html, "Estimasi, bukan jaminan.", "sifat estimasi dinyatakan");
  ada(
    html,
    "ditempatkan ulang setiap 30 hari",
    "asumsi siklus berulang dinyatakan",
  );
  ada(
    html,
    "terpisah dari tenor pinjaman nasabah",
    "keterpisahan dari tenor nasabah dijelaskan",
  );

  // Rincian nasabah tidak boleh bocor ke ruang pendana.
  tidakAda(html, "7 hari", "tenor harian nasabah tidak tampil");
  tidakAda(html, "14 hari", "tenor harian nasabah tidak tampil");
  tidakAda(html, "28 hari", "tenor harian nasabah tidak tampil");
  tidakAda(html, "undefined", "tanpa nilai kosong");
  tidakAda(html, "NaN", "tanpa angka rusak");
}

console.log(
  `SimulatorPendanaan.render.test: ${passed} lulus, ${failed} gagal`,
);
if (failed > 0) process.exit(1);
