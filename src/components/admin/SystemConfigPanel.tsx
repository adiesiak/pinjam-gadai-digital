import { useMutation, useQuery } from "convex/react";
import { Loader2, MapPin, QrCode, Settings2, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/convex/_generated/api";
import { hitungSimulasiBulanan } from "@/lib/bulanan";
import { formatRupiah } from "@/lib/money";
import { clampPlafon, PLAFON_BATAS } from "@/lib/plafon";
import { formatWaktuWIB } from "@/lib/waktu";
import {
  MARGIN_MURABAHAH_MAX_PERSEN,
  MARGIN_MURABAHAH_MIN_PERSEN,
} from "@/lib/syariah/murabahah";
import {
  DEFAULT_CONFIG,
  NISBAH_PENDANA_BATAS,
  RETENSI_LOKASI_BATAS,
  tanpaVersiConfig,
  type SystemConfig,
} from "@/lib/system-config";

import { PanelMemuat } from "./admin-shared";
import { RiwayatConfigPanel } from "./RiwayatConfigPanel";

import type { ReactNode } from "react";

type ConfigForm = Omit<SystemConfig, "versi">;

/**
 * Kolom tarif bulanan. Perubahannya membentuk kontrak baru, jadi panel ini
 * mewajibkan catatan alasan sebelum menyimpan (server menolak tanpa catatan).
 */
const KUNCI_TARIF_BULANAN = [
  "persenBungaBulanan1",
  "persenBungaBulanan3",
  "persenBungaBulanan6",
  "persenBiayaLayananBulanan",
  "persenBiayaAdminCicilanBulanan",
] as const satisfies readonly (keyof ConfigForm)[];

function DividerLabel({ children }: { children: ReactNode }) {
  return (
    <div className="border-t border-slate-100 pt-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {children}
      </p>
    </div>
  );
}

function SuffixInput({
  id,
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
  placeholder,
  mono,
  withHint,
  hint,
}: {
  id: string;
  label: string;
  value: string | number;
  min?: number;
  max?: number;
  step?: number;
  suffix: string;
  onChange: (v: string | number) => void;
  placeholder?: string;
  mono?: boolean;
  withHint?: boolean;
  hint?: string;
}) {
  const numeric = typeof value === "number" ? String(value) : value;
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="mt-1 flex">
        <Input
          id={id}
          type={!mono ? "number" : "text"}
          inputMode={!mono ? "decimal" : "text"}
          min={min}
          max={max}
          step={step ?? 1}
          value={numeric}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^\d.-]/g, "");
            const n = Number(raw);
            if (raw === "" || Number.isNaN(n)) {
              onChange("");
              return;
            }
            if ((min !== undefined && n < min) || (max !== undefined && n > max)) return;
            onChange(n);
          }}
          placeholder={placeholder}
          className={`shadow-none focus-visible:ring-2 ${mono ? "font-mono tabular-nums" : "tabular-nums"}`}
        />
        <span className="flex shrink-0 items-center border-l border-slate-200 bg-slate-50 px-3 text-xs tabular-nums text-slate-600">
          {suffix}
        </span>
      </div>
      {withHint && hint && <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{hint}</p>}
    </div>
  );
}

function RpInput({
  id,
  label,
  value,
  min,
  max,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
  hint?: string;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="mt-1 flex">
        <span className="flex shrink-0 items-center border-r border-slate-200 bg-slate-50 px-3 text-xs tabular-nums text-slate-600">
          Rp
        </span>
        <Input
          id={id}
          type="text"
          inputMode="numeric"
          value={formatRupiah(value).replace(/\./g, "").replace(/Rp\s?/gi, "").trim()}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^\d]/g, "");
            const n = Number(raw);
            if (raw === "" || Number.isNaN(n)) {
              onChange(min ?? 0);
              return;
            }
            const capped = Math.max(min ?? 0, Math.min(max ?? Number.MAX_SAFE_INTEGER, n));
            onChange(capped);
          }}
          className="shadow-none focus-visible:ring-2 tabular-nums"
          placeholder={min ? formatRupiah(min) : ""}
        />
      </div>
      {hint && <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{hint}</p>}
    </div>
  );
}

