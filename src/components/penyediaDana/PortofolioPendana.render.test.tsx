/**
 * Uji render panel portofolio pendana (peran `dana`).
 * Run: bun src/components/penyediaDana/PortofolioPendana.render.test.tsx
 *
 * Yang dijaga:
 * 1. angkanya persis baris rekap yang dikirim server, dengan istilah kolom yang
 *    sama seperti tabel rekap (label diambil dari `KOLOM_PENDANA`);
 * 2. panel ini TIDAK membuka permukaan pembanding apa pun: tidak ada tabel dan
 *    tidak ada baris pendana lain, karena cakupan barisnya ditegakkan di server;
 * 3. biaya 5% disebut biaya platform (layanan), bukan "potongan admin";
 * 4. keadaan transfer keuntungan dibaca sebagai kalimat, termasuk saat belum ada
 *    pinjaman lunas.
 */
import { renderToStaticMarkup } from "react-dom/server";

import type { RekapPendana } from "@/convex/penyediaDana";

import { PortofolioPendana } from "./PortofolioPendana";

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
function takAda(html: string, teks: string, label: string): void {
  ok(!html.includes(teks), `${label} (tidak memuat "${teks}")`);
}
function bersih(html: string, label: string): void {
  ok(!html.includes("undefined"), `${label} tanpa "undefined"`);
  ok(!html.includes("[object Object]"), `${label} tanpa "[object Object]"`);
  ok(!html.includes("NaN"), `${label} tanpa "NaN"`);
}

/** Nilai unik per kolom, supaya kolom yang tertukar posisi pasti ketahuan. */
const ROBERT: RekapPendana = {
  nama: "ROBERT",
  jumlahPinjaman: 8,
  jumlahAktif: 7,
  jumlahLunas: 1,
  totalDisalurkan: 7_000_000,
  saldoBerjalan: 6_000_000,
  totalBunga: 2_100_000,
  keuntunganPendana: 1_645_000,
  keuntunganPendanaLunas: 235_000,
  keuntunganPendanaBelumLunas: 1_410_000,
  keuntunganAdmin: 455_000,
  keuntunganAdminLunas: 65_000,
  keuntunganAdminBelumLunas: 390_000,
  transferTercatat: 0,
  transferBelumDicatat: 1,
  keuntunganBelumDicatat: 235_000,
};

const html = renderToStaticMarkup(
  <PortofolioPendana r={ROBERT} namaTampil={(nama) => nama} persenLayanan={5} />,
);

// ===== Milik siapa =====
ada(html, "Alokasi atas nama", "panel menyebut alokasi ini milik siapa");
ada(html, "ROBERT", "nama pemilik alokasi tercetak");
ada(html, "8 pinjaman · 7 berjalan · 1 lunas", "hitungan pinjaman ikut tercetak");

// ===== Angka: satu kolom = satu angka, label sama dengan tabel =====
ada(html, "Dana tersalurkan", "label kolom dana tersalurkan dipakai apa adanya");
ada(html, "Rp 7.000.000", "dana tersalurkan tercetak");
// Saldo berjalan adalah BAGIAN dari dana tersalurkan, jadi ia tidak dicetak
// sebagai angka kedua di sebelahnya: ia terbaca di bawah angka itu, dengan
// bilah yang menunjukkan porsinya.
ada(html, "Rp 6.000.000 masih berjalan", "saldo berjalan tercetak sebagai bagian dananya");
ada(
  html,
  "86% dana tersalurkan masih berjalan",
  "porsi yang masih berjalan diumumkan ke pembaca layar",
);
ada(html, "Total keuntungan", "label total keuntungan dipakai apa adanya");
ada(html, "Rp 1.645.000", "total keuntungan tercetak");
ada(html, "Dibukukan (lunas)", "angka yang sudah dibukukan dipisah");
ada(html, "Rp 235.000", "keuntungan yang sudah dibukukan tercetak");
ada(html, "Perkiraan (belum lunas)", "angka perkiraan dipisah");
ada(html, "Rp 1.410.000", "keuntungan perkiraan tercetak");
ada(html, "Biaya platform (layanan)", "biaya 5% dinamai biaya platform (layanan)");
ada(html, "Rp 455.000", "biaya platform tercetak");
ada(html, "potongan 5% dari total pengembalian", "tarif dan dasarnya dijelaskan");

// Istilah lama tidak boleh tersisa di permukaan yang dibaca pendana.
takAda(html, "potongan admin", "tanpa istilah lama \"potongan admin\"");
takAda(html, "keuntungan admin", "tanpa istilah lama \"keuntungan admin\"");

// ===== Status transfer keuntungan =====
ada(html, "1 belum dicatat (Rp 235.000)", "transfer yang belum dicatat dijelaskan");
takAda(html, "semua tercatat", "transfer tertunda tidak diklaim sudah tercatat");

// ===== Bukan permukaan pembanding =====
takAda(html, "<table", "panel ini tidak memuat tabel");
takAda(html, "Saring daftar", "tidak ada kontrol membandingkan pendana di panel ini");
ada(
  html,
  "angka pendana lain tidak ditampilkan",
  "cakupan angka dinyatakan supaya tidak salah baca",
);
bersih(html, "markup panel portofolio");

// ===== Tanpa pinjaman lunas: diterangkan apa adanya =====
{
  const SITI: RekapPendana = {
    ...ROBERT,
    nama: "SITI",
    jumlahPinjaman: 3,
    jumlahAktif: 3,
    jumlahLunas: 0,
    totalDisalurkan: 9_500_000,
    saldoBerjalan: 9_500_000,
    keuntunganPendana: 2_245_000,
    keuntunganPendanaLunas: 0,
    keuntunganPendanaBelumLunas: 2_245_000,
    keuntunganAdmin: 605_000,
    keuntunganAdminLunas: 0,
    keuntunganAdminBelumLunas: 605_000,
    transferTercatat: 0,
    transferBelumDicatat: 0,
    keuntunganBelumDicatat: 0,
  };
  const belumLunas = renderToStaticMarkup(
    <PortofolioPendana r={SITI} namaTampil={(nama) => nama} persenLayanan={5} />,
  );
  ada(
    belumLunas,
    "belum ada pinjaman lunas",
    "transfer dijelaskan saat belum ada pinjaman lunas",
  );
  takAda(belumLunas, "belum dicatat", "tanpa pinjaman lunas tidak ada tunggakan palsu");
  ada(belumLunas, "Rp 0", "angka nol dicetak apa adanya");
  bersih(belumLunas, "markup panel tanpa pinjaman lunas");
}

// ===== Penyamaran nama berlaku seperti di tabel lain =====
{
  const samar = renderToStaticMarkup(
    <PortofolioPendana r={ROBERT} namaTampil={() => "PENDANA-01"} persenLayanan={5} />,
  );
  ada(samar, "PENDANA-01", "nama pendana tampil tersamar");
  takAda(samar, "ROBERT", "nama penuh tidak tercetak saat penyamaran dipakai");
  bersih(samar, "markup panel dengan penyamaran nama");
}

console.log(`PortofolioPendana.render.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
