/**
 * Kampanye promo pinjaman.
 *
 * `promoAktif` dibaca keempat permukaan publik tanpa masuk; panel admin
 * memakai `daftar`, `simpan`, dan `hapus` di balik gerbang sesi admin.
 * Teks promo tidak pernah mengubah suku bunga, biaya, atau plafon.
 */
import { v } from "convex/values";

import {
  periksaIsiPromo,
  statusPromo,
  type PenempatanPromo,
} from "../lib/promoPinjaman";
import { mutation, query } from "./_generated/server";
import { requireAdminSession } from "./adminAuthz";
import { audit } from "./system";

const penempatanValidator = v.union(
  v.literal("beranda"),
  v.literal("dashboard"),
  v.literal("promo"),
  v.literal("pengajuan"),
);

/** Urutan pilihan dipertahankan supaya panel menampilkannya konsisten. */
function rapikanPenempatan(nilai: readonly PenempatanPromo[]): PenempatanPromo[] {
  return [...new Set(nilai)];
}

/**
 * Satu kampanye yang sedang berjalan untuk satu penempatan.
 *
 * Bila ada lebih dari satu yang aktif dan valid, yang paling baru diperbarui
 * yang tampil: admin tidak perlu mematikan promo lama secara manual saat
 * menggantinya. Masa berlaku diperiksa di server memakai jam server, bukan jam
 * perangkat pengunjung.
 */
export const promoAktif = query({
  args: { penempatan: penempatanValidator },
  handler: async (ctx, args) => {
    const sekarang = Date.now();
    // Urut terbaru dulu, bukan urutan penyimpanan: bila kampanye aktif banyak,
    // yang paling baru diperbarui tetap yang dipilih untuk penempatan ini.
    const rows = await ctx.db
      .query("promoPinjaman")
      .withIndex("by_diperbarui")
      .order("desc")
      .take(50);

    const kandidat = rows.find(
      (row) =>
        row.aktif &&
        row.penempatan.includes(args.penempatan) &&
        row.mulai <= sekarang &&
        sekarang <= row.selesai,
    );

    if (kandidat === undefined) return null;

    return {
      badge: kandidat.badge,
      judul: kandidat.judul,
      deskripsi: kandidat.deskripsi,
      mulai: kandidat.mulai,
      selesai: kandidat.selesai,
    };
  },
});

/** Seluruh kampanye untuk panel admin, terbaru dulu. */
export const daftar = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminSession(ctx);
    const sekarang = Date.now();
    const rows = await ctx.db
      .query("promoPinjaman")
      .withIndex("by_diperbarui")
      .order("desc")
      .take(100);

    return rows.map((row) => ({
      _id: row._id,
      badge: row.badge,
      judul: row.judul,
      deskripsi: row.deskripsi,
      mulai: row.mulai,
      selesai: row.selesai,
      penempatan: row.penempatan,
      aktif: row.aktif,
      // Dihitung dengan jam server supaya panel dan banner sepakat soal
      // "berjalan", berapa pun jam perangkat petugas.
      status: statusPromo(row, sekarang),
      berjalan: row.aktif && row.mulai <= sekarang && sekarang <= row.selesai,
      diperbaruiPada: row.diperbaruiPada,
      diperbaruiOleh: row.diperbaruiOleh,
    }));
  },
});

export const simpan = mutation({
  args: {
    id: v.optional(v.id("promoPinjaman")),
    badge: v.string(),
    judul: v.string(),
    deskripsi: v.string(),
    mulai: v.number(),
    selesai: v.number(),
    penempatan: v.array(penempatanValidator),
    aktif: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { userId, user } = await requireAdminSession(ctx);
    const olehLabel = user.email ?? user.name ?? "admin";
    const isi = {
      badge: args.badge.trim(),
      judul: args.judul.trim(),
      deskripsi: args.deskripsi.trim(),
      mulai: args.mulai,
      selesai: args.selesai,
      penempatan: rapikanPenempatan(args.penempatan),
      aktif: args.aktif,
    };

    const kesalahan = periksaIsiPromo(isi);
    if (kesalahan.length > 0) throw new Error(kesalahan[0]);

    const sekarang = Date.now();
    let id = args.id;

    if (id !== undefined) {
      const lama = await ctx.db.get(id);
      if (lama === null) throw new Error("Promo tidak ditemukan.");
      await ctx.db.patch(id, {
        ...isi,
        diperbaruiPada: sekarang,
        diperbaruiOleh: olehLabel,
      });
    } else {
      id = await ctx.db.insert("promoPinjaman", {
        ...isi,
        dibuatPada: sekarang,
        diperbaruiPada: sekarang,
        diperbaruiOleh: olehLabel,
      });
    }

    await audit(
      ctx,
      userId,
      olehLabel,
      args.id === undefined ? "promo_pinjaman_dibuat" : "promo_pinjaman_diubah",
      id,
      `${isi.judul} · ${isi.penempatan.join(", ")} · ${isi.aktif ? "aktif" : "nonaktif"}`,
    );

    return { id };
  },
});

export const hapus = mutation({
  args: { id: v.id("promoPinjaman") },
  handler: async (ctx, args) => {
    const { userId, user } = await requireAdminSession(ctx);
    const olehLabel = user.email ?? user.name ?? "admin";
    const row = await ctx.db.get(args.id);
    if (row === null) throw new Error("Promo tidak ditemukan.");

    await ctx.db.delete(args.id);
    await audit(
      ctx,
      userId,
      olehLabel,
      "promo_pinjaman_dihapus",
      args.id,
      `${row.judul} · ${row.penempatan.join(", ")}`,
    );

    return { ok: true };
  },
});
