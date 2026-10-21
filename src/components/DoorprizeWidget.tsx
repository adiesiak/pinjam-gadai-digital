import { useQuery } from "convex/react";
import { CalendarClock, Cpu, Gem, Gift, Ticket, Trophy, Wallet } from "lucide-react";
import { useEffect, useState } from "react";

import { api } from "@/convex/_generated/api";
import { formatRupiah } from "@/lib/money";
import type { KategoriHadiah } from "@/lib/doorprize";

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

/** Ikon per kategori hadiah — relevan dengan bendanya, bukan dekorasi. */
const IKON_HADIAH: Record<KategoriHadiah, typeof Gem> = {
  GOLD: Gem,
  ELECTRONICS: Cpu,
  VOUCHER: Wallet,
  OTHER: Gift,
};

/**
 * Banner Doorprize triwulanan — tiket kuartal berjalan, hadiah yang dipilih
 * admin, dan hitung mundur ke tanggal pengundian.
 *
 * Angka tiket dibaca dari server (`doorprize.ringkasanSaya`), bukan dihitung
 * dari riwayat di klien: tiket hanya sah bila benar-benar tercatat di basis
 * data. Kuartal baru berarti tiket kembali 0 tanpa menghapus riwayat kuartal
 * sebelumnya.
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
        aria-label="Doorprize triwulanan"
        className={`mt-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 ${className}`}
      >
        <p className="text-xs text-muted-foreground">Memuat tiket doorprize…</p>
      </section>
    );
  }
  if (data === null) return null;

  const Ikon = IKON_HADIAH[data.hadiah.kategori];
  const tiketSendiri = peran === "peminjam" ? data.tiketPeminjam : data.tiketPendana;
  const sumberPeran =
    peran === "peminjam"
      ? "Tiket Anda berasal dari pelunasan tepat waktu (tenor 7, 14, atau 28 hari)."
      : "Tiket Anda berasal dari setiap kelipatan Rp1 juta penempatan dana aktif.";

  return (
    <section
      aria-labelledby="judul-doorprize"
      className={`mt-4 overflow-hidden rounded-2xl border border-[#c9a86a]/45 bg-white ${className}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-amber-100 px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-800">
            <Trophy className="size-3.5" aria-hidden /> Doorprize triwulanan
          </p>
          <h2
            id="judul-doorprize"
            className="mt-1 font-display text-base leading-6 text-slate-900"
          >
            {data.judul}
          </h2>
          <p className="mt-0.5 text-[11px] leading-5 text-slate-600">
            {data.labelRentang} · Undian Kuartal {data.quarter}: {data.labelTanggalUndian}
          </p>
        </div>
        <p className="shrink-0 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-900">
          {data.labelPeriode}
        </p>
      </header>

      <div className="grid gap-3 p-4 sm:grid-cols-3 sm:p-5">
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            <Ticket className="size-3.5" aria-hidden /> Jumlah tiket saya
          </p>
          <p className="mt-0.5 text-2xl font-semibold tabular-nums text-slate-900">
            {tiketSendiri}
          </p>
          <p className="text-[11px] text-slate-500">
            {data.sudahDiundi
              ? `${data.tiketTerkumpul} tiket ikut undian ${data.labelPeriode}; saldo direset`
              : `${data.tiketAktif} tiket terkumpul kuartal ini`}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            <Ikon className="size-3.5" aria-hidden /> Hadiah kuartal
          </p>
          {/* Rincian hadiah (berat emas dan nilai rupiahnya) sengaja tidak
              ditampilkan ke publik: itu urusan anggaran admin, bukan janji
              nominal yang harus ditulis di setiap halaman. */}
          <p className="mt-0.5 text-sm font-semibold leading-5 text-slate-900">
            {data.hadiah.labelKategori}
          </p>
          <p className="text-[11px] text-slate-500">Rincian diumumkan saat pengundian</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            <CalendarClock className="size-3.5" aria-hidden /> Pengundian
          </p>
          <p className="mt-0.5 text-sm font-semibold text-slate-900">
            {data.labelTanggalUndian}
          </p>
          <p className="text-[11px] tabular-nums text-slate-500">
            {data.sudahDiundi
              ? "Undian selesai — pemenang sudah diumumkan"
              : data.bisaDiundi
                ? "Pengundian dibuka — pemenang diumumkan admin"
                : sisaWaktu(data.tanggalUndian, sekarang)}
          </p>
        </div>
      </div>

      <div className="border-t border-amber-100 bg-white px-4 py-2.5 sm:px-5">
        <p className="text-[11px] leading-5 text-slate-600">{data.teksKetentuan}</p>
        <p className="mt-1 text-[11px] leading-5 text-slate-500">
          {data.pemenang === null
            ? `Saldo tiket kembali 0 saat ${data.labelPeriode} berakhir. ${sumberPeran}`
            : `Pemenang ${data.labelPeriode}: ${data.pemenang.nama} (${
                data.pemenang.peran === "peminjam" ? "peminjam" : "pendana"
              }).`}
        </p>
      </div>
    </section>
  );
}

/**
 * Satu baris ringkas untuk ruang pendana, tanpa kartu besar.
 * Menyebut kuartal, jenis hadiah, dan tanggal pengundian — tanpa nominal.
 */
export function BarisDoorprizePendana() {
  const data = useQuery(api.doorprize.ringkasanSaya, {});
  if (data === undefined || data === null) return null;
  return (
    <p className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs leading-5 text-amber-900">
      <Ticket className="size-4 shrink-0" aria-hidden />
      <span>
        <strong className="font-semibold">{data.tiketPendana} tiket doorprize</strong> aktif di{" "}
        {data.labelPeriode} — satu tiket per {formatRupiah(1_000_000)} penempatan dana.
        Hadiah kuartal: {data.hadiah.labelKategori}. Undian {data.labelTanggalUndian}.
      </span>
    </p>
  );
}
