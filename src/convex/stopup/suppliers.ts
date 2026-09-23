/**
 * STOP-UP! — Modul Supplier H2H (Digiflazz / Tripay / custom)
 *
 * "Easy Pluggable H2H Supplier Integration": operator menempel API key & secret
 * key lewat panel admin, lalu menekan **One-Click Catalog Sync** untuk menarik
 * katalog SKU ke database lokal.
 *
 * Bila supplier belum punya API key, sync berjalan dalam Mode Simulasi memakai
 * master katalog acuan (src/lib/stopup/master-catalog.ts) dan hasilnya diberi
 * tanda `mode: "SIMULASI"` — tidak ada data yang diklaim berasal dari supplier.
 */
import { v } from "convex/values";
import { internalQuery, mutation, query } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { requireAdmin, requireSuperAdmin } from "./guard";
import { MASTER_BRAND, MASTER_KATEGORI, MASTER_PRODUK } from "../../lib/stopup/master-catalog";

/**
 * Supplier produksi yang siap dipakai (API key + secret + base URL lengkap).
 * Hanya dipakai action server-side; kunci tidak pernah sampai ke browser.
 */
export const supplierProduksi = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("suSuppliers").collect();
    const s = rows
      .filter((r) => r.isActive && r.mode === "production" && r.apiKey && r.secretKey && r.baseUrl)
      .sort((a, b) => a.priority - b.priority)[0];
    if (!s) return null;
    return {
      code: s.code,
      name: s.name,
      baseUrl: s.baseUrl as string,
      apiKey: s.apiKey as string,
      secretKey: s.secretKey as string,
    };
  },
});

/** Daftar supplier untuk panel admin (kunci tidak pernah dikirim ke klien). */
export const listSuppliers = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query("suSuppliers").collect();
    return rows
      .sort((a, b) => a.priority - b.priority)
      .map((s) => ({
        id: s._id,
        code: s.code,
        name: s.name,
        mode: s.mode,
        baseUrl: s.baseUrl ?? "",
        balance: s.balance,
        isActive: s.isActive,
        priority: s.priority,
        adaApiKey: Boolean(s.apiKey),
        adaSecretKey: Boolean(s.secretKey),
        lastSyncAt: s.lastSyncAt ?? null,
        lastSyncCount: s.lastSyncCount ?? null,
      }));
  },
});

/** Simpan/ubah konfigurasi supplier (upsert berdasarkan kode). */
export const saveSupplier = mutation({
  args: {
    supplierId: v.optional(v.id("suSuppliers")),
    code: v.string(),
    name: v.string(),
    baseUrl: v.optional(v.string()),
    apiKey: v.optional(v.string()),
    secretKey: v.optional(v.string()),
    mode: v.union(v.literal("sandbox"), v.literal("production")),
    priority: v.number(),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireSuperAdmin(ctx);
    const patch = {
      code: args.code.trim().toLowerCase(),
      name: args.name.trim(),
      baseUrl: args.baseUrl?.trim() || undefined,
      // Kunci kosong berarti "jangan ubah" — supaya tidak sengaja terhapus.
      apiKey: args.apiKey?.trim() ? args.apiKey.trim() : undefined,
      secretKey: args.secretKey?.trim() ? args.secretKey.trim() : undefined,
      mode: args.mode,
      priority: Math.max(0, Math.round(args.priority)),
      isActive: args.isActive,
      diperbaruiPada: Date.now(),
    };

    if (args.supplierId) {
      const ada = await ctx.db.get(args.supplierId);
      if (!ada) throw new Error("Supplier tidak ditemukan.");
      const bersih: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(patch)) {
        if (val !== undefined) bersih[k] = val;
      }
      await ctx.db.patch(args.supplierId, bersih);
    } else {
      const sudahAda = await ctx.db
        .query("suSuppliers")
        .withIndex("by_code", (q) => q.eq("code", patch.code))
        .unique();
      if (sudahAda) throw new Error("Kode supplier sudah dipakai.");
      await ctx.db.insert("suSuppliers", { ...patch, balance: 0 });
    }

    await ctx.db.insert("auditLog", {
      aktorUserId: userId,
      aktorLabel: "operasional-stopup",
      aksi: "supplier.save",
      target: patch.code,
      detail: `Konfigurasi supplier ${patch.name} (${patch.mode})`,
      waktu: Date.now(),
    });
    return { ok: true };
  },
});

