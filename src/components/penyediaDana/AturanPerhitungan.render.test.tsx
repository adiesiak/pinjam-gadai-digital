/**
 * Uji render panel "Aturan perhitungan" di /penyedia-dana.
 * Run: bun src/components/penyediaDana/AturanPerhitungan.render.test.tsx
 *
 * Halaman utuhnya membaca Convex, jadi panelnya dirender langsung di sini.
 *
 * Yang dijaga:
 * 1. aturan yang menentukan arti angka benar-benar ada dan bisa dibuka —
 *    termasuk bedanya "Dibukukan (lunas)" dengan "Perkiraan (belum lunas)",
 *    dasar potongan admin, dan satuan tenor;
 * 2. persentase yang tercetak datang dari Pengaturan Sistem, bukan angka tetap
 *    yang ditulis di kode;
 * 3. klaim yang tidak bisa dibuktikan tidak kembali: tidak ada janji asuransi
 *    yang menjamin pokok/Imbal Hasil cair dalam 14 hari kerja (itu bertentangan
 *    dengan bagian "Risiko pendanaan"), dan kata "jaminan" hanya dipakai dalam
 *    bentuk penyangkalan.
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
function eq(actual: unknown, expected: unknown, label: string): void {
  if (actual === expected) passed += 1;
  else {
    failed += 1;
    console.error(
      `FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
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

/** Semua aturan dibuka, karena isi accordion yang tertutup tidak ada di DOM. */
const SEMUA = [1, 2, 3, 4, 5, 6, 7];
const html = renderToStaticMarkup(
  <AturanPerhitungan persenBunga={30} persenPotonganAdmin={5} bukaAwal={SEMUA} />,
);

// ===== Judul + ringkasan tarif yang berlaku =====
ada(html, "Aturan perhitungan", "judul panel");
ada(html, "bunga 30% · potongan admin 5%", "tarif yang berlaku disebut di kepala panel");
ada(html, "Buka aturan yang ingin Anda periksa", "cara memakai panel dijelaskan");
eq(
  (html.match(/data-slot="accordion-item"/g) ?? []).length,
  7,
  "tujuh aturan, tidak lebih",
);

// ===== Tiap aturan benar-benar terisi =====
for (const judul of [
  "Bunga pinjaman dan Imbal Hasil",
  "Potongan admin",
  "Dibukukan (lunas) vs Perkiraan (belum lunas)",
  "Dana tersalurkan dan masih berjalan",
  "Tenor dan jatuh tempo (satuan hari)",
  "Transfer keuntungan",
  "Cara membaca kolom dan baris total",
]) {
  ada(html, judul, `judul aturan "${judul}"`);
}

// 1. Bunga: contoh angkanya dihitung dengan jalur uang yang benar.
ada(html, "30%</strong> dari pokok", "bunga dinyatakan persen dari pokok, bukan per bulan");
ada(html, "Rp 1.000.000", "contoh pokok disebut");
ada(html, "Rp 1.300.000", "contoh total kewajiban dihitung dari persen yang berlaku");
ada(html, "Rp 300.000", "contoh Imbal Hasil dihitung dari persen yang berlaku");
ada(html, "satu pinjaman = satu pendana", "model alokasi disebut");

// 2. Potongan admin: dasar hitungnya, keperluannya, dan penyangkalannya.
ada(html, "5%</strong> dari", "potongan admin disebut persennya");
ada(html, "uang yang kembali", "dasar potongan admin: uang yang kembali");
ada(html, "bukan", "dasar potongan admin dibedakan dari Imbal Hasil saja");
ada(html, "pokok kembali utuh", "konsekuensi potongan pada pokok dijelaskan");
ada(html, "Server &amp; operasional PINDAI", "keperluan server & operasional");
ada(html, "Collect / penagihan lapangan", "collect / penagihan lapangan");
ada(html, "Penanganan pinjaman bermasalah", "keperluan penanganan pinjaman bermasalah");
ada(html, "bukan jaminan", "potongan admin tidak diklaim sebagai jaminan");
ada(html, "tidak dijamin oleh LPS", "status penjaminan dinyatakan apa adanya");
ada(html, "Risiko pendanaan", "pembaca diarahkan ke bagian risikonya");

