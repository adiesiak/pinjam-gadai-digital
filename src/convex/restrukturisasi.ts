/**
 * RESTRUKTURISASI PINJAMAN — sisi server.
 *
 * Dua pintu masuk:
 *  - admin mengajukan perpanjangan tenor lewat panel penagihan;
 *  - nasabah mengajukan sendiri dari dashboard: perpanjangan tenor (harian)
 *    atau usulan cicilan (harian/bulanan).
 *
 * Persetujuan perpanjangan mengubah `loans.tenorHari`, sehingga jatuh tempo
 * bergeser dan denda berhenti bertambah; pokok, bunga, dan total kewajiban
 * TIDAK dihitung ulang di sini (itu wilayah `lib/loan.ts`). Persetujuan
 * cicilan hanya mencatat keputusan: jadwal dan pembayaran tetap ditangani tim
 * di luar aplikasi, jadi tidak ada angka yang diubah diam-diam.
 *
 * Hanya pinjaman skema harian yang bisa diperpanjang. Skema bulanan memakai
 * total cicilan yang berubah bila tenornya diubah, jadi menawarkannya lewat
 * jalur yang sama akan salah hitung — lebih baik ditolak dengan alasan jelas.
 */
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { requireAdminSession } from "./adminAuthz";
import { audit, tarifDendaBerlaku } from "./system";
import {
  LABEL_JENIS_RESTRUKTURISASI,
  LABEL_STATUS_RESTRUKTURISASI,
  jatuhTempoSetelahPerpanjangan,
  validasiAlasanRestrukturisasi,
  validasiPerpanjanganTenor,
  validasiUsulanCicilan,
  type JenisRestrukturisasi,
  type StatusRestrukturisasi,
} from "../lib/restrukturisasi";
import {
  pelunasanPinjaman,
  quotePinjaman,
  simulasiBulananPinjaman,
} from "../lib/loan";

const BATAS_RIWAYAT = 12;

type LoanRow = Doc<"loans">;

/** Alasan pinjaman tidak bisa diproses sama sekali, atau null bila bisa. */
function alasanPinjamanTidakAktif(loan: LoanRow | null): string | null {
  if (loan === null) return "Pinjaman tidak ditemukan.";
  if (loan.status !== "didanai") {
    return loan.status === "lunas"
      ? "Pinjaman ini sudah lunas, jadi tidak ada tenor atau cicilan yang perlu diubah."
      : "Hanya pinjaman yang sudah berjalan (didanai) yang dapat diajukan restrukturisasi.";
  }
  return null;
}

/** Alasan pinjaman tidak bisa DIPERPANJANG, atau null bila bisa. */
function alasanTidakBisaDiperpanjang(loan: LoanRow | null): string | null {
  const dasar = alasanPinjamanTidakAktif(loan);
  if (dasar !== null) return dasar;
  if (loan!.tenorBulan !== undefined) {
    return "Perpanjangan tenor hanya tersedia untuk pinjaman skema harian. Untuk skema bulanan, ajukan usulan cicilan atau penjadwalan ulang lewat penagihan.";
  }
  if (loan!.didanaiPada === undefined) {
    return "Pinjaman ini belum punya tanggal pencairan, jadi jatuh tempo barunya tidak bisa dihitung.";
  }
  return null;
}

/** Alasan pinjaman tidak bisa DIUSULKAN CICILAN, atau null bila bisa. */
function alasanTidakBisaDicicil(loan: LoanRow | null): string | null {
  return alasanPinjamanTidakAktif(loan);
}

/** Total kewajiban memakai mesin yang sama dengan rincian pinjaman. */
function totalKewajibanPinjaman(loan: LoanRow): number {
  if (loan.tenorBulan !== undefined) {
    return simulasiBulananPinjaman({ ...loan, tenorBulan: loan.tenorBulan })
      .totalPengembalian;
  }
  return quotePinjaman(loan).totalKewajibanPelunasan;
}

