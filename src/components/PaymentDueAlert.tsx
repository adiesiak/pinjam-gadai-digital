/**
 * Pengingat jatuh tempo beranimasi (Animated Payment Due Alert).
 *
 * Dua wajah dari satu sistem:
 *  - `PaymentDueAlert`  — kartu pengingat di dashboard Peminjam: judul tingkat,
 *    nominal kewajiban, tanggal jatuh tempo, sisa hari, hitung mundur, dan CTA
 *    menuju detail pembayaran.
 *  - `PengingatJatuhTempoPendana` — indikator ringkas di ruang `/penyedia-dana`
 *    untuk pinjaman yang MEMANG dialokasikan ke penyedia dana itu: nomor
 *    referensi, nominal alokasi, jatuh tempo, sisa hari, status, dan overdue.
 *
 * Batas yang dijaga:
 * - **Status selalu dari server.** Tingkat visual dan hitung mundur di sini
 *   hanya menyajikan angka jatuh tempo yang sudah dihitung (`lib/jatuhTempo`,
 *   `lib/loan`) — tidak ada perhitungan uang, status, atau denda di komponen.
 * - **Tanpa data identitas baru.** Ruang penyedia dana tetap hanya menampilkan
 *   nomor referensi dan angka; nama peminjam tetap lewat penyamaran halaman.
 * - **Gerak yang santun.** Semua animasi berasal dari utility `due-*` di
 *   `index.css` dan berhenti total saat `prefers-reduced-motion: reduce`.
 * - Keduanya presentasional (tanpa Convex), jadi bisa dirender langsung oleh uji
 *   markup `PaymentDueAlert.render.test.tsx`.
 */
import {
  ArrowRight,
  BellRing,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  Timer,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useState } from "react";

import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatRupiahAman } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  hitungMundur,
  judulPengingat,
  LABEL_TINGKAT,
  perluDenyut,
  perluNapas,
  teksHitungMundur,
  tingkatDariTampilan,
  tingkatPengingat,
  type TingkatPengingat,
} from "@/lib/pengingatJatuhTempo";
import type { NadaJatuhTempo } from "@/lib/jatuhTempo";

/**
 * Palet per tingkat. Warna mendesak tetap berarti.
 *
 * Hanya nada terang: aplikasi memakai satu wajah terang (DESIGN.md), tidak ada
 * kelas `.dark` yang pernah dipasang, jadi varian `dark:` di sini hanya cabang
 * mati yang menambah panjang kelas tanpa pernah berlaku.
 */
const PALET: Record<
  TingkatPengingat,
  { kotak: string; garis: string; ikon: string; judul: string; badge: string; teks: string }
> = {
  aman: {
    kotak: "border-emerald-200 bg-white",
    garis: "bg-emerald-500",
    ikon: "border-emerald-200 bg-emerald-50 text-emerald-700",
    judul: "text-emerald-900",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    teks: "text-emerald-700",
  },
  segera: {
    kotak: "border-amber-300 bg-amber-50/70",
    garis: "bg-amber-500",
    ikon: "border-amber-300 bg-amber-100 text-amber-800",
    judul: "text-amber-900",
    badge: "border-amber-300 bg-amber-100 text-amber-800",
    teks: "text-amber-800",
  },
  hari_ini: {
    kotak: "border-gold bg-gold/10",
    garis: "bg-gold",
    ikon: "border-gold/60 bg-gold/20 text-gold-foreground",
    judul: "text-gold-foreground",
    badge: "border-gold/60 bg-gold/20 text-gold-foreground",
    teks: "text-gold-foreground",
  },
  terlambat: {
    kotak: "border-red-300 bg-red-50/70",
    garis: "bg-red-500",
    ikon: "border-red-300 bg-red-100 text-red-700",
    judul: "text-red-900",
    badge: "border-red-300 bg-red-100 text-red-700",
    teks: "text-red-700",
  },
};

const IKON_TINGKAT: Record<TingkatPengingat, typeof BellRing> = {
  aman: CalendarClock,
  segera: BellRing,
  hari_ini: TriangleAlert,
  terlambat: CircleAlert,
};

