/**
 * KLAIM & LOGIN PEMINJAM LAMA — memulihkan data akun dari WEB LAMA.
 *
 * MASALAH: nasabah lama masuk dari web lama. Datanya sudah ada (dimasukkan
 * admin / hasil migrasi — akun `users` bertanda `dibuatAdminPada`, dengan
 * pinjaman, gadai, kredit, dan master identitas yang sudah tercatat), tetapi
 * mereka tidak punya email untuk masuk. Kalau mereka mendaftar akun baru,
 * dashboardnya KOSONG — riwayatnya tetap tertinggal di akun lama.
 *
 * JALAN KELUAR (dua pintu, satu mesin):
 *
 *  1. `mintaKodeKlaim` (action, TANPA sesi) — peminjam mengetik nomor WhatsApp
 *     lamanya. Nomor itu dicari sebagai PEMILIK data lama lewat indeks
 *     `by_nomorWhatsApp` (loans / nasabahProfil / kycProfil). Kalau memang ada
 *     data lama, kode 6 digit dikirim ke nomor itu lewat Fonnte. Kalau tidak
 *     ada, permintaan dijawab jujur "nomor belum terdaftar" — bukan dibuatkan
 *     akun kosong.
 *  2. Kode itu dipakai di salah satu dari dua jalur:
 *     - `_klaimUntukMasuk` (internal): dipakai provider Convex Auth
 *       (`auth/whatsappOtp.ts`) sehingga peminjam MASUK ke akun lamanya
 *       sendiri. Karena akun tujuan = pemilik data, dashboardnya langsung
 *       berisi riwayat — tidak ada form kosong.
 *     - `claimOrLoginBorrower` (publik, butuh sesi): pemakai yang sudah masuk
 *       (mis. lewat email, atau sesi tamu yang kemudian dia klaim) menautkan
 *       data lama ke akun sesi aktifnya.
 *
 * ATURAN YANG TIDAK DILANGGAR:
 * - Data lama TIDAK PERNAH dihapus atau ditulis ulang nilainya. Penautan hanya
 *   MEMINDAHKAN kepemilikan (`userId`) berkas produktif + master identitas,
 *   dengan penanda `klaimDariUserId`/`klaimPada` pada barisnya dan satu baris
 *   `klaimPeminjam` (append-only) sebagai jejaknya.
 * - Data GANDA tidak digabung otomatis. Bila satu nomor tercatat pada lebih
 *   dari satu akun LAIN (selain akun yang sedang mengklaim), klaim DIHENTIKAN
 *   dan pemakai diarahkan ke admin — sama dengan sikap
 *   `convex/duplikatNasabah.ts`. Tanpa aturan ini, dua orang yang kebetulan
 *   memakai satu nomor bisa saling menarik berkas.
 * - Master identitas (`nasabahProfil`/`kycProfil`) hanya dipindahkan bila akun
 *   tujuan BELUM punya master sendiri. Kalau sudah punya, berkas lama
 *   dibiarkan di tempatnya dan sisa ganda itu dilaporkan ke admin (ada alat
 *   penggabungannya) — bukan ditumpuk menjadi dua master dalam satu akun, dan
 *   bukan dihapus.
 * - Hanya HASH kode yang disimpan (`klaimOtp`), sekali pakai, 5 menit, dengan
 *   batas percobaan serta pembatas laju per nomor & per IP.
 * - Yang TIDAK ikut berpindah (disengaja): jejak lokasi, riwayat KYC, pengaduan,
 *   dan notifikasi-terbaca milik akun lama. Berkas itu milik perjalanan sesi
 *   akun tersebut, bukan isi portofolio yang harus tampil di dashboard baru;
 *   memindahkannya akan mengubah arti riwayat persetujuan/privasi yang sudah
 *   tercatat. Perhitungan uang (ledger, transfer pendana) tidak pernah
 *   disentuh — hanya `userId` baris pinjaman/gadai/kredit yang berpindah.
 */
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { ROLES } from "./schema";
import { catatLogin } from "./security";
import { audit } from "./system";
import { kirimFonnte } from "./otpWhatsapp";
import {
  adaDataLama,
  BERKAS_LAMA_KOSONG,
  KLAIM_JENDELA_MS,
  KLAIM_MAKS_GAGAL,
  KLAIM_MAKS_PER_IP,
  KLAIM_MAKS_PER_NOMOR,
  KLAIM_RETENSI_MS,
  gadaiMasihBerjalan,
  kalimatBerkasLama,
  kreditMasihBerjalan,
  pesanDataGanda,
  pesanOtpKlaim,
  pinjamanMasihBerjalan,
  topengNomor,
  totalBerkas,
  type BerkasLama,
} from "../lib/klaimLama";
import { formatRupiahAman } from "../lib/money";
import {
  buatSaltOtp,
  cocokKodeOtp,
  hashKodeOtp,
  kodeOtpEnamDigit,
  normalisasiNomorWa,
  OTP_MASA_BERLAKU_MS,
  OTP_MAKS_PERCOBAAN,
  OTP_PANJANG_KODE,
  sisaDetikCooldown,
} from "../lib/otpWa";

