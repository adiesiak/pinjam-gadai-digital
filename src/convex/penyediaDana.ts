/**
 * Ruang penyedia dana — HANYA BACA.
 *
 * Menampilkan catatan pengajuan Peminjam (pinjaman tunai, gadai, kredit barang)
 * kepada akun yang diberi akses "lihat saja" oleh admin. Modul ini sengaja
 * tidak memuat satu pun mutation alokasi/transaksi: pembukanya hanya dapat
 * membaca, tidak pernah mengubah catatan.
 *
 * Privasi (whitelist, bukan spread dokumen mentah): baris yang dikirim ke
 * klien hanya berisi field operasional yang aman. Nama lengkap pemohon
 * ditampilkan untuk ruang pemantau (keputusan admin), sedangkan NIK, nomor
 * rekening, nomor WhatsApp, alamat, penghasilan, tanda tangan, dan dokumen KYC
 * tidak pernah keluar dari server. Setiap baris tetap membawa `kodePeminjam`
 * (pseudonim acak dari `peminjamCode.ts`) sebagai kunci stabil antar-ruang.
 *
 * Akses ditentukan peran akun: `dana` (penyedia dana) atau `admin` untuk
 * pratinjau. Admin memberi/mencabut akses lewat `ubahAkses` di bawah, dan
 * setiap perubahan tercatat pada audit trail.
 */
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { SLOT_AKSES_BERSAMA } from "./aksesBersama";
import { requireAdminSession } from "./adminAuthz";
import { ROLES } from "./schema";
import { audit } from "./system";

/** Batas baris per kategori; daftar selalu diurutkan dari yang terbaru. */
export const BATAS_BARIS = 200;

/** Batas jumlah akun penyedia dana yang dikembalikan ke panel admin. */
const BATAS_AKUN = 200;

export type BarisPinjaman = {
  _id: Id<"loans">;
  nomorReferensi: string;
  /** Nama lengkap pemohon (ditampilkan; NIK/rekening/WA tetap di server). */
  namaLengkap: string;
  kodePeminjam: string | null;
  pokokPinjaman: number;
  tenorHari: number;
  tenorBulan: number | null;
  tujuan: string;
  status: string;
  /** Waktu pengajuan tercatat (convex `_creationTime`). */
  diajukanPada: number;
  /** Waktu pendanaan penuh — null bila belum didanai. */
  didanaiPada: number | null;
  /** Nama penyedia dana yang mencatat alokasi — null bila belum didanai. */
  pendana: string | null;
};

export type BarisGadai = {
  _id: Id<"pawns">;
  nomorReferensi: string;
  /** Nama lengkap pemohon (ditampilkan; NIK/rekening/dokumen tetap di server). */
  namaLengkap: string;
  kodePeminjam: string | null;
  kategori: string;
  deskripsiBarang: string;
  nilaiTaksiran: number | null;
  status: string;
  diajukanPada: number;
  /** Pokok gadai yang disetujui admin (Skema B) — null bila belum ada. */
  pokokGadai: number | null;
  /** Sewa modal per 30 hari dalam persen (Skema B). */
  persenSewaModal: number | null;
  /** Sisa pokok berjalan gadai (Skema B). */
  sisaPokok: number | null;
};

export type BarisKredit = {
  _id: Id<"kreditBarang">;
  nomorReferensi: string;
  /** Nama lengkap pemohon (ditampilkan; NIK/rekening/WA tetap di server). */
  namaLengkap: string;
  kodePeminjam: string | null;
  namaBarang: string;
  kategori: string;
  merchant: string;
  hargaBarang: number;
  dpPersen: number;
  tenorBulan: number;
  marginPersenPerBulan: number;
  status: string;
  diajukanPada: number;
  /** Waktu pendanaan penuh — null bila belum didanai. */
  didanaiPada: number | null;
  /** Nama penyedia dana yang mencatat alokasi — null bila belum didanai. */
  pendana: string | null;
};

const MENUNGGU_PINJAMAN = new Set(["diajukan", "sedang_direview"]);
const MENUNGGU_GADAI = new Set(["diajukan", "sedang_dinilai"]);
const MENUNGGU_KREDIT = new Set(["diajukan", "sedang_ditinjau"]);

