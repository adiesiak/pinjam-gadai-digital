/**
 * asetAndroid — perangkat aset aplikasi Android PINDAI: ikon peluncur (Play
 * Store + adaptive icon), ikon notifikasi, splash screen, logo, wordmark, dan
 * feature graphic Play Store.
 *
 * Semua digambar langsung ke Canvas 2D tanpa dependensi React — sama seperti
 * `promoProfil` dan `promoPosterGambar` — sehingga halaman /promo cukup
 * memanggil `gambarAsetAndroid` untuk pratinjau DAN untuk mengunduh PNG-nya,
 * sementara tata letaknya tetap bisa diuji sebagai fungsi murni (lihat
 * `asetAndroid.test.ts`, `asetAndroid.render.test.ts`).
 *
 * Yang dijaga di sini bukan hanya "kelihatan bagus", tapi juga aturan teknis
 * Android — aset yang melanggar ini akan ditolak Play Console atau tampak
 * terpotong di perangkat:
 *  - **Adaptive icon**: lambang wajib berada di dalam lingkaran aman 66dp
 *    (61% kanvas). `KOTAK_LAMBANG_ADAPTIVE` + uji sudutnya menjaga itu.
 *  - **Ikon notifikasi**: hanya boleh putih ber-alpha, tanpa warna sama sekali.
 *  - **Ikon Play Store & feature graphic**: wajib latar penuh (Play menolak PNG
 *    ber-transparansi di kedua slot itu).
 *  - **Splash Android 12**: konten dalam lingkaran 288dp dari kanvas 1152 px
 *    (`SPLASH_ANDROID12`), karena sistem memotong sisanya jadi bulatan.
 *
 * Lambangnya adalah port kanvas dari `VaultLogo.tsx` — bukan ilustrasi brankas
 * 3D milik poster — supaya ikon aplikasi identik dengan logo di dalam aplikasi.
 */

import { BRASS, GOLD, KREM, KREM_REDUP, NAVY, NAVY_DEEP, rgba } from "./promoProfil";
import { TAGLINE } from "./promoPosters";

type Ctx = CanvasRenderingContext2D;

const SANS = "ui-sans-serif, system-ui, sans-serif";

// Palet brand diimpor dari `promoProfil` supaya ikon aplikasi, poster, dan aset
// profil WhatsApp tidak pernah punya dua definisi warna yang bisa berbeda.

/** Krem sedikit lebih tua untuk latar ikon — putih tulang, bukan kertas. */
export const KREM_PELAT = "#f5f2e9";
const PANEL_TEPI = "#d9d2c1";
const KUNINGAN_TERANG = "#cbb47e";
const KAKI_GELAP = "#0b2d2a";

// ---------------------------------------------------------------------------
// Primitif gambar (tanpa `ctx.roundRect` — belum merata di semua peramban).
// ---------------------------------------------------------------------------

