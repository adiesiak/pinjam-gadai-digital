/**
 * Jadwal angsuran PINDAI — murni, tanpa React/DOM/Convex.
 *
 * Satu sumber angka untuk tiga tempat yang sebelumnya bisa berbeda:
 *  1. form pengajuan (simulasi),
 *  2. kontrak (rincian biaya),
 *  3. tabel `angsuran` + halaman Cicilan.
 *
 * Skema harian adalah SATU angsuran jatuh tempo di akhir tenor (pokok + bunga;
 * biaya admin 2% sudah dipotong di muka, jadi tidak masuk angsuran).
 * Skema bulanan memakai `hitungSimulasiBulanan().jadwal` — pokok + bunga +
 * biaya admin cicilan per bulan — sehingga Σ pokok = pokok pinjaman dan
 * Σ total = total kewajiban yang tampil di kontrak.
 */

import { hitungSimulasiBulanan, type TarifBulanan } from "./bulanan";
import { LATE_FEE_POLICY, quotePinjaman } from "./loan";
import { percentOf, type Rupiah } from "./money";
import { selisihHariWIB } from "./waktu";

const DAY_MS = 86_400_000;
const BULAN_MS = 30 * DAY_MS;

/** Status yang DISIMPAN pada tabel angsuran. */
export type StatusAngsuran = "belum_dibayar" | "menunggu_verifikasi" | "lunas";

/** Status tampilan — diturunkan dari status simpan + tanggal, bukan disimpan. */
export type TampilanAngsuran =
  | "lunas"
  | "menunggu_verifikasi"
  | "terlambat"
  | "hari_ini"
  | "segera"
  | "belum";

/** Satu baris jadwal sebelum disimpan. */
export type BarisJadwalAngsuran = {
  nomor: number;
  jatuhTempoPada: number;
  pokok: Rupiah;
  bunga: Rupiah;
  biayaAdmin: Rupiah;
  total: Rupiah;
};

export type PinjamanUntukJadwal = {
  pokokPinjaman: Rupiah;
  tenorHari?: number;
  tenorBulan?: number;
  didanaiPada?: number;
  persenBunga?: number;
  /** Snapshot tarif bulanan pinjaman; kosong = tarif bawaan. */
  tarifBulanan?: TarifBulanan | null;
};

/**
 * Jadwal angsuran satu pinjaman. Melempar bila pinjaman belum punya waktu
 * pencairan yang sah — jadwal tanpa tanggal acuan akan mengarang jatuh tempo.
 */
export function jadwalAngsuranPinjaman(
  loan: PinjamanUntukJadwal,
): BarisJadwalAngsuran[] {
  if (!Number.isSafeInteger(loan.didanaiPada) || (loan.didanaiPada ?? 0) <= 0) {
    throw new Error("Tanggal pencairan belum tercatat; jadwal angsuran belum dapat dibuat.");
  }
  const mulai = loan.didanaiPada!;

  if (loan.tenorBulan !== undefined) {
    const sim = hitungSimulasiBulanan(loan.pokokPinjaman, loan.tenorBulan, {
      ...(loan.persenBunga === undefined ? {} : { persenBungaPerBulan: loan.persenBunga }),
      tarif: loan.tarifBulanan ?? null,
    });
    return sim.jadwal.map((row) => ({
      nomor: row.bulan,
      jatuhTempoPada: mulai + row.bulan * BULAN_MS,
      pokok: row.pokok,
      bunga: row.bunga,
      biayaAdmin: row.biayaAdminCicilan,
      total: row.total,
    }));
  }

  const q = quotePinjaman(loan);
  const tenorHari = loan.tenorHari ?? 30;
  return [
    {
      nomor: 1,
      jatuhTempoPada: mulai + tenorHari * DAY_MS,
      pokok: loan.pokokPinjaman,
      bunga: q.bunga,
      biayaAdmin: 0,
      total: q.totalKewajibanPelunasan,
    },
  ];
}

/**
 * Hari keterlambatan satu angsuran; 0 bila belum lewat jatuh tempo.
 *
 * Dihitung per tanggal kalender WIB, sama dengan denda pinjaman di `lib/loan`:
 * lewat pukul 00.00 WIB berarti satu hari, bukan menunggu 24 jam penuh.
 */
export function hariTerlambatAngsuran(
  jatuhTempoPada: number,
  sekarang: number,
): number {
  return Math.max(0, selisihHariWIB(jatuhTempoPada, sekarang));
}

/** Sisa hari menuju jatuh tempo; negatif berarti sudah lewat. */
export function sisaHariAngsuran(jatuhTempoPada: number, sekarang: number): number {
  return Math.ceil((jatuhTempoPada - sekarang) / DAY_MS);
}

