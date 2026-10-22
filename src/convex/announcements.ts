import { getAuthUserId } from "@convex-dev/auth/server";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type QueryCtx,
} from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  BATAS_LANDING,
  JUMLAH_KARTU_LAYANAN,
  JUMLAH_PANDUAN,
  lengkapiKontenLanding,
} from "../lib/landing-cms";
import { MAX_FILE_BYTES } from "../lib/kyc";
import {
  BATAS_PENDANA,
  JUMLAH_FAQ,
  JUMLAH_ISI_PROPOSAL,
  JUMLAH_PRINSIP,
  JUMLAH_RISIKO,
  lengkapiKontenPendana,
} from "../lib/kontenPendana";
import { getAdminGateStatus, requireAdminSession } from "./adminAuthz";

/** Gerbang admin untuk CMS. */
async function requireAdmin(ctx: QueryCtx) {
  const { userId } = await requireAdminSession(ctx);
  return { userId };
}

const SLOT = "global";

/**
 * Validator konten beranda. Semua field opsional: admin boleh menyimpan
 * sebagian, dan pembacaan melengkapinya dengan bawaan di `lib/landing-cms`.
 */
const VALIDASI_LANDING = v.object({
  heroEyebrow: v.optional(v.string()),
  heroJudul1: v.optional(v.string()),
  heroJudul2: v.optional(v.string()),
  heroDeskripsi: v.optional(v.string()),
  heroCtaSekunder: v.optional(v.string()),
  heroMikro: v.optional(v.string()),
  layananEyebrow: v.optional(v.string()),
  layananJudul: v.optional(v.string()),
  layananCta: v.optional(v.string()),
  layanan: v.optional(
    v.array(
      v.object({
        judul: v.optional(v.string()),
        ringkasan: v.optional(v.string()),
        detail: v.optional(v.string()),
      }),
    ),
  ),
  panduanEyebrow: v.optional(v.string()),
  panduanJudul: v.optional(v.string()),
  panduanDeskripsi: v.optional(v.string()),
  panduanCtaKalkulator: v.optional(v.string()),
  panduanCtaSyarat: v.optional(v.string()),
  panduan: v.optional(
    v.array(
      v.object({
        judul: v.optional(v.string()),
        isi: v.optional(v.string()),
      }),
    ),
  ),
  footerDeskripsi: v.optional(v.string()),
});

/**
 * Validator konten halaman pendana. Semua field opsional: admin boleh
 * menyimpan sebagian, dan pembacaan melengkapinya dengan bawaan.
 */
const VALIDASI_PENDANA = v.object({
  heroJudul: v.optional(v.string()),
  heroDeskripsi: v.optional(v.string()),
  heroCatatan: v.optional(v.string()),
  prinsipJudul: v.optional(v.string()),
  prinsipDeskripsi: v.optional(v.string()),
  prinsip: v.optional(
    v.array(
      v.object({
        judul: v.optional(v.string()),
        isi: v.optional(v.string()),
      }),
    ),
  ),
  kalkulatorJudul: v.optional(v.string()),
  kalkulatorDeskripsi: v.optional(v.string()),
  kalkulatorCatatan: v.optional(v.string()),
  perhitunganJudul: v.optional(v.string()),
  perhitunganDeskripsi: v.optional(v.string()),
  proposalJudul: v.optional(v.string()),
  proposalDeskripsi: v.optional(v.string()),
  proposalIsi: v.optional(v.array(v.string())),
  proposalCatatan: v.optional(v.string()),
  proposalCatatanBerkas: v.optional(v.string()),
  risikoJudul: v.optional(v.string()),
  risikoDeskripsi: v.optional(v.string()),
  risiko: v.optional(
    v.array(
      v.object({
        judul: v.optional(v.string()),
        isi: v.optional(v.string()),
      }),
    ),
  ),
  faqJudul: v.optional(v.string()),
  faqDeskripsi: v.optional(v.string()),
  faq: v.optional(
    v.array(
      v.object({
        tanya: v.optional(v.string()),
        jawab: v.optional(v.string()),
      }),
    ),
  ),
  ajakanJudul: v.optional(v.string()),
  ajakanDeskripsi: v.optional(v.string()),
});

/**
 * Ukuran maksimum proposal PDF, sama dengan batas unggah dokumen lain di
 * aplikasi (`lib/kyc`), supaya klien dan server tidak berjanji angka berbeda.
 */
