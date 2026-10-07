/**
 * promoPosterGambar — komposer poster kampanye PINDAI di atas Canvas 2D.
 *
 * Satu kerangka untuk sembilan poster: latar teal pekat, bingkai tipis, grain,
 * watermark sangat samar, kepala berlogo + tagline, badge, headline tegas,
 * deskripsi, zona konten per varian, tombol CTA, dan disclaimer kecil. Konten
 * spesifik tiap poster datang dari data `promoPosters` — tidak ada teks atau
 * angka yang ditulis di sini (placeholder biaya pun berasal dari data).
 *
 * Output selalu 1080 × 1350 px (rasio 4:5) pada skala ctx 1:1; kanvas memang
 * dibuat sebesar itu sehingga unduhan PNG identik dengan pratinjau.
 */
import { TAGLINE, type PromoPoster } from "./promoPosters";

export const UKURAN_POSTER = { lebar: 1080, tinggi: 1350 } as const;

const FONT = "ui-sans-serif, system-ui, sans-serif";

/** Palet tetap — sengaja tidak mengikuti tema situs supaya PNG selalu sama. */
const TEAL = "#0e3733";
const TEAL_TUA = "#0a2a27";
const HUTAN = "#15524b";
const IVORY = "#f1ede3";
const CREAM = "#fbf8f1";
const REDUP = "#b9c7c2";
const EMAS = "#d8b45e";
const JINGGA = "#d4703c";
const TOSKA = "#5fb3a8";

const AKSEN: Record<PromoPoster["aksen"], string> = {
  emas: EMAS,
  jingga: JINGGA,
  toska: TOSKA,
};

type Ctx = CanvasRenderingContext2D;

