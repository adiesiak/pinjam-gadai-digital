/**
 * Referral nasabah — kode ajak teman dan hadiah voucher setelah lunas.
 *
 * Alur:
 *  1. nasabah yang sudah punya pinjaman lunas membuka kode miliknya;
 *  2. akun lain memasukkan kode itu SEBELUM pinjaman pertama;
 *  3. saat pinjaman pertama pemakai kode lunas, dua voucher terbit — untuk
 *     pemilik kode dan untuk pemakai kode.
 *
 * Penerbitan hadiah dipanggil dari jalur pelunasan yang sudah ada
 * (`beriVoucherApresiasi` juga dipanggil di sana), dan idempoten lewat
 * `referensi` voucher, jadi pelunasan yang dicatat ulang tidak menggandakan
 * hadiah. Tidak ada pencairan uang: hadiahnya potongan biaya admin.
 */
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import {
  buatKodeReferral,
  kodeReferralValid,
  LABEL_STATUS_REFERRAL,
  normalisasiKodeReferral,
  periksaKlaimReferral,
  REFERRAL,
  ringkasReferral,
  type StatusKlaimReferral,
} from "../lib/referral";
import { formatRupiah, type Rupiah } from "../lib/money";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { ROLES } from "./schema";
import { audit } from "./system";

const BATAS_KLAIM = 50;

function butuhMasuk(userId: Id<"users"> | null): Id<"users"> {
  if (userId === null) throw new Error("Masuk dulu untuk memakai referral.");
  return userId;
}

function labelAktor(user: Doc<"users">): string {
  return user.email ?? user.name ?? String(user._id);
}

/**
 * Ringkasan referral untuk layar nasabah.
 *
 * `null` bila belum masuk — query ini juga dipanggil dari halaman publik yang
 * tidak punya sesi, dan melempar galat di sana akan mengosongkan seluruh kartu.
 */
export const ringkasanSaya = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const user = await ctx.db.get(userId);
    if (user === null || user.role === ROLES.ADMIN) return null;

    const kodeRow = await ctx.db
      .query("referralKode")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    const loans = await ctx.db
      .query("loans")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const sudahLunas = loans.some((loan) => loan.status === "lunas");
    const punyaPinjaman = loans.length > 0;

    const klaimRows = await ctx.db
      .query("referralKlaim")
      .withIndex("by_perujuk", (q) => q.eq("perujukId", userId))
      .collect();
    // Ringkasan dihitung dari SELURUH klaim; yang dipotong hanya daftar yang
    // ditampilkan, supaya angka hadiah tidak berhenti di 50 tanpa keterangan.
    const ringkas = ringkasReferral(
      klaimRows.map((row) => ({
        status: row.status as StatusKlaimReferral,
        diklaimPada: row.diklaimPada,
      })),
    );
    const klaim = klaimRows
      .slice()
      .sort((a, b) => b.diklaimPada - a.diklaimPada)
      .slice(0, BATAS_KLAIM)
      .map((row) => ({
        status: row.status as StatusKlaimReferral,
        diklaimPada: row.diklaimPada,
      }));

    const klaimSaya = await ctx.db
      .query("referralKlaim")
      .withIndex("by_pengundang", (q) => q.eq("pengundangId", userId))
      .first();

    return {
      kode: kodeRow?.kode ?? null,
      totalKlaim: kodeRow?.totalKlaim ?? 0,
      bisaAktifkan: kodeRow === null && sudahLunas,
      alasan: kodeRow === null && !sudahLunas
        ? "Kode referral terbuka setelah pinjaman pertamamu lunas."
        : null,
      sudahLunas,
      punyaPinjaman,
      ringkasan: ringkas,
      klaim,
      klaimSaya: klaimSaya === null
        ? null
        : {
            kode: klaimSaya.kode,
            status: klaimSaya.status as StatusKlaimReferral,
            labelStatus: LABEL_STATUS_REFERRAL[klaimSaya.status as StatusKlaimReferral],
            diklaimPada: klaimSaya.diklaimPada,
          },
      hadiah: {
        perujuk: REFERRAL.hadiahPerujuk,
        pengundang: REFERRAL.hadiahPengundang,
        minimalPokok: REFERRAL.minimalPokok,
      },
    };
  },
});

