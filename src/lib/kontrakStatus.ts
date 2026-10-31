/**
 * Status perjanjian yang dipakai bersama oleh widget admin, antrean, dan
 * dashboard peminjam. Logika ini MURNI (tanpa React/Convex) supaya satu
 * perjanjian tidak pernah diberi label berbeda di dua layar.
 *
 * Persetujuan dan tanda tangan adalah dua hal terpisah:
 * - `manual` = syarat sudah disetujui, tetapi belum ada gambar tanda tangan.
 *   Dokumen diunduh lalu ditandatangani dengan tinta.
 * - `manual_diterima` = admin sudah menerima kembali berkas bertanda tangan.
 * - `elektronik` = gambar tanda tangan tersimpan pada pengajuan.
 */

import { CONTRACT_TERMS_VERSION } from "./contract";

export const ACCEPT_TTD_MANUAL =
  "application/pdf,image/jpeg,image/png,image/webp";

/** Batas berkas bukti TTD manual; sama dengan batas dokumen KYC (5 MB). */
export const MAX_TTD_MANUAL_BYTES = 5 * 1024 * 1024;

export type StatusKontrak =
  | "belum"
  | "versi_lama"
  | "manual"
  | "elektronik"
  | "manual_diterima";

export type DataStatusKontrak = {
  persetujuanPada?: number | null;
  persetujuanVersi?: string | null;
  persetujuanMode?: "elektronik" | "manual" | null;
  ttdDataUrl?: string | null;
  ttdPada?: number | null;
  ttdManualPada?: number | null;
  /** Versi syarat yang berlaku; default versi kontrak saat ini. */
  versiBerlaku?: string;
};

export function statusKontrak(data: DataStatusKontrak): StatusKontrak {
  const versi = data.versiBerlaku ?? CONTRACT_TERMS_VERSION;
  const disetujui =
    data.persetujuanPada !== undefined &&
    data.persetujuanPada !== null &&
    data.persetujuanVersi === versi;
  if (!disetujui) {
    return data.persetujuanPada != null ? "versi_lama" : "belum";
  }
  if (data.ttdManualPada != null) return "manual_diterima";
  // Pilihan manual tetap manual walau gambar KYC lama masih tersimpan: gambar
  // itu bukan tanda tangan akad, dan UI tidak boleh mengklaim sebaliknya.
  if (data.persetujuanMode === "manual") return "manual";
  if (data.ttdDataUrl != null && data.ttdDataUrl !== "" && data.ttdPada != null) {
    return "elektronik";
  }
  return "manual";
}

export type LabelStatusKontrak = {
  label: string;
  /** Ringkasan satu kalimat untuk pembaca layar/keterangan. */
  keterangan: string;
  /** Nada visual: netral, peringatan, informasi, atau selesai. */
  nada: "netral" | "peringatan" | "info" | "selesai";
};

export function labelStatusKontrak(status: StatusKontrak): LabelStatusKontrak {
  switch (status) {
    case "belum":
      return {
        label: "Belum disetujui",
        keterangan: "Peminjam belum mencatat persetujuan syarat perjanjian.",
        nada: "netral",
      };
    case "versi_lama":
      return {
        label: "Perlu persetujuan ulang",
        keterangan:
          "Persetujuan tersimpan untuk versi syarat lama; versi terbaru belum disetujui.",
        nada: "peringatan",
      };
    case "manual":
      return {
        label: "Disetujui · TTD manual",
        keterangan:
          "Persetujuan sudah tercatat, tetapi gambar tanda tangan belum ada. Unduh dokumen untuk ditandatangani manual.",
        nada: "info",
      };
    case "elektronik":
      return {
        label: "Tertanda tangan elektronik",
        keterangan: "Persetujuan dan gambar tanda tangan elektronik sudah tersimpan.",
        nada: "selesai",
      };
    case "manual_diterima":
      return {
        label: "TTD manual diterima",
        keterangan:
          "Admin sudah menerima berkas perjanjian yang ditandatangani manual.",
        nada: "selesai",
      };
  }
}

/** Perjanjian yang sudah disetujui tetapi belum punya bukti tanda tangan apa pun. */
export function menungguTtdManual(data: DataStatusKontrak): boolean {
  return statusKontrak(data) === "manual";
}

/** Bukti TTD manual hanya relevan setelah perjanjian disetujui. */
export function bolehUnggahTtdManual(data: DataStatusKontrak): boolean {
  const status = statusKontrak(data);
  return status === "manual" || status === "manual_diterima";
}

/** Validasi berkas di klien; server tetap memeriksa metadata yang tersimpan. */
export function validasiBerkasTtdManual(berkas: {
  name: string;
  size: number;
  type: string;
}): string | null {
  if (berkas.size <= 0) {
    return "Berkas kontrak kosong. Pilih berkas lain.";
  }
  if (berkas.size > MAX_TTD_MANUAL_BYTES) {
    return `Berkas kontrak maksimal ${Math.round(
      MAX_TTD_MANUAL_BYTES / (1024 * 1024),
    )} MB.`;
  }
  const tipe = berkas.type.toLowerCase().trim();
  if (!ACCEPT_TTD_MANUAL.split(",").includes(tipe)) {
    return "Berkas kontrak harus berupa PDF, JPG, PNG, atau WEBP.";
  }
  return null;
}

/** Nama berkas unduhan: aman untuk semua sistem, tanpa garis miring. */
export function namaBerkasKontrak(
  jenis: "pinjaman" | "gadai",
  nomorReferensi: string,
): string {
  const ref = nomorReferensi
    .normalize("NFKD")
    .replace(/[^\w-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `Perjanjian-${jenis === "pinjaman" ? "Pinjaman" : "Gadai"}-${
    ref || "PINDAI"
  }.pdf`;
}

/** Pesan pengingat WhatsApp untuk perjanjian yang belum ditandatangani. */
export function pesanPengingatTtd(args: {
  nama: string;
  nomorReferensi: string;
  jenis: "pinjaman" | "gadai";
}): string {
  return `Halo ${args.nama}, perjanjian ${
    args.jenis === "pinjaman" ? "pinjaman" : "gadai"
  } ${args.nomorReferensi} di PINDAI sudah disetujui tetapi belum ditandatangani. Buka Dashboard PINDAI → Pinjaman → Perjanjian, lalu tanda tangani elektronik atau unduh dokumen untuk TTD manual. Terima kasih.`;
}
