import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { ROLES } from "./schema";
import { appendJournal } from "./ledger";
import { audit } from "./system";
import {
  GADAI_PRICING,
  quoteGadai,
  rencanaBayarGadai,
  sewaModalBerikutnya,
  type GadaiBayarResult,
} from "../lib/gadai";
import { formatRupiah, percentOf, type Rupiah } from "../lib/money";

/**
 * MODUL SKEMA B — GADAI DIGITAL (berjaminan / LTV 70%).
 *
 * Bedanya dengan Skema A (pinjaman tunai):
 *  - Potongan muka HANYA 1% → dana bersih diterima Peminjam 99%.
 *  - Sewa modal 5–10% per 30 hari dihitung DINAMIS dari SISA POKOK terbaru
 *    (decreasing principal basis): cicil pokok → sewa berikutnya otomatis turun.
 *  - Sisa pokok = Rp0 → barang keluar status "SIAP_DIAMBIL" dari Vault Custody.
 *
 * Semua uang integer rupiah; jurnal double-entry append-only (ΣD = ΣC).
 */

function referenceNumber(now: number): string {
  const date = new Date(now).toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = Array.from({ length: 4 }, () =>
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".charAt(Math.floor(Math.random() * 32)),
  ).join("");
  return `GBY-${date}-${suffix}`;
}

async function requireAdmin(ctx: MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
  const user = await ctx.db.get(userId);
  if (user === null || user.role !== ROLES.ADMIN) {
    throw new Error("Akses khusus tim Pinjam Gadai Digital (admin).");
  }
  return { userId, user };
}

async function requirePeminjam(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
  const user = await ctx.db.get(userId);
  if (user === null) throw new Error("Pengguna tidak ditemukan.");
  return { userId, user };
}

/** Sisa pokok berjalan = pokok − akumulasi cicilan (append-only payments). */
export async function hitungSisaPokok(
  ctx: QueryCtx,
  pawnId: Id<"pawns">,
  pokokGadai: Rupiah,
): Promise<Rupiah> {
  const payments = await ctx.db
    .query("pawnPayments")
    .withIndex("by_pawn", (q) => q.eq("pawnId", pawnId))
    .collect();
  const dicicil = payments.reduce((a, p) => a + p.pokokDicicil, 0);
  return Math.max(0, pokokGadai - dicicil);
}

// =====================================================================
// Admin: persetujuan pendanaan gadai (set pokok ≤ LTV 70% + sewa modal)
// =====================================================================

/**
 * Admin menetapkan pokok gadai & persen sewa modal saat approval.
 * Validasi server: pokok ≤ 70% harga pasar, sewa 5–10%.
 * (Pencairan dilakukan lewat aksi `cairkanGadai` setelah dana terkumpul.)
 */
export const setPendanaanGadai = mutation({
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
      throw new Error("Pendanaan hanya untuk gadai yang disetujui/dinilai.");
    }
    if (!Number.isSafeInteger(args.pokokGadai) || args.pokokGadai <= 0) {
      throw new Error("Pokok gadai harus rupiah bulat positif.");
    }
    if (
      !Number.isFinite(args.persenSewaModal) ||
      args.persenSewaModal < GADAI_PRICING.sewaModalMinPercent ||
      args.persenSewaModal > GADAI_PRICING.sewaModalMaxPercent
    ) {
      throw new Error(
        `Sewa modal harus ${GADAI_PRICING.sewaModalMinPercent}–${GADAI_PRICING.sewaModalMaxPercent}% per 30 hari.`,
      );
    }
    // LTV hard cap 70% dari harga pasar (bila harga pasar tercatat).
    if (pawn.hargaPasar !== undefined && pawn.hargaPasar > 0) {
      const limit = percentOf(pawn.hargaPasar, GADAI_PRICING.ltvMaxPercent);
      if (args.pokokGadai > limit) {
        throw new Error(
          `Pokok ${formatRupiah(args.pokokGadai)} melebihi LTV maks 70% (${formatRupiah(limit)}) dari harga pasar ${formatRupiah(pawn.hargaPasar)}.`,
        );
      }
    }
    // Pokok juga tidak boleh melebihi nilai taksiran.
    if (pawn.nilaiTaksiran !== undefined && args.pokokGadai > pawn.nilaiTaksiran) {
      throw new Error(
        `Pokok ${formatRupiah(args.pokokGadai)} melebihi nilai taksiran ${formatRupiah(pawn.nilaiTaksiran)}.`,
      );
    }

    await ctx.db.patch(args.pawnId, {
      pokokGadai: args.pokokGadai,
      persenSewaModal: args.persenSewaModal,
      sisaPokok: args.pokokGadai,
    });
    await audit(
      ctx,
      userId,
      user?.email ?? user?.name ?? "admin",
      "gadai_pendanaan",
      pawn.nomorReferensi,
      `Pokok ${formatRupiah(args.pokokGadai)} (LTV ≤70%), sewa modal ${args.persenSewaModal}%/30 hari`,
    );
    return { ok: true };
  },
});

