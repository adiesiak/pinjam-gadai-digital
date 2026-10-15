/**
 * Uji render tabel perbandingan pendana di /penyedia-dana.
 * Run: bun src/components/penyediaDana/TabelPendana.render.test.tsx
 *
 * Halaman utuhnya membaca Convex dan memuat peta Leaflet, jadi tidak bisa
 * dirender di luar aplikasi; tabelnya murni, jadi dirender langsung di sini.
 *
 * Yang dijaga:
 * 1. satu kolom = satu angka, dengan label yang sama seperti di kartu ringkasan
 *    ("Dibukukan (lunas)", "Perkiraan (belum lunas)", "Total keuntungan") —
 *    angka yang sudah jadi uang tidak boleh tertukar dengan angka perkiraan;
 * 2. urutan kolom di badan tabel persis mengikuti kepalanya (modal dulu, baru
 *    hasil), bukan sekadar memuat semua angka;
 * 3. baris total benar-benar menjumlahkan kolomnya;
 * 4. rincian pembentuk angka perkiraan bisa ditelusuri, dan jumlah barisnya sama
 *    dengan kolom "Perkiraan (belum lunas)".
 *
 * Aturan urut dan penjumlahan kolomnya diuji terpisah sebagai fungsi murni —
 * lihat `src/lib/tabelPendana.test.ts`.
 *
 * Catatan: tata letak layar sempit (kartu) dan layar lebar (tabel) sama-sama
 * dirender pada render statis karena hanya disembunyikan CSS. Karena itu
 * pemeriksaan di bawah memotong HTML lebih dulu — tabel dan daftar kartu diuji
 * terpisah, supaya angka yang muncul dua kali tidak dianggap satu.
 */
import { renderToStaticMarkup } from "react-dom/server";

import type { RekapPendana } from "@/convex/penyediaDana";

import type { RincianPerkiraan } from "@/lib/tabelPendana";

import { TabelPendana } from "./TabelPendana";

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

/**
 * Isi satu baris tabel sebagai daftar sel.
 *
 * Dipotong per sel, bukan dicari sebagai satu blok: beberapa angka memang muncul
 * di lebih dari satu tempat (mis. nilai keuntungan yang belum ditransfer ikut
 * tercetak di sel nama sebagai catatan transfer), dan mencari "angka X ada di
 * mana saja" tidak bisa membuktikan bahwa X berada di kolom yang benar.
 */