/** Tanggal panjang bahasa Indonesia, mis. "20 Oktober 2026". */
function tanggalPanjang(ms: number): string {
  return new Date(ms).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Jam yang berdenyut sendiri untuk hitung mundur.
 *
 * Convex hanya merender ulang saat DATA berubah, bukan saat waktu berjalan —
 * tanpa denyut ini hitung mundur akan membeku di layar. Intervalnya 30 detik
 * (satuan terkecil kita menit), jadi tidak ada render per detik.
 */
function useDenyutJam(aktif: boolean, intervalMs = 30_000): number {
  const [sekarang, setSekarang] = useState(() => Date.now());
  useEffect(() => {
    if (!aktif) return;
    const id = window.setInterval(() => setSekarang(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [aktif, intervalMs]);
  return sekarang;
}

/** Kartu pengingat jatuh tempo Peminjam. */
export function PaymentDueAlert({
  nomorReferensi,
  nominal,
  jatuhTempoPada,
  sisaHari,
  hariTerlambat,
  dendaTerlambat = 0,
  onLihatDetail,
  /** Jam tetap untuk uji/perenderan statis; kosong = berdenyut sendiri. */
  sekarang: sekarangTetap,
}: {
  nomorReferensi: string;
  /** Nominal kewajiban yang harus dibayar (rupiah bulat). */
  nominal: number;
  jatuhTempoPada: number;
  sisaHari: number;
  hariTerlambat: number;
  dendaTerlambat?: number;
  onLihatDetail?: () => void;
  sekarang?: number;
}) {
  const denyut = useDenyutJam(sekarangTetap === undefined);
  const sekarang = sekarangTetap ?? denyut;

  const tingkat = tingkatPengingat(sisaHari, hariTerlambat);
  const palet = PALET[tingkat];
  const Ikon = IKON_TINGKAT[tingkat];
  const judul = judulPengingat(tingkat, sisaHari, hariTerlambat);
  const mundur = teksHitungMundur(hitungMundur(jatuhTempoPada, sekarang));
  const berdenyut = perluDenyut(tingkat);
  const bernafas = perluNapas(tingkat);

  return (
    <section
      role="status"
      aria-live="polite"
      aria-labelledby="pengingat-jatuh-tempo-judul"
      className={cn(
        // Tanpa `overflow-hidden`: cincin denyut di sekitar ikon boleh sedikit
        // "bernapas" keluar kartu; memotongnya justru membuat ring tampak rusak.
        "animate-masuk relative mt-6 rounded-2xl border px-4 py-4 shadow-sm sm:px-5 sm:py-5",
        palet.kotak,
        bernafas && "animate-due-breathe",
      )}
    >
      {/* Garis warna di tepi kiri: tingkat terbaca sebelum satu kata pun. */}
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", palet.garis)} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {/* Kotak ikon + cincin yang melebar pelan (hanya saat mendesak). */}
          <span className="relative mt-0.5 flex size-10 shrink-0 items-center justify-center">
            {berdenyut && (
              <span
                aria-hidden
                className={cn(
                  "animate-due-ring absolute inset-0 rounded-2xl opacity-40",
                  palet.garis,
                )}
              />
            )}
            <span
              className={cn(
                "relative flex size-10 items-center justify-center rounded-2xl border",
                palet.ikon,
              )}
            >
              <Ikon className="size-5" aria-hidden />
            </span>
          </span>

          <div className="min-w-0">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]",
                palet.badge,
                berdenyut && "animate-due-pop",
              )}
            >
              {LABEL_TINGKAT[tingkat]}
            </span>

            <h2
              id="pengingat-jatuh-tempo-judul"
              className={cn("mt-2 text-base font-semibold leading-snug sm:text-lg", palet.judul)}
            >
              {judul}
            </h2>

            <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
              Kewajiban pembayaran Anda sebesar{" "}
              <strong className="tabular-nums text-foreground">{formatRupiahAman(nominal)}</strong>{" "}
              akan jatuh tempo pada{" "}
              <strong className="font-medium text-foreground">{tanggalPanjang(jatuhTempoPada)}</strong>
              . Catatan pinjaman{" "}
              <span className="font-mono text-xs text-muted-foreground">{nomorReferensi}</span>.
            </p>

            {tingkat !== "terlambat" ? (
              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <Timer className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="text-muted-foreground">Sisa waktu</span>
                {/* Kunci pada teks: animasi tick hanya berjalan saat nilainya berubah. */}
                <span
                  key={mundur}
                  className={cn("animate-due-tick font-semibold tabular-nums", palet.teks)}
                >
                  {mundur}
                </span>
              </p>
            ) : (
              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <TriangleAlert className="size-3.5 shrink-0 text-red-600" aria-hidden />
                <span className="font-semibold text-red-700">
                  Terlambat {hariTerlambat} hari
                </span>
                {dendaTerlambat > 0 && (
                  <span className="tabular-nums text-muted-foreground">
                    · denda tercatat {formatRupiahAman(dendaTerlambat)}
                  </span>
                )}
              </p>
            )}
          </div>
        </div>

        {/* Sisi tindakan: nominal besar + CTA. Di layar sempit menumpuk ke bawah. */}
        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end sm:text-right">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Total kewajiban · bukan tagihan
          </p>
          <p className={cn("text-xl font-semibold tabular-nums leading-tight sm:text-2xl", palet.judul)}>
            {formatRupiahAman(nominal)}
          </p>
          {onLihatDetail && (
            <Button
              size="sm"
              className="mt-1 gap-1.5"
              onClick={onLihatDetail}
              aria-label="Lihat detail pembayaran"
            >
              Lihat Detail Pembayaran
              <ArrowRight className="size-3.5" aria-hidden />
            </Button>
          )}
        </div>
      </div>

      <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
        Tanggal, status, dan nominal mengikuti catatan PINDAI. Ini pengingat
        internal — bukan tagihan, bukti transfer, atau kewajiban pembayaran aktual.
      </p>
    </section>
  );
}

/** Satu baris pinjaman penyedia dana yang perlu dipantau jatuh temponya. */
export type BarisPengingatPendana = {
  id: string;
  nomorReferensi: string;
  /** Nominal alokasi (pokok) pinjaman ini. */
  pokokPinjaman: number;
  /** Status pembayaran pinjaman — selalu dari server. */
  status: string;
  /** Tanggal jatuh tempo; null bila belum didanai. */
  jatuhTempoPada: number | null;
  /** Kalimat hitung hari dari `lib/jatuhTempo` (mis. "Sisa 2 hari"). */
  hitung: string;
  /** Nada dari `lib/jatuhTempo` — sumber yang sama dengan tabel ruang ini. */
  nada: NadaJatuhTempo;
};

const URUTAN_TINGKAT: Record<TingkatPengingat, number> = {
  terlambat: 0,
  hari_ini: 1,
  segera: 2,
  aman: 3,
};

/**
 * Indikator jatuh tempo ringkas untuk pinjaman yang dialokasikan ke penyedia
 * dana yang sedang membuka ruang ini. Sengaja HANYA menampilkan nomor
 * referensi, nominal alokasi, tanggal jatuh tempo, sisa hari, dan status —
 * tanpa identitas peminjam maupun berkas.
 */
export function PengingatJatuhTempoPendana({
  rows,
  sekarang,
}: {
  rows: BarisPengingatPendana[];
  /** Jam berjalan halaman (`useJamBerjalan`) — dipakai menghitung mundur. */
  sekarang: number;
}) {
  if (rows.length === 0) return null;

  const terurut = [...rows].sort((a, b) => {
    const ta = URUTAN_TINGKAT[tingkatDariTampilan(a)];
    const tb = URUTAN_TINGKAT[tingkatDariTampilan(b)];
    if (ta !== tb) return ta - tb;
    return (a.jatuhTempoPada ?? 0) - (b.jatuhTempoPada ?? 0);
  });

  const jumlahMendesak = terurut.filter(
    (r) => tingkatDariTampilan(r) !== "aman",
  ).length;

  return (
    <section
      aria-label="Jatuh tempo pinjaman Anda"
      className="animate-masuk mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-navy">
          <BellRing className="size-4 text-primary" aria-hidden />
          Jatuh tempo pinjaman Anda
        </h2>
        {jumlahMendesak > 0 ? (
          <Badge className="border-0 bg-amber-100 text-amber-800 hover:bg-amber-100">
            <TriangleAlert className="mr-1 size-3" aria-hidden /> {jumlahMendesak} perlu perhatian
          </Badge>
        ) : (
          <Badge className="border-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
            <CheckCircle2 className="mr-1 size-3" aria-hidden /> semua jauh dari jatuh tempo
          </Badge>
        )}
      </div>

      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        Hanya pinjaman yang dialokasikan kepada Anda. Status dan tanggal mengikuti pencatatan
        internal PINDAI — bukan tagihan maupun bukti pemindahan dana.
      </p>

      <ul className="mt-3 space-y-2.5">
        {terurut.map((r) => {
          const tingkat = tingkatDariTampilan(r);
          const palet = PALET[tingkat];
          const Ikon = IKON_TINGKAT[tingkat];
          const bernafas = perluNapas(tingkat);
          const mundur =
            r.jatuhTempoPada !== null && tingkat !== "terlambat"
              ? teksHitungMundur(hitungMundur(r.jatuhTempoPada, sekarang))
              : null;

          return (
            <li
              key={r.id}
              className={cn(
                "relative overflow-hidden rounded-2xl border px-3.5 py-3",
                palet.kotak,
                bernafas && "animate-due-breathe",
              )}
            >
              <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", palet.garis)} />
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl border", palet.ikon)}>
                    <Ikon className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-navy">
                      Pinjaman{" "}
                      <span className="font-mono text-xs text-muted-foreground">
                        #{r.nomorReferensi}
                      </span>
                    </p>
                    <p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">
                      Alokasi <strong className="tabular-nums text-foreground">{formatRupiahAman(r.pokokPinjaman)}</strong>
                      {r.jatuhTempoPada !== null && (
                        <>
                          {" "}
                          · jatuh tempo{" "}
                          <span className="font-medium text-foreground">
                            {tanggalPanjang(r.jatuhTempoPada)}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <Badge
                    variant="outline"
                    className={cn("gap-1 border text-[11px] font-bold", palet.badge)}
                  >
                    <Ikon className="size-3" aria-hidden />
                    {r.hitung}
                  </Badge>
                  {mundur !== null && (
                    <span
                      key={mundur}
                      className={cn("animate-due-tick text-[11px] font-semibold tabular-nums", palet.teks)}
                    >
                      {mundur}
                    </span>
                  )}
                  <StatusBadge status={r.status} kind="loan" />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
