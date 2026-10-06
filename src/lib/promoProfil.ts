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
 *
 * Bahasa visual kedua aset sama: latar navy berlapis cahaya, lambang brankas
 * yang **berdiri di atas landasan kuningan** (dengan bayangan kontak, bukan
 * mengapung), segel kuningan sebagai bingkai, dan band buku besar di bagian
 * bawah sampul. Palet tetap navy/kuningan/emas/krem seperti poster /promo.
 */

const SANS = "ui-sans-serif, system-ui, sans-serif";

/** Palet brand PINDAI — sama dengan poster di halaman /promo. */
export const NAVY = "#0f3d3a";
export const NAVY_DEEP = "#0a2624";
export const GOLD = "#e0b64d";
export const BRASS = "#b99b62";
export const KREM = "#fbf8f1";
export const KREM_REDUP = "#d8c28c";

/** Warna hex → rgba() dengan alpha tertentu. */
export function rgba(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const n = Number.parseInt(h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}

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
      "Brankas PINDAI berdiri di atas landasan kuningan, disinari segel di sekelilingnya. Lambang dan judul sengaja diperbesar agar tetap terbaca saat WhatsApp menampilkan foto profil seukuran thumbnail. Seluruh isi berada di dalam lingkaran aman, jadi tetap utuh saat dipotong bulat.",
    canvas: [1080, 1080],
    ratioLabel: "1:1 · dipotong bulat",
    berkas: "pindai-foto-profil-whatsapp.png",
  },
  {
    id: "background-profil",
    label: "Background Profil WhatsApp",
    keterangan:
      "Sampul 16:9 untuk profil WhatsApp Business. Blok brand di tengah-atas, lalu band buku besar bertepi kuningan di bawah garis batas — bagian yang boleh tertutup foto profil, diisi ornamen bukan ruang kosong.",
    canvas: [1600, 900],
    ratioLabel: "16:9",
    berkas: "pindai-background-profil-whatsapp.png",
  },
];

// ---------------------------------------------------------------------------
// Primitif gambar.
// ---------------------------------------------------------------------------

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

/**
 * Cahaya berlapis: pendar emas utama, pantulan kuningan dari bawah, dan
 * vignette gelap di tepi kanvas — supaya latar tidak terbaca sebagai bidang
 * warna yang rata.
 */
function sorotLapis(
  ctx: Ctx,
  lebar: number,
  tinggi: number,
  cx: number,
  cy: number,
  radius: number,
) {
  const utama = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  utama.addColorStop(0, rgba(GOLD, 0.32));
  utama.addColorStop(0.42, rgba(GOLD, 0.09));
  utama.addColorStop(1, rgba(GOLD, 0));
  ctx.fillStyle = utama;
  ctx.fillRect(0, 0, lebar, tinggi);

  const balik = ctx.createRadialGradient(
    lebar * 0.12,
    tinggi * 0.96,
    0,
    lebar * 0.12,
    tinggi * 0.96,
    radius * 0.85,
  );
  balik.addColorStop(0, rgba(BRASS, 0.16));
  balik.addColorStop(1, rgba(BRASS, 0));
  ctx.fillStyle = balik;
  ctx.fillRect(0, 0, lebar, tinggi);

  const vignette = ctx.createRadialGradient(
    cx,
    cy,
    Math.min(lebar, tinggi) * 0.34,
    cx,
    cy,
    Math.max(lebar, tinggi) * 0.72,
  );
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.44)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, lebar, tinggi);
}

/**
 * Landasan kuningan + bayangan kontak, supaya brankas **berdiri** di atas
 * sesuatu: bayangan di lantai, garis lantai yang lebih lebar, badan landasan
 * berundak terang→gelap, lalu kilau di tepi atasnya.
 */
