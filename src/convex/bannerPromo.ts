import { v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  BATAS_BANNER,
  MAKS_BANNER_BYTE,
  jenisGambarDariKepala,
  periksaIsiBannerPromo,
} from "../lib/bannerPromo";
import { requireAdminSession } from "./adminAuthz";
import { audit } from "./system";

const PENEMPATAN = v.union(
  v.literal("beranda"),
  v.literal("dashboard"),
  v.literal("promo"),
);

const VARIAN = v.union(v.literal("desktop"), v.literal("mobile"));

/** Batas jumlah baris yang dipindai saat memilih banner tampil. */
const BATAS_BANNER_AKTIF = 50;

async function requireAdmin(ctx: Parameters<typeof requireAdminSession>[0]) {
  return await requireAdminSession(ctx);
}

/**
 * Banner yang layak tampil pada satu penempatan, atau null.
 *
 * Semua syarat diperiksa di server: sakelar, jadwal, gambar, dan promo bunga
 * yang diikat. Baris diurutkan `prioritas` kecil lebih dulu, jadi kampanye yang
 * sudah dijadwalkan mengambil alih otomatis tanpa admin menyentuh gambar lagi.
 */
export const aktif = query({
  args: { penempatan: PENEMPATAN },
  handler: async (ctx, args) => {
    const sekarang = Date.now();
    const rows = await ctx.db
      .query("bannerPromo")
      .withIndex("by_prioritas")
      .order("asc")
      .take(BATAS_BANNER_AKTIF);

    for (const row of rows) {
      if (!row.aktif) continue;
      if (row.mulai > sekarang || row.selesai < sekarang) continue;
      if (!row.penempatan.includes(args.penempatan)) continue;
      if (row.gambarDesktopId === undefined && row.gambarMobileId === undefined) {
        continue;
      }

      // Promo yang diikat harus benar-benar berjalan; kalau tidak, banner
      // kampanye itu tidak boleh muncul sebagai janji yang sudah kedaluwarsa.
      let selesai = row.selesai;
      let promoNama: string | null = null;
      if (row.promoBungaId !== undefined) {
        const promo = await ctx.db.get(row.promoBungaId);
        if (
          promo === null ||
          !promo.aktif ||
          promo.mulai > sekarang ||
          promo.selesai < sekarang
        ) {
          continue;
        }
        selesai = Math.min(selesai, promo.selesai);
        promoNama = promo.nama;
      }

      const desktopUrl =
        row.gambarDesktopId === undefined
          ? null
          : await ctx.storage.getUrl(row.gambarDesktopId);
      const mobileUrl =
        row.gambarMobileId === undefined
          ? null
          : await ctx.storage.getUrl(row.gambarMobileId);
      if (desktopUrl === null && mobileUrl === null) continue;

      return {
        _id: row._id,
        judul: row.judul !== "" ? row.judul : "Promo PINDAI",
        tautan: row.tautan,
        // Dibiarkan nullable: klien memilih rasio sesuai gambar yang benar-benar
        // ada, bukan memaksa gambar desktop dipotong 4:5 di ponsel.
        desktopUrl,
        mobileUrl,
        selesai,
        promoNama,
      };
    }
    return null;
  },
});

/** Seluruh banner untuk panel admin, termasuk URL pratinjau kedua rasio. */
export const daftar = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db
      .query("bannerPromo")
      .withIndex("by_prioritas")
      .order("asc")
      .take(100);

    return await Promise.all(
      rows.map(async (row) => ({
        _id: row._id,
        nama: row.nama,
        judul: row.judul,
        tautan: row.tautan,
        penempatan: row.penempatan,
        mulai: row.mulai,
        selesai: row.selesai,
        aktif: row.aktif,
        promoBungaId: row.promoBungaId ?? null,
        prioritas: row.prioritas,
        diperbaruiPada: row.diperbaruiPada,
        desktopUrl:
          row.gambarDesktopId === undefined
            ? null
            : await ctx.storage.getUrl(row.gambarDesktopId),
        mobileUrl:
          row.gambarMobileId === undefined
            ? null
            : await ctx.storage.getUrl(row.gambarMobileId),
      })),
    );
  },
});

/**
 * Simpan kampanye banner (baru atau sunting).
 *
 * Gambar TIDAK ikut di sini: berkas harus diunggah lebih dulu dan baru
 * ditautkan lewat `pasangGambar`, sehingga action bisa memeriksa isi berkasnya.
 * Panel memakai `id` yang dikembalikan untuk mengaktifkan tombol unggah pada
 * kampanye baru.
 */
