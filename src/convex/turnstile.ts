/**
 * Cloudflare Turnstile untuk formulir pengajuan.
 *
 * Kenapa di sini, bukan di klien: token Turnstile hanya berguna kalau server
 * benar-benar memeriksanya ke Cloudflare. Widget di klien bisa dimatikan siapa
 * pun; yang menahan bot adalah hasil `siteverify` di action ini, lalu pas
 * sekali pakai di tabel `turnstilePasses` yang diperiksa gerbang kirim.
 *
 * Kenapa action, bukan mutation: `siteverify` adalah permintaan keluar, dan
 * mutation Convex harus deterministik tanpa jaringan. Action ini yang menjawab
 * "token ini sah atau tidak", lalu mencatat pasnya lewat mutation internal.
 *
 * Selama `TURNSTILE_SECRET_KEY` belum diisi, verifikasi dilewati dan gerbang
 * berjalan seperti sebelumnya. Kunci situs untuk klien bernama
 * `VITE_TURNSTILE_SITE_KEY`.
 */
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import { action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

const URL_VERIFIKASI = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Umur pas satu verifikasi.
 *
 * Cukup untuk menyusun pengajuan (unggah dokumen, tanda tangan) setelah
 * verifikasi, dan cukup pendek sehingga token yang sudah lama tidak bisa
 * dipakai ulang untuk kiriman berikutnya.
 */
export const MASA_BERLAKU_PAS_MS = 5 * 60_000;

/** Apakah Turnstile menegakkan sesuatu pada deployment ini. */
export function turnstileAktif(): boolean {
  return (process.env.TURNSTILE_SECRET_KEY ?? "").trim() !== "";
}

/** Catat pas yang sudah terverifikasi; dipanggil action setelah Cloudflare setuju. */
export const _catatLolos = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await ctx.db.insert("turnstilePasses", {
      userId,
      kedaluwarsa: Date.now() + MASA_BERLAKU_PAS_MS,
    });
  },
});

/**
 * Periksa token Turnstile dari klien.
 *
 * Hasilnya selalu dikembalikan sebagai nilai, bukan dilempar, supaya formulir
 * bisa menampilkan alasan yang bisa dibaca pengguna. `aktif: false` berarti
 * Turnstile memang belum dipasang di deployment ini, bukan berarti lolos.
 */
export const verifikasiTurnstile = action({
  args: { token: v.string() },
  handler: async (
    ctx,
    { token },
  ): Promise<{ ok: boolean; aktif: boolean; alasan: string | null }> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Harus masuk terlebih dahulu.");

    const secret = (process.env.TURNSTILE_SECRET_KEY ?? "").trim();
    if (secret === "") return { ok: true, aktif: false, alasan: null };

    const bersih = token.trim();
    if (bersih === "") {
      return {
        ok: false,
        aktif: true,
        alasan: "Selesaikan verifikasi keamanan sebelum mengirim pengajuan.",
      };
    }

    try {
      const respons = await fetch(URL_VERIFIKASI, {
        method: "POST",
        body: new URLSearchParams({ secret, response: bersih }),
      });
      const data = (await respons.json()) as { success?: boolean };
      if (data.success !== true) {
        return {
          ok: false,
          aktif: true,
          alasan: "Verifikasi keamanan tidak lolos. Muat ulang halaman lalu coba lagi.",
        };
      }
    } catch {
      return {
        ok: false,
        aktif: true,
        alasan:
          "Verifikasi keamanan tidak bisa dihubungi. Periksa koneksi lalu coba lagi.",
      };
    }

    await ctx.runMutation(internal.turnstile._catatLolos, { userId });
    return { ok: true, aktif: true, alasan: null };
  },
});
