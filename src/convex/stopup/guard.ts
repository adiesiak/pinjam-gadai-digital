/**
 * STOP-UP! — Gerbang akses modul backend.
 * Semua query/mutation admin di folder ini wajib lewat requireAdmin().
 */
import { getAuthUserId } from "@convex-dev/auth/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { ROLES } from "../schema";

/** Admin & supervisor boleh mengelola katalog, harga, dan supplier. */
export async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
  const user = await ctx.db.get(userId);
  if (user === null || (user.role !== ROLES.ADMIN && user.role !== ROLES.SUPERVISOR)) {
    throw new Error("Akses khusus tim operasional STOP-UP!.");
  }
  return { userId, user };
}

/** Hanya admin (bukan supervisor) — untuk perubahan sensitif. */
export async function requireSuperAdmin(ctx: QueryCtx | MutationCtx) {
  const { userId, user } = await requireAdmin(ctx);
  if (user.role !== ROLES.ADMIN) {
    throw new Error("Aksi ini hanya untuk admin utama.");
  }
  return { userId, user };
}