function panggung(ctx: Ctx, cx: number, atas: number, lebar: number, tinggi: number) {
  const kiri = cx - lebar / 2;
  const bawah = atas + tinggi;

  ctx.beginPath();
  ctx.ellipse(cx, bawah + tinggi * 0.5, lebar * 0.62, tinggi * 0.52, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.34)";
  ctx.fill();

  ctx.strokeStyle = rgba(BRASS, 0.26);
  ctx.lineWidth = Math.max(1, tinggi * 0.07);
  ctx.beginPath();
  ctx.moveTo(cx - lebar * 0.86, bawah + tinggi * 0.1);
  ctx.lineTo(cx + lebar * 0.86, bawah + tinggi * 0.1);
  ctx.stroke();

  const badan = ctx.createLinearGradient(kiri, atas, kiri, bawah);
  badan.addColorStop(0, "#d8c28c");
  badan.addColorStop(0.45, BRASS);
  badan.addColorStop(1, "#6b5a37");
  bulat(ctx, kiri, atas, lebar, tinggi, tinggi * 0.45);
  ctx.fillStyle = badan;
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.lineWidth = Math.max(1, tinggi * 0.09);
  ctx.beginPath();
  ctx.moveTo(kiri + lebar * 0.08, atas + tinggi * 0.24);
  ctx.lineTo(kiri + lebar * 0.92, atas + tinggi * 0.24);
  ctx.stroke();
}

/**
 * Segel kuningan: cincin tipis penuh sebagai bibir medali, busur tebal yang
 * sengaja **tidak penuh** supaya tidak bersaing dengan potongan bulat
 * WhatsApp, lalu takik-takik di sepanjang busur. Takik dibuat sedikit dan
 * tebal agar tidak melebur saat aset diperkecil jadi thumbnail.
 */
function busurSegel(
  ctx: Ctx,
  cx: number,
  cy: number,
  r: number,
  mulai: number,
  akhir: number,
  takik: number,
) {
  const tebal = r * 0.016;

  ctx.strokeStyle = rgba(GOLD, 0.2);
  ctx.lineWidth = Math.max(1, tebal * 0.42);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = rgba(GOLD, 0.5);
  ctx.lineWidth = Math.max(1.5, tebal);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(cx, cy, r, mulai, akhir);
  ctx.stroke();

  ctx.strokeStyle = rgba(GOLD, 0.34);
  ctx.lineWidth = Math.max(1, tebal * 0.5);
  for (let i = 0; i <= takik; i += 1) {
    const a = mulai + ((akhir - mulai) * i) / takik;
    const panjang = i % 2 === 0 ? r * 0.055 : r * 0.03;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.lineTo(cx + Math.cos(a) * (r - panjang), cy + Math.sin(a) * (r - panjang));
    ctx.stroke();
  }
  ctx.lineCap = "butt";
}

/**
 * Lambang brankas PINDAI versi kanvas (padanan `VaultLogo`).
 *
 * Digambar dengan kedalaman: pintu sedikit terbuka sehingga tampak celah
 * cahaya emas dari dalam rongga, dial berbayang dengan bibir kuningan, dan
 * bayangan kontak di kakinya. Dipakai oleh aset profil di sini **dan** oleh
 * lencana header poster di `/promo`, supaya lambang brand hanya punya satu
 * gambar sumber.
 *
 * Menggambar pada kotak `s × s` dengan sudut kiri-atas di (x, y); tinggi
 * efektif ±0.94·s karena kaki dan bayangan kontak menonjol di bawah badan.
 * Murni bentuk: tidak menulis teks dan tidak mengubah `textAlign`,
 * `textBaseline`, maupun `globalAlpha` milik pemanggil.
 */
