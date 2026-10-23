import { ChevronRight, ClipboardList, Package, Search, Zap } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { GadaiDanaPanel } from "@/components/GadaiDanaPanel";
import { StatusBadge } from "@/components/StatusBadge";
import { CatatPengajuanManualButton } from "@/components/admin/CatatPengajuanManual";
import { formatDate } from "@/components/admin/admin-format";
import {
  EmptyQueue,
  SubTabFilter,
  type LoanRow,
  type PawnRow,
} from "@/components/admin/admin-shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  pakaiCairEkspres,
  urutkanAntreanEkspres,
} from "@/lib/admin-queue";
import { loanPurposeLabel } from "@/lib/loan";
import { formatRupiah } from "@/lib/money";
import { namaHurufBesar } from "@/lib/nama";
import { ringkasJumlah } from "@/lib/saringanPengajuan";
import { diTahapTinjauan } from "@/lib/statusPinjaman";
import { SUB_TAB_GADAI, SUB_TAB_PINJAMAN } from "@/lib/subTabAntrean";

/**
 * Sub-tab antrean pinjaman & gadai tinggal di `@/lib/subTabAntrean` — data
 * murni, supaya berkas ini hanya berisi komponen dan aturan "setiap status
 * punya satu sub-tab" bisa diuji tanpa membawa React.
 */

/** Satu baris tabel antrean konvensional — bentuknya sama untuk pinjaman & gadai. */
type BarisAntrean = {
  referensi: string;
  nama: string;
  email: string | null;
  /** null = nominal belum tercatat (mis. gadai yang belum ditaksir). */
  nominal: number | null;
  keperluan: string;
  waktu: number;
  /** Lencana tambahan di samping status (mis. Cair ekspres). */
  lencana?: ReactNode;
  status: ReactNode;
  aksi: "Proses" | "Detail";
  onOpen: () => void;
};

/**
 * Tabel antrean konvensional.
 *
 * Satu baris teks panjang ("nama · email · referensi · pokok · keperluan")
 * memaksa admin memindai satu kalimat untuk setiap pengajuan. Di sini tiap
 * fakta punya kolomnya sendiri: nama & email bertumpuk di kolom nasabah,
 * nominal pokok langsung terbaca hijau, dan status berupa pil.
 *
 * Di layar sempit kolom pendukung disembunyikan (ID, keperluan/tanggal,
 * status) dan status ikut turun ke bawah nama, sehingga tidak ada gulir
 * mendatar yang membuat baris kehilangan konteks.
 */
