/**
 * Uji render kalkulator dan tabel portofolio pendanaan.
 * Run: bun src/components/penyediaDana/KalkulatorImbalPendana.render.test.tsx
 *
 * Yang dijaga: kalkulator memakai rumus tetap (pokok × 30%), tabel menampilkan
 * tenor "30 Hari" dan yield "30% p.p." untuk semua baris, biaya platform
 * dihitung dari total kembali (bukan dari imbal saja), penerimaan dan
 * keuntungan bersih bisa dicocokkan sendiri, keterlambatan terbaca sebagai
 * badge, rincian baris menjumlah dengan benar, saringan serta batas baris
 * bekerja, dan rincian tenor nasabah tidak bocor ke UI pendana.
 */
import { renderToStaticMarkup } from "react-dom/server";

import {
  KalkulatorImbalPendana,
  TabelPortofolioPendanaan,
  type BarisPortofolioPendanaan,
} from "./KalkulatorImbalPendana";

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
function tidakAda(html: string, teks: string, label: string): void {
  ok(!html.includes(teks), `${label} (tidak memuat "${teks}")`);
}
function bersih(html: string, label: string): void {
  ok(!html.includes("undefined"), `${label} tanpa "undefined"`);
  ok(!html.includes("[object Object]"), `${label} tanpa "[object Object]"`);
  ok(!html.includes("NaN"), `${label} tanpa "NaN"`);
}

let urut = 0;
function baris(over: Partial<BarisPortofolioPendanaan> = {}): BarisPortofolioPendanaan {
  urut += 1;
  return {
    id: `baris-${urut}`,
    nomorReferensi: `PND-${urut}`,
    pokok: 1_000_000,
    imbalHasil: 300_000,
    status: "Berjalan",
    tanggalReturn: null,
    statusPelunasan: "berjalan",
    hariTerlambat: 0,
    sisaHari: null,
    ...over,
  };
}

// ===== Kalkulator =====
{
  const html = renderToStaticMarkup(
    <KalkulatorImbalPendana nominalAwal={1_000_000} />,
  );
  ada(html, "Estimasi pendanaan", "judul kalkulator");
  ada(html, "Tenor pendana tetap 30 hari", "tenor tetap dinyatakan");
  ada(html, "30% flat", "yield flat dinyatakan");
  ada(html, "30 Hari · contoh 30% p.p.", "label tenor dan yield tampil");
  ada(html, "Rp 300.000", "imbal hasil 30% dihitung");
  ada(html, "Rp 1.300.000", "total pengembalian 130%");
  ada(html, "Rp 65.000", "biaya platform 5% dari total kembali dihitung terpisah");
  ada(html, "Rp 1.235.000", "diterima bersih setelah biaya");
  ada(html, "Estimasi, bukan jaminan.", "sifat estimasi dinyatakan");
  ada(html, "Perpanjangan atau cicil pokok", "keterpisahan dijelaskan");
  tidakAda(html, "7 hari", "tenor nasabah tidak tampil");
  tidakAda(html, "14 hari", "tenor nasabah tidak tampil");
  tidakAda(html, "28 hari", "tenor nasabah tidak tampil");
  bersih(html, "kalkulator");
}

