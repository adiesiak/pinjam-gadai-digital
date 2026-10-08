import { useMutation } from "convex/react";
import { Loader2, Save } from "lucide-react";
import { useState, type FormEvent } from "react";

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
import { COLLATERAL_CATEGORIES, LTV_HINTS, type CollateralCategory } from "@/lib/pawn";
import {
  validasiGadaiManual,
  type GadaiManualBersih,
  type NasabahManual,
} from "@/lib/pengajuanManual";

/**
 * Formulir pencatatan pengajuan gadai secara manual (panel admin).
 *
 * Yang diisi admin hanya data yang benar-benar diketahui dari pengajuan yang
 * diterima di luar aplikasi. Nilai taksiran, harga pasar, dan kondisi fisik
 * sengaja TIDAK diminta di sini: itu hasil penilaian tim dan diisi pada dialog
 * penilaian gadai, sehingga pencatatan manual tidak berpura-pura menaksir.
 *
 * Aturan bentuknya satu sumber dengan mutation server lewat
 * `validasiGadaiManual` (lib/pengajuanManual.ts) — pesan galat yang dilihat
 * admin sama dengan yang menolak data di server.
 */
export function FormGadaiManual({
  nasabah,
  onSukses,
}: {
  nasabah: NasabahManual;
  onSukses: (nomorReferensi: string) => void;
}) {
  const [deskripsiBarang, setDeskripsiBarang] = useState("");
  const [kategori, setKategori] = useState("");
  const [alamatPenilaian, setAlamatPenilaian] = useState("");
  const [namaLengkap, setNamaLengkap] = useState(nasabah.nama);
  const [namaBank, setNamaBank] = useState(nasabah.namaBank ?? "");
  const [nomorRekening, setNomorRekening] = useState(nasabah.nomorRekening ?? "");
  const [catatanPeminjam, setCatatanPeminjam] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const catat = useMutation(api.adminPengajuan.catatGadaiManual);

  const kirim = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    let bersih: GadaiManualBersih;
    try {
      bersih = validasiGadaiManual({
        deskripsiBarang,
        kategori,
        alamatPenilaian,
        namaLengkap,
        namaBank,
        nomorRekening,
        catatanPeminjam,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Data pengajuan gadai belum lengkap.");
      return;
    }
    setBusy(true);
    try {
      const hasil = await catat({
        userIdTarget: nasabah.userId,
        deskripsiBarang: bersih.deskripsiBarang,
        kategori: bersih.kategori,
        alamatPenilaian: bersih.alamatPenilaian,
        namaLengkap: bersih.namaLengkap,
        namaBank: bersih.namaBank,
        nomorRekening: bersih.nomorRekening,
        ...(bersih.catatanPeminjam !== undefined
          ? { catatanPeminjam: bersih.catatanPeminjam }
          : {}),
      });
      onSukses(hasil.nomorReferensi);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Pengajuan gadai gagal dicatat. Silakan coba lagi.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={kirim} className="space-y-5">
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
        Pengajuan tercatat dengan status <strong>Diajukan</strong> dan masuk antrean gadai.
        Nilai taksiran, harga pasar, dan kondisi fisik diisi tim pada dialog penilaian —
        pencatatan manual hanya menyimpan apa yang disampaikan pemohon.
      </p>

      <div className="space-y-2">
        <Label htmlFor="gadai-manual-deskripsi">Deskripsi barang jaminan</Label>
        <Textarea
          id="gadai-manual-deskripsi"
          value={deskripsiBarang}
          onChange={(event) => setDeskripsiBarang(event.target.value)}
          placeholder="Contoh: iPhone 14 Pro 256 GB, warna titanium, lengkap dengan kotak…"
          rows={3}
          minLength={10}
          required
          aria-required="true"
          disabled={busy}
        />
        <p className="text-xs leading-5 text-muted-foreground">
          Minimal 10 karakter. Tuliskan merek, tipe, dan kelengkapan sejelas yang disampaikan
          pemohon.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="gadai-manual-kategori">Kategori barang</Label>
        <Select value={kategori} onValueChange={setKategori} disabled={busy}>
          <SelectTrigger id="gadai-manual-kategori" className="w-full" aria-label="Kategori barang gadai">
            <SelectValue placeholder="Pilih kategori barang" />
          </SelectTrigger>
          <SelectContent>
            {COLLATERAL_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {kategori !== "" && (
          <p className="text-xs leading-5 text-muted-foreground">
            Acuan LTV kategori ini {LTV_HINTS[kategori as CollateralCategory]}. Ini hanya
            perkiraan awal untuk reviewer, bukan jumlah pinjaman yang disetujui.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="gadai-manual-alamat">Alamat lokasi barang</Label>
        <Textarea
          id="gadai-manual-alamat"
          value={alamatPenilaian}
          onChange={(event) => setAlamatPenilaian(event.target.value)}
          placeholder="Tulis alamat lengkap tempat barang berada…"
          rows={2}
          minLength={10}
          required
          aria-required="true"
          disabled={busy}
        />
        <p className="text-xs leading-5 text-muted-foreground">
          Minimal 10 karakter. Dipakai tim untuk menjadwalkan pemeriksaan barang.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="gadai-manual-nama">Nama lengkap pemohon</Label>
          <Input
            id="gadai-manual-nama"
            value={namaLengkap}
            onChange={(event) => setNamaLengkap(event.target.value)}
            placeholder="Tulis nama lengkap"
            autoComplete="off"
            required
            aria-required="true"
            minLength={3}
            maxLength={120}
            disabled={busy}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="gadai-manual-bank">Nama bank atau dompet digital</Label>
          <Input
            id="gadai-manual-bank"
            value={namaBank}
            onChange={(event) => setNamaBank(event.target.value)}
            placeholder="BCA, Mandiri, DANA, OVO, GoPay"
            autoComplete="off"
            required
            aria-required="true"
            minLength={2}
            maxLength={60}
            disabled={busy}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="gadai-manual-rekening">Nomor rekening atau nomor dompet digital</Label>
          <Input
            id="gadai-manual-rekening"
            inputMode="numeric"
            value={nomorRekening}
            onChange={(event) => setNomorRekening(event.target.value)}
            placeholder="1234567890"
            className="tabular-nums"
            autoComplete="off"
            required
            aria-required="true"
            disabled={busy}
          />
          <p className="text-xs leading-5 text-muted-foreground">
            6–20 angka. Terisi otomatis dari Data Diri nasabah, ubah bila pengajuan ini memakai
            rekening lain.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="gadai-manual-catatan">Catatan pengajuan (boleh dikosongkan)</Label>
        <Textarea
          id="gadai-manual-catatan"
          value={catatanPeminjam}
          onChange={(event) => setCatatanPeminjam(event.target.value)}
          placeholder="Keterangan tambahan dari nasabah atau petugas yang menerima pengajuan…"
          rows={2}
          maxLength={500}
          disabled={busy}
        />
      </div>

      {error !== null && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700"
        >
          {error}
        </p>
      )}

      <Button type="submit" className="w-full rounded-full" disabled={busy}>
        {busy ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" /> Menyimpan…
          </>
        ) : (
          <>
            <Save className="mr-2 size-4" /> Simpan pengajuan gadai
          </>
        )}
      </Button>
      <p className="text-center text-xs leading-5 text-muted-foreground">
        NIK dan nomor WhatsApp pemohon diambil dari Data Diri nasabah. Setelah tersimpan, keputusan
        dan penilaian dilakukan lewat antrean gadai, dan tindakan ini tercatat di Audit Trail.
      </p>
    </form>
  );
}
