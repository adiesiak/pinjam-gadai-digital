/**
 * Uji tab Produk di ruang penyedia dana.
 * Run: bun src/pages/PenyediaDana.produk.render.test.tsx
 *
 * Halaman utuh butuh sesi Convex, jadi yang diperiksa di sini: sambungan tabnya
 * di sumber halaman (pemicu, isi, dan penyaring yang tidak ikut tampil), lalu
 * dua bagian presentasional yang benar-benar dirender di tab itu — kartu pilihan
 * produk dan simulator empat akad.
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

// ===== Sambungan tab di halaman =====
cek(
  halaman.includes('value="produk"'),
  "pemicu tab Produk terpasang",
);
cek(
  halaman.includes("<TabsContent value=\"produk\""),
  "isi tab Produk punya wadahnya",
);
cek(
  halaman.includes('import { SimulatorPendanaan }') &&
    halaman.includes("<SimulatorPendanaan"),
  "simulator pendanaan dirender di tab Produk",
);
cek(
  halaman.includes('import { PilihanProduk }') &&
    halaman.includes("<PilihanProduk ringkas"),
  "kartu pilihan produk dirender di tab Produk",
);
cek(
  halaman.includes('tab !== "produk"'),
  "penyaring daftar pengajuan tidak tampil di tab Produk",
);
cek(
  halaman.includes("Akad syariah masih skema pada Fase 1"),
  "tab menyatakan lingkup Fase 1 apa adanya",
);

// ===== Proyeksi nisbah syariah di ringkasan atas =====
cek(
  halaman.includes("api.syariahAkad.proyeksiPendanaSaya"),
  "proyeksi nisbah syariah dibaca dari server",
);
cek(
  halaman.includes('label="Nisbah syariah (perkiraan)"'),
  "baris nisbah syariah tampil di ringkasan",
);
cek(
  halaman.includes("!isPendana ? (\"skip\" as const)"),
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
  ada(html, "Harian 7/14/21/28 hari", "ringkasan tenor konvensional");
  ada(html, 'href="/pinjaman/konvensional"', "tautan produk konvensional");
  ada(html, 'href="/pinjaman/syariah"', "tautan produk syariah");
  cek(!html.includes("undefined"), "kartu produk tanpa nilai kosong");
}

// ===== Simulator di dalam tab =====
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
