/**
 * Uji render kartu "Aliran uang pinjaman ini" di detail pinjaman admin.
 * Run: bun src/components/admin/AliranDanaPinjaman.render.test.tsx
 *
 * Dirender lewat react-dom/server (tanpa browser): memastikan angka rupiah
 * yang dilihat admin pada PINJAMAN NYATA benar-benar muncul di markup — harian,
 * bulanan, dan data warisan — serta keterangan yang jujur antara proyeksi dan
 * angka yang sudah dibukukan ledger.
 */
import { renderToStaticMarkup } from "react-dom/server";

import { AliranDanaPinjaman } from "./AliranDanaPinjaman";

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

const LABEL = [
  "Pokok pinjaman",
  "Potongan di muka",
  "Dana bersih diterima peminjam",
  "Total pelunasan",
  "Diterima pendana",
  "Imbal Hasil bersih pendana",
  "Pendapatan platform",
];

// ===== Pinjaman harian nyata: pokok Rp1.000.000 @30% =====
const harian = renderToStaticMarkup(
  <AliranDanaPinjaman pokokPinjaman={1_000_000} tenorHari={30} persenBunga={30} />,
);
ada(harian, "Aliran uang pinjaman ini", "judul kartu");
ada(harian, "Rp 1.000.000", "pokok nyata yang sedang dibuka");
ada(harian, "harian 30 hari", "skema pinjaman disebut");
ada(harian, "dipotong admin 2% + biaya ekspres di muka", "potongan admin + ekspres disebut");
ada(harian, "5% dari uang yang kembali", "dasar potongan 5% disebut");
for (const teks of LABEL) ada(harian, teks, `label "${teks}"`);
ada(harian, "Sisi peminjam", "grup sisi peminjam tampil");
ada(harian, "Pelunasan", "grup pelunasan & pendana tampil");
ada(harian, "bg-emerald-700", "dana bersih memakai kartu emerald pejal");
ada(harian, "text-2xl font-bold", "nominal utama memakai tipografi besar");
ada(harian, "Pokok + Imbal Hasil 30%", "dasar total pelunasan harian");
ada(harian, "Rp 970.000", "diterima peminjam");
ada(harian, "Rp 1.300.000", "uang yang kembali");
ada(harian, "− Rp 65.000", "potongan 5% dari uang yang kembali");
ada(harian, "Rp 1.235.000", "diterima pendana");
ada(harian, "Rp 235.000", "Imbal Hasil bersih pendana");
ada(
  harian,
  "Proyeksi kebijakan yang berlaku; yang dicatat internal adalah angka saat pelunasan.",
  "pinjaman belum lunas ditandai proyeksi",
);
ada(harian, "aria-label=\"Aliran uang pinjaman ini\"", "kartu punya nama untuk pembaca layar");
bersih(harian, "markup pinjaman harian");

// ===== Pinjaman harian pokok menengah (nominal yang bisa diajukan) =====
const menengah = renderToStaticMarkup(
  <AliranDanaPinjaman pokokPinjaman={500_000} tenorHari={14} persenBunga={30} />,
);
ada(menengah, "Rp 500.000", "pokok menengah");
ada(menengah, "− Rp 17.500", "potongan admin + ekspres dari Rp500.000");
ada(menengah, "Rp 482.500", "diterima peminjam");
ada(menengah, "Rp 650.000", "uang yang kembali");
ada(menengah, "− Rp 32.500", "potongan 5% = Rp32.500");
ada(menengah, "Rp 617.500", "diterima pendana");
ada(menengah, "Rp 117.500", "Imbal Hasil bersih pendana");
ada(menengah, "Rp 50.000", "pendapatan platform satu pinjaman");
bersih(menengah, "markup pinjaman pokok menengah");

// ===== Pinjaman bulanan: Imbal Hasil = bunga SELAMA TENOR =====
// Pokok Rp2.000.000, 3 bulan @10%/bulan: potongan di muka Rp40.000, cicilan
// total Rp2.651.999 (termasuk biaya admin cicilan), potongan platform 5% dari
// pokok + Imbal Hasil tenor (Rp2.600.000) = Rp130.000, pendana Rp2.470.000.
const bulanan = renderToStaticMarkup(
  <AliranDanaPinjaman pokokPinjaman={2_000_000} tenorBulan={3} persenBunga={10} />,
);
ada(bulanan, "bulanan 3 bulan", "skema bulanan disebut");
ada(bulanan, "Pokok + Imbal Hasil 3 bulan @10%", "baris kembali menyebut tenor & tarif");
ada(bulanan, "Rp 2.651.999", "total kas yang dibayar peminjam");
ada(bulanan, "− Rp 130.000", "potongan platform dari pokok + Imbal Hasil tenor");
ada(bulanan, "Rp 2.470.000", "diterima pendana");
ada(bulanan, "Rp 470.000", "Imbal Hasil bersih pendana (600.000 − 130.000)");
ada(bulanan, "Rp 170.000", "pendapatan platform (40.000 + 130.000)");
bersih(bulanan, "markup pinjaman bulanan");

// ===== Pinjaman yang sudah lunas: angka ini yang dibukukan =====
const lunas = renderToStaticMarkup(
  <AliranDanaPinjaman pokokPinjaman={1_000_000} tenorHari={30} persenBunga={30} sudahLunas />,
);
ada(
  lunas,
  "Pinjaman sudah lunas: angka ini yang dicatat internal saat pelunasan.",
  "pinjaman lunas ditandai sudah dibukukan",
);
ok(
  !lunas.includes("Proyeksi kebijakan"),
  "pinjaman lunas tidak lagi disebut proyeksi",
);
bersih(lunas, "markup pinjaman lunas");

// ===== Data warisan: pokok tidak sah tidak merobohkan detail pinjaman =====
const warisan = renderToStaticMarkup(<AliranDanaPinjaman pokokPinjaman={0} />);
ada(warisan, "Rp 0", "pokok warisan ditampilkan apa adanya");
bersih(warisan, "markup data warisan");

console.log(`AliranDanaPinjaman.render.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
