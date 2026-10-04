import { useMemo, useState } from "react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Check, Download, ExternalLink, Image as ImageIcon, Share2, Type, X } from "lucide-react";

// ---------------------------------------------------------------------------
// Ukuran kanvas kasus sosial media (content-safe area di sekitar batas).
// `content` adalah area teks aman yang terekomisi gambar teks; `canvas`
// mencakup badge/padding ekstra agar rapi saat dibuka di perangkat tujuan.
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

// Palet tinta & kuningan yang selaras admin panel.
const NAVY = "#0f3d3a";
const GOLD = "#9c7b3a";
const GOLD_DEEP = "#7a5f2b";
const GOLD_LIGHT = "#e9dcb6";
const PAPER = "#fdfbf7";
const INK = "#17322e";
const MUTED = "#5c6b66";
const WARN_BG = "#f4ecd9";
const WARN_EDGE = "#d8c38a";
const WARN_TEXT = "#8a6d1a";

// Ikon badge kecil sesuai ukuran untuk pilihan kanvas.
function UkuranBadge({ u }: { u: Ukuran }) {
  return (
    <svg width={34} height={34} viewBox="0 0 100 100" aria-hidden="true">
      <rect x={2} y={2} width={96} height={96} rx={18} fill="#0f3d3a" />
      <rect x={2} y={2} width={96} height={96} rx={18} fill="none" stroke={GOLD} strokeWidth={5} />
      <rect x={30} y={34} width={40} height={32} rx={3} fill={GOLD_LIGHT} />
      <rect x={34} y={38} width={32} height={24} rx={3} fill={GOLD} />
      <circle cx={50} cy={74} r={8} fill={NAVY} />
      <circle cx={50} cy={74} r={3} fill={GOLD} />
    </svg>
  );
}

// Template editor fields.
type Field = {
  id: keyof Template;
  label: string;
  placeholder: string;
};

const FIELDS: Field[] = [
  { id: "title", label: "Judul", placeholder: "e.g. Dana Pinjaman Cepat & Pasti" },
  { id: "subtitle", label: "Subjudul", placeholder: "e.g. Dana pinjaman untuk kebutuhan operasional" },
  { id: "peringatan", label: "Peringatan", placeholder: "e.g. Dana akan diproses dalam 1×24 jam" },
  { id: "cta", label: "Tindakan", placeholder: "e.g. Ajukan pinjaman" },
  { id: "link", label: "Link", placeholder: "https://milikmu.id/pinjam" },
];

type Template = {
  title: string;
  subtitle: string;
  peringatan: string;
  cta: string;
  link: string;
  sizeId: string;
};

const DEFAULT_TEMPLATE: Template = {
  title: "Kredit Barang Aman, Cepat Diproses",
  subtitle: "Dana pinjaman untuk kebutuhan harian & usaha. Verifikasi dokumen dilakukan otomatis, angka real-time.",
  peringatan: "Bunga 30% / tahun · 1×24 jam tersalurkan · PINDAI",
  cta: "Ajukan Sekarang",
  link: "https://milikmu.id/pinjam",
  sizeId: "stories",
};

