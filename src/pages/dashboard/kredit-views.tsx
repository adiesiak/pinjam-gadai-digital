import { useMutation, useQuery } from "convex/react";
import { Link2, Loader2, PackageCheck, Send, ShoppingBag, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { persenBungaPerBulan } from "@/lib/bulanan";
import {
  KREDIT_ASUMSI_AWAL,
  KREDIT_BARANG_POKOK_MAKS,
  KREDIT_PRICING,
  KREDIT_TENOR_PENGAJUAN_OPTIONS,
  quoteKreditBarang,
  skemaBulananKredit,
} from "@/lib/kredit";
import { formatRupiah, parseRupiah } from "@/lib/money";
import { cn } from "@/lib/utils";

import { EmptyState } from "./empty-state";

/** Merchant/sumber barang yang didukung pada pengajuan kredit barang. */
const MERCHANT_OPTIONS = [
  "Shopee",
  "Tokopedia",
  "Lazada",
  "TikTok Shop",
  "Toko elektronik mitra",
  "Lainnya",
];

const KATEGORI_OPTIONS = [
  "Elektronik",
  "Peralatan rumah",
  "Kendaraan ringan",
  "Furnitur",
  "Lainnya",
];

/** Label & warna status pengajuan kredit barang. */
const STATUS_META: Record<string, { label: string; className: string; description: string }> = {
  diajukan: {
    label: "Diajukan",
    className: "border-0 bg-slate-100 text-slate-700 hover:bg-slate-100",
    description: "Catatan pengajuan masuk antrean review internal PINDAI.",
  },
  sedang_ditinjau: {
    label: "Sedang ditinjau",
    className: "border-gold/40 bg-gold/15 text-gold-foreground",
    description: "Tim PINDAI meninjau data barang dan merchant yang dicantumkan; ini bukan verifikasi eksternal.",
  },
  disetujui: {
    label: "Disetujui (status aplikasi)",
    className: "border-primary/30 bg-primary/10 text-accent-foreground",
    description: "Status pengajuan pada ledger internal berubah menjadi disetujui. Tidak ada pembayaran ke merchant.",
  },
  ditolak: {
    label: "Ditolak",
    className: "",
    description: "Catatan pengajuan tidak dilanjutkan dalam alur aplikasi. Anda dapat membuat catatan baru.",
  },
  didanai: {
    label: "Terpenuhi (ledger)",
    className: "gradient-primary border-0 text-primary-foreground",
    description:
      "Alokasi simulasi pada ledger mencapai jumlah yang ditetapkan. Tidak ada dana yang dikirim ke merchant atau Peminjam; tombol di bawah hanya menambah catatan pembayaran simulasi.",
  },
  lunas: {
    label: "Lunas (ledger)",
    className: "border-primary/30 bg-primary/10 text-accent-foreground",
    description:
      "Status lunas tercatat pada ledger internal. Ini bukan bukti cicilan dibayar atau dana diteruskan ke Pendana.",
  },
};

function StatusKreditBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? STATUS_META.diajukan;
  if (status === "ditolak") {
    return <Badge variant="destructive">{meta.label}</Badge>;
  }
  return <Badge className={meta.className}>{meta.label}</Badge>;
}

/**
 * Form pengajuan kredit barang: barang dari merchant mitra + uang muka, tenor,
 * dan margin Imbal Hasil. Angka final selalu dihitung ulang server-side.
 */