/**
 * Gerbang ruang penyedia dana. Tamu (anonim) dan akun tanpa peran `dana`/`admin`
 * selalu ditolak — pemeriksaan dilakukan di server, bukan hanya di UI.
 */
async function requirePengamat(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Harus masuk terlebih dahulu.");

  const user = await ctx.db.get(userId);
  if (user === null) throw new Error("Pengguna tidak ditemukan.");

  /**
   * Pemantau akun bersama: sesi tamu yang diaktifkan kode akses bersama.
   * Aksesnya harus masih memakai versi kode yang berlaku — rotasi atau
   * nonaktif kode langsung memutusnya, walau sesinya masih hidup.
   */
  if (user.role === ROLES.PENGAMAT) {
    // Fail-closed: kalau akunnya berubah menjadi akun email, akses bersama
    // ditutup supaya tidak ikut mewarisi hak tulis sebuah akun biasa.
    if (user.isAnonymous !== true) {
      throw new Error(
        "Akses bersama berakhir karena akun ini kini memakai identitas email. Minta akses dari admin.",
      );
    }
    const baris = await ctx.db
      .query("aksesBersama")
      .withIndex("by_slot", (q) => q.eq("slot", SLOT_AKSES_BERSAMA))
      .first();
    if (baris?.aktif !== true || user.aksesBersamaVersi !== baris.versi) {
      throw new Error(
        "Akses bersama sudah diputus admin. Minta kode terbaru lalu masuk lagi lewat /akses-bersama.",
      );
    }
    return { userId, user };
  }

  if (user.isAnonymous === true) {
    throw new Error(
      "Akun tamu tidak memiliki akses ruang penyedia dana. Masuk dengan akun terverifikasi.",
    );
  }
  if (user.role !== ROLES.DANA && user.role !== ROLES.ADMIN) {
    throw new Error(
      "Ruang penyedia dana hanya dapat dibuka oleh akun dengan akses lihat saja dari admin.",
    );
  }

  return { userId, user };
}

/**
 * Satu query untuk seluruh halaman: tiga daftar pengajuan + ringkasannya.
 * Baris dibatasi `BATAS_BARIS` per kategori dan diambil dari yang terbaru agar
 * payload tetap ringan; pemanggil menerima penanda `terpotong`.
 */