/** Validator berkas lama — dipakai balasan publik maupun internal. */
const berkasValidator = v.object({
  pinjaman: v.number(),
  gadai: v.number(),
  kredit: v.number(),
  masterNasabah: v.number(),
  pokokPinjaman: v.number(),
  pinjamanAktif: v.number(),
  pinjamanLunas: v.number(),
  akunKandidat: v.number(),
});

/** Satu akun yang mengaku pemilik data untuk sebuah nomor. */
type PemilikBerkas = { userId: Id<"users">; berkas: BerkasLama };

/** Peta kepemilikan data lama untuk satu nomor WhatsApp. */
type Kepemilikan = {
  /** Nomor ternormalisasi (62…). */
  nomor: string;
  /** Semua akun pemilik data nomor ini, berkas terbanyak lebih dulu. */
  pemilik: PemilikBerkas[];
};

/** Label akun untuk jejak audit (email → nama → id). */
function labelAkun(user: Doc<"users"> | null, userId: Id<"users">): string {
  if (user === null) return String(userId);
  return user.email ?? user.name ?? String(userId);
}

/** Ringkasan berkas milik SATU akun (dipakai untuk memilih pemilik utama). */
async function berkasPemilik(ctx: QueryCtx, userId: Id<"users">): Promise<BerkasLama> {
  const [pinjaman, gadai, kredit, profil, kyc] = await Promise.all([
    ctx.db.query("loans").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
    ctx.db.query("pawns").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
    ctx.db.query("kreditBarang").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
    ctx.db.query("nasabahProfil").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
    ctx.db.query("kycProfil").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
  ]);
  return {
    pinjaman: pinjaman.length,
    gadai: gadai.length,
    kredit: kredit.length,
    masterNasabah: profil.length + kyc.length,
    pokokPinjaman: pinjaman.reduce((total, l) => total + (l.pokokPinjaman ?? 0), 0),
    pinjamanAktif: pinjaman.filter((l) => pinjamanMasihBerjalan(l.status)).length,
    pinjamanLunas: pinjaman.filter((l) => l.status === "lunas").length,
    akunKandidat: 1,
  };
}

/**
 * Cari PEMILIK data lama untuk sebuah nomor.
 *
 * Sumber pemilik (semuanya lewat indeks, tanpa memindai tabel): nomor WhatsApp
 * pada pengajuan pinjaman, master nasabah, dan profil KYC. Gadai/kredit tidak
 * menyimpan indeks nomor, tetapi keduanya dihitung dari pemilik yang sudah
 * ditemukan (`by_user`) — jadi angkanya tetap jujur tanpa indeks tambahan.
 */
async function kepemilikanNomor(ctx: QueryCtx, nomor: string): Promise<Kepemilikan> {
  const [lewatPinjaman, lewatProfil, lewatKyc] = await Promise.all([
    ctx.db
      .query("loans")
      .withIndex("by_nomorWhatsApp", (q) => q.eq("nomorWhatsApp", nomor))
      .collect(),
    ctx.db
      .query("nasabahProfil")
      .withIndex("by_nomorWhatsApp", (q) => q.eq("nomorWhatsApp", nomor))
      .collect(),
    ctx.db
      .query("kycProfil")
      .withIndex("by_nomorWhatsApp", (q) => q.eq("nomorWhatsApp", nomor))
      .collect(),
  ]);

  const kandidat = [
    ...new Set<string>([
      ...lewatPinjaman.map((l) => l.userId as string),
      ...lewatProfil.map((p) => p.userId as string),
      ...lewatKyc.map((k) => k.userId as string),
    ]),
  ] as Array<Id<"users">>;

  const pemilik = await Promise.all(
    kandidat.map(async (userId) => ({ userId, berkas: await berkasPemilik(ctx, userId) })),
  );
  // Pemilik dengan berkas terbanyak dianggap pemilik data lama; sisanya tetap
  // dilaporkan supaya pemanggil bisa MENAHAN klaim saat datanya ganda.
  pemilik.sort(
    (a, b) =>
      totalBerkas(b.berkas) - totalBerkas(a.berkas) ||
      b.berkas.masterNasabah - a.berkas.masterNasabah ||
      b.berkas.pokokPinjaman - a.berkas.pokokPinjaman,
  );

  return { nomor, pemilik };
}

/** Pemilik dengan berkas terbanyak, atau `null` bila nomornya tak dikenal. */
function pemilikUtama(kepemilikan: Kepemilikan): PemilikBerkas | null {
  return kepemilikan.pemilik[0] ?? null;
}

/** Kepemilikan data lama untuk sebuah nomor (dipakai action pengiriman kode). */
export const _kepemilikanNomor = internalQuery({
  args: { nomor: v.string() },
  returns: v.object({
    nomor: v.string(),
    pemilik: v.array(
      v.object({
        userId: v.id("users"),
        berkas: berkasValidator,
      }),
    ),
  }),
  handler: async (ctx, { nomor }): Promise<Kepemilikan> => kepemilikanNomor(ctx, nomor),
});

