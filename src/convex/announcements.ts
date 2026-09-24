import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { ROLES } from "./schema";

/** Gerbang admin untuk CMS. */
async function requireAdmin(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
  const user = await ctx.db.get(userId);
  if (user === null || user.role !== ROLES.ADMIN) {
    throw new Error("Akses khusus tim Pinjam Gadai Digital (admin).");
  }
  return { userId };
}

const SLOT = "global";

/** Teks default (kondisi kalah/opsional) — dipakai saat admin belum menyimpan. */
export const DEFAULTS = {
  bar: {
    teks: "Pengajuan pinjaman tunai & gadai digital kini lebih cepat — dilayani dari rumah, ditinjau tim sesegera mungkin. Daftar gratis dan ajukan hari ini.",
    tautan: "/auth",
  },
  popup: {
    judul: "Ajukan Sekarang, Cair Tanpa Antre",
    isi: "Buat pengajuan pinjaman tunai atau gadai digital langsung dari rumah — cukup beberapa menit. Tim kami menindak cepat, barang gadai tersimpan aman di brankas custody, dan pengingat jatuh tempo berjalan otomatis supaya Anda tidak pernah terlambat.",
    cta: "Mengerti, coba simulasi pinjaman saya",
  },
  float: {
    judul: "Promo pembukaan",
    isi: "Pengajuan dinilai lebih cepat minggu ini — kirim pengajuan Anda dan tim kami segera menindaklanjuti.",
    cta: "Mulai pengajuan",
  },
  hero: {
    badge: "Platform Pinjaman & Gadai resmi — tersertifikasi, live location wajib saat penilaian",
    judul: "Pinjam & Gadai Digital",
    judul2: "Transparan",
    sub: "PINDAI menghubungkan Peminjam dengan Pendana terverifikasi. Simulasikan pinjaman tanpa agunan atau gadaikan barang Anda — semua angka jelas sejak awal.",
    cta1: "Ajukan Pinjaman",
    cta2: "Gadaikan Barang",
  },
  chips: {
    chip1: { label: "Dana bersih", nilai: "95% selalu" },
    chip2: { label: "Potongan di muka", nilai: "5% terbuka" },
  },
  layanan: {
    judul: "Dua layanan, satu standar transparansi",
    sub: "Pilih jalur yang paling sesuai — keduanya memakai mesin perhitungan dan jurnal audit yang sama.",
    pinjamanJudul: "Pinjaman Tunai Digital",
    pinjamanIsi:
      "Ajukan tanpa agunan dengan tenor 30/60/90 hari. Setelah disetujui tim, dana bersih 95% dari pokok langsung ke rekening Anda. Lunasi 130% (pokok + Bunga 30% — Imbal Hasil Pendana).",
    pinjamanCta: "Ajukan sekarang",
    gadaiJudul: "Gadai Digital",
    gadaiIsi:
      "Elektronik, kendaraan, perhiasan, hingga properti. Taksiran resmi oleh petugas berwenang dengan live location wajib; potongan muka hanya 1% — dana bersih 99% langsung cair. Sewa modal 5–10% per 30 hari dihitung dari sisa pokok terbaru, jadi setiap kali Anda mencicil pokok, sewa bulan berikutnya otomatis turun. Sisa pokok Rp0 → barang SIAP_DIAMBIL dari Brankas Custody.",
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
      nav3: v(row?.nav3Label, "Simulasi"),
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
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const me = await ctx.db.get(userId);
    if (me === null || me.role !== ROLES.ADMIN) return null;
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