// =====================================================================
// Admin: pencairan dana bersih 99% (Skema B)
// =====================================================================

/**
 * Cairkan dana bersih 99% dari pokok gadai ke Peminjam (jurnal):
 *   D peminjam:<userId>  99%  | K gadai:<pawnId> 99%   (kas keluar)
 *   D gadai:<pawnId>      1%  | K platform:FEE   1%    (potongan muka)
 * Wajib: status disetujui, pokokGadai tersedia, belum pernah dicairkan.
 */
export const cairkanGadai = mutation({
  args: { pawnId: v.id("pawns") },
  handler: async (ctx, args) => {
    const { userId, user } = await requireAdmin(ctx);
    const pawn = await ctx.db.get(args.pawnId);
    if (pawn === null) throw new Error("Pengajuan gadai tidak ditemukan.");
    if (pawn.status !== "disetujui") {
      throw new Error("Hanya gadai berstatus Disetujui yang dapat dicairkan.");
    }
    if (pawn.pokokGadai === undefined || pawn.pokokGadai <= 0) {
      throw new Error("Pokok gadai belum ditetapkan (set pendanaan dulu).");
    }
    if (pawn.dicairkanPada !== undefined) {
      throw new Error("Gadai ini sudah pernah dicairkan (idempoten).");
    }

    const quote = quoteGadai(pawn.pokokGadai, pawn.persenSewaModal ?? 5);
    const now = Date.now();

    // 1. Potongan muka 1% → platform.
    await appendJournal(ctx, {
      jenis: "platform_fee",
      keterangan: `Potongan muka 1% gadai ${pawn.nomorReferensi}`,
      aktor: "platform",
      lines: [
        { akun: "platform:FEE", arah: "debit", jumlah: quote.potonganDiMuka },
        { akun: `gadai:${args.pawnId}`, arah: "kredit", jumlah: quote.potonganDiMuka },
      ],
    });

    // 2. Dana bersih 99% ke Peminjam.
    await appendJournal(ctx, {
      jenis: "disbursement",
      keterangan: `Pencairan dana bersih 99% gadai ${pawn.nomorReferensi}`,
      aktor: userId,
      lines: [
        { akun: `peminjam:${pawn.userId}`, arah: "debit", jumlah: quote.danaBersihDitransfer },
        { akun: `gadai:${args.pawnId}`, arah: "kredit", jumlah: quote.danaBersihDitransfer },
      ],
    });

    await ctx.db.patch(args.pawnId, { dicairkanPada: now });
    await audit(
      ctx,
      userId,
      user?.email ?? user?.name ?? "admin",
      "gadai_cair",
      pawn.nomorReferensi,
      `Dana bersih ${formatRupiah(quote.danaBersihDitransfer)} (99%), potongan ${formatRupiah(quote.potonganDiMuka)} (1%)`,
    );
    return {
      danaBersih: quote.danaBersihDitransfer,
      potongan: quote.potonganDiMuka,
      sewaModalPeriode: quote.sewaModalPeriode,
    };
  },
});

// =====================================================================
// Peminjam: bayar sewa modal / cicil pokok (decreasing principal)
// =====================================================================

/**
 * Ringkasan kewajiban gadai aktif milik Peminjam untuk satu barang:
 * sisa pokok, sewa modal berikutnya (dari sisa terbaru), status custody.
 * Jujur null saat gadai belum aktif/dicairkan (Zero Fake Data).
 */