/**
 * Simpan permintaan kode klaim SETELAH pembatas laju lolos.
 *
 * Urutan yang dijaga sama dengan OTP lain: buang baris kedaluwarsa-retensi →
 * cooldown kirim ulang untuk nomor yang sama → batas per nomor → batas per IP →
 * matikan kode lama → simpan hash kode baru. Kode lama dimatikan supaya kotak
 * masuk tidak menjadi daftar kode yang semuanya masih hidup.
 */
export const _simpanPermintaanKlaim = internalMutation({
  args: {
    nomor: v.string(),
    kodeHash: v.string(),
    salt: v.string(),
    maksPercobaan: v.number(),
    berkasLama: v.number(),
    ip: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  },
  returns: v.union(
    v.object({ ok: v.literal(true), challengeId: v.id("klaimOtp") }),
    v.object({ ok: v.literal(false), pesan: v.string(), sisaDetik: v.number() }),
  ),
  handler: async (ctx, args) => {
    const sekarang = Date.now();
    const semua = await ctx.db
      .query("klaimOtp")
      .withIndex("by_nomor", (q) => q.eq("nomor", args.nomor))
      .collect();

    for (const baris of semua) {
      if (baris.dibuatPada < sekarang - KLAIM_RETENSI_MS) await ctx.db.delete(baris._id);
    }

    const sejak = sekarang - KLAIM_JENDELA_MS;
    const dalamJendela = semua.filter((b) => b.dibuatPada >= sejak);

    const terakhir = dalamJendela.reduce<number | null>(
      (maks, b) => (maks === null || b.dibuatPada > maks ? b.dibuatPada : maks),
      null,
    );
    const sisa = sisaDetikCooldown(terakhir, sekarang);
    if (sisa > 0) {
      return {
        ok: false as const,
        pesan: `Kode sudah dikirim ke nomor ini. Tunggu ${sisa} detik sebelum meminta kode lagi.`,
        sisaDetik: sisa,
      };
    }

    if (dalamJendela.length >= KLAIM_MAKS_PER_NOMOR) {
      return {
        ok: false as const,
        pesan: `Nomor ini sudah menerima terlalu banyak kode dalam satu jam (maksimal ${KLAIM_MAKS_PER_NOMOR}). Coba lagi nanti.`,
        sisaDetik: 0,
      };
    }

    if (args.ip !== undefined && args.ip !== "") {
      const perIp = await ctx.db
        .query("klaimOtp")
        .withIndex("by_ip", (q) => q.eq("ip", args.ip))
        .collect();
      if (perIp.filter((b) => b.dibuatPada >= sejak).length >= KLAIM_MAKS_PER_IP) {
        return {
          ok: false as const,
          pesan: "Terlalu banyak permintaan kode dari jaringan ini. Coba lagi nanti.",
          sisaDetik: 0,
        };
      }
    }

    for (const baris of dalamJendela) {
      if (baris.dipakaiPada === undefined) {
        await ctx.db.patch(baris._id, { kedaluwarsaPada: sekarang });
      }
    }

    const challengeId = await ctx.db.insert("klaimOtp", {
      nomor: args.nomor,
      kodeHash: args.kodeHash,
      salt: args.salt,
      dibuatPada: sekarang,
      kedaluwarsaPada: sekarang + OTP_MASA_BERLAKU_MS,
      maksPercobaan: args.maksPercobaan,
      percobaanGagal: 0,
      statusPengiriman: "menunggu",
      berkasLama: args.berkasLama,
      ...(args.ip === undefined ? {} : { ip: args.ip }),
      ...(args.userAgent === undefined ? {} : { userAgent: args.userAgent }),
    });
    return { ok: true as const, challengeId };
  },
});

/** Catat hasil pengiriman Fonnte. TIDAK menandai kode sebagai terverifikasi. */
export const _catatPengirimanKlaim = internalMutation({
  args: {
    challengeId: v.id("klaimOtp"),
    terkirim: v.boolean(),
    respon: v.string(),
  },
  handler: async (ctx, { challengeId, terkirim, respon }) => {
    const baris = await ctx.db.get(challengeId);
    if (baris === null) return;
    await ctx.db.patch(challengeId, {
      statusPengiriman: terkirim ? "terkirim" : "gagal",
      responPengiriman: respon.slice(0, 200),
    });
  },
});

/** Bentuk balasan permintaan kode — sama dengan validator `returns` di bawah. */
type HasilMintaKode = {
  ok: boolean;
  terkirim: boolean;
  pesan: string;
  sisaDetik: number;
  nomorTampil: string;
  berkasLama: number;
};

/**
 * Minta kode klaim untuk nomor WhatsApp lama — TANPA sesi.
 *
 * Sengaja bisa dipanggil sebelum masuk: pemilik nomor membuktikan dirinya
 * lewat kode, bukan lewat sesi. Yang dibatasi bukan hanya laju kirim, tetapi
 * juga kerahasiaan: permintaan hanya dijawab "ada data lama" bila nomornya
 * memang terdaftar, dan jawabannya TIDAK memuat satu pun detail portofolio
 * (hanya jumlah berkas) — detail baru terbuka setelah kode diverifikasi.
 */
