/**
 * Uji render chip skor risiko nasabah (dipakai di /penyedia-dana & panel risiko).
 * Run: bun src/components/penyediaDana/ChipSkorRisiko.render.test.tsx
 *
 * Yang dijaga: warna chip benar-benar mengikuti rentang skor — sehat (>70),
 * perlu dipantau (50–69), berisiko (<50) — dan angkanya SELALU ikut tercetak,
 * jadi maknanya tidak pernah bergantung pada warna saja. Batas rentangnya juga
 * diuji tepat di angka ambang (70 dan 50) karena di situlah salah-tetap warna
 * paling mudah terjadi.
 */
import { renderToStaticMarkup } from "react-dom/server";

import { ChipSkorRisiko, kelasSkorRisiko, labelSkorRisiko } from "./ChipSkorRisiko";

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

// ===== 1. Warna per rentang =====
const SEHAT = renderToStaticMarkup(<ChipSkorRisiko skor={86} />);
ada(SEHAT, "bg-emerald-50", "skor > 70 memakai latar emerald");
ada(SEHAT, "text-emerald-700", "skor > 70 memakai teks emerald");
ada(SEHAT, "border-emerald-200", "skor > 70 memakai border emerald");
ada(SEHAT, "86/100", "angkanya tetap tercetak, bukan hanya warna");

const PANTAU = renderToStaticMarkup(<ChipSkorRisiko skor={62} />);
ada(PANTAU, "bg-amber-50", "skor 50–69 memakai latar amber");
ada(PANTAU, "text-amber-700", "skor 50–69 memakai teks amber");
ada(PANTAU, "border-amber-200", "skor 50–69 memakai border amber");
ada(PANTAU, "62/100", "angka skor dipantau tercetak");

const BERISIKO = renderToStaticMarkup(<ChipSkorRisiko skor={31} />);
ada(BERISIKO, "bg-rose-50", "skor < 50 memakai latar rose");
ada(BERISIKO, "text-rose-700", "skor < 50 memakai teks rose");
ada(BERISIKO, "border-rose-200", "skor < 50 memakai border rose");
ada(BERISIKO, "31/100", "angka skor berisiko tercetak");

// ===== 2. Batas rentang tepat di ambang =====
ok(kelasSkorRisiko(71).includes("emerald"), "71 masih sehat (batas bawah sehat)");
ok(!kelasSkorRisiko(70).includes("emerald"), "70 tidak lagi sehat — ambangnya > 70");
ok(kelasSkorRisiko(70).includes("amber"), "70 masuk rentang perlu dipantau");
ok(kelasSkorRisiko(50).includes("amber"), "50 tetap amber — batas bawah rentang dipantau");
ok(!kelasSkorRisiko(49).includes("amber"), "49 keluar dari rentang perlu dipantau");
ok(kelasSkorRisiko(49).includes("rose"), "49 masuk rentang berisiko");

// ===== 3. Angka dibulatkan untuk tampilan, tanpa sisa desimal =====
const PECAHAN = renderToStaticMarkup(<ChipSkorRisiko skor={84.6} />);
ada(PECAHAN, "85/100", "skor pecahan dibulatkan ke bilangan bulat terdekat");
ok(!PECAHAN.includes("84.6"), "angka pecahan tidak bocor ke layar");
ok(!PECAHAN.includes("84,6"), "angka pecahan berkoma juga tidak bocor");
ada(PECAHAN, "bg-emerald-50", "pembulatan tidak mengubah rentang warna (84.6 → sehat)");

// ===== 4. Kalimat penjelas per rentang =====
ok(labelSkorRisiko(86).includes("sehat"), "penjelasan skor tinggi menyebut sehat");
ok(labelSkorRisiko(62).includes("dipantau"), "penjelasan skor tengah menyebut dipantau");
ok(labelSkorRisiko(31).includes("berisiko"), "penjelasan skor rendah menyebut berisiko");
ada(SEHAT, "title=", "penjelasan terpasang sebagai atribut title pada chip");

bersih(SEHAT, "markup chip sehat");
bersih(PANTAU, "markup chip dipantau");
bersih(BERISIKO, "markup chip berisiko");
bersih(PECAHAN, "markup chip pecahan");

console.log(`ChipSkorRisiko.render.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
