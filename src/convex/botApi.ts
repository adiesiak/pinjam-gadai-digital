/**
 * API untuk bot WhatsApp — jembatan supaya pengajuan dari bot masuk ke tabel
 * yang sama dengan website.
 *
 * KENAPA ADA: bot WhatsApp berjalan di VPS terpisah dengan database sendiri.
 * Selama dua sistem menyimpan data masing-masing, "format yang sama" hanya bisa
 * diusahakan dengan menyalin logika — dan salinan selalu menyimpang. Modul ini
 * membuat bot menjadi KLIEN Convex, bukan sistem kedua: setiap pengajuan dari
 * bot ditulis ke tabel `loans` yang sama dengan website, lewat fungsi inti yang
 * sama (`ajukanPinjamanInti`).
 *
 * ALUR:
 *   1. Bot meminta URL unggah  → POST /bot/unggah-url
 *   2. Bot mengunggah foto KTP/selfie/slip ke URL itu → dapat `storageId`
 *   3. Bot memanggil           → POST /bot/pengajuan
 *   4. Convex memetakan nomor WhatsApp ke user, lalu memanggil inti pengajuan
 *
 * KEAMANAN:
 *   - Semua endpoint menuntut `BOT_API_KEY` di header `Authorization: Bearer …`,
 *     dibandingkan dengan waktu konstan. Tanpa kunci yang dikonfigurasi, endpoint
 *     MENOLAK semua permintaan (fail-closed).
 *   - Endpoint hanya bisa mengajukan ATAS NAMA user yang sudah ada. Tidak ada
 *     pembuatan user otomatis dari endpoint pengajuan — pendaftaran punya
 *     endpoint sendiri supaya bisa diaudit terpisah.
 *   - Setiap pengajuan tercatat di audit trail dengan label `bot-whatsapp`.
 */
import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { audit } from "./system";
import { ROLES } from "./schema";

/** Kunci API bot dari environment. Kosong = endpoint menolak semua. */
export function kunciBot(): string {
  return (process.env.BOT_API_KEY ?? "").trim();
}

/**
 * Perbandingan string dengan waktu konstan.
 *
 * `===` pada string berhenti di karakter pertama yang berbeda, sehingga waktu
 * eksekusinya membocorkan berapa banyak karakter awal yang sudah benar. Untuk
 * kunci API itu cukup untuk menebak bertahap dari jarak jauh.
 */
export function samaAman(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let beda = 0;
  for (let i = 0; i < a.length; i += 1) {
    beda |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return beda === 0;
}

/** Normalisasi nomor WhatsApp Indonesia ke bentuk `62…` tanpa spasi/simbol. */
export function normalisasiNomor(mentah: string): string {
  const angka = mentah.replace(/\D/g, "");
  if (angka === "") return "";
  if (angka.startsWith("62")) return angka;
  if (angka.startsWith("0")) return `62${angka.slice(1)}`;
  if (angka.startsWith("8")) return `62${angka}`;
  return angka;
}

/**
 * Cari user berdasarkan nomor WhatsApp.
 *
 * Catatan: `nomorWhatsApp` di tabel users TIDAK berindeks, jadi pencarian ini
 * memindai. Untuk volume bot saat ini itu memadai; kalau pengajuan dari bot
 * menembus ribuan per hari, tambahkan indeks `by_nomor_wa` lebih dulu.
 */
export const _cariUserByNomor = internalQuery({
  args: { nomor: v.string() },
  handler: async (ctx, args) => {
    const nomor = normalisasiNomor(args.nomor);
    if (nomor === "") return null;
    const semua = await ctx.db.query("users").collect();
    const ketemu = semua.find(
      (u) => u.nomorWhatsApp !== undefined && normalisasiNomor(u.nomorWhatsApp) === nomor,
    );
    if (ketemu === undefined) return null;
    return {
      userId: ketemu._id,
      role: ketemu.role ?? null,
      punyaNama: Boolean(ketemu.name),
    };
  },
});

/**
 * Daftarkan user baru dari bot WhatsApp.
 *
 * Dipisahkan dari jalur pengajuan supaya pendaftaran punya jejak audit sendiri
 * dan tidak bisa disalahgunakan untuk mengajukan atas nama nomor sembarang.
 * Role default `peminjam`; pendana didaftarkan admin lewat panel.
 */
export const _daftarDariBot = internalMutation({
  args: {
    nomor: v.string(),
    nama: v.string(),
  },
  handler: async (ctx, args) => {
    const nomor = normalisasiNomor(args.nomor);
    if (nomor.length < 10 || nomor.length > 15) {
      throw new Error("Nomor WhatsApp tidak valid.");
    }
    const nama = args.nama.trim().slice(0, 80);
    if (nama.length < 2) {
      throw new Error("Nama wajib diisi minimal 2 karakter.");
    }

    const semua = await ctx.db.query("users").collect();
    const sudah = semua.find(
      (u) => u.nomorWhatsApp !== undefined && normalisasiNomor(u.nomorWhatsApp) === nomor,
    );
    if (sudah !== undefined) {
      return { userId: sudah._id, baru: false as const };
    }

    const userId = await ctx.db.insert("users", {
      name: nama,
      nomorWhatsApp: nomor,
      role: ROLES.PEMINJAM,
    });
    await audit(
      ctx,
      String(userId),
      "bot-whatsapp",
      "daftar_dari_bot",
      `users/${userId}`,
      `Pendaftaran lewat bot WhatsApp untuk nomor ${nomor.slice(0, 6)}…`,
    );
    return { userId, baru: true as const };
  },
});

/**
 * URL unggah sekali pakai untuk foto KTP/selfie/slip dari bot.
 *
 * Bot TIDAK menyimpan foto sendiri: kalau disimpan di VPS, dokumen terpecah
 * antara dua tempat dan pemulihan backup tidak lagi utuh. Foto dari WhatsApp
 * harus langsung diteruskan ke storage Convex.
 */
export const _buatUrlUnggah = internalMutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Status pengajuan untuk satu nomor WhatsApp.
 *
 * Hanya mengembalikan pengajuan milik nomor itu — bot tidak boleh bisa membaca
 * pengajuan orang lain hanya dengan menebak nomor referensi.
 */
export const _statusPengajuan = internalQuery({
  args: { nomor: v.string() },
  handler: async (ctx, args) => {
    const nomor = normalisasiNomor(args.nomor);
    if (nomor === "") return { ok: false as const, alasan: "Nomor tidak valid." };

    const semua = await ctx.db.query("users").collect();
    const user = semua.find(
      (u) => u.nomorWhatsApp !== undefined && normalisasiNomor(u.nomorWhatsApp) === nomor,
    );
    if (user === undefined) {
      return { ok: false as const, alasan: "Nomor belum terdaftar." };
    }

    const pinjaman = await ctx.db
      .query("loans")
      .filter((q) => q.eq(q.field("userId"), user._id))
      .collect();

    return {
      ok: true as const,
      userId: user._id,
      pengajuan: pinjaman
        .sort((a, b) => b._creationTime - a._creationTime)
        .slice(0, 10)
        .map((l) => ({
          nomorReferensi: l.nomorReferensi,
          status: l.status,
          pokokPinjaman: l.pokokPinjaman,
          tenorHari: l.tenorHari ?? null,
          tenorBulan: l.tenorBulan ?? null,
          dibuatPada: l._creationTime,
        })),
    };
  },
});
