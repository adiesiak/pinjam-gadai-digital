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

/** Tinggi teks (dalam px) tanpa menggambarnya — untuk menata blok. */
function tinggiTeks(
  ctx: Ctx,
  value: string,
  maxWidth: number,
  size: number,
  weight: number,
  lineHeight: number,
): number {
  if (!value) return 0;
  ctx.font = `${weight} ${size}px ${FONT}`;
  return bungkus(ctx, value, maxWidth).length * lineHeight;
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

/** Tinggi blok kaki poster: garis, legalitas (bila ada), dan disclaimer. */
function tinggiFooter(
  ctx: Ctx,
  poster: PromoPoster,
  maxWidth: number,
  scale: number,
): number {
  let tinggi = 22 * scale;
  const legal = poster.legalitas?.trim();
  if (legal) {
    tinggi += tinggiTeks(ctx, legal, maxWidth, 20 * scale, 600, 26 * scale) + 8 * scale;
  }
  return tinggi + tinggiTeks(ctx, poster.disclaimer, maxWidth, 18 * scale, 450, 25 * scale);
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

/**
 * Gambar satu poster pada ukuran yang dipilih.
 *
 * Tata letaknya diukur dulu, baru dirapatkan: tinggi tiap blok (kop, tagline,
 * judul, deskripsi, daftar, CTA, kaki) dihitung dengan lebar font kanvas.
 * Baris daftar menyerap sisa ruang sampai batasnya, dan sisa yang masih ada
 * dibagi rata ke celah antar blok. Karena itu poster memenuhi kanvas, bukan
 * menyisakan satu lubang besar di tengah seperti saat CTA dan kaki dipatok
 * dengan angka tetap.
 */
export function gambarPoster(
  ctx: Ctx,
  poster: PromoPoster,
  ukuran: UkuranPoster = UKURAN_POSTER.potret,
): void {
  const { lebar, tinggi } = ukuran;
  const scale = lebar / 1080;
  const story = tinggi === 1920;
  const square = tinggi === 1080;

  ctx.fillStyle = LATAR;
  ctx.fillRect(0, 0, lebar, tinggi);

  const margin = 76 * scale;
  const maxWidth = lebar - margin * 2;

  // Bidang kerja dipangkas dari pita kosong lama (cerita dulu menyisakan 270 px
  // di atas dan bawah). Cerita tetap menyediakan ruang untuk UI Instagram.
  const top = (story ? 150 : square ? 58 : 66) * scale;
  const tepiTagline = tinggi - (story ? 132 : square ? 56 : 64) * scale;

  const tinggiHeader = 52 * scale;
  const tinggiBadge = 30 * scale;

  const batasJudul = (story ? 680 : square ? 420 : 500) * scale;
  const judul = ukurHeadline(
    ctx,
    poster.headline,
    maxWidth,
    batasJudul,
    (story ? 168 : square ? 138 : 148) * scale,
  );
  const tinggiJudul = judul.lines.length * judul.lineHeight;

  const descSize = (story ? 36 : 32) * scale;
  const descBaris = descSize * 1.42;
  const tinggiDesc = tinggiTeks(ctx, poster.description, maxWidth, descSize, 450, descBaris);

  const ctaSize = 27 * scale;
  const ctaBaris = 36 * scale;
  const captionSize = 17 * scale;
  const captionBaris = 24 * scale;
  const catatanSize = 19 * scale;
  const catatanBaris = 25 * scale;

  const tinggiCatatan = poster.catatan
    ? tinggiTeks(ctx, poster.catatan, maxWidth, catatanSize, 500, catatanBaris) + 18 * scale
    : 0;
  const tinggiCtaBlok =
    tinggiCatatan +
    2 * scale +
    22 * scale +
    tinggiTeks(ctx, poster.cta, maxWidth, ctaSize, 700, ctaBaris) +
    (poster.caption
      ? 32 * scale + tinggiTeks(ctx, poster.caption, maxWidth, captionSize, 450, captionBaris)
      : 0);

  const tinggiKaki = tinggiFooter(ctx, poster, maxWidth, scale);
  const tinggiTagline = 20 * scale;

  const gapDasar = (story ? 34 : square ? 26 : 30) * scale;
  const jumlahGap = 6;

  const items: NonNullable<PromoPoster["items"]> =
    poster.items ??
    (poster.features.length
      ? poster.features.map((text) => ({ teks: text }))
      : (poster.layanan ?? []).map((text) => ({ teks: text })));

  const itemSize = 31 * scale;
  const itemBaris = 40 * scale;
  const itemPad = 18 * scale;
  const barisMaks = (story ? 210 : square ? 150 : 170) * scale;

  const tinggiBaris = items.map(
    (item) =>
      tinggiTeks(
        ctx,
        item.judul ? `${item.judul}: ${item.teks}` : item.teks,
        maxWidth,
        itemSize,
        550,
        itemBaris,
      ) +
      itemPad * 2,
  );
  const alamiItem = tinggiBaris.reduce((total, h) => total + h, 0);

  const ruang = tepiTagline - tinggiTagline * 1.8 - top;
  const tetap =
    tinggiHeader +
    tinggiBadge +
    tinggiJudul +
    tinggiDesc +
    tinggiCtaBlok +
    tinggiKaki +
    gapDasar * jumlahGap;

  let areaItem = alamiItem;
  let tambahanGap = 0;
  if (items.length > 0) {
    const naik = Math.min(
      Math.max(0, ruang - tetap - alamiItem),
      items.length * barisMaks - alamiItem,
    );
    areaItem += Math.max(0, naik);
    tambahanGap = Math.max(0, (ruang - tetap - areaItem) / jumlahGap);
  } else {
    tambahanGap = Math.max(0, (ruang - tetap) / jumlahGap);
  }
  const gap = gapDasar + tambahanGap;
  const tinggiBarisAkhir = items.length > 0 ? areaItem / items.length : 0;

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

  let cursor = top + tinggiHeader + gap;

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
  cursor += tinggiBadge + gap;

  for (const line of judul.lines) {
    teks(ctx, line, margin, cursor, maxWidth, judul.size, TINTA, 750, judul.lineHeight);
    cursor += judul.lineHeight;
  }
  cursor += gap;

  teks(ctx, poster.description, margin, cursor, maxWidth, descSize, SEKUNDER, 450, descBaris);
  cursor += tinggiDesc + gap;

  for (const [index, item] of items.entries()) {
    const teksItem = item.judul ? `${item.judul}: ${item.teks}` : item.teks;
    const tinggiIsi = tinggiTeks(ctx, teksItem, maxWidth, itemSize, 550, itemBaris);
    const rowY = cursor + index * tinggiBarisAkhir;
    if (index > 0) garis(ctx, margin, rowY, maxWidth, "#e2e8f0");
    teks(
      ctx,
      teksItem,
      margin,
      rowY + Math.max(itemPad, (tinggiBarisAkhir - tinggiIsi) / 2),
      maxWidth,
      itemSize,
      TINTA,
      550,
      itemBaris,
    );
  }
  cursor += areaItem + gap;

  if (poster.catatan) {
    teks(ctx, poster.catatan, margin, cursor, maxWidth, catatanSize, SEKUNDER, 500, catatanBaris);
  }
  const ruleY = cursor + tinggiCatatan;
  garis(ctx, margin, ruleY, maxWidth, AKSEN);
  let cursorCta = ruleY + 2 * scale + 22 * scale;
  cursorCta = teks(ctx, poster.cta, margin, cursorCta, maxWidth, ctaSize, AKSEN, 700, ctaBaris);
  if (poster.caption) {
    teks(
      ctx,
      poster.caption,
      margin,
      cursorCta + 32 * scale,
      maxWidth,
      captionSize,
      SEKUNDER,
      450,
      captionBaris,
    );
  }
  cursor += tinggiCtaBlok + gap;

  footer(ctx, poster, cursor, maxWidth, scale);

  ctx.font = `600 ${Math.round(14 * scale)}px ${FONT}`;
  ctx.fillStyle = SEKUNDER;
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.fillText(TAGLINE, lebar - margin, tepiTagline);
  ctx.textAlign = "left";
}
