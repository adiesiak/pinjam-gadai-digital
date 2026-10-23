/**
 * PINDAI — Loan Pricing Engine (pure functions, integer rupiah only).
 *
 * Rule 3 of the guardrails: no float money math. Every derived value is an
 * exact integer rupiah computed with BigInt half-up rounding.
 */
import { hitungSimulasiBulanan, type TarifBulanan } from "./bulanan";
import {
  biayaEkspres,
  TARIF_EKSPRES_DEFAULT,
  type TarifEkspres,
} from "./ekonomiPlatform";
import { formatRupiah, percentOf, type Rupiah } from "./money";

export const PINDAI_PRICING = {
  adminFeePercent: 2,
  /**
   * Biaya platform dihapus (0%): seluruh potongan di muka sekarang hanya
   * biaya admin 2%. Field ini dipertahankan agar `biayaPlatform` tetap punya
   * satu sumber kebenaran (rupiah bulat nol) dan tidak perlu dihapus dari
   * kontrak/UI yang sudah menampilkan rinciannya.
   */
  platformFeePercent: 0,
  /** Total upfront deduction = Admin 2% + Platform 0% = 2%. */
  upfrontDeductionPercent: 2,
  /** Net disbursement is 98% of principal. */
  netDisbursementPercent: 98,
  /** Tarif bunga DASAR 30% dari pokok (dipakai tenor 7 hari & fallback). */
  bungaPercent: 30,
  /** Total kewajiban pada tarif dasar = 130% dari pokok. */
  totalRepaymentPercent: 130,
} as const;

/**
 * Batas bisnis pinjaman tunai (Skema A) — dipakai klien DAN server agar
 * validasi tidak bisa dilewati dari UI.
 */
export const LOAN_LIMITS = {
  minPokok: 100_000,
  /** Batas bawaan produk harian — plafon nasabah baru dan nasabah teruji. */
  maxPokok: 1_000_000,
  /**
   * Langit-langit pokok harian saat admin memberi plafon khusus.
   *
   * Batas per nasabah tetap PLAFON TERSEDIA (`lib/plafon.ts`); angka ini hanya
   * pagar teratasnya dan sama dengan batas penyimpanan plafon admin. Tanpa
   * plafon khusus, `maxPokok` yang berlaku.
   */
  maxPokokPlafon: 10_000_000,
  /** Tenor pinjaman harian maksimum 28 hari (4 minggu). */
  maxTenorHari: 28,
} as const;

/** Tenor pinjaman dalam hari — dipilih nasabah saat mengajukan (maks 28 hari). */
export const TENOR_OPTIONS = [7, 14, 28] as const;
export type Tenor = (typeof TENOR_OPTIONS)[number];

/**
 * Matriks tenor & bunga pinjaman HARIAN.
 *
 * Aturan produk yang dijaga di sini (berlaku sama di klien dan server):
 *  - Tier 1, pokok di bawah Rp500.000: 7 hari 30%, 14 hari 35%, 28 hari 40%.
 *  - Tier 2, pokok Rp500.000 sampai di bawah Rp1.000.000: 7 hari 28%,
 *    14 hari 32%, 28 hari 35%.
 *  - Tier 3, pokok Rp1.000.000 ke atas: 7 hari 26%, 14 hari 28%, 28 hari 30%.
 *
 * Tier teratas terbuka sampai `maxPokokPlafon` karena admin dapat memberi
 * plafon khusus di atas batas bawaan Rp1 juta. Tanpa plafon khusus, plafon
 * nasabah sendiri (Rp500 ribu/Rp1 juta) yang menahan pokoknya lebih dulu.
 *
 * Tenor 30 hari bukan pilihan produk; tenor resmi hanya 7, 14, dan 28 hari.
 * Kombinasi di luar baris matriks ditolak server, bukan sekadar disembunyikan.
 */