/** Warna hex → rgba(a). */
function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Jalur rounded-rect (panggil fill/stroke sendiri). */
function bulat(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

/** Pecah teks jadi baris — menghormati \n lebih dulu lalu membungkus baris. */
function bungkus(ctx: Ctx, teks: string, maxW: number): string[] {
  const hasil: string[] = [];
  for (const paragraf of teks.split("\n")) {
    let baris = "";
    for (const k of paragraf.split(" ")) {
      const coba = baris ? `${baris} ${k}` : k;
      if (baris && ctx.measureText(coba).width > maxW) {
        hasil.push(baris);
        baris = k;
      } else {
        baris = coba;
      }
    }
    hasil.push(baris);
  }
  return hasil;
}

type OpsiTulis = {
  fs: number;
  berat?: number;
  warna?: string;
  align?: CanvasTextAlign;
  maxW?: number;
  lineH?: number;
  alpha?: number;
};

/** Tulis blok teks (wrap) dari titik (x,y) sebagai TOP; kembalikan y akhir. */
function tulis(ctx: Ctx, teks: string, x: number, y: number, o: OpsiTulis): number {
  if (!teks) return y;
  const lineH = o.lineH ?? o.fs * 1.28;
  ctx.save();
  ctx.font = `${o.berat ?? 600} ${o.fs}px ${FONT}`;
  ctx.fillStyle = o.warna ?? IVORY;
  ctx.textAlign = o.align ?? "left";
  ctx.textBaseline = "top";
  if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
  const baris = bungkus(ctx, teks, o.maxW ?? 100_000);
  let cy = y;
  for (const b of baris) {
    ctx.fillText(b, x, cy);
    cy += lineH;
  }
  ctx.restore();
  return cy;
}

function lebarTeks(ctx: Ctx, teks: string, fs: number, berat = 700): number {
  ctx.save();
  ctx.font = `${berat} ${fs}px ${FONT}`;
  const w = ctx.measureText(teks).width;
  ctx.restore();
  return w;
}

// ---------------------------------------------------------------------------
// Elemen kerangka
// ---------------------------------------------------------------------------

/** Butiran (grain) sangat halus — deterministik supaya hasil uji stabil. */
function grain(ctx: Ctx): void {
  let s = 20_260_907;
  ctx.save();
  ctx.fillStyle = rgba(IVORY, 0.05);
  for (let i = 0; i < 900; i += 1) {
    s = (s * 1_664_525 + 1_013_904_223) >>> 0;
    const x = (s % 1080) >>> 0;
    s = (s * 1_664_525 + 1_013_904_223) >>> 0;
    const y = (s % 1350) >>> 0;
    s = (s * 1_664_525 + 1_013_904_223) >>> 0;
    const r = 1 + (s % 2);
    ctx.fillRect(x, y, r, r);
  }
  ctx.restore();
}

/** Watermark "PINDAI" raksasa — sangat subtle, di tengah poster. */
function watermark(ctx: Ctx): void {
  ctx.save();
  ctx.translate(540, 720);
  ctx.rotate(-0.16);
  ctx.font = `800 330px ${FONT}`;
  ctx.fillStyle = rgba(IVORY, 0.05);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("PINDAI", 0, 0);
  ctx.restore();
}

/** Latar + bingkai editorial + dua lingkaran geometris tipis. */
function latar(ctx: Ctx, aksen: string): void {
  ctx.save();
  ctx.fillStyle = TEAL;
  ctx.fillRect(0, 0, UKURAN_POSTER.lebar, UKURAN_POSTER.tinggi);
  ctx.fillStyle = TEAL_TUA;
  ctx.fillRect(0, 1080, UKURAN_POSTER.lebar, 270);

  ctx.strokeStyle = rgba(aksen, 0.16);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(985, 150, 250, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = rgba(IVORY, 0.07);
  ctx.beginPath();
  ctx.arc(90, 1230, 210, 0, Math.PI * 2);
  ctx.stroke();

  bulat(ctx, 34, 34, 1012, 1282, 44);
  ctx.strokeStyle = rgba(IVORY, 0.12);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  watermark(ctx);
  grain(ctx);
}

/** Logo lockup: petak brankas + wordmark PINDAI + tagline. */
function logo(
  ctx: Ctx,
  x: number,
  y: number,
  skala: number,
  aksen: string,
  tengah = false,
): number {
  const s = skala;
  const ukuran = Math.round(56 * s);
  const bx = tengah ? x - ukuran / 2 : x;
  bulat(ctx, bx, y, ukuran, ukuran, Math.round(14 * s));
  ctx.fillStyle = IVORY;
  ctx.fill();
  ctx.strokeStyle = rgba(TEAL, 0.25);
  ctx.lineWidth = Math.max(1, 2 * s);
  ctx.stroke();

  const cx = bx + ukuran / 2;
  const cy = y + ukuran / 2;
  ctx.beginPath();
  ctx.arc(cx, cy, ukuran * 0.3, 0, Math.PI * 2);
  ctx.strokeStyle = TEAL;
  ctx.lineWidth = Math.max(2, 5 * s);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, ukuran * 0.1, 0, Math.PI * 2);
  ctx.fillStyle = aksen;
  ctx.fill();

  const fsWord = Math.round(44 * s);
  const xWord = tengah ? x + ukuran / 2 + 14 * s : x + ukuran + 18 * s;
  const yWord = y - 4 * s;
  ctx.font = `800 ${fsWord}px ${FONT}`;
  ctx.fillStyle = IVORY;
  ctx.textAlign = tengah ? "left" : "left";
  ctx.textBaseline = "top";
  ctx.fillText("PINDAI", xWord, yWord);

  const fsTag = Math.round(17 * s);
  ctx.font = `700 ${fsTag}px ${FONT}`;
  ctx.fillStyle = aksen;
  ctx.fillText(TAGLINE, xWord, yWord + fsWord + 8 * s);
  return Math.max(ukuran, fsWord + fsTag + 14 * s);
}

/** Badge pill kecil di atas headline. */
function badge(ctx: Ctx, teks: string, x: number, y: number, aksen: string): number {
  const fs = 22;
  const w = lebarTeks(ctx, teks.toUpperCase(), fs, 800) + 52;
  const h = 54;
  bulat(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = rgba(aksen, 0.14);
  ctx.fill();
  ctx.strokeStyle = rgba(aksen, 0.6);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.font = `800 ${fs}px ${FONT}`;
  ctx.fillStyle = aksen;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(teks.toUpperCase(), x + 26, y + h / 2 + 1);
  ctx.textBaseline = "top";
  return h;
}

/** Deret pil fitur — membungkus baris bila tidak muat. */
function chips(ctx: Ctx, daftar: readonly string[], x: number, yMaks: number, aksen: string): number {
  if (daftar.length === 0) return yMaks;
  const fs = 26;
  const h = 58;
  const gap = 16;
  const padX = 26;
  const maxW = 920;

  const baris: { teks: string; w: number }[][] = [];
  let kini: { teks: string; w: number }[] = [];
  let lebar = 0;
  for (const t of daftar) {
    const w = Math.round(lebarTeks(ctx, t, fs, 700)) + padX * 2;
    const coba = kini.length === 0 ? w : lebar + gap + w;
    if (coba > maxW && kini.length > 0) {
      baris.push(kini);
      kini = [{ teks: t, w }];
      lebar = w;
    } else {
      kini.push({ teks: t, w });
      lebar = coba;
    }
  }
  if (kini.length > 0) baris.push(kini);

  const totalH = baris.length * h + (baris.length - 1) * gap;
  let y = yMaks - totalH;
  for (const b of baris) {
    const lebarBaris = b.reduce((s, c) => s + c.w, 0) + gap * (b.length - 1);
    let cx = x + (maxW - lebarBaris) / 2;
    for (const c of b) {
      bulat(ctx, cx, y, c.w, h, h / 2);
      ctx.fillStyle = rgba(IVORY, 0.07);
      ctx.fill();
      ctx.strokeStyle = rgba(aksen, 0.45);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.font = `700 ${fs}px ${FONT}`;
      ctx.fillStyle = IVORY;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(c.teks, cx + c.w / 2, y + h / 2 + 1);
      cx += c.w + gap;
    }
    y += h + gap;
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  return yMaks;
}

/** Tombol CTA pill. */
function tombol(ctx: Ctx, teks: string, x: number, y: number, aksen: string, tengah: boolean, fs = 34): number {
  const h = fs + 58;
  const w = lebarTeks(ctx, teks, fs, 800) + 88;
  const bx = tengah ? x - w / 2 : x;
  bulat(ctx, bx, y, w, h, h / 2);
  ctx.fillStyle = IVORY;
  ctx.fill();
  ctx.strokeStyle = rgba(aksen, 0.8);
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.font = `800 ${fs}px ${FONT}`;
  ctx.fillStyle = TEAL;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(teks, bx + w / 2, y + h / 2 + 2);
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  return h;
}

/** Pill b Outline (CTA sekunder). */
function tombolOutline(ctx: Ctx, teks: string, x: number, y: number, aksen: string, tengah: boolean, fs = 24): number {
  const h = fs + 32;
  const w = lebarTeks(ctx, teks, fs, 700) + 64;
  const bx = tengah ? x - w / 2 : x;
  bulat(ctx, bx, y, w, h, h / 2);
  ctx.strokeStyle = rgba(IVORY, 0.5);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.font = `700 ${fs}px ${FONT}`;
  ctx.fillStyle = IVORY;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(teks, bx + w / 2, y + h / 2 + 1);
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  return h;
}

// ---------------------------------------------------------------------------
// Ikon geometris minimal
// ---------------------------------------------------------------------------

function ikonCentang(ctx: Ctx, cx: number, cy: number, r: number, aksen: string): void {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = rgba(aksen, 0.18);
  ctx.fill();
  ctx.strokeStyle = aksen;
  ctx.lineWidth = Math.max(2, r * 0.16);
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.42, cy + r * 0.02);
  ctx.lineTo(cx - r * 0.1, cy + r * 0.34);
  ctx.lineTo(cx + r * 0.46, cy - r * 0.34);
  ctx.stroke();
}

/** Ponsel dengan antarmuka mini (kartu saldo + baris + centang). */
function ponsel(ctx: Ctx, x: number, y: number, w: number, h: number, aksen: string): void {
  bulat(ctx, x, y, w, h, w * 0.12);
  ctx.fillStyle = CREAM;
  ctx.fill();
  ctx.strokeStyle = rgba(IVORY, 0.5);
  ctx.lineWidth = 3;
  ctx.stroke();

  const pad = w * 0.09;
  const sx = x + pad;
  const sy = y + pad + h * 0.04;
  const sw = w - pad * 2;
  const sh = h - pad * 2 - h * 0.04;

  bulat(ctx, sx, sy, sw, sh, w * 0.07);
  ctx.fillStyle = TEAL_TUA;
  ctx.fill();

  // Bar header.
  bulat(ctx, sx + sw * 0.1, sy + sh * 0.1, sw * 0.5, sh * 0.06, sh * 0.03);
  ctx.fillStyle = aksen;
  ctx.fill();

  // Kartu saldo.
  bulat(ctx, sx + sw * 0.1, sy + sh * 0.22, sw * 0.8, sh * 0.2, sh * 0.04);
  ctx.fillStyle = HUTAN;
  ctx.fill();
  ctx.fillStyle = rgba(IVORY, 0.85);
  ctx.fillRect(sx + sw * 0.18, sy + sh * 0.3, sw * 0.4, sh * 0.035);
  ctx.fillStyle = aksen;
  ctx.fillRect(sx + sw * 0.18, sy + sh * 0.38, sw * 0.28, sh * 0.045);

  // Baris daftar + centang.
  for (let i = 0; i < 3; i += 1) {
    const ry = sy + sh * (0.5 + i * 0.16);
    bulat(ctx, sx + sw * 0.1, ry, sw * 0.8, sh * 0.1, sh * 0.03);
    ctx.fillStyle = rgba(IVORY, 0.08);
    ctx.fill();
    ctx.fillStyle = rgba(IVORY, 0.6);
    ctx.fillRect(sx + sw * 0.17, ry + sh * 0.035, sw * 0.42, sh * 0.03);
    ikonCentang(ctx, sx + sw * 0.79, ry + sh * 0.05, sh * 0.035, aksen);
  }
}

/** Perisai keamanan. */
function perisai(ctx: Ctx, x: number, y: number, w: number, h: number, aksen: string): void {
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y);
  ctx.lineTo(x + w, y + h * 0.22);
  ctx.lineTo(x + w, y + h * 0.55);
  ctx.quadraticCurveTo(x + w, y + h * 0.9, x + w / 2, y + h);
  ctx.quadraticCurveTo(x, y + h * 0.9, x, y + h * 0.55);
  ctx.lineTo(x, y + h * 0.22);
  ctx.closePath();
  ctx.fillStyle = rgba(aksen, 0.16);
  ctx.fill();
  ctx.strokeStyle = aksen;
  ctx.lineWidth = 5;
  ctx.stroke();
  ikonCentang(ctx, x + w / 2, y + h * 0.46, w * 0.2, aksen);
}

/** Brankas gadai (petak + dial). */
function brankas(ctx: Ctx, x: number, y: number, w: number, h: number, aksen: string): void {
  bulat(ctx, x, y, w, h, w * 0.1);
  ctx.fillStyle = HUTAN;
  ctx.fill();
  ctx.strokeStyle = aksen;
  ctx.lineWidth = 5;
  ctx.stroke();
  const cx = x + w / 2;
  const cy = y + h / 2;
  ctx.beginPath();
  ctx.arc(cx, cy, w * 0.26, 0, Math.PI * 2);
  ctx.strokeStyle = IVORY;
  ctx.lineWidth = 5;
  ctx.stroke();
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * w * 0.3, cy + Math.sin(a) * w * 0.3);
    ctx.lineTo(cx + Math.cos(a) * w * 0.36, cy + Math.sin(a) * w * 0.36);
    ctx.strokeStyle = rgba(IVORY, 0.7);
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, w * 0.07, 0, Math.PI * 2);
  ctx.fillStyle = aksen;
  ctx.fill();
}

