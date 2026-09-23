/**
 * STOP-UP! — Pengaturan global, ringkasan admin, dan manajemen pengguna.
 */
import { v } from "convex/values";
import { internalQuery, mutation, query } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { requireAdmin, requireSuperAdmin } from "./guard";
import { ROLES, roleValidator } from "../schema";
import {
  awalHariWib,
  awalHariWibMundur,
  labelTanggalWib,
  labelJamWib,
} from "../../lib/stopup/waktu";

/** Nilai bawaan — dipakai bila baris suSettings belum ada. */
export const PENGATURAN_DEFAULT = {
  idleResetDetik: 45,
  idleWarningDetik: 15,
  supplierTimeoutDetik: 25,
  qrisProvider: "QRIS (Merchant Presented Mode)",
  qrisMerchantName: "STOP-UP! DIGITAL",
  telegramAlertAktif: false,
  lowBalanceThreshold: 500_000,
  printerAktif: true,
  namaMerchantStruk: "STOP-UP! DIGITAL",
  alamatStruk: "Jl. Merdeka No. 1, Kota Bandung",
  footerStruk: "Terima kasih! Simpan struk ini sebagai bukti.",
  autoReloadJamWib: 3,
  simulasiPending: false,
};

type PatchPengaturan = Partial<Omit<Doc<"suSettings">, "_id" | "_creationTime">>;

/** Buang field `undefined` supaya patch tidak menghapus data yang tak disentuh. */
function tanpaUndefined<T extends object>(obj: T): T {
  const out = {} as Record<string, unknown>;
  for (const [k, val] of Object.entries(obj)) {
    if (val !== undefined) out[k] = val;
  }
  return out as T;
}

async function barisPengaturan(ctx: QueryCtx | MutationCtx) {
  return await ctx.db
    .query("suSettings")
    .withIndex("by_slot", (q) => q.eq("slot", "global"))
    .unique();
}

/** Pengaturan untuk panel admin. Kunci rahasia TIDAK dikirim ke klien. */
export const getSettings = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const row = await barisPengaturan(ctx);
    return {
      ...PENGATURAN_DEFAULT,
      idleResetDetik: row?.idleResetDetik ?? PENGATURAN_DEFAULT.idleResetDetik,
      idleWarningDetik: row?.idleWarningDetik ?? PENGATURAN_DEFAULT.idleWarningDetik,
      supplierTimeoutDetik: row?.supplierTimeoutDetik ?? PENGATURAN_DEFAULT.supplierTimeoutDetik,
      qrisProvider: row?.qrisProvider ?? PENGATURAN_DEFAULT.qrisProvider,
      qrisMerchantId: row?.qrisMerchantId ?? "",
      qrisMerchantName: row?.qrisMerchantName ?? PENGATURAN_DEFAULT.qrisMerchantName,
      telegramChatId: row?.telegramChatId ?? "",
      telegramAlertAktif: row?.telegramAlertAktif ?? PENGATURAN_DEFAULT.telegramAlertAktif,
      lowBalanceThreshold: row?.lowBalanceThreshold ?? PENGATURAN_DEFAULT.lowBalanceThreshold,
      printerAktif: row?.printerAktif ?? PENGATURAN_DEFAULT.printerAktif,
      namaMerchantStruk: row?.namaMerchantStruk ?? PENGATURAN_DEFAULT.namaMerchantStruk,
      alamatStruk: row?.alamatStruk ?? PENGATURAN_DEFAULT.alamatStruk,
      footerStruk: row?.footerStruk ?? PENGATURAN_DEFAULT.footerStruk,
      autoReloadJamWib: row?.autoReloadJamWib ?? PENGATURAN_DEFAULT.autoReloadJamWib,
      simulasiPending: row?.simulasiPending ?? PENGATURAN_DEFAULT.simulasiPending,
      // Status rahasia: hanya penanda, nilainya tidak pernah dikirim.
      adaQrisApiKey: Boolean(row?.qrisApiKey),
      adaWebhookSecret: Boolean(row?.qrisWebhookSecret),
      adaTelegramToken: Boolean(row?.telegramBotToken),
      diperbaruiPada: row?.diperbaruiPada ?? null,
    };
  },
});

