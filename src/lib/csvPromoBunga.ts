/**
 * Ekspor CSV laporan efektivitas promo bunga.
 *
 * Angka rupiah ditulis sebagai digit mentah (bukan "Rp 1.000.000") supaya
 * langsung terbaca sebagai angka oleh spreadsheet. Tanggal memakai kalender
 * WIB yang sama dengan panel, bukan tanggal UTC server.
 *
 * Semua teks dibungkus hanya bila perlu: koma, kutip ganda, atau baris baru.
 * Kutip ganda di dalam teks digandakan, sesuai aturan CSV.
 */
import { tanggalWIB } from "./waktu";

export type BarisCsvPromo = {
  nama: string;
  /** Label status yang sudah manusiawi, mis. "Berjalan". */
  status: string;
  persenBunga: number;
  tenor: readonly number[];
  mulai: number;
  selesai: number;
  pinjaman: number;
  pokok: number;
  subsidi: number;
};

const HEADER = [
  "Promo",
  "Status",
  "Bunga (%)",
  "Tenor (hari)",
  "Mulai",
  "Selesai",
  "Pinjaman",
  "Pokok (Rp)",
  "Subsidi (Rp)",
] as const;

/** Satu sel CSV; hanya dikutip bila mengandung pemisah atau kutip. */
export function selCsv(nilai: string | number): string {
  const teks = String(nilai);
  if (!/[",\n\r]/.test(teks)) return teks;
  return `"${teks.replace(/"/g, '""')}"`;
}

export function csvEfektivitasPromo(baris: readonly BarisCsvPromo[]): string {
  const lines = [HEADER.map(selCsv).join(",")];
  for (const row of baris) {
    lines.push(
      [
        selCsv(row.nama),
        selCsv(row.status),
        selCsv(row.persenBunga),
        selCsv(row.tenor.join("/")),
        selCsv(tanggalWIB(row.mulai)),
        selCsv(tanggalWIB(row.selesai)),
        selCsv(row.pinjaman),
        selCsv(row.pokok),
        selCsv(row.subsidi),
      ].join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}
