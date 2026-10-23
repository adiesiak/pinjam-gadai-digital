/**
 * Katalog Murabahah yang dikelola admin.
 *
 * Harga pokok barang berasal dari mitra dan bisa berubah tanpa rilis kode,
 * jadi katalog hidup di tabel — bukan di konstanta. Yang dijaga di sini:
 *
 *  - `kode` tetap stabil walau nama/harga berubah, karena pengajuan menyimpan
 *    kode itu;
 *  - setiap perubahan harga menulis satu baris riwayat (append-only), sehingga
 *    "kenapa harga barang ini naik" punya jawaban;
 *  - `aktif: false` menyembunyikan barang tanpa menghapusnya — jalur yang sama
 *    dipakai bila produk pulsa/PPOB harus dihentikan karena tinjauan syariah;
 *  - selama satu kode belum dimuat ke tabel, server jatuh ke daftar awal di
 *    `lib/syariah/katalog` supaya formulir tidak kosong sebelum admin sempat
 *    menekan "Muat katalog awal".
 *
 * Tidak ada uang yang berpindah di modul ini: ini master data harga pokok,
 * bukan pencatatan penjualan.
 */
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import { MAX_AKAD_SYARIAH, MIN_AKAD_SYARIAH } from "../lib/syariah/akad";
import {
  barangKatalog,
  KATALOG_MURABAHAH,
  KATEGORI_KATALOG,
  type JenisBarangKatalog,
  type KategoriKatalog,
} from "../lib/syariah/katalog";
import type { Doc, Id } from "./_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { requireAdminSession } from "./adminAuthz";
import { audit } from "./system";

const kategoriValidator = v.union(
  v.literal("Elektronik"),
  v.literal("Peralatan usaha"),
  v.literal("Perabot rumah"),
  v.literal("Kendaraan"),
  v.literal("Pulsa & data"),
  v.literal("Token & tagihan"),
);

const jenisBarangValidator = v.union(
  v.literal("fisik"),
  v.literal("digital"),
);

/** Satu barang katalog dalam bentuk yang dikirim ke klien. */
export type BarisKatalog = {
  kode: string;
  nama: string;
  kategori: KategoriKatalog;
  jenisBarang: JenisBarangKatalog;
  harga: number;
  aktif: boolean;
};

/** Baris panel admin: ditambah id dokumen dan apakah sudah dimuat ke tabel. */
export type BarisKatalogAdmin = BarisKatalog & {
  id: Id<"katalogBarang"> | null;
  dimuat: boolean;
};

function keBaris(row: Doc<"katalogBarang">): BarisKatalog {
  return {
    kode: row.kode,
    nama: row.nama,
    kategori: row.kategori,
    jenisBarang: row.jenisBarang,
    harga: row.harga,
    aktif: row.aktif,
  };
}

function validasiNama(nama: string): string {
  const rapi = nama.trim();
  if (rapi.length < 3 || rapi.length > 80) {
    throw new Error("Nama barang harus 3-80 karakter.");
  }
  return rapi;
}

function validasiHarga(harga: number): number {
  if (!Number.isSafeInteger(harga) || harga < MIN_AKAD_SYARIAH || harga > MAX_AKAD_SYARIAH) {
    throw new Error(
      `Harga katalog harus rupiah bulat antara Rp${MIN_AKAD_SYARIAH.toLocaleString("id-ID")} dan Rp${MAX_AKAD_SYARIAH.toLocaleString("id-ID")}.`,
    );
  }
  return harga;
}

function kodeBaru(nama: string): string {
  const dasar = nama
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 28) || "barang";
  const suffix = Array.from({ length: 4 }, () =>
    "abcdefghjkmnpqrstuvwxyz23456789".charAt(Math.floor(Math.random() * 31)),
  ).join("");
  return `${dasar}-${suffix}`;
}

/**
 * Barang katalog yang boleh dipakai satu pengajuan.
 *
 * Baris tabel menang atas daftar awal; kode yang belum dimuat memakai harga
 * seed. Barang nonaktif ditolak dengan pesan yang jelas — bukan "tidak
 * ditemukan", supaya peminjam tahu barangnya sengaja dihentikan.
 */
export async function barangKatalogTersedia(
  ctx: QueryCtx | MutationCtx,
  kode: string,
): Promise<BarisKatalog> {
  const row = await ctx.db
    .query("katalogBarang")
    .withIndex("by_kode", (q) => q.eq("kode", kode))
    .first();
  if (row !== null) {
    if (!row.aktif) {
      throw new Error(
        "Barang katalog ini sudah tidak ditawarkan. Pilih barang lain.",
      );
    }
    return keBaris(row);
  }

  const seed = barangKatalog(kode);
  if (seed === null) {
    throw new Error("Barang katalog tidak ditemukan. Pilih ulang dari katalog.");
  }
  return { ...seed, aktif: true };
}

