/**
 * Uji render hero landing (`HeroLaut`).
 * Run: bun src/components/landing/HeroLaut.render.test.tsx
 *
 * Yang dijaga (tanpa browser — render statis):
 *  1. Kartu merek 3D benar-benar ada dan interaktif secara STRUKTUR: panggung
 *     `.kartu-panggung` (pemegang pointer) berisi `.kartu-3d`, muka, dan kilau.
 *  2. Lapisan dekoratif (canvas WebGL, gradien, riak, cahaya bulan, pelebur)
 *     semuanya `pointer-events-none` — tidak ada yang mencuri pointer dari
 *     kartu maupun dari tombol CTA.
 *  3. Identitas merek: CTA utama memakai hijau PINDAI (`#1f6a62`), bukan biru
 *     dan bukan `#e6d3a5` kuningan; section memakai latar gelap hijau.
 *  4. Tidak ada rotasi otomatis/360° di markup (kartu hanya bergerak oleh
 *     pengguna, bukan animasi CSS `rotate`).
 */
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";

import { HeroLaut } from "@/components/landing/HeroLaut";

let passed = 0;
let failed = 0;
function ok(syarat: boolean, label: string): void {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

const html = renderToStaticMarkup(
  <MemoryRouter initialEntries={["/"]}>
    <HeroLaut
      eyebrow="PINDAI · Pinjaman dan Gadai Digital"
      judul1="Solusi Finansial, Lebih Jelas"
      judul2="dalam Genggaman."
      deskripsi="Deskripsi hero."
      ctaUtama={{ label: "Ajukan Sekarang", href: "/auth" }}
      ctaSekunder={{ label: "Pelajari Cara Kerja", onClick: () => {} }}
      mikro="Informasi biaya mengikuti produk yang berlaku."
      sudahMasuk={false}
    />
  </MemoryRouter>,
);

// ── 1. Struktur kartu interaktif ada ──
ok(html.includes("kartu-panggung"), "panggung kartu ada (pemegang pointer)");
ok(html.includes("kartu-3d"), "kartu 3D ada");
ok(html.includes("kartu-3d__muka"), "muka kartu ada");
ok(html.includes("kartu-3d__kilau"), "kilau permukaan (mengikuti pointer) ada");
ok(html.includes("hero-laut"), "section hero memakai kelas token warna");

// ── 2. Lapisan dekoratif tidak mencuri pointer ──
ok(html.includes("laut-dasar pointer-events-none"), "gradien dasar pointer-events-none");
ok(
  /<canvas[^>]*pointer-events-none/.test(html),
  "canvas WebGL pointer-events-none (tidak menerima pointer)",
);
ok(html.includes("hero-judul"), "judul hero punya id untuk aria-labelledby");
const jumlahPointerNone = html.split("pointer-events-none").length - 1;
ok(jumlahPointerNone >= 4, `beberapa lapisan dekoratif pointer-events-none (${jumlahPointerNone})`);

// ── 3. Identitas hijau PINDAI, bukan biru/kuningan sebagai utama ──
ok(html.includes("#1f6a62"), "CTA utama memakai hijau PINDAI (#1f6a62)");
ok(html.includes("#04100c"), "latar hero memakai gelap hijau PINDAI (#04100c)");
ok(
  !/class="[^"]*bg-\[#e6d3a5\]/.test(html),
  "CTA utama tidak lagi memakai kuningan sebagai warna tombol",
);

// ── 4. Tidak ada rotasi otomatis 360° ──
ok(!/rotate-360|animate-spin/.test(html), "tanpa kelas spin/rotasi 360°");
ok(!html.includes("[object Object]"), 'tanpa "[object Object]"');
ok(!html.includes("undefined"), 'tanpa "undefined"');

// ── 5. Konten & aksesibilitas tetap utuh ──
ok(html.includes("Solusi Finansial, Lebih Jelas"), "judul hero tetap tampil tanpa WebGL");
ok(html.includes('href="/auth"'), "CTA menuju rute akun tetap ada");
ok(html.includes("Pelajari Cara Kerja"), "CTA sekunder tetap ada");
ok(html.includes("Rincian biaya terbuka"), "poin kepercayaan tetap ada");

console.log(`HeroLaut.render.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
