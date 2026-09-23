/**
 * STOP-UP! — Modul Katalog & Harga
 *
 * Query publik dipakai layar terminal (tanpa login). Mutation hanya untuk
 * admin/supervisor. Harga selalu rupiah bulat.
 */
import { v } from "convex/values";
import { internalQuery, mutation, query } from "../_generated/server";
import { requireAdmin } from "./guard";
import {
  hargaJualAktif,
  hitungBulk,
  labaPerUnit,
  persenMargin,
  type Rounding,
} from "../../lib/stopup/pricing";
import type { BrandKind } from "../../lib/stopup/master-catalog";

/** Kategori → jenis brand yang relevan (dipakai untuk smart routing). */
const KIND_BY_CATEGORY: Record<string, BrandKind> = {
  pulsa: "OPERATOR",
  data: "OPERATOR",
  ewallet: "EWALLET",
  ppob: "PPOB",
  premium: "PREMIUM",
};

function kindUntukKategori(code: string): BrandKind | null {
  return KIND_BY_CATEGORY[code] ?? null;
}

/* ============================== TERMINAL ============================== */

/** Tab menu belanja di layar terminal (urut). */
export const listCategories = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("suCategories").collect();
    return rows
      .filter((r) => r.aktif)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((r) => ({ id: r._id, code: r.code, name: r.name, icon: r.icon }));
  },
});

/** Brand/provider dalam satu kategori (operator, e-wallet, PPOB, premium). */
export const listBrands = query({
  args: { categoryCode: v.string() },
  handler: async (ctx, { categoryCode }) => {
    const kind = kindUntukKategori(categoryCode);
    if (!kind) return [];
    const rows = await ctx.db
      .query("suBrands")
      .withIndex("by_kind", (q) => q.eq("kind", kind))
      .collect();
    return rows
      .filter((r) => r.aktif)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((r) => ({
        id: r._id,
        code: r.code,
        name: r.name,
        icon: r.icon,
        color: r.color,
        kind: r.kind,
        // Default 10–13 digit = aturan nomor HP Indonesia; brand PPOB
        // menyimpan aturan digitnya sendiri (PLN 11–12, BPJS 13–16, dll).
        labelTarget: r.labelTarget ?? "Nomor HP Penerima",
        minDigit: r.minDigit ?? 10,
        maxDigit: r.maxDigit ?? 13,
        contohId: r.contohId ?? "081234567890",
      }));
  },
});

/** Katalog produk aktif untuk kombinasi kategori + brand. */
export const listProducts = query({
  args: { categoryCode: v.string(), brandCode: v.string() },
  handler: async (ctx, { categoryCode, brandCode }) => {
    const kategori = await ctx.db
      .query("suCategories")
      .withIndex("by_code", (q) => q.eq("code", categoryCode))
      .unique();
    const brand = await ctx.db
      .query("suBrands")
      .withIndex("by_code", (q) => q.eq("code", brandCode))
      .unique();
    if (!kategori || !brand) return [];

    const rows = await ctx.db
      .query("suProducts")
      .withIndex("by_category", (q) => q.eq("categoryId", kategori._id))
      .collect();

    return rows
      .filter((r) => r.brandId === brand._id && r.status === "AKTIF")
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((r) => ({
        id: r._id,
        code: r.productCodeInternal,
        name: r.name,
        description: r.description ?? "",
        icon: r.icon ?? "🛒",
        iconUrl: r.iconUrl ?? null,
        badgeLabel: r.badgeLabel ?? null,
        deliveryType: r.deliveryType,
        /** Harga jual aktif (promo menang bila aktif). */
        harga: hargaJualAktif(r),
        /** Harga coret — hanya bila promo benar-benar lebih murah. */
        hargaCoret:
          r.isDiscountActive && r.discountPrice && r.discountPrice < r.sellPrice
            ? r.sellPrice
            : null,
      }));
  },
});

/** Info brand untuk inquiry nama pelanggan (dipakai action "use node"). */
export const brandInfo = internalQuery({
  args: { brandCode: v.string() },
  handler: async (ctx, { brandCode }) => {
    const b = await ctx.db
      .query("suBrands")
      .withIndex("by_code", (q) => q.eq("code", brandCode))
      .unique();
    if (!b) return null;
    return {
      code: b.code,
      name: b.name,
      kind: b.kind,
      minDigit: b.minDigit ?? 8,
      maxDigit: b.maxDigit ?? 16,
      labelTarget: b.labelTarget ?? "Nomor Tujuan",
    };
  },
});

/* ============================== ADMIN ============================== */

