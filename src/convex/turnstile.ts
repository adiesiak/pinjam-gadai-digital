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
import {
  MASA_BERLAKU_GERBANG_PPOB_MS,
  hashPerangkat,
} from "../lib/ppob";

const URL_VERIFIKASI =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Batas tunggu Cloudflare; tanpa ini formulir bisa menggantung tanpa jawaban. */
const TIMEOUT_VERIFIKASI_MS = 10_000;

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

const ALFABET_GERBANG = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Token pas sekali pakai; 24 karakter dari alfabet 32 = 120 bit. */
function tokenGerbang(): string {
  const byte = crypto.getRandomValues(new Uint8Array(24));
  let hasil = "";
  for (const nilai of byte) hasil += ALFABET_GERBANG[nilai % ALFABET_GERBANG.length];
  return hasil;
}

/**
 * Catat pas Turnstile untuk pesanan PPOB publik.
 *
 * Berbeda dari pas pengajuan yang terikat `userId`, pas ini terikat HASH
 * PERANGKAT: pembeli PPOB tidak punya akun, tetapi satu pas tetap tidak boleh
 * dipakai dua peramban berbeda. Pas hanya berlaku sekali dan cepat kedaluwarsa.
 */
export const _catatGerbangPpob = internalMutation({
  args: { perangkatHash: v.string(), kedaluwarsa: v.number() },
  handler: async (ctx, args) => {
    const token = tokenGerbang();
    await ctx.db.insert("ppobGerbang", {
      token,
      perangkatHash: args.perangkatHash,
      kedaluwarsa: args.kedaluwarsa,
      dipakai: false,
      dibuatPada: Date.now(),
    });
    return { token };
  },
});

/**
 * Verifikasi Turnstile untuk pembeli PPOB tanpa akun.
 *
 * Etalase publik memang bisa dipakai tanpa masuk, jadi endpoint ini juga tidak
 * meminta sesi. Yang menahan bot adalah `siteverify` Cloudflare ditambah pas
 * sekali pakai yang diperiksa mutation pembuatan pesanan. Selama
 * `TURNSTILE_SECRET_KEY` kosong, etalase berjalan seperti sebelumnya.
 */
export const verifikasiGerbangPpob = action({
  args: { token: v.string(), perangkatId: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{
    aktif: boolean;
    gerbangToken: string | null;
    alasan: string | null;
  }> => {
    const secret = (process.env.TURNSTILE_SECRET_KEY ?? "").trim();
    if (secret === "") return { aktif: false, gerbangToken: null, alasan: null };

    let perangkatHash: string;
    try {
      perangkatHash = hashPerangkat(args.perangkatId);
    } catch (err) {
      return {
        aktif: true,
        gerbangToken: null,
        alasan: err instanceof Error ? err.message : "ID perangkat tidak sah.",
      };
    }

    const bersih = args.token.trim();
    if (bersih === "") {
      return {
        aktif: true,
        gerbangToken: null,
        alasan: "Selesaikan verifikasi keamanan sebelum memesan.",
      };
    }

    const kontrol = new AbortController();
    const jam = setTimeout(() => kontrol.abort(), TIMEOUT_VERIFIKASI_MS);
    try {
      const respons = await fetch(URL_VERIFIKASI, {
        method: "POST",
        redirect: "error",
        signal: kontrol.signal,
        body: new URLSearchParams({ secret, response: bersih }),
      });
      const data = (await respons.json()) as { success?: boolean };
      if (data.success !== true) {
        return {
          aktif: true,
          gerbangToken: null,
          alasan: "Verifikasi keamanan tidak lolos. Muat ulang lalu coba lagi.",
        };
      }
    } catch {
      return {
        aktif: true,
        gerbangToken: null,
        alasan: "Verifikasi keamanan tidak bisa dihubungi. Periksa koneksi lalu coba lagi.",
      };
    } finally {
      clearTimeout(jam);
    }

    const { token } = await ctx.runMutation(internal.turnstile._catatGerbangPpob, {
      perangkatHash,
      kedaluwarsa: Date.now() + MASA_BERLAKU_GERBANG_PPOB_MS,
    });
    return { aktif: true, gerbangToken: token, alasan: null };
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

    const kontrol = new AbortController();
    const jam = setTimeout(() => kontrol.abort(), TIMEOUT_VERIFIKASI_MS);
    try {
      const respons = await fetch(URL_VERIFIKASI, {
        method: "POST",
        redirect: "error",
        signal: kontrol.signal,
        body: new URLSearchParams({ secret, response: bersih }),
      });
      const data = (await respons.json()) as { success?: boolean };
      if (data.success !== true) {
        return {
          ok: false,
          aktif: true,
          alasan:
            "Verifikasi keamanan tidak lolos. Muat ulang halaman lalu coba lagi.",
        };
      }
    } catch {
      return {
        ok: false,
        aktif: true,
        alasan:
          "Verifikasi keamanan tidak bisa dihubungi. Periksa koneksi lalu coba lagi.",
      };
    } finally {
      clearTimeout(jam);
    }

    await ctx.runMutation(internal.turnstile._catatLolos, { userId });
    return { ok: true, aktif: true, alasan: null };
  },
});
