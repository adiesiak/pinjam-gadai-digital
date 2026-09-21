/**
 * Metadata domain Gadai (collateral) untuk Pinjam Gadai Digital.
 * Angka uang tetap integer rupiah (Rule 3) — penilaian taksiran adalah
 * pendapat reviewer, disimpan apa adanya sebagai rupiah bulat.
 */

export const COLLATERAL_CATEGORIES = [
  "Elektronik",
  "Kendaraan",
  "Perhiasan",
  "Properti",
  "Lainnya",
] as const;

export type CollateralCategory = (typeof COLLATERAL_CATEGORIES)[number];

/** Rasio Loan-to-Value awal per kategori — acuan reviewer saat menaksir. */
export const LTV_HINTS: Record<CollateralCategory, string> = {
  Elektronik: "hingga 70% dari nilai taksiran",
  Kendaraan: "hingga 80% dari nilai taksiran",
  Perhiasan: "hingga 75% dari nilai taksiran",
  Properti: "hingga 50% dari nilai taksiran",
  Lainnya: "hingga 60% dari nilai taksiran",
};

export const PAWN_STATUS_FLOW = [
  "diajukan",
  "sedang_dinilai",
  "disetujui",
  "ditolak",
] as const;

export type PawnStatus = (typeof PAWN_STATUS_FLOW)[number];

export function pawnStatusMeta(status: PawnStatus): {
  label: string;
  description: string;
} {
  switch (status) {
    case "diajukan":
      return {
        label: "Diajukan",
        description:
          "Pengajuan gadai Anda tercatat dan menunggu penjadwalan penilaian.",
      };
    case "sedang_dinilai":
      return {
        label: "Sedang Dinilai",
        description:
          "Petugas berwenang akan mengunjungi lokasi barang untuk pemeriksaan dan taksiran nilai.",
      };
    case "disetujui":
      return {
        label: "Disetujui",
        description:
          "Gadai disetujui. Dana pinjaman akan dicairkan setelah dokumen penyerahan barang selesai.",
      };
    case "ditolak":
      return {
        label: "Ditolak",
        description:
          "Pengajuan gadai tidak dapat dilanjutkan. Anda dapat mengajukan ulang dengan barang lain.",
      };
  }
}
