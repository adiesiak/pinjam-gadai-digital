import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { requireAdminSession } from "./adminAuthz";
import {
  DEFAULT_CONFIG,
  RETENSI_LOKASI_BATAS,
  THEME_PRESETS,
  type SystemConfig,
  type ThemePreset,
} from "../lib/system-config";
import { clampPlafon } from "../lib/plafon";
import type { Id } from "./_generated/dataModel";

/**
 * Konfigurasi sistem, kill switch, snapshot data, dan audit trail.
 * Semua aksi tulis dicatat ke auditLog (append-only).
 */

export const SYSTEM_SLOT = "global";

export { DEFAULT_CONFIG };
export type { SystemConfig };

async function requireAdmin(ctx: QueryCtx) {
  return requireAdminSession(ctx);
}

/** Tulis satu baris audit trail (append-only). */
export async function audit(
  ctx: MutationCtx,
  aktorUserId: unknown,
  aktorLabel: string,
  aksi: string,
  target?: string,
  detail?: string,
): Promise<void> {
  await ctx.db.insert("auditLog", {
    aktorUserId: typeof aktorUserId === "string" ? (aktorUserId as never) : undefined,
    aktorLabel,
    aksi,
    target,
    detail,
    waktu: Date.now(),
  });
}

/** Baca konfigurasi (fallback default bila belum pernah disimpan). */
export async function getConfig(ctx: QueryCtx): Promise<SystemConfig> {
  const row = await ctx.db
    .query("systemConfig")
    .withIndex("by_slot", (q) => q.eq("slot", SYSTEM_SLOT))
    .first();
  if (row === null) return { ...DEFAULT_CONFIG };
  return {
    tema: row.tema ?? DEFAULT_CONFIG.tema,
    killSwitch: row.killSwitch ?? DEFAULT_CONFIG.killSwitch,
    maintenanceMode: row.maintenanceMode ?? DEFAULT_CONFIG.maintenanceMode,
    persenAdmin: row.persenAdmin ?? DEFAULT_CONFIG.persenAdmin,
    persenPlatform: row.persenPlatform ?? DEFAULT_CONFIG.persenPlatform,
    persenBunga: row.persenBunga ?? DEFAULT_CONFIG.persenBunga,
    persenBiayaIntegrasi:
      row.persenBiayaIntegrasi ?? DEFAULT_CONFIG.persenBiayaIntegrasi,
    maxLtvPersen: row.maxLtvPersen ?? DEFAULT_CONFIG.maxLtvPersen,
    sessionTimeoutMenit: row.sessionTimeoutMenit ?? DEFAULT_CONFIG.sessionTimeoutMenit,
    vaultLat: row.vaultLat ?? DEFAULT_CONFIG.vaultLat,
    vaultLng: row.vaultLng ?? DEFAULT_CONFIG.vaultLng,
    gpsMismatchKm: row.gpsMismatchKm ?? DEFAULT_CONFIG.gpsMismatchKm,
    pencairanMaxKm: row.pencairanMaxKm ?? DEFAULT_CONFIG.pencairanMaxKm,
    lokasiWajib: row.lokasiWajib ?? DEFAULT_CONFIG.lokasiWajib,
    lokasiMaxUmurMenit: row.lokasiMaxUmurMenit ?? DEFAULT_CONFIG.lokasiMaxUmurMenit,
    wajibAplikasiNative: row.wajibAplikasiNative ?? DEFAULT_CONFIG.wajibAplikasiNative,
    retensiLokasiHari: row.retensiLokasiHari ?? DEFAULT_CONFIG.retensiLokasiHari,
    plafonPinjaman: row.plafonPinjaman ?? DEFAULT_CONFIG.plafonPinjaman,
    rekeningUsahaNama: row.rekeningUsahaNama ?? DEFAULT_CONFIG.rekeningUsahaNama,
    rekeningUsahaBank: row.rekeningUsahaBank ?? DEFAULT_CONFIG.rekeningUsahaBank,
    rekeningUsahaNomor: row.rekeningUsahaNomor ?? DEFAULT_CONFIG.rekeningUsahaNomor,
    qrisMerchantNama: row.qrisMerchantNama ?? DEFAULT_CONFIG.qrisMerchantNama,
    qrisImageId: row.qrisImageId ?? null,
    manualDepositEnabled: row.manualDepositEnabled ?? DEFAULT_CONFIG.manualDepositEnabled,
  };
}

