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
  TATA_BACKGROUND,
  brankas,
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

type Jejak = {
  op: "fillText" | "arc" | "ellipse";
  x: number;
  y: number;
  teks?: string;
  /** Radius (arc) atau radius-X (ellipse). */
  r?: number;
  ry?: number;
};

/** Ukuran font (px) dari string `ctx.font`, mis. "800 104px sans-serif". */
function ukuranFont(font: string): number {
  const m = /(\d+(?:\.\d+)?)px/.exec(font);
  return m ? Number(m[1]) : 16;
}

/** Tiruan ctx yang mencatat posisi `fillText`/`arc`/`ellipse` dan menaksir
 *  lebar teks seperti font sans-serif tebal (±0.62 em per huruf). */
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
    arc(x: number, y: number, r: number) {
      jejak.push({ op: "arc", x, y, r });
    },
    ellipse(x: number, y: number, rx: number, ry: number) {
      jejak.push({ op: "ellipse", x, y, r: rx, ry });
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
    createLinearGradient() {
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
  ok(`render ${aset.id} menggambar bayangan kontak brankas`, jejak.some((j) => j.op === "ellipse"));
}

// ---- Foto profil: teks & bentuk harus di dalam lingkaran aman ----
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

  // Segel kuningan tidak boleh melewati potongan bulat WhatsApp.
  const busur = jejak.filter((j) => j.op === "arc");
  const rBusurTerbesar = busur.reduce((maks, j) => Math.max(maks, j.r ?? 0), 0);
  ok(
    `busur segel terbesar masih di dalam lingkaran aman (${rBusurTerbesar.toFixed(1)} ≤ ${radiusAman})`,
    rBusurTerbesar <= radiusAman,
  );

  // Bayangan kontak (brankas + landasan) tetap di dalam potongan bulat.
  const elips = jejak.filter((j) => j.op === "ellipse");
  let elipsTerjauh = 0;
  for (const e of elips) {
    elipsTerjauh = Math.max(
      elipsTerjauh,
      Math.abs(e.y - FOTO_PROFIL_PUSAT) + Math.hypot(e.r ?? 0, e.ry ?? 0),
    );
  }
  ok(`bayangan kontak foto profil di dalam lingkaran aman (${elipsTerjauh.toFixed(1)} ≤ ${radiusAman})`, elipsTerjauh <= radiusAman);
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

  // Band bawah hanya berisi ornamen: satu-satunya teks di sana adalah pita kata.
  const { pita } = TATA_BACKGROUND;
  const diBand = teks.filter((t) => t.y > BACKGROUND_BATAS_AMAN);
  ok(
    `teks di band bawah hanya pita kata (${diBand.length} temuan)`,
    diBand.length > 0 && diBand.every((t) => t.teks === pita.teks && t.y === pita.y),
  );
  ok(
    "pita kata diulang memenuhi lebar band",
    diBand.filter((t) => t.y === pita.y).length >= 3,
  );
}

// ---- Lambang brankas dipakai bersama lencana header poster ----
{
  const { ctx, jejak } = buatCtxTiruan(400, 400);
  const alignSebelum = ctx.textAlign;
  const baselineSebelum = ctx.textBaseline;
  const alphaSebelum = ctx.globalAlpha;
  let galat: unknown = null;
  try {
    brankas(ctx, 20, 30, 96);
  } catch (err) {
    galat = err;
  }
  ok(`lencana brankas selesai digambar (${galat ? String(galat) : "ok"})`, galat === null);
  ok("lencana brankas menggambar dial", jejak.some((j) => j.op === "arc"));
  // Kedalaman: bayangan kontak + celah cahaya (gradien) harus ikut tergambar.
  ok("lencana brankas punya bayangan kontak", jejak.some((j) => j.op === "ellipse"));
  // Lencana murni bentuk: tidak menulis teks, sehingga header poster tetap
  // mengontrol font/judul di sebelahnya.
  ok("lencana brankas tidak menulis teks", !jejak.some((j) => j.op === "fillText"));
  ok("lencana brankas tidak mengubah textAlign", ctx.textAlign === alignSebelum);
  ok("lencana brankas tidak mengubah textBaseline", ctx.textBaseline === baselineSebelum);
  ok("lencana brankas tidak mengubah globalAlpha", ctx.globalAlpha === alphaSebelum);
}

console.log(`promoProfil render tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
