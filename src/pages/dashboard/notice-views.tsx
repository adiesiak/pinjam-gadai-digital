import { useMutation, useQuery } from "convex/react";
import { Loader2, MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatRupiah } from "@/lib/money";

import { formatDate } from "./shared";

/** Banner pengingat jatuh tempo (live dari server). */
export function DueReminderBanner({
  reminder,
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
}) {
  const terlambat = reminder.hariTerlambat > 0;
  return (
    <section
      className={`mt-6 rounded-2xl border px-5 py-4 shadow-sm ${
        terlambat ? "border-red-200 bg-red-50/70" : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className={`text-[11px] font-medium uppercase tracking-[0.18em] ${terlambat ? "text-red-600" : "text-muted-foreground"}`}>
            {terlambat
              ? `Terlambat ${reminder.hariTerlambat} hari — denda berjalan`
              : reminder.sisaHari === 0
                ? "Jatuh tempo hari ini"
                : `Jatuh tempo ${reminder.sisaHari} hari lagi`}
          </p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Pinjaman {reminder.nomorReferensi} wajib dilunasi paling lambat{" "}
            <span className="font-medium text-foreground">{formatDate(reminder.jatuhTempoPada)}</span>.
            Denda 0,5% per hari dari pokok (maksimum 15%).
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Total kewajiban saat ini</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">
            {formatRupiah(reminder.totalKewajibanDenganPenalti)}
          </p>
          {terlambat && (
            <p className="mt-0.5 text-xs tabular-nums text-red-600">
              termasuk denda {formatRupiah(reminder.dendaTerlambat)}
            </p>
          )}
        </div>
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
        ? "Aktif — posisi Anda dikirim berkala selama persetujuan berlaku. Nonaktifkan kapan saja."
        : "Belum aktif. Aktifkan jika Anda bersedia membagikan posisi secara berkala (dapat dicabut kapan saja).";

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
              toast.success("Terima kasih — pelacakan lokasi kini aktif.");
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
