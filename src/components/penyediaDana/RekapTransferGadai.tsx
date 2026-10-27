import { Coins, Download, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { FOLIO } from "@/components/penyediaDana/folio";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { unduhLewatAplikasi } from "@/lib/jembatanAndroid";
import {
  keCsvTransfer,
  labelMetodeTransfer,
  labelStatusTransfer,
  type BarisTransferLaporan,
} from "@/lib/laporanTransfer";
import {
  keCsvBelumTransferGadai,
  namaBerkasTransferGadai,
  type BarisBelumTransferGadai,
} from "@/lib/laporanTransferGadai";
import { formatRupiahAman } from "@/lib/money";
import { labelRentang, potongHalaman } from "@/lib/paginasi";

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

/** Lencana status: tulisannya berdiri sendiri, warna hanya penguat. */
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

/** Satu angka ringkas dengan keterangan satu baris. */
function Angka({
  label,
  nilai,
  jumlah,
  keterangan,
  warna,
}: {
  label: string;
  nilai: number;
  jumlah: number;
  keterangan: string;
  warna: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
        {label}
      </p>
      <p className={`mt-2 text-lg font-semibold tabular-nums ${warna}`}>
        {rupiah(nilai)}
      </p>
      <p className="text-xs tabular-nums text-muted-foreground">
        {jumlah} pembayaran
      </p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        {keterangan}
      </p>
    </div>
  );
}

/**
 * Unduh CSV sebagai berkas. Berdiri di luar komponen karena memakai jam unduhan;
 * membaca jam di dalam badan komponen melanggar aturan `react-hooks/purity`.
 */
async function unduhCsv(isi: string, nama: string): Promise<void> {
  const blob = new Blob([isi], { type: "text/csv;charset=utf-8" });
  // Di aplikasi Android, unduhan blob: tidak ditangani WebView.
  if (await unduhLewatAplikasi(nama, "text/csv", blob)) return;
  const url = URL.createObjectURL(blob);
  const tautan = document.createElement("a");
  tautan.href = url;
  tautan.download = nama;
  tautan.rel = "noopener";
  document.body.appendChild(tautan);
  tautan.click();
  tautan.remove();
  // Pencabutan di tick yang sama membuat sebagian peramban membatalkan unduhan.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Rekap transfer hak pendana GADAI di ruang pendana.
 *
 * Menjawab dua pertanyaan: catatan transfer mana yang sudah dibuat admin untuk
 * pembayaran gadai, dan pembayaran gadai mana yang porsinya masih menunggu
 * catatan. Keduanya bisa diunduh sebagai CSV; isinya sama persis dengan baris
 * yang terlihat di layar.
 *
 * Murni presentasional supaya bisa dirender uji markup tanpa Convex.
 */
export function RekapTransferGadai({
  rows,
  belum,
  ringkasan,
  terpotong,
  belumTerpotong,
}: {
  rows: readonly BarisTransferLaporan[];
  belum: readonly BarisBelumTransferGadai[];
  ringkasan: {
    jumlahTercatat: number;
    nilaiTercatat: number;
    jumlahDibatalkan: number;
    nilaiDibatalkan: number;
    jumlahBelumDicatat: number;
    nilaiBelumDicatat: number;
  };
  terpotong: boolean;
  belumTerpotong: boolean;
}) {
  const [halaman, setHalaman] = useState(0);
  const potongan = potongHalaman(rows, halaman);

  function unduhCatatan() {
    try {
      if (rows.length === 0) {
        toast.info("Belum ada catatan transfer gadai untuk diekspor.");
        return;
      }
      void unduhCsv(
        `\uFEFF${keCsvTransfer(rows)}`,
        namaBerkasTransferGadai(Date.now()),
      );
      toast.success(`${rows.length} catatan transfer gadai diekspor ke CSV.`);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Gagal mengekspor catatan transfer gadai.",
      );
    }
  }

  function unduhAntrean() {
    try {
      if (belum.length === 0) {
        toast.info(
          "Tidak ada pembayaran gadai yang menunggu catatan transfer.",
        );
        return;
      }
      void unduhCsv(
        `\uFEFF${keCsvBelumTransferGadai(belum)}`,
        namaBerkasTransferGadai(Date.now()),
      );
      toast.success(
        `${belum.length} pembayaran gadai yang belum dicatat diekspor.`,
      );
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Gagal mengekspor antrean transfer gadai.",
      );
    }
  }

  const kosong = rows.length === 0 && belum.length === 0;

  return (
    <section
      aria-label="Rekap transfer hak pendana gadai"
      className={`${FOLIO.kertas} mt-4 border-t-2 border-t-gold/60`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
            <Coins className="size-3.5 text-emerald-700" aria-hidden />
            Transfer hak pendana gadai
          </p>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
            Catatan admin bahwa porsi pendana atas pembayaran gadai sudah
            ditransfer di luar sistem — bukan bukti mutasi bank dan bukan
            jaminan atas dana. PINDAI adalah pencatat.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={unduhCatatan}
            disabled={rows.length === 0}
          >
            <Download className="mr-1.5 size-3.5" aria-hidden /> Unduh catatan
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={unduhAntrean}
            disabled={belum.length === 0}
          >
            <Download className="mr-1.5 size-3.5" aria-hidden /> Unduh antrean
          </Button>
        </div>
      </div>

      <div className="grid gap-3 px-4 py-3 sm:grid-cols-3">
        <Angka
          label="Sudah dicatat"
          nilai={ringkasan.nilaiTercatat}
          jumlah={ringkasan.jumlahTercatat}
          keterangan="Catatan admin yang masih berlaku."
          warna="text-emerald-800"
        />
        <Angka
          label="Dibatalkan"
          nilai={ringkasan.nilaiDibatalkan}
          jumlah={ringkasan.jumlahDibatalkan}
          keterangan="Salah catat, ditandai batal. Uang tidak dikembalikan."
          warna="text-slate-700"
        />
        <Angka
          label="Belum dicatat"
          nilai={ringkasan.nilaiBelumDicatat}
          jumlah={ringkasan.jumlahBelumDicatat}
          keterangan="Porsi pendana menunggu catatan admin."
          warna="text-amber-800"
        />
      </div>

      {kosong ? (
        <p className="border-t border-slate-200 px-4 py-6 text-center text-xs leading-6 text-muted-foreground">
          Belum ada pembayaran gadai berpendana atas nama Anda. Kewajiban
          transfer muncul di sini setelah admin mencatat pembayaran gadai yang
          porsi pendananya lebih dari nol.
        </p>
      ) : (
        <>
          {belum.length > 0 && (
            <div className="border-t border-slate-200 px-4 py-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-navy">
                <TriangleAlert
                  className="size-3.5 shrink-0 text-amber-700"
                  aria-hidden
                />
                Menunggu catatan transfer ({belum.length})
              </p>
              <ul className="mt-2 divide-y divide-slate-100">
                {belum.map((b) => (
                  <li
                    key={b.paymentId}
                    className="flex flex-wrap items-baseline justify-between gap-2 py-1.5 text-xs"
                  >
                    <span className="tabular-nums text-slate-600">
                      {b.referensi} · dibayar {tanggal(b.waktu)}
                    </span>
                    <span className="shrink-0 font-medium tabular-nums text-amber-900">
                      {rupiah(b.jumlah)}
                    </span>
                  </li>
                ))}
              </ul>
              {belumTerpotong && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Daftar antrean dipotong; unduhan memuat baris yang sama dengan
                  daftar ini.
                </p>
              )}
            </div>
          )}

          {rows.length > 0 && (
            <div className="border-t border-slate-200 px-4 py-3">
              <Table>
                <TableCaption className="caption-top pb-2 text-left text-xs text-muted-foreground">
                  Riwayat catatan transfer gadai ·{" "}
                  {labelRentang(potongan, rows.length)}
                </TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[120px]">Tanggal</TableHead>
                    <TableHead>Gadai</TableHead>
                    <TableHead>Metode / referensi</TableHead>
                    <TableHead className="text-right">Nominal</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {potongan.baris.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-xs tabular-nums text-slate-600">
                        {tanggal(r.dicatatPada)}
                      </TableCell>
                      <TableCell className="text-xs">
                        <span className="tabular-nums text-slate-700">
                          {r.nomorReferensi}
                        </span>
                        {r.alasanBatal !== null && (
                          <span className="mt-0.5 block text-xs text-slate-500">
                            Batal: {r.alasanBatal}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {labelMetodeTransfer(r.metode)}
                        {r.referensi !== null && (
                          <span className="mt-0.5 block tabular-nums text-slate-500">
                            {r.referensi}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-xs font-medium tabular-nums">
                        {rupiah(r.jumlah)}
                      </TableCell>
                      <TableCell>
                        <LencanaStatus status={r.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {terpotong
                    ? "Daftar dipotong pada batas tampilan; angka di atas memuat seluruh catatan."
                    : "Seluruh catatan transfer gadai atas nama Anda."}
                </p>
                {potongan.totalHalaman > 1 && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      disabled={potongan.halaman === 0}
                      onClick={() => setHalaman((h) => Math.max(0, h - 1))}
                    >
                      Sebelumnya
                    </Button>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {potongan.halaman + 1} / {potongan.totalHalaman}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      disabled={potongan.halaman >= potongan.totalHalaman - 1}
                      onClick={() => setHalaman((h) => h + 1)}
                    >
                      Berikutnya
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