/** Simpan pengaturan. Field rahasia kosong = jangan diubah. */
export const updateSettings = mutation({
  args: {
    idleResetDetik: v.optional(v.number()),
    idleWarningDetik: v.optional(v.number()),
    supplierTimeoutDetik: v.optional(v.number()),
    qrisProvider: v.optional(v.string()),
    qrisMerchantId: v.optional(v.string()),
    qrisMerchantName: v.optional(v.string()),
    qrisApiKey: v.optional(v.string()),
    qrisWebhookSecret: v.optional(v.string()),
    telegramBotToken: v.optional(v.string()),
    telegramChatId: v.optional(v.string()),
    telegramAlertAktif: v.optional(v.boolean()),
    lowBalanceThreshold: v.optional(v.number()),
    printerAktif: v.optional(v.boolean()),
    namaMerchantStruk: v.optional(v.string()),
    alamatStruk: v.optional(v.string()),
    footerStruk: v.optional(v.string()),
    autoReloadJamWib: v.optional(v.number()),
    simulasiPending: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireSuperAdmin(ctx);
    const ada = await barisPengaturan(ctx);

    // Kunci rahasia hanya ditulis bila diisi (string kosong = jangan ubah).
    const rahasiaKosong = (val: string | undefined) => val === "";
    const patch = tanpaUndefined<PatchPengaturan>({
      diperbaruiPada: Date.now(),
      idleResetDetik: args.idleResetDetik,
      idleWarningDetik: args.idleWarningDetik,
      supplierTimeoutDetik: args.supplierTimeoutDetik,
      qrisProvider: args.qrisProvider,
      qrisMerchantId: args.qrisMerchantId,
      qrisMerchantName: args.qrisMerchantName,
      qrisApiKey: rahasiaKosong(args.qrisApiKey) ? undefined : args.qrisApiKey,
      qrisWebhookSecret: rahasiaKosong(args.qrisWebhookSecret) ? undefined : args.qrisWebhookSecret,
      telegramBotToken: rahasiaKosong(args.telegramBotToken) ? undefined : args.telegramBotToken,
      telegramChatId: args.telegramChatId,
      telegramAlertAktif: args.telegramAlertAktif,
      lowBalanceThreshold: args.lowBalanceThreshold,
      printerAktif: args.printerAktif,
      namaMerchantStruk: args.namaMerchantStruk,
      alamatStruk: args.alamatStruk,
      footerStruk: args.footerStruk,
      autoReloadJamWib: args.autoReloadJamWib,
      simulasiPending: args.simulasiPending,
    });

    if (ada) await ctx.db.patch(ada._id, patch);
    else {
      await ctx.db.insert("suSettings", {
        slot: "global",
        ...PENGATURAN_DEFAULT,
        ...patch,
        diperbaruiPada: patch.diperbaruiPada ?? Date.now(),
      });
    }

    await ctx.db.insert("auditLog", {
      aktorUserId: userId,
      aktorLabel: "operasional-stopup",
      aksi: "pengaturan.update",
      target: "global",
      detail: `Perubahan: ${Object.keys(args).filter((k) => args[k as keyof typeof args] !== undefined).join(", ")}`,
      waktu: Date.now(),
    });
    return { ok: true };
  },
});

/**
 * Pengaturan yang boleh dibaca layar terminal TANPA login.
 * Tidak ada kunci rahasia di sini — hanya perilaku layar & identitas struk.
 */
export const pengaturanPublik = query({
  args: {},
  handler: async (ctx) => {
    const row = await barisPengaturan(ctx);
    return {
      idleResetDetik: row?.idleResetDetik ?? PENGATURAN_DEFAULT.idleResetDetik,
      idleWarningDetik: row?.idleWarningDetik ?? PENGATURAN_DEFAULT.idleWarningDetik,
      supplierTimeoutDetik:
        row?.supplierTimeoutDetik ?? PENGATURAN_DEFAULT.supplierTimeoutDetik,
      namaMerchantStruk: row?.namaMerchantStruk ?? PENGATURAN_DEFAULT.namaMerchantStruk,
      alamatStruk: row?.alamatStruk ?? PENGATURAN_DEFAULT.alamatStruk,
      footerStruk: row?.footerStruk ?? PENGATURAN_DEFAULT.footerStruk,
      printerAktif: row?.printerAktif ?? PENGATURAN_DEFAULT.printerAktif,
      autoReloadJamWib: row?.autoReloadJamWib ?? PENGATURAN_DEFAULT.autoReloadJamWib,
      simulasiPending: row?.simulasiPending ?? PENGATURAN_DEFAULT.simulasiPending,
      qrisMerchantName: row?.qrisMerchantName ?? PENGATURAN_DEFAULT.qrisMerchantName,
    };
  },
});

/** Rahasia webhook untuk verifikasi HMAC di HTTP route (server-side saja). */
export const rahasiaWebhook = internalQuery({
  args: {},
  handler: async (ctx) => {
    const row = await barisPengaturan(ctx);
    if (!row?.qrisWebhookSecret) return null;
    return { secret: row.qrisWebhookSecret };
  },
});

