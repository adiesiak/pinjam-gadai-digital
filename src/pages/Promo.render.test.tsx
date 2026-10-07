/**
 * Uji render halaman /promo — galeri poster kampanye.
 * Run: bun src/pages/Promo.render.test.tsx
 *
 * Dirender lewat react-dom/server (tanpa DOM, tanpa browser). Uji ini menjaga
 * dua hal yang mudah rusak saat animasi disentuh:
 *  1. Isi halaman tetap lengkap — header, seluruh pil filter, dan SEMUA poster
 *     aktif masih tergambar (tidak ada yang hilang karena pembungkus animasi).
 *  2. Gerak halaman benar-benar terpasang — setiap kartu galeri dan setiap item
 *     header tercetak dalam keadaan awal tersembunyi (`opacity:0` + geser),
 *     sehingga browser menganimasikannya masuk; kalau animasinya dilepas, uji
 *     ini gagal. Pil filter aktif memakai penanda `layoutId` (satu pil yang
 *     bergeser), bukan latar statis per tombol.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";

import { KATEGORI_POSTER, promoPostersAktif } from "@/lib/promoPosters";

import { Promo } from "./Promo";

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
function jumlah(html: string, teks: string): number {
  return html.split(teks).length - 1;
}
/** Teks untuk dibandingkan dengan markup: React meloloskan & < > ". */
function esc(teks: string): string {
  return teks
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function bersih(html: string, label: string): void {
  ok(!html.includes("undefined"), `${label} tanpa "undefined"`);
  ok(!html.includes("[object Object]"), `${label} tanpa "[object Object]"`);
  ok(!html.includes("NaN"), `${label} tanpa "NaN"`);
}

const poster = promoPostersAktif();
const html = renderToStaticMarkup(
  <MemoryRouter initialEntries={["/promo"]}>
    <Promo />
  </MemoryRouter>,
);

// ===== Header =====
ada(html, "Brand asset center", "label halaman");
ada(html, "Poster Promo", "judul halaman");
ada(html, "Materi kampanye PINDAI untuk berbagai kebutuhan.", "keterangan halaman");
ada(
  html,
  `${poster.length} poster · 1080 × 1350 px`,
  "ringkasan jumlah poster dan ukurannya",
);

// ===== Filter kategori =====
ada(html, 'aria-label="Filter kategori poster"', "navigasi filter bernama");
for (const k of KATEGORI_POSTER) ada(html, `>${k}</span>`, `pil filter "${k}" ada`);
ok(
  jumlah(html, 'aria-pressed="true"') === 1,
  "tepat satu pil filter ditandai aktif",
);
ok(
  jumlah(html, 'aria-pressed="false"') === KATEGORI_POSTER.length - 1,
  "pil filter selebihnya ditandai tidak aktif",
);
ok(
  html.indexOf(">Semua</span>") > html.indexOf('aria-pressed="true"'),
  "pil aktif bawaan adalah Semua",
);
// Latar pil aktif adalah elemen terpisah di dalam tombol (satu pil yang
// bergeser lewat `layoutId`), bukan latar yang menempel di tiap tombol.
// `layoutId` sendiri tidak muncul di markup SSR, jadi yang diperiksa bentuk
// strukturnya: tepat satu elemen pil, dan itu satu-satunya `bg-primary`.
ok(jumlah(html, "-z-10") === 1, "tepat satu elemen pil filter bergeser");
ok(
  jumlah(html, "-z-10 rounded-full bg-primary") === 1,
  "pil bergeser memakai warna primary",
);

// ===== Galeri: semua poster tetap tergambar =====
// `relative` ikut dijaga: tanpa induk berposisi, kartu yang keluar dari
// AnimatePresence popLayout tidak punya acuan posisi yang stabil.
ada(
  html,
  "relative mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3",
  "grid galeri berposisi relatif",
);
ok(
  jumlah(html, "<canvas") === poster.length,
  `setiap poster punya kanvas (${poster.length})`,
);
for (const p of poster) {
  const judul = esc(p.title);
  ada(html, `aria-label="Poster ${judul}"`, `kanvas poster "${p.title}"`);
  ada(html, `>${judul}</h3>`, `judul kartu "${p.title}"`);
  ada(html, `aria-label="Buka pratinjau ${judul}"`, `tombol pratinjau "${p.title}"`);
}
ok(jumlah(html, "Unduh PNG") === poster.length, "setiap kartu punya tombol unduh PNG");
ok(jumlah(html, "Bagikan") === poster.length, "setiap kartu punya tombol bagikan");
// Galeri benar-benar terisi, dan pratinjau (portal) tidak ikut tercetak.
ok(
  !html.includes("Belum ada poster aktif pada kategori ini."),
  "galeri terisi, bukan keadaan kosong",
);
ok(!html.includes("Salin Tautan"), "bilah alat pratinjau tidak tercetak saat tertutup");

// ===== Gerak: keadaan awal tersembunyi benar-benar tercetak =====
// Kartu galeri masuk dengan geser + skala kecil (varian `hidden`).
ok(
  jumlah(html, "opacity:0;transform:translateY(20px) scale(0.985)") === poster.length,
  `setiap kartu galeri tercetak tersembunyi (${poster.length})`,
);
// Header masuk berurutan: dua item berjeda punya keadaan awal masing-masing.
ok(
  jumlah(html, "opacity:0;transform:translateY(12px)") >= 2,
  "item header berurutan masing-masing punya keadaan awal",
);
ada(html, "opacity:0;transform:rotate(-18deg)", "ikon header masuk berputar halus");
// Baris filter masuk setelah header (`delay`), bukan dari keadaan tak bergerak.
ada(
  html,
  "opacity:0;transform:translateY(10px)",
  "baris filter juga punya keadaan awal untuk animasi masuk",
);

bersih(html, "markup halaman promo");

console.log(`Promo.render.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