async function bacaPinjaman(
  ctx: QueryCtx,
  loanId: Id<"loans">,
): Promise<LoanRow | null> {
  return await ctx.db.get(loanId);
}

async function permohonanTerakhir(ctx: QueryCtx, loanId: Id<"loans">) {
  return await ctx.db
    .query("restrukturisasiPinjaman")
    .withIndex("by_loan", (q) => q.eq("loanId", loanId))
    .order("desc")
    .first();
}

/** Ringkasan restrukturisasi satu pinjaman untuk panel admin. */
export const ringkasanRestrukturisasi = query({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    await requireAdminSession(ctx);
    const loan = await bacaPinjaman(ctx, loanId);
    const rows = await ctx.db
      .query("restrukturisasiPinjaman")
      .withIndex("by_loan", (q) => q.eq("loanId", loanId))
      .order("desc")
      .take(BATAS_RIWAYAT);

    const menunggu = rows.find((r) => r.status === "diajukan") ?? null;
    const alasanDasar = alasanTidakBisaDiperpanjang(loan);
    const alasanCicilan = alasanTidakBisaDicicil(loan);
    const pesanMenunggu =
      menunggu === null
        ? null
        : "Masih ada permohonan yang menunggu keputusan. Selesaikan dulu sebelum mengajukan yang baru.";
    const alasan = alasanDasar ?? pesanMenunggu;
    const alasanUntukCicilan = alasanCicilan ?? pesanMenunggu;

    const tarifDenda = await tarifDendaBerlaku(ctx);
    const pelunasan =
      loan === null ? null : pelunasanPinjaman(loan, Date.now(), tarifDenda);

    return {
      boleh: alasan === null,
      alasan,
      bolehCicilan: alasanUntukCicilan === null,
      alasanCicilan: alasanUntukCicilan,
      tenorHari: loan?.tenorHari ?? null,
      tenorBulan: loan?.tenorBulan ?? null,
      totalKewajiban: loan === null ? null : totalKewajibanPinjaman(loan),
      didanaiPada: loan?.didanaiPada ?? null,
      jatuhTempoPada: pelunasan?.jatuhTempoPada ?? null,
      hariTerlambat: pelunasan?.hariTerlambat ?? 0,
      menunggu:
        menunggu === null
          ? null
          : {
              _id: menunggu._id,
              jenis: menunggu.jenis,
              tambahanHari: menunggu.tambahanHari,
              tenorBaruHari: menunggu.tenorBaruHari,
              usulanCicilan: menunggu.usulanCicilan ?? null,
              alasan: menunggu.alasan,
              diajukanOlehLabel: menunggu.diajukanOlehLabel,
              diajukanOlehNasabah: menunggu.diajukanOlehNasabah === true,
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
          usulanCicilan: r.usulanCicilan ?? null,
          alasan: r.alasan,
          diajukanOlehLabel: r.diajukanOlehLabel,
          diajukanOlehNasabah: r.diajukanOlehNasabah === true,
          dibuatPada: r.dibuatPada,
          diputuskanOlehLabel: r.diputuskanOlehLabel ?? null,
          diputuskanPada: r.diputuskanPada ?? null,
          catatanKeputusan: r.catatanKeputusan ?? null,
        })),
    };
  },
});

/**
 * Antrean permohonan yang menunggu keputusan, untuk tab Jatuh Tempo admin.
 *
 * Dipisah dari ringkasan per pinjaman supaya permohonan nasabah tetap terlihat
 * walau pinjamannya belum punya kasus penagihan. Urut terlama lebih dulu.
 */
