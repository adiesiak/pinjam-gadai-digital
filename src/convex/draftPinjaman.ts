/**
 * DRAF pengajuan pinjaman tunai — menyimpan pekerjaan yang belum dikirim.
 *
 * Kenapa tabel terpisah (`draftPinjaman`), bukan status di `loans`: draf BUKAN
 * pengajuan resmi. Menaruhnya di `loans` akan membuat ringkasan peminjam
 * ("total aplikasi"), antrean review admin, ruang penyedia dana, dan alokasi
 * dana ikut menghitung sesuatu yang belum diajukan — persis kelas galat
 * integritas yang harus dicegah. Karena itu draf punya tabelnya sendiri dan
 * tidak pernah menyentuh plafon, ledger, atau notifikasi.
 *
 * Isinya sengaja hanya NON-IDENTITAS (nominal, tenor, tujuan, catatan). NIK,
 * rekening, dokumen, dan tanda tangan baru dikumpulkan saat pengajuan BENAR
 * BENAR dikirim, sehingga tidak ada data pribadi yang mengendap tanpa dasar
 * persetujuan (lihat `lib/persetujuanKyc.ts`).
 *
 * Gerbang KYC (Phase 1) TIDAK berlaku di sini: menabung draf justru harus bisa
 * dilakukan sebelum KYC selesai — yang diblokir adalah PENGIRIMAN pengajuan.
 */
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import { BULANAN_LIMITS, TENOR_BULANAN_OPTIONS } from "../lib/bulanan";
import { LOAN_LIMITS, TENOR_OPTIONS } from "../lib/loan";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { audit } from "./system";

/** Gerbang: pengguna terverifikasi (bukan tamu). Sama dengan jalur pengajuan. */
async function peminjamMasuk(ctx: QueryCtx): Promise<{
  userId: Id<"users">;
  label: string;
}> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
  const user = await ctx.db.get(userId);
  if (user === null) throw new Error("Pengguna tidak ditemukan.");
  if (user.isAnonymous === true) {
    throw new Error(
      "Akun tamu hanya dapat melihat informasi. Masuk dengan akun terverifikasi untuk menyimpan draf.",
    );
  }
  return { userId, label: user.email ?? user.name ?? "peminjam" };
}

/** Skema harga yang dikenal formulir pinjaman tunai. */
const SKEMA = ["harian", "bulanan"] as const;
type Skema = (typeof SKEMA)[number];

/** Batas panjang teks draf — cukup untuk tujuan/catatan, tidak untuk dokumen. */
const PANJANG_MAKS_TUJUAN = 300;
const PANJANG_MAKS_CATATAN = 500;

function validasiDraf(args: {
  skema: string;
  pokokPinjaman: number;
  tenorHari: number;
  tenorBulan?: number;
  tujuan: string;
  catatanPeminjam?: string;
}): {
  skema: Skema;
  pokok: number;
  tenorHari: number;
  tenorBulan: number | undefined;
  tujuan: string;
  catatan: string | undefined;
} {
  if (!(SKEMA as readonly string[]).includes(args.skema)) {
    throw new Error("Skema draf harus \"harian\" atau \"bulanan\".");
  }
  const skema = args.skema as Skema;
  if (!Number.isSafeInteger(args.pokokPinjaman) || args.pokokPinjaman <= 0) {
    throw new Error("Nominal draf harus rupiah bulat positif.");
  }
  const batas = skema === "bulanan" ? BULANAN_LIMITS : LOAN_LIMITS;
  if (args.pokokPinjaman < batas.minPokok || args.pokokPinjaman > batas.maxPokok) {
    throw new Error(
      `Nominal draf harus antara ${batas.minPokok} dan ${batas.maxPokok} untuk skema ${skema}.`,
    );
  }

  let tenorHari = args.tenorHari;
  let tenorBulan: number | undefined;
  if (skema === "bulanan") {
    if (args.tenorBulan === undefined) {
      throw new Error("Skema bulanan wajib menyertakan tenor bulan.");
    }
    if (!(TENOR_BULANAN_OPTIONS as readonly number[]).includes(args.tenorBulan)) {
      throw new Error(
        `Tenor bulanan draf harus ${TENOR_BULANAN_OPTIONS.join(" / ")} bulan.`,
      );
    }
    tenorBulan = args.tenorBulan;
    // tenorHari disimpan untuk kelengkapan form; nilai final dihitung saat kirim.
    tenorHari = 30;
  } else if (!(TENOR_OPTIONS as readonly number[]).includes(args.tenorHari)) {
    throw new Error(`Tenor draf harus ${TENOR_OPTIONS.join(" / ")} hari.`);
  }

  const tujuan = args.tujuan.trim();
  if (tujuan.length > PANJANG_MAKS_TUJUAN) {
    throw new Error(`Tujuan draf maksimal ${PANJANG_MAKS_TUJUAN} karakter.`);
  }
  const catatan = args.catatanPeminjam?.trim() ?? "";
  if (catatan.length > PANJANG_MAKS_CATATAN) {
    throw new Error(`Catatan draf maksimal ${PANJANG_MAKS_CATATAN} karakter.`);
  }

  return {
    skema,
    pokok: args.pokokPinjaman,
    tenorHari,
    tenorBulan,
    tujuan,
    catatan: catatan === "" ? undefined : catatan,
  };
}

