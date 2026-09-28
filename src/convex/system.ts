import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { ROLES } from "./schema";
import {
  DEFAULT_CONFIG,
  RETENSI_LOKASI_BATAS,
  type SystemConfig,
} from "../lib/system-config";

/**
 * Konfigurasi sistem, kill switch, snapshot data, dan audit trail.
 * Semua aksi tulis dicatat ke auditLog (append-only).
 */

export const SYSTEM_SLOT = "global";

export { DEFAULT_CONFIG };
export type { SystemConfig };

async function requireAdmin(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
  const user = await ctx.db.get(userId);
  if (user === null || user.role !== ROLES.ADMIN) {
    throw new Error("Akses khusus tim Pinjam Gadai Digital (admin).");
  }
  return { userId, user };
}

/** Tulis satu baris audit trail (append-only). */
export async function audit(
  ctx: MutationCtx,
  aktorUserId: unknown,
  aktorLabel: string,
  aksi: string,
  target?: string,
  detail?: string,
): Promise<void> {
  await ctx.db.insert("auditLog", {
    aktorUserId: typeof aktorUserId === "string" ? (aktorUserId as never) : undefined,
    aktorLabel,
    aksi,
    target,
    detail,
    waktu: Date.now(),
  });
}

/** Baca konfigurasi (fallback default bila belum pernah disimpan). */
export async function getConfig(ctx: QueryCtx): Promise<SystemConfig> {
  const row = await ctx.db
    .query("systemConfig")
    .withIndex("by_slot", (q) => q.eq("slot", SYSTEM_SLOT))
    .first();
  if (row === null) return { ...DEFAULT_CONFIG };
  return {
    killSwitch: row.killSwitch ?? DEFAULT_CONFIG.killSwitch,
    maintenanceMode: row.maintenanceMode ?? DEFAULT_CONFIG.maintenanceMode,
    persenAdmin: row.persenAdmin ?? DEFAULT_CONFIG.persenAdmin,
    persenPlatform: row.persenPlatform ?? DEFAULT_CONFIG.persenPlatform,
    persenBunga: row.persenBunga ?? DEFAULT_CONFIG.persenBunga,
    maxLtvPersen: row.maxLtvPersen ?? DEFAULT_CONFIG.maxLtvPersen,
    sessionTimeoutMenit: row.sessionTimeoutMenit ?? DEFAULT_CONFIG.sessionTimeoutMenit,
    vaultLat: row.vaultLat ?? DEFAULT_CONFIG.vaultLat,
    vaultLng: row.vaultLng ?? DEFAULT_CONFIG.vaultLng,
    gpsMismatchKm: row.gpsMismatchKm ?? DEFAULT_CONFIG.gpsMismatchKm,
    pencairanMaxKm: row.pencairanMaxKm ?? DEFAULT_CONFIG.pencairanMaxKm,
    lokasiWajib: row.lokasiWajib ?? DEFAULT_CONFIG.lokasiWajib,
    lokasiMaxUmurMenit: row.lokasiMaxUmurMenit ?? DEFAULT_CONFIG.lokasiMaxUmurMenit,
    wajibAplikasiNative: row.wajibAplikasiNative ?? DEFAULT_CONFIG.wajibAplikasiNative,
    retensiLokasiHari: row.retensiLokasiHari ?? DEFAULT_CONFIG.retensiLokasiHari,
  };
}

/** Konfigurasi untuk semua pengguna ter-autentikasi (status kill switch & maintenance). */
export const getStatusPublic = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const cfg = await getConfig(ctx);
    return {
      killSwitch: cfg.killSwitch,
      maintenanceMode: cfg.maintenanceMode,
      // Gerbang lokasi dibaca dashboard Peminjam sebelum meminta GPS.
      lokasiWajib: cfg.lokasiWajib,
      lokasiMaxUmurMenit: cfg.lokasiMaxUmurMenit,
      wajibAplikasiNative: cfg.wajibAplikasiNative,
    };
  },
});

/** Konfigurasi lengkap + label pelaku — admin. */
export const getConfigAdmin = query({
  args: {},
  handler: async (ctx) => {
    const { userId, user } = await requireAdmin(ctx);
    const cfg = await getConfig(ctx);
    return {
      config: cfg,
      auditTerbaru: await ctx.db.query("auditLog").withIndex("by_waktu").order("desc").take(10),
      diperbaruiOleh: user.email ?? user.name ?? "admin",
      _me: userId,
    };
  },
});

