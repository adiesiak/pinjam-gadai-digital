/**
 * Pengaturan aplikasi Android — server.
 *
 * Yang disimpan admin di sini dipakai aplikasi Android SETIAP KALI DIBUKA, jadi
 * mengganti splash screen, logo di dalam aplikasi, atau nama aplikasi tidak
 * membutuhkan build ulang. Bentuk JSON-nya satu sumber dengan endpoint publik
 * `GET /api/aplikasi-android` (lihat `http.ts`) supaya SDK Convex dan klien HTTP
 * biasa menerima data yang sama.
 *
 * Aturan yang dijaga modul ini:
 *  - Hanya admin dengan sesi TOTP terverifikasi yang boleh membaca baris mentah
 *    atau mengubahnya (`requireAdminSession`); aplikasi cukup membaca
 *    `asetAktif` yang publik dan tidak memuat data sensitif apa pun.
 *  - Berkas wajib gambar (PNG/JPG/WebP) maksimal 3 MB — diperiksa dari metadata
 *    storage, bukan dari klaim klien.
 *  - Setiap perubahan dan pengembalian ke bawaan tercatat di Audit Trail.
 */
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";

import {
  DEFAULT_APLIKASI_ANDROID,
  KUNCI_ASET_APLIKASI,
  normalisasiNamaAplikasi,
  normalisasiWarna,
  susunAsetAplikasi,
  validasiGambarAplikasi,
  type BarisAplikasiAndroid,
  type KunciAsetAplikasi,
} from "../lib/asetAndroidApp";
import { getAdminGateStatus, requireAdminSession } from "./adminAuthz";
import { audit } from "./system";

const SLOT = "global";

/** Label slot untuk pesan validasi — satu tempat, dipakai server & panel. */
const LABEL_ASET: Record<KunciAsetAplikasi, string> = {
  ikon: "Logo aplikasi",
  ikonSplash: "Ikon splash Android 12",
  splash: "Splash screen",
};

/** Gerbang admin (mutation): sesi TOTP terverifikasi. */
async function requireAdmin(ctx: MutationCtx) {
  return await requireAdminSession(ctx);
}

/** Baris mentah pengaturan; null bila admin belum pernah menyimpan. */
async function barisPengaturan(ctx: QueryCtx): Promise<Doc<"androidAppConfig"> | null> {
  return await ctx.db
    .query("androidAppConfig")
    .withIndex("by_slot", (q) => q.eq("slot", SLOT))
    .first();
}

/** Id tersimpan satu slot (string kosong = tidak ada). */
function idSlot(baris: Doc<"androidAppConfig">, kunci: KunciAsetAplikasi): string | null {
  const nilai =
    kunci === "ikon" ? baris.ikonId : kunci === "ikonSplash" ? baris.ikonSplashId : baris.splashId;
  return typeof nilai === "string" && nilai !== "" ? nilai : null;
}

/** Baris mentah untuk editor admin; `null` bila pemanggil bukan admin. */
export const getConfigRow = query({
  args: {},
  handler: async (ctx) => {
    const gate = await getAdminGateStatus(ctx);
    if (!gate.isAdmin) return null;
    await requireAdminSession(ctx);
    return await barisPengaturan(ctx);
  },
});

/**
 * Kontrak publik yang dibaca aplikasi Android (query) — juga dipakai endpoint
 * HTTP. Tidak memuat data sensitif; URL berkas diselesaikan server.
 */
export const asetAktif = query({
  args: {},
  handler: async (ctx) => {
    const baris = await barisPengaturan(ctx);
    const url: Partial<Record<KunciAsetAplikasi, string | null>> = {};
    if (baris !== null) {
      for (const kunci of KUNCI_ASET_APLIKASI) {
        const id = idSlot(baris, kunci);
        // Hanya slot yang benar-benar terisi yang diresolusikan URL-nya.
        if (id !== null) url[kunci] = await ctx.storage.getUrl(id as Id<"_storage">);
      }
    }
    return susunAsetAplikasi(baris as BarisAplikasiAndroid | null, url);
  },
});

/** URL unggah berkas aset aplikasi — hanya admin aktif yang dapat memintanya. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/** Nama berkas asli: dirapikan & dibatasi, hanya untuk ditampilkan. */
function bersihkanNamaBerkas(nama: string | undefined): string | undefined {
  const teks = (nama ?? "").trim();
  return teks === "" ? undefined : teks.slice(0, 120);
}

/**
 * Simpan pengaturan aplikasi Android.
 *
 * Setiap slot aset menerima salah satu dari tiga keadaan:
 *  - `undefined` — biarkan apa adanya;
 *  - id berkas — pasang berkas ini (metadata storage diverifikasi di sini);
 *  - `null` — kosongkan, aplikasi kembali memakai berkas bawaan.
 */
