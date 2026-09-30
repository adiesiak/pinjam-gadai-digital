import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { requireAdminSession } from "./adminAuthz";

/** Gerbang admin untuk CMS. */
async function requireAdmin(ctx: QueryCtx) {
  const { userId } = await requireAdminSession(ctx);
  return { userId };
}

const SLOT = "global";

/** Teks default (kondisi kalah/opsional) — dipakai saat admin belum menyimpan. */
export const DEFAULTS = {
  bar: {
    teks: "Pinjaman, gadai, dan alokasi dicatat di ledger internal PINDAI.",
    tautan: "/auth",
  },
  popup: {
    judul: "Jelajahi PINDAI",
    isi: "Lihat perhitungan pinjaman dan gadai serta catatan status di dashboard. Angka dan aksi memperbarui ledger internal PINDAI; perpindahan dana ditangani di luar aplikasi.",
    cta: "Lihat kalkulator",
  },
  float: {
    judul: "Pengajuan cepat",
    isi: "Catat informasi pengajuan dan pantau status internal melalui dashboard akun Anda.",
    cta: "Mulai pengajuan",
  },
  hero: {
    badge: "Pinjaman & ledger internal",
    judul: "Pinjam & Gadai Digital",
    judul2: "Transparan",
    sub: "Jelajahi perhitungan pinjaman, gadai, dan alokasi pendanaan dalam ledger internal. Persetujuan, saldo, dan status tercatat pada ledger internal PINDAI.",
    cta1: "Ajukan Pinjaman",
    cta2: "Gadaikan Barang",
  },
  chips: {
    chip1: { label: "Pinjaman tunai", nilai: "Tanpa agunan" },
    chip2: { label: "Barang gadai", nilai: "Catatan aplikasi" },
  },
  layanan: {
    judul: "Dua fitur, satu ledger internal",
    sub: "Semua nominal, skema biaya, dan status yang terlihat adalah pencatatan internal PINDAI.",
    pinjamanJudul: "Pinjaman Tunai Digital",
    pinjamanIsi:
      "Perhitungan harian: potongan admin 2% + platform 3%, bunga 30%, dan total kewajiban 130% dari pokok; plafon serta tenor mengikuti pengaturan aplikasi. Skema bulanan 1–6 bulan memakai DP 0%, biaya admin 2% + platform 3% (tenor 3/6) atau biaya layanan 3% (tenor 1) yang dipotong di muka, dan bunga 30%/25% menurun dari sisa pokok (tenor 1–5 bulan) atau 20% flat dari pokok penuh (tenor 6 bulan). Angka dihitung aplikasi dari data pengajuan dan dana tidak dikirim ke mana pun. Jadwal angsuran bulanan bersifat ilustrasi dan ledger mencatat pelunasan penuh sekaligus saat jatuh tempo.",
    pinjamanCta: "Ajukan sekarang",
    gadaiJudul: "Gadai Digital",
    gadaiIsi:
      "Catat informasi barang dan nilai taksiran untuk pengajuan gadai. Perhitungan sewa modal 5–10% per 30 hari menggunakan sisa pokok. Status dan pembayaran tercatat di ledger internal; pemeriksaan fisik dan penitipan barang ditangani di luar aplikasi.",
    gadaiCta: "Gadaikan barang",
  },
} as const;