/** Instruksi penerimaan manual untuk pengguna terautentikasi; tidak menyertakan rahasia. */
export const getPaymentInstructions = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
    const row = await ctx.db
      .query("systemConfig")
      .withIndex("by_slot", (q) => q.eq("slot", SYSTEM_SLOT))
      .first();
    const namaRekening = row?.rekeningUsahaNama ?? DEFAULT_CONFIG.rekeningUsahaNama;
    const namaBank = row?.rekeningUsahaBank ?? DEFAULT_CONFIG.rekeningUsahaBank;
    const nomorRekening = row?.rekeningUsahaNomor ?? DEFAULT_CONFIG.rekeningUsahaNomor;
    const qrisUrl = row?.qrisImageId ? await ctx.storage.getUrl(row.qrisImageId) : null;
    const setoranManualAktif = row?.manualDepositEnabled === true;
    return {
      namaRekening,
      namaBank,
      nomorRekening,
      namaMerchantQris: row?.qrisMerchantNama ?? DEFAULT_CONFIG.qrisMerchantNama,
      qrisUrl,
      tersedia: Boolean(namaRekening && namaBank && nomorRekening),
      setoranManualAktif,
    };
  },
});

/** Preset tema publik saja; tidak mengekspos konfigurasi operasional. */
export const getThemePublic = query({
  args: {},
  handler: async (ctx) => ({ tema: (await getConfig(ctx)).tema }),
});

/** Konfigurasi untuk semua pengguna ter-autentikasi (status kill switch & maintenance). */
export const getStatusPublic = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const cfg = await getConfig(ctx);
    return {
      killSwitch: cfg.killSwitch,
      maintenanceMode: cfg.maintenanceMode,
      // Gerbang lokasi dibaca dashboard Peminjam sebelum meminta GPS.
      lokasiWajib: cfg.lokasiWajib,
      lokasiMaxUmurMenit: cfg.lokasiMaxUmurMenit,
      wajibAplikasiNative: cfg.wajibAplikasiNative,
    };
  },
});

/** Konfigurasi lengkap + label pelaku — admin. */
export const getConfigAdmin = query({
  args: {},
  handler: async (ctx) => {
    const { userId, user } = await requireAdmin(ctx);
    const cfg = await getConfig(ctx);
    return {
      config: cfg,
      qrisUrl: cfg.qrisImageId ? await ctx.storage.getUrl(cfg.qrisImageId) : null,
      auditTerbaru: await ctx.db.query("auditLog").withIndex("by_waktu").order("desc").take(10),
      diperbaruiOleh: user.email ?? user.name ?? "admin",
      _me: userId,
    };
  },
});

