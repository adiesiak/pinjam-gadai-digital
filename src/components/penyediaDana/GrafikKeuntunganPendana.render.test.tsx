/**
 * Uji render grafik keuntungan per pendana di /penyedia-dana.
 * Run: bun src/components/penyediaDana/GrafikKeuntunganPendana.render.test.tsx
 *
 * Yang dijaga: grafik tidak boleh membuat pendana membaca angka
 * perkiraan sebagai uang yang sudah masuk. Karena itu bagian "sudah cair" dan
 * "perkiraan" harus benar-benar terpisah di markup — warnanya berbeda, lebarnya
 * berbeda, dan angkanya tetap tertulis sebagai teks (bukan hanya batang).
 */
import { renderToStaticMarkup } from "react-dom/server";

import type { RekapPendana } from "@/convex/penyediaDana";

import { GrafikKeuntunganPendana } from "./GrafikKeuntunganPendana";

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

/** Rekap lengkap; grafik hanya membaca sebagian field. */
function rekap(
  nama: string,
  lunas: number,
  belumLunas: number,
): RekapPendana {
  return {
    nama,
    jumlahPinjaman: 1,
    jumlahAktif: belumLunas > 0 ? 1 : 0,
    jumlahLunas: lunas > 0 ? 1 : 0,
    totalDisalurkan: 1_000_000,
    saldoBerjalan: belumLunas > 0 ? 1_000_000 : 0,
    totalBunga: 300_000,
    keuntunganPendana: lunas + belumLunas,
    keuntunganPendanaLunas: lunas,
    keuntunganPendanaBelumLunas: belumLunas,
    keuntunganAdmin: 50_000,
    keuntunganAdminLunas: 0,
    keuntunganAdminBelumLunas: 50_000,
    transferTercatat: 0,
    transferBelumDicatat: 0,
    keuntunganBelumDicatat: 0,
  };
}

const REKAP = [
  rekap("CHARELSOERYA@GMAIL.COM", 0, 235_000),
  rekap("ROBERT", 235_000, 1_410_000),
  rekap("ASEP FIRMAN HANAFI", 470_000, 705_000),
];

const html = renderToStaticMarkup(<GrafikKeuntunganPendana rekap={REKAP} />);

// Judul + keterangan cara membacanya.
ada(html, "Keuntungan per pendana", "judul grafik");
ada(html, "Grafik keuntungan per pendana", "grafik punya nama untuk pembaca layar");
ada(html, "Sudah cair", "keterangan warna hijau");
ada(html, "Perkiraan", "keterangan warna kuning");
ada(html, "belum menjadi uang sampai pinjamannya lunas", "catatan bahwa kuning belum jadi uang");

// Setiap pendana muncul dengan angkanya sebagai teks — bukan hanya batang.
for (const r of REKAP) ada(html, r.nama, `nama ${r.nama} tampil`);
ada(html, "Rp 1.645.000", "total keuntungan terbesar (Robert) tampil sebagai teks");
ada(html, "Rp 1.175.000", "total keuntungan Asep tampil sebagai teks");
ada(html, "Rp 235.000", "total keuntungan terkecil tampil sebagai teks");

// Urutan: terbesar lebih dulu, supaya yang paling perlu dilihat ada di atas.
const posisiRobert = html.indexOf("ROBERT");
const posisiAsep = html.indexOf("ASEP FIRMAN HANAFI");
const posisiCharel = html.indexOf("CHARELSOERYA@GMAIL.COM");
ok(
  posisiRobert !== -1 && posisiRobert < posisiAsep && posisiAsep < posisiCharel,
  "bar diurutkan dari keuntungan terbesar",
);

// Panjang bar mengikuti lib murni: Robert 100% (terbesar), Asep 71,43%,
// Charel 14,29%. Setiap bar digambar sebagai dua segmen yang berjumlah
// panjangnya: hijau = sudah cair, kuning = perkiraan.
ada(html, "width:14.29%", "segmen hijau Robert (235rb dari 1,645jt)");
ada(html, "width:85.71%", "sisa bar Robert tetap kuning (perkiraan 1,41jt)");
ada(html, "width:28.57%", "segmen hijau Asep 40% dari bar-nya (470rb)");
ada(html, "width:42.86%", "sisa bar Asep kuning (705rb)");
ada(html, "width:0%", "Charel belum punya bagian hijau");
// Tidak boleh ada sisa pecahan biner di atribut style (mis. 85.71000000000001%).
ok(
  !/[0-9]{4,}%/.test(html),
  "lebar segmen selalu dibulatkan, tanpa sisa pecahan biner",
);

// Batangnya dekoratif; angkanya tetap ada sebagai teks per penyedia.
ada(html, "sudah cair Rp 235.000 · perkiraan Rp 1.410.000", "rincian angka Robert per baris");
ada(html, "sudah cair Rp 0 · perkiraan Rp 235.000", "rincian angka Charel per baris");

bersih(html, "markup grafik");

// ===== Satu penyedia: tetap digambar apa adanya (grafik tidak mengarang skala) =====
const tunggal = renderToStaticMarkup(
  <GrafikKeuntunganPendana rekap={[rekap("TUNGGAL", 0, 700_000)]} />,
);
ada(tunggal, "TUNGGAL", "penyedia tunggal tampil");
ada(tunggal, "width:100%", "seluruh bar tunggal kuning (belum ada yang cair)");
ada(tunggal, "sudah cair Rp 0 · perkiraan Rp 700.000", "rincian penyedia tunggal");
bersih(tunggal, "markup grafik satu penyedia");

// ===== Semua nol: tidak ada bar penuh karena pembagian nol =====
const kosong = renderToStaticMarkup(
  <GrafikKeuntunganPendana rekap={[rekap("BELUM ADA", 0, 0)]} />,
);
ok(!kosong.includes("width:100%"), "nilai nol tidak digambar sebagai bar penuh");
ada(kosong, "width:0%", "nilai nol digambar sebagai bar kosong");
ok(!kosong.includes("width:NaN"), "tidak ada lebar NaN saat semua nol");
bersih(kosong, "markup grafik semua nol");

console.log(`GrafikKeuntunganPendana.render.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
