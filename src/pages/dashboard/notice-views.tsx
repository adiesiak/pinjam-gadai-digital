import { useMutation, useQuery } from "convex/react";
import { Loader2, MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { PaymentDueAlert } from "@/components/PaymentDueAlert";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * Banner pengingat jatuh tempo (live dari server).
 *
 * Sejak sistem pengingat beranimasi diperkenalkan, banner ini hanya
 * menjembatani data `loans.dueReminder` ke `PaymentDueAlert` — seluruh visual
 * (tingkat, animasi, hitung mundur, CTA) hidup di komponen bersama itu, yang
 * juga dipakai ruang penyedia dana. Tingkat dan hitung mundur di sana hanya
 * dekoratif: status, denda, dan nominal tetap berasal dari server seperti
 * sebelumnya.
 */
export function DueReminderBanner({
  reminder,
  onLihatDetail,
}: {
  reminder: {
    loanId: Id<"loans">;
    nomorReferensi: string;
    jatuhTempoPada: number;
    sisaHari: number;
    hariTerlambat: number;
    dendaTerlambat: number;
    totalKewajibanDenganPenalti: number;
    totalKewajibanPelunasan: number;
  };
  /** Buka detail pembayaran pinjaman yang dimaksud. */
  onLihatDetail?: (id: Id<"loans">) => void;
}) {
  return (
    <PaymentDueAlert
      nomorReferensi={reminder.nomorReferensi}
      nominal={reminder.totalKewajibanDenganPenalti}
      jatuhTempoPada={reminder.jatuhTempoPada}
      sisaHari={reminder.sisaHari}
      hariTerlambat={reminder.hariTerlambat}
      dendaTerlambat={reminder.dendaTerlambat}
      onLihatDetail={
        onLihatDetail === undefined ? undefined : () => onLihatDetail(reminder.loanId)
      }
    />
  );
}

/**
 * Banner peringatan pola koordinat perangkat (server yang menulis peringatannya).
 *
 * Muncul saat titik lokasi nasabah ditandai heuristik — mis. koordinat yang
 * persis sama berulang kali, tanda khas aplikasi lokasi palsu. Nadanya menolong
 * (banyak kasus berasal dari penghemat baterai/aplikasi pihak ketiga), dan
 * hilang sendiri setelah diakui karena query-nya reaktif.
 */
export function LokasiPeringatanBanner() {
  const peringatan = useQuery(api.lokasi.peringatanSaya);
  const akui = useMutation(api.lokasi.akuiPeringatan);
  const [busy, setBusy] = useState(false);

  if (peringatan === undefined || peringatan === null) return null;

  const waTerkirim = peringatan.waStatus === "terkirim";

  return (
    <section className="animate-masuk mt-6 rounded-2xl border border-amber-200 bg-amber-50/70 px-5 py-4 shadow-sm">
      <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-amber-700">
        <MapPin className="size-3.5" /> Peringatan pola koordinat
      </p>
      <p className="mt-1 text-sm font-semibold text-amber-900">
        Koordinat perangkat yang sama tercatat berulang kali
      </p>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-amber-900/90">
        Pemeriksaan otomatis menemukan koordinat perangkat yang sama berulang kali. Ini hanya pemicu berbasis pola pada koordinat yang dilaporkan perangkat. Jika koordinat tampak tidak sesuai, periksa izin dan pengaturan lokasi perangkat.
      </p>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs leading-5 text-amber-900/90">
        <li>Periksa izin lokasi PINDAI di browser dan pengaturan perangkat.</li>
        <li>Jika Anda memakai aplikasi atau pengaturan lokasi khusus, tinjau apakah masih aktif.</li>
        <li>Koordinat yang dilaporkan perangkat dicatat sebagai metadata masukan.</li>
      </ol>
      <p className="mt-3 text-xs leading-5 text-amber-900/80">
        {waTerkirim
          ? "Peringatan ini juga sudah kami kirim ke WhatsApp Anda."
          : peringatan.waStatus === "tanpa_nomor"
            ? "Kami belum bisa mengirim peringatan ini ke WhatsApp karena nomor Anda belum lengkap di data KYC."
            : "Peringatan ini juga kami catat untuk tim PINDAI."}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await akui({ id: peringatan.id });
              toast.success("Terima kasih — peringatan ditutup.");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Gagal menutup peringatan.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
          Tutup peringatan
        </Button>
      </div>
    </section>
  );
}

/** Persetujuan pelacakan lokasi berkelanjutan (opt-in, dapat dicabut). */
export function LocationConsentCard() {
  const status = useQuery(api.tracking.getStatus);
  const setuju = useMutation(api.tracking.setuju);
  const cabut = useMutation(api.tracking.cabut);
  const pushTitik = useMutation(api.tracking.pushTitik);
  const [busy, setBusy] = useState(false);

  const watchRef = useRef<number | null>(null);
  const lastPushRef = useRef(0);
  const pushRef = useRef(pushTitik);
  useEffect(() => {
    pushRef.current = pushTitik;
  }, [pushTitik]);

  useEffect(() => {
    const stopWatch = () => {
      if (watchRef.current !== null) {
        navigator.geolocation?.clearWatch(watchRef.current);
        watchRef.current = null;
      }
    };
    if (status?.aktif !== true || !navigator.geolocation) {
      stopWatch();
      return;
    }
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - lastPushRef.current < 45_000) return;
        lastPushRef.current = now;
        void pushRef
          .current({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            akurasi: pos.coords.accuracy,
          })
          .catch(() => undefined);
      },
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 20_000, timeout: 25_000 },
    );
    return stopWatch;
  }, [status?.aktif]);

  const statusText =
    status === undefined
      ? "Memuat status pelacakan…"
      : status.aktif
        ? "Aktif — aplikasi mengirim koordinat yang dilaporkan perangkat secara berkala selama persetujuan berlaku. Nonaktifkan kapan saja."
        : "Belum aktif. Aktifkan jika Anda bersedia membagikan koordinat yang dilaporkan perangkat secara berkala (dapat dicabut kapan saja).";

  return (
    <section className="mt-6 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="flex items-center gap-2 text-sm font-semibold">
          <MapPin className="size-4 text-primary" />
          Pelacakan lokasi berkelanjutan
        </p>
        <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">{statusText}</p>
      </div>
      {status?.aktif ? (
        <Button
          variant="outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await cabut();
              toast.info("Pelacakan lokasi dinonaktifkan.");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Gagal menonaktifkan.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : "Nonaktifkan"}
        </Button>
      ) : (
        <Button
          disabled={busy || status === undefined}
          onClick={async () => {
            setBusy(true);
            try {
              await setuju();
              toast.success("Pencatatan koordinat perangkat diaktifkan.");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Gagal mengaktifkan.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : "Izinkan pelacakan"}
        </Button>
      )}
    </section>
  );
}
