/**
 * Promo bunga pinjaman harian — pengaturan admin dan pembacaan oleh mesin harga.
 *
 * Dua permukaan:
 *  - `berjalan` dibaca formulir pengajuan, supaya angka yang tampil di layar
 *    sama dengan yang nanti dipakai server;
 *  - `daftar`/`simpan`/`setAktif`/`hapus` di balik gerbang Super Admin.
 *
 * Bunga promo MENGGANTIKAN tarif matriks tenor itu, bukan mengurangi persen
 * dari bunga. `promoBungaUntukPengajuan` dipanggil `loans.createLoanApplication`
 * dan hasilnya dibekukan pada pinjaman, jadi mengubah promo kemudian tidak
 * pernah menggeser kontrak yang sudah terbit.
 */
import { v } from "convex/values";

import {
  pilihPromoBunga,
  statusPromoBunga,
  periksaIsiPromoBunga,
  type PromoBungaRingkas,
} from "../lib/promoBunga";
import type { Doc } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { requireAdminSession } from "./adminAuthz";
import { audit } from "./system";

/** Batas promo yang dibaca satu query; kampanye aktif jauh di bawah angka ini. */
const BATAS_PROMO = 50;

function ringkas(row: Doc<"promoBunga">): PromoBungaRingkas {
  return {
    _id: String(row._id),
    nama: row.nama,
    persenBunga: row.persenBunga,
    tenor: row.tenor,
    mulai: row.mulai,
    selesai: row.selesai,
    aktif: row.aktif,
  };
}

/**
 * Promo yang berlaku sekarang, untuk formulir pengajuan.
 *
 * Tanpa gerbang admin: nasabah harus bisa melihat bunga promo sebelum
 * mengirim. Yang dikirim hanya data kampanye (nama, bunga, tenor, tanggal) —
 * bukan catatan pembuat atau riwayat perubahan.
 */
export const berjalan = query({
  args: {},
  handler: async (ctx) => {
    const sekarang = Date.now();
    const rows = await ctx.db
      .query("promoBunga")
      .withIndex("by_aktif", (q) => q.eq("aktif", true))
      .take(BATAS_PROMO);

    return rows
      .filter((row) => row.mulai <= sekarang && sekarang <= row.selesai)
      .map((row) => ({
        _id: String(row._id),
        nama: row.nama,
        persenBunga: row.persenBunga,
        tenor: row.tenor,
        mulai: row.mulai,
        selesai: row.selesai,
        aktif: true,
      }));
  },
});

/** Seluruh promo bunga untuk panel admin, terbaru diperbarui dulu. */
export const daftar = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminSession(ctx);
    const sekarang = Date.now();
    const rows = await ctx.db
      .query("promoBunga")
      .withIndex("by_diperbarui")
      .order("desc")
      .take(BATAS_PROMO);

    return rows.map((row) => ({
      _id: row._id,
      nama: row.nama,
      persenBunga: row.persenBunga,
      tenor: row.tenor,
      mulai: row.mulai,
      selesai: row.selesai,
      aktif: row.aktif,
      status: statusPromoBunga(row, sekarang),
      berjalan: row.aktif && row.mulai <= sekarang && sekarang <= row.selesai,
      diperbaruiPada: row.diperbaruiPada,
      diperbaruiOleh: row.diperbaruiOleh,
    }));
  },
});

export const simpan = mutation({
  args: {
    id: v.optional(v.id("promoBunga")),
    nama: v.string(),
    persenBunga: v.number(),
    tenor: v.array(v.number()),
    mulai: v.number(),
    selesai: v.number(),
    aktif: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { userId, user } = await requireAdminSession(ctx);
    const olehLabel = user.email ?? user.name ?? "admin";
    const isi = {
      nama: args.nama.trim(),
      persenBunga: args.persenBunga,
      tenor: [...new Set(args.tenor)].sort((a, b) => a - b),
      mulai: args.mulai,
      selesai: args.selesai,
      aktif: args.aktif,
    };

    const kesalahan = periksaIsiPromoBunga(isi);
    if (kesalahan.length > 0) throw new Error(kesalahan[0]);

    const sekarang = Date.now();
    let id = args.id;

    if (id !== undefined) {
      const lama = await ctx.db.get(id);
      if (lama === null) throw new Error("Promo bunga tidak ditemukan.");
      await ctx.db.patch(id, {
        ...isi,
        diperbaruiPada: sekarang,
        diperbaruiOleh: olehLabel,
      });
    } else {
      id = await ctx.db.insert("promoBunga", {
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
      args.id === undefined ? "promo_bunga_dibuat" : "promo_bunga_diubah",
      id,
      `${isi.nama} · ${isi.persenBunga}% · tenor ${isi.tenor.join("/")} · ${
        isi.aktif ? "aktif" : "nonaktif"
      }`,
    );

    return { id };
  },
});

/**
 * Nyalakan/matikan satu promo tanpa membuka formulir.
 *
 * Mematikan promo TIDAK mengubah pinjaman yang sudah memakainya: angka itu
 * sudah dibekukan pada pinjaman. Yang berhenti hanyalah pemakaian baru.
 */
export const setAktif = mutation({
  args: { id: v.id("promoBunga"), aktif: v.boolean() },
  handler: async (ctx, args) => {
    const { userId, user } = await requireAdminSession(ctx);
    const olehLabel = user.email ?? user.name ?? "admin";
    const row = await ctx.db.get(args.id);
    if (row === null) throw new Error("Promo bunga tidak ditemukan.");

    await ctx.db.patch(args.id, {
      aktif: args.aktif,
      diperbaruiPada: Date.now(),
      diperbaruiOleh: olehLabel,
    });
    await audit(
      ctx,
      userId,
      olehLabel,
      args.aktif ? "promo_bunga_diaktifkan" : "promo_bunga_dinonaktifkan",
      args.id,
      `${row.nama} · ${row.persenBunga}%`,
    );
    return { ok: true, aktif: args.aktif };
  },
});

export const hapus = mutation({
  args: { id: v.id("promoBunga") },
  handler: async (ctx, args) => {
    const { userId, user } = await requireAdminSession(ctx);
    const olehLabel = user.email ?? user.name ?? "admin";
    const row = await ctx.db.get(args.id);
    if (row === null) throw new Error("Promo bunga tidak ditemukan.");

    await ctx.db.delete(args.id);
    await audit(
      ctx,
      userId,
      olehLabel,
      "promo_bunga_dihapus",
      args.id,
      `${row.nama} · ${row.persenBunga}% · tenor ${row.tenor.join("/")}`,
    );
    return { ok: true };
  },
});

/**
 * Promo terbaik yang berlaku untuk satu tenor pada saat pengajuan disimpan.
 *
 * Mengembalikan baris penuh (bukan ringkas) karena pemanggil perlu `_id` untuk
 * snapshot pada pinjaman. Bila beberapa promo berlaku, yang bunganya paling
 * rendah menang — aturan yang sama dengan yang ditampilkan formulir.
 */
export async function promoBungaUntukPengajuan(
  ctx: QueryCtx,
  args: { tenor: number; sekarang: number },
): Promise<Doc<"promoBunga"> | null> {
  const rows = await ctx.db
    .query("promoBunga")
    .withIndex("by_aktif", (q) => q.eq("aktif", true))
    .take(BATAS_PROMO);

  const terpilih = pilihPromoBunga(
    rows.map((row) => ringkas(row)),
    { tenor: args.tenor, sekarang: args.sekarang },
  );
  if (terpilih === null) return null;
  return rows.find((row) => String(row._id) === terpilih._id) ?? null;
}
