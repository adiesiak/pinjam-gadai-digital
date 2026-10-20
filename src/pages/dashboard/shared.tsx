import type { Id } from "@/convex/_generated/dataModel";
import { hitungSimulasiBulanan } from "@/lib/bulanan";
import { quoteLoan } from "@/lib/loan";

/** Format tanggal ringkas (id-ID) — dipakai seluruh tampilan dashboard. */
export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Baris jadwal pinjaman dari server (myLoanSchedule) — tipe bersama UI. */
export type LoanScheduleRow = {
  _id: Id<"loans">;
  nomorReferensi: string;
  pokokPinjaman: number;
  /** Nominal asli pengajuan — beda bila admin menyetujui sebagian. */
  pokokDiajukan?: number;
  status: string;
  tenorHari: number;
  /** Diisi (1/3/6 bln) bila pinjaman memakai skema bulanan. */
  tenorBulan: number | null;
  didanaiPada: number | null;
  /** State perpanjangan; kosong bila belum pernah diperpanjang. */
  remainingPrincipal: number | null;
  currentTierRate: number | null;
  nextDueDate: number | null;
  nextInterestAmount: number | null;
  quote: ReturnType<typeof quoteLoan>;
  /** Rincian biaya dan cicilan yang dihitung engine untuk tenor bulanan. */
  simulasiBulanan: ReturnType<typeof hitungSimulasiBulanan> | null;
  /** Hak Imbal Hasil: bunga harian sesuai tarif tersimpan, atau Σ bunga bulanan. */
  imbalHasilTotal: number;
  /** Total kewajiban menurut skema pinjaman (pokok + bunga atau Σ cicilan bulanan). */
  totalKewajiban: number;
  pelunasan: {
    jatuhTempoPada: number;
    sisaHari: number;
    hariTerlambat: number;
    dendaTerlambat: number;
    totalKewajibanDenganPenalti: number;
  } | null;
};
