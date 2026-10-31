import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, Search, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

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
import { formatRupiah } from "@/lib/money";
import { cn } from "@/lib/utils";

import { formatDate } from "./admin-format";

/** Satu baris antrean konvensional — pinjaman, gadai, dan kredit barang. */
export type BarisAntrean = {
  id: string;
  nama: string;
  email: string | null;
  referensi: string;
  /** null = nominal belum tercatat (mis. gadai yang belum ditaksir). */
  nominal: number | null;
  keperluan: string;
  waktu: number;
  /** Umur tunggu dalam jam; null bila waktu acuan server tidak tersedia. */
  umurJam?: number | null;
  /** Label umur tunggu siap tampil, mis. "Menunggu 6 jam". */
  labelUmur?: string | null;
  /** Teks status untuk pengurutan; lencananya tetap `status`. */
  statusTeks: string;
  /** Lencana tambahan di samping status (mis. Cair ekspres). */
  lencana?: ReactNode;
  status: ReactNode;
  /** Sel aksi siap pakai — tiap modul punya aksi yang berbeda. */
  aksi: ReactNode;
};

export type KunciUrutAntrean =
  | "nama"
  | "referensi"
  | "nominal"
  | "waktu"
  | "keperluan"
  | "status";
export type ArahUrutAntrean = "naik" | "turun";

/** Pembanding murni, diekspor supaya urutannya bisa diuji tanpa DOM. */
export function urutkanBarisAntrean(
  baris: readonly BarisAntrean[],
  kunci: KunciUrutAntrean,
  arah: ArahUrutAntrean,
): BarisAntrean[] {
  const arahNilai = arah === "naik" ? 1 : -1;
  return [...baris].sort((a, b) => {
    if (kunci === "nominal") {
      // Baris tanpa nominal selalu di bawah, apa pun arahnya.
      if (a.nominal === null && b.nominal === null) return 0;
      if (a.nominal === null) return 1;
      if (b.nominal === null) return -1;
      return (a.nominal - b.nominal) * arahNilai;
    }
    if (kunci === "waktu") return (a.waktu - b.waktu) * arahNilai;
    const teksA =
      kunci === "nama"
        ? a.nama
        : kunci === "referensi"
          ? a.referensi
          : kunci === "status"
            ? a.statusTeks
            : a.keperluan;
    const teksB =
      kunci === "nama"
        ? b.nama
        : kunci === "referensi"
          ? b.referensi
          : kunci === "status"
            ? b.statusTeks
            : b.keperluan;
    return teksA.localeCompare(teksB, "id", { sensitivity: "base" }) * arahNilai;
  });
}