export const mintaKodeKlaim = action({
  args: {
    nomor: v.string(),
    ip: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  },
  returns: v.object({
    ok: v.boolean(),
    terkirim: v.boolean(),
    pesan: v.string(),
    sisaDetik: v.number(),
    /** Nomor bertopeng untuk ditampilkan kembali. */
    nomorTampil: v.string(),
    /** Jumlah berkas lama yang menunggu — 0 bila tidak ada. */
    berkasLama: v.number(),
  }),
  // Tipe balasan ditulis EKSPLISIT (seperti `mintaOtpWa`): handler ini
  // memanggil `internal.klaimPeminjam.*`, dan tanpa anotasi itu inferensi tipe
  // kembali ke berkas ini sendiri lewat berkas api hasil generate.
  handler: async (ctx, { nomor, ip, userAgent }): Promise<HasilMintaKode> => {
    const bersih = normalisasiNomorWa(nomor);
    if (bersih === null) {
      return {
        ok: false,
        terkirim: false,
        pesan: "Nomor WhatsApp tidak valid. Contoh: 08123456789.",
        sisaDetik: 0,
        nomorTampil: "",
        berkasLama: 0,
      };
    }

    const kepemilikan: Kepemilikan = await ctx.runQuery(
      internal.klaimPeminjam._kepemilikanNomor,
      { nomor: bersih },
    );
    const utama = pemilikUtama(kepemilikan);
    if (kepemilikan.pemilik.length > 1) {
      return {
        ok: false,
        terkirim: false,
        pesan: pesanDataGanda(kepemilikan.pemilik.length),
        sisaDetik: 0,
        nomorTampil: topengNomor(bersih),
        berkasLama: 0,
      };
    }
    if (utama === null || !adaDataLama(utama.berkas)) {
      return {
        ok: false,
        terkirim: false,
        pesan:
          "Nomor ini belum terdaftar sebagai nasabah lama PINDAI. " +
          "Daftar akun baru lewat email, atau hubungi admin bila Anda yakin pernah mengajukan dari web lama.",
        sisaDetik: 0,
        nomorTampil: topengNomor(bersih),
        berkasLama: 0,
      };
    }

    const kode = kodeOtpEnamDigit();
    const salt = buatSaltOtp();
    const kodeHash = await hashKodeOtp(salt, kode);
    const izin = await ctx.runMutation(internal.klaimPeminjam._simpanPermintaanKlaim, {
      nomor: bersih,
      kodeHash,
      salt,
      maksPercobaan: OTP_MAKS_PERCOBAAN,
      berkasLama: totalBerkas(utama.berkas),
      ip: ip?.trim().slice(0, 64),
      userAgent: userAgent?.trim().slice(0, 200),
    });
    if (!izin.ok) {
      return {
        ok: false,
        terkirim: false,
        pesan: izin.pesan,
        sisaDetik: izin.sisaDetik,
        nomorTampil: topengNomor(bersih),
        berkasLama: 0,
      };
    }

    const hasil = await kirimFonnte(bersih, pesanOtpKlaim(kode));
    await ctx.runMutation(internal.klaimPeminjam._catatPengirimanKlaim, {
      challengeId: izin.challengeId,
      terkirim: hasil.terkirim,
      respon: hasil.pesan,
    });
    // Jejak penagihan WhatsApp: isi pesan (yang memuat kode) TIDAK disimpan.
    await ctx.runMutation(internal.whatsapp._appendLog, {
      nomorTujuan: bersih,
      jenis: "otp_klaim_peminjam",
      isiPesan: "Kode OTP klaim peminjam lama dikirim (isi disembunyikan).",
      status: hasil.terkirim ? "terkirim" : "gagal",
      respon: hasil.pesan,
    });

    return {
      ok: hasil.terkirim,
      terkirim: hasil.terkirim,
      pesan: hasil.terkirim
        ? `Kode dikirim ke ${topengNomor(bersih)}. Data lama Anda siap dipulihkan.`
        : hasil.pesan,
      sisaDetik: 0,
      nomorTampil: topengNomor(bersih),
      berkasLama: totalBerkas(utama.berkas),
    };
  },
});

/** Hasil satu percobaan klaim. */
type HasilKlaim = {
  ok: boolean;
  pesan: string;
  /** Akun yang berhak atas data (pemilik lama atau akun sesi). */
  userId: Id<"users"> | null;
  /** Akun lama yang berkasnya berpindah; `null` bila sudah sama. */
  akunLama: Id<"users"> | null;
  /** Berkas lama yang ditemukan untuk nomor ini (milik pemilik utama). */
  berkas: BerkasLama;
  /** Berkas yang benar-benar berpindah kepemilikannya pada klaim ini. */
  dipindahkan: BerkasLama;
  metode: string;
};

/**
 * Pindahkan KEPEMILIKAN berkas produktif dari akun lama ke akun tujuan.
 *
 * Hanya kolom kepemilikan yang disentuh (plus penanda `klaimDariUserId` /
 * `klaimPada`): nominal, tanggal, status, dan seluruh nilai finansial baris
 * tidak pernah diubah — sama seperti janji migrasi data lama. Tanda terima
 * pembayaran manual ikut berpindah karena baris itu memang milik peminjaman
 * yang bersangkutan (bukan catatan akun).
 *
 * Master identitas hanya dipindahkan bila akun tujuan belum punya master
 * sendiri: menumpuk dua master dalam satu akun akan mengacaukan deteksi
 * duplikat, sedangkan menghapus bukan pilihan. Sisa master di akun lama
 * dilaporkan ke admin lewat audit trail.
 */
