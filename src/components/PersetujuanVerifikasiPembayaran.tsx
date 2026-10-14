import { AlertTriangle, Camera, CheckCircle2, Loader2, MapPin, ShieldCheck, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ambilLokasiUntukVerifikasi,
  rekamVerifikasiPembayaran,
  ringkasanMediaVerifikasi,
  type MediaVerifikasiPembayaran,
  type TahapVerifikasiKamera,
  type TitikVerifikasiPembayaran,
} from "@/lib/verifikasiPembayaran";

type StatusVerifikasi = "persetujuan" | "merekam" | "selesai" | "gagal";

const NAMA_TAHAP: Record<TahapVerifikasiKamera, string> = {
  kamera_depan: "Kamera depan · foto wajah lalu video 10 detik",
  kamera_belakang: "Kamera belakang · foto lingkungan lalu video 10 detik",
};

/** Dialog opt-in. Tidak membuat permintaan perangkat sebelum klik setuju. */
export function PersetujuanVerifikasiPembayaran({
  terbuka,
  loanId,
  nomorReferensi,
  onTutup,
}: {
  terbuka: boolean;
  loanId: Id<"loans">;
  nomorReferensi: string;
  onTutup: () => void;
}) {
  const [status, setStatus] = useState<StatusVerifikasi>("persetujuan");
  const [tahap, setTahap] = useState<TahapVerifikasiKamera | null>(null);
  const [kesalahan, setKesalahan] = useState<string | null>(null);
  const [media, setMedia] = useState<MediaVerifikasiPembayaran | null>(null);
  const [lokasi, setLokasi] = useState<TitikVerifikasiPembayaran | null>(null);
  const [mediaUrl, setMediaUrl] = useState<Partial<Record<keyof MediaVerifikasiPembayaran, string>>>({});
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const catat = useMutation(api.loans.catatVerifikasiPembayaran);
  const abortRef = useRef<AbortController | null>(null);
  const urlRef = useRef<string[]>([]);

  const bersihkanMedia = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    const stream = videoRef.current?.srcObject;
    if (stream instanceof MediaStream) {
      for (const track of stream.getTracks()) track.stop();
      videoRef.current!.srcObject = null;
    }
    for (const url of urlRef.current) URL.revokeObjectURL(url);
    urlRef.current = [];
    setMediaUrl({});
    setMedia(null);
    setLokasi(null);
    setTahap(null);
  };

  useEffect(() => {
    if (terbuka) return;
    bersihkanMedia();
    setStatus("persetujuan");
    setKesalahan(null);
  }, [terbuka]);

  useEffect(() => () => {
    abortRef.current?.abort();
    for (const url of urlRef.current) URL.revokeObjectURL(url);
  }, []);

  useEffect(() => {
    if (media === null) {
      setMediaUrl({});
      return;
    }
    const url: Partial<Record<keyof MediaVerifikasiPembayaran, string>> = {};
    for (const key of Object.keys(media) as (keyof MediaVerifikasiPembayaran)[]) {
      url[key] = URL.createObjectURL(media[key]);
    }
    urlRef.current.push(...Object.values(url));
    setMediaUrl(url);
  }, [media]);

  const mulai = async () => {
    if (!videoRef.current || status === "merekam") return;
    setStatus("merekam");
    setKesalahan(null);
    setMedia(null);
    const aborter = new AbortController();
    abortRef.current = aborter;
    try {
      await catat({ loanId, status: "dimulai" });
      if (aborter.signal.aborted) return;
      const hasilLokasi = await ambilLokasiUntukVerifikasi();
      if (aborter.signal.aborted) return;
      setLokasi(hasilLokasi);
      const hasilMedia = await rekamVerifikasiPembayaran(
        videoRef.current,
        aborter.signal,
        setTahap,
      );
      if (aborter.signal.aborted) return;
      const ringkasan = ringkasanMediaVerifikasi(hasilMedia);
      await catat({
        loanId,
        status: "selesai",
        wajahFotoByte: ringkasan.wajahFotoByte,
        wajahVideoByte: ringkasan.wajahVideoByte,
        lingkunganFotoByte: ringkasan.lingkunganFotoByte,
        lingkunganVideoByte: ringkasan.lingkunganVideoByte,
        akurasiMeter: hasilLokasi.accuracy,
      });
      setMedia(hasilMedia);
      setStatus("selesai");
    } catch (error) {
      if (aborter.signal.aborted) return;
      setStatus("gagal");
      setKesalahan(error instanceof Error ? error.message : "Verifikasi tidak dapat diselesaikan.");
      const kode = error instanceof Error && /lokasi|GPS/i.test(error.message)
        ? "lokasi_tidak_tersedia"
        : error instanceof Error && /byte|MB|format|ukuran/i.test(error.message)
          ? "ukuran_tidak_valid"
          : error instanceof DOMException && error.name === "NotAllowedError"
            ? "izin_ditolak"
            : error instanceof DOMException && ["NotFoundError", "OverconstrainedError"].includes(error.name)
              ? "kamera_tidak_tersedia"
              : error instanceof Error && /kamera|rekam|video|snapshot/i.test(error.message)
                ? "rekaman_gagal"
                : "audit_tidak_tersedia";
      try {
        await catat({ loanId, status: "gagal", kodeGagal: kode });
      } catch {
        setKesalahan((pesan) => `${pesan} Catatan audit juga belum berhasil tersimpan.`);
      }
    } finally {
      if (abortRef.current === aborter) abortRef.current = null;
    }
  };

  const mulaiLagi = () => {
    bersihkanMedia();
    setStatus("persetujuan");
    setKesalahan(null);
  };

  return (
    <Dialog
      open={terbuka}
      onOpenChange={(open) => {
        if (!open) {
          bersihkanMedia();
          onTutup();
        }
      }}
    >
      <DialogContent className="sm:max-w-xl" aria-describedby="verifikasi-pembayaran-deskripsi">
        <DialogHeader>
          <div className="flex items-center gap-2 text-emerald-800">
            <ShieldCheck className="size-5" aria-hidden="true" />
            <span className="text-xs font-semibold uppercase tracking-[0.14em]">Verifikasi transparan</span>
          </div>
          <DialogTitle>Verifikasi detail tagihan {nomorReferensi}</DialogTitle>
          <DialogDescription id="verifikasi-pembayaran-deskripsi">
            Persetujuan bersifat pilihan dan bukan syarat untuk melihat detail tagihan.
          </DialogDescription>
        </DialogHeader>

        <video
          ref={videoRef}
          aria-label="Pratinjau kamera selama verifikasi"
          autoPlay
          muted
          playsInline
          className={`aspect-video w-full rounded-xl bg-slate-950 object-cover ${status === "merekam" ? "" : "hidden"}`}
        />

        {status === "persetujuan" && (
          <>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
              <p className="text-sm font-semibold text-emerald-950">Apa yang akan diminta setelah Anda setuju</p>
              <ul className="mt-3 space-y-2.5 text-sm leading-5 text-emerald-950/90">
                <li className="flex gap-2"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  Lokasi GPS sekali; koordinat hanya ditampilkan di layar ini dan tidak disimpan. Catatan internal hanya memuat akurasi yang dibulatkan.
                </li>
                <li className="flex gap-2"><Camera className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  Kamera depan: foto wajah dan video 10 detik tanpa audio.
                </li>
                <li className="flex gap-2"><Camera className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  Setelah kamera depan berhenti: kamera belakang, foto lingkungan dan video 10 detik tanpa audio.
                </li>
              </ul>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
              File media dibuat di browser dan tidak diunggah atau disimpan di server. Setelah verifikasi,
              Anda dapat mengunduh salinan ke perangkat sendiri. Koordinat GPS ditampilkan hanya selama sesi ini;
              hanya akurasi yang dibulatkan yang dicatat. Tutup dialog atau pilih “Tidak sekarang” untuk menolak;
              detail tagihan tetap tersedia.
            </div>
          </>
        )}

        {status === "merekam" && (
          <div aria-live="polite" className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              {tahap ? NAMA_TAHAP[tahap] : "Meminta lokasi sekali…"}
            </p>
            {lokasi && (
              <p className="mt-2 text-xs tabular-nums text-slate-700">
                Koordinat hanya untuk sesi ini: {lokasi.latitude.toFixed(5)}, {lokasi.longitude.toFixed(5)} (akurasi ±{Math.round(lokasi.accuracy)} m)
              </p>
            )}
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Tidak ada audio. Kedua kamera tidak aktif bersamaan; kamera pertama dihentikan sebelum kamera kedua diminta.
              Tutup dialog untuk membatalkan, menghentikan stream, dan menghapus media sementara.
            </p>
          </div>
        )}

        {status === "selesai" && media && lokasi && (
          <div className="space-y-3">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-emerald-950">
                <CheckCircle2 className="size-4" aria-hidden="true" /> Rekaman selesai
              </p>
              <p className="mt-2 text-xs leading-5 text-emerald-950/90">
                Empat file sementara dibuat. Total {Math.ceil(ringkasanMediaVerifikasi(media).totalByte / 1_000_000)} MB.
                File hanya ada di memori browser sampai dialog ditutup; tidak ada upload ke server.
              </p>
              <p className="mt-2 text-xs tabular-nums text-emerald-950/90">
                Koordinat hanya untuk sesi ini: {lokasi.latitude.toFixed(5)}, {lokasi.longitude.toFixed(5)} (akurasi ±{Math.round(lokasi.accuracy)} m)
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {([
                ["Foto wajah", media.wajahSnapshot],
                ["Video wajah", media.wajahVideo],
                ["Foto lingkungan", media.lingkunganSnapshot],
                ["Video lingkungan", media.lingkunganVideo],
              ] as const).map(([label, file]) => (
                <a
                  key={label}
                  href={mediaUrl[
                    label === "Foto wajah" ? "wajahSnapshot" :
                    label === "Video wajah" ? "wajahVideo" :
                    label === "Foto lingkungan" ? "lingkunganSnapshot" : "lingkunganVideo"
                  ] ?? "#"}
                  download={file.name}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-800 underline-offset-4 hover:bg-slate-50 hover:underline"
                >
                  Unduh {label}
                </a>
              ))}
            </div>
          </div>
        )}

        {kesalahan && (
          <div role="alert" className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-5 text-amber-950">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{kesalahan} Anda tetap dapat melihat detail tagihan tanpa verifikasi.</span>
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => { bersihkanMedia(); onTutup(); }}>
            {status === "merekam" ? <><X className="mr-1.5 size-4" aria-hidden="true" /> Batalkan</> : "Tidak sekarang"}
          </Button>
          {status === "persetujuan" && (
            <Button onClick={() => void mulai()}>
              Setuju & mulai verifikasi
            </Button>
          )}
          {status === "gagal" && (
            <Button variant="outline" onClick={mulaiLagi}>Coba lagi</Button>
          )}
          {status === "selesai" && media && (
            <Button variant="outline" onClick={mulaiLagi}>Hapus media & selesai</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