/** Pencarian antrean dengan tombol hapus — satu bentuk untuk tiga produk. */
export function PencarianCepat({
  value,
  onChange,
  placeholder,
  ariaLabel,
  className,
}: {
  value: string;
  onChange: (nilai: string) => void;
  placeholder: string;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div role="search" className={cn("relative min-w-0", className)}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="pl-9 pr-12"
      />
      {value !== "" && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Hapus pencarian"
          className="absolute right-0.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/** Tombol aksi baris dengan bentuk yang sama di ketiga antrean. */
export function TombolAksiAntrean({
  label,
  onClick,
  utama = false,
  ariaLabel,
}: {
  label: string;
  onClick: () => void;
  /** Aksi yang menunggu keputusan admin — hijau, bukan abu netral. */
  utama?: boolean;
  ariaLabel?: string;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={utama ? "default" : "outline"}
      onClick={onClick}
      aria-label={ariaLabel ?? label}
      className={
        utama
          ? "h-8 gap-1 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
          : "h-8 gap-1 rounded-lg px-3 text-xs font-semibold"
      }
    >
      {label}
      <ChevronRight className="size-3.5" aria-hidden="true" />
    </Button>
  );
}

/**
 * Tabel antrean konvensional.
 *
 * Satu baris teks panjang ("nama · email · referensi · pokok · keperluan")
 * memaksa admin memindai satu kalimat untuk setiap pengajuan. Di sini tiap
 * fakta punya kolomnya sendiri, kepala kolom bisa diurutkan, dan status berupa
 * pil. Di layar sempit kolom pendukung disembunyikan dan status turun ke bawah
 * nama, sehingga tidak ada gulir mendatar yang menghilangkan konteks baris.
 */
export function TabelAntrean({
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
  const [urut, setUrut] = useState<{
    kunci: KunciUrutAntrean;
    arah: ArahUrutAntrean;
  } | null>(null);
  const tampil = useMemo(
    () => (urut === null ? baris : urutkanBarisAntrean(baris, urut.kunci, urut.arah)),
    [baris, urut],
  );

  const ubahUrut = (kunci: KunciUrutAntrean) => {
    setUrut((sebelumnya) =>
      sebelumnya?.kunci === kunci
        ? { kunci, arah: sebelumnya.arah === "naik" ? "turun" : "naik" }
        : { kunci, arah: "naik" },
    );
  };

  const kepala = (
    label: string,
    kunci: KunciUrutAntrean,
    kelas: string,
    kanan = false,
  ) => {
    const aktif = urut?.kunci === kunci;
    const arah = urut?.arah;
    const Ikon = !aktif ? ArrowUpDown : arah === "turun" ? ArrowDown : ArrowUp;
    return (
      <TableHead
        aria-sort={aktif ? (arah === "turun" ? "descending" : "ascending") : "none"}
        className={cn(
          "h-11 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500",
          kanan && "text-right",
          kelas,
        )}
      >
        <button
          type="button"
          onClick={() => ubahUrut(kunci)}
          className={cn(
            "inline-flex items-center gap-1 rounded-sm transition-colors hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1",
            kanan && "w-full justify-end",
          )}
          aria-label={`Urutkan berdasarkan ${label}`}
        >
          {label}
          <Ikon
            className={cn("size-3 shrink-0", aktif ? "text-slate-700" : "text-slate-400")}
            aria-hidden="true"
          />
        </button>
      </TableHead>
    );
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <Table containerClassName="overflow-x-auto">
        <TableCaption className="sr-only">{keterangan}</TableCaption>
        <TableHeader className="bg-slate-50/80">
          <TableRow className="border-slate-200 hover:bg-transparent">
            {kepala("Nasabah", "nama", "pl-4 pr-2")}
            {kepala("ID Transaksi", "referensi", "hidden md:table-cell")}
            {kepala(judulNominal, "nominal", "text-right", true)}
            {kepala(judulKeperluan, "keperluan", "hidden lg:table-cell")}
            {kepala("Status", "status", "hidden sm:table-cell")}
            <TableHead className="h-11 pl-3 pr-4 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Aksi
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tampil.map((b) => {
            const lencana = (
              <>
                {b.lencana}
                {b.status}
              </>
            );
            return (
              <TableRow
                key={b.id}
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
                <TableCell className="hidden max-w-[240px] px-3 py-3 align-middle lg:table-cell">
                  <p className="truncate text-xs font-medium text-slate-700">{b.keperluan}</p>
                  <p className="mt-0.5 text-[11px] tabular-nums text-slate-500">
                    {formatDate(b.waktu)}
                    {b.labelUmur ? (
                      <span
                        className={
                          (b.umurJam ?? 0) >= 48
                            ? "font-medium text-amber-700"
                            : undefined
                        }
                      >
                        {" · "}
                        {b.labelUmur}
                      </span>
                    ) : null}
                  </p>
                </TableCell>
                <TableCell className="hidden px-3 py-3 align-middle sm:table-cell">
                  <div className="flex flex-wrap items-center gap-1 [&>span]:rounded-full">
                    {lencana}
                  </div>
                </TableCell>
                <TableCell className="py-3 pl-3 pr-4 text-right align-middle">{b.aksi}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </section>
  );
}
