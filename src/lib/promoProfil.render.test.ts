/**
 * Uji render aset profil: menjalankan painter di atas
 * `CanvasRenderingContext2D` tiruan (tanpa DOM) untuk memastikan seluruh jalur
 * gambar berjalan tanpa error, dan teks foto profil benar-benar berada di dalam
 * lingkaran aman potongan bulat WhatsApp.
 */
import {
  ASET_PROFIL,
  BACKGROUND_BATAS_AMAN,
  FOTO_PROFIL_PUSAT,
  RADIUS_AMAN_BULAT,
  gambarAsetProfil,
} from "./promoProfil";

let passed = 0;
let failed = 0;

function ok(label: string, syarat: boolean) {
  if (syarat) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`✗ ${label}`);
  }
}

type Jejak = { op: "fillText" | "arc"; x: number; y: number; teks?: string };

/** Ukuran font (px) dari string `ctx.font`, mis. "800 104px sans-serif". */
function ukuranFont(font: string): number {
  const m = /(\d+(?:\.\d+)?)px/.exec(font);
  return m ? Number(m[1]) : 16;
}

/** Tiruan ctx yang mencatat posisi `fillText`/`arc` dan menaksir lebar teks
 *  seperti font sans-serif tebal (±0.62 em per huruf). */
function buatCtxTiruan(lebar: number, tinggi: number) {
  const jejak: Jejak[] = [];
  let font = "16px sans-serif";
  const ctx = {
    canvas: { width: lebar, height: tinggi },
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    lineCap: "",
    globalAlpha: 1,
    textAlign: "left",
    textBaseline: "alphabetic",
    get font() {
      return font;
    },
    set font(nilai: string) {
      font = nilai;
    },
    save() {},
    restore() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    translate() {},
    rotate() {},
    clip() {},
    fillRect() {},
    drawImage() {},
    fill() {},
    stroke() {},
    arc(x: number, y: number) {
      jejak.push({ op: "arc", x, y });
    },
    fillText(teks: string, x: number, y: number) {
      jejak.push({ op: "fillText", x, y, teks });
    },
    measureText(teks: string) {
      return { width: teks.length * ukuranFont(font) * 0.62 };
    },
    createRadialGradient() {
      return { addColorStop() {} };
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, jejak };
}

// ---- Setiap aset harus selesai digambar tanpa error ----
for (const aset of ASET_PROFIL) {
  const { ctx, jejak } = buatCtxTiruan(aset.canvas[0], aset.canvas[1]);
  let galat: unknown = null;
  try {
    gambarAsetProfil(ctx, aset);
  } catch (err) {
    galat = err;
  }
  ok(`render ${aset.id} selesai tanpa error (${galat ? String(galat) : "ok"})`, galat === null);
  ok(`render ${aset.id} menggambar teks`, jejak.some((j) => j.op === "fillText"));
  ok(`render ${aset.id} menggambar bentuk`, jejak.some((j) => j.op === "arc"));
}

// ---- Foto profil: teks harus di dalam lingkaran aman ----
const foto = ASET_PROFIL.find((a) => a.id === "foto-profil");
if (foto) {
  const { ctx, jejak } = buatCtxTiruan(foto.canvas[0], foto.canvas[1]);
  gambarAsetProfil(ctx, foto);
  const radiusAman = foto.canvas[0] * RADIUS_AMAN_BULAT;
  const teks = jejak.filter((j) => j.op === "fillText");
  let terjauh = 0;
  for (const t of teks) {
    terjauh = Math.max(terjauh, Math.hypot(t.x - FOTO_PROFIL_PUSAT, t.y - FOTO_PROFIL_PUSAT));
  }
  ok(`teks foto profil di dalam lingkaran aman (${terjauh.toFixed(1)} ≤ ${radiusAman})`, terjauh <= radiusAman);
  ok("judul PINDAI digambar", teks.some((t) => t.teks === "PINDAI"));
  ok(
    "eyebrow PINJAM & GADAI DIGITAL digambar per huruf",
    teks.filter((t) => (t.teks ?? "").length === 1).length >= 20,
  );
}

// ---- Background: tidak ada konten di zona tertutup foto profil ----
const background = ASET_PROFIL.find((a) => a.id === "background-profil");
if (background) {
  const { ctx, jejak } = buatCtxTiruan(background.canvas[0], background.canvas[1]);
  gambarAsetProfil(ctx, background);
  const teks = jejak.filter((j) => j.op === "fillText");
  const diZonaTerlarang = teks.filter((t) => t.y > BACKGROUND_BATAS_AMAN && t.y < 720);
  ok(
    `tidak ada teks di zona tertutup foto profil (${diZonaTerlarang.length} temuan)`,
    diZonaTerlarang.length === 0,
  );
  ok("judul PINDAI digambar di sampul", teks.some((t) => t.teks === "PINDAI"));
  ok(
    "pil kata kunci digambar",
    ["Pinjam", "Gadai", "Kredit"].every((k) => teks.some((t) => t.teks === k)),
  );
}

console.log(`promoProfil render tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
