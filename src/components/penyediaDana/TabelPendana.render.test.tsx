/**
 * Uji render tabel perbandingan pendana di /penyedia-dana.
 * Run: bun src/components/penyediaDana/TabelPendana.render.test.tsx
 *
 * Halaman utuhnya membaca Convex dan memuat peta Leaflet, jadi tidak bisa
 * dirender di luar aplikasi; tabelnya murni, jadi dirender langsung di sini.
 *
 * Yang dijaga:
 * 1. satu kolom = satu angka, dengan label yang sama seperti di kartu ringkasan
 *    ("Dibukukan (lunas)", "Perkiraan (belum lunas)", "Biaya platform
 *    (layanan)") — angka yang sudah jadi uang tidak boleh tertukar dengan angka
 *    perkiraan;
 * 2. kolomnya lengkap sejak render pertama dan dikelompokkan ke dalam pitanya,
 *    jadi tidak ada angka yang tersembunyi di balik tombol;
 * 3. "Masih berjalan" bukan kolom sendiri melainkan bagian di dalam sel "Dana
 *    tersalurkan" (bilah + keterangan), sehingga tidak ada angka turunan yang
 *    dicetak berdampingan dengan angka induknya;
 * 4. kepala kolom melekat di puncak tabel dan baris total menempel di dasarnya,
 *    jadi angka tetap punya judul saat isinya digulir (kelas sticky-nya diuji
 *    langsung, karena itu syarat yang membuat tabel ini dipakai);
 * 5. baris total benar-benar menjumlahkan baris yang sedang tampil;
 * 6. saringan baris mengeluarkan baris yang tidak cocok, dan keadaannya
 *    dijelaskan saat tidak ada yang cocok;
 * 7. rincian pembentuk angka perkiraan bisa ditelusuri, jumlah barisnya
 *    dicetak, dan angka yang sudah terbaca di barisnya tidak diulang di situ.
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
function takAda(html: string, teks: string, label: string): void {
  ok(!html.includes(teks), `${label} (tidak memuat "${teks}")`);
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
 * di lebih dari satu tempat, dan mencari "angka X ada di mana saja" tidak bisa
 * membuktikan bahwa X berada di kolom yang benar.
 */