/** Simpan konfigurasi — mencatat audit + deteksi perubahan kill switch. */
export const saveConfig = mutation({
  args: {
    tema: v.union(v.literal("tinta"), v.literal("pesisir"), v.literal("terakota")),
    killSwitch: v.boolean(),
    maintenanceMode: v.boolean(),
    persenAdmin: v.number(),
    persenPlatform: v.number(),
    persenBunga: v.number(),
    persenBiayaIntegrasi: v.number(),
    maxLtvPersen: v.number(),
    sessionTimeoutMenit: v.number(),
    vaultLat: v.number(),
    vaultLng: v.number(),
    gpsMismatchKm: v.number(),
    pencairanMaxKm: v.number(),
    lokasiWajib: v.boolean(),
    lokasiMaxUmurMenit: v.number(),
    wajibAplikasiNative: v.boolean(),
    retensiLokasiHari: v.number(),
    plafonPinjaman: v.number(),
    rekeningUsahaNama: v.optional(v.string()),
    rekeningUsahaBank: v.optional(v.string()),
    rekeningUsahaNomor: v.optional(v.string()),
    qrisMerchantNama: v.optional(v.string()),
    qrisImageId: v.optional(v.union(v.id("_storage"), v.null())),
    manualDepositEnabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { userId, user } = await requireAdmin(ctx);
    if (
      args.persenAdmin < 0 ||
      args.persenPlatform < 0 ||
      args.persenBunga < 0 ||
      args.persenBiayaIntegrasi < 0
    ) {
      throw new Error("Persentase biaya/bunga tidak boleh negatif.");
    }
    if (args.persenBiayaIntegrasi > 100) {
      throw new Error("Biaya integrasi pinjaman lama tidak boleh lebih dari 100%.");
    }
    if (!Number.isSafeInteger(args.lokasiMaxUmurMenit) || args.lokasiMaxUmurMenit < 1) {
      throw new Error("Batas umur lokasi harus minimal 1 menit.");
    }
    if (args.maxLtvPersen <= 0 || args.maxLtvPersen > 100) {
      throw new Error("LTV maksimum harus di antara 1–100%.");
    }
    if (
      !Number.isSafeInteger(args.retensiLokasiHari) ||
      args.retensiLokasiHari < RETENSI_LOKASI_BATAS.min ||
      args.retensiLokasiHari > RETENSI_LOKASI_BATAS.maks
    ) {
      throw new Error(
        `Retensi jejak lokasi harus ${RETENSI_LOKASI_BATAS.min}–${RETENSI_LOKASI_BATAS.maks} hari.`,
      );
    }
    // Plafon global: disimpan ter-clamp (bukan ditolak) supaya tetap sah.
    args.plafonPinjaman = clampPlafon(args.plafonPinjaman);
    const nomorUsaha = (args.rekeningUsahaNomor ?? "").trim();
    const digitsOnly = Array.from(nomorUsaha).every((character) => character >= "0" && character <= "9");
    if (nomorUsaha !== "" && (nomorUsaha.length < 6 || nomorUsaha.length > 20 || !digitsOnly)) {
      throw new Error("Nomor rekening usaha harus 6–20 digit angka.");
    }
    args.rekeningUsahaNama = args.rekeningUsahaNama?.trim() ?? "";
    args.rekeningUsahaBank = args.rekeningUsahaBank?.trim() ?? "";
    args.rekeningUsahaNomor = nomorUsaha;
    args.qrisMerchantNama = args.qrisMerchantNama?.trim() ?? "";
    if (args.qrisImageId) {
      const metadata = await ctx.storage.getMetadata(args.qrisImageId);
      if (!metadata || metadata.size > 5_000_000 ||
        !["image/jpeg", "image/png", "image/webp"].includes(metadata.contentType ?? "")) {
        throw new Error("QRIS harus berupa gambar JPG, PNG, atau WebP maksimal 5 MB.");
      }
    }
    const label = user.email ?? user.name ?? "admin";
    const prev = await getConfig(ctx);
    const existing = await ctx.db
      .query("systemConfig")
      .withIndex("by_slot", (q) => q.eq("slot", SYSTEM_SLOT))
      .first();
    const patch = { slot: SYSTEM_SLOT, ...args, diperbaruiPada: Date.now() };
    if (existing === null) {
      await ctx.db.insert("systemConfig", patch);
    } else {
      await ctx.db.patch(existing._id, patch);
    }
    await audit(
      ctx,
      userId,
      label,
      args.killSwitch !== prev.killSwitch ? "kill_switch" : "ubah_config",
      "systemConfig",
      args.killSwitch !== prev.killSwitch
        ? `Kill switch ${args.killSwitch ? "DIAKTIFKAN" : "DINONAKTIFKAN"}`
        : "Konfigurasi sistem diperbarui",
    );
    return { ok: true };
  },
});

