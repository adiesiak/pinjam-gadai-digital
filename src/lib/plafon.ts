/**
 * Plafon pinjaman tunai per nasabah.
 *
 * Plafon awal mengikuti konfigurasi global (default Rp1 juta). Setelah pokok
 * pinjaman tunai minimal Rp1 juta lunas penuh, plafon otomatis menjadi Rp10
 * juta. Override pribadi admin selalu menang atas nilai otomatis tersebut.
 * Kebijakan kredit barang memiliki batas tersendiri di lib/kredit.ts.
 */
import { formatRupiah, type Rupiah } from "./money";
import { LOAN_LIMITS } from "./loan";
import type { QueryCtx } from "../convex/_generated/server";
import type { Id } from "../convex/_generated/dataModel";

/**
 * Plafon efektif Peminjam — override admin menang; tanpa override, nasabah
 * mengikuti default global sampai kualifikasi pelunasan penuh tercatat.
 */
export async function plafonPeminjam(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<Rupiah> {
  const [user, cfg] = await Promise.all([ctx.db.get(userId), getConfigServer(ctx)]);
  return plafonEfektif(
    user?.plafonPinjaman,
    cfg,
    user?.plafonPinjamanNaikPada !== undefined,
  );
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

/** Pokok pinjaman minimum yang harus lunas penuh untuk kenaikan otomatis. */
export const PLAFON_POKOK_MINIMUM_LUNAS = 1_000_000 as Rupiah;

/** Plafon otomatis setelah pinjaman tunai Rp1 juta (atau lebih) lunas penuh. */
export const PLAFON_NAIK_SETELAH_LUNAS = 10_000_000 as Rupiah;

/** Rentang plafon tunai yang boleh disimpan admin (rupiah bulat). */
export const PLAFON_BATAS = {
  min: 100_000,
  maks: PLAFON_NAIK_SETELAH_LUNAS,
} as const;

/** Langkah slider kelipatan (rupiah). */
export const PLAFON_LANGKAH = 100_000;

/** Plafon efektif: override admin, lalu plafon otomatis atau default global. */
export function plafonEfektif(
  override: number | null | undefined,
  globalDefault: number,
  sudahNaikSetelahLunas = false,
): Rupiah {
  const defaultEfektif = sudahNaikSetelahLunas
    ? PLAFON_NAIK_SETELAH_LUNAS
    : globalDefault;
  return clampPlafon(override ?? defaultEfektif);
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
    "Ajukan nominal yang sesuai atau hubungi tim PINDAI bila membutuhkan penyesuaian plafon."
  );
}