const MATRIKS_HARIAN: readonly {
  /** Batas bawah inklusif. */
  readonly minPokok: Rupiah;
  /** Batas atas inklusif. */
  readonly maksPokok: Rupiah;
  readonly tenorDefault: Tenor;
  readonly tarif: readonly { readonly tenor: Tenor; readonly persenBunga: number }[];
}[] = [
  {
    minPokok: 100_000,
    maksPokok: 499_999,
    tenorDefault: 7,
    tarif: [
      { tenor: 7, persenBunga: 30 },
      { tenor: 14, persenBunga: 35 },
      { tenor: 28, persenBunga: 40 },
    ],
  },
  {
    minPokok: 500_000,
    maksPokok: 999_999,
    tenorDefault: 14,
    tarif: [
      { tenor: 7, persenBunga: 28 },
      { tenor: 14, persenBunga: 32 },
      { tenor: 28, persenBunga: 35 },
    ],
  },
  {
    minPokok: 1_000_000,
    maksPokok: LOAN_LIMITS.maxPokokPlafon,
    tenorDefault: 28,
    tarif: [
      { tenor: 7, persenBunga: 26 },
      { tenor: 14, persenBunga: 28 },
      { tenor: 28, persenBunga: 30 },
    ],
  },
] as const;

/** Baris matriks yang berlaku untuk satu pokok; `null` bila di luar batas produk. */
function barisMatriksHarian(pokok: number) {
  if (!Number.isSafeInteger(pokok)) return null;
  return (
    MATRIKS_HARIAN.find((baris) => pokok >= baris.minPokok && pokok <= baris.maksPokok) ??
    null
  );
}

/** Tenor yang boleh dipilih untuk satu nominal, urut naik. */
export function tenorHarianTersedia(pokok: number): readonly Tenor[] {
  const baris = barisMatriksHarian(pokok);
  return baris === null ? TENOR_OPTIONS : baris.tarif.map((barisTarif) => barisTarif.tenor);
}

/** Tenor bawaan untuk satu nominal; 28 hari bila nominal belum valid. */
export function tenorHarianDefault(pokok: number): Tenor {
  return barisMatriksHarian(pokok)?.tenorDefault ?? 28;
}

/**
 * Sesuaikan tenor lama ke pilihan terdekat yang sah. Ketiga tenor berlaku di
 * semua tier, jadi fungsi ini hanya menggeser nilai di luar 7/14/28 hari
 * (mis. data lama 30 hari).
 */
export function sesuaikanTenorHarian(pokok: number, tenor: number): Tenor {
  const opsi = tenorHarianTersedia(pokok);
  if ((opsi as readonly number[]).includes(tenor)) return tenor as Tenor;
  return opsi.reduce((terbaik, kandidat) =>
    Math.abs(kandidat - tenor) < Math.abs(terbaik - tenor) ? kandidat : terbaik,
  );
}

/** Persentase bunga untuk kombinasi nominal & tenor; `null` bila tidak sah. */
export function persenBungaHarian(pokok: number, tenor: number): number | null {
  const baris = barisMatriksHarian(pokok);
  return baris?.tarif.find((tarif) => tarif.tenor === tenor)?.persenBunga ?? null;
}

/**
 * Validasi kombinasi nominal & tenor versi server — mengembalikan pesan siap
 * tampil, atau `null` bila kombinasi sah.
 */
export function validasiTenorHarian(
  pokok: number,
  tenor: number,
  /** Batas atas pokok yang berlaku (plafon tersedia); bawaan batas produk. */
  maks: Rupiah = LOAN_LIMITS.maxPokok as Rupiah,
): string | null {
  assertPokokPinjamanValid(pokok, maks);
  const opsi = tenorHarianTersedia(pokok);
  if (!(opsi as readonly number[]).includes(tenor)) {
    return `Untuk nominal ${formatRupiah(pokok)}, tenor yang tersedia ${opsi.join(
      " / ",
    )} hari.`;
  }
  return null;
}

/**
 * Validasi pokok pinjaman terhadap batas bisnis — satu sumber kebenaran untuk
 * form Peminjam dan mutation createLoanApplication.
 *
 * `maks` diisi PLAFON TERSEDIA nasabah oleh pemanggil yang sudah membacanya,
 * sehingga pokok di atas batas bawaan Rp1 juta hanya lolos bila plafon khusus
 * memang menutupnya. Tanpa `maks`, batas produk bawaan yang berlaku.
 */