/** Aktif/nonaktifkan supplier (mis. saldo habis → matikan sementara). */
export const setSupplierActive = mutation({
  args: { supplierId: v.id("suSuppliers"), isActive: v.boolean() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ctx.db.patch(args.supplierId, {
      isActive: args.isActive,
      diperbaruiPada: Date.now(),
    });
    return { ok: true };
  },
});

/**
 * Simulasi setoran deposit ke supplier. Di produksi angka ini datang dari
 * endpoint "cek saldo" H2H — di sini diisi manual supaya alert saldo rendah
 * (Telegram) bisa diuji.
 */
export const topUpSupplierBalance = mutation({
  args: { supplierId: v.id("suSuppliers"), jumlah: v.number() },
  handler: async (ctx, args) => {
    const { userId } = await requireSuperAdmin(ctx);
    if (!Number.isInteger(args.jumlah) || args.jumlah === 0) {
      throw new Error("Nominal deposit harus rupiah bulat.");
    }
    const s = await ctx.db.get(args.supplierId);
    if (!s) throw new Error("Supplier tidak ditemukan.");
    const saldoBaru = Math.max(0, s.balance + args.jumlah);
    await ctx.db.patch(args.supplierId, { balance: saldoBaru, diperbaruiPada: Date.now() });
    await ctx.db.insert("auditLog", {
      aktorUserId: userId,
      aktorLabel: "operasional-stopup",
      aksi: "supplier.deposit",
      target: s.code,
      detail: `Penyesuaian saldo ${args.jumlah >= 0 ? "+" : ""}${args.jumlah} → ${saldoBaru}`,
      waktu: Date.now(),
    });
    return { balance: saldoBaru };
  },
});

/** Ringkasan katalog acuan (dipakai dialog konfirmasi sync). */
export const syncPreview = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const supplier = await ctx.db.query("suSuppliers").collect();
    const prioritas = supplier
      .filter((s) => s.isActive)
      .sort((a, b) => a.priority - b.priority)[0];
    return {
      produk: MASTER_PRODUK.length,
      kategori: MASTER_KATEGORI.length,
      brand: MASTER_BRAND.length,
      perKategori: MASTER_KATEGORI.map((k) => ({
        code: k.code,
        name: k.name,
        jumlah: MASTER_PRODUK.filter((p) => p.categoryCode === k.code).length,
      })),
      target: prioritas
        ? { code: prioritas.code, name: prioritas.name, mode: prioritas.mode }
        : null,
      adaSupplier: supplier.length > 0,
    };
  },
});

/* ============================ INTI SYNC ============================ */

type HasilSync = { mode: "SUPPLIER" | "SIMULASI"; baru: number; diperbarui: number };

/**
 * Tarik kategori, brand, dan SKU katalog ke database.
 *
 * Untuk produk yang SUDAH ada, harga jual & promo milik operator DIPERTAHANKAN
 * (sync tidak boleh menimpa keputusan harga manual) — hanya HPP, nama produk,
 * dan kode supplier yang diperbarui.
 */
