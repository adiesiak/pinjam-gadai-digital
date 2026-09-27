import type { Id } from "@/convex/_generated/dataModel";
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
  status: string;
  tenorHari: number;
  /** Diisi (1/3/6 bln) bila pinjaman memakai skema bulanan. */
  tenorBulan: number | null;
  didanaiPada: number | null;
  quote: ReturnType<typeof quoteLoan>;
  /** Hak Imbal Hasil Pendana: 30% pokok (harian) atau Σ bunga bulanan. */
  imbalHasilTotal: number;
  /** Total kewajiban menurut skema pinjaman (130% atau Σ cicilan bulanan). */
  totalKewajiban: number;
  pelunasan: {
    jatuhTempoPada: number;
    sisaHari: number;
    hariTerlambat: number;
    dendaTerlambat: number;
    totalKewajibanDenganPenalti: number;
  } | null;
};
