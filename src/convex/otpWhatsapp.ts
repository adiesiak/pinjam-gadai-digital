import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { ROLES } from "./schema";
import { catatLogin } from "./security";
import { tandaiNomorWaTerverifikasi } from "./kyc";
import {
  buatSaltOtp,
  cocokKodeOtp,
  hashKodeOtp,
  kodeOtpEnamDigit,
  labelTujuanOtp,
  normalisasiNomorWa,
  OTP_JENDELA_MS,
  OTP_MAKS_GAGAL_PER_USER,
  OTP_MAKS_PER_IP,
  OTP_MAKS_PER_NOMOR,
  OTP_MAKS_PER_USER,
  OTP_MAKS_PERCOBAAN,
  OTP_MASA_BERLAKU_MS,
  OTP_PANJANG_KODE,
  pesanOtp,
  sisaDetikCooldown,
  tujuanOtpValid,
  uraiResponFonnte,
  type TujuanOtp,
} from "../lib/otpWa";

/**
 * OTP WhatsApp PINDAI — SATU mesin OTP untuk seluruh aplikasi.
 *
 * Kenapa modul ini ada (dan menggantikan OTP plaintext di `security.ts`):
 * kode OTP adalah kredensial berumur pendek. Agar tidak bisa dipakai ulang,
 * diintip, atau ditebak, seluruh aturan hidup di satu tempat:
 *
 * - **Hanya backend yang memanggil Fonnte.** Pengiriman terjadi di action
 *   (`mintaOtpWa`); browser tidak pernah melihat token, endpoint, maupun isi
 *   permintaan. Token dibaca dari environment variable `FONNTE_TOKEN` —
 *   tidak pernah masuk source code, database, log, atau balasan API.
 * - **Hanya hash yang disimpan.** Tabel `waOtpChallenges` menyimpan
 *   `SHA-256(salt + ":" + kode)`; kode aslinya tidak pernah ditulis ke mana pun
 *   (bahkan `waLogs` hanya mencatat bahwa kode dikirim).
 * - **Terikat pengguna + nomor + tujuan.** Verifikasi mencari tantangan
 *   terakhir milik PENGGUNA yang sedang masuk untuk TUJUAN yang diminta, lalu
 *   memastikan nomor tersimpan masih nomor yang sama. Kode untuk satu tujuan
 *   tidak bisa dipakai di tujuan lain, dan OTP milik orang lain tidak berguna.
 * - **Umur 5 menit, sekali pakai, maksimal 5 percobaan**, plus cooldown kirim
 *   ulang dan pembatas laju per pengguna, per nomor, dan per IP.
 * - **Kirim ≠ verifikasi.** Respons sukses Fonnte hanya mengisi
 *   `statusPengiriman`; status "nomor terverifikasi" atau izin transaksi baru
 *   diberikan oleh `verifikasiOtpWa` setelah kode benar-benar dicocokkan.
 *
 * Catatan IP: Convex tidak mengekspos IP klien, jadi IP dikirim klien dan
 * dipakai untuk pembatas laju + jejak audit — bukan untuk otorisasi.
 */

/**
 * Endpoint resmi Fonnte (docs.fonnte.com/api-send-message): POST
 * `https://api.fonnte.com/send`, token apa adanya di header `Authorization`
 * (tanpa "Bearer"), body form-urlencoded dengan `target` + `message`.
 */
const FONNTE_URL = "https://api.fonnte.com/send";

/** Batas tunggu Fonnte; di atas ini pengiriman dianggap timeout. */
const FONNTE_TIMEOUT_MS = 10_000;

/** Lama izin transaksi setelah OTP transaksi diverifikasi (sekali pakai). */
export const JENDELA_IZIN_TRANSAKSI_MS = 2 * 60 * 1000;

/** Retensi baris tantangan — cukup untuk audit & pembatas laju. */
const RETENSI_TANTANGAN_MS = 24 * 60 * 60 * 1000;

const tujuanValidator = v.union(v.literal("verifikasi_nomor"), v.literal("transaksi"));

type HasilNomor = { ok: true; nomor: string } | { ok: false; pesan: string };

/**
 * Nomor WhatsApp yang tersimpan untuk pemilik akun — sumbernya modul KYC,
 * dengan `nasabahProfil` sebagai cadangan untuk akun lama.
 */
