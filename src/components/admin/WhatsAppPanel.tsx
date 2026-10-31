import { useAction, useMutation, useQuery } from "convex/react";
import { Loader2, MessageSquare, RotateCcw, Send, Undo2 } from "lucide-react";
import { useState } from "react";
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
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/convex/_generated/api";
import { formatWaktuWIB } from "@/lib/waktu";
import {
  CONTOH_NILAI_WA,
  JENIS_TEMPLATE_WA,
  KETERANGAN_JENIS_WA,
  KETERANGAN_PLACEHOLDER_WA,
  LABEL_JENIS_WA,
  PLACEHOLDER_DIIZINKAN,
  PLACEHOLDER_WAJIB,
  TEMPLATE_BAWAAN_WA,
  jenisRamahWa,
  placeholderDipakai,
  placeholderWajibHilang,
  rangkaiPesanWa,
  validasiTemplateWa,
  type JenisTemplateWa,
  type PlaceholderWa,
} from "@/lib/templatePesanWa";

/* ==========================================================================
 * Manajemen "Template pesan"
 * ==========================================================================
 * Setiap jenis pesan punya aturan sendiri (placeholder wajib, placeholder yang
 * boleh dipakai, teks bawaan), dan aturan itu hidup di `lib/templatePesanWa`
 * supaya panel, validasi server, dan pengirim otomatis membaca daftar yang sama.
 * Komponen di bawah hanya menampilkan aturan itu: chip yang menyisipkan,
 * penanda placeholder wajib yang belum ada, tombol "Lihat bawaan"/"Reset", dan
 * pratinjau yang dirangkai dengan nilai contoh yang sama dengan pengirim.
 *
 * Design Read: meja kerja admin PINDAI untuk petugas operasi, bahasa visual
 * kertas hangat + kuningan (DESIGN.md), dial ENERGY 1 / RHYTHM 2 / MOTION 1.
 *
 * Alasan keputusan tampilan, satu baris masing-masing:
 * - Warna: primary, success, dan slate adalah token preset `tinta` yang
 *   sudah dipakai panel admin ini (kuningan di atas kertas hangat), bukan warna
 *   baru yang ditempel di atas sistem yang ada.
 * - Bentuk pil hanya untuk chip placeholder, supaya baris chip terbaca sebagai
 *   daftar sisipan dan bukan kontrol formulir; kartu, input, dan textarea tetap
 *   beradius sedang sesuai konvensi panel admin.
 * - Ikon `Undo2` (Lihat bawaan) dan `RotateCcw` (Reset) dipakai karena gambarnya
 *   menyatakan arah tindakannya, dan set ikonnya sama dengan panel lain.
 * - Pratinjau hadir di dalam editor, bukan di kartu terpisah, karena yang ingin
 *   dilihat admin adalah perubahan pada template yang sedang ia sunting.
 * - Label kelompok memakai huruf besar 11px dengan tracking ringan, sama seperti
 *   header tabel panel ini: fungsinya menamai kelompok field, bukan menghias
 *   judul, dan ia tidak pernah berdiri di atas sebuah headline.
 */

/** Teks yang dipakai editor: kolom kosong berarti teks bawaan. */
function teksEfektifWa(jenis: JenisTemplateWa, nilai: string): string {
  const isi = nilai.trim();
  return isi === "" ? TEMPLATE_BAWAAN_WA[jenis] : isi;
}

