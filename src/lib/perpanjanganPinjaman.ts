/**
 * Perpanjangan pinjaman harian & pembayaran pokok sebagian, murni.
 *
 * Satu sumber angka untuk pratinjau nasabah dan validasi server. Periode
 * perpanjangan mengikuti tier nominal SESUDAH pembayaran: cicilan pokok yang
 * menurunkan pokok dapat memindahkan pinjaman ke tier bunga lain.
 *
 * Modul ini tidak menulis apa pun. Pencatatan ledger dan perubahan state
 * dilakukan mutation setelah admin mencocokkan mutasi bank.
 */
import {
  LATE_FEE_POLICY,
  LOAN_LIMITS,
  maxHariDenda,
  persenBungaHarian,
  quotePinjaman,
  tenorHarianTersedia,
} from "./loan";
import { biayaRollover } from "./ekonomiPlatform";
import { formatRupiah, percentOf, type Rupiah } from "./money";
import { selisihHariWIB } from "./waktu";

const DAY_MS = 86_400_000;

export const MODE_PEMBAYARAN_PINJAMAN = [
  "pelunasan_total",
  "bunga_saja",
  "cicil_pokok",
] as const;

export type ModePembayaranPinjaman = (typeof MODE_PEMBAYARAN_PINJAMAN)[number];

export const LABEL_MODE_PEMBAYARAN: Record<ModePembayaranPinjaman, string> = {
  pelunasan_total: "Pelunasan total",
  bunga_saja: "Bayar bunga saja",
  cicil_pokok: "Cicil pokok",
};

/** Field pinjaman yang dibutuhkan kalkulator (bentuknya dari dokumen `loans`). */
export type PinjamanPerpanjangan = {
  pokokPinjaman: Rupiah;
  remainingPrincipal?: number;
  nextInterestAmount?: number;
  nextDueDate?: number;
  didanaiPada?: number;
  tenorHari?: number;
  tenorBulan?: number;
  persenBunga?: number;
};

export type OpsiTenorPerpanjangan = {
  hari: number;
  /** Persentase bunga periode baru, mis. 37 berarti 37% dari pokok. */
  persenBunga: number;
};

export type RencanaPembayaranPinjaman = {
  mode: ModePembayaranPinjaman;
  principalSebelum: Rupiah;
  interestDue: Rupiah;
  lateFee: Rupiah;
  /** Biaya roll-over flat; hanya untuk mode "bayar bunga saja". */
  rolloverFee: Rupiah;
  principalPaid: Rupiah;
  totalDue: Rupiah;
  principalSesudah: Rupiah;
  tierRate: number;
  nextInterestAmount: Rupiah;
  jatuhTempoSebelum: number;
  nextDueDate: number | null;
  extensionDays: number;
  hariTerlambat: number;
};

export function sisaPokokPinjaman(loan: PinjamanPerpanjangan): Rupiah {
  const sisa = loan.remainingPrincipal ?? loan.pokokPinjaman;
  if (!Number.isSafeInteger(sisa) || sisa <= 0) {
    throw new Error("Sisa pokok pinjaman tidak valid.");
  }
  return sisa;
}

export function bungaPeriodeBerjalan(loan: PinjamanPerpanjangan): Rupiah {
  if (loan.nextInterestAmount !== undefined) {
    if (!Number.isSafeInteger(loan.nextInterestAmount) || loan.nextInterestAmount < 0) {
      throw new Error("Bunga periode berjalan tidak valid.");
    }
    return loan.nextInterestAmount;
  }
  return quotePinjaman(loan).bunga;
}

export function jatuhTempoBerjalan(loan: PinjamanPerpanjangan): number {
  if (loan.nextDueDate !== undefined) {
    if (!Number.isSafeInteger(loan.nextDueDate) || loan.nextDueDate <= 0) {
      throw new Error("Jatuh tempo pinjaman tidak valid.");
    }
    return loan.nextDueDate;
  }
  if (!Number.isSafeInteger(loan.didanaiPada) || (loan.didanaiPada ?? 0) <= 0) {
    throw new Error("Tanggal pencairan belum tercatat.");
  }
  const tenor = loan.tenorHari ?? 30;
  return loan.didanaiPada! + tenor * DAY_MS;
}

export function dendaPeriodeBerjalan(
  pokok: Rupiah,
  jatuhTempoPada: number,
  waktu: number,
  tarifPerHari: number = LATE_FEE_POLICY.percentPerDay,
): { hariTerlambat: number; denda: Rupiah } {
  const hariTerlambat = Math.max(0, selisihHariWIB(jatuhTempoPada, waktu));
  if (hariTerlambat === 0) return { hariTerlambat: 0, denda: 0 };
  const hariDenda = Math.min(hariTerlambat, maxHariDenda(tarifPerHari));
  return {
    hariTerlambat,
    denda: percentOf(
      pokok,
      Math.min(tarifPerHari * hariDenda, LATE_FEE_POLICY.maxPercent),
    ),
  };
}

/** Tenor perpanjangan yang sah untuk satu nominal, beserta tier bunganya. */
export function opsiPerpanjangan(pokok: Rupiah): OpsiTenorPerpanjangan[] {
  if (!Number.isSafeInteger(pokok) || pokok < LOAN_LIMITS.minPokok) return [];
  return tenorHarianTersedia(pokok).flatMap((hari) => {
    const persenBunga = persenBungaHarian(pokok, hari);
    return persenBunga === null ? [] : [{ hari, persenBunga }];
  });
}

