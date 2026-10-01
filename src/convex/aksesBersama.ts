/**
 * Akses bersama penyedia dana — satu kode untuk banyak pemantau (lihat saja).
 *
 * Alur:
 * 1. Admin menerbitkan kode acak 20 karakter dari panel "Akses Penyedia Dana".
 *    Kode ditampilkan SEKALI, dan yang tersimpan di basis data hanya hash
 *    SHA-256-nya.
 * 2. Setiap orang yang memegang kode masuk lewat /akses-bersama. Mereka
 *    mendapat SESI TAMU sendiri (per browser), lalu kode itu mengubah sesi
 *    tersebut menjadi peran `pengamat` — jadi beberapa orang bisa memakai kode
 *    yang sama bersamaan tanpa saling menendang sesi.
 * 3. Peran `pengamat` hanya membuka query baca `convex/penyediaDana.ts`.
 *    Seluruh gerbang lain (`requireDana`, `requireAdminSession`, gerbang
 *    Peminjam) menolaknya, dan akunnya tetap bersifat tamu sehingga aksi
 *    finansial Peminjam juga tertutup.
 *
 * Pencabutan: menerbitkan kode baru atau menonaktifkan kode menaikkan `versi`,
 * dan setiap pemantau menyimpan versi yang ia pakai — pemakaian lama langsung
 * diputus tanpa perlu menghapus baris atau menyentuh akun siapa pun.
 */
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireAdminSession } from "./adminAuthz";
import { ROLES } from "./schema";
import { audit } from "./system";

/** Selalu satu baris global. */
export const SLOT_AKSES_BERSAMA = "global";

/** Panjang kode tanpa pemisah — 20 karakter acak (≈100 bit). */
export const KODE_PANJANG = 20;

/** Batas percobaan kode gagal sebelum dibekukan sementara. */
export const MAKS_GAGAL = 10;
export const JENDELA_GAGAL_MS = 15 * 60 * 1000;
export const BLOKIR_MS = 15 * 60 * 1000;

/** Batas pemindaian akun untuk statistik panel admin. */
const BATAS_AKUN = 500;

/** Alfabet tanpa karakter rancu (I/O/0/1 dihilangkan). */
const ALFABET_KODE = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Salt tetap — kode sudah acak 100 bit, salt hanya memisahkan domain hash. */
const SALT_HASH = "pindai:akses-bersama:v1:";

export type HasilMasuk =
  | { ok: true; sudahSesuai: boolean }
  | { ok: false; pesan: string };

function keHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** ASCII → byte tanpa TextEncoder (aman di seluruh runtime Convex). */
function keBytes(teks: string): Uint8Array {
  const bytes = new Uint8Array(teks.length);
  for (let i = 0; i < teks.length; i += 1) bytes[i] = teks.charCodeAt(i) & 0xff;
  return bytes;
}

/** SHA-256 hex dari kode — satu-satunya bentuk yang boleh disimpan. */
export async function hashKode(kode: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    keBytes(SALT_HASH + kode) as unknown as ArrayBuffer,
  );
  return keHex(new Uint8Array(digest));
}

/** Perbandingan waktu-konstan untuk dua string hex. */
function samaWaktuKonstan(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let beda = 0;
  for (let i = 0; i < a.length; i += 1) beda |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return beda === 0;
}

/** Buat kode acak 20 karakter dalam format XXXXX-XXXXX-XXXXX-XXXXX. */
export function buatKodeBersama(): string {
  const bytes = new Uint8Array(KODE_PANJANG);
  crypto.getRandomValues(bytes);
  const karakter = Array.from(
    bytes,
    (b) => ALFABET_KODE[b % ALFABET_KODE.length],
  ).join("");
  return (karakter.match(/.{1,5}/g) ?? []).join("-");
}

/** Normalisasi input pengguna: huruf besar, tanpa pemisah/spasi. */
export function normalisasiKode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

async function barisAkses(ctx: QueryCtx) {
  return await ctx.db
    .query("aksesBersama")
    .withIndex("by_slot", (q) => q.eq("slot", SLOT_AKSES_BERSAMA))
    .first();
}