export const daftarPermohonanMenunggu = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminSession(ctx);
    const rows = await ctx.db
      .query("restrukturisasiPinjaman")
      .withIndex("by_status", (q) => q.eq("status", "diajukan"))
      .order("asc")
      .take(50);

    const hasil = [];
    for (const row of rows) {
      const loan = await ctx.db.get(row.loanId);
      if (loan === null) continue;
      hasil.push({
        _id: row._id,
        loanId: row.loanId,
        nomorReferensi: loan.nomorReferensi,
        namaLengkap: loan.namaLengkap,
        jenis: row.jenis,
        tambahanHari: row.tambahanHari,
        tenorLamaHari: row.tenorLamaHari,
        tenorBaruHari: row.tenorBaruHari,
        tenorBulan: loan.tenorBulan ?? null,
        usulanCicilan: row.usulanCicilan ?? null,
        totalKewajiban: totalKewajibanPinjaman(loan),
        alasan: row.alasan,
        diajukanOlehLabel: row.diajukanOlehLabel,
        diajukanOlehNasabah: row.diajukanOlehNasabah === true,
        dibuatPada: row.dibuatPada,
      });
    }
    return hasil;
  },
});

/** Ringkasan permohonan milik nasabah sendiri untuk dashboard. */
export const ringkasanPermohonanNasabah = query({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
    const user = await ctx.db.get(userId);
    if (user === null) throw new Error("Pengguna tidak ditemukan.");
    if (user.isAnonymous === true) {
      throw new Error("Akun tamu hanya dapat melihat informasi.");
    }

    const loan = await ctx.db.get(loanId);
    if (loan === null || loan.userId !== userId) {
      throw new Error("Pinjaman tidak ditemukan.");
    }

    const rows = await ctx.db
      .query("restrukturisasiPinjaman")
      .withIndex("by_loan", (q) => q.eq("loanId", loanId))
      .order("desc")
      .take(BATAS_RIWAYAT);
    const menunggu = rows.find((r) => r.status === "diajukan") ?? null;
    const alasanPerpanjangan = alasanTidakBisaDiperpanjang(loan);
    const alasanCicilan = alasanTidakBisaDicicil(loan);
    const pesanMenunggu =
      menunggu === null
        ? null
        : "Permohonan sebelumnya masih menunggu keputusan tim PINDAI.";

    return {
      statusPinjaman: loan.status,
      tenorHari: loan.tenorHari,
      tenorBulan: loan.tenorBulan ?? null,
      totalKewajiban: totalKewajibanPinjaman(loan),
      bolehPerpanjangan:
        alasanPerpanjangan === null && pesanMenunggu === null,
      alasanPerpanjangan: alasanPerpanjangan ?? pesanMenunggu,
      bolehCicilan: alasanCicilan === null && pesanMenunggu === null,
      alasanCicilan: alasanCicilan ?? pesanMenunggu,
      menunggu:
        menunggu === null
          ? null
          : {
              _id: menunggu._id,
              jenis: menunggu.jenis,
              tambahanHari: menunggu.tambahanHari,
              tenorBaruHari: menunggu.tenorBaruHari,
              usulanCicilan: menunggu.usulanCicilan ?? null,
              alasan: menunggu.alasan,
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
          usulanCicilan: r.usulanCicilan ?? null,
          alasan: r.alasan,
          dibuatPada: r.dibuatPada,
          diputuskanPada: r.diputuskanPada ?? null,
          catatanKeputusan: r.catatanKeputusan ?? null,
        })),
    };
  },
});

