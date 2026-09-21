import { getAuthUserId } from "@convex-dev/auth/server";
import {
  internalMutation,
  mutation,
  query,
  MutationCtx,
  QueryCtx,
} from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { ROLES, loanStatusValidator, LoanStatusValue } from "./schema";
import { quoteLoan } from "../lib/loan";
import { formatRupiah, type Rupiah } from "../lib/money";

/** PINDAI v1 business range for pokok pinjaman (rupiah bulat). */
export const MIN_POKOK = 100_000;
export const MAX_POKOK = 500_000_000;

function validatePokok(pokok: Rupiah): void {
  if (!Number.isSafeInteger(pokok) || pokok <= 0) {
    throw new Error("Pokok pinjaman harus rupiah bulat positif (tanpa desimal).");
  }
  if (pokok < MIN_POKOK || pokok > MAX_POKOK) {
    throw new Error(
      `Pokok pinjaman harus antara ${formatRupiah(MIN_POKOK)} dan ${formatRupiah(MAX_POKOK)}.`,
    );
  }
}

/**
 * Role gate for v1: Peminjam. A user without an explicit role is promoted to
 * Peminjam on first loan activity; Pendana is reserved for a later phase.
 */
async function requirePeminjam(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
  const user = await ctx.db.get(userId);
  if (user === null) throw new Error("Pengguna tidak ditemukan.");
  return { userId, user };
}

function referenceNumber(now: number): string {
  const date = new Date(now).toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = Array.from({ length: 4 }, () =>
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".charAt(Math.floor(Math.random() * 32)),
  ).join("");
  return `PND-${date}-${suffix}`;
}

/** Ajukan pinjaman (Peminjam). Pricing dihitung server-side dari pokok bulat. */
export const createLoanApplication = mutation({
  args: {
    pokokPinjaman: v.number(),
    tujuan: v.string(),
    namaLengkap: v.string(),
    nomorRekening: v.string(),
    catatanPeminjam: v.optional(v.string()),
  },
  returns: v.object({ loanId: v.id("loans"), nomorReferensi: v.string() }),
  handler: async (ctx, args) => {
    const { userId, user } = await requirePeminjam(ctx);
    if (user.role === ROLES.PENDANA) {
      throw new Error(
        "Akun Pendana tidak dapat mengajukan pinjaman. Gunakan akun Peminjam.",
      );
    }

    validatePokok(args.pokokPinjaman);
    // Server-side pricing engine — fee fields are never accepted from the client.
    const quote = quoteLoan(args.pokokPinjaman);

    const trimmedName = args.namaLengkap.trim();
    const trimmedAccount = args.nomorRekening.trim().replace(/\s+/g, "");
    if (trimmedName.length < 3) {
      throw new Error("Nama lengkap wajib diisi (minimal 3 karakter).");
    }
    if (!/^\d{6,20}$/.test(trimmedAccount)) {
      throw new Error("Nomor rekening harus 6–20 digit angka.");
    }
    if (args.tujuan.trim().length === 0) {
      throw new Error("Pilih keperluan pinjaman.");
    }

    if (user.role === undefined) {
      await ctx.db.patch(userId, { role: ROLES.PEMINJAM });
    }

    const now = Date.now();
    const nomorReferensi = referenceNumber(now);

    const loanId = await ctx.db.insert("loans", {
      userId,
      pokokPinjaman: quote.pokok,
      tujuan: args.tujuan.trim(),
      catatanPeminjam: args.catatanPeminjam?.trim() || undefined,
      namaLengkap: trimmedName,
      nomorRekening: trimmedAccount,
      status: "diajukan",
      nomorReferensi,
    });
    return { loanId, nomorReferensi };
  },
});

/** Daftar aplikasi milik Peminjam yang sedang masuk — hanya miliknya. */
export const listMyLoans = query({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requirePeminjam(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return loans
      .sort((a, b) => b._creationTime - a._creationTime)
      .map((l) => ({
        _id: l._id,
        _creationTime: l._creationTime,
        nomorReferensi: l.nomorReferensi,
        pokokPinjaman: l.pokokPinjaman,
        tujuan: l.tujuan,
        status: l.status,
        catatanReview: l.catatanReview,
      }));
  },
});

/** Detail satu aplikasi milik sendiri, dengan quote turunannya. */
export const getMyLoan = query({
  args: { loanId: v.id("loans") },
  handler: async (ctx, args) => {
    const { userId } = await requirePeminjam(ctx);
    const loan = await ctx.db.get(args.loanId);
    if (loan === null || loan.userId !== userId) return null;
    const quote = quoteLoan(loan.pokokPinjaman);
    return {
      _id: loan._id,
      _creationTime: loan._creationTime,
      nomorReferensi: loan.nomorReferensi,
      pokokPinjaman: loan.pokokPinjaman,
      tujuan: loan.tujuan,
      status: loan.status,
      catatanReview: loan.catatanReview,
      quote,
    };
  },
});

/** Ringkasan Peminjam — jujur: 0 saat belum ada data (Zero Fake Data). */
export const myLoanSummary = query({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requirePeminjam(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const diajukan = loans.filter((l) => l.status === "diajukan").length;
    const direview = loans.filter((l) => l.status === "sedang_direview").length;
    const disetujui = loans.filter((l) => l.status === "disetujui").length;
    const ditolak = loans.filter((l) => l.status === "ditolak").length;
    const disetujuiRupiah = loans
      .filter((l) => l.status === "disetujui")
      .reduce((acc, l) => acc + l.pokokPinjaman, 0);
    return {
      totalAplikasi: loans.length,
      diajukan,
      direview,
      disetujui,
      ditolak,
      disetujuiRupiah,
    };
  },
});

// ---- Reviewer (tim PINDAI) transitions ----

/** Hanya admin PINDAI boleh memindahkan status aplikasi. */
async function requireAdmin(ctx: MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
  const user = await ctx.db.get(userId);
  if (user === null || user.role !== ROLES.ADMIN) {
    throw new Error("Hanya tim PINDAI (admin) yang dapat mengubah status aplikasi.");
  }
  return userId;
}

async function setStatus(
  ctx: MutationCtx,
  loanId: Id<"loans">,
  status: LoanStatusValue,
  catatan?: string,
) {
  await requireAdmin(ctx);
  const loan = await ctx.db.get(loanId);
  if (loan === null) throw new Error("Aplikasi tidak ditemukan.");
  if (status === "diajukan") {
    throw new Error("Status tidak boleh dikembalikan ke diajukan.");
  }
  if (status === "ditolak" && (!catatan || catatan.trim().length === 0)) {
    throw new Error("Penolakan wajib menyertakan alasan.");
  }
  await ctx.db.patch(loanId, {
    status,
    catatanReview: catatan?.trim() || undefined,
  });
}

export const markInReview = mutation({
  args: { loanId: v.id("loans") },
  handler: (ctx, args) => setStatus(ctx, args.loanId, "sedang_direview"),
});

export const approve = mutation({
  args: { loanId: v.id("loans") },
  handler: (ctx, args) => setStatus(ctx, args.loanId, "disetujui"),
});

export const reject = mutation({
  args: { loanId: v.id("loans"), reason: v.string() },
  handler: (ctx, args) => setStatus(ctx, args.loanId, "ditolak", args.reason),
});

/** Internal helper dipakai oleh skrip/seed nanti — tidak diekspor ke HTTP. */
export const _internalSetStatus = internalMutation({
  args: {
    loanId: v.id("loans"),
    status: loanStatusValidator,
    reason: v.optional(v.string()),
  },
  handler: (ctx, args) => setStatus(ctx, args.loanId, args.status, args.reason),
});
