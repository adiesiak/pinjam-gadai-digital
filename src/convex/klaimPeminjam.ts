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
 *  1. `mintaKodeKlaim` (action, TANPA sesi) — peminjam mengetik nomor WhatsApp.
 *     Nomor itu dicari sebagai PEMILIK data lama lewat indeks
 *     `by_nomorWhatsApp` (loans / nasabahProfil / kycProfil). Kode 6 digit
 *     selalu dikirim ke nomor itu lewat gateway WhatsApp yang diatur admin
 *     (Fonnte langsung hanya sebagai cadangan bila panel belum diisi), baik
 *     nomornya punya data lama maupun belum. Balasan tidak menyebut apakah
 *     nomor itu sudah punya akun.
 *  2. Kode itu dipakai di salah satu dari dua jalur:
 *     - `_klaimUntukMasuk` (internal): dipakai provider Convex Auth
 *       (`auth/whatsappOtp.ts`). Nomor pemilik data lama MASUK ke akunnya
 *       sendiri, sedangkan nomor tanpa data lama memakai akun yang sudah
 *       terhubung ke nomor itu atau membuat akun peminjam baru setelah kode
 *       benar.
 *     - `claimOrLoginBorrower` (publik, butuh sesi): pemakai yang sudah masuk
 *       (mis. lewat email, atau sesi tamu yang kemudian dia klaim) menautkan
 *       data lama ke akun sesi aktifnya.
 *
 * ATURAN YANG TIDAK DILANGGAR:
 * - Data lama TIDAK PERNAH dihapus atau ditulis ulang nilainya. Penautan hanya
 *   MEMINDAHKAN kepemilikan (`userId`) berkas produktif + master identitas,
 *   dengan penanda `klaimDariUserId`/`klaimPada` pada barisnya dan satu baris
 *   `klaimPeminjam` (append-only) sebagai jejaknya.
 * - Data GANDA yang BERISI UANG tidak digabung otomatis. Bila satu nomor punya
 *   riwayat pinjaman/gadai/kredit pada lebih dari satu akun LAIN (selain akun
 *   yang sedang mengklaim), klaim DIHENTIKAN dan pemakai diarahkan ke admin —
 *   sama dengan sikap `convex/duplikatNasabah.ts`. Tanpa aturan ini, dua orang
 *   yang kebetulan memakai satu nomor bisa saling menarik berkas. Akun sisa
 *   yang hanya menyimpan master identitas/KYC (tanpa berkas keuangan) TIDAK
 *   menahan klaim: akun itu ikut ditautkan, karena tidak ada riwayat uang yang
 *   bisa tertukar dan admin tidak punya alat untuk kasus semacam itu.
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
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { ROLES } from "./schema";
import { requireBukanPratinjau } from "./adminAuthz";
import { catatLogin } from "./security";
import { audit } from "./system";
import { kirimPesanOtp } from "./otpWhatsapp";
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
  normalisasiNikLogin,
  PESAN_NIK_KIRIM,
  PESAN_NIK_UMUM,
} from "../lib/nikLogin";
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

  const kandidatUnik = [
    ...new Set<string>([
      ...lewatPinjaman.map((l) => l.userId as string),
      ...lewatProfil.map((p) => p.userId as string),
      ...lewatKyc.map((k) => k.userId as string),
    ]),
  ] as Array<Id<"users">>;

  // Akun tim (admin) tidak pernah menjadi pemilik nomor untuk jalur klaim: admin
  // masuk dengan kata sandi + TOTP, dan nomor yang menempel pada akun admin
  // tidak boleh mencetak sesi admin lewat OTP WhatsApp. Aturan yang sama sudah
  // berlaku untuk masuk lewat Google (`auth/google.ts`).
  const kandidat = (
    await Promise.all(kandidatUnik.map(async (id) => ({ id, akun: await ctx.db.get(id) })))
  )
    .filter(({ akun }) => akun === null || akun.role !== ROLES.ADMIN)
    .map(({ id }) => id);

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

