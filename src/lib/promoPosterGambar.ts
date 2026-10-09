/**
 * promoPosterGambar — komposer poster kampanye PINDAI di atas Canvas 2D.
 *
 * Arah desain (revisi): **poster tipografi**, bukan poster ikon.
 *
 * Versi sebelumnya menaruh ilustrasi clip-art di tengah poster (dokumen, ponsel,
 * brankas, perisai, kantong, gelembung chat, centang) plus deret pil fitur.
 * Hasilnya ramai: banyak bentuk yang tidak menambah makna, dan pesan kampanye
 * justru tenggelam di antara ikon.
 *
 * Aturan yang berlaku sekarang:
 *  1. **Tagline adalah fokus utama.** Tiap poster membuka dengan TAGLINE
 *     kampanyenya sendiri (`poster.badge`, ditampilkan dalam huruf besar, warna
 *     aksen, dengan jarak antar-huruf) di bawah kop brand — itu elemen pertama
 *     yang dibaca setelah logo.
 *  2. **Tanpa ikon.** Tidak ada clip-art sama sekali. Seluruh konten digambar
 *     sebagai huruf, garis rambut (hairline), dan bidang tipis: daftar fitur,
 *     langkah bernomor, baris biaya, kisi pilar, dan daftar pertanyaan.
 *  3. **Hierarki tetap tunggal.** Tagline → headline → deskripsi → konten →
 *     CTA → kaki. Setiap poster punya satu pusat perhatian, bukan lima.
 *
 * Satu kerangka untuk sembilan poster, konten datang dari data `promoPosters`.
 * Output selalu 1080 × 1350 px (rasio 4:5) pada skala ctx 1:1.
 */
import { TAGLINE, type PromoPoster } from "./promoPosters";

export const UKURAN_POSTER = { lebar: 1080, tinggi: 1350 } as const;

const FONT = "ui-sans-serif, system-ui, sans-serif";

/** Palet tetap — sengaja tidak mengikuti tema situs supaya PNG selalu sama. */
const TEAL = "#0e3733";
const TEAL_TUA = "#0a2a27";
const IVORY = "#f1ede3";
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

/**
 * Tulis satu baris dengan jarak antar-huruf tambahan.
 *
 * `ctx.letterSpacing` tidak tersedia di semua peramban; bila tidak ada, teks
 * tetap ditulis tanpa jarak tambahan (bukan gagal) — karena itu pengukuran lebar
 * selalu menambah perkiraan jarak supaya pemenggalan baris tetap aman.
 */
function tulisBerspasi(
  ctx: Ctx,
  teks: string,
  x: number,
  y: number,
  fs: number,
  spasi: number,
  warna: string,
): number {
  const c = ctx as Ctx & { letterSpacing?: string };
  const didukung = "letterSpacing" in c;
  ctx.save();
  if (didukung) c.letterSpacing = `${spasi}px`;
  ctx.font = `800 ${fs}px ${FONT}`;
  ctx.fillStyle = warna;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(teks, x, y);
  ctx.restore();
  return fs * 1.06;
}

/** Perkiraan lebar satu baris berjarak huruf (dipakai untuk pemenggalan). */
function lebarBerspasi(ctx: Ctx, teks: string, fs: number, spasi: number): number {
  return lebarTeks(ctx, teks, fs, 800) + Math.max(0, Array.from(teks).length - 1) * spasi;
}

/**
 * Pilih ukuran tagline terbesar yang muat satu baris di lebar `maxW`.
 *
 * Tagline adalah fokus poster, jadi ia boleh lebih besar dari headline
 * (bahkan sampai 88 px untuk tagline pendek). Batas atas dipakai sebagai
 * perkiraan konservatif (0,62 em/huruf) supaya di peramban nyata pun tidak
 * melipat — perkiraan ini selalu ≥ lebar hasil ukur ctx tiruan.
 */
function ukuranTagline(ctx: Ctx, teks: string, maxW: number): { fs: number; spasi: number } {
  const n = Array.from(teks).length;
  for (let fs = 88; fs >= 40; fs -= 2) {
    const spasi = Math.round(fs * 0.14);
    const perkiraan =
      Math.max(lebarTeks(ctx, teks, fs, 800), n * fs * 0.62) + Math.max(0, n - 1) * spasi;
    if (perkiraan <= maxW) return { fs, spasi };
  }
  return { fs: 40, spasi: 5 };
}

