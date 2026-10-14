/**
 * Uji render kartu hero PINDAI: Mega Mendung di atas kartu emerald-900.
 * Run: bun src/components/landing/KartuHeroPindai.render.test.tsx
 *
 * Yang dijaga (tanpa browser — render statis):
 *  1. Token desain yang diminta benar-benar ada di MARKUP: ukuran/rasio kartu,
 *     permukaan emerald-900, motif awan Mega Mendung emerald beropasitas
 *     rendah, chip logam kuningan, ikon contactless, dan data contoh tetap.
 *  2. Sisi kanan atas BENAR-BENAR kosong: tidak ada pita holografik/deret ikon
 *     yang dihapus dari desain lama.
 *  3. Kartu menampilkan nomor demo non-pembayaran tetap, wordmark, tanggal,
 *     dan tanda PINDAI CARD. Nilai hitungan tetap tampil sebagai ilustrasi.
 *  4. Dua kartu di satu halaman tidak berbagi `id` pola batik (kalau berbagi,
 *     SVG kedua akan memakai pola pertama) — id datang dari `useId()`, jadi
 *     huruf besar/kecilnya tidak bisa ditebak dan diuji apa adanya.
 */
import { renderToStaticMarkup } from "react-dom/server";

import { PindaiCard3D, TILT_MAKSIMUM_DERAJAT } from "./KartuHeroPindai";

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
  ok(!html.includes(teks), `${label} (tanpa "${teks}")`);
}
function bersih(html: string, label: string): void {
  ok(!html.includes("undefined"), `${label} tanpa "undefined"`);
  ok(!html.includes("[object Object]"), `${label} tanpa "[object Object]"`);
}

// ===== 1. Wadah utama, permukaan emerald, tepi kuningan =====
{
  const html = renderToStaticMarkup(<PindaiCard3D />);
  ada(html, "aspect-[1.586/1]", "rasio ISO ID-1 diterapkan pada semua ukuran");
  ada(
    html,
    "max-w-[340px] lg:max-w-[420px]",
    "lebar kartu dibatasi pada ponsel dan desktop",
  );
  ada(html, "rounded-[4.5%]", "radius kartu mengikuti spesifikasi fisik");
  ada(html, "border-emerald-950/50", "bingkai kartu emerald gelap");
  ada(html, "bg-emerald-900", "permukaan kartu emerald-900");
  ada(html, "ring-[#c9a86a]/35", "bingkai luar kuningan terlihat");
  ada(html, "ring-offset-2", "celah ring ganda dipertahankan");
  ada(html, "#fff8dc", "wordmark gading kontras di atas emerald");
  // Permukaan gelap lama harus benar-benar hilang, bukan sekadar ditimpa.
  tidakAda(html, "bg-slate-950/90", "permukaan obsidian tidak dipakai lagi");
  tidakAda(html, "ring-emerald-500/60", "ring emerald lama tidak tersisa");
  ada(html, 'data-kartu="pindai-hero"', "kartu punya penanda data-kartu");
  ada(
    html,
    'aria-hidden="true"',
    "kartu contoh dekoratif disembunyikan dari pembaca layar",
  );
  bersih(html, "kartu bawaan");
}

// ===== 2. Motif batik Mega Mendung tone-on-tone =====
{
  const html = renderToStaticMarkup(<PindaiCard3D />);
  ada(
    html,
    "mega-mendung-",
    "SVG memakai pola Mega Mendung berulang dengan id unik",
  );
  ada(html, 'opacity="0.2"', "motif Mega Mendung dibatasi ke opasitas rendah");
  ada(html, "#34d399", "motif memakai garis emerald terang");
  ada(
    html,
    'patternUnits="userSpaceOnUse"',
    "motif dipasang sebagai pola berulang",
  );
  ada(
    html,
    'patternUnits="userSpaceOnUse"',
    "motif Mega Mendung memakai pola SVG berulang",
  );
  ada(html, "M88 142c-35-18", "kontur awan Mega Mendung dirender");
  ada(
    html,
    'preserveAspectRatio="none"',
    "motif memenuhi bidang kartu tanpa raster",
  );
  ada(html, "--glare-x", "kilau mengikuti gerak kartu");
  ada(html, "rgba(255,255,255,0.18)", "kilau dibatasi ke opasitas 18 persen");
  bersih(html, "lapisan motif");
}

