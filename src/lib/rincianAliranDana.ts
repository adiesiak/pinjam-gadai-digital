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
 * | Potongan pendana 5% | 5% × total yang kembali | Rp65.000 |
 * | Diterima pendana | total kembali − potongan | Rp1.235.000 |
 * | Imbal Hasil bersih pendana | diterima − pokok | Rp235.000 |
 * | Pendapatan platform | potongan di muka + potongan pendana | Rp85.000 |
 *
 * SATU PINTU UANG (penting): kedua paruh rincian ini diambil dari mesin uang
 * yang sama dengan yang menagih dan membukukan, bukan dihitung ulang di UI:
 *  - paruh pertama dari `quoteLoan` (lib/loan.ts) — potongan di muka, dana
 *    bersih, bunga, dan total kembali yang tercetak di akad;
 *  - paruh kedua dari `bagiHasilPinjaman` (lib/bagiHasil.ts) — potongan
 *    platform dan hak pendana yang **persis sama** dengan yang dijurnal
 *    `convex/loans.ts` saat pelunasan dan ditampilkan ruang pendana.
 *
 * Kalau kedua mesin itu suatu saat berbeda, fungsi ini MELEMPAR (lihat
 * `pastikanMesinSepakat`) alih-alih menggambar angka yang tidak akan pernah
 * dibayar.
 */

import {
  bagiHasilPinjaman,
  bagiHasilPinjamanDari,
  POTONGAN_ADMIN_DEFAULT_PERSEN,
} from "./bagiHasil";
import { biayaEkspres } from "./ekonomiPlatform";
import {
  LOAN_LIMITS,
  PINDAI_PRICING,
  assertPokokPinjamanValid,
  quoteLoan,
  tarifBiayaAman,
  type TarifBiaya,
} from "./loan";
import { formatRupiah, percentOf, type Rupiah } from "./money";

/**
 * Contoh yang ditampilkan kartu: pinjaman terbesar yang boleh diajukan.
 * Diambil dari batas bisnis, bukan angka yang ditulis di komponen.
 */
export const POKOK_CONTOH_RINCIAN: Rupiah = LOAN_LIMITS.maxPokok;

/**
 * Pokok yang bisa dipilih admin di kartu (semua di dalam batas bisnis).
 * Dipakai selector kartu supaya admin bisa memeriksa perjalanan uang pada
 * nominal kecil, menengah, dan maksimum — bukan hanya satu contoh.
 */
export const PILIHAN_POKOK_RINCIAN: readonly Rupiah[] = [
  LOAN_LIMITS.minPokok,
  250_000,
  500_000,
  750_000,
  LOAN_LIMITS.maxPokok,
].filter(
  (pokok, index, daftar) =>
    pokok >= LOAN_LIMITS.minPokok &&
    pokok <= LOAN_LIMITS.maxPokok &&
    daftar.indexOf(pokok) === index,
);

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
  /** Potongan di muka dalam rupiah (biaya admin + asuransi, dibayar dari pokok). */
  potonganDiMuka: Rupiah;
  /** Bagian asuransi dari potongan di muka; 0 bila asuransi tidak dipakai. */
  biayaAsuransi: Rupiah;
  /** Dana yang benar-benar diterima peminjam = pokok − potongan di muka. */
  diterimaPeminjam: Rupiah;
  /** Imbal Hasil (bunga) pendana, persen flat dari pokok (30%). */
  persenImbalHasil: number;
  /** Imbal Hasil (bunga) dalam rupiah. */
  imbalHasil: Rupiah;
  /** Total yang kembali dari peminjam = pokok + Imbal Hasil (130%). */
  totalKembali: Rupiah;
  /** Persen potongan platform atas uang yang kembali (5%). */
  persenPotonganPenyedia: number;
  /** Potongan platform = persen × total yang kembali (pembulatan ke bawah). */
  potonganPenyedia: Rupiah;
  /** Uang yang diterima pendana = total kembali − potongan. */
  diterimaPenyedia: Rupiah;
  /** Imbal Hasil bersih pendana = diterima pendana − pokok. */
  imbalBersihPenyedia: Rupiah;
  /** Total jasa platform satu pinjaman = potongan di muka + potongan penyedia. */
  pendapatanPlatform: Rupiah;
  /**
   * Pinjaman ini dikenai biaya pencairan ekspres? Peminjam boleh melepasnya,
   * jadi label rincian tidak boleh selalu menyebut "+ ekspres".
   */
  adaEkspres: boolean;
};

/** Bentuk minimal pinjaman yang dibutuhkan rincian ini. */
export type PinjamanRincian = {
  pokokPinjaman: Rupiah;
};

