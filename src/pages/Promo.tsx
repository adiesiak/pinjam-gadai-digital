import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { useQuery } from "convex/react";

import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  Check,
  Download,
  Image as ImageIcon,
  Loader2,
  QrCode,
  Share2,
  Sparkles,
  X,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Ukuran kanvas kasus sosial media (content-safe area di sekitar batas).
// ---------------------------------------------------------------------------
type Ukuran = {
  id: string;
  label: string;
  ratioLabel: string;
  canvas: [number, number];
  content: [number, number];
};

const UKURAN: Ukuran[] = [
  {
    id: "stories",
    label: "Stories / Reels",
    ratioLabel: "9:16",
    canvas: [1080, 1920],
    content: [880, 1440],
  },
  {
    id: "feed",
    label: "Feed / Post 4:5",
    ratioLabel: "4:5",
    canvas: [1080, 1350],
    content: [860, 1120],
  },
  {
    id: "post",
    label: "Post 1:1",
    ratioLabel: "1:1",
    canvas: [1080, 1080],
    content: [840, 840],
  },
  {
    id: "profil",
    label: "Profile",
    ratioLabel: "1:1",
    canvas: [1080, 1080],
    content: [780, 780],
  },
];

// ---------------------------------------------------------------------------
// Palet brand PINDAI. Tiap poster punya warna aksen sendiri supaya galeri
// terasa hidup, namun tetap dalam keluarga hijau + krem yang sama.
// ---------------------------------------------------------------------------
const NAVY = "#0f3d3a";
const NAVY_DEEP = "#0a2624";
const GOLD = "#e0b64d";
const INK = "#133a34";
const MUTED = "#5f6f6a";
const CARD = "#fbf8f1";

