import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";

import { PembayaranPinjamanDialog } from "@/components/PembayaranPinjamanDialog";
import { PermohonanRestrukturisasi } from "@/components/PermohonanRestrukturisasi";
import { StatusBadge } from "@/components/StatusBadge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SkeletonDetail } from "@/components/ui/loading";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CheckCircle2, MessageCircle, ReceiptText } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  HAK_CIPTA_PINDAI,
  NAMA_ENTITAS_PINDAI,
  PENERBIT_KUITANSI,
  PENAFIAN_PINDAI,
} from "@/lib/branding";
import type { SimulasiBulanan } from "@/lib/bulanan";
import { urlChatCs } from "@/lib/kontak";
import { loanPurposeLabel, loanStatusMeta, type LoanQuote } from "@/lib/loan";
import { formatRupiah } from "@/lib/money";
import { LABEL_MODE_PEMBAYARAN } from "@/lib/perpanjanganPinjaman";
import { pawnStatusMeta, type PawnStatus } from "@/lib/pawn";
import { formatTanggalWIB, formatWaktuWIB, kodeTanggalWIB } from "@/lib/waktu";

import { formatDate } from "./shared";

type BarisRincian = [label: string, nilai: string, nada?: "tebal" | "net"];

/** Field pinjaman yang dibutuhkan rincian biaya (bentuknya dari `getMyLoan`). */
type RincianPinjamanInput = {
  tujuan: string;
  pokokPinjaman: number;
  tenorBulan: number | null;
  totalKewajiban: number;
  quote: LoanQuote;
  simulasiBulanan: SimulasiBulanan | null;
};

/**
 * Rincian biaya pinjaman dalam kelompok yang BISA DIJUMLAHKAN sendiri.
 *
 * - "Yang harus Anda bayar": pokok + bunga + biaya admin cicilan (setiap
 *   cicilan bulanan) = total. Baris bunga inilah yang dulu tidak pernah ditampilkan,
 *   sehingga daftarnya tampak kurang dari totalnya.
 * - "Potongan di muka": biaya admin 2% dan platform 0% yang dipotong dari dana
 *   yang Anda terima tidak menambah total kewajiban, jadi dipisah.
 *
 * Angka tidak dihitung ulang di sini: semuanya dibaca dari hasil server
 * (`quote` / `simulasiBulanan`), termasuk baris penyeimbang untuk data lama.
 */