async function tautkanBerkas(
  ctx: MutationCtx,
  args: { dari: Id<"users">; ke: Id<"users">; pada: number },
): Promise<{ dipindahkan: BerkasLama; masterTertinggal: number }> {
  if (args.dari === args.ke) {
    // Sudah satu akun: tidak ada yang berpindah, tetapi angkanya tetap jujur
    // dengan menghitung apa yang memang dimiliki akun ini.
    return { dipindahkan: await berkasPemilik(ctx, args.ke), masterTertinggal: 0 };
  }

  const penanda = { klaimDariUserId: args.dari, klaimPada: args.pada };

  const loans = await ctx.db
    .query("loans")
    .withIndex("by_user", (q) => q.eq("userId", args.dari))
    .collect();
  for (const loan of loans) {
    await ctx.db.patch(loan._id, { userId: args.ke, nasabahUserId: args.ke, ...penanda });
  }

  const pawns = await ctx.db
    .query("pawns")
    .withIndex("by_user", (q) => q.eq("userId", args.dari))
    .collect();
  for (const pawn of pawns) {
    await ctx.db.patch(pawn._id, { userId: args.ke, ...penanda });
  }

  const kredits = await ctx.db
    .query("kreditBarang")
    .withIndex("by_user", (q) => q.eq("userId", args.dari))
    .collect();
  for (const kredit of kredits) {
    await ctx.db.patch(kredit._id, { userId: args.ke, ...penanda });
  }

  // Tanda terima pembayaran manual menempel pada pinjamannya.
  const terima = await ctx.db
    .query("manualPaymentReceipts")
    .withIndex("by_user", (q) => q.eq("userId", args.dari))
    .collect();
  for (const baris of terima) {
    await ctx.db.patch(baris._id, { userId: args.ke });
  }

  const [profilTujuan, kycTujuan, profilLama, kycLama] = await Promise.all([
    ctx.db.query("nasabahProfil").withIndex("by_user", (q) => q.eq("userId", args.ke)).first(),
    ctx.db.query("kycProfil").withIndex("by_user", (q) => q.eq("userId", args.ke)).first(),
    ctx.db.query("nasabahProfil").withIndex("by_user", (q) => q.eq("userId", args.dari)).collect(),
    ctx.db.query("kycProfil").withIndex("by_user", (q) => q.eq("userId", args.dari)).collect(),
  ]);

  let masterDipindah = 0;
  let masterTertinggal = 0;
  if (profilTujuan === null) {
    for (const baris of profilLama) {
      await ctx.db.patch(baris._id, {
        userId: args.ke,
        diperbaruiPada: args.pada,
        diperbaruiOlehLabel: "klaim peminjam lama",
        sumber: "nasabah",
      });
      masterDipindah += 1;
    }
  } else {
    masterTertinggal += profilLama.length;
  }
  if (kycTujuan === null) {
    for (const baris of kycLama) {
      await ctx.db.patch(baris._id, { userId: args.ke });
      masterDipindah += 1;
    }
  } else {
    masterTertinggal += kycLama.length;
  }

  return {
    dipindahkan: {
      pinjaman: loans.length,
      gadai: pawns.length,
      kredit: kredits.length,
      masterNasabah: masterDipindah,
      pokokPinjaman: loans.reduce((total, l) => total + (l.pokokPinjaman ?? 0), 0),
      pinjamanAktif: loans.filter((l) => pinjamanMasihBerjalan(l.status)).length,
      pinjamanLunas: loans.filter((l) => l.status === "lunas").length,
      akunKandidat: 1,
    },
    masterTertinggal,
  };
}

/**
 * INTI klaim: verifikasi kode → tentukan akun berhak → tautkan berkas lama.
 *
 * Dipakai oleh dua pintu (provider login & mutation sesi aktif) supaya definisi
 * "klaim yang sah" hanya ada satu. Kegagalan DIKEMBALIKAN sebagai hasil, bukan
 * dilempar: melempar dari mutation membatalkan seluruh tulisan transaksi —
 * termasuk hitungan percobaan gagal yang baru saja ditambah, dan kode salah yang
 * tidak dihitung sama saja dengan tanpa batas percobaan.
 */
