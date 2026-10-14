/** Painter Canvas untuk materi kampanye PINDAI pada tiga rasio sosial. */
import { TAGLINE, type PromoPoster } from "./promoPosters";

export const UKURAN_POSTER = {
  persegi: { lebar: 1080, tinggi: 1080, label: "1080 × 1080" },
  potret: { lebar: 1080, tinggi: 1350, label: "1080 × 1350" },
  cerita: { lebar: 1080, tinggi: 1920, label: "1080 × 1920" },
} as const;
export type RasioPoster = keyof typeof UKURAN_POSTER;
export type UkuranPoster = (typeof UKURAN_POSTER)[RasioPoster];

const TINTA = "#17212b";
const SEKUNDER = "#475569";
const LATAR = "#f8fafc";
const AKSEN = "#047857";
const FONT = "system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
type Ctx = CanvasRenderingContext2D;

function bungkus(ctx: Ctx, teks: string, max: number): string[] {
  const hasil: string[] = [];
  for (const paragraf of teks.split("\n")) {
    let baris = "";
    for (const kata of paragraf.split(/\s+/).filter(Boolean)) {
      const calon = baris ? `${baris} ${kata}` : kata;
      if (baris && ctx.measureText(calon).width > max) {
        hasil.push(baris);
        baris = kata;
      } else baris = calon;
    }
    if (baris) hasil.push(baris);
  }
  return hasil;
}

function teks(
  ctx: Ctx,
  value: string,
  x: number,
  y: number,
  max: number,
  size: number,
  color: string,
  weight = 500,
  lineHeight = size * 1.3,
): number {
  if (!value) return y;
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  let cursor = y;
  for (const line of bungkus(ctx, value, max)) {
    ctx.fillText(line, x, cursor);
    cursor += lineHeight;
  }
  return cursor;
}

function garis(
  ctx: Ctx,
  x: number,
  y: number,
  width: number,
  color: string,
): void {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + width, y);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function logo(ctx: Ctx, x: number, y: number, scale: number): number {
  const size = 52 * scale;
  ctx.strokeStyle = AKSEN;
  ctx.lineWidth = Math.max(2, 3 * scale);
  ctx.beginPath();
  ctx.roundRect(x, y, size, size, 12 * scale);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size * 0.23, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size * 0.06, 0, Math.PI * 2);
  ctx.fillStyle = AKSEN;
  ctx.fill();
  ctx.font = `750 ${Math.round(34 * scale)}px ${FONT}`;
  ctx.fillStyle = TINTA;
  ctx.textBaseline = "middle";
  ctx.fillText("PINDAI", x + size + 16 * scale, y + size / 2);
  return size;
}

function ukurHeadline(
  ctx: Ctx,
  text: string,
  maxWidth: number,
  maxHeight: number,
  starting = 82,
): { size: number; lines: string[]; lineHeight: number } {
  for (let size = starting; size >= 44; size -= 2) {
    ctx.font = `750 ${size}px ${FONT}`;
    const lines = bungkus(ctx, text, maxWidth);
    const lineHeight = size * 1.08;
    if (lines.length * lineHeight <= maxHeight)
      return { size, lines, lineHeight };
  }
  ctx.font = `750 44px ${FONT}`;
  return { size: 44, lines: bungkus(ctx, text, maxWidth), lineHeight: 48 };
}

function footer(
  ctx: Ctx,
  poster: PromoPoster,
  y: number,
  maxWidth: number,
  scale: number,
): void {
  garis(ctx, 76, y, 928, "#cbd5e1");
  let cursor = y + 22 * scale;
  const legal = poster.legalitas?.trim();
  if (legal)
    cursor =
      teks(
        ctx,
        legal,
        76,
        cursor,
        maxWidth,
        20 * scale,
        SEKUNDER,
        600,
        26 * scale,
      ) +
      8 * scale;
  teks(
    ctx,
    poster.disclaimer,
    76,
    cursor,
    maxWidth,
    18 * scale,
    SEKUNDER,
    450,
    25 * scale,
  );
}

