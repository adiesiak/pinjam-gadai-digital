/**
 * MINAT CALON PENDANA — formulir publik dan daftar tindak lanjut admin.
 *
 * Formulir ini bukan pembukaan akun, bukan pengajuan pinjaman, dan tidak
 * memindahkan uang. Ia hanya mencatat orang yang ingin dihubungi tim PINDAI
 * untuk membahas pendanaan. Karena itu:
 *  - tidak ada KTP, rekening, atau dokumen di sini;
 *  - nomor WhatsApp dinormalisasi ke 62… supaya admin bisa langsung membuka
 *    `wa.me`, tanpa menebak format;
 *  - pengiriman publik melewati gerbang yang sama (honeypot, jeda waktu,
 *    pembatas laju) dengan formulir pengajuan, tetapi kuncinya dihitung dari
 *    HASH nomor — bukan dari akun yang belum tentu dimiliki pelamar;
 *  - daftar dan perubahan status hanya untuk admin dengan TOTP terverifikasi.
 *
 * Satu nomor yang mengirim lagi dalam 24 jam memperbarui baris yang sama, bukan
 * membuat antrean duplikat. Ini juga mencegah dua klik cepat menjadi dua lead.
 */
import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireAdminSession } from "./adminAuthz";
import { periksaGerbangKirim, hashPermintaan } from "../lib/gerbangKirim";
import { normalisasiNomorWa } from "../lib/otpWa";
import { catatKirimGerbang, periksaBatasGerbang } from "./gerbangKirim";

const STATUS_MINAT = v.union(
  v.literal("baru"),
  v.literal("dihubungi"),
  v.literal("selesai"),
  v.literal("batal"),
);

const SUMBER_MINAT = v.union(
  v.literal("instagram"),
  v.literal("whatsapp"),
  v.literal("komunitas"),
  v.literal("rekomendasi"),
  v.literal("lainnya"),
);

const MASA_DUPLIKAT_MS = 24 * 60 * 60 * 1000;
const MIN_NOMINAL = 100_000;
const MAKS_NOMINAL = 1_000_000_000;
const MAKS_CATATAN = 500;
const MAKS_KOTA = 60;
const MAKS_NAMA = 80;

function rapikan(teks: string): string {
  return teks.trim().replace(/\s+/g, " ");
}

function pesanGalat(teks: string): { ok: false; alasan: string } {
  return { ok: false, alasan: teks };
}

/**
 * Simpan satu minat dari halaman publik.
 *
 * Mengembalikan alasan sebagai NILAI, bukan melempar, supaya formulir bisa
 * menampilkannya di dekat kolom dan pengiriman yang ditolak tidak menghapus
 * catatan pembatas laju yang sudah dibuat.
 */
