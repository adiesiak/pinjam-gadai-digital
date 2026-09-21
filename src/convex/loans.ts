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
import { ROLES, loanStatusValidator, LoanStatusValue, PawnStatusValue } from "./schema";
import { quoteLoan } from "../lib/loan";
import { formatRupiah, type Rupiah } from "../lib/money";
import { COLLATERAL_CATEGORIES } from "../lib/pawn";

/** Business range for pokok pinjaman / nilai taksiran (rupiah bulat). */
export const MIN_POKOK = 100_000;
export const MAX_POKOK = 500_000_000;

function validateRupiahAmount(amount: Rupiah, label: string): void {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error(`${label} harus rupiah bulat positif (tanpa desimal).`);
  }
  if (amount < MIN_POKOK || amount > MAX_POKOK) {
    throw new Error(
      `${label} harus antara ${formatRupiah(MIN_POKOK)} dan ${formatRupiah(MAX_POKOK)}.`,
    );
  }
}

/** Shared auth gate: signed-in users only. */
async function requireUser(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
  const user = await ctx.db.get(userId);
  if (user === null) throw new Error("Pengguna tidak ditemukan.");
  return { userId, user };
}

/**
 * Role gate for v1: Peminjam. A user without an explicit role is promoted to
 * Peminjam on first application activity; Pendana is reserved for a later phase.
 */
async function requirePeminjam(ctx: QueryCtx) {
  const { userId, user } = await requireUser(ctx);
  if (user.role === ROLES.PENDANA) {
    throw new Error(
      "Akun Pendana tidak dapat mengajukan. Gunakan akun Peminjam.",
    );
  }
  return { userId, user };
}

function referenceNumber(now: number): string {
  const date = new Date(now).toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = Array.from({ length: 4 }, () =>
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".charAt(Math.floor(Math.random() * 32)),
  ).join("");
  return `PGD-${date}-${suffix}`;
}

// =====================================================================
// Pinjaman (cash loan applications)
// =====================================================================

/** Ajukan pinjaman (Peminjam). Pricing dihitung server-side dari pokok bulat. */
export const createLoanApplication = mutation({
  args: {
    pokokPinjaman: v.number(),
    tujuan: v.string(),
    namaLengkap: v.string(),
    nomorRekening: v.string(),
    catatanPeminjam: v.optional(v.string()),
  },
  returns: v.object({ appId: v.id("loans"), nomorReferensi: v.string() }),
  handler: async (ctx, args) => {
    const { userId, user } = await requirePeminjam(ctx);
    validateRupiahAmount(args.pokokPinjaman, "Pokok pinjaman");
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
    return { appId: loanId, nomorReferensi };
  },
});

/** Daftar pinjaman milik Peminjam — hanya miliknya. */
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

/** Detail satu pinjaman milik sendiri, dengan quote turunannya. */
export const getMyLoan = query({
  args: { loanId: v.id("loans") },
  handler: async (ctx, args) => {
    const { userId } = await requirePeminjam(ctx);
    const loan = await ctx.db.get(args.loanId);
    if (loan === null || loan.userId !== userId) return null;
    return {
      _id: loan._id,
      _creationTime: loan._creationTime,
      nomorReferensi: loan.nomorReferensi,
      pokokPinjaman: loan.pokokPinjaman,
      tujuan: loan.tujuan,
      status: loan.status,
      catatanReview: loan.catatanReview,
      quote: quoteLoan(loan.pokokPinjaman),
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
    const disetujui = loans.filter((l) => l.status === "disetujui");
    return {
      totalAplikasi: loans.length,
      diajukan: loans.filter((l) => l.status === "diajukan").length,
      direview: loans.filter((l) => l.status === "sedang_direview").length,
      disetujui: disetujui.length,
      ditolak: loans.filter((l) => l.status === "ditolak").length,
      disetujuiRupiah: disetujui.reduce((acc, l) => acc + l.pokokPinjaman, 0),
    };
  },
});

// =====================================================================
// Gadai (collateral applications)
// =====================================================================

/** Ajukan penggadaian barang (Peminjam). Penilaian dilakukan oleh petugas. */
export const createPawnApplication = mutation({
  args: {
    deskripsiBarang: v.string(),
    kategori: v.string(),
    alamatPenilaian: v.string(),
    namaLengkap: v.string(),
    nomorRekening: v.string(),
    catatanPeminjam: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, user } = await requirePeminjam(ctx);

    const deskripsi = args.deskripsiBarang.trim();
    if (deskripsi.length < 10) {
      throw new Error(
        "Deskripsi barang wajib diisi (minimal 10 karakter) agar petugas dapat menilai.",
      );
    }
    if (!(COLLATERAL_CATEGORIES as readonly string[]).includes(args.kategori)) {
      throw new Error("Pilih kategori barang yang valid.");
    }
    const alamat = args.alamatPenilaian.trim();
    if (alamat.length < 10) {
      throw new Error(
        "Alamat lokasi barang wajib diisi (minimal 10 karakter) untuk penjadwalan pemeriksaan.",
      );
    }
    const nama = args.namaLengkap.trim();
    if (nama.length < 3) {
      throw new Error("Nama lengkap wajib diisi (minimal 3 karakter).");
    }
    const rekening = args.nomorRekening.trim().replace(/\s+/g, "");
    if (!/^\d{6,20}$/.test(rekening)) {
      throw new Error("Nomor rekening harus 6–20 digit angka.");
    }

    if (user.role === undefined) {
      await ctx.db.patch(userId, { role: ROLES.PEMINJAM });
    }

    await ctx.db.insert("pawns", {
      userId,
      deskripsiBarang: deskripsi,
      kategori: args.kategori,
      alamatPenilaian: alamat,
      namaLengkap: nama,
      nomorRekening: rekening,
      catatanPeminjam: args.catatanPeminjam?.trim() || undefined,
      status: "diajukan",
      nomorReferensi: referenceNumber(Date.now()),
    });
  },
});

