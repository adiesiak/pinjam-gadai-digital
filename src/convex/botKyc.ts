/**
 * Endpoint bot: pengumpulan KYC lewat WhatsApp.
 *
 * KENAPA ADA: `/bot/pengajuan` menolak dengan "KYC belum terverifikasi" sampai
 * nasabah menyelesaikan KYC. Tanpa endpoint ini, alur WhatsApp berakhir di
 * "buka pindai.biz.id" - pintu depan yang putus di tengah jalan.
 *
 * YANG TIDAK BERUBAH: keputusan KYC tetap di tangan ADMIN. Modul ini hanya
 * mengumpulkan data dan mengajukannya (`PENDING_REVIEW`); ia TIDAK menyetujui
 * apa pun. Verifikasi tetap lewat panel website.
 *
 * MEMAKAI INTI YANG SAMA: `simpanProgresKycInti` dan `ajukanKycInti` adalah
 * fungsi yang juga dipakai form website. Validasi isian, pemeriksaan berkas,
 * dan aturan transisi status tidak disalin - KYC adalah data identitas, dan dua
 * aturan berbeda untuk data yang sama berarti salah satunya tidak diuji.
 */
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { audit } from "./system";
import { VERSI_PERSETUJUAN_KYC, persetujuanAktif } from "../lib/persetujuanKyc";
import { simpanProgresKycInti, ajukanKycInti } from "./kyc";
import { normalisasiNomor } from "./botApi";

export const _simpanKycDariBot = internalMutation({
  args: {
    nomor: v.string(),
    namaLengkap: v.string(),
    nik: v.string(),
    alamat: v.string(),
    pekerjaan: v.string(),
    penghasilanBulanan: v.number(),
    sumberPenghasilan: v.string(),
    namaBank: v.string(),
    nomorRekening: v.string(),
    ktpId: v.id("_storage"),
    selfieKtpId: v.id("_storage"),
    buktiPenghasilanId: v.id("_storage"),
    /** Nasabah menyetujui pemrosesan data pribadi (ditanyakan bot, bukan diasumsikan). */
    persetujuan: v.boolean(),
    namaKontakDarurat: v.optional(v.string()),
    nomorKontakDarurat: v.optional(v.string()),
    hubunganKontakDarurat: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const nomor = normalisasiNomor(args.nomor);
    if (nomor === "") throw new Error("Nomor WhatsApp tidak valid.");

    if (args.persetujuan !== true) {
      throw new Error(
        "Nasabah harus menyetujui pemrosesan data pribadi sebelum KYC dikirim.",
      );
    }

    const semua = await ctx.db.query("users").collect();
    const user = semua.find(
      (u) => u.nomorWhatsApp !== undefined && normalisasiNomor(u.nomorWhatsApp) === nomor,
    );
    if (user === undefined) {
      throw new Error("Nomor WhatsApp belum terdaftar. Daftarkan dulu lewat /bot/daftar.");
    }

    const label = user.name ?? nomor;
    const sekarang = Date.now();

    // Persetujuan dicatat SEBELUM data pribadi ditulis. Mutasi progres menolak
    // berjalan tanpa persetujuan aktif, jadi urutan ini bukan pilihan gaya.
    const lama = await ctx.db
      .query("kycProfil")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
    if (!persetujuanAktif(lama?.persetujuan)) {
      if (lama === null) {
        await ctx.db.insert("kycProfil", {
          userId: user._id,
          status: "IN_PROGRESS",
          dibuatPada: sekarang,
          diperbaruiPada: sekarang,
          persetujuan: {
            versi: VERSI_PERSETUJUAN_KYC,
            pada: sekarang,
            olehLabel: label,
          },
        });
      } else {
        await ctx.db.patch(lama._id, {
          persetujuan: {
            versi: VERSI_PERSETUJUAN_KYC,
            pada: sekarang,
            olehLabel: label,
          },
          diperbaruiPada: sekarang,
        });
      }
    }

    await simpanProgresKycInti(
      ctx,
      {
        namaLengkap: args.namaLengkap,
        nik: args.nik,
        nomorWhatsApp: nomor,
        alamat: args.alamat,
        pekerjaan: args.pekerjaan,
        penghasilanBulanan: args.penghasilanBulanan,
        sumberPenghasilan: args.sumberPenghasilan,
        namaBank: args.namaBank,
        nomorRekening: args.nomorRekening,
        ktpId: args.ktpId,
        selfieKtpId: args.selfieKtpId,
        buktiPenghasilanId: args.buktiPenghasilanId,
        ...(args.namaKontakDarurat !== undefined
          ? { namaKontakDarurat: args.namaKontakDarurat }
          : {}),
        ...(args.nomorKontakDarurat !== undefined
          ? { nomorKontakDarurat: args.nomorKontakDarurat }
          : {}),
        ...(args.hubunganKontakDarurat !== undefined
          ? { hubunganKontakDarurat: args.hubunganKontakDarurat }
          : {}),
      },
      user._id,
      label,
    );

    const hasil = await ajukanKycInti(ctx, user._id, label);

    await audit(
      ctx,
      String(user._id),
      "bot-whatsapp",
      "kyc_diajukan_dari_bot",
      `kycProfil/${user._id}`,
      `KYC diajukan lewat bot WhatsApp; status akhir ${hasil?.status ?? "PENDING_REVIEW"}.`,
    );

    return { ok: true as const, status: hasil?.status ?? "PENDING_REVIEW" };
  },
});
