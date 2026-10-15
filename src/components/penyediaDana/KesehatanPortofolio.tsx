import { CalendarClock, CircleAlert, Percent, Wallet } from "lucide-react";
import type { ReactNode } from "react";

import { formatRupiah } from "@/lib/money";

/**
 * Kesehatan portofolio: empat angka yang menjawab "apakah ada yang perlu
 * ditindak hari ini", bukan "berapa keuntungan saya".
 *
 * Pemisahannya disengaja: tiga kartu pertama memang keadaan yang bisa menuntut
 * tindakan (jatuh tempo dekat, sudah terlambat, dana belum teralokasi), satu
 * kartu adalah rasio. Kartu yang nilainya nol ditampilkan tenang, dan hanya
 * berwarna peringatan saat angkanya lebih dari nol, supaya warna di sini benar
 * benar berarti "ada yang perlu dilihat" dan bukan sekadar hiasan.
 *
 * Seluruh angka dihitung di halaman dari baris pinjaman yang sudah dikirim
 * server (`zero fake data`): tidak ada angka tambahan yang dihitung ulang di
 * komponen ini, dan tidak ada perhitungan keuntungan yang diubah.
 * Murni presentasional, tanpa Convex, supaya bisa diuji lewat markup HTML.
 */

/** Satu kartu keadaan. */
function KartuKesehatan({
  label,
  nilai,
  catatan,
  icon,
  nada,
}: {
  label: string;
  nilai: string;
  catatan: string;
  icon: ReactNode;
  /** `perhatian` hanya dipakai saat angkanya memang lebih dari nol. */
  nada: "tenang" | "perhatian";
}) {
  const gaya =
    nada === "perhatian"
      ? {
          kotak: "border-amber-200 bg-amber-50/70",
          judul: "text-amber-900",
          angka: "text-amber-900",
          ikon: "text-amber-700",
        }
      : {
          kotak: "border-slate-200 bg-white",
          judul: "text-muted-foreground",
          angka: "text-navy",
          ikon: "text-primary",
        };

  return (
    <div className={`rounded-2xl border px-4 py-3 ${gaya.kotak}`}>
      <p
        className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] ${gaya.judul}`}
      >
        <span className={`shrink-0 ${gaya.ikon}`} aria-hidden>
          {icon}
        </span>
        {label}
      </p>
      <p className={`mt-1.5 text-lg font-semibold tabular-nums leading-tight ${gaya.angka}`}>
        {nilai}
      </p>
      <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{catatan}</p>
    </div>
  );
}

export type AngkaKesehatanPortofolio = {
  /** Pinjaman berjalan yang jatuh tempo dalam 7 hari ke depan. */
  jatuhTempoSegera: { jumlah: number; nominal: number };
  /** Pinjaman berjalan yang sudah lewat jatuh tempo. */
  terlambat: { jumlah: number; nominal: number };
  /** Persentase pinjaman terlambat terhadap pinjaman berjalan (0-100). */
  persenTerlambat: number;
  /** Pinjaman berjalan yang belum terhubung ke pendana. */
  belumTerhubung: { jumlah: number; nominal: number };
};

export function KesehatanPortofolio({ angka }: { angka: AngkaKesehatanPortofolio }) {
  const { jatuhTempoSegera, terlambat, persenTerlambat, belumTerhubung } = angka;

  return (
    <section aria-label="Kesehatan portofolio" className="animate-masuk mt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 pb-2">
        <h2 className="text-base font-semibold tracking-tight text-navy">Kesehatan portofolio</h2>
        <p className="text-xs text-muted-foreground">
          Keadaan dana yang sedang berjalan, bukan catatan keuntungan
        </p>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KartuKesehatan
          label="Jatuh tempo 7 hari"
          nilai={`${jatuhTempoSegera.jumlah} pinjaman`}
          catatan={`${formatRupiah(jatuhTempoSegera.nominal)} pokok akan jatuh tempo`}
          icon={<CalendarClock className="size-3.5" />}
          nada={jatuhTempoSegera.jumlah > 0 ? "perhatian" : "tenang"}
        />
        <KartuKesehatan
          label="Terlambat"
          nilai={`${terlambat.jumlah} pinjaman`}
          catatan={`${formatRupiah(terlambat.nominal)} pokok belum kembali`}
          icon={<CircleAlert className="size-3.5" />}
          nada={terlambat.jumlah > 0 ? "perhatian" : "tenang"}
        />
        <KartuKesehatan
          label="Rasio keterlambatan"
          nilai={`${persenTerlambat.toFixed(1)}%`}
          catatan="dari pokok pinjaman yang masih berjalan"
          icon={<Percent className="size-3.5" />}
          nada={terlambat.jumlah > 0 ? "perhatian" : "tenang"}
        />
        <KartuKesehatan
          label="Belum teralokasi"
          nilai={formatRupiah(belumTerhubung.nominal)}
          catatan={`${belumTerhubung.jumlah} pinjaman berjalan tanpa pendana`}
          icon={<Wallet className="size-3.5" />}
          nada={belumTerhubung.jumlah > 0 ? "perhatian" : "tenang"}
        />
      </div>

      {terlambat.jumlah > 0 && (
        <p className="mt-2 text-xs leading-5 text-amber-900">
          Keterlambatan menurunkan peluang dana kembali tepat waktu.
        </p>
      )}

      {belumTerhubung.jumlah > 0 && (
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900">
          <CircleAlert className="size-3.5 shrink-0" aria-hidden />
          {belumTerhubung.jumlah} pinjaman belum terhubung ke pendana
        </p>
      )}
    </section>
  );
}
