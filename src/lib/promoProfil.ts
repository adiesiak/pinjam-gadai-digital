/**
 * Aset profil WhatsApp PINDAI — foto profil (1:1) dan background/sampul profil
 * (16:9). Digambar langsung ke Canvas 2D tanpa dependensi React, sehingga
 * halaman /promo cukup memanggil `gambarAsetProfil` untuk menggambar dan
 * mengunduh PNG-nya, sementara tata letaknya tetap bisa diuji sebagai fungsi
 * murni (lihat `promoProfil.test.ts`).
 *
 * Ukuran mengikuti kebiasaan WhatsApp:
 *  - Foto profil: kanvas 1080×1080, ditampilkan **terpotong bulat** → semua
 *    konten dijaga di dalam lingkaran aman `RADIUS_AMAN_BULAT`.
 *  - Sampul profil (WhatsApp Business): rasio 16:9 (WhatsApp menyarankan
 *    1211×681 atau lebih besar). Foto profil dapat menutupi bagian bawah
 *    sampul, jadi konten utama diletakkan di tengah-atas dan bagian bawah
 *    hanya berisi ornamen.
 */

const SANS = "ui-sans-serif, system-ui, sans-serif";

/** Palet brand PINDAI — sama dengan poster di halaman /promo. */
export const NAVY = "#0f3d3a";
export const NAVY_DEEP = "#0a2624";
export const GOLD = "#e0b64d";
export const BRASS = "#b99b62";
export const KREM = "#fbf8f1";
export const KREM_REDUP = "#d8c28c";

type Ctx = CanvasRenderingContext2D;

export type AsetProfilId = "foto-profil" | "background-profil";

export type AsetProfil = {
  id: AsetProfilId;
  label: string;
  /** Penjelasan singkat untuk kartu di halaman /promo. */
  keterangan: string;
  /** [lebar, tinggi] kanvas dalam piksel. */
  canvas: [number, number];
  ratioLabel: string;
  /** Nama berkas hasil unduhan. */
  berkas: string;
};

export const ASET_PROFIL: readonly AsetProfil[] = [
  {
    id: "foto-profil",
    label: "Foto Profil WhatsApp",
    keterangan:
      "Brankas PINDAI di tengah bidang 1:1. Seluruh isi berada di dalam lingkaran aman, jadi tetap utuh saat WhatsApp memotongnya jadi bulat.",
    canvas: [1080, 1080],
    ratioLabel: "1:1 · dipotong bulat",
    berkas: "pindai-foto-profil-whatsapp.png",
  },
  {
    id: "background-profil",
    label: "Background Profil WhatsApp",
    keterangan:
      "Sampul 16:9 untuk profil WhatsApp Business. Konten ditaruh di tengah-atas karena foto profil dapat menutupi bagian bawah sampul.",
    canvas: [1600, 900],
    ratioLabel: "16:9",
    berkas: "pindai-background-profil-whatsapp.png",
  },
];

// ---------------------------------------------------------------------------
// Primitif gambar.
// ---------------------------------------------------------------------------