// ===== Tabel portofolio =====
{
  const html = renderToStaticMarkup(
    <TabelPortofolioPendanaan
      rows={[
        baris({
          id: "a",
          nomorReferensi: "PND-1",
          tanggalReturn: new Date(2026, 9, 31, 12).getTime(),
          sisaHari: 3,
        }),
        baris({
          id: "b",
          nomorReferensi: "PND-2",
          pokok: 500_000,
          imbalHasil: 150_000,
          status: "Selesai",
          statusPelunasan: "lancar",
          tanggalReturn: null,
        }),
      ]}
    />,
  );
  for (const judul of [
    "Pinjaman",
    "Nominal",
    "Tenor",
    "Yield pendana",
    "Imbal bruto",
    "Porsi platform (21,67%)",
    "Diterima bersih",
    "Keuntungan bersih",
    "Proyeksi return",
    "Status",
  ]) {
    ada(html, judul, `kolom "${judul}" ada`);
  }
  ok((html.match(/30 Hari/g) ?? []).length >= 2, "setiap baris memakai tenor 30 Hari");
  ok((html.match(/30% p\.p\./g) ?? []).length >= 2, "setiap baris memakai yield 30% p.p.");
  ada(html, "PND-1", "nomor referensi tampil");
  ada(html, "Rp 300.000", "imbal bruto tampil");
  ada(html, "Rp 65.000", "biaya platform 5% dari total kembali dihitung per baris");
  ada(html, "Rp 1.235.000", "diterima bersih per baris");
  ada(html, "Rp 235.000", "keuntungan bersih per baris");
  ada(html, "Rp 32.500", "baris kedua memakai tarif yang sama");
  ada(html, "Rp 617.500", "penerimaan bersih baris kedua");
  ada(html, "Rp 117.500", "keuntungan bersih baris kedua");
  ada(html, "Total", "baris total ada");
  ada(html, "Rp 97.500", "total biaya platform dijumlahkan dari baris");
  ada(html, "Rp 1.852.500", "total diterima bersih dijumlahkan dari baris");
  ada(html, "Rp 352.500", "total keuntungan bersih dijumlahkan dari baris");
  ok(
    (html.match(/efektif 23,5%/g) ?? []).length >= 2,
    "yield efektif dihitung dari keuntungan bersih, bukan yield bruto",
  );
  ada(html, "Jatuh tempo 3 hari lagi", "jatuh tempo dekat terbaca sebagai badge");
  ada(html, "Berjalan", "status berjalan tampil");
  ada(html, "Selesai", "status selesai tampil");
  ada(html, "31 Okt 2026", "proyeksi tanggal return memakai jatuh tempo");
  ada(html, 'scope="col"', "kepala tabel punya cakupan kolom");
  ada(html, "<caption", "tabel punya keterangan untuk pembaca layar");
  bersih(html, "tabel portofolio");
}

// ===== Alokasi tanpa jatuh tempo =====
{
  const html = renderToStaticMarkup(
    <TabelPortofolioPendanaan
      rows={[
        baris({
          id: "c",
          nomorReferensi: "PND-3",
          pokok: 100_000,
          imbalHasil: 30_000,
          status: "Menunggu",
          statusPelunasan: "berjalan",
          tanggalReturn: null,
        }),
      ]}
    />,
  );
  ada(html, "Belum ada", "baris tanpa jatuh tempo tidak menampilkan tanggal palsu");
}

// ===== Porsi platform tetap 13/60, tidak mengikuti tarif biaya lama =====
{
  const html = renderToStaticMarkup(
    <TabelPortofolioPendanaan
      rows={[
        baris({
          id: "d",
          nomorReferensi: "PND-4",
          tanggalReturn: null,
        }),
      ]}
    />,
  );
  ada(html, "Porsi platform (21,67%)", "porsi platform tetap");
  ada(html, "Rp 65.000", "porsi platform dihitung dari marjin");
  ada(html, "Rp 1.235.000", "penerimaan bersih tidak berubah");
  ada(html, "Rp 235.000", "keuntungan bersih tidak berubah");
}

// ===== Keterlambatan dan saringan menunggak =====
{
  const rows = [
    baris({
      id: "telat",
      nomorReferensi: "PND-TELAT",
      hariTerlambat: 12,
      sisaHari: -12,
      statusPelunasan: "menunggak",
    }),
    baris({
      id: "hari-ini",
      nomorReferensi: "PND-HARI",
      sisaHari: 0,
    }),
    baris({
      id: "lunas",
      nomorReferensi: "PND-LUNAS",
      status: "Selesai",
      statusPelunasan: "lancar",
    }),
  ];
  const semua = renderToStaticMarkup(
    <TabelPortofolioPendanaan rows={rows} />,
  );
  ada(semua, "Terlambat 12 hari", "keterlambatan terbaca sebagai badge merah");
  ada(semua, "Jatuh tempo hari ini", "jatuh tempo hari ini terbaca");
  ada(semua, "Semua", "saringan semua tersedia");
  ada(semua, "Berjalan", "saringan berjalan tersedia");
  ada(semua, "Selesai", "saringan selesai tersedia");
  ada(semua, "Menunggak", "saringan menunggak tersedia");

  const menunggak = renderToStaticMarkup(
    <TabelPortofolioPendanaan rows={rows} saringAwal="menunggak" />,
  );
  ada(menunggak, "PND-TELAT", "saringan menunggak menampilkan pinjaman terlambat");
  tidakAda(menunggak, "PND-HARI", "saringan menunggak menyembunyikan yang belum lewat");
  tidakAda(menunggak, "PND-LUNAS", "saringan menunggak menyembunyikan yang sudah lunas");
  ada(menunggak, "1–1 dari 1 alokasi", "jumlah baris mengikuti saringan");
  ada(menunggak, "Total", "baris total mengikuti saringan");
}