async function selesaikanKlaim(
  ctx: MutationCtx,
  args: {
    nomor: string;
    kode: string;
    /** Akun tujuan; `null` = masuk ke akun pemilik data lama. */
    userId: Id<"users"> | null;
    metode: string;
    ip?: string;
    userAgent?: string;
  },
): Promise<HasilKlaim> {
  const kosong: BerkasLama = { ...BERKAS_LAMA_KOSONG };
  const gagal = (pesan: string): HasilKlaim => ({
    ok: false,
    pesan,
    userId: null,
    akunLama: null,
    berkas: kosong,
    dipindahkan: kosong,
    metode: args.metode,
  });

  const bersih = normalisasiNomorWa(args.nomor);
  if (bersih === null) return gagal("Nomor WhatsApp tidak valid.");

  const digit = (args.kode ?? "").replace(/\D/g, "");
  if (digit.length !== OTP_PANJANG_KODE) {
    return gagal(`Kode OTP harus ${OTP_PANJANG_KODE} angka.`);
  }

  const kepemilikan = await kepemilikanNomor(ctx, bersih);
  const utama = pemilikUtama(kepemilikan);
  if (utama === null) {
    return gagal(
      "Nomor ini belum terdaftar sebagai nasabah lama PINDAI. Daftar akun baru lewat email, atau hubungi admin.",
    );
  }

  // Akun yang berhak: sesi aktif bila ada, dan bila tidak — pemilik data lama.
  const tujuan = args.userId ?? utama.userId;
  // Akun LAIN yang juga mengaku pemilik nomor ini. Lebih dari satu berarti data
  // ganda: klaim otomatis dihentikan, bukan dipilih salah satu.
  const lain = kepemilikan.pemilik.filter((p) => p.userId !== tujuan);
  if (lain.length > 1) return gagal(pesanDataGanda(lain.length));

  const sekarang = Date.now();
  const semua = await ctx.db
    .query("klaimOtp")
    .withIndex("by_nomor", (q) => q.eq("nomor", bersih))
    .collect();
  const tantangan = semua
    .filter((b) => b.dibuatPada >= sekarang - KLAIM_JENDELA_MS)
    .sort((a, b) => b.dibuatPada - a.dibuatPada)[0];
  if (tantangan === undefined) {
    return gagal("Belum ada kode untuk nomor ini. Minta kode dulu, lalu masukkan kodenya.");
  }

  const gagalSatuJendela = semua
    .filter((b) => b.dibuatPada >= sekarang - KLAIM_JENDELA_MS)
    .reduce((total, b) => total + b.percobaanGagal, 0);
  if (gagalSatuJendela >= KLAIM_MAKS_GAGAL) {
    await catatLogin(ctx, {
      userId: tujuan,
      status: "diblokir",
      metode: args.metode,
      ip: (args.ip ?? "").slice(0, 64),
      userAgent: (args.userAgent ?? "").slice(0, 200),
      keterangan: "Batas percobaan kode klaim peminjam lama tercapai",
    });
    return gagal("Terlalu banyak percobaan kode. Minta kode baru, lalu coba lagi nanti.");
  }

  if (tantangan.dipakaiPada !== undefined) {
    return gagal("Kode ini sudah dipakai. Minta kode baru.");
  }
  if (tantangan.kedaluwarsaPada <= sekarang) {
    return gagal("Kode kedaluwarsa (berlaku 5 menit). Minta kode baru.");
  }
  if (tantangan.percobaanGagal >= tantangan.maksPercobaan) {
    return gagal("Terlalu banyak percobaan untuk kode ini. Minta kode baru.");
  }

  const hashDicoba = await hashKodeOtp(tantangan.salt, digit);
  if (!cocokKodeOtp(tantangan.kodeHash, hashDicoba)) {
    const baru = tantangan.percobaanGagal + 1;
    await ctx.db.patch(tantangan._id, { percobaanGagal: baru });
    await catatLogin(ctx, {
      userId: tujuan,
      status: "gagal",
      metode: args.metode,
      ip: (args.ip ?? "").slice(0, 64),
      userAgent: (args.userAgent ?? "").slice(0, 200),
      keterangan: `Kode klaim salah (ke-${baru})`,
    });
    return gagal("Kode OTP salah.");
  }

  // Sekali pakai: kode dihabiskan terlepas dari apa pun setelah ini.
  await ctx.db.patch(tantangan._id, {
    dipakaiPada: sekarang,
    dipakaiOlehUserId: tujuan,
  });

  const akunLama = lain[0]?.userId ?? tujuan;
  const { dipindahkan, masterTertinggal } = await tautkanBerkas(ctx, {
    dari: akunLama,
    ke: tujuan,
    pada: sekarang,
  });

  // Akun lama dari data impor tidak punya peran/kredensial; akun yang dipakai
  // masuk harus tetap sah sebagai Peminjam supaya portalnya terbuka.
  const user = await ctx.db.get(tujuan);
  const patchUser: Partial<Doc<"users">> = {};
  if (user !== null && user.role === undefined) patchUser.role = ROLES.PEMINJAM;
  if (user !== null && (user.name === undefined || user.name.trim() === "")) {
    const profil = await ctx.db
      .query("nasabahProfil")
      .withIndex("by_user", (q) => q.eq("userId", tujuan))
      .first();
    if (profil !== null && profil.namaLengkap.trim() !== "") patchUser.name = profil.namaLengkap;
  }
  if (Object.keys(patchUser).length > 0) await ctx.db.patch(tujuan, patchUser);

  const akunLamaUser = akunLama === tujuan ? null : await ctx.db.get(akunLama);
  const ringkas = kalimatBerkasLama(dipindahkan, formatRupiahAman);
  const catatanMaster =
    masterTertinggal === 0
      ? ""
      : ` ${masterTertinggal} master identitas dibiarkan di akun lama karena akun ini sudah punya master sendiri — perlu ditinjau admin.`;

  await ctx.db.insert("klaimPeminjam", {
    userId: tujuan,
    nomor: bersih,
    akunLamaUserId: akunLama === tujuan ? undefined : akunLama,
    userIdLabel: labelAkun(user, tujuan),
    akunLamaLabel: akunLamaUser === null ? undefined : labelAkun(akunLamaUser, akunLama),
    pada: sekarang,
    metode: args.metode,
    pinjaman: dipindahkan.pinjaman,
    gadai: dipindahkan.gadai,
    kredit: dipindahkan.kredit,
    masterNasabah: dipindahkan.masterNasabah,
    pokokPinjaman: dipindahkan.pokokPinjaman,
    keterangan:
      akunLama === tujuan
        ? `Nomor ${topengNomor(bersih)} diverifikasi — berkas sudah berada pada akun ini (${ringkas}).`
        : `Nomor ${topengNomor(bersih)} diverifikasi — berkas dipindahkan ke akun sesi aktif (${ringkas}).`,
  });

  await audit(
    ctx,
    String(tujuan),
    labelAkun(user, tujuan),
    "klaim_peminjam_lama",
    `users/${akunLama}`,
    `Klaim peminjam lama (${args.metode}) untuk nomor ${topengNomor(bersih)}: ${ringkas}. ` +
      (akunLama === tujuan
        ? "Berkas sudah pada akun ini."
        : `Kepemilikan dipindahkan dari akun ${labelAkun(akunLamaUser, akunLama)} ke akun ini.`) +
      catatanMaster,
  );
  await catatLogin(ctx, {
    userId: tujuan,
    status: "berhasil",
    metode: args.metode,
    ip: (args.ip ?? "").slice(0, 64),
    userAgent: (args.userAgent ?? "").slice(0, 200),
    keterangan: `Klaim akun peminjam lama lewat OTP WhatsApp — ${ringkas}`,
  });

  return {
    ok: true,
    pesan: `Berhasil! Data lama Anda sudah tersambung: ${ringkas}.`,
    userId: tujuan,
    akunLama: akunLama === tujuan ? null : akunLama,
    berkas: utama.berkas,
    dipindahkan,
    metode: args.metode,
  };
}

