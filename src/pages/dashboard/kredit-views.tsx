import { useMutation, useQuery } from "convex/react";
import { Link2, Loader2, PackageCheck, Send, ShoppingBag, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { ManualPaymentEvidenceForm } from "@/components/ManualPaymentEvidenceForm";
import {
  IdentitasKycTerverifikasi,
  MedanDariKyc,
  PeringatanKyc,
} from "@/components/kyc/PeringatanKyc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  KREDIT_ASUMSI_AWAL,
  KREDIT_BARANG_POKOK_MAKS,
  KREDIT_PRICING,
  KREDIT_TENOR_BIAYA_ADMIN_PLATFORM,
  KREDIT_TENOR_PENGAJUAN_OPTIONS,
  quoteKreditBarang,
  skemaBulananKredit,
} from "@/lib/kredit";
import { identitasDasarKyc } from "@/lib/kyc";
import { isKycVerified } from "@/lib/kycStatus";
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
    description: "Tim PINDAI meninjau data barang dan merchant yang dicantumkan.",
  },
  disetujui: {
    label: "Disetujui (status aplikasi)",
    className: "border-primary/30 bg-primary/10 text-accent-foreground",
    description: "Status berubah menjadi disetujui di catatan PINDAI. Tidak ada pembayaran ke merchant.",
  },
  ditolak: {
    label: "Ditolak",
    className: "",
    description: "Catatan pengajuan tidak dilanjutkan dalam alur aplikasi. Anda dapat membuat catatan baru.",
  },
  didanai: {
    label: "Alokasi historis",
    className: "gradient-primary border-0 text-primary-foreground",
    description:
      "Dana pembiayaan sudah tersalurkan. Kirim bukti transfer cicilan di bawah; admin mencocokkannya dengan mutasi bank lalu mencatatnya di ledger.",
  },
  lunas: {
    label: "Lunas",
    className: "border-primary/30 bg-primary/10 text-accent-foreground",
    description:
      "Status lunas tercatat pada catatan PINDAI.",
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
 * Form pengajuan kredit barang: barang dari merchant mitra, tenor, dan ringkasan
 * pembayaran. Angka final selalu dihitung ulang server-side.
 */
export function KreditBarangForm({
  onCreated,
  onBukaKyc,
}: {
  onCreated: (ref: string) => void;
  /** Pindah ke tab Verifikasi KYC — dipakai gerbang KYC di UI. */
  onBukaKyc?: () => void;
}) {
  const [namaBarang, setNamaBarang] = useState("");
  const [kategori, setKategori] = useState("");
  const [merchant, setMerchant] = useState("");
  const [tautan, setTautan] = useState("");
  const [hargaInput, setHargaInput] = useState("5.000.000");
  const [dpPersen, setDpPersen] = useState<number>(KREDIT_ASUMSI_AWAL.dpPersen);
  const [tenorBulan, setTenorBulan] = useState<number>(KREDIT_ASUMSI_AWAL.tenorBulan);
  // Margin selalu memakai asumsi awal engine — tidak ada kontrol UI untuk
  // mengubahnya pada alur kredit barang ini, jadi disimpan sebagai konstanta.
  const marginPersenPerBulan = KREDIT_ASUMSI_AWAL.marginPersenPerBulan;
  const [namaLengkap, setNamaLengkap] = useState("");
  const [nik, setNik] = useState("");
  const [nomorRekening, setNomorRekening] = useState("");
  const [nomorWhatsApp, setNomorWhatsApp] = useState("");
  const [catatanPeminjam, setCatatanPeminjam] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ajukan = useMutation(api.kredit.ajukanKreditBarang);
  // Gerbang KYC: server menolak pengajuan tanpa KYC VERIFIED; UI mencerminkan
  // lebih dulu supaya formulir tidak diisi sia-sia.
  const kycQuery = useQuery(api.kyc.kycSaya, {});
  const kycSiap = isKycVerified(kycQuery?.status);
  // Identitas pemohon (nama, NIK, nomor WhatsApp) datang dari KYC bila sudah
  // diperiksa petugas; kalau belum, medan isiannya tetap tampil seperti biasa.
  // Pemakaian ulangnya PER-RUAS: satu nilai yang tidak sah hanya menyisakan
  // medan itu, bukan menyembunyikan seluruh bagian data pemohon.
  const identitasKyc = kycSiap ? identitasDasarKyc(kycQuery?.isian) : identitasDasarKyc(null);
  const namaKredit = identitasKyc.namaLengkap !== "" ? identitasKyc.namaLengkap : namaLengkap;
  const nikKredit = identitasKyc.nik !== "" ? identitasKyc.nik : nik.replace(/\s+/g, "");
  const waKredit =
    identitasKyc.nomorWhatsApp !== ""
      ? identitasKyc.nomorWhatsApp
      : nomorWhatsApp.replace(/[\s+-]/g, "");
  // Sekurang-kurangnya satu ruas dipakai ulang → badge hijau & medan read-only.
  const adaIdentitasKyc =
    identitasKyc.namaLengkap !== "" ||
    identitasKyc.nik !== "" ||
    identitasKyc.nomorWhatsApp !== "";
  // Batas kredit barang terpisah dari plafon pinjaman tunai: tenor baru
  // 1/3/6 bulan memakai DP 0%, sehingga harga = pokok dibiayai.
  const hargaMaksPlafon = KREDIT_BARANG_POKOK_MAKS;

  // Tenor 1/3/6 bulan memakai skema bulanan (DP 0%, bunga flat) — slider DP
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
    // Diperiksa dari nilai YANG DIKIRIM: dari KYC bila ada, kalau tidak dari isian.
    if (namaKredit.trim().length < 3) {
      setError("Nama lengkap wajib diisi (minimal 3 karakter).");
      return;
    }
    if (!/^\d{16}$/.test(nikKredit)) {
      setError("NIK harus 16 digit angka sesuai KTP.");
      return;
    }
    if (!/^\d{6,20}$/.test(nomorRekening.trim().replace(/\s+/g, ""))) {
      setError("Nomor rekening harus 6–20 digit angka.");
      return;
    }
    if (!/^62\d{8,13}$/.test(waKredit)) {
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
        namaLengkap: namaKredit,
        nik: nikKredit,
        nomorRekening,
        nomorWhatsApp: waKredit,
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
      {/* Identitas sudah diperiksa petugas: bagian data pemohon yang bisa
          dipakai ulang tidak ditanyakan lagi — bukti & ringkasannya justru
          ditampilkan di sini, supaya tidak ada yang tersembunyi diam-diam. */}
      {adaIdentitasKyc && (
        <IdentitasKycTerverifikasi
          namaLengkap={identitasKyc.namaLengkap}
          nik={identitasKyc.nik}
          nomorWhatsApp={identitasKyc.nomorWhatsApp}
          petunjuk="Data pemohon (nama, NIK, nomor WhatsApp) dipakai dari KYC yang sudah diperiksa petugas. Isi cukup data barang, nomor rekening, dan catatan."
          onBukaKyc={onBukaKyc}
        />
      )}

      {/* ===== Barang ===== */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <ShoppingBag className="size-4 text-primary" /> Barang yang dicantumkan
        </p>
        <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
          Informasi barang, tautan, merchant, dan harga berasal dari masukan pengguna. Pengajuan mencatat data di PINDAI; pembelian ke merchant dan perpindahan uang tetap di luar aplikasi, sedangkan bukti transfer cicilan dicatat di sini.
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
              Tautan dicatat sebagai referensi pada pengajuan.
            </p>
        </div>
        <div className="mt-4 space-y-2">
          <Label htmlFor="kredit-harga">Harga acuan barang</Label>
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
          <TrendingUp className="size-4 text-emerald-600" /> Skema kredit
        </p>

        <div className="mt-4 flex items-baseline justify-between gap-3">
          <Label className="text-xs text-muted-foreground">Uang muka (DP)</Label>
          <span className="text-xs font-semibold tabular-nums">
            {bulanan ? 0 : dpPersen}% · {formatRupiah(preview?.dp ?? 0)}
          </span>
        </div>
        {bulanan ? (
          <p className="mt-2 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-xs leading-5 text-emerald-800">
            Tenor {tenorBulan} bulan memakai DP 0%; angka mengikuti skema kredit barang.
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

        {/* ===== Pratinjau kredit ===== */}
        {preview === null ? (
          <p
            role="alert"
            className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            Isi harga barang yang valid untuk melihat pratinjau cicilan.
          </p>
        ) : (
          <>
          <dl className="mt-4 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200">
            <div className="flex flex-col gap-1 bg-emerald-50 px-3 py-2.5 text-sm sm:flex-row sm:items-baseline sm:justify-between">
              <dt className="font-semibold text-emerald-800">Nilai barang (tidak dicairkan)</dt>
              <dd className="font-semibold tabular-nums text-emerald-700">
                {formatRupiah(preview.pokokDibiayai)}
              </dd>
            </div>
            {KREDIT_TENOR_BIAYA_ADMIN_PLATFORM.includes(tenorBulan) ? (
              <>
                <div className="flex flex-col gap-1 px-3 py-2 text-sm sm:flex-row sm:items-baseline sm:justify-between">
                  <dt className="text-muted-foreground">Biaya admin (2%, dipotong di muka)</dt>
                  <dd className="tabular-nums">{formatRupiah(preview.biayaAdmin)}</dd>
                </div>
                <div className="flex flex-col gap-1 px-3 py-2 text-sm sm:flex-row sm:items-baseline sm:justify-between">
                  <dt className="text-muted-foreground">Biaya platform (0%)</dt>
                  <dd className="tabular-nums">{formatRupiah(preview.biayaPlatform)}</dd>
                </div>
                <div className="flex flex-col gap-1 bg-slate-50 px-3 py-2.5 text-sm sm:flex-row sm:items-baseline sm:justify-between">
                  <dt className="font-semibold">Total potongan di muka perkiraan (2%)</dt>
                  <dd className="font-semibold tabular-nums">{formatRupiah(preview.biayaLayanan)}</dd>
                </div>
                <div className="flex flex-col gap-1 px-3 py-2 text-sm sm:flex-row sm:items-baseline sm:justify-between">
                  <dt className="text-muted-foreground">Biaya admin cicilan (2% per bayar)</dt>
                  <dd className="tabular-nums">{formatRupiah(preview.biayaAdminCicilanTotal)}</dd>
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-1 px-3 py-2 text-sm sm:flex-row sm:items-baseline sm:justify-between">
                <dt className="text-muted-foreground">Biaya layanan kontrak lama (3%, dipotong di muka)</dt>
                <dd className="tabular-nums">{formatRupiah(preview.biayaLayanan)}</dd>
              </div>
            )}
            <div className="flex flex-col gap-1 bg-slate-50 px-3 py-2.5 text-sm sm:flex-row sm:items-baseline sm:justify-between">
              <dt className="font-semibold">Total pembayaran perkiraan ({tenorBulan} bulan)</dt>
              <dd className="font-semibold tabular-nums">
                {formatRupiah(preview.totalDibayarKonsumen)}
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            {KREDIT_TENOR_BIAYA_ADMIN_PLATFORM.includes(tenorBulan)
              ? "Biaya admin 2% dipotong di muka (platform 0%); setiap cicilan bulanan ditambah biaya admin cicilan 2% dari nominal cicilan."
              : "Biaya layanan 3% dimodelkan dalam skema tenor ini (kontrak lama)."} Kredit barang ini bukan pencairan uang tunai; PINDAI tidak membeli barang atau mengirim dana ke merchant.
          </p>
          </>
        )}
      </div>

      {/* ===== Data pemohon ===== */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Data pemohon {adaIdentitasKyc ? "(nama, NIK & WhatsApp dari KYC)" : "(wajib)"}
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {identitasKyc.namaLengkap !== "" ? (
            <MedanDariKyc
              id="kredit-nama"
              label="Nama yang dicatat"
              nilai={identitasKyc.namaLengkap}
              petunjuk="Nama ini yang tercatat pada kontrak kredit barang."
            />
          ) : (
            <div className="space-y-2">
              <Label htmlFor="kredit-nama">Nama yang dicatat</Label>
              <Input
                id="kredit-nama"
                value={namaLengkap}
                onChange={(e) => setNamaLengkap(e.target.value)}
                placeholder="Nama yang Anda masukkan"
                disabled={submitting}
              />
            </div>
          )}
          {identitasKyc.nik !== "" ? (
            <MedanDariKyc
              id="kredit-nik"
              label="NIK (16 digit)"
              nilai={identitasKyc.nik}
              petunjuk="NIK dari data KYC yang sudah diperiksa petugas."
            />
          ) : (
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
          )}
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
          {identitasKyc.nomorWhatsApp !== "" ? (
            <MedanDariKyc
              id="kredit-wa"
              label="Nomor WhatsApp"
              nilai={identitasKyc.nomorWhatsApp}
              petunjuk="Nomor ini dipakai untuk kabar status pengajuan."
            />
          ) : (
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
          )}
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

      {kycQuery !== undefined && !kycSiap && <PeringatanKyc onBukaKyc={onBukaKyc} />}

      <Button type="submit" className="w-full" disabled={submitting || !kycSiap}>
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
        atau maksimal 6 bulan dalam model kredit barang. Batas ini terpisah dari plafon pinjaman tunai.
        Data barang, tautan, dan harga mengikuti pengisian pengajuan; data pemohon memakai data KYC bila identitasnya sudah terverifikasi petugas. Status review tercatat pada catatan PINDAI.
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
        body="Catat barang, uang muka, tenor, dan cicilan. Setelah dana tersalurkan, bukti transfer cicilan bisa dikirim dari halaman ini."
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

            <dl className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-sm">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                <dt className="text-muted-foreground">Harga barang tersimpan pada pengajuan</dt>
                <dd className="font-semibold tabular-nums">{formatRupiah(k.hargaBarang)}</dd>
              </div>
              {k.dp !== null && (
                <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                  <dt className="text-muted-foreground">DP perkiraan ({k.dpPersen}%)</dt>
                  <dd className="tabular-nums">{formatRupiah(k.dp)}</dd>
                </div>
              )}
              <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                <dt className="text-muted-foreground">Pokok pembiayaan</dt>
                <dd className="font-semibold tabular-nums">
                  {k.pokokDibiayai !== null ? formatRupiah(k.pokokDibiayai) : "—"}
                </dd>
              </div>
              {KREDIT_TENOR_BIAYA_ADMIN_PLATFORM.includes(k.tenorBulan) && (
                <>
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                    <dt className="text-muted-foreground">Biaya admin (2%, dipotong di muka)</dt>
                    <dd className="tabular-nums">{k.biayaAdmin !== null ? formatRupiah(k.biayaAdmin) : "—"}</dd>
                  </div>
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                    <dt className="text-muted-foreground">Biaya platform (0%)</dt>
                    <dd className="tabular-nums">{k.biayaPlatform !== null ? formatRupiah(k.biayaPlatform) : "—"}</dd>
                  </div>
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                    <dt className="text-muted-foreground">Biaya admin cicilan (2% per bayar)</dt>
                    <dd className="tabular-nums">
                      {k.biayaAdminCicilanTotal !== null ? formatRupiah(k.biayaAdminCicilanTotal) : "—"}
                    </dd>
                  </div>
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                    <dt className="text-muted-foreground">Total potongan di muka (2%)</dt>
                    <dd className="tabular-nums">{k.biayaLayanan !== null ? formatRupiah(k.biayaLayanan) : "—"}</dd>
                  </div>
                </>
              )}
              {!KREDIT_TENOR_BIAYA_ADMIN_PLATFORM.includes(k.tenorBulan) && (
                <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                  <dt className="text-muted-foreground">Biaya layanan kontrak lama (3%, dipotong di muka)</dt>
                  <dd className="tabular-nums">{k.biayaLayanan !== null ? formatRupiah(k.biayaLayanan) : "—"}</dd>
                </div>
              )}
              <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                <dt className="text-muted-foreground">Total pembayaran peminjam (estimasi)</dt>
                <dd className="font-semibold tabular-nums">
                  {k.totalDibayarKonsumen !== null ? formatRupiah(k.totalDibayarKonsumen) : "—"}
                </dd>
              </div>
              <div className="flex flex-col gap-1 border-t border-slate-100 pt-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                <dt className="text-muted-foreground">Pokok pembiayaan (estimasi)</dt>
                <dd className="tabular-nums">{k.pokokDibiayai !== null ? formatRupiah(k.pokokDibiayai) : "—"}</dd>
              </div>
              {k.totalDiterimaPlatform !== null && (
                <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                  <dt className="text-muted-foreground">Total pokok + imbal hasil (estimasi)</dt>
                  <dd className="font-semibold tabular-nums">{formatRupiah(k.totalDiterimaPlatform)}</dd>
                </div>
              )}
              {k.marginKontrak !== null && (
                <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                  <dt className="text-muted-foreground">Marjin kontrak (estimasi)</dt>
                  <dd className="tabular-nums">{formatRupiah(k.marginKontrak)}</dd>
                </div>
              )}
            </dl>

            {k.jadwal.length > 0 && (
              <section className="mt-3 rounded-xl border border-slate-200 px-3 py-2.5 text-xs">
                <h3 className="font-medium">Perkiraan cicilan per bulan</h3>
                <ul className="mt-2 divide-y divide-slate-100">
                  {k.jadwal.map((cicilan) => {
                    const lunas = cicilan.bulan <= k.dibayarBulan;
                    const berikut = cicilan.bulan === k.dibayarBulan + 1;
                    return (
                      <li key={cicilan.bulan} className="flex flex-wrap justify-between gap-2 py-2">
                        <span>
                          Bulan {cicilan.bulan}: pokok {formatRupiah(cicilan.pokok)} · imbal hasil{" "}
                          {formatRupiah(cicilan.margin)}{" "}
                          <span
                            className={
                              lunas
                                ? "font-semibold text-emerald-700"
                                : berikut
                                  ? "font-semibold text-amber-700"
                                  : "text-muted-foreground"
                            }
                          >
                            · {lunas ? "tercatat" : berikut ? "berikutnya" : "belum"}
                          </span>
                        </span>
                        <span className="font-semibold tabular-nums">{formatRupiah(cicilan.total)}</span>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-2 text-muted-foreground">
                  Tagihan dihitung dari data pengajuan yang tersimpan. Status “tercatat” berarti admin
                  sudah mencocokkan uang masuk; sisanya masih perkiraan jadwal.
                </p>
              </section>
            )}
            <p className="mt-3 inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <PackageCheck className="size-3.5 text-primary" />
              Tenor {k.tenorBulan} bulan · DP tersimpan {k.dpPersen}% · cicilan tercatat{" "}
              <strong className="text-slate-800">
                {k.dibayarBulan}/{k.totalBulan}
              </strong>
            </p>

            {k.status === "didanai" && k.cicilanBerikut !== null && (
              <ManualPaymentEvidenceForm
                jenis="kredit_barang"
                targetId={k._id}
                reference={`${k.nomorReferensi} · bulan ${k.cicilanBerikut.bulan}`}
                suggestedAmount={k.cicilanBerikut.total}
                kunciJumlah
              />
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

/** Tab kredit barang berfokus pada formulir pengajuan dan estimasi tersimpan. */
/**
 * Catatan pengajuan kredit barang milik Peminjam.
 *
 * Dirender di tab "Form Pengajuan", tepat di bawah formulir kredit barang:
 * tab "Kredit Barang" sudah dihapus, jadi formulir dan catatan satu produk
 * berdampingan di satu tempat. Tab pinjaman dan gadai tetap murni catatan.
 */
export function KreditBarangSection() {
  return (
    <section className="min-w-0">
      <h2 className="text-lg font-semibold">Catatan pengajuan kredit barang saya</h2>
      <Separator className="my-4" />
      <KreditSayaSection />
    </section>
  );
}

