/**
 * Penjaga tekstur Batik Parang se-halaman (`DESIGN.md` §3D).
 *
 * Motifnya dipasang sebagai SATU lapisan untuk seluruh halaman landing, jadi
 * yang mudah rusak bukan tampilannya, melainkan janji-janji di baliknya:
 *
 *  1. **Tetap satu pembungkus.** Kelas `.tekstur-parang` hanya boleh muncul
 *     sekali di halaman landing. Kalau seseorang menyalinnya ke tiap seksi,
 *     pola yang sama menumpuk dan latar kehilangan satu-satunya lapisan.
 *  2. **Topengnya benar-benar mulus.** Ubinnya 48 px dan lukisannya harus
 *     berada pada kisi `{(24m, 24n) : m + n genap}` — kisi itulah yang membuat
 *     tepi ubin menyambung tanpa jahitan. Tes ini menghitung ulang sifat itu
 *     dari URI di `index.css`, jadi pola yang digambar asal-asalan tertangkap.
 *  3. **Ukuran topeng kelipatan periode ubin.** `mask-size` bukan kelipatan 48
 *     akan memotong kisi dan memunculkan garis jahitan.
 *  4. **Warnanya dari token, bukan hex.** Motif harus ikut berganti wajah per
 *     tema lewat `--gold`; hex yang dipaku di dalam SVG akan mematikan itu.
 *  5. **Statis.** Tidak ada `animation` di aturan ini, jadi tidak ada yang perlu
 *     dikecualikan dari `prefers-reduced-motion`.
 *
 * Run: bun src/lib/teksturParang.test.ts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Jalur berkas relatif terhadap akar proyek. */
const baca = (relative: string) =>
  readFileSync(fileURLToPath(new URL(`../../${relative}`, import.meta.url)), "utf8");

const css = baca("src/index.css");
const landing = baca("src/pages/Landing.tsx");

let passed = 0;
let failed = 0;

function cek(ok: boolean, label: string) {
  if (ok) {
    passed += 1;
    return;
  }
  failed += 1;
  console.error(`FAIL ${label}`);
}

// ===== 1. Satu pembungkus di halaman landing =====
const jumlahKelas = landing.split("tekstur-parang").length - 1;
cek(jumlahKelas === 1, `kelas tekstur-parang dipakai tepat sekali (ditemukan ${jumlahKelas})`);
cek(
  /className="tekstur-parang min-h-screen/.test(landing),
  "kelas dipasang pada pembungkus luar halaman, bukan pada seksi",
);

// ===== 2. Aturan CSS lengkap =====
const awalan = css.indexOf(".tekstur-parang::before");
cek(awalan > -1, "index.css memuat aturan .tekstur-parang::before");
const blokBefore = awalan > -1 ? css.slice(awalan, css.indexOf("}", awalan) + 1) : "";

const wajib = [
  "position: fixed",
  "inset: 0",
  "pointer-events: none",
  "background-color: var(--gold)",
  "mask-image: var(--parang-mask)",
  "-webkit-mask-image: var(--parang-mask)",
  "mask-repeat: repeat",
  "-webkit-mask-repeat: repeat",
];
for (const baris of wajib) {
  cek(blokBefore.includes(baris), `aturan ::before memuat \`${baris}\``);
}

// Lapisan tetap di bawah kepala halaman (z-40) dan di atas latar seksi.
const z = Number(blokBefore.match(/z-index:\s*(\d+)/)?.[1] ?? "0");
cek(z === 30, `z-index lapisan tekstur 30 (ditemukan ${z})`);

const opasitas = Number(blokBefore.match(/opacity:\s*([\d.]+)/)?.[1] ?? "1");
cek(opasitas > 0 && opasitas <= 0.08, `opasitas ditahan sebagai air-tanda (${opasitas})`);

// ===== 3. Statis: tidak ada animasi =====
cek(!/animation\s*:/.test(blokBefore), "aturan tekstur tidak menganimasikan apa pun");

// ===== 4. Ukuran topeng kelipatan periode ubin =====
const ukuran = blokBefore.match(/mask-size:\s*(\d+)px\s+(\d+)px/);
cek(ukuran !== null, "mask-size ditulis eksplisit dalam piksel");
if (ukuran) {
  const [px, py] = [Number(ukuran[1]), Number(ukuran[2])];
  const PERIODE_UBIN = 48;
  cek(
    px % PERIODE_UBIN === 0 && py % PERIODE_UBIN === 0,
    `mask-size (${px}x${py}) kelipatan periode ubin ${PERIODE_UBIN}px`,
  );
}

// ===== 5. Topeng: kisi mulus, tanpa warna terpaku =====
const uri = css.match(/--parang-mask:\s*url\("data:image\/svg\+xml,([^"]+)"\)/)?.[1] ?? "";
cek(uri !== "", "topeng didefinisikan sekali sebagai --parang-mask");
cek(!/#[0-9a-fA-F]{3,6}/.test(uri), "tidak ada hex yang dipaku di dalam SVG (warna dari --gold)");

const svg = uri.replace(/%3C/g, "<").replace(/%3E/g, ">");
cek(svg.startsWith("<svg") && svg.endsWith("</svg>"), "URI memulihkan satu dokumen SVG utuh");

const TITIK = [...svg.matchAll(/translate\((-?\d+) (-?\d+)\)/g)].map((m) => [
  Number(m[1]),
  Number(m[2]),
]);
cek(TITIK.length > 0, `topeng memuat titik kisi (ditemukan ${TITIK.length})`);

/** Kisi parang: koordinat kelipatan 24 dan `m + n` genap. */
const LANGKAH = 24;
const diKisi = ([x, y]: number[]) =>
  x % LANGKAH === 0 && y % LANGKAH === 0 && (((x / LANGKAH + y / LANGKAH) % 2) + 2) % 2 === 0;
cek(TITIK.every(diKisi), "setiap titik yang digambar berada di kisi m + n genap");

/**
 * Sifat yang membuat ubinnya menyambung: setiap titik kisi yang bilahnya bisa
 * menyentuh ubin `[0,48)^2` harus sudah digambar. Jari-jari bilah 14 px
 * (setengah panjang 24 + tebal 2,1 + ujung bulat).
 */
const JARI = 14;
const UBIN = 48;
const kurang: number[][] = [];
for (let m = -2; m <= 4; m += 1) {
  for (let n = -2; n <= 4; n += 1) {
    if ((((m + n) % 2) + 2) % 2 !== 0) continue;
    const x = m * LANGKAH;
    const y = n * LANGKAH;
    const menyentuh = x > -JARI && x < UBIN + JARI && y > -JARI && y < UBIN + JARI;
    if (menyentuh && !TITIK.some(([a, b]) => a === x && b === y)) kurang.push([x, y]);
  }
}
cek(kurang.length === 0, `tidak ada titik kisi yang bolong (kelengkapan: ${kurang.length === 0 ? "penuh" : JSON.stringify(kurang)})`);

console.log(`teksturParang.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
