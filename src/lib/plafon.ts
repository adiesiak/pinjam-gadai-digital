/**
 * Plafon pinjaman tunai per nasabah.
 *
 * Plafon dasar mengikuti konfigurasi global (default Rp1 juta). Setiap
 * pinjaman tunai pokok minimal Rp1 juta yang dilunasi penuh paling lambat pada
 * tanggal jatuh tempo menaikkan plafon dasar Rp1 juta, hingga maksimum Rp10
 * juta. Penanda warisan di users tidak menjadi bukti kelayakan. Override
 * pribadi admin tetap menang atas plafon turunan ini.
 */
import { formatRupiah, type Rupiah } from "./money";
import { LOAN_LIMITS } from "./loan";
import type { QueryCtx } from "../convex/_generated/server";
import type { Id } from "../convex/_generated/dataModel";

const DAY_MS = 86_400_000;

export type RiwayatPinjamanPlafon = {
  status: string;
  pokokPinjaman: number;
  didanaiPada?: number;
  lunasPada?: number;
  tenorHari?: number;
  tenorBulan?: number;
};

/** Plafon efektif Peminjam — override admin menang atas hasil riwayat. */
export async function plafonPeminjam(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<Rupiah> {
  const [user, cfg, loans] = await Promise.all([
    ctx.db.get(userId),
    getConfigServer(ctx),
    ctx.db.query("loans").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
  ]);
  const jumlahPelunasanTepatWaktu = loans.filter(apakahPelunasanTepatWaktu).length;
  return plafonEfektif(user?.plafonPinjaman, cfg, jumlahPelunasanTepatWaktu);
}

/** Baca default global dari systemConfig tanpa menarik dependensi convex/system. */
async function getConfigServer(ctx: QueryCtx): Promise<number> {
  const row = await ctx.db
    .query("systemConfig")
    .withIndex("by_slot", (q) => q.eq("slot", "global"))
    .first();
  return row?.plafonPinjaman ?? PLAFON_DEFAULT;
}

/** Plafon awal pinjaman tunai — sama dengan batas skema tunai harian. */
export const PLAFON_DEFAULT = LOAN_LIMITS.maxPokok as Rupiah;

/** Pokok minimum dan nilai kenaikan untuk setiap pelunasan yang memenuhi syarat. */
export const PLAFON_POKOK_MINIMUM_LUNAS = 1_000_000 as Rupiah;
export const PLAFON_KENAIKAN_PER_PELUNASAN = 1_000_000 as Rupiah;

/** Plafon maksimum turunan maupun override admin. */
export const PLAFON_NAIK_SETELAH_LUNAS = 10_000_000 as Rupiah;

/** Rentang plafon tunai yang boleh disimpan admin (rupiah bulat). */
export const PLAFON_BATAS = {
  min: 100_000,
  maks: PLAFON_NAIK_SETELAH_LUNAS,
} as const;

/** Langkah slider kelipatan (rupiah). */
export const PLAFON_LANGKAH = 100_000;

/** Hitung tanggal jatuh tempo berdasarkan tenor tersimpan; null untuk data tidak valid. */
export function tanggalJatuhTempoPinjaman(
  loan: Pick<RiwayatPinjamanPlafon, "didanaiPada" | "tenorHari" | "tenorBulan">,
): number | null {
  if (!Number.isSafeInteger(loan.didanaiPada) || (loan.didanaiPada ?? 0) <= 0) return null;
  const tenorHari = loan.tenorBulan !== undefined
    ? loan.tenorBulan * 30
    : loan.tenorHari ?? 30;
  if (!Number.isSafeInteger(tenorHari) || tenorHari <= 0) return null;
  return loan.didanaiPada! + tenorHari * DAY_MS;
}

/** Bukti kelayakan kenaikan: pokok tunai ≥Rp1 juta, lunas, dan waktu pelunasan tidak melewati jatuh tempo. */
export function apakahPelunasanTepatWaktu(loan: RiwayatPinjamanPlafon): boolean {
  if (
    loan.status !== "lunas" ||
    !Number.isSafeInteger(loan.pokokPinjaman) ||
    loan.pokokPinjaman < PLAFON_POKOK_MINIMUM_LUNAS ||
    !Number.isSafeInteger(loan.lunasPada)
  ) {
    return false;
  }
  const jatuhTempo = tanggalJatuhTempoPinjaman(loan);
  return jatuhTempo !== null && (loan.lunasPada ?? Infinity) <= jatuhTempo;
}

/** Plafon dasar = global + Rp1 jt per pelunasan tepat waktu, dibatasi maksimum. */
export function plafonDasarDariRiwayat(
  globalDefault: number,
  jumlahPelunasanTepatWaktu: number,
): Rupiah {
  const jumlah = Number.isSafeInteger(jumlahPelunasanTepatWaktu)
    ? Math.max(0, jumlahPelunasanTepatWaktu)
    : 0;
  const dasar = clampPlafon(globalDefault);
  return Math.min(
    PLAFON_NAIK_SETELAH_LUNAS,
    dasar + jumlah * PLAFON_KENAIKAN_PER_PELUNASAN,
  ) as Rupiah;
}

/** Plafon efektif: override admin, lalu plafon progresif hasil riwayat, lalu default global. */
export function plafonEfektif(
  override: number | null | undefined,
  globalDefault: number,
  jumlahPelunasanTepatWaktu = 0,
): Rupiah {
  return clampPlafon(
    override ?? plafonDasarDariRiwayat(globalDefault, jumlahPelunasanTepatWaktu),
  );
}

/** Jepit nilai ke rentang yang sah — dipakai UI, server, dan penyimpanan. */
export function clampPlafon(nilai: number): Rupiah {
  if (!Number.isFinite(nilai)) return PLAFON_DEFAULT;
  return Math.min(PLAFON_BATAS.maks, Math.max(PLAFON_BATAS.min, Math.round(nilai))) as Rupiah;
}

/**
 * Apakah pokok pinjaman tunai boleh diajukan di bawah plafon ini?
 * Tenor skema tetap divalidasi engine-nya masing-masing — fungsi ini hanya
 * memotong sisi atas (dan tetap menghormati minimum pokok tunai).
 */
export function pokokDalamPlafon(pokok: Rupiah, plafon: Rupiah): boolean {
  return (
    Number.isSafeInteger(pokok) &&
    pokok >= LOAN_LIMITS.minPokok &&
    pokok <= plafon
  );
}

/** Pesan penolakan tunai untuk pokok di atas plafon efektif. */
export function pesanPlafonTerlampaui(plafon: Rupiah): string {
  return (
    `Batas pinjaman Anda saat ini ${formatRupiah(plafon)}. ` +
    "Kurangi jumlah pinjaman atau hubungi tim PINDAI jika ingin menanyakan perubahan batas."
  );
}
