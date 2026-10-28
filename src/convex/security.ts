import { getAuthUserId } from "@convex-dev/auth/server";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { ROLES } from "./schema";
import { generateTotpSecret, verifyTotpCode } from "../lib/totp";
import {
  addVerifiedAuthSession,
  getAdminGateStatus,
  requireAdminRole,
  requireAdminSession,
  getCurrentAuthSessionId,
  sesiPratinjauAktif,
} from "./adminAuthz";

/**
 * Proteksi otentikasi & login PINDAI:
 *  1. MFA/2FA TOTP untuk Super Admin (Google Authenticator/Authy).
 *  2. Saklar "OTP WhatsApp wajib" untuk transaksi penyedia dana. Mesin OTP-nya
 *     (kode, HASH, pengiriman Fonnte, batas percobaan) ada di
 *     `convex/otpWhatsapp.ts` — di sini hanya disimpan saklarnya.
 *  3. Rate limiting login (5x salah / 15 menit per IP) + blokir sementara.
 *  4. Sesi aktif tunggal — perangkat baru otomatis menggugurkan sesi lama.
 *  5. Log login append-only: status, IP, user-agent, timestamp.
 *
 * Catatan IP: Convex tidak mengekspos IP klien; klien mengirim IP publiknya
 * sendiri (opini server tetap jujur — nilai dipakai untuk anomali, bukan
 * otorisasi). UA juga dikirim klien.
 */

const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX_GAGAL = 5;
const BLOCK_MS = 15 * 60 * 1000;
/** Batas percobaan kata sandi Super Admin — ditegakkan server, bukan klien. */
const ADMIN_RATE_MAX_PERCOBAAN = 5;
const ADMIN_RATE_WINDOW_MS = 15 * 60 * 1000;
/** Batas permintaan token aktivasi/reset — di atas batas, email tidak dikirim. */
const ADMIN_TOKEN_MAX_PERMOHONAN = 3;
const ADMIN_TOKEN_WINDOW_MS = 15 * 60 * 1000;
/**
 * Batas tebak kode TOTP. Kata sandi sudah dibatasi 5x/15 menit, tetapi tanpa
 * batas di sini kata sandi yang sudah bocor cukup ditemani tebakan 6 digit
 * tanpa henti sampai verifikasi kedua tembus.
 */
const TOTP_MAKS_GAGAL = 5;
const TOTP_KUNCI_MS = 15 * 60 * 1000;

/** Masa berlaku "ingat perangkat ini" — 30 hari sejak verifikasi TOTP. */
export const MASA_PERANGKAT_PERCAYA_MS = 30 * 24 * 60 * 60 * 1000;
/** Batas perangkat dipercaya aktif per akun; yang terlama dicabut otomatis. */
export const MAKS_PERANGKAT_PERCAYA = 10;
/** Salt tetap — token sudah acak 256 bit, salt hanya memisahkan domain hash. */
const SALT_PERANGKAT = "pindai:perangkat-percaya:v1:";

function keHexPerangkat(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** ASCII → byte tanpa TextEncoder (aman di seluruh runtime Convex). */
function keBytesPerangkat(teks: string): Uint8Array {
  const bytes = new Uint8Array(teks.length);
  for (let i = 0; i < teks.length; i += 1) bytes[i] = teks.charCodeAt(i) & 0xff;
  return bytes;
}

/** SHA-256 hex dari token perangkat — satu-satunya bentuk yang disimpan. */
export async function hashTokenPerangkat(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    keBytesPerangkat(SALT_PERANGKAT + token) as unknown as ArrayBuffer,
  );
  return keHexPerangkat(new Uint8Array(digest));
}

/** Token perangkat acak 32 byte (256 bit) dalam hex. */
export function buatTokenPerangkat(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return keHexPerangkat(bytes);
}

/** Nama perangkat ringkas dari user agent. */
export function deviceLabel(ua: string): string {
  if (/iphone|ipad|ipod/i.test(ua)) return "iOS";
  if (/android/i.test(ua)) return "Android";
  if (/windows/i.test(ua)) return "Windows";
  if (/mac os/i.test(ua)) return "macOS";
  if (/linux/i.test(ua)) return "Linux";
  return "Perangkat tidak dikenal";
}

async function getUser(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) return null;
  return ctx.db.get(userId);
}

async function requireAdmin(ctx: QueryCtx) {
  const { user } = await requireAdminRole(ctx);
  return user;
}

async function getMfa(ctx: QueryCtx, userId: Id<"users">) {
  return ctx.db
    .query("mfaSettings")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
}

/** Batasi jumlah perangkat dipercaya aktif; yang terlama dicabut otomatis. */
async function batasiPerangkatPercaya(ctx: MutationCtx, userId: Id<"users">) {
  const aktif = (await ctx.db
    .query("trustedDevices")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect())
    .filter((d) => d.dicabutPada === undefined && d.kedaluwarsaPada > Date.now())
    .sort((a, b) => b.dibuatPada - a.dibuatPada);
  for (const lama of aktif.slice(MAKS_PERANGKAT_PERCAYA)) {
    await ctx.db.patch(lama._id, { dicabutPada: Date.now() });
  }
}

