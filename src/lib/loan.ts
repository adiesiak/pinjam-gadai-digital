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
  /** Bunga (Imbal Hasil penyedia dana) is 30% of principal. */
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
 * - 2% dari pokok pinjaman per hari keterlambatan;
 * - dibatasi maksimum 100% dari pokok (50 hari terlambat). 
 * Tidak ada grace period: jatuh tempo dilewati satu hari penuh = denda 1 hari.
 */
export const LATE_FEE_POLICY = {
  percentPerDay: 2,
  maxPercent: 100,
} as const;

/** Hari denda maksimum = cap denda dibagi persentase denda harian. */
export const MAX_LATE_DAYS = Math.floor(
  LATE_FEE_POLICY.maxPercent / LATE_FEE_POLICY.percentPerDay,
);

const DAY_MS = 86_400_000;

export interface LoanQuote {
  /** Pokok Pinjaman */
  pokok: Rupiah;
  /** Biaya Admin — 2% dari pokok */
  biayaAdmin: Rupiah;
  /** Biaya Layanan Platform — 0% dari pokok (dihapus dari potongan di muka) */
  biayaPlatform: Rupiah;
  /** Total Potongan di Muka — 2% (hanya biaya admin) */
  totalPotonganDiMuka: Rupiah;
  /** Dana Bersih Ditransfer — 98% */
  danaBersihDitransfer: Rupiah;
  /** Bunga Pinjaman — 30% (hak finansial penyedia dana) */
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

/** Quote skema harian dengan bunga khusus nasabah (persen, mis. 30 → 130%). */
export function quoteLoanBunga(pokok: Rupiah, persenBunga: number): LoanQuote {
  return quoteLoanDenganPersen(pokok, {
    admin: PINDAI_PRICING.adminFeePercent,
    platform: PINDAI_PRICING.platformFeePercent,
    bunga: persenBunga,
  });
}

/**
 * Quote satu pinjaman HARIAN menghormati snapshot bunga per nasabah.
 * Kosong = perilaku lama (bunga 30% dari Pengaturan Sistem).
 */
export function quotePinjaman(loan: {
  pokokPinjaman: Rupiah;
  persenBunga?: number;
}): LoanQuote {
  return loan.persenBunga === undefined
    ? quoteLoan(loan.pokokPinjaman)
    : quoteLoanBunga(loan.pokokPinjaman, loan.persenBunga);
}

/**
 * Simulasi BULANAN satu pinjaman menghormati snapshot bunga per nasabah
 * (dipakai sebagai bunga per bulan); kosong = tarif tenor bawaan.
 */
export function simulasiBulananPinjaman(loan: {
  pokokPinjaman: Rupiah;
  tenorBulan: number;
  persenBunga?: number;
}): ReturnType<typeof hitungSimulasiBulanan> {
  return hitungSimulasiBulanan(
    loan.pokokPinjaman,
    loan.tenorBulan,
    loan.persenBunga === undefined ? {} : { persenBungaPerBulan: loan.persenBunga },
  );
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
 * denda = pokok × (2% × hari) dibulatkan HALF-UP per rupiah.
 */
export function calculateRepayment(
  pokok: Rupiah,
  tenor: number,
  didanaiPada: number,
  now: number,
  persenBunga?: number,
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

  // Denda: 2% × pokok × hari, di-cap 100% dari pokok. Hari di-cap dulu agar hasil tidak melewati kebijakan.
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
  },
  now: number,
): PelunasanPinjaman | null {
  if (loan.status !== "didanai" || loan.didanaiPada === undefined) {
    return null;
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
  const rep = calculateRepayment(loan.pokokPinjaman, tenor, loan.didanaiPada, now, loan.persenBunga);
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
          "Dana ditandai tersalurkan pada ledger internal. Tombol pelunasan mencatat perubahan status dan seluruh kewajiban sekaligus. Keterlambatan menambah perhitungan denda 2% per hari dari pokok (maksimum 100%).",
      };
    case "lunas":
      return {
        label: "Lunas",
        description:
          "Status kewajiban ditandai selesai di ledger internal dan menjadi acuan penyelesaian kewajiban peminjam.",
      };
  }
}
