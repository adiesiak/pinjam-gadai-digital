import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import { quoteKreditBarang, type KreditBarangQuote } from "../lib/kredit";
import { ROLES, type KreditStatusValue } from "./schema";
import { audit, getConfig } from "./system";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";

/**
 * PINDAI — Skema C: KREDIT BARANG (elektronik & barang marketplace).
 *
 * Peminjam mengajukan pembelian barang dari merchant mitra (Shopee,
 * Tokopedia, toko elektronik, dll); sisa harga setelah uang muka dibiayai
 * Pendana dan dicicil bulanan. Rincian uang tidak pernah disimpan ganda —
 * selalu diturunkan dari (hargaBarang, dpPersen, tenorBulan,
 * marginPersenPerBulan) melalui quoteKreditBarang() di lib/kredit.ts.
 */

/** Gate: pengguna yang sudah masuk (sesi valid). */
async function penggunaMasuk(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
  const user = await ctx.db.get(userId);
  if (user === null) throw new Error("Pengguna tidak ditemukan.");
  return { userId, user };
}

/** Gate: Peminjam (akun Pendana tidak boleh mengajukan kredit barang). */
async function peminjamMasuk(ctx: QueryCtx) {
  const { userId, user } = await penggunaMasuk(ctx);
  if (user.role === ROLES.PENDANA) {
    throw new Error("Akun Pendana tidak dapat mengajukan. Gunakan akun Peminjam.");
  }
  return { userId, user };
}

/** Gate: admin (tim PINDAI) — untuk verifikasi pengajuan kredit barang. */
async function adminMasuk(ctx: QueryCtx) {
  const { userId, user } = await penggunaMasuk(ctx);
  if (user.role !== ROLES.ADMIN) {
    throw new Error("Hanya tim PINDAI (admin) yang dapat memverifikasi pengajuan.");
  }
  return userId;
}

/** Nomor referensi kredit barang — mis. KRD-20260927-7QK2. */
function nomorReferensiKredit(now: number): string {
  const tanggal = new Date(now).toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = Array.from({ length: 4 }, () =>
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".charAt(Math.floor(Math.random() * 32)),
  ).join("");
  return `KRD-${tanggal}-${suffix}`;
}

/** Ringkasan satu pengajuan kredit barang + rincian harga yang diturunkan. */
function ringkasKredit(row: Doc<"kreditBarang">) {
  let quote: KreditBarangQuote | null = null;
  try {
    quote = quoteKreditBarang({
      hargaBarang: row.hargaBarang,
      dpPersen: row.dpPersen,
      tenorBulan: row.tenorBulan,
      marginPersenPerBulan: row.marginPersenPerBulan,
    });
  } catch {
    // Baris warisan di luar rentang skema saat ini: tampilkan tanpa rincian.
    quote = null;
  }

  return {
    _id: row._id,
    _creationTime: row._creationTime,
    nomorReferensi: row.nomorReferensi,
    namaBarang: row.namaBarang,
    kategori: row.kategori,
    merchant: row.merchant,
    tautanBarang: row.tautanBarang ?? null,
    hargaBarang: row.hargaBarang,
    dpPersen: row.dpPersen,
    tenorBulan: row.tenorBulan,
    marginPersenPerBulan: row.marginPersenPerBulan,
    status: row.status,
    catatanReview: row.catatanReview ?? null,
    catatanPeminjam: row.catatanPeminjam ?? null,
    // ===== Rincian turunan (engine yang sama dengan kalkulator Pendana) =====
    dp: quote?.dp ?? null,
    pokokDibiayai: quote?.pokokDibiayai ?? null,
    biayaLayanan: quote?.biayaLayanan ?? null,
    cicilanPerBulan: quote?.cicilanPerBulan ?? null,
    cicilanTerakhir: quote?.cicilanTerakhir ?? null,
    imbalHasilPendana: quote?.marginTotal ?? null,
    totalDibayarKonsumen: quote?.totalDibayarKonsumen ?? null,
    persenImbalHasil: quote?.persenImbalHasil ?? null,
  };
}

// =====================================================================
// Sisi Peminjam
// =====================================================================

/**
 * Ajukan kredit barang. Validasi harga, DP, tenor, dan margin memakai engine
 * yang sama dengan kalkulator Pendana — angka tidak pernah diterima dari klien.
 */