/** Kantong belanja (kredit barang). */
function kantong(ctx: Ctx, x: number, y: number, w: number, h: number, aksen: string): void {
  bulat(ctx, x, y + h * 0.24, w, h * 0.76, w * 0.08);
  ctx.fillStyle = CREAM;
  ctx.fill();
  ctx.strokeStyle = rgba(TEAL, 0.3);
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + w / 2, y + h * 0.26, w * 0.26, Math.PI, 0);
  ctx.strokeStyle = aksen;
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.fillStyle = rgba(TEAL, 0.12);
  ctx.fillRect(x + w * 0.2, y + h * 0.5, w * 0.6, h * 0.08);
  ctx.fillRect(x + w * 0.2, y + h * 0.66, w * 0.4, h * 0.08);
}

/** Gelembung chat dengan tanda tanya (FAQ). */
function gelembung(ctx: Ctx, x: number, y: number, w: number, h: number, aksen: string): void {
  bulat(ctx, x, y, w, h, 26);
  ctx.fillStyle = rgba(IVORY, 0.07);
  ctx.fill();
  ctx.strokeStyle = rgba(aksen, 0.4);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + 34, y + h - 2);
  ctx.lineTo(x + 34, y + h + 24);
  ctx.lineTo(x + 66, y + h - 2);
  ctx.closePath();
  ctx.fillStyle = rgba(IVORY, 0.07);
  ctx.fill();

  const r = 26;
  ctx.beginPath();
  ctx.arc(x + 46, y + h / 2, r, 0, Math.PI * 2);
  ctx.fillStyle = aksen;
  ctx.fill();
  ctx.font = `800 30px ${FONT}`;
  ctx.fillStyle = TEAL;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("?", x + 46, y + h / 2 + 2);
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
}

