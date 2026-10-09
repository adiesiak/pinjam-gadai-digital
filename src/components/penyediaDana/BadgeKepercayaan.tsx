/**
 * Dua penanda kerja untuk tabel penyedia dana / admin:
 *
 *  1. `TampilanJatuhTempo` — tanggal jatuh tempo yang sengaja dicetak **tebal
 *     dan berwarna**, disertai lencana hitung hari ("Sisa 12 hari",
 *     "Jatuh tempo hari ini", "Terlambat 3 hari"). Tujuannya satu: admin tidak
 *     perlu menghitung sendiri dan tidak melewatkan tanggal yang mendesak.
 *  2. `BadgeKepercayaan` — indeks kepercayaan peminjam (skor internal PINDAI,
 *     BUKAN skor kredit lembaga penilai) beserta dasar penilaiannya di tooltip.
 *
 * Keduanya presentasional: angka dihitung `lib/jatuhTempo` dan
 * `lib/kepercayaanPeminjam`, jadi bisa diuji tanpa server maupun jam perangkat.
 */
import { BadgeCheck, CalendarClock, ShieldAlert, Sparkles, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { NadaJatuhTempo, TampilanJatuhTempo as DataJatuhTempo } from "@/lib/jatuhTempo";
import type { RingkasKepercayaan, TingkatKepercayaan } from "@/lib/kepercayaanPeminjam";

/** Warna per tingkat kepercayaan — konsisten dengan palet slate halaman ini. */
const KELAS_TINGKAT: Record<TingkatKepercayaan, string> = {
  kuat: "border-emerald-200 bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
  berkembang: "border-sky-200 bg-sky-100 text-sky-700 hover:bg-sky-100",
  baru: "border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-100",
  perlu_perhatian: "border-red-200 bg-red-100 text-red-700 hover:bg-red-100",
};

const IKON_TINGKAT: Record<TingkatKepercayaan, ReactNode> = {
  kuat: <BadgeCheck className="size-3" aria-hidden />,
  berkembang: <TrendingUp className="size-3" aria-hidden />,
  baru: <Sparkles className="size-3" aria-hidden />,
  perlu_perhatian: <ShieldAlert className="size-3" aria-hidden />,
};

/** Warna teks tanggal + lencana hitung hari per nada jatuh tempo. */
const KELAS_NADA: Record<NadaJatuhTempo, { teks: string; badge: string }> = {
  terlambat: {
    teks: "text-red-700",
    badge: "border-red-200 bg-red-100 text-red-700 hover:bg-red-100",
  },
  segera: {
    teks: "text-amber-700",
    badge: "border-amber-300 bg-amber-100 text-amber-900 hover:bg-amber-100",
  },
  netral: {
    teks: "text-slate-900",
    badge: "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-50",
  },
  lunas: {
    teks: "text-slate-500",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50",
  },
  belum_didanai: {
    teks: "text-slate-400",
    badge: "border-slate-200 bg-white text-slate-500 hover:bg-white",
  },
};

/**
 * Tanggal jatuh tempo yang mencolok + lencana hitung hari.
 * `align="right"` dipakai di baris detail (label kiri, nilai kanan).
 */
export function TampilanJatuhTempo({
  tampilan,
  align = "left",
}: {
  tampilan: DataJatuhTempo;
  align?: "left" | "right";
}) {
  const kelas = KELAS_NADA[tampilan.nada];
  return (
    <span
      className={cn(
        "inline-flex flex-col gap-1",
        align === "right" ? "items-end text-right" : "items-start",
      )}
      title={tampilan.aksesibilitas}
      aria-label={tampilan.aksesibilitas}
    >
      <span
        className={cn(
          "inline-flex items-center gap-1.5 whitespace-nowrap text-base font-bold tabular-nums tracking-tight",
          kelas.teks,
        )}
      >
        <CalendarClock className="size-4 shrink-0 opacity-70" aria-hidden />
        {tampilan.teks}
      </span>
      <Badge variant="outline" className={cn("border text-[10px] font-semibold", kelas.badge)}>
        {tampilan.hitung}
      </Badge>
    </span>
  );
}

/** Versi ringkas satu baris — untuk kartu layar sempit. */
export function TampilanJatuhTempoRingkas({ tampilan }: { tampilan: DataJatuhTempo }) {
  const kelas = KELAS_NADA[tampilan.nada];
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span
        className={cn("text-sm font-bold tabular-nums tracking-tight", kelas.teks)}
        title={tampilan.aksesibilitas}
      >
        {tampilan.teks}
      </span>
      <Badge variant="outline" className={cn("border text-[10px] font-semibold", kelas.badge)}>
        {tampilan.hitung}
      </Badge>
    </span>
  );
}

/**
 * Lencana indeks kepercayaan peminjam. `tampilkanRingkas` menambah satu baris
 * angka pendukung ("2 tepat waktu · 0 terlambat") untuk ruang yang lega.
 */
export function BadgeKepercayaan({
  kepercayaan,
  tampilkanRingkas = false,
}: {
  kepercayaan: RingkasKepercayaan;
  tampilkanRingkas?: boolean;
}) {
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Badge
        variant="outline"
        className={cn("gap-1 border text-[10px] font-semibold", KELAS_TINGKAT[kepercayaan.tingkat])}
        title={`${kepercayaan.alasan.join(" · ")} (skor internal PINDAI, bukan skor kredit lembaga)`}
      >
        {IKON_TINGKAT[kepercayaan.tingkat]}
        {kepercayaan.label}
        <span className="font-mono tabular-nums opacity-80">{kepercayaan.skor}/100</span>
      </Badge>
      {tampilkanRingkas && (
        <span className="text-[10px] text-muted-foreground">{kepercayaan.ringkas}</span>
      )}
    </span>
  );
}
