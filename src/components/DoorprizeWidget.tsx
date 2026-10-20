import { useQuery } from "convex/react";
import { Gift, Sparkles, Ticket, Trophy } from "lucide-react";
import { useEffect, useState } from "react";

import { api } from "@/convex/_generated/api";
import { formatRupiah } from "@/lib/money";

/** Sisa waktu sampai pengundian, dalam hari + jam. */
function sisaWaktu(target: number, sekarang: number): string {
  const sisa = Math.max(0, target - sekarang);
  const hari = Math.floor(sisa / 86_400_000);
  const jam = Math.floor((sisa % 86_400_000) / 3_600_000);
  if (sisa === 0) return "Pengundian sedang berlangsung";
  if (hari > 0) return `${hari} hari ${jam} jam lagi`;
  const menit = Math.max(1, Math.floor((sisa % 3_600_000) / 60_000));
  return jam > 0 ? `${jam} jam ${menit} menit lagi` : `${menit} menit lagi`;
}

/**
 * Widget Doorprize Emas — tiket aktif, hitung mundur pengundian, dan hadiah.
 *
 * Angka tiket dibaca dari server (`doorprize.ringkasanSaya`), bukan dihitung
 * dari riwayat di klien: tiket hanya sah bila benar-benar tercatat di basis
 * data. Peran menentukan kalimat sumber tiket, bukan angkanya.
 */
export function DoorprizeWidget({
  peran,
  className = "",
}: {
  peran: "peminjam" | "pendana";
  className?: string;
}) {
  const data = useQuery(api.doorprize.ringkasanSaya, {});
  const [sekarang, setSekarang] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setSekarang(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (data === undefined) {
    return (
      <section
        aria-label="Doorprize Emas"
        className={`glass-card mt-4 rounded-2xl border p-4 sm:p-5 ${className}`}
      >
        <p className="text-xs text-muted-foreground">Memuat tiket doorprize…</p>
      </section>
    );
  }
  if (data === null) return null;

  const tiket = peran === "peminjam" ? data.tiketPeminjam : data.tiketPendana;
  const sumber =
    peran === "peminjam"
      ? "1 tiket untuk setiap pinjaman yang lunas tepat waktu."
      : "1 tiket untuk setiap Rp1.000.000 pendanaan yang selesai satu siklus 30 hari.";

  return (
    <section
      aria-labelledby="judul-doorprize"
      className={`glass-card mt-4 overflow-hidden rounded-2xl border border-amber-200/70 ${className}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 bg-gradient-to-br from-amber-50 via-white to-emerald-50/60 p-4 sm:p-5">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-800">
            <Sparkles className="size-3.5" aria-hidden /> Undian bulanan
          </p>
          <h2 id="judul-doorprize" className="mt-1 font-display text-base text-slate-900">
            Doorprize Emas Bulan Ini
          </h2>
          <p className="mt-1 text-xs leading-5 text-slate-600">{sumber}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-100/80 px-3 py-1 text-[11px] font-semibold text-amber-900">
          <Trophy className="size-3.5" aria-hidden />
          {data.hadiahUtama}
        </span>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-3 sm:p-5">
        <div className="rounded-xl border border-amber-200 bg-white px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-800">
            <Ticket className="size-3.5" aria-hidden /> Tiket aktif
          </p>
          <p className="mt-0.5 text-2xl font-semibold tabular-nums text-slate-900">
            {tiket}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Pengundian
          </p>
          <p className="mt-0.5 text-sm font-semibold text-slate-900">
            {data.labelTanggalUndian}
          </p>
          <p className="mt-0.5 text-[11px] tabular-nums text-slate-500">
            {sisaWaktu(data.tanggalUndian, sekarang)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            <Gift className="size-3.5" aria-hidden /> Hadiah hiburan
          </p>
          <p className="mt-0.5 text-sm font-semibold text-slate-900">
            {data.hadiahHiburan}
          </p>
        </div>
      </div>

      <p className="border-t border-amber-100 bg-white/70 px-4 py-2.5 text-[11px] leading-5 text-slate-600 sm:px-5">
        {data.pemenang === null
          ? "Pemenang diundi otomatis dari tiket aktif. Tiket tidak dapat dipindahtangankan."
          : `Pemenang bulan ini: ${data.pemenang.nama} (${data.pemenang.peran === "peminjam" ? "peminjam" : "pendana"}) — ${data.pemenang.hadiah}.`}
      </p>
    </section>
  );
}

/**
 * Satu baris ringkas untuk ruang pendana, tanpa kartu besar.
 * Nominal pendanaan minimum satu tiket disebut apa adanya.
 */
export function BarisDoorprizePendana() {
  const data = useQuery(api.doorprize.ringkasanSaya, {});
  if (data === undefined || data === null) return null;
  return (
    <p className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs leading-5 text-amber-900">
      <Ticket className="size-4 shrink-0" aria-hidden />
      <span>
        <strong className="font-semibold">{data.tiketPendana} tiket Doorprize Emas</strong>{" "}
        aktif bulan ini — satu tiket per {formatRupiah(1_000_000)} pendanaan yang
        selesai satu siklus. Undian {data.labelTanggalUndian}.
      </span>
    </p>
  );
}