/** Blok tagline berjarak huruf: dibungkus manual agar jaraknya ikut dihitung. */
function tulisTagline(
  ctx: Ctx,
  teks: string,
  x: number,
  y: number,
  fs: number,
  spasi: number,
  maxW: number,
  warna: string,
): number {
  const lineH = fs * 1.24;
  const baris: string[] = [];
  let kini = "";
  for (const k of teks.split(" ")) {
    const coba = kini ? `${kini} ${k}` : k;
    if (kini && lebarBerspasi(ctx, coba, fs, spasi) > maxW) {
      baris.push(kini);
      kini = k;
    } else {
      kini = coba;
    }
  }
  baris.push(kini);

  let cy = y;
  for (const b of baris) {
    tulisBerspasi(ctx, b, x, cy, fs, spasi, warna);
    cy += lineH;
  }
  return cy;
}

// ---------------------------------------------------------------------------
// Kerangka poster
// ---------------------------------------------------------------------------

const MARGIN = 80;
const LEBAR_KONTEN = 920;
const RULE_Y = 172;
const CTA_Y = 1128;
const FOOT_Y = 1264;

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
  ctx.translate(540, 760);
  ctx.rotate(-0.16);
  ctx.font = `800 330px ${FONT}`;
  ctx.fillStyle = rgba(IVORY, 0.045);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("PINDAI", 0, 0);
  ctx.restore();
}

/**
 * Latar + bingkai editorial. Sengaja hanya dua ornamen: satu busur tipis di
 * sudut atas dan satu di bawah, supaya bidangnya tidak terbaca rata tanpa
 * menambah bentuk yang bersaing dengan teks.
 */
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

/** Logo lockup: petak brankas + wordmark PINDAI + tagline brand. */
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
  const fsWord = Math.round(44 * s);
  const fsTag = Math.round(17 * s);
  const lebarBlok = Math.max(
    lebarTeks(ctx, "PINDAI", fsWord, 800),
    lebarTeks(ctx, TAGLINE, fsTag, 700),
  );
  const lebarLockup = ukuran + 18 * s + lebarBlok;
  const bx = tengah ? x - lebarLockup / 2 : x;
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

  const xWord = bx + ukuran + 18 * s;
  const yWord = y - 4 * s;
  ctx.font = `800 ${fsWord}px ${FONT}`;
  ctx.fillStyle = IVORY;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("PINDAI", xWord, yWord);

  ctx.font = `700 ${fsTag}px ${FONT}`;
  ctx.fillStyle = aksen;
  ctx.fillText(TAGLINE, xWord, yWord + fsWord + 8 * s);

  return Math.max(ukuran, fsWord + fsTag + 14 * s);
}

/** Garis rambut — satu-satunya pemisah yang dipakai poster ini. */
function garis(ctx: Ctx, x: number, y: number, w: number, warna: string, tebal = 2): void {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.strokeStyle = warna;
  ctx.lineWidth = tebal;
  ctx.stroke();
}

/** Panel hairline tipis sebagai wadah daftar konten (satu bentuk, bukan ikon). */
function panel(ctx: Ctx, y: number, h: number, aksen: string): void {
  bulat(ctx, MARGIN, y, LEBAR_KONTEN, h, 26);
  ctx.fillStyle = rgba(IVORY, 0.05);
  ctx.fill();
  ctx.strokeStyle = rgba(aksen, 0.3);
  ctx.lineWidth = 2;
  ctx.stroke();
}