const MAKS_PROPOSAL_BYTE = MAX_FILE_BYTES;

/** Teks default (kondisi kalah/opsional) — dipakai saat admin belum menyimpan. */
export const DEFAULTS = {
  bar: {
    teks: "Pinjaman, gadai, dan cicilan dicatat di ledger internal PINDAI.",
    tautan: "/auth",
  },
  popup: {
    judul: "Jelajahi PINDAI",
    isi: "Lihat perhitungan pinjaman dan gadai serta status di dashboard. Semua angka adalah catatan ledger internal PINDAI; perpindahan dana ditangani di luar aplikasi.",
    cta: "Lihat kalkulator",
  },
  float: {
    judul: "Pengajuan cepat",
    isi: "Catat pengajuan dan pantau statusnya di dashboard akun Anda.",
    cta: "Mulai pengajuan",
  },
  hero: {
    badge: "Pinjaman & ledger internal",
    judul: "Pinjam & Gadai Digital",
    judul2: "Transparan",
    sub: "Lihat perhitungan pinjaman, gadai, dan cicilan di ledger internal PINDAI. Persetujuan dan status dicatat di aplikasi; perpindahan dana ditangani di luar aplikasi.",
    cta1: "Ajukan Pinjaman",
    cta2: "Gadaikan Barang",
  },
  chips: {
    chip1: { label: "Pinjaman tunai", nilai: "Tanpa agunan" },
    chip2: { label: "Barang gadai", nilai: "Catatan aplikasi" },
  },
  layanan: {
    judul: "Dua fitur, satu ledger internal",
    sub: "Semua nominal, biaya, dan status di halaman ini adalah catatan internal PINDAI.",
    pinjamanJudul: "Pinjaman Tunai Digital",
    pinjamanIsi:
      "Skema harian: potongan di muka 2% (biaya admin; platform 0%), bunga flat 26–40% sesuai nominal dan tenor, total kewajiban 126–140% dari pokok. Skema bulanan 1, 3, atau 6 bulan: DP 0%, potongan di muka 2% dari pokok (biaya admin pada tenor 3/6, biaya layanan pada tenor 1), bunga flat mengikuti tarif akun (bawaan 30% per bulan) untuk semua tenor, dan biaya admin cicilan 2% dari nominal cicilan pada setiap pembayaran bulanan. Semua angka dihitung aplikasi dan dana tidak dikirim ke mana pun. Jadwal angsuran bersifat ilustrasi; ledger mencatat pelunasan penuh saat jatuh tempo.",
    pinjamanCta: "Ajukan sekarang",
    gadaiJudul: "Gadai Digital",
    gadaiIsi:
      "Catat data barang dan nilai taksiran untuk pengajuan gadai. Sewa modal 5–10% per 30 hari dihitung dari sisa pokok. Status tercatat di ledger internal; pemeriksaan fisik, penitipan barang, dan perpindahan dana ditangani di luar aplikasi.",
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
      /**
       * Teks beranda `/` yang benar-benar dirender. Selalu berbentuk utuh:
       * field kosong atau data lama yang belum punya kolom ini diisi bawaan,
       * jadi klien tidak perlu merakit fallback sendiri.
       */
      landing: lengkapiKontenLanding(row?.landing),
      /** Konten `/jadi-pendana` (tanpa berkas: URL proposal dibaca terpisah). */
      pendana: lengkapiKontenPendana(row?.pendana),
    };
  },
});

/**
 * Proposal PDF yang dipasang admin, untuk halaman `/jadi-pendana`.
 *
 * Dipisah dari `getPublic` dan hanya untuk sesi yang sudah masuk: tautan
 * penyimpanan Convex permanen, jadi tidak dikirim ke pengunjung anonim yang
 * bisa membaca query publik. Halaman ini sendiri hanya terbuka dari ruang
 * pendana.
 */
export const proposalPendanaAktif = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const row = await ctx.db
      .query("pengumuman")
      .withIndex("by_slot", (q) => q.eq("slot", SLOT))
      .first();
    const berkasId = row?.pendana?.berkasId;
    if (berkasId === undefined) return null;
    const url = await ctx.storage.getUrl(berkasId);
    if (url === null) return null;
    return {
      url,
      namaBerkas: row?.pendana?.berkasNama ?? "proposal-pendanaan-pindai.pdf",
      pada: row?.pendana?.berkasPada ?? null,
    };
  },
});