function validasiTenor(
  principalSesudah: Rupiah,
  extensionDays: number,
): void {
  const opsi = opsiPerpanjangan(principalSesudah);
  if (opsi.length === 0) {
    throw new Error("Sisa pokok terlalu kecil untuk diperpanjang.");
  }
  if (!opsi.some((o) => o.hari === extensionDays)) {
    throw new Error(
      `Untuk sisa pokok ini, tenor perpanjangan yang tersedia ${opsi
        .map((o) => `${o.hari} hari`)
        .join(" / ")}.`,
    );
  }
}

/**
 * Susun rencana pembayaran pada satu waktu.
 *
 * `waktuTransaksi` dipakai untuk menghitung denda, sama dengan tanggal
 * transfer yang dicocokkan admin. Jatuh tempo baru dihitung dari jatuh tempo
 * berjalan (atau tanggal transaksi bila sudah lewat), bukan dari hari ini saat
 * pratinjau dibuka, supaya tanggalnya tidak bergeser sendiri.
 */
export function hitungRencanaPembayaran({
  loan,
  mode,
  extensionDays,
  principalPaid = 0,
  waktuTransaksi,
  tarifDendaPerHari = LATE_FEE_POLICY.percentPerDay,
}: {
  loan: PinjamanPerpanjangan;
  mode: ModePembayaranPinjaman;
  extensionDays?: number;
  principalPaid?: number;
  waktuTransaksi: number;
  tarifDendaPerHari?: number;
}): RencanaPembayaranPinjaman {
  if (loan.tenorBulan !== undefined) {
    throw new Error("Perpanjangan hanya tersedia untuk pinjaman harian.");
  }
  if (!Number.isSafeInteger(waktuTransaksi) || waktuTransaksi <= 0) {
    throw new Error("Tanggal transaksi tidak valid.");
  }
  const principalSebelum = sisaPokokPinjaman(loan);
  const interestDue = bungaPeriodeBerjalan(loan);
  const jatuhTempoSebelum = jatuhTempoBerjalan(loan);
  const { hariTerlambat, denda } = dendaPeriodeBerjalan(
    principalSebelum,
    jatuhTempoSebelum,
    waktuTransaksi,
    tarifDendaPerHari,
  );

  if (mode === "pelunasan_total") {
    return {
      mode,
      principalSebelum,
      interestDue,
      lateFee: denda,
      rolloverFee: 0 as Rupiah,
      principalPaid: principalSebelum,
      totalDue: principalSebelum + interestDue + denda,
      principalSesudah: 0,
      tierRate: loan.persenBunga ?? 0,
      nextInterestAmount: 0,
      jatuhTempoSebelum,
      nextDueDate: null,
      extensionDays: 0,
      hariTerlambat,
    };
  }

  if (!Number.isSafeInteger(extensionDays) || (extensionDays ?? 0) <= 0) {
    throw new Error("Pilih tenor perpanjangan.");
  }
  const hari = extensionDays!;

  let principalPaidFinal = 0;
  if (mode === "cicil_pokok") {
    if (!Number.isSafeInteger(principalPaid) || principalPaid <= 0) {
      throw new Error("Nominal cicilan pokok harus rupiah bulat positif.");
    }
    if (principalPaid >= principalSebelum) {
      throw new Error(
        "Cicilan pokok harus lebih kecil dari sisa pokok. Gunakan pelunasan total bila ingin melunasi.",
      );
    }
    principalPaidFinal = principalPaid;
  }

  const principalSesudah = principalSebelum - principalPaidFinal;
  if (principalSesudah < LOAN_LIMITS.minPokok) {
    throw new Error(
      `Sisa pokok setelah cicilan minimal ${formatRupiah(LOAN_LIMITS.minPokok)}.`,
    );
  }
  validasiTenor(principalSesudah, hari);

  // Perpanjangan dengan pokok yang sama mempertahankan tarif snapshot pinjaman:
  // perubahan matriks setelah kontrak terbit tidak boleh menaikkan tagihan
  // perpanjangan secara diam-diam. Bila cicilan pokok memindahkan pinjaman ke
  // tier lain, tier baru dihitung dari matriks yang berlaku.
  const tierRate =
    principalSesudah === principalSebelum && loan.persenBunga !== undefined
      ? loan.persenBunga
      : persenBungaHarian(principalSesudah, hari);
  if (tierRate === null) {
    throw new Error("Tier bunga untuk sisa pokok dan tenor ini tidak tersedia.");
  }
  const nextInterestAmount = percentOf(principalSesudah, tierRate);
  const rolloverFee = biayaRollover(mode);
  const dasarJatuhTempo = Math.max(jatuhTempoSebelum, waktuTransaksi);
  const nextDueDate = dasarJatuhTempo + hari * DAY_MS;

  return {
    mode,
    principalSebelum,
    interestDue,
    lateFee: denda,
    rolloverFee,
    principalPaid: principalPaidFinal,
    totalDue: interestDue + principalPaidFinal + denda + rolloverFee,
    principalSesudah,
    tierRate,
    nextInterestAmount,
    jatuhTempoSebelum,
    nextDueDate,
    extensionDays: hari,
    hariTerlambat,
  };
}