/** Tulis log login append-only. */
export async function catatLogin(
  ctx: MutationCtx,
  args: {
    userId?: Id<"users">;
    status: string;
    metode: string;
    ip: string;
    userAgent: string;
    keterangan?: string;
  },
) {
  await ctx.db.insert("loginLogs", {
    userId: args.userId as never,
    status: args.status,
    metode: args.metode,
    ip: args.ip,
    userAgent: args.userAgent.slice(0, 200),
    keterangan: args.keterangan,
    waktu: Date.now(),
  });
}

/** Log login untuk tab keamanan admin (append-only read). */
export const getLoginLogs = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminSession(ctx);
    return ctx.db.query("loginLogs").withIndex("by_waktu").order("desc").take(100);
  },
});

/** Ringkasan proteksi untuk admin: jumlah diblokir & anomali 24 jam terakhir. */
export const getSecurityOverview = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminSession(ctx);
    const since = Date.now() - 24 * 60 * 60 * 1000;
    const logs = await ctx.db
      .query("loginLogs")
      .withIndex("by_waktu")
      .order("desc")
      .take(500);
    const baru = logs.filter((l) => l.waktu >= since);
    return {
      totalBaru: baru.length,
      gagal: baru.filter((l) => l.status === "gagal").length,
      diblokir: baru.filter((l) => l.status === "diblokir").length,
      anomali: baru.filter((l) => l.status === "dipertanyakan").length,
    };
  },
});

// =====================================================================
// Rate limiting — dipanggil sebelum OTP dikirim dan sebelum verifikasi
// =====================================================================

/**
 * Cek apakah IP/identifier sedang diblokir. Dilempar bila >5 gagal dalam
 * 15 menit; blokir berlaku 15 menit sejak kegagalan ke-5.
 */
export const assertNotRateLimited = internalQuery({
  args: { identifier: v.string(), ip: v.string() },
  handler: async (ctx, { identifier, ip }) => {
    const since = Date.now() - RATE_WINDOW_MS;
    const byIp = await ctx.db
      .query("loginAttempts")
      .withIndex("by_ip", (q) => q.eq("ip", ip))
      .collect();
    const gagalIp = byIp.filter((a) => !a.berhasil && a.waktu >= since);
    if (gagalIp.length >= RATE_MAX_GAGAL) {
      const terakhir = Math.max(...gagalIp.map((a) => a.waktu));
      if (Date.now() - terakhir < BLOCK_MS) {
        return {
          blocked: true,
          sisaDetik: Math.ceil((BLOCK_MS - (Date.now() - terakhir)) / 1000),
        };
      }
    }
    const byId = await ctx.db
      .query("loginAttempts")
      .withIndex("by_identifier", (q) => q.eq("identifier", identifier))
      .collect();
    const gagalId = byId.filter((a) => !a.berhasil && a.waktu >= since);
    if (gagalId.length >= RATE_MAX_GAGAL) {
      return { blocked: true, sisaDetik: Math.ceil(BLOCK_MS / 1000) };
    }
    return { blocked: false, sisaDetik: 0 };
  },
});

/**
 * Catat satu percobaan kata sandi dan tegakkan batas 5 percobaan per 15 menit.
 *
 * Dipanggil dari `adminPassword.authorize` SEBELUM kata sandi diverifikasi,
 * jadi pencatatannya tidak bisa dilewati klien: yang dihitung adalah email,
 * bukan IP/identifier kiriman klien.
 *
 * Batas ini berlaku untuk SEMUA alamat, bukan hanya alamat admin: kalau hanya
 * alamat admin yang dibatasi, munculnya balasan "terlalu banyak percobaan"
 * itu sendiri sudah mengonfirmasi alamat mana yang Super Admin. Argumen
 * `admin` hanya menentukan apakah kejadiannya ditulis ke loginLogs + auditLog
 * — jejak keamanan tidak boleh bisa dipenuhi baris palsu dari alamat
 * sembarangan.
 */
export const catatPercobaanKataSandiAdmin = internalMutation({
  args: { email: v.string(), admin: v.boolean() },
  returns: v.object({ blocked: v.boolean(), sisaDetik: v.number() }),
  handler: async (ctx, { email, admin }) => {
    const bersih = email.trim().toLowerCase().slice(0, 160);
    const sejak = Date.now() - ADMIN_RATE_WINDOW_MS;
    const semua = await ctx.db
      .query("adminLoginAttempts")
      .withIndex("by_email", (q) => q.eq("email", bersih))
      .collect();

    // Catatan di luar jendela dibuang sekaligus supaya tabel tidak menumpuk.
    let dalamJendela = 0;
    let tertua = Date.now();
    for (const baris of semua) {
      if (baris.waktu < sejak) {
        await ctx.db.delete(baris._id);
      } else {
        dalamJendela += 1;
        if (baris.waktu < tertua) tertua = baris.waktu;
      }
    }

    if (dalamJendela >= ADMIN_RATE_MAX_PERCOBAAN) {
      if (admin) {
        const pemilik = await ctx.db
          .query("users")
          .withIndex("email", (q) => q.eq("email", bersih))
          .first();
        const keterangan = `Percobaan kata sandi Super Admin melebihi ${ADMIN_RATE_MAX_PERCOBAAN}x dalam 15 menit — permintaan ditolak sebelum verifikasi.`;
        await catatLogin(ctx, {
          userId: pemilik?._id,
          status: "diblokir",
          metode: "password",
          ip: "tidak diketahui",
          userAgent: "tidak diketahui",
          keterangan,
        });
        await ctx.db.insert("auditLog", {
          aktorLabel: "Percobaan masuk Super Admin",
          aksi: "admin_login_diblokir",
          target: bersih,
          detail: keterangan,
          waktu: Date.now(),
        });
      }
      return {
        blocked: true,
        sisaDetik: Math.max(
          1,
          Math.ceil((tertua + ADMIN_RATE_WINDOW_MS - Date.now()) / 1000),
        ),
      };
    }

    await ctx.db.insert("adminLoginAttempts", { email: bersih, waktu: Date.now() });
    return { blocked: false, sisaDetik: 0 };
  },
});

