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
  didanaiPada: number | null;
  quote: ReturnType<typeof quoteLoan>;
  pelunasan: {
    jatuhTempoPada: number;
    sisaHari: number;
    hariTerlambat: number;
    dendaTerlambat: number;
    totalKewajibanDenganPenalti: number;
  } | null;
};