/**
 * Apakah akun ini menyimpan berkas keuangan (pinjaman, gadai, atau kredit).
 *
 * Satu-satunya alasan menahan klaim otomatis. Dua akun yang sama-sama punya
 * riwayat uang bisa jadi dua orang berbeda (mis. nomor dipakai satu keluarga),
 * sedangkan akun sisa impor yang hanya menyimpan master identitas/KYC tidak
 * memindahkan uang apa pun — menahannya justru mengunci pemilik nomor dari
 * akunnya sendiri, dan admin pun tidak punya tombol untuk itu.
 */
function punyaBerkasKeuangan(berkas: BerkasLama): boolean {
  return totalBerkas(berkas) > 0;
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

    // KUOTA dihitung dari percobaan yang benar-benar berangkat. Pengiriman yang
    // GAGAL (token gateway belum diisi, gateway menolak, timeout) tidak pernah
    // sampai ke siapa pun, jadi menghitungnya sebagai kuota hanya mengunci orang
    // yang mencoba lagi SELAMA operator membereskan konfigurasi — pesannya pun
    // menyesatkan ("sudah menerima terlalu banyak kode" padahal tidak ada satu
    // pun kode yang terkirim). Baris berstatus "menunggu" (pengiriman sedang
    // berjalan) tetap dihitung supaya klik ganda tidak melewati pembatas ini.
    const terpakai = dalamJendela.filter((b) => b.statusPengiriman !== "gagal");

    const terakhir = terpakai.reduce<number | null>(
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

    if (terpakai.length >= KLAIM_MAKS_PER_NOMOR) {
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
      if (
        perIp.filter((b) => b.dibuatPada >= sejak && b.statusPengiriman !== "gagal").length >=
        KLAIM_MAKS_PER_IP
      ) {
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
 * Profil pemilik NIK, HANYA bila NIK itu menunjuk tepat satu profil.
 *
 * NIK ganda (hasil impor atau salah input admin) sengaja menghasilkan `null`:
 * menebak salah satu baris berarti membuka akun orang lain. NIK yang tidak
 * terdaftar juga `null`, dan kedua keadaan itu tidak dibedakan ke pemakai.
 */
async function profilDenganNik(
  ctx: QueryCtx,
  nik: string,
): Promise<Doc<"nasabahProfil"> | null> {
  const bersih = normalisasiNikLogin(nik);
  if (bersih === "") return null;
  const baris = await ctx.db
    .query("nasabahProfil")
    .withIndex("by_nik", (q) => q.eq("nik", bersih))
    .take(2);
  return baris.length === 1 ? baris[0] : null;
}

/**
 * Terbitkan kode, simpan hash-nya lewat pembatas laju, kirim, lalu catat.
 *
 * Dua pintu masuk memakai fungsi ini: nomor WhatsApp dan NIK. Urutan
 * pembatasannya (cooldown, kuota per nomor, kuota per IP, mematikan kode lama)
 * hidup di `_simpanPermintaanKlaim`; di sini urutan itu hanya ada satu versi,
 * supaya tidak ada jalur masuk yang lebih longgar dari jalur lain.
 */
async function terbitkanKodeMasuk(
  ctx: ActionCtx,
  args: {
    nomor: string;
    berkasLama: number;
    ip?: string;
    userAgent?: string;
    jenisLog: string;
    pesanTerkirim: (nomorTampil: string, berkasLama: number) => string;
  },
): Promise<{
  ok: boolean;
  terkirim: boolean;
  pesan: string;
  sisaDetik: number;
  nomorTampil: string;
  /** true bila pembatas laju menolak sebelum kode dibuat. */
  ditolak: boolean;
}> {
  const kode = kodeOtpEnamDigit();
  const salt = buatSaltOtp();
  const kodeHash = await hashKodeOtp(salt, kode);
  const nomorTampil = topengNomor(args.nomor);

  const izin = await ctx.runMutation(internal.klaimPeminjam._simpanPermintaanKlaim, {
    nomor: args.nomor,
    kodeHash,
    salt,
    maksPercobaan: OTP_MAKS_PERCOBAAN,
    berkasLama: args.berkasLama,
    ip: args.ip?.trim().slice(0, 64),
    userAgent: args.userAgent?.trim().slice(0, 200),
  });
  if (!izin.ok) {
    return {
      ok: false,
      terkirim: false,
      pesan: izin.pesan,
      sisaDetik: izin.sisaDetik,
      nomorTampil,
      ditolak: true,
    };
  }

  const hasil = await kirimPesanOtp(ctx, args.nomor, pesanOtpKlaim(kode));
  await ctx.runMutation(internal.klaimPeminjam._catatPengirimanKlaim, {
    challengeId: izin.challengeId,
    terkirim: hasil.terkirim,
    respon: hasil.pesan,
  });
  // Jejak WhatsApp: isi pesan (yang memuat kode) TIDAK disimpan.
  await ctx.runMutation(internal.whatsapp._appendLog, {
    nomorTujuan: args.nomor,
    jenis: args.jenisLog,
    isiPesan: "Kode OTP masuk dikirim (isi disembunyikan).",
    status: hasil.terkirim ? "terkirim" : "gagal",
    respon: hasil.pesan,
  });

  return {
    ok: hasil.terkirim,
    terkirim: hasil.terkirim,
    pesan: hasil.terkirim
      ? args.pesanTerkirim(nomorTampil, args.berkasLama)
      : hasil.pesan,
    sisaDetik: 0,
    nomorTampil,
    ditolak: false,
  };
}

/**
 * Minta kode masuk WhatsApp — TANPA sesi, untuk nomor lama maupun baru.
 *
 * Pemilik nomor membuktikan dirinya lewat kode, bukan lewat sesi. Jawaban
 * TIDAK membedakan nomor yang punya data lama dari nomor baru: `berkasLama`
 * selalu 0 di respons pra-OTP, dan pesannya sama. Jumlah sebenarnya tetap
 * disimpan di challenge server untuk dipakai setelah kode diverifikasi; kalau
 * angka itu dibocorkan lebih awal, siapa pun bisa memeriksa apakah sebuah nomor
 * punya riwayat PINDAI tanpa menguasai nomor tersebut.
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
    /**
     * Selalu 0 sebelum OTP diverifikasi. Jumlah sebenarnya hanya ada di
     * challenge server; field ini dipertahankan agar bentuk respons lama tetap
     * kompatibel, bukan sebagai sinyal keberadaan data.
     */
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
        pesan:
          "Nomor WhatsApp tidak valid. Contoh: 08123456789, atau nomor luar Indonesia dengan kode negaranya (mis. +49 151 2345678).",
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
    // Yang dihitung bentrok hanya akun yang benar-benar punya berkas keuangan;
    // sisa akun impor bertanpa pinjaman/gadai/kredit ikut ditautkan otomatis
    // saat kode diverifikasi (lihat `selesaikanKlaim`).
    const bentrok = kepemilikan.pemilik.filter((p) => punyaBerkasKeuangan(p.berkas));
    if (bentrok.length > 1) {
      return {
        ok: false,
        terkirim: false,
        pesan: pesanDataGanda(bentrok.length),
        sisaDetik: 0,
        nomorTampil: topengNomor(bersih),
        berkasLama: 0,
      };
    }
    // Nomor tanpa data lama tetap dilayani: setelah kode benar, pemilik nomor
    // masuk ke akun yang sudah terhubung atau mendapat akun peminjam baru.
    // Jumlah berkas hanya dipakai server saat challenge dibuat; respons ke
    // pemanggil sengaja tidak membedakan nomor lama dan baru.
    const berkasLama = utama === null ? 0 : totalBerkas(utama.berkas);

    const hasil = await terbitkanKodeMasuk(ctx, {
      nomor: bersih,
      berkasLama,
      ip,
      userAgent,
      jenisLog: "otp_klaim_peminjam",
      pesanTerkirim: (nomorTampil) =>
        `Kode dikirim ke ${nomorTampil}. Masukkan kodenya untuk masuk atau membuat akun.`,
    });
    // `ditolak` adalah detail internal pembatas laju; jangan ikut ke respons.
    return {
      ok: hasil.ok,
      terkirim: hasil.terkirim,
      pesan: hasil.pesan,
      sisaDetik: hasil.sisaDetik,
      nomorTampil: hasil.nomorTampil,
      berkasLama: 0,
    };
  },
});

/** Profil milik satu NIK, untuk action yang tidak boleh menyentuh database. */
export const _profilDenganNik = internalQuery({
  args: { nik: v.string() },
  returns: v.union(
    v.null(),
    v.object({ userId: v.id("users"), nomorWhatsApp: v.string() }),
  ),
  handler: async (ctx, { nik }) => {
    const profil = await profilDenganNik(ctx, nik);
    return profil === null
      ? null
      : { userId: profil.userId, nomorWhatsApp: profil.nomorWhatsApp };
  },
});

/**
 * PINTU NIK: minta kode masuk tanpa mengetik nomor WhatsApp.
 *
 * NIK dipakai sebagai nama pengguna saja. Kode tetap dikirim ke nomor yang
 * tercatat pada profil, jadi menebak NIK tidak memberi akses apa pun.
 *
 * Balasannya SELALU kalimat yang sama, baik NIK terdaftar, NIK ganda, maupun
 * NIK tidak ada. Untuk NIK yang tidak menghasilkan profil, tidak ada pesan yang
 * dikirim, tetapi kerja hash tetap dijalankan supaya waktu balasan tidak
 * menjadi petunjuk keberadaan NIK. Pembatas laju per nomor dan per IP tetap
 * berlaku di `_simpanPermintaanKlaim`.
 */
export const mintaKodeDenganNik = action({
  args: {
    nik: v.string(),
    ip: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  },
  returns: v.object({ pesan: v.string() }),
  handler: async (ctx, { nik, ip, userAgent }): Promise<{ pesan: string }> => {
    const profil = await ctx.runQuery(internal.klaimPeminjam._profilDenganNik, {
      nik,
    });
    const nomor =
      profil === null ? null : normalisasiNomorWa(profil.nomorWhatsApp);
    if (profil === null || nomor === null) {
      // Kerja yang sama dengan jalur terdaftar, tanpa mengirim apa pun.
      await hashKodeOtp(buatSaltOtp(), kodeOtpEnamDigit());
      return { pesan: PESAN_NIK_KIRIM };
    }
    await terbitkanKodeMasuk(ctx, {
      nomor,
      berkasLama: 0,
      ip,
      userAgent,
      jenisLog: "otp_masuk_nik",
      pesanTerkirim: () => PESAN_NIK_KIRIM,
    });
    // Kegagalan gateway juga tidak dibedakan di sini: kalimat yang berbeda
    // hanya untuk NIK terdaftar akan mengubah endpoint ini menjadi alat
    // pengecekan keanggotaan. Jejak kegagalannya ada di `waLogs`.
    return { pesan: PESAN_NIK_KIRIM };
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
 * Nomor terverifikasi milik akun pendana: beri sesi akun itu tanpa menjalankan
 * mesin klaim peminjam. Akun pendana tidak punya berkas pinjaman untuk
 * dipindahkan, dan mencatatnya sebagai "klaim peminjam lama" akan mengotori
 * riwayat klaim nasabah.
 */
async function masukPendanaLewatOtp(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    nomor: string;
    metode: string;
    ip?: string;
    userAgent?: string;
  },
): Promise<HasilKlaim> {
  const kosong: BerkasLama = { ...BERKAS_LAMA_KOSONG };
  const user = await ctx.db.get(args.userId);
  await audit(
    ctx,
    String(args.userId),
    labelAkun(user, args.userId),
    "masuk_otp_whatsapp",
    `users/${args.userId}`,
    `Nomor ${topengNomor(args.nomor)} diverifikasi lewat OTP WhatsApp pada akun pendana.`,
  );
  await catatLogin(ctx, {
    userId: args.userId,
    status: "berhasil",
    metode: args.metode,
    ip: (args.ip ?? "").slice(0, 64),
    userAgent: (args.userAgent ?? "").slice(0, 200),
    keterangan: "Masuk lewat OTP WhatsApp nomor terverifikasi (akun pendana)",
  });
  return {
    ok: true,
    pesan: "Nomor berhasil diverifikasi. Masuk ke ruang pendana.",
    userId: args.userId,
    akunLama: null,
    berkas: kosong,
    dipindahkan: kosong,
    metode: args.metode,
  };
}

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
    /**
     * Login provider boleh membuat akun peminjam baru untuk nomor yang belum
     * punya data lama. Jalur sesi aktif tidak: ia hanya menautkan berkas impor.
     */
    izinkanAkunBaru?: boolean;
    /**
     * Akun yang WAJIB menjadi tujuan (pintu NIK). Nomor hanya boleh memberi
     * sesi akun ini; bila nomor itu menunjuk akun lain, masuk ditolak dan tidak
     * ada berkas yang dipindahkan. Tanpa batas ini, NIK yang salah ketik bisa
     * membuka akun orang lain lewat nomor yang tercatat di profilnya.
     */
    wajibUserId?: Id<"users">;
    /**
     * Hanya mengautentikasi: kode tetap diverifikasi, tetapi tidak ada berkas
     * yang ditautkan/dipindahkan dan tidak ada riwayat klaim yang ditulis.
     * Dipakai pintu NIK, yang tugasnya membuka sesi, bukan memulihkan data.
     */
    hanyaMasuk?: boolean;
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
  if (bersih === null) {
    return gagal("Nomor WhatsApp tidak valid. Tulis kode negaranya untuk nomor luar Indonesia.");
  }

  const digit = (args.kode ?? "").replace(/\D/g, "");
  if (digit.length !== OTP_PANJANG_KODE) {
    return gagal(`Kode OTP harus ${OTP_PANJANG_KODE} angka.`);
  }

  const kepemilikan = await kepemilikanNomor(ctx, bersih);
  const utama = pemilikUtama(kepemilikan);
  // Pintu NIK sudah menentukan akunnya dari profil, jadi nomor yang belum
  // punya berkas keuangan tetap boleh masuk (nasabah baru yang belum meminjam).
  if (
    utama === null &&
    args.izinkanAkunBaru !== true &&
    args.wajibUserId === undefined
  ) {
    return gagal(
      "Nomor ini belum terdaftar sebagai nasabah lama PINDAI. Daftar akun baru lewat email, atau hubungi admin.",
    );
  }

  // Akun yang berhak: sesi aktif bila ada, lalu pemilik data lama. `null` hanya
  // mungkin pada login provider nomor baru, yang akunnya ditentukan setelah
  // kode terbukti benar.
  let tujuan: Id<"users"> | null = args.userId ?? utama?.userId ?? null;
  if (args.wajibUserId !== undefined) {
    // NIK yang memilih akun, bukan nomor. Bila nomor ini justru menunjuk akun
    // lain, berhenti: memindahkan kepemilikan di sini akan menyerahkan berkas
    // orang lain kepada penebak NIK.
    if (tujuan !== null && tujuan !== args.wajibUserId) {
      return gagal(PESAN_NIK_UMUM);
    }
    tujuan = args.wajibUserId;
  }
  // Lapis kedua: sesi aktif pun tidak boleh memakai jalur ini untuk masuk ke
  // akun tim, walau nomornya menempel di sana karena data impor lama.
  const akunTujuan = tujuan === null ? null : await ctx.db.get(tujuan);
  if (akunTujuan !== null && akunTujuan.role === ROLES.ADMIN) {
    return gagal(
      "Nomor ini menempel pada akun tim PINDAI. Akun tim masuk dengan kata sandi dan TOTP, bukan lewat WhatsApp.",
    );
  }
  // Akun LAIN yang juga mengaku pemilik nomor ini. Yang menahan klaim hanya bila
  // LEBIH DARI SATU di antaranya menyimpan berkas keuangan: akun sisa yang cuma
  // punya master identitas/KYC tidak dapat memindahkan uang apa pun, jadi aman
  // ditautkan otomatis alih-alih mengunci pemilik nomor dari akunnya sendiri.
  const lain =
    tujuan === null ? [] : kepemilikan.pemilik.filter((p) => p.userId !== tujuan);
  const bentrok = lain.filter((p) => punyaBerkasKeuangan(p.berkas));
  if (bentrok.length > 1) return gagal(pesanDataGanda(bentrok.length));

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
      ...(tujuan === null ? {} : { userId: tujuan }),
      status: "diblokir",
      metode: args.metode,
      ip: (args.ip ?? "").slice(0, 64),
      userAgent: (args.userAgent ?? "").slice(0, 200),
      keterangan: "Batas percobaan kode masuk WhatsApp tercapai",
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
      ...(tujuan === null ? {} : { userId: tujuan }),
      status: "gagal",
      metode: args.metode,
      ip: (args.ip ?? "").slice(0, 64),
      userAgent: (args.userAgent ?? "").slice(0, 200),
      keterangan: `Kode masuk WhatsApp salah (ke-${baru})`,
    });
    return gagal("Kode OTP salah.");
  }

  // Sekali pakai: kode dihabiskan terlepas dari apa pun setelah ini.
  await ctx.db.patch(tantangan._id, {
    dipakaiPada: sekarang,
    ...(tujuan === null ? {} : { dipakaiOlehUserId: tujuan }),
  });

  // Pintu NIK berhenti di sini: kode sudah terbukti, akun sudah pasti. Tidak
  // ada penautan berkas, karena masuk bukan memulihkan data lama.
  if (args.hanyaMasuk === true) {
    if (tujuan === null) return gagal(PESAN_NIK_UMUM);
    await catatLogin(ctx, {
      userId: tujuan,
      status: "berhasil",
      metode: args.metode,
      ip: (args.ip ?? "").slice(0, 64),
      userAgent: (args.userAgent ?? "").slice(0, 200),
      keterangan: "Masuk dengan NIK dan kode OTP ke WhatsApp terdaftar",
    });
    return {
      ok: true,
      pesan: "NIK dan kode cocok.",
      userId: tujuan,
      akunLama: null,
      berkas: kosong,
      dipindahkan: kosong,
      metode: args.metode,
    };
  }

  // Akun pendana tidak punya berkas pinjaman; nomor yang terverifikasi cukup
  // memberi sesi akun itu langsung. Jalur klaim peminjam di bawah tidak relevan
  // dan akan mencatat riwayat klaim yang menyesatkan.
  if (
    tujuan !== null &&
    akunTujuan !== null &&
    akunTujuan.role === ROLES.DANA &&
    akunTujuan.nomorWhatsApp === bersih
  ) {
    return masukPendanaLewatOtp(ctx, {
      userId: tujuan,
      nomor: bersih,
      metode: args.metode,
      ip: args.ip,
      userAgent: args.userAgent,
    });
  }

  if (tujuan === null) {
    // Nomor baru: akun ditentukan setelah kode terbukti benar. Akun peminjam
    // buatan admin tanpa kredensial sengaja dilewati karena pemiliknya memang
    // diminta mendaftar sendiri (lihat catatan `dibuatAdminPada` di schema),
    // sedangkan akun pendana tetap dipakai karena nomornya memang sengaja
    // didaftarkan admin sebagai pintu masuk OTP.
    const kandidat = await ctx.db
      .query("users")
      .withIndex("by_nomorWhatsApp", (q) => q.eq("nomorWhatsApp", bersih))
      .collect();

    if (kandidat.some((u) => u.role === ROLES.ADMIN)) {
      return gagal(
        "Nomor ini menempel pada akun tim PINDAI. Akun tim masuk dengan kata sandi dan TOTP, bukan lewat WhatsApp.",
      );
    }

    const calon = kandidat
      .filter(
        (u) =>
          u.isAnonymous !== true &&
          u.role !== ROLES.ADMIN &&
          u.role !== ROLES.PENGAMAT &&
          (u.role === ROLES.DANA || u.dibuatAdminPada === undefined),
      )
      .sort(
        (a, b) =>
          Number(b.role === ROLES.PEMINJAM) - Number(a.role === ROLES.PEMINJAM) ||
          a._creationTime - b._creationTime,
      )[0];

    if (calon?.role === ROLES.DANA) {
      await ctx.db.patch(calon._id, { nomorWhatsApp: bersih });
      return masukPendanaLewatOtp(ctx, {
        userId: calon._id,
        nomor: bersih,
        metode: args.metode,
        ip: args.ip,
        userAgent: args.userAgent,
      });
    }

    const userId =
      calon?._id ??
      (await ctx.db.insert("users", {
        role: ROLES.PEMINJAM,
        nomorWhatsApp: bersih,
      }));

    await ctx.db.patch(userId, {
      nomorWhatsApp: bersih,
      ...(calon === undefined || calon.role === undefined
        ? { role: ROLES.PEMINJAM }
        : {}),
    });

    await audit(
      ctx,
      String(userId),
      labelAkun(await ctx.db.get(userId), userId),
      "masuk_otp_whatsapp",
      `users/${userId}`,
      `Nomor ${topengNomor(bersih)} diverifikasi lewat OTP WhatsApp; ${
        calon === undefined
          ? "akun peminjam baru dibuat"
          : "akun yang sudah terhubung ke nomor ini dipakai"
      }.`,
    );
    await catatLogin(ctx, {
      userId,
      status: "berhasil",
      metode: args.metode,
      ip: (args.ip ?? "").slice(0, 64),
      userAgent: (args.userAgent ?? "").slice(0, 200),
      keterangan: "Masuk lewat OTP WhatsApp nomor terverifikasi",
    });

    return {
      ok: true,
      pesan: "Nomor berhasil diverifikasi. Akun siap dipakai.",
      userId,
      akunLama: null,
      berkas: kosong,
      dipindahkan: kosong,
      metode: args.metode,
    };
  }

  // Semua akun sisa ditautkan; master identitas hanya berpindah bila akun tujuan
  // belum punya master sendiri (lihat `tautkanBerkas`).
  const akunLamaList = lain.map((p) => p.userId);
  const dipindahkan: BerkasLama =
    akunLamaList.length === 0
      ? // Masuk ke pemilik data itu sendiri: angkanya tetap jujur, tanpa memindah.
        await berkasPemilik(ctx, tujuan)
      : { ...BERKAS_LAMA_KOSONG };
  let masterTertinggal = 0;
  for (const dari of akunLamaList) {
    const hasil = await tautkanBerkas(ctx, { dari, ke: tujuan, pada: sekarang });
    dipindahkan.pinjaman += hasil.dipindahkan.pinjaman;
    dipindahkan.gadai += hasil.dipindahkan.gadai;
    dipindahkan.kredit += hasil.dipindahkan.kredit;
    dipindahkan.masterNasabah += hasil.dipindahkan.masterNasabah;
    dipindahkan.pokokPinjaman += hasil.dipindahkan.pokokPinjaman;
    dipindahkan.pinjamanAktif += hasil.dipindahkan.pinjamanAktif;
    dipindahkan.pinjamanLunas += hasil.dipindahkan.pinjamanLunas;
    masterTertinggal += hasil.masterTertinggal;
  }
  dipindahkan.akunKandidat = 1;
  const akunLama = akunLamaList[0] ?? tujuan;

  // Akun lama dari data impor tidak punya peran/kredensial; akun yang dipakai
  // masuk harus tetap sah sebagai Peminjam supaya portalnya terbuka.
  const user = akunTujuan;
  const patchUser: Partial<Doc<"users">> = {};
  // Simpan nomor yang baru diverifikasi supaya kunjungan berikutnya menemukan
  // akun ini walau data lamanya kelak tidak lagi menempel pada nomor tersebut.
  if (user !== null && user.nomorWhatsApp === undefined) {
    patchUser.nomorWhatsApp = bersih;
  }
  if (user !== null && user.role === undefined) patchUser.role = ROLES.PEMINJAM;
  if (user !== null && (user.name === undefined || user.name.trim() === "")) {
    const profil = await ctx.db
      .query("nasabahProfil")
      .withIndex("by_user", (q) => q.eq("userId", tujuan))
      .first();
    if (profil !== null && profil.namaLengkap.trim() !== "") patchUser.name = profil.namaLengkap;
  }
  if (Object.keys(patchUser).length > 0) await ctx.db.patch(tujuan, patchUser);

  const labelAkunLamaList = (
    await Promise.all(akunLamaList.map(async (id) => labelAkun(await ctx.db.get(id), id)))
  ).join(", ");
  const ringkas = kalimatBerkasLama(dipindahkan, formatRupiahAman);
  const catatanMaster =
    masterTertinggal === 0
      ? ""
      : ` ${masterTertinggal} master identitas dibiarkan di akun lama karena akun ini sudah punya master sendiri — perlu ditinjau admin.`;

  await ctx.db.insert("klaimPeminjam", {
    userId: tujuan,
    nomor: bersih,
    akunLamaUserId: akunLamaList.length === 0 ? undefined : akunLama,
    userIdLabel: labelAkun(user, tujuan),
    akunLamaLabel: akunLamaList.length === 0 ? undefined : labelAkunLamaList,
    pada: sekarang,
    metode: args.metode,
    pinjaman: dipindahkan.pinjaman,
    gadai: dipindahkan.gadai,
    kredit: dipindahkan.kredit,
    masterNasabah: dipindahkan.masterNasabah,
    pokokPinjaman: dipindahkan.pokokPinjaman,
    keterangan:
      akunLamaList.length === 0
        ? `Nomor ${topengNomor(bersih)} diverifikasi — berkas sudah berada pada akun ini (${ringkas}).`
        : `Nomor ${topengNomor(bersih)} diverifikasi — berkas dipindahkan ke akun ini (${ringkas}).`,
  });

  await audit(
    ctx,
    String(tujuan),
    labelAkun(user, tujuan),
    "klaim_peminjam_lama",
    akunLamaList.length === 0 ? `users/${tujuan}` : akunLamaList.map((id) => `users/${id}`).join(", "),
    `Klaim peminjam lama (${args.metode}) untuk nomor ${topengNomor(bersih)}: ${ringkas}. ` +
      (akunLamaList.length === 0
        ? "Berkas sudah pada akun ini."
        : `Kepemilikan dipindahkan dari akun ${labelAkunLamaList} ke akun ini.`) +
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
    akunLama: akunLamaList.length === 0 ? null : akunLama,
    berkas: utama?.berkas ?? kosong,
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
    // Klaim memindahkan kepemilikan pinjaman dan berkas KYC. Pratinjau tidak
    // boleh melakukannya: yang menekan tombol adalah admin, bukan pemilik data.
    await requireBukanPratinjau(ctx);
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
 * PINTU 2 — LOGIN/MASUK lewat provider `whatsapp-otp`.
 *
 * Dijalankan di dalam `authorize` provider (`auth/whatsappOtp.ts`): kode
 * diverifikasi di sini. Nomor pemilik data lama masuk ke akun pemilik berkas
 * (tanpa memindahkan apa pun), sedangkan nomor baru memakai akun yang sudah
 * terhubung atau mendapat akun peminjam baru setelah kode benar. Dengan begitu
 * peminjam baru tidak lagi dipaksa mendaftar lewat email dulu.
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
      izinkanAkunBaru: true,
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
 * PINTU NIK untuk provider Convex Auth (`auth/nikOtp.ts`).
 *
 * Alurnya: NIK → profil → nomor WhatsApp pada profil itu → verifikasi kode oleh
 * mesin yang SAMA dengan pintu nomor (`selesaikanKlaim`), lalu sesi hanya untuk
 * `userId` milik profil tersebut. Tidak ada akun baru, tidak ada pemindahan
 * berkas, dan kegagalan apa pun dijawab dengan pesan seragam supaya NIK tidak
 * bisa dipakai untuk memeriksa siapa yang terdaftar.
 */
export const _klaimUntukMasukDenganNik = internalMutation({
  args: {
    nik: v.string(),
    kode: v.string(),
    ip: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  },
  returns: v.union(
    v.object({ ok: v.literal(true), userId: v.id("users"), pesan: v.string() }),
    v.object({ ok: v.literal(false), pesan: v.string() }),
  ),
  handler: async (ctx, args) => {
    const profil = await profilDenganNik(ctx, args.nik);
    const nomor =
      profil === null ? null : normalisasiNomorWa(profil.nomorWhatsApp);
    if (profil === null || nomor === null) {
      return { ok: false as const, pesan: PESAN_NIK_UMUM };
    }

    const hasil = await selesaikanKlaim(ctx, {
      nomor,
      kode: args.kode,
      userId: null,
      metode: "otp_nik",
      wajibUserId: profil.userId,
      hanyaMasuk: true,
      ...(args.ip === undefined ? {} : { ip: args.ip }),
      ...(args.userAgent === undefined ? {} : { userAgent: args.userAgent }),
    });
    if (!hasil.ok || hasil.userId === null) {
      // Detail kegagalan (kode salah, kedaluwarsa, batas percobaan) sengaja
      // tidak diteruskan: semuanya hanya boleh terlihat sama dari luar.
      return { ok: false as const, pesan: PESAN_NIK_UMUM };
    }
    return { ok: true as const, userId: hasil.userId, pesan: "NIK dan kode cocok." };
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