/**
 * Catat satu permintaan token aktivasi/reset kata sandi dan tegakkan batas
 * 3 permintaan per 15 menit per alamat.
 *
 * Dipanggil dari `adminPassword.authorize` SEBELUM provider kata sandi
 * membuat kode verifikasi dan mengirim email, jadi permintaan di atas batas
 * tidak mengirim email apa pun — dan tidak menghapus token yang sudah
 * terkirim sebelumnya. Batas ini berlaku untuk SEMUA alamat, bukan hanya
 * alamat admin: kalau hanya alamat admin yang dibatasi, munculnya balasan
 * "terlalu banyak permintaan" itu sendiri sudah mengonfirmasi alamat mana
 * yang Super Admin. Argumen `admin` hanya menentukan apakah kejadiannya
 * ditulis ke loginLogs + auditLog — jejak keamanan tidak boleh bisa dipenuhi
 * baris palsu dari alamat sembarangan.
 */
export const catatPermintaanTokenAdmin = internalMutation({
  args: { email: v.string(), admin: v.boolean() },
  returns: v.object({ blocked: v.boolean(), sisaDetik: v.number() }),
  handler: async (ctx, { email, admin }) => {
    const bersih = email.trim().toLowerCase().slice(0, 160);
    const sejak = Date.now() - ADMIN_TOKEN_WINDOW_MS;
    const semua = await ctx.db
      .query("adminTokenRequests")
      .withIndex("by_email", (q) => q.eq("email", bersih))
      .collect();

    // Catatan di luar jendela dibuang sekaligus supaya tabel tidak menumpuk.
    let dalamJendela = 0;
    let tertua = Date.now();
    for (const baris of semua) {
      if (baris.waktu < sejak) {
        await ctx.db.delete(baris._id);
      } else {
        dalamJendela += 1;
        if (baris.waktu < tertua) tertua = baris.waktu;
      }
    }

    if (dalamJendela >= ADMIN_TOKEN_MAX_PERMOHONAN) {
      if (admin) {
        const pemilik = await ctx.db
          .query("users")
          .withIndex("email", (q) => q.eq("email", bersih))
          .first();
        const keterangan = `Permintaan token kata sandi Super Admin melebihi ${ADMIN_TOKEN_MAX_PERMOHONAN}x dalam 15 menit — email tidak dikirim.`;
        await catatLogin(ctx, {
          userId: pemilik?._id,
          status: "diblokir",
          metode: "password_token",
          ip: "tidak diketahui",
          userAgent: "tidak diketahui",
          keterangan,
        });
        await ctx.db.insert("auditLog", {
          aktorLabel: "Permintaan token Super Admin",
          aksi: "admin_token_diblokir",
          target: bersih,
          detail: keterangan,
          waktu: Date.now(),
        });
      }
      return {
        blocked: true,
        sisaDetik: Math.max(
          1,
          Math.ceil((tertua + ADMIN_TOKEN_WINDOW_MS - Date.now()) / 1000),
        ),
      };
    }

    await ctx.db.insert("adminTokenRequests", {
      email: bersih,
      waktu: Date.now(),
    });
    return { blocked: false, sisaDetik: 0 };
  },
});

/**
 * Jalur pemulihan batas percobaan kata sandi: Super Admin yang memegang kode
 * TOTP tidak perlu menunggu 15 menit.
 *
 * Kode TOTP diperiksa lebih dulu (HMAC, murah) supaya jalur ini tidak bisa
 * dipakai penyerang untuk memaksa server menghitung hash kata sandi berulang
 * kali. Kata sandi TETAP diverifikasi seperti biasa setelah pemulihan: kode
 * TOTP saja tidak pernah cukup untuk masuk, jadi menebak-nebak kode TOTP tidak
 * memberi jalan pintas — pemulihan hanya membuang hitungan percobaan supaya
 * kata sandi yang benar milik admin tidak ikut terkunci.
 *
 * Karena hanya alamat admin ber-TOTP yang bisa memulihkan, balasan untuk
 * alamat lain tetap sama persis: pesan batas percobaan (enumerasi tetap
 * tertutup).
 */
