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
import { isLandingTemplateId, labelTemplateLanding, templateLandingAman } from "../lib/landingTemplate";
import { bandingkanConfig, type PerubahanConfig } from "../lib/bandingkanConfig";
import {
  AKSI_PER_JENIS,
  rangkumAuditHapus,
  type JenisHapus,
  type RincianHapus,
} from "../lib/auditHapus";
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

/**
 * Tulis satu baris audit trail (append-only).
 *
 * `rincianHapus` diisi khusus oleh aksi PENGHAPUSAN data: angka terstruktur
 * tentang berapa baris turunan yang ikut terhapus dan berapa entri jurnal yang
 * dipertahankan. Kalimatnya tetap ada di `detail`; kolom terstruktur ini yang
 * dijumlahkan panel Audit Trail (lihat lib/auditHapus.ts).
 */
export async function audit(
  ctx: MutationCtx,
  aktorUserId: unknown,
  aktorLabel: string,
  aksi: string,
  target?: string,
  detail?: string,
  rincianHapus?: RincianHapus,
): Promise<void> {
  await ctx.db.insert("auditLog", {
    aktorUserId: typeof aktorUserId === "string" ? (aktorUserId as never) : undefined,
    aktorLabel,
    aksi,
    target,
    detail,
    ...(rincianHapus !== undefined ? { rincianHapus } : {}),
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
    versi: row.versi ?? DEFAULT_CONFIG.versi,
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

/**
 * Template 3D landing page aktif — dibaca pengunjung publik di route `/`.
 *
 * Nilai tak dikenal (atau kolom yang belum pernah diset) dinormalkan menjadi
 * template default, bukan dilempar sebagai error: halaman depan tidak boleh
 * kosong hanya karena konfigurasi lama/tidak valid.
 */
export const getLandingTemplatePublic = query({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query("systemConfig")
      .withIndex("by_slot", (q) => q.eq("slot", SYSTEM_SLOT))
      .first();
    return { template: templateLandingAman(row?.landingTemplate) };
  },
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

/** Batas baris penghapusan yang dikirim ke panel Audit Trail. */
const BATAS_AUDIT_HAPUS = 100;

/**
 * Daftar penghapusan data untuk panel Audit Trail — admin saja.
 *
 * Dibaca lewat indeks `by_aksi` per aksi hapus, bukan dengan menyaring N entri
 * terbaru: penghapusan itu peristiwa langka, jadi daftar "terbaru saja" akan
 * bolong tanpa terlihat bolong. Angka ringkasannya dihitung lib/auditHapus dari
 * rincian TERSTRUKTUR; baris lama tanpa rincian cukup dilaporkan sebagai
 * `tanpaRincian`, tidak dikarang.
 */
export const auditPenghapusan = query({
  args: {
    jenis: v.optional(
      v.union(
        v.literal("semua"),
        v.literal("pinjaman"),
        v.literal("gadai"),
        v.literal("kredit-barang"),
        v.literal("pinjaman-lama"),
      ),
    ),
  },
  handler: async (ctx, { jenis }) => {
    await requireAdmin(ctx);
    const pilihan: JenisHapus = jenis ?? "semua";
    const perAksi = await Promise.all(
      AKSI_PER_JENIS[pilihan].map((aksi) =>
        ctx.db
          .query("auditLog")
          .withIndex("by_aksi", (q) => q.eq("aksi", aksi))
          .order("desc")
          .take(BATAS_AUDIT_HAPUS),
      ),
    );
    const rows = perAksi
      .flat()
      .sort((a, b) => b.waktu - a.waktu)
      .slice(0, BATAS_AUDIT_HAPUS);
    return {
      jenis: pilihan,
      batas: BATAS_AUDIT_HAPUS,
      rows: rows.map((r) => ({
        _id: r._id,
        aktorLabel: r.aktorLabel,
        aksi: r.aksi,
        target: r.target,
        detail: r.detail,
        waktu: r.waktu,
        rincianHapus: r.rincianHapus,
      })),
      ringkasan: rangkumAuditHapus(rows),
    };
  },
});

/** Konfigurasi tanpa nomor versi — bentuk yang divalidasi & disimpan. */
type ConfigBersih = Omit<SystemConfig, "versi">;

/** Masukan mentah: kolom teks boleh kosong/absen (dinormalkan menjadi ""). */
type ConfigMasuk = Omit<
  SystemConfig,
  | "versi"
  | "rekeningUsahaNama"
  | "rekeningUsahaBank"
  | "rekeningUsahaNomor"
  | "qrisMerchantNama"
  | "qrisImageId"
> & {
  rekeningUsahaNama?: string;
  rekeningUsahaBank?: string;
  rekeningUsahaNomor?: string;
  qrisMerchantNama?: string;
  qrisImageId?: Id<"_storage"> | null;
};

/**
 * Validasi + normalkan masukan konfigurasi. SATU tempat dipakai oleh
 * `saveConfig` MAUPUN `rollbackConfig`, supaya nilai lama yang dipulihkan
 * melewati pemeriksaan yang sama dengan nilai baru — bukan jalan pintas.
 */
async function bersihkanConfigMasuk(
  ctx: MutationCtx,
  input: ConfigMasuk,
): Promise<ConfigBersih> {
  if (
    input.persenAdmin < 0 ||
    input.persenPlatform < 0 ||
    input.persenBunga < 0 ||
    input.persenBiayaIntegrasi < 0
  ) {
    throw new Error("Persentase biaya/bunga tidak boleh negatif.");
  }
  if (input.persenBiayaIntegrasi > 100) {
    throw new Error("Biaya integrasi pinjaman lama tidak boleh lebih dari 100%.");
  }
  if (!Number.isSafeInteger(input.lokasiMaxUmurMenit) || input.lokasiMaxUmurMenit < 1) {
    throw new Error("Batas umur lokasi harus minimal 1 menit.");
  }
  if (input.maxLtvPersen <= 0 || input.maxLtvPersen > 100) {
    throw new Error("LTV maksimum harus di antara 1–100%.");
  }
  if (
    !Number.isSafeInteger(input.retensiLokasiHari) ||
    input.retensiLokasiHari < RETENSI_LOKASI_BATAS.min ||
    input.retensiLokasiHari > RETENSI_LOKASI_BATAS.maks
  ) {
    throw new Error(
      `Retensi jejak lokasi harus ${RETENSI_LOKASI_BATAS.min}–${RETENSI_LOKASI_BATAS.maks} hari.`,
    );
  }
  const nomorUsaha = (input.rekeningUsahaNomor ?? "").trim();
  const digitsOnly = Array.from(nomorUsaha).every(
    (character) => character >= "0" && character <= "9",
  );
  if (nomorUsaha !== "" && (nomorUsaha.length < 6 || nomorUsaha.length > 20 || !digitsOnly)) {
    throw new Error("Nomor rekening usaha harus 6–20 digit angka.");
  }
  if (input.qrisImageId) {
    const metadata = await ctx.storage.getMetadata(input.qrisImageId);
    if (
      !metadata ||
      metadata.size > 5_000_000 ||
      !["image/jpeg", "image/png", "image/webp"].includes(metadata.contentType ?? "")
    ) {
      throw new Error("QRIS harus berupa gambar JPG, PNG, atau WebP maksimal 5 MB.");
    }
  }
  return {
    ...input,
    qrisImageId: input.qrisImageId ?? null,
    plafonPinjaman: clampPlafon(input.plafonPinjaman),
    rekeningUsahaNama: (input.rekeningUsahaNama ?? "").trim(),
    rekeningUsahaBank: (input.rekeningUsahaBank ?? "").trim(),
    rekeningUsahaNomor: nomorUsaha,
    qrisMerchantNama: (input.qrisMerchantNama ?? "").trim(),
  };
}

/** Tulis konfigurasi yang BERLAKU beserta nomor versinya. */
async function tulisConfigBerlaku(
  ctx: MutationCtx,
  cfg: ConfigBersih,
  versi: number,
  now: number,
): Promise<void> {
  const existing = await ctx.db
    .query("systemConfig")
    .withIndex("by_slot", (q) => q.eq("slot", SYSTEM_SLOT))
    .first();
  const patch = { slot: SYSTEM_SLOT, ...cfg, versi, diperbaruiPada: now };
  if (existing === null) {
    await ctx.db.insert("systemConfig", patch);
  } else {
    await ctx.db.patch(existing._id, patch);
  }
}

/** Catat satu baris riwayat (append-only) berisi snapshot lama & baru. */
/** Snapshot konfigurasi untuk dibandingkan — tanpa `versi` (metadata). */
function tanpaKunciVersi(config: ConfigBersih): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(config as unknown as Record<string, unknown>).filter(
      ([kunci]) => kunci !== "versi",
    ),
  );
}

async function catatRiwayatConfig(
  ctx: MutationCtx,
  opsi: {
    versi: number;
    jenis: "simpan" | "rollback";
    dariVersi?: number;
    sebelum: ConfigBersih;
    sesudah: ConfigBersih;
    berlakuSejak: number;
    diubahOleh: string;
    diubahOlehUserId?: Id<"users">;
    catatan?: string;
  },
): Promise<void> {
  // `versi` adalah metadata baris ini sendiri (selalu naik), bukan pengaturan
  // yang diubah admin — dibuang dari daftar perubahan supaya riwayat hanya
  // menampilkan keputusan yang benar-benar diambil.
  const perubahan = bandingkanConfig(
    tanpaKunciVersi(opsi.sebelum),
    tanpaKunciVersi(opsi.sesudah),
  );
  await ctx.db.insert("configRiwayat", {
    slot: SYSTEM_SLOT,
    versi: opsi.versi,
    jenis: opsi.jenis,
    ...(opsi.dariVersi !== undefined ? { dariVersi: opsi.dariVersi } : {}),
    berlakuSejak: opsi.berlakuSejak,
    diubahOleh: opsi.diubahOleh,
    ...(opsi.diubahOlehUserId !== undefined ? { diubahOlehUserId: opsi.diubahOlehUserId } : {}),
    ...(opsi.catatan !== undefined && opsi.catatan !== "" ? { catatan: opsi.catatan } : {}),
    sebelumJson: JSON.stringify(opsi.sebelum),
    sesudahJson: JSON.stringify(opsi.sesudah),
    perubahanJson: JSON.stringify(perubahan),
    dibuatPada: Date.now(),
  });
}

/** Simpan konfigurasi — mencatat versi baru + riwayat + audit. */
export const saveConfig = mutation({
  args: {
    tema: v.union(
      v.literal("tinta"),
      v.literal("pesisir"),
      v.literal("terakota"),
      v.literal("salju"),
      v.literal("karnival"),
    ),
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
    const label = user.email ?? user.name ?? "admin";
    const bersih = await bersihkanConfigMasuk(ctx, {
      tema: args.tema,
      killSwitch: args.killSwitch,
      maintenanceMode: args.maintenanceMode,
      persenAdmin: args.persenAdmin,
      persenPlatform: args.persenPlatform,
      persenBunga: args.persenBunga,
      persenBiayaIntegrasi: args.persenBiayaIntegrasi,
      maxLtvPersen: args.maxLtvPersen,
      sessionTimeoutMenit: args.sessionTimeoutMenit,
      vaultLat: args.vaultLat,
      vaultLng: args.vaultLng,
      gpsMismatchKm: args.gpsMismatchKm,
      pencairanMaxKm: args.pencairanMaxKm,
      lokasiWajib: args.lokasiWajib,
      lokasiMaxUmurMenit: args.lokasiMaxUmurMenit,
      wajibAplikasiNative: args.wajibAplikasiNative,
      retensiLokasiHari: args.retensiLokasiHari,
      plafonPinjaman: args.plafonPinjaman,
      rekeningUsahaNama: args.rekeningUsahaNama,
      rekeningUsahaBank: args.rekeningUsahaBank,
      rekeningUsahaNomor: args.rekeningUsahaNomor,
      qrisMerchantNama: args.qrisMerchantNama,
      qrisImageId: args.qrisImageId,
      manualDepositEnabled: args.manualDepositEnabled,
    });
    const prev = await getConfig(ctx);
    const now = Date.now();
    const versi = prev.versi + 1;
    await tulisConfigBerlaku(ctx, bersih, versi, now);
    await catatRiwayatConfig(ctx, {
      versi,
      jenis: "simpan",
      sebelum: prev,
      sesudah: bersih,
      berlakuSejak: now,
      diubahOleh: label,
      diubahOlehUserId: userId,
    });
    const killBerubah = bersih.killSwitch !== prev.killSwitch;
    await audit(
      ctx,
      userId,
      label,
      killBerubah ? "kill_switch" : "ubah_config",
      "systemConfig",
      killBerubah
        ? `Kill switch ${bersih.killSwitch ? "DIAKTIFKAN" : "DINONAKTIFKAN"} (versi ${versi})`
        : `Konfigurasi sistem diperbarui ke versi ${versi}`,
    );
    return { ok: true as const, versi };
  },
});

/**
 * Riwayat versi konfigurasi (terbaru lebih dulu).
 *
 * Menyajikan `lama → baru` per kunci (hasil `bandingkanConfig`) supaya panel
 * admin tidak perlu menghitung selisih di klien. Nilai sensitif tidak ada di
 * konfigurasi ini, jadi snapshot boleh dikembalikan apa adanya kepada admin.
 */
export const riwayatConfig = query({
  args: { batas: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const batas = Math.min(Math.max(args.batas ?? 25, 1), 100);
    const rows = await ctx.db
      .query("configRiwayat")
      .withIndex("by_slot_dibuatPada", (q) => q.eq("slot", SYSTEM_SLOT))
      .order("desc")
      .take(batas);
    return rows.map((r) => ({
      versi: r.versi,
      jenis: r.jenis,
      dariVersi: r.dariVersi ?? null,
      berlakuSejak: r.berlakuSejak,
      diubahOleh: r.diubahOleh,
      catatan: r.catatan ?? null,
      dibuatPada: r.dibuatPada,
      perubahan: JSON.parse(r.perubahanJson) as PerubahanConfig[],
    }));
  },
});

/**
 * Kembalikan konfigurasi ke NILAI versi tertentu sebagai VERSI BARU.
 *
 * Riwayat tidak pernah ditulis ulang: rollback menambah baris versi baru yang
 * menyalin nilai versi lama, dengan `dariVersi` sebagai jejak asal. Nilai yang
 * dipulihkan melewati validasi yang sama dengan penyimpanan biasa. Transaksi
 * yang sudah tercatat tetap memakai snapshot parameternya sendiri, sehingga
 * rollback hanya memengaruhi pengajuan BARU.
 */
export const rollbackConfig = mutation({
  args: { versi: v.number(), catatan: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { userId, user } = await requireAdmin(ctx);
    const label = user.email ?? user.name ?? "admin";
    const target = await ctx.db
      .query("configRiwayat")
      .withIndex("by_slot_versi", (q) => q.eq("slot", SYSTEM_SLOT).eq("versi", args.versi))
      .first();
    if (target === null) {
      throw new Error(`Versi ${args.versi} tidak ada di riwayat konfigurasi.`);
    }
    const snapshot = JSON.parse(target.sesudahJson) as ConfigBersih;
    const bersih = await bersihkanConfigMasuk(ctx, snapshot);
    const prev = await getConfig(ctx);
    if (prev.versi === args.versi) {
      throw new Error(`Versi ${args.versi} sedang berlaku — tidak ada yang perlu dikembalikan.`);
    }
    const now = Date.now();
    const versiBaru = prev.versi + 1;
    await tulisConfigBerlaku(ctx, bersih, versiBaru, now);
    const catatan = args.catatan?.trim();
    await catatRiwayatConfig(ctx, {
      versi: versiBaru,
      jenis: "rollback",
      dariVersi: args.versi,
      sebelum: prev,
      sesudah: bersih,
      berlakuSejak: now,
      diubahOleh: label,
      diubahOlehUserId: userId,
      catatan: catatan && catatan !== "" ? catatan : `Rollback ke nilai versi ${args.versi}`,
    });
    await audit(
      ctx,
      userId,
      label,
      "rollback_config",
      "systemConfig",
      `Konfigurasi dikembalikan ke nilai versi ${args.versi} sebagai versi baru ${versiBaru}. Riwayat lama tidak diubah; transaksi lama tetap memakai snapshot parameternya.`,
    );
    return { ok: true as const, versi: versiBaru };
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
  args: {
    tema: v.union(
      v.literal("tinta"),
      v.literal("pesisir"),
      v.literal("terakota"),
      v.literal("salju"),
      v.literal("karnival"),
    ),
  },
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

/**
 * Ganti template 3D landing page publik (Panel Admin → Landing Page → Template 3D).
 *
 * Keamanan: hanya admin dengan sesi sah (`requireAdminSession`) yang boleh
 * menulis, dan nilainya WAJIB ada di allowlist `lib/landingTemplate.ts`. Klien
 * tidak pernah mengirim nama komponen atau kode — hanya ID template — sehingga
 * tidak ada jalan untuk memuat komponen arbitrer dari frontend.
 *
 * Ini adalah jalur yang sama dengan `setWebsiteTemplate`: satu patch pada baris
 * `systemConfig` tanpa menyentuh versi konfigurasi form, supaya penggantian
 * template tidak perlu deploy ulang dan tidak mengubah nilai operasional lain.
 * Perubahan TIDAK memengaruhi transaksi yang sudah berjalan.
 *
 * Dua admin yang mengganti bersamaan: Convex mengeksekusi mutation secara
 * transaksional, jadi yang berlaku adalah penulisan terakhir; SETIAP percobaan
 * tetap meninggalkan satu baris audit berisi template asal dan tujuan, sehingga
 * riwayat tidak pernah hilang meski ada balapan.
 */
export const setLandingTemplate = mutation({
  args: {
    template: v.union(
      v.literal("premium-card"),
      v.literal("cyber-vault"),
      v.literal("ai-mascot"),
      v.literal("ledger-matrix"),
      v.literal("loan-simulator"),
      v.literal("quantum-portal"),
    ),
  },
  handler: async (ctx, { template }) => {
    const { userId, user } = await requireAdmin(ctx);
    const label = user.email ?? user.name ?? "admin";
    if (!isLandingTemplateId(template)) {
      throw new Error("Template 3D landing page tidak valid.");
    }
    const existing = await ctx.db
      .query("systemConfig")
      .withIndex("by_slot", (q) => q.eq("slot", SYSTEM_SLOT))
      .first();
    const sebelumnya = templateLandingAman(existing?.landingTemplate);
    if (sebelumnya === template) {
      return { ok: true as const, template, sebelumnya, berubah: false };
    }
    const now = Date.now();
    if (existing === null) {
      await ctx.db.insert("systemConfig", {
        slot: SYSTEM_SLOT,
        landingTemplate: template,
        diperbaruiPada: now,
      });
    } else {
      await ctx.db.patch(existing._id, { landingTemplate: template, diperbaruiPada: now });
    }
    await audit(
      ctx,
      userId,
      label,
      "template_landing_3d",
      "Landing page publik (/)",
      `Template 3D landing page: ${labelTemplateLanding(sebelumnya)} → ${labelTemplateLanding(template)}.`,
    );
    return { ok: true as const, template, sebelumnya, berubah: true };
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
