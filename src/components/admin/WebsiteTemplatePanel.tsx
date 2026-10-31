import { useMutation, useQuery } from "convex/react";
import { Check, Layers, Loader2, Palette, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { api } from "@/convex/_generated/api";
import { INFO_GAYA, type GayaPreset } from "@/lib/template-gaya";
import { THEME_PRESETS, type ThemePreset } from "@/lib/system-config";

type TemplateInfo = {
  id: ThemePreset;
  nama: string;
  deskripsi: string;
  warna: [string, string, string];
  latar: string;
  tinta: string;
  /** Palet ini punya efek musiman (salju/konfeti) yang bisa dinyalakan. */
  musiman: boolean;
};

const TEMPLATES: TemplateInfo[] = [
  {
    id: "tinta",
    nama: "Tinta & Kuningan",
    deskripsi: "Karakter profesional dengan aksen hijau tinta dan nuansa kertas hangat.",
    warna: ["#0f3d3a", "#9c7b3a", "#f1ede3"],
    latar: "#f8f6f1",
    tinta: "#1c1a15",
    musiman: false,
  },
  {
    id: "pesisir",
    nama: "Pesisir",
    deskripsi: "Tampilan segar bernuansa biru laut, cocok untuk kesan terbuka dan tenang.",
    warna: ["#14586e", "#b98743", "#e5f0f3"],
    latar: "#f5fafb",
    tinta: "#17313b",
    musiman: false,
  },
  {
    id: "terakota",
    nama: "Terakota",
    deskripsi: "Palet tanah hangat dengan aksen bata dan latar lembut.",
    warna: ["#81432f", "#a4793a", "#f2e6dd"],
    latar: "#fcf8f4",
    tinta: "#3b2821",
    musiman: false,
  },
  {
    id: "salju",
    nama: "Musim Salju",
    deskripsi:
      "Palet dingin musiman. Efek salju bisa dinyalakan terpisah di beranda.",
    warna: ["#2f5d7c", "#9fb8c8", "#e6eef3"],
    latar: "#eef3f7",
    tinta: "#1d2b36",
    musiman: true,
  },
  {
    id: "karnival",
    nama: "Karnival",
    deskripsi:
      "Palet cerah untuk kampanye. Efek konfeti bisa dinyalakan terpisah dan hanya tampil di beranda.",
    warna: ["#c2266f", "#f5b301", "#ffe6f2"],
    latar: "#fff7fb",
    tinta: "#2b1533",
    musiman: true,
  },
];

/**
 * Panel template website.
 *
 * Dua sumbu yang dipilih terpisah — palet (warna) dan gaya (bentuk) — plus satu
 * sakelar efek musiman. Memilih warna tidak mereset gaya, karena keduanya
 * dikirim sebagai field terpisah ke `system.setWebsiteTemplate`.
 */
export function WebsiteTemplatePanel() {
  const config = useQuery(api.system.getConfigAdmin);
  const terapkan = useMutation(api.system.setWebsiteTemplate);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (config === undefined) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Memuat template website…
      </div>
    );
  }

  const { tema, gaya, efekMusiman } = config.config;
  const paletAktif = TEMPLATES.find((item) => item.id === tema);
  const gayaAktif = INFO_GAYA.find((item) => item.id === gaya);
  const paletMusiman = paletAktif?.musiman ?? false;

  const jalankan = async (
    kunci: string,
    ubah: {
      tema?: ThemePreset;
      gaya?: GayaPreset;
      efekMusiman?: boolean;
    },
    pesan: string,
  ) => {
    setBusy(kunci);
    setError(null);
    try {
      await terapkan(ubah);
      toast.success(pesan);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Gagal menerapkan template.";
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
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-navy">
          Palet dan gaya situs
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Palet mengatur warna. Gaya mengatur tipografi judul, sudut, garis, dan
          bayangan kartu. Keduanya dipilih terpisah, jadi warna Pesisir bisa
          dipasangkan dengan gaya Tenang.
        </p>
        <p className="mt-4 inline-flex flex-wrap items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground">
          <Sparkles className="size-3.5" />
          Aktif: {paletAktif?.nama ?? tema} · Gaya {gayaAktif?.nama ?? gaya}
          {efekMusiman ? " · Efek musiman menyala" : ""}
        </p>
      </header>

      <section aria-labelledby="palet-judul" className="space-y-3">
        <div>
          <h3 id="palet-judul" className="text-sm font-semibold text-navy">
            1. Palet warna
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Menentukan warna aksen, latar, dan status di seluruh aplikasi.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {TEMPLATES.filter((template) =>
            (THEME_PRESETS as readonly string[]).includes(template.id),
          ).map((template) => {
            const dipilih = tema === template.id;
            const sibuk = busy === `tema:${template.id}`;
            return (
              <article
                key={template.id}
                className={`overflow-hidden rounded-2xl border bg-white transition-shadow ${
                  dipilih
                    ? "border-primary ring-2 ring-primary/15"
                    : "border-slate-200 hover:shadow-md"
                }`}
              >
                <div className="p-4" style={{ backgroundColor: template.latar }}>
                  <div
                    className="rounded-xl border p-4 shadow-sm"
                    style={{
                      backgroundColor: "#ffffff",
                      borderColor: template.warna[2],
                      color: template.tinta,
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-xs font-bold tracking-wide">
                        <span
                          className="inline-block size-5 rounded-md"
                          style={{ backgroundColor: template.warna[0] }}
                        />
                        PINDAI
                      </span>
                      <span
                        className="rounded-full px-2 py-1 text-[10px] font-medium"
                        style={{ backgroundColor: template.warna[2] }}
                      >
                        Palet
                      </span>
                    </div>
                    <div className="mt-5">
                      <p className="text-lg font-semibold leading-tight">
                        Biaya dan status
                      </p>
                      <p className="mt-1 text-[11px] opacity-70">
                        Terlihat sebelum melangkah.
                      </p>
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-2">
                      <span
                        className="rounded-lg px-3 py-2 text-[10px] font-semibold text-white"
                        style={{ backgroundColor: template.warna[0] }}
                      >
                        Mulai sekarang
                      </span>
                      <div className="flex gap-1.5" aria-label="Palet warna">
                        {template.warna.map((color) => (
                          <span
                            key={color}
                            className="size-4 rounded-full border border-black/10"
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="space-y-3 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-base font-semibold text-navy">
                        {template.nama}
                      </h4>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {template.deskripsi}
                      </p>
                    </div>
                    {dipilih && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-success-border bg-success-soft px-2 py-1 text-[10px] font-semibold text-success-foreground">
                        <Check className="size-3" /> Aktif
                      </span>
                    )}
                  </div>
                  <Button
                    className="w-full"
                    variant={dipilih ? "outline" : "default"}
                    disabled={busy !== null || dipilih}
                    onClick={() =>
                      void jalankan(
                        `tema:${template.id}`,
                        { tema: template.id },
                        `Palet ${template.nama} diterapkan.`,
                      )
                    }
                  >
                    {sibuk ? <Loader2 className="size-4 animate-spin" /> : null}
                    {dipilih ? "Palet sedang digunakan" : "Pakai palet ini"}
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="gaya-judul" className="space-y-3">
        <div>
          <h3 id="gaya-judul" className="flex items-center gap-2 text-sm font-semibold text-navy">
            <Layers className="size-4 text-primary" /> 2. Gaya tampilan
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Mengubah bentuk tanpa mengubah warna: tipografi judul, sudut kartu
            dan tombol, ketebalan garis, bayangan, serta pola permukaan hero.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {INFO_GAYA.map((item) => {
            const dipilih = gaya === item.id;
            const sibuk = busy === `gaya:${item.id}`;
            return (
              <article
                key={item.id}
                className={`flex flex-col rounded-2xl border bg-white p-5 ${
                  dipilih
                    ? "border-primary ring-2 ring-primary/15"
                    : "border-slate-200"
                }`}
              >
                {/* Contoh bentuk memakai token gaya yang sama dengan landing. */}
                <div
                  data-gaya={item.id}
                  className="border border-slate-200 bg-slate-50 p-4"
                  style={{ borderRadius: "var(--radius-kartu)" }}
                >
                  <p
                    className="text-xl leading-tight text-navy"
                    style={{
                      fontFamily: "var(--font-display)",
                      fontStyle: "var(--display-italic)",
                      fontWeight: "var(--display-weight)",
                    }}
                  >
                    Judul contoh
                  </p>
                  <p className="mt-1 text-[11px] text-slate-600">
                    Satu kalimat penjelas.
                  </p>
                  <span
                    className="mt-3 inline-flex bg-primary px-3 py-1.5 text-[10px] font-semibold text-primary-foreground"
                    style={{ borderRadius: "var(--radius-tombol)" }}
                  >
                    Tombol
                  </span>
                </div>

                <div className="mt-4 flex-1 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold text-navy">
                      {item.nama}
                    </h4>
                    {dipilih && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-success-border bg-success-soft px-2 py-1 text-[10px] font-semibold text-success-foreground">
                        <Check className="size-3" /> Aktif
                      </span>
                    )}
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground">
                    {item.ringkasan}
                  </p>
                  <ul className="flex flex-wrap gap-1.5 pt-1">
                    {item.ciri.map((ciri) => (
                      <li
                        key={ciri}
                        className="rounded-full bg-muted px-2 py-1 text-[10px] font-medium text-slate-600"
                      >
                        {ciri}
                      </li>
                    ))}
                  </ul>
                </div>

                <Button
                  className="mt-4 w-full"
                  variant={dipilih ? "outline" : "default"}
                  disabled={busy !== null || dipilih}
                  onClick={() =>
                    void jalankan(
                      `gaya:${item.id}`,
                      { gaya: item.id },
                      `Gaya ${item.nama} diterapkan.`,
                    )
                  }
                >
                  {sibuk ? <Loader2 className="size-4 animate-spin" /> : null}
                  {dipilih ? "Gaya sedang digunakan" : "Pakai gaya ini"}
                </Button>
              </article>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="efek-judul" className="space-y-3">
        <h3 id="efek-judul" className="text-sm font-semibold text-navy">
          3. Efek musiman
        </h3>
        <div className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-navy">
              Salju dan konfeti di beranda
            </p>
            <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">
              Hanya tampil di halaman publik, dan hanya bila palet Salju atau
              Karnival sedang aktif. Dashboard, KYC, dan panel admin tidak
              pernah ditutup efek ini.
            </p>
            {!paletMusiman && (
              <p className="mt-2 text-xs text-amber-800">
                Palet aktif tidak punya efek musiman. Pilih Salju atau Karnival
                dulu bila ingin menyalakannya.
              </p>
            )}
          </div>
          <Switch
            aria-label="Efek musiman di beranda"
            checked={efekMusiman}
            disabled={busy !== null || !paletMusiman}
            onCheckedChange={(aktif) =>
              void jalankan(
                "efek",
                { efekMusiman: aktif },
                aktif
                  ? "Efek musiman dinyalakan di beranda."
                  : "Efek musiman dimatikan.",
              )
            }
            className="shrink-0"
          />
        </div>
      </section>

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  );
}
