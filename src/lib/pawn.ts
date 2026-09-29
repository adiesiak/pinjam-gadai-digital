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
  "aktif",
  "menunggu_pelepasan",
  "lunas_dilepas",
] as const;

export type PawnStatus = (typeof PAWN_STATUS_FLOW)[number];

export function pawnStatusMeta(status: PawnStatus): {
  label: string;
  description: string;
} {
  switch (status) {
    case "diajukan":
      return {
        label: "Diajukan (catatan internal)",
        description:
          "Pengajuan gadai Anda tercatat dan menunggu pembaruan tahap tinjauan internal.",
      };
    case "sedang_dinilai":
      return {
        label: "Sedang Dinilai",
        description:
          "Pengajuan berada pada tahap pencatatan taksiran internal. Status ini tidak menandakan kunjungan, pemeriksaan fisik, atau verifikasi barang.",
      };
    case "disetujui":
      return {
        label: "Disetujui internal",
        description:
          "Pengajuan disetujui secara internal. Status ini tidak membuktikan barang diserahkan atau dana dicairkan.",
      };
    case "ditolak":
      return {
        label: "Ditolak internal",
        description:
          "Pengajuan gadai tidak dilanjutkan dalam alur aplikasi. Anda dapat membuat catatan baru.",
      };
    case "aktif":
      return {
        label: "Aktif (ledger)",
        description:
          "Status gadai aktif tercatat pada ledger internal. Catatan ini bukan bukti barang diterima, disimpan, atau berada dalam penguasaan PINDAI.",
      };
    case "menunggu_pelepasan":
      return {
        label: "Menunggu pembaruan status",
        description:
          "Permintaan perubahan status tercatat pada ledger. Status ini bukan konfirmasi pengembalian barang secara fisik.",
      };
    case "lunas_dilepas":
      return {
        label: "Lunas (ledger)",
        description:
          "Kewajiban simulasi ditandai lunas pada ledger internal. Catatan ini tidak membuktikan barang pernah dititipkan atau telah dikembalikan.",
      };
  }
}
