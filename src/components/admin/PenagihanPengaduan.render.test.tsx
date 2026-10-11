/**
 * Uji render bagian MURNI utas pengaduan (helpdesk).
 * Run: bun src/components/admin/PenagihanPengaduan.render.test.tsx
 *
 * Utas yang tersambung Convex tidak bisa dirender di luar aplikasi, jadi
 * `DaftarPesanUtas` diuji langsung. Yang dijaga:
 *  - arah pesan selalu ditulis ("Petugas"/"Nasabah") — bukan hanya dibedakan
 *    warna, supaya tetap terbaca tanpa penglihatan warna;
 *  - nama penulis dan isi pesan tampil apa adanya;
 *  - utas kosong menjelaskan keadaannya, bukan kotak kosong;
 *  - tidak ada "undefined"/"NaN"/"[object Object]".
 */
import { renderToStaticMarkup } from "react-dom/server";

import { DaftarPesanUtas } from "./PenagihanPanel";

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

const pesanDasar = {
  _id: "p1" as never,
  arah: "nasabah",
  isi: "Nominal tagihan tidak sesuai dengan yang saya bayar.",
  penulisLabel: "Nasabah via whatsapp",
  dibuatPada: 1_700_000_000_000,
};

// ===== 1. Arah nasabah & petugas terbaca sebagai kata =====
{
  const html = renderToStaticMarkup(
    <DaftarPesanUtas
      pesan={[
        pesanDasar,
        {
          _id: "p2" as never,
          arah: "petugas",
          isi: "Kami mencocokkan bukti transfer Anda.",
          penulisLabel: "petugas@pindai.test",
          dibuatPada: 1_700_000_100_000,
        },
      ]}
    />,
  );
  ada(html, "Nasabah", "pesan nasabah diberi label arah");
  ada(html, "Petugas", "pesan petugas diberi label arah");
  ada(html, "Nasabah via whatsapp", "nama penulis nasabah tampil");
  ada(html, "petugas@pindai.test", "nama penulis petugas tampil");
  ada(html, "Nominal tagihan tidak sesuai", "isi pesan nasabah tampil");
  ada(html, "mencocokkan bukti transfer", "isi pesan petugas tampil");
  bersih(html, "utas dua pesan");
}

// ===== 2. Utas kosong =====
{
  const html = renderToStaticMarkup(<DaftarPesanUtas pesan={[]} />);
  ada(html, "Belum ada pesan", "utas kosong menjelaskan keadaan");
  bersih(html, "utas kosong");
}

if (failed > 0) {
  console.error(`\n${failed} gagal, ${passed} lulus`);
  throw new Error(`${failed} tes render utas pengaduan gagal`);
}
console.log(`PenagihanPengaduan: ${passed} lulus`);