/** Ajukan perpanjangan tenor untuk pinjaman harian (dari panel admin). */
export const ajukanRestrukturisasi = mutation({
  args: {
    loanId: v.id("loans"),
    tambahanHari: v.number(),
    alasan: v.string(),
  },
  handler: async (ctx, { loanId, tambahanHari, alasan }) => {
    const { userId, user } = await requireAdminSession(ctx);
    const loan = await bacaPinjaman(ctx, loanId);
    const alasanDasar = alasanTidakBisaDiperpanjang(loan);
    if (alasanDasar !== null) throw new Error(alasanDasar);
    const loanAman = loan as LoanRow;

    const menunggu = await permohonanTerakhir(ctx, loanId);
    if (menunggu !== null && menunggu.status === "diajukan") {
      throw new Error(
        "Masih ada permohonan yang menunggu keputusan. Selesaikan dulu sebelum mengajukan yang baru.",
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
      jenis: "perpanjangan_tenor",
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

/**
 * Ajukan permohonan dari dashboard nasabah.
 *
 * Nasabah hanya bisa mengajukan untuk pinjamannya sendiri. Permohonan masuk ke
 * antrean yang sama dengan usulan admin, jadi keputusan tetap satu pintu.
 */
export const ajukanPermohonanNasabah = mutation({
  args: {
    loanId: v.id("loans"),
    jenis: v.union(v.literal("perpanjangan_tenor"), v.literal("cicilan")),
    tambahanHari: v.optional(v.number()),
    usulanCicilan: v.optional(v.number()),
    alasan: v.string(),
  },
  handler: async (ctx, { loanId, jenis, tambahanHari, usulanCicilan, alasan }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
    const user = await ctx.db.get(userId);
    if (user === null) throw new Error("Pengguna tidak ditemukan.");
    if (user.isAnonymous === true) {
      throw new Error("Akun tamu hanya dapat melihat informasi.");
    }

    const loan = await bacaPinjaman(ctx, loanId);
    if (loan === null || loan.userId !== userId) {
      throw new Error("Pinjaman tidak ditemukan.");
    }

    const menunggu = await permohonanTerakhir(ctx, loanId);
    if (menunggu !== null && menunggu.status === "diajukan") {
      throw new Error(
        "Permohonan sebelumnya masih menunggu keputusan tim PINDAI. Kirim permohonan baru setelah yang ini diputuskan.",
      );
    }

    const sahAlasan = validasiAlasanRestrukturisasi(alasan);
    if (!sahAlasan.ok) throw new Error(sahAlasan.alasan);

    const label = user.name ?? user.email ?? "Nasabah";
    const now = Date.now();

    if (jenis === "perpanjangan_tenor") {
      const alasanDasar = alasanTidakBisaDiperpanjang(loan);
      if (alasanDasar !== null) throw new Error(alasanDasar);
      if (tambahanHari === undefined) {
        throw new Error("Pilih berapa hari perpanjangan yang diajukan.");
      }
      const sah = validasiPerpanjanganTenor({
        tenorLamaHari: loan.tenorHari,
        tambahanHari,
      });
      if (!sah.ok) throw new Error(sah.alasan);

      const id = await ctx.db.insert("restrukturisasiPinjaman", {
        loanId,
        userId,
        jenis,
        tenorLamaHari: loan.tenorHari,
        tenorBaruHari: sah.tenorBaruHari,
        tambahanHari,
        alasan: alasan.trim(),
        status: "diajukan",
        diajukanOlehUserId: userId,
        diajukanOlehLabel: label,
        diajukanOlehNasabah: true,
        dibuatPada: now,
      });

      await audit(
        ctx,
        userId,
        label,
        "permohonan_nasabah_diajukan",
        loan.nomorReferensi,
        `Nasabah mengajukan perpanjangan tenor ${loan.tenorHari} → ${sah.tenorBaruHari} hari (+${tambahanHari}) · ${alasan.trim()}`,
      );

      return {
        ok: true as const,
        id,
        jenis,
        tenorBaruHari: sah.tenorBaruHari,
        perkiraanJumlahCicilan: null,
      };
    }

    const alasanDasar = alasanTidakBisaDicicil(loan);
    if (alasanDasar !== null) throw new Error(alasanDasar);
    if (usulanCicilan === undefined) {
      throw new Error("Isi nominal cicilan yang ingin diajukan.");
    }
    const totalKewajiban = totalKewajibanPinjaman(loan);
    const sah = validasiUsulanCicilan({ usulanCicilan, totalKewajiban });
    if (!sah.ok) throw new Error(sah.alasan);

    const id = await ctx.db.insert("restrukturisasiPinjaman", {
      loanId,
      userId,
      jenis,
      tenorLamaHari: loan.tenorHari,
      tenorBaruHari: loan.tenorHari,
      tambahanHari: 0,
      usulanCicilan,
      alasan: alasan.trim(),
      status: "diajukan",
      diajukanOlehUserId: userId,
      diajukanOlehLabel: label,
      diajukanOlehNasabah: true,
      dibuatPada: now,
    });

    await audit(
      ctx,
      userId,
      label,
      "permohonan_nasabah_diajukan",
      loan.nomorReferensi,
      `Nasabah mengusulkan cicilan ${usulanCicilan.toLocaleString("id-ID")} rupiah per pembayaran (±${sah.perkiraanJumlahCicilan} kali) · ${alasan.trim()}`,
    );

    return {
      ok: true as const,
      id,
      jenis,
      tenorBaruHari: null,
      perkiraanJumlahCicilan: sah.perkiraanJumlahCicilan,
    };
  },
});

/** Setujui atau tolak permohonan; hanya perpanjangan yang menggeser tenor. */
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

    const loan = await bacaPinjaman(ctx, row.loanId);
    const perpanjangan = row.jenis === "perpanjangan_tenor";
    const alasanDasar = perpanjangan
      ? alasanTidakBisaDiperpanjang(loan)
      : alasanTidakBisaDicicil(loan);
    if (setuju && alasanDasar !== null) throw new Error(alasanDasar);

    const isiCatatan = catatan?.trim() ?? "";
    if (isiCatatan.length > 500) {
      throw new Error("Catatan keputusan maksimal 500 karakter.");
    }

    const label = user.email ?? user.name ?? "admin";
    const now = Date.now();
    const status: StatusRestrukturisasi = setuju ? "disetujui" : "ditolak";

    if (setuju && perpanjangan) {
      await ctx.db.patch(row.loanId, { tenorHari: row.tenorBaruHari });
    }

    await ctx.db.patch(row._id, {
      status,
      diputuskanOlehUserId: userId,
      diputuskanOlehLabel: label,
      diputuskanPada: now,
      catatanKeputusan: isiCatatan === "" ? undefined : isiCatatan,
    });

    const jenisLabel =
      LABEL_JENIS_RESTRUKTURISASI[row.jenis as JenisRestrukturisasi] ?? row.jenis;
    const catatanAkhir = isiCatatan === "" ? "" : ` Catatan: ${isiCatatan}`;
    let detail: string;
    if (!setuju) {
      detail = perpanjangan
        ? `Usulan perpanjangan tenor ${row.tambahanHari} hari ditolak. Tenor pinjaman tidak berubah.${catatanAkhir}`
        : `Usulan cicilan ${(row.usulanCicilan ?? 0).toLocaleString("id-ID")} rupiah per pembayaran ditolak. Jadwal pinjaman tidak berubah.${catatanAkhir}`;
    } else if (perpanjangan) {
      const jatuhTempoBaru = jatuhTempoSetelahPerpanjangan(
        loan?.didanaiPada ?? 0,
        row.tenorBaruHari,
      );
      detail = `Perpanjangan tenor ${row.tenorLamaHari} → ${row.tenorBaruHari} hari (+${row.tambahanHari}). Jatuh tempo bergeser ke ${new Date(jatuhTempoBaru).toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" })}. Pokok, bunga, dan total kewajiban tidak berubah.${catatanAkhir}`;
    } else {
      detail = `Usulan cicilan ${(row.usulanCicilan ?? 0).toLocaleString("id-ID")} rupiah per pembayaran disetujui sebagai kesepakatan. Jadwal dicatat tim di luar aplikasi.${catatanAkhir}`;
    }

    await audit(
      ctx,
      userId,
      label,
      setuju ? "restrukturisasi_disetujui" : "restrukturisasi_ditolak",
      loan?.nomorReferensi ?? row.loanId,
      detail,
    );

    return {
      ok: true as const,
      status,
      label: LABEL_STATUS_RESTRUKTURISASI[status],
      jenis: row.jenis,
      jenisLabel,
      tenorBaruHari: setuju && perpanjangan ? row.tenorBaruHari : null,
      usulanCicilan: row.usulanCicilan ?? null,
    };
  },
});