/** Data untuk Telegram Alert: saldo supplier rendah & printer bermasalah. */
export const dataAlert = internalQuery({
  args: {},
  handler: async (ctx) => {
    const [supplier, terminals, logs, row] = await Promise.all([
      ctx.db.query("suSuppliers").collect(),
      ctx.db.query("suTerminals").collect(),
      ctx.db.query("suTerminalLogs").order("desc").take(100),
      barisPengaturan(ctx),
    ]);
    const ambang = row?.lowBalanceThreshold ?? PENGATURAN_DEFAULT.lowBalanceThreshold;
    const logPer = new Map<string, (typeof logs)[number]>();
    for (const log of logs) {
      const key = String(log.terminalId);
      if (!logPer.has(key)) logPer.set(key, log);
    }
    return {
      telegramAktif: row?.telegramAlertAktif ?? false,
      token: row?.telegramBotToken ?? "",
      chatId: row?.telegramChatId ?? "",
      ambang,
      supplierRendah: supplier
        .filter((s) => s.isActive && s.balance < ambang)
        .map((s) => `${s.name}: Rp${s.balance.toLocaleString("id-ID")}`),
      printerBermasalah: terminals
        .map((t) => ({ code: t.code, log: logPer.get(String(t._id)) }))
        .filter((t) => t.log && (t.log.paperStatus !== "OK" || !t.log.printerConnected))
        .map((t) => `${t.code}: kertas ${t.log?.paperStatus}, printer ${t.log?.printerConnected ? "terhubung" : "terputus"}`),
    };
  },
});

/* ========================== RINGKASAN ADMIN ========================== */

/** KPI dashboard: hari ini, seri 7 hari, supplier, terminal, produk terlaris. */
export const adminOverview = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const mulai = awalHariWibMundur(6);

    const [transaksi, supplier, terminals, logs, produk, brand, pengaturan] =
      await Promise.all([
        ctx.db
          .query("suTransactions")
          .withIndex("by_created", (q) => q.gte("createdAt", mulai))
          .collect(),
        ctx.db.query("suSuppliers").collect(),
        ctx.db.query("suTerminals").collect(),
        ctx.db.query("suTerminalLogs").order("desc").take(100),
        ctx.db.query("suProducts").collect(),
        ctx.db.query("suBrands").collect(),
        barisPengaturan(ctx),
      ]);

    const petaProduk = new Map(produk.map((p) => [String(p._id), p]));
    const petaBrand = new Map(brand.map((b) => [String(b._id), b]));
    const hariIniMulai = awalHariWib();
    const hariIni = transaksi.filter((t) => t.createdAt >= hariIniMulai);
    const suksesHariIni = hariIni.filter((t) => t.status === "SUCCESS");

    const rekap = (rows: typeof transaksi) => ({
      transaksi: rows.length,
      sukses: rows.filter((t) => t.status === "SUCCESS").length,
      gagal: rows.filter((t) => t.status === "FAILED").length,
      pending: rows.filter((t) => t.status === "PENDING" || t.status === "PROCESSING").length,
      omzet: rows.filter((t) => t.status === "SUCCESS").reduce((n, t) => n + t.sellPrice, 0),
      laba: rows.filter((t) => t.status === "SUCCESS").reduce((n, t) => n + t.profit, 0),
    });

    const seri7Hari: Array<{ label: string; omzet: number; laba: number; transaksi: number }> = [];
    for (let i = 6; i >= 0; i -= 1) {
      const mulaiHari = awalHariWibMundur(i);
      const akhirHari = mulaiHari + 24 * 60 * 60 * 1000;
      const rows = transaksi.filter((t) => t.createdAt >= mulaiHari && t.createdAt < akhirHari);
      const r = rekap(rows);
      seri7Hari.push({ label: labelTanggalWib(mulaiHari), omzet: r.omzet, laba: r.laba, transaksi: r.transaksi });
    }

    // Omzet per kategori (7 hari).
    const perKategoriMap = new Map<string, { nama: string; omzet: number; jumlah: number }>();
    for (const t of transaksi) {
      if (t.status !== "SUCCESS") continue;
      const p = petaProduk.get(String(t.productId));
      const nama = p ? (petaBrand.get(String(p.brandId))?.name ?? "Lainnya") : "Lainnya";
      const kini = perKategoriMap.get(nama) ?? { nama, omzet: 0, jumlah: 0 };
      kini.omzet += t.sellPrice;
      kini.jumlah += 1;
      perKategoriMap.set(nama, kini);
    }

    // Produk terlaris (7 hari).
    const terlarisMap = new Map<string, { nama: string; jumlah: number; omzet: number }>();
    for (const t of transaksi) {
      if (t.status !== "SUCCESS") continue;
      const p = petaProduk.get(String(t.productId));
      const nama = p?.name ?? "Produk dihapus";
      const kini = terlarisMap.get(nama) ?? { nama, jumlah: 0, omzet: 0 };
      kini.jumlah += 1;
      kini.omzet += t.sellPrice;
      terlarisMap.set(nama, kini);
    }

    const logPerTerminal = new Map<string, (typeof logs)[number]>();
    for (const log of logs) {
      const key = String(log.terminalId);
      if (!logPerTerminal.has(key)) logPerTerminal.set(key, log);
    }

    const ambang = pengaturan?.lowBalanceThreshold ?? PENGATURAN_DEFAULT.lowBalanceThreshold;
    const supplierRendah = supplier
      .filter((s) => s.balance < ambang)
      .map((s) => ({ id: s._id, name: s.name, balance: s.balance, isActive: s.isActive }));

    const kertasBermasalah = terminals
      .map((t) => ({
        code: t.code,
        name: t.name,
        paperStatus: logPerTerminal.get(String(t._id))?.paperStatus ?? "OK",
        printerConnected: logPerTerminal.get(String(t._id))?.printerConnected ?? false,
      }))
      .filter((t) => t.paperStatus !== "OK" || !t.printerConnected);

    return {
      hariIni: rekap(hariIni),
      ringkasSukses: suksesHariIni.length,
      seri7Hari,
      perBrand: Array.from(perKategoriMap.values()).sort((a, b) => b.omzet - a.omzet).slice(0, 6),
      produkTerlaris: Array.from(terlarisMap.values()).sort((a, b) => b.jumlah - a.jumlah).slice(0, 6),
      supplier: supplier
        .sort((a, b) => a.priority - b.priority)
        .map((s) => ({
          id: s._id,
          name: s.name,
          code: s.code,
          balance: s.balance,
          isActive: s.isActive,
          mode: s.mode,
          lastSyncAt: s.lastSyncAt ?? null,
          lastSyncCount: s.lastSyncCount ?? null,
          rendah: s.balance < ambang,
        })),
      supplierRendah,
      ambangSaldo: ambang,
      terminal: {
        total: terminals.length,
        online: terminals.filter((t) => t.isOnline && Date.now() - t.lastHeartbeat < 5 * 60 * 1000).length,
        bermasalah: kertasBermasalah,
      },
      terbaru: transaksi
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 8)
        .map((t) => {
          const p = petaProduk.get(String(t.productId));
          return {
            invoiceId: t.invoiceId,
            produk: p?.name ?? "-",
            icon: p?.icon ?? "🛒",
            targetNo: t.targetNo,
            sellPrice: t.sellPrice,
            profit: t.profit,
            status: t.status,
            jam: labelJamWib(t.createdAt),
          };
        }),
      totalProduk: produk.length,
      totalProdukAktif: produk.filter((p) => p.status === "AKTIF").length,
    };
  },
});

