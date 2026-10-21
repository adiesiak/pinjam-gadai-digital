/**
 * Uji render tombol "Rekap seluruh pendana" milik Super Admin.
 * Run: bun src/components/penyediaDana/RekapPendanaUnduhan.render.test.tsx
 *
 * Yang dijaga:
 *  - dua tindakan yang tersedia dijelaskan apa adanya: unduh PDF dan kirim ke
 *    WhatsApp, keduanya dari berkas yang sama;
 *  - tanpa pendana tidak ada yang bisa dicetak, dan tombolnya terkunci;
 *  - tombol kirim terkunci selama nomor tujuan masih kosong, karena aksi server
 *    menolak nomor kosong;
 *  - keadaan berjalan mengubah kata tombol dan menguncinya, supaya satu rekap
 *    tidak terkirim dua kali karena klik berulang;
 *  - kegagalan server tampil sebagai alert, bukan disamarkan;
 *  - copy-nya bebas tanda pisah panjang (aturan copy UI proyek ini).
 */
import { renderToStaticMarkup } from "react-dom/server";

import { TombolRekapPendana } from "./RekapPendanaUnduhan";

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
 * Diperiksa dari TAG PEMBUKANYA saja: kelas Tailwind tombol memuat varian
 * `disabled:...`, sehingga mencari kata "disabled" di seluruh markup akan
 * selalu menemukannya dan uji ini tidak akan pernah bisa gagal.
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
  jumlahPendana: 3,
  bolehUnduh: true,
  mengunduh: false,
  mengirim: false,
  galat: null as string | null,
  onUnduh: () => {},
  onKirim: () => {},
};

// ===== Keadaan siap =====
const siap = tanpaKomentar(renderToStaticMarkup(<TombolRekapPendana {...dasar} />));
ada(siap, "Rekap seluruh pendana", "bagiannya punya nama");
ada(siap, "Rekap pinjaman 3 pendana", "jumlah pendana disebut di judul");
ada(siap, "Nomor WhatsApp tujuan", "kolom nomor punya label");
ada(siap, "kirim ke WhatsApp nomor yang Anda tulis", "tujuan kiriman dijelaskan");
ok(!terkunci(siap, "Unduh PDF"), "tombol unduh hidup saat angkanya tersedia");
ok(terkunci(siap, "Kirim rekap ke WhatsApp"), "tombol kirim terkunci sebelum nomor diisi");
ada(siap, "Isi nomor untuk mengaktifkan tombol WhatsApp", "tombol kirim menjelaskan caranya");
ada(siap, "Tombol Unduh PDF tetap bisa dipakai tanpa nomor", "unduhan tidak bergantung nomor");
ada(siap, "hanya Super Admin yang bisa menyusunnya", "pembatas peran dinyatakan");
ada(siap, "Nama peminjam tidak dicantumkan", "isi berkas dijelaskan");
bersih(siap, "markup siap");

// ===== Belum ada pendana =====
const kosong = tanpaKomentar(
  renderToStaticMarkup(<TombolRekapPendana {...dasar} jumlahPendana={0} />),
);
ada(kosong, "Belum ada pendana pada rekap ini", "keadaan kosong dinyatakan");
ok(terkunci(kosong, "Unduh PDF"), "unduhan terkunci tanpa pendana");
ok(terkunci(kosong, "Kirim rekap ke WhatsApp"), "kiriman terkunci tanpa pendana");
bersih(kosong, "markup kosong");

// ===== Sedang berjalan =====
const menyiapkan = tanpaKomentar(
  renderToStaticMarkup(<TombolRekapPendana {...dasar} mengunduh />),
);
ada(menyiapkan, "Menyiapkan PDF", "keadaan menyiapkan tampil di tombol");
ok(terkunci(menyiapkan, "Menyiapkan PDF"), "unduhan terkunci selama PDF disusun");
ok(terkunci(menyiapkan, "Kirim rekap ke WhatsApp"), "kiriman terkunci selama PDF disusun");

const mengirim = tanpaKomentar(
  renderToStaticMarkup(<TombolRekapPendana {...dasar} mengirim />),
);
ada(mengirim, "Mengirim rekap", "keadaan mengirim tampil di tombol");
ok(terkunci(mengirim, "Mengirim rekap"), "kiriman terkunci selama pengiriman berjalan");
ok(terkunci(mengirim, "Unduh PDF"), "unduhan terkunci selama pengiriman berjalan");

// ===== Saat angka belum tersedia =====
const belumSiap = tanpaKomentar(
  renderToStaticMarkup(<TombolRekapPendana {...dasar} bolehUnduh={false} />),
);
ok(terkunci(belumSiap, "Unduh PDF"), "unduhan terkunci sebelum angkanya tersedia");

// ===== Kegagalan server tampil apa adanya =====
const gagal = tanpaKomentar(
  renderToStaticMarkup(
    <TombolRekapPendana
      {...dasar}
      galat="Integrasi WhatsApp belum aktif, jadi rekap tidak dikirim."
    />,
  ),
);
ada(gagal, 'role="alert"', "kegagalan diberitakan sebagai alert");
ada(gagal, "Integrasi WhatsApp belum aktif", "pesan kegagalan tampil apa adanya");
bersih(gagal, "markup kegagalan");

// ===== Aturan copy: bebas tanda pisah panjang =====
ok(!siap.includes("\u2014"), "bagian siap bebas tanda pisah panjang");
ok(!kosong.includes("\u2014"), "bagian kosong bebas tanda pisah panjang");
ok(!gagal.includes("\u2014"), "pesan kegagalan bebas tanda pisah panjang");

console.log(`RekapPendanaUnduhan.render.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
