/**
 * CONTOH DATA RUANG PENDANA — portofolio akun "PENDANA UJI COBA".
 *
 * Ruang /penyedia-dana kosong sulit dinilai: tabel, ringkasan keuntungan, dan
 * pembagian marjin baru terlihat bentuknya setelah ada pinjaman yang benar-benar
 * berjalan. Modul ini menyiapkan angka contoh tanpa memakai data pendana
 * sungguhan:
 *
 *  - Pinjaman BERJALAN Rp2.000.000 (28 hari, bunga 30%) — didanai 12 hari lalu.
 *    Marjin Rp600.000 dibagi 47 : 13 menjadi pendana Rp470.000 dan platform
 *    Rp130.000. Di tabel ia muncul sebagai "Perkiraan (belum lunas)".
 *  - Pinjaman LUNAS Rp1.000.000 — didanai 40 hari lalu dan lunas 12 hari lalu.
 *    Marjin Rp300.000 menjadi pendana Rp235.000 dan platform Rp65.000. Ini yang
 *    mengisi kolom "Dibukukan (lunas)"; transfer keuntungannya sengaja belum
 *    dicatat supaya saringan "Transfer tertunda" ada isinya.
 *
 * Batas yang disengaja: TIDAK ada dompet, ledger, setoran, penarikan, atau
 * siklus 30 hari yang dibuat. Dua baris pinjaman tidak menciptakan kewajiban
 * pencairan, jadi menjalankan seed ini tidak memindahkan uang dan tidak bisa
 * membuat saldo pendana berubah.
 *
 * Tidak diekspos ke klien (internalMutation). Jalankan lewat CLI:
 *
 *   bunx convex run contohPendana:buat '{"konfirmasi":"BUAT_CONTOH_PENDANA"}'
 *   bunx convex run contohPendana:ringkas '{}'
 *   bunx convex run contohPendana:hapus '{"konfirmasi":"HAPUS_CONTOH_PENDANA"}'
 *
 * Idempoten: akun dan pinjaman dikenali dari email, nomor WhatsApp, dan nomor
 * referensi tetap; menjalankan ulang tidak membuat duplikat.
 */
import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { hakPendana } from "../lib/imbalPendana";
import { persenBungaHarian } from "../lib/loan";
import { ruangPendana } from "./penyediaDana";
import { ROLES } from "./schema";
import { audit } from "./system";

/** Identitas tetap — juga dipakai untuk mencari baris yang sudah ada. */
const NAMA_PENDANA = "PENDANA UJI COBA";
const EMAIL_PENDANA = "pendana.uji@pindai.test";
const NAMA_PEMINJAM = "PEMINJAM CONTOH PINDAI";
const WA_PEMINJAM = "628000000010";

const REF_BERJALAN = "PGD-CONTOH-0001";
const REF_LUNAS = "PGD-CONTOH-0002";

const KONFIRMASI_BUAT = "BUAT_CONTOH_PENDANA";
const KONFIRMASI_HAPUS = "HAPUS_CONTOH_PENDANA";

const HARI_MS = 86_400_000;

/** Aktor audit: admin yang disebut CLI, atau penanda seed internal. */
async function aktorSeed(
  ctx: MutationCtx,
  adminEmail: string | undefined,
): Promise<{ userId: Id<"users"> | undefined; label: string }> {
  const email = adminEmail?.trim().toLowerCase();
  if (email === undefined || email === "") {
    return { userId: undefined, label: "Seed contoh pendana (CLI)" };
  }
  const admin = await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", email))
    .first();
  if (admin === null || admin.role !== ROLES.ADMIN) {
    throw new Error(`Email ${email} bukan akun admin. Periksa lagi.`);
  }
  return {
    userId: admin._id,
    label: admin.email?.trim() || admin.name?.trim() || "admin",
  };
}