/** Katalog untuk formulir peminjam: hanya barang aktif. */
export const daftarKatalog = query({
  args: {},
  handler: async (ctx): Promise<BarisKatalog[]> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Harus masuk terlebih dahulu.");

    const rows = await ctx.db.query("katalogBarang").collect();
    const peta = new Map(rows.map((row) => [row.kode, row]));
    const hasil: BarisKatalog[] = [];

    // Urutan daftar awal dipertahankan; barang tambahan admin menyusul.
    for (const seed of KATALOG_MURABAHAH) {
      const row = peta.get(seed.kode);
      if (row === undefined) {
        hasil.push({ ...seed, aktif: true });
      } else if (row.aktif) {
        hasil.push(keBaris(row));
      }
    }
    for (const row of rows) {
      if (barangKatalog(row.kode) !== null) continue;
      if (row.aktif) hasil.push(keBaris(row));
    }
    return hasil;
  },
});

/** Katalog untuk panel admin, termasuk barang nonaktif dan yang belum dimuat. */
export const daftarKatalogAdmin = query({
  args: {},
  handler: async (ctx): Promise<{
    baris: BarisKatalogAdmin[];
    belumDimuat: number;
  }> => {
    await requireAdminSession(ctx);

    const rows = await ctx.db.query("katalogBarang").collect();
    const peta = new Map(rows.map((row) => [row.kode, row]));
    const baris: BarisKatalogAdmin[] = [];

    for (const seed of KATALOG_MURABAHAH) {
      const row = peta.get(seed.kode);
      baris.push(
        row === undefined
          ? { ...seed, aktif: true, id: null, dimuat: false }
          : { ...keBaris(row), id: row._id, dimuat: true },
      );
    }
    for (const row of rows) {
      if (barangKatalog(row.kode) !== null) continue;
      baris.push({ ...keBaris(row), id: row._id, dimuat: true });
    }

    return {
      baris,
      belumDimuat: baris.filter((item) => !item.dimuat).length,
    };
  },
});

/** Muat daftar awal ke tabel. Idempoten: kode yang sudah ada tidak disentuh. */
export const muatKatalogAwal = mutation({
  args: {},
  handler: async (ctx): Promise<{ ditambahkan: number }> => {
    const { userId: adminId, user: admin } = await requireAdminSession(ctx);
    const rows = await ctx.db.query("katalogBarang").collect();
    const ada = new Set(rows.map((row) => row.kode));
    const now = Date.now();

    let ditambahkan = 0;
    for (const seed of KATALOG_MURABAHAH) {
      if (ada.has(seed.kode)) continue;
      await ctx.db.insert("katalogBarang", {
        kode: seed.kode,
        nama: seed.nama,
        kategori: seed.kategori,
        jenisBarang: seed.jenisBarang,
        harga: seed.harga,
        aktif: true,
        dibuatPada: now,
        diperbaruiPada: now,
      });
      ditambahkan += 1;
    }

    if (ditambahkan > 0) {
      await audit(
        ctx,
        adminId,
        admin.email ?? admin.name ?? "admin",
        "katalog_syariah_dimuat",
        "KATALOG",
        `${ditambahkan} barang katalog awal dimuat.`,
      );
    }
    return { ditambahkan };
  },
});

/**
 * Simpan satu barang katalog.
 *
 * `kode` kosong = barang baru. Kode yang sudah ada = ubah; bila barisnya belum
 * pernah dimuat tetapi kodenya ada di daftar awal, baris itu dibuat dari nilai
 * yang dikirim admin. Perubahan harga menulis riwayat.
 */