/** Baris mentah CMS untuk editor admin — null bila pemanggil bukan admin. */
export const getCmsRow = query({
  args: {},
  handler: async (ctx) => {
    const gate = await getAdminGateStatus(ctx);
    if (!gate.isAdmin) return null;
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
    landing: v.optional(VALIDASI_LANDING),
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

    // Landing disimpan per field: kolom yang dikosongkan TIDAK ditulis sebagai
    // string kosong, melainkan dibiarkan undefined supaya pembacaan memakai
    // teks bawaan. Dengan begitu admin bisa menghapus satu paragraf tanpa
    // meninggalkan judul kosong di halaman publik.
    if (args.landing !== undefined) {
      const l = args.landing;
      patch.landing = {
        heroEyebrow: bersih(l.heroEyebrow, BATAS_LANDING.heroEyebrow),
        heroJudul1: bersih(l.heroJudul1, BATAS_LANDING.heroJudul1),
        heroJudul2: bersih(l.heroJudul2, BATAS_LANDING.heroJudul2),
        heroDeskripsi: bersih(l.heroDeskripsi, BATAS_LANDING.heroDeskripsi),
        heroCtaSekunder: bersih(
          l.heroCtaSekunder,
          BATAS_LANDING.heroCtaSekunder,
        ),
        heroMikro: bersih(l.heroMikro, BATAS_LANDING.heroMikro),
        layananEyebrow: bersih(
          l.layananEyebrow,
          BATAS_LANDING.layananEyebrow,
        ),
        layananJudul: bersih(l.layananJudul, BATAS_LANDING.layananJudul),
        layananCta: bersih(l.layananCta, BATAS_LANDING.layananCta),
        layanan: l.layanan?.slice(0, JUMLAH_KARTU_LAYANAN).map((kartu) => ({
          judul: bersih(kartu.judul, BATAS_LANDING.kartuJudul),
          ringkasan: bersih(kartu.ringkasan, BATAS_LANDING.kartuRingkasan),
          detail: bersih(kartu.detail, BATAS_LANDING.kartuDetail),
        })),
        panduanEyebrow: bersih(
          l.panduanEyebrow,
          BATAS_LANDING.panduanEyebrow,
        ),
        panduanJudul: bersih(l.panduanJudul, BATAS_LANDING.panduanJudul),
        panduanDeskripsi: bersih(
          l.panduanDeskripsi,
          BATAS_LANDING.panduanDeskripsi,
        ),
        panduanCtaKalkulator: bersih(
          l.panduanCtaKalkulator,
          BATAS_LANDING.panduanCta,
        ),
        panduanCtaSyarat: bersih(
          l.panduanCtaSyarat,
          BATAS_LANDING.panduanCta,
        ),
        panduan: l.panduan?.slice(0, JUMLAH_PANDUAN).map((item) => ({
          judul: bersih(item.judul, BATAS_LANDING.itemJudul),
          isi: bersih(item.isi, BATAS_LANDING.itemIsi),
        })),
        footerDeskripsi: bersih(
          l.footerDeskripsi,
          BATAS_LANDING.footerDeskripsi,
        ),
      };
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

/**
 * Simpan konten halaman pendana (upsert slot global).
 *
 * Objek `pendana` yang tersimpan digabung dengan nilai lama supaya berkas
 * proposal tidak ikut terhapus saat admin hanya mengubah teks. Field yang
 * dikosongkan dibiarkan `undefined`, sehingga pembacaan memakai teks bawaan.
 */
export const simpanKontenPendana = mutation({
  args: { pendana: VALIDASI_PENDANA },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const p = args.pendana;
    const bersih = (s: string | undefined, max: number) => {
      const t = s?.trim();
      return t ? t.slice(0, max) : undefined;
    };

    const existing = await ctx.db
      .query("pengumuman")
      .withIndex("by_slot", (q) => q.eq("slot", SLOT))
      .first();

    const patchPendana = {
      ...(existing?.pendana ?? {}),
      heroJudul: bersih(p.heroJudul, BATAS_PENDANA.heroJudul),
      heroDeskripsi: bersih(p.heroDeskripsi, BATAS_PENDANA.heroDeskripsi),
      heroCatatan: bersih(p.heroCatatan, BATAS_PENDANA.heroCatatan),
      prinsipJudul: bersih(p.prinsipJudul, BATAS_PENDANA.prinsipJudul),
      prinsipDeskripsi: bersih(
        p.prinsipDeskripsi,
        BATAS_PENDANA.prinsipDeskripsi,
      ),
      prinsip: p.prinsip?.slice(0, JUMLAH_PRINSIP).map((item) => ({
        judul: bersih(item.judul, BATAS_PENDANA.itemJudul),
        isi: bersih(item.isi, BATAS_PENDANA.itemIsi),
      })),
      kalkulatorJudul: bersih(
        p.kalkulatorJudul,
        BATAS_PENDANA.kalkulatorJudul,
      ),
      kalkulatorDeskripsi: bersih(
        p.kalkulatorDeskripsi,
        BATAS_PENDANA.kalkulatorDeskripsi,
      ),
      kalkulatorCatatan: bersih(
        p.kalkulatorCatatan,
        BATAS_PENDANA.kalkulatorCatatan,
      ),
      perhitunganJudul: bersih(
        p.perhitunganJudul,
        BATAS_PENDANA.perhitunganJudul,
      ),
      perhitunganDeskripsi: bersih(
        p.perhitunganDeskripsi,
        BATAS_PENDANA.perhitunganDeskripsi,
      ),
      proposalJudul: bersih(p.proposalJudul, BATAS_PENDANA.proposalJudul),
      proposalDeskripsi: bersih(
        p.proposalDeskripsi,
        BATAS_PENDANA.proposalDeskripsi,
      ),
      // Baris daftar tidak boleh `undefined` di dalam array; baris yang
      // dikosongkan ditulis sebagai string kosong dan pembacaan memakai
      // bawaan pada indeks yang sama.
      proposalIsi: p.proposalIsi
        ?.slice(0, JUMLAH_ISI_PROPOSAL)
        .map((baris) => bersih(baris, BATAS_PENDANA.proposalIsi) ?? ""),
      proposalCatatan: bersih(
        p.proposalCatatan,
        BATAS_PENDANA.proposalCatatan,
      ),
      proposalCatatanBerkas: bersih(
        p.proposalCatatanBerkas,
        BATAS_PENDANA.proposalCatatan,
      ),
      risikoJudul: bersih(p.risikoJudul, BATAS_PENDANA.risikoJudul),
      risikoDeskripsi: bersih(
        p.risikoDeskripsi,
        BATAS_PENDANA.risikoDeskripsi,
      ),
      risiko: p.risiko?.slice(0, JUMLAH_RISIKO).map((item) => ({
        judul: bersih(item.judul, BATAS_PENDANA.itemJudul),
        isi: bersih(item.isi, BATAS_PENDANA.itemIsi),
      })),
      faqJudul: bersih(p.faqJudul, BATAS_PENDANA.faqJudul),
      faqDeskripsi: bersih(p.faqDeskripsi, BATAS_PENDANA.faqDeskripsi),
      faq: p.faq?.slice(0, JUMLAH_FAQ).map((item) => ({
        tanya: bersih(item.tanya, BATAS_PENDANA.faqTanya),
        jawab: bersih(item.jawab, BATAS_PENDANA.faqJawab),
      })),
      ajakanJudul: bersih(p.ajakanJudul, BATAS_PENDANA.ajakanJudul),
      ajakanDeskripsi: bersih(
        p.ajakanDeskripsi,
        BATAS_PENDANA.ajakanDeskripsi,
      ),
    };

    const patch: Partial<Doc<"pengumuman">> = {
      pendana: patchPendana,
      diperbaruiPada: Date.now(),
    };
    if (existing === null) {
      await ctx.db.insert("pengumuman", {
        slot: SLOT,
        ...patch,
        diperbaruiPada: patch.diperbaruiPada ?? Date.now(),
      });
    } else {
      await ctx.db.patch(existing._id, patch);
    }
    return { ok: true };
  },
});

/** URL unggah berkas proposal — hanya admin aktif yang dapat memintanya. */
export const generateUploadProposalUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/** Gerbang admin untuk action: action tidak punya `ctx.db` untuk memeriksanya. */
export const _cekAdmin = internalQuery({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return true;
  },
});

/**
 * Tulis berkas proposal yang sudah lolos pemeriksaan isi.
 *
 * Dipisah dari action-nya karena membaca isi berkas (`storage.get`) hanya bisa
 * dilakukan action, sedangkan penulisan baris butuh mutation. Berkas lama
 * dihapus setelah pengganti tersimpan, supaya tidak ada periode tanpa
 * proposal.
 */
export const _pasangProposal = internalMutation({
  args: {
    berkasId: v.id("_storage"),
    namaBerkas: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("pengumuman")
      .withIndex("by_slot", (q) => q.eq("slot", SLOT))
      .first();
    const lama = existing?.pendana?.berkasId;

    const pendana = {
      ...(existing?.pendana ?? {}),
      berkasId: args.berkasId,
      berkasNama: args.namaBerkas,
      berkasPada: Date.now(),
    };
    if (existing === null) {
      await ctx.db.insert("pengumuman", {
        slot: SLOT,
        pendana,
        diperbaruiPada: Date.now(),
      });
    } else {
      await ctx.db.patch(existing._id, {
        pendana,
        diperbaruiPada: Date.now(),
      });
    }

    if (lama !== undefined && lama !== args.berkasId) {
      await ctx.storage.delete(lama);
    }
    return { ok: true, namaBerkas: args.namaBerkas };
  },
});

/**
 * Pasang proposal PDF yang diunggah admin.
 *
 * Isi berkas diperiksa, bukan hanya label MIME dari klien: unggahan langsung
 * ke storage tidak melewati server, jadi tipe yang diklaim pengunggah tidak
 * bisa dipercaya. Lima byte pertama PDF harus `%PDF-`. Tombol unduh di halaman
 * memakai berkas ini, bukan dokumen yang disusun otomatis, sampai admin
 * mengembalikannya ke mode otomatis.
 */
export const pasangProposal = action({
  args: { berkasId: v.id("_storage"), namaBerkas: v.optional(v.string()) },
  // Tipe balik ditulis eksplisit: action ini memanggil mutation di modul yang
  // sama lewat `internal`, dan tanpa anotasi tipe itu menjadi lingkaran
  // inferensi (TS7022) yang membuat seluruh DataModel ikut gagal dibaca.
  handler: async (ctx, args): Promise<{ ok: boolean; namaBerkas: string }> => {
    await ctx.runQuery(internal.announcements._cekAdmin, {});
    const blob = await ctx.storage.get(args.berkasId);
    if (blob === null) throw new Error("Berkas tidak ditemukan.");
    if (blob.size <= 0) throw new Error("Berkas kosong.");
    if (blob.size > MAKS_PROPOSAL_BYTE) {
      throw new Error(
        `Ukuran proposal melebihi ${Math.round(MAKS_PROPOSAL_BYTE / (1024 * 1024))} MB.`,
      );
    }
    const kepala = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
    const tandaPdf =
      kepala.length === 5 && String.fromCharCode(...kepala) === "%PDF-";
    if (!tandaPdf) {
      throw new Error("Proposal harus berupa berkas PDF.");
    }

    const nama = (args.namaBerkas ?? "")
      .trim()
      .slice(0, 120)
      .replace(/[\\/:*?"<>|]+/g, "-");
    const namaBerkas = nama !== "" ? nama : "proposal-pendanaan-pindai.pdf";
    return await ctx.runMutation(internal.announcements._pasangProposal, {
      berkasId: args.berkasId,
      namaBerkas,
    });
  },
});

/** Kembalikan unduhan ke proposal yang disusun aplikasi. */
export const hapusProposal = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const existing = await ctx.db
      .query("pengumuman")
      .withIndex("by_slot", (q) => q.eq("slot", SLOT))
      .first();
    if (existing?.pendana?.berkasId === undefined) return { ok: true };
    await ctx.db.patch(existing._id, {
      pendana: {
        ...existing.pendana,
        berkasId: undefined,
        berkasNama: undefined,
        berkasPada: undefined,
      },
      diperbaruiPada: Date.now(),
    });
    await ctx.storage.delete(existing.pendana.berkasId);
    return { ok: true };
  },
});

/**
 * Field teks CMS yang dipindai pembersih teks lama — hanya teks dan tautan
 * (bukan boolean/angka). Label dipakai untuk laporan ke admin.
 */
const FIELD_TEKS_LAMA: ReadonlyArray<{ field: string; label: string }> = [
  { field: "teks", label: "Teks berjalan" },
  { field: "tautan", label: "Tautan CTA bar" },
  { field: "popupJudul", label: "Judul popup" },
  { field: "popupIsi", label: "Isi popup" },
  { field: "popupCta", label: "Tombol popup" },
  { field: "floatJudul", label: "Judul widget mengambang" },
  { field: "floatIsi", label: "Isi widget mengambang" },
  { field: "floatCta", label: "Tombol widget mengambang" },
  { field: "logoTeks", label: "Teks logo" },
  { field: "nav1Label", label: "Menu nav 1" },
  { field: "nav2Label", label: "Menu nav 2" },
  { field: "nav3Label", label: "Menu nav 3" },
  { field: "nav4Label", label: "Menu nav 4" },
  { field: "heroBadge", label: "Badge hero" },
  { field: "heroJudul", label: "Judul hero" },
  { field: "heroJudul2", label: "Judul hero aksen" },
  { field: "heroSub", label: "Sub-judul hero" },
  { field: "heroCta1", label: "Tombol CTA 1" },
  { field: "heroCta2", label: "Tombol CTA 2" },
  { field: "chip1Label", label: "Chip 1 label" },
  { field: "chip1Nilai", label: "Chip 1 nilai" },
  { field: "chip2Label", label: "Chip 2 label" },
  { field: "chip2Nilai", label: "Chip 2 nilai" },
  { field: "layananJudul", label: "Judul bagian layanan" },
  { field: "layananSub", label: "Sub-judul layanan" },
  { field: "pinjamanJudul", label: "Judul kartu pinjaman" },
  { field: "pinjamanIsi", label: "Isi kartu pinjaman" },
  { field: "pinjamanCta", label: "Tombol kartu pinjaman" },
  { field: "gadaiJudul", label: "Judul kartu gadai" },
  { field: "gadaiIsi", label: "Isi kartu gadai" },
  { field: "gadaiCta", label: "Tombol kartu gadai" },
];

/**
 * Teks default lama (era penyedia dana) yang mungkin masih tersimpan walau tidak memuat
 * kata istilah lama (lihat KATA_TEKS_LAMA), mis. menyebut "alokasi".
 */
/**
 * Kata kunci teks lama era "Pendana" yang mungkin masih tersimpan pada
 * dokumen CMS. Nilai ini sengaja tetap literal — tugas pembersih justru
 * mendeteksi teks lama tersebut, jadi ini bukan identifier data.
 */
const KATA_TEKS_LAMA = "pendana";

const TEKS_LEGACY_DEFAULT = [
  "Pinjaman, gadai, dan alokasi dicatat di ledger internal PINDAI.",
];

/**
 * Pembersih teks CMS lama: field teks/tautan tersimpan yang masih menyebut
 * Teks lama era penyedia dana/pendanaan (atau persis teks default lamanya) dikosongkan,
 * sehingga `getPublic` otomatis memakai default baru di `DEFAULTS` — tidak ada
 * teks pengganti yang disalin manual dan bisa ikut basi.
 *
 * Teks kustom yang tidak menyebut konsep lama tidak disentuh. Operasi ini
 * idempoten: dijalankan dua kali, pemanggilan kedua melaporkan nol perubahan.
 */
export const bersihkanTeksLama = mutation({
  args: {},
  returns: v.object({ ok: v.boolean(), diganti: v.array(v.string()) }),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const existing = await ctx.db
      .query("pengumuman")
      .withIndex("by_slot", (q) => q.eq("slot", SLOT))
      .first();
    if (existing === null) return { ok: true, diganti: [] };

    const row = existing as unknown as Record<string, unknown>;
    const patch: Partial<Doc<"pengumuman">> = {};
    const diganti: string[] = [];
    for (const { field, label } of FIELD_TEKS_LAMA) {
      const nilai = row[field];
      if (typeof nilai !== "string") continue;
      const teksLama =
        new RegExp(KATA_TEKS_LAMA, "i").test(nilai) ||
        TEKS_LEGACY_DEFAULT.includes(nilai.trim());
      if (!teksLama) continue;
      patch[field as keyof Doc<"pengumuman">] = undefined as never;
      diganti.push(label);
    }

    if (diganti.length > 0) {
      await ctx.db.patch(existing._id, {
        ...patch,
        diperbaruiPada: Date.now(),
      });
    }
    return { ok: true, diganti };
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
