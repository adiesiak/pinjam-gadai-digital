import { useMutation, useQuery } from "convex/react";
import { Eye, Loader2, ShieldOff } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SkeletonBarisDaftar } from "@/components/ui/loading";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * PRATINJAU AKTIF — jaring pengaman untuk fitur "masuk sebagai".
 *
 * Saat Super Admin masuk sebagai seorang pendana/peminjam, peramban itu memegang
 * sesi nyata akun tersebut. Kalau tabnya ditutup tanpa menekan "Kembali ke Mode
 * Admin", sesinya masih hidup sampai batas waktunya. Kartu ini yang membuat
 * keadaan itu terlihat dan bisa ditutup dari panel — bukan hanya bergantung pada
 * ingatan orang yang mempratinjau.
 *
 * Mengakhiri dari sini mencabut sesi Auth hasil pratinjau (dibuat setelah
 * pratinjau mulai) dan menutup catatannya; sesi sungguhan milik pemilik akun
 * tidak tersentuh.
 */

/** Baris tampilan — sengaja lebih kecil dari hasil query agar mudah diuji. */
export type BarisPratinjauAktif = {
  id: string;
  adminLabel: string;
  targetLabel: string;
  targetPeran: string | null;
  mulai: number;
  berlakuHingga: number;
  alasan: string | null;
};

/** Kelas kartu bersama panel ini. */
const KARTU = "rounded-2xl border border-slate-200 bg-white p-6 shadow-sm";

function waktuRingkas(ms: number): string {
  return new Date(ms).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Label peran yang dibaca manusia. */
function labelPeran(peran: string | null): string {
  if (peran === "dana" || peran === "pendana") return "pendana";
  if (peran === null || peran === "") return "tanpa peran";
  return peran;
}

/** Bagian tampilan murni — dipakai uji render tanpa Convex. */
export function DaftarPratinjauAktif({
  baris,
  busy,
  onAkhiri,
}: {
  baris: readonly BarisPratinjauAktif[] | undefined;
  busy: string | null;
  onAkhiri: (r: BarisPratinjauAktif) => void;
}) {
  return (
    <section className={KARTU}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-amber-50 text-amber-800">
            <Eye className="size-4" aria-hidden="true" />
          </span>
          <div>
            <h3 className="font-bold text-slate-900">Pratinjau Aktif</h3>
            <p className="text-xs text-muted-foreground">
              Sesi &ldquo;masuk sebagai&rdquo; yang sedang berjalan. Mengakhiri di sini
              mencabut sesi hasil pratinjau dan menutup catatannya.
            </p>
          </div>
        </div>
        {baris !== undefined && baris.length > 0 && (
          <Badge variant="outline" className="border-slate-200 text-slate-600">
            {baris.length} berjalan
          </Badge>
        )}
      </header>

      {baris === undefined ? (
        <div className="mt-4">
          <SkeletonBarisDaftar baris={2} />
        </div>
      ) : baris.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-6 text-center text-xs text-muted-foreground">
          Tidak ada pratinjau berjalan. Pratinjau yang dibiarkan terbuka berakhir
          sendiri sesuai batas waktunya.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100">
          {baris.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">
                  {r.adminLabel} &rarr; {r.targetLabel}
                </p>
                <p className="text-xs text-muted-foreground">
                  Peran {labelPeran(r.targetPeran)} · mulai {waktuRingkas(r.mulai)} ·
                  berlaku sampai {waktuRingkas(r.berlakuHingga)}
                </p>
                {r.alasan !== null && r.alasan !== "" && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Alasan: {r.alasan}
                  </p>
                )}
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-2 rounded-xl"
                disabled={busy === r.id}
                onClick={() => onAkhiri(r)}
              >
                {busy === r.id ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <ShieldOff className="size-3.5" aria-hidden="true" />
                )}
                Akhiri pratinjau
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Pembungkus ber-Convex: membaca daftar dan mengakhiri satu pratinjau. */
export function PratinjauAktifPanel() {
  const daftar = useQuery(api.pratinjau.daftarPratinjauAktif, {});
  const akhiri = useMutation(api.pratinjau.akhiriPratinjauOlehAdmin);
  const [busy, setBusy] = useState<string | null>(null);

  const hentikan = async (r: BarisPratinjauAktif) => {
    setBusy(r.id);
    try {
      const hasil = await akhiri({ id: r.id as Id<"pratinjauSesi"> });
      toast.success(
        hasil.sudahSelesai
          ? "Pratinjau itu sudah berakhir."
          : `Pratinjau ${r.targetLabel} diakhiri${hasil.dicabut > 0 ? `; ${hasil.dicabut} sesi dicabut` : ""}.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Gagal mengakhiri pratinjau.",
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <DaftarPratinjauAktif
      baris={daftar?.rows}
      busy={busy}
      onAkhiri={(r) => void hentikan(r)}
    />
  );
}