async function cariPenggunaEmail(ctx: QueryCtx | MutationCtx, email: string) {
  return await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", email))
    .first();
}

async function cariPenggunaNomor(ctx: QueryCtx | MutationCtx, nomor: string) {
  return await ctx.db
    .query("users")
    .withIndex("by_nomorWhatsApp", (q) => q.eq("nomorWhatsApp", nomor))
    .first();
}

/**
 * Pinjaman contoh milik akun uji. Dicari dari nomor referensi tetapnya: jendela
 * 200 pengajuan terbaru cukup karena seed dijalankan pada data yang baru dibuat,
 * dan tidak perlu indeks baru hanya untuk satu perintah CLI.
 */
async function cariPinjamanContoh(ctx: MutationCtx) {
  const jendela = await ctx.db.query("loans").order("desc").take(200);
  return {
    berjalan: jendela.find((row) => row.nomorReferensi === REF_BERJALAN) ?? null,
    lunas: jendela.find((row) => row.nomorReferensi === REF_LUNAS) ?? null,
  };
}

export const buat = internalMutation({
  args: {
    konfirmasi: v.string(),
    adminEmail: v.optional(v.string()),
  },
  handler: async (ctx, { konfirmasi, adminEmail }) => {
    if (konfirmasi !== KONFIRMASI_BUAT) {
      throw new Error(`Tulis konfirmasi "${KONFIRMASI_BUAT}" untuk menjalankan seed.`);
    }
    const aktor = await aktorSeed(ctx, adminEmail);
    const sekarang = Date.now();

    // ==== Akun pendana uji ====
    const pendanaAda = await cariPenggunaEmail(ctx, EMAIL_PENDANA);
    let pendanaId: Id<"users">;
    if (pendanaAda === null) {
      pendanaId = await ctx.db.insert("users", {
        name: NAMA_PENDANA,
        email: EMAIL_PENDANA,
        emailVerificationTime: sekarang,
        role: ROLES.DANA,
        isAnonymous: false,
        dibuatAdminPada: sekarang,
      });
    } else if (pendanaAda.role !== ROLES.DANA) {
      throw new Error(
        `${EMAIL_PENDANA} sudah dipakai akun lain (${pendanaAda.role ?? "tanpa peran"}). Ganti dulu sebelum menjalankan seed.`,
      );
    } else if (pendanaAda.name !== NAMA_PENDANA) {
      throw new Error(
        `Akun ${EMAIL_PENDANA} bernama "${pendanaAda.name ?? "tanpa nama"}". Seed tidak menimpa akun yang sudah ada.`,
      );
    } else {
      pendanaId = pendanaAda._id;
    }

    // ==== Akun peminjam contoh (tanpa kredensial masuk) ====
    const peminjamAda = await cariPenggunaNomor(ctx, WA_PEMINJAM);
    let peminjamId: Id<"users">;
    if (peminjamAda === null) {
      peminjamId = await ctx.db.insert("users", {
        name: NAMA_PEMINJAM,
        role: ROLES.PEMINJAM,
        isAnonymous: false,
        nomorWhatsApp: WA_PEMINJAM,
        dibuatAdminPada: sekarang,
      });
    } else if (peminjamAda.name !== NAMA_PEMINJAM) {
      throw new Error(
        `Nomor ${WA_PEMINJAM} sudah dipakai "${peminjamAda.name ?? "tanpa nama"}". Seed tidak menimpa akun yang sudah ada.`,
      );
    } else {
      peminjamId = peminjamAda._id;
    }

    // ==== Dua pinjaman contoh ====
    const ada = await cariPinjamanContoh(ctx);
    for (const [label, loan] of [
      [REF_BERJALAN, ada.berjalan],
      [REF_LUNAS, ada.lunas],
    ] as const) {
      if (loan !== null && (loan.userId !== peminjamId || loan.pendanaId !== pendanaId)) {
        throw new Error(
          `Nomor referensi ${label} sudah dipakai pinjaman lain. Seed dihentikan; periksa data sebelum melanjutkan.`,
        );
      }
    }

    const bungaBerjalan = persenBungaHarian(2_000_000, 28) ?? 30;
    const bungaLunas = persenBungaHarian(1_000_000, 28) ?? 30;

    const idBerjalan =
      ada.berjalan?._id ??
      (await ctx.db.insert("loans", {
        userId: peminjamId,
        pokokPinjaman: 2_000_000,
        pokokDiajukan: 2_000_000,
        tujuan: "modal_usaha",
        catatanPeminjam:
          "Contoh data ruang pendana. Bukan pengajuan sungguhan; dibuat untuk memeriksa tampilan portofolio.",
        namaLengkap: NAMA_PEMINJAM,
        namaBank: "BCA",
        nomorRekening: "0000000001",
        status: "didanai",
        nomorReferensi: REF_BERJALAN,
        tenorHari: 28,
        cairEkspres: false,
        persenBunga: bungaBerjalan,
        diajukanPada: sekarang - 13 * HARI_MS,
        didanaiPada: sekarang - 12 * HARI_MS,
        pendanaId,
        pendanaNama: NAMA_PENDANA,
      }));

    const idLunas =
      ada.lunas?._id ??
      (await ctx.db.insert("loans", {
        userId: peminjamId,
        pokokPinjaman: 1_000_000,
        pokokDiajukan: 1_000_000,
        tujuan: "modal_usaha",
        catatanPeminjam:
          "Contoh data ruang pendana (sudah lunas). Bukan pengajuan sungguhan.",
        namaLengkap: NAMA_PEMINJAM,
        namaBank: "BCA",
        nomorRekening: "0000000001",
        status: "lunas",
        nomorReferensi: REF_LUNAS,
        tenorHari: 28,
        cairEkspres: false,
        persenBunga: bungaLunas,
        diajukanPada: sekarang - 41 * HARI_MS,
        didanaiPada: sekarang - 40 * HARI_MS,
        lunasPada: sekarang - 12 * HARI_MS,
        pendanaId,
        pendanaNama: NAMA_PENDANA,
      }));

    await audit(
      ctx,
      aktor.userId,
      aktor.label,
      "seed_contoh_pendana",
      EMAIL_PENDANA,
      `Contoh data ruang pendana: ${REF_BERJALAN} (berjalan, Rp2.000.000) dan ${REF_LUNAS} (lunas, Rp1.000.000).`,
    );

    // Angka pembagian diambil dari mesin yang sama dengan ruang pendana, bukan
    // disalin dari dokumentasi, supaya balasan CLI bisa dicocokkan langsung
    // dengan yang tampil di layar.
    const ringkas = (pokok: number, bunga: number) => {
      const hak = hakPendana(pokok, { pokokPinjaman: pokok, persenBunga: bunga });
      return {
        pokok,
        margin: hak.marginTotal,
        pendana: hak.keuntungan,
        platform: hak.potonganAdmin,
      };
    };

    return {
      ok: true as const,
      pendanaId,
      peminjamId,
      pinjaman: [idBerjalan, idLunas],
      pembagian: {
        berjalan: ringkas(2_000_000, bungaBerjalan),
        lunas: ringkas(1_000_000, bungaLunas),
      },
    };
  },
});