/**
 * Simpan/ubah draf. Tanpa `draftId`, draf baru dibuat. Dengan `draftId`, draf
 * milik pemanggil itu diperbarui; draf milik orang lain ditolak.
 */
export const simpanDraft = mutation({
  args: {
    draftId: v.optional(v.id("draftPinjaman")),
    skema: v.string(),
    pokokPinjaman: v.number(),
    tenorHari: v.number(),
    tenorBulan: v.optional(v.number()),
    tujuan: v.string(),
    catatanPeminjam: v.optional(v.string()),
  },
  returns: v.object({ draftId: v.id("draftPinjaman") }),
  handler: async (ctx, args) => {
    const { userId, label } = await peminjamMasuk(ctx);
    const bersih = validasiDraf(args);
    const now = Date.now();

    if (args.draftId !== undefined) {
      const lama = await ctx.db.get(args.draftId);
      if (lama === null || lama.userId !== userId) {
        throw new Error("Draf tidak ditemukan atau bukan milik Anda.");
      }
      await ctx.db.patch(args.draftId, {
        skema: bersih.skema,
        pokokPinjaman: bersih.pokok,
        tenorHari: bersih.tenorHari,
        ...(bersih.tenorBulan !== undefined ? { tenorBulan: bersih.tenorBulan } : {}),
        tujuan: bersih.tujuan,
        ...(bersih.catatan !== undefined
          ? { catatanPeminjam: bersih.catatan }
          : { catatanPeminjam: undefined }),
        diperbaruiPada: now,
      });
      return { draftId: args.draftId };
    }

    const draftId = await ctx.db.insert("draftPinjaman", {
      userId,
      status: "draft",
      skema: bersih.skema,
      pokokPinjaman: bersih.pokok,
      tenorHari: bersih.tenorHari,
      ...(bersih.tenorBulan !== undefined ? { tenorBulan: bersih.tenorBulan } : {}),
      tujuan: bersih.tujuan,
      ...(bersih.catatan !== undefined ? { catatanPeminjam: bersih.catatan } : {}),
      dibuatPada: now,
      diperbaruiPada: now,
    });
    await audit(
      ctx,
      userId,
      label,
      "draf_pinjaman_disimpan",
      draftId,
      `Draf pinjaman tunai disimpan (skema ${bersih.skema}) — belum menjadi pengajuan.`,
    );
    return { draftId };
  },
});

/** Draf terbaru milik pemanggil — `null` bila belum ada. */
export const draftSaya = query({
  args: {},
  handler: async (ctx) => {
    const { userId } = await peminjamMasuk(ctx);
    const rows = await ctx.db
      .query("draftPinjaman")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(1);
    const row = rows[0];
    if (row === undefined) return null;
    return {
      _id: row._id,
      status: row.status,
      skema: row.skema,
      pokokPinjaman: row.pokokPinjaman,
      tenorHari: row.tenorHari,
      tenorBulan: row.tenorBulan ?? null,
      tujuan: row.tujuan,
      catatanPeminjam: row.catatanPeminjam ?? null,
      diperbaruiPada: row.diperbaruiPada,
    };
  },
});

/** Hapus draf milik pemanggil (mis. setelah pengajuan berhasil dikirim). */
export const hapusDraft = mutation({
  args: { draftId: v.id("draftPinjaman") },
  returns: v.object({ dihapus: v.boolean() }),
  handler: async (ctx, args) => {
    const { userId } = await peminjamMasuk(ctx);
    const row = await ctx.db.get(args.draftId);
    if (row === null) return { dihapus: false };
    if (row.userId !== userId) {
      throw new Error("Draf tidak ditemukan atau bukan milik Anda.");
    }
    await ctx.db.delete(args.draftId);
    return { dihapus: true };
  },
});
