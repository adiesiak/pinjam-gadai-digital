/**
 * Rincian aliran uang SATU pinjaman tunai (skema harian) — angka yang dibaca
 * admin di panel "Ringkasan" → "Hari Ini".
 *
 * Murni, tanpa React/Convex/DOM, supaya bisa diuji sebagai skrip biasa dan
 * supaya kartunya tidak pernah menghitung uang sendiri.
 *
 * Kebijakan yang digambar (contoh pada pokok terbesar yang bisa diajukan,
 * Rp1.000.000):
 *
 * | Tahap | Rumus | Angka |
 * | --- | --- | --- |
 * | Pokok pinjaman | — | Rp1.000.000 |
 * | Potongan di muka 2% (biaya admin) | 2% × pokok | Rp20.000 |
 * | Diterima peminjam | pokok − potongan di muka | Rp980.000 |
 * | Kembali (pokok + Imbal Hasil 30%) | 130% × pokok | Rp1.300.000 |
 * | Potongan penyedia 5% | 5% × total yang kembali | Rp65.000 |
 * | Diterima penyedia dana | total kembali − potongan | Rp1.235.000 |
 * | Imbal Hasil bersih penyedia dana | diterima − pokok | Rp235.000 |
 * | Pendapatan platform | potongan di muka + potongan penyedia | Rp85.000 |
 *
 * Setengah pertama memakai `quoteLoan` — bukan rumus baru — sehingga potongan
 * di muka, dana bersih, bunga, dan total kembali selalu identik dengan yang
 * ditagih ke Peminjam dan yang tercetak di akad. Setengah kedua memakai
 * `percentOf` agar pembulatannya sama dengan seluruh uang lain di PINDAI
 * (HALF-UP di 0,5 rupiah, integer rupiah penuh).
 *
 * CATATAN KONSISTENSI (perlu keputusan lanjutan, jangan dihapus):
 * potongan 5% di sini dihitung dari **total yang kembali** (Rp1.300.000 →
 * Rp65.000) sesuai keputusan pemilik produk. Mesin uang yang benar-benar
 * dibukukan — `bagiHasil.ts` + `convex/loans.ts` (pelunasan) dan panel
 * "Kelola Penyedia Dana" — masih menghitung 5% dari **Imbal Hasil**
 * (Rp300.000 → Rp15.000). Selama keduanya belum disamakan, angka kartu ini
 * adalah kebijakan yang ditampilkan, bukan angka yang dijurnal ledger.
 */

import { POTONGAN_ADMIN_DEFAULT_PERSEN } from "./bagiHasil";
import { LOAN_LIMITS, PINDAI_PRICING, assertPokokPinjamanValid, quoteLoan } from "./loan";
import { formatRupiah, percentOf, type Rupiah } from "./money";

/**
 * Contoh yang ditampilkan kartu: pinjaman terbesar yang boleh diajukan.
 * Diambil dari batas bisnis, bukan angka yang ditulis di komponen.
 */
export const POKOK_CONTOH_RINCIAN: Rupiah = LOAN_LIMITS.maxPokok;

/** Seluruh angka satu aliran pinjaman, semuanya rupiah bulat. */
export type RincianAliranDana = {
  /** Pokok pinjaman yang diajukan & disetujui. */
  pokok: Rupiah;
  /**
   * Tarif potongan di muka (persen), diambil dari `PINDAI_PRICING` — bukan
   * dihitung balik dari rupiah, supaya label "2%" tidak berubah menjadi
   * 2,000003% pada pokok yang pembulatannya tidak pas.
   */
  persenPotonganDiMuka: number;
  /** Potongan di muka dalam rupiah (biaya admin, dibayar dari pokok). */
  potonganDiMuka: Rupiah;
  /** Dana yang benar-benar diterima peminjam = pokok − potongan di muka. */
  diterimaPeminjam: Rupiah;
  /** Imbal Hasil (bunga) penyedia dana, persen flat dari pokok (30%). */
  persenImbalHasil: number;
  /** Imbal Hasil (bunga) dalam rupiah. */
  imbalHasil: Rupiah;
  /** Total yang kembali dari peminjam = pokok + Imbal Hasil (130%). */
  totalKembali: Rupiah;
  /** Persen potongan platform atas uang yang kembali (5%). */
  persenPotonganPenyedia: number;
  /** Potongan platform = persen × total yang kembali. */
  potonganPenyedia: Rupiah;
  /** Uang yang diterima penyedia dana = total kembali − potongan. */
  diterimaPenyedia: Rupiah;
  /** Imbal Hasil bersih penyedia dana = diterima penyedia − pokok. */
  imbalBersihPenyedia: Rupiah;
  /** Total jasa platform satu pinjaman = potongan di muka + potongan penyedia. */
  pendapatanPlatform: Rupiah;
};