/**
 * PINTU 1 — klaim dari SESI AKTIF.
 *
 * Dipakai pemakai yang sudah masuk (email, atau sesi tamu) dan mengklaim data
 * lamanya dengan nomor WhatsApp + kode. Inilah fungsi yang menautkan berkas
 * impor ke `userId` sesi aktif.
 */
export const claimOrLoginBorrower = mutation({
  args: {
    phoneNumber: v.string(),
    otpCode: v.string(),
    ip: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  },
  returns: v.object({
    ok: v.boolean(),
    pesan: v.string(),
    /** Nomor bertopeng yang diklaim. */
    nomorTampil: v.string(),
    berkas: berkasValidator,
    /** Berkas yang benar-benar berpindah kepemilikannya pada klaim ini. */
    dipindahkan: berkasValidator,
    akunLamaLabel: v.union(v.null(), v.string()),
    metode: v.string(),
  }),
  handler: async (ctx, { phoneNumber, otpCode, ip, userAgent }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Harus masuk terlebih dahulu.");

    const hasil = await selesaikanKlaim(ctx, {
      nomor: phoneNumber,
      kode: otpCode,
      userId,
      metode: "sesi_aktif",
      ip,
      userAgent,
    });

    const akunLama = hasil.akunLama === null ? null : await ctx.db.get(hasil.akunLama);
    return {
      ok: hasil.ok,
      pesan: hasil.pesan,
      nomorTampil: topengNomor(normalisasiNomorWa(phoneNumber) ?? phoneNumber),
      berkas: hasil.berkas,
      dipindahkan: hasil.dipindahkan,
      akunLamaLabel: akunLama === null ? null : akunLama.email ?? akunLama.name ?? null,
      metode: hasil.metode,
    };
  },
});

/**
 * PINTU 2 — LOGIN peminjam lama lewat provider `whatsapp-otp`.
 *
 * Dijalankan di dalam `authorize` provider (`auth/whatsappOtp.ts`): kode
 * diverifikasi di sini, dan yang dikembalikan adalah AKUN PEMILIK data lama.
 * Karena akun tujuan = pemilik berkas, peminjam langsung melihat riwayatnya —
 * tanpa memindahkan apa pun dan tanpa membuat akun duplikat.
 */
export const _klaimUntukMasuk = internalMutation({
  args: {
    nomor: v.string(),
    kode: v.string(),
    ip: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  },
  returns: v.union(
    v.object({
      ok: v.literal(true),
      userId: v.id("users"),
      pesan: v.string(),
      berkas: berkasValidator,
    }),
    v.object({ ok: v.literal(false), pesan: v.string() }),
  ),
  handler: async (ctx, args) => {
    const hasil = await selesaikanKlaim(ctx, {
      nomor: args.nomor,
      kode: args.kode,
      userId: null,
      metode: "otp_whatsapp",
      ip: args.ip,
      userAgent: args.userAgent,
    });
    if (!hasil.ok || hasil.userId === null) return { ok: false as const, pesan: hasil.pesan };
    return {
      ok: true as const,
      userId: hasil.userId,
      pesan: hasil.pesan,
      berkas: hasil.berkas,
    };
  },
});

