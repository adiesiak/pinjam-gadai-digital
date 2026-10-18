/**
 * Pengingat pembaruan aplikasi Android — server.
 *
 * Satu versi diumumkan sekali, lalu:
 *  1. pusat notifikasi setiap akun menampilkan satu kabar \"PINDAI x.y.z tersedia\"
 *     (dibaca dari tabel `pembaruanAplikasi`, seperti sumber notifikasi lain —
 *     tidak ada tabel notifikasi baru),
 *  2. admin dapat mengirim pesan WhatsApp ke pemilik akun yang punya nomor,
 *     lewat gateway yang sudah diatur di panel WhatsApp.
 *
 * Batas yang dijaga:
 *  - Hanya admin dengan sesi TOTP terverifikasi yang boleh mengumumkan dan
 *    mengirim (`requireAdminSession` / `assertAdminSession`).
 *  - Pengiriman berjalan BERTAHAP (default 10 pesan per klik) dan mencatat satu
 *    baris per penerima, jadi klik berulang tidak mengirim ulang pesan yang
 *    sudah terkirim. Kegagalan dicatat apa adanya, bukan dianggap terkirim.
 *  - Penerima hanya akun yang dipakai pemiliknya (bukan admin, bukan tamu,
 *    bukan akun catatan admin), dengan nomor yang benar-benar bisa dibaca.
 *    Dua akun bernomor sama hanya menerima satu pesan.
 *  - Modul ini tidak memindahkan uang dan tidak mengubah data pinjaman.
 */
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { api, internal } from "./_generated/api";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type QueryCtx,
} from "./_generated/server";
import { getAdminGateStatus, requireAdminSession } from "./adminAuthz";
import { ROLES } from "./schema";
import { audit } from "./system";
import {
  MAKS_KIRIM_SEKALI,
  pesanPembaruanWhatsapp,
  validasiPembaruan,
  versiMinimumWajib,
} from "../lib/pembaruanAplikasi";
import { nomorPenerimaUnik } from "../lib/pembaruanAplikasi";

/** Pesan per satu klik kirim. Dibatasi supaya action tidak menembus timeout. */
const KIRIM_PER_KLIK = 10;
/** Bagian penerima yang dikirim ke panel dalam satu query. */
const BATAS_PENERIMA = 300;
/** Riwayat pengumuman yang diperiksa untuk versi wajib (satu baris per rilis). */
const BATAS_PENGUMUMAN = 100;

type Penerima = { userId: Id<"users">; nama: string; nomor: string };

type BarisPembaruan = {
  _id: Id<"pembaruanAplikasi">;
  versiKode: number;
  versiNama: string;
  tautan: string;
  catatan: string | null;
  wajibDiperbarui: boolean;
  diumumkanPada: number;
  diumumkanOleh: string | null;
};

/** Baris versi terbaru, atau null bila belum ada yang diumumkan. */
async function versiTerbaru(ctx: QueryCtx): Promise<BarisPembaruan | null> {
  const row = await ctx.db
    .query("pembaruanAplikasi")
    .withIndex("by_versiKode")
    .order("desc")
    .first();
  if (row === null) return null;
  return {
    _id: row._id,
    versiKode: row.versiKode,
    versiNama: row.versiNama,
    tautan: row.tautan,
    catatan: row.catatan ?? null,
    wajibDiperbarui: row.wajibDiperbarui === true,
    diumumkanPada: row.diumumkanPada,
    diumumkanOleh: row.diumumkanOleh ?? null,
  };
}

/**
 * Susun daftar penerima dari akun + profil nasabah.
 *
 * Nomor diambil dari `nasabahProfil` lebih dulu karena itulah nomor yang
 * dipakai KYC dan penagihan; nomor di `users` hanya untuk akun pendana yang
 * mengisinya sendiri. Nomor yang tidak lolos normalisasi tidak pernah dipakai.
 */
