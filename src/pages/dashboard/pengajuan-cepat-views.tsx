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
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { GerbangTurnstile, turnstileDipasang } from "@/components/GerbangTurnstile";
import { PemilihTanggalJatuhTempo } from "@/components/PemilihTanggalJatuhTempo";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";
import { useKirimSekali } from "@/hooks/use-cegah-tinggalkan";
import { JebakanFormulir } from "@/components/JebakanFormulir";
import { AKUN_UJI } from "@/lib/akunUji";
import { kunciIdempotensiBaru } from "@/lib/gerbangKirim";
import { maskRekening } from "@/lib/kycTahapan";
import {
  LATE_FEE_POLICY,
  LOAN_PURPOSE_OPTIONS,
  persenBungaHarian,
  PINDAI_PRICING,
  quoteLoanBunga,
  TENOR_PERPANJANGAN,
  tenorHarianDefault,
  tenorHarianEfektif,
} from "@/lib/loan";
import { formatRupiah } from "@/lib/money";
import { bungaSetelahPromo, pilihPromoBunga } from "@/lib/promoBunga";
import { formatPeriodePromo } from "@/lib/promoPinjaman";
import {
  peringatanKemampuanBayar,
  ringkasKonsekuensi,
} from "@/lib/peringatanPinjaman";
import {
  batasNominalCepat,
  kekuranganKtpTerverifikasi,
  nominalAwalCepat,
  rekeningTersimpanSiap,
  TENOR_CEPAT,
  tenorCepat,
  validasiPengajuanCepat,
  type KtpTerverifikasi,
  type IsianPengajuanCepat,
} from "@/lib/pengajuanCepat";
import { kalimatBatasPlafon, type RingkasanPlafon } from "@/lib/plafon";

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
  tandaTanganAda,
  onLihatDataKyc,
  onCreated,
}: {
  ktp: DataKycTerverifikasi;
  /**
   * Tanda tangan sudah tersimpan di KYC. Formulir ini tidak lagi punya kanvas:
   * gambar diambil dari KYC oleh server saat pengajuan dikirim.
   */
  tandaTanganAda: boolean;
  /** Pindah ke tampilan data KYC lengkap (bila nasabah ingin mengubah sesuatu). */
  onLihatDataKyc?: () => void;
  onCreated?: (nomorReferensi: string) => void;
}) {
  // SISA batas pinjaman dari server (`nasabah.plafonRingkasSaya`): plafon master
  // dipotong pokok pinjaman berjalan. Angka yang sama dengan validasi pengajuan,
  // jadi nominal yang ditawarkan di sini tidak mungkin ditolak karena batas — dan
  // tanpa sisa, layar mengatakannya, bukan menawarkan angka yang pasti gagal.
  const plafonQuery = useQuery(api.nasabah.plafonRingkasSaya, {});
  const ringkas: RingkasanPlafon | null = plafonQuery ?? null;
  const sisaBatas = ringkas?.tersedia; // undefined selama belum termuat
  const ketentuanBiaya = useQuery(api.system.getKetentuanBiaya, {});
  const tarifDenda = {
    perHari: ketentuanBiaya?.persenDendaKeterlambatan ?? LATE_FEE_POLICY.percentPerDay,
    maks: ketentuanBiaya?.maksDendaPersen ?? LATE_FEE_POLICY.maxPercent,
  };
  // Akun uji internal tidak diminta GPS: alat ujinya bisa dipakai di mana saja,
  // dan titik peramban admin tidak boleh tercatat sebagai lokasi nasabah.
  const { user } = useAuth();
  const akunUji = user?.name?.trim() === AKUN_UJI.nama;
  const createLoan = useMutation(api.loans.createLoanApplication);
  // Gerbang izin server: mencatat percobaan mencurigakan dan menegakkan kunci
  // sementara sebelum payload mahal apa pun disusun.
  const mintaIzin = useMutation(api.gerbangKirim.mintaIzinKirim);

  const batas = batasNominalCepat(sisaBatas);
  const [pokok, setPokok] = useState(() => nominalAwalCepat(sisaBatas));
  const [tenorHari, setTenorHari] = useState<string>(String(TENOR_CEPAT[TENOR_CEPAT.length - 1]));
  const [tujuan, setTujuan] = useState<string>("");
  const [rekeningBenar, setRekeningBenar] = useState(false);
  // Centang cair ekspres: peminjam boleh melepas biaya ekspres. Bawaan menyala
  // supaya perilakunya sama dengan sebelum pilihan ini ada.
  const [cairEkspres, setCairEkspres] = useState(true);
  const [setujuSyarat, setSetujuSyarat] = useState(false);
  const [lokasi, setLokasi] = useState<TitikLokasi | null>(null);
  const [lokBusy, setLokBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Jejak anti-pengiriman-palsu. Cap waktu dibuat sekali saat komponen dipasang
  // (bukan ulang tiap render), jadi percobaan ulang setelah gagal tetap memakai
  // waktu buka yang sama. Kolom jebakan selalu kosong bagi pengguna sungguhan.
  const [formDibukaPada] = useState(() => Date.now());
  const [jebakan, setJebakan] = useState("");
  // Bila Turnstile dipasang, tombol kirim menunggu verifikasi bot. Tanpa kunci
  // situs, nilainya langsung `true` dan formulir berjalan seperti sebelumnya.
  const [turnstileSiap, setTurnstileSiap] = useState(!turnstileDipasang);
  // Satu kunci per formulir: percobaan ulang setelah gagal mengembalikan
  // pengajuan yang SAMA, bukan yang kedua.
  const [kunciKirim] = useState(() => kunciIdempotensiBaru());

  // Sisa batas bisa berubah (override admin / pinjaman lain disalurkan). Nominal
  // dijaga tetap di dalam rentang yang berlaku — bukan dibiarkan menunjuk angka
  // yang akan ditolak server. Dijadwalkan sebagai microtask karena setState
  // langsung di dalam badan efek dilarang aturan react-hooks.
  useEffect(() => {
    let batal = false;
    queueMicrotask(() => {
      if (batal) return;
      setPokok((sebelumnya) =>
        batas.adaSisa
          ? Math.min(Math.max(sebelumnya, batas.min), batas.maks)
          : batas.min,
      );
    });
    return () => {
      batal = true;
    };
  }, [batas.adaSisa, batas.min, batas.maks]);

  // Tenor resmi 7/14/28 hari berlaku di semua tier. Pilihan lama yang tidak
  // sah (mis. data lama 30 hari) digeser ke tenor sah terdekat agar dropdown
  // tidak menampilkan nilai yang ditolak server.
  useEffect(() => {
    if (!batas.adaSisa) return;
    queueMicrotask(() => {
      setTenorHari((sebelumnya) =>
        String(tenorHarianEfektif(pokok, Number(sebelumnya) || tenorHarianDefault(pokok))),
      );
    });
  }, [pokok, batas.adaSisa]);

  // ===== Lokasi (titik yang dikirim bersama pengajuan) =====
  /**
   * Ambil satu titik GPS.
   *
   * Dipakai otomatis saat formulir dibuka dan oleh tombol kirim — tidak ada
   * tombol "Ambil lokasi" terpisah, karena satu pengajuan cukup satu tombol.
   * Kegagalan dikembalikan sebagai `null` tanpa memasang pesan galat: pengambilan
   * otomatis saat formulir dibuka tidak perlu menakut-nakuti nasabah, sedangkan
   * tombol kirim memakai pesan galatnya sendiri.
   */
  const ambilLokasi = useCallback((): Promise<TitikLokasi | null> => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      return Promise.resolve(null);
    }
    setLokBusy(true);
    return new Promise((resolve) => {
      try {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const titik: TitikLokasi = {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              akurasi: pos.coords.accuracy,
              waktu: Date.now(),
            };
            setLokasi(titik);
            setLokBusy(false);
            resolve(titik);
          },
          () => {
            setLokBusy(false);
            resolve(null);
          },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
        );
      } catch {
        // Sebagian WebView melempar sinkron saat geolocation diblokir kebijakan.
        // Tanpa ini promise tidak pernah selesai dan tombol kirim terkunci.
        setLokBusy(false);
        resolve(null);
      }
    });
  }, []);

  // Minta izin GPS otomatis saat formulir dibuka. Dijadwalkan sebagai microtask
  // agar tidak memanggil setState langsung di dalam tubuh efek.
  useEffect(() => {
    if (akunUji) return;
    queueMicrotask(() => {
      void ambilLokasi();
    });
  }, [ambilLokasi, akunUji]);

  // ===== Hitungan & kesiapan =====
  // Saat sisa batas habis, state nominal bisa masih 0 sebelum efek perbaikan
  // berjalan. Hitungan memakai batas minimum agar layar tidak gagal render;
  // tombol kirim tetap terkunci oleh `batas.adaSisa`.
  const pokokHitung = pokok > 0 ? pokok : batas.min;
  const tenorTersedia = tenorCepat(pokokHitung);
  const tenor = tenorHarianEfektif(
    pokokHitung,
    Number(tenorHari) || tenorHarianDefault(pokokHitung),
  );
  // Tarif selalu dari matriks nominal–tenor: aturan yang sama dengan yang
  // ditegakkan server, tanpa angka khusus per akun.
  const tarifNormalBunga =
    persenBungaHarian(pokokHitung, tenor) ?? PINDAI_PRICING.bungaPercent;
  // Promo bunga memakai aturan server yang sama: menggantikan tarif tenor ini
  // dan tidak pernah menaikkannya.
  const promoBungaQuery = useQuery(api.promoBunga.berjalan, {});
  const promoBunga = pilihPromoBunga(promoBungaQuery ?? [], {
    tenor,
    sekarang: Date.now(),
  });
  const tarifBunga = bungaSetelahPromo(tarifNormalBunga, promoBunga);
  // Tarif potongan dari pengaturan admin — angka di layar = angka server.
  const tarifBiaya = ketentuanBiaya?.tarifBiaya;
  const q = quoteLoanBunga(pokokHitung, tarifBunga, {
    ekspres: cairEkspres,
    ...(tarifBiaya !== undefined ? { tarif: tarifBiaya } : {}),
  });
  const ekspresTeks = tarifBiaya
    ? tarifBiaya.ekspres.tier1 === tarifBiaya.ekspres.tier3
      ? formatRupiah(tarifBiaya.ekspres.tier1)
      : `${formatRupiah(tarifBiaya.ekspres.tier1)}–${formatRupiah(tarifBiaya.ekspres.tier3)}`
    : "Rp5.000–Rp10.000";
  const peringatanBayar = peringatanKemampuanBayar({
    penghasilanBulanan: ktp.penghasilanBulanan ?? 0,
    kewajiban: q.totalKewajibanPelunasan,
    hari: tenor,
  });
  const pilihPokok = (nilai: number) => {
    const angka = Math.min(Math.max(nilai, batas.min), batas.maks);
    setPokok(angka);
    setTenorHari((sebelumnya) =>
      String(tenorHarianEfektif(angka, Number(sebelumnya) || tenorHarianDefault(angka))),
    );
  };
  const kurangKtp = kekuranganKtpTerverifikasi(ktp);
  const rekeningSiap = rekeningTersimpanSiap(ktp.namaBank, ktp.nomorRekening);
  const isianCepat: IsianPengajuanCepat = {
    pokokPinjaman: pokok,
    tenorHari: tenor,
    tujuan,
    rekeningBenar,
    persetujuanSyarat: setujuSyarat,
    lokasiTercatat: lokasi !== null,
    ttdTersedia: tandaTanganAda,
  };
  const kirimSekali = useKirimSekali();

  const kirim = async () => {
    setError(null);
    // Tombol kirim sekaligus mengambil titik GPS: yang terkirim adalah lokasi
    // saat mengirim, bukan titik lama saat formulir baru dibuka. Bila GPS gagal
    // tetapi titik lama sudah ada, pengajuan tetap boleh lanjut.
    const titik = akunUji ? lokasi : (await ambilLokasi()) ?? lokasi;
    if (!akunUji && titik === null) {
      setError(
        "Lokasi belum bisa diambil. Izinkan akses lokasi pada peramban, lalu kirim lagi.",
      );
      return;
    }
    const isianSaatKirim: IsianPengajuanCepat = {
      ...isianCepat,
      lokasiTercatat: akunUji || titik !== null,
    };
    const pesan = validasiPengajuanCepat(isianSaatKirim, ktp, sisaBatas);
    if (pesan !== null) {
      setError(pesan);
      return;
    }
    // Jaga-jaga: syarat yang lolos validasi tapi berubah sebelum tombol selesai
    // diproses (mis. tanda tangan dihapus di KYC) tidak boleh dikirim setengah jadi.
    const dokKtpId = ktp.dokKtpId;
    const dokSelfieKtpId = ktp.dokSelfieKtpId;
    const dokSlipGajiId = ktp.dokSlipGajiId;
    if (!tandaTanganAda || dokKtpId === null || dokSelfieKtpId === null || dokSlipGajiId === null) {
      setError("Lengkapi tanda tangan di KYC dan dokumen sebelum mengirim pengajuan.");
      return;
    }
    // Satu pengiriman saja walau tombol ditekan berulang.
    if (!kirimSekali.kunci()) return;
    if (!turnstileSiap) {
      setError("Selesaikan verifikasi keamanan di bagian bawah formulir sebelum mengirim.");
      kirimSekali.buka();
      return;
    }

    setSubmitting(true);
    try {
      const izin = await mintaIzin({ jebakan, formDibukaPada });
      if (!izin.ok) {
        setError(izin.alasan ?? "Pengajuan tidak dapat diproses. Coba lagi.");
        kirimSekali.buka();
        return;
      }
      const hasil = await createLoan({
        pokokPinjaman: pokok,
        tenorHari: tenor,
        cairEkspres,
        tujuan,
        namaLengkap: ktp.namaLengkap,
        namaBank: ktp.namaBank,
        nomorRekening: ktp.nomorRekening,
        // Persetujuan dicatat server bersama versi syaratnya (jejak audit).
        persetujuanSyarat: true,
        nik: ktp.nik.replace(/\s+/g, ""),
        nomorWhatsApp: ktp.nomorWhatsApp.replace(/[\s+-]/g, ""),
        penghasilanBulanan: ktp.penghasilanBulanan ?? 0,
        sumberPenghasilan: ktp.sumberPenghasilan,
        dokKtpId,
        dokSelfieKtpId,
        dokSlipGajiId,
        lokasiAjukan: titik ?? undefined,
        jebakan,
        formDibukaPada,
        kunciIdempotensi: kunciKirim,
      });
      setSetujuSyarat(false);
      setRekeningBenar(false);
      setCairEkspres(true);
      toast.success(`Pengajuan tersimpan: referensi ${hasil.nomorReferensi}.`);
      onCreated?.(hasil.nomorReferensi);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pengajuan gagal dikirim. Silakan coba lagi.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="space-y-4 rounded-3xl bg-slate-50 p-3 sm:p-4">
      <JebakanFormulir nilai={jebakan} onUbah={setJebakan} />
      {/* Gerbang identitas sudah lewat: satu halaman ini menggantikan wizard. */}
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs leading-5 text-emerald-900">
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
            className="mt-1.5 font-medium text-emerald-800 underline underline-offset-2 hover:text-emerald-900"
          >
            Lihat atau perbarui data KYC →
          </button>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        {kurangKtp.length > 0 && (
          <div
            role="alert"
            className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-900"
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
                    pilihPokok(Number.isFinite(angka) ? angka : batas.min);
                  }}
                  disabled={submitting || !batas.adaSisa}
                  aria-describedby="cepat-pokok-batas"
                />
              </div>
              {[250_000, 500_000, 1_000_000]
                .filter((n) => n >= batas.min)
                .map((n) => {
                  // Nominal di atas plafon tetap terlihat tetapi terkunci, supaya
                  // nasabah tahu langkah untuk membukanya — bukan menghilang
                  // tanpa penjelasan. Chip Rp1 juta khusus memakai tooltip
                  // progres plafon.
                  const terkunci = submitting || !batas.adaSisa || n > batas.maks;
                  const perluNaik = n > batas.maks && !submitting && batas.adaSisa;
                  const tombol = (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 rounded-xl tabular-nums"
                      disabled={terkunci}
                      onClick={() => pilihPokok(n)}
                    >
                      {formatRupiah(n)}
                    </Button>
                  );
                  return perluNaik ? (
                    <Tooltip key={n}>
                      <TooltipTrigger asChild>
                        <span className="inline-flex cursor-not-allowed" tabIndex={0}>
                          {tombol}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-64 text-balance">
                        Selesaikan 1x pinjaman tepat waktu untuk membuka limit Rp1.000.000
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <span key={n} className="inline-flex">
                      {tombol}
                    </span>
                  );
                })}
            </div>
            {/* Rentang nominal memakai SISA batas dari server; saat sisa habis
                penjelasannya yang tampil, bukan rentang yang tak bisa dipakai. */}
            <p id="cepat-pokok-batas" className="mt-1 text-[11px] leading-4 text-muted-foreground">
              {!batas.adaSisa ? (
                <>
                  Belum ada sisa batas pinjaman yang bisa diajukan.{" "}
                  {ringkas === null ? "" : `${kalimatBatasPlafon(ringkas)} `}
                  Lunasi pinjaman berjalan lebih dulu, atau hubungi tim PINDAI bila batasnya perlu
                  ditinjau.
                </>
              ) : ringkas === null ? (
                <>
                  Antara {formatRupiah(batas.min)} dan {formatRupiah(batas.maks)}. Sisa batas pinjaman
                  Anda sedang dibaca dari server.
                </>
              ) : (
                <>
                  Antara {formatRupiah(batas.min)} dan {formatRupiah(batas.maks)}.{" "}
                  {kalimatBatasPlafon(ringkas)}
                </>
              )}
            </p>
          </div>

          {/* 2. Tenor */}
          <div className="min-w-0">
            <label htmlFor="cepat-tenor" className="text-xs font-semibold text-slate-900">
              Tanggal jatuh tempo
            </label>
            <div className="mt-1.5">
              <PemilihTanggalJatuhTempo
                id="cepat-tenor"
                pokok={pokokHitung}
                tenor={tenor}
                disabled={submitting || !batas.adaSisa}
                onPilih={(hari) => setTenorHari(String(hari))}
              />
            </div>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
              Nominal ini menerima tenor {tenorTersedia.join(" / ")} hari. Bunga{" "}
              <strong className="font-semibold text-slate-800">{tarifBunga}%</strong> sesuai matriks
              produk.
              Tanggal bebas 7–{TENOR_PERPANJANGAN.maks} hari: semakin lama tenor,
              semakin besar bunga. Di atas 28 hari, setiap hari tambahan dikenakan
              1,5 kali harga satu hari tenor 28 hari.
              {promoBunga !== null && (
                <>
                  {" "}
                  <span className="font-medium text-emerald-800">
                    Promo bunga {promoBunga.persenBunga}% (normal {tarifNormalBunga}%) berlaku{" "}
                    {formatPeriodePromo(promoBunga.mulai, promoBunga.selesai)}.
                  </span>
                </>
              )}
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
                  className="mt-2 flex min-h-11 cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs leading-5"
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
              <p className="mt-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-900">
                Nama bank dan nomor rekening belum lengkap di data KYC. Lengkapi dulu supaya dana bisa
                dikirim ke rekening yang benar.
              </p>
            )}
          </div>

          {/* Perkiraan hitungan — angka dari mesin harga yang sama dengan server. */}
          <div className="min-w-0 sm:col-span-2">
            <label
              htmlFor="cepat-cair-ekspres"
              className="mb-2 flex min-h-11 cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs leading-5"
            >
              <Checkbox
                id="cepat-cair-ekspres"
                checked={cairEkspres}
                disabled={submitting}
                onCheckedChange={(nilai) => setCairEkspres(nilai === true)}
                className="mt-0.5"
              />
              <span>
                <span className="font-semibold text-slate-900">Cair ekspres</span> — biaya
                {ekspresTeks} sekali, dipotong dari dana yang Anda terima. Lepas centangnya
                kalau tidak memilih cair ekspres.
              </span>
            </label>
            <dl className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-[11px] leading-5 sm:grid-cols-4">
              <div>
                <dt className="text-muted-foreground">
                  Bunga {tarifBunga}%{promoBunga !== null ? " (promo)" : ""} · {tenor} hari
                </dt>
                <dd className="font-semibold tabular-nums">{formatRupiah(q.bunga)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Potongan di muka</dt>
                <dd className="font-semibold tabular-nums">{formatRupiah(q.totalPotonganDiMuka)}</dd>
                <dd className="text-[10px] leading-4 text-muted-foreground">
                  Admin {formatRupiah(q.biayaAdmin)}
                  {q.biayaAsuransi > 0 && ` + asuransi ${formatRupiah(q.biayaAsuransi)}`}
                  {q.biayaPlatform > 0 && ` + platform ${formatRupiah(q.biayaPlatform)}`}
                  {q.biayaExpress > 0 && ` + ekspres ${formatRupiah(q.biayaExpress)}`}
                </dd>
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

          {/* Lokasi perangkat: dicatat dari tombol kirim, tanpa tombol terpisah. */}
          <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 sm:col-span-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {akunUji ? "Lokasi akun uji (tidak diminta)" : "Lokasi Anda saat mengirim formulir (wajib)"}
            </p>
            {lokasi ? (
              <p role="status" aria-live="polite" className="mt-1 text-xs leading-5 tabular-nums">
                <MapPin className="mr-1 inline size-3.5 text-emerald-600" aria-hidden />
                {lokasi.lat.toFixed(5)}, {lokasi.lng.toFixed(5)} · perkiraan ketelitian ±
                {Math.round(lokasi.akurasi)} meter
              </p>
            ) : (
              <p
                role="status"
                aria-live="polite"
                className="mt-1 text-[11px] leading-5 text-muted-foreground"
              >
                {akunUji
                  ? "Akun uji internal tidak menyimpan titik GPS; pengajuan tetap bisa dikirim."
                  : lokBusy
                    ? "Mengambil lokasi…"
                    : "Lokasi belum tercatat. Titik GPS diambil saat Anda menekan tombol kirim."}
              </p>
            )}
          </div>

          {/* Peringatan singkat sebelum centang: peminjam membaca akibat
              keterlambatan di layar yang sama dengan tombol kirim, bukan di
              halaman syarat yang jarang dibuka. */}
          {peringatanBayar !== null && (
            <p
              role="status"
              className="rounded-xl border border-amber-300 bg-amber-100/80 px-3 py-2 text-[11px] leading-5 text-amber-950 sm:col-span-2"
            >
              {peringatanBayar}
            </p>
          )}
          <p className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-[11px] leading-5 text-amber-950 sm:col-span-2">
            {ringkasKonsekuensi(tarifDenda)}
          </p>

          <label
            htmlFor="cepat-setuju"
            className="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs leading-5 sm:col-span-2"
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
              Saya menyetujui Syarat &amp; Ketentuan PINDAI, sudah membaca
              konsekuensi keterlambatan, dan menyatakan data pengajuan ini benar
              serta kewajiban ini mampu saya bayar.
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

        {!tandaTanganAda && (
          <p
            role="status"
            className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-900"
          >
            Tanda tangan belum tersimpan di KYC. Bubuhkan dulu di kartu “Tanda tangan peminjam” di
            atas halaman ini, lalu kirim pengajuan.
          </p>
        )}

        <GerbangTurnstile className="mt-4" onSiap={setTurnstileSiap} />

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4">
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Wallet className="size-3.5 shrink-0" aria-hidden />
            Kewajiban total {formatRupiah(q.totalKewajibanPelunasan)} · tenor {tenor} hari · bunga{" "}
            {tarifBunga}%
          </p>
          <Button
            type="button"
            className="min-w-52 cursor-pointer gap-1.5 rounded-xl border-0 bg-emerald-800 text-white hover:bg-emerald-900 disabled:cursor-not-allowed"
            disabled={
              submitting ||
              !tandaTanganAda ||
              kurangKtp.length > 0 ||
              !batas.adaSisa ||
              !turnstileSiap
            }
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
