import { getAuthUserId } from "@convex-dev/auth/server";
import { internalQuery, query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { ROLES } from "./schema";

/**
 * Admin terverifikasi = email harus cocok persis dengan satu akun, berperan
 * admin, emailnya sudah diverifikasi, dan bukan akun anonim.
 */
async function cariAdminTerverifikasi(ctx: QueryCtx, email: string) {
  const users = await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", email))
    .take(2);
  const user = users.length === 1 ? users[0] : null;
  return user !== null &&
    user.role === ROLES.ADMIN &&
    user.emailVerificationTime !== undefined &&
    user.isAnonymous !== true
    ? user
    : null;
}

/**
 * Otorisasi internal untuk aktivasi/login/reset password Super Admin.
 * Email harus cocok persis dan menunjuk satu akun admin dengan email terverifikasi.
 */
export const isAdminEmailForPasswordAuth = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) =>
    (await cariAdminTerverifikasi(ctx, email)) !== null,
});

/**
 * Status alur kata sandi untuk satu email: apakah dia Super Admin terverifikasi,
 * dan apakah akun kata sandinya sudah pernah dibuat (aktivasi selesai).
 *
 * Dipakai `adminPassword.authorize` supaya balasan untuk alamat non-admin bisa
 * disamakan dengan balasan untuk alamat admin di setiap flow.
 */
export const statusAkunKataSandi = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const admin = (await cariAdminTerverifikasi(ctx, email)) !== null;
    const akun = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", "password").eq("providerAccountId", email),
      )
      .unique();
    return { admin, punyaKataSandi: akun !== null };
  },
});

/**
 * Role akun saat ini (untuk guard di dalam action yang tidak punya ctx.db).
 * Returns null jika belum masuk.
 */
export const currentRole = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (user === null) return null;
    return { role: user.role };
  },
});

/**
 * Get the current signed in user. Returns null if the user is not signed in.
 * Usage: const signedInUser = await ctx.runQuery(api.authHelpers.currentUser);
 * THIS FUNCTION IS READ-ONLY. DO NOT MODIFY.
 */
export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);

    if (user === null) {
      return null;
    }

    return user;
  },
});

/**
 * Use this function internally to get the current user data. Remember to handle the null user case.
 * @param ctx
 * @returns
 */
export const getCurrentUser = async (ctx: QueryCtx) => {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    return null;
  }
  return await ctx.db.get(userId);
};
