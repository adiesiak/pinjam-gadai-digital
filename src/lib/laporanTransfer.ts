/**
 * Laporan & riwayat transfer keuntungan pendana — fungsi MURNI.
 *
 * Kenapa dikumpulkan di sini: ruang pendana menyaring, menjumlahkan, dan
 * mengekspor catatan yang sama. Kalau penyaringan dikerjakan di komponen,
 * angka ringkasan dan isi berkas CSV mudah menyimpang dari baris yang benar-benar
 * terlihat. Di sini satu fungsi menentukan baris mana yang lolos, dan CSV disusun
 * dari hasil saringan yang sama persis.
 *
 * Istilah mengikuti `src/lib/transferPendana.ts`: yang dicatat adalah catatan
 * admin bahwa keuntungan pendana SUDAH ia transfer di luar sistem. "Belum
 * dicatat" berarti catatannya belum dibuat, BUKAN berarti uangnya belum
 * berpindah. Karena itu berkas ekspornya bernama "transfer-keuntungan": isinya
 * catatan pembukuan internal, bukan bukti mutasi bank/e-wallet.
 *
 * Tanpa I/O dan tanpa React, sehingga bisa diuji lewat runner `bun` biasa.
 */
import { kutipCsv } from "./auditTimeline";
import { LABEL_METODE_TRANSFER } from "./transferPendana";

/** Satu milidetik dalam sehari — dipakai saringan periode. */
export const MS_HARI = 86_400_000;

/** Satu baris catatan transfer seperti yang dikirim `penyediaDana.laporanTransferPendana`. */
export type BarisTransferLaporan = {
  id: string;
  nomorReferensi: string;
  pendanaId: string | null;
  pendanaNama: string;
  jumlah: number;
  metode: string;
  referensi: string | null;
  catatan: string | null;
  /** `dicatat` (transfer sudah dilakukan admin) atau `dibatalkan` (salah catat). */
  status: string;
  dicatatPada: number;
  dicatatOlehLabel: string;
  dibatalkanPada: number | null;
  dibatalkanOlehLabel: string | null;
  alasanBatal: string | null;
};

/** Pinjaman lunas berpendana yang keuntungannya belum punya catatan transfer. */
export type BarisBelumTransfer = {
  loanId: string;
  referensi: string;
  pendanaId: string | null;
  pendanaNama: string;
  jumlah: number;
  lunasPada: number;
};

/** Jumlah dan nilai dari himpunan baris yang sedang ditampilkan. */
export type RingkasanLaporanTransfer = {
  /** Berapa baris yang ditampilkan, termasuk yang dibatalkan. */
  jumlah: number;
  /** Nilai seluruh baris yang ditampilkan. */
  nilai: number;
  jumlahTercatat: number;
  nilaiTercatat: number;
  jumlahDibatalkan: number;
  nilaiDibatalkan: number;
};

/**
 * Ringkasan yang datang dari SERVER (`penyediaDana.laporanTransferPendana`).
 *
 * Bentuknya sengaja terpisah dari `RingkasanLaporanTransfer` di atas: yang itu
 * menjumlahkan himpunan baris yang sedang TERSARING di layar, sedangkan ini
 * menjumlahkan seluruh catatan yang tersimpan plus antrean pinjaman lunas yang
 * catatan transfernya belum dibuat. Dua angka itu memang berbeda, jadi tipenya
 * juga tidak boleh tertukar.
 */
export type RingkasanServerTransfer = {
  jumlahTercatat: number;
  nilaiTercatat: number;
  jumlahDibatalkan: number;
  nilaiDibatalkan: number;
  jumlahBelumDicatat: number;
  nilaiBelumDicatat: number;
};

export type StatusSaringanTransfer = "semua" | "dicatat" | "dibatalkan";

export type SaringanTransfer = {
  status: StatusSaringanTransfer;
  /** Kata kunci bebas: nomor referensi, nama pendana, atau referensi mutasi. */
  cari: string;
  /** Jendela hari ke belakang menurut `dicatatPada`; 0 berarti semua waktu. */
  hari: number;
};

export const SARINGAN_TRANSFER_KOSONG: SaringanTransfer = {
  status: "semua",
  cari: "",
  hari: 0,
};

/** Pilihan periode saringan. `0` sengaja berarti "semua waktu", bukan "hari ini". */
export const PERIODE_TRANSFER: readonly { nilai: number; label: string }[] = [
  { nilai: 0, label: "semua waktu" },
  { nilai: 30, label: "30 hari terakhir" },
  { nilai: 90, label: "90 hari terakhir" },
  { nilai: 365, label: "1 tahun terakhir" },
];

/** Label Indonesia untuk status catatan transfer. Nilai asing dikembalikan apa adanya. */
export function labelStatusTransfer(status: string): string {
  if (status === "dicatat") return "sudah dicatat";
  if (status === "dibatalkan") return "dibatalkan";
  return status;
}

/** Label metode pengiriman dana oleh admin; nilai tak dikenal dikembalikan apa adanya. */
export function labelMetodeTransfer(metode: string): string {
  return LABEL_METODE_TRANSFER[metode] ?? metode;
}