export const daftarPengajuan = query({
  args: {},
  handler: async (ctx) => {
    await requirePengamat(ctx);

    // Cache kode pseudonim — satu pembacaan per peminjam, bukan per baris.
    const kodeCache = new Map<Id<"users">, string | null>();
    async function kodeUntuk(userId: Id<"users">): Promise<string | null> {
      const cached = kodeCache.get(userId);
      if (cached !== undefined) return cached;
      const peminjam = await ctx.db.get(userId);
      const kode = peminjam?.kodePeminjam ?? null;
      kodeCache.set(userId, kode);
      return kode;
    }

    // Nama penyedia dana untuk kolom "Pendana". Dibaca hanya pada baris yang
    // sudah didanai supaya tidak ada pembacaan tabel alokasi per baris kosong;
    // nama akun di-cache agar satu pembacaan per penyedia, bukan per baris.
    const namaCache = new Map<Id<"users">, string | null>();
    async function namaPenyedia(userId: Id<"users">): Promise<string | null> {
      const cached = namaCache.get(userId);
      if (cached !== undefined) return cached;
      const penyedia = await ctx.db.get(userId);
      const nama = penyedia?.name ?? null;
      namaCache.set(userId, nama);
      return nama;
    }
    async function rangkaiPendana(ids: Id<"users">[]): Promise<string | null> {
      if (ids.length === 0) return null;
      const nama: string[] = [];
      for (const id of ids) {
        nama.push((await namaPenyedia(id)) ?? "Penyedia dana");
      }
      return [...new Set(nama)].join(", ");
    }
    async function pendanaPinjaman(loanId: Id<"loans">): Promise<string | null> {
      const alokasi = await ctx.db
        .query("fundings")
        .withIndex("by_loan", (q) => q.eq("loanId", loanId))
        .collect();
      return rangkaiPendana(alokasi.map((a) => a.danaId));
    }
    async function pendanaKredit(kreditId: Id<"kreditBarang">): Promise<string | null> {
      const alokasi = await ctx.db
        .query("kreditFundings")
        .withIndex("by_kredit", (q) => q.eq("kreditId", kreditId))
        .collect();
      return rangkaiPendana(alokasi.map((a) => a.danaId));
    }

    const pinjamanMentah = await ctx.db
      .query("loans")
      .order("desc")
      .take(BATAS_BARIS + 1);
    const gadaiMentah = await ctx.db
      .query("pawns")
      .order("desc")
      .take(BATAS_BARIS + 1);
    const kreditMentah = await ctx.db
      .query("kreditBarang")
      .order("desc")
      .take(BATAS_BARIS + 1);

    const pinjaman: BarisPinjaman[] = [];
    for (const loan of pinjamanMentah.slice(0, BATAS_BARIS)) {
      pinjaman.push({
        _id: loan._id,
        nomorReferensi: loan.nomorReferensi,
        namaLengkap: loan.namaLengkap,
        kodePeminjam: await kodeUntuk(loan.userId),
        pokokPinjaman: loan.pokokPinjaman,
        tenorHari: loan.tenorHari,
        tenorBulan: loan.tenorBulan ?? null,
        tujuan: loan.tujuan,
        status: loan.status,
        diajukanPada: loan._creationTime,
        didanaiPada: loan.didanaiPada ?? null,
        pendana:
          loan.didanaiPada === undefined ? null : await pendanaPinjaman(loan._id),
      });
    }

    const gadai: BarisGadai[] = [];
    for (const pawn of gadaiMentah.slice(0, BATAS_BARIS)) {
      gadai.push({
        _id: pawn._id,
        nomorReferensi: pawn.nomorReferensi,
        namaLengkap: pawn.namaLengkap,
        kodePeminjam: await kodeUntuk(pawn.userId),
        kategori: pawn.kategori,
        deskripsiBarang: pawn.deskripsiBarang,
        nilaiTaksiran: pawn.nilaiTaksiran ?? null,
        status: pawn.status,
        diajukanPada: pawn._creationTime,
        pokokGadai: pawn.pokokGadai ?? null,
        persenSewaModal: pawn.persenSewaModal ?? null,
        sisaPokok: pawn.sisaPokok ?? null,
      });
    }

    const kredit: BarisKredit[] = [];
    for (const item of kreditMentah.slice(0, BATAS_BARIS)) {
      kredit.push({
        _id: item._id,
        nomorReferensi: item.nomorReferensi,
        namaLengkap: item.namaLengkap,
        kodePeminjam: await kodeUntuk(item.userId),
        namaBarang: item.namaBarang,
        kategori: item.kategori,
        merchant: item.merchant,
        hargaBarang: item.hargaBarang,
        dpPersen: item.dpPersen,
        tenorBulan: item.tenorBulan,
        marginPersenPerBulan: item.marginPersenPerBulan,
        status: item.status,
        diajukanPada: item._creationTime,
        didanaiPada: item.didanaiPada ?? null,
        pendana:
          item.didanaiPada === undefined ? null : await pendanaKredit(item._id),
      });
    }

    // Ringkasan dihitung dari baris yang benar-benar dikirim (Zero Fake Data).
    const ringkasan = {
      jumlahPinjaman: pinjaman.length,
      jumlahGadai: gadai.length,
      jumlahKredit: kredit.length,
      menungguReview:
        pinjaman.filter((b) => MENUNGGU_PINJAMAN.has(b.status)).length +
        gadai.filter((b) => MENUNGGU_GADAI.has(b.status)).length +
        kredit.filter((b) => MENUNGGU_KREDIT.has(b.status)).length,
      nilaiPinjaman: pinjaman.reduce((total, b) => total + b.pokokPinjaman, 0),
      nilaiGadai: gadai.reduce((total, b) => total + (b.nilaiTaksiran ?? 0), 0),
      nilaiKredit: kredit.reduce((total, b) => total + b.hargaBarang, 0),
    };

    return {
      batas: BATAS_BARIS,
      terpotong: {
        pinjaman: pinjamanMentah.length > BATAS_BARIS,
        gadai: gadaiMentah.length > BATAS_BARIS,
        kredit: kreditMentah.length > BATAS_BARIS,
      },
      ringkasan,
      pinjaman,
      gadai,
      kredit,
    };
  },
});

