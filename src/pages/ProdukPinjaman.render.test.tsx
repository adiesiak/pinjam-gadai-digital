/**
 * Uji markup dua halaman produk. Run: bun src/pages/ProdukPinjaman.render.test.tsx
 *
 * Yang dijaga:
 *  - halaman konvensional menampilkan angka contoh yang sama dengan mesin
 *    `lib/bagiHasil` (potongan Rp65.000, pendana Rp1.235.000);
 *  - halaman syariah memakai istilah akad dan tidak memuat kata "bunga" atau
 *    "denda" sama sekali;
 *  - pengajuan syariah diarahkan ke dashboard, bukan disembunyikan;
 *  - nama entitas dan tautan produk ada di kedua halaman;
 *  - tidak ada "undefined", "NaN", atau "[object Object]" di markup.
 */
import { readFileSync } from "node:fs";
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
  ada(html, "Rp 69.333", "contoh potongan platform dari mesin bagi hasil");
  ada(html, "Rp 1.250.667", "contoh hak pendana dari mesin bagi hasil");
  ada(html, "PT Pindai Digital Solusindo", "nama entitas tercetak");
  ada(html, 'href="/pinjaman/syariah"', "tautan ke produk syariah");
  ada(html, 'href="/biaya"', "tautan ke halaman biaya");
  ada(html, "Hitung sebelum mengajukan", "kalkulator konvensional tampil");
  ada(html, "Dana diterima", "hasil kalkulator punya angka dana diterima");
  ada(html, "Pertanyaan sebelum mengajukan", "FAQ kontekstual konvensional tampil");
  ada(html, "support@pindai.biz.id", "email CS ada di footer produk");
  ada(html, "Citra Kebun Mas", "alamat kantor ada di footer produk");
  ada(html, "<table", "tarif harian memakai tabel semantik");
  ada(html, 'scope="col"', "tabel punya header kolom");
  ada(html, 'scope="row"', "tabel punya header baris");
  ada(html, 'aria-live="polite"', "hasil kalkulator diumumkan ke pembaca layar");
  tidakAda(html, "Angka hijau", "catatan promo tidak menyebut warna");
  bersih(html, "halaman konvensional");
}

// ===== 2. Syariah =====
{
  const html = render("syariah");
  ada(html, "Pembiayaan syariah", "judul produk syariah");
  ada(html, "Murabahah", "akad Murabahah disebut");
  ada(html, "Rahn", "akad Rahn disebut");
  ok(!html.includes("Qardh"), "akad Qardh tidak lagi ditawarkan");
  ada(html, "Nisbah bagi hasil", "kalimat nisbah tercetak");
  ada(html, "2%", "ujrah Rahn 2% tercetak");
  ada(html, "Ajukan akad syariah", "tombol pengajuan syariah tampil");
  ada(
    html,
    'href="/dashboard?tab=form&jalur=syariah"',
    "pengajuan syariah langsung membuka formulir syariah",
  );
  ada(
    html,
    "Murabahah dan Rahn dapat diajukan",
    "kedua akad disebut terbuka",
  );
  ada(html, "PT Pindai Digital Solusindo", "nama entitas tercetak");
  ada(html, 'href="/pinjaman/konvensional"', "tautan ke produk konvensional");
  ada(html, "support@pindai.biz.id", "email CS ada di footer syariah");
  ada(html, "Citra Kebun Mas", "alamat kantor ada di footer syariah");
  ada(html, "Rincian Murabahah", "kalkulator syariah tampil");
  ada(
    html,
    'href="#kalkulator-syariah"',
    "hero menautkan langsung ke kalkulator",
  );
  ada(
    html,
    'id="kalkulator-syariah"',
    "kalkulator punya jangkar untuk tautan hero",
  );
  ok(!/bunga|denda/i.test(html), "tidak ada kata bunga atau denda di halaman syariah");
  bersih(html, "halaman syariah");
}

