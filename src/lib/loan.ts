/**
 * PINDAI — Loan Pricing Engine (pure functions, integer rupiah only).
 *
 * Rule 3 of the guardrails: no float money math. Every derived value is an
 * exact integer rupiah computed with BigInt half-up rounding.
 */
import { hitungSimulasiBulanan } from "./bulanan";
import { formatRupiah, percentOf, type Rupiah } from "./money";

export const PINDAI_PRICING = {
  adminFeePercent: 2,
  platformFeePercent: 3,
  /** Total upfront deduction = Admin 2% + Platform 3% = 5%. */
  upfrontDeductionPercent: 5,
  /** Net disbursement is 95% of principal. */
  netDisbursementPercent: 95,
  /** Bunga (Imbal Hasil Pendana) is 30% of principal. */
  bungaPercent: 30,
  /** Total repayment obligation = 130% of principal. */
  totalRepaymentPercent: 130,
} as const;

/**
 * Batas bisnis pinjaman tunai (Skema A) — dipakai klien DAN server agar
 * validasi tidak bisa dilewati dari UI.
 */
export const LOAN_LIMITS = {
  minPokok: 100_000,
  /** Pinjaman tunai baru dibatasi maksimum Rp 1 juta. */
  maxPokok: 1_000_000,
  /** Tenor pinjaman maksimum 30 hari. */
  maxTenorHari: 30,
} as const;

/** Tenor pinjaman dalam hari — dipilih nasabah saat mengajukan (maks 30 hari). */
export const TENOR_OPTIONS = [7, 14, 30] as const;
export type Tenor = (typeof TENOR_OPTIONS)[number];

/**
 * Validasi pokok pinjaman terhadap batas bisnis — satu sumber kebenaran untuk
 * form Peminjam dan mutation createLoanApplication.
 */
export function assertPokokPinjamanValid(pokok: Rupiah): void {
  if (!Number.isSafeInteger(pokok) || pokok <= 0) {
    throw new Error("Pokok pinjaman harus rupiah bulat positif (tanpa desimal).");
  }
  if (pokok < LOAN_LIMITS.minPokok || pokok > LOAN_LIMITS.maxPokok) {
    throw new Error(
      `Pokok pinjaman harus antara ${formatRupiah(LOAN_LIMITS.minPokok)} dan ${formatRupiah(LOAN_LIMITS.maxPokok)}.`,
    );
  }
}

/** Tenor default untuk data warisan (pinjaman pra-tenor). */
/** Tenor default untuk data warisan (pinjaman pra-tenor). */
export const DEFAULT_TENOR_HARI: Tenor = 30;

/**
 * Kebijakan denda keterlambatan (dihitung server, integer exact):
 * - 0,5% dari pokok pinjaman per hari keterlambatan;
 * - dibatasi maksimum 15% dari pokok (30 hari terlambat).
 * Tidak ada grace period: jatuh tempo dilewati satu hari penuh = denda 1 hari.
 */
export const LATE_FEE_POLICY = {
  percentPerDay: 0.5,
  maxPercent: 15,
} as const;

/** Persen keterlambatan maksimum = 15% / 0,5% per hari = 30 hari. */
export const MAX_LATE_DAYS = Math.floor(
  LATE_FEE_POLICY.maxPercent / LATE_FEE_POLICY.percentPerDay,
);

const DAY_MS = 86_400_000;

export interface LoanQuote {
  /** Pokok Pinjaman */
  pokok: Rupiah;
  /** Biaya Admin — 2% dari pokok */
  biayaAdmin: Rupiah;
  /** Biaya Layanan Platform — 3% dari pokok */
  biayaPlatform: Rupiah;
  /** Total Potongan di Muka — 5% */
  totalPotonganDiMuka: Rupiah;
  /** Dana Bersih Ditransfer — 95% */
  danaBersihDitransfer: Rupiah;
  /** Bunga Pinjaman — 30% (hak finansial Pendana) */
  bunga: Rupiah;
  /** Total Kewajiban Pelunasan — 130% */
  totalKewajibanPelunasan: Rupiah;
}

export function quoteLoan(pokok: Rupiah): LoanQuote {
  return quoteLoanDenganPersen(pokok, {
    admin: PINDAI_PRICING.adminFeePercent,
    platform: PINDAI_PRICING.platformFeePercent,
    bunga: PINDAI_PRICING.bungaPercent,
  });
}

/**
 * Kalkulasi dengan persentase dinamis dari Pengaturan System (admin).
 * Angka tetap rupiah bulat — pembulatan per komponen, sisa ke platform.
 */