/** Dokumen digital dengan baris teks + centang. */
function dokumen(ctx: Ctx, x: number, y: number, w: number, h: number, aksen: string): void {
  bulat(ctx, x, y, w, h, 18);
  ctx.fillStyle = CREAM;
  ctx.fill();
  ctx.strokeStyle = rgba(TEAL, 0.25);
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = rgba(TEAL, 0.18);
  for (let i = 0; i < 4; i += 1) {
    ctx.fillRect(x + w * 0.14, y + h * (0.2 + i * 0.17), w * (i === 3 ? 0.4 : 0.72), h * 0.07);
  }
  ikonCentang(ctx, x + w * 0.8, y + h * 0.24, w * 0.13, aksen);
}

// ---------------------------------------------------------------------------
// Zona konten per bentuk
// ---------------------------------------------------------------------------

const CTA_Y = 1128;
const FOOT_Y = 1264;
const RULE_Y = 172;
const MARGIN = 80;

/** Kartu baris bernomor (bentuk "langkah"). */
function daftarLangkah(ctx: Ctx, items: { teks: string }[], aksen: string, atas: number, bawah: number): void {
  const n = items.length;
  const h = 84;
  const gap = Math.min(24, ((bawah - atas) - n * h) / Math.max(1, n - 1));
  const tinggiTotal = n * h + (n - 1) * gap;
  let y = atas + Math.max(0, ((bawah - atas) - tinggiTotal) / 2);

  for (let i = 0; i < n; i += 1) {
    const it = items[i];
    if (i > 0) {
      ctx.beginPath();
      ctx.moveTo(MARGIN + 34, y - gap + 4);
      ctx.lineTo(MARGIN + 34, y + 4);
      ctx.strokeStyle = rgba(aksen, 0.5);
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    bulat(ctx, MARGIN, y, 920, h, 22);
    ctx.fillStyle = rgba(IVORY, 0.06);
    ctx.fill();
    ctx.strokeStyle = rgba(IVORY, 0.12);
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(MARGIN + 46, y + h / 2, 26, 0, Math.PI * 2);
    ctx.fillStyle = aksen;
    ctx.fill();
    ctx.font = `800 26px ${FONT}`;
    ctx.fillStyle = TEAL;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(i + 1), MARGIN + 46, y + h / 2 + 1);
    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    tulis(ctx, it.teks, MARGIN + 92, y + h / 2 - 19, { fs: 32, berat: 700 });
    y += h + gap;
  }
}

