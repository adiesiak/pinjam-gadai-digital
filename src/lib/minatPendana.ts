/**
 * Status dan pesan tindak lanjut calon pendana.
 *
 * Murni: tidak membaca database atau DOM. Dipakai panel admin untuk membuka
 * WhatsApp dengan pesan yang sudah terisi, dan oleh tes agar label serta nada
 * pesan tidak berbeda diam-diam dari yang tertulis di sini.
 *
 * Batas yang dijaga:
 *  - kata "pendanaan", bukan janji investasi atau hasil tetap;
 *  - tidak ada angka imbal hasil di pesan follow-up — angka hanya boleh
 *    dijelaskan setelah risiko dan mekanisme siklus dibaca;
 *  - nominal yang disebut adalah nominal yang diisi calon pendana sendiri,
 *    bukan tawaran dari platform.
 */
import { formatRupiah } from "./money";

export const STATUS_MINAT_PENDANA = [
  "baru",
  "dihubungi",
  "selesai",
  "batal",
] as const;

export type StatusMinatPendana = (typeof STATUS_MINAT_PENDANA)[number];

export const LABEL_STATUS_MINAT_PENDANA: Record<StatusMinatPendana, string> = {
  baru: "Baru",
  dihubungi: "Sudah dihubungi",
  selesai: "Selesai",
  batal: "Batal",
};

/** Sumber minat yang boleh dikirim formulir publik. */
export const SUMBER_MINAT_PENDANA = [
  "instagram",
  "whatsapp",
  "komunitas",
  "rekomendasi",
  "lainnya",
] as const;

export type SumberMinatPendana = (typeof SUMBER_MINAT_PENDANA)[number];

export const LABEL_SUMBER_MINAT_PENDANA: Record<SumberMinatPendana, string> = {
  instagram: "Instagram / TikTok",
  whatsapp: "WhatsApp",
  komunitas: "Komunitas / koperasi",
  rekomendasi: "Rekomendasi pendana",
  lainnya: "Lainnya",
};

/** Nama panggilan pertama; fallback netral, bukan "Peminjam". */
function sapaanPendana(nama: string): string {
  const bersih = nama.trim().replace(/\s+/g, " ");
  if (bersih === "") return "Bapak/Ibu";
  return bersih.split(" ")[0] ?? bersih;
}

/**
 * Pesan pertama setelah formulir masuk.
 *
 * Tujuannya membuka percakapan, bukan menutup penjualan: tanyakan kesiapan,
 * sebut mekanisme yang akan dijelaskan, dan tegaskan belum ada komitmen.
 */
export function pesanTindakLanjutMinatPendana(input: {
  nama: string;
  nominalRencana: number;
}): string {
  return (
    `Halo ${sapaanPendana(input.nama)}, terima kasih sudah mengisi minat pendanaan di PINDAI. ` +
    `Saya dari tim PINDAI. Saya bisa bantu menjelaskan siklus 30 hari, pembagian hasil, risiko, ` +
    `dan langkah verifikasinya. Rencana penempatan yang Anda tulis ${formatRupiah(input.nominalRencana)}. ` +
    `Boleh kita atur percakapan singkat? Tahap ini belum ada komitmen.`
  );
}