// ===== 3. Kepala kartu: logo emas, sisi kanan kosong =====
{
  const html = renderToStaticMarkup(<PindaiCard3D />);
  ada(html, "PINDAI", "wordmark teks PINDAI tampil");
  ada(html, "tracking-[0.24em]", "wordmark kapital bertracking lebar");
  tidakAda(html, ">P</span>", "mark P tidak digunakan");
  tidakAda(html, "hologram", "pita holografik lama benar-benar dihapus");
  tidakAda(html, "kartu-3d__", "kartu tidak lagi bergantung pada kelas lama");
  bersih(html, "kepala kartu");
}

// ===== 4. Chip EMV + contactless di kiri tengah =====
{
  const html = renderToStaticMarkup(<PindaiCard3D />);
  ada(html, 'viewBox="0 0 56 42"', "chip SVG berukuran 56 x 42");
  ada(html, "#F6E27A", "chip memakai gradien emas metalik inline");
  ada(html, 'stroke-opacity="0.5"', "jalur kontak memakai stroke halus");
  ada(
    html,
    "M8 9a4 4 0 0 1 0 6",
    "ikon contactless ditampilkan di samping chip",
  );
  bersih(html, "chip");
}

// ===== 5. Rincian hitungan dan disclaimer =====
{
  const html = renderToStaticMarkup(<PindaiCard3D />);
  ada(html, "9001 2345 6789 0123", "nomor demo tetap ditampilkan");
  ada(html, "BUDI SANTOSO", "nama contoh terlihat");
  ada(html, "12/29", "tanggal contoh tampil");
  ada(html, "PINDAI CARD", "tanda kartu tampil");
  ada(html, "Pokok contoh", "label pokok tampil");
  ada(html, "Rp 1.000.000", "pokok contoh dihitung dari quoteLoan");
  ada(html, "Tenor", "label tenor tampil");
  ada(html, "30 hari", "tenor ilustrasi tampil");
  ada(html, "Total kewajiban ilustrasi", "label total kewajiban tampil");
  ada(html, "Rp 1.300.000", "total ilustrasi berasal dari quoteLoan");
  tidakAda(
    html,
    "Kartu contoh · bukan alat bayar",
    "disclaimer berada di hero, bukan pada permukaan kartu dekoratif",
  );
  tidakAda(html, "TERAKREDITASI", "kartu tidak menampilkan klaim akreditasi");
  ok(
    (html.match(/aria-hidden="true"/g) ?? []).length >= 4,
    "lapisan visual dekoratif ditandai aria-hidden",
  );
  bersih(html, "baris data");
}

// ===== 6. Panggung tilt & id pola batik yang unik =====
{
  ok(
    TILT_MAKSIMUM_DERAJAT === 12,
    "kemiringan dibatasi pada intensitas sedang ±12°",
  );
  const html = renderToStaticMarkup(<PindaiCard3D />);
  ada(html, 'data-kartu-panggung="pindai-3d"', "kartu punya panggung tilt");
  ada(html, "[perspective:1000px]", "panggung memakai perspektif");
  ada(
    html,
    "rotateX(var(--tilt-x, 0deg)) rotateY(var(--tilt-y, 0deg))",
    "kemiringan dibaca dari CSS variable (tanpa render ulang)",
  );

  const dua = renderToStaticMarkup(
    <>
      <PindaiCard3D />
      <PindaiCard3D />
    </>,
  );
  const id = [...dua.matchAll(/id="(mega-mendung-[A-Za-z0-9]+)"/g)].map(
    (m) => m[1],
  );
  ok(id.length === 2, "setiap kartu merender satu pola Mega Mendung");
  ok(id[0] !== id[1], "dua kartu memakai id pola batik yang berbeda");
  ada(dua, `url(#${id[0]})`, "rect motif menunjuk pola miliknya sendiri");
  bersih(dua, "dua kartu");
}

console.log(`KartuHeroPindai.render: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
