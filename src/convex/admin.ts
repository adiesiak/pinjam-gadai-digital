import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation, internalMutation, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { ROLES } from "./schema";
import {
  calculateRepayment,
  DEFAULT_TENOR_HARI,
  quoteLoan,
} from "../lib/loan";
import { appendJournal, ledgerTotals } from "./ledger";

/** Gerbang admin — semua query/mutation di file ini dijaga. */
async function requireAdmin(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
  const user = await ctx.db.get(userId);
  if (user === null || user.role !== ROLES.ADMIN) {
    throw new Error("Akses khusus tim Pinjam Gadai Digital (admin).");
  }
  return { userId, user };
}

/**
 * Query gabungan untuk halaman admin: profil sendiri (untuk deteksi halaman)
 * plus antrean pengajuan. Digunakan juga oleh nasabah — untuk mereka
 * `isAdmin` false dan antrean selalu kosong, sehingga halaman admin bisa
 * mengandalkan satu query ini tanpa membocorkan apa pun.
 */
export const adminOverview = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
    const me = await ctx.db.get(userId);
    if (me === null) throw new Error("Pengguna tidak ditemukan.");

    const isAdmin = me.role === ROLES.ADMIN;
    if (!isAdmin) {
      return { isAdmin: false, loans: [], pawns: [] };
    }

    const loans = await ctx.db.query("loans").collect();
    const pawns = await ctx.db.query("pawns").collect();

    const loanRows = await Promise.all(
      loans
        .sort((a, b) => b._creationTime - a._creationTime)
        .map(async (l) => {
          const borrower = await ctx.db.get(l.userId);
          const pelunasan =
            l.status === "didanai" && l.didanaiPada !== undefined
              ? calculateRepayment(
                  l.pokokPinjaman,
                  l.tenorHari ?? DEFAULT_TENOR_HARI,
                  l.didanaiPada,
                  Date.now(),
                )
              : null;
          return {
            _id: l._id,
            _creationTime: l._creationTime,
            nomorReferensi: l.nomorReferensi,
            pokokPinjaman: l.pokokPinjaman,
            tujuan: l.tujuan,
            status: l.status,
            catatanReview: l.catatanReview,
            namaLengkap: l.namaLengkap,
            nomorRekening: l.nomorRekening,
            catatanPeminjam: l.catatanPeminjam,
            emailPeminjam: borrower?.email ?? null,
            tenorHari: l.tenorHari ?? null,
            // KYC & lokasi (opsional untuk data warisan)
            nik: l.nik ?? null,
            nomorWhatsApp: l.nomorWhatsApp ?? null,
            penghasilanBulanan: l.penghasilanBulanan ?? null,
            sumberPenghasilan: l.sumberPenghasilan ?? null,
            dokKtpId: l.dokKtpId ?? null,
            dokSelfieKtpId: l.dokSelfieKtpId ?? null,
            dokSlipGajiId: l.dokSlipGajiId ?? null,
            lokasiAjukan: l.lokasiAjukan ?? null,
            jatuhTempoPada: pelunasan?.jatuhTempoPada ?? null,
            sisaHari: pelunasan?.sisaHari ?? null,
            hariTerlambat: pelunasan?.hariTerlambat ?? null,
            dendaTerlambat: pelunasan?.dendaTerlambat ?? null,
            totalKewajibanDenganPenalti: pelunasan?.totalKewajibanDenganPenalti ?? null,
          };
        }),
    );

    const pawnRows = await Promise.all(
      pawns
        .sort((a, b) => b._creationTime - a._creationTime)
        .map(async (p) => {
          const borrower = await ctx.db.get(p.userId);
          return {
            _id: p._id,
            _creationTime: p._creationTime,
            nomorReferensi: p.nomorReferensi,
            deskripsiBarang: p.deskripsiBarang,
            kategori: p.kategori,
            alamatPenilaian: p.alamatPenilaian,
            status: p.status,
            nilaiTaksiran: p.nilaiTaksiran,
            catatanReview: p.catatanReview,
            namaLengkap: p.namaLengkap,
            nomorRekening: p.nomorRekening,
            catatanPeminjam: p.catatanPeminjam,
            emailPeminjam: borrower?.email ?? null,
          };
        }),
    );

    return { isAdmin: true, loans: loanRows, pawns: pawnRows };
  },
});

