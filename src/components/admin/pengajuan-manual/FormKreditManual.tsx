import { useMutation } from "convex/react";
import { Loader2, ShoppingBag } from "lucide-react";
import { useMemo, useState } from "react";

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
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import {
  KREDIT_ASUMSI_AWAL,
  KREDIT_BARANG_POKOK_MAKS,
  KREDIT_PRICING,
  KREDIT_TENOR_PENGAJUAN_OPTIONS,
  pokokKreditBarangDalamBatas,
  quoteKreditBarang,
} from "@/lib/kredit";
import { formatRupiah } from "@/lib/money";
import {
  rupiahDariTeks,
  validasiKreditManual,
  type NasabahManual,
} from "@/lib/pengajuanManual";
import { cn } from "@/lib/utils";

/**
 * Form pencatatan pengajuan kredit barang secara manual (panel admin).
 *
 * Identitas pemohon TIDAK diketik di sini: nama, NIK, dan nomor WhatsApp diambil
 * server dari Data Diri nasabah, sehingga pencatatan manual tidak bisa
 * menyelipkan identitas yang belum tersimpan. Data diri juga wajib sudah ada —
 * kontrak kredit menyimpan identitas pemohon, jadi tombol simpan dikunci sampai
 * admin melengkapinya lewat menu Plafon Nasabah → Data Diri.
 *
 * Angka DP, cicilan, dan Imbal Hasil dihitung mesin kredit yang sama dengan jalur
 * nasabah (`quoteKreditBarang`); pratinjau di sini memakai fungsi murni yang
 * sama, bukan rumus kedua.
 */

/** Kategori barang kredit — daftar yang sama dengan form pengajuan nasabah. */
const KATEGORI_OPTIONS = [
  "Elektronik",
  "Peralatan rumah",
  "Kendaraan ringan",
  "Furnitur",
  "Lainnya",
] as const;

