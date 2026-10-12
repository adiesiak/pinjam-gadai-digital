import type { CSSProperties } from "react";

import { barDanaTersalurkan, type SumberDanaTersalurkan } from "@/lib/grafikKeuntungan";
import { formatRupiah } from "@/lib/money";

/**
 * Panjang batang: `width` untuk nilai akhir, `--bar-lebar` untuk titik akhir
 * animasi `.bar-tumbuh` (animasi memakai `fill: both`, jadi nilai akhirnya
 * datang dari variabel ini).
 */
function gayaBar(persen: number): CSSProperties {
  return { width: `${persen}%`, "--bar-lebar": `${persen}%` } as CSSProperties;
}

/**
 * Total dana tersalurkan per pendana (ruang pendana).
 *
 * Menjawab: "berapa pokok yang sudah saya salurkan ke peminjam, dan berapa
 * penyedia lain menyalurkan?" Angka pokoknya tetap ditulis sebagai teks di
 * sebelah setiap batang, dan total seluruh penyedia ada di kepala kartu —
 * jadi satu provider pun tetap mendapat angkanya.
 *
 * "Dana tersalurkan" = pokok pinjaman yang sudah cair ke peminjam (status
 * `didanai` dan `lunas`). Bukan keuntungan: keuntungan punya kartunya sendiri
 * (`GrafikKeuntunganPendana`), supaya modal dan hasil tidak tertukar.
 *
 * Batangnya dekoratif (`aria-hidden`); nilainya ada sebagai teks (Zero Fake
 * Data). Batang meluncur dari 0 ke panjang target saat kartu masuk layar dan
 * diberi kilau berjalan (`.bar-tumbuh` + `.shimmer-pass`). Murni presentasional
 * — panjang batang dihitung `lib/grafikKeuntungan`.
 */
export function DanaTersalurkanPendana({
  rekap,
  namaTampil,
}: {
  rekap: readonly SumberDanaTersalurkan[];
  /** Penyamaran nama pendana untuk tampilan (bawaan: apa adanya). */
  namaTampil?: (nama: string) => string;
}) {
  const tampil = namaTampil ?? ((nama: string) => nama);
  const bars = barDanaTersalurkan(rekap);
  const total = bars.reduce((jumlah, b) => jumlah + b.nilai, 0);
  const totalBerjalan = bars.reduce((jumlah, b) => jumlah + b.berjalan, 0);

  return (
    <section
      aria-label="Total dana tersalurkan per pendana"
      className="glass-card micro-metric rounded-2xl border p-4 shadow-sm sm:p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-3">
        <h3 className="text-sm font-semibold text-navy">Dana tersalurkan per pendana</h3>
        <p className="text-sm font-semibold tabular-nums text-navy">
          Total {formatRupiah(total)}
        </p>
      </div>

      <ul className="mt-3 space-y-3">
        {bars.map((b) => (
          <li key={b.nama}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate text-xs font-semibold uppercase text-slate-900">
                {tampil(b.nama)}
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-navy">
                {formatRupiah(b.nilai)}
              </span>
            </div>
            <div
              aria-hidden
              className="mt-1.5 h-3 w-full overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200/70 ring-inset"
            >
              <span
                className="bar-tumbuh shimmer-pass block h-full rounded-full bg-emerald-600"
                style={gayaBar(b.persen)}
              />
            </div>
            <p className="mt-1 text-[10px] tabular-nums text-muted-foreground">
              {b.jumlahPinjaman} pinjaman · {b.jumlahAktif} aktif · {b.jumlahLunas} lunas ·
              masih berjalan {formatRupiah(b.berjalan)}
            </p>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[10px] leading-4 text-muted-foreground">
        Total dana tersalurkan semua penyedia {formatRupiah(total)}, dengan{" "}
        {formatRupiah(totalBerjalan)} masih berjalan. Panjang batang dibandingkan dengan pendana
        terbesar.
      </p>
    </section>
  );
}
