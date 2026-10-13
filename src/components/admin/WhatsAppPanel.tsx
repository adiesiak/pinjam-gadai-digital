import { useAction, useMutation, useQuery } from "convex/react";
import { Loader2, MessageSquare, Send } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/convex/_generated/api";

/** Label chip memakai awalan "+ " supaya jelas tindakannya menyisipkan. */
const TEMPLATE_CHIPS: { label: string; value: string }[] = [
  { label: "{nama}", value: "{nama}" },
  { label: "{ref}", value: "{ref}" },
  { label: "{jumlah}", value: "{jumlah}" },
  { label: "{tanggal}", value: "{tanggal}" },
  { label: "{sisa}", value: "{sisa}" },
  { label: "{denda}", value: "{denda}" },
];

/** Bidang template yang bisa disasar chip variabel. */
type BidangTemplate = "pengingat" | "lokasi" | "status";

function Chip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-medium transition-colors ${
        selected
          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
          : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
      }`}
      onClick={onClick}
    >
      <span aria-hidden className="text-emerald-700">+
      </span>
      {label}
    </button>
  );
}

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
  const [templateStatus, setTemplateStatus] = useState<string | null>(null);
  const [nomorTes, setNomorTes] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);
  const [testPreview, setTestPreview] = useState<{ to: string; text: string } | null>(null);
  // Tab aktif + bidang template yang terakhir difokus, supaya chip variabel
  // menyisipkan ke textarea yang sedang dipakai admin — bukan selalu ke yang
  // pertama.
  const [tab, setTab] = useState("gateway");
  const [bidangAktif, setBidangAktif] = useState<BidangTemplate>("pengingat");

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
    setTemplateStatus(cfg.templateStatus ?? "");
  }
  if (apiUrl === null) return null;

  const simpan = async () => {
    if (!apiUrl || !authHeader || !fieldNomor || !fieldPesan || template === null) return;
    setBusy("save");
    setError(null);
    setStatus(null);
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
        templateStatus: templateStatus ?? "",
      });
      setStatus({ text: "Konfigurasi WhatsApp tersimpan.", ok: true });
      toast.success("Konfigurasi WhatsApp tersimpan.");
    } catch (err) {
      setStatus({ text: err instanceof Error ? err.message : "Gagal menyimpan konfigurasi.", ok: false });
      setError(err instanceof Error ? err.message : "Gagal menyimpan konfigurasi.");
    } finally {
      setBusy(null);
    }
  };

  const tes = async () => {
    if (nomorTes.trim().length < 8) return;
    setBusy("test");
    setError(null);
    const previewText = "Tes integrasi WhatsApp Pinjam Gadai Digital — abaikan pesan ini.";
    setTestPreview({ to: nomorTes.trim(), text: previewText });
    try {
      await sendTest({ nomorTujuan: nomorTes.trim(), isiPesan: previewText });
      setStatus({ text: "Pesan tes terkirim.", ok: true });
      toast.success("Pesan tes terkirim.");
    } catch (err) {
      setStatus({ text: err instanceof Error ? err.message : "Pengiriman tes gagal.", ok: false });
      setError(err instanceof Error ? err.message : "Pengiriman tes gagal.");
    } finally {
      setBusy(null);
    }
  };

  const insertChip = (value: string) => {
    const sisip = (prev: string | null) => (prev ?? "").concat(value);
    if (bidangAktif === "status") setTemplateStatus(sisip);
    else if (bidangAktif === "lokasi") setTemplateLokasi(sisip);
    else setTemplate(sisip);
  };

  return (
    <div className="animate-masuk flex min-h-0 flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-navy">WhatsApp Gateway &amp; Messaging Settings</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Koneksi gateway pengingat &amp; status, template variabel, dan log pengiriman.
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

      <Tabs value={tab} onValueChange={setTab} className="flex-1 space-y-4">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
          <TabsTrigger value="gateway" className="gap-2 text-sm">
            <MessageSquare className="size-4" />
            Tab 1 · Gateway &amp; Template Pesan
          </TabsTrigger>
          <TabsTrigger value="stats" className="gap-2 text-sm">
            <Send className="size-4" />
            Tab 2 · Statistik &amp; Log Pengiriman
          </TabsTrigger>
        </TabsList>

        {/* TAB 1 — GATEWAY & TEMPLATE */}
        <TabsContent value="gateway" className="space-y-4 m-0">
          <div className="grid gap-5 min-h-0 xl:grid-cols-2 xl:gap-6">
            {/* KIRI — KONEKSI & TEMPLATE */}
            <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div>
                <p className="text-sm font-semibold">Koneksi gateway WhatsApp</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Bekerja dengan gateway berbasis token (Fonnte, Wablas, Meta Cloud API,
                  dsb). API key diisi di environment variabel{" "}
                  <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px]">WHATSAPP_API_KEY</code> — tidak pernah disimpan di database.
                </p>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  Kode OTP (login WhatsApp, verifikasi nomor KYC, dan persetujuan
                  transaksi pendana) ikut memakai gateway yang SAMA di atas: satu
                  endpoint dan satu token untuk semua pesan. OTP hanya terkirim saat
                  gateway ini diaktifkan, jadi tidak ada lagi setelan terpisah yang
                  harus diisi.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label htmlFor="wa-url">Endpoint (URL https)</Label>
                  <Input
                    id="wa-url"
                    value={apiUrl}
                    onChange={(e) => setApiUrl(e.target.value)}
                    placeholder="https://api.fonnte.com/send"
                  />
                </div>
                <div>
                  <Label htmlFor="wa-header">Nama header auth</Label>
                  <Input
                    id="wa-header"
                    value={authHeader ?? ""}
                    onChange={(e) => setAuthHeader(e.target.value)}
                    placeholder="Authorization"
                  />
                </div>
                <div>
                  <Label htmlFor="wa-prefix">Prefix token (opsional)</Label>
                  <Input
                    id="wa-prefix"
                    value={authPrefix ?? ""}
                    onChange={(e) => setAuthPrefix(e.target.value)}
                    placeholder=""
                  />
                </div>
                <div>
                  <Label htmlFor="wa-fnomor">Field body untuk nomor</Label>
                  <Input
                    id="wa-fnomor"
                    value={fieldNomor ?? ""}
                    onChange={(e) => setFieldNomor(e.target.value)}
                    placeholder="target"
                  />
                </div>
                <div>
                  <Label htmlFor="wa-fpesan">Field body untuk pesan</Label>
                  <Input
                    id="wa-fpesan"
                    value={fieldPesan ?? ""}
                    onChange={(e) => setFieldPesan(e.target.value)}
                    placeholder="message"
                  />
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="wa-template">Template pesan untuk catatan pinjaman (dikirim via WhatsApp)</Label>
                </div>

                <div className="flex flex-wrap gap-2">
                  {TEMPLATE_CHIPS.map((chip) => (
                    <Chip
                      key={chip.value}
                      label={chip.label}
                      onClick={() => insertChip(chip.value)}
                    />
                  ))}
                </div>

                <Textarea
                  id="wa-template"
                  rows={4}
                  value={template ?? ""}
                  onChange={(e) => setTemplate(e.target.value)}
                  onFocus={() => setBidangAktif("pengingat")}
                  placeholder="{nama}, {ref}, {jumlah}, {tanggal}, {sisa}, {denda}"
                />
                <p className="text-xs leading-5 text-muted-foreground">
                  Placeholder wajib memuat{" "}
                  <code className="rounded bg-slate-100 px-1 text-[11px]">{'{jumlah}'}</code>.
                  Nilainya berasal dari ledger internal. Tulis pesan netral; jangan meminta
                  pelunasan berdasarkan angka ledger internal.
                </p>
              </div>

              <Separator />

              <div className="space-y-3">
                <Label htmlFor="wa-template-status">Template kabar perubahan status pinjaman</Label>
                <Textarea
                  id="wa-template-status"
                  rows={4}
                  value={templateStatus ?? ""}
                  onChange={(e) => setTemplateStatus(e.target.value)}
                  onFocus={() => setBidangAktif("status")}
                  placeholder="Kosongkan untuk memakai template bawaan"
                />
                <p className="text-xs leading-5 text-muted-foreground">
                  Dikirim otomatis setiap admin mengubah status pinjaman, dan bisa dikirim ulang dari
                  dialog review. Placeholder:{" "}
                  <code className="rounded bg-slate-100 px-1 text-[11px]">
                    {'{nama} {ref} {status} {alasan} {diajukan} {disetujui} {kewajiban}'}
                  </code>
                  {" — wajib memuat "}
                  <code className="rounded bg-slate-100 px-1 text-[11px]">{'{status}'}</code>.
                  Kalimat persetujuan sebagian disisipkan otomatis bila nominal yang disetujui lebih
                  kecil daripada pengajuan.
                </p>
              </div>

              <Separator />

              <div className="space-y-3">
                <Label htmlFor="wa-template-lokasi">Template pesan metadata koordinat perangkat</Label>
                <Textarea
                  id="wa-template-lokasi"
                  rows={4}
                  value={templateLokasi ?? ""}
                  onChange={(e) => setTemplateLokasi(e.target.value)}
                  onFocus={() => setBidangAktif("lokasi")}
                  placeholder="Kosongkan untuk memakai template bawaan"
                />
                <p className="text-xs leading-5 text-muted-foreground">
                  Template ini dapat dikirim otomatis maksimum 1×/24 jam saat catatan koordinat perangkat
                  ditandai. Koordinat dicatat sebagai metadata perangkat. Placeholder:{" "}
                  <code className="rounded bg-slate-100 px-1 text-[11px]">{'{nama} {ref}'}</code> — wajib memuat{" "}
                  <code className="rounded bg-slate-100 px-1 text-[11px]">{'{nama}'}</code>. Kosong = pakai template bawaan
                  (nada netral; data lokasi yang dikirim bukan lokasi terverifikasi).
                </p>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">Aktifkan pengiriman</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Pesan dan kode OTP dikirim lewat gateway yang dikonfigurasi. Saat
                    nonaktif, pengiriman dihentikan: OTP tidak berangkat dan pesan
                    tercatat di log sebagai gagal.
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
            </div>

            {/* KANAN — LIVE CHAT PREVIEW */}
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-navy">Live WhatsApp Preview</p>
                <span className="text-[11px] text-muted-foreground">Simulator gelembung chat</span>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center gap-2 rounded-lg bg-emerald-800 px-3 py-2 text-white">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/20 text-[11px] font-semibold">
                    PIN
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-semibold">Pinjaman Digital</p>
                    <p className="text-[10px] opacity-80">Online</p>
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  <div className="flex justify-start">
                    <span className="max-w-[80%] rounded-lg bg-white px-3 py-2 text-xs text-slate-700 shadow-sm">
                      Halo! Bisa bantu info pinjaman?
                    </span>
                  </div>
                  <div className="flex justify-end">
                    <span className="overflow-wrap break-words rounded-lg bg-emerald-800 px-3 py-2 text-xs text-white shadow-sm">
                      {testPreview ? (
                        <>
                          <span className="block text-white/70 text-[10px]">
                            Kiriman tes → {testPreview.to}
                          </span>
                          {testPreview.text}
                        </>
                      ) : (
                        template ? template.replace(/\{[^}]*\}/g, "•") : "Template pesan akan muncul di sini."
                      )}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-muted-foreground">
                {template && template.trim().length === 0
                  ? "Isi template pengingat di kolom kiri untuk melihat pratinjau di sini."
                  : "Placeholders akan diganti saat pesan dirangkai dari data pinjaman."}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* TAB 2 — STATISTIK & LOG */}
        <TabsContent value="stats" className="space-y-4 m-0">
          <div className="grid gap-5 min-h-0 xl:grid-cols-5 xl:gap-6">
            {/* KIRI — STATISTIK & TES */}
            <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
              <p className="flex items-center gap-2 text-sm font-semibold text-navy">
                <Send className="size-4 text-primary" />
                Statistik log
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
                <Button
                  variant="outline"
                  disabled={busy !== null || nomorTes.trim().length < 8}
                  onClick={tes}
                >
                  {busy === "test" ? <Loader2 className="size-4 animate-spin" /> : "Tes"}
                </Button>
              </div>
            </div>

            {/* KANAN — LOG PENGIRIMAN */}
            <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-navy">Log pengiriman (terbaru)</p>
                <span className="text-[11px] text-muted-foreground">
                  {data.logs.length} baris
                </span>
              </div>
              {data.logs.length === 0 ? (
                <p className="mt-3 text-xs text-muted-foreground">Belum ada pengiriman.</p>
              ) : (
                <div className="mt-3 max-h-96 overflow-y-auto rounded-xl border border-slate-200">
                  <Table>
                    <TableHeader className="sticky top-0 bg-slate-50">
                      <TableRow>
                        <TableHead className="text-[11px] uppercase tracking-[0.12em]">
                          Waktu
                        </TableHead>
                        <TableHead className="text-[11px] uppercase tracking-[0.12em]">
                          Nomor tujuan
                        </TableHead>
                        <TableHead className="text-[11px] uppercase tracking-[0.12em]">
                          Jenis
                        </TableHead>
                        <TableHead className="text-[11px] uppercase tracking-[0.12em]">
                          Status
                        </TableHead>
                        <TableHead className="text-[11px] uppercase tracking-[0.12em]">
                          Pesan
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.logs.map((log) => (
                        <TableRow key={log._id}>
                          <TableCell className="align-top text-[11px] tabular-nums text-muted-foreground">
                            {new Date(log.waktu).toLocaleString("id-ID")}
                          </TableCell>
                          <TableCell className="align-top text-xs font-medium tabular-nums">
                            {log.nomorTujuan}
                          </TableCell>
                          <TableCell className="align-top text-xs text-muted-foreground">
                            {log.jenis}
                          </TableCell>
                          <TableCell className="align-top">
                            <Badge
                              className={
                                log.status === "terkirim"
                                  ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
                                  : "bg-red-100 text-red-700 hover:bg-red-100"
                              }
                            >
                              {log.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[16rem] whitespace-normal align-top text-xs text-slate-700">
                            <span className="line-clamp-2">{log.isiPesan}</span>
                            {log.respon && (
                              <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                                {log.respon.slice(0, 80)}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* STICKY FOOTER BAR */}
      <div className="glass-dock sticky bottom-0 z-20 px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {aktif ? (
              <>
                <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                Gateway aktif · pengiriman pesan dibuka
              </>
            ) : (
              <>
                <span className="inline-flex h-2 w-2 rounded-full bg-slate-300" />
                Gateway nonaktif · pesan dicatat tapi tidak dikirim
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              className="bg-[#064E3B] text-white hover:bg-[#021E17]"
              disabled={busy !== null || !apiUrl || !authHeader || !fieldNomor || !fieldPesan || template === null}
              onClick={simpan}
            >
              {busy === "save" ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <Send className="mr-1.5 size-4" />
              )}
              Simpan Konfigurasi WA
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
