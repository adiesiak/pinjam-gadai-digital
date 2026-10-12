/**
 * Uji render kartu hero PINDAI ("Black Obsidian Glass & Luxury Batik Parang").
 * Run: bun src/components/landing/KartuHeroPindai.render.test.tsx
 *
 * Yang dijaga (tanpa browser — render statis):
 *  1. Token desain yang diminta benar-benar ada di MARKUP: ukuran/rasio kartu,
 *     permukaan obsidian + pendaran emerald ganda (ring + glow), dua pendaran
 *     sudut, motif batik parang (emas #D4AF37 + emerald, `opacity-15
 *     mix-blend-overlay`), chip logam emas + ikon contactless, dan baris data
 *     emas (nomor monospace, status emerald, masa berlaku, nama pemegang).
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

// ===== 1. Wadah utama, permukaan obsidian, pendaran ganda =====
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
    "bg-slate-950/90 backdrop-blur-2xl border border-emerald-500/40 shadow-[0_0_50px_-12px_rgba(16,185,129,0.3)]",
    "permukaan obsidian + glow emerald persis seperti permintaan",
  );
  ada(
    html,
    "ring-2 ring-emerald-500/60 ring-offset-2 ring-offset-slate-950",
    "garis ganda emerald (ring + offset) persis seperti permintaan",
  );
  ada(html, 'data-kartu="obsidian-batik"', "kartu punya penanda data-kartu");
  ada(html, 'role="group"', "kartu dikelompokkan untuk pembaca layar");
  ada(
    html,
    'aria-label="Kartu contoh PINDAI"',
    "label kartu contoh tanpa data nasabah",
  );
  ok(
    (html.match(/bg-\[radial-gradient\(circle,rgba\(16,185,129/g) ?? [])
      .length === 2,
    "dua pendaran emerald di sudut kartu",
  );
  bersih(html, "kartu bawaan");
}

// ===== 2. Motif batik parang + cucian warna emas/emerald =====
{
  const html = renderToStaticMarkup(<KartuHeroPindai />);
  ada(
    html,
    "opacity-15 mix-blend-overlay",
    "lapisan motif dipasang tipis & menyatu",
  );
  ada(html, "#D4AF37", "motif memakai emas tua redup");
  ada(html, "#10B981", "motif memakai rona emerald");
  ada(html, 'patternTransform="rotate(-45)"', "motif parang miring diagonal");
  ada(
    html,
    'patternUnits="userSpaceOnUse"',
    "motif dipasang sebagai pola berulang",
  );
  ada(
    html,
    "radial-gradient(120%_90%_at_15%_-10%,rgba(212,175,55,0.16),transparent_55%)",
    "cucian emas tua di kiri atas",
  );
  ada(
    html,
    "radial-gradient(90%_80%_at_100%_110%,rgba(16,185,129,0.14),transparent_60%)",
    "cucian emerald pudar di kanan bawah",
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
    "text-amber-300 font-bold tracking-wider flex items-center gap-2",
    "kelas logo emas persis seperti permintaan",
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
    "bg-gradient-to-br from-amber-200 via-amber-400 to-amber-600 rounded-md w-12 h-9 shadow-inner border border-amber-200/50",
    "kelas chip logam emas persis seperti permintaan",
  );
  ada(html, "lucide-wifi", "ikon contactless/NFC dirender di samping chip");
  ada(html, "rotate-90", "ikon contactless diputar membuka ke kanan");
  ok(
    (html.match(/bg-amber-900\/35/g) ?? []).length === 3,
    "chip punya tiga garis kontak",
  );
  bersih(html, "chip");
}

// ===== 5. Baris data: nomor, status, masa berlaku, nama =====
{
  const html = renderToStaticMarkup(<KartuHeroPindai />);
  ada(
    html,
    "font-mono text-amber-200/90 tracking-widest text-lg drop-shadow-sm",
    "kelas nomor kartu persis seperti permintaan",
  );
  ada(html, "1234 5678 9012 3456", "nomor contoh 16 digit tampil berkelompok");
  ada(html, "TERAKREDITASI &amp; AMAN", "status/akreditasi tampil");
  ada(html, "text-emerald-300", "status memakai emerald light");
  ada(html, "Valid thru", "label masa berlaku tampil");
  ada(
    html,
    "text-amber-200/80",
    "kelas masa berlaku persis seperti permintaan",
  );
  ada(html, "12/29", "masa berlaku contoh tampil");
  ada(html, "Cardholder", "label pemegang kartu tampil");
  ada(
    html,
    "text-amber-300 font-semibold tracking-wider",
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
    'data-kartu-panggung="obsidian-batik"',
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
