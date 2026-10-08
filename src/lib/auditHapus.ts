/**
 * Ringkasan penghapusan data untuk Audit Trail Admin — logika murni, tanpa
 * React dan tanpa Convex, supaya bisa diuji sebagai skrip biasa
 * (`bun src/lib/auditHapus.test.ts`).
 *
 * Kenapa berkas ini ada: panel Audit Trail perlu menjawab "berapa baris yang
 * ikut terhapus?" tanpa menebak dari kalimat `detail`. Sumber angkanya adalah
 * kolom terstruktur `auditLog.rincianHapus` yang ditulis mutation penghapusan.
 * Baris lama (sebelum kolom itu ada) TIDAK dikarang angkanya — dihitung sebagai
 * `tanpaRincian` supaya panel bisa mengatakannya apa adanya (Zero Fake Data).
 *
 * Semua jalur hapus memakai objek `rincianHapus` dengan bentuk yang sama;
 * field yang tidak relevan diisi 0, bukan dihilangkan, agar penjumlahan tidak
 * bergantung pada produk asalnya.
 */

/** Aksi audit yang berarti "data dihapus" — satu daftar untuk server dan UI. */
export const AKSI_HAPUS = [
  "loan_delete",
  "pawn_delete",
  "kredit_delete",
  "pinjaman_hapus_lama",
] as const;

export type AksiHapus = (typeof AKSI_HAPUS)[number];

/** Pemeriksa tipe untuk nama aksi dari database (bertipe `string`). */
export function aksiHapus(aksi: string): aksi is AksiHapus {
  return (AKSI_HAPUS as readonly string[]).includes(aksi);
}

/** Filter panel → aksi audit yang ditampilkan (satu sumber untuk server & UI). */
export const JENIS_HAPUS = [
  "semua",
  "pinjaman",
  "gadai",
  "kredit-barang",
  "pinjaman-lama",
] as const;

export type JenisHapus = (typeof JENIS_HAPUS)[number];

export const AKSI_PER_JENIS: Record<JenisHapus, readonly AksiHapus[]> = {
  semua: AKSI_HAPUS,
  pinjaman: ["loan_delete"],
  gadai: ["pawn_delete"],
  "kredit-barang": ["kredit_delete"],
  "pinjaman-lama": ["pinjaman_hapus_lama"],
};

export const LABEL_JENIS: Record<JenisHapus, string> = {
  semua: "Semua penghapusan",
  pinjaman: "Pinjaman tunai",
  gadai: "Gadai",
  "kredit-barang": "Kredit barang",
  "pinjaman-lama": "Pinjaman lama (pembersihan)",
};

export const LABEL_AKSI: Record<AksiHapus, string> = {
  loan_delete: "Pinjaman",
  pawn_delete: "Gadai",
  kredit_delete: "Kredit barang",
  pinjaman_hapus_lama: "Pinjaman lama",
};

/**
 * Rincian terstruktur satu penghapusan. Bentuknya sama untuk semua produk:
 * `menyeluruh` menandai admin memakai jalur "bersihkan dana", sedangkan tujuh
 * angka di bawahnya adalah jumlah baris yang BENAR-BENAR ikut terhapus /
 * dipertahankan saat aksi itu berjalan.
 */
export type RincianHapus = {
  menyeluruh: boolean;
  alokasiDana: number;
  catatanTransfer: number;
  buktiBayar: number;
  pengingat: number;
  logWhatsapp: number;
  jejakLokasi: number;
  /** Entri jurnal ledger yang sengaja TIDAK dihapus (append-only). */
  jurnalDipertahankan: number;
};

/** Satu baris audit sebagaimana dibaca panel (hanya field yang dipakai). */
export type BarisAuditHapus = {
  aktorLabel: string;
  aksi: string;
  target?: string;
  detail?: string;
  waktu: number;
  rincianHapus?: RincianHapus;
};