async function terapkanKatalog(
  ctx: MutationCtx,
  supplierId: Id<"suSuppliers"> | null,
): Promise<HasilSync> {
  const supplier = supplierId ? await ctx.db.get(supplierId) : null;
  const modeNyata = Boolean(
    supplier && supplier.apiKey && supplier.secretKey && supplier.mode === "production",
  );

  const petaKategori = new Map<string, Id<"suCategories">>();
  for (const k of MASTER_KATEGORI) {
    const ada = await ctx.db
      .query("suCategories")
      .withIndex("by_code", (q) => q.eq("code", k.code))
      .unique();
    if (ada) {
      await ctx.db.patch(ada._id, {
        name: k.name,
        icon: k.icon,
        sortOrder: k.sortOrder,
        aktif: true,
      });
      petaKategori.set(k.code, ada._id);
    } else {
      const id = await ctx.db.insert("suCategories", {
        code: k.code,
        name: k.name,
        icon: k.icon,
        sortOrder: k.sortOrder,
        aktif: true,
      });
      petaKategori.set(k.code, id);
    }
  }

  const petaBrand = new Map<string, Id<"suBrands">>();
  for (const b of MASTER_BRAND) {
    const ada = await ctx.db
      .query("suBrands")
      .withIndex("by_code", (q) => q.eq("code", b.code))
      .unique();
    const isi = {
      name: b.name,
      kind: b.kind,
      icon: b.icon,
      color: b.color,
      sortOrder: b.sortOrder,
      minDigit: b.minDigit,
      maxDigit: b.maxDigit,
      contohId: b.contohId,
      labelTarget: b.labelTarget,
      aktif: true,
    };
    if (ada) {
      await ctx.db.patch(ada._id, isi);
      petaBrand.set(b.code, ada._id);
    } else {
      const id = await ctx.db.insert("suBrands", { code: b.code, ...isi });
      petaBrand.set(b.code, id);
    }
  }

  let baru = 0;
  let diperbarui = 0;
  const sekarang = Date.now();

  for (const p of MASTER_PRODUK) {
    const kategoriId = petaKategori.get(p.categoryCode);
    const brandId = petaBrand.get(p.brandCode);
    if (!kategoriId || !brandId) continue;

    const ada = await ctx.db
      .query("suProducts")
      .withIndex("by_internal_code", (q) => q.eq("productCodeInternal", p.code))
      .unique();

    if (ada) {
      await ctx.db.patch(ada._id, {
        name: p.name,
        description: p.description,
        hppPrice: p.hppPrice,
        productCodeSupplier: p.supplierProductName ?? p.code,
        supplierProductName: p.supplierProductName ?? p.code,
        supplierId: supplierId ?? ada.supplierId,
        diperbaruiPada: sekarang,
      });
      diperbarui += 1;
    } else {
      await ctx.db.insert("suProducts", {
        productCodeInternal: p.code,
        productCodeSupplier: p.supplierProductName ?? p.code,
        name: p.name,
        description: p.description,
        icon: p.icon,
        badgeLabel: p.badgeLabel,
        sortOrder: p.sortOrder,
        categoryId: kategoriId,
        brandId,
        hppPrice: p.hppPrice,
        sellPrice: p.sellPrice,
        discountPrice: p.discountPrice,
        isDiscountActive: Boolean(p.discountPrice),
        deliveryType: p.deliveryType,
        status: "AKTIF",
        supplierId: supplierId ?? undefined,
        supplierProductName: p.supplierProductName ?? p.code,
        diperbaruiPada: sekarang,
      });
      baru += 1;
    }
  }

  if (supplierId) {
    await ctx.db.patch(supplierId, { lastSyncAt: sekarang, lastSyncCount: baru + diperbarui });
  }

  return { mode: modeNyata ? "SUPPLIER" : "SIMULASI", baru, diperbarui };
}

/** One-Click Catalog Sync dari panel admin. */
export const syncCatalog = mutation({
  args: { supplierId: v.optional(v.id("suSuppliers")) },
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const supplierId = await pilihSupplierId(ctx, args.supplierId);
    const hasil = await terapkanKatalog(ctx, supplierId);
    const supplier = supplierId ? await ctx.db.get(supplierId) : null;

    await ctx.db.insert("auditLog", {
      aktorUserId: userId,
      aktorLabel: "operasional-stopup",
      aksi: "supplier.sync",
      target: supplier?.code ?? "lokal",
      detail: `Sync katalog (${hasil.mode}): ${hasil.baru} baru, ${hasil.diperbarui} diperbarui`,
      waktu: Date.now(),
    });

    return {
      mode: hasil.mode,
      supplier: supplier?.name ?? null,
      baru: hasil.baru,
      diperbarui: hasil.diperbarui,
      total: hasil.baru + hasil.diperbarui,
    };
  },
});