/**
 * Penjaga mesin: harga (lib/loan) dan bagi hasil (lib/bagiHasil) harus
 * mengucapkan angka yang sama untuk pinjaman yang sama. Bila tidak, kartu
 * admin lebih baik gagal terang-terangan daripada menampilkan janji yang tidak
 * pernah dibayar.
 */
function pastikanMesinSepakat(
  tagihan: ReturnType<typeof quoteLoan>,
  bagi: ReturnType<typeof bagiHasilPinjaman>,
): void {
  if (tagihan.bunga !== bagi.bunga) {
    throw new Error(
      `Mesin uang tidak sepakat: Imbal Hasil akad ${formatRupiah(tagihan.bunga)} vs bagi hasil ${formatRupiah(bagi.bunga)}.`,
    );
  }
  if (tagihan.totalKewajibanPelunasan !== bagi.totalLunas) {
    throw new Error(
      `Mesin uang tidak sepakat: kewajiban ${formatRupiah(tagihan.totalKewajibanPelunasan)} vs uang yang kembali ${formatRupiah(bagi.totalLunas)}.`,
    );
  }
}

/**
 * Rincian aliran uang satu pinjaman.
 *
 * `persenPotonganPenyedia` sengaja punya nilai bawaan dari `bagiHasil.ts`
 * (`POTONGAN_ADMIN_DEFAULT_PERSEN`) supaya tarifnya hanya hidup di satu tempat —
 * kartu, ruang pendana, dan ledger memakai tarif yang sama.
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

  // Paruh pertama dari mesin harga yang sama dengan akad & tagihan…
  const q = quoteLoan(pokok);
  // …paruh kedua dari mesin bagi hasil yang sama dengan ledger saat pelunasan.
  const bagi = bagiHasilPinjaman(
    pokok,
    PINDAI_PRICING.bungaPercent,
    persenPotonganPenyedia,
  );
  pastikanMesinSepakat(q, bagi);

  return {
    pokok: q.pokok,
    persenPotonganDiMuka: PINDAI_PRICING.upfrontDeductionPercent,
    potonganDiMuka: q.totalPotonganDiMuka,
    biayaAsuransi: q.biayaAsuransi,
    diterimaPeminjam: q.danaBersihDitransfer,
    persenImbalHasil: PINDAI_PRICING.bungaPercent,
    imbalHasil: bagi.bunga,
    totalKembali: bagi.totalLunas,
    persenPotonganPenyedia,
    potonganPenyedia: bagi.potonganAdmin,
    diterimaPenyedia: bagi.pendanaTerima,
    imbalBersihPenyedia: bagi.keuntunganPendana,
    pendapatanPlatform: q.totalPotonganDiMuka + bagi.potonganAdmin,
    // Contoh kebijakan memakai pinjaman yang mencentang cair ekspres.
    adaEkspres: true,
  };
}

/**
 * Kalimat ringkas kebijakan untuk kartu admin: apa yang dipotong di muka,
 * berapa yang kembali, dan dari apa potongan platform diambil. Dipisahkan dari
 * komponen supaya bisa diuji tanpa React dan supaya tidak ada angka yang
 * ditulis ulang di JSX.
 */
export function kalimatContohAliran(r: RincianAliranDana): string {
  return (
    `Contoh satu pinjaman ${formatRupiah(r.pokok)}: dipotong admin ` +
    `${r.persenPotonganDiMuka}% + biaya ekspres di muka, kembali ${r.persenImbalHasil + 100}% ` +
    `dari pokok, lalu dipotong ${r.persenPotonganPenyedia}% dari uang yang kembali.`
  );
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
  /** `masuk` ke peminjam/pendana, `keluar` dari penerimaan, `total` penjumlahan. */
  arah: "kotor" | "potongan" | "bersih" | "total";
};

/**
 * Baris rincian dalam urutan yang ditampilkan kartu admin.
 *
 * `tenorBulan` hanya mengubah LABEL baris kembali: pada skema bulanan angka
 * Imbal Hasil adalah total selama tenor, jadi menulis "Imbal Hasil 10%" (tarif
 * per bulan) di sebelah rupiah total tenor akan menyesatkan admin.
 */