export type RingkasanHapus = {
  /** Jumlah baris audit penghapusan yang dikirim server. */
  jumlah: number;
  perJenis: Record<AksiHapus, number>;
  /** Penghapusan yang memakai jalur menyeluruh (data sudah berpindah dana). */
  menyeluruh: number;
  /** Baris yang dihapus: alokasi dana. */
  alokasiDana: number;
  catatanTransfer: number;
  buktiBayar: number;
  pengingat: number;
  logWhatsapp: number;
  jejakLokasi: number;
  jurnalDipertahankan: number;
  /**
   * Baris lama tanpa `rincianHapus`. Angkanya TIDAK ikut dijumlahkan di atas —
   * panel harus mengatakannya supaya total tidak tampak lengkap padahal bukan.
   */
  tanpaRincian: number;
};

const KOSONG_PER_JENIS: Record<AksiHapus, number> = {
  loan_delete: 0,
  pawn_delete: 0,
  kredit_delete: 0,
  pinjaman_hapus_lama: 0,
};

/**
 * Jumlahkan rincian seluruh baris. Baris non-aksi-hapus diabaikan; baris tanpa
 * rincian terstruktur dihitung di `tanpaRincian`, bukan ditebak dari teks.
 */
export function rangkumAuditHapus(rows: readonly BarisAuditHapus[]): RingkasanHapus {
  const perJenis: Record<AksiHapus, number> = { ...KOSONG_PER_JENIS };
  const ringkas: RingkasanHapus = {
    jumlah: 0,
    perJenis,
    menyeluruh: 0,
    alokasiDana: 0,
    catatanTransfer: 0,
    buktiBayar: 0,
    pengingat: 0,
    logWhatsapp: 0,
    jejakLokasi: 0,
    jurnalDipertahankan: 0,
    tanpaRincian: 0,
  };

  for (const row of rows) {
    if (!aksiHapus(row.aksi)) continue;
    ringkas.jumlah += 1;
    perJenis[row.aksi] += 1;
    const r = row.rincianHapus;
    if (r === undefined) {
      ringkas.tanpaRincian += 1;
      continue;
    }
    if (r.menyeluruh) ringkas.menyeluruh += 1;
    ringkas.alokasiDana += r.alokasiDana;
    ringkas.catatanTransfer += r.catatanTransfer;
    ringkas.buktiBayar += r.buktiBayar;
    ringkas.pengingat += r.pengingat;
    ringkas.logWhatsapp += r.logWhatsapp;
    ringkas.jejakLokasi += r.jejakLokasi;
    ringkas.jurnalDipertahankan += r.jurnalDipertahankan;
  }

  return ringkas;
}

/**
 * Satu baris penjelasan rupiah untuk sebuah penghapusan: hanya bagian yang
 * bukan nol yang disebut, urut tetap, dan baris tanpa turunan mengatakannya
 * dengan jujur — bukan deretan nol.
 */
export function ringkasRincianHapus(r: RincianHapus): string {
  const bagian: string[] = [];
  if (r.alokasiDana > 0) bagian.push(`${r.alokasiDana} alokasi dana`);
  if (r.catatanTransfer > 0) bagian.push(`${r.catatanTransfer} catatan transfer`);
  if (r.buktiBayar > 0) bagian.push(`${r.buktiBayar} bukti bayar`);
  if (r.pengingat > 0) bagian.push(`${r.pengingat} pengingat`);
  if (r.logWhatsapp > 0) bagian.push(`${r.logWhatsapp} log WhatsApp`);
  if (r.jejakLokasi > 0) bagian.push(`${r.jejakLokasi} jejak lokasi`);
  if (r.jurnalDipertahankan > 0) {
    bagian.push(`${r.jurnalDipertahankan} entri jurnal dipertahankan`);
  }
  if (bagian.length === 0) return "tanpa baris turunan";
  return bagian.join(" · ");
}

/** Label ringkas satu baris audit: "Pinjaman · menyeluruh". */
export function labelBarisHapus(row: BarisAuditHapus): string {
  const jenis = aksiHapus(row.aksi) ? LABEL_AKSI[row.aksi] : row.aksi;
  const menyeluruh =
    row.rincianHapus?.menyeluruh === true ||
    (row.rincianHapus === undefined && (row.detail ?? "").includes("PENGHAPUSAN MENYELURUH"));
  return menyeluruh ? `${jenis} · menyeluruh` : jenis;
}