/** Bentuk minimal pinjaman yang dibutuhkan rincian ini. */
export type PinjamanRincian = {
  pokokPinjaman: Rupiah;
};

/**
 * Rincian aliran uang satu pinjaman.
 *
 * `persenPotonganPenyedia` sengaja punya nilai bawaan dari `bagiHasil.ts`
 * (`POTONGAN_ADMIN_DEFAULT_PERSEN`) supaya tarifnya hanya hidup di satu tempat,
 * walaupun dasar pengenaannya di kartu ini berbeda (lihat catatan di kepala
 * berkas).
 *
 * Melempar bila pokok bukan rupiah bulat positif atau di luar batas bisnis
 * (`LOAN_LIMITS`) — kartu admin tidak boleh menggambar contoh pinjaman yang
 * tidak bisa diajukan nasabah.
 */
export function rincianAliranDana(
  pokok: Rupiah = POKOK_CONTOH_RINCIAN,
  persenPotonganPenyedia: number = POTONGAN_ADMIN_DEFAULT_PERSEN,
): RincianAliranDana {
  // Batas bisnis diperiksa lebih dulu: kartu admin tidak boleh menggambar
  // contoh pinjaman yang tidak mungkin diajukan nasabah.
  assertPokokPinjamanValid(pokok);

  // Setengah pertama memakai mesin harga yang sama dengan akad & tagihan.
  const q = quoteLoan(pokok);

  const potonganPenyedia = percentOf(q.totalKewajibanPelunasan, persenPotonganPenyedia);
  const diterimaPenyedia = q.totalKewajibanPelunasan - potonganPenyedia;

  return {
    pokok: q.pokok,
    persenPotonganDiMuka: PINDAI_PRICING.upfrontDeductionPercent,
    potonganDiMuka: q.totalPotonganDiMuka,
    diterimaPeminjam: q.danaBersihDitransfer,
    persenImbalHasil: PINDAI_PRICING.bungaPercent,
    imbalHasil: q.bunga,
    totalKembali: q.totalKewajibanPelunasan,
    persenPotonganPenyedia,
    potonganPenyedia,
    diterimaPenyedia,
    imbalBersihPenyedia: diterimaPenyedia - q.pokok,
    pendapatanPlatform: q.totalPotonganDiMuka + potonganPenyedia,
  };
}

/** Label rupiah yang selalu menyebut arah uangnya ("−" untuk potongan). */
export function labelPotonganRincian(nilai: Rupiah): string {
  return `− ${formatRupiah(nilai)}`;
}

/**
 * Rincian sebagai baris siap-tampil: label, nilai, dan arah uang.
 * Dipisahkan dari komponen supaya urutan & teksnya bisa diuji tanpa React.
 */
export type BarisRincian = {
  label: string;
  nilai: Rupiah;
  /** `masuk` ke peminjam/penyedia, `keluar` dari penerimaan, `total` penjumlahan. */
  arah: "kotor" | "potongan" | "bersih" | "total";
};

/** Baris rincian dalam urutan yang ditampilkan kartu admin. */
export function barisRincianAliran(r: RincianAliranDana): BarisRincian[] {
  return [
    { label: "Pokok pinjaman", nilai: r.pokok, arah: "kotor" },
    {
      label: `Potongan di muka ${r.persenPotonganDiMuka}% (biaya admin)`,
      nilai: r.potonganDiMuka,
      arah: "potongan",
    },
    { label: "Diterima peminjam", nilai: r.diterimaPeminjam, arah: "bersih" },
    {
      label: `Kembali (pokok + Imbal Hasil ${r.persenImbalHasil}%)`,
      nilai: r.totalKembali,
      arah: "total",
    },
    {
      label: `Potongan ${r.persenPotonganPenyedia}% dari uang yang kembali`,
      nilai: r.potonganPenyedia,
      arah: "potongan",
    },
    { label: "Diterima penyedia dana", nilai: r.diterimaPenyedia, arah: "bersih" },
    { label: "Imbal Hasil bersih penyedia dana", nilai: r.imbalBersihPenyedia, arah: "bersih" },
    { label: "Pendapatan platform", nilai: r.pendapatanPlatform, arah: "total" },
  ];
}