export const bukaBatasKataSandiDenganTotp = internalMutation({
  args: { email: v.string(), kode: v.string() },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, { email, kode }) => {
    const pemilik = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .first();
    if (
      pemilik === null ||
      pemilik.role !== ROLES.ADMIN ||
      pemilik.emailVerificationTime === undefined ||
      pemilik.isAnonymous === true
    ) {
      return { ok: false };
    }
    const mfa = await getMfa(ctx, pemilik._id);
    const secret = mfa?.totpSecret;
    if (mfa === null || secret === undefined) return { ok: false };

    const bersih = email.trim().toLowerCase().slice(0, 160);
    const counter = Math.floor(Date.now() / 30_000);
    const benar = await verifyTotpCode(secret, kode);
    // Anti-replay sama seperti gate panel: satu kode hanya berlaku sekali.
    if (
      benar &&
      mfa.totpLastCounter !== undefined &&
      counter <= mfa.totpLastCounter
    ) {
      return { ok: false };
    }
    if (!benar) {
      await catatLogin(ctx, {
        userId: pemilik._id,
        status: "gagal",
        metode: "totp",
        ip: "tidak diketahui",
        userAgent: "tidak diketahui",
        keterangan: "Kode TOTP pemulihan batas kata sandi salah",
      });
      return { ok: false };
    }

    await ctx.db.patch(mfa._id, { totpLastCounter: counter });
    // Buang hitungan percobaan: percobaan masuk berikutnya (dengan kata sandi
    // yang benar) tidak ikut terblokir.
    const percobaan = await ctx.db
      .query("adminLoginAttempts")
      .withIndex("by_email", (q) => q.eq("email", bersih))
      .collect();
    for (const baris of percobaan) {
      await ctx.db.delete(baris._id);
    }
    await catatLogin(ctx, {
      userId: pemilik._id,
      status: "berhasil",
      metode: "totp",
      ip: "tidak diketahui",
      userAgent: "tidak diketahui",
      keterangan: "Batas percobaan kata sandi dibuka dengan kode TOTP",
    });
    await ctx.db.insert("auditLog", {
      aktorUserId: pemilik._id,
      aktorLabel: pemilik.email ?? pemilik.name ?? "admin",
      aksi: "admin_batas_kata_sandi_dibuka",
      target: bersih,
      detail: "Batas percobaan kata sandi dibuka dengan kode TOTP",
      waktu: Date.now(),
    });
    return { ok: true };
  },
});

// =====================================================================
// MFA TOTP — Super Admin
// =====================================================================

/** Status 2FA admin saat ini (tanpa membocorkan secret). */
export const myTotpStatus = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAdmin(ctx);
    const mfa = await getMfa(ctx, user._id);
    return {
      aktif: mfa?.totpSecret !== undefined,
      setupBerlangsung: mfa?.totpPendingSecret !== undefined,
    };
  },
});

/** Mulai setup TOTP — kembalikan secret + otpauth URI (klien render QR). */
export const startTotpSetup = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireAdmin(ctx);
    const existing = await getMfa(ctx, user._id);
    if (existing?.totpSecret !== undefined) {
      await requireAdminSession(ctx);
    }
    const secret = generateTotpSecret();
    if (existing === null) {
      await ctx.db.insert("mfaSettings", {
        userId: user._id,
        totpPendingSecret: secret,
      });
    } else {
      await ctx.db.patch(existing._id, { totpPendingSecret: secret });
    }
    const account = user.email ?? user.name ?? "admin";
    return { secret, otpauth: otpauthUriPublic(secret, account) };
  },
});

/** Duplikat ringan otpauthUri agar file ini bebas impor lingkaran. */
function otpauthUriPublic(secret: string, account: string): string {
  const params = new URLSearchParams({
    secret,
    issuer: "PINDAI",
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });
  return `otpauth://totp/${encodeURIComponent(`PINDAI:${account}`)}?${params.toString()}`;
}

/** Aktifkan TOTP: verifikasi kode pertama, lalu simpan sebagai aktif. */
export const confirmTotpSetup = mutation({
  args: { kode: v.string() },
  handler: async (ctx, { kode }) => {
    const user = await requireAdmin(ctx);
    const authSessionId = await getCurrentAuthSessionId(ctx, user._id);
    if (authSessionId === null) {
      throw new Error("Sesi autentikasi tidak valid. Silakan masuk kembali.");
    }
    const mfa = await getMfa(ctx, user._id);
    if (mfa?.totpPendingSecret === undefined) {
      throw new Error("Setup TOTP belum dimulai.");
    }
    if (mfa.totpSecret !== undefined) {
      await requireAdminSession(ctx);
    }
    const ok = await verifyTotpCode(mfa.totpPendingSecret, kode);
    if (!ok) {
      throw new Error("Kode TOTP salah — coba lagi atau sinkronkan jam perangkat.");
    }
    await ctx.db.patch(mfa._id, {
      totpSecret: mfa.totpPendingSecret,
      totpPendingSecret: undefined,
      totpLastCounter: Math.floor(Date.now() / 30_000),
      // Keep existing verified sessions during an active-secret rotation, but
      // never revive stale proofs when TOTP is being activated again.
      totpVerifiedAuthSessionIds: addVerifiedAuthSession(
        mfa.totpSecret !== undefined ? mfa.totpVerifiedAuthSessionIds : undefined,
        authSessionId,
      ),
    });
    await ctx.db.insert("auditLog", {
      aktorUserId: user._id,
      aktorLabel: user.email ?? user.name ?? "admin",
      aksi: "mfa_aktif",
      target: "mfaSettings",
      detail: "Super Admin mengaktifkan 2FA TOTP",
      waktu: Date.now(),
    });
    return { ok: true };
  },
});

