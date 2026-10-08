/**
 * Run: bun src/components/admin/LedgerYatimPanel.render.test.tsx
 *
 * Uji render panel "Jurnal tanpa subjek" lewat react-dom/server (tanpa DOM):
 * memastikan tiga keadaan — memuat, bersih, dan ada temuan — menghasilkan
 * markup yang terbaca, termasuk angka rupiah dan sisa saldo akun.
 */
import { renderToStaticMarkup } from "react-dom/server";

import type { KelompokYatim } from "@/lib/ledgerYatim";

import { LedgerYatimPanel } from "./LedgerYatimPanel";

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

const ID = "jd7f8k2m4n6p8r0t2v4x6z8b1d3f5h7j";

const kelompok: KelompokYatim[] = [
  {
    akun: `pinjaman:${ID}`,
    jenis: "pinjaman",
    id: ID,
    jumlahEntri: 3,
    totalDebit: 1_300_000,
    totalKredit: 20_000,
    saldo: 1_280_000,
    waktuTerakhir: 1_700_000_000_000,
    keteranganTerakhir: "Pelunasan PGD-1",
    grup: ["GRP-1", "GRP-2"],
  },
];

// ===== 1. Keadaan memuat =====
{
  const html = renderToStaticMarkup(<LedgerYatimPanel data={undefined} />);
  ada(html, "Memeriksa jurnal tanpa subjek", "indikator memuat");
  ok(!html.includes("Bersih"), "belum mengklaim bersih saat data belum ada");
  bersih(html, "panel memuat");
}

// ===== 2. Bersih =====
{
  const html = renderToStaticMarkup(
    <LedgerYatimPanel data={{ akun: 0, entri: 0, nilai: 0, kelompok: [] }} />,
  );
  ada(html, "Jurnal tanpa subjek", "judul panel");
  ada(html, "Bersih", "lencana bersih");
  ada(html, "Semua entri jurnal menunjuk data yang masih ada.", "pesan kosong yang jujur");
  bersih(html, "panel bersih");
}

// ===== 3. Ada temuan =====
{
  const html = renderToStaticMarkup(
    <LedgerYatimPanel data={{ akun: 1, entri: 3, nilai: 1_300_000, kelompok }} />,
  );
  ada(html, "1 akun", "jumlah akun yatim");
  ada(html, "Rp 1.300.000", "nilai debit ditampilkan");
  ada(html, `pinjaman:${ID}`, "nama akun ditampilkan");
  ada(html, "Pinjaman", "jenis subjek berlabel");
  ada(html, "3 entri", "jumlah entri per akun");
  ada(html, "saldo Rp 1.280.000", "sisa saldo akun ditampilkan");
  ada(html, "Pelunasan PGD-1", "keterangan terakhir ditampilkan");
  ada(html, "GRP-1", "grup jurnal bisa ditelusuri");
  ok(!html.includes("Semua entri jurnal menunjuk data yang masih ada."), "tidak mengklaim bersih");
  bersih(html, "panel temuan");
}

console.log(`\nLedgerYatimPanel.render: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