export function brankas(ctx: Ctx, x: number, y: number, s: number) {
  const bodyH = s * 0.84;

  // Rongga (bukaan badan) dan panel pintu yang digeser ke kiri — selisih
  // itulah celah tempat cahaya keluar.
  const bukaanX = x + s * 0.085;
  const bukaanY = y + s * 0.09;
  const bukaanW = s * 0.83;
  const bukaanH = bodyH - s * 0.18;
  const pintuX = bukaanX - s * 0.045;
  const pintuY = bukaanY - s * 0.02;
  const pintuW = bukaanW - s * 0.055;
  const pintuH = bukaanH + s * 0.04;

  // Bayangan kontak di lantai.
  ctx.beginPath();
  ctx.ellipse(x + s * 0.5, y + bodyH + s * 0.045, s * 0.5, s * 0.03, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.32)";
  ctx.fill();

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

  // Rongga dalam (terlihat di celah pintu).
  bulat(ctx, bukaanX, bukaanY, bukaanW, bukaanH, s * 0.12);
  ctx.fillStyle = "#08201f";
  ctx.fill();

  // Cahaya dari dalam: pendar lebar lalu bilah terang di tepi celah.
  bulat(ctx, bukaanX + bukaanW - s * 0.17, bukaanY, s * 0.17, bukaanH, s * 0.05);
  ctx.fillStyle = rgba(GOLD, 0.2);
  ctx.fill();

  const celah = ctx.createLinearGradient(0, bukaanY, 0, bukaanY + bukaanH);
  celah.addColorStop(0, "#ffe9a8");
  celah.addColorStop(0.55, GOLD);
  celah.addColorStop(1, BRASS);
  bulat(
    ctx,
    bukaanX + bukaanW - s * 0.105,
    bukaanY + s * 0.03,
    s * 0.05,
    bukaanH - s * 0.06,
    s * 0.028,
  );
  ctx.fillStyle = celah;
  ctx.fill();

  // Bayangan kontak pintu, lalu panel pintu berbayang terang→gelap.
  bulat(ctx, pintuX, pintuY, pintuW, pintuH, s * 0.12);
  ctx.strokeStyle = "rgba(0,0,0,0.3)";
  ctx.lineWidth = Math.max(1, s * 0.016);
  ctx.stroke();

  const pintu = ctx.createLinearGradient(pintuX, 0, pintuX + pintuW, 0);
  pintu.addColorStop(0, "#faf8f2");
  pintu.addColorStop(0.42, "#f5f2e9");
  pintu.addColorStop(1, "#ddd6c6");
  bulat(ctx, pintuX, pintuY, pintuW, pintuH, s * 0.12);
  ctx.fillStyle = pintu;
  ctx.fill();

  bulat(ctx, pintuX + s * 0.05, pintuY + s * 0.05, pintuW - s * 0.1, pintuH - s * 0.1, s * 0.09);
  ctx.strokeStyle = "rgba(0,0,0,0.12)";
  ctx.lineWidth = Math.max(1.2, s * 0.018);
  ctx.stroke();

  // Engsel kiri (ikut panel pintu).
  ctx.fillStyle = "#cbb47e";
  bulat(ctx, pintuX - s * 0.012, pintuY + pintuH * 0.16, s * 0.075, s * 0.1, s * 0.038);
  ctx.fill();
  bulat(ctx, pintuX - s * 0.012, pintuY + pintuH * 0.62, s * 0.075, s * 0.1, s * 0.038);
  ctx.fill();

  // Dial dengan kedalaman.
  const dcx = pintuX + pintuW * 0.5;
  const dcy = pintuY + pintuH * 0.5;
  const rDial = s * 0.21;

  ctx.beginPath();
  ctx.arc(dcx + s * 0.012, dcy + s * 0.018, rDial, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.26)";
  ctx.fill();

  ctx.beginPath();
  ctx.arc(dcx, dcy, rDial, 0, Math.PI * 2);
  ctx.fillStyle = NAVY;
  ctx.fill();

  const bibir = ctx.createLinearGradient(dcx - rDial, dcy - rDial, dcx + rDial, dcy + rDial);
  bibir.addColorStop(0, "#e6d3a4");
  bibir.addColorStop(0.5, BRASS);
  bibir.addColorStop(1, "#7d6a44");
  ctx.beginPath();
  ctx.arc(dcx, dcy, rDial, 0, Math.PI * 2);
  ctx.strokeStyle = bibir;
  ctx.lineWidth = Math.max(1.5, s * 0.028);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(dcx, dcy, rDial * 0.86, Math.PI * 1.15, Math.PI * 1.6);
  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.lineWidth = Math.max(1.2, s * 0.018);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(dcx, dcy, rDial * 0.68, 0, Math.PI * 2);
  ctx.strokeStyle = "#cbb47e";
  ctx.lineWidth = Math.max(1.5, s * 0.024);
  ctx.stroke();

  ctx.strokeStyle = "#faf8f2";
  ctx.lineWidth = Math.max(1.5, s * 0.026);
  ctx.beginPath();
  ctx.moveTo(dcx, dcy);
  ctx.lineTo(dcx + rDial * 0.72, dcy - rDial * 0.52);
  ctx.stroke();
  for (const [dx, dy] of [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ] as const) {
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

/** Dial besar tanpa isi — ornamen latar berpendar. */
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
  // Hub kuningan supaya dial terbaca sebagai benda, bukan busur nyasar.
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.44, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.07, 0, Math.PI * 2);
  ctx.fillStyle = rgba(warna, Math.min(1, alpha * 3));
  ctx.fill();
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
 *
 * Skala sengaja besar: pada daftar chat WhatsApp aset ini tampil sekitar 40 px,
 * jadi lambang harus mengisi porsi besar lingkaran agar siluetnya masih
 * dikenali (lambang ±40% diameter potongan). Sisa ruang aman dipakai untuk
 * judul, rule kuningan, dan eyebrow.
 */
export const TATA_FOTO_PROFIL = {
  emblema: { x: 350, y: 222, sisi: 380 },
  judul: { fs: 132, baseline: 758, lebarMaks: 560 },
  rule: { lebar: 168, tinggi: 7, y: 782 },
  eyebrow: { fs: 30, baseline: 832, lebarMaks: 580 },
  /** Radius cincin/busur segel kuningan (di dalam lingkaran aman). */
  cincin: 442,
} as const;

/** Landasan kuningan foto profil — diturunkan dari lambang agar satu sumber. */
export const LANDASAN_FOTO_PROFIL = (() => {
  const { emblema } = TATA_FOTO_PROFIL;
  return {
    cx: FOTO_PROFIL_PUSAT,
    atas: emblema.y + emblema.sisi * 0.86,
    lebar: emblema.sisi * 1.05,
    tinggi: emblema.sisi * 0.075,
  };
})();

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
  const setengahMaks = Math.max(judul.lebarMaks, eyebrow.lebarMaks) / 2;
  const kiri = Math.min(emblema.x, FOTO_PROFIL_PUSAT - setengahMaks);
  const kanan = Math.max(emblema.x + emblema.sisi, FOTO_PROFIL_PUSAT + setengahMaks);
  const atas = emblema.y;
  // Kaki brankas melewati tinggi badan, ditambah ruang turun huruf eyebrow.
  // Landasan & rule tidak ikut ke sini: keduanya diperiksa langsung terhadap
  // lingkaran aman (sudut kotak & jarak ke pusat) di `promoProfil.test.ts`.
  const bawah = Math.max(
    emblema.y + emblema.sisi * 0.97,
    eyebrow.baseline + eyebrow.fs * 0.3,
  );
  return { kiri, kanan, atas, bawah };
})();

