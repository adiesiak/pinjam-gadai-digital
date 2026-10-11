import { useMutation, useQuery } from "convex/react";
import { ArrowLeftRight, Check, Loader2, MessageSquare, Tags, Type, Wifi } from "lucide-react";
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
  barTeks: "Pinjaman, gadai, dan cicilan dicatat di ledger internal PINDAI.",
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
  logoTeks: "PINDAI",
  nav1: "Pinjaman Tunai",
  nav2: "Gadai Digital",
  nav3: "Kalkulator",
  nav4: "Keamanan",
  heroBadge: "Pinjaman & ledger internal",
  heroJudul: "Pinjam & Gadai Digital",
  heroJudul2: "Transparan",
  heroSub: "Jelajahi perhitungan pinjaman, gadai, dan cicilan dalam ledger internal.",
  heroCta1: "Ajukan Pinjaman",
  heroCta2: "Gadaikan Barang",
  chip1Label: "Pinjaman tunai",
  chip1Nilai: "Tanpa agunan",
  chip2Label: "Barang gadai",
  chip2Nilai: "Catatan aplikasi",
  layananJudul: "Dua fitur, satu ledger internal",
  layananSub: "Semua nominal, skema biaya, dan status yang terlihat adalah pencatatan internal PINDAI.",
  pinjamanJudul: "Pinjaman Tunai Digital",
  pinjamanIsi: "Perhitungan harian: potongan di muka 2%, bunga 30%, total kewajiban 130% dari pokok; skema bulanan 1–6 bulan memakai DP 0% dan potongan di muka 2%.",
  pinjamanCta: "Ajukan sekarang",
  gadaiJudul: "Gadai Digital",
  gadaiIsi: "Catat informasi barang dan nilai taksiran untuk pengajuan gadai. Status dan pembayaran tercatat di ledger internal.",
  gadaiCta: "Gadaikan barang",
  apkLabel: "Unduh Aplikasi Android",
  apkUrl: "#",
  androidNote: "Aplikasi resmi memakai fitur lokasi dan login terverifikasi.",
  waTemplateLabel: "Template pesan WhatsApp",
  waTemplatePlaceholder: "{nama} · {ref} · {jumlah}",
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

function DividerLabel({ children }: { children: ReactNode }) {
  return (
    <div className="border-t border-slate-100 pt-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {children}
      </p>
    </div>
  );
}

