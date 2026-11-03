import { readFileSync } from "node:fs";

import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";

import { FORM_HREF } from "@/components/informasi/InfoShell";
import Layanan from "./Layanan";

let passed = 0;
let failed = 0;

function check(condition: boolean, label: string): void {
  if (condition) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

const html = renderToStaticMarkup(
  <MemoryRouter initialEntries={["/layanan"]}>
    <Layanan />
  </MemoryRouter>,
);

check(html.includes("Tiga layanan."), "halaman menampilkan judul indeks");
check(
  html.includes("Satu keputusan yang jelas."),
  "halaman menampilkan frasa penekanan hero",
);
for (const [href, label] of [
  ["/layanan/pinjaman-tunai", "Pinjaman tunai"],
  ["/layanan/gadai", "Gadai"],
  ["/layanan/kredit-barang", "Kredit barang"],
] as const) {
  check(html.includes(`href="${href}"`), `${label} ditautkan dari indeks`);
  check(html.includes(label), `${label} tampil sebagai kartu`);
}
check(html.includes('href="/biaya"'), "CTA hitung biaya menuju kalkulator");
check(
  html.includes(`href="${FORM_HREF}"`),
  "CTA pengajuan membawa tujuan formulir setelah masuk",
);
check(
  html.includes("Kalkulator biaya bisa dipakai tanpa akun."),
  "halaman menjelaskan kalkulator tidak memerlukan akun",
);
check(
  html.includes("Citra Kebun Mas, Karawang") &&
    html.includes("mailto:support@pindai.biz.id"),
  "footer indeks memuat alamat dan email resmi",
);
check(
  !html.includes("undefined") && !html.includes("NaN"),
  "tidak ada nilai mentah yang bocor ke halaman",
);

const main = readFileSync(new URL("../main.tsx", import.meta.url), "utf8");
const routeIndex = main.indexOf('<Route path="/layanan" element={<Layanan />} />');
const detailIndex = main.indexOf('path="/layanan/pinjaman-tunai"');
check(routeIndex !== -1, "rute /layanan terdaftar di router");
check(
  routeIndex !== -1 && detailIndex !== -1 && routeIndex < detailIndex,
  "rute /layanan tidak tertimpa rute detail",
);
check(
  main.includes('const Layanan = lazy(denganPercobaan(() => import("./pages/Layanan")));'),
  "halaman indeks dimuat lazy seperti halaman publik lain",
);

console.log(`Layanan.render.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
