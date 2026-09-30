import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import {
  bagiCicilanKePendana,
  KREDIT_BARANG_POKOK_MAKS,
  KREDIT_TENOR_PENGAJUAN_OPTIONS,
  pokokKreditBarangDalamBatas,
  quoteKreditBarang,
  type KreditBarangQuote,
} from "../lib/kredit";
import { ROLES, type KreditStatusValue } from "./schema";
import { requireAdminSession } from "./adminAuthz";
import { audit, getConfig } from "./system";
import { requireGerbangLokasi } from "./lokasi";
import { ensureKodePeminjam } from "./peminjamCode";
import { formatRupiah } from "../lib/money";
import { rejectUnverifiedMoneyMovement } from "./paymentGuard";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";

/** Gate: pengguna yang sudah masuk (sesi valid). */
async function penggunaMasuk(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
  const user = await ctx.db.get(userId);
  if (user === null) throw new Error("Pengguna tidak ditemukan.");
  if (user.isAnonymous === true) {
    throw new Error("Akun tamu hanya dapat melihat informasi. Masuk dengan akun terverifikasi untuk mengakses data dan transaksi.");
  }
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
  return (await requireAdminSession(ctx)).userId;
}

/** Nomor referensi kredit barang — mis. KRD-20260927-7QK2. */
function nomorReferensiKredit(now: number): string {
  const tanggal = new Date(now).toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = Array.from({ length: 4 }, () =>
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".charAt(Math.floor(Math.random() * 32)),
  ).join("");
  return `KRD-${tanggal}-${suffix}`;
}