export function assertPokokPinjamanValid(
  pokok: Rupiah,
  maks: Rupiah = LOAN_LIMITS.maxPokok as Rupiah,
): void {
  if (!Number.isSafeInteger(pokok) || pokok <= 0) {
    throw new Error("Pokok pinjaman harus rupiah bulat positif (tanpa desimal).");
  }
  if (pokok < LOAN_LIMITS.minPokok || pokok > maks) {
    throw new Error(
      `Pokok pinjaman harus antara ${formatRupiah(LOAN_LIMITS.minPokok)} dan ${formatRupiah(maks)}.`,
    );
  }
}

/**
 * Tenor default untuk data warisan (pinjaman pra-tenor, termasuk baris lama
 * 30 hari). Bukan pilihan tenor baru — daftar pilihan ada di `TENOR_OPTIONS`.
 */
export const DEFAULT_TENOR_HARI = 30;

/**
 * Kebijakan denda keterlambatan (dihitung server, integer exact):
 * - 2% dari pokok pinjaman per hari keterlambatan;
 * - dibatasi maksimum 100% dari pokok (pada 2%/hari berarti 50 hari).
 * Tidak ada grace period: jatuh tempo dilewati satu hari penuh = denda 1 hari.
 */
export const LATE_FEE_POLICY = {
  percentPerDay: 2,
  maxPercent: 100,
} as const;

/**
 * Hari denda maksimum untuk satu tarif harian: cap 100% dari pokok dibagi
 * tarifnya. Tarif 0 (atau tidak wajar) berarti tidak ada hari denda, sehingga
 * denda bisa dimatikan tanpa mengubah tenor atau bunga.
 */
export function maxHariDenda(persenPerHari: number): number {
  if (!Number.isFinite(persenPerHari) || persenPerHari <= 0) return 0;
  return Math.floor(LATE_FEE_POLICY.maxPercent / persenPerHari);
}

/** Hari denda maksimum pada tarif bawaan (50 hari untuk 2%/hari). */
export const MAX_LATE_DAYS = maxHariDenda(LATE_FEE_POLICY.percentPerDay);

const DAY_MS = 86_400_000;

export interface LoanQuote {
  /** Pokok Pinjaman */
  pokok: Rupiah;
  /** Biaya Admin — 2% dari pokok */
  biayaAdmin: Rupiah;
  /** Biaya Layanan Platform — 0% dari pokok (dihapus dari potongan di muka) */
  biayaPlatform: Rupiah;
  /**
   * Biaya asuransi — persen dari pokok, dipotong di muka. Bawaan 0% (tidak
   * dipotong); admin dapat menyalakannya dari Pengaturan Parameter Bisnis.
   */
  biayaAsuransi: Rupiah;
  /**
   * Biaya pencairan ekspres — flat Rp5.000–Rp10.000 sekali per pinjaman baru.
   * Hanya dikenakan bila peminjam mencentang cair ekspres; tanpa centang
   * nilainya 0. Bukan bunga dan tidak menambah kewajiban.
   */
  biayaExpress: Rupiah;
  /**
   * Potongan biaya admin dari voucher, dibatasi biaya admin yang ada. Nol bila
   * pinjaman tidak memakai voucher.
   */
  diskonAdmin: Rupiah;
  /** Total Potongan di Muka — admin (setelah voucher) + asuransi + ekspres */
  totalPotonganDiMuka: Rupiah;
  /** Dana Bersih Ditransfer — pokok − seluruh potongan di muka */
  danaBersihDitransfer: Rupiah;
  /** Bunga Pinjaman — 30% (hak finansial penyedia dana) */
  bunga: Rupiah;
  /** Total Kewajiban Pelunasan — 130% */
  totalKewajibanPelunasan: Rupiah;
}

/**
 * Tarif potongan di muka yang berlaku untuk satu pinjaman.
 *
 * Disimpan sebagai snapshot pada pinjaman saat pengajuan, sama seperti
 * `persenBunga`: perubahan tarif admin hanya berlaku untuk pengajuan BERIKUTNYA,
 * bukan mengubah kontrak yang sudah terbit.
 */
