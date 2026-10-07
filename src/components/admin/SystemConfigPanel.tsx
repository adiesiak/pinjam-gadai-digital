import { useMutation, useQuery } from "convex/react";
import { Loader2, MapPin, QrCode, Settings2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { api } from "@/convex/_generated/api";
import { formatRupiah } from "@/lib/money";
import { clampPlafon, PLAFON_BATAS } from "@/lib/plafon";
import {
  DEFAULT_CONFIG,
  RETENSI_LOKASI_BATAS,
} from "@/lib/system-config";

export function SystemConfigPanel() {
  const data = useQuery(api.system.getConfigAdmin);
  const save = useMutation(api.system.saveConfig);
  const generateUploadUrl = useMutation(api.system.generatePaymentAssetUploadUrl);
  const [form, setForm] = useState<typeof DEFAULT_CONFIG | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadingQr, setUploadingQr] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (data === undefined) {
    return <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Memuat…</div>;
  }
  if (form === null) setForm({ ...DEFAULT_CONFIG, ...data.config });
  if (form === null) return null;
  const upd = <K extends keyof typeof DEFAULT_CONFIG>(k: K, v: (typeof DEFAULT_CONFIG)[K]) => setForm({ ...form, [k]: v });

  return (
    <div className="animate-masuk grid gap-5 lg:grid-cols-2">
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
        <p className="flex items-center gap-2 text-sm font-semibold text-navy">
          <Settings2 className="size-4 text-primary" /> Asumsi Perhitungan &amp; Pengaturan Akses
        </p>
        <div className="grid grid-cols-3 gap-3">
          {(["persenAdmin", "persenPlatform", "persenBunga"] as const).map((k) => (
            <div key={k}>
              <Label htmlFor={`cfg-${k}`}>
                {k === "persenAdmin"
                  ? "Potongan admin atas uang yang kembali %"
                  : k === "persenPlatform"
                    ? "Biaya platform %"
                    : "Bunga %"}
              </Label>
              <Input
                id={`cfg-${k}`}
                type="number"
                min={0}
                value={form[k]}
                onChange={(e) => upd(k, Math.max(0, Number(e.target.value) || 0))}
                className="tabular-nums"
              />
            </div>
          ))}
        </div>
        <div>
          <Label htmlFor="cfg-integrasi">Biaya integrasi pinjaman lama (%)</Label>
          <Input
            id="cfg-integrasi"
            type="number"
            min={0}
            max={100}
            value={form.persenBiayaIntegrasi}
            onChange={(e) =>
              upd("persenBiayaIntegrasi", Math.min(100, Math.max(0, Number(e.target.value) || 0)))
            }
            className="tabular-nums"
          />
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Dipakai panel Ledger internal saat membukukan pinjaman lama (biaya admin &amp; platform).
            Tidak mengubah biaya pinjaman baru maupun pinjaman yang sudah tercatat.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="cfg-ltv">Maks LTV gadai (%)</Label>
            <Input id="cfg-ltv" type="number" min={1} max={100} value={form.maxLtvPersen} onChange={(e) => upd("maxLtvPersen", Math.min(100, Math.max(1, Number(e.target.value) || 1)))} className="tabular-nums" />
          </div>
          <div>
            <Label htmlFor="cfg-session">Batas waktu sesi (menit, 0 = nonaktif)</Label>
            <Input id="cfg-session" type="number" min={0} value={form.sessionTimeoutMenit} onChange={(e) => upd("sessionTimeoutMenit", Math.max(0, Number(e.target.value) || 0))} className="tabular-nums" />
          </div>
          <div>
            <Label htmlFor="cfg-mismatch">Ambang jarak dari titik acuan (km)</Label>
            <Input id="cfg-mismatch" type="number" min={1} value={form.gpsMismatchKm} onChange={(e) => upd("gpsMismatchKm", Math.max(1, Number(e.target.value) || 1))} className="tabular-nums" />
          </div>
          <div>
            <Label htmlFor="cfg-vaultkm">Ambang jarak akses (km)</Label>
            <Input id="cfg-vaultkm" type="number" min={1} value={form.pencairanMaxKm} onChange={(e) => upd("pencairanMaxKm", Math.max(1, Number(e.target.value) || 1))} className="tabular-nums" />
          </div>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          Ambang jarak dan pola dihitung dari koordinat yang dilaporkan perangkat.
        </p>
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div id="cfg-maintenance-label">
            <p className="text-sm font-medium">Mode perawatan</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Situs menampilkan pengumuman perawatan untuk nasabah.</p>
          </div>
          <Switch aria-labelledby="cfg-maintenance-label" aria-label="Mode perawatan" checked={form.maintenanceMode} onCheckedChange={(v) => upd("maintenanceMode", v)} />
        </div>
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/60 px-4 py-3">
          <div id="cfg-location-gate-label">
            <p className="text-sm font-medium text-emerald-900">Gerbang lokasi wajib</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Akses ke dashboard dan aksi pencatatan dapat dibatasi bila koordinat terbaru belum diterima server. Titik yang dilaporkan perangkat dicatat sebagai metadata.
            </p>
          </div>
          <Switch aria-labelledby="cfg-location-gate-label" aria-label="Gerbang lokasi wajib" checked={form.lokasiWajib} onCheckedChange={(v) => upd("lokasiWajib", v)} />
        </div>
        <div>
          <Label htmlFor="cfg-lokasi-umur">Batas umur titik lokasi (menit)</Label>
          <Input
            id="cfg-lokasi-umur"
            type="number"
            min={1}
            value={form.lokasiMaxUmurMenit}
            onChange={(e) =>
              upd("lokasiMaxUmurMenit", Math.max(1, Number(e.target.value) || 1))
            }
            className="tabular-nums"
          />
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Titik lebih tua dari batas ini → aksi aplikasi Peminjam ditolak server-side. Ini batas akses/pencatatan, bukan konfirmasi pembayaran atau transaksi eksternal.
          </p>
        </div>
        <div>
          <Label htmlFor="cfg-plafon">Plafon pinjaman default (rupiah)</Label>
          <Input
            id="cfg-plafon"
            inputMode="numeric"
            value={form.plafonPinjaman}
            onChange={(e) => {
              const angka = Number(e.target.value.replace(/\D/g, "")) || 0;
              upd("plafonPinjaman", clampPlafon(angka));
            }}
            className="tabular-nums"
          />
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Plafon awal pinjaman tunai. Status lunas tepat waktu pada ledger untuk catatan pinjaman dengan pokok minimal Rp1 juta dapat menaikkan plafon dasar Rp1 juta, hingga Rp10 juta; status dan tanggal ini mengikuti pencatatan ledger internal. Override admin per nasabah didahulukan. Rentang {formatRupiah(PLAFON_BATAS.min)}–{formatRupiah(PLAFON_BATAS.maks)}. Batas kredit barang terpisah: pokok maksimal Rp10 juta, tenor pengajuan maksimal 6 bulan.
          </p>
        </div>
        <div>
          <Label htmlFor="cfg-retensi-lokasi">Retensi jejak lokasi (hari)</Label>
          <Input
            id="cfg-retensi-lokasi"
            type="number"
            min={RETENSI_LOKASI_BATAS.min}
            max={RETENSI_LOKASI_BATAS.maks}
            value={form.retensiLokasiHari}
            onChange={(e) =>
              upd(
                "retensiLokasiHari",
                Math.min(
                  RETENSI_LOKASI_BATAS.maks,
                  Math.max(
                    RETENSI_LOKASI_BATAS.min,
                    Math.round(Number(e.target.value) || RETENSI_LOKASI_BATAS.min),
                  ),
                ),
              )
            }
            className="tabular-nums"
          />
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Job harian (00:30 WIB) menghapus titik lokasi lebih tua dari {form.retensiLokasiHari} hari —
            minimalisasi data UU PDP. Titik milik pinjaman yang belum selesai selalu ditahan minimal 400
            hari sebagai bukti audit, jadi nilai lebih kecil tidak menghapus bukti pinjaman berjalan.
          </p>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div id="cfg-native-location-label">
            <p className="text-sm font-medium">Wajib aplikasi (lokasi latar belakang)</p>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
              Akses ke fitur ini dapat dibatasi kecuali titik lokasi terakhir dilaporkan aplikasi resmi dan perangkat mengirim heartbeat dalam 24 jam terakhir. Titik perangkat dicatat sebagai metadata. Pengguna browser akan ditolak walau pernah memasang aplikasi; tab browser yang dibiarkan terbuka tetap melaporkan titik dari browser. Browser tidak melacak lokasi setelah tab ditutup, jadi menyalakan kebijakan ini sebelum aplikasi Android/iOS dirilis akan memblokir akses pengguna web.
            </p>
          </div>
          <Switch
            aria-labelledby="cfg-native-location-label"
            aria-label="Wajib aplikasi native untuk lokasi latar belakang"
            checked={form.wajibAplikasiNative}
            onCheckedChange={(v) => upd("wajibAplikasiNative", v)}
          />
        </div>
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-red-100 bg-red-50/60 px-4 py-3">
          <div id="cfg-kill-switch-label">
            <p className="text-sm font-medium text-red-700">Kill Switch</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Memblokir seluruh pengajuan pinjaman & gadai seketika.</p>
          </div>
          <Switch aria-labelledby="cfg-kill-switch-label" aria-label="Kill Switch" checked={form.killSwitch} onCheckedChange={(v) => upd("killSwitch", v)} />
        </div>
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold"><QrCode className="size-4 text-primary" /> Instruksi penerima &amp; QRIS</p>
          <p className="text-xs leading-5 text-muted-foreground">Instruksi hanya untuk pengiriman bukti. Bukti dan pencocokan manual tidak mengubah saldo, tagihan, atau status transaksi.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="cfg-payee">Nama pemilik rekening</Label><Input id="cfg-payee" value={form.rekeningUsahaNama} onChange={(e) => upd("rekeningUsahaNama", e.target.value)} /></div>
            <div><Label htmlFor="cfg-bank">Bank</Label><Input id="cfg-bank" value={form.rekeningUsahaBank} onChange={(e) => upd("rekeningUsahaBank", e.target.value)} /></div>
            <div><Label htmlFor="cfg-account">Nomor rekening</Label><Input id="cfg-account" inputMode="numeric" value={form.rekeningUsahaNomor} onChange={(e) => upd("rekeningUsahaNomor", e.target.value.replace(/\D/g, ""))} /></div>
            <div><Label htmlFor="cfg-qris-merchant">Nama merchant QRIS</Label><Input id="cfg-qris-merchant" value={form.qrisMerchantNama} onChange={(e) => upd("qrisMerchantNama", e.target.value)} /></div>
          </div>
          {data.qrisUrl && <img src={data.qrisUrl} alt="QRIS yang diunggah admin" className="max-h-56 rounded-xl border border-slate-200 bg-white object-contain p-2" />}
          <div className="flex flex-wrap items-center gap-3">
            <Label htmlFor="cfg-qris-file" className="sr-only">Unggah gambar QRIS</Label>
            <Input id="cfg-qris-file" type="file" accept="image/png,image/jpeg,image/webp" disabled={uploadingQr} onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5_000_000) {
                setError("QRIS harus berupa gambar maksimal 5 MB.");
                event.target.value = "";
                return;
              }
              setUploadingQr(true);
              setError(null);
              try {
                const url = await generateUploadUrl();
                const response = await fetch(url, { method: "POST", headers: { "Content-Type": file.type }, body: file });
                const result = (await response.json()) as { storageId?: typeof form.qrisImageId };
                if (!response.ok || !result.storageId) throw new Error("Gambar QRIS gagal diunggah.");
                upd("qrisImageId", result.storageId);
                toast.success("QRIS terunggah; simpan konfigurasi untuk menerbitkannya.");
              } catch (err) {
                setError(err instanceof Error ? err.message : "Gagal mengunggah QRIS.");
              } finally {
                setUploadingQr(false);
                event.target.value = "";
              }
            }} />
            {uploadingQr && <Loader2 className="size-4 animate-spin" />}
            {form.qrisImageId && <Button type="button" variant="outline" size="sm" onClick={() => upd("qrisImageId", null)}>Hapus QRIS</Button>}
          </div>
        </section>
        {error && (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        <Button
          disabled={busy || uploadingQr}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await save({ ...form });
              toast.success("Konfigurasi sistem tersimpan.");
            } catch (err) {
              setError(err instanceof Error ? err.message : "Gagal menyimpan konfigurasi.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          Simpan konfigurasi
        </Button>
      </div>
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
        <p className="flex items-center gap-2 text-sm font-semibold text-navy">
          <MapPin className="size-4 text-emerald-600" /> Titik Referensi Konfigurasi
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="cfg-vlat">Latitude vault</Label>
            <Input id="cfg-vlat" type="number" step="any" value={form.vaultLat} onChange={(e) => upd("vaultLat", Number(e.target.value) || 0)} className="tabular-nums" />
          </div>
          <div>
            <Label htmlFor="cfg-vlng">Longitude vault</Label>
            <Input id="cfg-vlng" type="number" step="any" value={form.vaultLng} onChange={(e) => upd("vaultLng", Number(e.target.value) || 0)} className="tabular-nums" />
          </div>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          Koordinat ini adalah titik referensi konfigurasi untuk peta dan perhitungan jarak GPS,
          dipakai untuk membandingkan koordinat yang dilaporkan perangkat.
        </p>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs text-muted-foreground">Terakhir diubah oleh</p>
          <p className="mt-1 text-sm font-medium text-navy">{data.diperbaruiOleh}</p>
        </div>
      </div>
    </div>
  );
}