/** Verifikasi kode TOTP saat sesi admin dibuka (gate klien per sesi). */
export const verifyTotp = mutation({
  args: {
    kode: v.string(),
    perangkat: v.string(),
    ip: v.string(),
    /** Bila true, terbitkan token "ingat perangkat ini" untuk 30 hari. */
    ingatPerangkat: v.optional(v.boolean()),
  },
  handler: async (ctx, { kode, perangkat, ip, ingatPerangkat }) => {
    const user = await requireAdmin(ctx);
    const authSessionId = await getCurrentAuthSessionId(ctx, user._id);
    if (authSessionId === null) {
      throw new Error("Sesi autentikasi tidak valid. Silakan masuk kembali.");
    }
    const mfa = await getMfa(ctx, user._id);
    const secret = mfa?.totpSecret;
    if (secret === undefined || mfa === null) {
      throw new Error("Aktifkan TOTP terlebih dahulu.");
    }
    const sekarang = Date.now();
    if ((mfa.totpTerkunciSampai ?? 0) > sekarang) {
      const sisa = Math.ceil(((mfa.totpTerkunciSampai ?? 0) - sekarang) / 60_000);
      throw new Error(
        `Terlalu banyak kode TOTP salah. Verifikasi dikunci; coba lagi dalam ${sisa} menit.`,
      );
    }
    const ok = await verifyTotpCode(secret, kode);
    if (!ok) {
      const gagal = (mfa.totpGagal ?? 0) + 1;
      const terkunci = gagal >= TOTP_MAKS_GAGAL;
      await ctx.db.patch(mfa._id, {
        totpGagal: terkunci ? 0 : gagal,
        ...(terkunci ? { totpTerkunciSampai: sekarang + TOTP_KUNCI_MS } : {}),
      });
      await catatLogin(ctx, {
        userId: user._id,
        status: "gagal",
        metode: "totp",
        ip,
        userAgent: perangkat,
        keterangan: terkunci
          ? `Kode TOTP salah ${TOTP_MAKS_GAGAL}x — verifikasi dikunci 15 menit.`
          : "Kode TOTP salah",
      });
      // Jangan melempar di sini: mutation Convex bersifat atomik, jadi error
      // akan membatalkan patch penghitung percobaan dan kunci tidak pernah
      // terbentuk. Pemanggil membaca `ok: false` dan menampilkan pesannya.
      return {
        ok: false as const,
        butuh: true as const,
        tokenPerangkat: null,
        pesan: terkunci
          ? "Terlalu banyak kode TOTP salah. Verifikasi dikunci 15 menit."
          : "Kode TOTP salah.",
      };
    }
    // Anti-replay: kode yang sama tidak boleh dipakai dua kali (±1 window).
    const counter = Math.floor(Date.now() / 30_000);
    if (mfa?.totpLastCounter !== undefined && counter <= mfa.totpLastCounter) {
      throw new Error("Kode TOTP sudah terpakai — tunggu kode berikutnya.");
    }
    await ctx.db.patch(mfa._id, {
      totpLastCounter: counter,
      totpGagal: 0,
      totpTerkunciSampai: 0,
      totpVerifiedAuthSessionIds: addVerifiedAuthSession(
        mfa.totpVerifiedAuthSessionIds,
        authSessionId,
      ),
    });
    // "Ingat perangkat ini": terbitkan token sekali, simpan hanya hash-nya.
    let tokenPerangkat: string | null = null;
    if (ingatPerangkat === true) {
      tokenPerangkat = buatTokenPerangkat();
      const now = Date.now();
      await ctx.db.insert("trustedDevices", {
        userId: user._id,
        tokenHash: await hashTokenPerangkat(tokenPerangkat),
        perangkat,
        ip,
        dibuatPada: now,
        kedaluwarsaPada: now + MASA_PERANGKAT_PERCAYA_MS,
        terakhirDipakai: now,
      });
      await batasiPerangkatPercaya(ctx, user._id);
    }
    await catatLogin(ctx, {
      userId: user._id,
      status: "berhasil",
      metode: "totp",
      ip,
      userAgent: perangkat,
    });
    return { ok: true, butuh: true, tokenPerangkat };
  },
});