export const myGadaiBilling = query({
  args: { pawnId: v.id("pawns") },
  handler: async (ctx, args) => {
    await requirePeminjam(ctx);
    const pawn = await ctx.db.get(args.pawnId);
    if (pawn === null || pawn.pokokGadai === undefined) return null;
    const sisa = pawn.sisaPokok ?? pawn.pokokGadai;
    const persen = pawn.persenSewaModal ?? GADAI_PRICING.sewaModalMinPercent;
    const payments = await ctx.db
      .query("pawnPayments")
      .withIndex("by_pawn", (q) => q.eq("pawnId", args.pawnId))
      .collect();
    payments.sort((a, b) => b.waktu - a.waktu);
    const quote = quoteGadai(pawn.pokokGadai, persen);
    return {
      pokokGadai: pawn.pokokGadai,
      persenSewaModal: persen,
      sisaPokok: sisa,
      sewaModalBerikut: sewaModalBerikutnya(sisa, persen),
      custody: sisa <= 0 ? ("SIAP_DIAMBIL" as const) : ("DALAM_VAULT" as const),
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

/**
 * Bayar gadai: sewa modal wajib + cicilan pokok sukarela.
 * Decreasing principal: sewa periode berikutnya = persen × sisa pokok terbaru.
 * Jurnal (satu mutation transaksional, append-only):
 *   D platform:CASH (cicil+sewa) | K gadai:<pawnId> (cicil+sewa)
 *   D gadai:<pawnId> sewa        | K platform:FEE sewa
 * Sisa pokok 0 → status pawn menjadi "menunggu_pelepasan" (SIAP_DIAMBIL).
 */
export const bayarGadai = mutation({
  args: {
    pawnId: v.id("pawns"),
    /** Cicilan pokok sukarela (rupiah bulat, 0 = sewa saja). */
    cicilPokok: v.number(),
    /** true = bayar sewa saja untuk perpanjang tenor (cicilPokok diabaikan). */
    bayarHanyaSewa: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requirePeminjam(ctx);
    const pawn = await ctx.db.get(args.pawnId);
    if (pawn === null) throw new Error("Gadai tidak ditemukan.");
    if (pawn.userId !== userId) throw new Error("Bukan gadai Anda.");
    if (pawn.status !== "aktif") {
      throw new Error(
        "Hanya gadai berstatus Aktif (sudah dicairkan) yang dapat dibayar.",
      );
    }
    if (pawn.pokokGadai === undefined || pawn.pokokGadai <= 0) {
      throw new Error("Gadai ini belum memiliki pokok yang sah.");
    }
    const persen = pawn.persenSewaModal ?? GADAI_PRICING.sewaModalMinPercent;
    const sisa = pawn.sisaPokok ?? pawn.pokokGadai;

    // Hitung rencana bayar dari engine (validasi & presisi dijamin).
    let plan: GadaiBayarResult;
    try {
      plan = rencanaBayarGadai(sisa, persen, {
        cicilPokok: args.bayarHanyaSewa ? 0 : Math.max(0, args.cicilPokok),
        bayarHanyaSewa: args.bayarHanyaSewa,
      });
    } catch (e) {
      throw new Error(
        e instanceof Error ? e.message : "Rencana pembayaran tidak valid.",
      );
    }

    const now = Date.now();

    // 1. Kas masuk: cicil pokok + sewa modal.
    await appendJournal(ctx, {
      jenis: "repayment",
      keterangan: `Bayar gadai ${pawn.nomorReferensi} — cicil ${formatRupiah(plan.pokokDicicil)} + sewa ${formatRupiah(plan.sewaDibayar)}`,
      aktor: userId,
      lines: [
        { akun: "platform:CASH", arah: "debit", jumlah: plan.totalBayar },
        { akun: `gadai:${args.pawnId}`, arah: "kredit", jumlah: plan.totalBayar },
      ],
    });

    // 2. Sewa modal diakui sebagai pendapatan platform.
    await appendJournal(ctx, {
      jenis: "platform_fee",
      keterangan: `Sewa modal ${pawn.nomorReferensi} (${persen}% × sisa ${formatRupiah(sisa)})`,
      aktor: "platform",
      lines: [
        { akun: `gadai:${args.pawnId}`, arah: "debit", jumlah: plan.sewaDibayar },
        { akun: "platform:FEE", arah: "kredit", jumlah: plan.sewaDibayar },
      ],
    });

    // 3. Catat pembayaran append-only + update sisa pokok berjalan.
    await ctx.db.insert("pawnPayments", {
      pawnId: args.pawnId,
      pokokDicicil: plan.pokokDicicil,
      sewaDibayar: plan.sewaDibayar,
      sisaPokokSetelah: plan.sisaPokokSetelah,
      sewaModalBerikut: plan.sewaModalBerikut,
      userId,
      waktu: now,
    });
    await ctx.db.patch(args.pawnId, { sisaPokok: plan.sisaPokokSetelah });

    // 4. Sisa pokok Rp0 → SIAP_DIAMBIL: minta pelepasan barang otomatis.
    if (plan.custody === "SIAP_DIAMBIL" && pawn.status === "aktif") {
      await ctx.db.patch(args.pawnId, { status: "menunggu_pelepasan" });
    }

    return {
      totalBayar: plan.totalBayar,
      pokokDicicil: plan.pokokDicicil,
      sewaDibayar: plan.sewaDibayar,
      sisaPokokSetelah: plan.sisaPokokSetelah,
      sewaModalBerikut: plan.sewaModalBerikut,
      custody: plan.custody,
    };
  },
});

/** Estimasi sewa modal berikutnya untuk widget kalkulator Peminjam (publik ke pemilik). */
export const simulasiCicilGadai = query({
  args: {
    pawnId: v.id("pawns"),
    cicilPokok: v.number(),
  },
  handler: async (ctx, args) => {
    await requirePeminjam(ctx);
    const pawn = await ctx.db.get(args.pawnId);
    if (pawn === null || pawn.pokokGadai === undefined) return null;
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
      custody: sisaSetelah <= 0 ? ("SIAP_DIAMBIL" as const) : ("DALAM_VAULT" as const),
    };
  },
});
