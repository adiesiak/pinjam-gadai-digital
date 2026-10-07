/**
 * Run: bun src/lib/promoPosterGambar.render.test.ts
 *
 * Uji render poster di atas tiruan CanvasRenderingContext2D (tanpa DOM):
 * memastikan ke-9 poster tergambar penuh pada kanvas 1080 × 1350, seluruh
 * teks wajib ada, tidak ada teks yang jatuh di luar kanvas, dan tidak ada
 * klaim terlarang yang ikut tergambar.
 */
import { promoPosters, TAGLINE, type PromoPoster } from "./promoPosters";
import { UKURAN_POSTER, gambarPoster } from "./promoPosterGambar";

let passed = 0;
let failed = 0;
function ok(syarat: boolean, label: string): void {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

type Tulisan = { teks: string; x: number; y: number };

/** Tiruan ctx 2D yang mencatat setiap fillText + koordinatnya. */
function ctxTiruan(): { ctx: CanvasRenderingContext2D; tulisan: Tulisan[] } {
  const tulisan: Tulisan[] = [];
  const stack: { font: string; align: string }[] = [];
  const ctx = {
    font: "10px sans-serif",
    textAlign: "left",
    textBaseline: "top",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    globalAlpha: 1,
    save() {
      stack.push({ font: this.font, align: this.textAlign });
    },
    restore() {
      const s = stack.pop();
      if (s) {
        this.font = s.font;
        this.textAlign = s.align;
      }
    },
    measureText(teks: string) {
      const fs = Number(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] ?? 10);
      return { width: teks.length * fs * 0.52 };
    },
    fillText(teks: string, x: number, y: number) {
      tulisan.push({ teks, x, y });
    },
    strokeText() {},
    fillRect() {},
    strokeRect() {},
    clearRect() {},
    rect() {},
    clip() {},
    translate() {},
    rotate() {},
    scale() {},
    setTransform() {},
    drawImage() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    arc() {},
    fill() {},
    stroke() {},
    createRadialGradient() {
      return { addColorStop() {} };
    },
    createLinearGradient() {
      return { addColorStop() {} };
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, tulisan };
}

const TERLARANG = [
  "pasti cair",
  "pasti disetujui",
  "tanpa risiko",
  "dijamin untung",
  "100% aman",
  "tanpa biaya",
];

ok(UKURAN_POSTER.lebar === 1080, "lebar poster 1080 px");
ok(UKURAN_POSTER.tinggi === 1350, "tinggi poster 1350 px");
eqRatio();

function eqRatio(): void {
  ok(UKURAN_POSTER.lebar / UKURAN_POSTER.tinggi === 0.8, "rasio 4:5");
}

/** Gambarkan satu poster, kembalikan daftar teks tergambar. */
function gambar(p: PromoPoster): Tulisan[] {
  const { ctx, tulisan } = ctxTiruan();
  gambarPoster(ctx, p);
  return tulisan;
}

for (const p of promoPosters) {
  let tulisan: Tulisan[] = [];
  try {
    tulisan = gambar(p);
  } catch (err) {
    failed += 1;
    console.error(`FAIL ${p.id}: melempar ${err instanceof Error ? err.message : String(err)}`);
    continue;
  }

  const teks = tulisan.map((t) => t.teks);
  const gabung = teks.join(" ∙ ");

  ok(tulisan.length >= 12, `${p.id}: gambar penuh (${tulisan.length} teks)`);
  ok(teks.includes("PINDAI"), `${p.id}: logo/wordmark PINDAI`);
  ok(teks.includes(TAGLINE), `${p.id}: tagline`);
  ok(teks.includes(p.cta), `${p.id}: CTA "${p.cta}"`);
  ok(teks.includes(p.badge.toUpperCase()), `${p.id}: badge`);
  ok(
    teks.some((t) => t.includes(p.disclaimer.split(" ").slice(0, 3).join(" "))),
    `${p.id}: disclaimer`,
  );
  ok(
    p.bentuk === "hero" || teks.some((t) => t.includes(p.nomor)),
    `${p.id}: nomor kampanye`,
  );

  for (const baris of p.headline.split("\n")) {
    ok(teks.includes(baris), `${p.id}: headline "${baris}"`);
  }
  for (const f of p.features) {
    ok(teks.includes(f), `${p.id}: fitur "${f}"`);
  }
  for (const frasa of TERLARANG) {
    ok(!gabung.toLowerCase().includes(frasa), `${p.id}: tanpa klaim "${frasa}"`);
  }

  for (const t of tulisan) {
    const dalam =
      t.x >= -6 && t.x <= UKURAN_POSTER.lebar + 6 && t.y >= -6 && t.y <= UKURAN_POSTER.tinggi + 6;
    ok(dalam, `${p.id}: teks "${t.teks.slice(0, 24)}" di dalam kanvas (${Math.round(t.x)},${Math.round(t.y)})`);
  }
}

// ===== Konten spesifik per varian =====
const teksDari = (id: string): string[] => {
  const p = promoPosters.find((x) => x.id === id);
  return p ? gambar(p).map((t) => t.teks) : [];
};

const biaya = teksDari("biaya");
for (const wajib of ["POKOK", "BIAYA", "TOTAL KEWAJIBAN", "Rp …", "Periksa simulasi sebelum melanjutkan."]) {
  ok(biaya.includes(wajib), `poster 05 menampilkan "${wajib}"`);
}

const langkah = teksDari("cara-kerja");
for (const s of ["Daftar", "Lengkapi Data", "Ajukan", "Pantau Status", "1", "2", "3", "4"]) {
  ok(langkah.includes(s), `poster 04 menampilkan "${s}"`);
}

const faq = teksDari("faq");
for (const q of [
  "Berapa lama tenornya?",
  "Bagaimana biaya dihitung?",
  "Bagaimana proses pengajuan?",
  "Bagaimana cara melihat status?",
]) {
  ok(faq.includes(q), `poster 07 menampilkan "${q}"`);
}

const trust = teksDari("trust");
for (const t of ["TRANSPARANSI", "KEAMANAN", "VERIFIKASI", "INFORMASI JELAS", "Privasi", "Ketentuan", "Kontak"]) {
  ok(trust.includes(t), `poster 08 menampilkan "${t}"`);
}

const hero = teksDari("cta");
for (const t of ["PINJAMAN", "GADAI", "KREDIT", "Mulai Sekarang →", "Pelajari PINDAI"]) {
  ok(hero.includes(t), `poster 09 menampilkan "${t}"`);
}

console.log(`\npromoPosterGambar.render: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