export function FormKreditManual({
  nasabah,
  onSukses,
}: {
  nasabah: NasabahManual;
  onSukses: (nomorReferensi: string) => void;
}) {
  const [namaBarang, setNamaBarang] = useState("");
  const [kategori, setKategori] = useState<string>(KATEGORI_OPTIONS[0]);
  const [merchant, setMerchant] = useState("");
  const [tautan, setTautan] = useState("");
  const [hargaInput, setHargaInput] = useState("");
  const [tenorBulan, setTenorBulan] = useState<number>(KREDIT_ASUMSI_AWAL.tenorBulan);
  const [nomorRekening, setNomorRekening] = useState(nasabah.nomorRekening ?? "");
  const [catatan, setCatatan] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const catat = useMutation(api.adminPengajuan.catatKreditManual);
  const dataDiriSiap = nasabah.adaDataDiri;

  const harga = rupiahDariTeks(hargaInput);
  // Pratinjau: DP 0% dan margin tenor bawaan untuk skema bulanan 1/3/6 bulan —
  // angka yang sama akan dihitung ulang server saat pengajuan disimpan.
  const preview = useMemo(() => {
    if (harga === null) return null;
    try {
      return quoteKreditBarang({
        hargaBarang: harga,
        dpPersen: KREDIT_ASUMSI_AWAL.dpPersen,
        tenorBulan,
        marginPersenPerBulan: KREDIT_ASUMSI_AWAL.marginPersenPerBulan,
      });
    } catch {
      return null;
    }
  }, [harga, tenorBulan]);

  const kirim = async () => {
    setError(null);
    if (harga === null) {
      setError("Masukkan harga barang yang valid (angka rupiah, mis. 5.000.000).");
      return;
    }
    let bersih: ReturnType<typeof validasiKreditManual>;
    try {
      bersih = validasiKreditManual({
        namaBarang,
        kategori,
        merchant,
        tautanBarang: tautan,
        hargaBarang: harga,
        tenorBulan,
        nomorRekening,
        catatanPeminjam: catatan,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Data pengajuan belum lengkap.");
      return;
    }
    if (preview === null || !pokokKreditBarangDalamBatas(preview.pokokDibiayai)) {
      setError(
        `Pokok pembiayaan melebihi batas ${formatRupiah(KREDIT_BARANG_POKOK_MAKS)}. Turunkan harga barang lebih dulu.`,
      );
      return;
    }
    setBusy(true);
    try {
      const hasil = await catat({
        userIdTarget: nasabah.userId,
        namaBarang: bersih.namaBarang,
        kategori: bersih.kategori,
        merchant: bersih.merchant,
        ...(bersih.tautanBarang !== undefined ? { tautanBarang: bersih.tautanBarang } : {}),
        hargaBarang: bersih.hargaBarang,
        tenorBulan: bersih.tenorBulan,
        nomorRekening: bersih.nomorRekening,
        ...(bersih.catatanPeminjam !== undefined
          ? { catatanPeminjam: bersih.catatanPeminjam }
          : {}),
      });
      onSukses(hasil.nomorReferensi);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pengajuan kredit gagal dicatat.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {!dataDiriSiap && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
          Pengajuan kredit menyimpan identitas pemohon (nama, NIK, nomor WhatsApp), jadi
          Data Diri nasabah ini harus dilengkapi lebih dulu lewat menu <strong>Plafon Nasabah</strong>{" "}
          → <strong>Data Diri</strong>. Tombol simpan dibuka setelah data diri tersimpan.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="manual-kredit-barang">Nama barang</Label>
          <Input
            id="manual-kredit-barang"
            value={namaBarang}
            onChange={(event) => setNamaBarang(event.target.value)}
            placeholder="mis. Samsung Galaxy A55 8/256"
            disabled={busy}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="manual-kredit-kategori">Kategori</Label>
          <Select value={kategori} onValueChange={setKategori} disabled={busy}>
            <SelectTrigger id="manual-kredit-kategori" aria-label="Kategori barang kredit" className="w-full">
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
          <Label htmlFor="manual-kredit-merchant">Sumber barang</Label>
          <Input
            id="manual-kredit-merchant"
            value={merchant}
            onChange={(event) => setMerchant(event.target.value)}
            placeholder="Shopee, Tokopedia, toko elektronik mitra…"
            disabled={busy}
          />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="manual-kredit-tautan">Tautan barang (opsional)</Label>
          <Input
            id="manual-kredit-tautan"
            type="url"
            value={tautan}
            onChange={(event) => setTautan(event.target.value)}
            placeholder="https://…"
            disabled={busy}
          />
          <p className="text-xs leading-5 text-muted-foreground">
            Harus diawali http:// atau https:// — dipakai tim untuk memeriksa harga barang.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="manual-kredit-harga">Harga barang</Label>
          <Input
            id="manual-kredit-harga"
            inputMode="numeric"
            value={hargaInput}
            onChange={(event) => setHargaInput(event.target.value)}
            placeholder="mis. 5.000.000"
            disabled={busy}
          />
          <p className="text-xs leading-5 text-muted-foreground">
            {harga === null
              ? `Antara ${formatRupiah(KREDIT_PRICING.minHargaBarang)} dan ${formatRupiah(
                  KREDIT_PRICING.maxHargaBarang,
                )}.`
              : formatRupiah(harga)}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="manual-kredit-rekening">Nomor rekening tujuan</Label>
          <Input
            id="manual-kredit-rekening"
            inputMode="numeric"
            value={nomorRekening}
            onChange={(event) => setNomorRekening(event.target.value)}
            placeholder="6–20 digit angka"
            disabled={busy}
          />
          <p className="text-xs leading-5 text-muted-foreground">
            Kosongkan untuk memakai rekening dari Data Diri nasabah.
          </p>
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-3">
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
                disabled={busy}
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
      </div>

      {preview !== null && (
        <div>
          <dl className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200">
            <div className="flex flex-col gap-1 px-3 py-2 text-sm sm:flex-row sm:items-baseline sm:justify-between">
              <dt className="text-muted-foreground">Pokok dibiayai (DP 0%)</dt>
              <dd className="tabular-nums text-navy">{formatRupiah(preview.pokokDibiayai)}</dd>
            </div>
            <div className="flex flex-col gap-1 px-3 py-2 text-sm sm:flex-row sm:items-baseline sm:justify-between">
              <dt className="text-muted-foreground">Cicilan per bulan × tenor</dt>
              <dd className="tabular-nums text-navy">
                {formatRupiah(preview.cicilanPerBulan)} × {tenorBulan} bln
              </dd>
            </div>
            <div className="flex flex-col gap-1 bg-slate-50 px-3 py-2.5 text-sm sm:flex-row sm:items-baseline sm:justify-between">
              <dt className="font-semibold">Total dibayar Konsumen (perkiraan)</dt>
              <dd className="font-semibold tabular-nums text-navy">
                {formatRupiah(preview.totalDibayarKonsumen)}
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Angka ini dihitung ulang server saat disimpan. DP 0% untuk tenor 1/3/6 bulan, dan
            kredit barang bukan pencairan uang tunai — PINDAI tidak membeli barang atau mengirim
            dana ke merchant.
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="manual-kredit-catatan">Catatan pengajuan (opsional)</Label>
        <Textarea
          id="manual-kredit-catatan"
          value={catatan}
          onChange={(event) => setCatatan(event.target.value)}
          placeholder="Contoh: pengajuan diterima di kantor, barang sudah dicantumkan nasabah…"
          rows={3}
          maxLength={500}
          disabled={busy}
        />
      </div>

      {error !== null && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
        <Button
          className="rounded-full"
          disabled={busy || !dataDiriSiap}
          onClick={() => void kirim()}
        >
          {busy ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" /> Menyimpan…
            </>
          ) : (
            <>
              <ShoppingBag className="mr-2 size-4" /> Simpan pengajuan kredit
            </>
          )}
        </Button>
        <p className="text-xs leading-5 text-muted-foreground">
          Pengajuan tercatat berstatus <strong>diajukan</strong>; keputusan tetap lewat dialog
          review kredit barang dan tercatat di Audit Trail.
        </p>
      </div>
    </div>
  );
}