function selBaris(tabel: string, nama: string): string[] {
  const tanda = `>${nama}<`;
  let mulai = -1;
  for (
    let i = tabel.indexOf(tanda);
    i !== -1;
    i = tabel.indexOf(tanda, i + 1)
  ) {
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

const html = renderToStaticMarkup(
  <TabelPendana rekap={REKAP} onPilih={() => {}} />,
);
// Tiga potongan markup: baris kendali di atas tabel, tabelnya sendiri, dan
// kartu layar sempit. Dipotong terpisah karena angka yang sama memang muncul di
// dua tata letak yang hanya dibedakan CSS.
const kendali = html.slice(0, html.indexOf("<table"));
const tabel = html.slice(html.indexOf("<table"), html.indexOf("</table>"));
const kepala = tabel.slice(tabel.indexOf("<thead"), tabel.indexOf("</thead>"));
const ponsel = html.slice(html.indexOf("</table>"));
ok(kendali.length > 0, "baris kendali dirender di atas tabel");
ok(tabel.length > 0, "tabel layar lebar dirender");
ok(kepala.length > 0, "kepala tabel dirender");
ok(ponsel.length > 0, "kartu layar sempit dirender terpisah dari tabel");

// ===== Baris kendali: ringkasan angka kepala, saringan, dan pengurut =====
ada(kendali, "2 pendana", "ringkasan menyebut jumlah pendana");
ada(kendali, "seluruh rekap", "ringkasan menyebut cakupannya");
ada(kendali, "Rp 16.500.000", "ringkasan menyebut dana tersalurkan seluruh rekap");
ada(kendali, "Rp 235.000", "ringkasan menyebut keuntungan yang sudah dibukukan");
ada(kendali, "Rp 3.655.000", "ringkasan menyebut keuntungan yang masih perkiraan");
ada(kendali, "Rp 1.060.000", "ringkasan menyebut biaya platform (layanan)");
// Istilah biaya 5% diseragamkan: yang dibaca pendana adalah biaya layanan
// platform, bukan potongan milik tim internal.
takAda(kendali, "potongan admin", "ringkasan tidak memakai istilah lama");
ada(kendali, "Urutkan tabel menurut kolom", "pengurut kolom punya satu tempat di baris kendali");
ada(kendali, "Terbesar dulu", "arah urutan dibaca sebagai kalimat, bukan hanya panah");
// Kolomnya tidak lagi bisa dinyalakan-matikan: yang tersisa hanya tiga tombol
// saring baris, jadi tidak ada angka yang bisa tersembunyi di balik tombol.
eq(
  (kendali.match(/aria-pressed=/g) ?? []).length,
  3,
  "hanya tiga tombol saring baris di baris kendali",
);
takAda(kendali, "Tampilkan kolom", "tidak ada tombol yang menyembunyikan kolom");

// ===== Kepala kolom: pita pengelompok + label yang sama dengan halaman lain =====
for (const judul of [
  "Pendana",
  "Dana tersalurkan",
  "Dibukukan (lunas)",
  "Perkiraan (belum lunas)",
  "Transfer keuntungan",
  "Biaya platform (layanan)",
]) {
  ada(kepala, judul, `kepala kolom "${judul}"`);
}
// Nama pitanya tepat sekali: satu baris kelompok di atas kolomnya, bukan diulang
// di setiap sel.
for (const pita of ["Dana pendana", "Hasil pendana", "Platform"]) {
  eq(
    (kepala.match(new RegExp(`>${pita}<`, "g")) ?? []).length,
    1,
    `pita "${pita}" dinamai sekali di kepala tabel`,
  );
}
// "Masih berjalan" turun jadi keterangan di dalam selnya, dan "Total keuntungan"
// (jumlah dua kolom lain) tidak berdiri sebagai kolom yang bisa diurutkan.
takAda(kepala, "Masih berjalan", "angka bagian tidak lagi berdiri sebagai kolom");
takAda(kepala, "Total keuntungan", "kolom turunan tidak dicetak berdampingan dengan pecahannya");

// Kepala kolom dan baris total melekat: dua kelas inilah syarat tabelnya.
ada(tabel, "sticky top-0", "kepala kolom melekat di puncak kotak gulir");
ada(tabel, "sticky bottom-0", "baris total menempel di dasar kotak gulir");
ada(tabel, "table-fixed", "lebar kolom dipatok supaya tidak bergoyang");

// Titik urutan dipasang pada kepala kolom angka yang jadi dasar, dan hanya di situ.
eq(
  (tabel.match(/aria-sort="descending"/g) ?? []).length,
  1,
  "satu kolom bertanda urut turun",
);
eq(
  (tabel.match(/aria-sort="none"/g) ?? []).length,
  3,
  "kolom angka lain bertanda tanpa urutan",
);
eq(
  (kepala.match(/aria-sort=/g) ?? []).length,
  4,
  "kolom keadaan transfer tidak ikut mengaku bisa diurutkan",
);

// ===== Badan tabel: setiap angka berada di kolom yang benar =====
// Enam sel: nama, lalu lima kolom pita (tersalurkan, dibukukan, perkiraan,
// transfer, biaya platform).
{
  const sel = selBaris(tabel, "ROBERT");
  eq(sel.length, 6, "baris punya 6 sel (nama + lima kolom)");

  ok(sel[0]?.includes("ROBERT") === true, "sel pertama memuat nama pendana");
  ada(
    sel[0] ?? "",
    "8 pinjaman · 7 berjalan · 1 lunas",
    "hitungan pinjaman menyusul di baris nama, bukan sebagai baris kedua",
  );
  eq(
    sel[1]?.includes("Rp 7.000.000"),
    true,
    "kolom dana tersalurkan berisi dananya",
  );
  ada(
    sel[1] ?? "",
    "Rp 6.000.000 masih berjalan",
    "bagian yang masih berjalan terbaca di dalam sel dana, bukan sebagai kolom sendiri",
  );
  ada(
    sel[1] ?? "",
    "86% dana tersalurkan masih berjalan",
    "porsi yang masih berjalan diumumkan ke pembaca layar",
  );
  eq(sel[2]?.includes("Rp 235.000"), true, "kolom dibukukan berisi keuntungan lunas");
  eq(
    sel[3]?.includes("Rp 1.410.000"),
    true,
    "kolom perkiraan berisi keuntungan pinjaman berjalan",
  );
  ada(sel[4] ?? "", "1 belum dicatat", "kolom transfer menyebut tunggakannya");
  eq(sel[5]?.includes("Rp 455.000"), true, "kolom biaya platform berisi biayanya");

  // Angka kolom tidak menyeberang: nilai perkiraan tidak muncul di sel dibukukan
  // dan sebaliknya, inti pemisahan uang yang sudah cair dari yang masih hitungan.
  ok(
    !(sel[2] ?? "").includes("Rp 1.410.000") &&
      !(sel[3] ?? "").includes("Rp 235.000"),
    "angka dibukukan dan angka perkiraan tidak tertukar kolom",
  );
}

// SITI belum punya pinjaman lunas: barisnya tidak boleh mengaku ada yang belum
// dicatat, dan porsi berjalannya penuh.
{
  const sel = selBaris(tabel, "SITI");
  ada(
    sel[4] ?? "",
    "belum ada pinjaman lunas",
    "baris tanpa pinjaman lunas tidak mengaku ada tunggakan",
  );
  eq(
    sel[1]?.includes("Rp 9.500.000"),
    true,
    "kolom dana tersalurkan SITI berisi dananya",
  );
  ada(
    sel[1] ?? "",
    "100% dana tersalurkan masih berjalan",
    "dana yang belum kembali sama sekali terbaca penuh",
  );
}

// ===== Kaki tabel: jumlah baris yang sedang tampil =====
ada(tabel, "Total baris di atas · 2 pendana", "baris total menyebut cakupannya");
ada(
  tabel,
  "11 pinjaman · 10 berjalan · 1 lunas",
  "baris total menjumlahkan hitungan pinjaman",
);
ada(tabel, "Rp 16.500.000", "baris total menjumlahkan dana tersalurkan");
ada(tabel, "Rp 15.500.000 masih berjalan", "baris total menjumlahkan saldo berjalan");
ada(tabel, "Rp 3.655.000", "baris total menjumlahkan keuntungan perkiraan");
ada(tabel, "Rp 1.060.000", "baris total menjumlahkan biaya platform (layanan)");
ada(tabel, '94% dana tersalurkan masih berjalan', "porsi berjalan seluruh baris diumumkan");

bersih(html, "markup tabel pendana");

// ===== Saringan baris =====
{
  // Bawaan: semua baris tampil, dan tombol saringnya menyatakan keadaannya.
  ada(kendali, 'aria-pressed="true"', "saringan bawaan ditandai di tombolnya");
  eq(
    (kendali.match(/aria-pressed="true"/g) ?? []).length,
    1,
    "hanya satu saringan yang aktif pada satu waktu",
  );
  eq(
    (kendali.match(/aria-pressed="false"/g) ?? []).length,
    2,
    "dua saringan lain tetap ditawarkan",
  );
  eq(
    (tabel.match(/aria-pressed=/g) ?? []).length,
    0,
    "judul kolom tidak lagi memuat kontrol",
  );

  const htmlTertunda = renderToStaticMarkup(
    <TabelPendana rekap={REKAP} saringAwal="tertunda" />,
  );
  const tertunda = htmlTertunda.slice(
    htmlTertunda.indexOf("<table"),
    htmlTertunda.indexOf("</table>"),
  );
  ada(
    tertunda,
    ">ROBERT<",
    "saringan transfer tertunda menyisakan pendana yang punya tunggakan",
  );
  takAda(tertunda, ">SITI<", "pendana tanpa tunggakan keluar dari tabel");
  ada(
    tertunda,
    "Total baris di atas · 1 dari 2 pendana",
    "baris total mengaku sedang menyaring",
  );
  bersih(htmlTertunda, "markup tabel dengan saringan transfer tertunda");

  // Saringan yang tidak menyisakan apa pun: keadaannya diterangkan, bukan tabel
  // kosong tanpa sebab.
  const htmlKosong = renderToStaticMarkup(
    <TabelPendana rekap={[SITI]} saringAwal="tertunda" />,
  );
  ada(
    htmlKosong,
    "Tidak ada pendana yang cocok dengan saringan ini.",
    "saringan tanpa hasil diterangkan sebabnya",
  );
  ada(
    htmlKosong,
    "Tampilkan semua pendana",
    "keadaan kosong memberi satu tindakan",
  );
  bersih(htmlKosong, "markup keadaan tanpa baris yang cocok");
}

// ===== Layar sempit: kartu memuat kelompok angka yang sama =====
ada(ponsel, "Total · 2 pendana", "kartu total ikut tampil di layar sempit");
for (const pita of ["Dana pendana", "Hasil pendana", "Platform"]) {
  ada(ponsel, pita, `kartu memakai nama pita "${pita}"`);
}
ada(ponsel, "Dibukukan (lunas)", "kartu memisahkan bagian yang sudah dibukukan");
ada(ponsel, "Perkiraan (belum lunas)", "kartu memisahkan bagian perkiraan");
ada(ponsel, "Rp 9.500.000", "kartu memuat dana tersalurkan pendana terkecil");
ada(ponsel, "Rp 16.500.000", "kartu total memuat jumlah kolomnya");
ada(
  ponsel,
  "3 pinjaman · 3 berjalan · 0 lunas",
  "kartu menyebut hitungan pinjaman pendana",
);
ada(
  ponsel,
  "belum ada pinjaman lunas",
  "transfer dijelaskan saat belum ada pinjaman lunas",
);
ada(ponsel, "1 belum dicatat", "kartu menyebut transfer yang belum dicatat");
ada(ponsel, "Saring daftar", "kartu bisa dipakai menyaring daftar pinjaman");
ada(ponsel, "Rincian", "kartu bisa diperluas");
bersih(ponsel, "markup kartu pendana");

// ===== Rincian pembentuk angka perkiraan =====
{
  // Tertutup: rinciannya belum ada di DOM, bukan tampil sebagai bagian kosong.
  takAda(html, "Pembentuk angka perkiraan", "rincian tetap tertutup sebelum dibuka");

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
      onPilih={() => {}}
      rincianPerkiraan={(nama) => (nama === "ROBERT" ? RINCIAN : [])}
    />,
  );
  const tabelRincian = htmlRincian.slice(
    htmlRincian.indexOf("<table"),
    htmlRincian.indexOf("</table>"),
  );

  ada(
    tabelRincian,
    "8 pinjaman · 7 berjalan · 1 lunas",
    "hitungan pinjaman sudah terbaca di barisnya sendiri",
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
  // Barisnya sudah membawa jumlahnya, jadi jumlah itu tidak perlu dihitung
  // sendiri oleh pembaca.
  ada(tabelRincian, "Rp 1.410.000", "jumlah baris rincian dicetak");
  for (const p of RINCIAN) {
    ada(
      tabelRincian,
      `${p.nomorReferensi} · ${p.namaLengkap.toUpperCase()}`,
      `baris rincian ${p.nomorReferensi}`,
    );
  }
  ada(
    tabelRincian,
    "Biaya platform (layanan) dibukukan",
    "rincian memecah biaya platform yang dibukukan",
  );
  ada(
    tabelRincian,
    "Biaya platform (layanan) perkiraan",
    "rincian memecah biaya platform yang perkiraan",
  );
  ada(tabelRincian, "Saring daftar", "rincian bisa menyaring daftar pinjaman");
  // Angka yang sudah berdiri di kolomnya tidak diulang sebagai daftar di sini.
  takAda(
    tabelRincian,
    "Pinjaman (total · aktif · lunas)",
    "rincian tidak mengulang hitungan yang sudah ada di barisnya",
  );

  // Invarian yang dijanjikan catatan di rincian: jumlah barisnya = angka perkiraan.
  const jumlah = RINCIAN.reduce((total, p) => total + p.keuntunganPendana, 0);
  eq(
    jumlah,
    ROBERT.keuntunganPendanaBelumLunas,
    "jumlah rincian sama dengan angka perkiraannya",
  );

  // Lampiran rincian tidak menggeser angka yang sudah dibukukan.
  ada(
    tabelRincian,
    "Rp 235.000",
    "angka yang sudah dibukukan tetap terpisah di rincian",
  );
  bersih(htmlRincian, "markup tabel dengan rincian terbuka");
}

// ===== Penyaringan + penyamaran nama =====
{
  const htmlSamar = renderToStaticMarkup(
    <TabelPendana rekap={REKAP} namaTampil={() => "PENDANA-01"} />,
  );
  ada(htmlSamar, "PENDANA-01", "nama pendana tampil tersamar");
  takAda(
    htmlSamar,
    "ROBERT",
    "nama pendana penuh tidak tercetak saat penyamaran dipakai",
  );

  const htmlAktif = renderToStaticMarkup(
    <TabelPendana
      rekap={REKAP}
      aktif="ROBERT"
      bukaAwal={["ROBERT"]}
      onPilih={() => {}}
    />,
  );
  ada(
    htmlAktif,
    "Lepas saringan",
    "pendana yang sedang menyaring ditandai tombolnya",
  );
  ada(
    htmlAktif,
    'aria-pressed="true"',
    "keadaan menyaring diumumkan ke pembaca layar",
  );
  ada(
    htmlAktif,
    "sedang disaring",
    "baris yang sedang menyaring ditandai di namanya",
  );
  bersih(htmlAktif, "markup tabel dengan saringan aktif");
}

// ===== Tanpa pendana: keadaan kosong, bukan tabel kosong =====
{
  const htmlKosong = renderToStaticMarkup(<TabelPendana rekap={[]} />);
  ada(
    htmlKosong,
    "Belum ada dana tersalurkan pada pendana mana pun.",
    "keadaan kosong dijelaskan",
  );
  takAda(
    htmlKosong,
    "<table",
    "tanpa pendana, tidak ada tabel kosong yang dirender",
  );
  bersih(htmlKosong, "markup keadaan kosong");
}

console.log(`TabelPendana.render.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