async function nomorTersimpan(ctx: QueryCtx, userId: Id<"users">): Promise<string | null> {
  const kyc = await ctx.db
    .query("kycProfil")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  const dariKyc = normalisasiNomorWa(kyc?.nomorWhatsApp);
  if (dariKyc !== null) return dariKyc;
  const profil = await ctx.db
    .query("nasabahProfil")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  return normalisasiNomorWa(profil?.nomorWhatsApp);
}

/**
 * Nomor tujuan untuk sebuah keperluan verifikasi, beserta gerbang peran.
 *
 * Dijalankan sebagai internal query (dipanggil action) DAN langsung di dalam
 * mutation verifikasi, supaya pengikatan nomor memakai definisi yang sama:
 * nomor yang diverifikasi harus nomor yang tersimpan SEKARANG.
 */
async function nomorUntukTujuan(
  ctx: QueryCtx,
  userId: Id<"users">,
  tujuan: TujuanOtp,
): Promise<HasilNomor> {
  const user = await ctx.db.get(userId);
  if (user === null) return { ok: false, pesan: "Akun tidak ditemukan." };
  if (user.isAnonymous === true) {
    return {
      ok: false,
      pesan: "Akun tamu tidak bisa memakai OTP WhatsApp. Masuk dengan akun terverifikasi.",
    };
  }
  if (tujuan === "transaksi" && user.role !== ROLES.DANA && user.role !== ROLES.ADMIN) {
    return { ok: false, pesan: "OTP WhatsApp transaksi khusus akun penyedia dana." };
  }
  const nomor = await nomorTersimpan(ctx, userId);
  if (nomor === null) {
    return {
      ok: false,
      pesan:
        "Nomor WhatsApp belum tersimpan dalam format 62…. Lengkapi dan simpan nomor di modul KYC lebih dulu.",
    };
  }
  return { ok: true, nomor };
}

/** Nomor tujuan untuk action pengiriman (dipakai lewat `ctx.runQuery`). */
export const _nomorUntukTujuan = internalQuery({
  args: { userId: v.id("users"), tujuan: v.string() },
  returns: v.union(
    v.object({ ok: v.literal(true), nomor: v.string() }),
    v.object({ ok: v.literal(false), pesan: v.string() }),
  ),
  handler: async (ctx, { userId, tujuan }): Promise<HasilNomor> => {
    if (!tujuanOtpValid(tujuan)) return { ok: false, pesan: "Tujuan verifikasi tidak dikenal." };
    return nomorUntukTujuan(ctx, userId, tujuan);
  },
});