export function KreditBarangForm({ onCreated }: { onCreated: (ref: string) => void }) {
  const [namaBarang, setNamaBarang] = useState("");
  const [kategori, setKategori] = useState("");
  const [merchant, setMerchant] = useState("");
  const [tautan, setTautan] = useState("");
  const [hargaInput, setHargaInput] = useState("5.000.000");
  const [dpPersen, setDpPersen] = useState<number>(KREDIT_ASUMSI_AWAL.dpPersen);
  const [tenorBulan, setTenorBulan] = useState<number>(KREDIT_ASUMSI_AWAL.tenorBulan);
  const [marginPersenPerBulan, setMarginPersenPerBulan] = useState<number>(
    KREDIT_ASUMSI_AWAL.marginPersenPerBulan,
  );
  const [namaLengkap, setNamaLengkap] = useState("");
  const [nik, setNik] = useState("");
  const [nomorRekening, setNomorRekening] = useState("");
  const [nomorWhatsApp, setNomorWhatsApp] = useState("");
  const [catatanPeminjam, setCatatanPeminjam] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ajukan = useMutation(api.kredit.ajukanKreditBarang);
  // Batas kredit barang terpisah dari plafon pinjaman tunai: tenor baru
  // 1/3/6 bulan memakai DP 0%, sehingga harga = pokok dibiayai.
  const hargaMaksPlafon = KREDIT_BARANG_POKOK_MAKS;

  // Tenor 1/3/6 bulan memakai skema bulanan (DP 0%, bunga menurun) — slider DP
  // dan margin tidak berpengaruh, jadi diganti keterangan otomatis engine.
  const bulanan = skemaBulananKredit(tenorBulan);

  const preview = useMemo(() => {
    try {
      const harga = parseRupiah(hargaInput);
      if (harga < KREDIT_PRICING.minHargaBarang || harga > hargaMaksPlafon) {
        return null;
      }
      return quoteKreditBarang({
        hargaBarang: harga,
        dpPersen,
        tenorBulan,
        marginPersenPerBulan,
      });
    } catch {
      return null;
    }
  }, [hargaInput, dpPersen, tenorBulan, marginPersenPerBulan, hargaMaksPlafon]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (namaBarang.trim().length < 3) {
      setError("Nama barang wajib diisi (minimal 3 karakter).");
      return;
    }
    if (!kategori) {
      setError("Pilih kategori barang.");
      return;
    }
    if (!merchant) {
      setError("Pilih sumber barang (Shopee, Tokopedia, toko mitra, dll).");
      return;
    }
    let harga: number;
    try {
      harga = parseRupiah(hargaInput);
      if (harga < KREDIT_PRICING.minHargaBarang || harga > hargaMaksPlafon) {
        setError(
          `Harga/pokok kredit barang harus antara ${formatRupiah(KREDIT_PRICING.minHargaBarang)} dan ${formatRupiah(hargaMaksPlafon)}.`,
        );
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Harga barang tidak valid.");
      return;
    }
    if (namaLengkap.trim().length < 3) {
      setError("Nama lengkap wajib diisi (minimal 3 karakter).");
      return;
    }
    if (!/^\d{16}$/.test(nik.replace(/\s+/g, ""))) {
      setError("NIK harus 16 digit angka sesuai KTP.");
      return;
    }
    if (!/^\d{6,20}$/.test(nomorRekening.trim().replace(/\s+/g, ""))) {
      setError("Nomor rekening harus 6–20 digit angka.");
      return;
    }
    if (!/^62\d{8,13}$/.test(nomorWhatsApp.replace(/[\s+-]/g, ""))) {
      setError("Nomor WhatsApp wajib format 62… (mis. 6281234567890).");
      return;
    }

    setSubmitting(true);
    try {
      const result = await ajukan({
        namaBarang,
        kategori,
        merchant,
        tautanBarang: tautan.trim() ? tautan.trim() : undefined,
        hargaBarang: harga,
        dpPersen,
        tenorBulan,
        marginPersenPerBulan,
        namaLengkap,
        nik: nik.replace(/\s+/g, ""),
        nomorRekening,
        nomorWhatsApp: nomorWhatsApp.replace(/[\s+-]/g, ""),
        catatanPeminjam: catatanPeminjam.trim() ? catatanPeminjam : undefined,
      });
      onCreated(result.nomorReferensi);
      setNamaBarang("");
      setKategori("");
      setMerchant("");
      setTautan("");
      setHargaInput("5.000.000");
      setCatatanPeminjam("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengirim pengajuan kredit barang.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* ===== Barang ===== */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <ShoppingBag className="size-4 text-primary" /> Barang yang dicantumkan (simulasi)
        </p>
        <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
          Informasi barang, tautan, merchant, dan harga adalah masukan pengguna yang tidak diverifikasi. Pengajuan hanya mencatat simulasi internal; tidak ada pembelian atau pembayaran ke merchant.
        </p>
        <div className="mt-4 space-y-2">
          <Label htmlFor="kredit-nama-barang">Nama barang</Label>
          <Input
            id="kredit-nama-barang"
            value={namaBarang}
            onChange={(e) => setNamaBarang(e.target.value)}
            placeholder="Contoh: Samsung Galaxy A55 8/256 GB"
            disabled={submitting}
          />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Kategori</Label>
            <Select value={kategori} onValueChange={setKategori} disabled={submitting}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Pilih kategori" />
              </SelectTrigger>
              <SelectContent>
                {KATEGORI_OPTIONS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {k}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Sumber barang</Label>
            <Select value={merchant} onValueChange={setMerchant} disabled={submitting}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Shopee, Tokopedia, dll." />
              </SelectTrigger>
              <SelectContent>
                {MERCHANT_OPTIONS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <Label htmlFor="kredit-tautan">Tautan produk (opsional)</Label>
          <Input
            id="kredit-tautan"
            value={tautan}
            onChange={(e) => setTautan(e.target.value)}
            placeholder="https://shopee.co.id/…"
            disabled={submitting}
          />
          <p className="text-xs leading-5 text-muted-foreground">
              Tautan dicatat sebagai referensi; aplikasi tidak memeriksa tautan atau memverifikasi harga di merchant.
            </p>
        </div>
        <div className="mt-4 space-y-2">
          <Label htmlFor="kredit-harga">Harga acuan barang (tidak diverifikasi)</Label>
          <Input
            id="kredit-harga"
            inputMode="numeric"
            value={hargaInput}
            onChange={(e) => setHargaInput(e.target.value)}
            className="tabular-nums"
            disabled={submitting}
          />
          <p className="text-xs leading-5 text-muted-foreground">
            Rentang {formatRupiah(KREDIT_PRICING.minHargaBarang)}–
            {formatRupiah(hargaMaksPlafon)}
            . Batas ini terpisah dari plafon pinjaman tunai.
          </p>
        </div>
      </div>

      {/* ===== Skema kredit ===== */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <TrendingUp className="size-4 text-emerald-600" /> Skema simulasi kredit
        </p>

        <div className="mt-4 flex items-baseline justify-between gap-3">
          <Label className="text-xs text-muted-foreground">Uang muka (DP)</Label>
          <span className="text-xs font-semibold tabular-nums">
            {bulanan ? 0 : dpPersen}% · {formatRupiah(preview?.dp ?? 0)}
          </span>
        </div>
        {bulanan ? (
          <p className="mt-2 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-xs leading-5 text-emerald-800">
            Simulasi tenor {tenorBulan} bulan memakai DP 0%; angka ini bukan bukti pembiayaan atau pembelian barang.
          </p>
        ) : (
          <Slider
            className="mt-3"
            min={KREDIT_PRICING.dpMinPersen}
            max={KREDIT_PRICING.dpMaxPersen}
            step={5}
            value={[dpPersen]}
            onValueChange={(v) => setDpPersen(v[0] ?? KREDIT_PRICING.dpMinPersen)}
            disabled={submitting}
          />
        )}

        <div className="mt-5 flex items-baseline justify-between gap-3">
          <Label className="text-xs text-muted-foreground">Tenor cicilan</Label>
          <span className="text-xs font-semibold tabular-nums">{tenorBulan} bulan</span>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {KREDIT_TENOR_PENGAJUAN_OPTIONS.map((bulan) => {
            const aktif = bulan === tenorBulan;
            return (
              <button
                key={bulan}
                type="button"
                aria-pressed={aktif}
                disabled={submitting}
                onClick={() => setTenorBulan(bulan)}
                className={cn(
                  "rounded-xl border px-3 py-2 text-xs font-medium tabular-nums transition-colors",
                  aktif
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-slate-200 bg-white text-slate-600 hover:border-primary hover:text-primary",
                )}
              >
                {bulan} bln
              </button>
            );
          })}
        </div>

        <div className="mt-5 flex items-baseline justify-between gap-3">
          <Label className="text-xs text-muted-foreground">Imbal Hasil Pendana per bulan</Label>
          <span className="text-xs font-semibold tabular-nums">
            {bulanan
              ? `${persenBungaPerBulan(tenorBulan).toLocaleString("id-ID", { maximumFractionDigits: 2 })}%`
              : `${marginPersenPerBulan.toLocaleString("id-ID", { maximumFractionDigits: 2 })}%`}
          </span>
        </div>
        {bulanan ? (
          <p className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-muted-foreground">
            Bunga menurun otomatis: {persenBungaPerBulan(tenorBulan)}% per bulan — 10%/bln
            (1 bulan), 8%/bln (3–5 bulan), 7,5%/bln (≥ 6 bulan).
          </p>
        ) : (
          <>
            <Slider
              className="mt-3"
              min={KREDIT_PRICING.marginMinPersenPerBulan}
              max={KREDIT_PRICING.marginMaxPersenPerBulan}
              step={0.25}
              value={[marginPersenPerBulan]}
              onValueChange={(v) =>
                setMarginPersenPerBulan(v[0] ?? KREDIT_PRICING.marginMinPersenPerBulan)
              }
              disabled={submitting}
            />
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
              Rentang {KREDIT_PRICING.marginMinPersenPerBulan}–
              {KREDIT_PRICING.marginMaxPersenPerBulan}% per bulan dari pokok acuan simulasi; bukan hak atau janji pembayaran.
            </p>
          </>
        )}

        {/* ===== Pratinjau kredit ===== */}
        {preview === null ? (
          <p
            role="alert"
            className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            Isi harga barang yang valid untuk melihat pratinjau cicilan.
          </p>
        ) : (
          <dl className="mt-4 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200">
            {(
              [
                ["Uang muka (DP)", formatRupiah(preview.dp)],
                ["Pokok acuan simulasi (tidak ditransfer)", formatRupiah(preview.pokokDibiayai)],
                [`Biaya layanan (${KREDIT_PRICING.biayaLayananPersen}%)`, formatRupiah(preview.biayaLayanan)],
                ["Imbal Hasil / bulan", formatRupiah(preview.marginPerBulan)],
              ] as const
            ).map(([label, value]) => (
              <div
                key={label}
                className="flex items-baseline justify-between bg-white px-3 py-2 text-sm"
              >
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="tabular-nums">{value}</dd>
              </div>
            ))}
            <div className="flex items-baseline justify-between bg-emerald-50 px-3 py-2.5 text-sm">
              <dt className="font-semibold text-emerald-800">
                Cicilan simulasi per bulan ({tenorBulan} bulan)
              </dt>
              <dd className="font-semibold tabular-nums text-emerald-700">
                {formatRupiah(preview.cicilanPerBulan)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between bg-slate-50 px-3 py-2.5 text-sm">
              <dt className="font-semibold">Total pembayaran simulasi</dt>
              <dd className="font-semibold tabular-nums">
                {formatRupiah(preview.totalDibayarKonsumen)}
              </dd>
            </div>
          </dl>
        )}
      </div>

      {/* ===== Data pemohon ===== */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Data pemohon (wajib; tidak diverifikasi otomatis)
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="kredit-nama">Nama yang dicatat (tidak diverifikasi)</Label>
            <Input
              id="kredit-nama"
              value={namaLengkap}
              onChange={(e) => setNamaLengkap(e.target.value)}
              placeholder="Nama yang Anda masukkan"
              disabled={submitting}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="kredit-nik">NIK (16 digit; data masukan)</Label>
            <Input
              id="kredit-nik"
              inputMode="numeric"
              maxLength={16}
              value={nik}
              onChange={(e) => setNik(e.target.value.replace(/\D/g, ""))}
              placeholder="3204xxxxxxxxxxxx"
              className="tabular-nums"
              disabled={submitting}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="kredit-rekening">Nomor rekening (informasi yang dicatat)</Label>
            <Input
              id="kredit-rekening"
              inputMode="numeric"
              value={nomorRekening}
              onChange={(e) => setNomorRekening(e.target.value)}
              placeholder="1234567890"
              className="tabular-nums"
              disabled={submitting}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="kredit-wa">Nomor WhatsApp (informasi yang dicatat)</Label>
            <Input
              id="kredit-wa"
              inputMode="numeric"
              value={nomorWhatsApp}
              onChange={(e) => setNomorWhatsApp(e.target.value.replace(/[^\d+]/g, ""))}
              placeholder="6281234567890"
              className="tabular-nums"
              disabled={submitting}
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="kredit-catatan">Catatan untuk reviewer (opsional)</Label>
        <Textarea
          id="kredit-catatan"
          value={catatanPeminjam}
          onChange={(e) => setCatatanPeminjam(e.target.value)}
          placeholder="Warna/varian barang atau informasi lain untuk catatan reviewer…"
          rows={2}
          disabled={submitting}
        />
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" /> Mengirim…{" "}
          </>
        ) : (
          <>
            Kirim pengajuan kredit barang <Send className="ml-1 size-4" />
          </>
        )}
      </Button>
      <p className="text-center text-xs leading-5 text-muted-foreground">
        Pokok kredit barang maksimal {formatRupiah(KREDIT_BARANG_POKOK_MAKS)} dan tenor 1, 3,
        atau maksimal 6 bulan dalam model simulasi. Batas ini terpisah dari plafon simulasi pinjaman tunai.
        Data pemohon, barang, tautan, dan harga yang dimasukkan tidak diverifikasi otomatis; status review hanya catatan internal. Tidak ada pembayaran ke merchant.
      </p>
    </form>
  );
}

/** Daftar pengajuan kredit barang milik Peminjam + status verifikasi. */
export function KreditSayaSection() {
  const kredit = useQuery(api.kredit.kreditSaya);

  if (kredit === undefined) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Memuat pengajuan kredit barang…
      </div>
    );
  }
  if (kredit.length === 0) {
    return (
      <EmptyState
        icon={ShoppingBag}
        title="Belum ada pengajuan kredit barang"
        body="Buat catatan simulasi barang, uang muka, tenor, dan perhitungan cicilan. Pengajuan ini tidak memproses pembelian, pendanaan, atau pembayaran."
      />
    );
  }

  return (
    <div className="space-y-4">
      {kredit.map((k) => {
        const meta = STATUS_META[k.status] ?? STATUS_META.diajukan;
        return (
          <article
            key={k._id}
            className="card-lift rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{k.namaBarang}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {k.nomorReferensi} · sumber barang yang dicantumkan {k.merchant} · {k.kategori} ·{" "}
                  {new Date(k._creationTime).toLocaleDateString("id-ID", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              </div>
              <StatusKreditBadge status={k.status} />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-4">
              {(
                [
                  ["Harga acuan barang", formatRupiah(k.hargaBarang)],
                  ["DP pada simulasi", k.dp !== null ? formatRupiah(k.dp) : "—"],
                  ["Pokok acuan simulasi", k.pokokDibiayai !== null ? formatRupiah(k.pokokDibiayai) : "—"],
                  ["Cicilan simulasi / bulan", k.cicilanPerBulan !== null ? formatRupiah(k.cicilanPerBulan) : "—"],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-1 text-sm font-semibold tabular-nums">{value}</p>
                </div>
              ))}
            </div>

            {(k.cicilanPerBulan !== null || k.imbalHasilPendana !== null) && (
              <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <PackageCheck className="size-3.5 text-primary" />
                  Tenor {k.tenorBulan} bulan · DP {k.dpPersen}%
                </span>
                {k.imbalHasilPendana !== null && (
                  <span className="inline-flex items-center gap-1.5">
                    <TrendingUp className="size-3.5 text-emerald-600" />
                    Imbal Hasil simulasi Pendana {formatRupiah(k.imbalHasilPendana)}
                  </span>
                )}
              </p>
            )}

            <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs leading-5 text-muted-foreground">
              {meta.description}
            </p>

            {k.tautanBarang !== null && (
              <a
                href={k.tautanBarang}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-primary underline-offset-2 hover:underline"
              >
                <Link2 className="size-3.5" /> Buka produk di merchant
              </a>
            )}

            {k.catatanReview !== null && (
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                Catatan tim PINDAI: <span className="text-slate-900">{k.catatanReview}</span>
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
}

/** Tab Kredit Barang: tagihan cicilan + form pengajuan + daftar pengajuan. */
export function KreditBarangSection() {
  return (
    <div className="flex flex-col gap-8">
      <KreditBillingSection />
      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="text-lg font-semibold">Buat catatan simulasi kredit barang</h2>
          <Separator className="my-4" />
          <KreditBarangForm
            onCreated={(ref) =>
              toast.success(`Catatan pengajuan simulasi tersimpan — referensi ${ref}. Tidak ada pembelian atau pembayaran ke merchant.`)
            }
          />
        </section>
        <section>
          <h2 className="text-lg font-semibold">Catatan simulasi kredit barang saya</h2>
          <Separator className="my-4" />
          <KreditSayaSection />
        </section>
      </div>
    </div>
  );
}

/**
 * Ilustrasi pencatatan cicilan bulanan untuk pengajuan yang status ledger-nya
 * terpenuhi penuh (atau lunas); tidak memproses pembayaran eksternal.
 */
export function KreditBillingSection() {
  const kredit = useQuery(api.kredit.kreditSaya);
  const bayar = useMutation(api.kredit.bayarCicilanKredit);
  const [busyId, setBusyId] = useState<Id<"kreditBarang"> | null>(null);

  if (kredit === undefined) return null;
  const berjalan = kredit.filter((k) => k.status === "didanai" || k.status === "lunas");
  if (berjalan.length === 0) return null;

  const handleBayar = async (id: Id<"kreditBarang">) => {
    setBusyId(id);
    try {
      const r = await bayar({ kreditId: id });
      if (r.lunas) {
        toast.success(
          "Status lunas tercatat pada ledger internal. Ini bukan bukti pembayaran atau penerimaan dana oleh Pendana.",
        );
      } else {
        toast.success(
          `Catatan simulasi bulan ${r.bulanKe}: ${formatRupiah(r.totalDibayar)} — sisa pokok pada ledger ${formatRupiah(r.sisaPokokSetelah)}. Tidak ada pembayaran eksternal.`,
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Pencatatan simulasi cicilan gagal.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section>        <h2 className="text-lg font-semibold">Simulasi entri cicilan kredit barang</h2>
      <Separator className="my-4" />
      <div className="space-y-4">
        {berjalan.map((k) => {
          const totalBulan = k.totalBulan || 1;
          const persen = Math.min(100, Math.round((k.dibayarBulan / totalBulan) * 100));
          return (
            <article
              key={k._id}
              className={cn(
                "card-lift rounded-2xl border bg-white p-5 shadow-sm",
                k.status === "lunas" ? "border-emerald-200" : "border-slate-200",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{k.namaBarang}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {k.nomorReferensi} · {k.merchant} · cicilan {formatRupiah(k.cicilanPerBulan ?? 0)
                    }/bulan
                  </p>
                </div>
                {k.status === "lunas" ? (
                  <Badge className="border-primary/30 bg-primary/10 text-accent-foreground">
                    Lunas (ledger)
                  </Badge>
                ) : (
                  <Badge className="border-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                    Entri simulasi {k.dibayarBulan}/{totalBulan}
                  </Badge>
                )}
              </div>

              <dl className="mt-3 grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted-foreground">Sisa pokok pada simulasi</dt>
                  <dd className="font-semibold tabular-nums">
                    {formatRupiah(k.sisaPokokKredit)}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted-foreground">Sisa simulasi kewajiban</dt>
                  <dd className="tabular-nums">{formatRupiah(k.kewajibanSisa)}</dd>
                </div>
              </dl>

              <div className="mt-3">
                <div className="flex items-baseline justify-between text-xs text-muted-foreground">
                  <span>Progres catatan simulasi</span>
                  <span className="tabular-nums">
                    {k.dibayarBulan} / {totalBulan} bulan
                  </span>
                </div>
                <Progress className="mt-1.5" value={persen} />
              </div>

              {k.status === "lunas" ? (
                <p className="mt-3 rounded-xl bg-emerald-50/70 px-3 py-2 text-xs leading-5 text-emerald-800">
                  Status lunas tercatat pada ledger internal; ini bukan bukti cicilan dibayar atau dana diteruskan ke Pendana.
                </p>
              ) : (
                k.cicilanBerikut !== null && (
                  <Button
                    className="mt-3 w-full"
                    disabled={busyId === k._id}
                    onClick={() => void handleBayar(k._id)}
                  >
                    {busyId === k._id ? (
                      <Loader2 className="mr-1.5 size-4 animate-spin" />
                    ) : (
                      <PackageCheck className="mr-1.5 size-4" />
                    )}
                    Catat simulasi bulan {k.cicilanBerikut.bulan} (
                    {formatRupiah(k.cicilanBerikut.total)})
                  </Button>
                )
              )}

              {k.cicilanBerikut !== null && k.status !== "lunas" && (
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  Ilustrasi bulan {k.cicilanBerikut.bulan}: pokok {formatRupiah(k.cicilanBerikut.pokok)} +
                  Imbal Hasil simulasi {formatRupiah(k.cicilanBerikut.margin)} (pembagian internal proporsional; bukan janji pembayaran ke Pendana).
                </p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
