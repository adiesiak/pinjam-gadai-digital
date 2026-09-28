/**
 * Plafon kredit per nasabah — batas maksimum pinjaman yang bisa diajukan
 * seseorang, diatur admin per pengguna.
 *
 * Cara kerja (dua lapis, keduanya ditegakkan di SERVER):
 *
 *  1. **Default global** (`systemConfig.plafonPinjaman`) — plafon yang berlaku
 *     untuk semua Peminjam sekaligus. Diubah admin dari Pengaturan Sistem.
 *  2. **Override per orang** (`users.plafonPinjaman`) — angka khusus untuk satu
 *     nasabah, mis. menaikkan nasabah lama berkinerja baik atau menurunkan
 *     nasabah berisiko. Kosong (null) = mengikuti default global.
 *
 * Plafon berlaku untuk pokok pinjaman tunai (harian & bulanan) DAN pokok
 * dibiayai kredit barang — bukan harga barangnya, karena yang menjadi
 * kewajiban platform adalah pokok yang dibiayai.
 *
 * Batas bawah kebijakan (LOKASI bisnis) tetap sama: minPokok 100 ribu,
 * tenor mengikuti skema. Plafon hanya memotong sisi ATAS, dan tidak pernah
 * bisa melebihi batas mesin (LOAN_LIMITS.maxPokok / BULANAN_LIMITS.maxPokok /
 * KREDIT_PRICING.maxHargaBarang) — clamp menjaga keputusan admin tetap sah
 * terhadap skema harga yang berlaku.
 *
 * Terinspirasi plafon layanan pembiayaan formal (mis. PayLater 5–20 juta):
 * platform memutuskan sendiri plafon wajarnya, lalu menyetel per nasabah.
 */
import { formatRupiah, type Rupiah } from "./money";
import { LOAN_LIMITS } from "./loan";
import { BULANAN_LIMITS } from "./bulanan";
import { KREDIT_PRICING } from "./kredit";
import type { QueryCtx } from "../convex/_generated/server";
import type { Id } from "../convex/_generated/dataModel";

/**
 * Plafon efektif satu Peminjam — override per orang (users.plafonPinjaman)
 * menang atas default global (systemConfig.plafonPinjaman). Helper server ini
 * yang dipanggil setiap mutation pengajuan; UI memakai query tersendiri
 * (`plafonSaya`) supaya slider dan pesannya konsisten dengan server.
 */
export async function plafonPeminjam(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<Rupiah> {
  const [user, cfg] = await Promise.all([ctx.db.get(userId), getConfigServer(ctx)]);
  return plafonEfektif(
    (user as { plafonPinjaman?: number } | null)?.plafonPinjaman,
    cfg,
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

/** Nilai default plafon pinjaman tunai — sama dengan LOAN_LIMITS.maxPokok. */
export const PLAFON_DEFAULT = LOAN_LIMITS.maxPokok as Rupiah;

/** Rentang yang boleh disimpan admin (rupiah bulat). */
export const PLAFON_BATAS = {
  min: 100_000,
  /**
   * Batas atas plafon per nasabah. Sengaja 10 juta: operasional mencover
   * sampai angka itu, dan melebihi mesin skema bulanan pun tidak bermakna.
   * Default global mengikuti kebijakan platform (1 juta), admin bisa naikkan
   * per orang sampai di sini.
   */
  maks: 10_000_000,
} as const;

/** Langkah slider kelipatan (rupiah). */
export const PLAFON_LANGKAH = 100_000;

/** Plafon efektif: override per orang menang, lalu default global. */
export function plafonEfektif(
  override: number | null | undefined,
  globalDefault: number,
): Rupiah {
  const sumber = override ?? globalDefault;
  return clampPlafon(sumber);
}

/** Jepit nilai ke rentang yang sah — dipakai UI, server, dan penyimpanan. */
export function clampPlafon(nilai: number): Rupiah {
  if (!Number.isFinite(nilai)) return PLAFON_DEFAULT;
  return Math.min(PLAFON_BATAS.maks, Math.max(PLAFON_BATAS.min, Math.round(nilai))) as Rupiah;
}

/**
 * Apakah pokok pinjaman tunai boleh diajukan di bawah plafon ini?
 * Tenor skema tetap divalidasi engine-nya masing-masing — fungsi ini hanya
 * memotong sisi atas (dan tetap hormati minPokok).
 */
export function pokokDalamPlafon(pokok: Rupiah, plafon: Rupiah): boolean {
  return (
    Number.isSafeInteger(pokok) &&
    pokok >= LOAN_LIMITS.minPokok &&
    pokok <= plafon
  );
}

/**
 * Pesan penolakan untuk pokok di atas plafon — sebut plafonnya, jangan
 * batas mesin, supaya nasabah tidak melihat angka yang berbeda dari UI.
 */
export function pesanPlafonTerlampaui(plafon: Rupiah): string {
  return (
    `Batas pinjaman Anda saat ini ${formatRupiah(plafon)}. ` +
    "Ajukan di atas atau di bawah batas itu, atau hubungi tim PINDAI bila butuh penyesuaian plafon."
  );
}

/**
 * Harga barang maksimum yang boleh diajukan pada plafon tertentu.
 *
 * Kredit barang tenor 12/24 memakai DP 10–50%, jadi pokok dibiayai selalu
 * ≤ 90% harga; dari plafon pokok kita mundur ke harga maksimum yang aman.
 * Tenor skema bulanan (1/3/6) menyiadakan harga penuh sebagai pokok (DP 0%).
 */
export function hargaBarangMaksDariPlafon(plafon: Rupiah): Rupiah {
  // DP terendah 10% → pokok dibiayai maksimum 90% dari harga barang.
  return clampPlafon(Math.floor(plafon / (1 - KREDIT_PRICING.dpMinPersen / 100)));
}

/**
 * Apakah pengajuan kredit barang lolos plafon? Memeriksa pokok yang DIBIAYAI
 * (bukan harga barang) — itu kewajiban yang menjadi risiko platform.
 */
export function kreditDalamPlafon(pokokDibiayai: Rupiah, plafon: Rupiah): boolean {
  return (
    Number.isSafeInteger(pokokDibiayai) &&
    pokokDibiayai > 0 &&
    pokokDibiayai <= plafon
  );
}

/**
 * Batas mesin skema (kenaikan plafon di atas ini tidak bermakna). Dipakai UI
 * admin untuk menampilkan batas atas yang realistis.
 */
export function batasMesinMaks(): Rupiah {
  return Math.min(
    BULANAN_LIMITS.maxPokok,
    KREDIT_PRICING.maxHargaBarang,
  ) as Rupiah;
}
