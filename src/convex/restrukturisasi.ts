/**
 * RESTRUKTURISASI PINJAMAN — sisi server.
 *
 * Alur: admin mengajukan perpanjangan tenor dengan alasan, lalu admin
 * ber-TOTP memutuskan. Persetujuan hanya mengubah `loans.tenorHari`, sehingga
 * jatuh tempo bergeser dan denda berhenti bertambah; pokok, bunga, dan total
 * kewajiban TIDAK dihitung ulang di sini (itu wilayah `lib/loan.ts`).
 *
 * Hanya pinjaman skema harian yang dilayani. Skema bulanan memakai total
 * cicilan yang berubah bila tenornya diubah, jadi menawarkannya lewat jalur
 * yang sama akan salah hitung — lebih baik ditolak dengan alasan yang jelas.
 */
import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { requireAdminSession } from "./adminAuthz";
import { audit, tarifDendaBerlaku } from "./system";
import {
  JENIS_RESTRUKTURISASI,
  LABEL_JENIS_RESTRUKTURISASI,
  LABEL_STATUS_RESTRUKTURISASI,
  jatuhTempoSetelahPerpanjangan,
  validasiAlasanRestrukturisasi,
  validasiPerpanjanganTenor,
  type JenisRestrukturisasi,
  type StatusRestrukturisasi,
} from "../lib/restrukturisasi";
import { pelunasanPinjaman } from "../lib/loan";

const BATAS_RIWAYAT = 12;

type LoanRow = {
  _id: Id<"loans">;
  userId: Id<"users">;
  status: string;
  tenorHari: number;
  tenorBulan?: number;
  didanaiPada?: number;
  persenBunga?: number;
  pokokPinjaman: number;
  nomorReferensi: string;
  namaLengkap: string;
};

/** Alasan pinjaman tidak bisa diperpanjang, atau null bila bisa. */
function alasanTidakBisaDiperpanjang(loan: LoanRow | null): string | null {
  if (loan === null) return "Pinjaman tidak ditemukan.";
  if (loan.status !== "didanai") {
    return loan.status === "lunas"
      ? "Pinjaman ini sudah lunas, jadi tidak ada tenor yang perlu diperpanjang."
      : "Hanya pinjaman yang sudah berjalan (didanai) yang dapat diperpanjang.";
  }
  if (loan.tenorBulan !== undefined) {
    return "Perpanjangan baru tersedia untuk pinjaman skema harian. Untuk skema bulanan, ajukan penjadwalan ulang lewat penyelesaian penagihan.";
  }
  if (loan.didanaiPada === undefined) {
    return "Pinjaman ini belum punya tanggal pencairan, jadi jatuh tempo barunya tidak bisa dihitung.";
  }
  return null;
}

async function bacaRingkasan(ctx: QueryCtx, loanId: Id<"loans">): Promise<LoanRow | null> {
  return await ctx.db.get(loanId);
}

/** Ringkasan restrukturisasi satu pinjaman + usulan yang menggantung. */
export const ringkasanRestrukturisasi = query({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    await requireAdminSession(ctx);
    const loan = await bacaRingkasan(ctx, loanId);
    const rows = await ctx.db
      .query("restrukturisasiPinjaman")
      .withIndex("by_loan", (q) => q.eq("loanId", loanId))
      .order("desc")
      .take(BATAS_RIWAYAT);

    const menunggu = rows.find((r) => r.status === "diajukan") ?? null;
    const alasanDasar = alasanTidakBisaDiperpanjang(loan);
    const alasan = alasanDasar ?? (menunggu === null
      ? null
      : "Masih ada usulan perpanjangan yang menunggu keputusan. Selesaikan dulu sebelum mengajukan yang baru.");

    const tarifDenda = await tarifDendaBerlaku(ctx);
    const pelunasan =
      loan === null ? null : pelunasanPinjaman(loan, Date.now(), tarifDenda);

    return {
      boleh: alasan === null,
      alasan,
      tenorHari: loan?.tenorHari ?? null,
      tenorBulan: loan?.tenorBulan ?? null,
      didanaiPada: loan?.didanaiPada ?? null,
      jatuhTempoPada: pelunasan?.jatuhTempoPada ?? null,
      hariTerlambat: pelunasan?.hariTerlambat ?? 0,
      menunggu:
        menunggu === null
          ? null
          : {
              _id: menunggu._id,
              tambahanHari: menunggu.tambahanHari,
              tenorBaruHari: menunggu.tenorBaruHari,
              alasan: menunggu.alasan,
              diajukanOlehLabel: menunggu.diajukanOlehLabel,
              dibuatPada: menunggu.dibuatPada,
            },
      riwayat: rows
        .filter((r) => r.status !== "diajukan")
        .map((r) => ({
          _id: r._id,
          jenis: r.jenis,
          status: r.status,
          tenorLamaHari: r.tenorLamaHari,
          tenorBaruHari: r.tenorBaruHari,
          tambahanHari: r.tambahanHari,
          alasan: r.alasan,
          diajukanOlehLabel: r.diajukanOlehLabel,
          dibuatPada: r.dibuatPada,
          diputuskanOlehLabel: r.diputuskanOlehLabel ?? null,
          diputuskanPada: r.diputuskanPada ?? null,
          catatanKeputusan: r.catatanKeputusan ?? null,
        })),
    };
  },
});