export type TarifBiaya = {
  /** Biaya admin (% dari pokok). */
  adminPersen: number;
  /** Biaya asuransi (% dari pokok); 0 = tidak dipotong. */
  asuransiPersen: number;
  /** Nominal biaya pencairan ekspres per tier pokok. */
  ekspres: TarifEkspres;
};

/** Tarif bawaan = perilaku sebelum tarif bisa diatur admin. */
export const TARIF_BIAYA_DEFAULT: TarifBiaya = {
  adminPersen: PINDAI_PRICING.adminFeePercent,
  asuransiPersen: 0,
  ekspres: TARIF_EKSPRES_DEFAULT,
};

/** Lengkapi tarif tersimpan yang dibuat sebelum kolom baru ada. */
export function tarifBiayaAman(tarif: Partial<TarifBiaya> | null | undefined): TarifBiaya {
  return {
    adminPersen: tarif?.adminPersen ?? TARIF_BIAYA_DEFAULT.adminPersen,
    asuransiPersen: tarif?.asuransiPersen ?? TARIF_BIAYA_DEFAULT.asuransiPersen,
    ekspres: {
      tier1: tarif?.ekspres?.tier1 ?? TARIF_BIAYA_DEFAULT.ekspres.tier1,
      tier2: tarif?.ekspres?.tier2 ?? TARIF_BIAYA_DEFAULT.ekspres.tier2,
      tier3: tarif?.ekspres?.tier3 ?? TARIF_BIAYA_DEFAULT.ekspres.tier3,
    },
  };
}

/** Susun tarif dari angka konfigurasi admin. */
export function tarifBiayaDariAngka(angka: {
  adminPersen: number;
  asuransiPersen: number;
  ekspres1: number;
  ekspres2: number;
  ekspres3: number;
}): TarifBiaya {
  return tarifBiayaAman({
    adminPersen: angka.adminPersen,
    asuransiPersen: angka.asuransiPersen,
    ekspres: { tier1: angka.ekspres1, tier2: angka.ekspres2, tier3: angka.ekspres3 },
  });
}

/**
 * Pilihan yang mengubah komponen potongan di muka.
 *
 * `ekspres` berasal dari centang peminjam: `false` berarti pencairan biasa,
 * jadi tidak ada biaya ekspres. Kosong = perilaku lama (ekspres dipakai).
 * `tarif` berasal dari Pengaturan Parameter Bisnis (atau snapshot pinjaman).
 */
export type OpsiQuote = {
  ekspres?: boolean;
  tarif?: TarifBiaya;
  /**
   * Potongan biaya admin dari voucher (rupiah bulat). Server mengirim angka
   * yang sudah divalidasi; mesin ini hanya menjepitnya ke biaya admin yang
   * benar-benar ada, sehingga voucher tidak pernah menjadi uang tunai.
   */
  diskonAdmin?: Rupiah;
};

export function quoteLoan(pokok: Rupiah, opsi: OpsiQuote = {}): LoanQuote {
  return quoteLoanDenganPersen(
    pokok,
    {
      admin: PINDAI_PRICING.adminFeePercent,
      platform: PINDAI_PRICING.platformFeePercent,
      bunga: PINDAI_PRICING.bungaPercent,
    },
    opsi,
  );
}

/** Quote skema harian dengan bunga khusus nasabah (persen, mis. 30 → 130%). */
export function quoteLoanBunga(
  pokok: Rupiah,
  persenBunga: number,
  opsi: OpsiQuote = {},
): LoanQuote {
  return quoteLoanDenganPersen(
    pokok,
    {
      admin: PINDAI_PRICING.adminFeePercent,
      platform: PINDAI_PRICING.platformFeePercent,
      bunga: persenBunga,
    },
    opsi,
  );
}

/**
 * Quote satu pinjaman HARIAN menghormati snapshot bunga per nasabah.
 * Kosong = perilaku lama (bunga 30% dari Pengaturan Sistem).
 */
