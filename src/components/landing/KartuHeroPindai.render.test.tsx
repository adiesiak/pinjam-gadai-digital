/**
 * Uji render kartu hero PINDAI ("Warm Paper & Brass Batik Parang").
 * Run: bun src/components/landing/KartuHeroPindai.render.test.tsx
 *
 * Yang dijaga (tanpa browser — render statis):
 *  1. Token desain yang diminta benar-benar ada di MARKUP: ukuran/rasio kartu,
 *     permukaan CERAH (kertas + kaca, bukan obsidian) dengan garis ganda
 *     kuningan, dua cucian sudut, motif batik parang (kuningan #c9a86a +
 *     petrol #1f6a62, `opacity-15 mix-blend-multiply`), chip logam kuningan +
 *     ikon contactless, dan baris data (nomor monospace, status, masa berlaku,
 *     nama pemegang) yang tetap di atas ambang kontras WCAG AA di kertas terang.
 *  2. Sisi kanan atas BENAR-BENAR kosong: tidak ada pita holografik/deret ikon
 *     yang dihapus dari desain lama.
 *  3. Kartu jujur: baris data contoh ditandai `aria-hidden`, dan catatan
 *     "Kartu contoh · bukan alat bayar" tampil kecuali diminta disembunyikan.
 *  4. Data masuk lewat prop: nomor apa pun dinormalkan ke 4-4-4-4, dan nama
 *     hanya tampil bila nasabah terverifikasi (selain itu "CARDHOLDER").
 *  5. Dua kartu di satu halaman tidak berbagi `id` pola batik (kalau berbagi,
 *     SVG kedua akan memakai pola pertama) — id datang dari `useId()`, jadi
 *     huruf besar/kecilnya tidak bisa ditebak dan diuji apa adanya.
 */
import { renderToStaticMarkup } from "react-dom/server";

import { KartuHeroPindai } from "./KartuHeroPindai";

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

// ===== 1. Wadah utama, permukaan cerah, garis ganda =====
{
  const html = renderToStaticMarkup(<KartuHeroPindai />);
  ada(
    html,
    "aspect-[1.586/1] w-full max-w-md rounded-2xl relative p-6 overflow-hidden transition-all duration-500 hover:scale-[1.02]",
    "kelas ukuran & bentuk kartu persis seperti permintaan",
  );
  // Tanpa lantai tinggi, kartu selebar ponsel akan lebih pendek daripada isinya
  // dan baris bawah (nama + catatan) terpotong `overflow-hidden`.
  ada(
    html,
    "min-h-[15.5rem]",
    "kartu punya tinggi minimum supaya isi tidak terpotong di lebar kecil",
  );
  ada(
    html,
    "bg-[linear-gradient(135deg,rgba(255,255,255,0.94)_0%,rgba(253,250,241,0.9)_52%,rgba(241,237,227,0.92)_100%)] backdrop-blur-2xl border border-[#c9a86a]/55 shadow-[0_20px_45px_-26px_rgba(28,26,21,0.45)]",
    "permukaan cerah: kertas hangat berkaca + tepi kuningan",
  );
  ada(
    html,
    "ring-1 ring-[#c9a86a]/35 ring-offset-2 ring-offset-white/60",
    "garis ganda kuningan (ring + offset) persis seperti permintaan",
  );
  // Permukaan gelap lama harus benar-benar hilang, bukan sekadar ditimpa.
  tidakAda(html, "bg-slate-950/90", "permukaan obsidian tidak dipakai lagi");
  tidakAda(html, "ring-emerald-500/60", "ring emerald lama tidak tersisa");
  ada(html, 'data-kartu="kertas-batik"', "kartu punya penanda data-kartu");
  ada(html, 'role="group"', "kartu dikelompokkan untuk pembaca layar");
  ada(
    html,
    'aria-label="Kartu contoh PINDAI"',
    "label kartu contoh tanpa data nasabah",
  );
  ada(
    html,
    "bg-[radial-gradient(circle,rgba(201,168,106,0.5),transparent_70%)]",
    "cucian kuningan di sudut kiri atas",
  );
  ada(
    html,
    "bg-[radial-gradient(circle,rgba(31,106,98,0.28),transparent_72%)]",
    "cucian petrol di sudut kanan bawah",
  );
  bersih(html, "kartu bawaan");
}