/** Ajukan perpanjangan tenor untuk pinjaman harian. */
export const ajukanRestrukturisasi = mutation({
  args: {
    loanId: v.id("loans"),
    tambahanHari: v.number(),
    alasan: v.string(),
  },
  handler: async (ctx, { loanId, tambahanHari, alasan }) => {
    const { userId, user } = await requireAdminSession(ctx);
    const loan = await bacaRingkasan(ctx, loanId);
    const alasanDasar = alasanTidakBisaDiperpanjang(loan);
    if (alasanDasar !== null) throw new Error(alasanDasar);
    const loanAman = loan as LoanRow;

    const menunggu = await ctx.db
      .query("restrukturisasiPinjaman")
      .withIndex("by_loan", (q) => q.eq("loanId", loanId))
      .order("desc")
      .first();
    if (menunggu !== null && menunggu.status === "diajukan") {
      throw new Error(
        "Masih ada usulan perpanjangan yang menunggu keputusan. Selesaikan dulu sebelum mengajukan yang baru.",
      );
    }

    const sahAlasan = validasiAlasanRestrukturisasi(alasan);
    if (!sahAlasan.ok) throw new Error(sahAlasan.alasan);

    const sah = validasiPerpanjanganTenor({
      tenorLamaHari: loanAman.tenorHari,
      tambahanHari,
    });
    if (!sah.ok) throw new Error(sah.alasan);

    const label = user.email ?? user.name ?? "admin";
    const now = Date.now();
    const id = await ctx.db.insert("restrukturisasiPinjaman", {
      loanId,
      userId: loanAman.userId,
      jenis: JENIS_RESTRUKTURISASI[0],
      tenorLamaHari: loanAman.tenorHari,
      tenorBaruHari: sah.tenorBaruHari,
      tambahanHari,
      alasan: alasan.trim(),
      status: "diajukan",
      diajukanOlehUserId: userId,
      diajukanOlehLabel: label,
      dibuatPada: now,
    });

    await audit(
      ctx,
      userId,
      label,
      "restrukturisasi_diajukan",
      loanAman.nomorReferensi,
      `Usulan perpanjangan tenor ${loanAman.tenorHari} → ${sah.tenorBaruHari} hari (+${tambahanHari}) · ${alasan.trim()}`,
    );

    return { ok: true as const, id, tenorBaruHari: sah.tenorBaruHari };
  },
});

/** Setujui atau tolak usulan; persetujuan menggeser jatuh tempo. */
export const putuskanRestrukturisasi = mutation({
  args: {
    id: v.id("restrukturisasiPinjaman"),
    setuju: v.boolean(),
    catatan: v.optional(v.string()),
  },
  handler: async (ctx, { id, setuju, catatan }) => {
    const { userId, user } = await requireAdminSession(ctx);
    const row = await ctx.db.get(id);
    if (row === null) throw new Error("Usulan restrukturisasi tidak ditemukan.");
    if (row.status !== "diajukan") {
      throw new Error(
        `Usulan ini sudah diputuskan (${LABEL_STATUS_RESTRUKTURISASI[row.status as StatusRestrukturisasi] ?? row.status}).`,
      );
    }

    const loan = await bacaRingkasan(ctx, row.loanId);
    const alasanDasar = alasanTidakBisaDiperpanjang(loan);
    if (setuju && alasanDasar !== null) throw new Error(alasanDasar);
    const loanAman = loan as LoanRow;

    const isiCatatan = catatan?.trim() ?? "";
    if (isiCatatan.length > 500) {
      throw new Error("Catatan keputusan maksimal 500 karakter.");
    }

    const label = user.email ?? user.name ?? "admin";
    const now = Date.now();
    const status: StatusRestrukturisasi = setuju ? "disetujui" : "ditolak";

    if (setuju) {
      await ctx.db.patch(row.loanId, { tenorHari: row.tenorBaruHari });
    }

    await ctx.db.patch(row._id, {
      status,
      diputuskanOlehUserId: userId,
      diputuskanOlehLabel: label,
      diputuskanPada: now,
      catatanKeputusan: isiCatatan === "" ? undefined : isiCatatan,
    });

    const jatuhTempoBaru = setuju
      ? jatuhTempoSetelahPerpanjangan(loanAman.didanaiPada ?? 0, row.tenorBaruHari)
      : null;
    await audit(
      ctx,
      userId,
      label,
      setuju ? "restrukturisasi_disetujui" : "restrukturisasi_ditolak",
      loanAman.nomorReferensi,
      setuju
        ? `Perpanjangan tenor ${row.tenorLamaHari} → ${row.tenorBaruHari} hari (+${row.tambahanHari}). Jatuh tempo bergeser ke ${new Date(jatuhTempoBaru ?? 0).toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" })}. Pokok, bunga, dan total kewajiban tidak berubah.${isiCatatan === "" ? "" : ` Catatan: ${isiCatatan}`}`
        : `Usulan perpanjangan tenor ${row.tambahanHari} hari ditolak. Tenor pinjaman tidak berubah.${isiCatatan === "" ? "" : ` Catatan: ${isiCatatan}`}`,
    );

    return {
      ok: true as const,
      status,
      label: LABEL_STATUS_RESTRUKTURISASI[status],
      tenorBaruHari: setuju ? row.tenorBaruHari : null,
      jenisLabel: LABEL_JENIS_RESTRUKTURISASI[row.jenis as JenisRestrukturisasi] ?? row.jenis,
    };
  },
});
