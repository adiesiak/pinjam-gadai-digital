/**
 * Aturan pencatatan akad syariah dari pengajuan yang sudah disetujui.
 *
 * Dipisah dari Convex supaya urutan yang menentukan sahnya pencatatan — status
 * pengajuan, kecocokan jenis, penyerahan barang katalog, dan akad ganda — bisa
 * diuji tanpa basis data. Mutation tetap membaca barisnya, lalu memakai angka
 * pengajuan sebagai snapshot: yang disetujui admin itulah yang dicatat, bukan
 * angka yang mungkin masih terbawa di formulir.
 */
import type { JenisAkadSyariah } from "./akad";
import { MARGIN_MURABAHAH_BAWAAN } from "./pengajuan";

/** Bagian baris `pengajuanSyariah` yang menentukan isi akad. */
export type PengajuanUntukAkad = {
  jenis: JenisAkadSyariah;
  status: "diajukan" | "disetujui" | "ditolak" | "dibatalkan";
  peminjamNama: string;
  pokok: number;
  tenorHari: number;
  marginPersen?: number;
  nilaiTaksiran?: number;
  /** Ada hanya bila barangnya berasal dari katalog Murabahah. */
  katalogId?: string;
  statusPenyerahan?: "belum" | "terkirim";
};

/** Angka yang dipakai saat akad dicatat. */
export type DataPencatatanAkad = {
  peminjamNama: string;
  pokok: number;
  tenorHari: number;
  /** Hanya Murabahah. */
  marginPersen?: number;
  /** Hanya Rahn. */
  nilaiTaksiran?: number;
};

/**
 * Susun angka akad dari pengajuan. Melempar pesan Indonesia bila pengajuan
 * belum disetujui, jenisnya berbeda, sudah punya akad, atau barang katalognya
 * belum ditandai terkirim.
 *
 * Barang katalog wajib diserahkan lebih dulu karena Murabahah adalah jual beli:
 * penjual harus sudah memiliki barangnya saat akad, bukan menjual barang yang
 * masih akan dibeli.
 */
export function dataPencatatanDariPengajuan({
  pengajuan,
  jenis,
  sudahAdaAkad,
}: {
  pengajuan: PengajuanUntukAkad;
  jenis: JenisAkadSyariah;
  sudahAdaAkad: boolean;
}): DataPencatatanAkad {
  if (pengajuan.status !== "disetujui") {
    throw new Error(
      "Akad hanya dicatat untuk pengajuan yang sudah disetujui. Putuskan pengajuan lebih dulu.",
    );
  }
  if (pengajuan.jenis !== jenis) {
    throw new Error(
      `Jenis akad harus ${pengajuan.jenis}, bukan ${jenis}. Muat ulang pengajuannya.`,
    );
  }
  if (sudahAdaAkad) {
    throw new Error(
      "Pengajuan ini sudah punya akad tercatat. Periksa portofolio sebelum mencatat lagi.",
    );
  }
  if (
    jenis === "murabahah" &&
    pengajuan.katalogId !== undefined &&
    pengajuan.statusPenyerahan !== "terkirim"
  ) {
    throw new Error(
      "Barang katalog belum ditandai terkirim. Catat penyerahan lebih dulu supaya barangnya sudah berpindah sebelum akad.",
    );
  }

  return {
    peminjamNama: pengajuan.peminjamNama,
    pokok: pengajuan.pokok,
    tenorHari: pengajuan.tenorHari,
    ...(jenis === "murabahah"
      ? { marginPersen: pengajuan.marginPersen ?? MARGIN_MURABAHAH_BAWAAN }
      : {}),
    ...(jenis === "rahn" ? { nilaiTaksiran: pengajuan.nilaiTaksiran ?? 0 } : {}),
  };
}