/** Ringkasan satu pengajuan kredit barang + rincian yang diturunkan dari pricing engine. */
function ringkasKredit(row: Doc<"kreditBarang">, dibayarBulan = 0) {
  let quote: KreditBarangQuote | null = null;
  try {
    quote = quoteKreditBarang({
      hargaBarang: row.hargaBarang,
      dpPersen: row.dpPersen,
      tenorBulan: row.tenorBulan,
      marginPersenPerBulan: row.marginPersenPerBulan,
    });
  } catch {
    quote = null;
  }

  let sisaPokokKredit = 0;
  let kewajibanSisa = 0;
  let cicilanBerikut: { bulan: number; pokok: number; margin: number; total: number } | null = null;
  if (quote !== null) {
    for (const r of quote.jadwal) {
      if (r.bulan > dibayarBulan) {
        sisaPokokKredit += r.pokok;
        kewajibanSisa += r.total;
      }
    }
    const berikut = quote.jadwal[dibayarBulan];
    if (berikut !== undefined) {
      cicilanBerikut = { bulan: berikut.bulan, pokok: berikut.pokok, margin: berikut.margin, total: berikut.total };
    }
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
    dibayarBulan,
    totalBulan: row.tenorBulan,
    sisaPokokKredit,
    kewajibanSisa,
    cicilanBerikut,
    dp: quote?.dp ?? null,
    pokokDibiayai: quote?.pokokDibiayai ?? null,
    biayaLayanan: quote?.biayaLayanan ?? null,
    biayaAdmin: quote?.biayaAdmin ?? null,
    biayaPlatform: quote?.biayaPlatform ?? null,
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

/** Ajukan kredit barang. Nilai final selalu divalidasi dan dihitung server-side. */
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
    namaLengkap: v.string(),
    nik: v.string(),
    nomorRekening: v.string(),
    nomorWhatsApp: v.string(),
    catatanPeminjam: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, user } = await peminjamMasuk(ctx);
    await requireGerbangLokasi(ctx, userId, user);
    const sys = await getConfig(ctx);
    if (sys.killSwitch) throw new Error("Pengajuan sementara dihentikan oleh sistem (kill switch aktif). Coba lagi nanti.");
    if (!(KREDIT_TENOR_PENGAJUAN_OPTIONS as readonly number[]).includes(args.tenorBulan)) {
      throw new Error(`Tenor kredit barang baru harus ${KREDIT_TENOR_PENGAJUAN_OPTIONS.join(" / ")} bulan (maksimal 6 bulan).`);
    }
    const quote = quoteKreditBarang({
      hargaBarang: args.hargaBarang,
      dpPersen: args.dpPersen,
      tenorBulan: args.tenorBulan,
      marginPersenPerBulan: args.marginPersenPerBulan,
    });
    if (!pokokKreditBarangDalamBatas(quote.pokokDibiayai)) {
      throw new Error(`Pokok dibiayai kredit barang maksimal ${formatRupiah(KREDIT_BARANG_POKOK_MAKS)}.`);
    }
    const namaBarang = args.namaBarang.trim();
    if (namaBarang.length < 3) throw new Error("Nama barang wajib diisi (minimal 3 karakter).");
    const merchant = args.merchant.trim();
    if (merchant.length < 3) throw new Error("Isi sumber barang, mis. Shopee, Tokopedia, atau toko mitra.");
    let tautan: string | undefined;
    if (args.tautanBarang !== undefined && args.tautanBarang.trim() !== "") {
      const t = args.tautanBarang.trim();
      if (!/^https?:\/\/\S+$/i.test(t)) throw new Error("Tautan barang harus diawali http:// atau https://.");
      tautan = t;
    }
    const nama = args.namaLengkap.trim();
    if (nama.length < 3) throw new Error("Nama lengkap wajib diisi (minimal 3 karakter).");
    const nik = args.nik.replace(/\s+/g, "");
    if (!/^\d{16}$/.test(nik)) throw new Error("NIK harus 16 digit angka sesuai KTP.");
    const rekening = args.nomorRekening.trim().replace(/\s+/g, "");
    if (!/^\d{6,20}$/.test(rekening)) throw new Error("Nomor rekening harus 6–20 digit angka.");
    const wa = args.nomorWhatsApp.replace(/[\s+-]/g, "");
    if (!/^62\d{8,13}$/.test(wa)) throw new Error("Nomor WhatsApp wajib format internasional 62… (mis. 6281234567890).");

    if (user.role === undefined) await ctx.db.patch(userId, { role: ROLES.PEMINJAM });
    await ensureKodePeminjam(ctx, userId);
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
    const rows = await ctx.db.query("kreditBarang").withIndex("by_user", (q) => q.eq("userId", userId)).collect();
    const hasil = [];
    for (const row of rows.sort((a, b) => b._creationTime - a._creationTime)) {
      const payments = await ctx.db.query("kreditPayments").withIndex("by_kredit", (q) => q.eq("kreditId", row._id)).collect();
      hasil.push(ringkasKredit(row, payments.length));
    }
    return hasil;
  },
});

/** Cicilan tidak dicatat sebelum settlement pembayaran yang tervalidasi. */
export const bayarCicilanKredit = mutation({
  args: { kreditId: v.id("kreditBarang") },
  handler: async (ctx) => {
    await peminjamMasuk(ctx);
    rejectUnverifiedMoneyMovement();
  },
});

