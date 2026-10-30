import { useState } from "react";
import { FileText } from "lucide-react";

import { StatusBadge } from "@/components/StatusBadge";
import type { Id } from "@/convex/_generated/dataModel";
import { loanPurposeLabel } from "@/lib/loan";
import { formatRupiah } from "@/lib/money";
import { cn } from "@/lib/utils";

import { EmptyState } from "./empty-state";
import { formatDate } from "./shared";

type BarisPinjaman = {
  _id: Id<"loans">;
  _creationTime: number;
  nomorReferensi: string;
  pokokPinjaman: number;
  /** Nominal asli pengajuan — beda bila disetujui sebagian. */
  pokokDiajukan?: number;
  tujuan: string;
  status: string;
  /** Ada = skema bulanan; kosong = skema harian. Dipakai menyebut jenisnya. */
  tenorBulan?: number | null;
};

/**
 * Saringan status halaman Catatan Pinjaman.
 *
 * Hanya tiga, dan artinya dibaca dari status yang memang ada di catatan:
 * "Aktif" = pinjaman yang sudah disalurkan dan belum lunas, "Lunas" = status
 * lunas dari tim. Sisanya (menunggu, dibatalkan) tetap terlihat di "Semua" —
 * tidak ada saringan yang menyembunyikan catatan tanpa jalan kembali.
 */
const SARINGAN = [
  { nilai: "semua", label: "Semua" },
  { nilai: "aktif", label: "Aktif" },
  { nilai: "lunas", label: "Lunas" },
] as const;

type NilaiSaringan = (typeof SARINGAN)[number]["nilai"];

/** Nama jenis pinjaman dari tenor yang tersimpan. */
function jenisPinjaman(loan: BarisPinjaman): string {
  return loan.tenorBulan === null || loan.tenorBulan === undefined
    ? "Harian"
    : `Bulanan ${loan.tenorBulan} bulan`;
}

/**
 * Halaman "Catatan Pinjaman": daftar SEMUA pinjaman nasabah dengan saringan
 * status, satu baris per pinjaman. Rincian dibuka lewat dialog, jadi daftar ini
 * tetap pendek dan tidak mengulang angka yang sudah ada di Ringkasan.
 *
 * Halaman ini tidak memuat formulir pembayaran. Pinjaman harian membuka
 * pilihan bayar bunga/cicil pokok/pelunasan dari dialog rincian, lalu bukti
 * transfer dicocokkan admin sebelum state berubah.
 */
export function CatatanPinjamanSection({
  loans,
  onOpenLoan,
}: {
  loans: BarisPinjaman[];
  onOpenLoan: (id: Id<"loans">) => void;
}) {
  const [saringan, setSaringan] = useState<NilaiSaringan>("semua");

  const tampil = loans.filter((loan) => {
    if (saringan === "aktif") return loan.status === "didanai";
    if (saringan === "lunas") return loan.status === "lunas";
    return true;
  });

  return (
    <section className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">Catatan Pinjaman</h2>
        <span className="text-xs tabular-nums text-slate-500">
          {loans.length} catatan
        </span>
      </div>

      {/* Saringan status: tiga tombol, bukan dropdown, karena jumlahnya kecil dan
          pengguna membandingkannya sekilas. */}
      <div role="group" aria-label="Saring catatan pinjaman" className="mt-3 flex flex-wrap gap-2">
        {SARINGAN.map((s) => {
          const aktif = s.nilai === saringan;
          return (
            <button
              key={s.nilai}
              type="button"
              aria-pressed={aktif}
              onClick={() => setSaringan(s.nilai)}
              className={cn(
                "min-h-11 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-800 focus-visible:ring-offset-2",
                aktif
                  ? "border-emerald-800 bg-emerald-50 text-emerald-900"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900",
              )}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {tampil.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon={FileText}
            title={loans.length === 0 ? "Belum ada catatan pinjaman" : "Tidak ada catatan di saringan ini"}
            body={
              loans.length === 0
                ? "Pengajuan yang Anda kirim akan tampil di sini beserta statusnya."
                : "Coba saringan lain; seluruh catatan tetap ada di Semua."
            }
          />
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {tampil.map((loan) => (
            <li key={loan._id}>
              <button
                type="button"
                onClick={() => onOpenLoan(loan._id)}
                className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3.5 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-800"
              >
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm font-semibold tabular-nums text-slate-900">
                    {formatRupiah(loan.pokokPinjaman)}
                  </span>
                  <span className="mt-0.5 block break-words text-xs text-slate-500">
                    {loan.nomorReferensi} · {formatDate(loan._creationTime)} ·{" "}
                    {jenisPinjaman(loan)} · {loanPurposeLabel(loan.tujuan)}
                  </span>
                  {(loan.pokokDiajukan ?? loan.pokokPinjaman) !== loan.pokokPinjaman && (
                    <span className="mt-0.5 block break-words text-xs text-slate-600">
                      Diajukan {formatRupiah(loan.pokokDiajukan ?? loan.pokokPinjaman)} · disetujui{" "}
                      {formatRupiah(loan.pokokPinjaman)}
                    </span>
                  )}
                </span>
                <StatusBadge status={loan.status} kind="loan" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-xs leading-5 text-slate-500">
        Status diambil dari catatan PINDAI. Status Lunas diubah oleh tim PINDAI setelah
        pembayaran dicatat di luar aplikasi.
      </p>
    </section>
  );
}