/**
 * URL dokumen KYC untuk dialog review pinjaman — admin saja.
 * URL Convex storage bertanda tangan & berkedaluwarsa.
 */
export const dokumenKycUrls = query({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    await requireAdmin(ctx);
    const loan = await ctx.db.get(loanId);
    if (loan === null) return null;
    const [ktp, selfie, slip] = await Promise.all([
      loan.dokKtpId ? ctx.storage.getUrl(loan.dokKtpId) : null,
      loan.dokSelfieKtpId ? ctx.storage.getUrl(loan.dokSelfieKtpId) : null,
      loan.dokSlipGajiId ? ctx.storage.getUrl(loan.dokSlipGajiId) : null,
    ]);
    return { ktpUrl: ktp, selfieUrl: selfie, slipUrl: slip };
  },
});

/** Apakah sudah ada admin di sistem — dipakai halaman /admin untuk bootstrap. */
export const adminExists = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("users").collect();
    return all.some((u) => u.role === ROLES.ADMIN);
  },
});

/**
 * Bootstrap admin pertama — hanya boleh dipakai saat belum ada admin.
 * Akun tamu (anonim) diblokir: wajib email terverifikasi.
 */
export const bootstrapFirstAdmin = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
    const me = await ctx.db.get(userId);
    if (me === null) throw new Error("Pengguna tidak ditemukan.");

    const all = await ctx.db.query("users").collect();
    const existingAdmin = all.some((u) => u.role === ROLES.ADMIN);
    if (existingAdmin) {
      throw new Error(
        "Admin sudah ada. Promosi admin berikutnya dilakukan oleh admin yang ada.",
      );
    }
    if (me.isAnonymous === true || !me.email) {
      throw new Error(
        "Bootstrap admin wajib memakai akun email terverifikasi, bukan akun tamu.",
      );
    }

    await ctx.db.patch(userId, { role: ROLES.ADMIN });
    return { success: true };
  },
});

/**
 * QA/dev helper: promosikan pengguna berdasarkan ID menjadi admin. Internal —
 * tidak bisa dipanggil dari klien; hanya via CLI Convex
 * (`bunx convex run admin:qaPromoteUser '{"userId":"..."}'`).
 */
export const qaPromoteUser = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const target = await ctx.db.get(args.userId);
    if (target === null) throw new Error("Pengguna tidak ditemukan.");
    await ctx.db.patch(args.userId, { role: ROLES.ADMIN });
    return { success: true, email: target.email ?? null };
  },
});

/**
 * Cabut peran admin dari semua akun TAMU (anonim tanpa email) — membersihkan
 * admin hantu buatan skrip QA sehingga slot bootstrap admin pertama kembali
 * tersedia untuk akun email asli. Admin beremail tidak tersentuh. Internal —
 * hanya via CLI Convex (`bunx convex run admin:qaDemoteGuestAdmins '{}').
 */
export const qaDemoteGuestAdmins = internalMutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("users").collect();
    const demoted: Array<{ id: string; email: string | null }> = [];
    for (const u of all) {
      if (u.role === ROLES.ADMIN && u.isAnonymous === true && !u.email) {
        await ctx.db.patch(u._id, { role: undefined });
        demoted.push({ id: u._id, email: u.email ?? null });
      }
    }
    return { demotedCount: demoted.length, demoted };
  },
});

/**
 * Promosikan pengguna lain menjadi admin — hanya oleh admin yang ada.
 * (Dipakai dari halaman admin; tidak diekspos ke nasabah.)
 */
export const promoteToAdmin = mutation({
  args: { targetUserId: v.id("users") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const target = await ctx.db.get(args.targetUserId);
    if (target === null) throw new Error("Pengguna target tidak ditemukan.");
    await ctx.db.patch(args.targetUserId, { role: ROLES.ADMIN });
    return { success: true };
  },
});