/** Matikan 2FA (butuh kode valid saat ini — mencegah pengambilalihan). */
export const disableTotp = mutation({
  args: { kode: v.string() },
  handler: async (ctx, { kode }) => {
    const { user } = await requireAdminSession(ctx);
    const mfa = await getMfa(ctx, user._id);
    if (mfa?.totpSecret === undefined) throw new Error("2FA belum aktif.");
    const ok = await verifyTotpCode(mfa.totpSecret, kode);
    if (!ok) throw new Error("Kode TOTP salah — 2FA tetap aktif.");
    await ctx.db.patch(mfa._id, {
      totpSecret: undefined,
      totpPendingSecret: undefined,
      totpLastCounter: undefined,
      totpVerifiedAuthSessionIds: undefined,
    });
    // 2FA mati → seluruh perangkat dipercaya ikut dicabut.
    const perangkat = await ctx.db
      .query("trustedDevices")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    for (const d of perangkat) {
      if (d.dicabutPada === undefined) {
        await ctx.db.patch(d._id, { dicabutPada: Date.now() });
      }
    }
    await ctx.db.insert("auditLog", {
      aktorUserId: user._id,
      aktorLabel: user.email ?? user.name ?? "admin",
      aksi: "mfa_nonaktif",
      target: "mfaSettings",
      waktu: Date.now(),
    });
    return { ok: true };
  },
});

/**
 * Lewati gate TOTP memakai token "ingat perangkat ini".
 *
 * Hanya berfungsi untuk akun admin yang sedang masuk, dengan token yang belum
 * kedaluwarsa dan belum dicabut. Bila valid, sesi Auth saat ini ditandai sudah
 * terverifikasi TOTP — sama seperti baru mengetik kode. Catatan: token mentah
 * TIDAK pernah disimpan, hanya hash-nya.
 */
export const cobaPerangkatPercaya = mutation({
  args: { token: v.string(), perangkat: v.string(), ip: v.string() },
  handler: async (ctx, { token, perangkat, ip }) => {
    const user = await requireAdmin(ctx);
    const authSessionId = await getCurrentAuthSessionId(ctx, user._id);
    if (authSessionId === null) return { ok: false };
    const mfa = await getMfa(ctx, user._id);
    if (mfa === null || mfa.totpSecret === undefined) return { ok: false };

    const tokenHash = await hashTokenPerangkat(token);
    const row = await ctx.db
      .query("trustedDevices")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
      .first();
    if (
      row === null ||
      row.userId !== user._id ||
      row.dicabutPada !== undefined ||
      row.kedaluwarsaPada <= Date.now()
    ) {
      return { ok: false };
    }

    const now = Date.now();
    await ctx.db.patch(row._id, { terakhirDipakai: now, perangkat, ip });
    await ctx.db.patch(mfa._id, {
      totpVerifiedAuthSessionIds: addVerifiedAuthSession(
        mfa.totpVerifiedAuthSessionIds,
        authSessionId,
      ),
    });
    await catatLogin(ctx, {
      userId: user._id,
      status: "berhasil",
      metode: "totp_perangkat",
      ip,
      userAgent: perangkat,
      keterangan: "Perangkat dipercaya — gate TOTP dilewati",
    });
    return { ok: true };
  },
});

/** Pesan status pemakaian perangkat dipercaya untuk satu token (diagnostik UI). */
export const statusPerangkatPercaya = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAdmin(ctx);
    const aktif = (await ctx.db
      .query("trustedDevices")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect())
      .filter((d) => d.dicabutPada === undefined && d.kedaluwarsaPada > Date.now());
    return { jumlah: aktif.length, maks: MAKS_PERANGKAT_PERCAYA };
  },
});

/** Daftar perangkat dipercaya aktif milik admin ini — untuk panel keamanan. */
export const daftarPerangkatPercaya = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAdminSession(ctx);
    const rows = await ctx.db
      .query("trustedDevices")
      .withIndex("by_user", (q) => q.eq("userId", user.userId))
      .collect();
    return rows
      .filter((d) => d.dicabutPada === undefined && d.kedaluwarsaPada > Date.now())
      .sort((a, b) => b.dibuatPada - a.dibuatPada)
      .map((d) => ({
        _id: d._id,
        perangkat: d.perangkat,
        ip: d.ip ?? null,
        dibuatPada: d.dibuatPada,
        terakhirDipakai: d.terakhirDipakai ?? null,
        kedaluwarsaPada: d.kedaluwarsaPada,
      }));
  },
});

/** Cabut satu perangkat dipercaya milik admin ini. */
export const cabutPerangkatPercaya = mutation({
  args: { id: v.id("trustedDevices") },
  handler: async (ctx, { id }) => {
    const user = await requireAdminSession(ctx);
    const row = await ctx.db.get(id);
    if (row === null || row.userId !== user.userId) {
      throw new Error("Perangkat tidak ditemukan.");
    }
    if (row.dicabutPada === undefined) {
      await ctx.db.patch(id, { dicabutPada: Date.now() });
    }
    return { ok: true };
  },
});

/**
 * Lupakan perangkat saat ini — mencabut token yang tersimpan di perangkat ini.
 * Dipakai tombol "Lupakan perangkat ini" (klien mengirim token lokalnya).
 * Aman bila token tidak dikenal: tidak melempar.
 */
