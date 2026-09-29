import { getAuthUserId } from "@convex-dev/auth/server";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { ROLES } from "./schema";
import { generateTotpSecret, verifyTotpCode } from "../lib/totp";
import {
  addVerifiedAuthSession,
  getAdminGateStatus,
  requireAdminRole,
  requireAdminSession,
  getCurrentAuthSessionId,
} from "./adminAuthz";

/**
 * Proteksi otentikasi & login PINDAI:
 *  1. MFA/2FA TOTP untuk Super Admin (Google Authenticator/Authy).
 *  2. OTP WhatsApp untuk Pendana — login perangkat baru & transaksi finansial.
 *  3. Rate limiting login (5x salah / 15 menit per IP) + blokir sementara.
 *  4. Sesi aktif tunggal — perangkat baru otomatis menggugurkan sesi lama.
 *  5. Log login append-only: status, IP, user-agent, timestamp.
 *
 * Catatan IP: Convex tidak mengekspos IP klien; klien mengirim IP publiknya
 * sendiri (opini server tetap jujur — nilai dipakai untuk anomali, bukan
 * otorisasi). UA juga dikirim klien.
 */

const WA_OTP_AGE_MS = 5 * 60 * 1000; // 5 menit
const MAX_OTP_GAGAL = 5;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX_GAGAL = 5;
const BLOCK_MS = 15 * 60 * 1000;

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

