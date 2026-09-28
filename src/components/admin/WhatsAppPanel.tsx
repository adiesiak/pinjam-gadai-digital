import { useAction, useMutation, useQuery } from "convex/react";
import { Loader2, MessageSquare } from "lucide-react";
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

/**
 * Panel WhatsApp — konfigurasi gateway, template, tes, dan log.
 */
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
  const [templateLokasi, setTemplateLokasi] = useState<string | null>(null);
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
    setTemplateLokasi(cfg.templateLokasi ?? "");
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
        templateLokasi: templateLokasi ?? "",
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
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
        <div>
          <p className="text-sm font-semibold">Koneksi gateway WhatsApp</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Bekerja dengan gateway berbasis token (Fonnte, Wablas, Meta Cloud API,
            dsb). API key diisi di environment variabel <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px]">WHATSAPP_API_KEY</code> — tidak pernah disimpan di database.
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
              Placeholder: <code className="rounded bg-slate-100 px-1">{"{nama} {ref} {jumlah} {tanggal} {sisa} {denda}"}</code> — wajib memuat <code className="rounded bg-slate-100 px-1">{"{jumlah}"}</code>.
            </p>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="wa-template-lokasi">Template peringatan lokasi dicurigai</Label>
            <Textarea
              id="wa-template-lokasi"
              rows={4}
              value={templateLokasi ?? ""}
              onChange={(e) => setTemplateLokasi(e.target.value)}
              placeholder="Kosongkan untuk memakai template bawaan"
            />
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Dikirim otomatis maksimum 1×/24 jam per nasabah saat titik lokasinya
              ditandai (mis. koordinat beku berulang). Placeholder:{" "}
              <code className="rounded bg-slate-100 px-1">{"{nama} {ref}"}</code> — wajib memuat{" "}
              <code className="rounded bg-slate-100 px-1">{"{nama}"}</code>. Kosong = pakai template bawaan
              (nada menolong, tanpa ancaman sanksi).
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div>
            <p className="text-sm font-medium">Aktifkan pengiriman</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Saat nonaktif, percobaan kirim tetap tercatat di log dengan status gagal.
            </p>
          </div>
          <Switch checked={aktif} onCheckedChange={setAktif} />
        </div>
        {error && (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        <Button disabled={busy !== null} onClick={simpan}>
          {busy === "save" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          Simpan konfigurasi
        </Button>
      </div>

      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <MessageSquare className="size-4 text-primary" /> Statistik log
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            {[
              ["Total", `${data.statistik.total}`],
              ["Terkirim", `${data.statistik.terkirim}`],
              ["Gagal", `${data.statistik.gagal}`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-slate-50 px-2 py-3">
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

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-semibold">Log pengiriman (terbaru)</p>
          {data.logs.length === 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">Belum ada pengiriman.</p>
          ) : (
            <ul className="mt-3 max-h-96 space-y-2 overflow-y-auto pr-1">
              {data.logs.map((log) => (
                <li key={log._id} className="rounded-xl border border-slate-200 px-3 py-2">
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