/** Deret komponen biaya (bentuk "baris") dengan operator + / =. */
function daftarBaris(
  ctx: Ctx,
  items: { judul?: string; teks: string }[],
  pemisah: string[] | undefined,
  aksen: string,
  atas: number,
  bawah: number,
): void {
  const n = items.length;
  const h = 104;
  const gap = 44;
  const tinggiTotal = n * h + (n - 1) * gap;
  let y = atas + Math.max(0, ((bawah - atas) - tinggiTotal) / 2);

  for (let i = 0; i < n; i += 1) {
    const it = items[i];
    bulat(ctx, MARGIN, y, 920, h, 24);
    ctx.fillStyle = rgba(IVORY, 0.06);
    ctx.fill();
    ctx.strokeStyle = i === n - 1 ? rgba(aksen, 0.7) : rgba(IVORY, 0.14);
    ctx.lineWidth = i === n - 1 ? 3 : 2;
    ctx.stroke();

    tulis(ctx, (it.judul ?? "").toUpperCase(), MARGIN + 32, y + 22, {
      fs: 24,
      berat: 800,
      warna: aksen,
    });
    ctx.font = `800 42px ${FONT}`;
    ctx.fillStyle = IVORY;
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillText(it.teks, MARGIN + 888, y + 34);
    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    if (i < n - 1 && pemisah?.[i]) {
      ctx.font = `800 44px ${FONT}`;
      ctx.fillStyle = aksen;
      ctx.textAlign = "left";
      ctx.fillText(pemisah[i], MARGIN + 4, y + h + 2);
    }
    y += h + gap;
  }
}

