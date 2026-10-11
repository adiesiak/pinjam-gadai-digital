/**
 * Uji render hero landing (`LandingHero`) — SATU hero untuk ENAM template.
 * Run: bun src/components/landing/LandingHero.render.test.tsx
 *
 * Yang dijaga (tanpa browser — render statis):
 *  1. Kartu merek 3D benar-benar ada dan interaktif secara STRUKTUR: panggung
 *     `.kartu-panggung` (pemegang pointer) berisi `.kartu-3d`, muka, dan kilau.
 *  2. Lapisan dekoratif (canvas WebGL, gradien, riak, pelebur) semuanya
 *     `pointer-events-none` — tidak ada yang mencuri pointer dari kartu maupun
 *     dari tombol CTA.
 *  3. Identitas merek: CTA utama memakai hijau PINDAI (`#1f6a62`), latar hero
 *     memakai Deep Space Emerald PINDAI (`#021E17`) pada template default.
 *  4. Tidak ada rotasi otomatis/360° di markup (kartu hanya bergerak oleh
 *     pengguna, bukan animasi CSS `rotate`).
 *  5. KEENAM template dapat dirender — masing-masing menandai dirinya lewat
 *     `data-template`, dan konten bersama (judul, CTA) tetap tampil di semua
 *     template. Template tak dikenal jatuh ke default, bukan layar kosong.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";

import { LandingHero } from "@/components/landing/LandingHero";
import { DEFAULT_LANDING_TEMPLATE, LANDING_TEMPLATE_IDS } from "@/lib/landingTemplate";

let passed = 0;
let failed = 0;
function ok(syarat: boolean, label: string): void {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

function render(template?: string): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={["/"]}>
      <LandingHero
        {...(template !== undefined ? { template: template as never } : {})}
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
}

const html = render();

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
// Kinerja: SATU render hero = SATU canvas. Inilah yang menjamin pratinjau admin
// (satu LandingHero per dialog) tidak pernah menjalankan enam adegan sekaligus.
ok(
  (html.match(/<canvas/g) ?? []).length === 1,
  "tepat satu canvas WebGL per render (satu adegan hidup)",
);
const jumlahPointerNone = html.split("pointer-events-none").length - 1;
ok(jumlahPointerNone >= 4, `beberapa lapisan dekoratif pointer-events-none (${jumlahPointerNone})`);

// ── 3. Identitas hijau PINDAI, bukan biru/kuningan sebagai utama ──
ok(html.includes("#064E3B"), "CTA utama memakai Deep Emerald PINDAI (#064E3B)");
ok(html.includes("#021E17"), "latar hero memakai Deep Space Emerald PINDAI (#021E17)");
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

// ── 6. Keenam template dapat dirender & konten bersama tetap tampil ──
ok(
  html.includes(`data-template="${DEFAULT_LANDING_TEMPLATE}"`),
  `tanpa prop template → memakai default (${DEFAULT_LANDING_TEMPLATE})`,
);
for (const id of LANDING_TEMPLATE_IDS) {
  const h = render(id);
  ok(h.includes(`data-template="${id}"`), `template ${id} dirender dengan penandanya sendiri`);
  ok(
    h.includes("Solusi Finansial, Lebih Jelas") && h.includes('href="/auth"'),
    `template ${id} tetap menampilkan konten & CTA bersama`,
  );
  ok(!h.includes("undefined"), `template ${id} tanpa "undefined"`);
  // Fallback WebGL TIDAK boleh muncul saat render normal (belum ada kegagalan).
  ok(!h.includes("tidak dapat dimuat pada perangkat ini"), `template ${id} tanpa pesan gagal`);
}
const asing = render("template-yang-tidak-ada");
ok(
  asing.includes(`data-template="${DEFAULT_LANDING_TEMPLATE}"`),
  "template tak dikenal jatuh ke default, bukan halaman kosong",
);

console.log(`LandingHero.render.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
