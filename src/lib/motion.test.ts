/**
 * Penjaga fondasi animasi global PINDAI.
 * Run: bun src/lib/motion.test.ts
 *
 * Berkas ini mengunci janji-janji yang membuat animasi tetap konsisten dan
 * ringan, tanpa harus dibaca ulang tiap kali ada yang menambah gerakan baru:
 *
 *  1. **Satu standar durasi.** Nilai di `src/lib/motion.ts` harus berada pada
 *     rentang produk (fast 100–150, normal 180–250, slow 300–450 ms) dan naik
 *     berurutan.
 *  2. **CSS dan JS tidak boleh menyimpang.** Custom property `--motion-*` di
 *     `src/index.css` harus sama persis dengan token TypeScript-nya — termasuk
 *     kurva easing dan langkah stagger. Inilah yang membuat kelas `.motion-*`
 *     dan pembungkus React terasa seperti satu sistem.
 *  3. **Setiap utility punya opt-out reduced-motion.** Kelas `.motion-*` baru
 *     yang lupa dimatikan akan menggagalkan tes ini.
 *  4. **Hanya opacity & transform.** Varian tidak boleh menganimasikan properti
 *     tata letak (width/height/top/margin/…) — itu memicu layout shift.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  buatStagger,
  DURATION,
  DURATION_MS,
  EASE_IN_OUT,
  EASE_OUT,
  fadeIn,
  fadeUpItem,
  pulseSoft,
  scaleIn,
  slideIn,
  STAGGER,
  staggerContainer,
  transition,
  transitionReduced,
} from "./motion";

const baca = (relative: string) =>
  readFileSync(fileURLToPath(new URL(`../../${relative}`, import.meta.url)), "utf8");

const css = baca("src/index.css");

let passed = 0;
let failed = 0;
function ok(syarat: boolean, label: string): void {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}
function eq(nyata: unknown, harap: unknown, label: string): void {
  ok(nyata === harap, `${label} (harap ${String(harap)}, dapat ${String(nyata)})`);
}

// ===== 1. Rentang durasi standar =====
const RENTANG = { fast: [100, 150], normal: [180, 250], slow: [300, 450] } as const;
for (const [nama, [min, maks]] of Object.entries(RENTANG)) {
  const ms = DURATION_MS[nama as keyof typeof DURATION_MS];
  ok(ms >= min && ms <= maks, `durasi ${nama} (${ms} ms) di dalam ${min}–${maks} ms`);
  eq(DURATION[nama as keyof typeof DURATION], ms / 1000, `detik ${nama} cocok dengan ms-nya`);
}
ok(
  DURATION_MS.fast < DURATION_MS.normal && DURATION_MS.normal < DURATION_MS.slow,
  "urutan durasi fast < normal < slow",
);

// ===== 2. CSS dan JS tidak menyimpang =====
eq(
  css.includes(`--motion-fast: ${DURATION_MS.fast}ms;`),
  true,
  `CSS --motion-fast = ${DURATION_MS.fast}ms`,
);
eq(
  css.includes(`--motion-normal: ${DURATION_MS.normal}ms;`),
  true,
  `CSS --motion-normal = ${DURATION_MS.normal}ms`,
);
eq(
  css.includes(`--motion-slow: ${DURATION_MS.slow}ms;`),
  true,
  `CSS --motion-slow = ${DURATION_MS.slow}ms`,
);
eq(
  css.includes(`--motion-ease-out: cubic-bezier(${EASE_OUT.join(", ")});`),
  true,
  "CSS --motion-ease-out = EASE_OUT",
);
eq(
  css.includes(`--motion-ease-in-out: cubic-bezier(${EASE_IN_OUT.join(", ")});`),
  true,
  "CSS --motion-ease-in-out = EASE_IN_OUT",
);
eq(
  css.includes(`--motion-stagger: ${Math.round(STAGGER.normal * 1000)}ms;`),
  true,
  "CSS --motion-stagger = STAGGER.normal",
);
eq(transitionReduced.duration, 0.01, "transisi reduced-motion nyaris instan");
ok(
  transition.fast.duration === DURATION.fast &&
    transition.normal.duration === DURATION.normal &&
    transition.slow.duration === DURATION.slow,
  "preset transition memakai token durasi",
);

// ===== 3. Setiap utility punya opt-out reduced-motion =====
/** Blok `@media (prefers-reduced-motion: reduce)` yang memuat utility motion. */
function blokReducedMotion(sumber: string): string {
  const awal = sumber.indexOf("@media (prefers-reduced-motion: reduce)");
  ok(awal !== -1, "ada blok prefers-reduced-motion");
  const berikutnya = sumber.indexOf("@media", sumber.indexOf("{", awal) + 1);
  return sumber.slice(awal, berikutnya === -1 ? sumber.length : berikutnya);
}
const blokReduced = blokReducedMotion(css);

const kelasMotion = [
  ...new Set(css.match(/\.motion-[a-z][a-z-]*/g) ?? []),
].map((k) => k.slice(1));
ok(kelasMotion.length >= 10, `utility motion ditemukan (${kelasMotion.length} kelas)`);
for (const kelas of kelasMotion) {
  ok(blokReduced.includes(kelas), `${kelas} dimatikan saat reduced-motion`);
}

// ===== 4. Hanya opacity & transform =====
const DIIZINKAN = new Set(["opacity", "x", "y", "scale", "transition"]);
const TERLARANG = ["width", "height", "top", "left", "right", "bottom", "margin", "padding", "fontSize"];
function periksaVarian(nama: string, varian: Record<string, unknown>): void {
  for (const [kunci, nilai] of Object.entries(varian)) {
    if (nilai === null || typeof nilai !== "object") continue;
    const properti = Object.keys(nilai as Record<string, unknown>);
    for (const p of properti) {
      ok(DIIZINKAN.has(p), `varian ${nama}.${kunci} memakai "${p}" yang diizinkan`);
      ok(!TERLARANG.includes(p), `varian ${nama}.${kunci} tidak menganimasikan "${p}"`);
    }
  }
}

periksaVarian("fadeIn", fadeIn);
periksaVarian("fadeUpItem", fadeUpItem);
periksaVarian("staggerContainer", staggerContainer);
periksaVarian("buatStagger", buatStagger());
periksaVarian("slideIn", slideIn("kiri", 16));
periksaVarian("scaleIn", scaleIn(0.96));
periksaVarian("pulseSoft", pulseSoft);

// Hanya properti compositor yang boleh muncul di keyframes motion.
const keyframesMotion = css.match(/@keyframes pindai-motion-[a-z-]+ \{[\s\S]*?\n\s{2}\}/g) ?? [];
ok(keyframesMotion.length >= 6, `keyframes motion ditemukan (${keyframesMotion.length})`);
for (const kf of keyframesMotion) {
  const properti = [...kf.matchAll(/^\s{4}([a-z-]+):/gm)].map((m) => m[1]);
  for (const p of properti) {
    ok(
      p === "opacity" || p === "transform",
      `keyframes ${kf.slice(0, 30)}… hanya memakai opacity/transform (dapat "${p}")`,
    );
  }
}

if (failed > 0) {
  console.error(`\n${failed} gagal, ${passed} lulus`);
  process.exit(1);
}
console.log(`motion: ${passed} lulus`);
