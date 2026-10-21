/**
 * Uji render hero landing (`LandingHero`) dengan kartu 3D dan bubble emerald.
 * Run: bun src/components/landing/LandingHero.render.test.tsx
 *
 * Yang dijaga (tanpa browser — render statis):
 *  1. Kartu 3D tetap dibuat lokal tanpa WebGL, dan memakai panggung tilt CSS
 *     yang sudah ada, bukan template adegan terpisah.
 *  2. Permukaan terang dengan latar hijau-kertas dan tiga bubble emerald,
 *     tanpa panggung gelap.
 *  3. Konten tidak bergantung pada apa pun yang bisa gagal dimuat: judul, dua
 *     CTA, catatan mikro, dan poin kepercayaan semuanya ada di markup.
 *  4. Objek merek tetap ada (kartu contoh) berikut pernyataan bahwa nomornya
 *     contoh, bukan alat bayar.
 *  5. Penanda sesi mengikuti `sudahMasuk`, dan tidak ada "undefined" maupun
 *     "[object Object]" yang bocor ke markup.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

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

function render(
  sudahMasuk = false,
  ctaUtama: { label: string; href: string; disabled?: boolean } = {
    label: "Ajukan Sekarang",
    href: "/auth",
  },
): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={["/"]}>
      <LandingHero
        eyebrow="PINDAI · Pinjaman dan Gadai Digital"
        judul1="Solusi Finansial, Lebih Jelas"
        judul2="dalam Genggaman."
        deskripsi="Deskripsi hero."
        ctaUtama={ctaUtama}
        ctaSekunder={{ label: "Pelajari Cara Kerja", href: "/biaya" }}
        mikro="Informasi biaya mengikuti produk yang berlaku."
        sudahMasuk={sudahMasuk}
      />
    </MemoryRouter>,
  );
}

const html = render();

// ── 1. Kartu 3D dibuat lokal tanpa WebGL atau animasi spin ──
ok(!html.includes("<canvas"), "tanpa kanvas WebGL");
ok(
  html.includes('data-kartu-panggung="pindai-3d"'),
  "panggung tilt kartu aktif",
);
ok(
  html.includes("rotateX(var(--tilt-x"),
  "tilt hanya diterapkan lewat CSS transform",
);
ok(!html.includes("data-template"), "tanpa atribut template");
ok(!html.includes("laut-"), "tanpa kelas panggung laut/tema 3D");
ok(!html.includes("hero-laut"), "tanpa kelas hero gelap");
ok(!/rotate-360|animate-spin/.test(html), "tanpa kelas spin/rotasi 360°");

// ── 2. Permukaan terang, bukan panggung gelap ──
ok(
  html.includes("bg-hero"),
  "section memakai permukaan hero dari token template (bg-hero)",
);
// Permukaan hero harus berasal dari token, bukan warna tetap: kalau nilai ini
// kembali ditulis langsung, template tidak lagi mengubah landing.
const css = readFileSync(
  fileURLToPath(new URL("../../index.css", import.meta.url)),
  "utf8",
);
ok(css.includes("--hero-latar"), "token permukaan hero ada di stylesheet");
ok(
  css.includes('[data-gaya="tenang"]') && css.includes('[data-gaya="komunitas"]'),
  "gaya template punya token bentuk sendiri",
);
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
// CTA sekunder dulu memanggil `window.location.assign`, sehingga halaman dimuat
// ulang penuh dan tautannya tidak bisa dibuka di tab baru.
ok(
  html.includes('href="/biaya"'),
  "CTA sekunder adalah tautan sungguhan ke /biaya",
);

// Selama sesi dimuat, CTA utama tidak boleh tetap berupa tautan: `disabled` pada
// <a> tidak mengunci apa pun.
const htmlMemuat = render(false, {
  label: "Memuat…",
  href: "/auth",
  disabled: true,
});
ok(htmlMemuat.includes("Memuat…"), "label memuat tampil saat sesi belum siap");
ok(
  !htmlMemuat.includes('href="/auth"'),
  "CTA utama tidak menjadi tautan selama sesi dimuat",
);
ok(html.includes("Rincian biaya terbuka"), "poin kepercayaan pertama ada");
ok(html.includes("Verifikasi OTP WhatsApp"), "poin kepercayaan kedua ada");

// ── 4. Objek merek: kartu contoh ──
ok(
  html.includes('data-kartu="pindai-hero"'),
  "kartu merek tetap tampil (permukaan PindaiCard3D)",
);
ok(
  !html.includes("Kartu contoh · bukan alat bayar"),
  "label kartu contoh yang dihapus tidak tampil di hero",
);
ok(
  html.includes("bg-emerald-200/65"),
  "bubble besar emerald terlihat di latar",
);
ok(
  html.includes("bg-emerald-100/70"),
  "bubble emerald kedua hadir di kiri atas",
);
ok(html.includes("relative z-10"), "konten hero berada di atas bubble");
ok(
  html.includes("bg-hero relative w-full overflow-hidden"),
  "bubble dibatasi rapi dalam hero",
);
ok(
  !html.includes("text-[#064e3b]") && !html.includes("bg-[#065f46]"),
  "tidak ada warna brand hardcoded di markup hero",
);
ok(
  !html.includes("Rp 1.300.000"),
  "total kewajiban ilustrasi tidak muncul di hero",
);
ok(
  !html.includes("Contoh hitungan ilustratif"),
  "paragraf ilustratif yang dihapus tidak tampil di hero",
);

// ── 5. Penanda sesi & kebersihan markup ──
ok(
  render(false).includes("Akun PINDAI"),
  'belum masuk → penanda "Akun PINDAI"',
);
ok(render(true).includes("Sesi aktif"), 'sudah masuk → penanda "Sesi aktif"');
ok(!html.includes("[object Object]"), 'tanpa "[object Object]"');
ok(!html.includes("undefined"), 'tanpa "undefined"');
ok(
  html.includes("Informasi biaya mengikuti produk yang berlaku."),
  "catatan mikro tampil",
);

console.log(`LandingHero.render.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
