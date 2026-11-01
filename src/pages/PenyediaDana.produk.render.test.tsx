/**
 * Uji tab Produk yang sudah dilepas dari ruang penyedia dana.
 * Run: bun src/pages/PenyediaDana.produk.render.test.tsx
 *
 * Penjelasan produk dan simulator tidak lagi ditampilkan sebagai tab di ruang
 * pendana: pendana membaca pinjaman yang benar-benar ada di portofolionya,
 * termasuk tenor di bawah 30 hari. Halaman utuh butuh sesi Convex, jadi sumber
 * halaman diperiksa supaya tab itu tidak kembali tanpa sengaja. Dua bagian
 * presentasionalnya tetap diuji karena masih dipakai di layar lain.
 */
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";

import { PilihanProduk } from "../components/landing/PilihanProduk";
import { SimulatorPendanaan } from "../components/penyediaDana/SimulatorPendanaan";

let lulus = 0;
let gagal = 0;
function cek(syarat: boolean, label: string): void {
  if (syarat) lulus += 1;
  else {
    gagal += 1;
    console.error(`FAIL ${label}`);
  }
}
const ada = (html: string, teks: string, label: string) =>
  cek(html.includes(teks), `${label} (memuat "${teks}")`);

const halaman = readFileSync("src/pages/PenyediaDana.tsx", "utf8");
// Bagian ringkas (siklus & nisbah syariah) kini punya berkas sendiri supaya
// query-nya bisa dibatasi galatnya; sumbernya tetap diperiksa di sini.
const ringkas = readFileSync(
  "src/pages/penyedia-dana/bagian-ringkas.tsx",
  "utf8",
);

// ===== Tab produk sudah tidak ada di halaman =====
cek(
  !halaman.includes('value="produk"'),
  "pemicu tab Produk tidak lagi dipasang",
);
cek(
  !halaman.includes("TabsContent value=\"produk\""),
  "isi tab Produk tidak lagi punya wadah",
);
cek(
  !halaman.includes("SimulatorPendanaan") &&
    !halaman.includes("<PilihanProduk"),
  "simulator dan kartu produk tidak dirender di ruang pendana",
);
cek(
  !halaman.includes("Akad syariah masih skema pada Fase 1"),
  "penjelasan lingkup produk tidak tersisa di halaman",
);

// ===== Proyeksi nisbah syariah di ringkasan atas =====
cek(
  ringkas.includes("api.syariahAkad.proyeksiPendanaSaya"),
  "proyeksi nisbah syariah dibaca dari server",
);
cek(
  ringkas.includes('label="Nisbah syariah (perkiraan)"'),
  "baris nisbah syariah tampil di ringkasan",
);
cek(
  /isPendana\s*&&\s*\(\s*<BatasBagian nama="nisbah syariah">/.test(halaman),
  "proyeksi syariah hanya diminta untuk akun pendana",
);
cek(
  halaman.includes("imbal konvensional atas pinjaman yang masih berjalan"),
  "estimasi konvensional dibedakan dari nisbah syariah",
);

// ===== Kartu pilihan produk =====
{
  const html = renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: ["/dashboard"] },
      createElement(PilihanProduk, { ringkas: true }),
    ),
  );
  ada(html, "Pembiayaan konvensional", "kartu konvensional tampil");
  ada(html, "Pembiayaan syariah", "kartu syariah tampil");
  ada(html, "Murabahah", "akad Murabahah disebut");
  ada(html, "Rahn", "akad Rahn disebut");
  cek(!html.includes("Qardh"), "akad Qardh tidak lagi ditawarkan");
  ada(html, "Harian 7–50 hari", "ringkasan tenor konvensional");
  ada(html, 'href="/pinjaman/konvensional"', "tautan produk konvensional");
  ada(html, 'href="/pinjaman/syariah"', "tautan produk syariah");
  cek(!html.includes("undefined"), "kartu produk tanpa nilai kosong");
}

// ===== Simulator empat akad (dipakai di layar lain) =====
{
  const html = renderToStaticMarkup(
    createElement(SimulatorPendanaan, { persenPotonganAdmin: 5 }),
  );
  for (const akad of ["Konvensional", "Murabahah", "Rahn"]) {
    ada(html, akad, `simulator menyediakan akad "${akad}"`);
  }
  cek(!html.includes("Qardh"), "simulator tidak lagi menyediakan Qardh");
  ada(
    html,
    "Porsi pendana 78.33% dari marjin pinjaman",
    "porsi pendana dinyatakan",
  );
  ada(html, "Rp 1.235.000", "angka konvensional dihitung dari lib");
  ada(html, "Estimasi, bukan jaminan.", "simulator tidak menjanjikan hasil");
}

const jumlah = lulus + gagal;
console.log(`PenyediaDana.produk.render.test: ${lulus}/${jumlah} lulus`);
if (gagal > 0) process.exit(1);