export function quotePinjaman(loan: {
  pokokPinjaman: Rupiah;
  persenBunga?: number;
  /** Centang "cair ekspres" saat pengajuan; kosong = data lama (ekspres). */
  cairEkspres?: boolean;
  /** Tarif potongan yang dibekukan saat pengajuan; kosong = tarif bawaan. */
  tarifBiaya?: Partial<TarifBiaya> | null;
  /** Potongan biaya admin dari voucher yang dibekukan pada pinjaman ini. */
  voucherDiskon?: number;
}): LoanQuote {
  // Data lama tidak punya kolom ini dan dulu selalu dikenai biaya ekspres —
  // `!== false` menjaga angka kontrak lama tetap sama.
  const opsi: OpsiQuote = {
    ekspres: loan.cairEkspres !== false,
    tarif: tarifBiayaAman(loan.tarifBiaya),
    ...(loan.voucherDiskon !== undefined ? { diskonAdmin: loan.voucherDiskon } : {}),
  };
  return loan.persenBunga === undefined
    ? quoteLoan(loan.pokokPinjaman, opsi)
    : quoteLoanBunga(loan.pokokPinjaman, loan.persenBunga, opsi);
}

/**
 * Simulasi BULANAN satu pinjaman menghormati snapshot bunga per nasabah
 * (dipakai sebagai bunga per bulan); kosong = tarif tenor bawaan.
 */
export function simulasiBulananPinjaman(loan: {
  pokokPinjaman: Rupiah;
  tenorBulan: number;
  persenBunga?: number;
  /** Snapshot tarif bulanan pinjaman; kosong = tarif bawaan. */
  tarifBulanan?: TarifBulanan | null;
}): ReturnType<typeof hitungSimulasiBulanan> {
  return hitungSimulasiBulanan(loan.pokokPinjaman, loan.tenorBulan, {
    ...(loan.persenBunga === undefined ? {} : { persenBungaPerBulan: loan.persenBunga }),
    tarif: loan.tarifBulanan ?? null,
  });
}

/**
 * Kalkulasi dengan persentase dinamis dari Pengaturan System (admin).
 * Angka tetap rupiah bulat — pembulatan per komponen, sisa ke platform.
 */
export function quoteLoanDenganPersen(
  pokok: Rupiah,
  persen: { admin: number; platform: number; bunga: number },
  opsi: OpsiQuote = {},
): LoanQuote {
  if (!Number.isSafeInteger(pokok) || pokok <= 0) {
    throw new Error("Pokok pinjaman harus rupiah bulat positif.");
  }
  const tarif = opsi.tarif ?? TARIF_BIAYA_DEFAULT;
  const biayaAdmin = percentOf(pokok, tarif.adminPersen ?? persen.admin);
  const biayaPlatform = percentOf(pokok, persen.platform);
  const biayaAsuransi = percentOf(pokok, tarif.asuransiPersen);
  const biayaExpress =
    opsi.ekspres === false ? 0 : biayaEkspres(pokok, tarif.ekspres);
  // Voucher dibebankan pada biaya admin, bukan pada pokok: plafon yang terpakai
  // tetap sebesar pokok, dan kewajiban pelunasan tidak berubah.
  const diskonAdmin = Math.min(
    biayaAdmin,
    Math.max(0, Math.floor(opsi.diskonAdmin ?? 0)),
  ) as Rupiah;
  const totalPotonganDiMuka =
    biayaAdmin - diskonAdmin + biayaPlatform + biayaAsuransi + biayaExpress;
  const danaBersihDitransfer = pokok - totalPotonganDiMuka;
  if (danaBersihDitransfer <= 0) {
    throw new Error("Potongan di muka melebihi pokok pinjaman.");
  }
  const bunga = percentOf(pokok, persen.bunga);
  const totalKewajibanPelunasan = pokok + bunga;

  return {
    pokok,
    biayaAdmin,
    diskonAdmin,
    biayaPlatform,
    biayaAsuransi,
    biayaExpress,
    totalPotonganDiMuka,
    danaBersihDitransfer,
    bunga,
    totalKewajibanPelunasan,
  };
}

/**
 * Re-derive a quote from a stored principal. Used by getLoan / listMyLoans to
 * avoid storing duplicated fee fields; pricing is computed, never guessed.
 */
export function requote(pokok: Rupiah, opsi: OpsiQuote = {}): LoanQuote {
  return quoteLoan(pokok, opsi);
}