/** Semua tantangan pengguna dalam jendela pembatas laju, terbaru dulu. */
async function tantanganPengguna(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<Array<{ _id: Id<"waOtpChallenges">; dibuatPada: number; tujuan: string; dipakaiPada?: number; nomor: string; kedaluwarsaPada: number; percobaanGagal: number; maksPercobaan: number; kodeHash: string; salt: string }>> {
  const rows = await ctx.db
    .query("waOtpChallenges")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return rows.sort((a, b) => b.dibuatPada - a.dibuatPada);
}

/**
 * Simpan permintaan kode SETELAH pembatas laju lolos.
 *
 * Dijalankan sebagai mutation terpisah dari action pengiriman: pembatas laju
 * harus dihitung dari baris yang benar-benar tersimpan (bukan dari klaim
 * klien), dan baris tantangan baru ditulis SEBELUM kode dikirim supaya
 * kegagalan gateway tidak membuat kode yang tidak pernah tercatat.
 *
 * Masa berlaku dihitung DI SINI (dari jam yang sama dengan `dibuatPada`), bukan
 * dikirim action: selisih dua `Date.now()` yang berbeda membuat kedaluwarsa
 * meleset beberapa milidetik dari 5 menit.
 *
 * Mengembalikan `ok: false` (bukan melempar) untuk keadaan "sedang cooldown"
 * atau "kuota permintaan habis" — keduanya keadaan normal yang perlu
 * ditampilkan ke pengguna, bukan galat server.
 */
export const _simpanPermintaan = internalMutation({
  args: {
    userId: v.id("users"),
    nomor: v.string(),
    tujuan: tujuanValidator,
    kodeHash: v.string(),
    salt: v.string(),
    maksPercobaan: v.number(),
    ip: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  },
  returns: v.union(
    v.object({ ok: v.literal(true), challengeId: v.id("waOtpChallenges") }),
    v.object({ ok: v.literal(false), pesan: v.string(), sisaDetik: v.number() }),
  ),
  handler: async (ctx, args) => {
    const sekarang = Date.now();
    const semua = await tantanganPengguna(ctx, args.userId);

    // Baris kedaluwarsa-retensi dibuang sekaligus supaya tabel tidak menumpuk.
    for (const baris of semua) {
      if (baris.dibuatPada < sekarang - RETENSI_TANTANGAN_MS) {
        await ctx.db.delete(baris._id);
      }
    }
    const sejak = sekarang - OTP_JENDELA_MS;
    const dalamJendela = semua.filter((b) => b.dibuatPada >= sejak);

    // 1) Cooldown kirim ulang untuk pengguna + tujuan yang sama.
    const terakhirTujuan = dalamJendela.find((b) => b.tujuan === args.tujuan) ?? null;
    const sisa = sisaDetikCooldown(terakhirTujuan?.dibuatPada ?? null, sekarang);
    if (sisa > 0) {
      return {
        ok: false as const,
        pesan: `Tunggu ${sisa} detik sebelum meminta kode lagi.`,
        sisaDetik: sisa,
      };
    }

    // 2) Batas per pengguna.
    if (dalamJendela.length >= OTP_MAKS_PER_USER) {
      return {
        ok: false as const,
        pesan: `Terlalu banyak permintaan kode dalam satu jam (maksimal ${OTP_MAKS_PER_USER}). Coba lagi nanti.`,
        sisaDetik: 0,
      };
    }

    // 3) Batas per nomor tujuan — nomor yang sama tidak boleh dibanjiri kode.
    const perNomor = await ctx.db
      .query("waOtpChallenges")
      .withIndex("by_nomor", (q) => q.eq("nomor", args.nomor))
      .collect();
    if (perNomor.filter((b) => b.dibuatPada >= sejak).length >= OTP_MAKS_PER_NOMOR) {
      return {
        ok: false as const,
        pesan:
          "Nomor ini sudah menerima terlalu banyak kode dalam satu jam. Tunggu beberapa menit, lalu coba lagi.",
        sisaDetik: 0,
      };
    }

    // 4) Batas per IP (bila klien mengirimnya).
    if (args.ip !== undefined && args.ip !== "") {
      const perIp = await ctx.db
        .query("waOtpChallenges")
        .withIndex("by_ip", (q) => q.eq("ip", args.ip))
        .collect();
      if (perIp.filter((b) => b.dibuatPada >= sejak).length >= OTP_MAKS_PER_IP) {
        return {
          ok: false as const,
          pesan: "Terlalu banyak permintaan kode dari jaringan ini. Coba lagi nanti.",
          sisaDetik: 0,
        };
      }
    }

    // 5) Kode lama untuk tujuan yang sama tidak berlaku lagi: hanya kode
    //    terakhir yang sah, supaya kotak masuk tidak jadi daftar kode hidup.
    for (const baris of dalamJendela) {
      if (baris.tujuan === args.tujuan && baris.dipakaiPada === undefined) {
        await ctx.db.patch(baris._id, { kedaluwarsaPada: sekarang });
      }
    }

    const challengeId = await ctx.db.insert("waOtpChallenges", {
      userId: args.userId,
      nomor: args.nomor,
      tujuan: args.tujuan,
      kodeHash: args.kodeHash,
      salt: args.salt,
      dibuatPada: sekarang,
      // Kedaluwarsa dihitung dari jam YANG SAMA dengan `dibuatPada` supaya masa
      // berlaku tepat 5 menit (kalau dihitung di action, selisihnya bisa 1 ms).
      kedaluwarsaPada: sekarang + OTP_MASA_BERLAKU_MS,
      maksPercobaan: args.maksPercobaan,
      percobaanGagal: 0,
      statusPengiriman: "menunggu",
      ...(args.ip === undefined ? {} : { ip: args.ip }),
      ...(args.userAgent === undefined ? {} : { userAgent: args.userAgent }),
    });
    return { ok: true as const, challengeId };
  },
});

/** Catat hasil pengiriman Fonnte. TIDAK menandai kode sebagai terverifikasi. */
export const _catatPengiriman = internalMutation({
  args: {
    challengeId: v.id("waOtpChallenges"),
    terkirim: v.boolean(),
    respon: v.string(),
  },
  handler: async (ctx, { challengeId, terkirim, respon }) => {
    const row = await ctx.db.get(challengeId);
    if (row === null) return;
    await ctx.db.patch(challengeId, {
      statusPengiriman: terkirim ? "terkirim" : "gagal",
      responPengiriman: respon.slice(0, 200),
    });
  },
});

/**
 * Kirim satu pesan lewat Fonnte dari SERVER.
 *
 * Token dibaca dari `process.env.FONNTE_TOKEN` (environment variable Convex) dan
 * hanya dipakai sebagai header permintaan — tidak dikembalikan, tidak dicatat,
 * dan tidak pernah masuk ke pesan galat. Semua kegagalan (token kosong, HTTP
 * gagal, `status: false`, timeout, koneksi gagal) dikembalikan sebagai hasil,
 * bukan dilempar, supaya action bisa menjawab dengan pesan yang jujur.
 */
async function kirimFonnte(
  nomor: string,
  pesan: string,
): Promise<{ terkirim: boolean; pesan: string }> {
  const token = (process.env.FONNTE_TOKEN ?? "").trim();
  if (token === "") {
    return {
      terkirim: false,
      pesan:
        "FONNTE_TOKEN belum diisi pada environment deployment, jadi kode tidak dikirim. Hubungi pengelola agar menambahkannya.",
    };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FONNTE_TIMEOUT_MS);
  try {
    const res = await fetch(FONNTE_URL, {
      method: "POST",
      // Tanpa mengikuti redirect: endpoint publik yang mengalihkan ke alamat
      // lain tidak boleh ikut dikejar.
      redirect: "error",
      signal: controller.signal,
      headers: {
        // Fonnte: token dikirim apa adanya, tanpa awalan "Bearer".
        Authorization: token,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        target: nomor,
        message: pesan,
        countryCode: "62",
      }).toString(),
    });
    const teks = (await res.text()).slice(0, 500);
    return uraiResponFonnte(res.status, teks);
  } catch (err) {
    const nama = err instanceof Error ? err.name : "";
    if (nama === "AbortError" || nama === "TimeoutError") {
      return {
        terkirim: false,
        pesan: `Pengiriman ke Fonnte timeout (${Math.round(FONNTE_TIMEOUT_MS / 1000)} detik). Coba lagi.`,
      };
    }
    const pesanGalat = err instanceof Error ? err.message : "Koneksi gagal";
    return {
      terkirim: false,
      pesan: `Gagal menghubungi Fonnte: ${pesanGalat.slice(0, 160)}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Minta kode OTP WhatsApp (action — satu-satunya jalur yang menghubungi Fonnte).
 *
 * Urutan yang dijaga: gerbang peran & nomor → pembatas laju (cooldown, per
 * pengguna, per nomor, per IP) → simpan HASH kode → kirim → catat hasil.
 * Kode aslinya hanya hidup di memori action ini; balasan tidak pernah
 * memuatnya.
 */
export const mintaOtpWa = action({
  args: {
    tujuan: tujuanValidator,
    /** IP klien (opsional) untuk pembatas laju & jejak audit. */
    ip: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  },
  returns: v.object({
    ok: v.boolean(),
    terkirim: v.boolean(),
    pesan: v.string(),
    sisaDetik: v.number(),
  }),
  handler: async (
    ctx,
    { tujuan, ip, userAgent },
  ): Promise<{ ok: boolean; terkirim: boolean; pesan: string; sisaDetik: number }> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Harus masuk terlebih dahulu.");

    const dasar: HasilNomor = await ctx.runQuery(internal.otpWhatsapp._nomorUntukTujuan, {
      userId,
      tujuan,
    });
    if (!dasar.ok) {
      return { ok: false, terkirim: false, pesan: dasar.pesan, sisaDetik: 0 };
    }

    const kode = kodeOtpEnamDigit();
    const salt = buatSaltOtp();
    const kodeHash = await hashKodeOtp(salt, kode);

    const izin = await ctx.runMutation(internal.otpWhatsapp._simpanPermintaan, {
      userId,
      nomor: dasar.nomor,
      tujuan,
      kodeHash,
      salt,
      maksPercobaan: OTP_MAKS_PERCOBAAN,
      ip: ip?.trim().slice(0, 64),
      userAgent: userAgent?.trim().slice(0, 200),
    });
    if (!izin.ok) {
      return { ok: false, terkirim: false, pesan: izin.pesan, sisaDetik: izin.sisaDetik };
    }

    const hasil = await kirimFonnte(dasar.nomor, pesanOtp(tujuan, kode));
    await ctx.runMutation(internal.otpWhatsapp._catatPengiriman, {
      challengeId: izin.challengeId,
      terkirim: hasil.terkirim,
      respon: hasil.pesan,
    });
    // Log pengiriman ikut jejak penagihan WhatsApp: isi pesan (yang memuat kode)
    // TIDAK pernah disimpan — hanya status & respon gateway yang sudah dipotong.
    await ctx.runMutation(internal.whatsapp._appendLog, {
      nomorTujuan: dasar.nomor,
      jenis: `otp_${tujuan}`,
      isiPesan: `Kode OTP untuk ${labelTujuanOtp(tujuan)} dikirim (isi disembunyikan).`,
      status: hasil.terkirim ? "terkirim" : "gagal",
      respon: hasil.pesan,
      olehUserId: userId,
    });

    return {
      ok: hasil.terkirim,
      terkirim: hasil.terkirim,
      pesan: hasil.pesan,
      sisaDetik: 0,
    };
  },
});

/** Terbitkan izin transaksi sekali-pakai untuk penyedia dana (2 menit). */
async function beriIzinTransaksi(ctx: MutationCtx, userId: Id<"users">, sekarang: number) {
  const mfa = await ctx.db
    .query("mfaSettings")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  const patch = { waOtpTerverifikasiSampai: sekarang + JENDELA_IZIN_TRANSAKSI_MS };
  if (mfa === null) {
    await ctx.db.insert("mfaSettings", { userId, ...patch });
  } else {
    await ctx.db.patch(mfa._id, patch);
  }
}

/** Hasil verifikasi — kegagalan dikembalikan sebagai hasil, bukan dilempar. */
type HasilVerifikasi = { ok: true } | { ok: false; pesan: string };

/**
 * Inti verifikasi — SATU-satunya definisi "kode OTP sah" di aplikasi.
 *
 * Yang diperiksa berurutan: pengguna berhak & punya nomor → kode berbentuk
 * 6 angka → ada tantangan untuk tujuan ini → batas gagal per pengguna → belum
 * dipakai → belum kedaluwarsa → belum melampaui batas percobaan → nomor masih
 * sama → HASH kode cocok. Kode salah menambah hitungan percobaan dan dicatat di
 * `loginLogs`.
 *
 * KENAPA MENGEMBALIKAN HASIL, BUKAN MELEMPAR: di Convex, melempar dari mutation
 * membatalkan SELURUH tulisan transaksi itu — termasuk hitungan percobaan yang
 * baru saja ditambah. Kode salah yang tidak dihitung sama saja dengan tanpa
 * batas percobaan, jadi kegagalan verifikasi dikembalikan sebagai nilai dan
 * hitungannya ikut tersimpan. Hanya "belum masuk" yang tetap dilempar.
 */
async function verifikasiKodeOtp(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    tujuan: TujuanOtp;
    kode: string;
    ip?: string;
    userAgent?: string;
  },
): Promise<HasilVerifikasi> {
  const { userId, tujuan } = args;
  const gerbang = await nomorUntukTujuan(ctx, userId, tujuan);
  if (!gerbang.ok) return { ok: false, pesan: gerbang.pesan };

  const bersih = (args.kode ?? "").replace(/\D/g, "");
  if (bersih.length !== OTP_PANJANG_KODE) {
    return { ok: false, pesan: `Kode OTP harus ${OTP_PANJANG_KODE} angka.` };
  }

  const sekarang = Date.now();
  const semua = await tantanganPengguna(ctx, userId);
  const tantangan = semua.find((b) => b.tujuan === tujuan) ?? null;
  if (tantangan === null) {
    return { ok: false, pesan: "Belum ada kode OTP untuk keperluan ini. Minta kode dulu." };
  }

  // Batas TOTAL percobaan gagal per pengguna (lintas kode): menebak berulang
  // dengan meminta kode baru tetap tidak membuka pintu.
  const gagalSatuJam = semua
    .filter((b) => b.dibuatPada >= sekarang - OTP_JENDELA_MS)
    .reduce((total, b) => total + b.percobaanGagal, 0);
  if (gagalSatuJam >= OTP_MAKS_GAGAL_PER_USER) {
    await catatLogin(ctx, {
      userId,
      status: "diblokir",
      metode: "wa_otp",
      ip: (args.ip ?? "").slice(0, 64),
      userAgent: (args.userAgent ?? "").slice(0, 200),
      keterangan: `Batas percobaan OTP (${tujuan}) tercapai`,
    });
    return {
      ok: false,
      pesan: "Terlalu banyak percobaan kode. Minta kode baru lalu coba lagi nanti.",
    };
  }

  if (tantangan.dipakaiPada !== undefined) {
    return { ok: false, pesan: "Kode OTP ini sudah dipakai. Minta kode baru." };
  }
  if (tantangan.kedaluwarsaPada <= sekarang) {
    return { ok: false, pesan: "Kode OTP kedaluwarsa (berlaku 5 menit). Minta kode baru." };
  }
  if (tantangan.percobaanGagal >= tantangan.maksPercobaan) {
    return { ok: false, pesan: "Terlalu banyak percobaan untuk kode ini. Minta kode baru." };
  }
  // Pengikatan nomor: verifikasi hanya berlaku untuk nomor yang sama dengan
  // saat kode dikirim. Nomor yang berubah membatalkan bukti lama.
  if (tantangan.nomor !== gerbang.nomor) {
    return {
      ok: false,
      pesan: "Nomor WhatsApp Anda berubah setelah kode dikirim. Minta kode baru untuk nomor terbaru.",
    };
  }

  const hashCode = await hashKodeOtp(tantangan.salt, bersih);
  if (!cocokKodeOtp(tantangan.kodeHash, hashCode)) {
    const baru = tantangan.percobaanGagal + 1;
    await ctx.db.patch(tantangan._id, { percobaanGagal: baru });
    await catatLogin(ctx, {
      userId,
      status: "gagal",
      metode: "wa_otp",
      ip: (args.ip ?? "").slice(0, 64),
      userAgent: (args.userAgent ?? "").slice(0, 200),
      keterangan: `Kode OTP salah (ke-${baru}, tujuan ${tujuan})`,
    });
    return { ok: false, pesan: "Kode OTP salah." };
  }

  // Sekali pakai: kode langsung dihabiskan, terlepas dari apa pun setelah ini.
  await ctx.db.patch(tantangan._id, { dipakaiPada: sekarang });

  if (tujuan === "verifikasi_nomor") {
    // Nomor baru berubah menjadi TERVERIFIKASI hanya di sini — dan hanya dari
    // server, setelah hash kode benar-benar cocok.
    await tandaiNomorWaTerverifikasi(ctx, {
      userId,
      nomor: tantangan.nomor,
      pada: sekarang,
      olehLabel: "OTP WhatsApp",
    });
  } else {
    // Izin transaksi sekali pakai; dihabiskan mutation finansial yang memakainya.
    await beriIzinTransaksi(ctx, userId, sekarang);
  }

  await catatLogin(ctx, {
    userId,
    status: "berhasil",
    metode: "wa_otp",
    ip: (args.ip ?? "").slice(0, 64),
    userAgent: (args.userAgent ?? "").slice(0, 200),
    keterangan: `Menyerahkan izin ${tujuan}`,
  });
  return { ok: true };
}

/**
 * Verifikasi kode OTP milik pengguna yang sedang masuk.
 *
 * Ini SATU-satunya pintu verifikasi: transaksi penyedia dana memakai IZIN
 * sekali pakai yang diterbitkan di sini (`alokasiDana.requireWaOtpIfEnabled`),
 * bukan mencocokkan kode sendiri — supaya hitungan percobaan tidak bisa
 * dilewati lewat jalur transaksi.
 */
export const verifikasiOtpWa = mutation({
  args: {
    tujuan: tujuanValidator,
    kode: v.string(),
    ip: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  },
  returns: v.union(
    v.object({ ok: v.literal(true) }),
    v.object({ ok: v.literal(false), pesan: v.string() }),
  ),
  handler: async (ctx, { tujuan, kode, ip, userAgent }): Promise<HasilVerifikasi> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
    return await verifikasiKodeOtp(ctx, { userId, tujuan, kode, ip, userAgent });
  },
});
