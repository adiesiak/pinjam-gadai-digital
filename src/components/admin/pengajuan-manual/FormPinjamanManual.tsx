import { useMutation, useQuery } from "convex/react";
import { Loader2, Save, ShieldAlert } from "lucide-react";
import { useState } from "react";

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
import { TENOR_BULANAN_OPTIONS } from "@/lib/bulanan";
import { LOAN_LIMITS, LOAN_PURPOSE_OPTIONS, TENOR_OPTIONS } from "@/lib/loan";
import { formatRupiah } from "@/lib/money";
import { rupiahDariTeks, validasiPinjamanManual, type NasabahManual } from "@/lib/pengajuanManual";

import { UnggahDokumen, type DokumenTerunggah } from "./UnggahDokumen";

/**
 * Formulir admin untuk MENCATAT pengajuan pinjaman tunai yang masuk di luar
 * aplikasi (nasabah datang ke kantor, data lama dipindahkan, dsb).
 *
 * Aturan yang dijaga formulir ini:
 *  - Nominal, tenor, dan keperluan divalidasi aturan yang sama dengan server
 *    (`validasiPinjamanManual`) supaya admin tahu lebih dulu apa yang ditolak.
 *    Plafon per nasabah TIDAK menghalangi jalur ini — baris yang dicatat di
 *    sini memindahkan pinjaman yang sudah diputuskan di luar aplikasi, jadi
 *    yang tersisa hanya batas produk (skema harian) dan batas sistem.
 *  - Angka uang TIDAK dihitung di sini. Pratinjau diambil dari mesin harga
 *    server (`admin.adminLoanQuote`) dan tetap divalidasi ulang saat keputusan.
 *  - Identitas (NIK, WhatsApp, penghasilan) tidak diketik ulang: diambil server
 *    dari Data Diri nasabah. Yang diketik admin hanya rekening pencairan.
 *  - **Dokumen pengajuan ikut dicatat**: foto KTP mengikuti Data Diri nasabah,
 *    sedangkan selfie dengan KTP dan bukti penghasilan diunggah di sini bila
 *    berkasnya sudah diterima. Ketiganya tersimpan pada pinjaman ini sehingga
 *    panel KYC menampilkannya seperti pengajuan jalur nasabah.
 */
