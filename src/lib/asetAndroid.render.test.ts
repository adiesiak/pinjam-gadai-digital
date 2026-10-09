/**
 * Uji render aset aplikasi Android: menjalankan setiap painter di atas
 * `CanvasRenderingContext2D` tiruan (tanpa DOM) untuk memastikan tiga hal yang
 * tidak bisa dijaga uji tata letak murni:
 *  1. Seluruh jalur gambar selesai tanpa error dan tanpa koordinat NaN.
 *  2. Aturan transparansi benar-benar dijalankan — aset yang wajib latar penuh
 *     mengisi seluruh kanvas dan tidak menclearkan apa pun, sedangkan aset
 *     transparan menclearkan kanvas lebih dulu dan tidak menutupinya penuh.
 *  3. Ikon notifikasi hanya memakai putih (status bar Android mengabaikan
 *     warna dan merender ikon berwarna jadi kotak putih).
 * Run: bun src/lib/asetAndroid.render.test.ts
 */
import { ASET_ANDROID, gambarAsetAndroid, lambangBrankas, type AsetAndroid } from "./asetAndroid";
import { TAGLINE } from "./promoPosters";

let passed = 0;
let failed = 0;

function ok(label: string, syarat: boolean): void {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`✗ ${label}`);
  }
}

type Op = {
  op: string;
  args: number[];
  /** Warna yang aktif saat op menggambar (fillStyle/strokeStyle). */
  warna?: string;
  teks?: string;
};

/** Ukuran font (px) dari string `ctx.font`, mis. "800 132px sans-serif". */
function ukuranFont(font: string): number {
  const m = /(\d+(?:\.\d+)?)px/.exec(font);
  return m ? Number(m[1]) : 16;
}

type CtxTiruan = {
  ctx: CanvasRenderingContext2D;
  ops: Op[];
  /** Panggilan `addColorStop` — gradien juga tidak boleh memakai warna aneh. */
  stops: string[];
};

/** Tiruan ctx yang mencatat setiap op menggambar beserta warnanya. */
function buatCtxTiruan(lebar: number, tinggi: number): CtxTiruan {
  const ops: Op[] = [];
  const stops: string[] = [];
  let font = "16px sans-serif";

  const catat = (op: string, args: number[], warna?: string, teks?: string) => {
    ops.push({ op, args, warna, teks });
  };

  const ctx = {
    canvas: { width: lebar, height: tinggi },
    fillStyle: "#000000",
    strokeStyle: "#000000",
    lineWidth: 1,
    lineCap: "butt",
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
    moveTo(x: number, y: number) {
      catat("moveTo", [x, y]);
    },
    lineTo(x: number, y: number) {
      catat("lineTo", [x, y]);
    },
    quadraticCurveTo(cx: number, cy: number, x: number, y: number) {
      catat("quadraticCurveTo", [cx, cy, x, y]);
    },
    arc(x: number, y: number, r: number, mulai: number, selesai: number) {
      catat("arc", [x, y, r, mulai, selesai]);
    },
    fill() {
      catat("fill", [], (this as { fillStyle: string }).fillStyle);
    },
    stroke() {
      catat("stroke", [], (this as { strokeStyle: string }).strokeStyle);
    },
    fillRect(x: number, y: number, w: number, h: number) {
      catat("fillRect", [x, y, w, h], (this as { fillStyle: string }).fillStyle);
    },
    clearRect(x: number, y: number, w: number, h: number) {
      catat("clearRect", [x, y, w, h]);
    },
    fillText(teks: string, x: number, y: number) {
      catat("fillText", [x, y], (this as { fillStyle: string }).fillStyle, teks);
    },
    measureText(teks: string) {
      return { width: teks.length * ukuranFont(font) * 0.6 };
    },
    clip() {
      catat("clip", []);
    },
    createRadialGradient() {
      return {
        addColorStop(_pos: number, warna: string) {
          stops.push(warna);
        },
      };
    },
    createLinearGradient() {
      return {
        addColorStop(_pos: number, warna: string) {
          stops.push(warna);
        },
      };
    },
  };

  return { ctx: ctx as unknown as CanvasRenderingContext2D, ops, stops };
}

/** Apakah warna ini putih ber-alpha (boleh `#ffffff` atau `rgba(255,255,255,*)`). */
function putihBerAlpha(warna: string): boolean {
  const hex = /^#([0-9a-f]{6})$/i.exec(warna.trim());
  if (hex) return hex[1].toUpperCase() === "FFFFFF";
  const rgba = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/i.exec(warna.trim());
  if (rgba) return Number(rgba[1]) === 255 && Number(rgba[2]) === 255 && Number(rgba[3]) === 255;
  return false;
}

