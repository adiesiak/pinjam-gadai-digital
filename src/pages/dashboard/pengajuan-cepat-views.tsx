/**
 * PENGAJUAN CEPAT (pasca-KYC) — SATU halaman, bukan wizard tujuh tahap.
 *
 * Kenapa komponen ini ada: begitu identitas nasabah TERVERIFIKASI, menampilkan
 * kembali seluruh wizard KYC berarti meminta orang mengisi ulang hal yang sudah
 * tersimpan di server. Yang benar-benar dibutuhkan untuk mengajukan pinjaman
 * hanya empat hal: nominal, tenor, keperluan, dan konfirmasi rekening tempat dana
 * dikirim. Sisanya (nama, NIK, nomor WhatsApp, penghasilan, dokumen KTP/selfie/
 * bukti) diambil dari baris KYC yang sudah diperiksa petugas.
 *
 * Batas yang TIDAK dilanggar di sini:
 * - Mutasi server tidak diubah. Pengiriman tetap `loans.createLoanApplication`
 *   dengan argumen yang sama seperti formulir panjang — termasuk tanda tangan,
 *   persetujuan Syarat & Ketentuan, dan titik GPS, karena server memang
 *   mewajibkannya. Halaman ini tidak membuat jalur kedua yang lebih longgar.
 * - Aturan validasi berasal dari `@/lib/pengajuanCepat` (murni, teruji), bukan
 *   ditulis ulang di JSX.
 * - Rekening HARUS dikonfirmasi nasabah, dan nomornya ditampilkan bertopeng:
 *   yang sudah diketik di modul KYC tidak perlu terpampang utuh lagi di layar.
 */
import { useMutation, useQuery } from "convex/react";
import { BadgeCheck, Landmark, Loader2, MapPin, Send, ShieldCheck, Wallet } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import SignaturePad from "signature_pad";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useKirimSekali } from "@/hooks/use-cegah-tinggalkan";
import { maskRekening } from "@/lib/kycTahapan";
import { LOAN_PURPOSE_OPTIONS, quotePinjaman, TENOR_OPTIONS } from "@/lib/loan";
import { formatRupiah } from "@/lib/money";
import {
  batasNominalCepat,
  kekuranganKtpTerverifikasi,
  nominalAwalCepat,
  rekeningTersimpanSiap,
  TENOR_CEPAT,
  validasiPengajuanCepat,
  type KtpTerverifikasi,
  type IsianPengajuanCepat,
} from "@/lib/pengajuanCepat";
import { PLAFON_DEFAULT } from "@/lib/plafon";

/** Data KYC terverifikasi dengan id dokumen yang sudah pasti (bukan string bebas). */
export type DataKycTerverifikasi = Omit<
  KtpTerverifikasi,
  "dokKtpId" | "dokSelfieKtpId" | "dokSlipGajiId" | "penghasilanBulanan"
> & {
  /** Penghasilan tersimpan masih berupa teks di modul KYC. */
  penghasilanBulanan: number | null;
  dokKtpId: Id<"_storage"> | null;
  dokSelfieKtpId: Id<"_storage"> | null;
  dokSlipGajiId: Id<"_storage"> | null;
};

type TitikLokasi = { lat: number; lng: number; akurasi: number; waktu: number };

/**
 * Kartu rekening TERSIMPAN (murni, tanpa hook) — dipisah supaya kebijakan
 * privasinya bisa diuji render: yang tampil hanya nama bank dan nomor
 * bertopeng, tidak pernah nomor rekening utuh lagi di layar.
 */
export function KartuRekeningTersimpan({
  namaBank,
  nomorRekening,
}: {
  namaBank: string;
  nomorRekening: string;
}) {
  return (
    <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{namaBank}</p>
        <p className="text-[11px] tabular-nums text-muted-foreground">
          {maskRekening(nomorRekening)}
        </p>
      </div>
      <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-700">
        <ShieldCheck className="size-3.5 shrink-0" aria-hidden /> Tersimpan di KYC
      </span>
    </div>
  );
}