export function FormPinjamanManual({
  nasabah,
  onSukses,
}: {
  nasabah: NasabahManual;
  onSukses: (nomorReferensi: string) => void;
}) {
  const catat = useMutation(api.adminPengajuan.catatPinjamanManual);
  // URL unggah digerbang admin di server; dipakai untuk dokumen pengajuan.
  const mintaUrlUnggah = useMutation(api.admin.generateDataDiriUploadUrl);
  const [skema, setSkema] = useState<"harian" | "bulanan">("harian");
  const [tenorHari, setTenorHari] = useState<string>(`${TENOR_OPTIONS[2]}`);
  const [tenorBulan, setTenorBulan] = useState<string>(`${TENOR_BULANAN_OPTIONS[1]}`);
  const [pokokTeks, setPokokTeks] = useState("");
  const [tujuan, setTujuan] = useState<string>(LOAN_PURPOSE_OPTIONS[0].value);
  const [namaLengkap, setNamaLengkap] = useState(nasabah.nama);
  const [namaBank, setNamaBank] = useState(nasabah.namaBank ?? "");
  const [nomorRekening, setNomorRekening] = useState(nasabah.nomorRekening ?? "");
  const [catatan, setCatatan] = useState("");
  const [selfie, setSelfie] = useState<DokumenTerunggah | null>(null);
  const [slip, setSlip] = useState<DokumenTerunggah | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const bulanan = skema === "bulanan";
  const pokok = rupiahDariTeks(pokokTeks);
  const tenorTerpilih = bulanan ? Number(tenorBulan) : Number(tenorHari);
  // Pratinjau hanya diminta saat pokoknya sudah masuk batas skema harian;
  // skema bulanan dibatasi plafon nasabah yang hanya diketahui server.
  const pokokBisaDihitung =
    pokok !== null && (bulanan || (pokok >= LOAN_LIMITS.minPokok && pokok <= LOAN_LIMITS.maxPokok));
  const pratinjau = useQuery(
    api.admin.adminLoanQuote,
    pokokBisaDihitung && pokok !== null
      ? { pokokPinjaman: pokok, ...(bulanan ? { tenorBulan: tenorTerpilih } : {}) }
      : "skip",
  );

  const kirim = async () => {
    setError(null);
    const pokokAngka = rupiahDariTeks(pokokTeks);
    if (pokokAngka === null) {
      setError("Masukkan nominal pokok pinjaman yang valid, mis. 1.000.000.");
      return;
    }
    try {
      const bersih = validasiPinjamanManual({
        pokokPinjaman: pokokAngka,
        ...(bulanan ? { tenorBulan: tenorTerpilih } : { tenorHari: tenorTerpilih }),
        tujuan,
        namaLengkap,
        namaBank,
        nomorRekening,
        catatanPeminjam: catatan.trim() === "" ? undefined : catatan,
      });
      setBusy(true);
      const hasil = await catat({
        userIdTarget: nasabah.userId,
        pokokPinjaman: bersih.pokokPinjaman,
        ...(bersih.tenorBulan !== undefined
          ? { tenorBulan: bersih.tenorBulan }
          : { tenorHari: bersih.tenorHari }),
        tujuan: bersih.tujuan,
        namaLengkap: bersih.namaLengkap,
        namaBank: bersih.namaBank,
        nomorRekening: bersih.nomorRekening,
        ...(bersih.catatanPeminjam !== undefined
          ? { catatanPeminjam: bersih.catatanPeminjam }
          : {}),
        // Dokumen pengajuan: hanya yang benar-benar diunggah yang dikirim.
        ...(selfie !== null ? { dokSelfieKtpId: selfie.id } : {}),
        ...(slip !== null ? { dokSlipGajiId: slip.id } : {}),
      });
      onSukses(hasil.nomorReferensi);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pengajuan pinjaman gagal dicatat.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void kirim();
      }}
    >
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
        Pengajuan dicatat dengan status <strong>Diajukan</strong> — keputusan besar
        pinjaman, bunga, dan pencairan tetap lewat antrean review, bukan dari formulir ini.
      </p>

      {!nasabah.adaDataDiri && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            Data diri nasabah belum tersimpan, jadi NIK, nomor WhatsApp, dan penghasilan
            akan kosong pada pengajuan ini. Lengkapi lewat menu Plafon Nasabah → Data Diri
            bila berkasnya sudah ada.
          </span>
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="manual-pinjaman-skema">Skema pinjaman</Label>
          <Select
            value={skema}
            onValueChange={(nilai) => {
              setSkema(nilai === "bulanan" ? "bulanan" : "harian");
              setError(null);
            }}
            disabled={busy}
          >
            <SelectTrigger id="manual-pinjaman-skema" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="harian">Harian (7/14/30 hari)</SelectItem>
              <SelectItem value="bulanan">Bulanan (1/3/6 bulan)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="manual-pinjaman-tenor">Tenor</Label>
          <Select
            value={bulanan ? tenorBulan : tenorHari}
            onValueChange={(nilai) => {
              if (bulanan) setTenorBulan(nilai);
              else setTenorHari(nilai);
              setError(null);
            }}
            disabled={busy}
          >
            <SelectTrigger id="manual-pinjaman-tenor" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(bulanan ? TENOR_BULANAN_OPTIONS.map((t) => `${t}`) : TENOR_OPTIONS.map((t) => `${t}`)).map(
                (nilai) => (
                  <SelectItem key={nilai} value={nilai}>
                    {bulanan ? `${nilai} bulan` : `${nilai} hari`}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="manual-pinjaman-pokok">Pokok pinjaman</Label>
        <Input
          id="manual-pinjaman-pokok"
          inputMode="numeric"
          value={pokokTeks}
          onChange={(event) => {
            setPokokTeks(event.target.value);
            setError(null);
          }}
          placeholder="mis. 1.000.000"
          disabled={busy}
          aria-describedby="manual-pinjaman-pokok-hint"
        />
        <p id="manual-pinjaman-pokok-hint" className="text-xs leading-5 text-muted-foreground">
          {pokok === null
            ? `Nominal rupiah bulat. Skema harian maksimal ${formatRupiah(LOAN_LIMITS.maxPokok)}.`
            : `Terbaca ${formatRupiah(pokok)}. ${
                bulanan
                  ? "Skema bulanan bebas plafon nasabah — dibatasi batas sistem saja."
                  : `Skema harian dibatasi ${formatRupiah(LOAN_LIMITS.minPokok)}–${formatRupiah(LOAN_LIMITS.maxPokok)}.`
              }`}
        </p>
      </div>

      {pratinjau !== undefined && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-xs leading-5 text-slate-600">
          {pratinjau.skema === "bulanan" ? (
            <>
              <p>
                Dana bersih diterima{" "}
                <span className="font-semibold tabular-nums text-navy">
                  {formatRupiah(pratinjau.quote.danaBersihDitransfer)}
                </span>
              </p>
              <p className="mt-1">
                Cicilan{" "}
                <span className="font-semibold tabular-nums text-navy">
                  {formatRupiah(pratinjau.cicilanPerBulan)}
                </span>{" "}
                × {pratinjau.tenorBulan} bulan · total pengembalian{" "}
                <span className="font-semibold tabular-nums text-navy">
                  {formatRupiah(pratinjau.totalPengembalian)}
                </span>
              </p>
            </>
          ) : (
            <>
              <p>
                Dana bersih diterima{" "}
                <span className="font-semibold tabular-nums text-navy">
                  {formatRupiah(pratinjau.quote.danaBersihDitransfer)}
                </span>
              </p>
              <p className="mt-1">
                Total kewajiban pelunasan (130%){" "}
                <span className="font-semibold tabular-nums text-navy">
                  {formatRupiah(pratinjau.quote.totalKewajibanPelunasan)}
                </span>
              </p>
            </>
          )}
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
            Pratinjau dari mesin harga server; angka final dihitung ulang saat pinjaman
            bergerak dan bunga mengikuti snapshot nasabah.
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="manual-pinjaman-tujuan">Keperluan pinjaman</Label>
        <Select value={tujuan} onValueChange={setTujuan} disabled={busy}>
          <SelectTrigger id="manual-pinjaman-tujuan" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LOAN_PURPOSE_OPTIONS.map((opsi) => (
              <SelectItem key={opsi.value} value={opsi.value}>
                {opsi.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="manual-pinjaman-nama">Nama lengkap pemohon</Label>
        <Input
          id="manual-pinjaman-nama"
          value={namaLengkap}
          onChange={(event) => setNamaLengkap(event.target.value)}
          placeholder="Nama sesuai KTP"
          disabled={busy}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="manual-pinjaman-bank">Bank / e-wallet tujuan</Label>
          <Input
            id="manual-pinjaman-bank"
            value={namaBank}
            onChange={(event) => setNamaBank(event.target.value)}
            placeholder="mis. BRI, BCA, DANA"
            disabled={busy}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="manual-pinjaman-rekening">Nomor rekening / akun</Label>
          <Input
            id="manual-pinjaman-rekening"
            inputMode="numeric"
            value={nomorRekening}
            onChange={(event) => setNomorRekening(event.target.value)}
            placeholder="6–20 digit angka"
            disabled={busy}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="manual-pinjaman-catatan">Catatan pengajuan (opsional)</Label>
        <Textarea
          id="manual-pinjaman-catatan"
          value={catatan}
          onChange={(event) => setCatatan(event.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Sumber pengajuan, berkas yang diterima, atau permintaan khusus nasabah…"
          disabled={busy}
        />
      </div>

      <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
          Dokumen pengajuan (opsional)
        </p>
        <p className="text-[11px] leading-4 text-muted-foreground">
          {nasabah.adaDataDiri
            ? "Foto KTP ikut otomatis dari Data Diri nasabah. Unggah dua berkas ini bila sudah diterima dari pemohon."
            : "Data diri nasabah belum ada, jadi foto KTP juga belum ikut. Lengkapi lewat Data Diri bila berkasnya sudah ada."}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <UnggahDokumen
            label="Selfie + KTP"
            keterangan="Foto pemohon memegang KTP."
            nilai={selfie}
            onUbah={setSelfie}
            mintaUrl={mintaUrlUnggah}
            disabled={busy}
          />
          <UnggahDokumen
            label="Bukti penghasilan"
            keterangan="Slip gaji, mutasi, atau surat keterangan usaha."
            nilai={slip}
            onUbah={setSlip}
            mintaUrl={mintaUrlUnggah}
            disabled={busy}
          />
        </div>
      </div>

      {error !== null && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">
          {error}
        </p>
      )}

      <Button type="submit" className="w-full rounded-full" disabled={busy}>
        {busy ? (
          <>
            <Loader2 className="mr-1.5 size-4 animate-spin" /> Mencatat pengajuan…
          </>
        ) : (
          <>
            <Save className="mr-1.5 size-4" /> Simpan pengajuan pinjaman
          </>
        )}
      </Button>
    </form>
  );
}