// Render kartu promosi mentah ke Canvas 2D. Semua posisi dihitung dari `size`
// dan `t`, sehinggapreview 1 juta / 30% hanya mengubah field editor.
function renderKartu(ctx: CanvasRenderingContext2D, t: Template, size: Ukuran) {
  const canvas = ctx.canvas;
  const dx = size.canvas[0] * 0.055;

  // Latar + tepi atas.
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = NAVY;
  ctx.fillRect(0, 0, canvas.width, 16);
  ctx.fillStyle = GOLD;
  ctx.fillRect(0, 16, canvas.width, 4);

  // Tepi kiri dekorasi bermata emas (synchronous, tersenyawa utuh saat preview pertama kali render).
  for (let i = 0; i < 2; i += 1) {
    const y = 22 + i * 40;
    const s = 46 + i * 34;
    const d = document.createElement("canvas");
    d.width = s;
    d.height = s;
    const g = d.getContext("2d")!;
    g.clearRect(0, 0, s, s);
    g.beginPath();
    g.moveTo(0, s * 0.58);
    g.lineTo(s * 0.33, s * 0.30);
    g.lineTo(s * 0.66, s * 0.94);
    g.closePath();
    const grad = g.createLinearGradient(0, 0, s, s);
    grad.addColorStop(0, GOLD);
    grad.addColorStop(1, GOLD_DEEP);
    g.fillStyle = grad;
    g.fill();
    // Gambar ikon ke konteks utama sebelum teks ditarik, jadi preview selalu punya dua emas.
    ctx.drawImage(d, dx + i * 52, y - 2);
  }

  // Tikar teks (garis sebelum judul).
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 3;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(dx - 6, 84);
  ctx.lineTo(dx - 6 + canvas.width - (dx - 6) * 2, 84);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(dx - 6, 88);
  ctx.lineTo(dx - 6 + canvas.width - (dx - 6) * 2, 88);
  ctx.stroke();

  const wrap = (text: string, maxWidth: number): string[] => {
    const words = text.split(" ");
    let line = "";
    const lines: string[] = [];
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  };

  // Judul.
  ctx.fillStyle = NAVY;
  ctx.font = `700 ${Math.round(size.content[0] * 0.1)}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const titleLines = wrap(t.title || "Judul Promosi", size.content[0] * 0.84);
  let ty = 94;
  for (const line of titleLines) {
    ctx.fillText(line, dx + 4, ty);
    ty += Math.round(size.content[0] * 0.088);
  }

  // Subjudul.
  if (t.subtitle) {
    ctx.fillStyle = MUTED;
    ctx.font = `${Math.round(size.content[0] * 0.034)}px ui-sans-serif, system-ui, sans-serif`;
    const subLines = wrap(t.subtitle, size.content[0] * 0.72);
    let sy = ty + Math.round(size.content[0] * 0.03);
    for (const line of subLines) {
      ctx.fillText(line, dx + 4, sy);
      sy += Math.round(size.content[0] * 0.042);
    }
  }

  // Peringatan.
  if (t.peringatan) {
    const warnW = Math.min(size.canvas[0] * 0.86, 720);
    const warnX = (canvas.width - warnW) / 2;
    const warnH = 30;
    const warnY = 92;
    ctx.fillStyle = WARN_BG;
    ctx.fillRect(warnX - 4, warnY - 10, warnW + 8, warnH);
    ctx.strokeStyle = WARN_EDGE;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(warnX - 4, warnY - 10, warnW + 8, warnH);
    ctx.fillStyle = WARN_TEXT;
    ctx.font = `700 ${Math.round(size.content[0] * 0.036)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    const warnLines = wrap(t.peringatan, size.canvas[0] * 0.8);
    let wy = warnY + 6;
    for (const line of warnLines) {
      ctx.fillText(line, warnX + 8, wy);
      wy += Math.round(size.content[0] * 0.042);
    }
  }

  // CTA.
  const cta = t.cta || "";
  const link = t.link || "";
  const ctaLines = cta ? wrap(cta, size.content[0] * 0.84) : [];
  let cy = ty;
  if (cta) {
    const buttonW = Math.min(size.content[0] * 0.62, 420);
    const btnH = Math.round(size.content[0] * 0.064);
    const bx = (canvas.width - buttonW) / 2;
    const by = cy;
    ctx.fillStyle = NAVY;
    ctx.fillRect(bx, by, buttonW, btnH);
    ctx.fillStyle = GOLD;
    ctx.fillRect(bx, by, buttonW, btnH / 2);
    ctx.fillStyle = "#f7f4ec";
    ctx.font = `700 ${Math.round(btnH * 0.52)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(cta, bx + buttonW / 2, by + btnH / 2);
    if (link) {
      const linkText = ` · ${link}`;
      ctx.fillStyle = MUTED;
      ctx.font = `${Math.round(btnH * 0.44)}px ui-sans-serif, system-ui, sans-serif`;
      ctx.fillText(linkText, bx, by + btnH / 2 + 1);
    }
  }
}

export function Promo() {
  const [t, setT] = useState<Template>(DEFAULT_TEMPLATE);

  const ukuran = UKURAN.find((u) => u.id === t.sizeId) ?? UKURAN[0];

  // Preview selalu 100% ukuran kanvas. Canvas diRender ulang setiap kali teks
  // atau ukuran pilihan berubah.
  const preview = useMemo(() => {
    const canvasW = ukuran.canvas[0];
    const canvasH = ukuran.canvas[1];
    const c = document.createElement("canvas");
    c.width = canvasW;
    c.height = canvasH;
    const ctx = c.getContext("2d");
    if (!ctx) return null;

    renderKartu(ctx, t, ukuran);
    return c;
  }, [t, ukuran]);

  const exportGambar = () => {
    if (!preview) return;
    const link = document.createElement("a");
    link.download = `promo-${t.sizeId}-${Date.now()}.png`;
    link.href = preview.toDataURL("image/png");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const bagikan = async () => {
    if (!preview) return;
    const title = t.title || "Promo";
    const imageUrl = preview.toDataURL("image/png");
    const url = typeof window !== "undefined" ? window.location.href : "";

    // Bagian teks yang disalin/share.
    const lines: string[] = [title, t.title, t.link].filter(Boolean);
    const shareText = lines.join("\n\n");

    // Prefer native Web Share; fallback ke link open + salin teks.
    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text: shareText,
          url,
          files: [
            new File([imageUrl], `promo-${t.sizeId}-${Date.now()}.png`, {
              type: "image/png",
            }),
          ],
        });
        return;
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          // Lanjut ke fallback (rulang).
        }
      }
    }

    try {
      await navigator.clipboard.writeText(shareText);
    } catch {
      // Clipboard API tidak tersedia / ditolak — lanjut ke link manual saja.
    }

    const whatsapp = `https://wa.me/?text=${encodeURIComponent(`${title} — ${shareText}`)}`;
    const instagram = "https://www.instagram.com";
    const wa = window.open(whatsapp, "_blank");
    if (wa) wa.focus();
  };

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
                Ruang Penyedia Dana
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

        <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
          {/* Editor teks */}
          <section className="rounded-3xl border border-[#d9d2c3] bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Type className="size-3.5 text-[#9c7b3a]" aria-hidden="true" />
              <h2 className="text-lg font-bold tracking-tight text-[#0f3d3a]">Template</h2>
              <span className="rounded-full bg-[#e7e2d4] px-2 py-0.5 text-[11px] font-medium text-[#5c6b66]">
                paling sedang
              </span>
            </div>
            <p className="mt-1 text-xs text-[#5c6b66]">
              Ubah teks di samping; kartu kuning akan merekam ulang secara otomatis.
            </p>
            <div className="mt-4 space-y-4">
              {FIELDS.map((f) => (
                <div key={f.id}>
                  <Label htmlFor={f.id} className="text-xs font-medium text-[#5c6b66]">
                    {f.label}
                  </Label>
                  {f.id === "cta" || f.id === "link" ? (
                    <Input
                      id={f.id}
                      value={t[f.id] as string}
                      onChange={(e) => setT({ ...t, [f.id]: e.target.value })}
                      placeholder={f.placeholder}
                    />
                  ) : (
                    <Textarea
                      id={f.id}
                      value={t[f.id] as string}
                      onChange={(e) => setT({ ...t, [f.id]: e.target.value })}
                      placeholder={f.placeholder}
                      rows={f.id === "peringatan" ? 2 : 3}
                      className="font-mono text-xs"
                    />
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Preview + aksi */}
          <section className="flex flex-col">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold tracking-tight text-[#0f3d3a]">Preview</span>
                <span className="rounded-full bg-[#e7e2d4] px-2 py-0.5 text-[11px] font-medium text-[#5c6b66]">
                  live
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Select value={t.sizeId} onValueChange={(v) => setT({ ...t, sizeId: v })}>
                  <SelectTrigger className="w-auto min-w-[180px]" aria-label="Ukuran kanvas">
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
                          <span className="ml-auto text-[11px] text-[#5c6b66] font-mono">
                            {u.ratioLabel}
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-3 flex flex-1 items-center justify-center rounded-2xl border border-[#d9d2c3] bg-white p-4 shadow-sm">
              <div
                className="relative flex aspect-video w-full max-w-[min(1080px,100%)] items-center justify-center bg-[#fdfbf7]"
                style={{ aspectRatio: `${ukuran.canvas[0]} / ${ukuran.canvas[1]}` }}
              >
                {preview ? (
                  <canvas
                    className="relative aspect-[1080/1920] w-full object-contain"
                    style={{ aspectRatio: `${preview.width} / ${preview.height}` }}
                    width={preview.width}
                    height={preview.height}
                  />
                ) : (
                  <div className="flex flex-col items-center text-sm text-muted-foreground">
                    <ImageIcon className="mb-2 size-8" aria-hidden="true" />
                    Memuat preview kartu…
                  </div>
                )}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="default" className="gap-2" onClick={exportGambar}>
                <Download className="size-4" aria-hidden="true" />
                Unduh PNG
              </Button>
              <Button variant="outline" className="gap-2" onClick={bagikan}>
                <Share2 className="size-4" aria-hidden="true" />
                Bagikan ke WhatsApp / Instagram
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/dashboard">
                  <ExternalLink className="size-4" aria-hidden="true" />
                  Sampai sini
                </Link>
              </Button>
            </div>
          </section>
        </div>

        {/* Referensi ukuran */}
        <section className="rounded-3xl border border-[#d9d2c3] bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <ImageIcon className="size-3.5 text-[#9c7b3a]" aria-hidden="true" />
            <h2 className="text-lg font-bold tracking-tight text-[#0f3d3a]">
              Ukuran &amp; rasio target
            </h2>
          </div>
          <p className="mt-1 text-sm text-[#5c6b66]">
            Setiap ukuran sudah mengisi konten agar rapi di perangkat tujuan. Unduh satu
            gambar sesuai pilihan kanvas.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {UKURAN.map((u) => (
              <div
                key={u.id}
                className="flex items-center gap-3 rounded-2xl border border-[#e7e2d4] bg-[#faf8f3] p-4"
              >
                <span className="flex size-11 items-center justify-center rounded-xl bg-white p-2 shadow-sm text-[#0f3d3a]">
                  <UkuranBadge u={u} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[#0f3d3a]">{u.label}</p>
                  <p className="text-[11px] font-mono text-[#5c6b66]">{u.ratioLabel}</p>
                </div>
                <span className="ml-auto text-[11px] text-[#5c6b66]">
                  {u.canvas[0]}×{u.canvas[1]}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Footer info */}
        <footer className="text-center text-xs text-muted-foreground">
          Lencana emas + grid laut pada kartu ini meniru dirian P. Tim PINDAI · ruang
          penyedia dana.
        </footer>
      </div>
    </main>
  );
}
