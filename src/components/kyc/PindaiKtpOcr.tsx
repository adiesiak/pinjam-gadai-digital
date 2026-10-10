import { AlertTriangle, Camera, CheckCircle2, Loader2, RefreshCw, ScanText, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  bandingkanKtpDenganForm,
  CATATAN_NIK,
  CATATAN_OCR,
  labelKeyakinan,
  nilaiHasilOcr,
  periksaFormatNik,
  ringkasOcrKtp,
  tingkatKeyakinan,
  uraikanKtp,
  type DataKtp,
} from "@/lib/kycOcr";

type StatusPindai = "diam" | "memuat" | "siap" | "galat";

type HasilPindai = { ktp: DataKtp; konfidensi: number };

/**
 * Panel OCR KTP untuk tahap dokumen.
 *
 * Alur: pengguna memilih foto KTP, menekan "Pindai teks KTP", lalu meninjau
 * hasil ekstraksi, melihat ketidaksesuaian dengan isian formulir, dan — bila
 * cocok — menerapkannya ke formulir untuk dikoreksi. Hasil OCR TIDAK PERNAH
 * menaikkan status KYC menjadi VERIFIED: ia hanya mengisi draf yang tetap harus
 * disimpan dan ditinjau petugas.
 *
 * Mesin OCR dimuat secara MALAS (`import()` saat tombol ditekan) supaya berkas
 * besar tesseract.js tidak masuk bundel awal. Modul ini tidak mencatat teks KTP
 * ke log mana pun.
 */