/**
 * RINGKASAN PORTOFOLIO PEMINJAM (dipakai dashboard & formulir klaim).
 *
 * Sengaja satu query untuk seluruh kebutuhan layar klaim/dashboard peminjam
 * lama: (1) apakah akun ini sudah pernah menautkan data lama, (2) ringkasan
 * portofolio historis — jumlah pinjaman, pokok, aktif/lunas, gadai, kredit —
 * supaya dashboard langsung berisi riwayat dan BUKAN form kosong, dan (3)
 * tawaran klaim bila nomor yang tersimpan pada akun ini masih punya data lama
 * milik akun LAIN yang belum tertaut.
 */
export const ringkasanKlaimSaya = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;

    const [loans, pawns, kredits, klaimTerakhir, profil, kyc] = await Promise.all([
      ctx.db.query("loans").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("pawns").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("kreditBarang").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("klaimPeminjam").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
      ctx.db.query("nasabahProfil").withIndex("by_user", (q) => q.eq("userId", userId)).first(),
      ctx.db.query("kycProfil").withIndex("by_user", (q) => q.eq("userId", userId)).first(),
    ]);

    const pinjaman = loans
      .slice()
      .sort((a, b) => b._creationTime - a._creationTime)
      .map((loan) => ({
        _id: loan._id,
        nomorReferensi: loan.nomorReferensi,
        pokokPinjaman: loan.pokokPinjaman,
        status: loan.status,
        tenorHari: loan.tenorHari ?? null,
        tenorBulan: loan.tenorBulan ?? null,
        diajukanPada: loan.diajukanPada ?? loan._creationTime,
        didanaiPada: loan.didanaiPada ?? null,
        lunasPada: loan.lunasPada ?? null,
        /** Skema yang dipakai baris ini — dibaca apa adanya dari datanya. */
        skema: loan.tenorBulan === undefined ? ("harian" as const) : ("bulanan" as const),
      }));

    const klaimTerbaru =
      klaimTerakhir.length === 0
        ? null
        : klaimTerakhir.reduce((terbaru, baris) => (baris.pada > terbaru.pada ? baris : terbaru));

    const nomorTersimpan =
      normalisasiNomorWa(profil?.nomorWhatsApp) ?? normalisasiNomorWa(kyc?.nomorWhatsApp);

    // Tawaran klaim: nomor yang SUDAH tersimpan pada akun ini masih punya data
    // lama milik SATU akun lain. Hanya ditawarkan bila akun ini belum pernah
    // menautkan data (supaya tawaran tidak menetap setelah klaim selesai).
    let tawaranKlaim: { nomorTampil: string; berkas: BerkasLama } | null = null;
    if (nomorTersimpan !== null && klaimTerakhir.length === 0) {
      const kepemilikan = await kepemilikanNomor(ctx, nomorTersimpan);
      const lain = kepemilikan.pemilik.filter((p) => p.userId !== userId);
      if (lain.length === 1 && adaDataLama(lain[0].berkas)) {
        tawaranKlaim = { nomorTampil: topengNomor(nomorTersimpan), berkas: lain[0].berkas };
      }
    }

    return {
      /** Apakah akun ini menerima berkas lewat klaim (bukan mendaftar baru). */
      sudahKlaim: klaimTerakhir.length > 0,
      klaimTerbaru:
        klaimTerbaru === null
          ? null
          : {
              nomorTampil: topengNomor(klaimTerbaru.nomor),
              pada: klaimTerbaru.pada,
              metode: klaimTerbaru.metode,
              pinjaman: klaimTerbaru.pinjaman,
              gadai: klaimTerbaru.gadai,
              kredit: klaimTerbaru.kredit,
              pokokPinjaman: klaimTerbaru.pokokPinjaman,
              keterangan: klaimTerbaru.keterangan,
            },
      nomorTersimpanTampil: nomorTersimpan === null ? null : topengNomor(nomorTersimpan),
      tawaranKlaim,
      ringkasan: {
        pinjaman: pinjaman.length,
        pinjamanAktif: pinjaman.filter((l) => pinjamanMasihBerjalan(l.status)).length,
        pinjamanLunas: pinjaman.filter((l) => l.status === "lunas").length,
        pokokPinjaman: pinjaman.reduce((total, l) => total + l.pokokPinjaman, 0),
        gadai: pawns.length,
        gadaiAktif: pawns.filter((p) => gadaiMasihBerjalan(p.status)).length,
        kredit: kredits.length,
        kreditAktif: kredits.filter((k) => kreditMasihBerjalan(k.status)).length,
      },
      /** Riwayat pinjaman lengkap — dashboard memakainya sebagai daftar historis. */
      pinjaman,
      /** Kalimat ringkas siap tampil (angka yang sama dengan audit trail). */
      kalimat:
        klaimTerbaru === null
          ? null
          : kalimatBerkasLama(
              {
                ...BERKAS_LAMA_KOSONG,
                pinjaman: klaimTerbaru.pinjaman,
                gadai: klaimTerbaru.gadai,
                kredit: klaimTerbaru.kredit,
                pokokPinjaman: klaimTerbaru.pokokPinjaman,
              },
              formatRupiahAman,
            ),
    };
  },
});
