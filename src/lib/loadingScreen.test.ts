/**
 * Menjaga janji "layar pemuatan hanya SATU versi".
 *
 * `index.html` memuat splash statis (`#pindai-boot`) supaya animasi tampil pada
 * paint pertama sebelum bundel JS/CSS siap, lalu komponen React
 * `components/LoadingScreen.tsx` mengambil alih. Keduanya harus memakai kelas,
 * bentuk brankas, dan nilai animasi yang sama — kalau tidak, pengunjung melihat
 * dua desain berbeda dalam satu pemuatan.
 *
 * Tes ini membandingkan kedua sumber itu langsung dari berkas, jadi drift
 * terdeteksi sebelum sampai ke pengguna.
 *
 * Run: bun src/lib/loadingScreen.test.ts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LoadingScreen } from "../components/LoadingScreen";

/** Jalur berkas relatif terhadap akar proyek (berkas ini ada di src/lib). */
const baca = (relative: string) =>
  readFileSync(fileURLToPath(new URL(`../../${relative}`, import.meta.url)), "utf8");

const halaman = baca("index.html");
const css = baca("src/index.css");
const utama = baca("src/main.tsx");
const komponen = baca("src/components/LoadingScreen.tsx");

let passed = 0;
let failed = 0;

function cek(ok: boolean, label: string) {
  if (ok) {
    passed += 1;
    return;
  }
  failed += 1;
  console.error(`FAIL ${label}`);
}

/** Kelas `pb__*` yang dipakai sebuah berkas. */
function kelasPb(sumber: string): Set<string> {
  return new Set(
    [...sumber.matchAll(/class(?:Name)?=["']([^"']+)["']/g)]
      .flatMap((m) => m[1].split(/\s+/))
      .filter((c) => c.startsWith("pb__")),
  );
}

/** Atribut yang menentukan bentuk brankas (nama sudah dinormalkan). */
const ATRIBUT_BENTUK = new Set([
  "x",
  "y",
  "cx",
  "cy",
  "r",
  "width",
  "height",
  "viewbox",
  "rx",
  "d",
  "fill",
  "opacity",
  "stroke",
  "strokewidth",
  "strokeopacity",
  "strokelinecap",
]);

/**
 * Atribut geometris SVG — yang menentukan bentuk brankas.
 *
 * Nama atribut dibaca utuh lalu dinormalkan (huruf kecil, tanda hubung dibuang)
 * supaya JSX (`strokeWidth`) dan HTML (`stroke-width`) bisa dibandingkan apel
 * ke apel. Versi lama memakai satu regex pada teks mentah, sehingga "width=" di
 * dalam "stroke-width=" ikut terbaca dan akhiran "y=" pada "strokeOpacity="
 * terbaca sebagai atribut `y` — dua berkas yang bentuknya sama pun akan selalu
 * dianggap berbeda, jadi pemeriksaan ini tidak pernah mengukur bentuk brankas.
 */
function geometriSvg(sumber: string): string {
  const svg = sumber.match(/<svg[\s\S]*?<\/svg>/)?.[0] ?? "";
  return [...svg.matchAll(/\s([A-Za-z][A-Za-z-]*)="([^"]*)"/g)]
    .map(([, nama, nilai]) => [nama.toLowerCase().replace(/-/g, ""), nilai] as const)
    .filter(([nama]) => ATRIBUT_BENTUK.has(nama))
    .map(([nama, nilai]) => `${nama}=${nilai}`)
    .join(" ");
}

const html = renderToStaticMarkup(
  createElement(LoadingScreen, { label: "Memeriksa akses admin…" }),
);

const kelasReact = kelasPb(html);
// Splash statis memakai id `#pindai-boot`, bukan kelas `pb__boot`.
const kelasStatis = kelasPb(halaman);
const hanyaReact = [...kelasReact].filter((c) => !kelasStatis.has(c));
const hanyaStatis = [...kelasStatis].filter((c) => !kelasReact.has(c));