export function barisRincianAliran(
  r: RincianAliranDana,
  opsi: { tenorBulan?: number | null } = {},
): BarisRincian[] {
  const tenorBulan = opsi.tenorBulan ?? null;
  const labelKembali =
    tenorBulan === null
      ? `Kembali (pokok + Imbal Hasil ${r.persenImbalHasil}%)`
      : `Kembali (pokok + Imbal Hasil ${tenorBulan} bulan @${r.persenImbalHasil}%)`;
  return [
    { label: "Pokok pinjaman", nilai: r.pokok, arah: "kotor" },
    {
      label: `Potongan di muka (admin ${r.persenPotonganDiMuka}%${r.biayaAsuransi > 0 ? " + asuransi" : ""}${r.adaEkspres ? " + ekspres" : ""})`,
      nilai: r.potonganDiMuka,
      arah: "potongan",
    },
    { label: "Diterima peminjam", nilai: r.diterimaPeminjam, arah: "bersih" },
    { label: labelKembali, nilai: r.totalKembali, arah: "total" },
    {
      label: `Potongan ${r.persenPotonganPenyedia}% dari uang yang kembali`,
      nilai: r.potonganPenyedia,
      arah: "potongan",
    },
    { label: "Diterima pendana", nilai: r.diterimaPenyedia, arah: "bersih" },
    { label: "Imbal Hasil bersih pendana", nilai: r.imbalBersihPenyedia, arah: "bersih" },
    { label: "Pendapatan platform", nilai: r.pendapatanPlatform, arah: "total" },
  ];
}

/**
 * Rincian satu pinjaman NYATA (bukan contoh kebijakan) — dipakai detail
 * pinjaman di panel admin, supaya admin melihat persis angka yang akan
 * dibukukan untuk pinjaman yang sedang dibuka.
 *
 * Menghormati snapshot bunga nasabah dan skema tenornya: pinjaman bulanan
 * dihitung dari `bagiHasilPinjamanDari`, pinjaman harian dari harga akad.
 * Label persennya memakai tarif yang benar-benar berlaku pada pinjaman itu.
 */
export function rincianPinjamanNyata(
  pinjaman: {
    pokokPinjaman: Rupiah;
    tenorBulan?: number | null;
    persenBunga?: number | null;
    /** Centang cair ekspres peminjam; kosong = data lama (ekspres dipakai). */
    cairEkspres?: boolean | null;
    /** Snapshot tarif potongan di muka; kosong = tarif bawaan. */
    tarifBiaya?: Partial<TarifBiaya> | null;
  },
  persenPotonganPenyedia: number = POTONGAN_ADMIN_DEFAULT_PERSEN,
): RincianAliranDana {
  const pokok = pinjaman.pokokPinjaman;
  const harian = pinjaman.tenorBulan === null || pinjaman.tenorBulan === undefined;
  const tarif = tarifBiayaAman(pinjaman.tarifBiaya);
  const pakaiEkspres = harian && pinjaman.cairEkspres !== false;
  // Data warisan dengan pokok tidak sah tetap ditampilkan apa adanya (tanpa
  // perhitungan), sama seperti ruang pendana — satu baris aneh tidak
  // boleh merobohkan detail pinjaman admin.
  if (!Number.isSafeInteger(pokok) || pokok <= 0) {
    const nol = 0;
    return {
      pokok,
      persenPotonganDiMuka: tarif.adminPersen,
      potonganDiMuka: nol,
      biayaAsuransi: nol,
      diterimaPeminjam: pokok,
      persenImbalHasil: pinjaman.persenBunga ?? PINDAI_PRICING.bungaPercent,
      imbalHasil: nol,
      totalKembali: pokok,
      persenPotonganPenyedia,
      potonganPenyedia: nol,
      diterimaPenyedia: pokok,
      imbalBersihPenyedia: nol,
      pendapatanPlatform: nol,
      adaEkspres: pakaiEkspres,
    };
  }
  // Pinjaman harian dikenai biaya pencairan ekspres bila peminjam mencentangnya;
  // skema bulanan tidak pernah. Dihitung dari mesin yang sama dengan pencairan.
  const biayaAsuransi = percentOf(pokok, tarif.asuransiPersen);
  const potonganDiMuka =
    percentOf(pokok, tarif.adminPersen) +
    biayaAsuransi +
    (pakaiEkspres ? biayaEkspres(pokok, tarif.ekspres) : 0);
  const bagi = bagiHasilPinjamanDari(pinjaman, persenPotonganPenyedia);
  return {
    pokok,
    persenPotonganDiMuka: tarif.adminPersen,
    potonganDiMuka,
    biayaAsuransi,
    diterimaPeminjam: pokok - potonganDiMuka,
    persenImbalHasil: pinjaman.persenBunga ?? PINDAI_PRICING.bungaPercent,
    imbalHasil: bagi.bunga,
    totalKembali: bagi.totalLunas,
    persenPotonganPenyedia,
    potonganPenyedia: bagi.potonganAdmin,
    diterimaPenyedia: bagi.pendanaTerima,
    imbalBersihPenyedia: bagi.keuntunganPendana,
    pendapatanPlatform: potonganDiMuka + bagi.potonganAdmin,
    adaEkspres: pakaiEkspres,
  };
}
