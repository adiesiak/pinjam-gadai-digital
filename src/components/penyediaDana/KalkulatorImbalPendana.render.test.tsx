/**
 * Uji render kalkulator dan tabel portofolio pendanaan.
 * Run: bun src/components/penyediaDana/KalkulatorImbalPendana.render.test.tsx
 *
 * Yang dijaga: kalkulator memakai rumus tetap (pokok × 30%), tabel menampilkan
 * tenor "30 Hari" dan yield "30% p.p." untuk semua baris, biaya platform
 * dihitung dari total kembali (bukan dari imbal saja), penerimaan bersih serta
 * baris totalnya bisa dicocokkan sendiri, status pendanaan terbaca sebagai
 * teks, dan rincian tenor nasabah tidak bocor ke UI pendana.
 */
import { renderToStaticMarkup } from "react-dom/server";

import {
  KalkulatorImbalPendana,
  TabelPortofolioPendanaan,
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

// ===== Kalkulator =====
{
  const html = renderToStaticMarkup(
    <KalkulatorImbalPendana persenPotonganAdmin={5} nominalAwal={1_000_000} />,
  );
  ada(html, "Estimasi pendanaan", "judul kalkulator");
  ada(html, "Tenor pendana tetap 30 hari", "tenor tetap dinyatakan");
  ada(html, "30% flat", "yield flat dinyatakan");
  ada(html, "30 Hari · 30% p.p.", "label tenor dan yield tampil");
  ada(html, "Rp 300.000", "imbal hasil 30% dihitung");
  ada(html, "Rp 1.300.000", "total pengembalian 130%");
  ada(html, "Rp 65.000", "biaya platform 5% dari total kembali dihitung terpisah");
  ada(html, "Rp 1.235.000", "diterima bersih setelah biaya");
  ada(html, "Estimasi, bukan jaminan.", "sifat estimasi dinyatakan");
  ada(html, "perpanjangan atau cicil pokok nasabah tidak mengubah", "keterpisahan dijelaskan");
  tidakAda(html, "7 hari", "tenor nasabah tidak tampil");
  tidakAda(html, "14 hari", "tenor nasabah tidak tampil");
  tidakAda(html, "28 hari", "tenor nasabah tidak tampil");
  bersih(html, "kalkulator");
}

// ===== Tabel portofolio =====
{
  const html = renderToStaticMarkup(
    <TabelPortofolioPendanaan
      persenPotonganAdmin={5}
      rows={[
        {
          id: "a",
          nomorReferensi: "PND-1",
          pokok: 1_000_000,
          imbalHasil: 300_000,
          status: "Berjalan",
          tanggalReturn: new Date(2026, 9, 31, 12).getTime(),
        },
        {
          id: "b",
          nomorReferensi: "PND-2",
          pokok: 500_000,
          imbalHasil: 150_000,
          status: "Selesai",
          tanggalReturn: null,
        },
      ]}
    />,
  );
  for (const judul of [
    "Pinjaman",
    "Nominal",
    "Tenor",
    "Yield pendana",
    "Imbal bruto",
    "Biaya platform (5%)",
    "Diterima bersih",
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
  ada(html, "Rp 32.500", "baris kedua memakai tarif yang sama");
  ada(html, "Rp 617.500", "penerimaan bersih baris kedua");
  ada(html, "Total", "baris total ada");
  ada(html, "Rp 97.500", "total biaya platform dijumlahkan dari baris");
  ada(html, "Rp 1.852.500", "total diterima bersih dijumlahkan dari baris");
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
      persenPotonganAdmin={5}
      rows={[
        {
          id: "c",
          nomorReferensi: "PND-3",
          pokok: 100_000,
          imbalHasil: 30_000,
          status: "Menunggu",
          tanggalReturn: null,
        },
      ]}
    />,
  );
  ada(html, "Belum ada", "baris tanpa jatuh tempo tidak menampilkan tanggal palsu");
}

// ===== Tarif biaya mengikuti pengaturan, bukan angka di layar =====
{
  const html = renderToStaticMarkup(
    <TabelPortofolioPendanaan
      persenPotonganAdmin={7}
      rows={[
        {
          id: "d",
          nomorReferensi: "PND-4",
          pokok: 1_000_000,
          imbalHasil: 300_000,
          status: "Berjalan",
          tanggalReturn: null,
        },
      ]}
    />,
  );
  ada(html, "Biaya platform (7%)", "tarif biaya mengikuti pengaturan");
  ada(html, "Rp 91.000", "biaya 7% dari total kembali");
  ada(html, "Rp 1.209.000", "penerimaan bersih pada tarif 7%");
}

// ===== Keadaan kosong =====
{
  const html = renderToStaticMarkup(
    <TabelPortofolioPendanaan persenPotonganAdmin={5} rows={[]} />,
  );
  ada(html, "Belum ada pendanaan", "keadaan kosong menjelaskan sebabnya");
  ada(html, "setelah alokasi dana dicatat", "keadaan kosong memberi langkah berikutnya");
  bersih(html, "tabel kosong");
}

console.log(`KalkulatorImbalPendana.render.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