cek(kelasReact.size >= 14, "komponen memakai kelas pb__ yang diharapkan");
cek(
  hanyaReact.length === 1 && hanyaReact[0] === "pb__boot",
  `kelas komponen selaras dengan index.html (selisih: ${hanyaReact.join(", ") || "tidak ada"})`,
);
cek(hanyaStatis.length === 0, `splash statis tidak memakai kelas asing: ${hanyaStatis.join(", ")}`);

for (const kelas of kelasReact) {
  cek(css.includes(`.${kelas}`), `gaya .${kelas} ada di index.css`);
  if (kelas !== "pb__boot") {
    cek(halaman.includes(`.${kelas}`), `gaya .${kelas} ada di index.html`);
  }
}
cek(halaman.includes("#pindai-boot {"), "pasangan #pindai-boot untuk .pb__boot ada di index.html");

cek(geometriSvg(html) === geometriSvg(halaman), "bentuk brankas identik di komponen dan index.html");
cek(geometriSvg(html).length > 200, "brankas benar-benar digambar (bukan svg kosong)");
cek(!html.includes("<pre") && !komponen.includes("BRANKAS"), "tidak ada sisa ilustrasi ASCII");

// Nilai visual yang mudah dipisahkan tanpa sadar.
for (const [nilai, label] of [
  ["letter-spacing: 0.34em", "letter-spacing judul"],
  ["font-size: 1.125rem", "ukuran judul PINDAI"],
  ["width: 33%", "lebar bilah proses"],
  ["pb-dial 5s", "durasi putaran jarum"],
  ["pb-bar 1.5s", "durasi bilah proses"],
] as const) {
  cek(css.includes(nilai) && halaman.includes(nilai), `${label} sama di index.css & index.html`);
}

/**
 * Seluruh blok `@media (prefers-reduced-motion: reduce)` pada sebuah berkas.
 *
 * Sengaja TIDAK memakai `lastIndexOf` seperti versi lama: irisan dari blok
 * terakhir membuat pemeriksaan ini gagal begitu ada blok reduced-motion baru
 * ditambahkan di bawahnya (mis. tema karnival), walau aturan yang diperiksa
 * sebenarnya masih ada. Kurung kurawal dipasangkan berurutan agar isi blok
 * yang dibaca benar, bukan sekadar sekian karakter setelah penanda.
 */
function blokReduksi(sumber: string): string {
  const penanda = "@media (prefers-reduced-motion: reduce)";
  const bagian: string[] = [];
  let dari = 0;
  for (;;) {
    const mulai = sumber.indexOf(penanda, dari);
    if (mulai === -1) break;
    const buka = sumber.indexOf("{", mulai + penanda.length);
    if (buka === -1) break;
    let dalam = 1;
    let akhir = buka + 1;
    for (; akhir < sumber.length && dalam > 0; akhir += 1) {
      if (sumber[akhir] === "{") dalam += 1;
      else if (sumber[akhir] === "}") dalam -= 1;
    }
    bagian.push(sumber.slice(mulai, akhir));
    dari = akhir;
  }
  return bagian.join("\n");
}

const reduksiCss = blokReduksi(css);
const reduksiHtml = blokReduksi(halaman);
for (const kelas of ["pb__dial", "pb__halo", "pb__scan", "pb__bar"]) {
  cek(reduksiCss.includes(kelas), `reduced-motion ${kelas} ada di index.css`);
  cek(reduksiHtml.includes(kelas), `reduced-motion ${kelas} ada di index.html`);
}

cek(/role="status"/.test(html) && /aria-live="polite"/.test(html), "label status live ada di komponen");
cek(html.includes("Memeriksa akses admin…"), "label yang diminta benar-benar tampil");

// Gaya lama tidak boleh tertinggal, dan stylesheet global tetap terpasang.
cek(!komponen.includes("pindai-loader"), "komponen bersih dari gaya pindai-loader lama");
cek(!css.includes("pindai-loader"), "index.css bersih dari gaya pindai-loader lama");
cek(!halaman.includes("pindai-loader"), "index.html bersih dari gaya pindai-loader lama");
cek(utama.includes('import "./index.css"'), "main.tsx tetap mengimpor index.css");

console.log(`loadingScreen.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