/**
 * Buat kode referral milik akun yang sedang masuk.
 *
 * Syaratnya satu pinjaman lunas: kode dari akun yang belum pernah menyelesaikan
 * pinjaman hanya akan menghasilkan klaim yang tidak pernah berhadiah. Akun yang
 * sudah punya kode menerima kode yang sama (idempoten).
 */
export const aktifkanKode = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = butuhMasuk(await getAuthUserId(ctx));
    const user = await ctx.db.get(userId);
    if (user === null) throw new Error("Akun tidak ditemukan.");
    if (user.role === ROLES.ADMIN) throw new Error("Akun admin tidak memakai referral.");

    const sudah = await ctx.db
      .query("referralKode")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (sudah !== null) return { kode: sudah.kode, baru: false };

    const loans = await ctx.db
      .query("loans")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    if (!loans.some((loan) => loan.status === "lunas")) {
      throw new Error("Selesaikan satu pinjaman dulu sebelum membagikan kode referral.");
    }

    const kode = buatKodeReferral(user.name ?? "Teman", String(userId));
    const bentrok = await ctx.db
      .query("referralKode")
      .withIndex("by_kode", (q) => q.eq("kode", kode))
      .first();
    if (bentrok !== null) {
      throw new Error("Kode referral bentrok. Coba lagi beberapa saat.");
    }

    await ctx.db.insert("referralKode", {
      userId,
      kode,
      dibuatPada: Date.now(),
      totalKlaim: 0,
    });
    await audit(
      ctx,
      userId,
      labelAktor(user),
      "referral_kode_dibuat",
      kode,
      `Kode referral aktif untuk ${labelAktor(user)}.`,
    );
    return { kode, baru: true };
  },
});

/**
 * Pakai kode referral orang lain.
 *
 * Hanya sebelum pinjaman pertama supaya kode tidak bisa ditempelkan pada
 * pinjaman yang sudah berjalan. Tidak ada voucher di sini: hadiah menyusul saat
 * pinjaman lunas.
 */
export const klaimKode = mutation({
  args: { kode: v.string() },
  handler: async (ctx, args) => {
    const userId = butuhMasuk(await getAuthUserId(ctx));
    const user = await ctx.db.get(userId);
    if (user === null) throw new Error("Akun tidak ditemukan.");

    const kode = normalisasiKodeReferral(args.kode);
    if (!kodeReferralValid(kode)) throw new Error("Kode referral tidak valid.");

    const kodeRow = await ctx.db
      .query("referralKode")
      .withIndex("by_kode", (q) => q.eq("kode", kode))
      .first();
    if (kodeRow === null) throw new Error("Kode referral tidak ditemukan.");
    if (kodeRow.userId === userId) throw new Error("Kode milik sendiri tidak bisa dipakai.");

    const kodeSendiri = await ctx.db
      .query("referralKode")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    const sudahKlaim = await ctx.db
      .query("referralKlaim")
      .withIndex("by_pengundang", (q) => q.eq("pengundangId", userId))
      .first();
    const pinjaman = await ctx.db
      .query("loans")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    const galat = periksaKlaimReferral({
      kode,
      kodeSendiri: kodeSendiri?.kode ?? null,
      sudahPernahKlaim: sudahKlaim !== null,
      sudahPunyaPinjaman: pinjaman !== null,
    });
    if (galat !== null) throw new Error(galat);

    const sekarang = Date.now();
    await ctx.db.insert("referralKlaim", {
      kodeId: kodeRow._id,
      kode,
      perujukId: kodeRow.userId,
      pengundangId: userId,
      diklaimPada: sekarang,
      status: "menunggu_lunas",
    });
    await ctx.db.patch(kodeRow._id, { totalKlaim: kodeRow.totalKlaim + 1 });
    await audit(
      ctx,
      userId,
      labelAktor(user),
      "referral_diklaim",
      kode,
      `${labelAktor(user)} memakai kode ${kode}; hadiah menunggu pinjaman pertama lunas.`,
    );
    return { kode, status: "menunggu_lunas" as const };
  },
});