/** Rekam satu percobaan login (append-only). */
export const _recordAttempt = internalMutation({
  args: {
    identifier: v.string(),
    ip: v.string(),
    berhasil: v.boolean(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("loginAttempts", { ...args, waktu: Date.now() });
  },
});

/** Rekam percobaan + lempar bila sedang diblokir — dipakai action OTP WA. */
export const _guardLogin = internalMutation({
  args: { identifier: v.string(), ip: v.string(), berhasil: v.boolean() },
  handler: async (ctx, args) => {
    const cek = await ctx.runQuery(internal.security.assertNotRateLimited, {
      identifier: args.identifier,
      ip: args.ip,
    });
    if (cek.blocked && !args.berhasil) {
      throw new Error(
        `Terlalu banyak percobaan. Coba lagi dalam ${Math.ceil(cek.sisaDetik / 60)} menit.`,
      );
    }
    await ctx.runMutation(internal.security._recordAttempt, {
      identifier: args.identifier,
      ip: args.ip,
      berhasil: args.berhasil,
    });
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
  args: { kode: v.string(), perangkat: v.string(), ip: v.string() },
  handler: async (ctx, { kode, perangkat, ip }) => {
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
    const ok = await verifyTotpCode(secret, kode);
    if (!ok) {
      await catatLogin(ctx, {
        userId: user._id,
        status: "gagal",
        metode: "totp",
        ip,
        userAgent: perangkat,
        keterangan: "Kode TOTP salah",
      });
      throw new Error("Kode TOTP salah.");
    }
    // Anti-replay: kode yang sama tidak boleh dipakai dua kali (±1 window).
    const counter = Math.floor(Date.now() / 30_000);
    if (mfa?.totpLastCounter !== undefined && counter <= mfa.totpLastCounter) {
      throw new Error("Kode TOTP sudah terpakai — tunggu kode berikutnya.");
    }
    await ctx.db.patch(mfa._id, {
      totpLastCounter: counter,
      totpVerifiedAuthSessionIds: addVerifiedAuthSession(
        mfa.totpVerifiedAuthSessionIds,
        authSessionId,
      ),
    });
    await catatLogin(ctx, {
      userId: user._id,
      status: "berhasil",
      metode: "totp",
      ip,
      userAgent: perangkat,
    });
    return { ok: true, butuh: true };
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
// OTP WhatsApp — Pendana
// =====================================================================

/** Status OTP WA untuk Pendana. */
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

/** Mulai challenge OTP WA — kirim 6 digit via gateway WA (action). */
export const requestWaOtp = action({
  args: { tujuan: v.string(), ip: v.string(), userAgent: v.string(), alasan: v.string() },
  handler: async (ctx, { tujuan, ip, userAgent, alasan }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
    const me: { role?: string } | null = await ctx.runQuery(api.users.currentRole, {});
    if (me === null) throw new Error("Harus masuk terlebih dahulu.");
    if (me.role !== ROLES.PENDANA && me.role !== ROLES.ADMIN) {
      throw new Error("OTP WhatsApp khusus akun Pendana.");
    }

    // Rate limit: 5 gagal / 15 menit per IP & per nomor.
    await ctx.runMutation(internal.security._guardLogin, {
      identifier: tujuan,
      ip,
      berhasil: true, // permintaan kode bukan kegagalan; kegagalan dihitung saat verifikasi
    });

    const kode = String(Math.floor(100000 + Math.random() * 900000));
    const kedaluwarsa = Date.now() + WA_OTP_AGE_MS;
    await ctx.runMutation(internal.security._setWaOtp, {
      userId,
      kode,
      kedaluwarsa,
    });

    // Kirim via gateway WhatsApp (generik, sama seperti pengingat).
    const settings = await ctx.runQuery(internal.whatsapp._getSettings, {});
    let status = "gagal";
    let respon = "";
    if (settings.aktif !== true || !settings.apiUrl) {
      respon = "Integrasi WhatsApp belum aktif — kode hanya dicatat di log (mode uji).";
      status = "dinonaktifkan";
    } else {
      const apiKey = process.env.WHATSAPP_API_KEY ?? "";
      if (!apiKey) {
        respon = "WHATSAPP_API_KEY belum diisi di environment.";
      } else {
        const isi =
          `Kode verifikasi PINDAI Anda: ${kode}\n` +
          `Berlaku 5 menit. Jangan bagikan kode ini ke siapa pun.\n` +
          `Alasan: ${alasan}.`;
        try {
          const header = settings.authHeader ?? "Authorization";
          const prefix = settings.authPrefix ?? "";
          const res = await fetch(settings.apiUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [header]: `${prefix}${apiKey}`,
            },
            body: JSON.stringify({
              [settings.fieldNomor ?? "target"]: tujuan,
              [settings.fieldPesan ?? "message"]: isi,
            }),
          });
          const text = (await res.text()).slice(0, 300);
          status = res.ok ? "terkirim" : "gagal";
          respon = `HTTP ${res.status}: ${text}`;
        } catch (err) {
          respon = err instanceof Error ? err.message : "Koneksi gagal";
        }
      }
    }

    await ctx.runMutation(internal.security._appendWaOtpLog, {
      nomorTujuan: tujuan,
      status,
      respon,
      userId,
      alasan,
    });
    if (status === "terkirim") return { ok: true };
    // Mode uji tanpa gateway tetap mengizinkan (kode tercatat di log admin).
    return { ok: false, modeUji: true, respon };
  },
});

export const _setWaOtp = internalMutation({
  args: { userId: v.id("users"), kode: v.string(), kedaluwarsa: v.number() },
  handler: async (ctx, { userId, kode, kedaluwarsa }) => {
    const mfa = await getMfa(ctx, userId);
    if (mfa === null) {
      await ctx.db.insert("mfaSettings", {
        userId,
        waOtpKode: kode,
        waOtpKedaluwarsa: kedaluwarsa,
        waOtpGagal: 0,
      });
    } else {
      await ctx.db.patch(mfa._id, {
        waOtpKode: kode,
        waOtpKedaluwarsa: kedaluwarsa,
        waOtpGagal: 0,
      });
    }
  },
});

export const _appendWaOtpLog = internalMutation({
  args: {
    nomorTujuan: v.string(),
    status: v.string(),
    respon: v.string(),
    userId: v.id("users"),
    alasan: v.string(),
  },
  handler: async (ctx, { nomorTujuan, status, respon, userId, alasan }) => {
    await ctx.db.insert("waLogs", {
      loanId: undefined,
      nomorTujuan,
      jenis: `otp_${alasan}`,
      isiPesan: `OTP dikirim (isi disembunyikan) — ${alasan}`,
      status,
      respon,
      olehUserId: userId,
      waktu: Date.now(),
    });
  },
});

/**
 * Verifikasi OTP WA — dipakai transaksi finansial Pendana (alokasi dana,
 * penarikan) dan konfirmasi perangkat baru. Mengembalikan { ok } dan
 * mencatat percobaan untuk rate limiting.
 */
export const verifyWaOtp = mutation({
  args: { kode: v.string(), ip: v.string(), userAgent: v.string() },
  handler: async (ctx, { kode, ip, userAgent }) => {
    const user = await getUser(ctx);
    if (user === null) throw new Error("Harus masuk terlebih dahulu.");
    if (user.role !== ROLES.PENDANA && user.role !== ROLES.ADMIN) {
      throw new Error("OTP WhatsApp khusus akun Pendana.");
    }
    const mfa = await getMfa(ctx, user._id);
    const gagal = await ctx.runQuery(internal.security.assertNotRateLimited, {
      identifier: user.email ?? "pendana",
      ip,
    });
    if (gagal.blocked) {
      await catatLogin(ctx, {
        userId: user._id,
        status: "diblokir",
        metode: "wa_otp",
        ip,
        userAgent,
        keterangan: "Rate limit OTP WA",
      });
      throw new Error(
        `Terlalu banyak percobaan. Coba lagi dalam ${Math.ceil(gagal.sisaDetik / 60)} menit.`,
      );
    }
    const benar =
      mfa?.waOtpKode !== undefined &&
      kode === mfa.waOtpKode &&
      (mfa.waOtpKedaluwarsa ?? 0) > Date.now();
    await ctx.runMutation(internal.security._guardLogin, {
      identifier: user.email ?? "pendana",
      ip,
      berhasil: benar,
    });
    if (!benar) {
      const baru = (mfa?.waOtpGagal ?? 0) + 1;
      if (mfa !== null) {
        await ctx.db.patch(mfa._id, { waOtpGagal: baru });
      }
      await catatLogin(ctx, {
        userId: user._id,
        status: "gagal",
        metode: "wa_otp",
        ip,
        userAgent,
        keterangan: `OTP WA salah (ke-${baru})`,
      });
      throw new Error("Kode OTP salah atau kedaluwarsa.");
    }
    if (mfa !== null) {
      await ctx.db.patch(mfa._id, {
        waOtpKode: undefined,
        waOtpKedaluwarsa: undefined,
        waOtpGagal: 0,
        // Jendela 2 menit bagi mutation finansial untuk lanjut tanpa meminta
        // kode lagi (sekali pakai — langsung dihabiskan mutation tersebut).
        waOtpTerverifikasiSampai: Date.now() + 2 * 60 * 1000,
      });
    }
    await catatLogin(ctx, {
      userId: user._id,
      status: "berhasil",
      metode: "wa_otp",
      ip,
      userAgent,
      keterangan: "Verifikasi transaksi Pendana",
    });
    return { ok: true };
  },
});

/**
 * Set/toggle OTP WA wajib untuk transaksi Pendana (onboarding keamanan).
 * Dipanggil dari dashboard Pendana.
 */
export const setWaOtpRequired = mutation({
  args: { wajib: v.boolean() },
  handler: async (ctx, { wajib }) => {
    const user = await getUser(ctx);
    if (user === null) throw new Error("Harus masuk terlebih dahulu.");
    if (user.role !== ROLES.PENDANA) {
      throw new Error("Pengaturan OTP WhatsApp khusus akun Pendana.");
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
    const ident = identifier.toLowerCase().slice(0, 120);
    await ctx.db.insert("loginAttempts", {
      identifier: ident,
      ip,
      berhasil: false,
      waktu: Date.now(),
    });
    const cek: { blocked: boolean; sisaDetik: number } =
      await ctx.runQuery(internal.security.assertNotRateLimited, {
        identifier: ident,
        ip,
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
    const user = await getUser(ctx);
    if (user === null) return { ok: false };
    await ensureSession(ctx, user._id, sessionId, perangkat, ip);
    return { ok: true };
  },
});

/** Ekspor ulang untuk dipakai modul lain (tanpa siklus impor). */
export const _deviceLabel = deviceLabel;