async function statistikPemakai(ctx: QueryCtx, versiAktif: number) {
  const pengguna = await ctx.db.query("users").take(BATAS_AKUN + 1);
  const pengamat = pengguna.filter((u) => u.role === ROLES.PENGAMAT);
  return {
    pemakaiAktif: pengamat.filter((u) => u.aksesBersamaVersi === versiAktif).length,
    pemakaiTercatat: pengamat.length,
    terpotong: pengguna.length > BATAS_AKUN,
  };
}

/**
 * Status kode untuk panel admin. Tidak pernah mengembalikan kode atau hash —
 * hanya keadaan, versi, statistik pemakai, dan sisa pembekuan.
 */
export const statusKodeBersama = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminSession(ctx);
    const baris = await barisAkses(ctx);
    const versi = baris?.versi ?? 0;
    const statistik = await statistikPemakai(ctx, versi);

    return {
      adaKode: baris?.kodeHash !== undefined,
      aktif: baris?.aktif === true,
      versi,
      diterbitkanPada: baris?.diterbitkanPada ?? null,
      diperbaruiPada: baris?.diperbaruiPada ?? null,
      blokirSampai: baris?.blokirSampai ?? null,
      gagalDalamJendela: (baris?.gagalTerakhir ?? []).filter(
        (t) => Date.now() - t < JENDELA_GAGAL_MS,
      ).length,
      ...statistik,
    };
  },
});

/**
 * Terbitkan kode baru (atau ganti kode lama). Mengembalikan kode asli SEKALI
 * ini saja; yang tersimpan hanya hash-nya. Versi naik sehingga seluruh pemakai
 * lama langsung terputus.
 */
export const terbitkanKodeBersama = mutation({
  args: {},
  handler: async (ctx) => {
    const { userId: adminId, user: admin } = await requireAdminSession(ctx);

    const kode = buatKodeBersama();
    const kodeHash = await hashKode(normalisasiKode(kode));
    const baris = await barisAkses(ctx);
    const sekarang = Date.now();
    const versi = (baris?.versi ?? 0) + 1;

    if (baris === null) {
      await ctx.db.insert("aksesBersama", {
        slot: SLOT_AKSES_BERSAMA,
        kodeHash,
        aktif: true,
        versi,
        diterbitkanPada: sekarang,
        diperbaruiPada: sekarang,
        gagalTerakhir: [],
      });
    } else {
      await ctx.db.patch(baris._id, {
        kodeHash,
        aktif: true,
        versi,
        diterbitkanPada: sekarang,
        diperbaruiPada: sekarang,
        gagalTerakhir: [],
        blokirSampai: undefined,
      });
    }

    // Detail audit tidak pernah memuat kode — hanya nomor versinya.
    await audit(
      ctx,
      adminId,
      admin.email ?? admin.name ?? "admin",
      "terbitkan_kode_akses_bersama",
      `versi ${versi}`,
      "Kode akses bersama baru diterbitkan; seluruh pemakai lama diputus. Kode hanya ditampilkan sekali kepada admin penerbit.",
    );

    return { kode, versi };
  },
});

/** Nonaktifkan kode: tidak ada yang bisa bergabung lagi, pemakai lama diputus. */
export const nonaktifkanKodeBersama = mutation({
  args: {},
  handler: async (ctx) => {
    const { userId: adminId, user: admin } = await requireAdminSession(ctx);
    const baris = await barisAkses(ctx);
    if (baris === null || baris.kodeHash === undefined) {
      throw new Error("Belum ada kode akses bersama yang diterbitkan.");
    }

    const versi = baris.versi + 1;
    await ctx.db.patch(baris._id, {
      aktif: false,
      versi,
      diperbaruiPada: Date.now(),
      gagalTerakhir: [],
      blokirSampai: undefined,
    });

    await audit(
      ctx,
      adminId,
      admin.email ?? admin.name ?? "admin",
      "nonaktifkan_kode_akses_bersama",
      `versi ${versi}`,
      "Kode akses bersama dinonaktifkan; seluruh pemakai diputus dan tidak ada yang dapat bergabung.",
    );

    return { ok: true, versi };
  },
});

