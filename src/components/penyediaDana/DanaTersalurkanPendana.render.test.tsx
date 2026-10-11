/**
 * Uji render "Dana tersalurkan per pendana" di /penyedia-dana.
 * Run: bun src/components/penyediaDana/DanaTersalurkanPendana.render.test.tsx
 *
 * Yang dijaga: total dana tersalurkan tiap pendana benar-benar tampil
 * sebagai angka (bukan hanya batang), jumlahnya sama dengan jumlah baris, dan
 * angka modal ini tidak boleh tertukar dengan angka keuntungan — keuntungan
 * punya kartunya sendiri.
 */
import { renderToStaticMarkup } from "react-dom/server";

import type { RekapPendana } from "@/convex/penyediaDana";

import { DanaTersalurkanPendana } from "./DanaTersalurkanPendana";

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
/** Isi satu bar penyedia: dari namanya sampai penutup barisnya. */
function bar(html: string, nama: string): string {
  const mulai = html.indexOf(`${nama}</span>`);
  ok(mulai !== -1, `bar "${nama}" ada`);
  if (mulai === -1) return "";
  const selesai = html.indexOf("</li>", mulai);
  return selesai === -1 ? html.slice(mulai) : html.slice(mulai, selesai);
}

/** Rekap lengkap seperti dari server (angka dari tangkapan layar pemilik produk). */
function rekap(
  nama: string,
  tersalurkan: number,
  berjalan: number,
  pinjaman: number,
  aktif: number,
  lunas: number,
): RekapPendana {
  return {
    nama,
    jumlahPinjaman: pinjaman,
    jumlahAktif: aktif,
    jumlahLunas: lunas,
    totalDisalurkan: tersalurkan,
    saldoBerjalan: berjalan,
    totalBunga: 0,
    keuntunganPendana: 0,
    keuntunganPendanaLunas: 0,
    keuntunganPendanaBelumLunas: 0,
    keuntunganAdmin: 0,
    keuntunganAdminLunas: 0,
    keuntunganAdminBelumLunas: 0,
    transferTercatat: 0,
    transferBelumDicatat: 0,
    keuntunganBelumDicatat: 0,
  };
}

const REKAP = [
  rekap("CHARELSOERYA@GMAIL.COM", 1_000_000, 1_000_000, 1, 1, 0),
  rekap("ROBERT", 7_000_000, 6_000_000, 8, 7, 1),
  rekap("ASEP FIRMAN HANAFI", 5_000_000, 3_000_000, 7, 4, 3),
];

const html = renderToStaticMarkup(<DanaTersalurkanPendana rekap={REKAP} />);

// Judul + total semua penyedia di kepala kartu.
ada(html, "Dana tersalurkan per pendana", "judul kartu");
ada(html, "Total dana tersalurkan per pendana", "kartu punya nama untuk pembaca layar");
ada(html, "Total Rp 13.000.000", "total dana tersalurkan semua penyedia");

// Setiap penyedia: nama, total, hitungan pinjaman, dan sisa yang berjalan.
const robert = bar(html, "ROBERT");
ok(robert.includes("Rp 7.000.000"), "baris Robert memuat total dana tersalurkannya");
ok(
  robert.includes("8 pinjaman · 7 aktif · 1 lunas · masih berjalan Rp 6.000.000"),
  "baris Robert memuat hitungan pinjaman dan pokok yang masih berjalan",
);
const asep = bar(html, "ASEP FIRMAN HANAFI");
ok(asep.includes("Rp 5.000.000"), "baris Asep memuat total dana tersalurkannya");
ok(asep.includes("7 pinjaman · 4 aktif · 3 lunas"), "baris Asep memuat hitungan pinjaman");
ok(
  asep.includes("masih berjalan Rp 3.000.000"),
  "baris Asep memuat pokok yang masih berjalan",
);
const charel = bar(html, "CHARELSOERYA@GMAIL.COM");
ok(charel.includes("Rp 1.000.000"), "baris Charel memuat total dana tersalurkannya");

// Urutan: dana tersalurkan terbesar lebih dulu.
const posRobert = html.indexOf("ROBERT");
const posAsep = html.indexOf("ASEP FIRMAN HANAFI");
const posCharel = html.indexOf("CHARELSOERYA@GMAIL.COM");
ok(
  posRobert !== -1 && posRobert < posAsep && posAsep < posCharel,
  "bar diurutkan dari dana tersalurkan terbesar",
);

// Panjang batang relatif terhadap penyedia terbesar (lib murni: 100/71,43/14,29).
ada(html, "width:100%", "penyedia terbesar memakai batang penuh");
ada(html, "width:71.43%", "batang Asep 71,43% dari yang terbesar");
ada(html, "width:14.29%", "batang Charel 14,29% dari yang terbesar");
ok(!/[0-9]{4,}%/.test(html), "lebar batang selalu dibulatkan, tanpa sisa pecahan biner");

// Ringkasan bawah: total + sisa berjalan, dengan istilah yang benar.
ada(
  html,
  "Total dana tersalurkan semua penyedia Rp 13.000.000, dengan Rp 10.000.000 masih berjalan.",
  "catatan bawah memuat total dan sisa berjalan",
);
ada(
  html,
  "Panjang batang dibandingkan dengan pendana terbesar.",
  "skala batang dijelaskan",
);
// Kartu ini soal modal: tidak boleh memakai istilah keuntungan.
ok(
  !html.toLowerCase().includes("keuntungan"),
  "kartu dana tersalurkan tidak mencampur istilah keuntungan",
);

// Invarian: jumlah nilai tiap baris = total di kepala kartu.
const totalDariBaris = REKAP.reduce((total, r) => total + r.totalDisalurkan, 0);
eq(totalDariBaris, 13_000_000, "jumlah dana tersalurkan semua baris = 13 juta");

bersih(html, "markup kartu dana tersalurkan");

// ===== Satu penyedia: totalnya tetap tampil, batangnya penuh =====
const tunggal = renderToStaticMarkup(
  <DanaTersalurkanPendana rekap={[rekap("ROBERT", 7_000_000, 6_000_000, 8, 7, 1)]} />,
);
ada(tunggal, "Total Rp 7.000.000", "satu penyedia tetap mendapat total dana tersalurkan");
ada(tunggal, "width:100%", "batang satu penyedia penuh");
bersih(tunggal, "markup kartu satu penyedia");

// ===== Nol: bar kosong, bukan bar penuh karena pembagian nol =====
const kosong = renderToStaticMarkup(
  <DanaTersalurkanPendana rekap={[rekap("BELUM ADA", 0, 0, 0, 0, 0)]} />,
);
ada(kosong, "Total Rp 0", "total nol ditulis apa adanya");
ada(kosong, "width:0%", "dana nol digambar sebagai batang kosong");
ok(!kosong.includes("width:NaN"), "tidak ada lebar NaN saat semua nol");
bersih(kosong, "markup kartu dana nol");

console.log(`DanaTersalurkanPendana.render.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