function bulat(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
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
function teksBerspasi(ctx: Ctx, teks: string, cx: number, y: number, spasi: number): void {
  const chars = Array.from(teks);
  const total = lebarBerspasi(ctx, teks, spasi);
  const simpan = ctx.textAlign;
  ctx.textAlign = "left";
  let x = cx - total / 2;
  for (const c of chars) {
    const w = ctx.measureText(c).width;
    ctx.fillText(c, x, y);
    x += w + spasi;
  }
  ctx.textAlign = simpan;
}

/** Titik halus sebagai tekstur latar (bukan pola gambar, tetap tajam di PDF). */
function titikHalus(ctx: Ctx, w: number, h: number, warna: string, gap: number, radius: number): void {
  ctx.fillStyle = warna;
  for (let x = gap / 2; x < w; x += gap) {
    for (let y = gap / 2; y < h; y += gap) {
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Latar navy berlapis cahaya: pendar emas, pantulan kuningan, vignette. */
function latarNavy(ctx: Ctx, w: number, h: number): void {
  ctx.fillStyle = NAVY_DEEP;
  ctx.fillRect(0, 0, w, h);

  const pendar = ctx.createRadialGradient(w * 0.5, h * 0.34, 0, w * 0.5, h * 0.34, Math.max(w, h) * 0.62);
  pendar.addColorStop(0, rgba(GOLD, 0.22));
  pendar.addColorStop(0.45, rgba(GOLD, 0.07));
  pendar.addColorStop(1, rgba(GOLD, 0));
  ctx.fillStyle = pendar;
  ctx.fillRect(0, 0, w, h);

  const balik = ctx.createRadialGradient(w * 0.14, h * 0.94, 0, w * 0.14, h * 0.94, Math.max(w, h) * 0.5);
  balik.addColorStop(0, rgba(BRASS, 0.14));
  balik.addColorStop(1, rgba(BRASS, 0));
  ctx.fillStyle = balik;
  ctx.fillRect(0, 0, w, h);

  const vignette = ctx.createRadialGradient(
    w / 2,
    h / 2,
    Math.min(w, h) * 0.3,
    w / 2,
    h / 2,
    Math.max(w, h) * 0.74,
  );
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.44)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);

  titikHalus(ctx, w, h, "rgba(255,255,255,0.022)", Math.max(16, Math.round(Math.min(w, h) / 34)), 1);
}

/** Latar krem ikon: kertas tulang dengan pendar kuningan sangat tipis. */
function latarKrem(ctx: Ctx, w: number, h: number): void {
  ctx.fillStyle = KREM_PELAT;
  ctx.fillRect(0, 0, w, h);

  const pendar = ctx.createRadialGradient(w * 0.5, h * 0.3, 0, w * 0.5, h * 0.3, Math.max(w, h) * 0.7);
  pendar.addColorStop(0, rgba(GOLD, 0.3));
  pendar.addColorStop(0.55, rgba(GOLD, 0.08));
  pendar.addColorStop(1, rgba(GOLD, 0));
  ctx.fillStyle = pendar;
  ctx.fillRect(0, 0, w, h);

  const tepi = ctx.createRadialGradient(
    w / 2,
    h / 2,
    Math.min(w, h) * 0.42,
    w / 2,
    h / 2,
    Math.max(w, h) * 0.72,
  );
  tepi.addColorStop(0, "rgba(185,155,98,0)");
  tepi.addColorStop(1, "rgba(185,155,98,0.16)");
  ctx.fillStyle = tepi;
  ctx.fillRect(0, 0, w, h);

  // Grid titik kuningan tipis — tekstur, bukan ornamen yang ikut terpotong.
  titikHalus(ctx, w, h, rgba(BRASS, 0.1), Math.max(16, Math.round(Math.min(w, h) / 22)), 1.2);
}

// ---------------------------------------------------------------------------
// Lambang brankas — port kanvas dari VaultLogo.tsx (viewBox 64 × 64).
// ---------------------------------------------------------------------------

export type GayaLambang = "brand" | "putih";

/**
 * Gambar lambang brankas dalam kotak `s` × `s` pada (x, y).
 *
 * `gaya: "putih"` menghasilkan siluet putih ber-alpha (garis tebal, bukan
 * blok warna) karena ikon status bar Android hanya boleh putih.
 */
export function lambangBrankas(ctx: Ctx, x: number, y: number, s: number, gaya: GayaLambang = "brand"): void {
  const k = s / 64;
  const px = (v: number) => x + v * k;
  const py = (v: number) => y + v * k;

  ctx.save();
  ctx.lineCap = "round";

  if (gaya === "putih") {
    const putih = "#ffffff";
    // Badan (garis tebal) + panel pintu + dial + engsel: semua putih ber-alpha.
    bulat(ctx, px(5), py(6), 54 * k, 50 * k, 12 * k);
    ctx.strokeStyle = putih;
    ctx.lineWidth = 4 * k;
    ctx.stroke();

    bulat(ctx, px(13), py(14), 38 * k, 34 * k, 6 * k);
    ctx.lineWidth = 2 * k;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(px(31), py(31), 8.4 * k, 0, Math.PI * 2);
    ctx.lineWidth = 2.6 * k;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(px(31), py(31), 2.6 * k, 0, Math.PI * 2);
    ctx.fillStyle = putih;
    ctx.fill();

    ctx.fillStyle = putih;
    bulat(ctx, px(7), py(19), 5 * k, 7 * k, 2.5 * k);
    ctx.fill();
    bulat(ctx, px(7), py(36), 5 * k, 7 * k, 2.5 * k);
    ctx.fill();

    ctx.restore();
    return;
  }

  // Kaki brankas (di bawah badan, seperti VaultLogo).
  ctx.strokeStyle = KAKI_GELAP;
  ctx.lineWidth = 3 * k;
  ctx.beginPath();
  ctx.moveTo(px(20), py(57));
  ctx.lineTo(px(28), py(57));
  ctx.moveTo(px(36), py(57));
  ctx.lineTo(px(44), py(57));
  ctx.stroke();

  // Badan navy berbingkai kuningan + kilau putih di tepi atas.
  bulat(ctx, px(5), py(6), 54 * k, 50 * k, 12 * k);
  ctx.fillStyle = NAVY;
  ctx.fill();
  ctx.strokeStyle = BRASS;
  ctx.lineWidth = 2 * k;
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 2 * k;
  ctx.beginPath();
  ctx.moveTo(px(15), py(10));
  ctx.lineTo(px(49), py(10));
  ctx.stroke();

  // Panel pintu krem + garis dalam.
  bulat(ctx, px(11), py(12), 42 * k, 38 * k, 7 * k);
  ctx.fillStyle = KREM_PELAT;
  ctx.fill();
  bulat(ctx, px(14), py(15), 36 * k, 32 * k, 5 * k);
  ctx.strokeStyle = PANEL_TEPI;
  ctx.lineWidth = 1.5 * k;
  ctx.stroke();

  // Engsel kuningan di sisi kiri.
  ctx.fillStyle = KUNINGAN_TERANG;
  bulat(ctx, px(7), py(19), 5 * k, 7 * k, 2.5 * k);
  ctx.fill();
  bulat(ctx, px(7), py(36), 5 * k, 7 * k, 2.5 * k);
  ctx.fill();

  // Dial: cakram navy, cincin kuningan, jarum, dan poros.
  ctx.beginPath();
  ctx.arc(px(31), py(31), 10 * k, 0, Math.PI * 2);
  ctx.fillStyle = NAVY;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(px(31), py(31), 7.2 * k, 0, Math.PI * 2);
  ctx.strokeStyle = KUNINGAN_TERANG;
  ctx.lineWidth = 1.5 * k;
  ctx.stroke();

  ctx.strokeStyle = KREM_PELAT;
  ctx.lineWidth = 1.7 * k;
  ctx.beginPath();
  ctx.moveTo(px(31), py(31));
  ctx.lineTo(px(38), py(26));
  ctx.moveTo(px(31), py(24));
  ctx.lineTo(px(31), py(26));
  ctx.moveTo(px(38), py(31));
  ctx.lineTo(px(36), py(31));
  ctx.moveTo(px(31), py(38));
  ctx.lineTo(px(31), py(36));
  ctx.moveTo(px(24), py(31));
  ctx.lineTo(px(26), py(31));
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(px(31), py(31), 2.2 * k, 0, Math.PI * 2);
  ctx.fillStyle = KUNINGAN_TERANG;
  ctx.fill();

  ctx.restore();
}

/**
 * Lambang di atas pelat krem berbingkai kuningan — dipakai untuk splash dan
 * grafis Play Store, karena latar navy tidak kontras dengan badan lambang.
 */
export function lambangBadge(ctx: Ctx, x: number, y: number, s: number): void {
  bulat(ctx, x, y, s, s, s * 0.22);
  ctx.fillStyle = KREM;
  ctx.fill();
  ctx.strokeStyle = rgba(BRASS, 0.92);
  ctx.lineWidth = Math.max(1, s * 0.03);
  ctx.stroke();

  lambangBrankas(ctx, x + s * 0.13, y + s * 0.13, s * 0.74);
}

// ---------------------------------------------------------------------------
// Tata letak tetap — nilai magnetik (bukan dihitung ulang) supaya hasil unduhan
// selalu sama; kelayakannya dijaga uji di `asetAndroid.test.ts`.
// ---------------------------------------------------------------------------

/** Kanvas adaptive icon: 108dp @4x (xxhdpi). */
export const KANVAS_ADAPTIVE = 432;
/** Lingkaran aman adaptive icon: 66dp dari 108dp → radius 132 px di kanvas 432. */
export const ZONA_AMAN_ADAPTIVE = { pusat: 216, radius: 132 } as const;
/** Sisi kotak lambang di dalam zona aman (kotak menyinggung lingkaran). */
export const SISI_LAMBANG_ADAPTIVE = 176;
export const KOTAK_LAMBANG_ADAPTIVE = {
  kiri: ZONA_AMAN_ADAPTIVE.pusat - SISI_LAMBANG_ADAPTIVE / 2,
  atas: ZONA_AMAN_ADAPTIVE.pusat - SISI_LAMBANG_ADAPTIVE / 2,
  kanan: ZONA_AMAN_ADAPTIVE.pusat + SISI_LAMBANG_ADAPTIVE / 2,
  bawah: ZONA_AMAN_ADAPTIVE.pusat + SISI_LAMBANG_ADAPTIVE / 2,
} as const;

/** Ikon Play Store 512 × 512 (ukuran yang diminta Play Console). */
export const KANVAS_PLAYSTORE = 512;
export const SISI_LAMBANG_PLAYSTORE = 300;

/** Ikon notifikasi: 96 × 96 (xxxhdpi), lambang putih dengan margin 12 px. */
export const KANVAS_NOTIFIKASI = 96;
export const SISI_LAMBANG_NOTIFIKASI = 72;

/** Splash Android 12: kanvas 288dp @4x, konten aman dalam lingkaran 288 px. */
export const KANVAS_ANDROID12 = 1152;
export const SPLASH_ANDROID12 = {
  pusat: 576,
  radiusLingkaran: 384,
  radiusAmanKonten: 288,
  sisiBadge: 360,
} as const;

/** Tinggi pita kuningan bawah sebagai proporsi tinggi kanvas splash. */
export const PITA_BAWAH_RASIO = 0.06;

/** Tata letak splash — satu sumber untuk kedua orientasi. */
export const TATA_SPLASH = {
  potret: { lebar: 1080, tinggi: 1920, sisiBadge: 420, pusatBadgeY: 820, judulFs: 132, ruleY: 1492, taglineBaseline: 1560 },
  lanskap: { lebar: 1920, tinggi: 1080, sisiBadge: 300, pusatBadgeY: 430, judulFs: 104, ruleY: 890, taglineBaseline: 950 },
} as const;

export const TATA_WORDMARK = {
  lebar: 1600,
  tinggi: 400,
  sisiBadge: 260,
  badgeX: 90,
  badgeY: 70,
  judulFs: 170,
  judulBaseline: 235,
  teksX: 410,
  taglineFs: 38,
  taglineBaseline: 300,
} as const;

// ---------------------------------------------------------------------------
// Daftar aset.
// ---------------------------------------------------------------------------

export type AsetAndroidId =
  | "ikon-playstore"
  | "ikon-adaptive-foreground"
  | "ikon-adaptive-background"
  | "ikon-notifikasi"
  | "splash-potret"
  | "splash-lanskap"
  | "splash-android12"
  | "logo-kotak"
  | "wordmark-terang"
  | "wordmark-gelap"
  | "feature-graphic";

export type KategoriAsetAndroid = "Ikon" | "Splash" | "Logo" | "Play Store";

export const KATEGORI_ASET_ANDROID = ["Ikon", "Splash", "Logo", "Play Store"] as const;

export type AsetAndroid = {
  id: AsetAndroidId;
  label: string;
  kategori: KategoriAsetAndroid;
  /** Penjelasan singkat untuk kartu di halaman /promo. */
  keterangan: string;
  /** [lebar, tinggi] kanvas dalam piksel — persis ukuran PNG unduhan. */
  canvas: [number, number];
  /** Nama berkas unduhan (selalu .png). */
  berkas: string;
  /** Tujuan berkas di proyek Android. */
  tujuan: string;
  /** Aturan teknis yang tidak boleh dilanggar. */
  catatan: string;
  /** true bila PNG wajib punya latar penuh (tanpa transparansi). */
  latarPenuh: boolean;
  /**
   * true bila aset memuat teks merek (judul/tagline). Ikon murni lambang:
   * teks pada ikon peluncur jadi tidak terbaca dan pada ikon splash Android 12
   * terpotong lingkaran sistem.
   */
  berteks: boolean;
};

export const ASET_ANDROID: readonly AsetAndroid[] = [
  {
    id: "ikon-playstore",
    label: "Ikon Play Store",
    kategori: "Ikon",
    keterangan:
      "Ikon 512 × 512 untuk halaman Play Store. Lambang brankas PINDAI di atas latar krem berkilau kuningan — sama dengan ikon peluncur di perangkat.",
    canvas: [KANVAS_PLAYSTORE, KANVAS_PLAYSTORE],
    berkas: "pindai-ikon-playstore-512.png",
    tujuan: "Play Console → Main store listing → App icon",
    catatan: "512 × 512 px, latar penuh TANPA transparansi (Play menolak PNG ber-alpha di slot ini).",
    latarPenuh: true,
    berteks: false,
  },
  {
    id: "ikon-adaptive-foreground",
    label: "Adaptive icon — foreground",
    kategori: "Ikon",
    keterangan:
      "Lapisan lambang untuk ikon adaptive (Android 8+). Bila dengan lapisan latar, sistem yang memotong bentuknya jadi bulat, kotak, atau squircle.",
    canvas: [KANVAS_ADAPTIVE, KANVAS_ADAPTIVE],
    berkas: "pindai-ic_launcher_foreground-432.png",
    tujuan: "android/app/src/main/res/drawable/ic_launcher_foreground.png",
    catatan:
      "432 × 432 px transparan. Lambang wajib di dalam lingkaran aman 66dp — jangan diperbesar sendiri, sisanya akan terpotong.",
    latarPenuh: false,
    berteks: false,
  },
  {
    id: "ikon-adaptive-background",
    label: "Adaptive icon — background",
    kategori: "Ikon",
    keterangan:
      "Lapisan latar ikon adaptive: krem hangat dengan pendar kuningan dan tekstur titik halus, supaya lambang navy tetap terbaca saat ikon dipotong bulat.",
    canvas: [KANVAS_ADAPTIVE, KANVAS_ADAPTIVE],
    berkas: "pindai-ic_launcher_background-432.png",
    tujuan: "android/app/src/main/res/drawable/ic_launcher_background.png",
    catatan: "432 × 432 px latar penuh. Boleh juga diganti warna solid #F5F2E9 lewat colors.xml.",
    latarPenuh: true,
    berteks: false,
  },
  {
    id: "ikon-notifikasi",
    label: "Ikon notifikasi",
    kategori: "Ikon",
    keterangan:
      "Ikon notifikasi gaya siluet untuk push notification. Garis tebal tanpa warna supaya tetap terbaca saat sistem menampilkannya seukuran status bar.",
    canvas: [KANVAS_NOTIFIKASI, KANVAS_NOTIFIKASI],
    berkas: "pindai-ic_stat_notifikasi-96.png",
    tujuan: "android/app/src/main/res/drawable/ic_stat_pindai.png",
    catatan:
      "96 × 96 px, HANYA putih ber-alpha. Android akan mengabaikan warna dan merender ikon berwarna jadi kotak putih.",
    latarPenuh: false,
    berteks: false,
  },
  {
    id: "splash-potret",
    label: "Splash screen — potret",
    kategori: "Splash",
    keterangan:
      "Layar pembuka 1080 × 1920 untuk ponsel: lambang di atas pelat krem, judul PINDAI, tagline, dan pita kuningan di tepi bawah.",
    canvas: [TATA_SPLASH.potret.lebar, TATA_SPLASH.potret.tinggi],
    berkas: "pindai-splash-potret-1080x1920.png",
    tujuan: "android/app/src/main/res/drawable-port/splash_pindai.png",
    catatan: "1080 × 1920 px latar penuh. Pusatkan dengan scaleType=\"centerCrop\" agar tidak ada tepi kosong.",
    latarPenuh: true,
    berteks: true,
  },
  {
    id: "splash-lanskap",
    label: "Splash screen — lanskap",
    kategori: "Splash",
    keterangan:
      "Versi 1920 × 1080 untuk tablet dan perangkat lanskap, dengan susunan yang sama supaya identitasnya konsisten.",
    canvas: [TATA_SPLASH.lanskap.lebar, TATA_SPLASH.lanskap.tinggi],
    berkas: "pindai-splash-lanskap-1920x1080.png",
    tujuan: "android/app/src/main/res/drawable-land/splash_pindai.png",
    catatan: "1920 × 1080 px latar penuh. Cukup satu berkas per orientasi; sistem menskalakan sisanya.",
    latarPenuh: true,
    berteks: true,
  },
  {
    id: "splash-android12",
    label: "Ikon splash Android 12+",
    kategori: "Splash",
    keterangan:
      "Ikon untuk SplashScreen API Android 12 ke atas: cakram navy berbingkai kuningan, dipotong sistem jadi bulatan di tengah layar.",
    canvas: [KANVAS_ANDROID12, KANVAS_ANDROID12],
    berkas: "pindai-splash-android12-1152.png",
    tujuan: "android/app/src/main/res/drawable/ic_splash_pindai.png",
    catatan:
      "1152 × 1152 px transparan; konten aman hanya di dalam lingkaran 288 px dari pusat. Warna latar splash diatur di tema (lihat panduan).",
    latarPenuh: false,
    berteks: false,
  },
  {
    id: "logo-kotak",
    label: "Logo aplikasi",
    kategori: "Logo",
    keterangan:
      "Logo lambang saja di atas latar transparan, ukuran 1024 × 1024 — untuk halaman Profil/Tentang, dialog, atau header di dalam aplikasi.",
    canvas: [1024, 1024],
    berkas: "pindai-logo-1024.png",
    tujuan: "android/app/src/main/res/drawable/logo_pindai.png",
    catatan: "1024 × 1024 px transparan, sudah berpadding 14% agar aman di semua ukuran tampilan.",
    latarPenuh: false,
    berteks: false,
  },
  {
    id: "wordmark-terang",
    label: "Wordmark — untuk latar gelap",
    kategori: "Logo",
    keterangan:
      "Logo + tulisan PINDAI + tagline dengan warna krem, untuk dipasang di latar navy/tema gelap seperti splash dan toolbar.",
    canvas: [TATA_WORDMARK.lebar, TATA_WORDMARK.tinggi],
    berkas: "pindai-wordmark-terang-1600.png",
    tujuan: "android/app/src/main/res/drawable/wordmark_pindai_terang.png",
    catatan: "1600 × 400 px transparan. Pakai ini di tema gelap, atau wordmark gelap di tema terang.",
    latarPenuh: false,
    berteks: true,
  },
  {
    id: "wordmark-gelap",
    label: "Wordmark — untuk latar terang",
    kategori: "Logo",
    keterangan:
      "Versi navy dari wordmark yang sama, untuk latar putih/krem seperti halaman pengaturan, About, atau struk di dalam aplikasi.",
    canvas: [TATA_WORDMARK.lebar, TATA_WORDMARK.tinggi],
    berkas: "pindai-wordmark-gelap-1600.png",
    tujuan: "android/app/src/main/res/drawable/wordmark_pindai_gelap.png",
    catatan: "1600 × 400 px transparan. Jangan ditumpuk di latar navy — kontrasnya hilang.",
    latarPenuh: false,
    berteks: true,
  },
  {
    id: "feature-graphic",
    label: "Feature graphic Play Store",
    kategori: "Play Store",
    keterangan:
      "Grafis 1024 × 500 untuk halaman Play Store: wordmark, tagline, dan pil kata kunci Pinjaman/Gadai/Kredit dalam satu bingkai navy.",
    canvas: [1024, 500],
    berkas: "pindai-feature-graphic-1024x500.png",
    tujuan: "Play Console → Main store listing → Feature graphic",
    catatan:
      "1024 × 500 px latar penuh tanpa transparansi. Simpan konten penting di tengah — sebagian tampilan memotong tepinya.",
    latarPenuh: true,
    berteks: true,
  },
] as const;

/** Ambil satu aset berdasarkan id. */
export function ambilAsetAndroid(id: AsetAndroidId): AsetAndroid {
  const aset = ASET_ANDROID.find((a) => a.id === id);
  if (!aset) throw new Error(`Aset Android tidak dikenal: ${id}`);
  return aset;
}

/** Aset per kategori, urut sesuai `KATEGORI_ASET_ANDROID`. */
export function asetAndroidPerKategori(): Array<{
  kategori: KategoriAsetAndroid;
  daftar: readonly AsetAndroid[];
}> {
  return KATEGORI_ASET_ANDROID.map((kategori) => ({
    kategori,
    daftar: ASET_ANDROID.filter((a) => a.kategori === kategori),
  }));
}

// ---------------------------------------------------------------------------
// Painter per aset.
// ---------------------------------------------------------------------------

/** Ikon peluncur (Play Store 512) — lambang navy di atas krem berkilau. */
function gambarIkonPlaystore(ctx: Ctx): void {
  const w = KANVAS_PLAYSTORE;
  latarKrem(ctx, w, w);
  const sisi = SISI_LAMBANG_PLAYSTORE;
  lambangBrankas(ctx, (w - sisi) / 2, (w - sisi) / 2, sisi);
}

/** Lapisan lambang adaptive icon (transparan). */
function gambarAdaptiveForeground(ctx: Ctx): void {
  ctx.clearRect(0, 0, KANVAS_ADAPTIVE, KANVAS_ADAPTIVE);
  const { kiri, atas } = KOTAK_LAMBANG_ADAPTIVE;
  lambangBrankas(ctx, kiri, atas, SISI_LAMBANG_ADAPTIVE);
}

/** Lapisan latar adaptive icon (latar penuh). */
function gambarAdaptiveBackground(ctx: Ctx): void {
  latarKrem(ctx, KANVAS_ADAPTIVE, KANVAS_ADAPTIVE);
}

/** Ikon notifikasi putih ber-alpha. */
function gambarIkonNotifikasi(ctx: Ctx): void {
  ctx.clearRect(0, 0, KANVAS_NOTIFIKASI, KANVAS_NOTIFIKASI);
  const margin = (KANVAS_NOTIFIKASI - SISI_LAMBANG_NOTIFIKASI) / 2;
  lambangBrankas(ctx, margin, margin, SISI_LAMBANG_NOTIFIKASI, "putih");
}

/**
 * Pita kuningan di tepi bawah + garis emas tipis di atasnya. Dipakai splash
 * supaya bagian bawah kanvas punya penutup (bukan ruang navy kosong), tanpa
 * menambah teks yang harus dibaca.
 */
function pitaBawah(ctx: Ctx, lebar: number, tinggi: number): void {
  const tinggiPita = Math.round(tinggi * PITA_BAWAH_RASIO);
  const atas = tinggi - tinggiPita;

  const gradien = ctx.createLinearGradient(0, atas, 0, tinggi);
  gradien.addColorStop(0, rgba(BRASS, 0.05));
  gradien.addColorStop(0.55, rgba(BRASS, 0.16));
  gradien.addColorStop(1, rgba(BRASS, 0.26));
  ctx.fillStyle = gradien;
  ctx.fillRect(0, atas, lebar, tinggiPita);

  ctx.fillStyle = GOLD;
  ctx.fillRect(0, atas, lebar, Math.max(2, Math.round(tinggi * 0.0025)));
}

/** Splash potret & lanskap — satu susunan, dua ukuran. */
function gambarSplash(
  ctx: Ctx,
  tata: { lebar: number; tinggi: number; sisiBadge: number; pusatBadgeY: number; judulFs: number; ruleY: number; taglineBaseline: number },
): void {
  const { lebar, tinggi } = tata;
  latarNavy(ctx, lebar, tinggi);

  const cx = lebar / 2;
  lambangBadge(ctx, cx - tata.sisiBadge / 2, tata.pusatBadgeY - tata.sisiBadge / 2, tata.sisiBadge);

  // Judul PINDAI + rule kuningan + tagline berjarak huruf.
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = KREM;
  ctx.font = `800 ${tata.judulFs}px ${SANS}`;
  teksBerspasi(ctx, "PINDAI", cx, tata.ruleY - tata.judulFs * 0.55, tata.judulFs * 0.12);

  ctx.fillStyle = GOLD;
  const ruleLebar = Math.round(lebar * 0.16);
  bulat(ctx, cx - ruleLebar / 2, tata.ruleY, ruleLebar, Math.max(3, Math.round(tinggi * 0.0035)), 4);
  ctx.fill();

  ctx.fillStyle = KREM_REDUP;
  ctx.font = `600 ${Math.round(tata.judulFs * 0.26)}px ${SANS}`;
  teksBerspasi(ctx, TAGLINE, cx, tata.taglineBaseline, Math.round(tata.judulFs * 0.14));

  pitaBawah(ctx, lebar, tinggi);
}

/** Ikon splash Android 12: cakram navy berbingkai kuningan, transparan. */
function gambarSplashAndroid12(ctx: Ctx): void {
  const { pusat, radiusLingkaran, sisiBadge } = SPLASH_ANDROID12;
  ctx.clearRect(0, 0, KANVAS_ANDROID12, KANVAS_ANDROID12);

  ctx.beginPath();
  ctx.arc(pusat, pusat, radiusLingkaran, 0, Math.PI * 2);
  ctx.fillStyle = NAVY;
  ctx.fill();
  ctx.strokeStyle = rgba(BRASS, 0.85);
  ctx.lineWidth = Math.max(1, radiusLingkaran * 0.035);
  ctx.stroke();

  // Pendar emas di dalam cakram supaya tidak terlihat seperti bidang rata.
  ctx.save();
  ctx.beginPath();
  ctx.arc(pusat, pusat, radiusLingkaran, 0, Math.PI * 2);
  ctx.clip();
  const pendar = ctx.createRadialGradient(pusat, pusat * 0.72, 0, pusat, pusat * 0.72, radiusLingkaran * 1.1);
  pendar.addColorStop(0, rgba(GOLD, 0.26));
  pendar.addColorStop(1, rgba(GOLD, 0));
  ctx.fillStyle = pendar;
  ctx.fillRect(pusat - radiusLingkaran, pusat - radiusLingkaran, radiusLingkaran * 2, radiusLingkaran * 2);
  ctx.restore();

  lambangBrankas(ctx, pusat - sisiBadge / 2, pusat - sisiBadge / 2, sisiBadge);
}

/** Logo kotak transparan untuk dipakai di dalam aplikasi. */
function gambarLogoKotak(ctx: Ctx): void {
  ctx.clearRect(0, 0, 1024, 1024);
  const sisi = 1024 * 0.72;
  lambangBrankas(ctx, (1024 - sisi) / 2, (1024 - sisi) / 2, sisi);
}

/** Wordmark horizontal (lambang + judul + tagline), transparan. */
function gambarWordmark(ctx: Ctx, terang: boolean): void {
  const t = TATA_WORDMARK;
  ctx.clearRect(0, 0, t.lebar, t.tinggi);
  lambangBadge(ctx, t.badgeX, t.badgeY, t.sisiBadge);

  const warnaJudul = terang ? KREM : NAVY;
  const warnaTagline = terang ? KREM_REDUP : rgba(BRASS, 0.95);

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = warnaJudul;
  ctx.font = `800 ${t.judulFs}px ${SANS}`;
  ctx.fillText("PINDAI", t.teksX, t.judulBaseline);

  ctx.fillStyle = warnaTagline;
  ctx.font = `600 ${t.taglineFs}px ${SANS}`;
  ctx.fillText(TAGLINE, t.teksX + 4, t.taglineBaseline);
}

/** Feature graphic Play Store: lockup + pil kata kunci. */
function gambarFeatureGraphic(ctx: Ctx): void {
  const lebar = 1024;
  const tinggi = 500;
  latarNavy(ctx, lebar, tinggi);

  const sisiBadge = 300;
  const kiri = 82;
  lambangBadge(ctx, kiri, (tinggi - sisiBadge) / 2 - 30, sisiBadge);

  const teksX = kiri + sisiBadge + 60;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = KREM;
  ctx.font = `800 120px ${SANS}`;
  ctx.fillText("PINDAI", teksX, 245);

  ctx.fillStyle = KREM_REDUP;
  ctx.font = `600 30px ${SANS}`;
  ctx.fillText(TAGLINE, teksX + 4, 300);

  const pil = ["Pinjaman", "Gadai", "Kredit"];
  let x = teksX + 4;
  const y = 345;
  const tinggiPil = 54;
  ctx.font = `600 26px ${SANS}`;
  for (const kata of pil) {
    const lebarTeks = ctx.measureText(kata).width;
    const lebarPil = lebarTeks + 44;
    bulat(ctx, x, y, lebarPil, tinggiPil, tinggiPil / 2);
    ctx.strokeStyle = rgba(BRASS, 0.8);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = KREM;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(kata, x + lebarPil / 2, y + tinggiPil / 2 + 1);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    x += lebarPil + 16;
  }
}

/** Gambar aset Android sesuai `aset.id` ke kanvas milik `ctx`. */
export function gambarAsetAndroid(ctx: Ctx, aset: AsetAndroid): void {
  switch (aset.id) {
    case "ikon-playstore":
      gambarIkonPlaystore(ctx);
      return;
    case "ikon-adaptive-foreground":
      gambarAdaptiveForeground(ctx);
      return;
    case "ikon-adaptive-background":
      gambarAdaptiveBackground(ctx);
      return;
    case "ikon-notifikasi":
      gambarIkonNotifikasi(ctx);
      return;
    case "splash-potret":
      gambarSplash(ctx, TATA_SPLASH.potret);
      return;
    case "splash-lanskap":
      gambarSplash(ctx, TATA_SPLASH.lanskap);
      return;
    case "splash-android12":
      gambarSplashAndroid12(ctx);
      return;
    case "logo-kotak":
      gambarLogoKotak(ctx);
      return;
    case "wordmark-terang":
      gambarWordmark(ctx, true);
      return;
    case "wordmark-gelap":
      gambarWordmark(ctx, false);
      return;
    case "feature-graphic":
      gambarFeatureGraphic(ctx);
      return;
  }
}

// ---------------------------------------------------------------------------
// Panduan pasang — teks yang dilihat admin di halaman /promo.
// ---------------------------------------------------------------------------

export const PANDUAN_ANDROID = {
  warna: [
    { nama: "pindai_navy", nilai: "#0F3D3A" },
    { nama: "pindai_navy_tua", nilai: "#0A2624" },
    { nama: "pindai_emas", nilai: "#E0B64D" },
    { nama: "pindai_kuningan", nilai: "#B99B62" },
    { nama: "pindai_krem", nilai: "#FBF8F1" },
  ],
  langkah: [
    "Unduh semua berkas lewat tombol “Unduh semua”, lalu pindahkan ke folder res/ proyek Android Anda.",
    "Ganti ikon peluncur: taruh ic_launcher_foreground.png dan ic_launcher_background.png di res/drawable, lalu tambahkan res/mipmap-anydpi-v26/ic_launcher.xml (potongan kode di bawah).",
    "Splash lama: taruh splash_pindai.png di res/drawable-port/ dan res/drawable-land/, lalu tampilkan di layar pembuka dengan scaleType=\"centerCrop\".",
    "Splash Android 12+: taruh ic_splash_pindai.png di res/drawable dan pakai tema splash pada potongan kode (values-v31).",
    "Notifikasi: pakai ic_stat_pindai.png sebagai ikon push — jangan ikon berwarna, status bar akan merendernya jadi kotak putih.",
  ],
  potongan: [
    {
      id: "adaptive-icon",
      judul: "Ikon adaptive (Android 8+)",
      berkas: "android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml",
      kode: `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
</adaptive-icon>`,
    },
    {
      id: "warna",
      judul: "Warna brand",
      berkas: "android/app/src/main/res/values/colors.xml",
      kode: `<resources>
    <color name="pindai_navy">#0F3D3A</color>
    <color name="pindai_navy_tua">#0A2624</color>
    <color name="pindai_emas">#E0B64D</color>
    <color name="pindai_kuningan">#B99B62</color>
    <color name="pindai_krem">#FBF8F1</color>
</resources>`,
    },
    {
      id: "splash-android12",
      judul: "Tema splash Android 12+",
      berkas: "android/app/src/main/res/values-v31/themes.xml",
      kode: `<resources>
    <style name="Theme.Pindai.Splash" parent="Theme.SplashScreen">
        <item name="windowSplashScreenBackground">@color/pindai_navy_tua</item>
        <item name="windowSplashScreenAnimatedIcon">@drawable/ic_splash_pindai</item>
        <item name="postSplashScreenTheme">@style/Theme.Pindai</item>
    </style>
</resources>`,
    },
  ],
} as const;
