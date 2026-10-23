/**
 * Uji render bagian syariah yang murni.
 * Run: bun src/pages/dashboard/syariah.render.test.tsx
 *
 * Yang dijaga: ketiga akad selalu ditawarkan, pilihan aktif ditandai untuk
 * pembaca layar, angka pratinjau berasal dari mesin akad (bukan ditulis ulang
 * di JSX), dan tidak ada nilai kosong yang bocor ke markup.
 */
import { renderToStaticMarkup } from "react-dom/server";

import { rencanaAkadSyariah } from "@/lib/syariah/akad";

import {
  KartuPilihanAkad,
  LencanaStatusSyariah,
  PratinjauAkadSyariah,
} from "./syariah-views";

let lulus = 0;
let gagal = 0;
function ok(syarat: boolean, label: string): void {
  if (syarat) lulus += 1;
  else {
    gagal += 1;
    console.error(`FAIL ${label}`);
  }
}
function ada(html: string, teks: string, label: string): void {
  ok(html.includes(teks), `${label} (memuat "${teks}")`);
}
function bersih(html: string, label: string): void {
  ok(!html.includes("undefined"), `${label} tanpa "undefined"`);
  ok(!html.includes("NaN"), `${label} tanpa "NaN"`);
  ok(!html.includes("[object Object]"), `${label} tanpa objek mentah`);
}

// ===== Pemilih akad =====
{
  const html = renderToStaticMarkup(
    <KartuPilihanAkad nilai="murabahah" onPilih={() => undefined} />,
  );
  ada(html, "Murabahah", "akad Murabahah tampil");
  ada(html, "Rahn", "akad Rahn tampil");
  ada(html, "Qardh", "akad Qardh tampil");
  ada(html, "Kredit barang", "ringkasan Murabahah tampil");
  ada(html, "Gadai syariah", "ringkasan Rahn tampil");
  ada(html, "Pinjaman kebajikan", "ringkasan Qardh tampil");
  ok(
    /aria-pressed="true"[^>]*>[\s\S]*?Murabahah/.test(html) ||
      /Murabahah[\s\S]*?aria-pressed="true"/.test(html),
    "akad terpilih ditandai aria-pressed",
  );
  ok(
    (html.match(/aria-pressed="true"/g) ?? []).length === 1,
    "hanya satu akad yang aktif",
  );
  bersih(html, "pemilih akad");
}

// ===== Pratinjau Murabahah =====
{
  const rencana = rencanaAkadSyariah({
    jenis: "murabahah",
    pokok: 1_000_000,
    marginPersen: 15,
  });
  const html = renderToStaticMarkup(<PratinjauAkadSyariah rencana={rencana} />);
  ada(html, "Rp 1.150.000", "total kewajiban Murabahah");
  ada(html, "Rp 150.000", "margin Murabahah");
  ada(html, "Rp 12.000", "ujrah pengelola Murabahah");
  ada(html, "Rp 1.138.000", "nibah pendana Murabahah");
  bersih(html, "pratinjau Murabahah");
}

// ===== Pratinjau Rahn =====
{
  const rencana = rencanaAkadSyariah({
    jenis: "rahn",
    pokok: 1_500_000,
    nilaiTaksiran: 2_000_000,
    tenorHari: 30,
  });
  const html = renderToStaticMarkup(<PratinjauAkadSyariah rencana={rencana} />);
  ada(html, "Rp 40.000", "ujrah Rahn 2% dari taksiran");
  ada(html, "Rp 1.540.000", "total kewajiban Rahn");
  ada(html, "Ujrah 2% per 30 hari × 1", "jumlah siklus Rahn");
  bersih(html, "pratinjau Rahn");
}

// ===== Pratinjau Qardh =====
{
  const rencana = rencanaAkadSyariah({ jenis: "qardh", pokok: 1_000_000 });
  const html = renderToStaticMarkup(<PratinjauAkadSyariah rencana={rencana} />);
  ada(html, "Rp 1.000.000", "total kewajiban Qardh = pokok");
  ada(html, "Rp 0", "Qardh tanpa margin");
  bersih(html, "pratinjau Qardh");
}

// ===== Lencana status =====
{
  const menunggu = renderToStaticMarkup(
    <LencanaStatusSyariah status="diajukan" />,
  );
  const setuju = renderToStaticMarkup(
    <LencanaStatusSyariah status="disetujui" />,
  );
  const tolak = renderToStaticMarkup(<LencanaStatusSyariah status="ditolak" />);
  ada(menunggu, "Menunggu keputusan", "status menunggu");
  ada(setuju, "Disetujui", "status disetujui");
  ada(tolak, "Ditolak", "status ditolak");
}

console.log(`syariah render: ${lulus}/${lulus + gagal} lulus`);
if (gagal > 0) process.exit(1);