/**
 * Palet yang boleh muncul di stop gradien: pendar emas/kuningan, vignette
 * hitam, dan highlight putih. Warna lain berarti ada warna di luar palet brand
 * yang masuk lewat gradien.
 */
const WARNA_GRADIEN = new Set([
  "224,182,77", // GOLD
  "185,155,98", // BRASS
  "0,0,0", // vignette
  "255,255,255", // kilau
]);

/** Stop gradien harus transparan, atau salah satu warna palet di atas. */
function stopGradienSah(warna: string): boolean {
  const rgba = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/i.exec(warna.trim());
  if (!rgba) return false;
  const a = Number(rgba[4]);
  if (a === 0) return true;
  return WARNA_GRADIEN.has(`${Number(rgba[1])},${Number(rgba[2])},${Number(rgba[3])}`);
}

for (const aset of ASET_ANDROID) {
  const [w, h] = aset.canvas;
  const { ctx, ops, stops } = buatCtxTiruan(w, h);

  let galat: unknown = null;
  try {
    gambarAsetAndroid(ctx, aset);
  } catch (err) {
    galat = err;
  }
  ok(`render "${aset.id}" selesai tanpa error (${galat ? String(galat) : "ok"})`, galat === null);

  // Tidak ada koordinat NaN/Infinity yang lolos ke kanvas.
  const rusak = ops.filter((o) => o.args.some((n) => !Number.isFinite(n)));
  ok(`render "${aset.id}" tanpa koordinat NaN (${rusak.length} temuan)`, rusak.length === 0);

  // Tidak ada elemen yang keluar kanvas: pada Android, konten yang melewati
  // kanvas langsung terpotong (ikon/ splash tampak miring atau terpangkas).
  const keluar: string[] = [];
  for (const o of ops) {
    const titik: Array<[number, number]> = [];
    if (o.op === "arc") {
      const [x, y, r] = o.args;
      titik.push([x - r, y - r], [x + r, y + r]);
    } else if (o.op === "fillRect" || o.op === "clearRect") {
      const [x, y, w_, h_] = o.args;
      titik.push([x, y], [x + w_, y + h_]);
    } else if (o.op === "fillText") {
      titik.push([o.args[0], o.args[1]]);
    } else if (o.op === "moveTo" || o.op === "lineTo") {
      titik.push([o.args[0], o.args[1]]);
    } else if (o.op === "quadraticCurveTo") {
      titik.push([o.args[0], o.args[1]], [o.args[2], o.args[3]]);
    }
    for (const [x, y] of titik) {
      if (x < -1 || y < -1 || x > w + 1 || y > h + 1) {
        keluar.push(`${o.op}(${x.toFixed(1)},${y.toFixed(1)})`);
      }
    }
  }
  ok(
    `render "${aset.id}" tidak ada elemen keluar kanvas (${keluar.slice(0, 3).join(" ")})`,
    keluar.length === 0,
  );

  // Ada yang digambar, dan ada op menggambar (bukan hanya lintasan).
  ok(`render "${aset.id}" menggambar bentuk (${ops.length} op)`, ops.length > 0);
  ok(
    `render "${aset.id}" benar-benar memoles kanvas`,
    ops.some((o) => o.op === "fill" || o.op === "fillRect" || o.op === "fillText"),
  );

  const fillPenuh = ops.some(
    (o) => o.op === "fillRect" && o.args[0] <= 0 && o.args[1] <= 0 && o.args[2] >= w && o.args[3] >= h,
  );
  const clear = ops.some((o) => o.op === "clearRect");

  if (aset.latarPenuh) {
    ok(`"${aset.id}" mengisi seluruh kanvas (latar penuh)`, fillPenuh);
    ok(`"${aset.id}" tidak menclearkan kanvas (wajib opaque)`, !clear);
  } else {
    ok(`"${aset.id}" menclearkan kanvas lebih dulu (transparan)`, clear);
    ok(`"${aset.id}" tidak menutupi seluruh kanvas (harus transparan)`, !fillPenuh);
  }

  // Teks: aset berteks memuat judul + tagline, aset lambang tidak menulis apa
  // pun. Judul pada splash ditulis per huruf (jarak antar-huruf manual), jadi
  // yang diperiksa adalah gabungan teks, bukan satu panggilan `fillText`.
  const teks = ops.filter((o) => o.op === "fillText");
  const gabung = teks.map((t) => t.teks ?? "").join("");
  if (aset.berteks) {
    ok(`"${aset.id}" menulis judul PINDAI`, gabung.includes("PINDAI"));
    ok(`"${aset.id}" menulis tagline ${TAGLINE}`, gabung.includes(TAGLINE));
  } else {
    ok(`"${aset.id}" tidak menulis teks (murni lambang)`, teks.length === 0);
  }

  // Gradien hanya boleh memakai palet brand (pendar emas/kuningan, vignette,
  // kilau) — warna tak dikenal berarti palet bocor lewat gradien.
  ok(
    `"${aset.id}" gradien hanya memakai palet brand (${stops.length} stop)`,
    stops.every(stopGradienSah),
  );

  if (aset.id === "ikon-notifikasi") {
    const warnaCat = ops.map((o) => o.warna).filter((c): c is string => typeof c === "string");
    ok(`ikon notifikasi memakai banyak op menggambar (${warnaCat.length})`, warnaCat.length >= 4);
    ok(
      "ikon notifikasi HANYA memakai putih ber-alpha",
      warnaCat.every(putihBerAlpha),
    );
  }

  if (aset.id === "splash-android12") {
    const clip = ops.some((o) => o.op === "clip");
    ok("splash Android 12 memotong pendar mengikuti cakram (clip)", clip);
    ok(
      "splash Android 12 menggambar cakram radius 384",
      ops.some((o) => o.op === "arc" && o.args[2] === 384),
    );
  }
}