/** URL unggahan gambar QRIS; hanya admin aktif yang dapat memintanya. */
export const generatePaymentAssetUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/** Pilih template/tema visual website untuk seluruh pengunjung. */
export const setWebsiteTemplate = mutation({
  args: { tema: v.union(v.literal("tinta"), v.literal("pesisir"), v.literal("terakota")) },
  handler: async (ctx, { tema }) => {
    const { userId, user } = await requireAdmin(ctx);
    if (!(THEME_PRESETS as readonly string[]).includes(tema)) {
      throw new Error("Template website tidak valid.");
    }
    const existing = await ctx.db
      .query("systemConfig")
      .withIndex("by_slot", (q) => q.eq("slot", SYSTEM_SLOT))
      .first();
    if (existing === null) {
      await ctx.db.insert("systemConfig", {
        slot: SYSTEM_SLOT,
        tema: tema as ThemePreset,
        diperbaruiPada: Date.now(),
      });
    } else {
      await ctx.db.patch(existing._id, { tema: tema as ThemePreset, diperbaruiPada: Date.now() });
    }
    await audit(
      ctx,
      userId,
      user.email ?? user.name ?? "admin",
      "template_website",
      "Website publik",
      `Template warna website diubah menjadi ${tema}.`,
    );
    return { ok: true };
  },
});

/** Toggle cepat kill switch (tombol merah di header). */
export const setKillSwitch = mutation({
  args: { aktif: v.boolean() },
  handler: async (ctx, { aktif }) => {
    const { userId, user } = await requireAdmin(ctx);
    const existing = await ctx.db
      .query("systemConfig")
      .withIndex("by_slot", (q) => q.eq("slot", SYSTEM_SLOT))
      .first();
    const base = existing ?? { slot: SYSTEM_SLOT, diperbaruiPada: 0 };
    if (existing === null) {
      await ctx.db.insert("systemConfig", {
        ...base,
        killSwitch: aktif,
        diperbaruiPada: Date.now(),
      });
    } else {
      await ctx.db.patch(existing._id, { killSwitch: aktif, diperbaruiPada: Date.now() });
    }
    await audit(
      ctx,
      userId,
      user.email ?? user.name ?? "admin",
      "kill_switch",
      "systemConfig",
      `Emergency kill switch ${aktif ? "DIAKTIFKAN" : "DINONAKTIFKAN"}`,
    );
    return { ok: true };
  },
});

/**
 * Snapshot LENGKAP seluruh data operasional + dokumen — unduh JSON (admin saja).
 *
 * Memuat semua koleksi transaksi (pinjaman, gadai, kredit barang, pembayaran
 * cicilan gadai/kredit, pendanaan, setoran, penarikan, transfer pendana, bukti
 * pembayaran, log WA, jejak lokasi, pengingat, peringatan lokasi, pengumuman,
 * ledger, audit) dan seluruh baris `users` apa adanya, plus daftar dokumen
 * storage (KTP, selfie, slip gaji, foto barang, bukti setoran/pembayaran, QRIS)
 * dengan URL bertanda tangan agar berkas ikut tercakup. BERISI DATA PRIBADI —
 * perlakuan sebagai rahasia.
 */
