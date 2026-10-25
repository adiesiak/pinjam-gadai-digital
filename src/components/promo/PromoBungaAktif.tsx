/**
 * Banner promo BUNGA yang sedang berjalan.
 *
 * Bedanya dengan `PromoPinjamanAktif`: banner itu hanya kalimat kampanye,
 * sedangkan banner ini menyebut angka yang benar-benar dipakai mesin harga —
 * bunga pengganti, tenor yang mendapatkannya, dan sampai kapan. Nasabah yang
 * membacanya tidak perlu menghitung sendiri di formulir.
 *
 * Datanya dari `promoBunga.berjalan` (tanpa gerbang admin), jadi aturan tanggal
 * dan pemilihan promo tetap di server. Bila tidak ada promo, tidak ada yang
 * dirender — bukan kotak kosong.
 */
import { useQuery } from "convex/react";
import { Percent } from "lucide-react";

import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { formatTanggalWIB } from "@/lib/waktu";
import { cn } from "@/lib/utils";

type PromoBungaTampil = {
  _id: string;
  nama: string;
  persenBunga: number;
  tenor: readonly number[];
  mulai: number;
  selesai: number;
};

/** Versi murni tanpa hook: dipakai banner dan bisa dirender di uji. */
export function KartuPromoBunga({
  daftar,
  onAjukan,
  labelAksi = "Ajukan sekarang",
  className,
}: {
  daftar: readonly PromoBungaTampil[];
  onAjukan?: () => void;
  labelAksi?: string;
  className?: string;
}) {
  if (daftar.length === 0) return null;

  // Bunga terendah dulu: itu yang paling menguntungkan nasabah. Bila angkanya
  // sama, masa berlaku lebih panjang yang ditampilkan lebih dulu.
  const urut = [...daftar].sort(
    (a, b) => a.persenBunga - b.persenBunga || b.selesai - a.selesai,
  );
  const tampil = urut.slice(0, 2);

  return (
    <aside
      aria-label="Bunga promo yang sedang berjalan"
      className={cn(
        "overflow-hidden rounded-2xl border border-emerald-700/25 bg-gradient-to-br from-emerald-50 via-white to-amber-50/70 p-4 shadow-sm sm:p-5",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-900">
          <Percent className="size-3.5" aria-hidden="true" />
          Bunga promo
        </p>
        {onAjukan !== undefined && (
          <Button
            type="button"
            size="sm"
            className="bg-emerald-800 text-white hover:bg-emerald-900"
            onClick={onAjukan}
          >
            {labelAksi}
          </Button>
        )}
      </div>

      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {tampil.map((promo) => (
          <li
            key={promo._id}
            className="rounded-xl border border-emerald-700/15 bg-white/85 px-3 py-2"
          >
            <p className="flex flex-wrap items-baseline gap-x-1.5">
              <span className="text-2xl font-semibold tabular-nums text-emerald-900">
                {promo.persenBunga}%
              </span>
              <span className="text-xs text-slate-700">
                untuk tenor {[...promo.tenor].sort((a, b) => a - b).join(" / ")} hari
              </span>
            </p>
            <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
              s.d. {formatTanggalWIB(promo.selesai)} · {promo.nama}
            </p>
          </li>
        ))}
      </ul>

      <p className="mt-2 text-[11px] leading-4 text-slate-600">
        Bunga promo menggantikan bunga normal tenor itu dan sudah dipakai otomatis di
        formulir pengajuan — tidak perlu memasukkan kode apa pun.
        {urut.length > tampil.length
          ? ` Ada ${urut.length - tampil.length} promo lain yang juga berjalan.`
          : ""}
      </p>
    </aside>
  );
}

export function PromoBungaAktif({
  onAjukan,
  labelAksi,
  className,
}: {
  onAjukan?: () => void;
  labelAksi?: string;
  className?: string;
}) {
  const daftar = useQuery(api.promoBunga.berjalan, {});

  if (daftar === undefined || daftar.length === 0) return null;

  return (
    <KartuPromoBunga
      daftar={daftar}
      onAjukan={onAjukan}
      labelAksi={labelAksi}
      className={className}
    />
  );
}