/** Seluruh pengajuan kredit barang + identitas pemohon (khusus admin). */
export const antreanKreditBarang = query({
  args: {},
  handler: async (ctx) => {
    await adminMasuk(ctx);
    const rows = await ctx.db.query("kreditBarang").collect();
    const hasil = [];
    for (const row of rows.sort((a, b) => b._creationTime - a._creationTime)) {
      const pemohon = await ctx.db.get(row.userId);
      const payments = await ctx.db.query("kreditPayments").withIndex("by_kredit", (q) => q.eq("kreditId", row._id)).collect();
      hasil.push({
        ...ringkasKredit(row, payments.length),
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
async function setKreditStatus(ctx: MutationCtx, kreditId: Id<"kreditBarang">, status: KreditStatusValue, catatan?: string) {
  const adminId = await adminMasuk(ctx);
  const row = await ctx.db.get(kreditId);
  if (row === null) throw new Error("Pengajuan kredit barang tidak ditemukan.");
  if (status === "diajukan") throw new Error("Status tidak boleh dikembalikan ke diajukan.");
  if (status === "didanai") throw new Error("Status Didanai ditetapkan otomatis oleh sistem saat pendanaan Pendana terpenuhi penuh.");
  if (status === "lunas") throw new Error("Status Lunas ditetapkan otomatis oleh sistem saat cicilan terakhir dibayar.");
  if (status === "ditolak" && (!catatan || catatan.trim().length === 0)) throw new Error("Penolakan wajib menyertakan alasan.");
  if (row.status === status) throw new Error("Status pengajuan sudah sama dengan pilihan tersebut.");
  if (status === "ditolak") {
    const fundings = await ctx.db.query("kreditFundings").withIndex("by_kredit", (q) => q.eq("kreditId", kreditId)).collect();
    if (fundings.some((f) => f.status === "dialokasikan")) {
      throw new Error("Pengajuan sudah menerima Alokasi Dana Pendana — kembalikan dana tersebut sebelum menolak.");
    }
  }
  if (status === "disetujui") await ensureKodePeminjam(ctx, row.userId);
  await ctx.db.patch(kreditId, { status, catatanReview: catatan?.trim() || undefined });
  const admin = await ctx.db.get(adminId);
  await audit(ctx, adminId, admin?.email ?? admin?.name ?? "admin", `kredit_${status}`, row.nomorReferensi, `${row.namaLengkap} — ${row.namaBarang} (${row.merchant}) — ${status}${catatan ? `: ${catatan}` : ""}`);
}

export const tandaiKreditDitinjau = mutation({ args: { kreditId: v.id("kreditBarang") }, handler: (ctx, args) => setKreditStatus(ctx, args.kreditId, "sedang_ditinjau") });
export const setujuiKreditBarang = mutation({ args: { kreditId: v.id("kreditBarang") }, handler: (ctx, args) => setKreditStatus(ctx, args.kreditId, "disetujui") });
export const tolakKreditBarang = mutation({ args: { kreditId: v.id("kreditBarang"), reason: v.string() }, handler: (ctx, args) => setKreditStatus(ctx, args.kreditId, "ditolak", args.reason) });

/** Super Admin menghapus pengajuan kredit barang yang salah input tanpa jejak transaksi. */
export const hapusKreditBarang = mutation({
  args: { kreditId: v.id("kreditBarang"), reason: v.string() },
  handler: async (ctx, { kreditId, reason }) => {
    const adminId = await adminMasuk(ctx);
    const alasan = reason.trim();
    if (alasan.length < 10 || alasan.length > 500) throw new Error("Alasan penghapusan wajib 10–500 karakter.");
    const row = await ctx.db.get(kreditId);
    if (row === null) throw new Error("Data kredit barang tidak ditemukan.");
    if (row.status === "didanai" || row.status === "lunas" || row.didanaiPada !== undefined || row.lunasPada !== undefined) {
      throw new Error("Kredit ini sudah masuk siklus pendanaan/pelunasan dan tidak dapat dihapus.");
    }
    const [payments, fundings, ledger] = await Promise.all([
      ctx.db.query("kreditPayments").withIndex("by_kredit", (q) => q.eq("kreditId", kreditId)).collect(),
      ctx.db.query("kreditFundings").withIndex("by_kredit", (q) => q.eq("kreditId", kreditId)).collect(),
      ctx.db.query("ledger_entries").withIndex("by_akun", (q) => q.eq("akun", `kredit:${kreditId}`)).first(),
    ]);
    if (payments.length > 0 || fundings.length > 0 || ledger !== null) throw new Error("Data kredit memiliki alokasi, pembayaran, atau jurnal terkait; tidak dihapus agar riwayat tetap utuh.");
    const admin = await ctx.db.get(adminId);
    await audit(ctx, adminId, admin?.email ?? admin?.name ?? "admin", "kredit_delete", row.nomorReferensi, `${row.namaLengkap} — ${row.namaBarang} (${row.merchant}), status ${row.status}; alasan: ${alasan}`);
    await ctx.db.delete(kreditId);
    return { ok: true };
  },
});