/** Tombol CTA pill. */
function tombol(
  ctx: Ctx,
  teks: string,
  x: number,
  y: number,
  aksen: string,
  tengah: boolean,
  fs = 34,
): number {
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

/** Pill outline (CTA sekunder poster hero). */
function tombolOutline(
  ctx: Ctx,
  teks: string,
  x: number,
  y: number,
  tengah: boolean,
  fs = 24,
): number {
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
// Zona konten per bentuk — semuanya tipografi, tanpa ikon
// ---------------------------------------------------------------------------

/** Tinggi baris yang pas untuk `n` baris di dalam rentang [atas, bawah]. */
function tinggiBaris(n: number, atas: number, bawah: number, maks: number): number {
  if (n <= 0) return 0;
  return Math.max(52, Math.min(maks, (bawah - atas) / n));
}

/**
 * Titik mulai blok konten di dalam zona [atas, bawah].
 *
 * Bila blok lebih pendek dari zonanya, sisa ruang dibagi 40% di atas blok —
 * konten tidak menempel ke deskripsi dan tidak menyisakan lubang besar di atas
 * CTA. Bila blok lebih tinggi dari zona, mulai dari `atas` (tanpa geser).
 */
function sebar(atas: number, bawah: number, tinggiBlok: number): number {
  return atas + Math.max(0, (bawah - atas - tinggiBlok) * 0.4);
}

/**
 * Daftar fitur (bentuk "teks"): satu panel hairline berisi baris-baris fitur
 * dengan penanda kotak aksen kecil — penanda geometris, bukan ikon.
 */
function daftarFitur(
  ctx: Ctx,
  daftar: readonly string[],
  aksen: string,
  atas: number,
  bawah: number,
): void {
  const n = daftar.length;
  if (n === 0) return;
  const h = tinggiBaris(n, atas, bawah, 92);
  const tinggiPanel = h * n;
  const y0 = sebar(atas, bawah, tinggiPanel);

  panel(ctx, y0, tinggiPanel, aksen);
  for (let i = 0; i < n; i += 1) {
    const y = y0 + i * h;
    if (i > 0) garis(ctx, MARGIN + 34, y, LEBAR_KONTEN - 68, rgba(IVORY, 0.12));

    // Penanda kotak aksen.
    ctx.fillStyle = aksen;
    ctx.fillRect(MARGIN + 38, y + h / 2 - 7, 14, 14);

    tulis(ctx, daftar[i], MARGIN + 78, y + h / 2 - 20, {
      fs: 32,
      berat: 700,
      maxW: LEBAR_KONTEN - 130,
    });
  }
}

/** Langkah bernomor (bentuk "langkah") — angka sebagai huruf, tanpa lingkaran. */
function daftarLangkah(
  ctx: Ctx,
  items: { teks: string }[],
  aksen: string,
  atas: number,
  bawah: number,
): void {
  const n = items.length;
  if (n === 0) return;
  const h = tinggiBaris(n, atas, bawah, 96);
  const y0 = sebar(atas, bawah, h * n);

  panel(ctx, y0, h * n, aksen);
  for (let i = 0; i < n; i += 1) {
    const y = y0 + i * h;
    if (i > 0) garis(ctx, MARGIN + 34, y, LEBAR_KONTEN - 68, rgba(IVORY, 0.12));

    ctx.font = `800 32px ${FONT}`;
    ctx.fillStyle = aksen;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(String(i + 1), MARGIN + 44, y + h / 2 - 20);

    tulis(ctx, items[i].teks, MARGIN + 116, y + h / 2 - 21, {
      fs: 34,
      berat: 700,
      maxW: LEBAR_KONTEN - 168,
    });
  }
}

/**
 * Komponen biaya (bentuk "baris"): label aksen kiri, nilai kanan, operator
 * (+ / =) sebagai huruf aksen di antara baris. Tanpa kartu per baris.
 */
function daftarBaris(
  ctx: Ctx,
  items: { judul?: string; teks: string }[],
  pemisah: string[] | undefined,
  aksen: string,
  atas: number,
  bawah: number,
): void {
  const n = items.length;
  if (n === 0) return;
  const gapOperator = 46;
  const h = tinggiBaris(n, atas, bawah - (n - 1) * gapOperator, 118);
  const tinggiPanel = h * n + (n - 1) * gapOperator;
  const y0 = sebar(atas, bawah, tinggiPanel);

  panel(ctx, y0, tinggiPanel, aksen);
  let y = y0;
  for (let i = 0; i < n; i += 1) {
    const total = i === n - 1;
    tulis(ctx, (items[i].judul ?? "").toUpperCase(), MARGIN + 40, y + h / 2 - 26, {
      fs: total ? 30 : 26,
      berat: 800,
      warna: aksen,
      maxW: 420,
    });

    ctx.font = `800 ${total ? 46 : 42}px ${FONT}`;
    ctx.fillStyle = total ? aksen : IVORY;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(items[i].teks, MARGIN + LEBAR_KONTEN - 40, y + h / 2);
    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    // Garis tegas di atas baris total: penutup perhitungan.
    if (total) garis(ctx, MARGIN + 40, y, LEBAR_KONTEN - 80, rgba(aksen, 0.45), 3);

    y += h;
    if (i < n - 1) {
      const operator = pemisah?.[i];
      if (operator) {
        ctx.font = `800 34px ${FONT}`;
        ctx.fillStyle = rgba(aksen, 0.9);
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(operator, MARGIN + 40, y + 10);
      }
      y += gapOperator;
    }
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
  }
}

/** Kisi 2×2 pilar (bentuk "kartu") — label teks dengan garis aksen, tanpa ikon. */
function kisiKartu(
  ctx: Ctx,
  items: { teks: string }[],
  aksen: string,
  atas: number,
  bawah: number,
): void {
  const n = Math.min(items.length, 4);
  if (n === 0) return;
  const gap = 20;
  const lebarKartu = (LEBAR_KONTEN - gap) / 2;
  const barisKe = Math.ceil(n / 2);
  const hKartu = Math.min(150, (bawah - atas - gap * (barisKe - 1)) / barisKe);
  const tinggiTotal = hKartu * barisKe + gap * (barisKe - 1);
  const y0 = sebar(atas, bawah, tinggiTotal);

  for (let i = 0; i < n; i += 1) {
    const kolom = i % 2;
    const baris = Math.floor(i / 2);
    const x = MARGIN + kolom * (lebarKartu + gap);
    const y = y0 + baris * (hKartu + gap);

    bulat(ctx, x, y, lebarKartu, hKartu, 22);
    ctx.fillStyle = rgba(IVORY, 0.05);
    ctx.fill();
    ctx.strokeStyle = rgba(aksen, 0.28);
    ctx.lineWidth = 2;
    ctx.stroke();

    // Garis aksen kecil di tepi atas kartu: penanda, bukan ikon.
    garis(ctx, x + 28, y + 30, 54, rgba(aksen, 0.9), 5);

    ctx.font = `800 30px ${FONT}`;
    ctx.fillStyle = IVORY;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    const barisTeks = bungkus(ctx, items[i].teks, lebarKartu - 56);
    let ty = y + hKartu / 2 - (barisTeks.length * 38) / 2 + 10;
    for (const b of barisTeks) {
      ctx.fillText(b, x + 28, ty);
      ty += 38;
    }
  }
}

/** Daftar pertanyaan (bentuk "pertanyaan") — tanda pisah aksen, tanpa gelembung. */
function daftarPertanyaan(
  ctx: Ctx,
  items: { teks: string }[],
  aksen: string,
  atas: number,
  bawah: number,
): void {
  const n = items.length;
  if (n === 0) return;
  const h = tinggiBaris(n, atas, bawah, 96);
  const y0 = sebar(atas, bawah, h * n);

  panel(ctx, y0, h * n, aksen);
  for (let i = 0; i < n; i += 1) {
    const y = y0 + i * h;
    if (i > 0) garis(ctx, MARGIN + 34, y, LEBAR_KONTEN - 68, rgba(IVORY, 0.12));

    garis(ctx, MARGIN + 40, y + h / 2, 34, rgba(aksen, 0.9), 4);
    tulis(ctx, items[i].teks, MARGIN + 100, y + h / 2 - 20, {
      fs: 32,
      berat: 600,
      maxW: LEBAR_KONTEN - 160,
    });
  }
}

/** Baris tautan kebijakan sebagai teks berjarak, bukan pil. */
function barisTautan(ctx: Ctx, tautan: readonly string[], aksen: string, y: number): void {
  let x = MARGIN;
  for (const [i, t] of tautan.entries()) {
    ctx.font = `700 24px ${FONT}`;
    ctx.fillStyle = rgba(IVORY, 0.75);
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(t, x, y);
    x += lebarTeks(ctx, t, 24, 700) + 18;
    if (i < tautan.length - 1) {
      ctx.fillStyle = rgba(aksen, 0.9);
      ctx.fillText("·", x, y);
      x += lebarTeks(ctx, "·", 24, 700) + 18;
    }
  }
}

/** Komposisi hero poster CTA (bentuk "hero") — tagline di tengah, tanpa ikon. */
function hero(ctx: Ctx, p: PromoPoster, aksen: string): void {
  ctx.save();
  ctx.fillStyle = TEAL;
  ctx.fillRect(0, 0, UKURAN_POSTER.lebar, UKURAN_POSTER.tinggi);
  ctx.fillStyle = TEAL_TUA;
  ctx.fillRect(0, 1080, UKURAN_POSTER.lebar, 270);
  bulat(ctx, 34, 34, 1012, 1282, 44);
  ctx.strokeStyle = rgba(IVORY, 0.12);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
  watermark(ctx);
  grain(ctx);

  logo(ctx, 540, 96, 1.2, aksen, true);

  // Tagline: fokus poster, di atas headline.
  const tagline = p.badge.toUpperCase();
  const ukuran = ukuranTagline(ctx, tagline, 900);
  const lebarTag = lebarBerspasi(ctx, tagline, ukuran.fs, ukuran.spasi);
  const tinggiTag = tulisTagline(
    ctx,
    tagline,
    540 - lebarTag / 2,
    262,
    ukuran.fs,
    ukuran.spasi,
    900,
    aksen,
  );
  const yRule = Math.max(tinggiTag + 16, 380);

  garis(ctx, 540 - 90, yRule, 180, rgba(aksen, 0.7), 4);

  const yHeadline = tulis(ctx, p.headline, 540, yRule + 52, {
    fs: 92,
    berat: 800,
    align: "center",
    maxW: 960,
    lineH: 100,
  });

  const yDesk = p.description
    ? tulis(ctx, p.description, 540, yHeadline + 24, {
        fs: 32,
        berat: 500,
        warna: REDUP,
        align: "center",
        maxW: 880,
        lineH: 46,
      })
    : yHeadline;

  // Tiga layanan sebagai kata berjarak huruf dengan pemisah titik aksen.
  const layanan = p.layanan ?? [];
  const fsL = 27;
  const spasiL = 5;
  const bagian = layanan.map((l) => lebarBerspasi(ctx, l, fsL, spasiL));
  const lebarPemisah = 34;
  const totalL =
    bagian.reduce((t, w) => t + w, 0) + lebarPemisah * Math.max(0, layanan.length - 1);
  let lx = 540 - totalL / 2;
  const yLayanan = Math.max(yDesk + 58, 726);
  for (const [i, l] of layanan.entries()) {
    tulisBerspasi(ctx, l, lx, yLayanan, fsL, spasiL, IVORY);
    lx += bagian[i];
    if (i < layanan.length - 1) {
      ctx.font = `800 ${fsL}px ${FONT}`;
      ctx.fillStyle = rgba(aksen, 0.9);
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText("·", lx + lebarPemisah / 2 - 6, yLayanan);
      lx += lebarPemisah;
    }
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  tombol(ctx, p.cta, 540, 1046, aksen, true, 38);
  if (p.subCta) tombolOutline(ctx, p.subCta, 540, 1160, true, 24);
}

// ---------------------------------------------------------------------------
// Komposer utama
// ---------------------------------------------------------------------------

/**
 * Gambar poster ke ctx. ctx HARUS berukuran 1080×1350 (atau kelipatan — bila
 * kanvas pratinjau lebih kecil, pemanggil mengatur scale sebelum memanggil).
 * `gambar` opsional: gambar kustom dari data `image`, bila admin menggantinya —
 * hanya dipakai pada bentuk "teks", dan tetap dibingkai tipis tanpa ikon.
 */
export function gambarPoster(ctx: Ctx, p: PromoPoster, gambar?: HTMLImageElement): void {
  const aksen = AKSEN[p.aksen];

  if (p.bentuk === "hero") {
    hero(ctx, p, aksen);
    footer(ctx, p, aksen);
    return;
  }

  latar(ctx, aksen);

  // Kop: logo + nomor kampanye + kategori.
  logo(ctx, MARGIN, 64, 1, aksen);
  ctx.font = `700 22px ${FONT}`;
  ctx.fillStyle = rgba(IVORY, 0.55);
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  ctx.fillText(`${p.nomor} / 09`, 1000, 76);
  ctx.font = `700 22px ${FONT}`;
  ctx.fillStyle = rgba(aksen, 0.8);
  ctx.fillText(p.category.toUpperCase(), 1000, 106);
  ctx.textAlign = "left";
  garis(ctx, MARGIN, RULE_Y, LEBAR_KONTEN, rgba(IVORY, 0.16));

  // Tagline: fokus utama poster, tepat di bawah kop.
  garis(ctx, MARGIN, 214, 132, rgba(aksen, 0.95), 5);
  const tagline = p.badge.toUpperCase();
  const ukuran = ukuranTagline(ctx, tagline, 950);
  const y = tulisTagline(ctx, tagline, MARGIN, 244, ukuran.fs, ukuran.spasi, 950, aksen);
  garis(ctx, MARGIN, y + 22, LEBAR_KONTEN, rgba(aksen, 0.32), 3);

  // Headline + deskripsi.
  const yHeadline = tulis(ctx, p.headline, MARGIN, y + 62, {
    fs: 74,
    berat: 800,
    maxW: LEBAR_KONTEN,
    lineH: 82,
  });
  const yDesk = p.description
    ? tulis(ctx, p.description, MARGIN, yHeadline + 24, {
        fs: 30,
        berat: 500,
        warna: REDUP,
        maxW: LEBAR_KONTEN - 30,
        lineH: 44,
      })
    : yHeadline;

  // Catatan/tautan kecil diberi ruangnya sendiri di atas CTA.
  const yCatatan = CTA_Y - 108;
  const adaCatatan = Boolean(p.catatan) || Boolean(p.tautan && p.tautan.length > 0);
  const atas = yDesk + 48;
  const bawah = (adaCatatan ? CTA_Y - 140 : CTA_Y) - 56;

  switch (p.bentuk) {
    case "teks": {
      if (gambar) {
        const hGambar = bawah - atas;
        ctx.save();
        bulat(ctx, MARGIN, atas, LEBAR_KONTEN, hGambar, 26);
        ctx.clip();
        const rasio = Math.max(LEBAR_KONTEN / gambar.width, hGambar / gambar.height);
        const dw = gambar.width * rasio;
        const dh = gambar.height * rasio;
        ctx.drawImage(gambar, MARGIN + (LEBAR_KONTEN - dw) / 2, atas + (hGambar - dh) / 2, dw, dh);
        ctx.restore();
        bulat(ctx, MARGIN, atas, LEBAR_KONTEN, hGambar, 26);
        ctx.strokeStyle = rgba(aksen, 0.3);
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        daftarFitur(ctx, p.features, aksen, atas, bawah);
      }
      break;
    }
    case "langkah":
      daftarLangkah(ctx, p.items ?? [], aksen, atas, bawah);
      break;
    case "baris":
      daftarBaris(ctx, p.items ?? [], p.pemisah, aksen, atas, bawah);
      if (p.catatan) {
        tulis(ctx, p.catatan, MARGIN, yCatatan, {
          fs: 26,
          berat: 700,
          warna: aksen,
          maxW: LEBAR_KONTEN,
        });
      }
      break;
    case "kartu":
      kisiKartu(ctx, p.items ?? p.features.map((t) => ({ teks: t })), aksen, atas, bawah);
      if (p.tautan && p.tautan.length > 0) barisTautan(ctx, p.tautan, aksen, yCatatan);
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

/** Baris kaki: disclaimer kiri + kategori kanan (tagline sudah jadi fokus atas). */
function footer(ctx: Ctx, p: PromoPoster, aksen: string): void {
  garis(ctx, MARGIN, FOOT_Y - 30, LEBAR_KONTEN, rgba(IVORY, 0.14));
  tulis(ctx, p.disclaimer, MARGIN, FOOT_Y, {
    fs: 20,
    berat: 500,
    warna: rgba(REDUP, 0.9),
    maxW: 660,
    lineH: 26,
  });
  ctx.font = `700 18px ${FONT}`;
  ctx.fillStyle = rgba(aksen, 0.85);
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  ctx.fillText(TAGLINE, 1000, FOOT_Y + 2);
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
}
