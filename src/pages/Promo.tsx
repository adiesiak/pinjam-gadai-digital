import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Check,
  Download,
  ExternalLink,
  Image as ImageIcon,
  Share2,
  Sparkles,
  X,
} from "lucide-react";

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
const GOLD_LIGHT = "#e9dcb6";
const PAPER = "#fdfbf7";
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

// ---------------------------------------------------------------------------
// Poster siap pakai — tidak ada editor. Setiap kartu adalah materi final yang
// tinggal dipilih ukurannya lalu diunduh / dibagikan.
// ---------------------------------------------------------------------------
type Poster = {
  id: string;
  label: string;
  title: string;
  subtitle: string;
  peringatan: string;
  cta: string;
};

const POSTER: Poster[] = [
  {
    id: "tunai",
    label: "Pinjaman Tunai",
    title: "Pinjaman Tunai untuk Kebutuhan & Usaha",
    subtitle: "Pengajuan ringkas lewat aplikasi, keputusan jelas, dana cair ke rekening Anda.",
    peringatan: "Tenor 7–30 hari · bunga flat 30% · PINDAI",
    cta: "Ajukan Sekarang",
  },
  {
    id: "gadai",
    label: "Gadai Barang",
    title: "Gadai Barang, Nilai Tetap Terjaga",
    subtitle: "Barang ditaksir transparan dan disimpan aman di brankas PINDAI.",
    peringatan: "LTV hingga 70% · barang dititipkan terverifikasi · PINDAI",
    cta: "Taksir Barang",
  },
  {
    id: "kredit",
    label: "Kredit Barang",
    title: "Kredit Barang, Cicilan Ringan Tiap Bulan",
    subtitle: "Elektronik dan kebutuhan rumah dengan pilihan tenor yang fleksibel.",
    peringatan: "DP 0% · tenor 1 / 3 / 6 bulan · PINDAI",
    cta: "Mulai Cicilan",
  },
  {
    id: "disiplin",
    label: "Bayar Tepat Waktu",
    title: "Bayar Tepat Waktu, Plafon Meningkat",
    subtitle: "Riwayat pembayaran yang baik menambah batas pinjaman Anda berikutnya.",
    peringatan: "Catatan transparan di ledger internal · PINDAI",
    cta: "Cek Plafon Saya",
  },
  {
    id: "brand",
    label: "Kenalan PINDAI",
    title: "PINDAI — Pinjam & Gadai Digital",
    subtitle: "Satu ruang untuk pinjaman tunai, gadai barang, dan kredit barang.",
    peringatan: "Proses digital · akad & dokumen tercatat · PINDAI",
    cta: "Pelajari Layanan",
  },
];

// ---------------------------------------------------------------------------
// Render poster ke Canvas 2D. Semua posisi diturunkan dari lebar kanvas supaya
// proporsional di keempat ukuran. Satu poster = satu gambar final.
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

