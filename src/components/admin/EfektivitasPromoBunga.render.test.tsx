/**
 * Uji gambar grafik tren promo (murni, tanpa Convex).
 * Run: bun src/components/admin/EfektivitasPromoBunga.render.test.tsx
 */
import { renderToStaticMarkup } from "react-dom/server";

import { OFFSET_WIB_MS } from "@/lib/waktu";

import { GrafikTrenPromo } from "./EfektivitasPromoBunga";

let lulus = 0;
let gagal = 0;

function ok(syarat: boolean, label: string): void {
  if (syarat) lulus += 1;
  else {
    gagal += 1;
    console.error(`FAIL ${label}`);
  }
}

function wib(tahun: number, bulan: number, hari: number): number {
  return Date.UTC(tahun, bulan - 1, hari) - OFFSET_WIB_MS;
}

const html = renderToStaticMarkup(
  <GrafikTrenPromo
    tren={[
      { mulai: wib(2026, 10, 19), pinjaman: 2, subsidi: 300_000 },
      { mulai: wib(2026, 10, 26), pinjaman: 1, subsidi: 450_000 },
    ]}
  />,
);

ok(html.includes("<svg"), "grafik dirender sebagai SVG");
ok((html.match(/<rect/g) ?? []).length === 2, "satu batang per minggu");
ok(html.includes("19 Okt"), "label minggu pertama terbaca");
ok(html.includes("26 Okt"), "label minggu kedua terbaca");
ok(html.includes("Rp450rb"), "sumbu memakai ringkasan rupiah");
ok(html.includes(">2</text>"), "jumlah pinjaman tercetak di atas batang");
ok(!html.includes("NaN"), "tidak ada NaN di gambar");
ok(!html.includes("undefined"), "tidak ada undefined di gambar");
ok(!html.includes("Infinity"), "tidak ada Infinity di gambar");

const kosong = renderToStaticMarkup(<GrafikTrenPromo tren={[]} />);
ok(!kosong.includes("NaN"), "tren kosong tidak menghasilkan NaN");

const jumlah = lulus + gagal;
console.log(`GrafikTrenPromo.test: ${lulus}/${jumlah} lulus`);
if (gagal > 0) process.exit(1);