export interface RepaymentQuote extends LoanQuote {
  /** Tenor pinjaman (hari) sejak pendanaan. */
  tenor: number;
  /** Batas akhir pelunasan (epoch ms) = didanaiPada + tenor hari. */
  jatuhTempoPada: number;
  /** Sisa hari sebelum jatuh tempo; 0 bila sudah lewat/today. */
  sisaHari: number;
  /** Hari keterlambatan penuh sejak jatuh tempo (0 = belum terlambat). */
  hariTerlambat: number;
  /** Denda keterlambatan rupiah bulat (0 bila belum terlambat). */
  dendaTerlambat: Rupiah;
  /** Total kewajiban 130% + denda — jumlah yang harus dibayar sekarang. */
  totalKewajibanDenganPenalti: Rupiah;
}

/**
 * Hitung kewajiban pelunasan live untuk pinjaman yang sudah didanai.
 * Semua turunan (jatuh tempo, keterlambatan, denda) dihitung dari data
 * tersimpan — tidak pernah diinput klien — dengan aritmetika integer exact:
 * denda = pokok × (2% × hari) dibulatkan HALF-UP per rupiah.
 */
export function calculateRepayment(
  pokok: Rupiah,
  tenor: number,
  didanaiPada: number,
  now: number,
  persenBunga?: number,
  /** Tarif denda per hari (% pokok); default kebijakan bawaan. */
  dendaPerHari: number = LATE_FEE_POLICY.percentPerDay,
): RepaymentQuote {
  const base = persenBunga === undefined ? quoteLoan(pokok) : quoteLoanBunga(pokok, persenBunga);
  if (!Number.isSafeInteger(tenor) || tenor <= 0) {
    throw new Error("Tenor harus bilangan bulat positif.");
  }
  if (!Number.isSafeInteger(didanaiPada) || didanaiPada <= 0) {
    throw new Error("Waktu pendanaan tidak valid.");
  }
  const jatuhTempoPada = didanaiPada + tenor * DAY_MS;
  const sisaMs = jatuhTempoPada - now;
  const sisaHari = Math.max(0, Math.ceil(sisaMs / DAY_MS));
  const hariTerlambat = Math.max(0, Math.floor(-sisaMs / DAY_MS));

  // Denda: tarif × pokok × hari, di-cap 100% dari pokok. Hari di-cap dulu agar
  // hasil tidak melewati kebijakan, berapa pun tarif yang dipasang admin.
  const hariDenda = Math.min(hariTerlambat, maxHariDenda(dendaPerHari));
  const dendaTerlambat =
    hariDenda === 0
      ? 0
      : percentOf(
          pokok,
          Math.min(dendaPerHari * hariDenda, LATE_FEE_POLICY.maxPercent),
        );

  return {
    ...base,
    tenor,
    jatuhTempoPada,
    sisaHari,
    hariTerlambat,
    dendaTerlambat,
    totalKewajibanDenganPenalti: base.totalKewajibanPelunasan + dendaTerlambat,
  };
}

/**
 * Ringkasan pelunasan satu pinjaman — SATU sumber kebenaran untuk kedua
 * skema: harian (130% flat) maupun bulanan (bunga flat dari pokok + biaya
 * dengan biaya dipotong di muka). Dipakai UI nasabah, portofolio penyedia dana,
 * panel admin, dan
 * pengingat WhatsApp agar angka yang dilihat semua pihak selalu sama.
 */
export interface PelunasanPinjaman {
  /** Batas akhir pelunasan (epoch ms). */
  jatuhTempoPada: number;
  /** Sisa hari sebelum jatuh tempo; 0 bila sudah lewat/hari ini. */
  sisaHari: number;
  /** Hari keterlambatan penuh (0 = belum terlambat). */
  hariTerlambat: number;
  /** Denda keterlambatan rupiah bulat (0 bila belum terlambat). */
  dendaTerlambat: Rupiah;
  /** Total kewajiban saat ini (termasuk denda). */
  totalKewajibanDenganPenalti: Rupiah;
  /** Total kewajiban tanpa denda. */
  totalKewajibanPelunasan: Rupiah;
  /**
   * Pokok yang masih berjalan pada periode ini — sisa pokok untuk pinjaman
   * yang sudah diperpanjang, pokok awal untuk pinjaman biasa. Dokumen yang
   * merinci tagihan memakai angka ini supaya barisnya menjumlah ke total.
   */
  pokokBerjalan?: Rupiah;
}