/**
 * Provisioning otomatis sekali jalan untuk deployment baru.
 *
 * Hanya bekerja bila tabel produk MASIH KOSONG, sehingga tidak pernah menimpa
 * katalog/harga yang sudah diatur operator. Dipanggil layar terminal saat
 * mendeteksi database belum siap.
 */
export const bootstrap = mutation({
  args: {},
  handler: async (ctx) => {
    const terminalAda = await ctx.db.query("suTerminals").take(1);
    let terminalDibuat = false;
    if (terminalAda.length === 0) {
      await ctx.db.insert("suTerminals", {
        code: "SU-01",
        name: "Terminal Percontohan",
        location: "Lobi Mitra STOP-UP!",
        pinAdmin: "1234",
        isOnline: false,
        lastHeartbeat: 0,
        aktif: true,
        version: "1.0.0",
      });
      terminalDibuat = true;
    }

    // Aturan target brand (jumlah digit ID pelanggan) selalu disamakan dengan
    // master katalog — murah (11 baris) dan mencegah validasi layar berbeda
    // dari validasi server.
    const brandTersegarkan = await segarkanAturanBrand(ctx);

    const produkAda = await ctx.db.query("suProducts").take(1);
    if (produkAda.length > 0) {
      return {
        ok: true,
        terminalDibuat,
        produkDibuat: 0,
        brandTersegarkan,
        sudahAda: true,
      };
    }

    let supplier = await ctx.db
      .query("suSuppliers")
      .withIndex("by_code", (q) => q.eq("code", "digiflazz"))
      .unique();
    if (!supplier) {
      const id = await ctx.db.insert("suSuppliers", {
        code: "digiflazz",
        name: "Digiflazz H2H",
        baseUrl: "https://api.digiflazz.com/v1",
        mode: "sandbox",
        balance: 0,
        isActive: true,
        priority: 1,
        diperbaruiPada: Date.now(),
      });
      supplier = await ctx.db.get(id);
    }

    const hasil = await terapkanKatalog(ctx, supplier?._id ?? null);
    await ctx.db.insert("auditLog", {
      aktorLabel: "bootstrap",
      aksi: "katalog.bootstrap",
      target: supplier?.code ?? "lokal",
      detail: `Katalog awal dibuat otomatis (${hasil.mode}): ${hasil.baru} produk`,
      waktu: Date.now(),
    });

    return {
      ok: true,
      terminalDibuat,
      produkDibuat: hasil.baru,
      brandTersegarkan,
      mode: hasil.mode,
      sudahAda: false,
    };
  },
});

/** Selaraskan aturan digit/label target brand dengan master katalog. */
async function segarkanAturanBrand(ctx: MutationCtx): Promise<number> {
  let jumlah = 0;
  for (const b of MASTER_BRAND) {
    const ada = await ctx.db
      .query("suBrands")
      .withIndex("by_code", (q) => q.eq("code", b.code))
      .unique();
    if (!ada) continue;
    if (
      ada.minDigit === b.minDigit &&
      ada.maxDigit === b.maxDigit &&
      ada.labelTarget === b.labelTarget &&
      ada.contohId === b.contohId
    ) {
      continue;
    }
    await ctx.db.patch(ada._id, {
      minDigit: b.minDigit,
      maxDigit: b.maxDigit,
      labelTarget: b.labelTarget,
      contohId: b.contohId,
    });
    jumlah += 1;
  }
  return jumlah;
}

/** Supplier terprioritas: pilihan eksplisit → aktif berprioritas terkecil. */
async function pilihSupplierId(
  ctx: MutationCtx,
  pilihan?: Id<"suSuppliers">,
): Promise<Id<"suSuppliers"> | null> {
  if (pilihan) return pilihan;
  const rows = await ctx.db.query("suSuppliers").collect();
  if (rows.length === 0) return null;
  const aktif = rows.filter((s) => s.isActive).sort((a, b) => a.priority - b.priority);
  return (aktif[0] ?? rows[0])._id;
}