/** Gambar satu poster pada ukuran yang dipilih, mempertahankan bidang kosong dan keterbacaan. */
export function gambarPoster(
  ctx: Ctx,
  poster: PromoPoster,
  ukuran: UkuranPoster = UKURAN_POSTER.potret,
): void {
  const { lebar, tinggi } = ukuran;
  const scale = lebar / 1080;
  const story = tinggi === 1920;
  const square = tinggi === 1080;
  const top = story ? 270 : 72;
  const bottom = story ? tinggi - 270 : tinggi - 64;
  const safeHeight = bottom - top;
  const margin = 76 * scale;
  const maxWidth = lebar - margin * 2;

  ctx.fillStyle = LATAR;
  ctx.fillRect(0, 0, lebar, tinggi);
  const logoHeight = logo(ctx, margin, top, scale);
  ctx.font = `650 ${Math.round(19 * scale)}px ${FONT}`;
  ctx.fillStyle = SEKUNDER;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText(
    poster.category.toUpperCase(),
    lebar - margin,
    top + logoHeight / 2,
  );
  ctx.textAlign = "left";

  const pad = (story ? 94 : square ? 42 : 66) * scale;
  let cursor = top + logoHeight + pad;
  teks(
    ctx,
    poster.badge,
    margin,
    cursor,
    maxWidth,
    (story ? 23 : 20) * scale,
    AKSEN,
    700,
    30 * scale,
  );
  cursor += (story ? 50 : 42) * scale;

  const usableContentHeight =
    safeHeight - (cursor - top) - (story ? 500 : square ? 390 : 440) * scale;
  const titleBox = Math.max(
    145 * scale,
    Math.min(340 * scale, usableContentHeight * 0.36),
  );
  const headline = ukurHeadline(
    ctx,
    poster.headline,
    maxWidth,
    titleBox,
    (story ? 96 : 82) * scale,
  );
  for (const line of headline.lines) {
    teks(
      ctx,
      line,
      margin,
      cursor,
      maxWidth,
      headline.size,
      TINTA,
      750,
      headline.lineHeight,
    );
    cursor += headline.lineHeight;
  }
  cursor += (story ? 40 : 26) * scale;

  const descSize = (story ? 34 : 30) * scale;
  const descLine = descSize * 1.42;
  const descEnd = teks(
    ctx,
    poster.description,
    margin,
    cursor,
    maxWidth,
    descSize,
    SEKUNDER,
    450,
    descLine,
  );
  cursor = descEnd + (story ? 54 : 34) * scale;

  const ctaY = bottom - (story ? 390 : square ? 280 : 320) * scale;
  const itemArea = Math.max(70 * scale, ctaY - cursor - 26 * scale);
  const items: NonNullable<PromoPoster["items"]> =
    poster.items ?? poster.features.map((text) => ({ teks: text }));
  if (items.length) {
    const rowHeight = Math.min(
      (story ? 92 : square ? 70 : 78) * scale,
      itemArea / items.length,
    );
    ctx.font = `600 ${Math.round(28 * scale)}px ${FONT}`;
    for (const [index, item] of items.entries()) {
      const rowY = cursor + index * rowHeight;
      if (rowY + rowHeight > ctaY) break;
      if (index > 0) garis(ctx, margin, rowY, maxWidth, "#e2e8f0");
      teks(
        ctx,
        item.judul ? `${item.judul}: ${item.teks}` : item.teks,
        margin,
        rowY + 14 * scale,
        maxWidth,
        27 * scale,
        TINTA,
        550,
        36 * scale,
      );
    }
  }

  const noteY = ctaY - 72 * scale;
  if (poster.catatan)
    teks(
      ctx,
      poster.catatan,
      margin,
      noteY,
      maxWidth,
      19 * scale,
      SEKUNDER,
      500,
      25 * scale,
    );
  garis(ctx, margin, ctaY, maxWidth, AKSEN);
  teks(
    ctx,
    poster.cta,
    margin,
    ctaY + 22 * scale,
    maxWidth,
    27 * scale,
    AKSEN,
    700,
    36 * scale,
  );
  if (poster.caption)
    teks(
      ctx,
      poster.caption,
      margin,
      ctaY + 68 * scale,
      maxWidth,
      17 * scale,
      SEKUNDER,
      450,
      24 * scale,
    );

  const footerY = bottom - (story ? 145 : 112) * scale;
  footer(ctx, poster, footerY, maxWidth, scale);
  ctx.font = `600 ${Math.round(14 * scale)}px ${FONT}`;
  ctx.fillStyle = SEKUNDER;
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.fillText(TAGLINE, lebar - margin, bottom - 6 * scale);
  ctx.textAlign = "left";
}
