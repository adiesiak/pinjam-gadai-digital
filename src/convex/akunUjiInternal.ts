/**
 * Pemeriksaan "ini akun uji internal" untuk pagar server.
 *
 * Dipisah dari `akunUji.ts` karena modul itu adalah internal action/seed yang
 * menarik seluruh API turunan; pagar pratinjau dan gerbang lokasi hanya perlu
 * satu query berindeks, bukan seed.
 */
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { AKUN_UJI } from "../lib/akunUji";

/**
 * Apakah `userId` adalah AKUN UJI PINJAMAN.
 *
 * Penanda yang dipakai nomor WhatsApp tetap (indeks unik) DAN nama profil.
 * Keduanya harus cocok: nomor saja bisa dipakai ulang bila seed dijalankan di
 * lingkungan lain, dan nama saja bisa dipakai siapa pun yang mendaftar.
 */
export async function adalahAkunUji(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<boolean> {
  const profil = await ctx.db
    .query("nasabahProfil")
    .withIndex("by_nomorWhatsApp", (q) =>
      q.eq("nomorWhatsApp", AKUN_UJI.nomorWhatsApp),
    )
    .first();
  return (
    profil !== null &&
    profil.userId === userId &&
    profil.namaLengkap === AKUN_UJI.nama
  );
}