export const simpan = mutation({
  args: {
    namaAplikasi: v.optional(v.string()),
    warnaSplash: v.optional(v.string()),
    warnaTeksSplash: v.optional(v.string()),
    ikonId: v.optional(v.union(v.id("_storage"), v.null())),
    ikonNama: v.optional(v.string()),
    ikonSplashId: v.optional(v.union(v.id("_storage"), v.null())),
    ikonSplashNama: v.optional(v.string()),
    splashId: v.optional(v.union(v.id("_storage"), v.null())),
    splashNama: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, user } = await requireAdmin(ctx);
    const label = user.email ?? user.name ?? "admin";

    const slot: Array<{
      kunci: KunciAsetAplikasi;
      id: Id<"_storage"> | null | undefined;
      nama: string | undefined;
    }> = [
      { kunci: "ikon", id: args.ikonId, nama: args.ikonNama },
      { kunci: "ikonSplash", id: args.ikonSplashId, nama: args.ikonSplashNama },
      { kunci: "splash", id: args.splashId, nama: args.splashNama },
    ];

    const patch: Partial<Doc<"androidAppConfig">> = {};
    let jumlahAsetBerubah = 0;

    for (const { kunci, id, nama } of slot) {
      if (id === undefined) continue;
      const namaBerkas = bersihkanNamaBerkas(nama);

      if (id === null) {
        // Dikosongkan admin: kembali ke berkas bawaan.
        if (kunci === "ikon") {
          patch.ikonId = null;
          patch.ikonNama = undefined;
          patch.ikonPada = undefined;
        } else if (kunci === "ikonSplash") {
          patch.ikonSplashId = null;
          patch.ikonSplashNama = undefined;
          patch.ikonSplashPada = undefined;
        } else {
          patch.splashId = null;
          patch.splashNama = undefined;
          patch.splashPada = undefined;
        }
        jumlahAsetBerubah += 1;
        continue;
      }

      const metadata = await ctx.storage.getMetadata(id);
      validasiGambarAplikasi(
        { contentType: metadata?.contentType, size: metadata?.size },
        LABEL_ASET[kunci],
      );

      const now = Date.now();
      if (kunci === "ikon") {
        patch.ikonId = id;
        patch.ikonNama = namaBerkas;
        patch.ikonPada = now;
      } else if (kunci === "ikonSplash") {
        patch.ikonSplashId = id;
        patch.ikonSplashNama = namaBerkas;
        patch.ikonSplashPada = now;
      } else {
        patch.splashId = id;
        patch.splashNama = namaBerkas;
        patch.splashPada = now;
      }
      jumlahAsetBerubah += 1;
    }

    if (args.namaAplikasi !== undefined) {
      patch.namaAplikasi = normalisasiNamaAplikasi(args.namaAplikasi);
    }
    if (args.warnaSplash !== undefined) {
      patch.warnaSplash = normalisasiWarna(args.warnaSplash, DEFAULT_APLIKASI_ANDROID.warnaSplash);
    }
    if (args.warnaTeksSplash !== undefined) {
      patch.warnaTeksSplash = normalisasiWarna(
        args.warnaTeksSplash,
        DEFAULT_APLIKASI_ANDROID.warnaTeksSplash,
      );
    }

    if (Object.keys(patch).length === 0) {
      throw new Error("Tidak ada perubahan untuk disimpan.");
    }
    patch.diperbaruiPada = Date.now();
    patch.diperbaruiOleh = label;

    const existing = await barisPengaturan(ctx);
    if (existing === null) {
      await ctx.db.insert("androidAppConfig", {
        slot: SLOT,
        ...patch,
        diperbaruiPada: patch.diperbaruiPada,
      });
    } else {
      await ctx.db.patch(existing._id, patch);
    }

    await audit(
      ctx,
      userId,
      label,
      "ubah_aplikasi_android",
      "Aplikasi Android",
      jumlahAsetBerubah > 0
        ? `Pengaturan aplikasi Android disimpan (${jumlahAsetBerubah} aset diperbarui).`
        : "Pengaturan aplikasi Android disimpan (nama/warna).",
    );
    return { ok: true };
  },
});

/**
 * Kembalikan pengaturan ke bawaan: baris dihapus, dan berkas unggahan admin ikut
 * dibersihkan supaya storage tidak menyimpan gambar yang sudah tak dipakai.
 */
export const reset = mutation({
  args: {},
  handler: async (ctx) => {
    const { userId, user } = await requireAdmin(ctx);
    const existing = await barisPengaturan(ctx);
    if (existing === null) {
      return { ok: true, dihapus: 0 };
    }

    let dihapus = 0;
    for (const kunci of KUNCI_ASET_APLIKASI) {
      const id = idSlot(existing, kunci);
      if (id !== null) {
        await ctx.storage.delete(id as Id<"_storage">);
        dihapus += 1;
      }
    }
    await ctx.db.delete(existing._id);

    await audit(
      ctx,
      userId,
      user.email ?? user.name ?? "admin",
      "reset_aplikasi_android",
      "Aplikasi Android",
      `Pengaturan aplikasi Android dikembalikan ke bawaan (${dihapus} berkas unggahan dihapus).`,
    );
    return { ok: true, dihapus };
  },
});
