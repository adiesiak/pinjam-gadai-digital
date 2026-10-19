/**
 * Kunci idempotensi untuk mutasi sensitif.
 *
 * Masalah yang diselesaikan: pengiriman ulang karena jaringan (klien mengulang
 * permintaan yang sama setelah timeout, pengguna menekan tombol dua kali, atau
 * retry otomatis) dapat membuat TRANSAKSI GANDA — dua pengajuan, dua pencatatan.
 * Convex menjamin satu mutasi bersifat atomik, tetapi ia tidak tahu bahwa dua
 * permintaan berbeda sebenarnya adalah SATU niat pengguna.
 *
 * Solusinya: klien menyertakan `kunciIdempotensi` (string acak buatan klien).
 * Panggilan pertama menjalankan operasi dan menyimpan HASILNYA; panggilan
 * berikutnya dengan kunci sama mengembalikan hasil tersimpan tanpa menjalankan
 * ulang efek sampingnya. Kunci milik satu pengguna dan terikat pada satu nama
 * operasi — kunci yang dipakai untuk operasi lain ditolak, bukan diam-diam
 * mengembalikan hasil yang salah.
 *
 * Sifat:
 * - OPSIONAL: tanpa kunci, perilaku lama tidak berubah (tanpa biaya, tanpa
 *   baris tambahan). Jadi pemanggil lama tetap sah.
 * - Hanya hasil yang berhasil yang disimpan — percobaan yang gagal validasi
 *   tidak pernah "dibekukan" sebagai jawaban.
 * - Baris lama dibersihkan cron harian; masa simpan lebih lama daripada
 *   jendela retry jaringan mana pun (lihat MASA_SIMPAN_KUNCI_MS).
 */
import { v } from "convex/values";

import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { catatDenyut } from "./monitoring";

/** Masa simpan baris kunci — 7 hari, jauh melewati jendela retry mana pun. */
export const MASA_SIMPAN_KUNCI_MS = 7 * 86_400_000;

/** Validator bersama agar setiap mutation memakai nama argumen yang sama. */
export const kunciIdempotensiValidator = v.optional(v.string());

/** Panjang maksimum kunci — kunci raksasa hanya membebani indeks. */
export const PANJANG_MAKS_KUNCI = 128;

function normalisasiKunci(kunci: string | undefined): string | null {
  if (kunci === undefined) return null;
  const bersih = kunci.trim();
  if (bersih === "") return null;
  if (bersih.length > PANJANG_MAKS_KUNCI) {
    throw new Error(`Kunci idempotensi maksimal ${PANJANG_MAKS_KUNCI} karakter.`);
  }
  return bersih;
}

/**
 * Hasil tersimpan untuk (pengguna, kunci) bila ada — `null` bila ini pertama
 * kali. Melempar bila kunci yang sama dipakai untuk operasi yang BERBEDA:
 * mengembalikan hasil operasi lain akan menyesatkan pemanggil.
 */
export async function ambilHasilIdempoten<T>(
  ctx: MutationCtx,
  userId: Id<"users">,
  kunci: string | undefined,
  operasi: string,
): Promise<T | null> {
  const bersih = normalisasiKunci(kunci);
  if (bersih === null) return null;
  const lama = await ctx.db
    .query("idempotencyKeys")
    .withIndex("by_user_kunci", (q) => q.eq("userId", userId).eq("kunci", bersih))
    .first();
  if (lama === null) return null;
  if (lama.operasi !== operasi) {
    throw new Error(
      `Kunci idempotensi "${bersih}" sudah dipakai untuk operasi lain (${lama.operasi}). Pakai kunci baru.`,
    );
  }
  return JSON.parse(lama.hasilJson) as T;
}

/**
 * Simpan hasil operasi untuk (pengguna, kunci). No-op bila tidak ada kunci.
 * Dipanggil HANYA setelah operasi berhasil.
 */
export async function simpanHasilIdempoten(
  ctx: MutationCtx,
  userId: Id<"users">,
  kunci: string | undefined,
  operasi: string,
  hasil: unknown,
): Promise<void> {
  const bersih = normalisasiKunci(kunci);
  if (bersih === null) return;
  await ctx.db.insert("idempotencyKeys", {
    userId,
    kunci: bersih,
    operasi,
    hasilJson: JSON.stringify(hasil) ?? "null",
    dibuatPada: Date.now(),
  });
}

/** Buang baris kunci yang sudah kedaluwarsa — dijalankan cron harian. */
export const bersihkanKunciLama = internalMutation({
  args: {},
  handler: async (ctx) => {
    const batas = Date.now() - MASA_SIMPAN_KUNCI_MS;
    const lama = await ctx.db
      .query("idempotencyKeys")
      .withIndex("by_dibuatPada", (q) => q.lt("dibuatPada", batas))
      .take(500);
    for (const baris of lama) {
      await ctx.db.delete(baris._id);
    }
    await catatDenyut(ctx, "retensi-idempotensi");
    return { dihapus: lama.length };
  },
});
