/**
 * Kartu status kesehatan gateway WhatsApp.
 *
 * Kenapa ada: endpoint WhatsApp bergantung pada tunnel yang bisa mati kapan
 * saja. Sebelum ini satu-satunya cara mengetahui keadaannya adalah menunggu
 * email alarm (maksimal 30 menit setelah gangguan) atau menunggu ada pengguna
 * yang mengeluh. Kartu ini membuat keadaan itu terlihat begitu panel dibuka.
 *
 * Yang ditampilkan sengaja sedikit: sehat/tidak, kapan terakhir diperiksa,
 * berapa kali gagal berturut, dan alasannya. Angka lain (riwayat, tren) ada di
 * Tab 2 Statistik & Log.
 */
import { useAction, useQuery } from "convex/react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  WifiOff,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { formatWaktuWIB } from "@/lib/waktu";

/** Jarak waktu dalam bahasa manusia, untuk "diperiksa 3 menit lalu". */
function sejakKapan(ms: number): string {
  const beda = Math.max(0, Date.now() - ms);
  const menit = Math.floor(beda / 60_000);
  if (menit < 1) return "baru saja";
  if (menit < 60) return `${menit} menit lalu`;
  const jam = Math.floor(menit / 60);
  if (jam < 24) return `${jam} jam lalu`;
  return `${Math.floor(jam / 24)} hari lalu`;
}

export function StatusGatewayWa() {
  const status = useQuery(api.jagaGatewayWa.statusGateway, {});
  const periksa = useAction(api.jagaGatewayWa.periksaSekarang);
  const [sibuk, setSibuk] = useState(false);

  const jalankan = async () => {
    setSibuk(true);
    try {
      const hasil = await periksa({});
      if (hasil.sehat) {
        toast.success("Gateway WhatsApp dapat dihubungi.");
      } else {
        toast.error(
          hasil.alasan ?? "Gateway tidak dapat dihubungi. Lihat alasan di kartu.",
        );
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Pemeriksaan gagal dijalankan.",
      );
    } finally {
      setSibuk(false);
    }
  };

  // Tiga keadaan yang berbeda artinya dan tidak boleh tampil sama:
  //  - undefined: query masih memuat
  //  - null: belum pernah diperiksa
  //  - objek: sudah pernah, sehat atau tidak
  if (status === undefined) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm text-muted-foreground shadow-sm">
        <Loader2 className="size-4 animate-spin" />
        Memuat status gateway…
      </div>
    );
  }

  const belumDiperiksa = status === null;
  const sehat = status?.sehat === true;
  const gagal = status?.gagalBerturut ?? 0;

  // Warna dan ikon mengikuti tingkat keparahan, bukan sekadar sehat/tidak:
  // satu kegagalan belum tentu gangguan (ambang alarm dua kali).
  const nada = belumDiperiksa
    ? {
        kotak: "border-slate-200 bg-slate-50",
        ikon: "text-slate-500",
        judul: "Belum pernah diperiksa",
      }
    : sehat
      ? {
          kotak: "border-success-border bg-success-soft",
          ikon: "text-success-foreground",
          judul: "Gateway dapat dihubungi",
        }
      : gagal >= 2
        ? {
            kotak: "border-red-200 bg-red-50",
            ikon: "text-red-700",
            judul: "Gateway tidak dapat dihubungi",
          }
        : {
            kotak: "border-amber-200 bg-amber-50",
            ikon: "text-amber-700",
            judul: "Gangguan sesaat terdeteksi",
          };

  const Ikon = belumDiperiksa
    ? WifiOff
    : sehat
      ? CheckCircle2
      : AlertTriangle;

  return (
    <div className={`rounded-2xl border px-5 py-4 shadow-sm ${nada.kotak}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Ikon className={`mt-0.5 size-5 shrink-0 ${nada.ikon}`} />
          <div className="min-w-0">
            <p className="text-sm font-semibold">{nada.judul}</p>

            {belumDiperiksa ? (
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Pemantau berjalan tiap 15 menit. Tekan periksa untuk mengetahui
                keadaannya sekarang.
              </p>
            ) : (
              <div className="mt-1 space-y-1 text-xs leading-5 text-muted-foreground">
                <p>
                  Diperiksa {sejakKapan(status.diperiksaPada)} (
                  {formatWaktuWIB(status.diperiksaPada)})
                  {sehat && status.terakhirSehatPada !== null
                    ? ` · terakhir sehat ${sejakKapan(status.terakhirSehatPada)}`
                    : ""}
                </p>
                {!sehat && gagal > 0 ? (
                  <p>
                    Gagal {gagal}× berturut-turut
                    {gagal >= 2
                      ? " — ambang peringatan tercapai, email alarm dikirim ke admin (maksimal sekali per 6 jam)."
                      : " — belum cukup untuk memicu email alarm (ambangnya 2×)."}
                  </p>
                ) : null}
                {!sehat && status.alasan !== null ? (
                  <p className="break-words rounded-lg border border-current/20 bg-white/60 px-2 py-1 font-mono text-[11px]">
                    {status.alasan}
                  </p>
                ) : null}
                {status.apiUrl !== null ? (
                  <p className="break-all font-mono text-[11px] opacity-70">
                    {status.apiUrl}
                  </p>
                ) : null}
              </div>
            )}

            {!belumDiperiksa && !sehat && gagal >= 2 ? (
              <p className="mt-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs leading-5 text-red-800">
                Dampak: kode OTP WhatsApp dan pengingat tagihan tidak terkirim.
                Pengguna yang hanya memakai WhatsApp tidak bisa masuk — arahkan
                mereka memakai <strong>OTP email</strong> sampai gateway pulih.
              </p>
            ) : null}
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 gap-2 rounded-full"
          onClick={jalankan}
          disabled={sibuk}
        >
          {sibuk ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
          Periksa sekarang
        </Button>
      </div>
    </div>
  );
}
