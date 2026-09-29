import { getAuthUserId } from "@convex-dev/auth/server";
import { internalMutation, mutation, query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { requireAdminSession } from "./adminAuthz";
import { simpanTitik } from "./lokasi";
import { getConfig } from "./system";
import { batasRetensiMs, LOKASI_RETENSI, titikBolehDihapus } from "../lib/lokasi";
import type { LoanStatus } from "../lib/loan";

/**
 * Status pinjaman yang menahan bukti lokasinya: pinjaman belum selesai bisa
 * dipertanyakan (sengketa/audit), jadi jejaknya jangan dihapus dulu.
 * `lunas` dan `ditolak` tidak menahan apa pun.
 */
const STATUS_MENAHAN_BUKTI: ReadonlySet<LoanStatus> = new Set<LoanStatus>([
  "diajukan",
  "sedang_direview",
  "disetujui",
  "didanai",
]);

/** Gerbang admin untuk pembacaan riwayat lokasi oleh tim review. */
async function requireAdmin(ctx: QueryCtx) {
  await requireAdminSession(ctx);
}

/**
 * Pelacakan lokasi berkelanjutan Peminjam (opt-in).
 *
 * Privasi: hanya pemilik jejak yang bisa mendorong/membaca jejaknya;
 * admin membaca via query terpisah di admin.ts. Nonaktif menghentikan
 * penerimaan titik baru namun jejak lama tetap tersimpan (append-only).
 */

/** Status persetujuan tracking — satu baris per pengguna. */
export const getStatus = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
    const row = await ctx.db
      .query("trackingConsents")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    return {
      aktif: row?.aktif ?? false,
      disetujuiPada: row?.disetujuiPada,
      dinonaktifkanPada: row?.dinonaktifkanPada,
    };
  },
});

/** Setujui pelacakan berkelanjutan (opt-in eksplisit). */
export const setuju = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
    const existing = await ctx.db
      .query("trackingConsents")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        aktif: true,
        disetujuiPada: Date.now(),
        dinonaktifkanPada: undefined,
      });
    } else {
      await ctx.db.insert("trackingConsents", {
        userId,
        aktif: true,
        disetujuiPada: Date.now(),
      });
    }
    return { ok: true };
  },
});

/** Cabut persetujuan — push titik baru ditolak. */
export const cabut = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
    const existing = await ctx.db
      .query("trackingConsents")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        aktif: false,
        dinonaktifkanPada: Date.now(),
      });
    }
    return { ok: true };
  },
});

/**
 * Push satu titik GPS (perangkat memanggil tiap ±60 detik).
 *
 * Sejak gerbang lokasi wajib berlaku, jalur ini menumpang pemrosesan yang
 * sama dengan lokasi.catatLokasi: validasi wilayah Indonesia, cek akurasi,
 * proteksi lompatan mustahil, penulisan jejak, dan penyegaran status lokasi.
 * Persetujuan pemantauan kini tercatat otomatis (bukan lagi opt-in).
 */
export const pushTitik = mutation({
  args: {
    lat: v.number(),
    lng: v.number(),
    akurasi: v.number(),
    loanId: v.optional(v.id("loans")),
  },
  handler: async (ctx, { lat, lng, akurasi, loanId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
    await simpanTitik(ctx, userId, { lat, lng, akurasi, sumber: "web", loanId });
    return { ok: true };
  },
});

/** Riwayat titik milik sendiri (terbaru dulu, dibatasi). */
export const riwayatSaya = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
    const rows = await ctx.db
      .query("lokasiJejak")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(Math.min(limit ?? 100, 500));
    return rows;
  },
});

/** Titik terakhir (untuk status live di dashboard nasabah). */
export const terakhir = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
    const row = await ctx.db
      .query("lokasiJejak")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .first();
    return row;
  },
});

/**
 * Riwayat lokasi peminjam untuk tim review (admin) — 60 titik terakhir.
 * Akses terjaga admin: data lokasi sensitif.
 */