/* ========================= MANAJEMEN PENGGUNA ========================= */

/** Daftar pengguna/staf untuk panel admin. */
export const listPengguna = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").collect();
    return users
      .map((u) => ({
        id: u._id,
        name: u.name ?? "(tanpa nama)",
        email: u.email ?? "-",
        whatsapp: u.whatsapp ?? "-",
        role: u.role ?? ROLES.MEMBER,
        image: u.image ?? null,
      }))
      .sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name));
  },
});

/** Ubah peran pengguna (hanya admin utama). */
export const setPeranPengguna = mutation({
  args: { userId: v.id("users"), role: roleValidator },
  handler: async (ctx, args) => {
    const { userId: adminId } = await requireSuperAdmin(ctx);
    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("Pengguna tidak ditemukan.");
    if (args.userId === adminId) throw new Error("Tidak bisa mengubah peran akun sendiri.");
    await ctx.db.patch(args.userId, { role: args.role });
    await ctx.db.insert("auditLog", {
      aktorUserId: adminId,
      aktorLabel: "operasional-stopup",
      aksi: "pengguna.peran",
      target: target.email ?? String(args.userId),
      detail: `Peran → ${args.role}`,
      waktu: Date.now(),
    });
    return { ok: true };
  },
});

/** Audit trail terbaru (semua aksi berdampak). */
export const auditTrail = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const rows = await ctx.db
      .query("auditLog")
      .withIndex("by_waktu")
      .order("desc")
      .take(Math.min(args.limit ?? 50, 200));
    return rows.map((r) => ({
      id: r._id,
      aktor: r.aktorLabel,
      aksi: r.aksi,
      target: r.target ?? "-",
      detail: r.detail ?? "",
      waktu: r.waktu,
    }));
  },
});