// ===== 3. Tata letak kalkulator syariah =====
// Kalkulator dua akad tidak muat di kolom samping 26rem: di layar 1024-1366
// px kolom hasil menyusut sampai angka rupiah saling menimpa. Karena itu ia
// harus dirender selebar konten, di bawah penjelasan akad.
{
  const sumber = readFileSync("src/pages/ProdukPinjaman.tsx", "utf8");
  ok(
    /<div className="mt-8">\s*<KalkulatorSyariah \/>/.test(sumber),
    "kalkulator syariah dirender selebar konten di bawah kartu akad",
  );
  ok(
    sumber.includes('className="mt-5 grid gap-3 sm:grid-cols-2 md:gap-4"'),
    "kartu akad memakai grid dua kolom, bukan tumpukan penuh",
  );
  ok(
    !/syariah\s*\?\s*\(\s*<KalkulatorSyariah/.test(sumber),
    "kalkulator syariah tidak lagi dipilih di dalam kolom samping",
  );
}

// ===== 3b. Tata letak kalkulator konvensional dan tabel tarif =====
// Kalkulator harus lebih dahulu di ponsel, tidak lengket di viewport pendek,
// dan tabel tarif harus semantik serta tidak memotong tenor.
{
  const sumber = readFileSync("src/pages/ProdukPinjaman.tsx", "utf8");
  ok(
    sumber.includes('className="order-1 lg:order-2"'),
    "kalkulator tampil lebih dahulu di ponsel",
  );
  ok(
    sumber.includes('className="order-2 lg:order-1"'),
    "tabel tarif mengikuti kalkulator di ponsel",
  );
  ok(
    sumber.includes(
      'className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start"',
    ),
    "kolom samping hanya untuk kalkulator konvensional di desktop",
  );
  ok(
    !sumber.includes("lg:sticky"),
    "kalkulator tidak lagi lengket dan terpotong di viewport pendek",
  );
  ok(sumber.includes("<table"), "tarif harian memakai tabel semantik");
  ok(sumber.includes('scope="col"'), "tabel punya header kolom");
  ok(sumber.includes('scope="row"'), "tabel punya header baris");
  ok(
    sumber.includes("min-w-[32rem]"),
    "tabel tarif tidak memaksa empat tenor ke kolom sempit",
  );
  ok(
    sumber.includes("overflow-x-auto"),
    "tabel lebar bisa digeser tanpa memotong halaman",
  );
  ok(
    /<div className="mt-4 grid gap-4">\s*<div>\s*<label\s+htmlFor="produk-nominal"/.test(
      sumber,
    ),
    "kalkulator konvensional menyusun input dan hasil secara vertikal",
  );
  ok(
    !sumber.includes("text-[11px]"),
    "label kecil di halaman produk minimal 12px",
  );
  ok(
    sumber.includes(
      'mulaiHref={isAuthenticated ? "/dashboard?tab=form" : FORM_HREF}',
    ),
    "CTA tamu diarahkan ke formulir lewat auth",
  );
  ok(
    !sumber.includes("Angka hijau") &&
      !sumber.includes("biaya admin 2%") &&
      !sumber.includes("47 : 13") &&
      !sumber.includes("78,33") &&
      !sumber.includes("21,67") &&
      !sumber.includes("—"),
    "tidak ada angka atau istilah promosi yang ditulis ulang di JSX",
  );
}

// ===== 4. Banner bunga promo =====
// Harga promo sudah ditandai di tabel; banner ini menyebut kampanyenya
// secara utuh dan hanya untuk jalur konvensional.
{
  const promos = [
    {
      _id: "promo-uji",
      nama: "Bunga 15 tenor 7",
      persenBunga: 15,
      tenor: [7],
      mulai: Date.UTC(2026, 9, 25) - 7 * 3_600_000,
      selesai: Date.UTC(2026, 9, 31, 23, 59) - 7 * 3_600_000,
      aktif: true,
    },
  ];
  const konvensional = renderToStaticMarkup(
    <MemoryRouter>
      <ProdukPinjamanView produk="konvensional" promos={promos} />
    </MemoryRouter>,
  ).replace(/&amp;/g, "&");
  ada(konvensional, "Bunga promo", "banner promo tampil di halaman publik");
  ada(konvensional, "15%", "bunga promo tercetak di banner");
  ada(konvensional, "tenor 7 hari", "tenor promo tercetak di banner");
  ada(konvensional, "31 Oktober 2026", "tanggal berakhir promo tercetak");
  bersih(konvensional, "banner promo konvensional");

  const syariah = renderToStaticMarkup(
    <MemoryRouter>
      <ProdukPinjamanView produk="syariah" promos={promos} />
    </MemoryRouter>,
  );
  tidakAda(syariah, "Bunga promo", "banner promo tidak masuk halaman syariah");
}

if (gagal > 0) {
  console.error(`\n${gagal} gagal, ${lulus} lulus`);
  process.exit(1);
}
console.log(`produk-pinjaman: ${lulus} lulus`);
