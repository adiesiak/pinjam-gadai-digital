/**
 * Uji markup dua halaman produk. Run: bun src/pages/ProdukPinjaman.render.test.tsx
 *
 * Yang dijaga:
 *  - halaman konvensional menampilkan angka contoh yang sama dengan mesin
 *    `lib/bagiHasil` (potongan Rp65.000, pendana Rp1.235.000);
 *  - halaman syariah memakai istilah akad dan tidak memuat kata "bunga" atau
 *    "denda" sama sekali;
 *  - pengajuan syariah dinyatakan belum dibuka, tidak berpura-pura aktif;
 *  - nama entitas dan tautan produk ada di kedua halaman;
 *  - tidak ada "undefined", "NaN", atau "[object Object]" di markup.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";

import { ProdukPinjamanView } from "./ProdukPinjaman";

let lulus = 0;
let gagal = 0;
function ok(syarat: boolean, label: string): void {
  if (syarat) lulus += 1;
  else {
    gagal += 1;
    console.error(`FAIL ${label}`);
  }
}
function ada(html: string, teks: string, label: string): void {
  ok(html.includes(teks), `${label} (memuat "${teks}")`);
}
function tidakAda(html: string, teks: string, label: string): void {
  ok(!html.includes(teks), `${label} (tidak memuat "${teks}")`);
}
function bersih(html: string, label: string): void {
  tidakAda(html, "undefined", `${label} tanpa undefined`);
  tidakAda(html, "NaN", `${label} tanpa NaN`);
  tidakAda(html, "[object Object]", `${label} tanpa objek mentah`);
}

function render(produk: "konvensional" | "syariah"): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <ProdukPinjamanView produk={produk} />
    </MemoryRouter>,
  ).replace(/&amp;/g, "&");
}

// ===== 1. Konvensional =====
{
  const html = render("konvensional");
  ada(html, "Pembiayaan konvensional", "judul produk konvensional");
  ada(html, "Tarif harian per tier", "tabel tarif harian tampil");
  ada(html, "Tarif cicilan bulanan", "tabel tarif bulanan tampil");
  ada(html, "Cicilan bulanan", "skema bulanan disebut");
  ada(html, "Rp 65.000", "contoh potongan platform dari mesin bagi hasil");
  ada(html, "Rp 1.235.000", "contoh hak pendana dari mesin bagi hasil");
  ada(html, "PT Pindai Digital Solusindo", "nama entitas tercetak");
  ada(html, 'href="/pinjaman/syariah"', "tautan ke produk syariah");
  ada(html, 'href="/biaya"', "tautan ke halaman biaya");
  ada(html, "Hitung sebelum mengajukan", "kalkulator konvensional tampil");
  ada(html, "Dana diterima", "hasil kalkulator punya angka dana diterima");
  bersih(html, "halaman konvensional");
}

// ===== 2. Syariah =====
{
  const html = render("syariah");
  ada(html, "Pembiayaan syariah", "judul produk syariah");
  ada(html, "Murabahah", "akad Murabahah disebut");
  ada(html, "Rahn", "akad Rahn disebut");
  ada(html, "Qardh", "akad Qardh disebut");
  ada(html, "85%", "nisbah pendana 85% tercetak");
  ada(html, "15%", "ujrah pengelola 15% tercetak");
  ada(html, "2%", "ujrah Rahn 2% tercetak");
  ada(
    html,
    "Pengajuan akad syariah belum dibuka",
    "status produk syariah jujur",
  );
  ada(html, "PT Pindai Digital Solusindo", "nama entitas tercetak");
  ada(html, 'href="/pinjaman/konvensional"', "tautan ke produk konvensional");
  ada(html, "Rincian Murabahah", "kalkulator syariah tampil");
  ok(!/bunga|denda/i.test(html), "tidak ada kata bunga atau denda di halaman syariah");
  bersih(html, "halaman syariah");
}

if (gagal > 0) {
  console.error(`\n${gagal} gagal, ${lulus} lulus`);
  process.exit(1);
}
console.log(`produk-pinjaman: ${lulus} lulus`);