// ---------------------------------------------------------------------------
// Ikon benar-benar memuat lambang, dan lambangnya identik di semua ukuran.
// ---------------------------------------------------------------------------

/** Cacah op menggambar satu aset pada ukuran kanvasnya. */
function cacahOp(aset: AsetAndroid): { kurva: number; busur: number } {
  const { ctx, ops } = buatCtxTiruan(aset.canvas[0], aset.canvas[1]);
  gambarAsetAndroid(ctx, aset);
  return {
    kurva: ops.filter((o) => o.op === "quadraticCurveTo").length,
    busur: ops.filter((o) => o.op === "arc").length,
  };
}

/** Cacah op lambang saja, digambar langsung pada sisi & gaya tertentu. */
function cacahLambang(sisi: number, gaya: "brand" | "putih"): { kurva: number; busur: number } {
  const { ctx, ops } = buatCtxTiruan(sisi, sisi);
  lambangBrankas(ctx, 0, 0, sisi, gaya);
  return {
    kurva: ops.filter((o) => o.op === "quadraticCurveTo").length,
    busur: ops.filter((o) => o.op === "arc").length,
  };
}

{
  // Lambang tidak boleh berubah bentuk karena diperbesar/diperkecil: ikon 512
  // dan lambang 176 px harus meninggalkan jejak op yang sama.
  for (const gaya of ["brand", "putih"] as const) {
    const kecil = cacahLambang(gaya === "brand" ? 176 : 72, gaya);
    const besar = cacahLambang(gaya === "brand" ? 737 : 288, gaya);
    ok(
      `lambang ${gaya} sama di segala ukuran (kurva ${kecil.kurva}/${besar.kurva}, busur ${kecil.busur}/${besar.busur})`,
      kecil.kurva === besar.kurva && kecil.busur === besar.busur,
    );
  }

  // Ikon wajib memakai lambang yang benar-benar digambar — bukan kanvas kosong
  // dengan latar saja. Ikon notifikasi memakai varian putih, sisanya varian brand.
  const acuan: Array<{ id: AsetAndroid["id"]; gaya: "brand" | "putih" }> = [
    { id: "ikon-adaptive-foreground", gaya: "brand" },
    { id: "logo-kotak", gaya: "brand" },
    { id: "ikon-notifikasi", gaya: "putih" },
    { id: "splash-android12", gaya: "brand" },
  ];
  for (const { id, gaya } of acuan) {
    const aset = ASET_ANDROID.find((a) => a.id === id) as AsetAndroid;
    const c = cacahOp(aset);
    const l = cacahLambang(aset.canvas[0], gaya);
    ok(
      `"${id}" memuat lambang ${gaya} (kurva ${c.kurva} ≥ ${l.kurva}, busur ${c.busur} ≥ ${l.busur})`,
      c.kurva >= l.kurva && c.busur >= l.busur,
    );
  }

  // Ikon peluncur memuat lambang DI ATAS latar bertitik, jadi jejaknya harus
  // lebih banyak daripada lambangnya sendiri.
  const peluncur = cacahOp(ASET_ANDROID.find((a) => a.id === "ikon-playstore") as AsetAndroid);
  ok(
    `ikon Play Store memuat lambang di atas latar (busur ${peluncur.busur} > ${cacahLambang(512, "brand").busur})`,
    peluncur.busur > cacahLambang(512, "brand").busur,
  );
}

console.log(`asetAndroid.render.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
