/**
 * Harness render panel Template Website (SSR, tanpa browser).
 * Run: bun scripts/qa-template-panel.ts
 *
 * Sengaja skrip, bukan `*.render.test.tsx`: skrip QA dirender dengan `bun`
 * (mock `bun:test` tersedia), sementara `bunx tsc` memeriksa src/ dengan
 * pustaka Node biasa. Panel ini tidak butuh DOM, jadi tempatnya di sini.
 *
 * Yang dijaga: panel benar-benar menawarkan TIGA sumbu terpisah — palet, gaya,
 * dan efek musiman — dan sakelar efek hanya bisa dipakai pada palet musiman.
 * Tanpa uji ini, panel bisa saja kembali menjadi satu daftar kartu warna tanpa
 * ada yang gagal.
 */
import { mock } from "bun:test";

import { renderToStaticMarkup } from "react-dom/server";

import { DEFAULT_CONFIG } from "@/lib/system-config";

type KonfigUji = {
  config: typeof DEFAULT_CONFIG;
  versi: number;
};

let konfigurasi: KonfigUji | undefined = {
  config: { ...DEFAULT_CONFIG, tema: "tinta", gaya: "lembaga" },
  versi: 1,
};

mock.module("convex/react", () => ({
  useQuery: () => konfigurasi,
  useMutation: () => async () => ({ ok: true }),
}));

const { WebsiteTemplatePanel } = await import(
  "@/components/admin/WebsiteTemplatePanel"
);
const { INFO_GAYA } = await import("@/lib/template-gaya");

let lulus = 0;
let gagal = 0;
function cek(nama: string, syarat: boolean) {
  if (syarat) {
    lulus += 1;
    console.log(`ok   ${nama}`);
  } else {
    gagal += 1;
    console.error(`FAIL ${nama}`);
  }
}

const render = () => renderToStaticMarkup(<WebsiteTemplatePanel />);
const ada = (html: string, teks: string, nama: string) =>
  cek(`${nama} (memuat ${teks})`, html.includes(teks));

// 1. Palet non-musiman: tiga bagian tampil, efek musiman nonaktif.
{
  const html = render();
  ada(html, "1. Palet warna", "bagian palet ada");
  ada(html, "2. Gaya tampilan", "bagian gaya ada");
  ada(html, "3. Efek musiman", "bagian efek musiman ada");

  // Setiap gaya punya kartu sendiri beserta contoh bentuknya.
  for (const gaya of INFO_GAYA) {
    ada(html, `data-gaya="${gaya.id}"`, `contoh bentuk gaya ${gaya.id}`);
    ada(html, gaya.nama, `nama gaya ${gaya.id}`);
  }

  // Salju/Karnival ditawarkan sebagai PALET, bukan satu-satunya jalan efek.
  // Markup SSR meng-escape `&` menjadi `&amp;`, jadi nama palet dicocokkan
  // dalam bentuk hasil render, bukan teks mentahnya.
  for (const palet of [
    "Tinta &amp; Kuningan",
    "Pesisir",
    "Terakota",
    "Musim Salju",
    "Karnival",
  ]) {
    ada(html, palet, `palet ${palet}`);
  }

  // Palet tinta tidak musiman → sakelar mati + alasan yang terbaca.
  ada(html, "Palet aktif tidak punya efek musiman", "alasan sakelar mati");
  ada(html, 'disabled=""', "kontrol yang tidak berlaku dinonaktifkan");
  ada(html, "Aktif: Tinta &amp; Kuningan · Gaya Lembaga", "ringkasan aktif");
}

// 2. Palet musiman: sakelar bisa dipakai dan ringkasan menyebut efek menyala.
{
  konfigurasi = {
    config: {
      ...DEFAULT_CONFIG,
      tema: "salju",
      gaya: "komunitas",
      efekMusiman: true,
    },
    versi: 2,
  };
  const html = render();
  cek(
    "palet musiman tidak menampilkan alasan larangan",
    !html.includes("Palet aktif tidak punya efek musiman"),
  );
  ada(html, "Efek musiman menyala", "ringkasan menyebut efek menyala");
  ada(html, "Gaya Komunitas", "ringkasan memakai gaya aktif");
  ada(html, 'aria-label="Efek musiman di beranda"', "sakelar punya label aksesibel");
  cek(
    "tombol pada palet aktif dinonaktifkan",
    html.includes("Palet sedang digunakan"),
  );
  cek("tombol pada gaya aktif dinonaktifkan", html.includes("Gaya sedang digunakan"));
}

// 3. Konfigurasi belum termuat: tidak crash, tampil status memuat.
{
  konfigurasi = undefined;
  const html = render();
  ada(html, "Memuat template website", "status memuat tampil");
}

console.log(`qa-template-panel: ${lulus} lulus, ${gagal} gagal`);
if (gagal > 0) process.exit(1);
