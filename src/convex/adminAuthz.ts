import { getAuthSessionId, getAuthUserId } from "@convex-dev/auth/server";

import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { ROLES } from "./schema";

const MAX_VERIFIED_AUTH_SESSIONS = 20;

export type AdminGateStatus = {
  isAdmin: boolean;
  aktif: boolean;
  butuh: boolean;
  setupBerlangsung: boolean;
  verified: boolean;
};

const NOT_ADMIN: AdminGateStatus = {
  isAdmin: false,
  aktif: false,
  butuh: false,
  setupBerlangsung: false,
  verified: false,
};

export async function getCurrentAuthSessionId(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<Id<"authSessions"> | null> {
  const authSessionId = await getAuthSessionId(ctx);
  if (typeof authSessionId !== "string") return null;

  const session = await ctx.db.get(authSessionId as Id<"authSessions">);
  if (
    session === null ||
    session.userId !== userId ||
    session.expirationTime <= Date.now()
  ) {
    return null;
  }
  return session._id;
}

/**
 * Apakah sesi Auth yang sedang dipakai adalah sesi PRATINJAU ("masuk sebagai").
 *
 * Pratinjau memberi peramban admin sesi nyata akun target, jadi tanpa
 * pemeriksaan ini aktivitas admin terekam sebagai aktivitas nasabah: perangkat
 * admin masuk daftar "Perangkat sesi saya", sesi asli nasabah di perangkat lain
 * ikut digugurkan oleh aturan sesi tunggal, dan titik GPS admin tersimpan
 * sebagai lokasi nasabah. Pemeriksaan dilakukan di server — klien tidak bisa
 * mematikannya. Barisnya dicocokkan lewat `sesiPratinjauId`, sesi yang MEMANG
 * dibuat untuk pratinjau itu, bukan sekadar "sesi yang dibuat setelah pratinjau
 * dimulai".
 */
export async function sesiPratinjauAktif(ctx: QueryCtx): Promise<boolean> {
  const sessionId = await getAuthSessionId(ctx);
  if (typeof sessionId !== "string") return false;
  const userId = await getAuthUserId(ctx);
  if (userId === null) return false;

  const baris = await ctx.db
    .query("pratinjauSesi")
    .withIndex("by_target", (q) => q.eq("targetId", userId))
    .collect();
  const sekarang = Date.now();
  return baris.some(
    (r) =>
      r.sesiPratinjauId === sessionId &&
      r.selesai === undefined &&
      (r.berlakuHingga ?? 0) > sekarang,
  );
}

/** Checks the signed-in user's admin role without granting access to admin data. */
export async function requireAdminRole(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Harus masuk terlebih dahulu.");

  const user = await ctx.db.get(userId);
  if (user === null || user.role !== ROLES.ADMIN) {
    throw new Error("Akses khusus Super Admin.");
  }

  return { userId, user };
}

/** Requires an active TOTP secret and proof bound to Convex Auth's current session. */
export async function requireAdminSession(ctx: QueryCtx) {
  const admin = await requireAdminRole(ctx);
  const authSessionId = await getCurrentAuthSessionId(ctx, admin.userId);
  if (authSessionId === null) {
    throw new Error("Sesi autentikasi tidak valid. Silakan masuk kembali.");
  }

  const mfa = await ctx.db
    .query("mfaSettings")
    .withIndex("by_user", (q) => q.eq("userId", admin.userId))
    .first();
  if (mfa?.totpSecret === undefined) {
    throw new Error("Aktifkan TOTP terlebih dahulu untuk mengakses panel admin.");
  }
  if (!mfa.totpVerifiedAuthSessionIds?.includes(authSessionId)) {
    throw new Error("Verifikasi TOTP diperlukan untuk sesi ini.");
  }

  return { ...admin, authSessionId };
}

/** Minimal pre-gate status; never loads operational/admin records. */
export async function getAdminGateStatus(ctx: QueryCtx): Promise<AdminGateStatus> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) return NOT_ADMIN;

  const user = await ctx.db.get(userId);
  if (user === null || user.role !== ROLES.ADMIN) return NOT_ADMIN;

  const mfa = await ctx.db
    .query("mfaSettings")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  const aktif = mfa?.totpSecret !== undefined;
  const authSessionId = aktif ? await getCurrentAuthSessionId(ctx, userId) : null;
  const verified =
    authSessionId !== null &&
    (mfa?.totpVerifiedAuthSessionIds?.includes(authSessionId) ?? false);

  return {
    isAdmin: true,
    aktif,
    butuh: !aktif || !verified,
    setupBerlangsung: mfa?.totpPendingSecret !== undefined,
    verified,
  };
}

/** Bounded, de-duplicated proof list for active Auth sessions. */
export function addVerifiedAuthSession(
  existing: string[] | undefined,
  authSessionId: string,
): string[] {
  return [...new Set([...(existing ?? []), authSessionId])].slice(
    -MAX_VERIFIED_AUTH_SESSIONS,
  );
}
