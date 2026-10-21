import { PERSEN_IMBAL_PENDANA, TENOR_PENDANA_HARI } from "@/lib/imbalPendana";

/**
 * Ringkasan skema pendana.
 *
 * Angka di sini datang dari `lib/imbalPendana`, skema yang sama dengan
 * kalkulator dan tabel portofolio. Ruang pendana sendiri hanya dibuka untuk
 * akun yang diberi akses admin, jadi bagian ini menjelaskan syaratnya dan
 * tidak menautkan ke ruang yang belum tentu bisa dibuka pengunjung.
 */
export function RuangPendanaRingkas() {
  return (
    <section
      aria-labelledby="pendana-ringkas-judul"
      className="border-t border-border bg-background"
    >
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:px-6 sm:py-18 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            Ruang pendana
          </p>
          <h2
            id="pendana-ringkas-judul"
            className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl"
          >
            Imbal hasil tetap {PERSEN_IMBAL_PENDANA}% per siklus{" "}
            {TENOR_PENDANA_HARI} hari
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
            Hak pendana berdiri sendiri: dihitung dari pokok yang didanai, tidak
            mengikuti tenor atau bunga pinjaman nasabah. Biaya platform dipotong
            terpisah dari uang yang kembali.
          </p>
          <p className="mt-4 max-w-xl border-t border-border pt-4 text-xs leading-5 text-slate-600">
            Akses ruang pendana dibuka oleh tim PINDAI. Setelah akses diberikan,
            laporan portofolio dan pernyataan risiko pendanaan tersedia di ruang
            itu.
          </p>
        </div>

        <dl className="grid gap-4 border-y border-border py-6 sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
              Imbal bruto per siklus
            </dt>
            <dd className="mt-1 font-display text-3xl leading-none tabular-nums text-slate-900">
              {PERSEN_IMBAL_PENDANA}%
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
              Lama satu siklus
            </dt>
            <dd className="mt-1 font-display text-3xl leading-none tabular-nums text-slate-900">
              {TENOR_PENDANA_HARI}{" "}
              <span className="text-base font-medium text-slate-600">hari</span>
            </dd>
          </div>
          <div className="min-w-0 sm:col-span-2">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
              Dihitung dari
            </dt>
            <dd className="mt-1 text-sm leading-6 text-slate-700">
              Pokok pendanaan yang ditempatkan, sebelum biaya platform.
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