/** Kisi 2×2 kartu (bentuk "kartu" — fitur keamanan / pilar brand). */
function kisiKartu(
  ctx: Ctx,
  items: { teks: string }[],
  aksen: string,
  atas: number,
  bawah: number,
): void {
  const n = Math.min(items.length, 4);
  const lebarKartu = 450;
  const h = Math.min(150, ((bawah - atas) - 20) / 2);
  const tinggiTotal = h * 2 + 20;
  const y = atas + Math.max(0, ((bawah - atas) - tinggiTotal) / 2);

  for (let i = 0; i < n; i += 1) {
    const kolom = i % 2;
    const baris = Math.floor(i / 2);
    const x = MARGIN + kolom * (lebarKartu + 20);
    const cy = y + baris * (h + 20);
    bulat(ctx, x, cy, lebarKartu, h, 24);
    ctx.fillStyle = rgba(IVORY, 0.06);
    ctx.fill();
    ctx.strokeStyle = rgba(IVORY, 0.13);
    ctx.lineWidth = 2;
    ctx.stroke();
    ikonCentang(ctx, x + 44, cy + 44, 22, aksen);
    tulis(ctx, items[i].teks, x + 28, cy + h - 24 - (items[i].teks.length > 16 ? 44 : 0), {
      fs: 30,
      berat: 800,
      maxW: lebarKartu - 56,
      lineH: 36,
    });
  }
}

/** Deret pertanyaan (bentuk "pertanyaan" — kartu chat FAQ). */
function daftarPertanyaan(
  ctx: Ctx,
  items: { teks: string }[],
  aksen: string,
  atas: number,
  bawah: number,
): void {
  const n = items.length;
  const h = 96;
  const gap = Math.min(26, ((bawah - atas) - n * h) / Math.max(1, n - 1));
  const tinggiTotal = n * h + (n - 1) * gap;
  let y = atas + Math.max(0, ((bawah - atas) - tinggiTotal) / 2);

  for (let i = 0; i < n; i += 1) {
    gelembung(ctx, MARGIN, y, 920, h, aksen);
    tulis(ctx, items[i].teks, MARGIN + 92, y + h / 2 - 20, {
      fs: 30,
      berat: 600,
      maxW: 790,
      lineH: 38,
    });
    y += h + gap;
  }
}

