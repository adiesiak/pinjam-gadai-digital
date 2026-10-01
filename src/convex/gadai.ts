import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { requireAdminSession } from "./adminAuthz";
import { audit } from "./system";
import { GADAI_PRICING, quoteGadai, sewaModalBerikutnya } from "../lib/gadai";
import { formatRupiah, percentOf } from "../lib/money";
import { rejectUnverifiedMoneyMovement } from "./paymentGuard";
import { AUDIT_GADAI_DANA } from "../lib/legacy";

function requireAdmin(ctx: MutationCtx) {
  return requireAdminSession(ctx);
}

async function requirePeminjam(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
  const user = await ctx.db.get(userId);
  if (user === null) throw new Error("Pengguna tidak ditemukan.");
  if (user.isAnonymous === true) {
    throw new Error("Akun tamu hanya dapat melihat informasi. Masuk dengan akun terverifikasi untuk mengakses data dan transaksi.");
  }
  return { userId, user };
}

/** Admin menetapkan pokok dan sewa gadai setelah penilaian; ini bukan pencairan. */
export const setDanaGadai = mutation({
  args: {
    pawnId: v.id("pawns"),
    pokokGadai: v.number(),
    persenSewaModal: v.number(),
  },
  handler: async (ctx, args) => {
    const { userId, user } = await requireAdmin(ctx);
    const pawn = await ctx.db.get(args.pawnId);
    if (pawn === null) throw new Error("Pengajuan gadai tidak ditemukan.");
    if (pawn.status !== "disetujui" && pawn.status !== "sedang_dinilai" && pawn.status !== "aktif") {
      throw new Error("Penilaian hanya untuk gadai yang disetujui/dinilai.");
    }
    if (!Number.isSafeInteger(args.pokokGadai) || args.pokokGadai <= 0) {
      throw new Error("Pokok gadai harus rupiah bulat positif.");
    }
    if (!Number.isFinite(args.persenSewaModal) || args.persenSewaModal < GADAI_PRICING.sewaModalMinPercent || args.persenSewaModal > GADAI_PRICING.sewaModalMaxPercent) {
      throw new Error(`Sewa modal harus ${GADAI_PRICING.sewaModalMinPercent}–${GADAI_PRICING.sewaModalMaxPercent}% per 30 hari.`);
    }
    if (pawn.hargaPasar !== undefined && pawn.hargaPasar > 0) {
      const limit = percentOf(pawn.hargaPasar, GADAI_PRICING.ltvMaxPercent);
      if (args.pokokGadai > limit) {
        throw new Error(`Pokok ${formatRupiah(args.pokokGadai)} melebihi LTV maks 70% (${formatRupiah(limit)}) dari harga pasar ${formatRupiah(pawn.hargaPasar)}.`);
      }
    }
    if (pawn.nilaiTaksiran !== undefined && args.pokokGadai > pawn.nilaiTaksiran) {
      throw new Error(`Pokok ${formatRupiah(args.pokokGadai)} melebihi nilai taksiran ${formatRupiah(pawn.nilaiTaksiran)}.`);
    }
    await ctx.db.patch(args.pawnId, {
      pokokGadai: args.pokokGadai,
      persenSewaModal: args.persenSewaModal,
      sisaPokok: args.pokokGadai,
    });
    await audit(ctx, userId, user.email ?? user.name ?? "admin", AUDIT_GADAI_DANA, pawn.nomorReferensi, `Pokok ${formatRupiah(args.pokokGadai)} (LTV ≤70%), sewa modal ${args.persenSewaModal}%/30 hari`);
    return { ok: true };
  },
});

/** Pencairan gadai ditutup sampai ada izin dan settlement terverifikasi. */
export const cairkanGadai = mutation({
  args: { pawnId: v.id("pawns") },
  handler: async (ctx) => {
    await requireAdmin(ctx);
    rejectUnverifiedMoneyMovement();
  },
});

/** Ringkasan historis ledger gadai; angka/status turunan tidak membuktikan transaksi atau custody fisik. */
export const myGadaiBilling = query({
  args: { pawnId: v.id("pawns") },
  handler: async (ctx, args) => {
    const { userId } = await requirePeminjam(ctx);
    const pawn = await ctx.db.get(args.pawnId);
    if (pawn === null || pawn.userId !== userId || pawn.pokokGadai === undefined) return null;
    const sisa = pawn.sisaPokok ?? pawn.pokokGadai;
    const persen = pawn.persenSewaModal ?? GADAI_PRICING.sewaModalMinPercent;
    const payments = await ctx.db.query("pawnPayments").withIndex("by_pawn", (q) => q.eq("pawnId", args.pawnId)).collect();
    payments.sort((a, b) => b.waktu - a.waktu);
    const quote = quoteGadai(pawn.pokokGadai, persen);
    return {
      pokokGadai: pawn.pokokGadai,
      persenSewaModal: persen,
      sisaPokok: sisa,
      sewaModalBerikut: sewaModalBerikutnya(sisa, persen),
      custody: "TIDAK_DIVERIFIKASI" as const,
      statusTurunanLedger: sisa <= 0 ? ("SIAP_DIAMBIL" as const) : ("DALAM_VAULT" as const),
      statusPawn: pawn.status,
      dicairkanPada: pawn.dicairkanPada ?? null,
      danaBersihDiterima: quote.danaBersihDitransfer,
      potonganDiMuka: quote.potonganDiMuka,
      totalPokokDicicil: pawn.pokokGadai - sisa,
      riwayat: payments.map((p) => ({
        _id: p._id,
        waktu: p.waktu,
        pokokDicicil: p.pokokDicicil,
        sewaDibayar: p.sewaDibayar,
        sisaPokokSetelah: p.sisaPokokSetelah,
        sewaModalBerikut: p.sewaModalBerikut,
      })),
    };
  },
});

/** Pembayaran gadai tidak dicatat sebelum ada konfirmasi settlement yang sah. */
export const bayarGadai = mutation({
  args: {
    pawnId: v.id("pawns"),
    cicilPokok: v.number(),
    bayarHanyaSewa: v.optional(v.boolean()),
  },
  handler: async (ctx) => {
    await requirePeminjam(ctx);
    rejectUnverifiedMoneyMovement();
  },
});

/** Kalkulator murni; hasilnya ilustrasi ledger, bukan pembayaran atau bukti custody fisik. */
export const simulasiCicilGadai = query({
  args: {
    pawnId: v.id("pawns"),
    cicilPokok: v.number(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requirePeminjam(ctx);
    const pawn = await ctx.db.get(args.pawnId);
    if (pawn === null || pawn.userId !== userId || pawn.pokokGadai === undefined) return null;
    const persen = pawn.persenSewaModal ?? GADAI_PRICING.sewaModalMinPercent;
    const sisa = pawn.sisaPokok ?? pawn.pokokGadai;
    const cicil = Math.min(Math.max(0, args.cicilPokok), sisa);
    const sewa = sewaModalBerikutnya(sisa, persen);
    const sisaSetelah = sisa - cicil;
    return {
      sisaPokok: sisa,
      persenSewaModal: persen,
      sewaModalBerikut: sewa,
      cicilPokok: cicil,
      totalBayar: cicil + sewa,
      sisaPokokSetelah: sisaSetelah,
      sewaSetelah: sewaModalBerikutnya(sisaSetelah, persen),
      custody: "TIDAK_DIVERIFIKASI" as const,
      statusTurunanLedger: sisaSetelah <= 0 ? ("SIAP_DIAMBIL" as const) : ("DALAM_VAULT" as const),
    };
  },
});
