/**
 * Uji render kotak penjelasan "Potongan admin …%" di /penyedia-dana.
 * Run: bun src/components/penyediaDana/CatatanPotonganAdmin.render.test.tsx
 *
 * Halaman utuhnya membaca Convex (useQuery/useAuth) dan peta Leaflet, sehingga
 * tidak bisa dirender di luar aplikasi; kotak penjelasannya sendiri murni,
 * jadi langsung dirender di sini. Yang dijaga: penyedia dana benar-benar melihat KEPERLUAN potongan admin
 * — server & operasional, collect/penagihan lapangan, dan asuransi yang
 * menjamin pokok pinjaman beserta Imbal Hasilnya cair dalam 14 hari kerja —
 * bukan hanya angkanya, dan persentasenya mengikuti Pengaturan Sistem.
 */
import { renderToStaticMarkup } from "react-dom/server";

import { CatatanPotonganAdmin } from "@/components/penyediaDana/CatatanPotonganAdmin";

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

const PERSEHARI = renderToStaticMarkup(<CatatanPotonganAdmin persen={5} />);

// Persentase yang berlaku disebut, bukan angka tetap yang ditulis di kode.
ada(PERSEHARI, "Potongan admin 5%", "persentase potongan admin disebut");
ada(PERSEHARI, "bukan sekadar biaya", "judul menjelaskan bahwa ini bukan sekadar biaya");

// Ketiga keperluan yang diminta pemilik produk.
ada(PERSEHARI, "Server &amp; operasional PINDAI", "keperluan server & operasional");
ada(PERSEHARI, "Collect / penagihan lapangan", "collect / penagihan lapangan");
ada(
  PERSEHARI,
  "Asuransi — jaminan pokok pinjaman maupun Imbal Hasilnya cair ke penyedia dana dalam 14 hari kerja.",
  "asuransi: jaminan pokok + Imbal Hasil cair dalam 14 hari kerja",
);
ada(PERSEHARI, "14 hari kerja", "jangka waktu jaminan disebut eksplisit");
ada(PERSEHARI, "penyedia dana", "penerima jaminan disebut: penyedia dana");

// Tiga butir, tidak lebih — tidak ada butir kosong atau tergabung.
ok(
  (PERSEHARI.match(/<li/g) ?? []).length === 3,
  "tepat tiga butir keperluan",
);
bersih(PERSEHARI, "markup kotak potongan admin");

// Persentase mengikuti Pengaturan Sistem: nilai lain harus ikut berubah dan
// tidak menyisakan angka lama.
const LAIN = renderToStaticMarkup(<CatatanPotonganAdmin persen={7} />);
ada(LAIN, "Potongan admin 7%", "persentase lain ikut tercetak");
ok(!LAIN.includes("Potongan admin 5%"), "angka lama tidak tertinggal");
bersih(LAIN, "markup kotak dengan persentase 7%");

console.log(`CatatanPotonganAdmin.render.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
