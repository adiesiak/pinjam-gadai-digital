import { useMutation, useQuery } from "convex/react";
import { Loader2, MapPin } from "lucide-react";
import { useState } from "react";
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
              toast.success("Terima kasih, peringatan ditutup.");
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

/**
 * Status pelacakan lokasi berkelanjutan.
 *
 * Lokasi adalah syarat transaksi, bukan opt-in terpisah: persetujuan dicatat
 * otomatis saat titik pertama diterima (lihat `simpanTitik`). Karena itu kartu
 * ini tidak menawarkan tombol yang bisa dibatalkan diam-diam oleh heartbeat
 * berikutnya. Satu-satunya cara berhenti adalah mematikan izin lokasi di
 * perangkat; konsekuensinya transaksi yang mensyaratkan lokasi tertahan.
 */
export function LocationStatusCard() {
  const status = useQuery(api.tracking.getStatus);

  const statusText =
    status === undefined
      ? "Memuat status lokasi…"
      : status.aktif
        ? "Aktif. Titik lokasi dicatat selama gerbang lokasi menyala; persetujuan tercatat otomatis saat titik pertama diterima."
        : "Belum ada titik tercatat. Buka dashboard dengan GPS aktif; PINDAI meminta izin lokasi perangkat sebelum mengirim titik pertama.";

  return (
    <section className="mt-6 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p className="flex items-center gap-2 text-sm font-semibold">
          <MapPin className="size-4 text-primary" />
          Pemantauan lokasi
          <span
            className={
              status?.aktif
                ? "rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800"
                : "rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600"
            }
          >
            {status === undefined ? "Memuat" : status.aktif ? "Aktif" : "Belum ada titik"}
          </span>
        </p>
        <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">{statusText}</p>
        <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">
          Pemantauan ini syarat untuk transaksi. Untuk berhenti, matikan izin lokasi di
          pengaturan perangkat — transaksi yang memerlukan lokasi akan tertahan sampai GPS
          aktif kembali.{" "}
          <a
            href="/privasi#lokasi-penyimpanan"
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            Baca kebijakan lokasi
          </a>
          .
        </p>
      </div>
    </section>
  );
}
