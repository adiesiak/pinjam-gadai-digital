/**
 * Run: bun src/components/admin/QcPanel.render.test.tsx
 *
 * Uji render QcPanel lewat react-dom/server (tanpa DOM, tanpa browser):
 * memastikan seluruh keadaan panel — memuat, lulus bersih, lulus berperingatan,
 * dan gagal — menghasilkan markup yang benar-benar terbaca, termasuk angka
 * rupiah dan lencana status. Ini satu-satunya "jendela" ke tampilan halaman
 * /qc di lingkungan tanpa browser.
 */
import { renderToStaticMarkup } from "react-dom/server";

import { QcPanel } from "./QcPanel";
import { GRUP_QC, type CekQc, type HasilQc, type StatusCekQc } from "@/lib/qcKonsistensi";

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
}

function cek(id: string, grup: string, status: StatusCekQc, judul: string, detail: string, nilai: string[]): CekQc {
  return { id, grup, judul, status, detail, nilai };
}

/** Hasil buatan yang mencakup keempat status dan ketiga grup. */
function hasil(cacat: boolean): HasilQc {
  const cekList: CekQc[] = [
    cek("c", GRUP_QC[0], "lulus", "Pembagian Imbal Hasil tiap baris kembali utuh", "1 baris pinjaman: potongan admin + keuntungan penyedia = Imbal Hasil.", ["Imbal Hasil Rp 300.000", "potongan admin Rp 15.000"]),
    cek("d", GRUP_QC[0], "awas", "Angka baris identik dengan hitung ulang kebijakan berjalan", "1 baris jatuh ke nilai nol karena masukan di luar rentang.", ["bunga 30%"]),
    cek("e", GRUP_QC[1], "lewat", "Jumlah besar panel admin = jumlah besar ruang penyedia dana", "Ditutup oleh pemeriksaan pemetaan di atas.", []),
    cek("f", GRUP_QC[2], cacat ? "gagal" : "lulus", "Kartu keuntungan admin = jumlah potongan pada baris ruang", cacat ? "Kartu admin Rp 0 ≠ jumlah potongan baris Rp 15.000." : "Sudah tercatat Rp 15.000 + belum tercatat Rp 0 = Rp 15.000.", ["tercatat Rp 15.000"]),
  ];
  const ringkasan = {
    lulus: cekList.filter((c) => c.status === "lulus").length,
    gagal: cekList.filter((c) => c.status === "gagal").length,
    awas: cekList.filter((c) => c.status === "awas").length,
    lewat: cekList.filter((c) => c.status === "lewat").length,
    total: cekList.length,
  };
  return { cek: cekList, ringkasan, lulusSemua: ringkasan.gagal === 0 };
}

// ===== 1. Keadaan memuat =====
{
  const html = renderToStaticMarkup(<QcPanel hasil={null} />);
  ada(html, "QC Konsistensi PINDAI", "judul halaman");
  ada(html, "Menjalankan pemeriksaan terhadap data asli", "kabar memuat");
  ada(html, "menjalankan pemeriksaan…", "indikator data");
  for (const g of GRUP_QC) ada(html, g, `grup "${g}" tetap tampil saat memuat`);
  ok(!html.includes("Salin laporan"), "tombol salin tidak ada saat memuat");
  bersih(html, "panel memuat");
}

// ===== 2. Lulus bersih (dengan satu peringatan) =====
{
  const h = hasil(false);
  const html = renderToStaticMarkup(<QcPanel hasil={h} />);
  ada(html, "Lulus dengan 1 peringatan", "kabar lulus berperingatan");
  ada(html, "data langsung · diperbarui otomatis", "indikator data langsung");
  ada(html, "Salin laporan", "tombol salin tersedia");
  ada(html, "Pembagian Imbal Hasil tiap baris kembali utuh", "judul pemeriksaan tampil");
  ada(html, "1 baris pinjaman: potongan admin + keuntungan penyedia = Imbal Hasil.", "detail rupiah tampil");
  ada(html, "Imbal Hasil Rp 300.000", "angka pengamatan tampil");
  ada(html, "peringatan", "lencana peringatan tampil");
  ada(html, "dilewati", "lencana terlewat tampil");
  ada(html, "1/2 lulus", "ringkasan per grup tampil");
  ada(html, "2 lulus", "hitung lulus global tampil");
  bersih(html, "panel lulus");
}

// ===== 3. Suite gagal =====
{
  const h = hasil(true);
  const html = renderToStaticMarkup(<QcPanel hasil={h} />);
  ada(html, "Suite gagal — 1 pemeriksaan dilanggar", "kabar kegagalan");
  ada(html, "GAGAL", "lencana GAGAL tampil");
  ada(html, "Kartu admin Rp 0 ≠ jumlah potongan baris Rp 15.000.", "detail kegagalan tampil");
  ada(html, "1 gagal", "hitung gagal tampil");
  ok(!html.includes("Seluruh pemeriksaan lulus"), "tidak mengklaim lulus saat gagal");
  bersih(html, "panel gagal");
}

console.log(`\nQcPanel.render: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