export function quoteLoanDenganPersen(
  pokok: Rupiah,
  persen: { admin: number; platform: number; bunga: number },
): LoanQuote {
  if (!Number.isSafeInteger(pokok) || pokok <= 0) {
    throw new Error("Pokok pinjaman harus rupiah bulat positif.");
  }
  const biayaAdmin = percentOf(pokok, persen.admin);
  const biayaPlatform = percentOf(pokok, persen.platform);
  const totalPotonganDiMuka = biayaAdmin + biayaPlatform;
  const danaBersihDitransfer = pokok - totalPotonganDiMuka;
  const bunga = percentOf(pokok, persen.bunga);
  const totalKewajibanPelunasan = pokok + bunga;

  return {
    pokok,
    biayaAdmin,
    biayaPlatform,
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
export function requote(pokok: Rupiah): LoanQuote {
  return quoteLoan(pokok);
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
 * denda = pokok × (0,5% × hari) dibulatkan HALF-UP per rupiah.
 */
export function calculateRepayment(
  pokok: Rupiah,
  tenor: number,
  didanaiPada: number,
  now: number,
): RepaymentQuote {
  const base = quoteLoan(pokok);
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

  // Denda: 0,5% × pokok × hari, di-cap 15% dari pokok. percentOf menangani
  // pembulatan HALF-UP; hari di-cap dulu agar hasil selalu dalam batas bisnis.
  const hariDenda = Math.min(hariTerlambat, MAX_LATE_DAYS);
  const dendaTerlambat =
    hariDenda === 0
      ? 0
      : percentOf(pokok, LATE_FEE_POLICY.percentPerDay * hariDenda);

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
 * skema: harian (130% flat) maupun bulanan (bunga menurun + biaya layanan
 * dengan biaya dipotong di muka). Dipakai UI nasabah, portofolio Pendana,
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
}

/** Satu bulan skema bulanan dihitung 30 hari, konsisten di server & UI. */
export const BULAN_MS = 30 * 86_400_000;

/**
 * Turunan pelunasan live untuk pinjaman yang sudah didanai. Skema bulanan
 * memakai total cicilan dari lib/bulanan dan denda flat yang sama
 * (0,5% pokok/hari, cap 15%). Mengembalikan null bila belum didanai.
 */
export function pelunasanPinjaman(
  loan: {
    pokokPinjaman: Rupiah;
    status: string;
    tenorHari?: number;
    tenorBulan?: number;
    didanaiPada?: number;
  },
  now: number,
): PelunasanPinjaman | null {
  if (loan.status !== "didanai" || loan.didanaiPada === undefined) {
    return null;
  }
  if (loan.tenorBulan !== undefined) {
    const sim = hitungSimulasiBulanan(loan.pokokPinjaman, loan.tenorBulan);
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
              LATE_FEE_POLICY.percentPerDay * Math.min(hariTerlambat, MAX_LATE_DAYS),
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
    };
  }
  // Data warisan pra-tenor memakai default 30 hari agar tetap bisa dilunasi.
  const tenor = loan.tenorHari ?? DEFAULT_TENOR_HARI;
  const rep = calculateRepayment(loan.pokokPinjaman, tenor, loan.didanaiPada, now);
  return {
    jatuhTempoPada: rep.jatuhTempoPada,
    sisaHari: rep.sisaHari,
    hariTerlambat: rep.hariTerlambat,
    dendaTerlambat: rep.dendaTerlambat,
    totalKewajibanDenganPenalti: rep.totalKewajibanDenganPenalti,
    totalKewajibanPelunasan: rep.totalKewajibanPelunasan,
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
  "didanai",
  "lunas",
] as const;

export type LoanStatus = (typeof LOAN_STATUS_FLOW)[number];

export function loanStatusMeta(status: LoanStatus): {
  label: string;
  description: string;
} {
  switch (status) {
    case "diajukan":
      return {
        label: "Diajukan (catatan internal)",
        description: "Pengajuan tercatat dalam antrean tinjauan internal PINDAI.",
      };
    case "sedang_direview":
      return {
        label: "Sedang Direview",
        description: "Tim PINDAI sedang menelaah catatan pengajuan. Dokumen atau data yang diunggah tidak otomatis terverifikasi oleh pihak eksternal.",
      };
    case "disetujui":
      return {
        label: "Disetujui internal",
        description:
          "Pengajuan disetujui secara internal. Status ini tidak memicu pencairan; informasi rekening hanya tersimpan sebagai catatan dan tidak terhubung ke transfer.",
      };
    case "ditolak":
      return {
        label: "Ditolak internal",
        description: "Catatan pengajuan tidak dilanjutkan dalam alur aplikasi. Anda dapat membuat catatan baru.",
      };
    case "didanai":
      return {
        label: "Target tercapai (ledger)",
        description:
          "Target pendanaan tercatat terpenuhi pada ledger internal. Tombol pelunasan mencatat perubahan status dan seluruh kewajiban sekaligus. Keterlambatan menambah perhitungan denda 0,5% per hari dari pokok (maksimum 15%).",
      };
    case "lunas":
      return {
        label: "Lunas (ledger)",
        description:
          "Status kewajiban ditandai selesai di ledger internal dan menjadi acuan penyelesaian antara Peminjam dan Pendana.",
      };
  }
}