/** Ubah warna hex menjadi rgba() dengan alpha tertentu. */
function rgba(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const n = Number.parseInt(h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}

// Ikon badge kecil sesuai ukuran untuk pilihan kanvas.
function UkuranBadge({ u }: { u: Ukuran }) {
  return (
    <svg width={34} height={34} viewBox="0 0 100 100" aria-hidden="true">
      <rect x={2} y={2} width={96} height={96} rx={18} fill="#0f3d3a" />
      <rect x={2} y={2} width={96} height={96} rx={18} fill="none" stroke={GOLD} strokeWidth={5} />
      <rect x={30} y={34} width={40} height={32} rx={3} fill="#e9dcb6" />
      <rect x={34} y={38} width={32} height={24} rx={3} fill={GOLD} />
      <circle cx={50} cy={74} r={8} fill={NAVY} />
      <circle cx={50} cy={74} r={3} fill={GOLD} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Poster siap pakai — copy penjualan langsung, bukan editor.
// ---------------------------------------------------------------------------
type Motif = "koin" | "brankas" | "tas" | "grafik" | "spark";

type Poster = {
  id: string;
  label: string;
  /** Seruan singkat di badge (pancing perhatian). */
  hook: string;
  /** Judul besar. */
  judul: string;
  /** Kalimat penjelas. */
  sub: string;
  /** Poin manfaat (maks 2 baris). */
  manfaat: string[];
  cta: string;
  peringatan: string;
  /** Warna aksen khas poster ini. */
  accent: string;
  /** Ilustrasi samar di sudut kanan bawah. */
  motif: Motif;
};

const POSTER: Poster[] = [
  {
    id: "tunai",
    label: "Pinjaman Tunai",
    hook: "BUTUH DANA HARI INI?",
    judul: "Dana Cepat, Tanpa Ribet",
    sub: "Ajukan dari HP, keputusan jelas, dana langsung dipakai untuk usaha & kebutuhan.",
    manfaat: ["Tenor 7–30 hari, bebas pilih", "Bunga flat 30% — transparan"],
    cta: "Ajukan Sekarang",
    peringatan: "PINDAI · bunga flat 30% dari pokok",
    accent: "#c8892b",
    motif: "koin",
  },
  {
    id: "gadai",
    label: "Gadai Barang",
    hook: "PUNYA BARANG BERHARGA?",
    judul: "Ubah Barang Jadi Dana",
    sub: "Ditaksir transparan dan disimpan aman di brankas PINDAI. Barang, jaminan, selesai.",
    manfaat: ["LTV hingga 70% dari taksiran", "Barang aman di brankas PINDAI"],
    cta: "Taksir Barang",
    peringatan: "PINDAI · LTV hingga 70%",
    accent: "#b0642f",
    motif: "brankas",
  },
  {
    id: "kredit",
    label: "Kredit Barang",
    hook: "MAU BAWA PULANG SEKARANG?",
    judul: "Bawa Pulang, Cicil Ringan",
    sub: "Elektronik & kebutuhan rumah dengan cicilan yang ringan tiap bulan.",
    manfaat: ["DP 0% — langsung dibiayai", "Tenor 1 / 3 / 6 bulan"],
    cta: "Mulai Cicil",
    peringatan: "PINDAI · DP 0% · tenor 1/3/6 bulan",
    accent: "#2f7d8c",
    motif: "tas",
  },
  {
    id: "disiplin",
    label: "Plafon Naik",
    hook: "MAU BATAS LEBIH TINGGI?",
    judul: "Bayar Tepat Waktu, Plafon Naik",
    sub: "Riwayat pembayaran yang baik menaikkan batas pinjaman Anda berikutnya.",
    manfaat: ["Naik bertahap tiap pelunasan tepat waktu", "Catatan transparan di aplikasi"],
    cta: "Cek Plafon Saya",
    peringatan: "PINDAI · plafon naik bertahap",
    accent: "#7c3357",
    motif: "grafik",
  },
  {
    id: "brand",
    label: "Kenalan PINDAI",
    hook: "SATU APLIKASI, SEMUA DANA",
    judul: "Pinjam & Gadai Digital",
    sub: "Pinjaman tunai, gadai barang, dan kredit barang dalam satu ruang yang aman.",
    manfaat: ["Proses digital & akad tercatat", "Brankas & dokumen terverifikasi"],
    cta: "Pelajari Layanan",
    peringatan: "PINDAI · pinjam & gadai digital",
    accent: "#1f7a5c",
    motif: "spark",
  },
];

// ---------------------------------------------------------------------------
// Kode QRIS: admin mengunggah gambar QRIS di pengaturan, poster menampilkannya.
// ---------------------------------------------------------------------------
type Qris = { img: HTMLImageElement; nama: string };

/**
 * Muat gambar (mis. QRIS) lewat blob URL agar kanvas tidak ter-taint aturan CORS,
 * sehingga poster tetap bisa diekspor ke PNG lewat `toDataURL`.
 */
async function muatGambar(url: string): Promise<HTMLImageElement | null> {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const img = await new Promise<HTMLImageElement | null>((resolve) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => resolve(null);
      el.src = objUrl;
    });
    URL.revokeObjectURL(objUrl);
    return img;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Primitif gambar.
// ---------------------------------------------------------------------------
function bulat(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
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

function bungkus(ctx: CanvasRenderingContext2D, teks: string, maxWidth: number): string[] {
  const kata = teks.split(" ");
  let baris = "";
  const hasil: string[] = [];
  for (const k of kata) {
    const coba = baris ? `${baris} ${k}` : k;
    if (ctx.measureText(coba).width > maxWidth && baris) {
      hasil.push(baris);
      baris = k;
    } else {
      baris = coba;
    }
  }
  if (baris) hasil.push(baris);
  return hasil;
}

/** Logo brangkas PINDAI: pintu brankas + dial + tuas. */
function gambarBrangkas(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  body: string = NAVY,
  aksen: string = GOLD,
) {
  const r = s * 0.24;
  // Badan brankas.
  bulat(ctx, x, y, s, s, r);
  ctx.fillStyle = body;
  ctx.fill();
  ctx.strokeStyle = aksen;
  ctx.lineWidth = Math.max(2, s * 0.05);
  ctx.stroke();

  // Bingkai pintu dalam.
  const inset = s * 0.13;
  bulat(ctx, x + inset, y + inset, s - 2 * inset, s - 2 * inset, r * 0.75);
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = Math.max(1.5, s * 0.014);
  ctx.stroke();

  // Dial.
  const cx = x + s / 2;
  const cy = y + s / 2;
  const R = s * 0.27;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = aksen;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.6, 0, Math.PI * 2);
  ctx.fillStyle = body;
  ctx.fill();

  // Jari-jari dial.
  ctx.strokeStyle = aksen;
  ctx.lineWidth = Math.max(2, s * 0.035);
  ctx.lineCap = "round";
  for (let i = 0; i < 3; i += 1) {
    const a = -Math.PI / 2 + i * ((2 * Math.PI) / 3);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * R * 0.92, cy + Math.sin(a) * R * 0.92);
    ctx.stroke();
  }

  // Tuas di sisi kanan.
  ctx.fillStyle = aksen;
  bulat(ctx, x + s * 0.82, y + s * 0.36, s * 0.14, s * 0.28, s * 0.05);
  ctx.fill();
}

/** Ilustrasi samar khas tiap poster (watermark sudut). */
function gambarMotif(
  ctx: CanvasRenderingContext2D,
  jenis: Motif,
  cx: number,
  cy: number,
  s: number,
  warna: string,
) {
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  if (jenis === "koin") {
    const rw = s * 0.5;
    const rh = s * 0.16;
    for (let i = 0; i < 3; i += 1) {
      const yy = cy + s * 0.24 - i * s * 0.22;
      ctx.beginPath();
      ctx.ellipse(cx, yy, rw, rh, 0, 0, Math.PI * 2);
      ctx.fillStyle = warna;
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx, yy, rw * 0.62, rh * 0.62, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
    }
  } else if (jenis === "brankas") {
    gambarBrangkas(ctx, cx - s / 2, cy - s / 2, s, warna, "#ffffff");
  } else if (jenis === "tas") {
    const w = s * 0.8;
    const h = s * 0.66;
    const x = cx - w / 2;
    const y = cy - h / 2 + s * 0.08;
    bulat(ctx, x, y, w, h, s * 0.11);
    ctx.fillStyle = warna;
    ctx.fill();
    ctx.lineWidth = s * 0.055;
    ctx.strokeStyle = warna;
    ctx.beginPath();
    ctx.arc(cx, y, w * 0.3, Math.PI, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    bulat(ctx, cx - w * 0.12, y + h * 0.34, w * 0.24, h * 0.13, s * 0.03);
    ctx.fill();
  } else if (jenis === "grafik") {
    const bars = [0.42, 0.62, 0.84, 1.08];
    const bw = s * 0.16;
    const gapB = s * 0.08;
    const total = bars.length * bw + (bars.length - 1) * gapB;
    let x = cx - total / 2;
    const base = cy + s * 0.42;
    for (const bh of bars) {
      const hh = s * 0.72 * bh;
      bulat(ctx, x, base - hh, bw, hh, bw * 0.4);
      ctx.fillStyle = warna;
      ctx.fill();
      x += bw + gapB;
    }
    ctx.strokeStyle = warna;
    ctx.lineWidth = s * 0.06;
    ctx.beginPath();
    ctx.moveTo(cx - total / 2 - s * 0.05, base + s * 0.03);
    ctx.lineTo(cx + total / 2 - bw * 0.4, base + s * 0.03);
    ctx.stroke();
  } else {
    // spark — bintang empat sudut + titik kecil.
    const r = s * 0.5;
    ctx.fillStyle = warna;
    ctx.beginPath();
    for (let i = 0; i < 16; i += 1) {
      const a = (i * Math.PI) / 8;
      const rr = i % 2 === 0 ? r : r * 0.32;
      const px = cx + Math.cos(a) * rr;
      const py = cy + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + r * 0.95, cy - r * 0.85, r * 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx - r * 0.9, cy + r * 0.8, r * 0.1, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Render poster ke Canvas 2D. Posisi & ukuran huruf diturunkan dari lebar/tinggi
// kanvas sehingga proporsional di keempat ukuran.
// ---------------------------------------------------------------------------
function renderKartu(
  ctx: CanvasRenderingContext2D,
  p: Poster,
  size: Ukuran,
  qris: Qris | null,
) {
  const W = size.canvas[0];
  const H = size.canvas[1];
  const sans = "ui-sans-serif, system-ui, sans-serif";
  const accent = p.accent;

  // ===== Latar hijau pekat + pendar aksen poster =====
  ctx.fillStyle = NAVY_DEEP;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W * 0.78, H * 0.05, 0, W * 0.78, H * 0.05, W * 1.1);
  glow.addColorStop(0, rgba(accent, 0.45));
  glow.addColorStop(0.45, rgba(accent, 0.14));
  glow.addColorStop(1, rgba(accent, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const glow2 = ctx.createRadialGradient(W * 0.08, H * 0.98, 0, W * 0.08, H * 0.98, W * 0.95);
  glow2.addColorStop(0, "rgba(224,182,77,0.16)");
  glow2.addColorStop(1, "rgba(224,182,77,0)");
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, W, H);

  // Cincin brankas samar sebagai tekstur.
  ctx.strokeStyle = rgba(accent, 0.14);
  ctx.lineWidth = Math.max(2, W * 0.0035);
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath();
    ctx.arc(W * 0.92, H * 0.1, W * (0.15 + i * 0.12), 0, Math.PI * 2);
    ctx.stroke();
  }

  // Konfeti aksen kecil (ringan, tidak ramai).
  const konfeti: Array<[number, number, number]> = [
    [W * 0.08, H * 0.04, W * 0.006],
    [W * 0.94, H * 0.5, W * 0.007],
    [W * 0.12, H * 0.96, W * 0.005],
    [W * 0.6, H * 0.018, W * 0.004],
  ];
  ctx.fillStyle = rgba(accent, 0.55);
  for (const [cx, cy, r] of konfeti) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // ===== Kartu krem utama =====
  const M = Math.round(W * 0.05);
  const CW = W - M * 2;
  const CH = H - M * 2;
  const radiusKartu = Math.round(W * 0.045);
  const P = Math.round(W * 0.062);
  const innerX = M + P;
  const innerW = W - innerX * 2;

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.4)";
  ctx.shadowBlur = Math.round(W * 0.05);
  ctx.shadowOffsetY = Math.round(W * 0.013);
  bulat(ctx, M, M, CW, CH, radiusKartu);
  ctx.fillStyle = CARD;
  ctx.fill();
  ctx.restore();

  // Watermark motif di sudut kanan bawah, diklip ke bentuk kartu.
  ctx.save();
  bulat(ctx, M, M, CW, CH, radiusKartu);
  ctx.clip();
  ctx.globalAlpha = 0.1;
  gambarMotif(
    ctx,
    p.motif,
    M + CW * 0.85,
    M + CH * 0.9,
    Math.round(W * 0.52),
    accent,
  );
  ctx.restore();

  // ===== Header brand =====
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  const logo = Math.round(Math.min(innerW * 0.12, H * 0.072));
  gambarBrangkas(ctx, innerX, M + P, logo, NAVY, GOLD);
  const tx = innerX + logo + Math.round(logo * 0.32);
  ctx.fillStyle = INK;
  ctx.font = `800 ${Math.round(logo * 0.56)}px ${sans}`;
  ctx.fillText("PINDAI", tx, M + P + logo * 0.05);
  ctx.fillStyle = accent;
  ctx.font = `800 ${Math.round(logo * 0.225)}px ${sans}`;
  ctx.fillText("PINJAM & GADAI DIGITAL", tx, M + P + logo * 0.66);

  // Chip kategori di kanan atas.
  const chipFont = Math.round(Math.min(W * 0.022, H * 0.014));
  ctx.font = `800 ${chipFont}px ${sans}`;
  ctx.textAlign = "right";
  const chipText = p.label.toUpperCase();
  const chipW = ctx.measureText(chipText).width + chipFont * 1.7;
  const chipH = Math.round(chipFont * 2.1);
  const chipX = M + CW - P - chipW;
  const chipY = M + P + Math.round((logo - chipH) / 2);
  bulat(ctx, chipX, chipY, chipW, chipH, chipH / 2);
  ctx.fillStyle = rgba(accent, 0.14);
  ctx.fill();
  ctx.strokeStyle = rgba(accent, 0.5);
  ctx.lineWidth = Math.max(1.5, W * 0.0022);
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.textBaseline = "middle";
  ctx.fillText(chipText, M + CW - P - chipFont * 0.85, chipY + chipH / 2 + 1);
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  // Garis pemisah halus + posisi awal konten.
  let y = M + P + logo + Math.round(H * 0.032);
  ctx.strokeStyle = "rgba(19,58,52,0.12)";
  ctx.lineWidth = Math.max(1.5, W * 0.002);
  ctx.beginPath();
  ctx.moveTo(innerX, y);
  ctx.lineTo(innerX + innerW, y);
  ctx.stroke();
  y += Math.round(H * 0.03);

  // ===== Badge hook (stiker aksen) =====
  const hookFont = Math.round(Math.min(W * 0.03, H * 0.019));
  ctx.font = `800 ${hookFont}px ${sans}`;
  const hookPadX = Math.round(hookFont * 1.35);
  const hookW = Math.min(innerW, ctx.measureText(p.hook).width + hookPadX * 2);
  const hookH = Math.round(hookFont * 2.3);
  ctx.save();
  ctx.shadowColor = rgba(accent, 0.35);
  ctx.shadowBlur = Math.round(W * 0.02);
  ctx.shadowOffsetY = Math.round(W * 0.004);
  bulat(ctx, innerX, y, hookW, hookH, hookH / 2);
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "middle";
  ctx.fillText(p.hook, innerX + hookPadX, y + hookH / 2 + 1);
  ctx.textBaseline = "top";
  y += hookH + Math.round(H * 0.036);

  // ===== Judul besar =====
  const headSize = Math.round(Math.min(W * 0.105, H * 0.062));
  ctx.fillStyle = INK;
  ctx.font = `800 ${headSize}px ${sans}`;
  for (const baris of bungkus(ctx, p.judul, innerW)) {
    ctx.fillText(baris, innerX, y);
    y += Math.round(headSize * 1.02);
  }

  // Aksen swipe di bawah judul.
  y += Math.round(headSize * 0.14);
  const swipeH = Math.round(headSize * 0.13);
  const swipeW = Math.round(Math.min(innerW * 0.42, headSize * 3.2));
  bulat(ctx, innerX, y, swipeW, swipeH, swipeH / 2);
  ctx.fillStyle = accent;
  ctx.fill();
  y += swipeH + Math.round(H * 0.026);

  // ===== Subjudul =====
  const subSize = Math.round(Math.min(W * 0.03, H * 0.021));
  ctx.fillStyle = MUTED;
  ctx.font = `400 ${subSize}px ${sans}`;
  for (const baris of bungkus(ctx, p.sub, innerW)) {
    ctx.fillText(baris, innerX, y);
    y += Math.round(subSize * 1.42);
  }

  // ===== Poin manfaat: baris lembut =====
  y += Math.round(H * 0.026);
  const bFont = Math.round(Math.min(W * 0.029, H * 0.02));
  const lineH = Math.round(bFont * 1.35);
  const iconR = bFont * 0.72;
  const rowPadX = Math.round(bFont * 0.7);
  const rowPadY = Math.round(bFont * 0.55);
  const rowGap = Math.round(bFont * 0.5);
  const teksW = Math.max(80, innerW - Math.round(iconR * 2) - rowPadX * 2 - Math.round(bFont * 0.35));
  for (const m of p.manfaat) {
    ctx.font = `600 ${bFont}px ${sans}`;
    const baris = bungkus(ctx, m, teksW);
    const rowH = Math.max(Math.round(iconR * 2 + rowPadY * 2), baris.length * lineH + rowPadY * 2);

    bulat(ctx, innerX, y, innerW, rowH, Math.round(rowH * 0.28));
    ctx.fillStyle = rgba(accent, 0.1);
    ctx.fill();
    ctx.strokeStyle = rgba(accent, 0.28);
    ctx.lineWidth = Math.max(1.5, W * 0.002);
    ctx.stroke();

    const cx = innerX + rowPadX + iconR;
    const cy = y + rowH / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, iconR, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = Math.max(2, bFont * 0.17);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx - iconR * 0.42, cy);
    ctx.lineTo(cx - iconR * 0.08, cy + iconR * 0.34);
    ctx.lineTo(cx + iconR * 0.46, cy - iconR * 0.38);
    ctx.stroke();

    ctx.fillStyle = INK;
    ctx.font = `600 ${bFont}px ${sans}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    let ly = y + rowH / 2;
    const teksX = innerX + rowPadX + iconR * 2 + Math.round(bFont * 0.35);
    for (const baris_ of baris) {
      ctx.fillText(baris_, teksX, ly);
      ly += lineH;
    }
    ctx.textBaseline = "top";
    y += rowH + rowGap;
  }

  // ===== Blok bawah: QRIS + CTA + disclaimer (digantung dari dasar kartu) =====
  const cardBottom = M + CH;
  const footSize = Math.round(Math.min(W * 0.023, H * 0.016));
  const footBaseline = cardBottom - P * 0.5;
  const ctaH = Math.round(Math.min(W * 0.096, H * 0.066));
  const ctaFont = Math.round(ctaH * 0.4);
  const gap = Math.round(W * 0.028);
  const ctaBottom = footBaseline - Math.round(footSize * 1.7);
  const ctaTop = ctaBottom - ctaH;

  const pakaiQris = Boolean(qris?.img);
  const qrSide = pakaiQris ? Math.round(Math.min(W * 0.2, H * 0.128, ctaH * 2.1)) : 0;
  const colX = pakaiQris ? innerX + qrSide + gap : innerX;
  const colW = Math.max(120, innerX + innerW - colX);

  if (pakaiQris && qris) {
    const qrY = ctaTop + Math.round((ctaH - qrSide) / 2);
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.3)";
    ctx.shadowBlur = Math.round(W * 0.018);
    ctx.shadowOffsetY = Math.round(W * 0.005);
    bulat(ctx, innerX, qrY, qrSide, qrSide, qrSide * 0.16);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.restore();

    // Quiet zone agar kode tetap mudah dipindai.
    const inset = Math.round(qrSide * 0.11);
    ctx.drawImage(qris.img, innerX + inset, qrY + inset, qrSide - inset * 2, qrSide - inset * 2);

    const labelSize = Math.round(Math.min(W * 0.024, H * 0.017));
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = accent;
    ctx.font = `800 ${labelSize}px ${sans}`;
    ctx.fillText("SCAN QRIS UNTUK BAYAR", colX, ctaTop - Math.round(labelSize * 0.5));
    ctx.textBaseline = "top";
  }

  // Tombol CTA.
  ctx.font = `800 ${ctaFont}px ${sans}`;
  const ctaText = `${p.cta}  →`;
  const ctaW = Math.min(colW, ctx.measureText(ctaText).width + ctaH * 1.2);
  const ctaX = pakaiQris ? colX : innerX;
  const ctaY = ctaTop;

  ctx.save();
  ctx.shadowColor = rgba(accent, 0.4);
  ctx.shadowBlur = Math.round(W * 0.03);
  ctx.shadowOffsetY = Math.round(W * 0.006);
  bulat(ctx, ctaX, ctaY, ctaW, ctaH, ctaH * 0.32);
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(ctaText, ctaX + ctaW / 2, ctaY + ctaH / 2 + 1);

  // Nama merchant QRIS di bawah tombol (bila kode tampil).
  if (pakaiQris && qris) {
    const nameSize = Math.round(Math.min(W * 0.021, H * 0.014));
    ctx.fillStyle = MUTED;
    ctx.font = `600 ${nameSize}px ${sans}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const nama = (qris.nama.trim() || "PINDAI").toUpperCase();
    ctx.fillText(nama, colX, ctaBottom + (footBaseline - ctaBottom) / 2);
  }

  // Disclaimer.
  ctx.fillStyle = "rgba(95,111,106,0.9)";
  ctx.font = `600 ${footSize}px ${sans}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(p.peringatan, M + CW / 2, footBaseline);
}

function unduhCanvas(canvas: HTMLCanvasElement, nama: string) {
  const url = canvas.toDataURL("image/png");
  const link = document.createElement("a");
  link.download = nama;
  link.href = url;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function canvasKeFile(canvas: HTMLCanvasElement, nama: string): Promise<File | null> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob ? new File([blob], nama, { type: "image/png" }) : null),
      "image/png",
    );
  });
}

async function bagikanPoster(canvas: HTMLCanvasElement, p: Poster, size: Ukuran) {
  const nama = `pindai-${p.id}-${size.id}.png`;
  const teks = `${p.judul}\n\n${p.sub}\n\n${p.manfaat.join("\n")}\n\n${p.peringatan}`;
  const tautan = typeof window !== "undefined" ? window.location.href : "";
  const file = await canvasKeFile(canvas, nama);

  if (navigator.share) {
    try {
      await navigator.share({
        title: p.judul,
        text: teks,
        url: tautan,
        ...(file ? { files: [file] } : {}),
      });
      return;
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
    }
  }

  try {
    await navigator.clipboard.writeText(teks);
  } catch {
    // Clipboard ditolak — tetap lanjut ke WhatsApp.
  }
  window.open(
    `https://wa.me/?text=${encodeURIComponent(`${p.judul} — ${teks}`)}`,
    "_blank",
  );
}

/** Satu poster siap pakai: kanvas + aksi unduh/bagikan. */
function PosterCard({
  poster,
  ukuran,
  qris,
}: {
  poster: Poster;
  ukuran: Ukuran;
  qris: Qris | null;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.width = ukuran.canvas[0];
    canvas.height = ukuran.canvas[1];
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    renderKartu(ctx, poster, ukuran, qris);
  }, [poster, ukuran, qris]);

  const namaBerkas = `pindai-${poster.id}-${ukuran.id}.png`;

  return (
    <figure className="flex flex-col overflow-hidden rounded-3xl border border-[#e7e2d4] bg-white shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between gap-2 border-b border-[#efe9db] px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold tracking-tight text-[#0f3d3a]">{poster.label}</p>
          <p className="text-[11px] font-mono text-[#5c6b66]">
            {ukuran.canvas[0]}×{ukuran.canvas[1]} · {ukuran.ratioLabel}
          </p>
        </div>
        <span
          className="flex size-8 items-center justify-center rounded-lg p-1"
          style={{ backgroundColor: rgba(poster.accent, 0.16) }}
        >
          <UkuranBadge u={ukuran} />
        </span>
      </div>
      <div className="flex flex-1 items-center justify-center bg-[#0a2624] p-4">
        <canvas
          ref={ref}
          className="block w-full rounded-xl object-contain shadow-lg"
          style={{ aspectRatio: `${ukuran.canvas[0]} / ${ukuran.canvas[1]}` }}
        />
      </div>
      <figcaption className="flex flex-wrap gap-2 border-t border-[#efe9db] px-4 py-3">
        <Button
          size="sm"
          className="gap-2"
          onClick={() => {
            const canvas = ref.current;
            if (canvas) unduhCanvas(canvas, namaBerkas);
          }}
        >
          <Download className="size-4" aria-hidden="true" />
          Unduh PNG
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="gap-2"
          onClick={() => {
            const canvas = ref.current;
            if (canvas) void bagikanPoster(canvas, poster, ukuran);
          }}
        >
          <Share2 className="size-4" aria-hidden="true" />
          Bagikan
        </Button>
      </figcaption>
    </figure>
  );
}

export function Promo() {
  const [sizeId, setSizeId] = useState<string>("stories");
  const ukuran = UKURAN.find((u) => u.id === sizeId) ?? UKURAN[0];

  // QRIS merchant berasal dari pengaturan admin — poster menampilkan kode asli.
  const instructions = useQuery(api.system.getPaymentInstructions);
  const qrisUrl = instructions?.qrisUrl ?? null;
  const namaMerchant = instructions?.namaMerchantQris ?? "PINDAI";
  const [qrisImg, setQrisImg] = useState<HTMLImageElement | null>(null);
  const [qrisGagal, setQrisGagal] = useState(false);
  const [sertakanQris, setSertakanQris] = useState(true);

  useEffect(() => {
    let batal = false;
    setQrisGagal(false);
    if (!qrisUrl) {
      setQrisImg(null);
      return;
    }
    void (async () => {
      const img = await muatGambar(qrisUrl);
      if (batal) return;
      setQrisImg(img);
      setQrisGagal(img === null);
    })();
    return () => {
      batal = true;
    };
  }, [qrisUrl]);

  const qris = useMemo<Qris | null>(
    () => (sertakanQris && qrisImg ? { img: qrisImg, nama: namaMerchant } : null),
    [sertakanQris, qrisImg, namaMerchant],
  );

  return (
    <main className="min-h-screen bg-[#fdfbf7] text-[#17322e] sm:p-6">
      <div className="mx-auto max-w-7xl space-y-8">
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-[#0f3d3a] text-sm font-bold text-[#f7f4ec]">
              P
            </span>
            <div>
              <p className="text-sm font-bold tracking-tight text-[#0f3d3a]">PINDAI</p>
              <p className="text-[11px] font-medium tracking-[0.12em] text-[#5c6b66]">
                Poster Siap Pakai
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/">
                <X className="mr-2 size-4" aria-hidden="true" />
                Batal
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/dashboard">
                <Check className="mr-2 size-4" aria-hidden="true" />
                Kembali ke Ruang
              </Link>
            </Button>
          </div>
        </header>

        {/* Intro + pemilih ukuran */}
        <section className="overflow-hidden rounded-3xl border border-[#d9d2c3] bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9c7b3a]">
                <Sparkles className="size-3.5" aria-hidden="true" />
                Materi promosi final
              </p>
              <h1 className="mt-2 text-xl font-bold tracking-tight text-[#0f3d3a] sm:text-2xl">
                Poster siap dibagikan
              </h1>
              <p className="mt-2 text-sm leading-6 text-[#5c6b66]">
                Kartu krem bersih dengan warna aksen & ilustrasi berbeda tiap tema, ditata di atas
                latar brankas PINDAI. Tinggal pilih ukuran, unduh PNG, lalu unggah ke Instagram,
                WhatsApp, atau status — kode QRIS tampil otomatis bila admin sudah mengunggahnya.
                Tidak ada yang perlu diedit.
              </p>
            </div>
            <div className="w-full sm:w-auto">
              <p className="mb-1.5 text-xs font-medium text-[#5c6b66]">Ukuran kanvas</p>
              <Select value={sizeId} onValueChange={setSizeId}>
                <SelectTrigger className="w-full sm:min-w-[220px]" aria-label="Ukuran kanvas">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UKURAN.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      <span className="flex items-center gap-2">
                        <span className="block size-6 rounded-lg bg-white p-1 shadow-sm">
                          <UkuranBadge u={u} />
                        </span>
                        {u.label}
                        <span className="ml-auto font-mono text-[11px] text-[#5c6b66]">
                          {u.ratioLabel}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        {/* Status QRIS + opsi tampil di poster */}
        <section className="overflow-hidden rounded-3xl border border-[#d9d2c3] bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#0f3d3a] text-[#e0b64d]">
                <QrCode className="size-5" aria-hidden="true" />
              </span>
              <div className="max-w-2xl">
                <p className="text-sm font-bold tracking-tight text-[#0f3d3a]">
                  Bayar via QRIS di poster
                </p>
                {instructions === undefined ? (
                  <p className="mt-1 flex items-center gap-1.5 text-sm leading-6 text-[#5c6b66]">
                    <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> Memuat kode
                    QRIS merchant…
                  </p>
                ) : (
                  <p className="mt-1 text-sm leading-6 text-[#5c6b66]">
                    {qrisUrl && qrisImg
                      ? `Kode QRIS merchant ${namaMerchant} tampil di setiap poster agar calon nasabah bisa langsung memindai dan membayar.`
                      : "QRIS belum siap — poster tampil tanpa kode QRIS."}
                  </p>
                )}
                {qrisUrl && qrisGagal && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-700">
                    <AlertTriangle className="size-3.5" aria-hidden="true" /> Kode QRIS gagal dimuat.
                    Muat ulang halaman untuk mencoba lagi.
                  </p>
                )}
                {instructions !== undefined && !qrisUrl && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-700">
                    <AlertTriangle className="size-3.5" aria-hidden="true" /> Unggah gambar QRIS di
                    Pengaturan admin agar kode muncul di poster.
                  </p>
                )}
              </div>
            </div>
            {qrisUrl && (
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-[#0f3d3a]">
                <input
                  type="checkbox"
                  className="size-4 accent-[#0f3d3a]"
                  checked={sertakanQris}
                  onChange={(e) => setSertakanQris(e.target.checked)}
                />
                Sertakan QRIS
              </label>
            )}
          </div>
        </section>

        {/* Galeri poster */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <ImageIcon className="size-3.5 text-[#9c7b3a]" aria-hidden="true" />
            <h2 className="text-lg font-bold tracking-tight text-[#0f3d3a]">
              Galeri poster ({POSTER.length})
            </h2>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {POSTER.map((p) => (
              <PosterCard key={p.id} poster={p} ukuran={ukuran} qris={qris} />
            ))}
          </div>
        </section>

        {/* Referensi ukuran */}
        <section className="rounded-3xl border border-[#d9d2c3] bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <ImageIcon className="size-3.5 text-[#9c7b3a]" aria-hidden="true" />
            <h2 className="text-lg font-bold tracking-tight text-[#0f3d3a]">
              Ukuran &amp; rasio target
            </h2>
          </div>
          <p className="mt-1 text-sm text-[#5c6b66]">
            Setiap ukuran sudah mengisi konten agar rapi di perangkat tujuan. Ubah ukuran di
            atas untuk menyiapkan seluruh galeri sekaligus.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {UKURAN.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => setSizeId(u.id)}
                className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors ${
                  u.id === sizeId
                    ? "border-[#9c7b3a] bg-[#faf8f3]"
                    : "border-[#e7e2d4] bg-white hover:bg-[#faf8f3]"
                }`}
                aria-pressed={u.id === sizeId}
              >
                <span className="flex size-11 items-center justify-center rounded-xl bg-white p-2 text-[#0f3d3a] shadow-sm">
                  <UkuranBadge u={u} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[#0f3d3a]">{u.label}</p>
                  <p className="font-mono text-[11px] text-[#5c6b66]">{u.ratioLabel}</p>
                </div>
                <span className="ml-auto text-[11px] text-[#5c6b66]">
                  {u.canvas[0]}×{u.canvas[1]}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="pb-4 text-center text-xs text-muted-foreground">
          Poster PINDAI · ruang penyedia dana. Unggah apa adanya — pastikan angka dan klaim sesuai
          kebijakan resmi sebelum dipublikasikan.
        </footer>
      </div>
    </main>
  );
}