export const simpanBarang = mutation({
  args: {
    kode: v.optional(v.string()),
    nama: v.string(),
    kategori: kategoriValidator,
    jenisBarang: jenisBarangValidator,
    harga: v.number(),
    aktif: v.boolean(),
    catatan: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ kode: string }> => {
    const { userId: adminId, user: admin } = await requireAdminSession(ctx);
    const nama = validasiNama(args.nama);
    const harga = validasiHarga(args.harga);
    const catatan = args.catatan?.trim() ?? "";
    if (catatan.length > 200) {
      throw new Error("Catatan perubahan maksimal 200 karakter.");
    }
    if (!(KATEGORI_KATALOG as readonly string[]).includes(args.kategori)) {
      throw new Error("Kategori katalog tidak dikenal.");
    }

    const now = Date.now();
    const label = admin.email ?? admin.name ?? "admin";

    if (args.kode === undefined) {
      let kode = kodeBaru(nama);
      for (let i = 0; i < 5; i += 1) {
        const bentrok = await ctx.db
          .query("katalogBarang")
          .withIndex("by_kode", (q) => q.eq("kode", kode))
          .first();
        if (bentrok === null && barangKatalog(kode) === null) break;
        kode = kodeBaru(nama);
      }
      await ctx.db.insert("katalogBarang", {
        kode,
        nama,
        kategori: args.kategori,
        jenisBarang: args.jenisBarang,
        harga,
        aktif: args.aktif,
        dibuatPada: now,
        diperbaruiPada: now,
      });
      await audit(
        ctx,
        adminId,
        label,
        "katalog_syariah_barang_baru",
        kode,
        `${nama} · ${args.kategori} · Rp${harga.toLocaleString("id-ID")}`,
      );
      return { kode };
    }

    const kodeTetap = args.kode;
    const row = await ctx.db
      .query("katalogBarang")
      .withIndex("by_kode", (q) => q.eq("kode", kodeTetap))
      .first();

    if (row === null) {
      const seed = barangKatalog(kodeTetap);
      if (seed === null) {
        throw new Error("Barang katalog tidak ditemukan.");
      }
      const id = await ctx.db.insert("katalogBarang", {
        kode: seed.kode,
        nama,
        kategori: args.kategori,
        jenisBarang: args.jenisBarang,
        harga,
        aktif: args.aktif,
        dibuatPada: now,
        diperbaruiPada: now,
      });
      if (harga !== seed.harga) {
        await ctx.db.insert("katalogRiwayatHarga", {
          kode: seed.kode,
          barangId: id,
          nama,
          hargaLama: seed.harga,
          hargaBaru: harga,
          ...(catatan === "" ? {} : { catatan }),
          diubahPada: now,
          diubahOleh: adminId,
          diubahOlehLabel: label,
        });
      }
      await audit(
        ctx,
        adminId,
        label,
        "katalog_syariah_disimpan",
        seed.kode,
        `${nama} · ${args.kategori} · Rp${harga.toLocaleString("id-ID")}${args.aktif ? "" : " · nonaktif"}`,
      );
      return { kode: seed.kode };
    }

    const hargaLama = row.harga;
    await ctx.db.patch(row._id, {
      nama,
      kategori: args.kategori,
      jenisBarang: args.jenisBarang,
      harga,
      aktif: args.aktif,
      diperbaruiPada: now,
    });
    if (harga !== hargaLama) {
      await ctx.db.insert("katalogRiwayatHarga", {
        kode: row.kode,
        barangId: row._id,
        nama,
        hargaLama,
        hargaBaru: harga,
        ...(catatan === "" ? {} : { catatan }),
        diubahPada: now,
        diubahOleh: adminId,
        diubahOlehLabel: label,
      });
      await audit(
        ctx,
        adminId,
        label,
        "katalog_syariah_harga",
        row.kode,
        `${nama}: Rp${hargaLama.toLocaleString("id-ID")} → Rp${harga.toLocaleString("id-ID")}`,
      );
    }
    if (row.aktif !== args.aktif) {
      await audit(
        ctx,
        adminId,
        label,
        args.aktif ? "katalog_syariah_diaktifkan" : "katalog_syariah_dinonaktifkan",
        row.kode,
        `${nama} ${args.aktif ? "ditampilkan lagi" : "disembunyikan"} dari formulir.`,
      );
    }
    return { kode: row.kode };
  },
});

/** Riwayat harga satu barang, terbaru lebih dulu. */
export const riwayatHarga = query({
  args: { kode: v.string() },
  handler: async (
    ctx,
    { kode },
  ): Promise<
    {
      hargaLama: number;
      hargaBaru: number;
      catatan: string | null;
      diubahPada: number;
      diubahOlehLabel: string;
    }[]
  > => {
    await requireAdminSession(ctx);
    const rows = await ctx.db
      .query("katalogRiwayatHarga")
      .withIndex("by_kode", (q) => q.eq("kode", kode))
      .order("desc")
      .take(20);
    return rows.map((row) => ({
      hargaLama: row.hargaLama,
      hargaBaru: row.hargaBaru,
      catatan: row.catatan ?? null,
      diubahPada: row.diubahPada,
      diubahOlehLabel: row.diubahOlehLabel,
    }));
  },
});