/** Simpan konfigurasi — mencatat audit + deteksi perubahan kill switch. */
export const saveConfig = mutation({
  args: {
    killSwitch: v.boolean(),
    maintenanceMode: v.boolean(),
    persenAdmin: v.number(),
    persenPlatform: v.number(),
    persenBunga: v.number(),
    maxLtvPersen: v.number(),
    sessionTimeoutMenit: v.number(),
    vaultLat: v.number(),
    vaultLng: v.number(),
    gpsMismatchKm: v.number(),
    pencairanMaxKm: v.number(),
    lokasiWajib: v.boolean(),
    lokasiMaxUmurMenit: v.number(),
    wajibAplikasiNative: v.boolean(),
    retensiLokasiHari: v.number(),
  },
  handler: async (ctx, args) => {
    const { userId, user } = await requireAdmin(ctx);
    if (args.persenAdmin < 0 || args.persenPlatform < 0 || args.persenBunga < 0) {
      throw new Error("Persentase biaya/bunga tidak boleh negatif.");
    }
    if (!Number.isSafeInteger(args.lokasiMaxUmurMenit) || args.lokasiMaxUmurMenit < 1) {
      throw new Error("Batas umur lokasi harus minimal 1 menit.");
    }
    if (args.maxLtvPersen <= 0 || args.maxLtvPersen > 100) {
      throw new Error("LTV maksimum harus di antara 1–100%.");
    }
    if (
      !Number.isSafeInteger(args.retensiLokasiHari) ||
      args.retensiLokasiHari < RETENSI_LOKASI_BATAS.min ||
      args.retensiLokasiHari > RETENSI_LOKASI_BATAS.maks
    ) {
      throw new Error(
        `Retensi jejak lokasi harus ${RETENSI_LOKASI_BATAS.min}–${RETENSI_LOKASI_BATAS.maks} hari.`,
      );
    }
    const label = user.email ?? user.name ?? "admin";
    const prev = await getConfig(ctx);
    const existing = await ctx.db
      .query("systemConfig")
      .withIndex("by_slot", (q) => q.eq("slot", SYSTEM_SLOT))
      .first();
    const patch = { slot: SYSTEM_SLOT, ...args, diperbaruiPada: Date.now() };
    if (existing === null) {
      await ctx.db.insert("systemConfig", patch);
    } else {
      await ctx.db.patch(existing._id, patch);
    }
    await audit(
      ctx,
      userId,
      label,
      args.killSwitch !== prev.killSwitch ? "kill_switch" : "ubah_config",
      "systemConfig",
      args.killSwitch !== prev.killSwitch
        ? `Kill switch ${args.killSwitch ? "DIAKTIFKAN" : "DINONAKTIFKAN"}`
        : "Konfigurasi sistem diperbarui",
    );
    return { ok: true };
  },
});

/** Toggle cepat kill switch (tombol merah di header). */
export const setKillSwitch = mutation({
  args: { aktif: v.boolean() },
  handler: async (ctx, { aktif }) => {
    const { userId, user } = await requireAdmin(ctx);
    const existing = await ctx.db
      .query("systemConfig")
      .withIndex("by_slot", (q) => q.eq("slot", SYSTEM_SLOT))
      .first();
    const base = existing ?? { slot: SYSTEM_SLOT, diperbaruiPada: 0 };
    if (existing === null) {
      await ctx.db.insert("systemConfig", {
        ...base,
        killSwitch: aktif,
        diperbaruiPada: Date.now(),
      });
    } else {
      await ctx.db.patch(existing._id, { killSwitch: aktif, diperbaruiPada: Date.now() });
    }
    await audit(
      ctx,
      userId,
      user.email ?? user.name ?? "admin",
      "kill_switch",
      "systemConfig",
      `Emergency kill switch ${aktif ? "DIAKTIFKAN" : "DINONAKTIFKAN"}`,
    );
    return { ok: true };
  },
});

/** Snapshot seluruh data transaksi & pengguna — unduh JSON (admin). */
export const snapshotData = query({
  args: {},
  handler: async (ctx) => {
    const { userId, user } = await requireAdmin(ctx);
    const [loans, pawns, deposits, fundings, users] = await Promise.all([
      ctx.db.query("loans").collect(),
      ctx.db.query("pawns").collect(),
      ctx.db.query("deposits").collect(),
      ctx.db.query("fundings").collect(),
      ctx.db.query("users").collect(),
    ]);
    // PII diminimalkan: email/pengenal disamarkan untuk snapshot aman.
    return {
      dibuatPada: new Date().toISOString(),
      jumlah: {
        loans: loans.length,
        pawns: pawns.length,
        deposits: deposits.length,
        fundings: fundings.length,
        users: users.length,
      },
      loans,
      pawns,
      deposits,
      fundings,
      users: users.map((u) => ({
        _id: u._id,
        name: u.name ?? null,
        email: u.email ? u.email.replace(/(.{2}).+(@.+)/, "$1***$2") : null,
        role: u.role ?? null,
      })),
    };
  },
});

/** Catat unduhan backup ke audit trail — dipanggil klien setelah unduh. */
export const catatBackup = mutation({
  args: { jenis: v.string() },
  handler: async (ctx, { jenis }) => {
    const { userId, user } = await requireAdmin(ctx);
    await audit(ctx, userId, user.email ?? user.name ?? "admin", "backup", jenis);
    return { ok: true };
  },
});
