import {
  ArrowDown,
  ArrowUp,
  BadgeCheck,
  ChevronsUpDown,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { Fragment, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { RekapPendana } from "@/convex/penyediaDana";
import { FOLIO } from "@/components/penyediaDana/folio";
import { formatRupiahAman } from "@/lib/money";
import { namaHurufBesar } from "@/lib/nama";
import {
  KOLOM_PENDANA,
  URUTAN_AWAL,
  totalPendana,
  urutkanPendana,
  type ArahUrut,
  type KunciUrut,
  type RincianPerkiraan,
  type UrutanPendana,
} from "@/lib/tabelPendana";

/** Kolom terakhir: aksi per baris — tidak ikut diurutkan. */
const LABEL_AKSI = "Aksi";

function rupiah(nilai: number): string {
  return formatRupiahAman(nilai);
}

/** Ikon penanda kolom yang sedang jadi dasar urutan. */
function IkonUrut({ aktif, arah }: { aktif: boolean; arah: ArahUrut }) {
  if (!aktif) {
    // slate-500, bukan slate-400: ikon ini penanda kolom yang bisa diurutkan,
    // dan 2,56:1 terlalu samar untuk dibaca sebagai penanda.
    return <ChevronsUpDown className="size-3.5 shrink-0 text-slate-600" aria-hidden />;
  }
  return arah === "naik" ? (
    <ArrowUp className="size-3.5 shrink-0 text-emerald-700" aria-hidden />
  ) : (
    <ArrowDown className="size-3.5 shrink-0 text-emerald-700" aria-hidden />
  );
}

/**
 * Status pencatatan transfer keuntungan milik satu pendana.
 *
 * Ditulis sebagai kalimat, bukan hanya warna: hijau/ambernya tetap ada, tetapi
 * keadaannya bisa dibaca tanpa membedakan warna.
 */
function TransferPendana({ r, ringkas = false }: { r: RekapPendana; ringkas?: boolean }) {
  if (r.jumlahLunas === 0) {
    return <span className="text-xs text-muted-foreground">belum ada pinjaman lunas</span>;
  }
  if (r.transferBelumDicatat === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
        <BadgeCheck className="size-3.5 shrink-0" aria-hidden /> semua tercatat
      </span>
    );
  }
  return (
    <span className={`inline-flex flex-col gap-0.5 ${ringkas ? "items-start" : "items-end"}`}>
      <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">
        <TriangleAlert className="size-3.5 shrink-0" aria-hidden /> {r.transferBelumDicatat} belum
        dicatat
      </span>
      <span className="text-xs tabular-nums text-muted-foreground">
        {rupiah(r.keuntunganBelumDicatat)}
      </span>
    </span>
  );
}

/**
 * Isi yang dibuka saat satu baris diperluas.
 *
 * Dua hal yang tidak muat sebagai kolom, tetapi tetap harus bisa ditelusuri:
 * pinjaman mana saja yang membentuk angka perkiraan, dan bagaimana potongan
 * admin terbagi antara yang sudah dibukukan dan yang masih perkiraan. Keduanya
 * angka pendamping — bukan angka pokok — jadi tempatnya di balik lipatan, bukan
 * di baris utama yang harus tetap ringkas.
 */
function IsiRincian({
  r,
  rincian,
}: {
  r: RekapPendana;
  rincian: readonly RincianPerkiraan[];
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <p className="text-xs font-semibold text-navy">
          Pembentuk angka perkiraan · {rincian.length} pinjaman berjalan
        </p>
        {rincian.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Tidak ada pinjaman berjalan atas nama pendana ini, jadi angka perkiraannya Rp 0.
          </p>
        ) : (
          <ul className="mt-1.5 space-y-1 text-xs">
            {rincian.map((p) => (
              <li key={p.id} className="flex items-baseline justify-between gap-3">
                <span className={`min-w-0 truncate text-muted-foreground ${FOLIO.kode}`}>
                  {p.nomorReferensi} · {namaHurufBesar(p.namaLengkap)}
                </span>
                <span className="shrink-0 tabular-nums font-medium text-amber-700">
                  {rupiah(p.keuntunganPendana)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
          Jumlah baris di atas sama dengan kolom “Perkiraan (belum lunas)”.
        </p>
      </div>

      <dl className="space-y-1.5 text-xs">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">Pinjaman (total · aktif · lunas)</dt>
          <dd className="tabular-nums font-medium text-slate-900">
            {r.jumlahPinjaman} · {r.jumlahAktif} · {r.jumlahLunas}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">Potongan admin dibukukan</dt>
          <dd className="tabular-nums font-medium text-slate-900">
            {rupiah(r.keuntunganAdminLunas)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">Potongan admin perkiraan</dt>
          <dd className="tabular-nums font-medium text-slate-900">
            {rupiah(r.keuntunganAdminBelumLunas)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">Transfer keuntungan</dt>
          <dd className="text-right">
            <TransferPendana r={r} />
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">Transfer sudah dicatat</dt>
          <dd className="tabular-nums font-medium text-slate-900">
            {r.transferTercatat} pinjaman lunas
          </dd>
        </div>
      </dl>
    </div>
  );
}

/**
 * Tabel perbandingan pendana — satu-satunya permukaan rekap dana di ruang
 * pendana.
 *
 * Menjawab pertanyaan yang sama untuk SETIAP pendana dalam satu tatanan kolom:
 * berapa pokok yang sudah tersalurkan, berapa yang masih berjalan, berapa
 * keuntungan yang sudah dibukukan, berapa yang masih perkiraan, dan berapa
 * potongan adminnya. Kepala kolom bisa diklik untuk mengurutkan, baris total di
 * kaki tabel menjumlahkan kolomnya, dan setiap baris bisa diperluas untuk
 * melihat pinjaman pembentuk angka perkiraan.
 *
 * Di layar sempit tabel 8 kolom tidak mungkin muat tanpa geser mendatar, jadi
 * setiap pendana ditampilkan sebagai kartu berisi angka yang sama — bukan tabel
 * yang dipotong.
 *
 * Aturan urut dan penjumlahannya tinggal di `@/lib/tabelPendana` supaya bisa
 * diuji sebagai fungsi; komponen ini hanya menggambar.
 *
 * Murni presentasional — tanpa Convex — supaya bisa dirender langsung oleh uji
 * markup (`TabelPendana.render.test.tsx`).
 */
export function TabelPendana({
  rekap,
  rincianPerkiraan,
  namaTampil,
  aktif = null,
  onPilih,
  bukaAwal = [],
}: {
  rekap: readonly RekapPendana[];
  /**
   * Pinjaman berjalan milik satu pendana — isi lipatan "Pembentuk angka
   * perkiraan". Opsional: tanpa fungsi ini, rinciannya diterangkan sebagai
   * tidak ada, bukan dikosongkan tanpa keterangan.
   */
  rincianPerkiraan?: (nama: string) => readonly RincianPerkiraan[];
  /** Penyamaran nama pendana untuk tampilan (bawaan: nama apa adanya). */
  namaTampil?: (nama: string) => string;
  /**
   * Pendana yang sedang menyaring tabel pinjaman di bawah ruang ini. Barisnya
   * ditandai supaya keterkaitan antara rekap dan daftar terlihat, bukan hanya
   * terasa sesudah menggulir.
   */
  aktif?: string | null;
  /** Klik "Saring daftar" → saring tabel pinjaman ke pendana ini. */
  onPilih?: (nama: string) => void;
  /**
   * Nama pendana yang rinciannya dibuka sejak awal. Dipakai uji markup: rincian
   * yang masih terlipat belum ada di DOM saat render statis, jadi tanpa pintu
   * ini isinya tidak bisa diverifikasi lewat HTML.
   */
  bukaAwal?: readonly string[];
}) {
  const tampil = namaTampil ?? ((nama: string) => nama);
  const [urutan, setUrutan] = useState<UrutanPendana>(URUTAN_AWAL);
  const [terbuka, setTerbuka] = useState<readonly string[]>(bukaAwal);

  const baris = urutkanPendana(rekap, urutan);
  const total = totalPendana(rekap);

  function gantiUrut(kunci: KunciUrut) {
    setUrutan((lama) =>
      lama.kunci === kunci
        ? { kunci, arah: lama.arah === "naik" ? "turun" : "naik" }
        : // Angka selalu dibuka dari yang terbesar (yang paling perlu dibaca),
          // sementara nama dari A ke Z.
          { kunci, arah: kunci === "nama" ? "naik" : "turun" },
    );
  }

  function toggle(nama: string) {
    setTerbuka((lama) =>
      lama.includes(nama) ? lama.filter((n) => n !== nama) : [...lama, nama],
    );
  }

  if (rekap.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50/70 px-4 py-6 text-center text-xs text-muted-foreground">
        Belum ada dana tersalurkan pada pendana mana pun.
      </p>
    );
  }

  return (
    <div className="animate-masuk">
      {/* ===== Layar lebar: satu tabel yang bisa diurutkan ===== */}
      {/* Lembar folio: kertas padat bergaris kepala kuningan, tanpa bayangan —
          bayangan hanya dipakai satu lembar fokus di puncak halaman. */}
      <div className={`hidden overflow-hidden lg:block ${FOLIO.kertas}`}>
        <Table className="w-full">
          <TableCaption className="sr-only">
            Perbandingan dana tersalurkan, keuntungan, dan potongan admin per pendana
          </TableCaption>
          <TableHeader>
            <TableRow className={`${FOLIO.kepalaTabel} hover:bg-slate-50`}>
              {KOLOM_PENDANA.map((kolom) => {
                const jadiDasar = urutan.kunci === kolom.kunci;
                return (
                  <TableHead
                    key={kolom.kunci}
                    scope="col"
                    aria-sort={
                      jadiDasar ? (urutan.arah === "naik" ? "ascending" : "descending") : "none"
                    }
                    className="h-12 px-3 align-bottom"
                  >
                    <button
                      type="button"
                      onClick={() => gantiUrut(kolom.kunci)}
                      aria-label={`Urutkan menurut ${kolom.label}`}
                      className="inline-flex w-full items-center gap-1.5 text-left text-xs font-semibold uppercase tracking-[0.1em] text-slate-600 transition-colors hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
                    >
                      <span className="min-w-0">{kolom.label}</span>
                      <IkonUrut aktif={jadiDasar} arah={urutan.arah} />
                    </button>
                  </TableHead>
                );
              })}
              <TableHead scope="col" className="h-12 px-3 align-bottom text-right">
                <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">
                  {LABEL_AKSI}
                </span>
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {baris.map((r) => {
              const sedangAktif = aktif !== null && aktif === r.nama;
              const sedangTerbuka = terbuka.includes(r.nama);
              const rincian = rincianPerkiraan?.(r.nama) ?? [];
              return (
                <Fragment key={r.nama}>
                  <TableRow
                    className={`transition-colors ${
                      sedangAktif ? "bg-emerald-50/60" : "hover:bg-slate-50"
                    }`}
                  >
                    <TableCell className="px-3 py-3 align-top">
                      <p className="inline-flex items-center gap-1.5 font-semibold uppercase text-navy">
                        <Wallet className="size-3.5 shrink-0 text-primary" aria-hidden />
                        {tampil(r.nama)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {r.jumlahPinjaman} pinjaman · {r.jumlahAktif} aktif · {r.jumlahLunas} lunas
                      </p>
                      <div className="mt-1.5">
                        <TransferPendana r={r} ringkas />
                      </div>
                    </TableCell>
                    <TableCell className="px-3 py-3 text-right align-top font-medium tabular-nums text-slate-900">
                      {rupiah(r.totalDisalurkan)}
                    </TableCell>
                    <TableCell className="px-3 py-3 text-right align-top tabular-nums text-slate-900">
                      {rupiah(r.saldoBerjalan)}
                    </TableCell>
                    <TableCell className="px-3 py-3 text-right align-top font-semibold tabular-nums text-emerald-700">
                      {rupiah(r.keuntunganPendanaLunas)}
                    </TableCell>
                    <TableCell className="px-3 py-3 text-right align-top font-medium tabular-nums text-amber-700">
                      {rupiah(r.keuntunganPendanaBelumLunas)}
                    </TableCell>
                    <TableCell className="px-3 py-3 text-right align-top font-semibold tabular-nums text-emerald-800">
                      {rupiah(r.keuntunganPendana)}
                    </TableCell>
                    <TableCell className="px-3 py-3 text-right align-top tabular-nums text-slate-900">
                      {rupiah(r.keuntunganAdmin)}
                    </TableCell>
                    <TableCell className="px-3 py-3 align-top">
                      <div className="flex flex-col items-end gap-1.5">
                        {onPilih !== undefined && (
                          <Button
                            variant={sedangAktif ? "default" : "outline"}
                            size="sm"
                            aria-pressed={sedangAktif}
                            onClick={() => onPilih(r.nama)}
                          >
                            {sedangAktif ? "Lepas saringan" : "Saring daftar"}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-expanded={sedangTerbuka}
                          onClick={() => toggle(r.nama)}
                        >
                          {sedangTerbuka ? "Tutup rincian" : "Rincian"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {sedangTerbuka && (
                    <TableRow className="bg-slate-50/70">
                      <TableCell colSpan={KOLOM_PENDANA.length + 1} className="px-4 py-3">
                        <IsiRincian r={r} rincian={rincian} />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>

          {/* Kaki tabel: jumlah kolomnya. Angka ini dihitung dari baris yang
              tampil, jadi pembaca bisa menjumlahkannya sendiri kapan saja. */}
          <TableFooter className="bg-slate-100/80">
            <TableRow className="border-t border-slate-200">
              <TableCell className="px-3 py-3 align-top">
                <p className="font-semibold text-navy">Total · {total.jumlahPendana} pendana</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {total.jumlahPinjaman} pinjaman · {total.jumlahAktif} aktif · {total.jumlahLunas}{" "}
                  lunas
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {total.transferBelumDicatat === 0
                    ? "Semua transfer keuntungan sudah dicatat"
                    : `${total.transferBelumDicatat} transfer belum dicatat (${rupiah(
                        total.keuntunganBelumDicatat,
                      )})`}
                </p>
              </TableCell>
              <TableCell className="px-3 py-3 text-right align-top font-semibold tabular-nums text-slate-900">
                {rupiah(total.totalDisalurkan)}
              </TableCell>
              <TableCell className="px-3 py-3 text-right align-top font-semibold tabular-nums text-slate-900">
                {rupiah(total.saldoBerjalan)}
              </TableCell>
              <TableCell className="px-3 py-3 text-right align-top font-semibold tabular-nums text-emerald-700">
                {rupiah(total.keuntunganPendanaLunas)}
              </TableCell>
              <TableCell className="px-3 py-3 text-right align-top font-semibold tabular-nums text-amber-700">
                {rupiah(total.keuntunganPendanaBelumLunas)}
              </TableCell>
              <TableCell className="px-3 py-3 text-right align-top font-semibold tabular-nums text-emerald-800">
                {rupiah(total.keuntunganPendana)}
              </TableCell>
              <TableCell className="px-3 py-3 text-right align-top font-semibold tabular-nums text-slate-900">
                {rupiah(total.keuntunganAdmin)}
              </TableCell>
              <TableCell className="px-3 py-3 align-top" />
            </TableRow>
          </TableFooter>
        </Table>
      </div>

      {/* ===== Layar sempit: kartu per pendana, angka yang sama ===== */}
      <ul className="space-y-3 lg:hidden">
        {baris.map((r) => {
          const sedangAktif = aktif !== null && aktif === r.nama;
          const rincian = rincianPerkiraan?.(r.nama) ?? [];
          return (
            <li
              key={r.nama}
              className={`rounded-lg border bg-white p-4 ${
                sedangAktif ? "border-emerald-600/50 bg-emerald-50/50" : "border-slate-200"
              }`}
            >
              <p className="inline-flex items-center gap-1.5 font-semibold uppercase text-navy">
                <Wallet className="size-3.5 shrink-0 text-primary" aria-hidden />
                {tampil(r.nama)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {r.jumlahPinjaman} pinjaman · {r.jumlahAktif} aktif · {r.jumlahLunas} lunas
              </p>

              <dl className="mt-3 space-y-1.5 text-xs">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted-foreground">Dana tersalurkan</dt>
                  <dd className="tabular-nums font-medium text-slate-900">
                    {rupiah(r.totalDisalurkan)}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted-foreground">Masih berjalan</dt>
                  <dd className="tabular-nums text-slate-900">{rupiah(r.saldoBerjalan)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted-foreground">Dibukukan (lunas)</dt>
                  <dd className="tabular-nums font-semibold text-emerald-700">
                    {rupiah(r.keuntunganPendanaLunas)}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted-foreground">Perkiraan (belum lunas)</dt>
                  <dd className="tabular-nums font-medium text-amber-700">
                    {rupiah(r.keuntunganPendanaBelumLunas)}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 border-t border-slate-100 pt-1.5">
                  <dt className="font-medium text-slate-700">Total keuntungan</dt>
                  <dd className="tabular-nums font-semibold text-emerald-800">
                    {rupiah(r.keuntunganPendana)}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted-foreground">Potongan admin</dt>
                  <dd className="tabular-nums text-slate-900">{rupiah(r.keuntunganAdmin)}</dd>
                </div>
              </dl>

              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Transfer keuntungan</span>
                <TransferPendana r={r} ringkas />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {onPilih !== undefined && (
                  <Button
                    variant={sedangAktif ? "default" : "outline"}
                    size="sm"
                    aria-pressed={sedangAktif}
                    onClick={() => onPilih(r.nama)}
                  >
                    {sedangAktif ? "Lepas saringan" : "Saring daftar"}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  aria-expanded={terbuka.includes(r.nama)}
                  onClick={() => toggle(r.nama)}
                >
                  {terbuka.includes(r.nama) ? "Tutup rincian" : "Rincian"}
                </Button>
              </div>

              {terbuka.includes(r.nama) && (
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <IsiRincian r={r} rincian={rincian} />
                </div>
              )}
            </li>
          );
        })}

        {/* Kartu total: di layar sempit, kaki tabel tidak terlihat, jadi
            jumlahnya mendapat kartunya sendiri. */}
        <li className="rounded-lg border border-slate-300 bg-slate-100/80 p-4">
          <p className="font-semibold text-navy">Total · {total.jumlahPendana} pendana</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {total.jumlahPinjaman} pinjaman · {total.jumlahAktif} aktif · {total.jumlahLunas} lunas
          </p>
          <dl className="mt-3 space-y-1.5 text-xs">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted-foreground">Dana tersalurkan</dt>
              <dd className="tabular-nums font-semibold text-slate-900">
                {rupiah(total.totalDisalurkan)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted-foreground">Masih berjalan</dt>
              <dd className="tabular-nums font-semibold text-slate-900">
                {rupiah(total.saldoBerjalan)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted-foreground">Dibukukan (lunas)</dt>
              <dd className="tabular-nums font-semibold text-emerald-700">
                {rupiah(total.keuntunganPendanaLunas)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted-foreground">Perkiraan (belum lunas)</dt>
              <dd className="tabular-nums font-semibold text-amber-700">
                {rupiah(total.keuntunganPendanaBelumLunas)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 border-t border-slate-200 pt-1.5">
              <dt className="font-medium text-slate-700">Total keuntungan</dt>
              <dd className="tabular-nums font-semibold text-emerald-800">
                {rupiah(total.keuntunganPendana)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted-foreground">Potongan admin</dt>
              <dd className="tabular-nums font-semibold text-slate-900">
                {rupiah(total.keuntunganAdmin)}
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-muted-foreground">
            {total.transferBelumDicatat === 0
              ? "Semua transfer keuntungan sudah dicatat"
              : `${total.transferBelumDicatat} transfer belum dicatat (${rupiah(
                  total.keuntunganBelumDicatat,
                )})`}
          </p>
        </li>
      </ul>

      <p className="mt-3 max-w-3xl text-xs leading-5 text-muted-foreground">
        Urutkan tabel dengan menekan judul kolom. Setiap baris dihitung dari pinjaman yang tercatat
        pada pendana itu, dan baris total menjumlahkan kolomnya. Kolom{" "}
        <strong className="font-semibold text-slate-800">Perkiraan (belum lunas)</strong> adalah
        hitungan atas pinjaman yang masih berjalan — belum menjadi uang pendana sampai pinjamannya
        lunas.
      </p>
    </div>
  );
}
