/**
 * Uji render panel "Aturan perhitungan" di ruang pendana.
 * Run: bun src/components/penyediaDana/AturanPerhitungan.render.test.tsx
 *
 * Yang dijaga:
 * 1. skema pendana dinyatakan TETAP: tenor 30 hari, Imbal Hasil 30% flat, dan
 *    angkanya tidak mengikuti tenor/bunga/perpanjangan nasabah;
 * 2. rincian tenor nasabah (7/14/28) tidak lagi muncul di panel pendana;
 * 3. istilah, dasar biaya platform, dan penyangkalan risiko tetap terbaca;
 * 4. klaim yang tidak bisa dibuktikan tidak kembali.
 */
import { renderToStaticMarkup } from "react-dom/server";

import { AturanPerhitungan } from "./AturanPerhitungan";

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
  ok(!html.includes(teks), `${label} (tidak memuat "${teks}")`);
}
function bersih(html: string, label: string): void {
  ok(!html.includes("undefined"), `${label} tanpa "undefined"`);
  ok(!html.includes("[object Object]"), `${label} tanpa "[object Object]"`);
  ok(!html.includes("NaN"), `${label} tanpa "NaN"`);
}

const SEMUA = [1, 2, 3, 4, 5, 6, 7];
const html = renderToStaticMarkup(<AturanPerhitungan bukaAwal={SEMUA} />);

// ===== Judul + ringkasan skema tetap =====
ada(html, "Aturan perhitungan", "judul panel");
ada(
  html,
  "siklus 30 hari · porsi pendana 78,33% · porsi platform 21,67%",
  "porsi margin disebut di kepala panel",
);
tidakAda(html, "potongan admin", "istilah lama tidak tertinggal");
tidakAda(html, "keuntungan admin", "istilah keuntungan admin tidak dipakai");
ada(html, "Buka aturan yang ingin Anda periksa", "cara memakai panel dijelaskan");
ok(
  (html.match(/data-slot="accordion-item"/g) ?? []).length === 7,
  "tujuh aturan, tidak lebih",
);

// ===== Tiap aturan terisi =====
for (const judul of [
  "Porsi pendana 78,33% dari marjin",
  "Porsi platform (21,67%)",
  "Dibukukan (lunas) vs Perkiraan (belum lunas)",
  "Dana tersalurkan dan masih berjalan",
  "Tenor pendana 30 hari",
  "Transfer keuntungan",
  "Cara membaca kolom dan baris total",
]) {
  ada(html, judul, `judul aturan "${judul}"`);
}

// 1. Skema tetap: contoh 1 juta → 300 ribu → 1,3 juta.
ada(html, "30% flat", "imbal hasil dinyatakan flat 30%");
ada(html, "Rp 1.000.000", "contoh pokok disebut");
ada(html, "Rp 300.000", "contoh Imbal Hasil 30% disebut");
ada(html, "Rp 1.300.000", "contoh total pengembalian disebut");
ada(html, "tidak berubah", "sifat tetap dinyatakan");
ada(html, "memperpanjang tenor", "perpanjangan disebut tidak mengubah hak");
ada(html, "mencicil pokok", "cicil pokok disebut tidak mengubah hak");
ada(html, "satu pinjaman = satu pendana", "model alokasi disebut");

// Tidak ada lagi rincian tenor/bunga nasabah di panel pendana.
for (const teks of [
  "7 hari 30%",
  "14 hari 35%",
  "28 hari 40%",
  "Di bawah Rp500.000",
  "Rp500.000 sampai Rp999.999",
  "7, 14, atau 28 hari",
]) {
  tidakAda(html, teks, `rincian tenor nasabah "${teks}" tidak tampil`);
}

