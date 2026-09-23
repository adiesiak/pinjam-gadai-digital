/**
 * STOP-UP! — Modul Terminal
 *
 * Terminal adalah mesin touchscreen di lokasi mitra. Ia mengirim heartbeat
 * (is_online + last_heartbeat) dan log perangkat (status kertas printer) ke
 * server; panel admin menampilkannya di Terminal Monitor.
 */
import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireAdmin } from "./guard";
import { awalHariWib } from "../../lib/stopup/waktu";

/** Informasi ringkas terminal untuk layar kiosk (dipanggil tanpa login). */
export const getTerminal = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const t = await ctx.db
      .query("suTerminals")
      .withIndex("by_code", (q) => q.eq("code", code))
      .unique();
    if (!t) return null;
    return {
      id: t._id,
      code: t.code,
      name: t.name,
      location: t.location,
      aktif: t.aktif,
      isOnline: t.isOnline,
      lastHeartbeat: t.lastHeartbeat,
    };
  },
});

/** Terminal pertama yang terdaftar — dipakai kiosk sebelum admin mendaftarkan. */
export const terminalDefault = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("suTerminals").collect();
    const t = rows.sort((a, b) => a.code.localeCompare(b.code))[0];
    if (!t) return null;
    return { id: t._id, code: t.code, name: t.name, location: t.location };
  },
});

/** Detak terminal + log perangkat (hanya menulis log bila status berubah). */
export const heartbeat = mutation({
  args: {
    code: v.string(),
    version: v.optional(v.string()),
    paperStatus: v.optional(
      v.union(v.literal("OK"), v.literal("LOW"), v.literal("EMPTY")),
    ),
    printerConnected: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const t = await ctx.db
      .query("suTerminals")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .unique();
    if (!t) throw new Error("Terminal tidak dikenal.");

    await ctx.db.patch(t._id, {
      isOnline: true,
      lastHeartbeat: Date.now(),
      version: args.version ?? t.version,
    });

    const paperStatus = args.paperStatus ?? "OK";
    const printerConnected = args.printerConnected ?? false;
    const logTerakhir = await ctx.db
      .query("suTerminalLogs")
      .withIndex("by_terminal", (q) => q.eq("terminalId", t._id))
      .order("desc")
      .first();

    if (
      !logTerakhir ||
      logTerakhir.paperStatus !== paperStatus ||
      logTerakhir.printerConnected !== printerConnected
    ) {
      await ctx.db.insert("suTerminalLogs", {
        terminalId: t._id,
        paperStatus,
        printerConnected,
        loggedAt: Date.now(),
      });
    }
    return { ok: true };
  },
});

/** Catat status printer tanpa menunggu heartbeat (dipanggil saat cetak gagal). */
export const logPrinter = mutation({
  args: {
    code: v.string(),
    paperStatus: v.union(v.literal("OK"), v.literal("LOW"), v.literal("EMPTY")),
    printerConnected: v.boolean(),
    catatan: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const t = await ctx.db
      .query("suTerminals")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .unique();
    if (!t) return { ok: false };
    await ctx.db.insert("suTerminalLogs", {
      terminalId: t._id,
      paperStatus: args.paperStatus,
      printerConnected: args.printerConnected,
      catatan: args.catatan,
      loggedAt: Date.now(),
    });
    return { ok: true };
  },
});

/* ============================== ADMIN ============================== */

/** Daftar terminal + status perangkat + performa hari ini. */
export const listTerminals = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const [terminals, logs, transaksi] = await Promise.all([
      ctx.db.query("suTerminals").collect(),
      ctx.db.query("suTerminalLogs").order("desc").take(200),
      ctx.db
        .query("suTransactions")
        .withIndex("by_created", (q) => q.gte("createdAt", awalHariWib()))
        .collect(),
    ]);

    const logPer = new Map<string, (typeof logs)[number]>();
    for (const log of logs) {
      const key = String(log.terminalId);
      if (!logPer.has(key)) logPer.set(key, log);
    }

    return terminals
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((t) => {
        const log = logPer.get(String(t._id));
        const milik = transaksi.filter((tr) => tr.terminalId === t._id);
        const sukses = milik.filter((tr) => tr.status === "SUCCESS");
        return {
          id: t._id,
          code: t.code,
          name: t.name,
          location: t.location,
          aktif: t.aktif,
          isOnline: t.isOnline,
          lastHeartbeat: t.lastHeartbeat,
          version: t.version ?? "-",
          paperStatus: log?.paperStatus ?? "OK",
          printerConnected: log?.printerConnected ?? false,
          transaksiHariIni: milik.length,
          omzetHariIni: sukses.reduce((n, tr) => n + tr.sellPrice, 0),
          suksesHariIni: sukses.length,
        };
      });
  },
});

/** Registrasi / ubah terminal. */
export const saveTerminal = mutation({
  args: {
    terminalId: v.optional(v.id("suTerminals")),
    code: v.string(),
    name: v.string(),
    location: v.string(),
    pinAdmin: v.string(),
    aktif: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);
    const code = args.code.trim().toUpperCase();
    if (code.length < 3) throw new Error("Kode terminal minimal 3 karakter.");
    if (args.pinAdmin.length < 4) throw new Error("PIN admin minimal 4 digit.");

    if (args.terminalId) {
      await ctx.db.patch(args.terminalId, {
        code,
        name: args.name.trim(),
        location: args.location.trim(),
        pinAdmin: args.pinAdmin,
        aktif: args.aktif,
      });
    } else {
      const ada = await ctx.db
        .query("suTerminals")
        .withIndex("by_code", (q) => q.eq("code", code))
        .unique();
      if (ada) throw new Error("Kode terminal sudah dipakai.");
      await ctx.db.insert("suTerminals", {
        code,
        name: args.name.trim(),
        location: args.location.trim(),
        pinAdmin: args.pinAdmin,
        isOnline: false,
        lastHeartbeat: 0,
        aktif: args.aktif,
      });
    }

    await ctx.db.insert("auditLog", {
      aktorUserId: userId,
      aktorLabel: "operasional-stopup",
      aksi: "terminal.save",
      target: code,
      detail: `Terminal ${args.name} di ${args.location}`,
      waktu: Date.now(),
    });
    return { ok: true };
  },
});
