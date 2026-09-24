import { useAction, useMutation, useQuery } from "convex/react";
import { Database, FileDown, Loader2, Lock, MapPin, MessageSquare, Settings2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import { formatRupiah } from "@/lib/money";
import { DEFAULT_CONFIG } from "@/lib/system-config";

// =====================================================================
// Panel WhatsApp — konfigurasi gateway, template, tes, dan log
// =====================================================================

export function WhatsAppPanel() {
  const data = useQuery(api.whatsapp.getAdminConfig);
  const save = useMutation(api.whatsapp.saveConfig);
  const sendTest = useAction(api.whatsapp.sendTest);

  const [apiUrl, setApiUrl] = useState<string | null>(null);
  const [authHeader, setAuthHeader] = useState<string | null>(null);
  const [authPrefix, setAuthPrefix] = useState<string | null>(null);
  const [fieldNomor, setFieldNomor] = useState<string | null>(null);
  const [fieldPesan, setFieldPesan] = useState<string | null>(null);
  const [aktif, setAktif] = useState(false);
  const [template, setTemplate] = useState<string | null>(null);
  const [nomorTes, setNomorTes] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (data === undefined) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Memuat pengaturan WhatsApp…
      </div>
    );
  }

  const cfg = data.config;
  // Inisialisasi form sekali dari data server (state lokal menyusul editor).
  if (apiUrl === null) {
    setApiUrl(cfg.apiUrl ?? "");
    setAuthHeader(cfg.authHeader ?? "Authorization");
    setAuthPrefix(cfg.authPrefix ?? "");
    setFieldNomor(cfg.fieldNomor ?? "target");
    setFieldPesan(cfg.fieldPesan ?? "message");
    setAktif(cfg.aktif === true);
    setTemplate(cfg.templatePengingat ?? "");
  }
  if (apiUrl === null) return null;

  const simpan = async () => {
    if (!apiUrl || !authHeader || !fieldNomor || !fieldPesan || template === null) return;
    setBusy("save");
    setError(null);
    try {
      await save({
        apiUrl,
        authHeader,
        authPrefix: authPrefix ?? "",
        fieldNomor,
        fieldPesan,
        aktif,
        templatePengingat: template,
      });
      toast.success("Konfigurasi WhatsApp tersimpan.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan konfigurasi.");
    } finally {
      setBusy(null);
    }
  };

  const tes = async () => {
    setBusy("test");
    setError(null);
    try {
      await sendTest({ nomorTujuan: nomorTes, isiPesan: "Tes integrasi WhatsApp Pinjam Gadai Digital — abaikan pesan ini." });
      toast.success("Pesan tes terkirim.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pengiriman tes gagal.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <div className="space-y-4 rounded-2xl border border-sky-100 bg-white p-5">
        <div>
          <p className="text-sm font-semibold">Koneksi gateway WhatsApp</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Bekerja dengan gateway berbasis token (Fonnte, Wablas, Meta Cloud API,
            dsb). API key diisi di environment variabel <code className="rounded bg-secondary px-1 py-0.5 text-[11px]">WHATSAPP_API_KEY</code> — tidak pernah disimpan di database.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="wa-url">Endpoint (URL https)</Label>
            <Input id="wa-url" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} placeholder="https://api.fonnte.com/send" />
          </div>
          <div>
            <Label htmlFor="wa-header">Nama header auth</Label>
            <Input id="wa-header" value={authHeader ?? ""} onChange={(e) => setAuthHeader(e.target.value)} placeholder="Authorization" />
          </div>
          <div>
            <Label htmlFor="wa-prefix">Prefix token (opsional)</Label>
            <Input id="wa-prefix" value={authPrefix ?? ""} onChange={(e) => setAuthPrefix(e.target.value)} placeholder="" />
          </div>
          <div>
            <Label htmlFor="wa-fnomor">Field body untuk nomor</Label>
            <Input id="wa-fnomor" value={fieldNomor ?? ""} onChange={(e) => setFieldNomor(e.target.value)} placeholder="target" />
          </div>
          <div>
            <Label htmlFor="wa-fpesan">Field body untuk pesan</Label>
            <Input id="wa-fpesan" value={fieldPesan ?? ""} onChange={(e) => setFieldPesan(e.target.value)} placeholder="message" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="wa-template">Template pengingat penagihan</Label>
            <Textarea
              id="wa-template"
              rows={4}
              value={template ?? ""}
              onChange={(e) => setTemplate(e.target.value)}
              placeholder="{nama}, {ref}, {jumlah}, {tanggal}, {sisa}, {denda}"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Placeholder: <code className="rounded bg-secondary px-1">{"{nama} {ref} {jumlah} {tanggal} {sisa} {denda}"}</code> — wajib memuat <code className="rounded bg-secondary px-1">{"{jumlah}"}</code>.
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-xl border border-sky-100 bg-secondary/40 px-4 py-3">
          <div>
            <p className="text-sm font-medium">Aktifkan pengiriman</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Saat nonaktif, percobaan kirim tetap tercatat di log dengan status gagal.
            </p>
          </div>
          <Switch checked={aktif} onCheckedChange={setAktif} />
        </div>
        {error && (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>
        )}
        <Button className="gradient-primary rounded-full border-0" disabled={busy !== null} onClick={simpan}>
          {busy === "save" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          Simpan konfigurasi
        </Button>
      </div>

      <div className="space-y-4">
        <div className="rounded-2xl border border-sky-100 bg-white p-5">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <MessageSquare className="size-4 text-primary" /> Statistik log
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            {[
              ["Total", `${data.statistik.total}`],
              ["Terkirim", `${data.statistik.terkirim}`],
              ["Gagal", `${data.statistik.gagal}`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-secondary/50 px-2 py-3">
                <p className="text-lg font-semibold tabular-nums text-navy">{value}</p>
                <p className="text-[11px] text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
          <Separator className="my-4" />
          <p className="text-sm font-semibold">Kirim pesan tes</p>
          <div className="mt-2 flex gap-2">
            <Input
              value={nomorTes}
              onChange={(e) => setNomorTes(e.target.value.replace(/[^\d+]/g, ""))}
              placeholder="6281234567890"
              className="tabular-nums"
            />
            <Button variant="outline" disabled={busy !== null || nomorTes.trim().length < 8} onClick={tes}>
              {busy === "test" ? <Loader2 className="size-4 animate-spin" /> : "Tes"}
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-sky-100 bg-white p-5">
          <p className="text-sm font-semibold">Log pengiriman (terbaru)</p>
          {data.logs.length === 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">Belum ada pengiriman.</p>
          ) : (
            <ul className="mt-3 max-h-96 space-y-2 overflow-y-auto pr-1">
              {data.logs.map((log) => (
                <li key={log._id} className="rounded-xl border border-border/50 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-medium tabular-nums">{log.nomorTujuan}</span>
                    <Badge
                      className={
                        log.status === "terkirim"
                          ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
                          : "bg-red-100 text-red-700 hover:bg-red-100"
                      }
                    >
                      {log.status}
                    </Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{log.isiPesan}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {new Date(log.waktu).toLocaleString("id-ID")} · jenis {log.jenis}
                    {log.respon ? ` · ${log.respon.slice(0, 80)}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export function BackupPanel() {
  const snapshot = useQuery(api.system.snapshotData);
  const ledgerRows = useQuery(api.admin.ledgerRows);
  const auditData = useQuery(api.system.getConfigAdmin);
  const catat = useMutation(api.system.catatBackup);
  const [busy, setBusy] = useState<string | null>(null);

  const unduhFile = (nama: string, isi: string, mime: string) => {
    const blob = new Blob([isi], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nama;
    a.click();
    URL.revokeObjectURL(url);
  };

  const unduhJson = async () => {
    if (!snapshot) return;
    setBusy("json");
    try {
      unduhFile(`pindai-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(snapshot, null, 2), "application/json");
      await catat({ jenis: "snapshot-json" });
      toast.success("Snapshot JSON terunduh & tercatat di audit.");
    } finally {
      setBusy(null);
    }
  };

  const unduhCsv = async () => {
    if (!ledgerRows) return;
    setBusy("csv");
    try {
      const head = "waktu,grup,akun,arah,jumlah,jenis,keterangan,aktor";
      const baris = ledgerRows
        .map((r) => `${new Date(r.waktu).toISOString()},${r.groupId},"${r.akun}",${r.arah},${r.jumlah},${r.jenis},"${r.keterangan}","${r.aktor}"`)
        .join("\n");
      unduhFile(`pindai-ledger-${new Date().toISOString().slice(0, 10)}.csv`, `${head}\n${baris}`, "text/csv");
      await catat({ jenis: "ledger-csv" });
      toast.success("Export CSV ledger terunduh.");
    } finally {
      setBusy(null);
    }
  };

  const unduhAuditPdf = async () => {
    if (!auditData) return;
    setBusy("pdf");
    try {
      const log = auditData.auditTerbaru;
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>Audit Trail PINDAI</title><style>body{font-family:system-ui,sans-serif;padding:32px;color:#0F172A}h1{font-size:20px}table{width:100%;border-collapse:collapse;font-size:12px}td,th{border:1px solid #e2e8f0;padding:6px 8px;text-align:left}</style></head><body><h1>Audit Trail — Pinjam Gadai Digital</h1><p>Dicetak: ${new Date().toLocaleString("id-ID")}</p><table><tr><th>Waktu</th><th>Aktor</th><th>Aksi</th><th>Target</th><th>Detail</th></tr>${log
        .map((a) => `<tr><td>${new Date(a.waktu).toLocaleString("id-ID")}</td><td>${a.aktorLabel}</td><td>${a.aksi}</td><td>${a.target ?? "-"}</td><td>${a.detail ?? "-"}</td></tr>`)
        .join("")}</table></body></html>`;
      const w = window.open("", "_blank");
      if (w) {
        w.document.write(html);
        w.document.close();
        w.print();
      }
      await catat({ jenis: "audit-pdf" });
      toast.success("Audit log dikirim ke dialog cetak PDF.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-4 rounded-2xl border border-sky-100 bg-white p-5">
        <p className="flex items-center gap-2 text-sm font-semibold text-navy">
          <Database className="size-4 text-sky-600" /> Backup Data 1-Click
        </p>
        <div className="space-y-2">
          <Button variant="outline" className="w-full justify-start rounded-2xl" disabled={busy !== null || !snapshot} onClick={unduhJson}>
            {busy === "json" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FileDown className="mr-2 size-4 text-sky-600" />}
            Download Database Snapshot (.JSON)
          </Button>
          <Button variant="outline" className="w-full justify-start rounded-2xl" disabled={busy !== null || !ledgerRows} onClick={unduhCsv}>
            {busy === "csv" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FileDown className="mr-2 size-4 text-emerald-600" />}
            Export Ledger & Mutasi (.CSV)
          </Button>
          <Button variant="outline" className="w-full justify-start rounded-2xl" disabled={busy !== null || !auditData} onClick={unduhAuditPdf}>
            {busy === "pdf" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FileDown className="mr-2 size-4 text-amber-600" />}
            Export Audit Log (.PDF)
          </Button>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          Snapshot memuat seluruh pinjaman, gadai, setoran, pendanaan, dan pengguna (email disamarkan). Semua unduhan tercatat di audit trail.
        </p>
      </div>
      <div className="space-y-4 rounded-2xl border border-sky-100 bg-white p-5">
        <p className="flex items-center gap-2 text-sm font-semibold text-navy">
          <Lock className="size-4 text-emerald-600" /> Proteksi Data
        </p>
        <div className="rounded-2xl border border-sky-100 bg-secondary/40 px-4 py-3">
          <p className="text-sm font-medium">Auto-Watermark KTP</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Setiap dokumen KYC yang dibuka reviewer diberi overlay transparan VERIFIKASI PINDAI — mencegah penyalahgunaan foto identitas.
          </p>
        </div>
        <div className="rounded-2xl border border-sky-100 bg-secondary/40 px-4 py-3">
          <p className="text-sm font-medium">Session Timeout Admin</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">Logout otomatis saat admin pasif diatur di tab Pengaturan System (default 30 menit).</p>
        </div>
        <div className="rounded-2xl border border-sky-100 bg-secondary/40 px-4 py-3">
          <p className="text-sm font-medium">Backup Ready</p>
          <p className="mt-1 text-xs leading-5 text-emerald-700">
            Snapshot siap: {snapshot ? `${snapshot.jumlah.loans} pinjaman, ${snapshot.jumlah.pawns} gadai` : "—"} · database dapat dipulihkan dari file JSON.
          </p>
        </div>
      </div>
    </div>
  );
}

export function SystemConfigPanel() {
  const data = useQuery(api.system.getConfigAdmin);
  const save = useMutation(api.system.saveConfig);
  const [form, setForm] = useState<typeof DEFAULT_CONFIG | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (data === undefined) {
    return <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Memuat…</div>;
  }
  if (form === null) setForm({ ...DEFAULT_CONFIG, ...data.config });
  if (form === null) return null;
  const upd = <K extends keyof typeof DEFAULT_CONFIG>(k: K, v: (typeof DEFAULT_CONFIG)[K]) => setForm({ ...form, [k]: v });

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-4 rounded-2xl border border-sky-100 bg-white p-5">
        <p className="flex items-center gap-2 text-sm font-semibold text-navy">
          <Settings2 className="size-4 text-sky-600" /> Persentase Biaya & Bunga
        </p>
        <div className="grid grid-cols-3 gap-3">
          {(["persenAdmin", "persenPlatform", "persenBunga"] as const).map((k) => (
            <div key={k}>
              <Label htmlFor={`cfg-${k}`}>{k === "persenAdmin" ? "Biaya admin %" : k === "persenPlatform" ? "Biaya platform %" : "Bunga %"}</Label>
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
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="cfg-ltv">Maks LTV gadai (%)</Label>
            <Input id="cfg-ltv" type="number" min={1} max={100} value={form.maxLtvPersen} onChange={(e) => upd("maxLtvPersen", Math.min(100, Math.max(1, Number(e.target.value) || 1)))} className="tabular-nums" />
          </div>
          <div>
            <Label htmlFor="cfg-session">Session timeout (menit, 0 = off)</Label>
            <Input id="cfg-session" type="number" min={0} value={form.sessionTimeoutMenit} onChange={(e) => upd("sessionTimeoutMenit", Math.max(0, Number(e.target.value) || 0))} className="tabular-nums" />
          </div>
          <div>
            <Label htmlFor="cfg-mismatch">Radius mismatch GPS (km)</Label>
            <Input id="cfg-mismatch" type="number" min={1} value={form.gpsMismatchKm} onChange={(e) => upd("gpsMismatchKm", Math.max(1, Number(e.target.value) || 1))} className="tabular-nums" />
          </div>
          <div>
            <Label htmlFor="cfg-vaultkm">Radius pencairan maks (km)</Label>
            <Input id="cfg-vaultkm" type="number" min={1} value={form.pencairanMaxKm} onChange={(e) => upd("pencairanMaxKm", Math.max(1, Number(e.target.value) || 1))} className="tabular-nums" />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-sky-100 bg-secondary/40 px-4 py-3">
          <div>
            <p className="text-sm font-medium">Maintenance Mode</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Situs menampilkan pengumuman perawatan untuk nasabah.</p>
          </div>
          <Switch checked={form.maintenanceMode} onCheckedChange={(v) => upd("maintenanceMode", v)} />
        </div>
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-red-100 bg-red-50/60 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-red-700">Kill Switch</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Memblokir seluruh pengajuan pinjaman & gadai seketika.</p>
          </div>
          <Switch checked={form.killSwitch} onCheckedChange={(v) => upd("killSwitch", v)} />
        </div>
        {error && <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
        <Button
          className="gradient-primary rounded-full border-0"
          disabled={busy}
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
      <div className="space-y-4 rounded-2xl border border-sky-100 bg-white p-5">
        <p className="flex items-center gap-2 text-sm font-semibold text-navy">
          <MapPin className="size-4 text-emerald-600" /> Lokasi Gudang Brankas
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
          Koordinat ini menjadi pusat peta Live Location dan acuan perhitungan jarak GPS mismatch peminjam.
        </p>
        <div className="rounded-2xl border border-sky-100 bg-secondary/40 px-4 py-3">
          <p className="text-xs text-muted-foreground">Terakhir diubah oleh</p>
          <p className="mt-1 text-sm font-medium text-navy">{data.diperbaruiOleh}</p>
        </div>
      </div>
    </div>
  );
}

export function AuditTrailPanel() {
  const data = useQuery(api.system.getConfigAdmin);
  if (data === undefined) {
    return <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Memuat…</div>;
  }
  return (
    <div className="rounded-2xl border border-sky-100 bg-white">
      <div className="flex items-center justify-between px-5 py-4">
        <p className="text-sm font-semibold text-navy">Rekam jejak aktivitas admin</p>
        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">{data.auditTerbaru.length} entri terbaru</Badge>
      </div>
      <ul className="divide-y divide-border/40">
        {data.auditTerbaru.map((a) => (
          <li key={a._id} className="px-5 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm">
                <span className="font-semibold text-navy">{a.aktorLabel}</span>{" "}
                <Badge variant="outline" className="mx-1 text-[10px] uppercase">{a.aksi}</Badge>{" "}
                <span className="text-muted-foreground">{a.target ?? ""}</span>
              </p>
              <span className="text-xs tabular-nums text-muted-foreground">{new Date(a.waktu).toLocaleString("id-ID")}</span>
            </div>
            {a.detail && <p className="mt-1 text-xs text-muted-foreground">{a.detail}</p>}
          </li>
        ))}
        {data.auditTerbaru.length === 0 && (
          <li className="px-5 py-6 text-sm text-muted-foreground">Belum ada aktivitas tercatat.</li>
        )}
      </ul>
    </div>
  );
}