// ===== 2. Motif batik parang + cucian warna emas/emerald =====
{
  const html = renderToStaticMarkup(<KartuHeroPindai />);
  ada(
    html,
    "opacity-15 mix-blend-multiply",
    "lapisan motif dipasang tipis & menyerap ke kertas",
  );
  ada(html, "#c9a86a", "motif memakai kuningan");
  ada(html, "#1f6a62", "motif memakai rona petrol");
  ada(html, 'patternTransform="rotate(-45)"', "motif parang miring diagonal");
  ada(
    html,
    'patternUnits="userSpaceOnUse"',
    "motif dipasang sebagai pola berulang",
  );
  ada(
    html,
    "radial-gradient(120%_90%_at_15%_-10%,rgba(201,168,106,0.2),transparent_55%)",
    "cucian kuningan di kiri atas",
  );
  ada(
    html,
    "radial-gradient(90%_80%_at_100%_110%,rgba(31,106,98,0.1),transparent_60%)",
    "cucian petrol tipis di kanan bawah",
  );
  ada(html, "var(--kilau-x", "kilau mengikuti posisi pointer (light reflect)");
  ada(html, "var(--kilau-opasitas, 0)", "kilau redup sebelum pointer masuk");
  bersih(html, "lapisan motif");
}

// ===== 3. Kepala kartu: logo emas, sisi kanan kosong =====
{
  const html = renderToStaticMarkup(<KartuHeroPindai />);
  ada(
    html,
    "text-emerald-700 font-bold tracking-wider flex items-center gap-2",
    "kelas wordmark kuningan gelap persis seperti permintaan",
  );
  ada(html, "PINDAI", "teks merek tampil");
  ada(
    html,
    "from-amber-100 via-amber-400 to-amber-700",
    "kotak logo bergradasi logam",
  );
  tidakAda(html, "hologram", "pita holografik lama benar-benar dihapus");
  tidakAda(html, "kartu-3d__", "kartu tidak lagi bergantung pada kelas lama");
  bersih(html, "kepala kartu");
}

// ===== 4. Chip EMV + contactless di kiri tengah =====
{
  const html = renderToStaticMarkup(<KartuHeroPindai />);
  ada(
    html,
    "bg-gradient-to-br from-amber-200 via-amber-400 to-amber-600 rounded-md w-12 h-9 shadow-inner border border-emerald-800/30",
    "kelas chip logam kuningan persis seperti permintaan",
  );
  // Pita chip memusatkan dirinya dengan `my-auto` (sisa tinggi dibagi sama besar
  // di atas dan di bawahnya), dan blok nomor TIDAK boleh ikut memakai `mt-auto`:
  // dua penyerap sisa ruang sekaligus membagi jarak jadi tiga bagian sehingga
  // chip melenceng naik dari kiri tengah (DESIGN.md §3A).
  ada(
    html,
    'class="relative my-auto flex items-center gap-3"',
    "chip duduk di kiri tengah (pita memusatkan diri lewat sisa tinggi)",
  );
  tidakAda(
    html,
    'class="relative mt-auto"',
    "blok nomor tidak lagi menyerap sisa ruang (penyerap kedua menggeser chip)",
  );
  ada(html, "lucide-wifi", "ikon contactless/NFC dirender di samping chip");
  ada(html, "rotate-90", "ikon contactless diputar membuka ke kanan");
  ok(
    (html.match(/bg-emerald-900\/35/g) ?? []).length === 3,
    "chip punya tiga garis kontak",
  );
  bersih(html, "chip");
}

// ===== 5. Baris data: nomor, status, masa berlaku, nama =====
{
  const html = renderToStaticMarkup(<KartuHeroPindai />);
  ada(
    html,
    "font-mono text-emerald-800 tracking-widest text-lg",
    "kelas nomor kartu persis seperti permintaan",
  );
  ada(html, "1234 5678 9012 3456", "nomor contoh 16 digit tampil berkelompok");
  ada(html, "TERAKREDITASI &amp; AMAN", "status/akreditasi tampil");
  ada(html, "text-emerald-700", "status memakai kuningan gelap");
  // Di kertas terang, token teks lama yang redup (amber/emerald terang, slate-400)
  // akan jatuh di bawah 4.5:1 — jadi tidak boleh tersisa di kartu ini.
  tidakAda(html, "text-amber-300", "tanpa teks kuningan terang di kertas");
  tidakAda(html, "text-amber-200", "tanpa teks kuningan pucat di kertas");
  tidakAda(html, "text-slate-400", "tanpa label abu pucat di kertas");
  ada(html, "Valid thru", "label masa berlaku tampil");
  ada(
    html,
    "text-emerald-800",
    "kelas masa berlaku persis seperti permintaan",
  );
  ada(html, "12/29", "masa berlaku contoh tampil");
  ada(html, "Cardholder", "label pemegang kartu tampil");
  ada(
    html,
    "text-slate-900 font-semibold tracking-wider",
    "kelas nama pemegang persis seperti permintaan",
  );
  ada(html, "CARDHOLDER", "tanpa data terverifikasi → CARDHOLDER");
  ada(html, "Kartu contoh · bukan alat bayar", "catatan contoh tampil");
  ok(
    (html.match(/aria-hidden="true"/g) ?? []).length >= 6,
    "lapisan dekoratif & baris data contoh ditandai aria-hidden",
  );
  bersih(html, "baris data");
}