/** Gambar foto profil WhatsApp ke kanvas (kanvas sebaiknya 1080×1080). */
export function gambarFotoProfil(ctx: Ctx) {
  const lebar = ctx.canvas.width || 1080;
  const tinggi = ctx.canvas.height || 1080;
  const cx = FOTO_PROFIL_PUSAT;
  const cy = FOTO_PROFIL_PUSAT;
  const radius = lebar * RADIUS_AMAN_BULAT;

  // Latar navy pekat, disinari berlapis, dengan vignette di tepi potongan.
  ctx.fillStyle = NAVY_DEEP;
  ctx.fillRect(0, 0, lebar, tinggi);
  sorotLapis(ctx, lebar, tinggi, cx, tinggi * 0.42, lebar * 0.8);
  titikHalus(ctx, lebar, tinggi, rgba("#ffffff", 0.06), 30, 1.2);

  // Bibir medali: busur segel terang di bagian atas + cincin tipis penuh.
  busurSegel(ctx, cx, cy, TATA_FOTO_PROFIL.cincin, Math.PI * 1.08, Math.PI * 1.92, 13);

  // Landasan digambar lebih dulu supaya kaki brankas berdiri di atasnya.
  const landasan = LANDASAN_FOTO_PROFIL;
  panggung(ctx, landasan.cx, landasan.atas, landasan.lebar, landasan.tinggi);
  brankas(ctx, TATA_FOTO_PROFIL.emblema.x, TATA_FOTO_PROFIL.emblema.y, TATA_FOTO_PROFIL.emblema.sisi);

  // Judul PINDAI — diperkecil bila melebihi lebar yang aman.
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const batasJudul =
    2 * setengahLebarAman(radius, Math.abs(TATA_FOTO_PROFIL.judul.baseline - cy)) * 0.9;
  let fsJudul = TATA_FOTO_PROFIL.judul.fs;
  ctx.font = `800 ${fsJudul}px ${SANS}`;
  while (
    fsJudul > 40 &&
    ctx.measureText("PINDAI").width > Math.min(TATA_FOTO_PROFIL.judul.lebarMaks, batasJudul)
  ) {
    fsJudul -= 4;
    ctx.font = `800 ${fsJudul}px ${SANS}`;
  }
  ctx.fillStyle = GOLD;
  ctx.fillText("PINDAI", cx, TATA_FOTO_PROFIL.judul.baseline);

  // Rule kuningan di bawah judul: menutup lockup seperti garis buku besar.
  const rule = TATA_FOTO_PROFIL.rule;
  const kilauRule = ctx.createLinearGradient(cx - rule.lebar / 2, 0, cx + rule.lebar / 2, 0);
  kilauRule.addColorStop(0, rgba(BRASS, 0.2));
  kilauRule.addColorStop(0.5, GOLD);
  kilauRule.addColorStop(1, rgba(BRASS, 0.2));
  bulat(ctx, cx - rule.lebar / 2, rule.y, rule.lebar, rule.tinggi, rule.tinggi / 2);
  ctx.fillStyle = kilauRule;
  ctx.fill();

  // Eyebrow: PINJAM & GADAI DIGITAL — krem penuh supaya tetap kontras.
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
  ctx.fillStyle = KREM;
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

/** Awal area yang boleh tertutup foto profil — sekaligus tepi atas band buku
 *  besar di bagian bawah sampul. */
export const BACKGROUND_BATAS_AMAN = 596;

/**
 * Tata letak tetap blok konten sampul (koordinat pada kanvas 1600×900).
 * `band` mengatur bagian bawah yang boleh tertutup foto profil: diisi ornamen
 * (aturan buku besar + pita kata), jadi tidak ada ruang mati maupun garis sisa.
 */
export const TATA_BACKGROUND = {
  emblema: { sisi: 150, y: 96 },
  judul: { fs: 150, baseline: 408 },
  rule: { lebar: 190, tinggi: 9, y: 434 },
  eyebrow: { fs: 28, baseline: 474 },
  pil: {
    fs: 27,
    tinggi: 54,
    y: 500,
    gap: 16,
    padX: 26,
    teks: ["Pinjam", "Gadai", "Kredit"],
  },
  band: {
    tepi: BACKGROUND_BATAS_AMAN,
    garisAtas: 700,
    garisBawah: 796,
    jarakBuku: 26,
  },
  pita: {
    y: 748,
    fs: 34,
    alpha: 0.14,
    teks: "PINDAI · PINJAM & GADAI DIGITAL · ",
  },
} as const;

/** Pusat vertikal blok konten — sengaja di atas karena foto profil WhatsApp
 *  dapat menutupi bagian bawah sampul. */
export const BACKGROUND_KONTEN_PUSAT_Y =
  (TATA_BACKGROUND.emblema.y + TATA_BACKGROUND.pil.y + TATA_BACKGROUND.pil.tinggi) / 2;

/** Kotak vertikal konten penting sampul — wajib berakhir sebelum
 *  `BACKGROUND_BATAS_AMAN` agar tidak tertutup foto profil. */
export const KOTAK_KONTEN_BACKGROUND = {
  atas: TATA_BACKGROUND.emblema.y,
  bawah: TATA_BACKGROUND.pil.y + TATA_BACKGROUND.pil.tinggi,
} as const;

/** Landasan kuningan sampul — diturunkan dari lambang agar satu sumber. */
export const LANDASAN_BACKGROUND = (() => {
  const { emblema } = TATA_BACKGROUND;
  return {
    cx: BACKGROUND_PUSAT_X,
    atas: emblema.y + emblema.sisi * 0.86,
    lebar: emblema.sisi * 1.05,
    tinggi: emblema.sisi * 0.075,
  };
})();

/** Gambar background/sampul profil WhatsApp (kanvas sebaiknya 1600×900). */
export function gambarBackgroundProfil(ctx: Ctx) {
  const lebar = ctx.canvas.width || BACKGROUND_LEBAR;
  const tinggi = ctx.canvas.height || BACKGROUND_TINGGI;
  const cx = BACKGROUND_PUSAT_X;
  const skala = lebar / BACKGROUND_LEBAR;
  const { band, pita, pil } = TATA_BACKGROUND;

  // Latar navy + cahaya berlapis (pendar utama dari kanan atas).
  ctx.fillStyle = NAVY_DEEP;
  ctx.fillRect(0, 0, lebar, tinggi);
  sorotLapis(ctx, lebar, tinggi, lebar * 0.84, tinggi * 0.06, lebar * 0.9);
  titikHalus(ctx, lebar, tinggi, rgba("#ffffff", 0.055), 28 * skala, 1.15 * skala);

  // Ornamen: dial besar di kanan-atas.
  dialAir(ctx, lebar * 0.87, tinggi * 0.33, 265 * skala, GOLD, 0.16);

  // Band bawah: area yang boleh tertutup foto profil, diisi aturan buku besar.
  ctx.fillStyle = "rgba(0,0,0,0.24)";
  ctx.fillRect(0, band.tepi * skala, lebar, tinggi - band.tepi * skala);

  ctx.strokeStyle = rgba(GOLD, 0.07);
  ctx.lineWidth = Math.max(1, skala);
  for (let y = band.tepi + band.jarakBuku; y < tinggi - 8 * skala; y += band.jarakBuku) {
    ctx.beginPath();
    ctx.moveTo(0, y * skala);
    ctx.lineTo(lebar, y * skala);
    ctx.stroke();
  }
  for (const kolom of [0.14, 0.5, 0.86]) {
    ctx.beginPath();
    ctx.moveTo(lebar * kolom, band.tepi * skala);
    ctx.lineTo(lebar * kolom, tinggi);
    ctx.stroke();
  }

  // Tepi band + dua pembatas pita: sekarang tepi yang memang didesain, bukan
  // garis bantu yang dulu ikut terunduh.
  ctx.strokeStyle = rgba(GOLD, 0.34);
  ctx.lineWidth = Math.max(1.5, 2 * skala);
  ctx.beginPath();
  ctx.moveTo(0, band.tepi * skala);
  ctx.lineTo(lebar, band.tepi * skala);
  ctx.stroke();
  ctx.strokeStyle = rgba(GOLD, 0.16);
  ctx.lineWidth = Math.max(1, 1.2 * skala);
  for (const y of [band.garisAtas, band.garisBawah]) {
    ctx.beginPath();
    ctx.moveTo(0, y * skala);
    ctx.lineTo(lebar, y * skala);
    ctx.stroke();
  }

  // Pita kata — satu-satunya teks di band, murni ornamen.
  pitaKata(
    ctx,
    pita.teks,
    -20 * skala,
    lebar + 20 * skala,
    pita.y * skala,
    Math.max(12, Math.round(pita.fs * skala)),
    rgba("#ffffff", pita.alpha),
  );

  // Blok konten: landasan → brankas → PINDAI → rule → eyebrow → pil.
  const emblema = TATA_BACKGROUND.emblema.sisi * skala;
  const landasan = LANDASAN_BACKGROUND;
  panggung(ctx, landasan.cx, landasan.atas * skala, landasan.lebar * skala, landasan.tinggi * skala);
  brankas(ctx, cx - emblema / 2, TATA_BACKGROUND.emblema.y * skala, emblema);

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = GOLD;
  ctx.font = `800 ${Math.round(TATA_BACKGROUND.judul.fs * skala)}px ${SANS}`;
  ctx.fillText("PINDAI", cx, TATA_BACKGROUND.judul.baseline * skala);

  const rule = TATA_BACKGROUND.rule;
  const kilauRule = ctx.createLinearGradient(
    cx - rule.lebar / 2,
    0,
    cx + rule.lebar / 2,
    0,
  );
  kilauRule.addColorStop(0, rgba(BRASS, 0.2));
  kilauRule.addColorStop(0.5, GOLD);
  kilauRule.addColorStop(1, rgba(BRASS, 0.2));
  bulat(
    ctx,
    cx - (rule.lebar / 2) * skala,
    rule.y * skala,
    rule.lebar * skala,
    rule.tinggi * skala,
    (rule.tinggi / 2) * skala,
  );
  ctx.fillStyle = kilauRule;
  ctx.fill();

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
  const pilFs = Math.round(pil.fs * skala);
  const pilPadX = Math.round(pil.padX * skala);
  const pilH = Math.round(pil.tinggi * skala);
  const pilGap = Math.round(pil.gap * skala);
  const pilY = pil.y * skala;
  ctx.font = `700 ${pilFs}px ${SANS}`;
  const daftarPil = pil.teks.map((teks) => ({
    teks,
    w: ctx.measureText(teks).width + pilPadX * 2,
  }));
  const totalPil =
    daftarPil.reduce((s, p) => s + p.w, 0) + pilGap * (daftarPil.length - 1);
  let px = cx - totalPil / 2;
  for (const p of daftarPil) {
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