/** Ubah warna hex menjadi rgba() dengan alpha tertentu. */
export function rgba(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const n = Number.parseInt(h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}

function bulat(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/** Bintik halus sebagai tekstur latar (pengganti pola gambar). */
function titikHalus(ctx: Ctx, w: number, h: number, warna: string, gap: number, radius: number) {
  ctx.fillStyle = warna;
  for (let x = gap / 2; x < w; x += gap) {
    for (let y = gap / 2; y < h; y += gap) {
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Lebar teks bila jarak antar-huruf ditambah manual. */
function lebarBerspasi(ctx: Ctx, teks: string, spasi: number): number {
  const chars = Array.from(teks);
  let total = 0;
  for (const c of chars) total += ctx.measureText(c).width;
  return total + spasi * Math.max(0, chars.length - 1);
}

/**
 * Tulis teks dengan jarak antar-huruf manual, dipusatkan di `cx`.
 * `ctx.letterSpacing` belum merata di semua peramban, jadi jaraknya dihitung
 * per huruf. Wajib dipanggil dengan `textBaseline = "alphabetic"`.
 */
function teksBerspasi(ctx: Ctx, teks: string, cx: number, y: number, spasi: number) {
  const chars = Array.from(teks);
  const total = lebarBerspasi(ctx, teks, spasi);
  const simpanAlign = ctx.textAlign;
  ctx.textAlign = "left";
  let x = cx - total / 2;
  for (const c of chars) {
    const w = ctx.measureText(c).width;
    ctx.fillText(c, x, y);
    x += w + spasi;
  }
  ctx.textAlign = simpanAlign;
}

/** Lambang brankas PINDAI versi kanvas (padanan `VaultLogo`). */
function brankas(ctx: Ctx, x: number, y: number, s: number) {
  const bodyH = s * 0.84;

  // Kaki brankas.
  ctx.fillStyle = "#0b2d2a";
  bulat(ctx, x + s * 0.2, y + bodyH - s * 0.03, s * 0.15, s * 0.1, s * 0.05);
  ctx.fill();
  bulat(ctx, x + s * 0.65, y + bodyH - s * 0.03, s * 0.15, s * 0.1, s * 0.05);
  ctx.fill();

  // Badan + bingkai kuningan.
  bulat(ctx, x, y, s, bodyH, s * 0.2);
  ctx.fillStyle = NAVY;
  ctx.fill();
  ctx.strokeStyle = BRASS;
  ctx.lineWidth = Math.max(2, s * 0.032);
  ctx.stroke();

  // Kilau tipis di sisi atas.
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = Math.max(1.5, s * 0.022);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x + s * 0.24, y + s * 0.08);
  ctx.lineTo(x + s * 0.76, y + s * 0.08);
  ctx.stroke();

  // Pintu brankas.
  bulat(ctx, x + s * 0.085, y + s * 0.09, s * 0.83, bodyH - s * 0.18, s * 0.12);
  ctx.fillStyle = "#f5f2e9";
  ctx.fill();
  bulat(ctx, x + s * 0.135, y + s * 0.14, s * 0.73, bodyH - s * 0.28, s * 0.09);
  ctx.strokeStyle = "#d9d2c1";
  ctx.lineWidth = Math.max(1.2, s * 0.018);
  ctx.stroke();

  // Engsel kiri.
  ctx.fillStyle = "#cbb47e";
  bulat(ctx, x + s * 0.03, y + s * 0.24, s * 0.075, s * 0.1, s * 0.038);
  ctx.fill();
  bulat(ctx, x + s * 0.03, y + s * 0.52, s * 0.075, s * 0.1, s * 0.038);
  ctx.fill();

  // Dial di tengah pintu.
  const dcx = x + s * 0.5;
  const dcy = y + s * 0.09 + (bodyH - s * 0.18) / 2;
  const rDial = s * 0.21;
  ctx.beginPath();
  ctx.arc(dcx, dcy, rDial, 0, Math.PI * 2);
  ctx.fillStyle = NAVY;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(dcx, dcy, rDial * 0.68, 0, Math.PI * 2);
  ctx.strokeStyle = "#cbb47e";
  ctx.lineWidth = Math.max(1.5, s * 0.024);
  ctx.stroke();

  ctx.strokeStyle = "#f5f2e9";
  ctx.lineWidth = Math.max(1.5, s * 0.026);
  ctx.beginPath();
  ctx.moveTo(dcx, dcy);
  ctx.lineTo(dcx + rDial * 0.72, dcy - rDial * 0.52);
  ctx.stroke();
  for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
    ctx.beginPath();
    ctx.moveTo(dcx + dx * rDial * 0.34, dcy + dy * rDial * 0.34);
    ctx.lineTo(dcx + dx * rDial * 0.68, dcy + dy * rDial * 0.68);
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(dcx, dcy, s * 0.045, 0, Math.PI * 2);
  ctx.fillStyle = "#cbb47e";
  ctx.fill();
  ctx.lineCap = "butt";
}

/** Dial besar tanpa isi — ornamen latar. */
function dialAir(ctx: Ctx, cx: number, cy: number, r: number, warna: string, alpha: number) {
  ctx.strokeStyle = rgba(warna, alpha);
  ctx.lineWidth = Math.max(1.5, r * 0.006);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.66, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 24; i += 1) {
    const a = (i / 24) * Math.PI * 2;
    const r1 = r;
    const r2 = r - (i % 3 === 0 ? r * 0.09 : r * 0.05);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
    ctx.stroke();
  }
}

/** Pita kata berulang sebagai tekstur latar. */
function pitaKata(
  ctx: Ctx,
  teks: string,
  x0: number,
  x1: number,
  y: number,
  fontPx: number,
  warna: string,
) {
  ctx.font = `800 ${fontPx}px ${SANS}`;
  ctx.fillStyle = warna;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const lebar = ctx.measureText(teks).width + fontPx * 1.6;
  for (let x = x0; x < x1; x += lebar) {
    ctx.fillText(teks, x, y);
  }
  ctx.textBaseline = "alphabetic";
}

// ---------------------------------------------------------------------------
// Foto profil — 1080×1080, aman dipotong bulat.
// ---------------------------------------------------------------------------

/** Foto profil WhatsApp ditampilkan terpotong bulat; hanya konten di dalam
 *  radius ini yang pasti terlihat. 0.44 × 1080 = 88% diameter kanvas. */
export const RADIUS_AMAN_BULAT = 0.44;

/** Pusat kanvas (sekaligus pusat potongan bulat & pusat tata letak konten). */
export const FOTO_PROFIL_PUSAT = 540;

/**
 * Tata letak tetap foto profil. Semua nilai magnetik (bukan dihitung ulang)
 * supaya hasil unduhan selalu sama; kelayakannya dijaga oleh uji pada
 * `promoProfil.test.ts` — keempat sudut `kotakKonten` wajib berada di dalam
 * lingkaran aman.
 */
export const TATA_FOTO_PROFIL = {
  emblema: { x: 396, y: 280, sisi: 288 },
  judul: { fs: 104, baseline: 728, lebarMaks: 430 },
  eyebrow: { fs: 30, baseline: 786, lebarMaks: 420 },
  /** Radius cincin segel kuningan (di dalam lingkaran aman). */
  cincin: 460,
} as const;

/** Setengah-lebar maksimum yang masih di dalam lingkaran pada jarak `jarakY`
 *  dari pusat. Dipakai untuk membatasi lebar teks agar tak menembus potongan
 *  bulat, dan diuji sebagai fungsi murni. */
export function setengahLebarAman(radius: number, jarakY: number): number {
  const sisa = radius * radius - jarakY * jarakY;
  return sisa <= 0 ? 0 : Math.sqrt(sisa);
}

/** Kotak pembatas konten foto profil (dipakai uji lingkaran aman). */
export const KOTAK_KONTEN_FOTO_PROFIL = (() => {
  const { emblema, judul, eyebrow } = TATA_FOTO_PROFIL;
  const kiri = Math.min(emblema.x, FOTO_PROFIL_PUSAT - judul.lebarMaks / 2, FOTO_PROFIL_PUSAT - eyebrow.lebarMaks / 2);
  const kanan = Math.max(
    emblema.x + emblema.sisi,
    FOTO_PROFIL_PUSAT + judul.lebarMaks / 2,
    FOTO_PROFIL_PUSAT + eyebrow.lebarMaks / 2,
  );
  const atas = emblema.y;
  // Kaki brankas melewati tinggi badan, ditambah ruang turun huruf eyebrow.
  const bawah = Math.max(emblema.y + emblema.sisi * 0.97, eyebrow.baseline + eyebrow.fs * 0.3);
  return { kiri, kanan, atas, bawah };
})();

/** Gambar foto profil WhatsApp ke kanvas (kanvas sebaiknya 1080×1080). */
export function gambarFotoProfil(ctx: Ctx) {
  const lebar = ctx.canvas.width || 1080;
  const tinggi = ctx.canvas.height || 1080;
  const cx = FOTO_PROFIL_PUSAT;
  const cy = FOTO_PROFIL_PUSAT;
  const radius = lebar * RADIUS_AMAN_BULAT;

  // Latar navy pekat + pendar emas.
  ctx.fillStyle = NAVY_DEEP;
  ctx.fillRect(0, 0, lebar, tinggi);
  const glow = ctx.createRadialGradient(cx, tinggi * 0.36, 0, cx, tinggi * 0.36, lebar * 0.72);
  glow.addColorStop(0, rgba(GOLD, 0.34));
  glow.addColorStop(0.42, rgba(GOLD, 0.1));
  glow.addColorStop(1, rgba(GOLD, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, lebar, tinggi);
  titikHalus(ctx, lebar, tinggi, "rgba(255,255,255,0.055)", 30, 1.2);

  // Cincin segel + takikan dial.
  ctx.strokeStyle = rgba(GOLD, 0.32);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, TATA_FOTO_PROFIL.cincin, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = rgba(GOLD, 0.2);
  ctx.lineWidth = 2;
  for (let i = 0; i < 24; i += 1) {
    const a = (i / 24) * Math.PI * 2;
    const r1 = TATA_FOTO_PROFIL.cincin;
    const r2 = r1 - (i % 6 === 0 ? 26 : 14);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
    ctx.stroke();
  }

  // Brankas.
  brankas(ctx, TATA_FOTO_PROFIL.emblema.x, TATA_FOTO_PROFIL.emblema.y, TATA_FOTO_PROFIL.emblema.sisi);

  // Judul PINDAI — diperkecil bila melebihi lebar yang aman.
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const batasJudul =
    2 * setengahLebarAman(radius, Math.abs(TATA_FOTO_PROFIL.judul.baseline - cy)) * 0.9;
  let fsJudul = TATA_FOTO_PROFIL.judul.fs;
  ctx.font = `800 ${fsJudul}px ${SANS}`;
  while (fsJudul > 40 && ctx.measureText("PINDAI").width > Math.min(TATA_FOTO_PROFIL.judul.lebarMaks, batasJudul)) {
    fsJudul -= 4;
    ctx.font = `800 ${fsJudul}px ${SANS}`;
  }
  ctx.fillStyle = GOLD;
  ctx.fillText("PINDAI", cx, TATA_FOTO_PROFIL.judul.baseline);

  // Eyebrow: PINJAM & GADAI DIGITAL.
  const batasEyebrow =
    2 * setengahLebarAman(radius, Math.abs(TATA_FOTO_PROFIL.eyebrow.baseline - cy)) * 0.94;
  let fsEyebrow = TATA_FOTO_PROFIL.eyebrow.fs;
  let spasiEyebrow = fsEyebrow * 0.24;
  ctx.font = `700 ${fsEyebrow}px ${SANS}`;
  while (
    fsEyebrow > 14 &&
    lebarBerspasi(ctx, "PINJAM & GADAI DIGITAL", spasiEyebrow) >
      Math.min(TATA_FOTO_PROFIL.eyebrow.lebarMaks, batasEyebrow)
  ) {
    fsEyebrow -= 1;
    spasiEyebrow = fsEyebrow * 0.24;
    ctx.font = `700 ${fsEyebrow}px ${SANS}`;
  }
  ctx.fillStyle = KREM_REDUP;
  teksBerspasi(ctx, "PINJAM & GADAI DIGITAL", cx, TATA_FOTO_PROFIL.eyebrow.baseline, spasiEyebrow);

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

// ---------------------------------------------------------------------------
// Background profil — sampul 16:9, konten di tengah-atas.
// ---------------------------------------------------------------------------

export const BACKGROUND_LEBAR = 1600;
export const BACKGROUND_TINGGI = 900;

/** Pusat horizontal konten sampul. */
export const BACKGROUND_PUSAT_X = 800;

/** Pusat vertikal blok konten — sengaja di atas karena foto profil WhatsApp
 *  dapat menutupi bagian bawah sampul. */
export const BACKGROUND_KONTEN_PUSAT_Y = 315;

/** Awal area yang harus dibiarkan bebas dari konten penting. */
export const BACKGROUND_BATAS_AMAN = 596;

/** Tata letak tetap blok konten sampul (koordinat pada kanvas 1600×900). */
export const TATA_BACKGROUND = {
  emblema: { sisi: 128, y: 110 },
  judul: { fs: 146, baseline: 396 },
  eyebrow: { fs: 28, baseline: 446 },
  pil: {
    fs: 26,
    tinggi: 50,
    y: 470,
    gap: 16,
    padX: 24,
    teks: ["Pinjam", "Gadai", "Kredit"],
  },
} as const;

/** Kotak vertikal konten penting sampul — wajib berakhir sebelum
 *  `BACKGROUND_BATAS_AMAN` agar tidak tertutup foto profil. */
export const KOTAK_KONTEN_BACKGROUND = {
  atas: TATA_BACKGROUND.emblema.y,
  bawah: TATA_BACKGROUND.pil.y + TATA_BACKGROUND.pil.tinggi,
} as const;

/** Gambar background/sampul profil WhatsApp (kanvas sebaiknya 1600×900). */
export function gambarBackgroundProfil(ctx: Ctx) {
  const lebar = ctx.canvas.width || BACKGROUND_LEBAR;
  const tinggi = ctx.canvas.height || BACKGROUND_TINGGI;
  const cx = BACKGROUND_PUSAT_X;
  const skala = lebar / BACKGROUND_LEBAR;

  // Latar navy + pendar emas dari kanan atas.
  ctx.fillStyle = NAVY_DEEP;
  ctx.fillRect(0, 0, lebar, tinggi);
  const glow = ctx.createRadialGradient(lebar * 0.86, tinggi * 0.06, 0, lebar * 0.86, tinggi * 0.06, lebar * 0.92);
  glow.addColorStop(0, rgba(GOLD, 0.3));
  glow.addColorStop(0.44, rgba(GOLD, 0.08));
  glow.addColorStop(1, rgba(GOLD, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, lebar, tinggi);
  const glow2 = ctx.createRadialGradient(lebar * 0.04, tinggi * 0.98, 0, lebar * 0.04, tinggi * 0.98, lebar * 0.7);
  glow2.addColorStop(0, "rgba(203,180,126,0.14)");
  glow2.addColorStop(1, "rgba(203,180,126,0)");
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, lebar, tinggi);
  titikHalus(ctx, lebar, tinggi, "rgba(255,255,255,0.05)", 28 * skala, 1.1 * skala);

  // Ornamen dial besar di kanan (boleh terpotong tepi).
  dialAir(ctx, lebar * 0.86, tinggi * 0.34, 260 * skala, GOLD, 0.16);

  // Blok konten: brankas → PINDAI → eyebrow → pil kata kunci.
  const emblema = TATA_BACKGROUND.emblema.sisi * skala;
  brankas(ctx, cx - emblema / 2, TATA_BACKGROUND.emblema.y * skala, emblema);

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = GOLD;
  ctx.font = `800 ${Math.round(TATA_BACKGROUND.judul.fs * skala)}px ${SANS}`;
  ctx.fillText("PINDAI", cx, TATA_BACKGROUND.judul.baseline * skala);

  ctx.fillStyle = KREM_REDUP;
  ctx.font = `700 ${Math.round(TATA_BACKGROUND.eyebrow.fs * skala)}px ${SANS}`;
  teksBerspasi(
    ctx,
    "PINJAM & GADAI DIGITAL",
    cx,
    TATA_BACKGROUND.eyebrow.baseline * skala,
    TATA_BACKGROUND.eyebrow.fs * skala * 0.3,
  );

  // Pil kata kunci.
  const pilFs = Math.round(TATA_BACKGROUND.pil.fs * skala);
  const pilPadX = Math.round(TATA_BACKGROUND.pil.padX * skala);
  const pilH = Math.round(TATA_BACKGROUND.pil.tinggi * skala);
  const pilGap = Math.round(TATA_BACKGROUND.pil.gap * skala);
  const pilY = TATA_BACKGROUND.pil.y * skala;
  ctx.font = `700 ${pilFs}px ${SANS}`;
  const pil = TATA_BACKGROUND.pil.teks.map((teks) => ({
    teks,
    w: ctx.measureText(teks).width + pilPadX * 2,
  }));
  const totalPil = pil.reduce((s, p) => s + p.w, 0) + pilGap * (pil.length - 1);
  let px = cx - totalPil / 2;
  for (const p of pil) {
    bulat(ctx, px, pilY, p.w, pilH, pilH / 2);
    ctx.fillStyle = rgba(GOLD, 0.14);
    ctx.fill();
    ctx.strokeStyle = rgba(GOLD, 0.4);
    ctx.lineWidth = Math.max(1.5, 2 * skala);
    ctx.stroke();
    ctx.fillStyle = KREM_REDUP;
    ctx.textBaseline = "middle";
    ctx.fillText(p.teks, px + p.w / 2, pilY + pilH / 2 + 1);
    ctx.textBaseline = "alphabetic";
    px += p.w + pilGap;
  }

  // Garis batas area aman + area bawah hanya ornamen.
  ctx.strokeStyle = rgba(GOLD, 0.16);
  ctx.lineWidth = Math.max(1, 1.5 * skala);
  ctx.beginPath();
  ctx.moveTo(lebar * 0.12, BACKGROUND_BATAS_AMAN * skala);
  ctx.lineTo(lebar * 0.88, BACKGROUND_BATAS_AMAN * skala);
  ctx.stroke();
  pitaKata(
    ctx,
    "PINDAI · PINJAM & GADAI DIGITAL · ",
    -20 * skala,
    lebar + 20 * skala,
    810 * skala,
    Math.max(12, Math.round(34 * skala)),
    "rgba(255,255,255,0.08)",
  );

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

/** Gambar aset profil sesuai `aset.id` ke kanvas milik `ctx`. */
export function gambarAsetProfil(ctx: Ctx, aset: AsetProfil) {
  if (aset.id === "foto-profil") {
    gambarFotoProfil(ctx);
    return;
  }
  gambarBackgroundProfil(ctx);
}