// 2. Biaya platform.
ada(html, "21,67%</strong> dari", "porsi platform disebut");
ada(html, "marjin pinjaman", "dasar porsi platform: marjin pinjaman");
ada(html, "pokok kembali utuh", "konsekuensi biaya pada pokok dijelaskan");
ada(html, "bukan jaminan", "biaya platform tidak diklaim sebagai jaminan");
ada(html, "tidak dijamin oleh LPS", "status penjaminan dinyatakan apa adanya");
ada(html, "Risiko pendanaan", "pembaca diarahkan ke bagian risikonya");

// 3. Istilah inti halaman.
ada(html, "Dibukukan (lunas)", "istilah dibukukan memakai label tabel");
ada(html, "Perkiraan (belum lunas)", "istilah perkiraan memakai label tabel");
ada(html, "sudah final dan menjadi haknya", "arti dibukukan dijelaskan");
ada(html, "belum menjadi uang pendana", "arti perkiraan dijelaskan");

// 4. Modal vs pokok yang belum kembali.
ada(html, "Dana tersalurkan", "dana tersalurkan dijelaskan");
ada(html, "Masih berjalan", "masih berjalan dijelaskan");
ada(html, "catatan penyaluran, bukan laba", "dana tersalurkan dibedakan dari laba");

// 5. Tenor pendana 30 hari, bukan tenor pinjaman nasabah.
ada(html, "30 hari", "tenor acuan pendana disebut");
ada(html, "bukan tenor pinjaman nasabah", "tenor pendana dipisahkan dari tenor nasabah");
ada(html, "tidak mengubah nominal maupun status hak pendana", "keterpisahan dinyatakan");

// 6. Transfer keuntungan.
ada(html, "bukan bukti mutasi bank", "catatan transfer dibedakan dari bukti mutasi");

// 7. Cara membaca tabel.
ada(html, "baris total menjumlahkan baris yang sedang tampil", "baris total dijelaskan");
ada(html, "bukan klaim total sepanjang masa", "batas cakupan angka dinyatakan");

bersih(html, "markup panel aturan");

// ===== Klaim terlarang =====
tidakAda(html, "14 hari kerja", "tidak ada janji cair dalam 14 hari kerja");
ok(!html.toLowerCase().includes("asuransi"), "tidak ada klaim asuransi");
tidakAda(html, "jaminan pokok", "tidak ada klaim jaminan pokok");
tidakAda(html, "pasti untung", "tidak ada klaim keuntungan pasti");
{
  const kalimat = html.split(/[.!?]/).filter((s) => s.includes("jaminan"));
  ok(kalimat.length > 0, "kata jaminan masih dipakai untuk menyangkal");
  ok(
    kalimat.every((s) => s.includes("bukan jaminan") || s.includes("tidak dijamin")),
    'kata "jaminan" hanya muncul dalam bentuk penyangkalan',
  );
}

// ===== Tertutup secara bawaan =====
{
  const tertutup = renderToStaticMarkup(<AturanPerhitungan />);
  ada(tertutup, "Aturan perhitungan", "judul terlihat saat tertutup");
  ada(
    tertutup,
    "siklus 30 hari · porsi pendana 78,33% · porsi platform 21,67%",
    "ringkasan skema terbaca tanpa membuka panel",
  );
  ada(tertutup, 'aria-expanded="false"', "tombol menyatakan keadaan tertutup");
  ada(tertutup, ">Buka<", "satu tindakan untuk membukanya");
  ok(!tertutup.includes("bukan jaminan"), "isi aturan tidak mendorong halaman ke bawah");
}

// ===== Porsi margin tetap, tanpa pengaturan biaya lama =====
{
  const lain = renderToStaticMarkup(<AturanPerhitungan bukaAwal={SEMUA} />);
  ada(lain, "21,67%</strong> dari", "porsi platform tetap 21,67%");
  ada(
    lain,
    "siklus 30 hari · porsi pendana 78,33% · porsi platform 21,67%",
    "porsi tetap sama di setiap render",
  );
  tidakAda(lain, "pengaturan biaya lama", "tidak ada rujukan ke tarif lama");
  bersih(lain, "markup panel aturan");
}

console.log(`AturanPerhitungan.render.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