export const lupakanPerangkatPercaya = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await requireAdmin(ctx);
    if (token.trim() === "") return { ok: true };
    const tokenHash = await hashTokenPerangkat(token);
    const row = await ctx.db
      .query("trustedDevices")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
      .first();
    if (row !== null && row.userId === user._id && row.dicabutPada === undefined) {
      await ctx.db.patch(row._id, { dicabutPada: Date.now() });
    }
    return { ok: true };
  },
});

/** Minimal status admin/TOTP; Auth session proof stays server-side. */
export const totpGateStatus = query({
  args: {},
  handler: async (ctx) => getAdminGateStatus(ctx),
});

/** Public action-side assertion for admin mutations performed in actions. */
export const assertAdminSession = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminSession(ctx);
    return { ok: true };
  },
});

// =====================================================================
// Sesi aktif tunggal
// =====================================================================

async function ensureSession(
  ctx: MutationCtx,
  userId: Id<"users">,
  sessionId: string,
  perangkat: string,
  ip: string,
) {
  const semua = await ctx.db
    .query("sessions")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  let sudahAda = false;
  for (const s of semua) {
    if (s.waktuBerakhir !== undefined) continue;
    if (s.sessionId === sessionId) {
      sudahAda = true;
    } else {
      // Single active session — perangkat lama langsung gugur.
      await ctx.db.patch(s._id, { waktuBerakhir: Date.now() });
    }
  }
  if (!sudahAda) {
  await ctx.db.insert("sessions", {
    userId: userId as Id<"users">,
      sessionId,
      perangkat,
      ip,
      waktuMulai: Date.now(),
    });
  }
}

/** Daftar sesi aktif milik pengguna (untuk panel keamanan). */
export const mySessions = query({
  args: {},
  handler: async (ctx) => {
    const user = await getUser(ctx);
    if (user === null) return [];
    const semua = await ctx.db
      .query("sessions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    return semua
      .filter((s) => s.waktuBerakhir === undefined)
      .map((s) => ({ _id: s._id, perangkat: s.perangkat, ip: s.ip, waktuMulai: s.waktuMulai, sessionId: s.sessionId }));
  },
});

/**
 * Heartbeat sesi klien: pastikan sesi ini masih aktif. Bila server mencatat
 * sesi sudah digantikan (waktuBerakhir terisi) → klien wajib logout paksa.
 */
export const sessionHeartbeat = query({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) => {
    const user = await getUser(ctx);
    if (user === null) return { valid: false };
    const mfa = await getMfa(ctx, user._id);
    if (mfa?.totpSecret !== undefined) {
      // Admin dengan 2FA: sesi harus terdaftar & belum digantikan.
      const s = await ctx.db
        .query("sessions")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect();
      const milik = s.find((x) => x.sessionId === sessionId && x.waktuBerakhir === undefined);
      return { valid: milik !== undefined };
    }
    return { valid: true };
  },
});

/** Logout semua perangkat (paksa) — dipakai pengguna sendiri. */
export const revokeOtherSessions = mutation({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) => {
    const user = await getUser(ctx);
    if (user === null) throw new Error("Harus masuk terlebih dahulu.");
    const semua = await ctx.db
      .query("sessions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    for (const s of semua) {
      if (s.sessionId !== sessionId && s.waktuBerakhir === undefined) {
        await ctx.db.patch(s._id, { waktuBerakhir: Date.now() });
      }
    }
    return { ok: true };
  },
});

// =====================================================================
// OTP WhatsApp — saklar "wajib OTP" untuk penyedia dana
// =====================================================================
//
// Mesin OTP-nya (membuat kode, menyimpan HASH, mengirim lewat Fonnte, membatasi
// percobaan & kirim ulang) ada di `convex/otpWhatsapp.ts`. Modul ini hanya
// menyimpan SAKLAR proteksinya (`waOtpWajib`) supaya transaksi penyedia dana
// meminta kode sekali pakai dari mesin yang sama.

/** Status saklar OTP WA untuk penyedia dana — tidak memuat kode apa pun. */
export const myWaOtpStatus = query({
  args: {},
  handler: async (ctx) => {
    const user = await getUser(ctx);
    if (user === null) return { aktif: false, mfa: false };
    const mfa = await getMfa(ctx, user._id);
    return {
      aktif: mfa?.waOtpWajib === true,
      mfa: mfa?.totpSecret !== undefined,
    };
  },
});

/**
 * Set/toggle OTP WA wajib untuk transaksi penyedia dana (onboarding keamanan).
 * Dipanggil dari dashboard penyedia dana.
 */
export const setWaOtpRequired = mutation({
  args: { wajib: v.boolean() },
  handler: async (ctx, { wajib }) => {
    const user = await getUser(ctx);
    if (user === null) throw new Error("Harus masuk terlebih dahulu.");
    if (user.role !== ROLES.DANA) {
      throw new Error("Pengaturan OTP WhatsApp khusus akun penyedia dana.");
    }
    const mfa = await getMfa(ctx, user._id);
    if (mfa === null) {
      await ctx.db.insert("mfaSettings", { userId: user._id, waOtpWajib: wajib });
    } else {
      await ctx.db.patch(mfa._id, { waOtpWajib: wajib });
    }
    return { ok: true };
  },
});