export const riwayatAdmin = query({
  args: { userId: v.id("users"), limit: v.optional(v.number()) },
  handler: async (ctx, { userId, limit }) => {
    await requireAdmin(ctx);
    const rows = await ctx.db
      .query("lokasiJejak")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(Math.min(limit ?? 60, 200));
    return rows.map((r) => ({
      _id: r._id,
      lat: r.lat,
      lng: r.lng,
      akurasi: r.akurasi,
      waktu: r.waktu,
    }));
  },
});

/**
 * Retensi jejak lokasi — dipanggil cron harian di crons.ts.
 *
 * Titik lokasi lama dihapus agar (a) penyimpanan tidak tumbuh tanpa batas dan
 * (b) sesuai minimalisasi data UU PDP. Umur retensinya dibaca dari Pengaturan
 * Sistem (`retensiLokasiHari`, admin bisa ubah; default 90 hari). Titik yang
 * menempel pada pinjaman yang masih berjalan ditahan minimal
 * `LOKASI_RETENSI.buktiPinjamanHari` (400 hari) karena masih menjadi bukti
 * audit — nilai admin yang lebih besar tetap dihormati.
 *
 * Dikerjakan per batch dari yang TERTUA (index `by_waktu`) supaya satu
 * transaksi tetap ringan; berhenti lebih awal bila sisa baris lama semuanya
 * ditahan, sehingga cron tidak mengulang-ulang baris yang sama tiap hari.
 */
export const bersihkanLokasiLama = internalMutation({
  args: {
    /** Override umur retensi (hari) — untuk uji/manual. Default kebijakan. */
    batasHari: v.optional(v.number()),
    /** Override ukuran batch (baris per putaran). */
    maksBaris: v.optional(v.number()),
  },
  handler: async (ctx, { batasHari, maksBaris }) => {
    const sekarang = Date.now();
    // Umur retensi = kebijakan admin; `batasHari` hanya untuk uji/jalan manual.
    const hari = batasHari ?? (await getConfig(ctx)).retensiLokasiHari;
    const batas = batasRetensiMs(sekarang, hari);
    const perBatch = Math.min(Math.max(maksBaris ?? LOKASI_RETENSI.batchBaris, 1), 500);

    let diperiksa = 0;
    let dihapus = 0;
    let dipertahankan = 0;

    for (let putaran = 0; putaran < LOKASI_RETENSI.maksBatch; putaran += 1) {
      const baris = await ctx.db
        .query("lokasiJejak")
        .withIndex("by_waktu", (q) => q.lt("waktu", batas))
        .order("asc")
        .take(perBatch);
      if (baris.length === 0) break;

      // Sekali baca per pinjaman yang disebut batch ini — hemat, dan cukup
      // karena keputusan menahan hanya bergantung pada status pinjaman.
      const idPinjaman = [
        ...new Set(baris.map((b) => b.loanId).filter((id) => id !== undefined)),
      ];
      const menahan = new Set<string>();
      for (const id of idPinjaman) {
        const loan = await ctx.db.get(id);
        if (loan !== null && STATUS_MENAHAN_BUKTI.has(loan.status)) {
          menahan.add(id);
        }
      }

      let dihapusPutaran = 0;
      for (const b of baris) {
        diperiksa += 1;
        const pinjamanAktif = b.loanId !== undefined && menahan.has(b.loanId);
        if (!titikBolehDihapus({ waktu: b.waktu, pinjamanAktif }, sekarang, hari)) {
          dipertahankan += 1;
          continue;
        }
        await ctx.db.delete(b._id);
        dihapus += 1;
        dihapusPutaran += 1;
      }

      // Sisa baris lama semuanya ditahan pinjaman berjalan: berhenti daripada
      // membaca batch yang sama berulang-ulang.
      if (dihapusPutaran === 0) break;
      if (baris.length < perBatch) break;
    }

    return { ok: true, diperiksa, dihapus, dipertahankan };
  },
});