export function PindaiKtpOcr({
  file,
  form,
  onTerapkan,
  onHasil,
  disabled = false,
}: {
  /** Berkas KTP yang sedang dipilih pengguna (belum tentu tersimpan). */
  file: File | null;
  /** Isian formulir saat ini, untuk menandai ketidaksesuaian. */
  form: { namaLengkap: string; nik: string; alamat: string };
  /** Terapkan hasil OCR ke draf formulir (pengguna masih bisa mengoreksi). */
  onTerapkan: (ktp: DataKtp) => void;
  /**
   * Dipanggil setiap kali pemindaian SELESAI, dengan hasil MENTAH apa adanya
   * (termasuk keyakinan mesin). Dipakai pemanggil untuk menyimpan snapshot OCR
   * bagi mesin keputusan otomatis — snapshot mewakili APA yang dibaca mesin,
   * bahkan bila pengguna nanti mengoreksi formulirnya.
   */
  onHasil?: (ktp: DataKtp, konfidensi: number) => void;
  disabled?: boolean;
}) {
  const [status, setStatus] = useState<StatusPindai>("diam");
  const [kemajuan, setKemajuan] = useState(0);
  const [galat, setGalat] = useState<string | null>(null);
  const [hasil, setHasil] = useState<HasilPindai | null>(null);

  // Ganti berkas → buang hasil lama: menampilkan hasil foto sebelumnya di atas
  // foto baru adalah cara paling mudah menyesatkan pengguna. Penyetelan ini
  // dilakukan SAAT RENDER (pola resmi React "menyesuaikan state ketika props
  // berubah"), bukan di dalam effect — supaya tidak ada render berantai.
  const [berkasTerakhir, setBerkasTerakhir] = useState<File | null>(file);
  if (file !== berkasTerakhir) {
    setBerkasTerakhir(file);
    setStatus("diam");
    setKemajuan(0);
    setGalat(null);
    setHasil(null);
  }

  const nilai = useMemo(
    () => (hasil === null ? null : nilaiHasilOcr(hasil.ktp, hasil.konfidensi)),
    [hasil],
  );
  const beda = useMemo(
    () => (hasil === null ? [] : bandingkanKtpDenganForm(hasil.ktp, form)),
    [hasil, form],
  );
  const baris = useMemo(() => (hasil === null ? [] : ringkasOcrKtp(hasil.ktp)), [hasil]);
  const tingkat = hasil === null ? null : tingkatKeyakinan(hasil.konfidensi);
  const nik = useMemo(
    () => (hasil === null ? null : periksaFormatNik(hasil.ktp.nik)),
    [hasil],
  );

  const pindai = async () => {
    if (file === null) return;
    setStatus("memuat");
    setKemajuan(0);
    setGalat(null);
    setHasil(null);
    try {
      // Dimuat malas: pustaka OCR besar, hanya diambil saat benar-benar dipakai.
      const mesin = await import("@/lib/kycOcrMesin");
      const { teks, konfidensi } = await mesin.jalankanOcrKtp(file, {
        onProgres: (k) => setKemajuan(k.persen),
      });
      const ktp = uraikanKtp(teks);
      setHasil({ ktp, konfidensi });
      setStatus("siap");
      onHasil?.(ktp, konfidensi);
    } catch (err) {
      setGalat(err instanceof Error ? err.message : "OCR gagal dijalankan.");
      setStatus("galat");
    }
  };

  const warnaTingkat =
    tingkat === "tinggi"
      ? "bg-emerald-100 text-emerald-800"
      : tingkat === "sedang"
        ? "bg-amber-100 text-amber-800"
        : "bg-red-100 text-red-800";

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          <ScanText className="size-3.5" aria-hidden /> Bantu isi dari foto KTP (OCR)
        </p>
        <div className="flex items-center gap-2">
          {tingkat !== null && (
            <Badge className={warnaTingkat}>{labelKeyakinan(tingkat)}</Badge>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1 px-2.5"
            disabled={disabled || file === null || status === "memuat"}
            onClick={() => void pindai()}
          >
            {status === "memuat" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : hasil === null ? (
              <ScanText className="size-3.5" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            {hasil === null ? "Pindai teks KTP" : "Pindai ulang"}
          </Button>
        </div>
      </div>

      <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">
        Pindai dilakukan di perangkat Anda; foto tidak dikirim ke server OCR mana pun. Hasil OCR
        hanya saran untuk diisi — selalu periksa dan koreksi di kolom formulir.
      </p>

      {status === "memuat" && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground" aria-live="polite">
          <Loader2 className="size-3.5 animate-spin" /> Membaca teks KTP… {kemajuan}%
        </p>
      )}

      {galat !== null && (
        <Alert variant="destructive" className="mt-2">
          <AlertTriangle />
          <AlertTitle>Pindai gagal</AlertTitle>
          <AlertDescription>{galat}</AlertDescription>
        </Alert>
      )}

      {hasil !== null && nilai !== null && (
        <div className="mt-2 space-y-3">
          {nilai.perluFotoUlang ? (
            <Alert variant="destructive">
              <Camera />
              <AlertTitle>Foto sebaiknya diambil ulang</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-4">
                  {nilai.alasan.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : nilai.perluPeriksaManual ? (
            <Alert>
              <AlertTriangle />
              <AlertTitle>Periksa manual dulu</AlertTitle>
              <AlertDescription>
                Hasil belum sepenuhnya meyakinkan. Cocokkan tiap kolom dengan KTP sebelum
                menyimpan.
              </AlertDescription>
            </Alert>
          ) : (
            <p className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-700">
              <CheckCircle2 className="size-3.5" aria-hidden /> Teks KTP terbaca jelas. Tetap
              periksa hasilnya sebelum dipakai.
            </p>
          )}

          {nik !== null && nik.ada && (
            <p
              className={`rounded-lg px-2.5 py-1.5 text-[11px] leading-4 ${
                nik.ok ? "bg-muted/40 text-muted-foreground" : "bg-red-50 text-red-800"
              }`}
            >
              Bentuk NIK:{" "}
              {nik.ok ? "16 angka dengan komponen tanggal yang wajar" : "tidak memenuhi bentuk 16 angka"}.{" "}
              {CATATAN_NIK}
            </p>
          )}

          <dl className="grid gap-1.5 rounded-lg border border-border bg-muted/30 p-2.5">
            {baris.map((b) => (
              <div key={b.field} className="grid grid-cols-[7.5rem_1fr] gap-2 text-[11px]">
                <dt className="text-muted-foreground">{b.label}</dt>
                <dd className="min-w-0 break-words font-medium tabular-nums">{b.nilai}</dd>
              </div>
            ))}
          </dl>

          {beda.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertTitle>Tidak cocok dengan isian formulir</AlertTitle>
              <AlertDescription>
                <ul className="space-y-1">
                  {beda.map((b) => (
                    <li key={b.field}>
                      <span className="font-medium">{b.label}</span> — KTP: “{b.ocr}”; formulir: “
                      {b.form}”. Pastikan mana yang benar sebelum menyimpan.
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              disabled={disabled}
              onClick={() => onTerapkan(hasil.ktp)}
            >
              <Wand2 className="size-3.5" /> Terapkan ke formulir
            </Button>
          </div>
        </div>
      )}

      <p className="mt-2 border-t border-border pt-2 text-[10px] leading-4 text-muted-foreground">
        {CATATAN_OCR}
      </p>
    </div>
  );
}