/**
 * Denda satu angsuran: tarif harian × pokok ANGSURAN yang telat, dibatasi
 * `LATE_FEE_POLICY.maxPercent` dari pokok angsuran itu. Dasar pokok angsuran
 * (bukan pokok pinjaman penuh) membuat denda menempel pada tagihan yang memang
 * terlambat — bukan menumpuk di akhir tenor.
 */
export function dendaAngsuran(
  pokok: Rupiah,
  jatuhTempoPada: number,
  sekarang: number,
  tarifPerHari: number = LATE_FEE_POLICY.percentPerDay,
): Rupiah {
  const hari = hariTerlambatAngsuran(jatuhTempoPada, sekarang);
  if (hari <= 0 || !Number.isFinite(tarifPerHari) || tarifPerHari <= 0) return 0;
  const persen = Math.min(LATE_FEE_POLICY.maxPercent, hari * tarifPerHari);
  return percentOf(pokok, persen) as Rupiah;
}

export function tampilanAngsuran(
  row: { status: StatusAngsuran; jatuhTempoPada: number },
  sekarang: number,
): TampilanAngsuran {
  if (row.status === "lunas") return "lunas";
  if (row.status === "menunggu_verifikasi") return "menunggu_verifikasi";
  const sisa = sisaHariAngsuran(row.jatuhTempoPada, sekarang);
  if (sisa < 0) return "terlambat";
  if (sisa === 0) return "hari_ini";
  if (sisa <= 3) return "segera";
  return "belum";
}

/** Satu baris yang sudah disimpan, dengan nilai yang dihitung server. */
export type AngsuranTampil = {
  _id: string;
  nomor: number;
  jatuhTempoPada: number;
  pokok: number;
  bunga: number;
  biayaAdmin: number;
  total: number;
  status: StatusAngsuran;
  dibayarPada: number | null;
  dendaDibayar: number | null;
  dendaBerjalan: number;
  totalDibayar: number;
  /** Tautan bukti transfer yang tersimpan; null bila belum ada. */
  buktiUrl?: string | null;
  tampilan: TampilanAngsuran;
  hariTerlambat: number;
  sisaHari: number;
};

export type RingkasanAngsuran = {
  jumlah: number;
  lunas: number;
  menunggu: number;
  terlambat: number;
  jatuhTempoHariIni: number;
  totalKewajiban: number;
  totalDibayar: number;
  sisaTagihan: number;
  dendaBerjalan: number;
  semuaLunas: boolean;
  berikutnya: AngsuranTampil | null;
};

/**
 * Ringkasan untuk kartu "Tagihan berikutnya" dan lencana menu. `berikutnya`
 * adalah angsuran belum lunas dengan jatuh tempo paling awal — termasuk yang
 * sedang menunggu verifikasi, supaya peminjam tidak mengirim bukti dua kali.
 */
export function ringkasAngsuran(
  rows: readonly AngsuranTampil[],
): RingkasanAngsuran {
  const terurut = [...rows].sort((a, b) => a.nomor - b.nomor);
  const belum = terurut.filter((r) => r.status !== "lunas");
  const lunas = terurut.filter((r) => r.status === "lunas");
  const dendaBerjalan = belum.reduce((acc, r) => acc + r.dendaBerjalan, 0);
  const totalKewajiban = terurut.reduce((acc, r) => acc + r.total, 0);
  const totalDibayar = terurut.reduce(
    (acc, r) => acc + (r.status === "lunas" ? r.total + (r.dendaDibayar ?? 0) : 0),
    0,
  );
  const berikutnya =
    belum.length === 0
      ? null
      : [...belum].sort((a, b) => a.jatuhTempoPada - b.jatuhTempoPada)[0];

  return {
    jumlah: terurut.length,
    lunas: lunas.length,
    menunggu: terurut.filter((r) => r.status === "menunggu_verifikasi").length,
    terlambat: belum.filter((r) => r.tampilan === "terlambat").length,
    jatuhTempoHariIni: belum.filter((r) => r.tampilan === "hari_ini").length,
    totalKewajiban,
    totalDibayar,
    sisaTagihan:
      terurut.reduce(
        (acc, r) => acc + (r.status === "lunas" ? 0 : r.total),
        0,
      ) + dendaBerjalan,
    dendaBerjalan,
    semuaLunas: terurut.length > 0 && belum.length === 0,
    berikutnya,
  };
}

/**
 * Label status untuk UI. Satu tempat, supaya lencana dan teks tidak berbeda.
 */
export const LABEL_TAMPILAN_ANGSURAN: Record<TampilanAngsuran, string> = {
  lunas: "Lunas",
  menunggu_verifikasi: "Menunggu verifikasi",
  terlambat: "Terlambat",
  hari_ini: "Jatuh tempo hari ini",
  segera: "Segera jatuh tempo",
  belum: "Belum dibayar",
};

/** Nomor angsuran untuk pesan WhatsApp, mis. "2/6". */
export function labelNomorAngsuran(nomor: number, jumlah: number): string {
  return `${nomor}/${jumlah}`;
}