/** Catat percobaan gagal + bekukan bila melewati batas. */
async function catatGagal(
  ctx: MutationCtx,
  barisId: Id<"aksesBersama">,
  gagalSebelumnya: number[] | undefined,
  sekarang: number,
): Promise<number> {
  const dalamJendela = [...(gagalSebelumnya ?? []), sekarang]
    .filter((t) => sekarang - t < JENDELA_GAGAL_MS)
    .slice(-MAKS_GAGAL * 2);
  const blokirSampai =
    dalamJendela.length >= MAKS_GAGAL ? sekarang + BLOKIR_MS : undefined;
  await ctx.db.patch(barisId, {
    gagalTerakhir: dalamJendela,
    ...(blokirSampai !== undefined ? { blokirSampai } : {}),
  });
  return dalamJendela.length;
}

/**
 * Aktifkan sesi tamu menjadi pemantau lihat-saja dengan kode bersama.
 *
 * Dipanggil dari halaman publik /akses-bersama SETELAH sesi tamu (Anonymous)
 * terbentuk. Akun email tidak boleh memakai jalur ini — akunnya sendiri akan
 * kehilangan perannya; mereka memakai akses dari admin (panel Akses Penyedia
 * Dana).
 */
export const masukDenganKodeBersama = mutation({
  args: { kode: v.string() },
  handler: async (ctx, { kode }): Promise<HasilMasuk> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Sesi tamu belum siap. Muat ulang halaman lalu coba lagi.");
    }
    const user = await ctx.db.get(userId);
    if (user === null) throw new Error("Pengguna tidak ditemukan.");
    if (user.isAnonymous !== true) {
      throw new Error(
        "Kode akses bersama hanya untuk sesi tamu. Akun email memakai akses yang diberikan admin.",
      );
    }

    const baris = await barisAkses(ctx);
    if (baris === null || baris.kodeHash === undefined) {
      throw new Error("Admin belum menerbitkan kode akses bersama.");
    }
    if (baris.aktif !== true) {
      throw new Error("Kode akses bersama sedang dinonaktifkan admin.");
    }

    const sekarang = Date.now();
    const sisaBlokir = (baris.blokirSampai ?? 0) - sekarang;
    if (sisaBlokir > 0) {
      throw new Error(
        `Terlalu banyak percobaan kode. Coba lagi dalam ${Math.max(
          1,
          Math.ceil(sisaBlokir / 60_000),
        )} menit.`,
      );
    }

    const dimasukkan = normalisasiKode(kode);
    if (dimasukkan.length !== KODE_PANJANG) {
      // Panjang salah belum tentu percobaan menebak; tetap dihitung sebagai
      // kegagalan supaya penebakan panjang pun ikut dibatasi.
      await catatGagal(ctx, baris._id, baris.gagalTerakhir, sekarang);
      return { ok: false, pesan: "Kode akses bersama tidak lengkap." };
    }

    const cocok = samaWaktuKonstan(await hashKode(dimasukkan), baris.kodeHash);
    if (!cocok) {
      await catatGagal(ctx, baris._id, baris.gagalTerakhir, sekarang);
      // Mutation mengembalikan hasil, bukan melempar: Convex membatalkan seluruh
      // tulisan pada mutation yang error, sehingga catatan percobaan gagal
      // harus dikembalikan lewat jalur normal agar tetap tersimpan.
      return { ok: false, pesan: "Kode akses bersama tidak cocok." };
    }

    if (user.role === ROLES.PENGAMAT && user.aksesBersamaVersi === baris.versi) {
      return { ok: true, sudahSesuai: true };
    }

    await ctx.db.patch(userId, {
      role: ROLES.PENGAMAT,
      aksesBersamaVersi: baris.versi,
      aksesBersamaPada: sekarang,
    });
    await ctx.db.patch(baris._id, { gagalTerakhir: [], blokirSampai: undefined });
    await audit(
      ctx,
      userId,
      "akun bersama (tamu)",
      "akses_bersama_masuk",
      `versi ${baris.versi}`,
      "Sesi tamu diaktifkan sebagai pemantau lihat-saja ruang penyedia dana.",
    );

    return { ok: true, sudahSesuai: false };
  },
});