/** Daftar pengajuan gadai milik Peminjam. */
export const listMyPawns = query({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requirePeminjam(ctx);
    const pawns = await ctx.db
      .query("pawns")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return pawns
      .sort((a, b) => b._creationTime - a._creationTime)
      .map((p) => ({
        _id: p._id,
        _creationTime: p._creationTime,
        nomorReferensi: p.nomorReferensi,
        deskripsiBarang: p.deskripsiBarang,
        kategori: p.kategori,
        status: p.status,
        nilaiTaksiran: p.nilaiTaksiran,
        catatanReview: p.catatanReview,
      }));
  },
});

/** Detail satu pengajuan gadai milik sendiri. */
export const getMyPawn = query({
  args: { pawnId: v.id("pawns") },
  handler: async (ctx, args) => {
    const { userId } = await requirePeminjam(ctx);
    const pawn = await ctx.db.get(args.pawnId);
    if (pawn === null || pawn.userId !== userId) return null;
    return pawn;
  },
});

/** Ringkasan gadai — jujur: 0 saat belum ada data. */
export const myPawnSummary = query({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requirePeminjam(ctx);
    const pawns = await ctx.db
      .query("pawns")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return {
      totalGadai: pawns.length,
      dinilai: pawns.filter(
        (p) => p.status === "diajukan" || p.status === "sedang_dinilai",
      ).length,
      disetujui: pawns.filter((p) => p.status === "disetujui").length,
    };
  },
});

// =====================================================================
// Reviewer (tim Pinjam Gadai Digital) transitions — admin only
// =====================================================================

/** Hanya admin boleh memindahkan status aplikasi. */
async function requireAdmin(ctx: MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
  const user = await ctx.db.get(userId);
  if (user === null || user.role !== ROLES.ADMIN) {
    throw new Error(
      "Hanya tim Pinjam Gadai Digital (admin) yang dapat mengubah status aplikasi.",
    );
  }
  return userId;
}

async function setLoanStatus(
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

export const markLoanInReview = mutation({
  args: { loanId: v.id("loans") },
  handler: (ctx, args) => setLoanStatus(ctx, args.loanId, "sedang_direview"),
});

export const approveLoan = mutation({
  args: { loanId: v.id("loans") },
  handler: (ctx, args) => setLoanStatus(ctx, args.loanId, "disetujui"),
});

export const rejectLoan = mutation({
  args: { loanId: v.id("loans"), reason: v.string() },
  handler: (ctx, args) => setLoanStatus(ctx, args.loanId, "ditolak", args.reason),
});

async function setPawnStatus(
  ctx: MutationCtx,
  pawnId: Id<"pawns">,
  status: PawnStatusValue,
  opts: { nilaiTaksiran?: Rupiah; catatan?: string },
) {
  await requireAdmin(ctx);
  const pawn = await ctx.db.get(pawnId);
  if (pawn === null) throw new Error("Pengajuan gadai tidak ditemukan.");
  if (status === "diajukan") {
    throw new Error("Status tidak boleh dikembalikan ke diajukan.");
  }
  if (
    status === "disetujui" &&
    (opts.nilaiTaksiran === undefined ||
      !Number.isSafeInteger(opts.nilaiTaksiran) ||
      opts.nilaiTaksiran <= 0)
  ) {
    throw new Error(
      "Persetujuan gadai wajib menyertakan nilai taksiran rupiah bulat positif.",
    );
  }
  if (status === "ditolak" && (!opts.catatan || opts.catatan.trim().length === 0)) {
    throw new Error("Penolakan wajib menyertakan alasan.");
  }
  if (opts.nilaiTaksiran !== undefined) {
    validateRupiahAmount(opts.nilaiTaksiran, "Nilai taksiran");
  }
  await ctx.db.patch(pawnId, {
    status,
    ...(opts.nilaiTaksiran !== undefined ? { nilaiTaksiran: opts.nilaiTaksiran } : {}),
    catatanReview: opts.catatan?.trim() || undefined,
  });
}

export const markPawnInAppraisal = mutation({
  args: { pawnId: v.id("pawns") },
  handler: (ctx, args) =>
    setPawnStatus(ctx, args.pawnId, "sedang_dinilai", {}),
});

export const approvePawn = mutation({
  args: { pawnId: v.id("pawns"), nilaiTaksiran: v.number() },
  handler: (ctx, args) =>
    setPawnStatus(ctx, args.pawnId, "disetujui", {
      nilaiTaksiran: args.nilaiTaksiran,
    }),
});

export const rejectPawn = mutation({
  args: { pawnId: v.id("pawns"), reason: v.string() },
  handler: (ctx, args) =>
    setPawnStatus(ctx, args.pawnId, "ditolak", { catatan: args.reason }),
});

/** Internal helper dipakai oleh skrip/seed nanti — tidak diekspor ke HTTP. */
export const _internalSetLoanStatus = internalMutation({
  args: {
    loanId: v.id("loans"),
    status: loanStatusValidator,
    reason: v.optional(v.string()),
  },
  handler: (ctx, args) =>
    setLoanStatus(ctx, args.loanId, args.status, args.reason),
});
