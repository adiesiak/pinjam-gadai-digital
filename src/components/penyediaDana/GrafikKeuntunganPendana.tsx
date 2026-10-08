import { formatRupiah } from "@/lib/money";
import { barKeuntungan, type SumberBarKeuntungan } from "@/lib/grafikKeuntungan";

/**
 * Grafik batang keuntungan per penyedia dana (ruang penyedia dana).
 *
 * Menjawab satu pertanyaan dengan cepat: "siapa penyedia dana dengan keuntungan
 * paling besar, dan berapa bagian yang masih diperkirakan?" Setiap batang
 * dipisah dua warna — hijau = sudah dibukukan (pinjaman lunas), kuning =
 * masih perkiraan (pinjaman berjalan) — sehingga penyedia dana tidak membaca
 * uang yang belum cair sebagai uang yang sudah masuk.
 *
 * Batangnya sengaja hanya visual (`aria-hidden`); angka rupiahnya tetap
 * ditulis sebagai teks di sebelah setiap batang, jadi pembaca layar dan
 * pengguna tanpa grafik mendapat informasi yang sama (Zero Fake Data).
 *
 * Murni presentasional — panjang batang dihitung `lib/grafikKeuntungan`.
 */
export function GrafikKeuntunganPendana({
  rekap,
}: {
  rekap: readonly SumberBarKeuntungan[];
}) {
  const bars = barKeuntungan(rekap);
  const totalPerkiraan = bars.reduce((total, b) => total + b.perkiraan, 0);
  const totalSudahCair = bars.reduce((total, b) => total + b.sudahCair, 0);

  return (
    <section
      aria-label="Grafik keuntungan per penyedia dana"
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-navy">Keuntungan per penyedia dana</h3>
        <div className="flex flex-wrap items-center gap-3 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-full bg-emerald-500" />
            Sudah cair {formatRupiah(totalSudahCair)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-full bg-amber-400" />
            Perkiraan {formatRupiah(totalPerkiraan)}
          </span>
        </div>
      </div>

      <ul className="mt-3 space-y-3">
        {bars.map((b) => (
          <li key={b.nama}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate text-xs font-semibold uppercase text-slate-900">
                {b.nama}
              </span>
              <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-900">
                {formatRupiah(b.total)}
              </span>
            </div>
            <div
              aria-hidden
              className="mt-1.5 flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100"
            >
              <span
                className="h-full bg-emerald-500"
                style={{ width: `${b.persenSudahCair}%` }}
              />
              <span
                className="h-full bg-amber-400"
                style={{ width: `${b.persenPerkiraan}%` }}
              />
            </div>
            <p className="mt-1 text-[10px] tabular-nums text-muted-foreground">
              sudah cair {formatRupiah(b.sudahCair)} · perkiraan {formatRupiah(b.perkiraan)}
            </p>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[10px] leading-4 text-muted-foreground">
        Panjang batang dibandingkan dengan penyedia dana terbesar. Bagian kuning adalah
        perhitungan atas pinjaman yang masih berjalan — belum menjadi uang sampai pinjamannya
        lunas.
      </p>
    </section>
  );
}
