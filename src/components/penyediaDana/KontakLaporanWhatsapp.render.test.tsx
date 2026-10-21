/**
 * Uji render kartu "Laporan ke WhatsApp" di ruang pendana.
 * Run: bun src/components/penyediaDana/KontakLaporanWhatsapp.render.test.tsx
 *
 * Yang dijaga:
 *  - nomor hanya milik akun pembaca: sebelum tersimpan, kartu menyatakan bahwa
 *    TIDAK ADA laporan yang dikirim ke mana pun, dan tombol kirim terkunci;
 *  - sesudah tersimpan, nomornya tampil apa adanya dan tombol kirim hidup —
 *    pendana tidak perlu menebak apakah nomornya benar-benar tersimpan;
 *  - saat pengiriman berjalan, tombolnya terkunci dan katanya berubah, supaya
 *    satu laporan tidak terkirim dua kali karena klik berulang;
 *  - kegagalan server tampil apa adanya sebagai alert, bukan disamarkan;
 *  - copy-nya bebas tanda pisah panjang (aturan copy UI proyek ini).
 */
import { renderToStaticMarkup } from "react-dom/server";

import { KontakLaporanWhatsapp } from "./KontakLaporanWhatsapp";

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
function bersih(html: string, label: string): void {
  ok(!html.includes("undefined"), `${label} tanpa "undefined"`);
  ok(!html.includes("[object Object]"), `${label} tanpa "[object Object]"`);
  ok(!html.includes("NaN"), `${label} tanpa "NaN"`);
}
/** Markup tanpa komentar pemisah React (`<!-- -->`) yang memecah teks bersambung. */
function tanpaKomentar(html: string): string {
  return html.replace(/<!-- -->/g, "");
}
/**
 * Apakah tombol berlabel ini sedang terkunci.
 *
 * Diperiksa dari TAG PEMBUKANYA saja, bukan dari seluruh potongan tombol: kelas
 * Tailwind tombol memuat varian `disabled:...`, sehingga pencarian kata
 * "disabled" di seluruh markup akan selalu menemukannya dan uji ini tidak akan
 * pernah bisa gagal.
 */
function terkunci(html: string, label: string): boolean {
  const akhir = html.indexOf(label);
  if (akhir === -1) return false;
  const mulai = html.lastIndexOf("<button", akhir);
  if (mulai === -1) return false;
  const tag = html.slice(mulai, html.indexOf(">", mulai));
  return /(^|\s)disabled(=|"|\s|$)/.test(tag);
}

const dasar = {
  menyimpan: false,
  mengirim: false,
  mengunduh: false,
  bolehUnduh: true,
  galat: null,
  onSimpan: () => {},
  onKirim: () => {},
  onUnduh: () => {},
};

// ===== Belum ada nomor tersimpan =====
const belum = tanpaKomentar(
  renderToStaticMarkup(<KontakLaporanWhatsapp {...dasar} nomor={null} />),
);
ada(belum, "Laporan pendanaan", "judul kartu tampil");
ada(belum, "Nomor WhatsApp untuk laporan", "kolom nomor punya label");
ada(belum, "Belum ada nomor tersimpan", "keadaan tanpa nomor dinyatakan");
ada(belum, "tidak ada laporan yang dikirim ke mana pun", "akibat tanpa nomor dinyatakan jujur");
ok(terkunci(belum, "Kirim laporan ke WhatsApp"), "tombol kirim terkunci sebelum nomornya ada");
ok(terkunci(belum, "Simpan nomor"), "tombol simpan terkunci selama isian masih kosong");
ada(belum, "Isi nomor lebih dulu", "tombol kirim menjelaskan cara mengaktifkannya");
ada(belum, "Unduh PDF", "unduhan manual tersedia tanpa nomor WhatsApp");
ok(!terkunci(belum, "Unduh PDF"), "tombol unduh hidup tanpa nomor");
bersih(belum, "markup tanpa nomor");

// ===== Nomor sudah tersimpan =====
const adaNomor = tanpaKomentar(
  renderToStaticMarkup(<KontakLaporanWhatsapp {...dasar} nomor="628123456789" />),
);
ada(adaNomor, "628123456789", "nomor tersimpan tampil sebagai angka yang dikenali pendana");
ada(adaNomor, "Tersimpan di akun Anda", "tempat penyimpanan nomor dinyatakan");
ada(adaNomor, "hanya saat Anda memintanya", "laporan tidak dikirim tanpa permintaan");
ok(!terkunci(adaNomor, "Kirim laporan ke WhatsApp"), "tombol kirim hidup setelah nomornya tersimpan");
ada(
  adaNomor,
  "seluruh pinjaman atas nama Anda",
  "isi laporan dijelaskan sebelum dikirim",
);
bersih(adaNomor, "markup dengan nomor");

// ===== Sedang menyimpan dan sedang mengirim =====
const menyimpan = tanpaKomentar(
  renderToStaticMarkup(<KontakLaporanWhatsapp {...dasar} nomor={null} menyimpan />),
);
ada(menyimpan, "Menyimpan", "keadaan menyimpan tampil di tombol");
ok(terkunci(menyimpan, "Menyimpan"), "tombol simpan terkunci selama penyimpanan berjalan");

const mengirim = tanpaKomentar(
  renderToStaticMarkup(<KontakLaporanWhatsapp {...dasar} nomor="628123456789" mengirim />),
);
ada(mengirim, "Mengirim laporan", "keadaan mengirim tampil di tombol");
ok(terkunci(mengirim, "Mengirim laporan"), "tombol kirim terkunci selama pengiriman berjalan");
ok(terkunci(mengirim, "Simpan nomor"), "tombol simpan terkunci selama pengiriman berjalan");
ok(terkunci(mengirim, "Unduh PDF"), "unduhan terkunci selama pengiriman berjalan");

const menyiapkan = tanpaKomentar(
  renderToStaticMarkup(<KontakLaporanWhatsapp {...dasar} nomor={null} mengunduh />),
);
ada(menyiapkan, "Menyiapkan PDF", "keadaan menyiapkan PDF tampil di tombol");
ok(terkunci(menyiapkan, "Menyiapkan PDF"), "tombol unduh terkunci selama PDF disusun");

const belumSiap = tanpaKomentar(
  renderToStaticMarkup(
    <KontakLaporanWhatsapp {...dasar} nomor={null} bolehUnduh={false} />,
  ),
);
ok(terkunci(belumSiap, "Unduh PDF"), "unduhan terkunci sebelum angkanya tersedia");

// ===== Kegagalan server tampil apa adanya =====
const gagal = tanpaKomentar(
  renderToStaticMarkup(
    <KontakLaporanWhatsapp
      {...dasar}
      nomor="628123456789"
      galat="Integrasi WhatsApp belum aktif, jadi laporan tidak dikirim."
    />,
  ),
);
ada(gagal, 'role="alert"', "kegagalan diberitakan sebagai alert");
ada(gagal, "Integrasi WhatsApp belum aktif", "pesan kegagalan tampil apa adanya");
bersih(gagal, "markup kegagalan");

// ===== Aturan copy: bebas tanda pisah panjang =====
ok(!belum.includes("\u2014"), "kartu tanpa nomor bebas tanda pisah panjang");
ok(!adaNomor.includes("\u2014"), "kartu dengan nomor bebas tanda pisah panjang");
ok(!gagal.includes("\u2014"), "pesan kegagalan bebas tanda pisah panjang");

console.log(`KontakLaporanWhatsapp.render.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