function DangerBox({
  title,
  children,
  action,
  onAction,
  busy,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  onAction?: () => void;
  busy?: boolean;
}) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50/80 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-red-800">{title}</p>
          <div className="mt-2 text-xs leading-5 text-red-700">{children}</div>
        </div>
        {action && onAction && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-red-300 text-red-700 hover:bg-red-100"
            disabled={busy || false}
            onClick={onAction}
          >
            {action}
          </Button>
        )}
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
  accent,
}: {
  htmlFor: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  accent?: "emerald" | "slate";
}) {
  const base = accent === "emerald" ? "border-emerald-100 bg-emerald-50/80" : "border-slate-200 bg-slate-50/80";
  return (
    <div className={`flex items-start justify-between gap-3 rounded-xl border ${base} px-4 py-3`}>
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

export function SystemConfigPanel() {
  const data = useQuery(api.system.getConfigAdmin);
  const save = useMutation(api.system.saveConfig);
  const generateUploadUrl = useMutation(api.system.generatePaymentAssetUploadUrl);
  const [form, setForm] = useState<ConfigForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadingQr, setUploadingQr] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);
  /** Alasan perubahan tarif bulanan — wajib bila salah satu angkanya berubah. */
  const [catatanTarif, setCatatanTarif] = useState("");
  // Tab aktif disimpan di state — sebelumnya `value` dipatok sehingga tab lain
  // tidak bisa dibuka.
  const [tab, setTab] = useState("finansial");

  if (data === undefined) {
    return <PanelMemuat />;
  }
  // Nilai tersimpan membawa `versi`, yang dimiliki server. Buang sebelum masuk
  // formulir agar tidak ikut terkirim balik saat simpan.
  const formTersimpan = () => tanpaVersiConfig({ ...DEFAULT_CONFIG, ...data.config });
  if (form === null) setForm(formTersimpan());
  if (form === null) return null;

  const upd = <K extends keyof ConfigForm>(k: K, v: ConfigForm[K]) => setForm({ ...form, [k]: v });

  const wrapBusyStatus = async (label: string, fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      await fn();
      setStatus({ text: `${label} saved.`, ok: true });
      toast.success(`${label} tersimpan.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Gagal ${label.toLowerCase()}.`);
      setStatus({ text: err instanceof Error ? err.message : `Gagal ${label.toLowerCase()}.`, ok: false });
      toast.error(err instanceof Error ? err.message : `Gagal ${label.toLowerCase()}.`);
    } finally {
      setBusy(false);
    }
  };

  // Perubahan tarif bulanan dibanding nilai tersimpan — dasar kewajiban catatan
  // dan pratinjau dampak di bawah.
  const tarifBerubah = KUNCI_TARIF_BULANAN.some(
    (kunci) => form[kunci] !== data.config[kunci],
  );
  /**
   * QRIS terbit hanya kalau gambarnya sudah TERSIMPAN.
   *
   * Selama `qrisImageId` kosong, pilihan QRIS disembunyikan dari formulir bukti
   * pembayaran dan server menolak bukti bermetode QRIS. Tanpa status di sini,
   * keadaan itu baru ketahuan dari peminjam yang bertanya kenapa QRIS tidak ada.
   */
  const qrisTersimpan = data.config.qrisImageId != null && data.qrisUrl !== null;
  const qrisPilihanBelumDisimpan =
    (form.qrisImageId ?? null) !== (data.config.qrisImageId ?? null);
  const pratinjauBulanan = (() => {
    try {
      return hitungSimulasiBulanan(1_000_000, 3, {
        tarif: {
          persenBungaBulanan1: form.persenBungaBulanan1,
          persenBungaBulanan3: form.persenBungaBulanan3,
          persenBungaBulanan6: form.persenBungaBulanan6,
          persenBiayaLayananBulanan: form.persenBiayaLayananBulanan,
          persenBiayaAdminCicilanBulanan: form.persenBiayaAdminCicilanBulanan,
        },
      });
    } catch {
      return null;
    }
  })();

  const simpan = async () => {
    if (tarifBerubah && catatanTarif.trim() === "") {
      toast.error(
        "Isi catatan perubahan tarif bulanan sebelum menyimpan — jelaskan alasan angka baru.",
      );
      setTab("finansial");
      return;
    }
    await wrapBusyStatus("Konfigurasi", async () => {
      await save({
        ...tanpaVersiConfig(form),
        ...(catatanTarif.trim() === "" ? {} : { catatan: catatanTarif.trim() }),
      });
      setCatatanTarif("");
    });
  };

  return (
    <div className="animate-masuk space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-navy">Pengaturan Parameter Bisnis</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Bunga, potongan, limit, biaya, geofencing, sesi, dan Mode Pemeliharaan sistem.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {status && (
            <p
              className={`rounded-lg px-3 py-1 text-xs font-medium ${status.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}
            >
              {status.text}
            </p>
          )}
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-5">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
          <TabsTrigger value="finansial" className="gap-2 text-sm">
            <QrCode className="size-4" />
            Tab 1 · Parameter Finansial &amp; Rekening
          </TabsTrigger>
          <TabsTrigger value="geo" className="gap-2 text-sm">
            <MapPin className="size-4" />
            Tab 2 · Geofencing &amp; Keamanan Lokasi
          </TabsTrigger>
          <TabsTrigger value="sesi" className="gap-2 text-sm">
            <Settings2 className="size-4" />
            Tab 3 · Aturan Sesi &amp; Sistem Toggles
          </TabsTrigger>
          <TabsTrigger value="danger" className="gap-2 text-sm">
            <ShieldAlert className="size-4" />
            Tab 4 · Danger Zone &amp; Riwayat Versi
          </TabsTrigger>
        </TabsList>

        {/* TAB 1 — FINANSIAL & REKENING */}
        <TabsContent value="finansial" className="space-y-5 m-0">
          <div className="grid gap-5 xl:grid-cols-2">
            <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="flex items-center gap-2 text-sm font-semibold text-navy">
                <QrCode className="size-4 text-primary" />
                Asumsi Finansial &amp; Perhitungan
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <SuffixInput
                  id="cfg-persen-admin"
                  label="Potongan Admin (%)"
                  value={form.persenAdmin}
                  min={0}
                  max={100}
                  step={0.5}
                  suffix="%"
                  onChange={(v) => upd("persenAdmin", Number(v) || 0)}
                  hint="Potongan dari pokok pendanaan (bukan dari Imbal Hasil)."
                  withHint
                />
                <SuffixInput
                  id="cfg-persen-platform"
                  label="Biaya Platform (%)"
                  value={form.persenPlatform}
                  min={0}
                  max={100}
                  step={0.5}
                  suffix="%"
                  onChange={(v) => upd("persenPlatform", Number(v) || 0)}
                  hint="Biaya platform dari total pengembalian pendana (pokok + Imbal Hasil)."
                  withHint
                />
                <SuffixInput
                  id="cfg-persen-bunga"
                  label="Bunga Flat (%)"
                  value={form.persenBunga}
                  min={0}
                  max={100}
                  step={0.5}
                  suffix="%"
                  onChange={(v) => upd("persenBunga", Number(v) || 0)}
                  hint="Bunga flat default untuk skema harian &amp; bulanan."
                  withHint
                />
                <SuffixInput
                  id="cfg-biaya-admin"
                  label="Biaya Admin Pinjaman (%)"
                  value={form.persenBiayaAdmin}
                  min={0}
                  max={50}
                  step={0.5}
                  suffix="%"
                  onChange={(v) => upd("persenBiayaAdmin", Number(v) || 0)}
                  hint="Dipotong di muka dari pokok; tampil di landing page & formulir."
                  withHint
                />
                <SuffixInput
                  id="cfg-margin-syariah"
                  label="Margin Murabahah Syariah (%)"
                  value={form.persenMarginSyariah}
                  min={MARGIN_MURABAHAH_MIN_PERSEN}
                  max={MARGIN_MURABAHAH_MAX_PERSEN}
                  step={1}
                  suffix="%"
                  onChange={(v) =>
                    upd(
                      "persenMarginSyariah",
                      Number(v) || MARGIN_MURABAHAH_MIN_PERSEN,
                    )
                  }
                  hint="Sekali dari harga pokok, semua produk, seluruh tenor. Dipakai pengajuan baru."
                  withHint
                />
                <SuffixInput
                  id="cfg-nisbah-pendana-syariah"
                  label="Nisbah Pendana Syariah (%)"
                  value={form.persenNisbahPendanaSyariah}
                  min={NISBAH_PENDANA_BATAS.min}
                  max={NISBAH_PENDANA_BATAS.maks}
                  step={1}
                  suffix="%"
                  onChange={(v) =>
                    upd(
                      "persenNisbahPendanaSyariah",
                      Number(v) || NISBAH_PENDANA_BATAS.min,
                    )
                  }
                  hint={`Sisanya ${100 - form.persenNisbahPendanaSyariah}% menjadi ujrah pengelola dari margin atau ujrah akad.`}
                  withHint
                />
                <SuffixInput
                  id="cfg-asuransi"
                  label="Biaya Asuransi (%)"
                  value={form.persenAsuransi}
                  min={0}
                  max={50}
                  step={0.5}
                  suffix="%"
                  onChange={(v) => upd("persenAsuransi", Number(v) || 0)}
                  hint="Dipotong di muka. Isi 0 kalau asuransi tidak dipungut."
                  withHint
                />
                <RpInput
                  id="cfg-ekspres-1"
                  label="Biaya Ekspres Tier 1 (Rp)"
                  value={form.biayaEkspresTier1}
                  min={0}
                  max={100_000}
                  onChange={(v) => upd("biayaEkspresTier1", v)}
                  hint={`Pokok ${formatRupiah(100_000)}–${formatRupiah(499_999)}.`}
                />
                <RpInput
                  id="cfg-ekspres-2"
                  label="Biaya Ekspres Tier 2 (Rp)"
                  value={form.biayaEkspresTier2}
                  min={0}
                  max={100_000}
                  onChange={(v) => upd("biayaEkspresTier2", v)}
                  hint={`Pokok ${formatRupiah(500_000)}–${formatRupiah(999_999)}.`}
                />
                <RpInput
                  id="cfg-ekspres-3"
                  label="Biaya Ekspres Tier 3 (Rp)"
                  value={form.biayaEkspresTier3}
                  min={0}
                  max={100_000}
                  onChange={(v) => upd("biayaEkspresTier3", v)}
                  hint={`Pokok ${formatRupiah(1_000_000)} ke atas.`}
                />
                <SuffixInput
                  id="cfg-persen-denda"
                  label="Denda Keterlambatan (%/hari)"
                  value={form.persenDendaKeterlambatan}
                  min={0}
                  max={100}
                  step={0.5}
                  suffix="%"
                  onChange={(v) => upd("persenDendaKeterlambatan", Number(v) || 0)}
                  hint="Dihitung dari pokok per hari terlambat; total dibatasi 100%."
                  withHint
                />
                <SuffixInput
                  id="cfg-ltv"
                  label="LTV Gadai (%)"
                  value={form.maxLtvPersen}
                  min={1}
                  max={100}
                  suffix="%"
                  onChange={(v) => upd("maxLtvPersen", Number(v) || 1)}
                  hint="Maks LTV gadai."
                  withHint
                />
                <SuffixInput
                  id="cfg-integrasi"
                  label="Biaya Integrasi Pinjaman Lama (%)"
                  value={form.persenBiayaIntegrasi}
                  min={0}
                  max={100}
                  suffix="%"
                  onChange={(v) => upd("persenBiayaIntegrasi", Number(v) || 0)}
                  hint="Dipakai saat membukukan pinjaman lama ke jurnal ledger."
                  withHint
                />
                <RpInput
                  id="cfg-plafon"
                  label="Plafon Default (Rp)"
                  value={form.plafonPinjaman}
                  min={PLAFON_BATAS.min}
                  max={PLAFON_BATAS.maks}
                  onChange={(v) => upd("plafonPinjaman", clampPlafon(v))}
                  hint={`Rentang ${formatRupiah(PLAFON_BATAS.min)}–${formatRupiah(PLAFON_BATAS.maks)}.`}
                />
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Tarif pinjaman bulanan & kredit barang
                </p>
                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                  Dipakai untuk pengajuan BARU tenor 1/3/6/9/12 bulan. Pinjaman dan
                  kredit yang sudah terbit memakai tarif yang dibekukan saat
                  pengajuan, jadi tidak ikut berubah.
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <SuffixInput
                    id="cfg-bunga-bulanan-1"
                    label="Bunga tenor 1 bulan (%/bulan)"
                    value={form.persenBungaBulanan1}
                    min={0}
                    max={100}
                    step={0.5}
                    suffix="%"
                    onChange={(v) => upd("persenBungaBulanan1", Number(v) || 0)}
                    hint="Flat dari pokok penuh."
                    withHint
                  />
                  <SuffixInput
                    id="cfg-bunga-bulanan-3"
                    label="Bunga tenor 3 bulan (%/bulan)"
                    value={form.persenBungaBulanan3}
                    min={0}
                    max={100}
                    step={0.5}
                    suffix="%"
                    onChange={(v) => upd("persenBungaBulanan3", Number(v) || 0)}
                    hint="Flat dari pokok penuh."
                    withHint
                  />
                  <SuffixInput
                    id="cfg-bunga-bulanan-6"
                    label="Bunga tenor 6 bulan (%/bulan)"
                    value={form.persenBungaBulanan6}
                    min={0}
                    max={100}
                    step={0.5}
                    suffix="%"
                    onChange={(v) => upd("persenBungaBulanan6", Number(v) || 0)}
                    hint="Flat dari pokok penuh."
                    withHint
                  />
                  <SuffixInput
                    id="cfg-biaya-layanan-bulanan"
                    label="Biaya layanan di muka (%)"
                    value={form.persenBiayaLayananBulanan}
                    min={0}
                    max={100}
                    step={0.5}
                    suffix="%"
                    onChange={(v) =>
                      upd("persenBiayaLayananBulanan", Number(v) || 0)
                    }
                    hint="Dipotong dari pokok semua tenor bulanan."
                    withHint
                  />
                  <SuffixInput
                    id="cfg-admin-cicilan"
                    label="Biaya admin cicilan (%)"
                    value={form.persenBiayaAdminCicilanBulanan}
                    min={0}
                    max={100}
                    step={0.5}
                    suffix="%"
                    onChange={(v) =>
                      upd("persenBiayaAdminCicilanBulanan", Number(v) || 0)
                    }
                    hint="Dari nominal cicilan, tiap pembayaran bulanan."
                    withHint
                  />
                </div>

                {pratinjauBulanan !== null && (
                  <dl className="mt-3 grid gap-x-4 gap-y-1 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[11px] sm:grid-cols-2">
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">
                        Potongan di muka (Rp1.000.000)
                      </dt>
                      <dd className="tabular-nums font-semibold text-slate-900">
                        {formatRupiah(pratinjauBulanan.potonganDiMuka)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">
                        Cicilan tenor 3 bulan
                      </dt>
                      <dd className="tabular-nums font-semibold text-slate-900">
                        {formatRupiah(pratinjauBulanan.cicilanPerBulan)}/bulan
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Bunga tenor 3 bulan</dt>
                      <dd className="tabular-nums font-semibold text-slate-900">
                        {pratinjauBulanan.persenBungaPerBulan}%/bulan
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Total dibayar 3 bulan</dt>
                      <dd className="tabular-nums font-semibold text-slate-900">
                        {formatRupiah(pratinjauBulanan.totalPengembalian)}
                      </dd>
                    </div>
                  </dl>
                )}

                {tarifBerubah && (
                  <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
                    <Label htmlFor="cfg-catatan-tarif" className="text-amber-900">
                      Catatan perubahan tarif (wajib)
                    </Label>
                    <Textarea
                      id="cfg-catatan-tarif"
                      value={catatanTarif}
                      onChange={(e) => setCatatanTarif(e.target.value)}
                      rows={2}
                      placeholder="mis. penyesuaian harga per 1 November 2026"
                      className="mt-1.5 bg-white"
                    />
                    <p className="mt-1 text-[11px] leading-5 text-amber-900">
                      Tersimpan di riwayat versi. Kontrak yang sudah terbit
                      tetap memakai tarif lamanya.
                    </p>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Rekening QRIS
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="cfg-payee">Nama pemilik rekening</Label>
                    <Input
                      id="cfg-payee"
                      value={form.rekeningUsahaNama}
                      onChange={(e) => upd("rekeningUsahaNama", e.target.value)}
                      className="mt-1.5 shadow-none focus-visible:ring-2"
                    />
                  </div>
                  <div>
                    <Label htmlFor="cfg-bank">Bank</Label>
                    <Input
                      id="cfg-bank"
                      value={form.rekeningUsahaBank}
                      onChange={(e) => upd("rekeningUsahaBank", e.target.value)}
                      className="mt-1.5 shadow-none focus-visible:ring-2"
                    />
                  </div>
                  <div>
                    <Label htmlFor="cfg-account">Nomor rekening</Label>
                    <Input
                      id="cfg-account"
                      inputMode="numeric"
                      value={form.rekeningUsahaNomor}
                      onChange={(e) => upd("rekeningUsahaNomor", e.target.value.replace(/\D/g, ""))}
                      className="mt-1.5 shadow-none focus-visible:ring-2 tabular-nums"
                    />
                  </div>
                  <div>
                    <Label htmlFor="cfg-qris-merchant">Nama merchant QRIS</Label>
                    <Input
                      id="cfg-qris-merchant"
                      value={form.qrisMerchantNama}
                      onChange={(e) => upd("qrisMerchantNama", e.target.value)}
                      className="mt-1.5 shadow-none focus-visible:ring-2"
                    />
                  </div>
                </div>
                <div
                  className={`mt-3 rounded-lg border px-3 py-2 text-[11px] leading-5 ${
                    qrisTersimpan
                      ? "border-emerald-200 bg-emerald-50/60 text-emerald-900"
                      : "border-amber-200 bg-amber-50/70 text-amber-950"
                  }`}
                >
                  <p className="font-semibold">
                    {qrisTersimpan ? "QRIS aktif" : "QRIS belum aktif"}
                  </p>
                  <p className="mt-0.5">
                    {qrisTersimpan
                      ? qrisPilihanBelumDisimpan
                        ? "Gambar yang tersimpan tetap dipakai. Perubahan gambar baru berlaku setelah konfigurasi disimpan."
                        : "Pilihan QRIS tampil di formulir bukti pembayaran dan bukti setoran."
                      : qrisPilihanBelumDisimpan
                        ? "Gambar sudah dipilih tetapi belum disimpan. QRIS baru aktif setelah konfigurasi disimpan."
                        : "Belum ada gambar QRIS tersimpan. Pilihan QRIS disembunyikan dari formulir pembayaran, dan server menolak bukti QRIS. Unggah gambar lalu simpan konfigurasi."}
                  </p>
                </div>
                {data.qrisUrl && (
                  <img
                    src={data.qrisUrl}
                    alt="QRIS yang diunggah admin"
                    loading="lazy"
                    decoding="async"
                    className="mt-4 max-h-56 max-w-full rounded-xl border border-slate-200 bg-white object-contain p-2"
                  />
                )}
                <div className="mt-3 flex items-center gap-3">
                  <Label htmlFor="cfg-qris-file" className="sr-only">
                    Ungah gambar QRIS
                  </Label>
                  <Input
                    id="cfg-qris-file"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={uploadingQr || busy}
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      if (
                        !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
                        file.size > 5_000_000
                      ) {
                        setError("QRIS harus berupa gambar maksimal 5 MB.");
                        event.target.value = "";
                        return;
                      }
                      setUploadingQr(true);
                      setError(null);
                      try {
                        const url = await generateUploadUrl();
                        const response = await fetch(url, {
                          method: "POST",
                          headers: { "Content-Type": file.type },
                          body: file,
                        });
                        const result = (await response.json()) as {
                          storageId?: ConfigForm["qrisImageId"];
                        };
                        if (!response.ok || !result.storageId) {
                          throw new Error("Gambar QRIS gagal diunggah.");
                        }
                        upd("qrisImageId", result.storageId);
                        toast.success("QRIS terunggah; simpan konfigurasi untuk menerbitkannya.");
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Gagal mengunggah QRIS.");
                      } finally {
                        setUploadingQr(false);
                        event.target.value = "";
                      }
                    }}
                  />
                  {uploadingQr && <Loader2 className="size-4 animate-spin" />}
                  {form.qrisImageId && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => upd("qrisImageId", null)}
                    >
                      Hapus QRIS
                    </Button>
                  )}
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Instruksi hanya untuk pengiriman bukti. Bukti dan pencocokan manual tidak mengubah saldo, tagihan, atau status transaksi.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Setoran penyedia dana
                </p>
                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                  Saat aktif, pendana dapat mengajukan setoran dari ruang pendana.
                  Setoran masuk antrean pencocokan mutasi; saldo tidak berubah
                  sebelum admin mencocokkannya.
                </p>
                <div className="mt-3">
                  <SwitchRow
                    htmlFor="cfg-deposit-manual"
                    label="Terima pengajuan setoran manual"
                    hint={
                      form.manualDepositEnabled
                        ? "Formulir setoran tampil di ruang pendana."
                        : "Formulir setoran disembunyikan; penempatan dicatat admin."
                    }
                    checked={form.manualDepositEnabled}
                    onChange={(v) => upd("manualDepositEnabled", v)}
                    accent="emerald"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Identitas surat resmi
                </p>
                <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                  Dipakai pada surat somasi dan dokumen resmi lain. Kolom yang dikosongkan tidak dicetak.
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="cfg-nama-badan">Nama badan</Label>
                    <Input
                      id="cfg-nama-badan"
                      value={form.namaBadan}
                      onChange={(e) => upd("namaBadan", e.target.value)}
                      className="mt-1.5 shadow-none focus-visible:ring-2"
                    />
                  </div>
                  <div>
                    <Label htmlFor="cfg-alamat-usaha">Alamat</Label>
                    <Input
                      id="cfg-alamat-usaha"
                      value={form.alamatUsaha}
                      onChange={(e) => upd("alamatUsaha", e.target.value)}
                      className="mt-1.5 shadow-none focus-visible:ring-2"
                    />
                  </div>
                  <div>
                    <Label htmlFor="cfg-email-resmi">Email resmi</Label>
                    <Input
                      id="cfg-email-resmi"
                      type="email"
                      value={form.emailResmi}
                      onChange={(e) => upd("emailResmi", e.target.value)}
                      className="mt-1.5 shadow-none focus-visible:ring-2"
                    />
                  </div>
                  <div>
                    <Label htmlFor="cfg-telepon-resmi">Telepon resmi</Label>
                    <Input
                      id="cfg-telepon-resmi"
                      value={form.teleponResmi}
                      onChange={(e) => upd("teleponResmi", e.target.value)}
                      className="mt-1.5 shadow-none focus-visible:ring-2"
                    />
                  </div>
                </div>
              </div>

              {error && (
                <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}
            </div>

            <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="flex items-center gap-2 text-sm font-semibold text-navy">
                <QrCode className="size-4 text-emerald-600" />
                Ringkasan Finansial
              </p>
              <p className="text-xs text-muted-foreground">
                Nilai di bawah ini adalah asumsi sistem yang dihitung dari konfigurasi. Angka nyata transaksi mengikuti ledger internal.
              </p>

              <dl className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Potongan Admin
                  </dt>
                  <dd className="mt-1 text-lg font-semibold tabular-nums text-navy">{form.persenAdmin}%</dd>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Biaya Platform
                  </dt>
                  <dd className="mt-1 text-lg font-semibold tabular-nums text-navy">{form.persenPlatform}%</dd>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Bunga Flat
                  </dt>
                  <dd className="mt-1 text-lg font-semibold tabular-nums text-navy">{form.persenBunga}%</dd>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                  <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-emerald-800">
                    Biaya Admin Pinjaman
                  </dt>
                  <dd className="mt-1 text-lg font-semibold tabular-nums text-emerald-900">
                    {form.persenBiayaAdmin}%
                  </dd>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                  <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-emerald-800">
                    Asuransi
                  </dt>
                  <dd className="mt-1 text-lg font-semibold tabular-nums text-emerald-900">
                    {form.persenAsuransi > 0 ? `${form.persenAsuransi}%` : "Tidak dipungut"}
                  </dd>
                </div>
                <div className="col-span-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                  <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-emerald-800">
                    Biaya Ekspres per Tier
                  </dt>
                  <dd className="mt-1 text-sm font-semibold tabular-nums text-emerald-900">
                    {formatRupiah(form.biayaEkspresTier1)} · {formatRupiah(form.biayaEkspresTier2)} ·{" "}
                    {formatRupiah(form.biayaEkspresTier3)}
                  </dd>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Denda Keterlambatan
                  </dt>
                  <dd className="mt-1 text-lg font-semibold tabular-nums text-navy">
                    {form.persenDendaKeterlambatan}%/hari
                  </dd>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Maks LTV Gadai
                  </dt>
                  <dd className="mt-1 text-lg font-semibold tabular-nums text-navy">{form.maxLtvPersen}%</dd>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Plafon Default
                  </dt>
                  <dd className="mt-1 text-lg font-semibold tabular-nums text-navy">
                    {formatRupiah(form.plafonPinjaman)}
                  </dd>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Biaya Integrasi Lama
                  </dt>
                  <dd className="mt-1 text-lg font-semibold tabular-nums text-navy">
                    {form.persenBiayaIntegrasi}%
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </TabsContent>

        {/* TAB 2 — GEOFENCING & KEAMANAN LOKASI */}
        <TabsContent value="geo" className="space-y-5 m-0">
          <div className="grid gap-5 xl:grid-cols-2">
            <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="flex items-center gap-2 text-sm font-semibold text-navy">
                <MapPin className="size-4 text-primary" />
                Ambang Jarak &amp; Retensi Lokasi
              </p>
              <SuffixInput
                id="cfg-mismatch"
                label="Ambang Jarak (Km)"
                value={form.gpsMismatchKm}
                min={1}
                suffix="Km"
                onChange={(v) => upd("gpsMismatchKm", Number(v) || 1)}
                hint="Ambang jarak dari titik acuan."
                withHint
              />
              <SuffixInput
                id="cfg-cair"
                label="Ambang Jarak Akses (Km)"
                value={form.pencairanMaxKm}
                min={1}
                suffix="Km"
                onChange={(v) => upd("pencairanMaxKm", Number(v) || 1)}
                hint="Jarak maks pencairan."
                withHint
              />

              <DividerLabel>Umur &amp; Retensi</DividerLabel>
              <SuffixInput
                id="cfg-lokasi-umur"
                label="Batas Umur Titik Lokasi (Menit)"
                value={form.lokasiMaxUmurMenit}
                min={1}
                suffix="Menit"
                onChange={(v) => upd("lokasiMaxUmurMenit", Math.max(1, Number(v) || 1))}
                hint="Titik lebih tua dari batas ini → aksi aplikasi Peminjam ditolak."
                withHint
              />
              <SuffixInput
                id="cfg-retensi"
                label="Retensi PDP (Hari)"
                value={form.retensiLokasiHari}
                min={RETENSI_LOKASI_BATAS.min}
                max={RETENSI_LOKASI_BATAS.maks}
                suffix="Hari"
                onChange={(v) =>
                  upd(
                    "retensiLokasiHari",
                    Math.min(
                      RETENSI_LOKASI_BATAS.maks,
                      Math.max(RETENSI_LOKASI_BATAS.min, Math.round(Number(v) || RETENSI_LOKASI_BATAS.min)),
                    ),
                  )
                }
                hint="Job harian (00:30 WIB) menghapus titik lokasi lebih tua dari batas ini."
                withHint
              />
            </div>

            <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="flex items-center gap-2 text-sm font-semibold text-navy">
                <MapPin className="size-4 text-emerald-600" />
                Titik Referensi Konfigurasi
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="cfg-vlat">Latitude Vault</Label>
                  <Input
                    id="cfg-vlat"
                    type="number"
                    step="any"
                    value={form.vaultLat}
                    onChange={(e) => upd("vaultLat", Number(e.target.value) || 0)}
                    className="mt-1.5 shadow-none focus-visible:ring-2 tabular-nums"
                  />
                </div>
                <div>
                  <Label htmlFor="cfg-vlng">Longitude Vault</Label>
                  <Input
                    id="cfg-vlng"
                    type="number"
                    step="any"
                    value={form.vaultLng}
                    onChange={(e) => upd("vaultLng", Number(e.target.value) || 0)}
                    className="mt-1.5 shadow-none focus-visible:ring-2 tabular-nums"
                  />
                </div>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                Koordinat ini adalah titik referensi konfigurasi untuk peta dan perhitungan jarak GPS,
                dipakai untuk membandingkan koordinat yang dilaporkan perangkat.
              </p>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs text-muted-foreground">Terakhir diubah oleh</p>
                <p className="mt-1 text-sm font-medium text-navy">{data.diperbaruiOleh}</p>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* TAB 3 — ATURAN SESI & SISTEM TOGGLES */}
        <TabsContent value="sesi" className="space-y-5 m-0">
          <div className="grid gap-5 xl:grid-cols-2">
            <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="flex items-center gap-2 text-sm font-semibold text-navy">
                <Settings2 className="size-4 text-primary" />
                Aturan Sesi &amp; Sistem Toggles
              </p>

              <SuffixInput
                id="cfg-session"
                label="Sesi Timeout (Menit)"
                value={form.sessionTimeoutMenit}
                min={0}
                suffix="Menit"
                onChange={(v) => upd("sessionTimeoutMenit", Math.max(0, Number(v) || 0))}
                hint="Batas waktu sesi, 0 = nonaktif."
                withHint
              />

              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Card Toggles Sistem
                </p>
                <SwitchRow
                  htmlFor="cfg-maintenance"
                  label="Mode Perawatan"
                  hint="Situs menampilkan pengumuman perawatan untuk nasabah."
                  checked={form.maintenanceMode}
                  onChange={(v) => upd("maintenanceMode", v)}
                />
                <SwitchRow
                  htmlFor="cfg-lokasi-gate"
                  label="Gerbang Lokasi Wajib"
                  hint="Akses bisa dibatasi bila koordinat terbaru belum diterima server."
                  checked={form.lokasiWajib}
                  onChange={(v) => upd("lokasiWajib", v)}
                  accent="emerald"
                />
                <SwitchRow
                  htmlFor="cfg-native"
                  label="Lokasi Latar Belakang"
                  hint="Wajib aplikasi native untuk lokasi latar belakang."
                  checked={form.wajibAplikasiNative}
                  onChange={(v) => upd("wajibAplikasiNative", v)}
                />
              </div>

              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Produk Pengajuan
                </p>
                <SwitchRow
                  htmlFor="cfg-produk-pinjaman"
                  label="Pinjaman tunai"
                  hint="Mati: formulirnya disembunyikan dan pengajuan baru ditolak. Pinjaman berjalan tidak berubah."
                  checked={form.produkPinjamanAktif}
                  onChange={(v) => upd("produkPinjamanAktif", v)}
                  accent="emerald"
                />
                <SwitchRow
                  htmlFor="cfg-produk-kredit"
                  label="Kredit barang"
                  hint="Mati: formulir kredit barang disembunyikan dan pengajuan baru ditolak."
                  checked={form.produkKreditAktif}
                  onChange={(v) => upd("produkKreditAktif", v)}
                  accent="emerald"
                />
                <SwitchRow
                  htmlFor="cfg-produk-gadai"
                  label="Gadai"
                  hint="Mati: formulir gadai disembunyikan dan pengajuan baru ditolak."
                  checked={form.produkGadaiAktif}
                  onChange={(v) => upd("produkGadaiAktif", v)}
                  accent="emerald"
                />
              </div>

              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Notifikasi Otomatis
                </p>
                <SwitchRow
                  htmlFor="cfg-notif-wa"
                  label="Notifikasi WhatsApp"
                  hint="Pengingat tagihan untuk semua akun. Kode OTP dan peringatan keamanan tetap dikirim."
                  checked={form.notifWhatsappAktif}
                  onChange={(v) => upd("notifWhatsappAktif", v)}
                  accent="emerald"
                />
                <SwitchRow
                  htmlFor="cfg-notif-email"
                  label="Notifikasi Email"
                  hint="Pengingat tagihan ke alamat email akun nasabah. Akun tanpa email tidak menerima apa pun."
                  checked={form.notifEmailAktif}
                  onChange={(v) => upd("notifEmailAktif", v)}
                  accent="emerald"
                />
              </div>
            </div>

            <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="flex items-center gap-2 text-sm font-semibold text-navy">
                <Settings2 className="size-4 text-emerald-600" />
                Ringkasan Toggles
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Sesi Timeout
                  </dt>
                  <dd className="mt-1 text-lg font-semibold tabular-nums text-navy">
                    {form.sessionTimeoutMenit} menit
                  </dd>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Mode Perawatan
                  </dt>
                  <dd className="mt-1 text-lg font-semibold tabular-nums text-navy">
                    {form.maintenanceMode ? "Aktif" : "Nonaktif"}
                  </dd>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Gerbang Lokasi
                  </dt>
                  <dd className="mt-1 text-lg font-semibold tabular-nums text-navy">
                    {form.lokasiWajib ? "Wajib" : "Opsional"}
                  </dd>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Lokasi Latar
                  </dt>
                  <dd className="mt-1 text-lg font-semibold tabular-nums text-navy">
                    {form.wajibAplikasiNative ? "Wajib" : "Nonaktif"}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </TabsContent>

        {/* TAB 4 — DANGER ZONE & RIWAYAT VERSI */}
        <TabsContent value="danger" className="space-y-5 m-0">
          <div className="grid gap-5 xl:grid-cols-2">
            <DangerBox
              title="Danger Zone · Kill Switch"
              action={
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-red-300 text-red-700"
                  disabled={busy}
                  onClick={() =>
                    wrapBusyStatus(
                      "Kill Switch",
                      async () => {
                        await save(
                          tanpaVersiConfig({ ...form, killSwitch: !form.killSwitch }),
                        );
                      },
                    )
                  }
                >
                  {form.killSwitch ? "Matikan Kill Switch" : "Aktifkan Kill Switch"}
                </Button>
              }
              onAction={() => {}}
              busy={busy}
            >
              Memblokir seluruh pengajuan pinjaman &amp; gadai seketika.
              Pastikan ini hanya digunakan untuk situasi darurat.
            </DangerBox>

            <RiwayatConfigPanel />
          </div>
        </TabsContent>
      </Tabs>

      {/* STICKY FOOTER BAR */}
      <div className="glass-dock sticky bottom-0 z-20 px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Editor terakhir:</span>
            <span className="font-medium text-navy">{data.diperbaruiOleh}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">
              {data.auditTerbaru?.[0]
                ? `${formatWaktuWIB(data.auditTerbaru[0].waktu)} WIB`
                : "—"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => {
                // "Batal" mengembalikan form ke nilai tersimpan terakhir, bukan
                // sekadar membersihkan pesan status.
                setForm(formTersimpan());
                setError(null);
                setStatus(null);
              }}
            >
              Batal
            </Button>
            <Button
              size="sm"
              className="bg-[#064E3B] text-white hover:bg-[#021E17]"
              disabled={busy}
              onClick={simpan}
            >
              {busy ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
              Simpan Konfigurasi
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