/** Seluruh katalog + supplier untuk panel admin. */
export const adminCatalog = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const [kategori, brand, produk, supplier] = await Promise.all([
      ctx.db.query("suCategories").collect(),
      ctx.db.query("suBrands").collect(),
      ctx.db.query("suProducts").collect(),
      ctx.db.query("suSuppliers").collect(),
    ]);

    const namaKategori = new Map(kategori.map((k) => [k._id, k.name]));
    const namaBrand = new Map(brand.map((b) => [b._id, b.name]));
    const namaSupplier = new Map(supplier.map((s) => [s._id, s.name]));

    return {
      kategori: kategori
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((k) => ({ id: k._id, code: k.code, name: k.name, icon: k.icon, aktif: k.aktif })),
      brand: brand
        .slice()
        .sort((a, b) => a.kind.localeCompare(b.kind) || a.sortOrder - b.sortOrder)
        .map((b) => ({ id: b._id, code: b.code, name: b.name, kind: b.kind, icon: b.icon, color: b.color, aktif: b.aktif })),
      supplier: supplier
        .slice()
        .sort((a, b) => a.priority - b.priority)
        .map((s) => ({
          id: s._id,
          code: s.code,
          name: s.name,
          mode: s.mode,
          balance: s.balance,
          isActive: s.isActive,
          priority: s.priority,
          baseUrl: s.baseUrl ?? "",
          adaApiKey: Boolean(s.apiKey),
          adaSecretKey: Boolean(s.secretKey),
          lastSyncAt: s.lastSyncAt ?? null,
          lastSyncCount: s.lastSyncCount ?? null,
        })),
      produk: produk
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((p) => ({
          id: p._id,
          code: p.productCodeInternal,
          codeSupplier: p.productCodeSupplier,
          name: p.name,
          description: p.description ?? "",
          icon: p.icon ?? "🛒",
          iconUrl: p.iconUrl ?? null,
          badgeLabel: p.badgeLabel ?? null,
          sortOrder: p.sortOrder,
          kategori: namaKategori.get(p.categoryId) ?? "-",
          brand: namaBrand.get(p.brandId) ?? "-",
          supplier: p.supplierId ? (namaSupplier.get(p.supplierId) ?? "-") : "-",
          hppPrice: p.hppPrice,
          sellPrice: p.sellPrice,
          discountPrice: p.discountPrice ?? null,
          isDiscountActive: p.isDiscountActive,
          hargaJual: hargaJualAktif(p),
          laba: labaPerUnit({ hppPrice: p.hppPrice, sellPrice: p.sellPrice, discountPrice: p.discountPrice, isDiscountActive: p.isDiscountActive }),
          marginPersen: persenMargin({ hppPrice: p.hppPrice, sellPrice: p.sellPrice, discountPrice: p.discountPrice, isDiscountActive: p.isDiscountActive }),
          deliveryType: p.deliveryType,
          status: p.status,
        })),
    };
  },
});