/** Zona ilustrasi untuk bentuk "teks" — komposisi geometris per poster. */
function ilustrasi(ctx: Ctx, p: PromoPoster, aksen: string, x: number, y: number, w: number, h: number): void {
  const tengahX = x + w / 2;
  switch (p.id) {
    case "pinjaman": {
      dokumen(ctx, x + 60, y + 30, 300, h - 60, aksen);
      ponsel(ctx, tengahX + 90, y, 240, h, aksen);
      ikonCentang(ctx, tengahX + 20, y + 50, 26, aksen);
      ikonCentang(ctx, tengahX + 44, y + h - 60, 20, aksen);
      break;
    }
    case "gadai": {
      brankas(ctx, x + 90, y + 10, 300, h - 20, aksen);
      perisai(ctx, tengahX + 120, y + 24, 170, h - 60, aksen);
      dokumen(ctx, tengahX - 60, y + h * 0.55, 150, h * 0.42, aksen);
      break;
    }
    case "kredit": {
      kantong(ctx, x + 90, y + 10, 260, h - 20, aksen);
      ponsel(ctx, tengahX + 110, y + 6, 220, h - 12, aksen);
      ikonCentang(ctx, tengahX + 20, y + 44, 24, aksen);
      break;
    }
    case "keamanan": {
      perisai(ctx, tengahX - 90, y + 4, 180, h - 8, aksen);
      break;
    }
    default:
      break;
  }
}