// ===== Rincian baris yang dibuka =====
{
  const html = renderToStaticMarkup(
    <TabelPortofolioPendanaan
      bukaAwal={["a"]}
      rows={[
        baris({
          id: "a",
          nomorReferensi: "PND-RINCI",
          status: "Selesai",
          statusPelunasan: "lancar",
        }),
      ]}
    />,
  );
  ada(html, 'aria-expanded="true"', "tombol rincian menyatakan keadaannya");
  ada(html, 'id="rincian-portofolio-a"', "baris rincian punya sasaran aria");
  ada(
    html,
    "Pokok Rp 1.000.000 + imbal Rp 300.000 = Rp 1.300.000",
    "rincian menjumlahkan pokok dan imbal",
  );
  ada(html, "Porsi platform 13/60 dihitung dari marjin", "rincian menjelaskan dasar porsi platform");
  ada(html, "Sudah dibukukan.", "rincian pinjaman selesai menyatakan pembukuan");
}

// ===== Rincian pinjaman yang masih berjalan tidak mengklaim lunas =====
{
  const html = renderToStaticMarkup(
    <TabelPortofolioPendanaan
      bukaAwal={["a"]}
      rows={[baris({ id: "a", nomorReferensi: "PND-JALAN" })]}
    />,
  );
  ada(html, "Masih perkiraan sampai pinjaman lunas.", "rincian berjalan jujur soal statusnya");
  tidakAda(html, "Sudah dibukukan.", "pinjaman berjalan tidak disebut sudah dibukukan");
}

// ===== Batas baris dan halaman =====
{
  const rows = Array.from({ length: 12 }, (_, i) =>
    baris({
      id: `p-${i + 1}`,
      nomorReferensi: `PND-A${String(i + 1).padStart(2, "0")}`,
    }),
  );
  const html = renderToStaticMarkup(
    <TabelPortofolioPendanaan rows={rows} />,
  );
  ada(html, "1–10 dari 12 alokasi", "halaman pertama memuat sepuluh baris");
  ada(html, "Halaman 1 / 2", "jumlah halaman dihitung");
  ada(html, "PND-A10", "baris kesepuluh tampil");
  tidakAda(html, "PND-A11", "baris kesebelas menunggu halaman berikutnya");
  tidakAda(html, "PND-A12", "baris kedua belas menunggu halaman berikutnya");
  ada(html, "Total", "total dihitung dari seluruh baris tersaring, bukan satu halaman");
  ada(html, "Rp 12.000.000", "total nominal mencakup dua belas alokasi");

  const lebar = renderToStaticMarkup(
    <TabelPortofolioPendanaan rows={rows} batasAwal={25} />,
  );
  ada(lebar, "PND-A12", "batas 25 menampilkan semua baris");
  ada(lebar, "1–12 dari 12 alokasi", "rentang baris menyesuaikan batas");
  tidakAda(lebar, "Halaman 1 / 2", "satu halaman tidak menampilkan navigasi");
}

// ===== Keadaan kosong =====
{
  const html = renderToStaticMarkup(
    <TabelPortofolioPendanaan rows={[]} />,
  );
  ada(html, "Belum ada pendanaan", "keadaan kosong menjelaskan sebabnya");
  ada(html, "setelah alokasi dana dicatat", "keadaan kosong memberi langkah berikutnya");
  bersih(html, "tabel kosong");
}

console.log(`KalkulatorImbalPendana.render.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