/** Satu editor template: chip, validasi, tombol bawaan/reset, pratinjau. */
export function EditorTemplateWa({
  jenis,
  nilai,
  onChange,
  sibuk = false,
}: {
  jenis: JenisTemplateWa;
  nilai: string;
  onChange: (teks: string) => void;
  sibuk?: boolean;
}) {
  const bawaan = TEMPLATE_BAWAAN_WA[jenis];
  const dipakaiBawaan = nilai.trim() === "";
  const teks = teksEfektifWa(jenis, nilai);
  const sah = validasiTemplateWa(jenis, teks);
  const habis = placeholderWajibHilang(jenis, teks);
  const izin = PLACEHOLDER_DIIZINKAN[jenis];
  const dipakai = placeholderDipakai(teks);
  const pratinjau = rangkaiPesanWa(teks, CONTOH_NILAI_WA);
  const idArea = `wa-template-${jenis}`;

  const sisip = (nama: PlaceholderWa) => {
    if (nilai.trim() === "") {
      onChange(`{${nama}}`);
      return;
    }
    const perluSpasi = !/\s$/.test(nilai);
    onChange(`${nilai}${perluSpasi ? " " : ""}{${nama}}`);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Label htmlFor={idArea} className="text-sm font-semibold text-navy">
            {LABEL_JENIS_WA[jenis]}
          </Label>
          <p className="mt-1 max-w-prose text-xs leading-5 text-muted-foreground">
            {KETERANGAN_JENIS_WA[jenis]}
          </p>
        </div>
        <Badge
          className={
            dipakaiBawaan
              ? "bg-slate-100 text-slate-600 hover:bg-slate-100"
              : "border-primary/20 bg-primary/5 text-primary hover:bg-primary/5"
          }
        >
          {dipakaiBawaan ? "Memakai bawaan" : "Diubah"}
        </Badge>
      </div>

      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Placeholder yang bisa dipakai
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {izin.map((nama) => {
            const wajib = PLACEHOLDER_WAJIB[jenis].includes(nama);
            const terpakai = dipakai.includes(nama);
            return (
              <button
                key={nama}
                type="button"
                title={KETERANGAN_PLACEHOLDER_WA[nama]}
                onClick={() => sisip(nama)}
                disabled={sibuk}
                className={`inline-flex min-h-11 items-center rounded-full border px-3 text-[11px] font-medium tabular-nums transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50 ${
                  wajib && !terpakai
                    ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
                    : terpakai
                      ? "border-primary/30 bg-primary/5 text-primary hover:bg-primary/10"
                      : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                }`}
              >
                {`+{${nama}}`}
                {wajib && (
                  <span className="ml-1 text-[10px] font-semibold">wajib</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <Textarea
        id={idArea}
        rows={5}
        value={nilai}
        onChange={(e) => onChange(e.target.value)}
        placeholder={bawaan}
        disabled={sibuk}
        aria-describedby={`${idArea}-status`}
      />

      <p
        id={`${idArea}-status`}
        role={sah.ok ? "status" : "alert"}
        className={`text-xs leading-5 ${sah.ok ? "text-muted-foreground" : "text-red-600"}`}
      >
        {sah.ok
          ? dipakaiBawaan
            ? "Kosong berarti memakai teks bawaan di atas; teks bawaan sudah memuat semua placeholder wajibnya."
            : "Template siap dipakai."
          : sah.alasan}
      </p>
      {!sah.ok && habis.length > 0 && (
        <p className="text-xs leading-5 text-red-600">
          Tambahkan {habis.map((p) => `{${p}}`).join(", ")} lewat chip di atas.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={sibuk}
          onClick={() => onChange(bawaan)}
        >
          <Undo2 className="mr-1.5 size-3.5" aria-hidden="true" />
          Lihat bawaan
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={sibuk || dipakaiBawaan}
          onClick={() => onChange("")}
        >
          <RotateCcw className="mr-1.5 size-3.5" aria-hidden="true" />
          Reset
        </Button>
        <span className="text-[11px] leading-4 text-muted-foreground">
          Lihat bawaan mengisi kolom dengan teks bawaan; Reset mengosongkannya.
        </span>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Pratinjau pesan
          </p>
          <span className="text-[11px] text-muted-foreground">
            Data contoh, bukan data nasabah
          </span>
        </div>
        <div className="mt-2 flex justify-end">
          <span className="max-w-[92%] rounded-lg bg-primary px-3 py-2 text-xs leading-5 text-primary-foreground shadow-sm">
            <span className="block whitespace-pre-line break-words">
              {pratinjau.isi}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

/** Daftar semua jenis pesan + editor untuk jenis yang sedang dipilih. */
export function ManajemenTemplateWa({
  nilai,
  onChange,
  jenisAktif,
  onPilihJenis,
  sibuk = false,
}: {
  nilai: Readonly<Record<string, string>>;
  onChange: (jenis: JenisTemplateWa, teks: string) => void;
  jenisAktif: JenisTemplateWa;
  onPilihJenis: (jenis: JenisTemplateWa) => void;
  sibuk?: boolean;
}) {
  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <p className="text-sm font-semibold text-navy">
          Manajemen template pesan
        </p>
        <p className="mt-1 max-w-prose text-xs leading-5 text-muted-foreground">
          Satu template untuk setiap jenis pesan: pengingat H-3, H-1, dan hari
          H, keterlambatan tahap 1 dan 2, konfirmasi pembayaran, pelunasan,
          pencairan, serta kode OTP. Kolom yang dibiarkan kosong memakai teks
          bawaan yang sudah sopan dan netral.
        </p>
      </div>

      <div
        className="flex flex-wrap gap-1.5"
        role="group"
        aria-label="Jenis template pesan"
      >
        {JENIS_TEMPLATE_WA.map((jenis) => {
          const diubah = (nilai[jenis] ?? "").trim() !== "";
          const aktif = jenis === jenisAktif;
          return (
            <button
              key={jenis}
              type="button"
              aria-pressed={aktif}
              onClick={() => onPilihJenis(jenis)}
              className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-[11px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none ${
                aktif
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
              }`}
            >
              {LABEL_JENIS_WA[jenis]}
              {diubah && (
                <span
                  aria-label="diubah"
                  className={`inline-block size-1.5 rounded-full ${
                    aktif ? "bg-white" : "bg-primary"
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>

      <EditorTemplateWa
        jenis={jenisAktif}
        nilai={nilai[jenisAktif] ?? ""}
        onChange={(teks) => onChange(jenisAktif, teks)}
        sibuk={sibuk}
      />
    </div>
  );
}

/** Template yang boleh disimpan: terisi DAN lolos validasi jenisnya. */
function kumpulkanTemplateTersimpan(
  nilai: Readonly<Record<string, string>>,
): Record<string, string> {
  const hasil: Record<string, string> = {};
  for (const jenis of JENIS_TEMPLATE_WA) {
    const isi = (nilai[jenis] ?? "").trim();
    if (isi !== "" && validasiTemplateWa(jenis, isi).ok) hasil[jenis] = isi;
  }
  return hasil;
}

/** Semua template yang terisi sudah lolos validasi. */
function semuaTemplateSah(nilai: Readonly<Record<string, string>>): boolean {
  for (const jenis of JENIS_TEMPLATE_WA) {
    const isi = (nilai[jenis] ?? "").trim();
    if (isi === "") continue;
    if (!validasiTemplateWa(jenis, isi).ok) return false;
  }
  return true;
}

/**
 * Warna lencana status pengiriman.
 *
 * `mengirim` adalah klaim yang belum selesai: pengingat baru menulis status ini
 * sebelum gateway menjawab. Ia bukan kegagalan, jadi tidak boleh tampil merah
 * seperti `gagal` — tetapi juga tidak boleh tampak sukses sebelum ada jawaban.
 */
function kelasStatusLog(status: string): string {
  if (status === "terkirim") return "border-success-border bg-success-soft text-success-foreground hover:bg-success-soft";
  if (status === "mengirim") return "bg-amber-100 text-amber-800 hover:bg-amber-100";
  return "bg-red-100 text-red-700 hover:bg-red-100";
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
  // Template per jenis; `null` = belum diisi dari server.
  const [templates, setTemplates] = useState<Record<string, string> | null>(
    null,
  );
  const [jenisAktif, setJenisAktif] = useState<JenisTemplateWa>("pengingat_h3");
  const [nomorTes, setNomorTes] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(
    null,
  );
  const [testPreview, setTestPreview] = useState<{
    to: string;
    text: string;
  } | null>(null);
  const [tab, setTab] = useState("gateway");

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
    setFieldNomor(cfg.fieldNomor ?? "customer");
    setFieldPesan(cfg.fieldPesan ?? "message");
    setAktif(cfg.aktif === true);
  }
  if (templates === null) {
    const awal: Record<string, string> = { ...(cfg.templatesWa ?? {}) };
    // Template dari kolom lama ikut dipindahkan bila sudah memenuhi aturan
    // jenis barunya supaya teks yang sudah dipakai tidak tampak "hilang".
    const pindahanLegacy: [JenisTemplateWa, string | undefined][] = [
      ["info_tagihan", cfg.templatePengingat],
      ["status", cfg.templateStatus],
      ["lokasi", cfg.templateLokasi],
    ];
    for (const [jenis, teks] of pindahanLegacy) {
      const isi = (teks ?? "").trim();
      if (
        awal[jenis] === undefined &&
        isi !== "" &&
        validasiTemplateWa(jenis, isi).ok
      ) {
        awal[jenis] = isi;
      }
    }
    setTemplates(awal);
  }
  if (apiUrl === null || templates === null) return null;

  const templateSah = semuaTemplateSah(templates);

  const simpan = async () => {
    if (!apiUrl || !authHeader || !fieldNomor || !fieldPesan) return;
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
        templatesWa: kumpulkanTemplateTersimpan(templates),
      });
      setStatus({ text: "Konfigurasi WhatsApp tersimpan.", ok: true });
      toast.success("Konfigurasi WhatsApp tersimpan.");
    } catch (err) {
      setStatus({
        text:
          err instanceof Error ? err.message : "Gagal menyimpan konfigurasi.",
        ok: false,
      });
      setError(
        err instanceof Error ? err.message : "Gagal menyimpan konfigurasi.",
      );
    } finally {
      setBusy(null);
    }
  };

  const tes = async () => {
    if (nomorTes.trim().length < 8) return;
    setBusy("test");
    setError(null);
    const previewText = "Tes integrasi WhatsApp PINDAI, abaikan pesan ini.";
    setTestPreview({ to: nomorTes.trim(), text: previewText });
    try {
      await sendTest({ nomorTujuan: nomorTes.trim(), isiPesan: previewText });
      setStatus({ text: "Pesan tes terkirim.", ok: true });
      toast.success("Pesan tes terkirim.");
    } catch (err) {
      setStatus({
        text: err instanceof Error ? err.message : "Pengiriman tes gagal.",
        ok: false,
      });
      setError(err instanceof Error ? err.message : "Pengiriman tes gagal.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="animate-masuk flex min-h-0 flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-navy">
            Gateway &amp; Template Pesan WhatsApp
          </h2>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Satu gateway untuk semua pesan: pengingat otomatis, kabar status,
            info tagihan, dan kode OTP. Template tiap jenis diatur di Tab 1;
            pengirimannya terlihat di Tab 2.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {status && (
            <p
              className={`rounded-lg px-3 py-1 text-xs font-medium ${status.ok ? "border border-success-border bg-success-soft text-success-foreground" : "bg-red-50 text-red-700"}`}
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

        {/* TAB 1: GATEWAY & TEMPLATE */}
        <TabsContent value="gateway" className="space-y-4 m-0">
          <div className="grid gap-5 min-h-0 xl:grid-cols-2 xl:gap-6">
            {/* KIRI: KONEKSI */}
            <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div>
                <p className="text-sm font-semibold">
                  Koneksi gateway WhatsApp
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Bekerja dengan Fonnte (termasuk lampiran PDF) atau gateway
                  lain yang menerima JSON berisi nomor dan pesan. Gateway dengan
                  bentuk permintaan khusus seperti Meta Cloud API belum
                  didukung. API key diisi di environment variabel{" "}
                  <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px]">
                    WHATSAPP_API_KEY
                  </code>
                  , dan tidak pernah disimpan di database.
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

              <div className="space-y-2 text-xs leading-5 text-muted-foreground">
                <p className="text-xs font-semibold text-foreground">
                  Pengingat otomatis
                </p>
                <p>
                  Pengingat jatuh tempo dikirim H-3, H-1, dan hari H;
                  keterlambatan maksimal satu pesan per hari. Semua pesan hanya
                  berangkat antara 08.00 dan 20.00 WIB, dan berhenti sendiri
                  begitu pembayaran tercatat (status pinjaman berpindah).
                </p>
                <p>
                  Nomor tujuan selalu nomor peminjam dari data KYC, dan setiap
                  percobaan tercatat di Log Pengiriman dengan jenis yang bisa
                  dibaca.
                </p>
              </div>

              <Separator />

              <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">Aktifkan pengiriman</p>
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                    Saat nonaktif, pengiriman dihentikan: OTP tidak berangkat
                    dan pesan tercatat di log sebagai belum terkirim.
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

            {/* KANAN: TEMPLATE PESAN */}
            <ManajemenTemplateWa
              nilai={templates}
              onChange={(jenis, teks) =>
                setTemplates({ ...templates, [jenis]: teks })
              }
              jenisAktif={jenisAktif}
              onPilihJenis={setJenisAktif}
              sibuk={busy !== null}
            />
          </div>
        </TabsContent>

        {/* TAB 2: STATISTIK & LOG */}
        <TabsContent value="stats" className="space-y-4 m-0">
          <div className="grid gap-5 min-h-0 xl:grid-cols-5 xl:gap-6">
            {/* KIRI: STATISTIK & TES */}
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
                    <p className="text-lg font-semibold tabular-nums text-navy">
                      {value}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>

              <Separator className="my-4" />

              <p className="text-sm font-semibold">Kirim pesan tes</p>
              <div className="mt-2 flex gap-2">
                <Input
                  value={nomorTes}
                  onChange={(e) =>
                    setNomorTes(e.target.value.replace(/[^\d+]/g, ""))
                  }
                  placeholder="6281234567890"
                  className="tabular-nums"
                />
                <Button
                  variant="outline"
                  disabled={busy !== null || nomorTes.trim().length < 8}
                  onClick={tes}
                >
                  {busy === "test" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    "Tes"
                  )}
                </Button>
              </div>
              {testPreview && (
                <p className="text-[11px] leading-4 text-muted-foreground">
                  Terakhir dikirim ke {testPreview.to}: {testPreview.text}
                </p>
              )}
            </div>

            {/* KANAN: LOG PENGIRIMAN */}
            <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-navy">
                  Log pengiriman (terbaru)
                </p>
                <span className="text-[11px] text-muted-foreground">
                  {data.logs.length} baris
                </span>
              </div>
              {data.logs.length === 0 ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  Belum ada pengiriman.
                </p>
              ) : (
                <>
                <ul className="mt-3 space-y-2 md:hidden">
                  {data.logs.map((log) => (
                    <li
                      key={log._id}
                      className="rounded-xl border border-slate-200 bg-white p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[11px] tabular-nums text-muted-foreground">
                          {formatWaktuWIB(log.waktu)} WIB
                        </p>
                        <Badge className={kelasStatusLog(log.status)}>{log.status}</Badge>
                      </div>
                      <p className="mt-1 text-sm font-medium tabular-nums text-slate-900">
                        {log.nomorTujuan}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {jenisRamahWa(log.jenis)}
                      </p>
                      <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-700">
                        {log.isiPesan}
                      </p>
                      {log.respon && (
                        <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                          {log.respon.slice(0, 80)}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>

                <div className="mt-3 hidden max-h-96 overflow-y-auto rounded-xl border border-slate-200 md:block">
                  <Table>
                    <TableCaption className="sr-only">
                      Log pengiriman WhatsApp terbaru beserta status dan isi pesan
                    </TableCaption>
                    <TableHeader className="sticky top-0 bg-slate-50">
                      <TableRow>
                        <TableHead scope="col" className="text-xs font-semibold text-slate-600">
                          Waktu (WIB)
                        </TableHead>
                        <TableHead scope="col" className="text-xs font-semibold text-slate-600">
                          Nomor tujuan
                        </TableHead>
                        <TableHead scope="col" className="text-xs font-semibold text-slate-600">
                          Jenis
                        </TableHead>
                        <TableHead scope="col" className="text-xs font-semibold text-slate-600">
                          Status
                        </TableHead>
                        <TableHead scope="col" className="text-xs font-semibold text-slate-600">
                          Pesan
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.logs.map((log) => (
                        <TableRow key={log._id}>
                          <TableCell className="align-top text-[11px] tabular-nums text-muted-foreground">
                            {formatWaktuWIB(log.waktu)} WIB
                          </TableCell>
                          <TableCell className="align-top text-xs font-medium tabular-nums">
                            {log.nomorTujuan}
                          </TableCell>
                          <TableCell className="max-w-[12rem] whitespace-normal align-top text-xs text-muted-foreground">
                            {jenisRamahWa(log.jenis)}
                          </TableCell>
                          <TableCell className="align-top">
                            <Badge className={kelasStatusLog(log.status)}>{log.status}</Badge>
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
                </>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* STICKY FOOTER BAR */}
      <div className="glass-dock sticky bottom-0 z-20 px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              {aktif ? (
                <>
                  <span className="inline-flex h-2 w-2 rounded-full bg-success" />
                  Gateway aktif · pengiriman pesan dibuka
                </>
              ) : (
                <>
                  <span className="inline-flex h-2 w-2 rounded-full bg-slate-300" />
                  Gateway nonaktif · pesan dicatat tapi tidak dikirim
                </>
              )}
            </div>
            {!templateSah && (
              <span className="text-red-600">
                Ada template yang belum memenuhi placeholder wajibnya, jadi
                belum ikut tersimpan.
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() =>
                setTemplates(
                  Object.fromEntries(JENIS_TEMPLATE_WA.map((j) => [j, ""])),
                )
              }
            >
              <RotateCcw className="mr-1.5 size-4" aria-hidden="true" />
              Reset semua ke bawaan
            </Button>
            <Button
              size="sm"
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={
                busy !== null ||
                !apiUrl ||
                !authHeader ||
                !fieldNomor ||
                !fieldPesan
              }
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
