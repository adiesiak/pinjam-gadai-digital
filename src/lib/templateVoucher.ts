/**
 * Template voucher siap pakai untuk panel admin.
 *
 * Satu template mengisi jenis, judul, nilai, minimal pengajuan, kuota pakai,
 * dan masa berlaku. Penerima tetap dipilih admin — voucher selalu milik satu
 * akun, jadi tidak ada template yang bisa "tersebar" tanpa sengaja.
 *
 * Masa berlaku dihitung dari `sekarang` menurut kalender WIB dan berakhir pada
 * 23.59.59.999 hari terakhir, sama dengan aturan `akhirHariVoucher` yang
 * dipakai panel. Murni tanpa React/Convex supaya bisa diuji.
 */
import { LOAN_LIMITS } from "./loan";
import { OFFSET_WIB_MS } from "./waktu";
import type { JenisVoucher } from "./voucher";

const HARI_MS = 86_400_000;

export type TemplateVoucher = {
  id: string;
  /** Nama pendek di kartu template. */
  label: string;
  /** Satu kalimat: apa yang nasabah dapat. */
  keterangan: string;
  jenis: JenisVoucher;
  judul: string;
  nilai: number;
  minPokok: number;
  batasPemakaian: number;
  /** Masa berlaku dalam hari, dihitung termasuk hari ini. */
  berlakuHari: number;
};

export const TEMPLATE_VOUCHER: readonly TemplateVoucher[] = [
  {
    id: "bunga-5",
    label: "Bunga −5 poin",
    keterangan: "Bunga pinjaman harian turun 5 poin persen sekali pakai.",
    jenis: "diskon_bunga",
    judul: "Bunga pinjaman lebih ringan",
    nilai: 5,
    minPokok: LOAN_LIMITS.minPokok,
    batasPemakaian: 1,
    berlakuHari: 14,
  },
  {
    id: "bunga-10",
    label: "Bunga −10 poin",
    keterangan: "Potongan bunga lebih besar untuk nasabah yang tepat sasaran.",
    jenis: "diskon_bunga",
    judul: "Potongan bunga spesial",
    nilai: 10,
    minPokok: LOAN_LIMITS.minPokok,
    batasPemakaian: 1,
    berlakuHari: 14,
  },
  {
    id: "tenor-7",
    label: "Tenor +7 hari",
    keterangan: "Jatuh tempo mundur sepekan tanpa menaikkan bunga.",
    jenis: "tambah_tenor",
    judul: "Waktu bayar lebih longgar",
    nilai: 7,
    minPokok: LOAN_LIMITS.minPokok,
    batasPemakaian: 1,
    berlakuHari: 30,
  },
  {
    id: "tenor-14",
    label: "Tenor +14 hari",
    keterangan: "Jatuh tempo mundur dua pekan, bunga tetap tarif tenor semula.",
    jenis: "tambah_tenor",
    judul: "Perpanjangan waktu dua pekan",
    nilai: 14,
    minPokok: LOAN_LIMITS.minPokok,
    batasPemakaian: 1,
    berlakuHari: 30,
  },
  {
    id: "bebas-admin",
    label: "Bebas biaya admin",
    keterangan: "Biaya admin di muka dihapus, dana diterima nasabah lebih besar.",
    jenis: "diskon_admin",
    judul: "Bebas biaya admin",
    nilai: 25_000,
    minPokok: LOAN_LIMITS.minPokok,
    batasPemakaian: 1,
    berlakuHari: 30,
  },
  {
    id: "limit-500",
    label: "Tambah limit Rp500.000",
    keterangan: "Batas pengajuan naik sekali pakai, lalu hangus.",
    jenis: "boost_plafon",
    judul: "Tambah limit pengajuan",
    nilai: 500_000,
    minPokok: LOAN_LIMITS.minPokok,
    batasPemakaian: 1,
    berlakuHari: 30,
  },
  {
    id: "ujrah-50",
    label: "Ujrah −Rp50.000",
    keterangan: "Memotong ujrah Rahn dari porsi pengelola; hak pendana tetap utuh.",
    jenis: "diskon_ujrah",
    judul: "Potongan ujrah akad Rahn",
    nilai: 50_000,
    minPokok: LOAN_LIMITS.minPokok,
    batasPemakaian: 1,
    berlakuHari: 30,
  },
  {
    id: "margin-100",
    label: "Margin −Rp100.000",
    keterangan: "Memotong margin Murabahah dari porsi pengelola, bukan dari pendana.",
    jenis: "diskon_margin",
    judul: "Potongan margin akad Murabahah",
    nilai: 100_000,
    minPokok: LOAN_LIMITS.minPokok,
    batasPemakaian: 1,
    berlakuHari: 30,
  },
] as const;

/** Akhir hari WIB setelah `hari` hari dari `sekarang`. */
export function berlakuSampaiTemplate(sekarang: number, hari: number): number {
  const hariAwal = Math.floor((sekarang + OFFSET_WIB_MS) / HARI_MS);
  return (hariAwal + Math.max(0, Math.trunc(hari))) * HARI_MS - OFFSET_WIB_MS + HARI_MS - 1;
}

/** Isian formulir penerbitan dari satu template. */
export function isiTemplateVoucher(
  template: TemplateVoucher,
  sekarang: number,
): {
  jenis: JenisVoucher;
  judul: string;
  nilai: number;
  minPokok: number;
  batasPemakaian: number;
  berlakuSampai: number;
} {
  return {
    jenis: template.jenis,
    judul: template.judul,
    nilai: template.nilai,
    minPokok: template.minPokok,
    batasPemakaian: template.batasPemakaian,
    berlakuSampai: berlakuSampaiTemplate(sekarang, template.berlakuHari),
  };
}