async function susunPenerima(
  ctx: QueryCtx,
): Promise<{ penerima: Penerima[]; tanpaNomor: number; duplikat: number }> {
  const [pengguna, profil] = await Promise.all([
    ctx.db.query("users").collect(),
    ctx.db.query("nasabahProfil").collect(),
  ]);
  const petaProfil = new Map(profil.map((p) => [p.userId, p]));

  const kandidat = pengguna
    .filter(
      (u) =>
        u.role !== ROLES.ADMIN &&
        u.isAnonymous !== true &&
        u.dibuatAdminPada === undefined,
    )
    .map((u) => ({
      userId: u._id as string,
      nama: petaProfil.get(u._id)?.namaLengkap ?? u.name ?? "Nasabah",
      nomor: petaProfil.get(u._id)?.nomorWhatsApp ?? u.nomorWhatsApp ?? null,
    }));

  const hasil = nomorPenerimaUnik(kandidat);
  return {
    penerima: hasil.penerima.map((p) => ({
      userId: p.userId as Id<"users">,
      nama: p.nama,
      nomor: p.nomor,
    })),
    tanpaNomor: hasil.tanpaNomor,
    duplikat: hasil.duplikat,
  };
}

/** Versi terumumkan — publik, tanpa data penerima. */
export const terbaru = query({
  args: {},
  handler: async (ctx) => await versiTerbaru(ctx),
});

/**
 * Batas bawah versi yang masih boleh dipakai — dibaca lapisan web dari UA.
 *
 * Publik dan tanpa data penerima: yang dikembalikan hanya angka versi dan
 * tautan unduhan yang memang sudah dikirim ke semua penerima. Halaman yang
 * memakainya tidak perlu sesi, justru karena APK lama harus bisa menampilkan
 * layar perbarui sebelum apa pun dimuat.
 */
export const wajib = query({
  args: {},
  handler: async (ctx) => {
    const baris = await ctx.db
      .query("pembaruanAplikasi")
      .withIndex("by_versiKode")
      .order("desc")
      .take(BATAS_PENGUMUMAN);
    const minimum = versiMinimumWajib(baris);
    if (minimum === null) return { versiMinimum: null, versiNama: null, tautan: null };
    const barisMinimum = baris.find((b) => b.versiKode === minimum) ?? null;
    return {
      versiMinimum: minimum,
      versiNama: barisMinimum?.versiNama ?? null,
      tautan: barisMinimum?.tautan ?? null,
    };
  },
});

/**
 * Ringkasan untuk panel admin: versi terbaru dan hasil kirim WhatsApp-nya.
 * Null bila pemanggil bukan admin.
 */
export const status = query({
  args: {},
  handler: async (ctx) => {
    const gate = await getAdminGateStatus(ctx);
    if (!gate.isAdmin) return null;
    await requireAdminSession(ctx);

    const terbaru = await versiTerbaru(ctx);
    const { penerima, tanpaNomor, duplikat } = await susunPenerima(ctx);
    const catatanKirim =
      terbaru === null
        ? []
        : await ctx.db
            .query("pembaruanAplikasiWa")
            .withIndex("by_versiKode", (q) => q.eq("versiKode", terbaru.versiKode))
            .collect();

    return {
      terbaru,
      jumlahPenerima: penerima.length,
      tanpaNomor,
      duplikat,
      terkirim: catatanKirim.filter((b) => b.status === "terkirim").length,
      gagal: catatanKirim.filter((b) => b.status === "gagal").length,
    };
  },
});

/**
 * Daftar penerima WhatsApp untuk versi terbaru beserta status kirim per akun.
 * Hanya untuk admin; nomor di sini memang data yang dikelola admin.
 */