const AWALAN_REF = "PGD-CONTOH-";

/**
 * Angka yang benar-benar dilihat akun uji di ruang /penyedia-dana.
 *
 * Memakai `ruangPendana` yang sama dengan halaman, bukan hitungan kedua: kalau
 * angka di sini cocok dengan layar, yang diuji adalah layarnya, bukan salinan
 * rumusnya. Membaca sebagai akun pendana uji, jadi cakupannya otomatis hanya
 * pinjaman miliknya.
 */
export const ringkas = internalQuery({
  args: {},
  handler: async (ctx) => {
    const pendana = await cariPenggunaEmail(ctx, EMAIL_PENDANA);
    if (pendana === null) return null;
    const ruang = await ruangPendana(ctx, pendana);
    return {
      rekap: ruang.rekapPendana.find((row) => row.nama === NAMA_PENDANA) ?? null,
      pinjaman: ruang.pinjaman
        .filter((row) => row.nomorReferensi.startsWith(AWALAN_REF))
        .map((row) => ({
          nomorReferensi: row.nomorReferensi,
          status: row.status,
          pokok: row.pokokPinjaman,
          keuntunganPendana: row.keuntunganPendana,
          biayaPlatform: row.keuntunganAdmin,
          transfer: row.transfer.status,
        })),
    };
  },
});