/** Semua teks publik landing (bar + popup + float + hero/layanan) — tanpa auth. */
export const getPublic = query({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query("pengumuman")
      .withIndex("by_slot", (q) => q.eq("slot", SLOT))
      .first();

    const v = <T>(cms: T | undefined, fallback: T): T => cms ?? fallback;

    return {
      // Bar berjalan
      barTeks: v(row?.teks, DEFAULTS.bar.teks),
      barTautan: v(row?.tautan, DEFAULTS.bar.tautan),
      barAktif: v(row?.aktif, true),
      // Popup
      popupJudul: v(row?.popupJudul, DEFAULTS.popup.judul),
      popupIsi: v(row?.popupIsi, DEFAULTS.popup.isi),
      popupCta: v(row?.popupCta, DEFAULTS.popup.cta),
      popupAktif: v(row?.popupAktif, true),
      // Widget mengambang
      floatJudul: v(row?.floatJudul, DEFAULTS.float.judul),
      floatIsi: v(row?.floatIsi, DEFAULTS.float.isi),
      floatCta: v(row?.floatCta, DEFAULTS.float.cta),
      floatAktif: v(row?.floatAktif, true),
      floatDelayDetik: v(row?.floatDelayDetik ?? undefined, 6),
      // Header/hero
      logoTeks: v(row?.logoTeks, "PINDAI"),
      nav1: v(row?.nav1Label, "Pinjaman Tunai"),
      nav2: v(row?.nav2Label, "Gadai Digital"),
      nav3: v(row?.nav3Label, "Kalkulator"),
      nav4: v(row?.nav4Label, "Keamanan"),
      heroBadge: v(row?.heroBadge, DEFAULTS.hero.badge),
      heroJudul: v(row?.heroJudul, DEFAULTS.hero.judul),
      heroJudul2: v(row?.heroJudul2, DEFAULTS.hero.judul2),
      heroSub: v(row?.heroSub, DEFAULTS.hero.sub),
      heroCta1: v(row?.heroCta1, DEFAULTS.hero.cta1),
      heroCta2: v(row?.heroCta2, DEFAULTS.hero.cta2),
      chip1Label: v(row?.chip1Label, DEFAULTS.chips.chip1.label),
      chip1Nilai: v(row?.chip1Nilai, DEFAULTS.chips.chip1.nilai),
      chip2Label: v(row?.chip2Label, DEFAULTS.chips.chip2.label),
      chip2Nilai: v(row?.chip2Nilai, DEFAULTS.chips.chip2.nilai),
      // Layanan
      layananJudul: v(row?.layananJudul, DEFAULTS.layanan.judul),
      layananSub: v(row?.layananSub, DEFAULTS.layanan.sub),
      pinjamanJudul: v(row?.pinjamanJudul, DEFAULTS.layanan.pinjamanJudul),
      pinjamanIsi: v(row?.pinjamanIsi, DEFAULTS.layanan.pinjamanIsi),
      pinjamanCta: v(row?.pinjamanCta, DEFAULTS.layanan.pinjamanCta),
      gadaiJudul: v(row?.gadaiJudul, DEFAULTS.layanan.gadaiJudul),
      gadaiIsi: v(row?.gadaiIsi, DEFAULTS.layanan.gadaiIsi),
      gadaiCta: v(row?.gadaiCta, DEFAULTS.layanan.gadaiCta),
    };
  },
});

/** Baris mentah CMS untuk editor admin. */
export const getCmsRow = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const row = await ctx.db
      .query("pengumuman")
      .withIndex("by_slot", (q) => q.eq("slot", SLOT))
      .first();
    return row ?? null;
  },
});