export const penerima = query({
  args: {},
  handler: async (ctx) => {
    const gate = await getAdminGateStatus(ctx);
    if (!gate.isAdmin) return null;
    await requireAdminSession(ctx);

    const terbaru = await versiTerbaru(ctx);
    const { penerima: daftar, tanpaNomor, duplikat } = await susunPenerima(ctx);
    const kirim =
      terbaru === null
        ? []
        : await ctx.db
            .query("pembaruanAplikasiWa")
            .withIndex("by_versiKode", (q) => q.eq("versiKode", terbaru.versiKode))
            .collect();
    const statusPerAkun = new Map(kirim.map((b) => [b.userId, b.status]));

    return {
      jumlah: daftar.length,
      tanpaNomor,
      duplikat,
      daftar: daftar.slice(0, BATAS_PENERIMA).map((p) => ({
        nama: p.nama,
        nomor: p.nomor,
        status: statusPerAkun.get(p.userId) ?? "belum",
      })),
      terpotong: daftar.length > BATAS_PENERIMA,
    };
  },
});

/**
 * Umumkan satu versi. Menolak versi yang sudah pernah diumumkan — itulah yang
 * membuat notifikasi dan pesan WhatsApp tidak berulang untuk versi yang sama.
 */
export const umumkan = mutation({
  args: {
    versiKode: v.number(),
    versiNama: v.string(),
    tautan: v.string(),
    catatan: v.optional(v.string()),
    /** Versi di bawah ini berhenti bisa dipakai (layar wajib perbarui). */
    wajibDiperbarui: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { userId, user } = await requireAdminSession(ctx);
    const cek = validasiPembaruan(args);
    if (!cek.ok) throw new Error(cek.alasan);
    if (!/^https?:\/\//i.test(cek.nilai.tautan)) {
      throw new Error(
        "Tautan unduhan harus alamat http(s) utuh agar bisa dibuka penerima WhatsApp.",
      );
    }

    const sudahAda = await ctx.db
      .query("pembaruanAplikasi")
      .withIndex("by_versiKode", (q) => q.eq("versiKode", cek.nilai.versiKode))
      .first();
    if (sudahAda !== null) {
      throw new Error(
        `Versi ${sudahAda.versiNama} (kode ${sudahAda.versiKode}) sudah diumumkan.`,
      );
    }

    const label = user.email ?? user.name ?? "admin";
    await ctx.db.insert("pembaruanAplikasi", {
      ...cek.nilai,
      diumumkanPada: Date.now(),
      diumumkanOleh: label,
    });
    await audit(
      ctx,
      userId,
      label,
      "umumkan_pembaruan_aplikasi",
      `PINDAI ${cek.nilai.versiNama}`,
      `Pengingat pembaruan aplikasi diumumkan (versionCode ${cek.nilai.versiKode}); notifikasi dalam aplikasi aktif untuk semua pengguna.${
        cek.nilai.wajibDiperbarui === true
          ? ` Versi di bawah ${cek.nilai.versiKode} diwajibkan memperbarui.`
          : ""
      }`,
    );
    return { ok: true as const, versiKode: cek.nilai.versiKode };
  },
});

/** Data yang dibutuhkan action pengiriman; dipanggil setelah gerbang admin. */
type KonteksKirim = {
  pembaruan: {
    versiKode: number;
    versiNama: string;
    tautan: string;
    catatan: string | null;
  };
  penerima: Penerima[];
  sudah: string[];
};

export const _konteksKirim = internalQuery({
  args: { versiKode: v.number() },
  handler: async (ctx, { versiKode }): Promise<KonteksKirim> => {
    const row = await ctx.db
      .query("pembaruanAplikasi")
      .withIndex("by_versiKode", (q) => q.eq("versiKode", versiKode))
      .first();
    if (row === null) throw new Error("Versi ini belum diumumkan.");

    const { penerima } = await susunPenerima(ctx);
    const sudahKirim = await ctx.db
      .query("pembaruanAplikasiWa")
      .withIndex("by_versiKode", (q) => q.eq("versiKode", versiKode))
      .collect();

    return {
      pembaruan: {
        versiKode: row.versiKode,
        versiNama: row.versiNama,
        tautan: row.tautan,
        catatan: row.catatan ?? null,
      },
      penerima,
      sudah: sudahKirim
        .filter((b) => b.status === "terkirim")
        .map((b) => b.userId as string),
    };
  },
});