/** Ubah satu produk (nama, ikon, badge, harga, promo, status). */
export const updateProduct = mutation({
  args: {
    productId: v.id("suProducts"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    icon: v.optional(v.string()),
    iconUrl: v.optional(v.string()),
    badgeLabel: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
    hppPrice: v.optional(v.number()),
    sellPrice: v.optional(v.number()),
    discountPrice: v.optional(v.union(v.number(), v.null())),
    isDiscountActive: v.optional(v.boolean()),
    status: v.optional(v.union(v.literal("AKTIF"), v.literal("NONAKTIF"))),
    deliveryType: v.optional(
      v.union(
        v.literal("INJECT_PHONE"),
        v.literal("INJECT_EMAIL"),
        v.literal("VOUCHER_CODE"),
        v.literal("PPOB_INQUIRY"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const { productId, ...patch } = args;
    const produk = await ctx.db.get(productId);
    if (!produk) throw new Error("Produk tidak ditemukan.");

    const bersih: Record<string, unknown> = { diperbaruiPada: Date.now() };
    for (const [k, val] of Object.entries(patch)) {
      if (val === undefined) continue;
      bersih[k] = k === "discountPrice" && val === null ? undefined : val;
    }

    const hppBaru = (bersih.hppPrice as number | undefined) ?? produk.hppPrice;
    const jualBaru = (bersih.sellPrice as number | undefined) ?? produk.sellPrice;
    if (!Number.isInteger(hppBaru) || hppBaru < 0) throw new Error("HPP harus rupiah bulat.");
    if (!Number.isInteger(jualBaru) || jualBaru <= 0) throw new Error("Harga jual harus rupiah bulat > 0.");
    if (jualBaru < hppBaru) throw new Error("Harga jual tidak boleh di bawah HPP (jual rugi).");

    await ctx.db.patch(productId, bersih);
    await ctx.db.insert("auditLog", {
      aktorUserId: userId,
      aktorLabel: "operasional-stopup",
      aksi: "produk.update",
      target: produk.productCodeInternal,
      detail: `Perubahan produk ${produk.name}`,
      waktu: Date.now(),
    });
    return { ok: true };
  },
});

/** Tambah produk manual (mis. produk lokal tanpa supplier). */
export const createProduct = mutation({
  args: {
    categoryCode: v.string(),
    brandCode: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    hppPrice: v.number(),
    sellPrice: v.number(),
    deliveryType: v.union(
      v.literal("INJECT_PHONE"),
      v.literal("INJECT_EMAIL"),
      v.literal("VOUCHER_CODE"),
      v.literal("PPOB_INQUIRY"),
    ),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const kategori = await ctx.db
      .query("suCategories")
      .withIndex("by_code", (q) => q.eq("code", args.categoryCode))
      .unique();
    const brand = await ctx.db
      .query("suBrands")
      .withIndex("by_code", (q) => q.eq("code", args.brandCode))
      .unique();
    if (!kategori || !brand) throw new Error("Kategori/brand tidak ditemukan.");
    if (!Number.isInteger(args.hppPrice) || !Number.isInteger(args.sellPrice)) {
      throw new Error("Harga harus rupiah bulat.");
    }
    if (args.sellPrice < args.hppPrice) throw new Error("Harga jual tidak boleh di bawah HPP.");

    const kode = `MANUAL-${brand.code}-${Date.now().toString(36).toUpperCase()}`;
    const id = await ctx.db.insert("suProducts", {
      productCodeInternal: kode,
      productCodeSupplier: kode,
      name: args.name,
      description: args.description,
      icon: "🛒",
      sortOrder: 999,
      categoryId: kategori._id,
      brandId: brand._id,
      hppPrice: args.hppPrice,
      sellPrice: args.sellPrice,
      isDiscountActive: false,
      deliveryType: args.deliveryType,
      status: "AKTIF",
      diperbaruiPada: Date.now(),
    });
    await ctx.db.insert("auditLog", {
      aktorUserId: userId,
      aktorLabel: "operasional-stopup",
      aksi: "produk.create",
      target: kode,
      detail: `Produk manual ${args.name}`,
      waktu: Date.now(),
    });
    return { id, code: kode };
  },
});

/** Bulk Price Management: Fixed Add-on / Percentage / Auto-Rounding. */
export const bulkPriceUpdate = mutation({
  args: {
    target: v.union(v.literal("sell"), v.literal("discount")),
    mode: v.union(v.literal("fixed"), v.literal("percent")),
    value: v.number(),
    rounding: v.union(v.literal("none"), v.literal("ratus"), v.literal("ribu")),
    categoryCode: v.optional(v.string()),
    brandCode: v.optional(v.string()),
    /** Laba minimum yang harus tetap tersisa (rupiah bulat). */
    minLaba: v.number(),
    /** true = hanya pratinjau, tidak menyimpan. */
    dryRun: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);

    let produk = await ctx.db.query("suProducts").collect();

    const codeKategori = args.categoryCode;
    if (codeKategori) {
      const kategori = await ctx.db
        .query("suCategories")
        .withIndex("by_code", (q) => q.eq("code", codeKategori))
        .unique();
      produk = kategori ? produk.filter((p) => p.categoryId === kategori._id) : [];
    }
    const codeBrand = args.brandCode;
    if (codeBrand) {
      const brand = await ctx.db
        .query("suBrands")
        .withIndex("by_code", (q) => q.eq("code", codeBrand))
        .unique();
      produk = brand ? produk.filter((p) => p.brandId === brand._id) : [];
    }

    const hasil = hitungBulk(
      produk.map((p) => ({
        id: p._id,
        nama: p.name,
        hppPrice: p.hppPrice,
        sellPrice: p.sellPrice,
        discountPrice: p.discountPrice,
      })),
      {
        target: args.target,
        formula: {
          fixedAdd: args.mode === "fixed" ? args.value : 0,
          persenAdd: args.mode === "percent" ? args.value : 0,
          rounding: args.rounding as Rounding,
        },
        minLaba: args.minLaba,
      },
    );

    if (!args.dryRun) {
      const sekarang = Date.now();
      const petaId = new Map(produk.map((p) => [String(p._id), p._id]));
      for (const baris of hasil.baris) {
        if (baris.dilewati) continue;
        const id = petaId.get(baris.productId);
        if (!id) continue;
        const patch =
          args.target === "discount"
            ? { discountPrice: baris.sesudah, isDiscountActive: true }
            : { sellPrice: baris.sesudah };
        await ctx.db.patch(id, { ...patch, diperbaruiPada: sekarang });
      }
      await ctx.db.insert("auditLog", {
        aktorUserId: userId,
        aktorLabel: "operasional-stopup",
        aksi: "harga.bulk",
        target: `${args.categoryCode ?? "semua"}/${args.brandCode ?? "semua"}`,
        detail: `Bulk ${args.mode} ${args.value} (${args.rounding}) → ${hasil.diubah} produk, ${hasil.dilewati} dilewati`,
        waktu: sekarang,
      });
    }

    return hasil;
  },
});