/**
 * Formulir pengajuan cepat satu halaman untuk nasabah yang KYC-nya sudah
 * TERVERIFIKASI. Pemanggil (`KycSection`) hanya perlu mengirim data KYC
 * tersimpan; tidak ada mutasi baru yang diperkenalkan di sini.
 */
export function PengajuanCepatSection({
  ktp,
  onLihatDataKyc,
  onCreated,
}: {
  ktp: DataKycTerverifikasi;
  /** Pindah ke tampilan data KYC lengkap (bila nasabah ingin mengubah sesuatu). */
  onLihatDataKyc?: () => void;
  onCreated?: (nomorReferensi: string) => void;
}) {
  const plafonQuery = useQuery(api.lokasi.plafonSaya, {});
  const plafon = plafonQuery ?? PLAFON_DEFAULT;
  const bungaQuery = useQuery(api.lokasi.bungaSaya, {});
  const createLoan = useMutation(api.loans.createLoanApplication);

  const batas = batasNominalCepat(plafon);
  const [pokok, setPokok] = useState(() => nominalAwalCepat(plafon));
  const [tenorHari, setTenorHari] = useState<string>(String(TENOR_CEPAT[TENOR_CEPAT.length - 1]));
  const [tujuan, setTujuan] = useState<string>("");
  const [rekeningBenar, setRekeningBenar] = useState(false);
  const [setujuSyarat, setSetujuSyarat] = useState(false);
  const [lokasi, setLokasi] = useState<TitikLokasi | null>(null);
  const [lokBusy, setLokBusy] = useState(false);
  const [ttdKosong, setTtdKosong] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Plafon bisa berubah (override admin / pinjaman lain disalurkan). Nominal
  // dijaga tetap di dalam rentang yang berlaku — bukan dibiarkan menunjuk angka
  // yang akan ditolak server. Dijadwalkan sebagai microtask karena setState
  // langsung di dalam badan efek dilarang aturan react-hooks.
  useEffect(() => {
    let batal = false;
    queueMicrotask(() => {
      if (batal) return;
      setPokok((sebelumnya) => Math.min(Math.max(sebelumnya, batas.min), batas.maks));
    });
    return () => {
      batal = true;
    };
  }, [batas.min, batas.maks]);

  // ===== Tanda tangan (canvas) =====
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const padRef = useRef<SignaturePad | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pad = new SignaturePad(canvas, {
      backgroundColor: "rgba(255,255,255,0)",
      penColor: "#172b3a",
      minWidth: 1.2,
      maxWidth: 2.4,
    });
    padRef.current = pad;
    const sync = () => setTtdKosong(pad.isEmpty());
    pad.addEventListener("endStroke", sync);
    const resize = () => {
      if (canvas.offsetWidth === 0 || canvas.offsetHeight === 0) return;
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const data = pad.toData();
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext("2d")?.scale(ratio, ratio);
      pad.clear();
      pad.fromData(data);
      sync();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      pad.removeEventListener("endStroke", sync);
      pad.off();
      padRef.current = null;
    };
  }, []);

  // ===== Lokasi (titik yang dikirim bersama pengajuan) =====
  const ambilLokasi = () => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setError("Lokasi tidak bisa diambil dari perangkat ini.");
      return;
    }
    setLokBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLokasi({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          akurasi: pos.coords.accuracy,
          waktu: Date.now(),
        });
        setLokBusy(false);
      },
      () => {
        setError("Lokasi gagal diambil. Izinkan akses lokasi pada peramban, lalu coba lagi.");
        setLokBusy(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  };

  // Diambil otomatis saat halaman dibuka; tombolnya tetap ada untuk mencoba ulang.
  const ambilLokasiRef = useRef(ambilLokasi);
  ambilLokasiRef.current = ambilLokasi;
  useEffect(() => {
    queueMicrotask(() => ambilLokasiRef.current());
  }, []);

  // ===== Hitungan & kesiapan =====
  const q = quotePinjaman({ pokokPinjaman: pokok, persenBunga: bungaQuery ?? undefined });
  const tenor = Number(tenorHari);
  const kurangKtp = kekuranganKtpTerverifikasi(ktp);
  const rekeningSiap = rekeningTersimpanSiap(ktp.namaBank, ktp.nomorRekening);
  const isianCepat: IsianPengajuanCepat = {
    pokokPinjaman: pokok,
    tenorHari: tenor,
    tujuan,
    rekeningBenar,
    persetujuanSyarat: setujuSyarat,
    lokasiTercatat: lokasi !== null,
    ttdTersedia: !ttdKosong,
  };
  const kirimSekali = useKirimSekali();

  const kirim = async () => {
    setError(null);
    const pesan = validasiPengajuanCepat(isianCepat, ktp, plafon);
    if (pesan !== null) {
      setError(pesan);
      return;
    }
    const pad = padRef.current;
    // Jaga-jaga: syarat yang lolos validasi tapi berubah sebelum tombol selesai
    // diproses (mis. lokasi/kanvas dibersihkan) tidak boleh dikirim setengah jadi.
    const dokKtpId = ktp.dokKtpId;
    const dokSelfieKtpId = ktp.dokSelfieKtpId;
    const dokSlipGajiId = ktp.dokSlipGajiId;
    if (
      pad === null ||
      pad.isEmpty() ||
      lokasi === null ||
      dokKtpId === null ||
      dokSelfieKtpId === null ||
      dokSlipGajiId === null
    ) {
      setError("Lengkapi tanda tangan, lokasi, dan dokumen sebelum mengirim pengajuan.");
      return;
    }
    // Satu pengiriman saja walau tombol ditekan berulang.
    if (!kirimSekali.kunci()) return;

    setSubmitting(true);
    try {
      const hasil = await createLoan({
        pokokPinjaman: pokok,
        tenorHari: tenor,
        tujuan,
        namaLengkap: ktp.namaLengkap,
        namaBank: ktp.namaBank,
        nomorRekening: ktp.nomorRekening,
        tandaTangan: pad.toDataURL("image/png"),
        // Persetujuan dicatat server bersama versi syaratnya (jejak audit).
        persetujuanSyarat: true,
        nik: ktp.nik.replace(/\s+/g, ""),
        nomorWhatsApp: ktp.nomorWhatsApp.replace(/[\s+-]/g, ""),
        penghasilanBulanan: ktp.penghasilanBulanan ?? 0,
        sumberPenghasilan: ktp.sumberPenghasilan,
        dokKtpId,
        dokSelfieKtpId,
        dokSlipGajiId,
        lokasiAjukan: lokasi,
      });
      pad.clear();
      setTtdKosong(true);
      setSetujuSyarat(false);
      setRekeningBenar(false);
      toast.success(`Pengajuan tersimpan — referensi ${hasil.nomorReferensi}.`);
      onCreated?.(hasil.nomorReferensi);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pengajuan gagal dikirim. Silakan coba lagi.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="space-y-4 rounded-3xl bg-slate-50 p-3 sm:p-4">
      {/* Gerbang identitas sudah lewat: satu halaman ini menggantikan wizard. */}
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs leading-5 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200">
        <p className="flex items-center gap-1.5 font-semibold">
          <BadgeCheck className="size-3.5 shrink-0" aria-hidden /> Identitas terverifikasi — pengajuan
          cukup satu halaman
        </p>
        <p className="mt-1">
          Wizard tujuh tahap tidak ditampilkan lagi karena identitas, dokumen, dan rekening Anda sudah
          tersimpan dan diperiksa petugas. Isi nominal, tenor, dan keperluan; sisanya diambil dari data
          yang sudah ada. Status terverifikasi ini bukan persetujuan pinjaman dan bukan bukti dana cair.
        </p>
        {onLihatDataKyc !== undefined && (
          <button
            type="button"
            onClick={onLihatDataKyc}
            className="mt-1.5 font-medium text-emerald-800 underline underline-offset-2 hover:text-emerald-900 dark:text-emerald-200"
          >
            Lihat atau perbarui data KYC →
          </button>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        {kurangKtp.length > 0 && (
          <div
            role="alert"
            className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100"
          >
            <p className="font-semibold">Sebagian data KYC belum bisa dipakai mengajukan</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {kurangKtp.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="mt-1">
              Perbaiki lewat halaman verifikasi KYC, lalu kembali ke sini. Nominal di bawah tidak hilang.
            </p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {/* 1. Nominal pinjaman */}
          <div className="min-w-0 sm:col-span-2">
            <label htmlFor="cepat-pokok" className="text-xs font-semibold text-slate-900">
              Nominal pinjaman
            </label>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground"
                >
                  Rp
                </span>
                <Input
                  id="cepat-pokok"
                  inputMode="numeric"
                  className="h-11 pl-8 text-sm tabular-nums"
                  value={pokok.toLocaleString("id-ID")}
                  onChange={(e) => {
                    const angka = Number(e.target.value.replace(/\D/g, ""));
                    setPokok(Number.isFinite(angka) ? Math.min(angka, batas.maks) : batas.min);
                  }}
                  disabled={submitting}
                  aria-describedby="cepat-pokok-batas"
                />
              </div>
              {[250_000, 500_000, 1_000_000]
                .filter((n) => n >= batas.min && n <= batas.maks)
                .map((n) => (
                  <Button
                    key={n}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 rounded-xl tabular-nums"
                    disabled={submitting}
                    onClick={() => setPokok(n)}
                  >
                    {formatRupiah(n)}
                  </Button>
                ))}
            </div>
            <p id="cepat-pokok-batas" className="mt-1 text-[11px] leading-4 text-muted-foreground">
              Antara {formatRupiah(batas.min)} dan {formatRupiah(batas.maks)} (plafon Anda{" "}
              {formatRupiah(plafon)}).
            </p>
          </div>

          {/* 2. Tenor */}
          <div className="min-w-0">
            <label htmlFor="cepat-tenor" className="text-xs font-semibold text-slate-900">
              Lama pinjaman
            </label>
            <Select value={tenorHari} onValueChange={setTenorHari}>
              <SelectTrigger
                id="cepat-tenor"
                aria-label="Lama pinjaman"
                className="mt-1.5 h-11 w-full rounded-xl text-sm"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TENOR_CEPAT.map((hari) => (
                  <SelectItem key={hari} value={String(hari)}>
                    {hari} hari
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
              Pilihan tenor: {TENOR_OPTIONS.join(" / ")} hari.
            </p>
          </div>

          {/* 3. Keperluan */}
          <div className="min-w-0">
            <label htmlFor="cepat-tujuan" className="text-xs font-semibold text-slate-900">
              Keperluan pinjaman
            </label>
            <Select value={tujuan} onValueChange={setTujuan}>
              <SelectTrigger
                id="cepat-tujuan"
                aria-label="Keperluan pinjaman"
                className="mt-1.5 h-11 w-full rounded-xl text-sm"
              >
                <SelectValue placeholder="Pilih keperluan" />
              </SelectTrigger>
              <SelectContent>
                {LOAN_PURPOSE_OPTIONS.map((opsi) => (
                  <SelectItem key={opsi.value} value={opsi.value}>
                    {opsi.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
              Dipakai petugas menilai kelayakan pengajuan.
            </p>
          </div>

          {/* 4. Konfirmasi rekening bank tersimpan */}
          <div className="min-w-0 sm:col-span-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
              <Landmark className="size-3.5 shrink-0 text-primary" aria-hidden /> Rekening penerima dana
            </p>
            {rekeningSiap ? (
              <>
                <KartuRekeningTersimpan namaBank={ktp.namaBank} nomorRekening={ktp.nomorRekening} />
                <label
                  htmlFor="cepat-rekening-benar"
                  className="mt-2 flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] leading-5"
                >
                  <Checkbox
                    id="cepat-rekening-benar"
                    checked={rekeningBenar}
                    disabled={submitting}
                    onCheckedChange={(nilai) => {
                      setRekeningBenar(nilai === true);
                      if (nilai === true) setError(null);
                    }}
                    className="mt-0.5"
                  />
                  <span>
                    Rekening di atas benar dan atas nama saya. Dana pinjaman dikirim ke rekening ini
                    setelah pengajuan disetujui.
                  </span>
                </label>
              </>
            ) : (
              <p className="mt-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
                Nama bank dan nomor rekening belum lengkap di data KYC. Lengkapi dulu supaya dana bisa
                dikirim ke rekening yang benar.
              </p>
            )}
          </div>

          {/* Perkiraan hitungan — angka dari mesin harga yang sama dengan server. */}
          <div className="min-w-0 sm:col-span-2">
            <dl className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-[11px] leading-5 sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">Potongan di muka</dt>
                <dd className="font-semibold tabular-nums">{formatRupiah(q.totalPotonganDiMuka)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Dana bersih diterima</dt>
                <dd className="font-semibold tabular-nums">{formatRupiah(q.danaBersihDitransfer)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Total kewajiban pelunasan</dt>
                <dd className="font-semibold tabular-nums">
                  {formatRupiah(q.totalKewajibanPelunasan)}
                </dd>
              </div>
            </dl>
            <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
              Perkiraan dari mesin harga PINDAI — angka final dihitung server saat pengajuan disimpan.
            </p>
          </div>

          {/* Tanda tangan & lokasi: tetap wajib karena server mensyaratkannya. */}
          <div className="min-w-0 sm:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-900">Tanda tangan pengajuan</p>
              {!ttdKosong && (
                <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                  <ShieldCheck className="size-3.5" aria-hidden /> Tanda tangan siap
                </span>
              )}
            </div>
            <div className="relative mt-1.5 overflow-hidden rounded-xl border border-slate-200 bg-white">
              <canvas
                ref={canvasRef}
                aria-label="Kanvas tanda tangan pengajuan cepat"
                className="h-28 w-full touch-none"
              />
              <span className="pointer-events-none absolute inset-x-4 bottom-8 border-b border-dashed border-slate-200" />
              <span className="pointer-events-none absolute bottom-2 right-3 text-[10px] text-slate-400">
                {ktp.namaLengkap}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 rounded-xl"
                disabled={submitting || lokBusy}
                onClick={ambilLokasi}
              >
                {lokBusy ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <MapPin className="size-3.5" />
                )}
                {lokasi === null ? "Ambil lokasi" : "Perbarui lokasi"}
              </Button>
              <span className="text-[11px] leading-4 text-muted-foreground">
                {lokasi === null
                  ? "Lokasi perangkat wajib tercatat sebelum mengirim."
                  : `Lokasi tercatat ± ${Math.round(lokasi.akurasi)} m.`}
              </span>
            </div>
          </div>

          <label
            htmlFor="cepat-setuju"
            className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-[11px] leading-5 sm:col-span-2"
          >
            <Checkbox
              id="cepat-setuju"
              checked={setujuSyarat}
              disabled={submitting}
              onCheckedChange={(nilai) => {
                setSetujuSyarat(nilai === true);
                if (nilai === true) setError(null);
              }}
              className="mt-0.5"
            />
            <span>
              Saya menyetujui Syarat &amp; Ketentuan PINDAI dan menyatakan data pengajuan ini benar.
              Persetujuan dicatat server bersama versi syaratnya.
            </span>
          </label>
        </div>

        {error !== null && (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs leading-5 text-destructive"
          >
            {error}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4">
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Wallet className="size-3.5 shrink-0" aria-hidden />
            Kewajiban total {formatRupiah(q.totalKewajibanPelunasan)} · tenor {tenor || "—"} hari
          </p>
          <Button
            type="button"
            className="min-w-52 cursor-pointer gap-1.5 rounded-xl border-0 bg-emerald-800 text-white hover:bg-emerald-900 disabled:cursor-not-allowed"
            disabled={submitting || kurangKtp.length > 0}
            onClick={() => void kirim()}
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            {submitting ? "Mengirim pengajuan…" : "Setujui & kirim pengajuan"}
          </Button>
        </div>
      </div>
    </section>
  );
}