/** Catat hasil satu pesan — upsert per (versi, akun). */
export const _catatKirim = internalMutation({
  args: {
    versiKode: v.number(),
    userId: v.id("users"),
    nomor: v.string(),
    status: v.union(v.literal("terkirim"), v.literal("gagal")),
    respon: v.string(),
  },
  handler: async (ctx, args) => {
    const sekarang = Date.now();
    const respon = args.respon.slice(0, 200);
    const ada = await ctx.db
      .query("pembaruanAplikasiWa")
      .withIndex("by_versiKode_userId", (q) =>
        q.eq("versiKode", args.versiKode).eq("userId", args.userId),
      )
      .first();
    if (ada === null) {
      await ctx.db.insert("pembaruanAplikasiWa", { ...args, respon, pada: sekarang });
    } else {
      await ctx.db.patch(ada._id, {
        nomor: args.nomor,
        status: args.status,
        respon,
        pada: sekarang,
      });
    }
  },
});

/**
 * Kirim pengingat WhatsApp untuk versi yang sudah diumumkan, bertahap.
 *
 * Satu klik mengirim paling banyak `KIRIM_PER_KLIK` pesan; pemanggil
 * mengulanginya sampai `sisa` nol. Pesan disusun dari data versi yang
 * tersimpan, bukan dari argumen klien, sehingga panel tidak bisa mengubah isi
 * pesan tanpa mengubah pengumumannya.
 */
/** Hasil satu gelombang kirim — dibaca panel sebagai teks, bukan dihitung ulang. */
type HasilKirim = {
  terkirim: number;
  gagal: number;
  total: number;
  sisa: number;
  alasanTerakhir: string;
};

export const kirimWhatsapp = action({
  args: {
    versiKode: v.number(),
    batas: v.optional(v.number()),
  },
  handler: async (ctx, { versiKode, batas }): Promise<HasilKirim> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
    await ctx.runQuery(api.security.assertAdminSession, {});

    const konteks: KonteksKirim = await ctx.runQuery(
      internal.pembaruanAplikasi._konteksKirim,
      { versiKode },
    );
    const sudah = new Set<string>(konteks.sudah);
    const antre = konteks.penerima.filter((p) => !sudah.has(p.userId as string));

    const jatah = Math.min(
      MAKS_KIRIM_SEKALI,
      Math.max(1, Math.round(batas ?? KIRIM_PER_KLIK)),
    );
    const gelombang = antre.slice(0, jatah);

    let terkirim = 0;
    let gagal = 0;
    let alasanTerakhir = "";

    for (const p of gelombang) {
      const isi = pesanPembaruanWhatsapp({
        nama: p.nama,
        versiNama: konteks.pembaruan.versiNama,
        tautan: konteks.pembaruan.tautan,
        catatan: konteks.pembaruan.catatan,
      });
      const hasil = await ctx.runAction(internal.whatsapp._kirimPesanUmum, {
        nomor: p.nomor,
        isi,
      });
      if (hasil.ok) terkirim += 1;
      else {
        gagal += 1;
        alasanTerakhir = hasil.respon;
      }
      await ctx.runMutation(internal.pembaruanAplikasi._catatKirim, {
        versiKode,
        userId: p.userId,
        nomor: p.nomor,
        status: hasil.ok ? "terkirim" : "gagal",
        respon: hasil.respon,
      });
    }

    return {
      terkirim,
      gagal,
      total: antre.length,
      sisa: antre.length - gelombang.length,
      alasanTerakhir,
    };
  },
});