/** Ada saringan yang sedang berlaku — menentukan tombol "Kosongkan filter". */
export function adaSaringan(saringan: SaringanTransfer): boolean {
  return saringan.status !== "semua" || saringan.cari.trim() !== "" || saringan.hari > 0;
}

/**
 * Apakah satu baris lolos saringan.
 *
 * Tiga syarat yang digabung (AND): status, jendela waktu, dan kata kunci. Kata
 * kunci kosong berarti "semua", bukan "cari string kosong"; pencarian tidak
 * peduli huruf besar/kecil dan berlaku pada nomor referensi, nama pendana,
 * maupun referensi mutasi.
 */
export function lolosSaringan(
  baris: BarisTransferLaporan,
  saringan: SaringanTransfer,
  sekarang: number,
): boolean {
  if (saringan.status !== "semua" && baris.status !== saringan.status) return false;
  if (saringan.hari > 0 && baris.dicatatPada < sekarang - saringan.hari * MS_HARI) {
    return false;
  }
  const kata = saringan.cari.trim().toLowerCase();
  if (kata === "") return true;
  return [baris.nomorReferensi, baris.pendanaNama, baris.referensi ?? ""].some((teks) =>
    teks.toLowerCase().includes(kata),
  );
}

/**
 * Baris yang ditampilkan laporan: lolos saringan, diurutkan dari yang terbaru.
 * Array masukan tidak diubah (`filter` membuat array baru sebelum diurutkan).
 */
export function saringTransfer(
  baris: readonly BarisTransferLaporan[],
  saringan: SaringanTransfer,
  sekarang: number,
): BarisTransferLaporan[] {
  return baris
    .filter((b) => lolosSaringan(b, saringan, sekarang))
    .sort((a, b) => b.dicatatPada - a.dicatatPada);
}

/**
 * Jumlahkan himpunan baris yang SEDANG DITAMPILKAN, bukan seluruh tabel.
 *
 * Angka pada kartu ringkasan selalu sama dengan isi tabel dan isi
 * CSV di bawahnya: kalau pendana menyaring 30 hari terakhir, yang dijumlahkan
 * juga 30 hari terakhir.
 */
export function ringkasDariSaringan(
  baris: readonly BarisTransferLaporan[],
): RingkasanLaporanTransfer {
  const tercatat = baris.filter((b) => b.status === "dicatat");
  const dibatalkan = baris.filter((b) => b.status === "dibatalkan");
  return {
    jumlah: baris.length,
    nilai: baris.reduce((total, b) => total + b.jumlah, 0),
    jumlahTercatat: tercatat.length,
    nilaiTercatat: tercatat.reduce((total, b) => total + b.jumlah, 0),
    jumlahDibatalkan: dibatalkan.length,
    nilaiDibatalkan: dibatalkan.reduce((total, b) => total + b.jumlah, 0),
  };
}

/** Kolom berkas CSV transfer — tetap, supaya kepala berkas tidak berubah-ubah. */
export const KOLOM_CSV_TRANSFER = [
  "waktu",
  "nomor_referensi",
  "pendana",
  "nominal",
  "metode",
  "referensi_mutasi",
  "catatan",
  "status",
  "dicatat_oleh",
  "dibatalkan_pada",
  "alasan_batal",
] as const;

function waktuIso(waktu: number | null): string {
  return waktu === null ? "" : new Date(waktu).toISOString();
}

/**
 * Susun isi berkas CSV catatan transfer (dengan baris kepala).
 *
 * Waktu ditulis ISO 8601 supaya bisa diurutkan mesin, nominal ditulis sebagai
 * digit murni supaya bisa dijumlahkan di Excel, sedangkan nama/status/metode
 * ditulis dalam bahasa Indonesia apa adanya — ekspor tidak boleh menyamarkan
 * apa pun. Nilai yang memuat koma atau kutip dibungkus `kutipCsv` (RFC 4180),
 * dan pemisah barisnya CRLF: format yang paling diterima Excel.
 */
export function keCsvTransfer(baris: readonly BarisTransferLaporan[]): string {
  const isi = baris.map((b) =>
    [
      waktuIso(b.dicatatPada),
      b.nomorReferensi,
      b.pendanaNama,
      String(b.jumlah),
      labelMetodeTransfer(b.metode),
      b.referensi ?? "",
      b.catatan ?? "",
      labelStatusTransfer(b.status),
      b.dicatatOlehLabel,
      waktuIso(b.dibatalkanPada),
      b.alasanBatal ?? "",
    ]
      .map(kutipCsv)
      .join(","),
  );
  return [KOLOM_CSV_TRANSFER.join(","), ...isi].join("\r\n");
}

/**
 * Nama berkas ekspor, mis. `transfer-keuntungan-pindai-2026-10-15.csv`.
 * Awalan "transfer-keuntungan" dipilih supaya berkas yang tersimpan di
 * perangkat pendana tidak terbaca sebagai bukti mutasi bank.
 */
export function namaBerkasTransfer(waktu: number): string {
  const tanggal = new Date(waktu).toISOString().slice(0, 10);
  return `transfer-keuntungan-pindai-${tanggal}.csv`;
}
