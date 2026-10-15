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

/** Kolom terakhir: aksi per baris, tidak ikut diurutkan. */
const LABEL_AKSI = "Aksi";

/**
 * Jatah lebar kolom dalam persen: nama, enam kolom angka, aksi.
 *
 * Tabel `table-fixed` supaya tidak ada kolom yang terpotong tepi kartu.
 */
const LEBAR_PENDANA = "w-[18%]";
const LEBAR_ANGKA = "w-[11.5%]";
const LEBAR_AKSI = "w-[13%]";

/**
 * Garis rambut pemisah gugus kolom: posisi dana, hasil pendana, biaya.
 */
const PEMISAH = "border-l border-slate-200";

function rupiah(nilai: number): string {
  return formatRupiahAman(nilai);
}

/** Satu sel angka: rata kanan, lebar tetap, pembatas gugusnya ikut. */
function SelAngka({
  nilai,
  pemisah = false,
  kelas = "",
}: {
  nilai: string;
  pemisah?: boolean;
  kelas?: string;
}) {
  return (
    <TableCell
      className={`px-2 py-2.5 text-right align-top tabular-nums ${pemisah ? PEMISAH : ""} ${kelas}`}
    >
      {nilai}
    </TableCell>
  );
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
 * Isi lipatan satu baris: pinjaman pembentuk angka perkiraan dan pembagian
 * potongan admin, dua angka pendamping yang tidak muat sebagai kolom.
 */
function IsiRincian({
  r,
  rincian,
}: {
  r: RekapPendana;
  rincian: readonly RincianPerkiraan[];
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {/*
       * Dua lembar berlabel berdampingan: daftar tanpa bingkai membuat angka
       * kanan terbaca seperti kolom tabel yang lain.
       */}
      <div className={`${FOLIO.jalur} p-3`}>
        <p className="text-xs font-semibold text-navy">
          Pembentuk angka perkiraan · {rincian.length} pinjaman berjalan
        </p>
        {rincian.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Tidak ada pinjaman berjalan atas nama pendana ini, jadi angka perkiraannya Rp 0.
          </p>
        ) : (
          <>
            {/* Kepala kecil di atas angkanya, supaya angka rata kanan tetap
                bisa dipasangkan ke barisnya. */}
            <div className="mt-2 flex items-baseline justify-between gap-3 border-b border-slate-300 pb-1 text-xs text-slate-600">
              <span>Pinjaman (referensi · peminjam)</span>
              <span className="shrink-0">Perkiraan</span>
            </div>
            <ul className="divide-y divide-slate-200">
              {rincian.map((p) => (
                <li
                  key={p.id}
                  className="flex items-baseline justify-between gap-3 py-1.5 text-xs"
                >
                  <span className={`min-w-0 truncate text-slate-600 ${FOLIO.kode}`}>
                    {p.nomorReferensi} · {namaHurufBesar(p.namaLengkap)}
                  </span>
                  <span className="shrink-0 tabular-nums font-medium text-amber-700">
                    {rupiah(p.keuntunganPendana)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Jumlah baris di atas sama dengan kolom “Perkiraan (belum lunas)”.
        </p>
      </div>

      <div className={`${FOLIO.jalur} p-3`}>
        <p className="text-xs font-semibold text-navy">Angka lain di baris ini</p>
        <dl className="mt-2">
          {[
            {
              label: "Pinjaman (total · aktif · lunas)",
              nilai: `${r.jumlahPinjaman} · ${r.jumlahAktif} · ${r.jumlahLunas}`,
            },
            {
              label: "Potongan admin dibukukan",
              nilai: rupiah(r.keuntunganAdminLunas),
            },
            {
              label: "Potongan admin perkiraan",
              nilai: rupiah(r.keuntunganAdminBelumLunas),
            },
            {
              label: "Transfer sudah dicatat",
              nilai: `${r.transferTercatat} pinjaman lunas`,
            },
          ].map((baris) => (
            <div
              key={baris.label}
              className="flex items-baseline justify-between gap-3 border-b border-slate-200 py-1.5 text-xs last:border-b-0"
            >
              <dt className="min-w-0 text-slate-600">{baris.label}</dt>
              <dd className="shrink-0 tabular-nums font-medium text-slate-900">{baris.nilai}</dd>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-3 pt-1.5 text-xs">
            <dt className="text-slate-600">Transfer keuntungan</dt>
            <dd className="text-right">
              <TransferPendana r={r} />
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

/**
 * Tabel perbandingan pendana, satu-satunya permukaan rekap dana di ruang
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
 * setiap pendana ditampilkan sebagai kartu berisi angka yang sama, bukan tabel
 * yang dipotong.
 *
 * Aturan urut dan penjumlahannya tinggal di `@/lib/tabelPendana` supaya bisa
 * diuji sebagai fungsi; komponen ini hanya menggambar.
 *
 * Murni presentasional tanpa Convex, supaya bisa dirender langsung oleh uji
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
   * Pinjaman berjalan milik satu pendana, isi lipatan "Pembentuk angka
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
        Belum ada dana tersalurkan pada pendana mana pun. Rekap ini terisi
        setelah ada pinjaman yang cair atas nama pendana.
      </p>
    );
  }

  return (
    <div className="animate-masuk">
      {/* Layar lebar: satu tabel yang bisa diurutkan */}
      {/* Lembar folio: kertas padat bergaris kepala kuningan, tanpa bayangan:
          bayangan hanya dipakai satu lembar fokus di puncak halaman. */}
      <div className={`hidden overflow-hidden lg:block ${FOLIO.kertas}`}>
        <Table className="w-full table-fixed [&_th]:whitespace-normal [&_td]:whitespace-normal">
          <TableCaption className="sr-only">
            Perbandingan dana tersalurkan, keuntungan, dan potongan admin per pendana
          </TableCaption>
          <TableHeader>
            <TableRow className={`${FOLIO.kepalaTabel} hover:bg-slate-50`}>
              {KOLOM_PENDANA.map((kolom, i) => {
                const jadiDasar = urutan.kunci === kolom.kunci;
                const angka = i > 0;
                return (
                  <TableHead
                    key={kolom.kunci}
                    scope="col"
                    aria-sort={
                      jadiDasar ? (urutan.arah === "naik" ? "ascending" : "descending") : "none"
                    }
                    className={`h-auto px-2 py-2 align-bottom ${i === 0 ? LEBAR_PENDANA : LEBAR_ANGKA} ${
                      i === 1 || i === 3 || i === 6 ? PEMISAH : ""
                    }`}
                  >
                    {/* Judul kolom rata dengan angkanya: kolom angka rata kanan,
                        kolom nama rata kiri. */}
                    <button
                      type="button"
                      onClick={() => gantiUrut(kolom.kunci)}
                      aria-label={`Urutkan menurut ${kolom.label}`}
                      className={`inline-flex w-full items-center gap-1 text-xs font-semibold uppercase leading-tight tracking-[0.04em] text-slate-600 transition-colors hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 ${
                        angka ? "justify-end text-right" : "text-left"
                      }`}
                    >
                      <span className="min-w-0">{kolom.label}</span>
                      <IkonUrut aktif={jadiDasar} arah={urutan.arah} />
                    </button>
                  </TableHead>
                );
              })}
              <TableHead
                scope="col"
                className={`h-auto px-2 py-2 align-bottom text-right ${LEBAR_AKSI}`}
              >
                <span className="text-xs font-semibold uppercase tracking-[0.04em] text-slate-600">
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
                    <TableCell className="px-2 py-2.5 align-top">
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
                    <SelAngka nilai={rupiah(r.totalDisalurkan)} pemisah kelas="font-medium text-slate-900" />
                    <SelAngka nilai={rupiah(r.saldoBerjalan)} kelas="text-slate-900" />
                    <SelAngka nilai={rupiah(r.keuntunganPendanaLunas)} pemisah kelas="font-semibold text-emerald-700" />
                    <SelAngka nilai={rupiah(r.keuntunganPendanaBelumLunas)} kelas="font-medium text-amber-700" />
                    <SelAngka nilai={rupiah(r.keuntunganPendana)} kelas="font-semibold text-emerald-800" />
                    <SelAngka nilai={rupiah(r.keuntunganAdmin)} pemisah kelas="text-slate-900" />
                    <TableCell className="px-2 py-2.5 align-top">
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
              <TableCell className="px-2 py-2.5 align-top">
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
              <SelAngka nilai={rupiah(total.totalDisalurkan)} pemisah kelas="font-semibold text-slate-900" />
              <SelAngka nilai={rupiah(total.saldoBerjalan)} kelas="font-semibold text-slate-900" />
              <SelAngka nilai={rupiah(total.keuntunganPendanaLunas)} pemisah kelas="font-semibold text-emerald-700" />
              <SelAngka nilai={rupiah(total.keuntunganPendanaBelumLunas)} kelas="font-semibold text-amber-700" />
              <SelAngka nilai={rupiah(total.keuntunganPendana)} kelas="font-semibold text-emerald-800" />
              <SelAngka nilai={rupiah(total.keuntunganAdmin)} pemisah kelas="font-semibold text-slate-900" />
              <TableCell className="px-2 py-2.5 align-top" />
            </TableRow>
          </TableFooter>
        </Table>
      </div>

      {/* Layar sempit: kartu per pendana, angka yang sama */}
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

              {/* Kartu ini yang tampil di layar sentuh, jadi tombolnya diberi
                  tinggi sasaran sentuh 44 px; tombol di tabel cukup `size="sm"`. */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {onPilih !== undefined && (
                  <Button
                    variant={sedangAktif ? "default" : "outline"}
                    size="sm"
                    className="min-h-11"
                    aria-pressed={sedangAktif}
                    onClick={() => onPilih(r.nama)}
                  >
                    {sedangAktif ? "Lepas saringan" : "Saring daftar"}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-11"
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
        hitungan atas pinjaman yang masih berjalan, belum menjadi uang pendana sampai pinjamannya
        lunas.
      </p>
    </div>
  );
}