export const snapshotData = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const [
      loans,
      pawns,
      kreditBarang,
      pawnPayments,
      kreditPayments,
      deposits,
      fundings,
      kreditFundings,
      withdrawals,
      transferPendana,
      receipts,
      waLogs,
      lokasiJejak,
      pengingat,
      lokasiPeringatan,
      pengumuman,
      ledgerEntries,
      auditLog,
      users,
    ] = await Promise.all([
      ctx.db.query("loans").collect(),
      ctx.db.query("pawns").collect(),
      ctx.db.query("kreditBarang").collect(),
      ctx.db.query("pawnPayments").collect(),
      ctx.db.query("kreditPayments").collect(),
      ctx.db.query("deposits").collect(),
      ctx.db.query("fundings").collect(),
      ctx.db.query("kreditFundings").collect(),
      ctx.db.query("withdrawals").collect(),
      ctx.db.query("transferPendana").collect(),
      ctx.db.query("manualPaymentReceipts").collect(),
      ctx.db.query("waLogs").collect(),
      ctx.db.query("lokasiJejak").collect(),
      ctx.db.query("pengingat").collect(),
      ctx.db.query("lokasiPeringatan").collect(),
      ctx.db.query("pengumuman").collect(),
      ctx.db.query("ledger_entries").collect(),
      ctx.db.query("auditLog").collect(),
      ctx.db.query("users").collect(),
    ]);
    const config = await getConfig(ctx);

    // Dokumen storage + URL bertanda tangan: tanpa ini berkas KYC dan bukti
    // tidak ikut ter-backup meski barisnya ada.
    const dokumen: Array<{
      jenis: string;
      pemilik: string;
      storageId: string;
      url: string | null;
    }> = [];
    const tambahDokumen = async (
      jenis: string,
      pemilik: string,
      id: Id<"_storage"> | undefined | null,
    ) => {
      if (!id) return;
      dokumen.push({
        jenis,
        pemilik,
        storageId: id,
        url: await ctx.storage.getUrl(id),
      });
    };
    for (const l of loans) {
      await tambahDokumen("ktp", l.nomorReferensi, l.dokKtpId);
      await tambahDokumen("selfie_ktp", l.nomorReferensi, l.dokSelfieKtpId);
      await tambahDokumen("slip_gaji", l.nomorReferensi, l.dokSlipGajiId);
    }
    for (const p of pawns) {
      await tambahDokumen("foto_barang", p.nomorReferensi, p.fotoBarangId);
    }
    for (const r of receipts) {
      await tambahDokumen("bukti_pembayaran", r.nomorReferensi, r.buktiPembayaranId);
    }
    for (const d of deposits) {
      await tambahDokumen("bukti_setoran", d.nomorReferensi, d.buktiPembayaranId);
    }
    await tambahDokumen("qris", "konfigurasi", config.qrisImageId);

    return {
      dibuatPada: new Date().toISOString(),
      jumlah: {
        loans: loans.length,
        pawns: pawns.length,
        kreditBarang: kreditBarang.length,
        pawnPayments: pawnPayments.length,
        kreditPayments: kreditPayments.length,
        deposits: deposits.length,
        fundings: fundings.length,
        kreditFundings: kreditFundings.length,
        withdrawals: withdrawals.length,
        transferPendana: transferPendana.length,
        manualPaymentReceipts: receipts.length,
        waLogs: waLogs.length,
        lokasiJejak: lokasiJejak.length,
        pengingat: pengingat.length,
        lokasiPeringatan: lokasiPeringatan.length,
        pengumuman: pengumuman.length,
        ledgerEntries: ledgerEntries.length,
        auditLog: auditLog.length,
        users: users.length,
        dokumen: dokumen.length,
      },
      loans,
      pawns,
      kreditBarang,
      pawnPayments,
      kreditPayments,
      deposits,
      fundings,
      kreditFundings,
      withdrawals,
      transferPendana,
      manualPaymentReceipts: receipts,
      waLogs,
      lokasiJejak,
      pengingat,
      lokasiPeringatan,
      pengumuman,
      ledger_entries: ledgerEntries,
      auditLog,
      systemConfig: config,
      users,
      dokumen,
    };
  },
});

/** Catat unduhan backup ke audit trail — dipanggil klien setelah unduh. */
export const catatBackup = mutation({
  args: { jenis: v.string() },
  handler: async (ctx, { jenis }) => {
    const { userId, user } = await requireAdmin(ctx);
    await audit(ctx, userId, user.email ?? user.name ?? "admin", "backup", jenis);
    return { ok: true };
  },
});