function TabelAntrean({
  baris,
  keterangan,
  judulNominal = "Nominal Pokok",
  judulKeperluan,
}: {
  baris: BarisAntrean[];
  /** Nama tabel untuk pembaca layar. */
  keterangan: string;
  judulNominal?: string;
  judulKeperluan: string;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <Table containerClassName="overflow-x-auto">
        <TableCaption className="sr-only">{keterangan}</TableCaption>
        <TableHeader className="bg-slate-50/80">
          <TableRow className="border-slate-200 hover:bg-transparent">
            <TableHead className="h-11 pl-4 pr-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Nasabah
            </TableHead>
            <TableHead className="hidden h-11 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 md:table-cell">
              ID Transaksi
            </TableHead>
            <TableHead className="h-11 px-3 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              {judulNominal}
            </TableHead>
            <TableHead className="hidden h-11 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 lg:table-cell">
              {judulKeperluan}
            </TableHead>
            <TableHead className="hidden h-11 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 sm:table-cell">
              Status
            </TableHead>
            <TableHead className="h-11 pl-3 pr-4 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Aksi
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {baris.map((b) => {
            const lencana = (
              <>
                {b.lencana}
                {b.status}
              </>
            );
            return (
              <TableRow
                key={b.referensi}
                className="border-slate-100 transition-colors hover:bg-slate-50"
              >
                <TableCell className="max-w-[240px] whitespace-normal py-3 pl-4 pr-2 align-middle">
                  <p className="break-words text-sm font-semibold leading-5 text-slate-900">
                    {b.nama}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] leading-4 text-slate-500">
                    {b.email ?? "Tanpa email"}
                  </p>
                  {/* Di ponsel status tidak punya kolom sendiri: tempel di bawah
                      nama supaya baris tetap satu pandangan. */}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1 [&>span]:rounded-full sm:hidden">
                    {lencana}
                  </div>
                </TableCell>
                <TableCell className="hidden px-3 py-3 align-middle md:table-cell">
                  <span className="font-mono text-xs text-slate-500">{b.referensi}</span>
                </TableCell>
                <TableCell className="px-3 py-3 text-right align-middle">
                  {b.nominal === null ? (
                    <span className="text-sm text-slate-400">—</span>
                  ) : (
                    <span className="whitespace-nowrap text-sm font-bold tabular-nums text-emerald-700">
                      {formatRupiah(b.nominal)}
                    </span>
                  )}
                </TableCell>
                <TableCell className="hidden max-w-[220px] px-3 py-3 align-middle lg:table-cell">
                  <p className="truncate text-xs font-medium text-slate-700">{b.keperluan}</p>
                  <p className="mt-0.5 text-[11px] tabular-nums text-slate-500">
                    {formatDate(b.waktu)}
                  </p>
                </TableCell>
                <TableCell className="hidden px-3 py-3 align-middle sm:table-cell">
                  <div className="flex flex-wrap items-center gap-1 [&>span]:rounded-full">
                    {lencana}
                  </div>
                </TableCell>
                <TableCell className="py-3 pl-3 pr-4 text-right align-middle">
                  <Button
                    type="button"
                    size="sm"
                    variant={b.aksi === "Proses" ? "default" : "outline"}
                    onClick={b.onOpen}
                    aria-label={`${b.aksi} pengajuan ${b.referensi}`}
                    className={
                      b.aksi === "Proses"
                        ? "h-8 gap-1 rounded-lg bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800"
                        : "h-8 gap-1 rounded-lg px-3 text-xs font-semibold"
                    }
                  >
                    {b.aksi}
                    <ChevronRight className="size-3.5" aria-hidden="true" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </section>
  );
}

/** Tab Pinjaman — antrean pengajuan pinjaman dengan sub-tab status. */
export function LoanQueueSection({
  loans,
  onOpen,
}: {
  loans: LoanRow[];
  onOpen: (l: LoanRow) => void;
}) {
  const [tabAktif, setTabAktif] = useState(SUB_TAB_PINJAMAN[0].id);
  const [search, setSearch] = useState("");
  const aktif = SUB_TAB_PINJAMAN.find((t) => t.id === tabAktif) ?? SUB_TAB_PINJAMAN[0];
  const cocokAktif = aktif.cocok;
  const filteredLoans = useMemo(() => {
    const diTab = loans.filter(cocokAktif);
    const needle = search.trim().toLowerCase();
    // Pengajuan cair ekspres selalu di paling atas: peminjam memilih dan
    // membayar jalur pencairan itu, jadi keputusannya tidak boleh menunggu di
    // belakang antrean biasa.
    if (!needle) return urutkanAntreanEkspres(diTab);
    return urutkanAntreanEkspres(
      diTab.filter((loan) =>
        [
          loan.namaLengkap,
          loan.emailPeminjam ?? "",
          loan.nomorReferensi,
          loan.tujuan,
          loan.catatanPeminjam ?? "",
          loan.namaBank ?? "",
          loan.nomorRekening,
        ].some((value) => value.toLowerCase().includes(needle)),
      ),
    );
  }, [loans, search, cocokAktif]);
  if (loans.length === 0) {
    return (
      <div className="space-y-3">
        {/* Pencatatan manual tetap tersedia walau antrean kosong: pengajuan
            yang diterima di luar aplikasi masuk lewat jalur ini. */}
        <div className="flex justify-end">
          <CatatPengajuanManualButton jenis="pinjaman" />
        </div>
        <EmptyQueue icon={ClipboardList} title="Belum ada pengajuan pinjaman" />
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <CatatPengajuanManualButton jenis="pinjaman" />
      </div>
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
        Nominal dan status pinjaman yang ditampilkan mengikuti catatan internal aplikasi.
      </p>
      <SubTabFilter
        nama="Sub-tab status pinjaman"
        opsi={SUB_TAB_PINJAMAN}
        aktif={aktif.id}
        onPilih={setTabAktif}
        baris={loans}
      />
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input aria-label="Cari peminjam atau pengajuan tunai" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama, email, referensi, atau keperluan…" className="pl-9" />
      </div>
      {/* Counter filter hub: berapa baris yang tampil dibanding seluruh antrean,
          supaya admin tahu saringan masih menyembunyikan data. */}
      <p aria-live="polite" className="text-[11px] tabular-nums text-muted-foreground">
        {ringkasJumlah(filteredLoans.length, loans.length)}
        {search.trim() !== "" || aktif.id !== SUB_TAB_PINJAMAN[0].id ? " · filter aktif" : ""}
      </p>
      {filteredLoans.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-8 text-center text-sm text-muted-foreground">
          {search.trim()
            ? "Tidak ada pengajuan yang cocok dengan pencarian."
            : `Tidak ada pinjaman pada sub-tab ${aktif.label}.`}
        </p>
      ) : (
        <TabelAntrean
          keterangan={`Antrean pinjaman, ${filteredLoans.length} pengajuan`}
          judulKeperluan="Keperluan & tanggal"
          baris={filteredLoans.map((l) => ({
            referensi: l.nomorReferensi,
            nama: namaHurufBesar(l.namaLengkap),
            email: l.emailPeminjam,
            nominal: l.pokokPinjaman,
            keperluan: loanPurposeLabel(l.tujuan),
            waktu: l._creationTime,
            lencana: pakaiCairEkspres(l) ? (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800"
                title="Peminjam memilih cair ekspres; biaya ekspres dipotong di muka."
              >
                <Zap className="size-3" aria-hidden="true" />
                Cair ekspres
              </span>
            ) : null,
            status: <StatusBadge status={l.status} kind="loan" />,
            aksi: diTahapTinjauan(l.status) ? "Proses" : "Detail",
            onOpen: () => onOpen(l),
          }))}
        />
      )}
    </div>
  );
}

/** Tab Gadai — antrean pengajuan gadai + panel hitungan internal. */
export function PawnQueueSection({
  pawns,
  onOpen,
}: {
  pawns: PawnRow[];
  onOpen: (p: PawnRow) => void;
}) {
  const [tabAktif, setTabAktif] = useState(SUB_TAB_GADAI[0].id);
  const [search, setSearch] = useState("");
  const aktif = SUB_TAB_GADAI.find((t) => t.id === tabAktif) ?? SUB_TAB_GADAI[0];
  const cocokAktif = aktif.cocok;
  const filteredPawns = useMemo(() => {
    const diTab = pawns.filter(cocokAktif);
    const needle = search.trim().toLowerCase();
    if (!needle) return diTab;
    return diTab.filter((pawn) =>
      [
        pawn.namaLengkap,
        pawn.emailPeminjam ?? "",
        pawn.nomorReferensi,
        pawn.deskripsiBarang,
        pawn.kategori,
        pawn.catatanPeminjam ?? "",
        pawn.namaBank ?? "",
        pawn.nomorRekening,
      ].some((value) => value.toLowerCase().includes(needle)),
    );
  }, [pawns, search, cocokAktif]);
  return (
    <>
      <div className="mb-3 flex justify-end">
        <CatatPengajuanManualButton jenis="gadai" />
      </div>
      {pawns.length === 0 ? (
        <EmptyQueue
          icon={Package}
          title="Belum ada pengajuan gadai"
          deskripsi="Antrean gadai akan muncul di sini begitu nasabah mengirim pengajuan barang jaminan."
          poin={[
            "Barang jaminan, kategori, dan nilai taksiran",
            "Status penilaian serta hasil review tim",
            "Posisi gadai aktif (Skema B) yang sudah disetujui",
          ]}
        />
      ) : (
        <div className="space-y-3">
          <SubTabFilter
            nama="Sub-tab status gadai"
            opsi={SUB_TAB_GADAI}
            aktif={aktif.id}
            onPilih={setTabAktif}
            baris={pawns}
          />
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input aria-label="Cari pemohon atau pengajuan gadai" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama, email, referensi, barang, atau kategori…" className="pl-9" />
          </div>
          {/* Counter filter hub — aturan yang sama dengan antrean pinjaman. */}
          <p aria-live="polite" className="text-[11px] tabular-nums text-muted-foreground">
            {ringkasJumlah(filteredPawns.length, pawns.length)}
            {search.trim() !== "" || aktif.id !== SUB_TAB_GADAI[0].id ? " · filter aktif" : ""}
          </p>
          {filteredPawns.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-8 text-center text-sm text-muted-foreground">
              {search.trim()
                ? "Tidak ada pengajuan yang cocok dengan pencarian."
                : `Tidak ada pengajuan gadai pada sub-tab ${aktif.label}.`}
            </p>
          ) : (
            <TabelAntrean
              keterangan={`Antrean gadai, ${filteredPawns.length} pengajuan`}
              judulNominal="Nominal"
              judulKeperluan="Barang & tanggal"
              baris={filteredPawns.map((p) => ({
                referensi: p.nomorReferensi,
                nama: namaHurufBesar(p.namaLengkap),
                email: p.emailPeminjam,
                nominal: p.pokokGadai ?? p.nilaiTaksiran ?? null,
                keperluan: `${p.deskripsiBarang} · ${p.kategori}`,
                waktu: p._creationTime,
                status: <StatusBadge status={p.status} kind="pawn" />,
                aksi:
                  p.status === "diajukan" || p.status === "sedang_dinilai"
                    ? "Proses"
                    : "Detail",
                onOpen: () => onOpen(p),
              }))}
            />
          )}
        </div>
      )}
      <GadaiDanaPanel pawns={pawns} />
    </>
  );
}
