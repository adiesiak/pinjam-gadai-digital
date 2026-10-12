import { useMutation, useQuery } from "convex/react";
import { Check, Loader2, Palette, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { THEME_PRESETS, type ThemePreset } from "@/lib/system-config";

type TemplateInfo = {
  id: ThemePreset;
  nama: string;
  deskripsi: string;
  warna: [string, string, string];
  latar: string;
  tinta: string;
};

const TEMPLATES: TemplateInfo[] = [
  {
    id: "tinta",
    nama: "Tinta & Kuningan",
    deskripsi: "Karakter profesional dengan aksen hijau tinta dan nuansa kertas hangat.",
    warna: ["#0f3d3a", "#9c7b3a", "#f1ede3"],
    latar: "#f8f6f1",
    tinta: "#1c1a15",
  },
  {
    id: "obsidian",
    nama: "Obsidian",
    deskripsi:
      "Wajah gelap premium: permukaan obsidian, emas metalik, dan pendaran emerald (arah DESIGN.md). Perlu tinjauan mata sebelum dijadikan tema utama.",
    warna: ["#d4af37", "#10b981", "#0b0f19"],
    latar: "#030712",
    tinta: "#e6e8ee",
  },
  {
    id: "pesisir",
    nama: "Pesisir",
    deskripsi: "Tampilan segar bernuansa biru laut, cocok untuk kesan terbuka dan tenang.",
    warna: ["#14586e", "#b98743", "#e5f0f3"],
    latar: "#f5fafb",
    tinta: "#17313b",
  },
  {
    id: "terakota",
    nama: "Terakota",
    deskripsi: "Palet tanah hangat dengan aksen bata dan latar lembut.",
    warna: ["#81432f", "#a4793a", "#f2e6dd"],
    latar: "#fcf8f4",
    tinta: "#3b2821",
  },
  {
    id: "salju",
    nama: "Musim Salju",
    deskripsi:
      "Tema musiman beranimasi: salju turun perlahan, brankas tertutup salju, dan logo berganti warna.",
    warna: ["#2f5d7c", "#9fb8c8", "#e6eef3"],
    latar: "#eef3f7",
    tinta: "#1d2b36",
  },
  {
    id: "karnival",
    nama: "Karnival",
    deskripsi:
      "Tema paling meriah: palet warna cerah ala karnival, konfeti berjatuhan, logo memantul, dan dial berputar.",
    warna: ["#c2266f", "#f5b301", "#ffe6f2"],
    latar: "#fff7fb",
    tinta: "#2b1533",
  },
];

export function WebsiteTemplatePanel() {
  const config = useQuery(api.system.getConfigAdmin);
  const applyTemplate = useMutation(api.system.setWebsiteTemplate);
  const [busy, setBusy] = useState<ThemePreset | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (config === undefined) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Memuat template website…
      </div>
    );
  }

  const current = config.config.tema;
  const templates = TEMPLATES.filter((template) =>
    (THEME_PRESETS as readonly string[]).includes(template.id),
  );

  const apply = async (tema: ThemePreset) => {
    setBusy(tema);
    setError(null);
    try {
      await applyTemplate({ tema });
      toast.success(`Template ${TEMPLATES.find((item) => item.id === tema)?.nama ?? tema} diterapkan ke website.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal menerapkan template.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="animate-masuk space-y-6">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
          <Palette className="size-4" /> Tampilan website
        </p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-navy">Pilih template situs</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Pilih palet warna untuk landing page dan tampilan aplikasi. Perubahan berlaku untuk semua pengunjung dan tersimpan di Audit Trail.
        </p>
        <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground">
          <Sparkles className="size-3.5" /> Template aktif: {TEMPLATES.find((item) => item.id === current)?.nama ?? current}
        </p>
      </header>

      <div className="grid gap-4 xl:grid-cols-3">
        {templates.map((template) => {
          const selected = current === template.id;
          return (
            <article key={template.id} className={`overflow-hidden rounded-2xl border bg-white transition-shadow ${selected ? "border-primary ring-2 ring-primary/15" : "border-slate-200 hover:shadow-md"}`}>
              <div className="p-4" style={{ backgroundColor: template.latar }}>
                <div className="rounded-xl border p-4 shadow-sm" style={{ backgroundColor: "#ffffff", borderColor: template.warna[2], color: template.tinta }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-xs font-bold tracking-wide">
                      <span className="inline-block size-5 rounded-md" style={{ backgroundColor: template.warna[0] }} /> PINDAI
                    </span>
                    <span className="rounded-full px-2 py-1 text-[10px] font-medium" style={{ backgroundColor: template.warna[2] }}>Website publik</span>
                  </div>
                  <div className="mt-5">
                    <p className="text-lg font-semibold leading-tight">Pinjam &amp; Gadai Digital</p>
                    <p className="mt-1 text-[11px] opacity-70">Perhitungan jelas, catatan mudah dipantau.</p>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-2">
                    <span className="rounded-lg px-3 py-2 text-[10px] font-semibold text-white" style={{ backgroundColor: template.warna[0] }}>Mulai sekarang</span>
                    <div className="flex gap-1.5" aria-label="Palet warna">
                      {template.warna.map((color) => <span key={color} className="size-4 rounded-full border border-black/10" style={{ backgroundColor: color }} />)}
                    </div>
                  </div>
                </div>
              </div>
              <div className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-semibold text-navy">{template.nama}</h3>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{template.deskripsi}</p>
                  </div>
                  {selected && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-800"><Check className="size-3" /> Aktif</span>}
                </div>
                <Button className="w-full" variant={selected ? "outline" : "default"} disabled={busy !== null || selected} onClick={() => void apply(template.id)}>
                  {busy === template.id ? <Loader2 className="size-4 animate-spin" /> : null}
                  {selected ? "Template sedang digunakan" : "Terapkan template"}
                </Button>
              </div>
            </article>
          );
        })}
      </div>

      {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</p>}
    </div>
  );
}