/** Satu bulan skema bulanan dihitung 30 hari, konsisten di server & UI. */
export const BULAN_MS = 30 * 86_400_000;

/**
 * Turunan pelunasan live untuk pinjaman yang sudah didanai. Skema bulanan
 * memakai total cicilan dari lib/bulanan dan denda flat yang sama
 * (2% pokok/hari, cap 100%). Mengembalikan null bila belum didanai.
 */
export function pelunasanPinjaman(
  loan: {
    pokokPinjaman: Rupiah;
    status: string;
    tenorHari?: number;
    tenorBulan?: number;
    didanaiPada?: number;
    /** Snapshot bunga per nasabah; kosong = default global. */
    persenBunga?: number;
    /** Snapshot tarif bulanan pinjaman; kosong = tarif bawaan. */
    tarifBulanan?: TarifBulanan | null;
    /** State perpanjangan: sisa pokok, jatuh tempo, dan bunga periode berjalan. */
    remainingPrincipal?: number;
    currentTierRate?: number;
    nextDueDate?: number;
    nextInterestAmount?: number;
  },
  now: number,
  /** Tarif denda per hari (% pokok); default kebijakan bawaan. */
  dendaPerHari: number = LATE_FEE_POLICY.percentPerDay,
): PelunasanPinjaman | null {
  if (loan.status !== "didanai" || loan.didanaiPada === undefined) {
    return null;
  }
  // Pinjaman yang sudah diperpanjang memakai state periode berjalan, bukan
  // tenor awal: pokoknya sisa pokok dan bunganya adalah bunga periode ini.
  if (
    loan.remainingPrincipal !== undefined &&
    loan.nextDueDate !== undefined &&
    loan.nextInterestAmount !== undefined
  ) {
    const pokok = loan.remainingPrincipal;
    const sisaMs = loan.nextDueDate - now;
    const sisaHari = Math.max(0, Math.ceil(sisaMs / DAY_MS));
    const hariTerlambat = Math.max(0, Math.floor(-sisaMs / DAY_MS));
    const hariDenda = Math.min(hariTerlambat, maxHariDenda(dendaPerHari));
    const dendaTerlambat =
      hariDenda === 0
        ? 0
        : percentOf(
            pokok,
            Math.min(dendaPerHari * hariDenda, LATE_FEE_POLICY.maxPercent),
          );
    const totalKewajibanPelunasan = pokok + loan.nextInterestAmount;
    return {
      jatuhTempoPada: loan.nextDueDate,
      sisaHari,
      hariTerlambat,
      dendaTerlambat,
      totalKewajibanDenganPenalti: totalKewajibanPelunasan + dendaTerlambat,
      totalKewajibanPelunasan,
      pokokBerjalan: pokok,
    };
  }
  if (loan.tenorBulan !== undefined) {
    const sim = simulasiBulananPinjaman({ ...loan, tenorBulan: loan.tenorBulan });
    const jatuhTempoPada = loan.didanaiPada + loan.tenorBulan * BULAN_MS;
    const sisaMs = jatuhTempoPada - now;
    const sisaHari = Math.max(0, Math.ceil(sisaMs / DAY_MS));
    const hariTerlambat = Math.max(0, Math.floor(-sisaMs / DAY_MS));
    const dendaTerlambat =
      hariTerlambat === 0
        ? 0
        : percentOf(
            loan.pokokPinjaman,
            Math.min(
              dendaPerHari * Math.min(hariTerlambat, maxHariDenda(dendaPerHari)),
              LATE_FEE_POLICY.maxPercent,
            ),
          );
    return {
      jatuhTempoPada,
      sisaHari,
      hariTerlambat,
      dendaTerlambat,
      totalKewajibanDenganPenalti: sim.totalPengembalian + dendaTerlambat,
      totalKewajibanPelunasan: sim.totalPengembalian,
      pokokBerjalan: loan.pokokPinjaman,
    };
  }
  // Data warisan pra-tenor memakai default 30 hari agar tetap bisa dilunasi.
  const tenor = loan.tenorHari ?? DEFAULT_TENOR_HARI;
  const rep = calculateRepayment(
    loan.pokokPinjaman,
    tenor,
    loan.didanaiPada,
    now,
    loan.persenBunga,
    dendaPerHari,
  );
  return {
    jatuhTempoPada: rep.jatuhTempoPada,
    sisaHari: rep.sisaHari,
    hariTerlambat: rep.hariTerlambat,
    dendaTerlambat: rep.dendaTerlambat,
    totalKewajibanDenganPenalti: rep.totalKewajibanDenganPenalti,
    totalKewajibanPelunasan: rep.totalKewajibanPelunasan,
    pokokBerjalan: loan.pokokPinjaman,
  };
}

