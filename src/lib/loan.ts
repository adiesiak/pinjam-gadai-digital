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
  /** Pinjaman tunai baru dibatasi maksimum Rp 1 juta. */
  maxPokok: 1_000_000,
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
 *  - pokok di bawah Rp500.000: tenor bawaan 7 hari (bunga dasar 30%). Memilih
 *    perpanjangan 14 atau 28 hari menaikkan bunga ke 35% / 40%.
 *  - pokok Rp500.000 sampai di bawah Rp1.000.000: tenor bawaan 14 hari;
 *    bunga 35% (14 hari) atau 40% (28 hari).
 *  - pokok tepat Rp1.000.000: tenor terkunci 28 hari dengan bunga 35%.
 *
 * Tenor di luar baris matriks tidak ditawarkan UI dan DITOLAK server — bukan
 * sekadar disembunyikan — supaya kombinasi nominal/tenor/bunga tidak bisa
 * dikirim langsung ke mutation.
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
      { tenor: 14, persenBunga: 35 },
      { tenor: 28, persenBunga: 40 },
    ],
  },
  {
    minPokok: 1_000_000,
    maksPokok: 1_000_000,
    tenorDefault: 28,
    tarif: [{ tenor: 28, persenBunga: 35 }],
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
 * Sesuaikan tenor lama ke pilihan terdekat yang sah. Dipakai saat nominal
 * berubah: pilihan yang tadinya 14 hari tidak boleh tertinggal di nominal yang
 * hanya menerima 28 hari.
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
export function validasiTenorHarian(pokok: number, tenor: number): string | null {
  assertPokokPinjamanValid(pokok);
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
