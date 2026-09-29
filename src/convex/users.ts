import { getAuthUserId } from "@convex-dev/auth/server";
import { internalQuery, query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { ROLES } from "./schema";

/**
 * Otorisasi internal untuk aktivasi/login/reset password Super Admin.
 * Email harus cocok persis dan menunjuk satu akun admin dengan email terverifikasi.
 */
export const isAdminEmailForPasswordAuth = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const users = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .take(2);
    return (
      users.length === 1 &&
      users[0].role === ROLES.ADMIN &&
      users[0].emailVerificationTime !== undefined &&
      users[0].isAnonymous !== true
    );
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