/**
 * Daftar akun yang saat ini punya akses ruang penyedia dana — panel admin.
 * Tidak pernah memuat data pengajuan, hanya identitas akun.
 */
export const daftarAkses = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminSession(ctx);

    const pengguna = await ctx.db.query("users").take(BATAS_AKUN + 1);
    const baris = await ctx.db
      .query("aksesBersama")
      .withIndex("by_slot", (q) => q.eq("slot", SLOT_AKSES_BERSAMA))
      .first();
    const versiAktif = baris?.versi ?? 0;
    const rows = pengguna
      .filter((u) => u.role === ROLES.DANA || u.role === ROLES.PENGAMAT)
      .slice(0, BATAS_AKUN)
      .map((u) => ({
        userId: u._id,
        nama: u.name ?? (u.role === ROLES.PENGAMAT ? "Pemantau bersama" : "Penyedia dana"),
        email: u.email ?? null,
        kodePeminjam: u.kodePeminjam ?? null,
        emailTerverifikasi: u.emailVerificationTime !== undefined,
        /** Akun bersama dari kode akses — dikelola lewat terbit/nonaktif kode. */
        akunBersama: u.role === ROLES.PENGAMAT,
        /** Sesi bersama yang masih memakai versi kode berlaku. */
        aksesAktif:
          u.role !== ROLES.PENGAMAT ||
          (baris?.aktif === true && u.aksesBersamaVersi === versiAktif),
      }))
      .sort((a, b) => Number(a.akunBersama) - Number(b.akunBersama));

    return { batas: BATAS_AKUN, terpotong: pengguna.length > BATAS_AKUN, rows };
  },
});

/**
 * Beri/cabut akses ruang penyedia dana untuk satu akun (berdasarkan email).
 * Akses bersifat lihat saja: hanya mengubah peran akun, tanpa menyentuh
 * catatan pengajuan. Perubahan dicatat pada audit trail.
 */
export const ubahAkses = mutation({
  args: {
    email: v.string(),
    aktif: v.boolean(),
    /** Alasan keputusan (disarankan) — masuk audit trail. */
    alasan: v.optional(v.string()),
  },
  handler: async (ctx, { email, aktif, alasan }) => {
    const { userId: adminId, user: admin } = await requireAdminSession(ctx);

    const dicari = email.trim().toLowerCase();
    if (dicari === "" || !dicari.includes("@")) {
      throw new Error("Masukkan alamat email akun yang valid.");
    }

    // Utamakan indeks email; jatuh ke pencarian terbatas untuk alamat yang
    // tersimpan dengan huruf besar/kecil berbeda.
    let target = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", dicari))
      .first();
    if (target === null) {
      const semua = await ctx.db.query("users").take(500);
      target = semua.find((u) => (u.email ?? "").toLowerCase() === dicari) ?? null;
    }
    if (target === null) {
      throw new Error(`Tidak ada akun dengan email ${dicari}.`);
    }
    if (target.role === ROLES.ADMIN) {
      throw new Error("Akun tim (admin) sudah memiliki akses panel penuh.");
    }
    if (target.isAnonymous === true) {
      throw new Error(
        "Akun tamu tidak dapat diberi akses. Minta pengguna masuk dengan email terverifikasi.",
      );
    }

    if (aktif) {
      if (target.role === ROLES.DANA) return { ok: true, sudahSesuai: true };
      await ctx.db.patch(target._id, { role: ROLES.DANA });
    } else {
      if (target.role !== ROLES.DANA) return { ok: true, sudahSesuai: true };
      await ctx.db.patch(target._id, { role: undefined });
    }

    await audit(
      ctx,
      adminId,
      admin.email ?? admin.name ?? "admin",
      "ubah_akses_penyedia_dana",
      target.email ?? target.name ?? target._id,
      `${aktif ? "Memberi" : "Mencabut"} akses lihat saja ruang penyedia dana${
        alasan?.trim() ? ` — ${alasan.trim()}` : ""
      }`,
    );

    return { ok: true, sudahSesuai: false };
  },
});