function RincianPinjaman({ loan, final }: { loan: RincianPinjamanInput; final: boolean }) {
  const bulanan = loan.tenorBulan !== null;
  // Tenor 3/6 memakai nama "biaya admin" di muka; tenor 1 memakai "biaya
  // layanan". Keduanya sama-sama membayar admin cicilan di setiap angsuran.
  const tenorAdminCicilan = loan.tenorBulan === 3 || loan.tenorBulan === 6;

  const pengajuan: BarisRincian[] = [["Keperluan", loanPurposeLabel(loan.tujuan)]];
  if (bulanan) pengajuan.push(["Tenor pengajuan", `${loan.tenorBulan} bulan`]);

  const bayar: BarisRincian[] = [["Pokok pinjaman", formatRupiah(loan.pokokPinjaman)]];
  const potongan: BarisRincian[] = [];

  if (bulanan) {
    if (loan.simulasiBulanan !== null) {
      bayar.push(["Bunga selama tenor", formatRupiah(loan.simulasiBulanan.bungaTotal)]);
      bayar.push([
        "Biaya admin cicilan (2% per bayar)",
        formatRupiah(loan.simulasiBulanan.biayaAdminCicilanTotal),
      ]);
      if (tenorAdminCicilan) {
        potongan.push(
          ["Biaya admin (2%, dipotong di muka)", formatRupiah(loan.simulasiBulanan.biayaAdminTotal)],
          ["Biaya platform (0%)", formatRupiah(loan.simulasiBulanan.biayaPlatformTotal)],
        );
      } else {
        potongan.push([
          "Biaya layanan (2%, dipotong di muka)",
          formatRupiah(loan.simulasiBulanan.biayaLayananTotal),
        ]);
      }
      potongan.push([
        "Dana bersih yang Anda terima (belum dicairkan)",
        formatRupiah(loan.simulasiBulanan.danaDiterima),
        "net",
      ]);
    } else if (loan.totalKewajiban > loan.pokokPinjaman) {
      // Pinjaman lama tanpa simulasi tersimpan: sisanya ditampilkan sebagai satu
      // baris gabungan supaya total tetap bisa dijumlahkan dari baris di atasnya.
      bayar.push([
        "Bunga & biaya selama tenor",
        formatRupiah(loan.totalKewajiban - loan.pokokPinjaman),
      ]);
    }
    bayar.push([
      `Total yang harus dibayar (${loan.tenorBulan} bulan)`,
      formatRupiah(loan.totalKewajiban),
      "tebal",
    ]);
  } else {
    bayar.push(["Bunga pinjaman", formatRupiah(loan.quote.bunga)]);
    bayar.push(["Total yang harus dibayar", formatRupiah(loan.quote.totalKewajibanPelunasan), "tebal"]);
    potongan.push(
      ["Biaya admin (2%, dipotong di muka)", formatRupiah(loan.quote.biayaAdmin)],
      ["Biaya platform (0%)", formatRupiah(loan.quote.biayaPlatform)],
      ["Biaya pencairan ekspres", formatRupiah(loan.quote.biayaExpress)],
      [
        "Dana bersih yang Anda terima (belum ditransfer)",
        formatRupiah(loan.quote.danaBersihDitransfer),
        "net",
      ],
    );
  }

  const kelompok: { judul: string; baris: BarisRincian[] }[] = [
    { judul: "Pengajuan", baris: pengajuan },
    { judul: final ? "Yang harus Anda bayar" : "Perkiraan yang harus Anda bayar", baris: bayar },
  ];
  if (potongan.length > 0) {
    kelompok.push({
      judul: final ? "Potongan di muka" : "Perkiraan potongan di muka",
      baris: potongan,
    });
  }

  return (
    <div className="space-y-3">
      {kelompok.map((k) => (
        <div key={k.judul} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <p className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
            {k.judul}
          </p>
          <dl className="divide-y divide-slate-200">
            {k.baris.map(([label, nilai, nada]) => (
              <div
                key={label}
                className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
              >
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd
                  className={`text-sm tabular-nums sm:text-right ${
                    nada === "tebal" ? "font-semibold" : nada === "net" ? "font-semibold text-emerald-700" : ""
                  }`}
                >
                  {nilai}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}

type KuitansiRow = FunctionReturnType<typeof api.loans.myLoanReceipts>[number];

/** Nomor kuitansi dari tanggal pembayaran + ekor referensi bukti (unik). */
function nomorKuitansi(row: KuitansiRow): string {
  const waktu = row.dicocokkanPada ?? row.tanggalTransfer;
  const ekor = row.nomorReferensi.replace(/[^A-Za-z0-9]/g, "").slice(-4).toUpperCase();
  return `TRX-${kodeTanggalWIB(waktu)}-${ekor}`;
}

function metodeBayar(metode: KuitansiRow["metodePembayaran"]): string {
  return metode === "qris" ? "QRIS" : "Bank Transfer";
}

/**
 * Daftar kuitansi pembayaran yang sudah dicocokkan admin. Hanya muncul bila
 * ada pembayaran tingkat pinjaman yang tercatat.
 */
function KuitansiPinjaman({
  rows,
  onBuka,
}: {
  rows: KuitansiRow[];
  onBuka: (id: KuitansiRow["_id"]) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby="judul-kuitansi-pinjaman">
      <h3
        id="judul-kuitansi-pinjaman"
        className="flex items-center gap-2 text-sm font-semibold text-slate-900"
      >
        <ReceiptText className="size-4 text-emerald-700" aria-hidden />
        Kuitansi pembayaran
      </h3>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        Bukti elektronik untuk setiap pembayaran yang sudah dicocokkan admin.
      </p>
      <ul className="mt-2 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {rows.map((row) => (
          <li key={row._id}>
            <button
              type="button"
              onClick={() => onBuka(row._id)}
              className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-800"
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold tabular-nums text-slate-900">
                  {LABEL_MODE_PEMBAYARAN[row.paymentType]} · {formatRupiah(row.jumlah)}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {nomorKuitansi(row)} · {formatTanggalWIB(row.dicocokkanPada ?? row.tanggalTransfer)}
                </span>
              </span>
              <span className="flex items-center gap-1 text-xs font-medium text-emerald-800">
                <CheckCircle2 className="size-3.5" aria-hidden />
                Lihat kuitansi
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Modal kuitansi elektronik satu pembayaran. Seluruh angka berasal dari
 * snapshot rencana yang dihitung server saat bukti dikirim dan dicocokkan
 * admin — tidak dihitung ulang di layar.
 */
function KuitansiPembayaranDialog({
  row,
  onClose,
}: {
  row: KuitansiRow | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={row !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto p-0 sm:max-w-lg">
        {row !== null && (
          <div className="text-slate-900">
            <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 bg-emerald-800 px-4 py-4 text-white sm:px-5">
              <div>
                <p className="text-lg font-bold tracking-tight">PINDAI</p>
                <p className="text-[11px] text-emerald-100">Kuitansi pembayaran elektronik</p>
                <p className="mt-1 text-[10px] leading-4 text-emerald-100/90">
                  {PENERBIT_KUITANSI}
                </p>
              </div>
              <div className="text-left sm:text-right">
                <p className="text-[10px] uppercase tracking-[0.14em] text-emerald-100">
                  Nomor referensi
                </p>
                <p className="text-sm font-semibold tabular-nums">{nomorKuitansi(row)}</p>
              </div>
            </header>

            <div className="space-y-4 px-4 py-4 sm:px-5">
              <p className="text-xs text-muted-foreground">
                Waktu pembayaran:{" "}
                <strong className="font-semibold text-slate-800">
                  {formatWaktuWIB(row.dicocokkanPada ?? row.tanggalTransfer)} WIB
                </strong>
                {row.referensiMutasi !== null ? ` · Mutasi ${row.referensiMutasi}` : ""}
              </p>

              <dl className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white text-sm">
                <BarisKuitansi label="Jenis aksi" nilai={LABEL_MODE_PEMBAYARAN[row.paymentType]} />
                <BarisKuitansi
                  label="Pokok dibayar"
                  nilai={formatRupiah(row.rencana.principalPaid)}
                />
                <BarisKuitansi
                  label="Bunga dibayar"
                  nilai={formatRupiah(row.rencana.interestDue)}
                />
                <BarisKuitansi label="Denda" nilai={formatRupiah(row.rencana.lateFee)} />
                <BarisKuitansi label="Total bayar" nilai={formatRupiah(row.jumlah)} tebal />
                <BarisKuitansi label="Metode" nilai={metodeBayar(row.metodePembayaran)} />
              </dl>

              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-900">
                  Status sisa kewajiban
                </p>
                <dl className="mt-2 space-y-1.5 text-sm">
                  <BarisKuitansi
                    label="Sisa pokok baru"
                    nilai={formatRupiah(row.rencana.principalSesudah)}
                    tebal
                  />
                  <BarisKuitansi
                    label="Jatuh tempo berikutnya"
                    nilai={
                      row.rencana.nextDueDate === null
                        ? "Pinjaman lunas"
                        : formatTanggalWIB(row.rencana.nextDueDate)
                    }
                  />
                  <BarisKuitansi
                    label="Suku bunga"
                    nilai={`${row.rencana.tierRate}%`}
                  />
                  <BarisKuitansi
                    label="Estimasi bunga periode berikutnya"
                    nilai={
                      row.rencana.nextDueDate === null
                        ? "—"
                        : formatRupiah(row.rencana.nextInterestAmount)
                    }
                  />
                </dl>
              </div>

              <p className="text-[11px] leading-5 text-slate-500">
                Kuitansi ini sah sebagai bukti pembayaran elektronik PINDAI setelah bukti
                transfer dicocokkan dengan mutasi bank. Simpan nomor referensi ini untuk
                keperluan verifikasi. Kuitansi tidak dapat dipindahtangankan dan bukan
                bukti kepemilikan akun.
              </p>
              <p className="border-t border-slate-100 pt-3 text-[10px] leading-4 text-slate-500">
                Diterbitkan oleh {NAMA_ENTITAS_PINDAI}. {PENAFIAN_PINDAI}
              </p>
            </div>

            <footer className="flex flex-col gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-end sm:px-5">
              <p className="mr-auto text-[10px] leading-4 text-slate-500">
                {HAK_CIPTA_PINDAI}
              </p>
              <Button type="button" variant="outline" className="h-10" onClick={() => window.print()}>
                Cetak kuitansi
              </Button>
              <Button type="button" className="h-10 bg-emerald-800 text-white hover:bg-emerald-900" onClick={onClose}>
                Tutup
              </Button>
            </footer>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function BarisKuitansi({
  label,
  nilai,
  tebal = false,
}: {
  label: string;
  nilai: string;
  tebal?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`tabular-nums ${tebal ? "font-semibold text-slate-900" : "text-slate-800"}`}>
        {nilai}
      </dd>
    </div>
  );
}

/** Dialog rincian pinjaman + aksi pelunasan. */
export function LoanDetailDialog({
  loanId,
  onClose,
  onMintaVerifikasi,
}: {
  loanId: Id<"loans"> | null;
  onClose: () => void;
  onMintaVerifikasi: () => void;
}) {
  const loan = useQuery(api.loans.getMyLoan, loanId ? { loanId } : "skip");
  const kuitansi = useQuery(
    api.loans.myLoanReceipts,
    loanId ? { loanId } : "skip",
  );
  const [bayarTerbuka, setBayarTerbuka] = useState(false);
  const [kuitansiId, setKuitansiId] = useState<Id<"manualPaymentReceipts"> | null>(null);
  const kuitansiTerpilih = (kuitansi ?? []).find((row) => row._id === kuitansiId) ?? null;
  // Angka baru FINAL setelah pinjaman benar-benar dicairkan; sebelum itu semua
  // nominal masih perkiraan dan labelnya menyebut itu apa adanya.
  const angkaFinal = loan?.status === "didanai" || loan?.status === "lunas";

  return (
    <>
    <Dialog
      open={loanId !== null}
      onOpenChange={(open) => {
        if (!open) {
          setBayarTerbuka(false);
          setKuitansiId(null);
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto p-4 sm:max-w-md sm:p-6">
        {loan === undefined ? (
          /* Rangka rincian, bukan spinner: kepala dialog, baris `dl`, dan blok
             pelunasan sudah menempati ruang yang sama dengan isi sungguhannya,
             jadi isi tidak "melompat" saat menggantikannya. */
          <SkeletonDetail keterangan="Memuat rincian pinjaman…" />
        ) : loan === null ? (
          <DialogHeader>
            <DialogTitle>Pengajuan tidak ditemukan</DialogTitle>
            <DialogDescription>Data ini mungkin bukan milik akun Anda.</DialogDescription>
          </DialogHeader>
        ) : (
          <div className="animate-masuk flex flex-col gap-4">
            <DialogHeader>
              <div className="flex items-center justify-between gap-3">
                <DialogTitle>Rincian pengajuan pinjaman tunai</DialogTitle>
                <StatusBadge status={loan.status} kind="loan" />
              </div>
              <DialogDescription className="tabular-nums">
                {loan.nomorReferensi} · {formatDate(loan._creationTime)}
              </DialogDescription>
            </DialogHeader>

            <p className="text-sm leading-6 text-muted-foreground">
              {loanStatusMeta(loan.status).description}
            </p>

            <RincianPinjaman loan={loan} final={angkaFinal} />

            {loan.catatanReview && (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-medium text-muted-foreground">Catatan review</p>
                <p className="mt-1 text-sm">{loan.catatanReview}</p>
              </div>
            )}

            {loan.status === "didanai" && <PermohonanRestrukturisasi loanId={loan._id} />}

            {loan.status === "didanai" && loan.pelunasan && (
              <div
                className={`rounded-2xl border p-4 ${
                  loan.pelunasan.hariTerlambat > 0 ? "border-red-200 bg-red-50/60" : "border-slate-200"
                }`}
              >
                <p className="text-sm font-semibold text-slate-900">Informasi pelunasan</p>
                <dl className="mt-3 space-y-1.5 text-sm">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                    <dt className="text-muted-foreground">Jatuh tempo</dt>
                    <dd className="tabular-nums">{formatDate(loan.pelunasan.jatuhTempoPada)}</dd>
                  </div>
                  {loan.pelunasan.hariTerlambat > 0 ? (
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                      <dt className="text-red-600">Terlambat {loan.pelunasan.hariTerlambat} hari</dt>
                      <dd className="tabular-nums text-red-600">+{formatRupiah(loan.pelunasan.dendaTerlambat)}</dd>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                      <dt className="text-muted-foreground">Sisa waktu</dt>
                      <dd className="tabular-nums">
                        {loan.pelunasan.sisaHari === 0
                          ? "Hari ini"
                          : `${loan.pelunasan.sisaHari} hari lagi`}
                      </dd>
                    </div>
                  )}
                </dl>
                <p className="mt-3 text-xs leading-5 text-slate-600">
                  Pilih bayar bunga saja, cicil pokok, atau pelunasan total. Nominal
                  akhirnya dihitung server; status pinjaman berubah setelah admin
                  mencocokkan bukti transfer dengan mutasi bank.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {loan.tenorBulan === null && (
                    <Button
                      size="sm"
                      className="gap-1.5 bg-emerald-800 text-white hover:bg-emerald-900"
                      onClick={() => setBayarTerbuka(true)}
                    >
                      Atur pembayaran
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={onMintaVerifikasi}>
                    Verifikasi tagihan
                  </Button>
                  <Button asChild variant="outline" size="sm" className="gap-1.5">
                    <a
                      href={urlChatCs(
                        "Halo CS PINDAI, saya ingin bertanya tentang pelunasan pinjaman saya.",
                      )}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <MessageCircle className="size-3.5" aria-hidden /> Hubungi CS
                    </a>
                  </Button>
                </div>
              </div>
            )}

            <KuitansiPinjaman rows={kuitansi ?? []} onBuka={setKuitansiId} />

            {/* Footer lengket: jalan keluar selalu terlihat tanpa menggulir balik
                ke atas, dan di ponsel tombolnya selebar dialog. Aksi pembayaran
                tinggal di blok pelunasan supaya satu jalur tidak punya dua
                tombol yang bersaing. */}
            <div className="sticky bottom-0 -mx-4 -mb-4 flex flex-col gap-2 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:-mb-6 sm:px-6">
              <Button variant="outline" className="h-11 w-full" onClick={onClose}>
                Tutup
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
    <PembayaranPinjamanDialog
      key={bayarTerbuka ? loan?._id ?? "pinjaman" : "tutup"}
      loan={bayarTerbuka ? loan ?? null : null}
      onClose={() => setBayarTerbuka(false)}
    />
    <KuitansiPembayaranDialog
      row={kuitansiTerpilih}
      onClose={() => setKuitansiId(null)}
    />
    </>
  );
}

/** Dialog rincian status gadai internal; tidak mengajukan atau mengonfirmasi pelepasan fisik. */
export function PawnDetailDialog({
  pawnId,
  onClose,
}: {
  pawnId: Id<"pawns"> | null;
  onClose: () => void;
}) {
  const pawn = useQuery(api.loans.getMyPawn, pawnId ? { pawnId } : "skip");

  return (
    <Dialog open={pawnId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto p-4 sm:max-w-md sm:p-6">
        {pawn === undefined ? (
          <SkeletonDetail baris={4} keterangan="Memuat rincian gadai…" />
        ) : pawn === null ? (
          <DialogHeader>
            <DialogTitle>Pengajuan tidak ditemukan</DialogTitle>
            <DialogDescription>Data ini mungkin bukan milik akun Anda.</DialogDescription>
          </DialogHeader>
        ) : (
          <div className="animate-masuk flex flex-col gap-4">
            <DialogHeader>
              <div className="flex items-center justify-between gap-3">
                <DialogTitle className="max-w-64 text-base leading-snug">{pawn.deskripsiBarang}</DialogTitle>
                <StatusBadge status={pawn.status} kind="pawn" />
              </div>
              <DialogDescription className="tabular-nums">
                Catatan gadai internal · {pawn.nomorReferensi} · {formatDate(pawn._creationTime)}
              </DialogDescription>
            </DialogHeader>

            <p className="text-sm leading-6 text-muted-foreground">
              {pawnStatusMeta(pawn.status as PawnStatus).description}
            </p>

            <dl className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
              {[
                ["Kategori yang dipilih", pawn.kategori],
                ["Alamat yang dilaporkan pemohon", pawn.alamatPenilaian],
                [
                  "Nilai taksiran internal",
                  pawn.nilaiTaksiran !== undefined
                    ? formatRupiah(pawn.nilaiTaksiran)
                    : "Menunggu catatan taksiran",
                ],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
                >
                  <dt className="text-sm text-muted-foreground">{label}</dt>
                  <dd className="break-words text-sm sm:text-right">{value}</dd>
                </div>
              ))}
            </dl>

            {pawn.catatanReview && (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-medium text-muted-foreground">Catatan internal penilaian</p>
                <p className="mt-1 text-sm">{pawn.catatanReview}</p>
              </div>
            )}

            <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
              Status ini mengikuti catatan PINDAI. Pembayaran gadai dan perubahan status terkait pelepasan dinonaktifkan.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
