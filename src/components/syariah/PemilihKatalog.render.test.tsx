/**
 * Uji render pemilih katalog Murabahah.
 * Run: bun src/components/syariah/PemilihKatalog.render.test.tsx
 *
 * Yang dijaga: barang di atas sisa plafon tetap terlihat tetapi ditandai
 * alasannya, produk pulsa/PPOB dibedakan dari barang fisik, dan barang yang
 * sedang dipilih ditandai — tiga hal yang menentukan apakah peminjam mengerti
 * kenapa satu barang tidak bisa dipilih.
 */
import { renderToStaticMarkup } from "react-dom/server";

import { KATALOG_MURABAHAH } from "@/lib/syariah/katalog";

import { PemilihKatalog } from "./PemilihKatalog";

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

const hemat = renderToStaticMarkup(
  <PemilihKatalog
    daftar={KATALOG_MURABAHAH}
    nilai="tl-token-200"
    batasHarga={300_000}
    onPilih={() => {}}
  />,
);

ada(hemat, "Semua", "chip kategori semua tampil");
ada(hemat, "Peralatan usaha", "kategori peralatan usaha tampil");
ada(hemat, "Pulsa &amp; data", "kategori pulsa tampil");
ada(hemat, "Setrika uap 1.800 W", "barang fisik tampil");
ada(hemat, "Rp 350.000", "harga barang tampil");
ada(hemat, "Pulsa / PPOB", "produk digital diberi label");
ada(hemat, "Token listrik 500.000", "barang mahal tetap terlihat");
ada(hemat, "Melebihi sisa plafon", "barang di atas plafon diberi alasan");
ada(hemat, 'aria-pressed="true"', "barang terpilih ditandai");
ada(hemat, "harga pokok dari mitra", "harga pokok dijelaskan");
bersih(hemat, "katalog dengan batas plafon");

const lega = renderToStaticMarkup(
  <PemilihKatalog
    daftar={KATALOG_MURABAHAH}
    nilai={null}
    batasHarga={10_000_000}
    onPilih={() => {}}
  />,
);
ok(
  !lega.includes("Melebihi sisa plafon"),
  "tanpa batas plafon tidak ada barang yang diblokir",
);
ada(lega, "Cari barang, mis. mesin jahit atau token", "kolom cari tampil");
bersih(lega, "katalog tanpa batas plafon");

const kosong = renderToStaticMarkup(
  <PemilihKatalog daftar={[]} nilai={null} batasHarga={500_000} onPilih={() => {}} />,
);
ada(kosong, "Katalog belum tersedia", "katalog kosong dijelaskan");
bersih(kosong, "katalog kosong");

console.log(`PemilihKatalog.render: ${passed}/${passed + failed} lulus`);
if (failed > 0) process.exit(1);