export function AnnouncementCms() {
  const row = useQuery(api.announcements.getCmsRow);
  const publik = useQuery(api.announcements.getPublic);
  const save = useMutation(api.announcements.save);
  const reset = useMutation(api.announcements.resetToDefaults);
  const bersihkan = useMutation(api.announcements.bersihkanTeksLama);

  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Record<string, string | boolean | number> | null>(null);
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);
  // Tab aktif disimpan di state — sebelumnya `value` dipatok, sehingga mengklik
  // tab lain tidak memindahkan panel (form tetap di Tab 1).
  const [tab, setTab] = useState("tab-1");

  const d = (key: string, fb: string | boolean | number): string | boolean | number =>
    (draft?.[key] as string | undefined) ?? fb;
  const db = (key: string, fb: boolean): boolean => (draft?.[key] as boolean | undefined) ?? fb;
  const ds = (key: string, fb: string): string => (draft?.[key] as string | undefined) ?? fb;
  const dn = (key: string, fb: number): number => (draft?.[key] as number | undefined) ?? fb;

  if (row === undefined || publik === undefined) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Memuat CMS…
      </div>
    );
  }

  const set = (key: string, value: string | boolean | number) =>
    setDraft((prev) => ({ ...(prev ?? {}), [key]: value }));

  const simpan = async () => {
    if (!draft) return;
    setBusy(true);
    setStatus(null);
    try {
      await save({ ...draft } as Parameters<typeof save>[0]);
      setDraft(null);
      setStatus({ text: "Changes saved — public pages updated.", ok: true });
      toast.success("Konten tersimpan — halaman utama langsung diperbarui.");
    } catch (err) {
      setStatus({ text: err instanceof Error ? err.message : "Save failed.", ok: false });
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan.");
    } finally {
      setBusy(false);
    }
  };

  const kembalikanDefault = async () => {
    setBusy(true);
    setStatus(null);
    try {
      await reset({});
      setDraft(null);
      setStatus({ text: "CMS reset to system defaults.", ok: true });
      toast.success("Semua teks kembali ke default bawaan.");
    } catch (err) {
      setStatus({ text: err instanceof Error ? err.message : "Reset failed.", ok: false });
      toast.error(err instanceof Error ? err.message : "Gagal reset.");
    } finally {
      setBusy(false);
    }
  };

  const bersihkanTeksLama = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const hasil = await bersihkan({});
      if (hasil.diganti.length === 0) {
        setStatus({ text: "No legacy texts found to clean.", ok: true });
        toast.success("Tidak ada teks lama yang perlu dibersihkan.");
        return;
      }
      setDraft(null);
      setStatus({ text: `Legacy texts reverted: ${hasil.diganti.join(", ")}.`, ok: true });
      toast.success(`Teks lama dikembalikan ke default baru: ${hasil.diganti.join(", ")}.`);
    } catch (err) {
      setStatus({ text: err instanceof Error ? err.message : "Clean failed.", ok: false });
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
    logoTeks: ds("logoTeks", p.logoTeks),
    nav1: ds("nav1", p.nav1),
    nav2: ds("nav2", p.nav2),
    nav3: ds("nav3", p.nav3),
    nav4: ds("nav4", p.nav4),
    heroBadge: ds("heroBadge", p.heroBadge),
    heroJudul: ds("heroJudul", p.heroJudul),
    heroJudul2: ds("heroJudul2", p.heroJudul2),
    heroSub: ds("heroSub", p.heroSub),
    heroCta1: ds("heroCta1", p.heroCta1),
    heroCta2: ds("heroCta2", p.heroCta2),
    chip1Label: ds("chip1Label", p.chip1Label),
    chip1Nilai: ds("chip1Nilai", p.chip1Nilai),
    chip2Label: ds("chip2Label", p.chip2Label),
    chip2Nilai: ds("chip2Nilai", p.chip2Nilai),
    layananJudul: ds("layananJudul", p.layananJudul),
    layananSub: ds("layananSub", p.layananSub),
    pinjamanJudul: ds("pinjamanJudul", p.pinjamanJudul),
    pinjamanIsi: ds("pinjamanIsi", p.pinjamanIsi),
    pinjamanCta: ds("pinjamanCta", p.pinjamanCta),
    gadaiJudul: ds("gadaiJudul", p.gadaiJudul),
    gadaiIsi: ds("gadaiIsi", p.gadaiIsi),
    gadaiCta: ds("gadaiCta", p.gadaiCta),
    apkUrl: ds("apkUrl", FALLBACK.apkUrl),
    waTeks: ds("waTeks", FALLBACK.waTemplatePlaceholder),
    androidNote: ds("androidNote", FALLBACK.androidNote),
    waTemplateLabel: ds("waTemplateLabel", FALLBACK.waTemplateLabel),
    apkLabel: ds("apkLabel", FALLBACK.apkLabel),
  };

  return (
    <div className="animate-masuk flex min-h-0 flex-col gap-5">
      {/* HEADER */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-navy">Banner &amp; Pengumuman Sistem</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Edit teks dan tampilan publik. Semua perubahan langsung tampil di halaman utama setelah disimpan.
          </p>
        </div>
      </div>

      {/* BODY: form kiri + preview kanan */}
      <Tabs
        value={tab}
        onValueChange={setTab}
        className="flex-1 space-y-5"
      >
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
          <TabsTrigger value="tab-1" className="gap-2 text-sm">
            <MessageSquare className="size-4" />
            Tab 1 · Banner &amp; Pengumuman
          </TabsTrigger>
          <TabsTrigger value="tab-2" className="gap-2 text-sm">
            <Type className="size-4" />
            Tab 2 · Hero &amp; Navigasi
          </TabsTrigger>
          <TabsTrigger value="tab-3" className="gap-2 text-sm">
            <Tags className="size-4" />
            Tab 3 · Kartu Layanan
          </TabsTrigger>
          <TabsTrigger value="tab-4" className="gap-2 text-sm">
            <Wifi className="size-4" />
            Tab 4 · Android &amp; WA
          </TabsTrigger>
        </TabsList>

        <div className="grid gap-5 min-h-0 xl:grid-cols-2 xl:gap-6">
          {/* KIRI — FORM INPUT */}
          <div className="flex min-h-0 flex-col gap-5">
            <TabsContent value="tab-1" className="space-y-3 m-0">
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
                  label="Tautan CTA (opsional)"
                  value={current.barTautan}
                  onChange={(v) => set("tautan", v)}
                  placeholder={FALLBACK.barTautan}
                />
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

            <TabsContent value="tab-2" className="space-y-3 m-0">
              <FieldGroup title="Navigation &amp; Hero">
                <FieldEdit
                  htmlFor="cms-logo-teks"
                  label="Teks logo"
                  max={40}
                  value={current.logoTeks}
                  onChange={(v) => set("logoTeks", v)}
                  mono
                  placeholder={FALLBACK.logoTeks}
                />
                <DividerLabel>Menu navigasi</DividerLabel>
                <FieldEdit
                  htmlFor="cms-nav-1"
                  label="Menu navigasi 1"
                  max={40}
                  value={current.nav1}
                  onChange={(v) => set("nav1", v)}
                  placeholder={FALLBACK.nav1}
                />
                <FieldEdit
                  htmlFor="cms-nav-2"
                  label="Menu navigasi 2"
                  max={40}
                  value={current.nav2}
                  onChange={(v) => set("nav2", v)}
                  placeholder={FALLBACK.nav2}
                />
                <FieldEdit
                  htmlFor="cms-nav-3"
                  label="Menu navigasi 3"
                  max={40}
                  value={current.nav3}
                  onChange={(v) => set("nav3", v)}
                  placeholder={FALLBACK.nav3}
                />
                <FieldEdit
                  htmlFor="cms-nav-4"
                  label="Menu navigasi 4"
                  max={40}
                  value={current.nav4}
                  onChange={(v) => set("nav4", v)}
                  placeholder={FALLBACK.nav4}
                />
                <DividerLabel>Hero</DividerLabel>
                <FieldEdit
                  htmlFor="cms-hero-badge"
                  label="Badge atas hero"
                  max={160}
                  value={current.heroBadge}
                  onChange={(v) => set("heroBadge", v)}
                  placeholder={FALLBACK.heroBadge}
                />
                <FieldEdit
                  htmlFor="cms-hero-judul"
                  label="Judul hero (bagian 1)"
                  max={120}
                  value={current.heroJudul}
                  onChange={(v) => set("heroJudul", v)}
                  placeholder={FALLBACK.heroJudul}
                />
                <FieldEdit
                  htmlFor="cms-hero-judul-2"
                  label="Judul hero (aksen berwarna)"
                  max={60}
                  value={current.heroJudul2}
                  onChange={(v) => set("heroJudul2", v)}
                  placeholder={FALLBACK.heroJudul2}
                />
                <FieldEdit
                  htmlFor="cms-hero-sub"
                  label="Sub-headline hero"
                  area
                  max={400}
                  value={current.heroSub}
                  onChange={(v) => set("heroSub", v)}
                  placeholder={FALLBACK.heroSub}
                />
                <FieldEdit
                  htmlFor="cms-hero-cta-1"
                  label="CTA Button 1"
                  max={40}
                  value={current.heroCta1}
                  onChange={(v) => set("heroCta1", v)}
                  placeholder={FALLBACK.heroCta1}
                />
                <FieldEdit
                  htmlFor="cms-hero-cta-2"
                  label="CTA Button 2"
                  max={40}
                  value={current.heroCta2}
                  onChange={(v) => set("heroCta2", v)}
                  placeholder={FALLBACK.heroCta2}
                />
                <DividerLabel>Header chips</DividerLabel>
                <FieldEdit
                  htmlFor="cms-chip-1-label"
                  label="Chip 1 — label"
                  max={40}
                  value={current.chip1Label}
                  onChange={(v) => set("chip1Label", v)}
                  placeholder={FALLBACK.chip1Label}
                />
                <FieldEdit
                  htmlFor="cms-chip-1-nilai"
                  label="Chip 1 — nilai"
                  max={40}
                  value={current.chip1Nilai}
                  onChange={(v) => set("chip1Nilai", v)}
                  placeholder={FALLBACK.chip1Nilai}
                />
                <FieldEdit
                  htmlFor="cms-chip-2-label"
                  label="Chip 2 — label"
                  max={40}
                  value={current.chip2Label}
                  onChange={(v) => set("chip2Label", v)}
                  placeholder={FALLBACK.chip2Label}
                />
                <FieldEdit
                  htmlFor="cms-chip-2-nilai"
                  label="Chip 2 — nilai"
                  max={40}
                  value={current.chip2Nilai}
                  onChange={(v) => set("chip2Nilai", v)}
                  placeholder={FALLBACK.chip2Nilai}
                />
              </FieldGroup>
            </TabsContent>

            <TabsContent value="tab-3" className="space-y-3 m-0">
              <FieldGroup title="Service Cards">
                <FieldEdit
                  htmlFor="cms-layanan-judul"
                  label="Judul bagian"
                  max={120}
                  value={current.layananJudul}
                  onChange={(v) => set("layananJudul", v)}
                  placeholder={FALLBACK.layananJudul}
                />
                <FieldEdit
                  htmlFor="cms-layanan-sub"
                  label="Deskripsi kartu layanan"
                  area
                  max={300}
                  value={current.layananSub}
                  onChange={(v) => set("layananSub", v)}
                  placeholder={FALLBACK.layananSub}
                />
                <DividerLabel>Kartu Pinjaman</DividerLabel>
                <FieldEdit
                  htmlFor="cms-pinjaman-judul"
                  label="Judul kartu Pinjaman"
                  max={80}
                  value={current.pinjamanJudul}
                  onChange={(v) => set("pinjamanJudul", v)}
                  placeholder={FALLBACK.pinjamanJudul}
                />
                <FieldEdit
                  htmlFor="cms-pinjaman-isi"
                  label="Isi kartu Pinjaman"
                  area
                  max={400}
                  value={current.pinjamanIsi}
                  onChange={(v) => set("pinjamanIsi", v)}
                  placeholder={FALLBACK.pinjamanIsi}
                />
                <FieldEdit
                  htmlFor="cms-pinjaman-cta"
                  label="Tombol kartu Pinjaman"
                  max={40}
                  value={current.pinjamanCta}
                  onChange={(v) => set("pinjamanCta", v)}
                  placeholder={FALLBACK.pinjamanCta}
                />
                <DividerLabel>Kartu Gadai</DividerLabel>
                <FieldEdit
                  htmlFor="cms-gadai-judul"
                  label="Judul kartu Gadai"
                  max={80}
                  value={current.gadaiJudul}
                  onChange={(v) => set("gadaiJudul", v)}
                  placeholder={FALLBACK.gadaiJudul}
                />
                <FieldEdit
                  htmlFor="cms-gadai-isi"
                  label="Isi kartu Gadai"
                  area
                  max={400}
                  value={current.gadaiIsi}
                  onChange={(v) => set("gadaiIsi", v)}
                  placeholder={FALLBACK.gadaiIsi}
                />
                <FieldEdit
                  htmlFor="cms-gadai-cta"
                  label="Tombol kartu Gadai"
                  max={40}
                  value={current.gadaiCta}
                  onChange={(v) => set("gadaiCta", v)}
                  placeholder={FALLBACK.gadaiCta}
                />
              </FieldGroup>
            </TabsContent>

            <TabsContent value="tab-4" className="space-y-3 m-0">
              <FieldGroup title="Android &amp; WhatsApp">
                <FieldEdit
                  htmlFor="cms-apk-label"
                  label="Link Download APK label"
                  max={60}
                  value={current.apkLabel}
                  onChange={(v) => set("apkLabel", v)}
                  placeholder={FALLBACK.apkLabel}
                />
                <FieldEdit
                  htmlFor="cms-apk-url"
                  label="URL tautan download"
                  mono
                  value={current.apkUrl}
                  onChange={(v) => set("apkUrl", v)}
                  placeholder={FALLBACK.apkUrl}
                />
                <FieldEdit
                  htmlFor="cms-android-note"
                  label="Catatan Android (opsional)"
                  area
                  max={240}
                  value={current.androidNote}
                  onChange={(v) => set("androidNote", v)}
                  placeholder={FALLBACK.androidNote}
                />
                <DividerLabel>Template pesan WhatsApp</DividerLabel>
                <p className="text-xs text-muted-foreground">
                  Placeholder singkat untuk pratinjau CMS (pengiriman sesungguhnya memakai template gateway di menu WhatsApp).
                </p>
                <FieldEdit
                  htmlFor="cms-wa-teks"
                  label={current.waTemplateLabel}
                  area
                  max={240}
                  value={current.waTeks}
                  onChange={(v) => set("waTeks", v)}
                  placeholder={FALLBACK.waTemplatePlaceholder}
                />
              </FieldGroup>
            </TabsContent>
          </div>

          {/* KANAN — LIVE MOCKUP SIMULATOR */}
          <div className="flex min-h-0 flex-col">
            <div className="sticky top-24 flex min-h-0 flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
                <ArrowLeftRight className="size-4 text-primary" />
                <span className="text-sm font-semibold text-navy">Live Mockup Simulator</span>
                <span className="ml-auto text-[11px] text-muted-foreground">50% · pratinjau real-time</span>
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
      <div className="sticky bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur px-4 py-3 shadow-sm sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            {!draft ? "Tidak ada perubahan yang ditahan." : "Ada perubahan yang belum tersimpan."}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={kembalikanDefault}
            >
              <ArrowLeftRight className="mr-1.5 size-3.5" />
              Reset ke Default
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={bersihkanTeksLama}
            >
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

/** Simulasi halaman publik mini, hanya UI (tidak render halaman sebenarnya).
 *  Catatan: ini adalah pratinjau CMS — tidak ada akses backend di sini.
 */
function SitePreview({ values }: { values: {
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
  logoTeks: string;
  nav1: string;
  nav2: string;
  nav3: string;
  nav4: string;
  heroBadge: string;
  heroJudul: string;
  heroJudul2: string;
  heroSub: string;
  heroCta1: string;
  heroCta2: string;
  chip1Label: string;
  chip1Nilai: string;
  chip2Label: string;
  chip2Nilai: string;
  layananJudul: string;
  layananSub: string;
  pinjamanJudul: string;
  pinjamanIsi: string;
  pinjamanCta: string;
  gadaiJudul: string;
  gadaiIsi: string;
  gadaiCta: string;
  apkUrl: string;
  waTeks: string;
  androidNote: string;
  waTemplateLabel: string;
  apkLabel: string;
}}) {
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

      {/* Nav */}
      <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs text-navy">
        {[values.nav1, values.nav2, values.nav3, values.nav4].map((label) => (
          <span key={label} className="font-medium text-navy">
            {label}
          </span>
        ))}
      </div>

      {/* Hero */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
              {values.heroBadge}
            </span>
          </div>
          <span className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600">
            {values.chip1Label}: {values.chip1Nilai}
          </span>
          <span className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600">
            {values.chip2Label}: {values.chip2Nilai}
          </span>
        </div>
        <h1 className="mt-3 text-xl font-semibold text-navy sm:text-2xl">
          {values.heroJudul}
          <br />
          <span className="text-emerald-700">{values.heroJudul2}</span>
        </h1>
        <p className="mt-2 text-slate-600">{values.heroSub}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1 rounded-xl bg-emerald-800 px-4 py-1 text-xs font-semibold text-white">
            {values.heroCta1}
          </span>
          <span className="inline-flex items-center gap-1 rounded-xl border border-slate-300 px-4 py-1 text-xs font-semibold text-navy">
            {values.heroCta2}
          </span>
        </div>
      </div>

      {/* Service cards */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <p className="text-base font-semibold text-navy">{values.layananJudul}</p>
        <p className="mt-1 text-sm text-muted-foreground">{values.layananSub}</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-navy">{values.pinjamanJudul}</p>
            <p className="mt-1 text-xs text-muted-foreground">{values.pinjamanIsi}</p>
            <span className="mt-3 inline-block rounded-lg bg-emerald-800 px-3 py-1 text-xs font-semibold text-white">
              {values.pinjamanCta}
            </span>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-navy">{values.gadaiJudul}</p>
            <p className="mt-1 text-xs text-muted-foreground">{values.gadaiIsi}</p>
            <span className="mt-3 inline-block rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold text-navy">
              {values.gadaiCta}
            </span>
          </div>
        </div>
      </div>

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