/** File a borrower chooses on the application form. */
export const LOAN_PURPOSE_OPTIONS = [
  { value: "modal_usaha", label: "Modal usaha" },
  { value: "kebutuhan_pribadi", label: "Kebutuhan pribadi" },
  { value: "pendidikan", label: "Pendidikan" },
  { value: "kesehatan", label: "Kesehatan" },
  { value: "renovasi_rumah", label: "Renovasi rumah" },
  { value: "lainnya", label: "Lainnya" },
] as const;

export type LoanPurpose = (typeof LOAN_PURPOSE_OPTIONS)[number]["value"];

export function loanPurposeLabel(v: string): string {
  return LOAN_PURPOSE_OPTIONS.find((o) => o.value === v)?.label ?? "Lainnya";
}

export const LOAN_STATUS_FLOW = [
  "diajukan",
  "sedang_direview",
  "disetujui",
  "ditolak",
  "dibatalkan",
  "didanai",
  "lunas",
] as const;

export type LoanStatus = (typeof LOAN_STATUS_FLOW)[number];

/**
 * Label & penjelasan status pinjaman.
 *
 * Aplikasi mengenal EMPAT status yang ditampilkan: Ditinjau, Disalurkan,
 * Ditolak, Dibatalkan, Lunas (lihat `lib/statusPinjaman.ts`). Tiga ejaan lama
 * (`diajukan`, `sedang_direview`, `disetujui`) adalah satu tahap yang sama,
 * jadi ketiganya berlabel **Ditinjau**; `didanai` berlabel **Disalurkan**.
 * Penjelasannya tetap dibedakan supaya tim tahu sub-tahap yang tercatat.
 */
export function loanStatusMeta(status: LoanStatus): {
  label: string;
  description: string;
} {
  switch (status) {
    case "diajukan":
      return {
        label: "Ditinjau",
        description: "Pengajuan tercatat dalam antrean tinjauan internal PINDAI.",
      };
    case "sedang_direview":
      return {
        label: "Ditinjau",
        description: "Tim PINDAI sedang menelaah catatan pengajuan. Dokumen atau data yang diunggah tidak otomatis terverifikasi oleh pihak eksternal.",
      };
    case "disetujui":
      return {
        label: "Ditinjau",
        description:
          "Nominal sudah diputuskan tim PINDAI; dana belum ditandai tersalurkan. Status ini tidak memicu pencairan.",
      };
    case "ditolak":
      return {
        label: "Ditolak",
        description: "Catatan pengajuan tidak dilanjutkan dalam alur aplikasi. Anda dapat membuat catatan baru.",
      };
    case "dibatalkan":
      return {
        label: "Dibatalkan",
        description:
          "Pengajuan ditarik sebelum dana ditandai tersalurkan. Posisi ini bukan utang; pengajuan baru dapat dibuat kapan saja.",
      };
    case "didanai":
      return {
        label: "Disalurkan",
        description:
          "Dana ditandai tersalurkan pada ledger internal. Tombol pelunasan mencatat perubahan status dan seluruh kewajiban sekaligus. Keterlambatan menambah denda harian dari pokok, dibatasi 100% dari pokok.",
      };
    case "lunas":
      return {
        label: "Lunas",
        description:
          "Status kewajiban ditandai selesai di ledger internal dan menjadi acuan penyelesaian kewajiban peminjam.",
      };
  }
}