// ===== 6. Data dari prop: format nomor, nama terverifikasi, fallback =====
{
  const terverifikasi = renderToStaticMarkup(
    <KartuHeroPindai
      nama="Budi Setiawan"
      terverifikasi
      nomorKartu="1234-5678-9012-3456"
    />,
  );
  ada(
    terverifikasi,
    "BUDI SETIAWAN",
    "nama nasabah terverifikasi tampil huruf besar",
  );
  ada(
    terverifikasi,
    "1234 5678 9012 3456",
    "nomor dengan tanda pisah tetap dinormalkan",
  );
  ada(
    terverifikasi,
    'aria-label="Kartu contoh PINDAI untuk BUDI SETIAWAN"',
    "label kartu menyebut nama pemegang",
  );
  tidakAda(
    terverifikasi,
    "CARDHOLDER",
    "nama terverifikasi menggantikan CARDHOLDER",
  );

  const belumVerifikasi = renderToStaticMarkup(
    <KartuHeroPindai nama="Budi Setiawan" />,
  );
  ada(
    belumVerifikasi,
    "CARDHOLDER",
    "nama tanpa verifikasi tidak pernah ditampilkan",
  );
  tidakAda(
    belumVerifikasi,
    "BUDI SETIAWAN",
    "nama belum terverifikasi tidak bocor ke kartu",
  );

  const disesuaikan = renderToStaticMarkup(
    <KartuHeroPindai
      nama="Siti Aminah"
      terverifikasi
      nomorKartu="081234567890"
      masaBerlaku="1/2"
      statusTeks="PENGGUNA TERVERIFIKASI"
      catatan=""
    />,
  );
  ada(disesuaikan, "SITI AMINAH", "nama nasabah lain dirender");
  ada(disesuaikan, "0812 3456 7890", "nomor pendek tetap dikelompokkan 4-4");
  ada(
    disesuaikan,
    "12/29",
    "masa berlaku tidak sah jatuh ke contoh, bukan teks mentah",
  );
  tidakAda(disesuaikan, "1/2", "masa berlaku tidak sah tidak ditampilkan");
  ada(disesuaikan, "PENGGUNA TERVERIFIKASI", "status bisa diganti dari prop");
  tidakAda(
    disesuaikan,
    "Kartu contoh · bukan alat bayar",
    "catatan kosong menyembunyikan baris catatan",
  );
  bersih(disesuaikan, "kartu dengan data prop");
}

// ===== 7. Panggung tilt & id pola batik yang unik =====
{
  const html = renderToStaticMarkup(<KartuHeroPindai />);
  ada(
    html,
    'data-kartu-panggung="kertas-batik"',
    "kartu punya panggung tilt",
  );
  ada(html, "[perspective:1000px]", "panggung memakai perspektif");
  ada(
    html,
    "rotateX(var(--tilt-x, 0deg)) rotateY(var(--tilt-y, 0deg))",
    "kemiringan dibaca dari CSS variable (tanpa render ulang)",
  );

  const dua = renderToStaticMarkup(
    <>
      <KartuHeroPindai />
      <KartuHeroPindai />
    </>,
  );
  const id = [...dua.matchAll(/id="(parang-[A-Za-z0-9]+)"/g)].map((m) => m[1]);
  ok(id.length === 2, "setiap kartu merender satu pola batik");
  ok(id[0] !== id[1], "dua kartu memakai id pola batik yang berbeda");
  ada(dua, `url(#${id[0]})`, "rect motif menunjuk pola miliknya sendiri");
  bersih(dua, "dua kartu");
}

console.log(`KartuHeroPindai.render: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
