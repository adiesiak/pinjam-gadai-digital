import type { FunctionArgs } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeftRight, Check, Loader2, MessageSquare, Type, Wifi } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/convex/_generated/api";

/** Default UI fallback bila server belum mengirim teks publik (non-destructive). */
const FALLBACK = {
  barTeks: "Pinjaman, gadai, dan cicilan dicatat di catatan internal PINDAI.",
  barTautan: "/auth",
  barAktif: true,
  popupJudul: "Jelajahi PINDAI",
  popupIsi: "Lihat perhitungan pinjaman dan gadai serta catatan status di dashboard.",
  popupCta: "Lihat kalkulator",
  popupAktif: true,
  floatJudul: "Pengajuan cepat",
  floatIsi: "Catat informasi pengajuan dan pantau status internal melalui dashboard akun Anda.",
  floatCta: "Mulai pengajuan",
  floatAktif: true,
  floatDelayDetik: 6,
};

function FieldGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-navy">
        <Type className="size-4 text-primary" />
        {title}
      </h4>
      <div className="mt-4 space-y-4">{children}</div>
    </div>
  );
}

function FieldEdit({
  htmlFor,
  label,
  area,
  max,
  placeholder,
  value,
  onChange,
  suffix,
  mono,
}: {
  htmlFor: string;
  label: string;
  area?: boolean;
  max?: number;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  mono?: boolean;
}) {
  return (
    <div>
      <Label htmlFor={htmlFor} className="text-xs">
        {label}
      </Label>
      <div className="mt-1 flex items-stretch rounded-xl border border-slate-200 bg-white shadow-sm">
        {area ? (
          <Textarea
            id={htmlFor}
            rows={3}
            className={`min-w-0 shadow-none focus-visible:ring-2 ${mono ? "font-mono" : ""}`}
            maxLength={max}
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
          />
        ) : (
          <Input
            id={htmlFor}
            className={`min-w-0 shadow-none focus-visible:ring-2 ${mono ? "font-mono tabular-nums" : ""}`}
            maxLength={max}
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
        {suffix ? (
          <span className="flex shrink-0 items-center border-l border-slate-200 bg-slate-50 px-3 text-xs tabular-nums text-slate-600">
            {suffix}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function SwitchRow({
  htmlFor,
  label,
  hint,
  checked,
  onChange,
}: {
  htmlFor: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-navy">{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch
        id={htmlFor}
        aria-label={label}
        checked={checked}
        onCheckedChange={onChange}
        className="shrink-0"
      />
    </div>
  );
}

/**
 * Bentuk payload CMS diambil LANGSUNG dari validator `announcements.save`.
 * Dengan begitu field yang tidak dikenal server tidak bisa masuk ke state
 * formulir — kalau ada, ini gagal saat typecheck, bukan saat admin menekan
 * Simpan dengan pesan "Object contains extra field".
 *
 * Panel ini hanya memuat teks yang benar-benar dirender: bar berjalan, popup,
 * dan widget mengambang. Teks hero, kartu layanan, dan panduan beranda diatur
 * di panel **Konten Beranda** (`LandingCmsPanel`) — dulu sebagian teks itu juga
 * bisa diketik di sini, tetapi yang dibaca halaman `/` adalah versi panel itu,
 * jadi suntingan di sini tidak pernah tampil.
 */
type PayloadCms = FunctionArgs<typeof api.announcements.save>;

export function AnnouncementCms() {
  const row = useQuery(api.announcements.getCmsRow);
  const publik = useQuery(api.announcements.getPublic);
  const save = useMutation(api.announcements.save);
  const reset = useMutation(api.announcements.resetToDefaults);
  const bersihkan = useMutation(api.announcements.bersihkanTeksLama);

  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Partial<PayloadCms> | null>(null);
  const [tab, setTab] = useState("tab-1");

  const ds = <K extends keyof PayloadCms>(key: K, fb: string): string => {
    const nilai = draft?.[key];
    return typeof nilai === "string" ? nilai : fb;
  };
  const db = <K extends keyof PayloadCms>(key: K, fb: boolean): boolean => {
    const nilai = draft?.[key];
    return typeof nilai === "boolean" ? nilai : fb;
  };
  const dn = <K extends keyof PayloadCms>(key: K, fb: number): number => {
    const nilai = draft?.[key];
    return typeof nilai === "number" ? nilai : fb;
  };

  if (row === undefined || publik === undefined) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Memuat CMS…
      </div>
    );
  }

  const set = <K extends keyof PayloadCms>(key: K, value: PayloadCms[K]) =>
    setDraft((prev) => ({ ...(prev ?? {}), [key]: value }));

  const simpan = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      await save({ ...draft });
      setDraft(null);
      toast.success("Tersimpan — bar, popup, dan widget langsung memakai teks baru.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan.");
    } finally {
      setBusy(false);
    }
  };

  const kembalikanDefault = async () => {
    setBusy(true);
    try {
      await reset({});
      setDraft(null);
      toast.success("Semua teks kembali ke default bawaan.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal reset.");
    } finally {
      setBusy(false);
    }
  };

  const bersihkanTeksLama = async () => {
    setBusy(true);
    try {
      const hasil = await bersihkan({});
      if (hasil.diganti.length === 0) {
        toast.success("Tidak ada teks lama yang perlu dibersihkan.");
        return;
      }
      setDraft(null);
      toast.success(`Teks lama dikembalikan ke default baru: ${hasil.diganti.join(", ")}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal membersihkan teks lama.");
    } finally {
      setBusy(false);
    }
  };

  const p = publik;
  const current = {
    barTeks: ds("teks", p.barTeks),
    barTautan: ds("tautan", p.barTautan),
    barAktif: db("barAktif", p.barAktif),
    popupJudul: ds("popupJudul", p.popupJudul),
    popupIsi: ds("popupIsi", p.popupIsi),
    popupCta: ds("popupCta", p.popupCta),
    popupAktif: db("popupAktif", p.popupAktif),
    floatJudul: ds("floatJudul", p.floatJudul),
    floatIsi: ds("floatIsi", p.floatIsi),
    floatCta: ds("floatCta", p.floatCta),
    floatAktif: db("floatAktif", p.floatAktif),
    floatDelayDetik: dn("floatDelayDetik", p.floatDelayDetik),
  };

  return (
    <div className="animate-masuk flex min-h-0 flex-col gap-5">
      {/* HEADER */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-navy">
            Banner &amp; Pengumuman Sistem
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Teks bar berjalan, popup, dan widget mengambang. Teks hero serta kartu
            layanan beranda diatur di panel Konten Beranda.
          </p>
        </div>
      </div>

      {/* BODY: form kiri + preview kanan */}
      <Tabs value={tab} onValueChange={setTab} className="flex-1 space-y-5">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
          <TabsTrigger value="tab-1" className="gap-2 text-sm">
            <MessageSquare className="size-4" />
            Banner, Popup &amp; Widget
          </TabsTrigger>
          <TabsTrigger value="tab-2" className="gap-2 text-sm">
            <Wifi className="size-4" />
            Android &amp; WhatsApp
          </TabsTrigger>
        </TabsList>

        <div className="grid min-h-0 gap-5 xl:grid-cols-2 xl:gap-6">
          {/* KIRI — FORM INPUT */}
          <div className="flex min-h-0 flex-col gap-5">
            <TabsContent value="tab-1" className="m-0 space-y-3">
              <FieldGroup title="Top Running Bar">
                <FieldEdit
                  htmlFor="cms-bar-teks"
                  label="Teks berjalan"
                  area
                  max={240}
                  value={current.barTeks}
                  onChange={(v) => set("teks", v)}
                  placeholder={FALLBACK.barTeks}
                />
                <FieldEdit
                  htmlFor="cms-bar-tautan"
                  label="Tautan CTA (path internal)"
                  value={current.barTautan}
                  onChange={(v) => set("tautan", v)}
                  placeholder={FALLBACK.barTautan}
                  mono
                />
                <p className="text-xs leading-5 text-muted-foreground">
                  Hanya path internal yang diawali satu garis miring, mis. <code>/promo</code>.
                  Alamat lengkap ditolak server karena tautan ini dirender sebagai navigasi
                  di dalam aplikasi.
                </p>
                <SwitchRow
                  htmlFor="cms-bar-aktif"
                  label="Tampilkan bar"
                  hint="Nonaktif menyembunyikan bar dari semua halaman."
                  checked={current.barAktif}
                  onChange={(v) => set("barAktif", v)}
                />
              </FieldGroup>

              <FieldGroup title="Popup Pengumuman">
                <FieldEdit
                  htmlFor="cms-popup-judul"
                  label="Judul"
                  max={80}
                  value={current.popupJudul}
                  onChange={(v) => set("popupJudul", v)}
                  placeholder={FALLBACK.popupJudul}
                />
                <FieldEdit
                  htmlFor="cms-popup-isi"
                  label="Isi"
                  area
                  max={500}
                  value={current.popupIsi}
                  onChange={(v) => set("popupIsi", v)}
                  placeholder={FALLBACK.popupIsi}
                />
                <FieldEdit
                  htmlFor="cms-popup-cta"
                  label="Teks tombol CTA"
                  max={60}
                  value={current.popupCta}
                  onChange={(v) => set("popupCta", v)}
                  placeholder={FALLBACK.popupCta}
                />
                <SwitchRow
                  htmlFor="cms-popup-aktif"
                  label="Tampilkan popup"
                  hint="Muncul tiap kunjungan halaman utama."
                  checked={current.popupAktif}
                  onChange={(v) => set("popupAktif", v)}
                />
              </FieldGroup>

              <FieldGroup title="Floating Widget">
                <FieldEdit
                  htmlFor="cms-float-judul"
                  label="Judul"
                  max={80}
                  value={current.floatJudul}
                  onChange={(v) => set("floatJudul", v)}
                  placeholder={FALLBACK.floatJudul}
                />
                <FieldEdit
                  htmlFor="cms-float-isi"
                  label="Isi"
                  area
                  max={300}
                  value={current.floatIsi}
                  onChange={(v) => set("floatIsi", v)}
                  placeholder={FALLBACK.floatIsi}
                />
                <FieldEdit
                  htmlFor="cms-float-cta"
                  label="Teks tombol CTA"
                  max={60}
                  value={current.floatCta}
                  onChange={(v) => set("floatCta", v)}
                  placeholder={FALLBACK.floatCta}
                />
                <FieldEdit
                  htmlFor="cms-float-delay"
                  label="Delay kemunculan (detik)"
                  value={String(current.floatDelayDetik)}
                  onChange={(v) => set("floatDelayDetik", Number(v) || 0)}
                  suffix="detik"
                  mono
                />
                <SwitchRow
                  htmlFor="cms-float-aktif"
                  label="Tampilkan widget"
                  hint="Muncul otomatis sesuai delay, bisa ditutup."
                  checked={current.floatAktif}
                  onChange={(v) => set("floatAktif", v)}
                />
              </FieldGroup>
            </TabsContent>

            <TabsContent value="tab-2" className="m-0 space-y-3">
              <FieldGroup title="Android &amp; WhatsApp">
                <p className="text-sm leading-6 text-muted-foreground">
                  Nama, ikon, dan tautan unduhan aplikasi diatur di menu{" "}
                  <strong>Aplikasi Android</strong>. Template pesan WhatsApp diatur di menu{" "}
                  <strong>WhatsApp</strong>. Keduanya tidak disimpan dari halaman ini, karena
                  halaman ini hanya mengatur teks halaman publik.
                </p>
              </FieldGroup>
            </TabsContent>
          </div>

          {/* KANAN — LIVE MOCKUP SIMULATOR */}
          <div className="flex min-h-0 flex-col">
            <div className="sticky top-24 flex min-h-0 flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
                <ArrowLeftRight className="size-4 text-primary" />
                <span className="text-sm font-semibold text-navy">Live Mockup Simulator</span>
                <span className="ml-auto text-[11px] text-muted-foreground">
                  50% · pratinjau real-time
                </span>
              </div>
              <Separator />
              <div className="flex-1 overflow-auto p-4">
                <SitePreview values={current} />
              </div>
            </div>
          </div>
        </div>
      </Tabs>

      {/* STICKY ACTION FOOTER BAR */}
      <div className="glass-dock sticky bottom-0 z-20 px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            {!draft ? "Tidak ada perubahan yang ditahan." : "Ada perubahan yang belum tersimpan."}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" disabled={busy} onClick={kembalikanDefault}>
              <ArrowLeftRight className="mr-1.5 size-3.5" />
              Reset ke Default
            </Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={bersihkanTeksLama}>
              Bersihkan Teks Lama
            </Button>
            <Button
              size="sm"
              className="bg-[#064E3B] text-white hover:bg-[#021E17]"
              disabled={busy || !draft}
              onClick={simpan}
            >
              {busy ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <Check className="mr-1.5 size-4" />
              )}
              Simpan Perubahan
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Simulasi tampilan bar/popup/widget, hanya UI (tidak render halaman sebenarnya).
 *  Catatan: ini adalah pratinjau CMS — tidak ada akses backend di sini.
 */
function SitePreview({
  values,
}: {
  values: {
    barTeks: string;
    barTautan: string;
    barAktif: boolean;
    popupJudul: string;
    popupIsi: string;
    popupCta: string;
    popupAktif: boolean;
    floatJudul: string;
    floatIsi: string;
    floatCta: string;
    floatAktif: boolean;
    floatDelayDetik: number;
  };
}) {
  const bar = values.barTeks;
  if (!bar) return null;
  return (
    <div className="mx-auto max-w-xl space-y-4 text-sm">
      {/* Top bar */}
      {values.barAktif && (
        <div className="overflow-hidden rounded-xl bg-navy p-3 text-white">
          <div className="animate-marquee flex w-max gap-8 py-2">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="whitespace-nowrap text-xs font-medium">
                {bar}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Indikator versi preview */}
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-[11px] text-muted-foreground">
        Pratinjau CMS · tanpa publish
      </div>

      <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] leading-5 text-muted-foreground">
        Hero, kartu layanan, dan panduan beranda tidak dipratinjau di sini — teksnya
        diatur di panel Konten Beranda.
      </p>

      {/* Popup preview */}
      {values.popupAktif && (
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="min-w-0">
            <p className="font-semibold text-navy">{values.popupJudul}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{values.popupIsi}</p>
          </div>
          <span className="shrink-0 rounded-lg bg-navy px-3 py-1 text-xs font-medium text-white">
            {values.popupCta}
          </span>
        </div>
      )}

      {/* Floating widget preview */}
      {values.floatAktif && (
        <div className="right-4 bottom-4 animate-float rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
          <p className="font-semibold text-navy">{values.floatJudul}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{values.floatIsi}</p>
          <span className="mt-2 inline-block rounded-lg bg-emerald-800 px-3 py-1 text-xs font-medium text-white">
            {values.floatCta}
          </span>
          <span className="mt-1 inline-flex h-6 w-6 rotate-45 cursor-pointer rounded-full border border-slate-300" />
        </div>
      )}
    </div>
  );
}