/** Komposisi hero poster CTA (bentuk "hero"). */
function hero(ctx: Ctx, p: PromoPoster, aksen: string): void {
  // Glow lembut + lingkaran konsentris.
  const glow = ctx.createRadialGradient(540, 780, 40, 540, 780, 640);
  glow.addColorStop(0, rgba(aksen, 0.2));
  glow.addColorStop(1, rgba(aksen, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, UKURAN_POSTER.lebar, UKURAN_POSTER.tinggi);
  ctx.strokeStyle = rgba(IVORY, 0.08);
  ctx.lineWidth = 2;
  for (const r of [300, 430, 560]) {
    ctx.beginPath();
    ctx.arc(540, 780, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  badge(ctx, p.badge, 540 - (lebarTeks(ctx, p.badge.toUpperCase(), 22, 800) + 52) / 2, 64, aksen);

  // Logo besar terpusat.
  logo(ctx, 540 - 40, 150, 1.5, aksen, true);

  tulis(ctx, p.headline, 540, 300, {
    fs: 92,
    berat: 800,
    align: "center",
    maxW: 940,
    lineH: 100,
  });
  tulis(ctx, p.description, 540, 512, {
    fs: 30,
    berat: 500,
    warna: REDUP,
    align: "center",
    maxW: 860,
    lineH: 44,
  });

  ponsel(ctx, 390, 640, 300, 360, aksen);

  // Tiga layanan.
  const layanan = p.layanan ?? [];
  const fsL = 24;
  const lebarPil = 240;
  const gapL = 24;
  const totalL = layanan.length * lebarPil + (layanan.length - 1) * gapL;
  let lx = 540 - totalL / 2;
  for (const l of layanan) {
    bulat(ctx, lx, 1026, lebarPil, 62, 31);
    ctx.fillStyle = rgba(IVORY, 0.08);
    ctx.fill();
    ctx.strokeStyle = rgba(aksen, 0.5);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = `800 ${fsL}px ${FONT}`;
    ctx.fillStyle = IVORY;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(l, lx + lebarPil / 2, 1026 + 32);
    lx += lebarPil + gapL;
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  tombol(ctx, p.cta, 540, 1106, aksen, true, 38);
  if (p.subCta) tombolOutline(ctx, p.subCta, 540, 1216, aksen, true, 24);
}

// ---------------------------------------------------------------------------
// Komposer utama
// ---------------------------------------------------------------------------

/**
 * Gambar poster ke ctx. ctx HARUS berukuran 1080×1350 (atau kelipatan — bila
 * kanvas pratinjau lebih kecil, pemanggil mengatur scale sebelum memanggil).
 * `gambar` opsional: gambar kustom dari data `image`, bila admin menggantinya.
 */
export function gambarPoster(ctx: Ctx, p: PromoPoster, gambar?: HTMLImageElement): void {
  const aksen = AKSEN[p.aksen];

  if (p.bentuk === "hero") {
    latar(ctx, aksen);
    hero(ctx, p, aksen);
    footer(ctx, p, aksen);
    return;
  }

  latar(ctx, aksen);

  // Kepala: logo + nomor + garis pemisah.
  logo(ctx, MARGIN, 64, 1, aksen);
  ctx.font = `700 22px ${FONT}`;
  ctx.fillStyle = rgba(IVORY, 0.55);
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  ctx.fillText(`${p.nomor} / 09`, 1000, 76);
  ctx.textAlign = "left";
  ctx.beginPath();
  ctx.moveTo(MARGIN, RULE_Y);
  ctx.lineTo(1000, RULE_Y);
  ctx.strokeStyle = rgba(IVORY, 0.16);
  ctx.lineWidth = 2;
  ctx.stroke();

  // Badge + headline + deskripsi.
  let y = 214;
  y += badge(ctx, p.badge, MARGIN, y, aksen) + 34;

  y = tulis(ctx, p.headline, MARGIN, y, {
    fs: p.bentuk === "langkah" ? 78 : 84,
    berat: 800,
    maxW: 920,
    lineH: p.bentuk === "langkah" ? 86 : 92,
  });
  if (p.description) {
    y = tulis(ctx, p.description, MARGIN, y + 26, {
      fs: 30,
      berat: 500,
      warna: REDUP,
      maxW: 880,
      lineH: 44,
    });
  }

  const atas = y + 44;
  const bawah = p.bentuk === "teks" ? 960 : CTA_Y - 44;

  switch (p.bentuk) {
    case "teks": {
      if (gambar) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(MARGIN, atas, 920, bawah - atas);
        ctx.clip();
        const rasio = Math.max(920 / gambar.width, (bawah - atas) / gambar.height);
        const dw = gambar.width * rasio;
        const dh = gambar.height * rasio;
        ctx.drawImage(gambar, MARGIN + (920 - dw) / 2, atas + (bawah - atas - dh) / 2, dw, dh);
        ctx.restore();
      } else {
        ilustrasi(ctx, p, aksen, MARGIN, atas, 920, bawah - atas);
      }
      chips(ctx, p.features, MARGIN, CTA_Y - 34, aksen);
      break;
    }
    case "langkah":
      daftarLangkah(ctx, p.items ?? [], aksen, atas, bawah);
      break;
    case "baris":
      daftarBaris(ctx, p.items ?? [], p.pemisah, aksen, atas, bawah);
      if (p.catatan) {
        tulis(ctx, p.catatan, 540, CTA_Y - 96, {
          fs: 26,
          berat: 700,
          warna: aksen,
          align: "center",
          maxW: 880,
        });
      }
      break;
    case "kartu":
      kisiKartu(ctx, p.items ?? p.features.map((t) => ({ teks: t })), aksen, atas, bawah);
      if (p.tautan && p.tautan.length > 0) {
        const fsT = 24;
        let tx = MARGIN;
        ctx.font = `700 ${fsT}px ${FONT}`;
        for (const t of p.tautan) {
          const w = ctx.measureText(t).width + 34;
          bulat(ctx, tx, CTA_Y - 108, w, 46, 23);
          ctx.strokeStyle = rgba(IVORY, 0.35);
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.fillStyle = rgba(IVORY, 0.85);
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(t, tx + 17, CTA_Y - 108 + 24);
          tx += w + 16;
        }
        ctx.textBaseline = "top";
      }
      break;
    case "pertanyaan":
      daftarPertanyaan(ctx, p.items ?? [], aksen, atas, bawah);
      break;
    default:
      break;
  }

  tombol(ctx, p.cta, MARGIN, CTA_Y, aksen, false);
  footer(ctx, p, aksen);
}

/** Baris kaki: disclaimer kiri + tagline kanan. */
function footer(ctx: Ctx, p: PromoPoster, aksen: string): void {
  tulis(ctx, p.disclaimer, MARGIN, FOOT_Y, {
    fs: 20,
    berat: 500,
    warna: rgba(REDUP, 0.9),
    maxW: 640,
    lineH: 26,
  });
  ctx.font = `700 18px ${FONT}`;
  ctx.fillStyle = rgba(aksen, 0.8);
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  ctx.fillText(TAGLINE, 1000, FOOT_Y + 2);
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
}
