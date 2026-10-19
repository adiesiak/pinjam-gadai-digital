import { useQuery } from "convex/react";

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
import { MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { SimulasiBulanan } from "@/lib/bulanan";
import { loanPurposeLabel, loanStatusMeta, type LoanQuote } from "@/lib/loan";
import { formatRupiah } from "@/lib/money";
import { pawnStatusMeta, type PawnStatus } from "@/lib/pawn";

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
 *   yang Anda terima — TIDAK menambah total kewajiban, jadi dipisah.
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
      [
        "Dana bersih yang Anda terima (98%, belum ditransfer)",
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
  // Angka baru FINAL setelah pinjaman benar-benar dicairkan; sebelum itu semua
  // nominal masih perkiraan dan labelnya menyebut itu apa adanya.
  const angkaFinal = loan?.status === "didanai" || loan?.status === "lunas";

  return (
    <Dialog open={loanId !== null} onOpenChange={(open) => !open && onClose()}>
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
                {/* Satu kalimat penjelas, hanya di sini: pembayaran memang di luar
                    aplikasi, jadi tidak ada tombol bayar maupun unggah bukti. */}
                <p className="mt-3 text-xs leading-5 text-slate-600">
                  Pembayaran dilakukan di luar aplikasi dan aplikasi ini hanya mencatat.
                  Status <span className="font-medium">Lunas</span> diperbarui oleh tim PINDAI
                  setelah pembayaran dicatat, bukan diubah dari sini.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={onMintaVerifikasi}>
                    Verifikasi tagihan
                  </Button>
                  <Button asChild variant="outline" size="sm" className="gap-1.5">
                    <a
                      href="https://wa.me/6281234567890?text=Halo%20CS%20PINDAI%2C%20saya%20ingin%20bertanya%20tentang%20pelunasan%20pinjaman%20saya."
                      target="_blank"
                      rel="noreferrer"
                    >
                      <MessageCircle className="size-3.5" aria-hidden /> Hubungi CS
                    </a>
                  </Button>
                </div>
              </div>
            )}

            {/* Footer lengket: jalan keluar selalu terlihat tanpa menggulir balik
                ke atas, dan di ponsel tombolnya selebar dialog. Tidak ada tombol
                "Lunasi sekarang" di sini karena pembayaran memang BELUM tersedia
                di aplikasi (lihat catatan di blok pelunasan di atas) — tombol
                bayar yang tidak bekerja akan menyesatkan. */}
            <div className="sticky bottom-0 -mx-4 -mb-4 flex flex-col gap-2 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:-mb-6 sm:px-6">
              <Button variant="outline" className="h-11 w-full" onClick={onClose}>
                Tutup
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
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