export const ajukanKreditBarang = mutation({
  args: {
    namaBarang: v.string(),
    kategori: v.string(),
    merchant: v.string(),
    tautanBarang: v.optional(v.string()),
    hargaBarang: v.number(),
    dpPersen: v.number(),
    tenorBulan: v.number(),
    marginPersenPerBulan: v.number(),
    // ===== Data pemohon =====
    namaLengkap: v.string(),
    nik: v.string(),
    nomorRekening: v.string(),
    nomorWhatsApp: v.string(),
    catatanPeminjam: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, user } = await peminjamMasuk(ctx);

    // Kill switch: blokir seluruh pengajuan baru saat darurat.
    const sys = await getConfig(ctx);
    if (sys.killSwitch) {
      throw new Error(
        "Pengajuan sementara dihentikan oleh sistem (kill switch aktif). Coba lagi nanti.",
      );
    }

    // Validasi batas skema + hitung rincian (melempar pesan Indonesia yang jelas).
    const quote = quoteKreditBarang({
      hargaBarang: args.hargaBarang,
      dpPersen: args.dpPersen,
      tenorBulan: args.tenorBulan,
      marginPersenPerBulan: args.marginPersenPerBulan,
    });

    const namaBarang = args.namaBarang.trim();
    if (namaBarang.length < 3) {
      throw new Error("Nama barang wajib diisi (minimal 3 karakter).");
    }
    const merchant = args.merchant.trim();
    if (merchant.length < 3) {
      throw new Error("Isi sumber barang, mis. Shopee, Tokopedia, atau toko mitra.");
    }
    let tautan: string | undefined;
    if (args.tautanBarang !== undefined && args.tautanBarang.trim() !== "") {
      const t = args.tautanBarang.trim();
      if (!/^https?:\/\/\S+$/i.test(t)) {
        throw new Error("Tautan barang harus diawali http:// atau https://.");
      }
      tautan = t;
    }

    const nama = args.namaLengkap.trim();
    if (nama.length < 3) {
      throw new Error("Nama lengkap wajib diisi (minimal 3 karakter).");
    }
    const nik = args.nik.replace(/\s+/g, "");
    if (!/^\d{16}$/.test(nik)) {
      throw new Error("NIK harus 16 digit angka sesuai KTP.");
    }
    const rekening = args.nomorRekening.trim().replace(/\s+/g, "");
    if (!/^\d{6,20}$/.test(rekening)) {
      throw new Error("Nomor rekening harus 6–20 digit angka.");
    }
    const wa = args.nomorWhatsApp.replace(/[\s+-]/g, "");
    if (!/^62\d{8,13}$/.test(wa)) {
      throw new Error(
        "Nomor WhatsApp wajib format internasional 62… (mis. 6281234567890).",
      );
    }

    // Peminjam tanpa role eksplisit dipromosikan seperti pada pengajuan pinjaman.
    if (user.role === undefined) {
      await ctx.db.patch(userId, { role: ROLES.PEMINJAM });
    }

    const now = Date.now();
    const referensi = nomorReferensiKredit(now);
    const kreditId = await ctx.db.insert("kreditBarang", {
      userId,
      nomorReferensi: referensi,
      namaBarang,
      kategori: args.kategori.trim() || "Lainnya",
      merchant,
      tautanBarang: tautan,
      hargaBarang: quote.hargaBarang,
      dpPersen: args.dpPersen,
      tenorBulan: args.tenorBulan,
      marginPersenPerBulan: args.marginPersenPerBulan,
      status: "diajukan",
      namaLengkap: nama,
      nik,
      nomorRekening: rekening,
      nomorWhatsApp: wa,
      catatanPeminjam: args.catatanPeminjam?.trim() || undefined,
    });

    return {
      appId: kreditId,
      nomorReferensi: referensi,
      dp: quote.dp,
      pokokDibiayai: quote.pokokDibiayai,
      cicilanPerBulan: quote.cicilanPerBulan,
      totalDibayarKonsumen: quote.totalDibayarKonsumen,
    };
  },
});

/** Daftar pengajuan kredit barang milik Peminjam (terbaru lebih dulu). */
export const kreditSaya = query({
  args: {},
  handler: async (ctx) => {
    const { userId } = await peminjamMasuk(ctx);
    const rows = await ctx.db
      .query("kreditBarang")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return rows.sort((a, b) => b._creationTime - a._creationTime).map(ringkasKredit);
  },
});

// =====================================================================
// Sisi Admin — verifikasi pengajuan
// =====================================================================

/** Seluruh pengajuan kredit barang + identitas pemohon (khusus admin). */
export const antreanKreditBarang = query({
  args: {},
  handler: async (ctx) => {
    await adminMasuk(ctx);
    const rows = await ctx.db.query("kreditBarang").collect();
    const hasil = [];
    for (const row of rows.sort((a, b) => b._creationTime - a._creationTime)) {
      const pemohon = await ctx.db.get(row.userId);
      hasil.push({
        ...ringkasKredit(row),
        namaLengkap: row.namaLengkap,
        nik: row.nik,
        nomorRekening: row.nomorRekening,
        nomorWhatsApp: row.nomorWhatsApp,
        emailPemohon: pemohon?.email ?? null,
      });
    }
    return hasil;
  },
});

/** Pindahkan status pengajuan kredit barang — hanya admin, tercatat di audit. */
async function setKreditStatus(
  ctx: MutationCtx,
  kreditId: Id<"kreditBarang">,
  status: KreditStatusValue,
  catatan?: string,
) {
  const adminId = await adminMasuk(ctx);
  const row = await ctx.db.get(kreditId);
  if (row === null) throw new Error("Pengajuan kredit barang tidak ditemukan.");
  if (status === "diajukan") {
    throw new Error("Status tidak boleh dikembalikan ke diajukan.");
  }
  if (status === "ditolak" && (!catatan || catatan.trim().length === 0)) {
    throw new Error("Penolakan wajib menyertakan alasan.");
  }
  if (row.status === status) {
    throw new Error("Status pengajuan sudah sama dengan pilihan tersebut.");
  }

  await ctx.db.patch(kreditId, {
    status,
    catatanReview: catatan?.trim() || undefined,
  });

  const admin = await ctx.db.get(adminId);
  await audit(
    ctx,
    adminId,
    admin?.email ?? admin?.name ?? "admin",
    `kredit_${status}`,
    row.nomorReferensi,
    `${row.namaLengkap} — ${row.namaBarang} (${row.merchant}) — ${status}${catatan ? `: ${catatan}` : ""}`,
  );
}

export const tandaiKreditDitinjau = mutation({
  args: { kreditId: v.id("kreditBarang") },
  handler: (ctx, args) => setKreditStatus(ctx, args.kreditId, "sedang_ditinjau"),
});

export const setujuiKreditBarang = mutation({
  args: { kreditId: v.id("kreditBarang") },
  handler: (ctx, args) => setKreditStatus(ctx, args.kreditId, "disetujui"),
});

export const tolakKreditBarang = mutation({
  args: { kreditId: v.id("kreditBarang"), reason: v.string() },
  handler: (ctx, args) => setKreditStatus(ctx, args.kreditId, "ditolak", args.reason),
});