function renderKartu(ctx: CanvasRenderingContext2D, p: Poster, size: Ukuran) {
  const W = size.canvas[0];
  const H = size.canvas[1];
  const pad = Math.round(W * 0.08);
  const sans = "ui-sans-serif, system-ui, sans-serif";

  // Latar + pita aksen atas.
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = NAVY;
  ctx.fillRect(0, 0, W, Math.round(W * 0.016));
  ctx.fillStyle = GOLD;
  ctx.fillRect(0, Math.round(W * 0.016), W, Math.round(W * 0.006));

  // Pita bawah (tempat nama merek).
  const bandH = Math.round(H * 0.055);
  ctx.fillStyle = NAVY;
  ctx.fillRect(0, H - bandH, W, bandH);
  ctx.fillStyle = GOLD;
  ctx.fillRect(0, H - bandH, W, Math.round(W * 0.004));

  // Baris merek: lencana P + nama.
  const brandY = Math.round(W * 0.075);
  const markSize = Math.round(W * 0.08);
  bulat(ctx, pad, brandY, markSize, markSize, Math.round(markSize * 0.28));
  ctx.fillStyle = NAVY;
  ctx.fill();
  ctx.fillStyle = GOLD;
  ctx.font = `700 ${Math.round(markSize * 0.56)}px ${sans}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("P", pad + markSize / 2, brandY + markSize * 0.54);
  const namaX = pad + markSize + Math.round(W * 0.022);
  ctx.textAlign = "left";
  ctx.fillStyle = NAVY;
  ctx.font = `800 ${Math.round(W * 0.044)}px ${sans}`;
  ctx.fillText("PINDAI", namaX, brandY + Math.round(W * 0.018));
  ctx.fillStyle = MUTED;
  ctx.font = `${Math.round(W * 0.024)}px ${sans}`;
  ctx.fillText("Pinjam & Gadai Digital", namaX, brandY + Math.round(W * 0.055));

  // Badge peringatan.
  const badgeFont = Math.round(W * 0.026);
  ctx.font = `700 ${badgeFont}px ${sans}`;
  const badgePadX = Math.round(W * 0.03);
  const badgeW = Math.min(W - pad * 2, ctx.measureText(p.peringatan).width + badgePadX * 2);
  const badgeH = Math.round(badgeFont * 2.1);
  const badgeY = brandY + markSize + Math.round(W * 0.055);
  bulat(ctx, pad, badgeY, badgeW, badgeH, badgeH / 2);
  ctx.fillStyle = WARN_BG;
  ctx.fill();
  ctx.strokeStyle = WARN_EDGE;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = WARN_TEXT;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(p.peringatan, pad + badgePadX, badgeY + badgeH / 2 + 1);

  // Judul.
  const titleSize = Math.round(W * 0.093);
  ctx.fillStyle = NAVY;
  ctx.font = `800 ${titleSize}px ${sans}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  let y = badgeY + badgeH + Math.round(W * 0.06);
  for (const baris of bungkus(ctx, p.title, W - pad * 2)) {
    ctx.fillText(baris, pad, y);
    y += Math.round(titleSize * 1.08);
  }

  // Subjudul.
  if (p.subtitle) {
    y += Math.round(W * 0.022);
    ctx.fillStyle = MUTED;
    ctx.font = `${Math.round(W * 0.032)}px ${sans}`;
    for (const baris of bungkus(ctx, p.subtitle, W - pad * 2)) {
      ctx.fillText(baris, pad, y);
      y += Math.round(W * 0.046);
    }
  }

  // Tombol CTA di bagian bawah.
  if (p.cta) {
    const ctaFont = Math.round(W * 0.032);
    ctx.font = `700 ${ctaFont}px ${sans}`;
    const btnPadX = Math.round(W * 0.06);
    const btnW = Math.min(W - pad * 2, ctx.measureText(p.cta).width + btnPadX * 2);
    const btnH = Math.round(W * 0.092);
    const btnX = Math.round((W - btnW) / 2);
    const btnY = H - bandH - Math.round(H * 0.055) - btnH;
    bulat(ctx, btnX, btnY, btnW, btnH, Math.round(btnH * 0.3));
    ctx.fillStyle = NAVY;
    ctx.fill();
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = GOLD_LIGHT;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(p.cta, btnX + btnW / 2, btnY + btnH / 2 + 1);
  }

  // Teks merek pada pita bawah.
  ctx.fillStyle = GOLD_LIGHT;
  ctx.font = `${Math.round(W * 0.024)}px ${sans}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("PINDAI · layanan pinjam & gadai digital", W / 2, H - bandH / 2 + 1);
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
  const teks = `${p.title}\n\n${p.subtitle}\n\n${p.peringatan}`;
  const tautan = typeof window !== "undefined" ? window.location.href : "";
  const file = await canvasKeFile(canvas, nama);

  if (navigator.share) {
    try {
      await navigator.share({
        title: p.title,
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
    `https://wa.me/?text=${encodeURIComponent(`${p.title} — ${teks}`)}`,
    "_blank",
  );
}

/** Satu poster siap pakai: kanvas + aksi unduh/bagikan. */
function PosterCard({ poster, ukuran }: { poster: Poster; ukuran: Ukuran }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.width = ukuran.canvas[0];
    canvas.height = ukuran.canvas[1];
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    renderKartu(ctx, poster, ukuran);
  }, [poster, ukuran]);

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
        <span className="flex size-8 items-center justify-center rounded-lg bg-[#e7e2d4] p-1 text-[#0f3d3a]">
          <UkuranBadge u={ukuran} />
        </span>
      </div>
      <div className="flex flex-1 items-center justify-center bg-[#faf8f3] p-4">
        <canvas
          ref={ref}
          className="block w-full rounded-xl object-contain shadow-sm"
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
                Tinggal pilih ukuran, unduh PNG, lalu unggah ke Instagram, WhatsApp, atau
                status. Semua poster sudah final — tidak ada yang perlu diedit.
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
              <PosterCard key={p.id} poster={p} ukuran={ukuran} />
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
          Poster PINDAI · ruang penyedia dana. Unggah apa adanya — jangan mengubah angka atau
          klaim pada gambar.
        </footer>
      </div>
    </main>
  );
}
