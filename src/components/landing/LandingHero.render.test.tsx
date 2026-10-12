/**
 * Uji render hero landing (`LandingHero`) — panggung terang yang statis.
 * Run: bun src/components/landing/LandingHero.render.test.tsx
 *
 * Yang dijaga (tanpa browser — render statis):
 *  1. Tidak ada sisa mesin 3D: tanpa `<canvas>`, tanpa panggung tilt
 *     (`.kartu-panggung`/`.kartu-3d`), dan tanpa atribut `data-template` —
 *     fitur template WebGL sudah dicabut, bukan sekadar dimatikan.
 *  2. Permukaan terang: section memakai kertas hangat (`bg-slate-50`), bukan
 *     panggung gelap. Pemisah ke bagian berikutnya milik `FactRibbon`, jadi hero
 *     tidak menggambar garis kedua di bawahnya.
 *  3. Konten tidak bergantung pada apa pun yang bisa gagal dimuat: judul, dua
 *     CTA, catatan mikro, dan poin kepercayaan semuanya ada di markup.
 *  4. Objek merek tetap ada (kartu contoh) berikut pernyataan bahwa nomornya
 *     contoh, bukan alat bayar.
 *  5. Penanda sesi mengikuti `sudahMasuk`, dan tidak ada "undefined" maupun
 *     "[object Object]" yang bocor ke markup.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";

import { LandingHero } from "@/components/landing/LandingHero";

let passed = 0;
let failed = 0;
function ok(syarat: boolean, label: string): void {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

function render(sudahMasuk = false): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={["/"]}>
      <LandingHero
        eyebrow="PINDAI · Pinjaman dan Gadai Digital"
        judul1="Solusi Finansial, Lebih Jelas"
        judul2="dalam Genggaman."
        deskripsi="Deskripsi hero."
        ctaUtama={{ label: "Ajukan Sekarang", href: "/auth" }}
        ctaSekunder={{ label: "Pelajari Cara Kerja", onClick: () => {} }}
        mikro="Informasi biaya mengikuti produk yang berlaku."
        sudahMasuk={sudahMasuk}
      />
    </MemoryRouter>,
  );
}

const html = render();

// ── 1. Tidak ada sisa mesin 3D ──
ok(!html.includes("<canvas"), "tanpa kanvas WebGL sama sekali");
// Kartu merek tetap memakai pembungkusnya sendiri (`data-kartu-panggung` di
// `KartuHeroPindai`, hover tilt DESIGN.md §3C), jadi yang diperiksa adalah kelas
// CSS panggung hero — bukan sekadar nama atribut milik komponen kartu.
ok(
  !/class="[^"]*\bkartu-panggung\b/.test(html),
  "tanpa kelas panggung tilt hero",
);
ok(
  html.includes('data-kartu-panggung="kertas-batik"'),
  "tilt tetap milik komponen kartu",
);
ok(!html.includes("kartu-3d"), "tanpa kelas kartu 3D");
// Panggung hero tidak lagi memiringkan apa pun. Satu-satunya `perspective` yang
// tersisa adalah milik komponen kartu sendiri (hover tilt, DESIGN.md §3C).
ok(
  (html.match(/perspective/g) ?? []).length === 1,
  "hanya kartu yang memakai perspective (tanpa panggung tilt hero)",
);
ok(!html.includes("data-template"), "tanpa atribut template");
ok(!html.includes("laut-"), "tanpa kelas panggung laut/tema 3D");
ok(!html.includes("hero-laut"), "tanpa kelas hero gelap");
ok(
  !/rotate-360|animate-spin/.test(html),
  "tanpa kelas spin/rotasi 360°",
);

// ── 2. Permukaan terang, bukan panggung gelap ──
ok(html.includes("bg-slate-50"), "section memakai kertas hangat (bg-slate-50)");
ok(
  !html.includes("border-b border-slate-200"),
  "tanpa garis bawah ganda (pemisah milik FactRibbon)",
);
ok(!html.includes("bg-[#021E17]"), "latar gelap Deep Space tidak dipakai lagi");
ok(
  html.includes("text-slate-900"),
  "judul memakai tinta gelap di atas kertas terang",
);

// ── 3. Konten & aksesibilitas utuh tanpa syarat apa pun ──
ok(html.includes('aria-labelledby="hero-judul"'), "section menunjuk judulnya");
ok(html.includes('id="hero-judul"'), "judul punya id untuk aria-labelledby");
ok(
  html.includes("Solusi Finansial, Lebih Jelas"),
  "judul hero selalu ada di markup",
);
ok(html.includes("dalam Genggaman."), "baris kedua judul ada");
ok(html.includes('href="/auth"'), "CTA utama menuju rute akun");
ok(html.includes("Ajukan Sekarang"), "label CTA utama tampil");
ok(html.includes("Pelajari Cara Kerja"), "CTA sekunder tampil");
ok(html.includes("Rincian biaya terbuka"), "poin kepercayaan pertama ada");
ok(html.includes("Verifikasi OTP WhatsApp"), "poin kepercayaan kedua ada");

// ── 4. Objek merek: kartu contoh ──
ok(
  html.includes('data-kartu="kertas-batik"'),
  "kartu merek tetap tampil (permukaan KartuHeroPindai)",
);
ok(
  html.includes("Kartu contoh · bukan alat bayar"),
  "kartu menyatakan dirinya contoh, bukan alat bayar",
);

// ── 5. Penanda sesi & kebersihan markup ──
ok(
  render(false).includes("Akun PINDAI"),
  "belum masuk → penanda \"Akun PINDAI\"",
);
ok(render(true).includes("Sesi aktif"), "sudah masuk → penanda \"Sesi aktif\"");
ok(!html.includes("[object Object]"), 'tanpa "[object Object]"');
ok(!html.includes("undefined"), 'tanpa "undefined"');
ok(
  html.includes("Informasi biaya mengikuti produk yang berlaku."),
  "catatan mikro tampil",
);

console.log(`LandingHero.render.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