// 3. Dua istilah inti halaman, lengkap dengan artinya.
ada(html, "Dibukukan (lunas)", "istilah dibukukan memakai label yang sama dengan tabel");
ada(html, "Perkiraan (belum lunas)", "istilah perkiraan memakai label yang sama dengan tabel");
ada(html, "sudah final dan menjadi haknya", "arti dibukukan dijelaskan");
ada(html, "belum menjadi uang pendana", "arti perkiraan dijelaskan");
ada(html, "Total keuntungan", "istilah total keuntungan dijelaskan");

// 4. Modal vs pokok yang belum kembali.
ada(html, "Dana tersalurkan", "dana tersalurkan dijelaskan");
ada(html, "Masih berjalan", "masih berjalan dijelaskan");
ada(html, "catatan penyaluran, bukan laba", "dana tersalurkan dibedakan dari laba");

// 5. Satuan tenor.
ada(html, "satuan hari", "satuan tenor dinyatakan: hari");
ada(html, "seluruh halaman ini", "satuan itu disebut berlaku di seluruh halaman");
ada(html, "30 hari", "bawaan tenor untuk catatan lama disebut");
ada(html, "tidak disamarkan sebagai tenor yang disepakati", "bawaan tenor ditandai apa adanya");

// 6. Transfer keuntungan.
ada(html, "Transfer keuntungan", "transfer keuntungan dijelaskan");
ada(html, "bukan bukti mutasi bank", "catatan transfer dibedakan dari bukti mutasi");

// 7. Cara membaca tabel.
ada(html, "baris total menjumlahkan kolomnya", "baris total dijelaskan");
ada(html, "bukan klaim total sepanjang masa", "batas cakupan angka dinyatakan");

bersih(html, "markup panel aturan");

// ===== Klaim yang dilarang tidak boleh kembali =====
ok(!html.includes("14 hari kerja"), "tidak ada lagi janji cair dalam 14 hari kerja");
ok(!html.toLowerCase().includes("asuransi"), "tidak ada klaim asuransi yang menjamin pendana");
ok(!html.includes("jaminan pokok"), "tidak ada klaim jaminan atas pokok pinjaman");
ok(!html.includes("pasti untung"), "tidak ada klaim keuntungan pasti");

// Setiap kemunculan kata "jaminan" harus bagian dari penyangkalan.
{
  const kalimat = html.split(/[.!?]/).filter((s) => s.includes("jaminan"));
  ok(kalimat.length > 0, "kata jaminan masih dipakai untuk menyangkal");
  ok(
    kalimat.every((s) => s.includes("bukan jaminan") || s.includes("tidak dijamin")),
    "kata \"jaminan\" hanya muncul dalam bentuk penyangkalan",
  );
}

// ===== Tertutup secara bawaan =====
{
  const tertutup = renderToStaticMarkup(
    <AturanPerhitungan persenBunga={30} persenPotonganAdmin={5} />,
  );
  ada(tertutup, "Aturan perhitungan", "judul tetap terlihat saat aturannya tertutup");
  ok(!tertutup.includes("bukan jaminan"), "isi aturan tidak mendorong isi halaman ke bawah");
  bersih(tertutup, "markup panel aturan yang tertutup");
}

// ===== Persentase mengikuti Pengaturan Sistem =====
{
  const lain = renderToStaticMarkup(
    <AturanPerhitungan persenBunga={12} persenPotonganAdmin={7} bukaAwal={SEMUA} />,
  );
  ada(lain, "bunga 12% · potongan admin 7%", "tarif lain ikut tercetak");
  ada(lain, "Rp 1.120.000", "contoh total kewajiban ikut berubah");
  ada(lain, "Rp 120.000", "contoh Imbal Hasil ikut berubah");
  ada(lain, "7%</strong> dari", "potongan admin ikut berubah");
  ok(!lain.includes("Rp 1.300.000"), "angka dari tarif lama tidak tertinggal");
  ok(!lain.includes("bunga 30%"), "persentase lama tidak tertinggal");
  bersih(lain, "markup panel dengan tarif lain");
}

console.log(`AturanPerhitungan.render.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