/** Simpan seluruh CMS (upsert slot global). Field kosong = biarkan default. */
export const save = mutation({
  args: {
    teks: v.optional(v.string()),
    tautan: v.optional(v.string()),
    barAktif: v.optional(v.boolean()),
    popupJudul: v.optional(v.string()),
    popupIsi: v.optional(v.string()),
    popupCta: v.optional(v.string()),
    popupAktif: v.optional(v.boolean()),
    floatJudul: v.optional(v.string()),
    floatIsi: v.optional(v.string()),
    floatCta: v.optional(v.string()),
    floatAktif: v.optional(v.boolean()),
    floatDelayDetik: v.optional(v.number()),
    logoTeks: v.optional(v.string()),
    nav1: v.optional(v.string()),
    nav2: v.optional(v.string()),
    nav3: v.optional(v.string()),
    nav4: v.optional(v.string()),
    heroBadge: v.optional(v.string()),
    heroJudul: v.optional(v.string()),
    heroJudul2: v.optional(v.string()),
    heroSub: v.optional(v.string()),
    heroCta1: v.optional(v.string()),
    heroCta2: v.optional(v.string()),
    chip1Label: v.optional(v.string()),
    chip1Nilai: v.optional(v.string()),
    chip2Label: v.optional(v.string()),
    chip2Nilai: v.optional(v.string()),
    layananJudul: v.optional(v.string()),
    layananSub: v.optional(v.string()),
    pinjamanJudul: v.optional(v.string()),
    pinjamanIsi: v.optional(v.string()),
    pinjamanCta: v.optional(v.string()),
    gadaiJudul: v.optional(v.string()),
    gadaiIsi: v.optional(v.string()),
    gadaiCta: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireAdmin(ctx);

    const bersih = (s: string | undefined, max: number) => {
      const t = s?.trim();
      return t ? t.slice(0, max) : undefined;
    };

    const patch: Partial<Doc<"pengumuman">> = {};
    const angka: Array<[string, unknown]> = [
      ["teks", bersih(args.teks, 240)],
      ["tautan", bersih(args.tautan, 120)],
      ["aktif", args.barAktif],
      ["popupJudul", bersih(args.popupJudul, 80)],
      ["popupIsi", bersih(args.popupIsi, 500)],
      ["popupCta", bersih(args.popupCta, 60)],
      ["popupAktif", args.popupAktif],
      ["floatJudul", bersih(args.floatJudul, 80)],
      ["floatIsi", bersih(args.floatIsi, 300)],
      ["floatCta", bersih(args.floatCta, 60)],
      ["floatAktif", args.floatAktif],
      [
        "floatDelayDetik",
        args.floatDelayDetik !== undefined
          ? Math.min(60, Math.max(0, Math.round(args.floatDelayDetik)))
          : undefined,
      ],
      ["logoTeks", bersih(args.logoTeks, 40)],
      ["nav1Label", bersih(args.nav1, 40)],
      ["nav2Label", bersih(args.nav2, 40)],
      ["nav3Label", bersih(args.nav3, 40)],
      ["nav4Label", bersih(args.nav4, 40)],
      ["heroBadge", bersih(args.heroBadge, 160)],
      ["heroJudul", bersih(args.heroJudul, 120)],
      ["heroJudul2", bersih(args.heroJudul2, 60)],
      ["heroSub", bersih(args.heroSub, 400)],
      ["heroCta1", bersih(args.heroCta1, 40)],
      ["heroCta2", bersih(args.heroCta2, 40)],
      ["chip1Label", bersih(args.chip1Label, 40)],
      ["chip1Nilai", bersih(args.chip1Nilai, 40)],
      ["chip2Label", bersih(args.chip2Label, 40)],
      ["chip2Nilai", bersih(args.chip2Nilai, 40)],
      ["layananJudul", bersih(args.layananJudul, 120)],
      ["layananSub", bersih(args.layananSub, 300)],
      ["pinjamanJudul", bersih(args.pinjamanJudul, 80)],
      ["pinjamanIsi", bersih(args.pinjamanIsi, 400)],
      ["pinjamanCta", bersih(args.pinjamanCta, 40)],
      ["gadaiJudul", bersih(args.gadaiJudul, 80)],
      ["gadaiIsi", bersih(args.gadaiIsi, 400)],
      ["gadaiCta", bersih(args.gadaiCta, 40)],
    ];
    for (const [key, val] of angka) {
      if (val !== undefined) patch[key as keyof Doc<"pengumuman">] = val as never;
    }
    // Tautan boleh dikosongkan untuk menghapusnya (string kosong = hapus).
    if (args.tautan !== undefined && args.tautan.trim() === "") {
      patch.tautan = "";
    }
    if (Object.keys(patch).length === 0) {
      throw new Error("Tidak ada perubahan untuk disimpan.");
    }
    patch.diperbaruiPada = Date.now();

    const existing = await ctx.db
      .query("pengumuman")
      .withIndex("by_slot", (q) => q.eq("slot", SLOT))
      .first();
    if (existing === null) {
      await ctx.db.insert("pengumuman", {
        slot: SLOT,
        ...patch,
        diperbaruiPada: patch.diperbaruiPada ?? Date.now(),
      });
    } else {
      await ctx.db.patch(existing._id, patch);
    }
    void userId;
    return { ok: true };
  },
});

/** Reset semua teks kembali ke default bawaan sistem. */
export const resetToDefaults = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const existing = await ctx.db
      .query("pengumuman")
      .withIndex("by_slot", (q) => q.eq("slot", SLOT))
      .first();
    if (existing !== null) {
      await ctx.db.delete(existing._id);
    }
    return { ok: true };
  },
});
