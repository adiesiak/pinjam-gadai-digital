import {
  BadgeCheck,
  Download,
  ListFilter,
  RotateCcw,
  Search,
  TriangleAlert,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { FOLIO } from "@/components/penyediaDana/folio";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  adaSaringan,
  keCsvTransfer,
  labelMetodeTransfer,
  labelStatusTransfer,
  namaBerkasTransfer,
  PERIODE_TRANSFER,
  ringkasDariSaringan,
  SARINGAN_TRANSFER_KOSONG,
  saringTransfer,
  type BarisBelumTransfer,
  type BarisTransferLaporan,
  type RingkasanServerTransfer,
  type SaringanTransfer,
} from "@/lib/laporanTransfer";
import { formatRupiahAman } from "@/lib/money";
import { labelRentang, potongHalaman } from "@/lib/paginasi";

/** Nilai sentinel "semua waktu" — Radix tidak menerima `""` sebagai nilai item. */
const SEMUA_WAKTU = "__semua_waktu__";

function rupiah(nilai: number): string {
  return formatRupiahAman(nilai);
}

function tanggal(waktu: number): string {
  return new Date(waktu).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function jam(waktu: number): string {
  return new Date(waktu).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

function waktuLengkap(waktu: number): string {
  return `${tanggal(waktu)} · ${jam(waktu)}`;
}

/**
 * Satu angka ringkas dengan keterangan satu baris.
 *
 * Warna dipakai sebagai penanda makna (hijau = sudah dicatat, amber = masih
 * menunggu), sementara keterangannya selalu menuliskan makna itu dengan kata,
 * sehingga angka tidak hanya bisa dibaca lewat warna.
 */
function KartuAngka({
  label,
  nilai,
  jumlah,
  keterangan,
  aksen,
  icon,
}: {
  label: string;
  nilai: number;
  jumlah: number;
  keterangan: string;
  aksen: "tercatat" | "dibatalkan" | "belum";
  icon: ReactNode;
}) {
  const warna =
    aksen === "tercatat"
      ? "text-emerald-700"
      : aksen === "belum"
        ? "text-amber-800"
        : "text-slate-700";
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3.5">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
        <span className={warna} aria-hidden>
          {icon}
        </span>
        {label}
      </p>
      <p className={`mt-2 text-xl font-semibold tabular-nums ${warna}`}>{rupiah(nilai)}</p>
      <p className="text-xs tabular-nums text-muted-foreground">{jumlah} catatan</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{keterangan}</p>
    </div>
  );
}

/** Lencana status catatan: tulisannya berdiri sendiri, warnanya hanya penguat. */
function LencanaStatus({ status }: { status: string }) {
  const tercatat = status === "dicatat";
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${
        tercatat
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-slate-300 bg-slate-50 text-slate-700"
      }`}
    >
      {labelStatusTransfer(status)}
    </span>
  );
}

/**
 * Unduh isi CSV sebagai berkas bagi pembaca.
 *
 * Sengaja berdiri DI LUAR komponen: nama berkas memakai jam unduhan, dan
 * membaca jam di dalam badan komponen membuatnya terbaca sebagai perhitungan
 * yang tidak murni (aturan `react-hooks/purity`).
 */
function unduhCsv(isi: string): void {
  const blob = new Blob([isi], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const tautan = document.createElement("a");
  tautan.href = url;
  tautan.download = namaBerkasTransfer(Date.now());
  tautan.click();
  URL.revokeObjectURL(url);
}

/** Penanda baris milik akun yang sedang membaca — angka orang lain tetap terbaca. */
function PenandaMilikAnda() {
  return (
    <span className="ml-1.5 inline-flex items-center rounded-sm border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-xs font-semibold text-emerald-800">
      milik Anda
    </span>
  );
}

/**
 * Laporan & riwayat transfer keuntungan di ruang pendana.
 *
 * Menjawab tiga pertanyaan dalam satu tempat: catatan transfer mana yang sudah
 * dibuat admin, mana yang dibatalkan karena salah catat, dan keuntungan pinjaman
 * lunas mana yang belum punya catatan sama sekali (antrean rekonsiliasi).
 *
 * Seluruh penyaringan, penjumlahan, dan penyusunan CSV dikerjakan
 * `@/lib/laporanTransfer`, jadi yang diunduh pendana adalah baris yang SAMA
 * dengan yang ia lihat di layar — bukan versi lain dari data yang sama.
 *
 * Satu hal yang tidak boleh salah baca, dan karena itu ditulis berulang di sini:
 * isi laporan adalah catatan pembukuan internal PINDAI. PINDAI tidak
 * memindahkan uang, jadi "belum dicatat" berarti admin belum membuat catatannya
 * — bukan berarti uangnya belum berpindah. Bukti perpindahan dana tetap ada di
 * bank atau e-wallet.
 *
 * Murni presentasional (tanpa Convex) supaya bisa dirender uji markup.
 */
export function LaporanTransferPendana({
  rows,
  belum,
  ringkasan,
  idSaya,
  namaTampil,
  terpotong,
}: {
  rows: readonly BarisTransferLaporan[];
  belum: readonly BarisBelumTransfer[];
  /** Angka dari server: seluruh catatan + antrean yang belum dicatat. */
  ringkasan: RingkasanServerTransfer;
  /** Id akun pembaca — baris yang pendananya akun ini ditandai "milik Anda". */
  idSaya: string;
  /** Penyamaran nama pendana lain untuk tampilan (bawaan: nama apa adanya). */
  namaTampil: (nama: string) => string;
  /** Daftar catatan dipotong di `BATAS_BARIS` — beri tahu pembaca apa adanya. */
  terpotong: boolean;
}) {
  // Jam dikunci sekali saat komponen dipasang: saringan periode tidak boleh
  // bergerak sendiri di tengah pembacaan.
  const [sekarang] = useState(() => Date.now());
  const [saringan, setSaringan] = useState<SaringanTransfer>(SARINGAN_TRANSFER_KOSONG);
  const [halaman, setHalaman] = useState(0);

  const hasil = saringTransfer(rows, saringan, sekarang);
  const potongan = potongHalaman(hasil, halaman);
  const angkaTampil = ringkasDariSaringan(hasil);
  const saringAktif = adaSaringan(saringan);

  function kosongkan() {
    setSaringan(SARINGAN_TRANSFER_KOSONG);
    setHalaman(0);
  }

  /** Unduh CSV dari HASIL SARINGAN yang sedang terlihat, bukan seluruh tabel. */
  function unduh() {
    try {
      if (hasil.length === 0) {
        toast.info("Tidak ada baris untuk diekspor pada saringan ini.");
        return;
      }
      // BOM UTF-8 supaya Excel membaca huruf beraksen dengan benar.
      unduhCsv(`\uFEFF${keCsvTransfer(hasil)}`);
      toast.success(`${hasil.length} catatan transfer diekspor ke CSV.`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Gagal mengekspor catatan transfer.",
      );
    }
  }

  if (rows.length === 0 && belum.length === 0) {
    return (
      <section
        aria-label="Laporan transfer keuntungan"
        className="animate-masuk mt-4 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-8 text-center"
      >
        <p className="text-sm font-medium text-navy">Belum ada catatan transfer keuntungan</p>
        <p className="mx-auto mt-2 max-w-xl text-xs leading-6 text-muted-foreground">
          Catatan transfer dibuat admin setelah pinjaman berstatus lunas, dan baru muncul di sini
          setelah dicatat. Belum ada catatan berarti belum ada yang perlu diperiksa, bukan berarti
          ada keuntungan yang hilang. PINDAI adalah pencatat: perpindahan uang tetap terjadi di bank
          atau e-wallet.
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Laporan transfer keuntungan" className="animate-masuk mt-4 space-y-4">
      <div className="border-b border-slate-200 pb-2">
        <h2 className={FOLIO.judul}>Riwayat transfer keuntungan</h2>
        <p className="mt-1 max-w-3xl text-xs leading-6 text-muted-foreground">
          Isi laporan ini adalah <strong className="font-semibold text-slate-700">catatan
          pembukuan internal PINDAI</strong> bahwa admin sudah mentransfer keuntungan di luar
          sistem, bukan bukti mutasi bank/e-wallet dan bukan jaminan atas dana. Bukti perpindahan
          dana tetap ada pada rekening atau e-wallet masing-masing.
        </p>
      </div>

      {/* Tiga angka: yang sudah dicatat, yang dibatalkan, dan yang belum dicatat. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <KartuAngka
          label="Catatan transfer berlaku"
          nilai={ringkasan.nilaiTercatat}
          jumlah={ringkasan.jumlahTercatat}
          keterangan="Sudah dicatat admin sebagai ditransfer di luar sistem."
          aksen="tercatat"
          icon={<BadgeCheck className="size-3.5" />}
        />
        <KartuAngka
          label="Catatan dibatalkan"
          nilai={ringkasan.nilaiDibatalkan}
          jumlah={ringkasan.jumlahDibatalkan}
          keterangan="Salah catat, lalu ditandai batal. Tidak mengubah saldo maupun pinjaman."
          aksen="dibatalkan"
          icon={<RotateCcw className="size-3.5" />}
        />
        <KartuAngka
          label="Belum dicatat (antrean admin)"
          nilai={ringkasan.nilaiBelumDicatat}
          jumlah={ringkasan.jumlahBelumDicatat}
          keterangan="Pinjaman sudah lunas, catatan transfernya belum dibuat admin."
          aksen="belum"
          icon={<TriangleAlert className="size-3.5" />}
        />
      </div>

      {/* ===== Saringan + ekspor ===== */}
      {rows.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <p className="flex items-center gap-2 border-b border-gold/40 bg-slate-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-slate-700 sm:px-5">
            <ListFilter className="size-3.5 text-primary" aria-hidden /> Saring riwayat
          </p>
          <div className="grid gap-3 px-4 py-4 sm:grid-cols-3 sm:px-5">
            <div className="min-w-0 sm:col-span-1">
              <Label
                htmlFor="saring-transfer"
                className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-600"
              >
                Cari
              </Label>
              <div className="relative mt-1.5">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  id="saring-transfer"
                  type="search"
                  value={saringan.cari}
                  onChange={(e) => setSaringan((lama) => ({ ...lama, cari: e.target.value }))}
                  placeholder="No. referensi, pendana, atau referensi mutasi"
                  className="pl-9"
                />
              </div>
            </div>

            <div className="min-w-0">
              <p
                id="label-saring-status"
                className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-600"
              >
                Status catatan
              </p>
              <Select
                value={saringan.status}
                onValueChange={(nilai) =>
                  setSaringan((lama) => ({
                    ...lama,
                    status: nilai as SaringanTransfer["status"],
                  }))
                }
              >
                <SelectTrigger
                  aria-label="Status catatan"
                  aria-labelledby="label-saring-status"
                  className="mt-1.5 w-full"
                >
                  <SelectValue>
                    {saringan.status === "semua"
                      ? "semua status"
                      : labelStatusTransfer(saringan.status)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="semua">semua status</SelectItem>
                  <SelectItem value="dicatat">{labelStatusTransfer("dicatat")}</SelectItem>
                  <SelectItem value="dibatalkan">{labelStatusTransfer("dibatalkan")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-0">
              <p
                id="label-saring-periode"
                className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-600"
              >
                Periode
              </p>
              <Select
                value={saringan.hari === 0 ? SEMUA_WAKTU : String(saringan.hari)}
                onValueChange={(nilai) =>
                  setSaringan((lama) => ({
                    ...lama,
                    hari: nilai === SEMUA_WAKTU ? 0 : Number(nilai),
                  }))
                }
              >
                <SelectTrigger
                  aria-label="Periode"
                  aria-labelledby="label-saring-periode"
                  className="mt-1.5 w-full"
                >
                  <SelectValue>
                    {PERIODE_TRANSFER.find((p) => p.nilai === saringan.hari)?.label ??
                      "semua waktu"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {PERIODE_TRANSFER.map((p) => (
                    <SelectItem key={p.nilai} value={p.nilai === 0 ? SEMUA_WAKTU : String(p.nilai)}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 sm:px-5">
            <p className="text-xs tabular-nums text-muted-foreground">
              {labelRentang(potongan, hasil.length)}
              {saringAktif
                ? ` · ${rupiah(angkaTampil.nilaiTercatat)} tercatat pada saringan ini`
                : ` · ${rupiah(angkaTampil.nilaiTercatat)} tercatat`}
            </p>
            <div className="flex items-center gap-2">
              {saringAktif && (
                <Button variant="ghost" size="sm" onClick={kosongkan} className="h-8 text-xs">
                  <RotateCcw className="mr-1.5 size-3.5" aria-hidden /> Kosongkan filter
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={unduh} className="h-8 text-xs">
                <Download className="mr-1.5 size-3.5" aria-hidden /> Unduh CSV
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Riwayat: tabel di layar lebar, kartu di layar sempit ===== */}
      {hasil.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-xs text-muted-foreground">
          Tidak ada catatan transfer yang cocok dengan saringan ini. Kosongkan filter untuk melihat
          seluruh riwayat.
        </p>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-lg border border-slate-200 bg-white lg:block">
            <Table className="w-full">
              <TableCaption className="sr-only">
                Riwayat catatan transfer keuntungan pendana
              </TableCaption>
              <TableHeader>
                <TableRow className="border-b border-gold/40 bg-slate-50 hover:bg-slate-50">
                  {[
                    "Waktu",
                    "Referensi",
                    "Pendana",
                    "Nominal",
                    "Metode",
                    "Referensi mutasi",
                    "Status",
                    "Dicatat oleh",
                    "Catatan",
                  ].map((kolom) => (
                    <TableHead
                      key={kolom}
                      scope="col"
                      className="h-12 px-3 align-bottom text-xs font-semibold uppercase tracking-[0.1em] text-slate-600"
                    >
                      {kolom}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {potongan.baris.map((b) => (
                  <TableRow key={b.id} className="hover:bg-emerald-50/40">
                    <TableCell className="px-3 py-3 align-top text-xs tabular-nums text-slate-700">
                      {waktuLengkap(b.dicatatPada)}
                    </TableCell>
                    <TableCell className="px-3 py-3 align-top font-mono text-xs font-medium tabular-nums text-navy">
                      {b.nomorReferensi}
                    </TableCell>
                    <TableCell className="px-3 py-3 align-top text-xs text-slate-800">
                      {namaTampil(b.pendanaNama)}
                      {b.pendanaId === idSaya && <PenandaMilikAnda />}
                    </TableCell>
                    <TableCell className="px-3 py-3 text-right align-top text-xs font-semibold tabular-nums text-slate-900">
                      {rupiah(b.jumlah)}
                    </TableCell>
                    <TableCell className="px-3 py-3 align-top text-xs text-slate-700">
                      {labelMetodeTransfer(b.metode)}
                    </TableCell>
                    <TableCell className="px-3 py-3 align-top text-xs text-slate-700">
                      {b.referensi ?? "Belum diisi"}
                    </TableCell>
                    <TableCell className="px-3 py-3 align-top">
                      <LencanaStatus status={b.status} />
                    </TableCell>
                    <TableCell className="px-3 py-3 align-top text-xs text-slate-700">
                      {b.dicatatOlehLabel}
                    </TableCell>
                    <TableCell className="max-w-[16rem] px-3 py-3 align-top text-xs leading-5 text-slate-600">
                      {b.status === "dibatalkan"
                        ? `Dibatalkan ${b.dibatalkanPada === null ? "" : tanggal(b.dibatalkanPada)}${
                            b.alasanBatal === null ? "" : `: ${b.alasanBatal}`
                          }`
                        : (b.catatan ?? "Tanpa catatan tambahan.")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul className="space-y-3 lg:hidden">
            {potongan.baris.map((b) => (
              <li key={b.id} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className={`text-xs font-medium text-navy ${FOLIO.kode}`}>
                    {b.nomorReferensi}
                  </p>
                  <LencanaStatus status={b.status} />
                </div>
                <p className="mt-2 text-lg font-semibold tabular-nums text-slate-900">
                  {rupiah(b.jumlah)}
                </p>
                <dl className="mt-2 space-y-1 text-xs">
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-muted-foreground">Waktu dicatat</dt>
                    <dd className="tabular-nums text-slate-800">{waktuLengkap(b.dicatatPada)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-muted-foreground">Pendana</dt>
                    <dd className="text-right text-slate-800">
                      {namaTampil(b.pendanaNama)}
                      {b.pendanaId === idSaya && <PenandaMilikAnda />}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-muted-foreground">Metode</dt>
                    <dd className="text-slate-800">{labelMetodeTransfer(b.metode)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-muted-foreground">Referensi mutasi</dt>
                    <dd className="text-right text-slate-800">{b.referensi ?? "Belum diisi"}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-muted-foreground">Dicatat oleh</dt>
                    <dd className="text-slate-800">{b.dicatatOlehLabel}</dd>
                  </div>
                </dl>
                <p className="mt-2 text-xs leading-5 text-slate-600">
                  {b.status === "dibatalkan"
                    ? `Dibatalkan ${b.dibatalkanPada === null ? "" : tanggal(b.dibatalkanPada)}${
                        b.alasanBatal === null ? "" : `: ${b.alasanBatal}`
                      }`
                    : (b.catatan ?? "Tanpa catatan tambahan.")}
                </p>
              </li>
            ))}
          </ul>

          {/* ===== Paginasi: 10 baris per halaman ===== */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs tabular-nums text-muted-foreground">
              {labelRentang(potongan, hasil.length)}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={potongan.halaman === 0}
                onClick={() => setHalaman(potongan.halaman - 1)}
              >
                Sebelumnya
              </Button>
              <span className="text-xs tabular-nums text-muted-foreground">
                Halaman {potongan.halaman + 1} dari {potongan.totalHalaman}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={potongan.halaman >= potongan.totalHalaman - 1}
                onClick={() => setHalaman(potongan.halaman + 1)}
              >
                Berikutnya
              </Button>
            </div>
          </div>
        </>
      )}

      {terpotong && (
        <p className="text-xs leading-5 text-muted-foreground">
          Daftar dibatasi 200 catatan terbaru. Saringan periode membantu melihat rentang yang lebih
          sempit; untuk riwayat yang lebih lama, mintakan rekap ke admin.
        </p>
      )}

      {/* ===== Antrean rekonsiliasi: pekerjaan admin, dipantau pendana ===== */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-gold/40 bg-slate-50 px-4 py-2.5 sm:px-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
            Antrean rekonsiliasi · {belum.length} pinjaman
          </p>
          <p className="text-xs font-semibold tabular-nums text-amber-800">
            {rupiah(ringkasan.nilaiBelumDicatat)}
          </p>
        </div>
        {belum.length === 0 ? (
          <p className="px-4 py-5 text-xs leading-6 text-muted-foreground sm:px-5">
            Semua pinjaman lunas yang berpendana sudah punya catatan transfer. Tidak ada yang
            menunggu ditindaklanjuti.
          </p>
        ) : (
          <>
            <p className="px-4 pt-4 text-xs leading-6 text-muted-foreground sm:px-5">
              Daftar ini adalah pekerjaan admin: pinjaman sudah lunas, tetapi catatan transfernya
              belum dibuat. Pendana cukup memantau di sini: urutan paling atas adalah yang paling
              lama menunggu.
            </p>
            <ul className="divide-y divide-slate-200 px-4 pb-2 sm:px-5">
              {belum.map((b) => (
                <li key={b.loanId} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <p className={`text-xs font-medium text-navy ${FOLIO.kode}`}>{b.referensi}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {namaTampil(b.pendanaNama)}
                      {b.pendanaId === idSaya && <PenandaMilikAnda />} · lunas {tanggal(b.lunasPada)}
                    </p>
                  </div>
                  <p className="text-xs font-semibold tabular-nums text-amber-800">
                    {rupiah(b.jumlah)}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
