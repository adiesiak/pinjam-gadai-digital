/** Run: bun src/lib/promoPosterGambar.render.test.ts */
import { promoPosters, TAGLINE, type PromoPoster } from "./promoPosters";
import {
  UKURAN_POSTER,
  gambarPoster,
  type UkuranPoster,
} from "./promoPosterGambar";

let passed = 0;
let failed = 0;
function ok(condition: boolean, label: string): void {
  if (condition) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

type Tulisan = { teks: string; x: number; y: number };
function ctxTiruan(): { ctx: CanvasRenderingContext2D; tulisan: Tulisan[] } {
  const tulisan: Tulisan[] = [];
  const ctx = {
    font: "10px sans-serif",
    textAlign: "left",
    textBaseline: "top",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    beginPath() {},
    roundRect() {},
    arc() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    fill() {},
    fillRect() {},
    measureText(teks: string) {
      return { width: teks.length * 8 };
    },
    fillText(teks: string, x: number, y: number) {
      tulisan.push({ teks, x, y });
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, tulisan };
}

function render(poster: PromoPoster, ukuran: UkuranPoster): Tulisan[] {
  const { ctx, tulisan } = ctxTiruan();
  gambarPoster(ctx, poster, ukuran);
  return tulisan;
}

const rasio = { persegi: 1, potret: 0.8, cerita: 0.5625 } as const;
const ukuranTersedia = Object.entries(UKURAN_POSTER) as [
  keyof typeof UKURAN_POSTER,
  UkuranPoster,
][];
for (const [nama, ukuran] of ukuranTersedia) {
  ok(ukuran.lebar === 1080, `${nama}: lebar 1080 px`);
  ok(
    ukuran.lebar / ukuran.tinggi === rasio[nama],
    `${nama}: ukuran ${ukuran.label}`,
  );
}

const klaimTerlarang = [
  "pasti cair",
  "pasti disetujui",
  "tanpa risiko",
  "dijamin untung",
  "100% aman",
  "tanpa biaya",
];
for (const poster of promoPosters) {
  for (const [nama, ukuran] of ukuranTersedia) {
    let tulisan: Tulisan[];
    try {
      tulisan = render(poster, ukuran);
    } catch (error) {
      failed += 1;
      console.error(
        `FAIL ${poster.id}/${nama}: ${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }

    const teks = tulisan.map((item) => item.teks);
    const isi = teks.join(" ").toLowerCase();
    ok(teks.length >= 8, `${poster.id}/${nama}: elemen poster tergambar`);
    ok(teks.includes("PINDAI"), `${poster.id}/${nama}: wordmark`);
    ok(teks.includes(TAGLINE), `${poster.id}/${nama}: tagline`);
    ok(
      isi.includes(poster.category.toLowerCase()),
      `${poster.id}/${nama}: kategori`,
    );
    ok(isi.includes(poster.badge.toLowerCase()), `${poster.id}/${nama}: badge`);
    ok(
      poster.headline
        .split("\n")
        .every((baris) => isi.includes(baris.toLowerCase())),
      `${poster.id}/${nama}: headline`,
    );
    ok(isi.includes(poster.cta.toLowerCase()), `${poster.id}/${nama}: CTA`);
    ok(
      isi.includes(poster.disclaimer.toLowerCase()),
      `${poster.id}/${nama}: disclaimer`,
    );

    for (const item of [
      ...poster.features,
      ...(poster.items ?? []).map(
        (baris) => `${baris.judul ?? ""} ${baris.teks}`,
      ),
    ]) {
      const kata = item.toLowerCase().split(" ").filter(Boolean);
      ok(
        kata.every((bagian) => isi.includes(bagian)),
        `${poster.id}/${nama}: konten terstruktur dirender`,
      );
    }
    for (const frasa of klaimTerlarang) {
      ok(!isi.includes(frasa), `${poster.id}/${nama}: tanpa klaim “${frasa}”`);
    }
    for (const item of tulisan) {
      ok(
        item.x >= -6 &&
          item.x <= ukuran.lebar + 6 &&
          item.y >= -6 &&
          item.y <= ukuran.tinggi + 6,
        `${poster.id}/${nama}: teks “${item.teks.slice(0, 20)}” dalam batas kanvas`,
      );
    }
  }
}

console.log(`promoPosterGambar.render: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