/**
 * Catat login dari klien — dipanggil setelah signIn sukses (tamu/email).
 * Deteksi anomali: IP baru vs IP sukses terakhir pengguna → "dipertanyakan".
 */
export const recordLogin = mutation({
  args: { ip: v.string(), userAgent: v.string(), metode: v.string() },
  handler: async (ctx, { ip, userAgent, metode }) => {
    // Pratinjau admin BUKAN login nasabah: riwayat login dan deteksi anomali
    // IP milik nasabah tidak boleh terisi oleh perangkat admin.
    if (await sesiPratinjauAktif(ctx)) return { ok: true, anomali: false };
    const user = await getUser(ctx);
    if (user === null) return { ok: false };
    const sebelumnya = await ctx.db
      .query("loginLogs")
      .withIndex("by_waktu")
      .order("desc")
      .take(50);
    const suksesLalu = sebelumnya.find(
      (l) => l.userId === user._id && l.status === "berhasil",
    );
    const anomali = suksesLalu !== undefined && suksesLalu.ip !== ip;
    await catatLogin(ctx, {
      userId: user._id,
      status: anomali ? "dipertanyakan" : "berhasil",
      metode,
      ip,
      userAgent,
      keterangan: anomali
        ? `Login dari IP baru (sebelumnya ${suksesLalu.ip})`
        : undefined,
    });
    return { ok: true, anomali };
  },
});

/**
 * Rekam percobaan login gagal dari halaman auth (rate limit 5x/15 menit).
 * Dipanggil klien saat signIn melempar error; tanpa identitas sensitif.
 */
export const recordFailedAttempt = mutation({
  args: { ip: v.string(), identifier: v.string() },
  returns: v.object({ blocked: v.boolean(), sisaDetik: v.number() }),
  handler: async (
    ctx,
    { ip, identifier },
  ): Promise<{ blocked: boolean; sisaDetik: number }> => {
    const ident = identifier.trim().toLowerCase().slice(0, 120);
    const ipBersih = ip.trim().slice(0, 64);
    const sejak = Date.now() - RATE_WINDOW_MS;
    // Buang catatan lama identifier ini sekaligus (batasi pertumbuhan tabel)
    // dan batasi jumlah baris per jendela: pemanggil klien tidak boleh bisa
    // menulis ribuan baris hanya untuk satu identifier.
    const barisTerkait = await ctx.db
      .query("loginAttempts")
      .withIndex("by_identifier", (q) => q.eq("identifier", ident))
      .collect();
    let dalamJendela = 0;
    for (const baris of barisTerkait) {
      if (baris.waktu < sejak) {
        await ctx.db.delete(baris._id);
      } else {
        dalamJendela += 1;
      }
    }
    if (dalamJendela < RATE_MAX_GAGAL * 4) {
      await ctx.db.insert("loginAttempts", {
        identifier: ident,
        ip: ipBersih,
        berhasil: false,
        waktu: Date.now(),
      });
    }
    const cek: { blocked: boolean; sisaDetik: number } =
      await ctx.runQuery(internal.security.assertNotRateLimited, {
        identifier: ident,
        ip: ipBersih,
      });
    return cek; // UI dapat menampilkan sisa waktu blokir.
  },
});

/** Cek percobaan gagal tersisa sebelum diblokir (untuk UI). */
export const remainingAttempts = query({
  args: { ip: v.string() },
  handler: async (ctx, { ip }) => {
    const since = Date.now() - RATE_WINDOW_MS;
    const byIp = await ctx.db
      .query("loginAttempts")
      .withIndex("by_ip", (q) => q.eq("ip", ip))
      .collect();
    const gagal = byIp.filter((a) => !a.berhasil && a.waktu >= since).length;
    return { gagal, sisa: Math.max(0, RATE_MAX_GAGAL - gagal) };
  },
});

/** Helper kirim log dari klien (guest path di Auth.tsx). */
export const _noop = internalQuery({ args: {}, handler: async () => null });

/** Pastikan sesi terdaftar untuk pengguna non-admin juga (email/tamu). */
export const ensureSessionPublic = mutation({
  args: { sessionId: v.string(), perangkat: v.string(), ip: v.string() },
  handler: async (ctx, { sessionId, perangkat, ip }) => {
    // Sesi hasil pratinjau tidak didaftarkan sebagai perangkat nasabah. Selain
    // mengotori "Perangkat sesi saya", `ensureSession` menggugurkan sesi lain
    // (aturan sesi tunggal) — artinya pratinjau akan mengeluarkan nasabah dari
    // perangkatnya sendiri.
    if (await sesiPratinjauAktif(ctx)) return { ok: true, dilewati: "pratinjau" };
    const user = await getUser(ctx);
    if (user === null) return { ok: false };
    await ensureSession(ctx, user._id, sessionId, perangkat, ip);
    return { ok: true };
  },
});

/** Ekspor ulang untuk dipakai modul lain (tanpa siklus impor). */
export const _deviceLabel = deviceLabel;
