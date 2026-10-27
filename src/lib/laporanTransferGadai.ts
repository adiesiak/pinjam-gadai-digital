/**
 * Rekap & unduhan transfer hak pendana GADAI — fungsi MURNI.
 *
 * Catatan transfer gadai memakai bentuk baris yang sama dengan catatan transfer
 * pinjaman (`BarisTransferLaporan`), jadi penyaringan, penjumlahan, dan CSV-nya
 * memakai `@/lib/laporanTransfer` apa adanya. Yang perlu ditambahkan hanya dua
 * hal yang memang khas gadai: antrean pembayaran yang belum punya catatan, dan
 * nama berkas yang menyebut gadai supaya tidak tertukar dengan ekspor pinjaman.
 *
 * Isinya catatan PEMBUKUAN: PINDAI tidak memindahkan uang. "Belum dicatat"
 * berarti admin belum membuat catatannya, bukan berarti uangnya belum berpindah.
 */
import { kutipCsv } from "./auditTimeline";

/** Satu pembayaran gadai yang porsi pendananya belum punya catatan transfer. */
export type BarisBelumTransferGadai = {
  pawnId: string;
  paymentId: string;
  /** Nomor referensi gadai, sumber nomor yang sama dengan catatan transfernya. */
  referensi: string;
  pendanaNama: string;
  jumlah: number;
  /** Waktu pembayaran gadai diterima. */
  waktu: number;
};

/** Kolom CSV antrean transfer gadai — tetap, supaya kepala berkas stabil. */
export const KOLOM_CSV_BELUM_GADAI = [
  "waktu_pembayaran",
  "nomor_referensi",
  "pendana",
  "nominal",
] as const;

/**
 * Susun CSV antrean pembayaran gadai yang catatan transfernya belum dibuat.
 *
 * Waktu ISO 8601 dan nominal sebagai digit murni supaya bisa dijumlahkan di
 * Excel; teks dibungkus `kutipCsv` (RFC 4180) dan baris dipisah CRLF.
 */
export function keCsvBelumTransferGadai(
  baris: readonly BarisBelumTransferGadai[],
): string {
  const isi = baris.map((b) =>
    [
      new Date(b.waktu).toISOString(),
      b.referensi,
      b.pendanaNama,
      String(b.jumlah),
    ]
      .map(kutipCsv)
      .join(","),
  );
  return [KOLOM_CSV_BELUM_GADAI.join(","), ...isi].join("\r\n");
}

/**
 * Nama berkas ekspor, mis. `transfer-gadai-pindai-2026-10-26.csv`.
 *
 * Awalan "transfer-gadai" menjaga berkas ini tidak terbaca sebagai bukti mutasi
 * bank, dan tidak tertukar dengan ekspor keuntungan pinjaman tunai.
 */
export function namaBerkasTransferGadai(waktu: number): string {
  const tanggal = new Date(waktu).toISOString().slice(0, 10);
  return `transfer-gadai-pindai-${tanggal}.csv`;
}