export const simpan = mutation({
  args: {
    id: v.optional(v.id("bannerPromo")),
    nama: v.string(),
    judul: v.string(),
    tautan: v.string(),
    penempatan: v.array(PENEMPATAN),
    mulai: v.number(),
    selesai: v.number(),
    aktif: v.boolean(),
    promoBungaId: v.union(v.id("promoBunga"), v.null()),
    prioritas: v.number(),
  },
  handler: async (ctx, args) => {
    const { userId, user } = await requireAdmin(ctx);
    const bersih = (teks: string, maks: number) => teks.trim().slice(0, maks);
    const nama = bersih(args.nama, BATAS_BANNER.nama);
    const judul = bersih(args.judul, BATAS_BANNER.judul);
    const tautan = args.tautan.trim();

    const galat = periksaIsiBannerPromo({
      nama,
      mulai: args.mulai,
      selesai: args.selesai,
      penempatan: args.penempatan,
      tautan,
      prioritas: args.prioritas,
    });
    if (galat.length > 0) throw new Error(galat[0]);

    let promoBungaId: Id<"promoBunga"> | undefined;
    if (args.promoBungaId !== null) {
      const promo = await ctx.db.get(args.promoBungaId);
      if (promo === null) {
        throw new Error("Promo bunga yang dipilih tidak ditemukan.");
      }
      promoBungaId = args.promoBungaId;
    }

    const isi = {
      nama,
      judul,
      tautan: tautan.slice(0, BATAS_BANNER.tautan),
      penempatan: [...new Set(args.penempatan)],
      mulai: args.mulai,
      selesai: args.selesai,
      aktif: args.aktif,
      promoBungaId,
      prioritas: Math.round(args.prioritas),
      diperbaruiPada: Date.now(),
      diperbaruiOleh: user.email ?? user.name ?? "admin",
    };

    let id: Id<"bannerPromo">;
    if (args.id !== undefined) {
      const existing = await ctx.db.get(args.id);
      if (existing === null) throw new Error("Banner tidak ditemukan.");
      await ctx.db.patch(existing._id, isi);
      id = existing._id;
    } else {
      id = await ctx.db.insert("bannerPromo", {
        ...isi,
        dibuatPada: Date.now(),
      });
    }

    await audit(
      ctx,
      userId,
      isi.diperbaruiOleh,
      args.id === undefined ? "buat_banner_promo" : "sunting_banner_promo",
      `bannerPromo:${id}`,
      `Kampanye "${nama}", prioritas ${isi.prioritas}, ${
        isi.aktif ? "aktif" : "nonaktif"
      }.`,
    );
    return { id };
  },
});

/** Nyalakan/matikan satu kampanye tanpa membuka formulir. */
export const setAktif = mutation({
  args: { id: v.id("bannerPromo"), aktif: v.boolean() },
  handler: async (ctx, args) => {
    const { userId, user } = await requireAdmin(ctx);
    const row = await ctx.db.get(args.id);
    if (row === null) throw new Error("Banner tidak ditemukan.");
    await ctx.db.patch(row._id, {
      aktif: args.aktif,
      diperbaruiPada: Date.now(),
      diperbaruiOleh: user.email ?? user.name ?? "admin",
    });
    await audit(
      ctx,
      userId,
      user.email ?? user.name ?? "admin",
      "ubah_status_banner_promo",
      `bannerPromo:${row._id}`,
      `Banner "${row.nama}" ${args.aktif ? "diaktifkan" : "dinonaktifkan"}.`,
    );
    return { ok: true };
  },
});

/** Hapus kampanye beserta kedua berkas gambarnya. */
export const hapus = mutation({
  args: { id: v.id("bannerPromo") },
  handler: async (ctx, args) => {
    const { userId, user } = await requireAdmin(ctx);
    const row = await ctx.db.get(args.id);
    if (row === null) return { ok: true };
    if (row.gambarDesktopId !== undefined) {
      await ctx.storage.delete(row.gambarDesktopId);
    }
    if (
      row.gambarMobileId !== undefined &&
      row.gambarMobileId !== row.gambarDesktopId
    ) {
      await ctx.storage.delete(row.gambarMobileId);
    }
    await ctx.db.delete(row._id);
    await audit(
      ctx,
      userId,
      user.email ?? user.name ?? "admin",
      "hapus_banner_promo",
      `bannerPromo:${row._id}`,
      `Banner "${row.nama}" dihapus.`,
    );
    return { ok: true };
  },
});

/** URL unggah gambar banner — hanya admin aktif yang dapat memintanya. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/** Gerbang admin untuk action: action tidak punya `ctx.db`. */
export const _cekAdmin = internalQuery({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return true;
  },
});

/**
 * Pasang gambar hasil crop ke satu kampanye.
 *
 * Isi berkas diperiksa, bukan label MIME: lima byte pertama harus tanda tangan
 * JPEG/PNG/WebP. Ukuran dibatasi 3 MB — hasil crop di panel biasanya jauh di
 * bawah itu. Berkas varian lama dihapus setelah pengganti tersimpan.
 */
export const pasangGambar = action({
  args: {
    id: v.id("bannerPromo"),
    varian: VARIAN,
    berkasId: v.id("_storage"),
  },
  // Anotasi tipe balik mencegah lingkaran inferensi lewat `internal`.
  handler: async (ctx, args): Promise<{ ok: boolean }> => {
    await ctx.runQuery(internal.bannerPromo._cekAdmin, {});
    const blob = await ctx.storage.get(args.berkasId);
    if (blob === null) throw new Error("Berkas tidak ditemukan.");
    if (blob.size <= 0) throw new Error("Berkas kosong.");
    if (blob.size > MAKS_BANNER_BYTE) {
      throw new Error(
        `Ukuran banner melebihi ${Math.round(MAKS_BANNER_BYTE / (1024 * 1024))} MB.`,
      );
    }
    const kepala = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
    if (jenisGambarDariKepala(kepala) === null) {
      throw new Error("Banner harus berupa gambar JPG, PNG, atau WebP.");
    }
    return await ctx.runMutation(internal.bannerPromo._pasangGambar, {
      id: args.id,
      varian: args.varian,
      berkasId: args.berkasId,
    });
  },
});

/** Tulis tautan berkas gambar ke baris kampanye, lalu bereskan yang lama. */
export const _pasangGambar = internalMutation({
  args: {
    id: v.id("bannerPromo"),
    varian: VARIAN,
    berkasId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (row === null) throw new Error("Banner tidak ditemukan.");
    const lama =
      args.varian === "desktop" ? row.gambarDesktopId : row.gambarMobileId;

    await ctx.db.patch(row._id, {
      ...(args.varian === "desktop"
        ? { gambarDesktopId: args.berkasId }
        : { gambarMobileId: args.berkasId }),
      diperbaruiPada: Date.now(),
    });
    if (lama !== undefined && lama !== args.berkasId) {
      await ctx.storage.delete(lama);
    }
    return { ok: true };
  },
});
