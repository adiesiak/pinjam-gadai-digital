import { useQuery } from "convex/react";
import { ArrowLeft, Loader2, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { usePratinjau } from "@/hooks/use-pratinjau";
import { bacaNonce } from "@/lib/pratinjau";

/**
 * BILAH PRATINJAU — penanda bahwa layar ini sedang dipakai sebagai akun orang
 * lain, plus satu tombol untuk kembali ke Mode Admin.
 *
 * Kenapa harus selalu terlihat: selama pratinjau, peramban ini memegang sesi
 * NYATA akun target. Tanpa penanda, Super Admin yang membuka banyak tab mudah
 * lupa sedang berada di akun siapa, dan tindakan yang ia lakukan tercatat atas
 * nama akun itu. Bilah ini karena itu tidak pernah disembunyikan selama
 * pratinjau berjalan.
 *
 * Tiga keadaan yang ditangani:
 *  - `aktif`   — pratinjau berjalan; tampil akun yang dibuka, admin pembukanya,
 *                dan batas waktunya.
 *  - `memuat`  — detail belum tiba; bilah tetap tampil supaya penandanya tidak
 *                sempat hilang saat jaringan lambat.
 *  - `berakhir`— pratinjau ditutup/kedaluwarsa, tetapi salinan sesi admin masih
 *                ada di peramban ini; jalan pulang tetap ditawarkan.
 */

export type InfoPratinjau = {
  adminLabel: string;
  targetLabel: string;
  berlakuHingga: number;
};

/** Jam ringkas untuk batas waktu pratinjau. */
function jamRingkas(ms: number): string {
  return new Date(ms).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Bagian tampilan murni — dipakai uji render tanpa Convex. */
export function BilahPratinjau({
  mode,
  info,
  busy,
  onKembali,
}: {
  mode: "memuat" | "aktif" | "berakhir";
  info?: InfoPratinjau;
  busy: boolean;
  onKembali: () => void;
}) {
  return (
    <aside
      aria-label="Bilah pratinjau Super Admin"
      className="sticky top-0 z-40 border-b border-[#c9a86a]/55 bg-[#fdf8ee]/95 text-slate-900 backdrop-blur"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6">
        <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6e5523]">
          <ShieldAlert className="size-4" aria-hidden="true" />
          Mode pratinjau
        </span>

        {mode === "aktif" && info && (
          <p className="min-w-0 text-sm leading-6">
            Anda masuk sebagai <span className="font-semibold">{info.targetLabel}</span>.
            Tindakan di layar ini tercatat sebagai pratinjau oleh{" "}
            <span className="font-semibold">{info.adminLabel}</span>. Berlaku sampai{" "}
            {jamRingkas(info.berlakuHingga)}.
          </p>
        )}

        {mode === "memuat" && (
          <p className="flex min-w-0 items-center gap-2 text-sm leading-6 text-slate-600">
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            Menyiapkan detail pratinjau…
          </p>
        )}

        {mode === "berakhir" && (
          <p className="min-w-0 text-sm leading-6">
            Pratinjau ini sudah berakhir. Sesi admin Anda masih tersimpan di peramban ini.
          </p>
        )}

        <Button
          type="button"
          size="sm"
          variant="outline"
          className="ml-auto gap-2 rounded-xl border-[#c9a86a]/70 bg-white text-[#55421d] hover:bg-[#fbf3e4]"
          disabled={busy}
          onClick={onKembali}
        >
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <ArrowLeft className="size-3.5" aria-hidden="true" />
          )}
          Kembali ke Mode Admin
        </Button>
      </div>
    </aside>
  );
}

/** Pembungkus ber-Convex: hanya tampil bila peramban ini sedang mempratinjau. */
export function PratinjauBanner() {
  const { user } = useAuth();
  const [nonce] = useState(() => bacaNonce());
  const info = useQuery(
    api.pratinjau.pratinjauAktif,
    nonce === null ? "skip" : { nonce },
  );
  const { busy, kembali } = usePratinjau();

  // Tanpa nonce tersimpan, peramban ini bukan peramban pratinjau. Admin sendiri
  // tidak pernah menjadi target pratinjau (dijaga server), jadi bilah ini tidak
  // muncul di panel admin.
  if (nonce === null || user === undefined || user === null || user.role === "admin") {
    return null;
  }

  const mode = info === undefined ? "memuat" : info === null ? "berakhir" : "aktif";

  return (
    <BilahPratinjau
      mode={mode}
      info={
        mode === "aktif" && info
          ? {
              adminLabel: info.adminLabel,
              targetLabel: info.targetLabel,
              berlakuHingga: info.berlakuHingga,
            }
          : undefined
      }
      busy={busy}
      onKembali={() => {
        void kembali().catch((error: unknown) => {
          toast.error(
            error instanceof Error ? error.message : "Gagal kembali ke Mode Admin.",
          );
        });
      }}
    />
  );
}