export const hapus = internalMutation({
  args: {
    konfirmasi: v.string(),
    adminEmail: v.optional(v.string()),
  },
  handler: async (ctx, { konfirmasi, adminEmail }) => {
    if (konfirmasi !== KONFIRMASI_HAPUS) {
      throw new Error(`Tulis konfirmasi "${KONFIRMASI_HAPUS}" untuk menghapus contoh.`);
    }
    const aktor = await aktorSeed(ctx, adminEmail);
    const ada = await cariPinjamanContoh(ctx);
    let dihapus = 0;
    for (const loan of [ada.berjalan, ada.lunas]) {
      if (loan === null) continue;
      if (loan.pendanaNama !== NAMA_PENDANA) {
        throw new Error(
          `${loan.nomorReferensi} bukan milik ${NAMA_PENDANA}. Hapus dibatalkan agar data lain tidak ikut hilang.`,
        );
      }
      await ctx.db.delete(loan._id);
      dihapus += 1;
    }

    // Akun peminjam contoh hanya dihapus bila tidak punya pinjaman lain.
    const peminjam = await cariPenggunaNomor(ctx, WA_PEMINJAM);
    let peminjamDihapus = false;
    if (peminjam !== null && peminjam.name === NAMA_PEMINJAM) {
      const sisa = await ctx.db
        .query("loans")
        .withIndex("by_user", (q) => q.eq("userId", peminjam._id))
        .first();
      if (sisa === null) {
        await ctx.db.delete(peminjam._id);
        peminjamDihapus = true;
      }
    }

    // Akun pendana dipertahankan bila sudah dipakai data lain; bila tidak,
    // dihapus supaya daftar akun pendana tidak menyisakan akun contoh.
    const pendana = await cariPenggunaEmail(ctx, EMAIL_PENDANA);
    let pendanaDihapus = false;
    if (pendana !== null && pendana.name === NAMA_PENDANA) {
      const [pinjamanSisa, alokasiSisa, siklusSisa] = await Promise.all([
        ctx.db
          .query("loans")
          .withIndex("by_pendana", (q) => q.eq("pendanaId", pendana._id))
          .first(),
        ctx.db
          .query("fundings")
          .withIndex("by_dana", (q) => q.eq("danaId", pendana._id))
          .first(),
        ctx.db
          .query("siklusPendana")
          .withIndex("by_pendana", (q) => q.eq("pendanaId", pendana._id))
          .first(),
      ]);
      if (pinjamanSisa === null && alokasiSisa === null && siklusSisa === null) {
        await ctx.db.delete(pendana._id);
        pendanaDihapus = true;
      }
    }

    await audit(
      ctx,
      aktor.userId,
      aktor.label,
      "hapus_contoh_pendana",
      EMAIL_PENDANA,
      `Menghapus ${dihapus} pinjaman contoh. Akun peminjam ${peminjamDihapus ? "dihapus" : "dipertahankan"}; akun pendana ${pendanaDihapus ? "dihapus" : "dipertahankan"}.`,
    );

    return { ok: true as const, pinjamanDihapus: dihapus, peminjamDihapus, pendanaDihapus };
  },
});