export const kirimMinat = mutation({
  args: {
    nama: v.string(),
    nomorWhatsApp: v.string(),
    nominalRencana: v.number(),
    kota: v.string(),
    catatan: v.optional(v.string()),
    sumber: v.optional(SUMBER_MINAT),
    setuju: v.boolean(),
    /** Cap waktu formulir dibuka di klien; hanya sinyal, bukan izin. */
    formDibukaPada: v.optional(v.number()),
    /** Kolom jebakan; pengguna sungguhan tidak pernah mengisinya. */
    jebakan: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const nama = rapikan(args.nama);
    if (nama.length < 2 || nama.length > MAKS_NAMA) {
      return pesanGalat("Nama harus 2–80 karakter.");
    }
    const nomor = normalisasiNomorWa(args.nomorWhatsApp);
    if (nomor === null) {
      return pesanGalat("Nomor WhatsApp belum sah. Contoh: 0812 3456 7890.");
    }
    if (
      !Number.isSafeInteger(args.nominalRencana) ||
      args.nominalRencana < MIN_NOMINAL ||
      args.nominalRencana > MAKS_NOMINAL
    ) {
      return pesanGalat("Nominal rencana harus berupa rupiah bulat antara Rp100.000 dan Rp1.000.000.000.");
    }
    const kota = rapikan(args.kota);
    if (kota.length < 2 || kota.length > MAKS_KOTA) {
      return pesanGalat("Kota harus 2–60 karakter.");
    }
    const catatan = args.catatan === undefined ? undefined : args.catatan.trim();
    if (catatan !== undefined && catatan.length > MAKS_CATATAN) {
      return pesanGalat(`Catatan maksimal ${MAKS_CATATAN} karakter.`);
    }
    if (!args.setuju) {
      return pesanGalat("Centang persetujuan agar tim PINDAI boleh menghubungi Anda.");
    }

    // Kunci pembatas laju memakai hash nomor, bukan nomor mentah: tabel jejak
    // gerbang tidak perlu menyimpan PII tambahan.
    const kunci = `minat-pendana:${hashPermintaan({ nomor }, 24)}`;
    const batas = await periksaBatasGerbang(ctx, kunci);
    if (!batas.lolos) return pesanGalat(batas.alasan);

    const sekarang = Date.now();
    const gerbang = periksaGerbangKirim({
      jebakan: args.jebakan,
      formDibukaPada: args.formDibukaPada,
      dikirimPada: sekarang,
    });
    if (!gerbang.lolos) return pesanGalat(gerbang.alasan);

    await catatKirimGerbang(ctx, kunci);

    const sebelumnya = await ctx.db
      .query("minatPendana")
      .withIndex("by_nomor", (q) => q.eq("nomorWhatsApp", nomor))
      .order("desc")
      .first();

    if (sebelumnya !== null && sekarang - sebelumnya.dibuatPada < MASA_DUPLIKAT_MS) {
      await ctx.db.patch(sebelumnya._id, {
        nama,
        nominalRencana: args.nominalRencana,
        kota,
        ...(catatan === undefined ? {} : { catatan }),
        ...(args.sumber === undefined ? {} : { sumber: args.sumber }),
        diperbaruiPada: sekarang,
      });
      return { ok: true as const, duplikat: true };
    }

    await ctx.db.insert("minatPendana", {
      nama,
      nomorWhatsApp: nomor,
      nominalRencana: args.nominalRencana,
      kota,
      ...(catatan === undefined || catatan === "" ? {} : { catatan }),
      ...(args.sumber === undefined ? {} : { sumber: args.sumber }),
      status: "baru",
      persetujuanPada: sekarang,
      dibuatPada: sekarang,
    });
    return { ok: true as const, duplikat: false };
  },
});

/** Daftar prospek terbaru untuk admin. */
export const daftar = query({
  args: { status: v.optional(STATUS_MINAT) },
  handler: async (ctx, { status }) => {
    await requireAdminSession(ctx);
    const rows = await ctx.db
      .query("minatPendana")
      .withIndex("by_dibuatPada")
      .order("desc")
      .take(200);
    return status === undefined ? rows : rows.filter((row) => row.status === status);
  },
});

/**
 * Ubah status tindak lanjut. Tidak mengirim WhatsApp otomatis: tombol panel
 * membuka percakapan manusia, dan perubahan status tetap meninggalkan audit.
 */
export const ubahStatus = mutation({
  args: {
    id: v.id("minatPendana"),
    status: STATUS_MINAT,
  },
  handler: async (ctx, args) => {
    const admin = await requireAdminSession(ctx);
    const row = await ctx.db.get(args.id);
    if (row === null) throw new Error("Minat pendana tidak ditemukan.");
    if (row.status === args.status) return { ok: true as const };

    const waktu = Date.now();
    await ctx.db.patch(args.id, {
      status: args.status,
      diperbaruiPada: waktu,
      olehUserId: admin.userId,
    });
    await ctx.db.insert("auditLog", {
      aktorUserId: admin.userId,
      aktorLabel: admin.user.email ?? admin.user.name ?? "Admin",
      aksi: "minat_pendana_status",
      target: args.id,
      detail: `${row.status} -> ${args.status}`,
      waktu,
    });
    return { ok: true as const };
  },
});