// Statistik antrean (hanya admin) — agregasi nyata dari database.
export const adminStats = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const loans = await ctx.db.query("loans").collect();
    const pawns = await ctx.db.query("pawns").collect();

    const pendingLoans = loans.filter((l) => l.status === "diajukan").length;
    const pendingPawns = pawns.filter(
      (p) => p.status === "diajukan" || p.status === "sedang_dinilai",
    ).length;
    const taksiranTotal = pawns
      .filter((p) => p.status === "disetujui" && p.nilaiTaksiran !== undefined)
      .reduce((acc, p) => acc + (p.nilaiTaksiran ?? 0), 0);

    // Keterlambatan pelunasan — dihitung live dari tanggal pendanaan + tenor.
    let pinjamanTerlambat = 0;
    let totalDendaBerjalan = 0;
    for (const l of loans) {
      if (l.status !== "didanai") continue;
      const info =
        l.didanaiPada !== undefined
          ? calculateRepayment(
              l.pokokPinjaman,
              l.tenorHari ?? DEFAULT_TENOR_HARI,
              l.didanaiPada,
              Date.now(),
            )
          : null;
      if (info === null) continue;
      if (info.hariTerlambat > 0) {
        pinjamanTerlambat += 1;
        totalDendaBerjalan += info.dendaTerlambat;
      }
    }

    return {
      pinjamanBaru: pendingLoans,
      gadaiProses: pendingPawns,
      totalPinjaman: loans.length,
      totalGadai: pawns.length,
      nilaiTaksiranDisetujui: taksiranTotal,
      pinjamanTerlambat,
      totalDendaBerjalan,
    };
  },
});

// Re-quote helper dipakai ulang untuk tampilan admin (rincian biaya pinjaman).
export const adminLoanQuote = query({
  args: { pokokPinjaman: v.number() },
  handler: async (_ctx, args) => quoteLoan(args.pokokPinjaman),
});

// =====================================================================
// Verifikasi setoran Pendana
// =====================================================================

/** Antrean setoran Pendana yang menunggu verifikasi. */
export const pendingDeposits = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db
      .query("deposits")
      .withIndex("by_status", (q) => q.eq("status", "menunggu_verifikasi"))
      .collect();
    const result = [];
    for (const d of rows.sort((a, b) => b._creationTime - a._creationTime)) {
      const pendana = await ctx.db.get(d.pendanaId);
      result.push({
        _id: d._id,
        _creationTime: d._creationTime,
        nomorReferensi: d.nomorReferensi,
        jumlah: d.jumlah,
        referensiTransfer: d.referensiTransfer,
        emailPendana: pendana?.email ?? null,
      });
    }
    return result;
  },
});

/**
 * Konfirmasi setoran — menulis jurnal deposit seimbang ke ledger:
 * debit kas platform, kredit dompet Pendana.
 */
export const confirmDeposit = mutation({
  args: { depositId: v.id("deposits") },
  handler: async (ctx, args) => {
    const { userId: adminId } = await requireAdmin(ctx);
    const deposit = await ctx.db.get(args.depositId);
    if (deposit === null) throw new Error("Setoran tidak ditemukan.");
    if (deposit.status !== "menunggu_verifikasi") {
      throw new Error("Setoran ini sudah diputuskan.");
    }

    await appendJournal(ctx, {
      jenis: "deposit",
      keterangan: `Setoran ${deposit.nomorReferensi} terverifikasi (ref transfer: ${deposit.referensiTransfer})`,
      aktor: adminId,
      lines: [
        // Debit menaikkan saldo dompet Pendana; kredit mencatat kas platform.
        { akun: `pendana:WALLET:${deposit.pendanaId}`, arah: "debit", jumlah: deposit.jumlah },
        { akun: "platform:CASH", arah: "kredit", jumlah: deposit.jumlah },
      ],
    });

    await ctx.db.patch(args.depositId, { status: "terverifikasi" });
    return { success: true };
  },
});

/** Tolak setoran — wajib alasan; tidak menyentuh ledger. */
export const rejectDeposit = mutation({
  args: { depositId: v.id("deposits"), reason: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const deposit = await ctx.db.get(args.depositId);
    if (deposit === null) throw new Error("Setoran tidak ditemukan.");
    if (deposit.status !== "menunggu_verifikasi") {
      throw new Error("Setoran ini sudah diputuskan.");
    }
    if (!args.reason.trim()) {
      throw new Error("Penolakan wajib menyertakan alasan.");
    }
    await ctx.db.patch(args.depositId, {
      status: "ditolak",
      catatanAdmin: args.reason.trim(),
    });
  },
});

/** Ringkasan ledger untuk kartu kesehatan sistem di panel admin. */
export const ledgerSummary = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return ledgerTotals(ctx);
  },
});
