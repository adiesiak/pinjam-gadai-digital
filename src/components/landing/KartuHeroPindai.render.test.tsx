/**
 * Uji render kartu hero PINDAI: Mega Mendung di atas kartu emerald-900.
 * Run: bun src/components/landing/KartuHeroPindai.render.test.tsx
 *
 * Yang dijaga (tanpa browser — render statis):
 *  1. Token desain yang diminta benar-benar ada di MARKUP: ukuran/rasio kartu,
 *     permukaan emerald-900, motif Mega Mendung, chip kuningan, ikon
 *     contactless, wordmark, dan data kartu demo.
 *  2. Sisi kanan atas BENAR-BENAR kosong: tidak ada pita holografik/deret ikon
 *     yang dihapus dari desain lama.
 *  3. Isi kartu menampilkan wordmark, chip, identitas serta nomor demo tetap;
 *     rincian pokok, tenor, dan total di bawah kartu tidak ditampilkan.
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

// ===== 3. Isi kartu demo dikembalikan =====
{
  const html = renderToStaticMarkup(<PindaiCard3D />);
  ada(html, "PINDAI", "wordmark tampil pada kartu");
  ada(html, "PINDAI CARD", "tanda kartu tampil");
  ada(html, "BUDI SANTOSO", "nama contoh ditampilkan");
  ada(html, "9001 2345 6789 0123", "nomor demo tetap ditampilkan");
  ada(html, "12/29", "tanggal contoh tampil");
  tidakAda(html, "hologram", "pita holografik lama benar-benar dihapus");
  tidakAda(html, "kartu-3d__", "kartu tidak lagi bergantung pada kelas lama");
  bersih(html, "permukaan kartu tanpa isi");
}

// ===== 4. Chip EMV kuningan dan contactless dipulihkan =====
{
  const html = renderToStaticMarkup(<PindaiCard3D />);
  ada(html, 'viewBox="0 0 56 42"', "chip kuningan ditampilkan");
  ada(html, "#F6E27A", "chip memakai gradien emas");
  ada(html, "M8 9a4 4 0 0 1 0 6", "ikon contactless ditampilkan");
  bersih(html, "chip");
}

// ===== 5. Rincian pokok, tenor, dan total tidak ditampilkan =====
{
  const html = renderToStaticMarkup(<PindaiCard3D />);
  tidakAda(html, "Pokok contoh", "rincian pokok tetap dihapus");
  tidakAda(html, "Tenor contoh", "rincian tenor tetap dihapus");
  tidakAda(html, "Total kewajiban ilustrasi", "rincian total tetap dihapus");
  tidakAda(html, "Rp 1.000.000", "nominal pokok tidak ditampilkan");
  tidakAda(html, "30 hari", "tenor tidak ditampilkan");
  tidakAda(html, "Rp 1.300.000", "total ilustrasi tidak ditampilkan");
  tidakAda(
    html,
    "Kartu contoh · bukan alat bayar",
    "label di luar kartu tetap dihapus",
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