function selBaris(tabel: string, nama: string): string[] {
  const tanda = `>${nama}<`;
  let mulai = -1;
  for (let i = tabel.indexOf(tanda); i !== -1; i = tabel.indexOf(tanda, i + 1)) {
    const buka = tabel.lastIndexOf("<tr", i);
    if (buka > tabel.lastIndexOf("</tr>", i)) {
      mulai = buka;
      break;
    }
  }
  ok(mulai !== -1, `baris ${nama} ditemukan di tabel`);
  if (mulai === -1) return [];
  const baris = tabel.slice(mulai, tabel.indexOf("</tr>", mulai));
  return baris.split("<td").slice(1);
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

const SITI: RekapPendana = {
  nama: "SITI",
  jumlahPinjaman: 3,
  jumlahAktif: 3,
  jumlahLunas: 0,
  totalDisalurkan: 9_500_000,
  saldoBerjalan: 9_500_000,
  totalBunga: 2_850_000,
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

const REKAP: readonly RekapPendana[] = [ROBERT, SITI];

const html = renderToStaticMarkup(<TabelPendana rekap={REKAP} onPilih={() => {}} />);
const tabel = html.slice(html.indexOf("<table"), html.indexOf("</table>"));
const ponsel = html.slice(html.indexOf("</table>"));
ok(tabel.length > 0, "tabel layar lebar dirender");
ok(ponsel.length > 0, "kartu layar sempit dirender terpisah dari tabel");

// ===== Kepala kolom: label sama dengan istilah yang dipakai halaman lain =====
for (const judul of [
  "Pendana",
  "Dana tersalurkan",
  "Masih berjalan",
  "Dibukukan (lunas)",
  "Perkiraan (belum lunas)",
  "Total keuntungan",
  "Potongan admin",
  "Aksi",
]) {
  ada(tabel, judul, `kepala kolom "${judul}"`);
}

// Titik urutan dipasang pada kepala kolom yang jadi dasar, dan hanya di situ.
eq((tabel.match(/aria-sort="descending"/g) ?? []).length, 1, "satu kolom bertanda urut turun");
eq((tabel.match(/aria-sort="none"/g) ?? []).length, 6, "enam kolom lain bertanda tanpa urutan");
ada(tabel, 'aria-label="Urutkan menurut Dana tersalurkan"', "kepala kolom bisa diklik untuk mengurutkan");

// ===== Badan tabel: setiap angka berada di kolom yang benar =====
{
  const sel = selBaris(tabel, "ROBERT");
  eq(sel.length, 8, "baris punya 8 sel (tujuh kolom angka + aksi)");

  const harapan = [
    "8 pinjaman · 7 aktif · 1 lunas", // nama + hitungan pinjaman
    "Rp 7.000.000", // dana tersalurkan
    "Rp 6.000.000", // masih berjalan
    "Rp 235.000", // dibukukan (lunas)
    "Rp 1.410.000", // perkiraan (belum lunas)
    "Rp 1.645.000", // total keuntungan
    "Rp 455.000", // potongan admin
  ];
  harapan.forEach((isi, i) => {
    ok(sel[i]?.includes(isi) === true, `sel ${i + 1} memuat "${isi}"`);
  });
  ada(sel[0] ?? "", "1 belum", "sel nama menyebut transfer yang belum dicatat");
  ada(sel[7] ?? "", "Saring daftar", "baris bisa dipakai menyaring daftar pinjaman");
  ada(sel[7] ?? "", "Rincian", "baris bisa diperluas");

  // Angka kolom tidak menyeberang: nilai perkiraan tidak muncul di sel dibukukan
  // dan sebaliknya — inti pemisahan uang yang sudah cair dari yang masih hitungan.
  ok(
    !(sel[3] ?? "").includes("Rp 1.410.000") && !(sel[4] ?? "").includes("Rp 235.000"),
    "angka dibukukan dan angka perkiraan tidak tertukar kolom",
  );
}

// SITI belum punya pinjaman lunas: bagian dibukukan nol, dan transfernya
// diterangkan apa adanya — bukan diklaim sudah dicatat.
{
  const sel = selBaris(tabel, "SITI");
  ok((sel[3] ?? "").includes("Rp 0"), "keuntungan dibukukan nol dicetak apa adanya");
  ada(sel[0] ?? "", "belum ada pinjaman lunas", "transfer dijelaskan saat belum ada pinjaman lunas");
  ok(!(sel[0] ?? "").includes("semua tercatat"), "belum ada pinjaman lunas tidak diklaim sudah dicatat");
}

// ===== Kaki tabel: jumlah kolomnya =====
ada(tabel, "Total · 2 pendana", "baris total menyebut jumlah pendana");
ada(tabel, "Rp 16.500.000", "baris total menjumlahkan dana tersalurkan");
ada(tabel, "Rp 15.500.000", "baris total menjumlahkan saldo berjalan");
ada(tabel, "Rp 3.655.000", "baris total menjumlahkan keuntungan perkiraan");
ada(tabel, "Rp 3.890.000", "baris total menjumlahkan total keuntungan");
ada(tabel, "Rp 1.060.000", "baris total menjumlahkan potongan admin");
ada(tabel, "1 transfer belum dicatat (Rp 235.000)", "baris total menyebut transfer tertunda");

bersih(html, "markup tabel pendana");

// ===== Layar sempit: kartu memuat angka yang sama =====
ada(ponsel, "Total · 2 pendana", "kartu total ikut tampil di layar sempit");
ada(ponsel, "Dibukukan (lunas)", "kartu memisahkan bagian yang sudah dibukukan");
ada(ponsel, "Perkiraan (belum lunas)", "kartu memisahkan bagian perkiraan");
ada(ponsel, "Rp 9.500.000", "kartu memuat dana tersalurkan pendana terkecil");
ada(ponsel, "Rp 16.500.000", "kartu total memuat jumlah kolomnya");
bersih(ponsel, "markup kartu pendana");

// ===== Rincian pembentuk angka perkiraan =====
{
  // Tertutup: rinciannya belum ada di DOM, bukan tampil sebagai bagian kosong.
  ok(!html.includes("Pembentuk angka perkiraan"), "rincian tetap tertutup sebelum dibuka");

  // 5 × Rp200.000 + 2 × Rp205.000 = Rp1.410.000, yaitu angka perkiraan ROBERT.
  const RINCIAN: RincianPerkiraan[] = Array.from({ length: 7 }, (_, i) => ({
    id: `loans-${i}`,
    nomorReferensi: `PGD-2026-000${i + 1}`,
    namaLengkap: `Peminjam ${i + 1}`,
    keuntunganPendana: i < 5 ? 200_000 : 205_000,
  }));

  const htmlRincian = renderToStaticMarkup(
    <TabelPendana
      rekap={REKAP}
      bukaAwal={["ROBERT"]}
      rincianPerkiraan={(nama) => (nama === "ROBERT" ? RINCIAN : [])}
    />,
  );
  const tabelRincian = htmlRincian.slice(
    htmlRincian.indexOf("<table"),
    htmlRincian.indexOf("</table>"),
  );

  ada(
    tabelRincian,
    "Pembentuk angka perkiraan · 7 pinjaman berjalan",
    "rincian menyebut jumlah pinjaman pembentuknya",
  );
  ada(
    tabelRincian,
    "Jumlah baris di atas sama dengan kolom “Perkiraan (belum lunas)”.",
    "rincian menjelaskan hubungannya dengan kolom perkiraan",
  );
  for (const p of RINCIAN) {
    ada(
      tabelRincian,
      `${p.nomorReferensi} · ${p.namaLengkap.toUpperCase()}`,
      `baris rincian ${p.nomorReferensi}`,
    );
  }
  ada(tabelRincian, "Potongan admin dibukukan", "rincian memecah potongan admin yang dibukukan");
  ada(tabelRincian, "Potongan admin perkiraan", "rincian memecah potongan admin yang perkiraan");

  // Invarian yang dijanjikan catatan di rincian: jumlah barisnya = angka perkiraan.
  const jumlah = RINCIAN.reduce((total, p) => total + p.keuntunganPendana, 0);
  eq(jumlah, ROBERT.keuntunganPendanaBelumLunas, "jumlah rincian sama dengan angka perkiraannya");

  // Rincian tidak menggeser angka yang sudah dibukukan.
  ada(tabelRincian, "Rp 235.000", "angka yang sudah dibukukan tetap terpisah di rincian");
  bersih(htmlRincian, "markup tabel dengan rincian terbuka");
}

// ===== Penyaringan + penyamaran nama =====
{
  const htmlSamar = renderToStaticMarkup(
    <TabelPendana rekap={REKAP} namaTampil={() => "PENDANA-01"} />,
  );
  ada(htmlSamar, "PENDANA-01", "nama pendana tampil tersamar");
  ok(!htmlSamar.includes("ROBERT"), "nama pendana penuh tidak tercetak saat penyamaran dipakai");

  const htmlAktif = renderToStaticMarkup(
    <TabelPendana rekap={REKAP} aktif="ROBERT" onPilih={() => {}} />,
  );
  ada(htmlAktif, "Lepas saringan", "pendana yang sedang menyaring ditandai tombolnya");
  ada(htmlAktif, 'aria-pressed="true"', "keadaan menyaring diumumkan ke pembaca layar");
  ada(htmlAktif, 'aria-pressed="false"', "pendana lain tetap bisa disaring");
  bersih(htmlAktif, "markup tabel dengan saringan aktif");
}

// ===== Tanpa pendana: keadaan kosong, bukan tabel kosong =====
{
  const htmlKosong = renderToStaticMarkup(<TabelPendana rekap={[]} />);
  ada(htmlKosong, "Belum ada dana tersalurkan pada pendana mana pun.", "keadaan kosong dijelaskan");
  ok(!htmlKosong.includes("<table"), "tanpa pendana, tidak ada tabel kosong yang dirender");
  bersih(htmlKosong, "markup keadaan kosong");
}

console.log(`TabelPendana.render.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
