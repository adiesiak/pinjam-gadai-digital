import { BellOff, CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { ComponentType } from "react";

import { Button } from "@/components/ui/button";
import { GalatMuat, SkeletonBarisDaftar } from "@/components/ui/loading";
import { cn } from "@/lib/utils";
import {
  hitungBelumDibaca,
  JENIS_NOTIFIKASI,
  waktuRelatif,
  type NotifikasiItem,
  type NotifikasiJenis,
} from "@/lib/notifikasi";

/** Ikon per jenis — penanda kedua selain warna dan label teks. */
const IKON_JENIS: Record<NotifikasiJenis, ComponentType<{ className?: string }>> = {
  info: Info,
  sukses: CircleCheck,
  peringatan: TriangleAlert,
  error: CircleAlert,
};

/**
 * Daftar notifikasi (presentasional — tanpa Convex, tanpa router).
 *
 * Sengaja tanpa Convex supaya bisa dirender langsung oleh uji markup, dan supaya
 * satu-satunya sumber kebenaran tetap `convex/notifikasi.ts`: komponen ini tidak
 * pernah menambah, mengubah, atau menyembunyikan notifikasi — ia hanya
 * menampilkan apa yang diberikan.
 *
 * Keadaan yang dibedakan:
 * - **memuat**  → rangka baris daftar (tinggi tetap, jadi tidak ada lompatan).
 * - **galat**   → pesan yang bisa dicoba lagi; hanya muncul kalau ada sebabnya.
 * - **kosong**  → penjelasan dari mana notifikasi datang, bukan halaman hampa.
 * - **siap**    → daftar terurut menurut waktu server.
 *
 * Catatan penting untuk semua keadaan: tidak ada satu pun tempat di sini yang
 * menampilkan persentase, menyatakan pesan "sudah terkirim", atau mengarang
 * notifikasi agar daftarnya terlihat penuh.
 */
export function NotifikasiList({
  item,
  memuat = false,
  galat = null,
  onCoba,
  onBuka,
  onTandaiDibaca,
  onTandaiSemuaDibaca,
  sibuk = false,
  kunciBaruSet,
  sekarang,
}: {
  item: readonly NotifikasiItem[];
  memuat?: boolean;
  galat?: string | null;
  onCoba?: () => void;
  /** Buka detail terkait (navigasi ditangani pemanggil). */
  onBuka?: (item: NotifikasiItem) => void;
  onTandaiDibaca: (item: NotifikasiItem) => void;
  onTandaiSemuaDibaca: () => void;
  sibuk?: boolean;
  /** Kunci yang benar-benar baru — hanya ini yang diberi animasi masuk. */
  kunciBaruSet?: ReadonlySet<string>;
  /** Jam tetap untuk uji/perenderan statis; kosong = memakai jam perangkat. */
  sekarang?: number;
}) {
  const belumDibaca = hitungBelumDibaca(item);

  return (
    <div className="flex max-h-[70dvh] w-[min(22rem,calc(100vw-2rem))] flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-semibold">Notifikasi</p>
          <span
            className={cn(
              "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold tabular-nums",
              belumDibaca > 0
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-slate-200 bg-slate-50 text-slate-500",
            )}
          >
            {belumDibaca > 0 ? `${belumDibaca} belum dibaca` : "semua terbaca"}
          </span>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 shrink-0 px-2 text-[11px]"
          disabled={sibuk || belumDibaca === 0}
          onClick={onTandaiSemuaDibaca}
        >
          Tandai semua dibaca
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {memuat ? (
          <SkeletonBarisDaftar baris={3} />
        ) : galat !== null ? (
          <GalatMuat pesan={galat} onCoba={onCoba} className="mt-2" />
        ) : item.length === 0 ? (
          <div className="animate-masuk px-3 py-6 text-center">
            <span className="mx-auto flex size-10 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-400">
              <BellOff className="size-4" aria-hidden />
            </span>
            <p className="mt-3 text-sm font-semibold text-navy">Belum ada notifikasi</p>
            <p className="mx-auto mt-1 max-w-[16rem] text-xs leading-5 text-muted-foreground">
              Notifikasi muncul dari kejadian nyata pada catatan Anda: pengingat jatuh tempo,
              peringatan pola koordinat, status bukti pembayaran, dan pengumuman resmi.
            </p>
          </div>
        ) : (
          <ul aria-label="Daftar notifikasi" className="divide-y divide-slate-100">
            {item.map((it) => {
              const meta = JENIS_NOTIFIKASI[it.jenis];
              const Ikon = IKON_JENIS[it.jenis];
              const baru = kunciBaruSet?.has(it.kunci) === true;
              return (
                <li
                  key={it.kunci}
                  className={cn(
                    "flex items-start gap-2 px-1 py-2.5",
                    !it.dibaca && "bg-primary/[0.03]",
                    baru && "motion-slide-down",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl border",
                      meta.kelas,
                    )}
                    aria-hidden
                  >
                    <Ikon className="size-4" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => onBuka?.(it)}
                      className="w-full rounded-md text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      <span className="flex items-center gap-1.5">
                        {!it.dibaca && (
                          <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-primary" />
                        )}
                        <span className="truncate text-sm font-medium">{it.judul}</span>
                      </span>
                      <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                        {it.ringkasan}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px]">
                        <span
                          className={cn(
                            "rounded-full border px-1.5 py-0.5 font-semibold uppercase tracking-[0.1em]",
                            meta.kelas,
                          )}
                        >
                          {meta.label}
                        </span>
                        <span className="tabular-nums text-muted-foreground">
                          {waktuRelatif(it.waktu, sekarang)}
                        </span>
                        <span className="text-muted-foreground">
                          {it.dibaca ? "Sudah dibaca" : "Belum dibaca"}
                        </span>
                      </span>
                    </button>
                  </div>

                  {!it.dibaca && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="mt-0.5 h-7 shrink-0 px-2 text-[11px]"
                      disabled={sibuk}
                      aria-label={`Tandai dibaca: ${it.judul}`}
                      onClick={() => onTandaiDibaca(it)}
                    >
                      Dibaca
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="border-t border-slate-200 pt-2 text-[10px] leading-4 text-muted-foreground">
        Dihitung langsung dari catatan aplikasi Anda (pengingat, peringatan lokasi, bukti
        pembayaran, pengumuman). Panel ini tidak mengirim pesan apa pun.
      </p>
    </div>
  );
}