type PinjamanLunas = {
  _id: Id<"loans">;
  userId: Id<"users">;
  status: string;
  nomorReferensi: string;
  pokokPinjaman: number;
  lunasPada?: number;
};

/**
 * Terbitkan hadiah referral saat pinjaman pemakai kode lunas.
 *
 * Dipanggil berdampingan dengan `beriVoucherApresiasi` di setiap jalur
 * pelunasan. Aman dipanggil berulang: klaim yang sudah berstatus
 * `hadiah_diberikan` dilewati, dan voucher dijaga idempoten oleh `referensi`.
 */
export async function selesaikanReferralPelunasan(
  ctx: MutationCtx,
  args: { loan: PinjamanLunas; sekarang: number },
): Promise<void> {
  const { loan, sekarang } = args;
  if (loan.status !== "lunas") return;

  const klaim = await ctx.db
    .query("referralKlaim")
    .withIndex("by_pengundang", (q) => q.eq("pengundangId", loan.userId))
    .first();
  if (klaim === null || klaim.status !== "menunggu_lunas") return;

  // Pinjaman pertama yang di bawah pokok minimum tidak dihitung sebagai
  // referral berhasil. Ditandai batal supaya pemakai kode tahu, bukan
  // menggantung selamanya di "menunggu lunas".
  if (loan.pokokPinjaman < REFERRAL.minimalPokok) {
    await ctx.db.patch(klaim._id, {
      status: "batal",
      loanId: loan._id,
      hadiahDiberikanPada: sekarang,
    });
    await audit(
      ctx,
      loan.userId,
      "sistem",
      "referral_batal",
      loan.nomorReferensi,
      `Pokok ${formatRupiah(loan.pokokPinjaman as Rupiah)} di bawah minimum ${formatRupiah(REFERRAL.minimalPokok)}; hadiah referral tidak terbit.`,
    );
    return;
  }

  const perujuk = await ctx.db.get(klaim.perujukId);
  const pengundang = await ctx.db.get(klaim.pengundangId);
  const berlakuSampai = sekarang + REFERRAL.berlakuHari * 86_400_000;

  const terbitkan = async (
    pemilikId: Id<"users">,
    nilai: Rupiah,
    peran: "perujuk" | "pengundang",
  ): Promise<Id<"voucher">> => {
    const referensi = `REFERRAL:${klaim._id}:${peran}`;
    const sudah = await ctx.db
      .query("voucher")
      .withIndex("by_referensi", (q) => q.eq("referensi", referensi))
      .first();
    if (sudah !== null) return sudah._id;
    return await ctx.db.insert("voucher", {
      kode: `REF-${String(klaim._id).slice(-6).toUpperCase()}-${peran === "perujuk" ? "P" : "U"}`,
      jenis: "diskon_admin",
      judul:
        peran === "perujuk"
          ? "Hadiah referral — teman lunas"
          : "Hadiah memakai kode referral",
      nilai,
      minPokok: REFERRAL.minimalPokok,
      batasPemakaian: 1,
      terpakai: 0,
      pemilikId,
      sumber: "referral",
      status: "aktif",
      berlakuSampai,
      dibuatPada: sekarang,
      referensi,
    });
  };

  const voucherPerujukId = await terbitkan(
    klaim.perujukId,
    REFERRAL.hadiahPerujuk,
    "perujuk",
  );
  const voucherPengundangId = await terbitkan(
    klaim.pengundangId,
    REFERRAL.hadiahPengundang,
    "pengundang",
  );

  await ctx.db.patch(klaim._id, {
    status: "hadiah_diberikan",
    loanId: loan._id,
    hadiahDiberikanPada: sekarang,
    voucherPerujukId,
    voucherPengundangId,
  });

  await audit(
    ctx,
    klaim.perujukId,
    "sistem",
    "referral_hadiah",
    loan.nomorReferensi,
    `Kode ${klaim.kode} berhasil: ${formatRupiah(REFERRAL.hadiahPerujuk)} untuk ${perujuk?.name ?? "perujuk"} dan ${formatRupiah(REFERRAL.hadiahPengundang)} untuk ${pengundang?.name ?? "pengundang"}.`,
  );
}

