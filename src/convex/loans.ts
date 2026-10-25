import { getAuthUserId } from "@convex-dev/auth/server";
import {
  internalMutation,
  mutation,
  query,
  MutationCtx,
  QueryCtx,
} from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { periksaBerkasIdentitasStorage } from "./berkasIdentitas";
import { catatDenyut } from "./monitoring";
import {
  ROLES,
  loanStatusKanonikValidator,
  loanStatusValidator,
  LoanStatusValue,
  PawnStatusValue,
} from "./schema";
import {
  apakahPelunasanTepatWaktu,
  pesanPlafonTerlampaui,
  pesanPlafonTersediaTerlampaui,
  PLAFON_KENAIKAN_PER_PELUNASAN,
  PLAFON_NAIK_SETELAH_LUNAS,
  plafonPeminjam,
  pokokDalamPlafon,
  ringkasPlafon,
} from "../lib/plafon";
import {
  assertPokokPinjamanValid,
  pelunasanPinjaman,
  persenBungaHarian,
  PINDAI_PRICING,
  quoteLoan,
  quoteLoanBunga,
  quotePinjaman,
  simulasiBulananPinjaman,
  tarifBiayaDariAngka,
  validasiTenorHarian,
} from "../lib/loan";
import { kodeTanggalWIB } from "../lib/waktu";
import {
  assertSimulasiBulananValid,
  hitungSimulasiBulanan,
  persenBungaPerBulan,
  TENOR_BULANAN_OPTIONS,
} from "../lib/bulanan";
import { tarifBulananDariConfig } from "../lib/system-config";
import { potonganDariKembali } from "../lib/bagiHasil";
import { siklusPendanaan } from "../lib/imbalPendana";

import { formatRupiah, type Rupiah } from "../lib/money";
import { bungaSetelahPromo } from "../lib/promoBunga";
import { promoBungaUntukPengajuan } from "./promoBunga";
import { COLLATERAL_CATEGORIES } from "../lib/pawn";
import { CONTRACT_TERMS_VERSION } from "../lib/contract";
import {
  AKUN_PLATFORM_PRINCIPAL_CLEARING,
  akunDompetDana,
  appendJournal,
  catatMarginSpread,
} from "./ledger";
import { getConfig, audit, tarifDendaBerlaku } from "./system";
import { requireGerbangLokasi } from "./lokasi";
import { requireAdminSession, requireBukanPratinjau } from "./adminAuthz";
import { ensureKodePeminjam } from "./peminjamCode";
import { requireKycTerverifikasi } from "./kyc";
import { eksposurSyariah } from "./syariahPengajuan";
import {
  ambilHasilIdempoten,
  kunciIdempotensiValidator,
  simpanHasilIdempoten,
} from "./idempotensi";
import { gerbangPengajuan } from "./gerbangKirim";
import { pastikanAngsuran } from "./angsuranJadwal";
import { dendaAngsuran } from "../lib/angsuran";
import { pembayaranSiklus } from "./siklusPendana";
import {
  hitungRencanaPembayaran,
  type RencanaPembayaranPinjaman,
} from "../lib/perpanjanganPinjaman";
import { rejectUnverifiedMoneyMovement } from "./paymentGuard";
import { beriTiketPelunasan, beriTiketPendanaan } from "./doorprize";
import { selesaikanReferralPelunasan } from "./referral";
import {
  beriVoucherApresiasi,
  hitungDiskonVoucher,
  tandaiVoucherTerpakai,
  voucherUntukPengajuan,
} from "./voucher";
import { catatDanaKembali } from "./matchingQueue";
import {
  bolehDibatalkan,
  diTahapTinjauan,
  keStatusTersimpan,
  labelStatusPinjaman,
  nominalDisetujui,
  nominalTerkunci,
  validasiUbahStatus,
} from "../lib/statusPinjaman";

/**
 * Saat pinjaman dilunasi, pinjaman baru (belum pernah didanai) bisa kembali
 * ke marketplace — sisa kebutuhan akan dihitung ulang otomatis.
 */

/**
 * Batas rupiah untuk nilai taksiran/harga pasar barang gadai. Pokok pinjaman
 * tunai memakai batas sendiri di lib/loan.ts (LOAN_LIMITS).
 */
export const MIN_POKOK = 100_000;
export const MAX_POKOK = 500_000_000;

/**
 * Tenor untuk data warisan (pinjaman dibuat sebelum fitur tenor ada). Mesin
 * denda menghitung jatuh tempo dari didanaiPada + tenor; tanpa default ini,
 * pinjaman warisan tidak bisa dilunasi dan tidak tampil di pengingat.
 */
export const DEFAULT_TENOR_HARI = 30;

/** Satu hari (30 hari = satu bulan skema bulanan) dalam milidetik. */
const DAY_MS = 86_400_000;

function validateRupiahAmount(amount: Rupiah, label: string): void {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error(`${label} harus rupiah bulat positif (tanpa desimal).`);
  }
  if (amount < MIN_POKOK || amount > MAX_POKOK) {
    throw new Error(
      `${label} harus antara ${formatRupiah(MIN_POKOK)} dan ${formatRupiah(MAX_POKOK)}.`,
    );
  }
}

/** Shared auth gate: signed-in users only. */
async function requireUser(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
  const user = await ctx.db.get(userId);
  if (user === null) throw new Error("Pengguna tidak ditemukan.");
  if (user.isAnonymous === true) {
    throw new Error(
      "Akun tamu hanya dapat melihat informasi. Masuk dengan akun terverifikasi untuk mengakses data dan transaksi.",
    );
  }
  return { userId, user };
}

/**
 * Role gate: Peminjam. A user without an explicit role is promoted to Peminjam
 * on first application activity. Akun warisan berperan penyedia dana diperlakukan
 * sebagai Peminjam karena ruang penyedia dana sudah dihapus dari produk.
 */
async function requirePeminjam(ctx: QueryCtx) {
  return await requireUser(ctx);
}

function referenceNumber(now: number): string {
  const date = kodeTanggalWIB(now);
  const suffix = Array.from({ length: 4 }, () =>
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".charAt(Math.floor(Math.random() * 32)),
  ).join("");
  return `PGD-${date}-${suffix}`;
}

// =====================================================================
// Pinjaman (cash loan applications)
// =====================================================================

/** Ajukan pinjaman (Peminjam). Pricing dihitung server-side dari pokok bulat. */
/**
 * URL unggah dokumen KYC (satu per file) — hanya Peminjam yang masuk.
 * Klien meng-POST file langsung ke URL ini, lalu memakai storageId-nya
 * pada createLoanApplication.
 */
export const generateKycUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requirePeminjam(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/** URL unggah bukti pembayaran manual untuk Peminjam yang masuk. */
export const generatePaymentReceiptUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requirePeminjam(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Catat kejadian alur verifikasi browser setelah persetujuan eksplisit.
 * Media tidak diunggah, ID berkas/koordinat mentah tidak disimpan, dan subjek
 * harus pinjaman milik akun sesi. Log dibaca melalui query admin TOTP.
 */
export const catatVerifikasiPembayaran = mutation({
  args: {
    loanId: v.id("loans"),
    status: v.union(v.literal("dimulai"), v.literal("selesai"), v.literal("gagal")),
    wajahFotoByte: v.optional(v.number()),
    wajahVideoByte: v.optional(v.number()),
    lingkunganFotoByte: v.optional(v.number()),
    lingkunganVideoByte: v.optional(v.number()),
    akurasiMeter: v.optional(v.number()),
    kodeGagal: v.optional(v.union(
      v.literal("izin_ditolak"),
      v.literal("kamera_tidak_tersedia"),
      v.literal("lokasi_tidak_tersedia"),
      v.literal("rekaman_gagal"),
      v.literal("ukuran_tidak_valid"),
      v.literal("audit_tidak_tersedia"),
    )),
  },
  handler: async (ctx, args) => {
    const { userId, user } = await requirePeminjam(ctx);
    const loan = await ctx.db.get(args.loanId);
    if (loan === null || loan.userId !== userId) {
      throw new Error("Pinjaman tidak ditemukan.");
    }

    let detail: string;
    if (args.status === "dimulai") {
      if (args.kodeGagal !== undefined || args.wajahFotoByte !== undefined) {
        throw new Error("Rincian permintaan verifikasi tidak valid.");
      }
      detail = "Persetujuan eksplisit diberikan; permintaan lokasi sekali dan dua kamera berurutan dimulai. Media tetap di browser, tidak diunggah.";
    } else if (args.status === "selesai") {
      const ukuran = [
        args.wajahFotoByte,
        args.wajahVideoByte,
        args.lingkunganFotoByte,
        args.lingkunganVideoByte,
      ];
      if (
        ukuran.some((n) => n === undefined || !Number.isSafeInteger(n) || n <= 0) ||
        (args.wajahFotoByte ?? 0) > 8_000_000 ||
        (args.lingkunganFotoByte ?? 0) > 8_000_000 ||
        (args.wajahVideoByte ?? 0) > 22_000_000 ||
        (args.lingkunganVideoByte ?? 0) > 22_000_000 ||
        ukuran.reduce<number>((total, n) => total + (n ?? 0), 0) > 60_000_000 ||
        args.kodeGagal !== undefined ||
        (args.akurasiMeter !== undefined &&
          (!Number.isFinite(args.akurasiMeter) || args.akurasiMeter < 0 || args.akurasiMeter > 30_000))
      ) {
        throw new Error("Ringkasan media verifikasi tidak valid.");
      }
      const akurasiBulat = args.akurasiMeter === undefined
        ? null
        : Math.round(args.akurasiMeter / 50) * 50;
      detail = `Perekaman browser selesai; foto wajah ${args.wajahFotoByte} B, video wajah ${args.wajahVideoByte} B, foto lingkungan ${args.lingkunganFotoByte} B, video lingkungan ${args.lingkunganVideoByte} B. Media tidak diunggah; koordinat tidak dicatat.${akurasiBulat === null ? "" : ` Akurasi GPS dibulatkan: ±${akurasiBulat} m.`}`;
    } else {
      if (args.kodeGagal === undefined) {
        throw new Error("Kode kegagalan verifikasi wajib diisi.");
      }
      detail = `Verifikasi yang telah disetujui tidak selesai (${args.kodeGagal}). Tidak ada media yang diunggah.`;
    }

    await audit(
      ctx,
      userId,
      user.email ?? user.name ?? "Peminjam",
      "verifikasi_tagihan_browser",
      loan.nomorReferensi,
      detail,
    );
    return { ok: true as const };
  },
});

/** Simpan bukti pembayaran sebagai antrean rekonsiliasi; tidak menyentuh ledger. */
export const submitManualPaymentReceipt = mutation({
  args: {
    jenis: v.union(v.literal("pinjaman"), v.literal("kredit_barang"), v.literal("gadai")),
    loanId: v.optional(v.id("loans")),
    kreditId: v.optional(v.id("kreditBarang")),
    pawnId: v.optional(v.id("pawns")),
    /** Angsuran yang diklaim dibayar. Kosong = bukti lama tanpa jadwal. */
    angsuranId: v.optional(v.id("angsuran")),
    /** Jalur pembayaran tingkat pinjaman; kosong = bukti angsuran biasa. */
    paymentType: v.optional(
      v.union(
        v.literal("pelunasan_total"),
        v.literal("bunga_saja"),
        v.literal("cicil_pokok"),
      ),
    ),
    extensionDays: v.optional(v.number()),
    principalAmount: v.optional(v.number()),
    jumlah: v.number(),
    metodePembayaran: v.union(v.literal("qris"), v.literal("transfer")),
    tanggalTransfer: v.number(),
    referensiTransfer: v.string(),
    buktiPembayaranId: v.id("_storage"),
  },
  returns: v.object({ nomorReferensi: v.string() }),
  handler: async (ctx, args) => {
    await requireBukanPratinjau(ctx);
    const { userId, user } = await requirePeminjam(ctx);
    if (!Number.isSafeInteger(args.jumlah) || args.jumlah <= 0 || args.jumlah > MAX_POKOK) {
      throw new Error("Jumlah pembayaran harus rupiah bulat positif dan tidak melebihi batas sistem.");
    }
    if (!Number.isSafeInteger(args.tanggalTransfer) || args.tanggalTransfer > Date.now() + 5 * 60_000) {
      throw new Error("Tanggal transfer tidak valid.");
    }
    const reference = args.referensiTransfer.trim();
    if (reference.length < 4 || reference.length > 120) {
      throw new Error("Referensi pembayaran wajib 4–120 karakter.");
    }
    const targets = [args.loanId, args.kreditId, args.pawnId].filter((target) => target !== undefined);
    if (targets.length !== 1 ||
      (args.jenis === "pinjaman" && (!args.loanId || args.kreditId || args.pawnId)) ||
      (args.jenis === "kredit_barang" && (!args.kreditId || args.loanId || args.pawnId)) ||
      (args.jenis === "gadai" && (!args.pawnId || args.loanId || args.kreditId))) {
      throw new Error("Pilih tepat satu catatan pembayaran dengan jenis yang sesuai.");
    }
    if (args.paymentType !== undefined && args.angsuranId !== undefined) {
      throw new Error("Pilih satu jalur: angsuran atau pembayaran tingkat pinjaman.");
    }
    let rencana: RencanaPembayaranPinjaman | undefined;
    let angsuran: Doc<"angsuran"> | null = null;
    if (args.angsuranId !== undefined) {
      if (args.jenis !== "pinjaman" || args.loanId === undefined) {
        throw new Error("Angsuran hanya boleh dipakai untuk bukti pinjaman.");
      }
      const antreanPinjaman = await ctx.db
        .query("manualPaymentReceipts")
        .withIndex("by_loan", (q) => q.eq("loanId", args.loanId))
        .collect();
      if (
        antreanPinjaman.some(
          (r) => r.status === "menunggu_pencocokan" && r.paymentType !== undefined,
        )
      ) {
        throw new Error("Masih ada pembayaran pinjaman yang menunggu pencocokan.");
      }
      angsuran = await ctx.db.get(args.angsuranId);
      if (
        angsuran === null ||
        angsuran.userId !== userId ||
        angsuran.loanId !== args.loanId
      ) {
        throw new Error("Angsuran milik pinjaman Anda tidak ditemukan.");
      }
      if (angsuran.status !== "belum_dibayar") {
        throw new Error("Angsuran ini sudah menunggu verifikasi atau lunas.");
      }
      const tarif = await tarifDendaBerlaku(ctx);
      const denda = dendaAngsuran(
        angsuran.pokok,
        angsuran.jatuhTempoPada,
        args.tanggalTransfer,
        tarif,
      );
      const seharusnya = angsuran.total + denda;
      if (args.jumlah !== seharusnya) {
        throw new Error(
          `Nominal bukti harus ${formatRupiah(seharusnya)} (angsuran ${formatRupiah(angsuran.total)} + denda ${formatRupiah(denda)}).`,
        );
      }
    }
    if (args.jenis === "pinjaman") {
      const loan = args.loanId ? await ctx.db.get(args.loanId) : null;
      if (!loan || loan.userId !== userId || loan.status !== "didanai") throw new Error("Pinjaman aktif milik Anda tidak ditemukan.");
      if (args.paymentType !== undefined) {
        if (loan.tenorBulan !== undefined) {
          throw new Error("Pembayaran bunga/cicil pokok hanya tersedia untuk pinjaman harian.");
        }
        const menunggu = await ctx.db
          .query("manualPaymentReceipts")
          .withIndex("by_loan", (q) => q.eq("loanId", loan._id))
          .collect();
        if (
          menunggu.some(
            (r) =>
              r.status === "menunggu_pencocokan" && r.paymentType !== undefined,
          )
        ) {
          throw new Error("Masih ada pembayaran pinjaman yang menunggu pencocokan.");
        }
        const jadwalBerjalan = await ctx.db
          .query("angsuran")
          .withIndex("by_loan", (q) => q.eq("loanId", loan._id))
          .collect();
        if (jadwalBerjalan.some((row) => row.status === "menunggu_verifikasi")) {
          throw new Error(
            "Masih ada bukti angsuran yang menunggu pencocokan. Selesaikan dulu sebelum mengubah pokok atau jatuh tempo.",
          );
        }
        rencana = hitungRencanaPembayaran({
          loan,
          mode: args.paymentType,
          extensionDays: args.extensionDays,
          principalPaid: args.principalAmount ?? 0,
          waktuTransaksi: args.tanggalTransfer,
          tarifDendaPerHari: await tarifDendaBerlaku(ctx),
        });
        if (args.jumlah !== rencana.totalDue) {
          throw new Error(
            `Nominal bukti harus ${formatRupiah(rencana.totalDue)} sesuai rencana pembayaran.`,
          );
        }
      }
    } else if (args.jenis === "kredit_barang") {
      const kredit = args.kreditId ? await ctx.db.get(args.kreditId) : null;
      if (!kredit || kredit.userId !== userId || kredit.status !== "didanai") throw new Error("Kredit barang aktif milik Anda tidak ditemukan.");
    } else {
      const pawn = args.pawnId ? await ctx.db.get(args.pawnId) : null;
      if (!pawn || pawn.userId !== userId || pawn.status !== "aktif" || (pawn.sisaPokok ?? 0) <= 0) throw new Error("Gadai aktif milik Anda tidak ditemukan.");
    }
    if (args.metodePembayaran === "qris") {
      const config = await getConfig(ctx);
      if (!config.qrisImageId || !(await ctx.storage.getUrl(config.qrisImageId))) {
        throw new Error("QRIS belum tersedia; pilih transfer atau hubungi admin.");
      }
    }
    const metadata = await ctx.storage.getMetadata(args.buktiPembayaranId);
    if (!metadata || metadata.size > 5_000_000 ||
      !["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(metadata.contentType ?? "")) {
      throw new Error("Bukti harus berupa JPG, PNG, WebP, atau PDF maksimal 5 MB.");
    }
    const nomorReferensi = referenceNumber(Date.now());
    const receiptId = await ctx.db.insert("manualPaymentReceipts", {
      userId,
      jenis: args.jenis,
      loanId: args.loanId,
      kreditId: args.kreditId,
      pawnId: args.pawnId,
      angsuranId: args.angsuranId,
      ...(args.paymentType === undefined || rencana === undefined
        ? {}
        : {
            paymentType: args.paymentType,
            extensionDays: args.extensionDays,
            principalAmount: args.principalAmount,
            rencana,
          }),
      jumlah: args.jumlah,
      metodePembayaran: args.metodePembayaran,
      tanggalTransfer: args.tanggalTransfer,
      referensiTransfer: reference,
      buktiPembayaranId: args.buktiPembayaranId,
      status: "menunggu_pencocokan",
      nomorReferensi,
    });
    if (angsuran !== null) {
      await ctx.db.patch(angsuran._id, {
        status: "menunggu_verifikasi",
        receiptId,
        buktiPembayaranId: args.buktiPembayaranId,
      });
      await audit(
        ctx,
        userId,
        user.email ?? user.name ?? "peminjam",
        "angsuran_bukti_dikirim",
        angsuran._id,
        `Bukti ${nomorReferensi} untuk angsuran ${angsuran.nomor} pinjaman ${args.loanId}.`,
      );
    }
    return { nomorReferensi };
  },
});

/** Riwayat bukti unggahan milik sendiri; statusnya tidak menyelesaikan pembayaran. */
export const myManualPaymentReceipts = query({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requirePeminjam(ctx);
    const rows = await ctx.db.query("manualPaymentReceipts")
      .withIndex("by_user", (q) => q.eq("userId", userId)).collect();
    return rows.sort((a, b) => b._creationTime - a._creationTime).map((row) => ({
      _id: row._id,
      nomorReferensi: row.nomorReferensi,
      jenis: row.jenis,
      jumlah: row.jumlah,
      metodePembayaran: row.metodePembayaran,
      loanId: row.loanId ?? null,
      kreditId: row.kreditId ?? null,
      pawnId: row.pawnId ?? null,
      angsuranId: row.angsuranId ?? null,
      paymentType: row.paymentType ?? null,
      status: row.status,
      catatanAdmin: row.catatanAdmin ?? null,
      referensiMutasi: row.referensiMutasi ?? null,
      dibuatPada: row._creationTime,
    }));
  },
});

/** API status review bukti untuk pencocokan admin, tanpa informasi sensitif. */
export const statusManualPaymentReceipts = query({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requirePeminjam(ctx);
    const rows = await ctx.db.query("manualPaymentReceipts")
      .withIndex("by_user", (q) => q.eq("userId", userId)).collect();
    return rows.sort((a, b) => b._creationTime - a._creationTime).map((row) => ({
      _id: row._id,
      status: row.status,
      catatanAdmin: row.catatanAdmin ?? null,
    }));
  },
});

export const createLoanApplication = mutation({
  args: {
    pokokPinjaman: v.number(),
    /**
     * Voucher milik peminjam yang dipakai untuk pengajuan ini. Server memeriksa
     * kepemilikan, masa berlaku, kuota, dan minimal pengajuan; klien hanya
     * mengirim pilihan.
     */
    voucherId: v.optional(v.id("voucher")),
    tujuan: v.string(),
    namaLengkap: v.string(),
    namaBank: v.string(),
    nomorRekening: v.string(),
    catatanPeminjam: v.optional(v.string()),
    /**
     * Cadangan tanda tangan (data URL PNG). Sumber utamanya adalah tanda tangan
     * yang tersimpan di KYC (`kycProfil.tandaTangan`); formulir nasabah tidak
     * lagi mengirim argumen ini. Dipertahankan supaya pemanggil lama (dan tes
     * lama) tetap berjalan, tetapi gambar KYC selalu didahulukan.
     */
    tandaTangan: v.optional(v.string()),
    /**
     * Persetujuan Syarat & Ketentuan saat MENGIRIM pengajuan — WAJIB `true`.
     * Server mencatat waktunya beserta `CONTRACT_TERMS_VERSION` yang berlaku,
     * supaya persetujuan peminjam punya jejak audit (bukan hanya di UI).
     */
    persetujuanSyarat: v.literal(true),
    /**
     * Tenor pinjaman dalam hari (skema 1 jt / 28 hari) — divalidasi server
     * terhadap opsi resmi. Diabaikan bila `tenorBulan` disertakan.
     */
    tenorHari: v.number(),
    /**
     * Centang "cair ekspres" dari peminjam. `false` = pencairan biasa tanpa
     * biaya ekspres. Kosong diperlakukan sebagai ekspres (perilaku lama).
     */
    cairEkspres: v.optional(v.boolean()),
    /**
     * Tenor bulanan (DP 0%, potongan di muka 2% — biaya admin 2% untuk tenor
     * 3/6, biaya layanan 2% untuk tenor 1, biaya platform dihapus; bunga flat
     * dari pokok penuh mengikuti tarif akun, bawaan 30%/20%/12% per bulan untuk
     * tenor 1/3/6 bulan; biaya admin
     * cicilan 2% pada setiap pembayaran) — pinjaman DI LUAR plafon 1 jt / 28
     * hari. Bila diisi, `tenorHari` diabaikan.
     */
    tenorBulan: v.optional(v.number()),
    // ===== KYC wajib =====
    nik: v.string(),
    nomorWhatsApp: v.string(),
    penghasilanBulanan: v.number(),
    sumberPenghasilan: v.string(),
    dokKtpId: v.id("_storage"),
    dokSelfieKtpId: v.id("_storage"),
    dokSlipGajiId: v.id("_storage"),
    /** Lokasi real (GPS device) saat pengajuan — wajib, bukan input manual. */
    lokasiAjukan: v.object({
      lat: v.number(),
      lng: v.number(),
      akurasi: v.number(),
      waktu: v.number(),
    }),
    /**
     * Jejak anti-pengiriman-palsu dari formulir, diperiksa `gerbangPengajuan`
     * sebelum pekerjaan mahal apa pun. Kolom jebakan yang TERISI adalah tanda
     * pengisi otomatis; `formDibukaPada` adalah cap waktu formulir dibuka, dan
     * kiriman di bawah dua detik setelahnya ditolak. Keduanya opsional supaya
     * pemanggil lama tidak pecah, dan ketiadaannya ditahan pembatas laju per
     * akun di server.
     */
    jebakan: v.optional(v.string()),
    formDibukaPada: v.optional(v.number()),
    /**
     * Kunci idempotensi opsional — pengiriman ulang karena jaringan dengan
     * kunci yang sama mengembalikan pengajuan yang SAMA, bukan yang kedua.
     */
    kunciIdempotensi: kunciIdempotensiValidator,
  },
  returns: v.object({ appId: v.id("loans"), nomorReferensi: v.string() }),
  handler: async (ctx, args) => {
    await requireBukanPratinjau(ctx);
    const { userId, user } = await requirePeminjam(ctx);
    // Gerbang KYC wajib: pengajuan finansial hanya dilayani bila modul KYC
    // nasabah sudah VERIFIED (diperiksa server, bukan dari klien).
    // Pengiriman ulang (retry jaringan / tombol ganda) tidak boleh melahirkan
    // pengajuan kedua: kunci yang sama mengembalikan hasil yang sama.
    const hasilLama = await ambilHasilIdempoten<{
      appId: Id<"loans">;
      nomorReferensi: string;
    }>(ctx, userId, args.kunciIdempotensi, "pinjaman.create");
    if (hasilLama !== null) return hasilLama;
    // Gerbang anti-pengiriman-palsu dijalankan sebelum gerbang KYC (yang mahal):
    // kiriman robot dan pengiriman bertubi-tubi ditolak paling awal, dan setiap
    // penolakan tercatat di auditLog sebagai pelanggaran gerbang.
    await gerbangPengajuan(ctx, {
      userId,
      jebakan: args.jebakan,
      formDibukaPada: args.formDibukaPada,
    });
    await requireKycTerverifikasi(ctx, userId);
    // Gerbang lokasi: titik GPS segar wajib ada di server, dan koordinat yang
    // dikirim bersama pengajuan harus cocok dengan lokasi perangkat tercatat.
    await requireGerbangLokasi(ctx, userId, user, args.lokasiAjukan);
    // Kill switch: blokir seluruh pengajuan baru saat darurat.
    const sys = await getConfig(ctx);
    if (sys.killSwitch) {
      throw new Error(
        "Pengajuan sementara dihentikan oleh sistem (kill switch aktif). Coba lagi nanti.",
      );
    }
    // Sakelar produk: admin bisa menutup pinjaman tunai tanpa mematikan
    // gadai/kredit. Diperiksa di server supaya formulir lama yang masih terbuka
    // tidak bisa mengirim pengajuan.
    if (!sys.produkPinjamanAktif) {
      throw new Error(
        "Pengajuan pinjaman tunai sedang ditutup. Pilih gadai atau kredit barang, atau coba lagi nanti.",
      );
    }
    // Batas pinjaman tunai: Rp 100.000 s.d. PLAFON NASABAH (default global
    // 1 juta, admin bisa naikkan/turunkan per orang — lib/plafon.ts).
    // Skema bulanan (tenorBulan diisi) memakai mesin yang sama dengan plafon
    // yang sama; plafon hanya memotong sisi atas pokok.
    // Plafon MASTER nasabah (maksimal) + riwayat pinjaman → plafon TERSEDIA.
    // Pinjaman aktif/terutang mengurangi jatah pengajuan berikutnya, dan
    // perhitungannya dilakukan di server — bukan dipercaya dari frontend.
    const plafon = await plafonPeminjam(ctx, userId);
    const pinjamanNasabah = await ctx.db
      .query("loans")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    // Akad syariah aktif dan pengajuan syariah yang sudah disetujui ikut
    // menahan plafon: satu limit untuk semua jalur.
    const eksposurSyariahNasabah = await eksposurSyariah(ctx, userId);
    const ringkas = ringkasPlafon(plafon, [
      ...pinjamanNasabah,
      ...eksposurSyariahNasabah,
    ]);
    // Voucher dipilih SEBELUM batas diperiksa: boost menambah batas pengajuan
    // ini saja, dan voucher potongan tidak menambah batas sama sekali.
    const voucherTerpilih =
      args.voucherId === undefined
        ? null
        : await voucherUntukPengajuan(ctx, {
            userId,
            voucherId: args.voucherId,
            tersedia: ringkas.tersedia,
            skema: args.tenorBulan === undefined ? "harian" : "bulanan",
          });
    const batasVoucher = (ringkas.tersedia + (voucherTerpilih?.boost ?? 0)) as Rupiah;
    if (!pokokDalamPlafon(args.pokokPinjaman, batasVoucher)) {
      // Ada utang berjalan → sebut maksimal/terpakai/tersedia; belum ada utang
      // → pesan sederhana (perilaku lama, dipakai tes perbatasan).
      throw new Error(
        ringkas.terpakai > 0
          ? pesanPlafonTersediaTerlampaui({
              ...ringkas,
              tersedia: batasVoucher,
            })
          : pesanPlafonTerlampaui(ringkas.maksimal),
      );
    }
    // Tarif bulanan dibaca SEKALI di sini dari Pengaturan Parameter Bisnis,
    // dipakai menghitung, lalu dibekukan pada pinjaman. Pinjaman yang sudah
    // terbit tidak berubah walau admin mengubah tarif kemudian.
    const tarifBulanan = tarifBulananDariConfig(sys);
    let tenorBulanSim: number | undefined;
    if (args.tenorBulan !== undefined) {
      if (!(TENOR_BULANAN_OPTIONS as readonly number[]).includes(args.tenorBulan)) {
        throw new Error(
          `Tenor bulanan harus salah satu dari ${TENOR_BULANAN_OPTIONS.join(" / ")} bulan.`,
        );
      }
      assertSimulasiBulananValid(args.pokokPinjaman, args.tenorBulan, {
        tarif: tarifBulanan,
      });
      tenorBulanSim = args.tenorBulan;
    } else {
      // Batas atas = plafon TERSEDIA nasabah, bukan batas produk Rp1 juta:
      // plafon khusus dari admin membuka pokok harian yang lebih besar.
      assertPokokPinjamanValid(args.pokokPinjaman, batasVoucher);
    }
    // Server-side pricing engine — fee fields are never accepted from the client.
    // Satu-satunya pilihan klien yang memengaruhi potongan adalah centang
    // ekspres; nominal biayanya tetap dihitung server.
    const cairEkspres = args.cairEkspres ?? true;
    // Tarif potongan di muka dibaca dari Pengaturan Parameter Bisnis dan
    // dibekukan pada pinjaman ini, jadi perubahan tarif admin berikutnya tidak
    // mengubah kontrak yang sudah terbit.
    const tarifBiaya = tarifBiayaDariAngka({
      adminPersen: sys.persenBiayaAdmin,
      asuransiPersen: sys.persenAsuransi,
      ekspres1: sys.biayaEkspresTier1,
      ekspres2: sys.biayaEkspresTier2,
      ekspres3: sys.biayaEkspresTier3,
    });
    // Quote dihitung dua kali hanya bila voucher potongan ada: yang pertama
    // memberi biaya admin (dasar batas potongan), yang kedua memakai potongan
    // itu. Tanpa voucher tetap satu perhitungan.
    const quoteAwal = quoteLoan(args.pokokPinjaman, { ekspres: cairEkspres, tarif: tarifBiaya });
    const diskonVoucher = hitungDiskonVoucher(
      voucherTerpilih?.voucher ?? null,
      quoteAwal.biayaAdmin,
    );
    const quote =
      diskonVoucher > 0
        ? quoteLoan(args.pokokPinjaman, {
            ekspres: cairEkspres,
            tarif: tarifBiaya,
            diskonAdmin: diskonVoucher,
          })
        : quoteAwal;
    // Matriks tenor harian ditegakkan di server, bukan hanya disembunyikan di
    // UI: tenor resmi 7/14/28 hari, dan tarif mengikuti tier nominal (26–40%).
    // Tenor di luar daftar itu—termasuk 30 hari—ditolak.
    let persenBungaSimpanan: number;
    if (tenorBulanSim === undefined) {
      const pesanTenor = validasiTenorHarian(
        args.pokokPinjaman,
        args.tenorHari,
        batasVoucher,
      );
      if (pesanTenor !== null) throw new Error(pesanTenor);
      // Bunga pinjaman harian SELALU dari matriks tenor/nominal — bukan angka
      // global 30% dan bukan override akun. Tarif mengikuti tenor 7/14/28 hari
      // yang dipilih nasabah, persis seperti yang tertulis di halaman biaya.
      persenBungaSimpanan =
        persenBungaHarian(args.pokokPinjaman, args.tenorHari) ?? PINDAI_PRICING.bungaPercent;
    } else {
      // Skema bulanan: bunga per bulan mengikuti tenor dan tarif yang berlaku
      // (bawaan 30/20/12% per bulan, marjin total 30/60/72%), sama dengan tabel
      // di halaman ketentuan.
      persenBungaSimpanan = persenBungaPerBulan(tenorBulanSim, tarifBulanan);
    }

    // ===== Promo bunga (harian saja) =====
    // Promo menurunkan BUNGA, bukan biaya admin, dan hanya berlaku pada skema
    // harian: tarif bulanan sudah punya tabel tenor sendiri di Pengaturan.
    // Bunga normal disimpan terpisah supaya rincian/kontrak bisa menyebut
    // potongannya. Promo tidak pernah menaikkan bunga (dijaga `bungaSetelahPromo`).
    const promoDipakai =
      tenorBulanSim === undefined
        ? await promoBungaUntukPengajuan(ctx, {
            tenor: args.tenorHari,
            sekarang: Date.now(),
          })
        : null;
    const persenBungaNormal = persenBungaSimpanan;
    if (promoDipakai !== null) {
      persenBungaSimpanan = bungaSetelahPromo(persenBungaNormal, promoDipakai);
    }

    // ===== Voucher potongan bunga & tambah tenor (khusus harian) =====
    // Potongan bunga memakai poin persen, bukan rupiah. Ia diterapkan SETELAH
    // promo dan tidak boleh membuat bunga negatif. Tarif sebelum potongan
    // disimpan sebagai `promoBungaPersenNormal` supaya hak penyedia dana tetap
    // dihitung dari tarif penuh — promo dan voucher adalah subsidi platform,
    // bukan pengurang Imbal Hasil pendana.
    const voucherDipakai = voucherTerpilih?.voucher ?? null;
    const potonganBungaVoucher =
      voucherDipakai?.jenis === "diskon_bunga" ? voucherDipakai.nilai : 0;
    const tambahanTenorVoucher =
      voucherDipakai?.jenis === "tambah_tenor" ? voucherDipakai.nilai : 0;
    if (potonganBungaVoucher > 0) {
      persenBungaSimpanan = Math.max(0, persenBungaSimpanan - potonganBungaVoucher);
    }

    // Nama peminjam selalu disimpan UPPERCASE agar konsisten di dashboard.
    const trimmedName = args.namaLengkap.trim().toUpperCase();
    const namaBank = args.namaBank.trim();
    const trimmedAccount = args.nomorRekening.trim().replace(/\s+/g, "");
    if (trimmedName.length < 3) {
      throw new Error("Nama lengkap wajib diisi (minimal 3 karakter).");
    }
    if (namaBank.length < 2 || namaBank.length > 60) {
      throw new Error("Nama bank atau e-wallet tujuan harus 2–60 karakter.");
    }
    if (!/^\d{6,20}$/.test(trimmedAccount)) {
      throw new Error("Nomor rekening/akun e-wallet harus 6–20 digit angka.");
    }
    if (args.tujuan.trim().length === 0) {
      throw new Error("Pilih keperluan pinjaman.");
    }

    // ===== Validasi KYC =====
    const nik = args.nik.replace(/\s+/g, "");
    if (!/^\d{16}$/.test(nik)) {
      throw new Error("NIK harus 16 digit angka sesuai KTP.");
    }
    const wa = args.nomorWhatsApp.replace(/[\s+-]/g, "");
    if (!/^62\d{8,13}$/.test(wa)) {
      throw new Error(
        "Nomor WhatsApp wajib format internasional 62… (mis. 6281234567890).",
      );
    }
    if (
      !Number.isInteger(args.penghasilanBulanan) ||
      args.penghasilanBulanan <= 0
    ) {
      throw new Error("Penghasilan bulanan harus rupiah bulat yang valid.");
    }
    if (args.sumberPenghasilan.trim().length < 3) {
      throw new Error("Isi sumber penghasilan (mis. gaji, usaha).");
    }
    // Dokumen wajib ada di storage DAN benar-benar berupa gambar ukuran wajar.
    // Batas ukuran/jenis yang hanya diperiksa di form bisa dilewati dengan
    // mengirim langsung ke URL unggah, jadi aturannya ditegakkan di sini.
    // Fungsi ini melempar pesan siap tampil bila berkas tidak lolos.
    for (const [label, id] of [
      ["Foto KTP", args.dokKtpId],
      ["Selfie dengan KTP", args.dokSelfieKtpId],
      ["Slip gaji / bukti penghasilan", args.dokSlipGajiId],
    ] as const) {
      await periksaBerkasIdentitasStorage(ctx, label, id);
    }
    // Lokasi real wajib: bukan (0,0), koordinat valid, dan segar (≤10 menit).
    const lok = args.lokasiAjukan;
    const lokValid =
      lok.lat !== 0 &&
      lok.lng !== 0 &&
      Math.abs(lok.lat) <= 90 &&
      Math.abs(lok.lng) <= 180 &&
      Date.now() - lok.waktu < 10 * 60 * 1000;
    if (!lokValid) {
      throw new Error(
        "Izinkan akses lokasi perangkat — pengajuan wajib menyertakan posisi real Anda.",
      );
    }

    // Tanda tangan digital — WAJIB, dan diambil dari KYC: nasabah membubuhkan
    // tanda tangannya SEKALI di modul KYC, lalu gambar itu dipakai untuk setiap
    // pengajuan pinjaman. Salinannya tetap disimpan pada pinjaman ini supaya
    // perjanjian yang sudah terbit tidak berubah saat tanda tangan diperbarui.
    const kycRow = await ctx.db
      .query("kycProfil")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    const tandaTangan = kycRow?.tandaTangan ?? args.tandaTangan;
    if (tandaTangan === undefined || tandaTangan === "") {
      throw new Error(
        "Tanda tangan belum tercatat di KYC. Buka halaman Verifikasi KYC, bubuhkan tanda tangan sekali, lalu kirim pengajuan ini lagi.",
      );
    }
    if (!tandaTangan.startsWith("data:image/png;base64,")) {
      throw new Error("Tanda tangan wajib: format gambar tanda tangan tidak valid.");
    }
    if (tandaTangan.length > 200_000) {
      throw new Error("Data tanda tangan terlalu besar.");
    }

    if (user.role === undefined || user.role === ROLES.DANA) {
      await ctx.db.patch(userId, { role: ROLES.PEMINJAM });
    }
    await ensureKodePeminjam(ctx, userId);

    // Pengajuan diikat ke MASTER KYC nasabah (`kycRow` sudah dibaca di atas):
    // yang disimpan hanya REFERENSI + snapshot status — dokumen KTP/selfie tetap
    // satu tempat di kycProfil, tidak dibaca ulang dari setiap pengajuan.
    const now = Date.now();
    const nomorReferensi = referenceNumber(now);
    const loanId = await ctx.db.insert("loans", {
      userId,
      // Relasi eksplisit LoanApplication → Borrower/Nasabah.
      nasabahUserId: userId,
      kycProfilId: kycRow?._id,
      kycStatusSaatPengajuan: kycRow?.status ?? "NOT_STARTED",
      // Pokok yang disetujui = pengajuan sampai admin memutuskan lain; angka
      // aslinya tetap tersimpan di `pokokDiajukan` untuk jejak pengajuan.
      pokokPinjaman: quote.pokok,
      pokokDiajukan: quote.pokok,
      tujuan: args.tujuan.trim(),
      catatanPeminjam: args.catatanPeminjam?.trim() || undefined,
      namaLengkap: trimmedName,
      namaBank,
      nomorRekening: trimmedAccount,
      status: "diajukan",
      nomorReferensi,
      // Voucher tambah tenor memperpanjang jatuh tempo tanpa menaikkan tarif:
      // bunga di atas sudah dihitung dari tenor dasar pilihan nasabah.
      tenorHari: args.tenorHari + tambahanTenorVoucher,
      // Hanya skema harian yang punya biaya ekspres; skema bulanan memakai
      // potongan 2% tetap, jadi pilihan ini tidak disimpan di sana.
      cairEkspres: tenorBulanSim === undefined ? cairEkspres : undefined,
      tarifBiaya: tenorBulanSim === undefined ? tarifBiaya : undefined,
      tenorBulan: tenorBulanSim,
      // Snapshot bunga efektif nasabah/matriks — angka pinjaman ini stabil
      // setelahnya. Untuk tenor harian, nilai ini sudah dihitung dari matriks
      // di atas; untuk bulanan tetap memakai tarif akun per bulan.
      persenBunga: persenBungaSimpanan,
      // Snapshot tarif sebelum promo/voucher: hanya bila benar-benar ada
      // potongan. Pinjaman yang tersimpan tetap utuh walau promo dimatikan
      // atau voucher dicabut kemudian.
      ...(persenBungaSimpanan < persenBungaNormal
        ? {
            ...(promoDipakai !== null
              ? {
                  promoBungaId: promoDipakai._id,
                  promoBungaNama: promoDipakai.nama,
                  // Dibekukan terpisah: laporan subsidi promo memakai angka
                  // promo ini, bukan tarif akhir setelah voucher bunga.
                  promoBungaPersen: promoDipakai.persenBunga,
                }
              : {}),
            promoBungaPersenNormal: persenBungaNormal,
          }
        : {}),
      // Snapshot TARIF bulanan lengkap: jadwal, kontrak, dan bagi hasil pinjaman
      // ini dihitung ulang dari angka ini, bukan dari konfigurasi hari ini.
      tarifBulanan: tenorBulanSim === undefined ? undefined : tarifBulanan,
      nik,
      nomorWhatsApp: wa,
      penghasilanBulanan: args.penghasilanBulanan,
      sumberPenghasilan: args.sumberPenghasilan.trim(),
      dokKtpId: args.dokKtpId,
      dokSelfieKtpId: args.dokSelfieKtpId,
      dokSlipGajiId: args.dokSlipGajiId,
      lokasiAjukan: { ...lok, waktu: now },
      tandaTanganPeminjam: tandaTangan,
      tandaTanganPada: now,
      persetujuanPengajuanPada: now,
      persetujuanPengajuanVersi: CONTRACT_TERMS_VERSION,
      // Snapshot voucher: potongan dan boost dibekukan pada pinjaman ini.
      ...(voucherTerpilih !== null
        ? {
            voucherId: voucherTerpilih.voucher!._id,
            voucherKode: voucherTerpilih.voucher!.kode,
            voucherDiskon: diskonVoucher,
            voucherBoost: voucherTerpilih.boost,
            ...(potonganBungaVoucher > 0
              ? { voucherDiskonBunga: potonganBungaVoucher }
              : {}),
            ...(tambahanTenorVoucher > 0
              ? { voucherTambahTenor: tambahanTenorVoucher }
              : {}),
          }
        : {}),
    });
    if (voucherTerpilih !== null) {
      await tandaiVoucherTerpakai(ctx, {
        voucher: voucherTerpilih.voucher!,
        loanId,
        sekarang: now,
      });
    }
    await audit(
      ctx,
      userId,
      user.email ?? user.name ?? "peminjam",
      "persetujuan_pengajuan",
      nomorReferensi,
      `Peminjam menyetujui Syarat & Ketentuan ${CONTRACT_TERMS_VERSION} saat mengirim pengajuan.`,
    );
    const hasil = { appId: loanId, nomorReferensi };
    await simpanHasilIdempoten(ctx, userId, args.kunciIdempotensi, "pinjaman.create", hasil);
    return hasil;
  },
});

/**
 * Turunan pelunasan live untuk satu pinjaman didanai: jatuh tempo, sisa hari,
 * hari terlambat, denda, dan total kewajiban saat ini — satu sumber kebenaran
 * dari lib/loan.ts (skema harian pokok + bunga dan skema bulanan).
 */
const pelunasanInfo = pelunasanPinjaman;

/** Daftar pinjaman milik Peminjam — hanya miliknya. */

export const listMyLoans = query({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requirePeminjam(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return loans
      .sort((a, b) => b._creationTime - a._creationTime)
      .map((l) => ({
        _id: l._id,
        _creationTime: l._creationTime,
        nomorReferensi: l.nomorReferensi,
        pokokPinjaman: l.pokokPinjaman,
        // Nominal asli pengajuan — peminjam melihat bahwa persetujuannya sebagian.
        pokokDiajukan: l.pokokDiajukan ?? l.pokokPinjaman,
        tujuan: l.tujuan,
        status: l.status,
        catatanReview: l.catatanReview,
        tenorBulan: l.tenorBulan ?? null,
      }));
  },
});

/** Detail progres plafon tunai dari riwayat pinjaman milik sendiri. */
export const myLoanCreditHistory = query({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requirePeminjam(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const qualified = loans
      .filter(apakahPelunasanTepatWaktu)
      .sort((a, b) => (b.lunasPada ?? 0) - (a.lunasPada ?? 0));

    return {
      plafonEfektif: await plafonPeminjam(ctx, userId),
      jumlahPelunasanTepatWaktu: qualified.length,
      riwayat: qualified.map((loan) => ({
        nomorReferensi: loan.nomorReferensi,
        pokokPinjaman: loan.pokokPinjaman,
        lunasPada: loan.lunasPada ?? null,
      })),
    };
  },
});

/**
 * Kuitansi pembayaran yang SUDAH dicocokkan admin untuk satu pinjaman.
 *
 * Hanya bukti tingkat pinjaman (pelunasan/roll-over/cicil pokok) yang
 * dikembalikan: inilah transaksi yang punya rincian pokok, bunga, denda, dan
 * sisa kewajiban. Hanya pemilik pinjaman yang dapat membacanya.
 */
export const myLoanReceipts = query({
  args: { loanId: v.id("loans") },
  handler: async (ctx, args) => {
    const { userId } = await requirePeminjam(ctx);
    const loan = await ctx.db.get(args.loanId);
    if (loan === null || loan.userId !== userId) return [];
    const rows = await ctx.db
      .query("manualPaymentReceipts")
      .withIndex("by_loan", (q) => q.eq("loanId", args.loanId))
      .collect();
    return rows
      .filter(
        (row) =>
          row.status === "dicocokkan" &&
          row.paymentType !== undefined &&
          row.rencana !== undefined,
      )
      .sort(
        (a, b) =>
          (b.dicocokkanPada ?? b.tanggalTransfer) -
          (a.dicocokkanPada ?? a.tanggalTransfer),
      )
      .map((row) => ({
        _id: row._id,
        nomorReferensi: row.nomorReferensi,
        paymentType: row.paymentType!,
        extensionDays: row.extensionDays ?? null,
        principalAmount: row.principalAmount ?? null,
        jumlah: row.jumlah,
        metodePembayaran: row.metodePembayaran,
        tanggalTransfer: row.tanggalTransfer,
        dicocokkanPada: row.dicocokkanPada ?? null,
        referensiMutasi: row.referensiMutasi ?? null,
        catatanAdmin: row.catatanAdmin ?? null,
        rencana: row.rencana!,
      }));
  },
});

/** Detail satu pinjaman milik sendiri, dengan quote turunannya. */
export const getMyLoan = query({
  args: { loanId: v.id("loans") },
  handler: async (ctx, args) => {
    const { userId } = await requirePeminjam(ctx);
    const loan = await ctx.db.get(args.loanId);
    if (loan === null || loan.userId !== userId) return null;
    const tarifDenda = await tarifDendaBerlaku(ctx);
    const pelunasan = pelunasanPinjaman(loan, Date.now(), tarifDenda);
    // Skema bulanan: kewajiban diturunkan dari mesin bulanan, bukan tarif dasar.
    const sim =
      loan.tenorBulan !== undefined
        ? simulasiBulananPinjaman({ ...loan, tenorBulan: loan.tenorBulan })
        : null;
    const pembayaranMenunggu = (
      await ctx.db
        .query("manualPaymentReceipts")
        .withIndex("by_loan", (q) => q.eq("loanId", loan._id))
        .collect()
    ).some(
      (r) => r.status === "menunggu_pencocokan" && r.paymentType !== undefined,
    );
    return {
      _id: loan._id,
      _creationTime: loan._creationTime,
      nomorReferensi: loan.nomorReferensi,
      pokokPinjaman: loan.pokokPinjaman,
      pokokDiajukan: loan.pokokDiajukan ?? loan.pokokPinjaman,
      tujuan: loan.tujuan,
      status: loan.status,
      catatanReview: loan.catatanReview,
      tenorHari: loan.tenorHari ?? null,
      tenorBulan: loan.tenorBulan ?? null,
      persenBunga: loan.persenBunga ?? null,
      simulasiBulanan: sim,
      quote: quotePinjaman(loan),
      imbalHasilTotal: sim !== null ? sim.bungaTotal : quotePinjaman(loan).bunga,
      totalKewajiban: sim !== null ? sim.totalPengembalian : quotePinjaman(loan).totalKewajibanPelunasan,
      pelunasan,
      sisaPokok: loan.remainingPrincipal ?? loan.pokokPinjaman,
      currentTierRate: loan.currentTierRate ?? loan.persenBunga ?? null,
      nextInterestAmount: loan.nextInterestAmount ?? null,
      nextDueDate: loan.nextDueDate ?? null,
      pembayaranMenunggu,
    };
  },
});

/** Ringkasan Peminjam — jujur: 0 saat belum ada data (Zero Fake Data). */
export const myLoanSummary = query({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requirePeminjam(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const disetujui = loans.filter(
      (l) => l.status === "disetujui" || l.status === "didanai",
    );
    return {
      totalAplikasi: loans.length,
      diajukan: loans.filter((l) => l.status === "diajukan").length,
      direview: loans.filter((l) => l.status === "sedang_direview").length,
      disetujui: disetujui.length,
      ditolak: loans.filter((l) => l.status === "ditolak").length,
      disetujuiRupiah: disetujui.reduce((acc, l) => acc + l.pokokPinjaman, 0),
    };
  },
});

/**
 * Daftar dokumen e-contract milik Peminjam sendiri: pinjaman yang sudah
 * memenuhi syarat perjanjian (disetujui ke atas) + akad gadai yang sudah
 * ditaksir. Hanya miliknya — tidak membocorkan data pengguna lain.
 */
export const myContracts = query({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requirePeminjam(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const pawns = await ctx.db
      .query("pawns")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return {
      pinjaman: loans
        .filter((l) => l.status !== "diajukan" && l.status !== "sedang_direview" && l.status !== "ditolak")
        .sort((a, b) => b._creationTime - a._creationTime)
        .map((l) => ({
          _id: l._id,
          nomorReferensi: l.nomorReferensi,
          pokokPinjaman: l.pokokPinjaman,
          tenorHari: l.tenorHari ?? DEFAULT_TENOR_HARI,
          tenorBulan: l.tenorBulan ?? null,
          persenBunga: l.persenBunga ?? null,
          cairEkspres: l.cairEkspres ?? null,
          tarifBiaya: l.tarifBiaya ?? null,
          status: l.status,
          tandaTanganAda: l.tandaTanganPeminjam !== undefined,
          tandaTanganDataUrl: l.tandaTanganPeminjam ?? null,
          tandaTanganPada: l.tandaTanganPada ?? null,
          persetujuanSyaratPada: l.persetujuanSyaratPada ?? null,
          persetujuanSyaratVersi: l.persetujuanSyaratVersi ?? null,
          createdAt: l._creationTime,
          nik: l.nik ?? null,
          namaLengkap: l.namaLengkap,
          namaBank: l.namaBank ?? null,
          nomorRekening: l.nomorRekening,
          lokasiAjukan: l.lokasiAjukan ?? null,
        })),
      gadai: pawns
        .filter((p) => p.nilaiTaksiran !== undefined && p.status !== "ditolak")
        .sort((a, b) => b._creationTime - a._creationTime)
        .map((p) => ({
          _id: p._id,
          nomorReferensi: p.nomorReferensi,
          deskripsiBarang: p.deskripsiBarang,
          kategori: p.kategori,
          status: p.status,
          nilaiTaksiran: p.nilaiTaksiran,
          createdAt: p._creationTime,
        })),
    };
  },
});

/**
 * Jadwal pelunasan milik Peminjam: setiap pinjaman didanai/lunas dengan
 * kewajiban live (jatuh tempo, denda, total) yang dihitung server-side.
 */
export const myLoanSchedule = query({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requirePeminjam(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const now = Date.now();
    const tarifDenda = await tarifDendaBerlaku(ctx);
    return loans
      .filter((l) => l.status === "didanai" || l.status === "lunas")
      .sort((a, b) => b._creationTime - a._creationTime)
      .map((l) => {
        const info = pelunasanInfo(l, now, tarifDenda);
        return {
          _id: l._id,
          nomorReferensi: l.nomorReferensi,
          pokokPinjaman: l.pokokPinjaman,
          status: l.status,
          tenorHari: l.tenorHari ?? DEFAULT_TENOR_HARI,
          tenorBulan: l.tenorBulan ?? null,
          didanaiPada: l.didanaiPada ?? null,
          persenBunga: l.persenBunga ?? null,
          remainingPrincipal: l.remainingPrincipal ?? null,
          currentTierRate: l.currentTierRate ?? null,
          nextDueDate: l.nextDueDate ?? null,
          nextInterestAmount: l.nextInterestAmount ?? null,
          simulasiBulanan:
            l.tenorBulan !== undefined
              ? simulasiBulananPinjaman({ ...l, tenorBulan: l.tenorBulan })
              : null,
          quote: quotePinjaman(l),
          imbalHasilTotal:
            l.tenorBulan !== undefined
              ? simulasiBulananPinjaman({ ...l, tenorBulan: l.tenorBulan }).bungaTotal
              : quotePinjaman(l).bunga,
          totalKewajiban:
            l.tenorBulan !== undefined
              ? simulasiBulananPinjaman({ ...l, tenorBulan: l.tenorBulan }).totalPengembalian
              : quotePinjaman(l).totalKewajibanPelunasan,
          pelunasan:
            info === null
              ? null
              : {
                  jatuhTempoPada: info.jatuhTempoPada,
                  sisaHari: info.sisaHari,
                  hariTerlambat: info.hariTerlambat,
                  dendaTerlambat: info.dendaTerlambat,
                  totalKewajibanDenganPenalti: info.totalKewajibanDenganPenalti,
                },
        };
      });
  },
});

/**
 * Ringkasan pengingat jatuh tempo untuk Peminjam: pinjaman didanai terdekat
 * (paling dekat jatuh tempo / paling terlambat). Jujur null saat tidak ada
 * pinjaman aktif (Zero Fake Data). Semua nilai dihitung server-side.
 */
export const dueReminder = query({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requirePeminjam(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    let worst: {
      loanId: Id<"loans">;
      nomorReferensi: string;
      jatuhTempoPada: number;
      sisaHari: number;
      hariTerlambat: number;
      dendaTerlambat: Rupiah;
      totalKewajibanDenganPenalti: Rupiah;
      totalKewajibanPelunasan: Rupiah;
    } | null = null;

    const tarifDenda = await tarifDendaBerlaku(ctx);
    for (const loan of loans) {
      if (loan.status !== "didanai") continue;
      const info = pelunasanInfo(loan, Date.now(), tarifDenda);
      if (info === null) continue;
      if (
        worst === null ||
        info.hariTerlambat > worst.hariTerlambat ||
        (info.hariTerlambat === 0 &&
          worst.hariTerlambat === 0 &&
          info.sisaHari < worst.sisaHari)
      ) {
        worst = {
          loanId: loan._id,
          nomorReferensi: loan.nomorReferensi,
          jatuhTempoPada: info.jatuhTempoPada,
          sisaHari: info.sisaHari,
          hariTerlambat: info.hariTerlambat,
          dendaTerlambat: info.dendaTerlambat,
          totalKewajibanDenganPenalti: info.totalKewajibanDenganPenalti,
          totalKewajibanPelunasan: info.totalKewajibanPelunasan,
        };
      }
    }
    return worst;
  },
});

// =====================================================================
// Gadai (collateral applications)
// =====================================================================

/** Ajukan penggadaian barang (Peminjam). Penilaian dilakukan oleh petugas. */
export const createPawnApplication = mutation({
  args: {
    deskripsiBarang: v.string(),
    kategori: v.string(),
    alamatPenilaian: v.string(),
    namaLengkap: v.string(),
    namaBank: v.string(),
    nomorRekening: v.string(),
    catatanPeminjam: v.optional(v.string()),
    /** Jejak anti-pengiriman-palsu; aturannya sama dengan `createLoanApplication`. */
    jebakan: v.optional(v.string()),
    formDibukaPada: v.optional(v.number()),
    /** Kunci idempotensi opsional — lihat `createLoanApplication`. */
    kunciIdempotensi: kunciIdempotensiValidator,
  },
  handler: async (ctx, args) => {
    await requireBukanPratinjau(ctx);
    const { userId, user } = await requirePeminjam(ctx);
    const hasilLama = await ambilHasilIdempoten<{ appId: Id<"pawns"> }>(
      ctx,
      userId,
      args.kunciIdempotensi,
      "gadai.create",
    );
    if (hasilLama !== null) return hasilLama;
    // Gerbang anti-pengiriman-palsu: sama seperti pengajuan pinjaman, dijalankan
    // sebelum gerbang KYC supaya kiriman robot ditolak paling awal.
    await gerbangPengajuan(ctx, {
      userId,
      jebakan: args.jebakan,
      formDibukaPada: args.formDibukaPada,
    });
    // Gerbang KYC wajib: pengajuan finansial hanya dilayani bila modul KYC
    // nasabah sudah VERIFIED (diperiksa server, bukan dari klien).
    await requireKycTerverifikasi(ctx, userId);
    // Gerbang lokasi: gadai juga hanya dilayani dengan GPS aktif & segar.
    await requireGerbangLokasi(ctx, userId, user);
    // Kill switch: blokir seluruh pengajuan baru saat darurat.
    const sys = await getConfig(ctx);
    if (sys.killSwitch) {
      throw new Error(
        "Pengajuan sementara dihentikan oleh sistem (kill switch aktif). Coba lagi nanti.",
      );
    }
    if (!sys.produkGadaiAktif) {
      throw new Error(
        "Pengajuan gadai sedang ditutup. Pilih pinjaman tunai atau kredit barang, atau coba lagi nanti.",
      );
    }

    const deskripsi = args.deskripsiBarang.trim();
    if (deskripsi.length < 10) {
      throw new Error(
        "Deskripsi barang wajib diisi (minimal 10 karakter) agar petugas dapat menilai.",
      );
    }
    if (!(COLLATERAL_CATEGORIES as readonly string[]).includes(args.kategori)) {
      throw new Error("Pilih kategori barang yang valid.");
    }
    const alamat = args.alamatPenilaian.trim();
    if (alamat.length < 10) {
      throw new Error(
        "Alamat lokasi barang wajib diisi (minimal 10 karakter) untuk penjadwalan pemeriksaan.",
      );
    }
    // Nama pemohon gadai selalu disimpan UPPERCASE agar konsisten di dashboard.
    const nama = args.namaLengkap.trim().toUpperCase();
    if (nama.length < 3) {
      throw new Error("Nama lengkap wajib diisi (minimal 3 karakter).");
    }
    const namaBank = args.namaBank.trim();
    if (namaBank.length < 2 || namaBank.length > 60) {
      throw new Error("Nama bank atau e-wallet tujuan harus 2–60 karakter.");
    }
    const rekening = args.nomorRekening.trim().replace(/\s+/g, "");
    if (!/^\d{6,20}$/.test(rekening)) {
      throw new Error("Nomor rekening/akun e-wallet harus 6–20 digit angka.");
    }

    if (user.role === undefined || user.role === ROLES.DANA) {
      await ctx.db.patch(userId, { role: ROLES.PEMINJAM });
    }

    await ensureKodePeminjam(ctx, userId);
    const pawnId = await ctx.db.insert("pawns", {
      userId,
      deskripsiBarang: deskripsi,
      kategori: args.kategori,
      alamatPenilaian: alamat,
      namaLengkap: nama,
      namaBank,
      nomorRekening: rekening,
      catatanPeminjam: args.catatanPeminjam?.trim() || undefined,
      status: "diajukan",
      nomorReferensi: referenceNumber(Date.now()),
    });
    const hasil = { appId: pawnId };
    await simpanHasilIdempoten(ctx, userId, args.kunciIdempotensi, "gadai.create", hasil);
    return hasil;
  },
});

/** Daftar pengajuan gadai milik Peminjam. */
export const listMyPawns = query({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requirePeminjam(ctx);
    const pawns = await ctx.db
      .query("pawns")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return pawns
      .sort((a, b) => b._creationTime - a._creationTime)
      .map((p) => ({
        _id: p._id,
        _creationTime: p._creationTime,
        nomorReferensi: p.nomorReferensi,
        deskripsiBarang: p.deskripsiBarang,
        kategori: p.kategori,
        status: p.status,
        nilaiTaksiran: p.nilaiTaksiran,
        catatanReview: p.catatanReview,
        // Skema B: kewajiban gadai (decreasing principal) — dipakai widget
        // tagihan sewa modal & cicil pokok di dashboard Peminjam.
        pokokGadai: p.pokokGadai,
        sisaPokok: p.sisaPokok,
        persenSewaModal: p.persenSewaModal,
      }));
  },
});

/** Detail satu pengajuan gadai milik sendiri. */
export const getMyPawn = query({
  args: { pawnId: v.id("pawns") },
  handler: async (ctx, args) => {
    const { userId } = await requirePeminjam(ctx);
    const pawn = await ctx.db.get(args.pawnId);
    if (pawn === null || pawn.userId !== userId) return null;
    return pawn;
  },
});

/** Ringkasan gadai — jujur: 0 saat belum ada data. */
export const myPawnSummary = query({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requirePeminjam(ctx);
    const pawns = await ctx.db
      .query("pawns")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return {
      totalGadai: pawns.length,
      dinilai: pawns.filter(
        (p) => p.status === "diajukan" || p.status === "sedang_dinilai",
      ).length,
      disetujui: pawns.filter((p) => p.status === "disetujui").length,
      aktif: pawns.filter((p) => p.status === "aktif").length,
      selesai: pawns.filter((p) => p.status === "lunas_dilepas").length,
    };
  },
});

// =====================================================================
// Reviewer (tim Pinjam Gadai Digital) transitions — admin only
// =====================================================================

/** Hanya admin boleh memindahkan status aplikasi. */
async function requireAdmin(ctx: MutationCtx) {
  return (await requireAdminSession(ctx)).userId;
}

/**
 * Tolak pencairan pinjaman yang belum punya penyedia dana.
 *
 * Pinjaman tanpa pendana tidak tampil di ruang pendana mana pun, sebab ruang
 * itu portofolio pribadi. Pemiliknya bisa datang dari penetapan admin
 * (`pendanaId`), nama warisan, atau baris alokasi lama.
 */
/**
 * Catat persetujuan perjanjian dari persetujuan pengajuan yang sudah ada.
 *
 * Sengaja TIDAK membuat tanda tangan atau waktu baru: gambar tanda tangan dan
 * `persetujuanPengajuanPada`/versi dipakai apa adanya, sehingga panel admin
 * menampilkan kapan peminjam benar-benar menyetujui, bukan kapan admin
 * mencairkan. Pemanggil hanya memakai ini pada jalur pencairan.
 */
async function catatPersetujuanPerjanjianDariPengajuan(
  ctx: MutationCtx,
  loan: Doc<"loans">,
): Promise<void> {
  if (loan.persetujuanSyaratPada !== undefined) return;
  if (
    loan.tandaTanganPeminjam === undefined ||
    loan.persetujuanPengajuanPada === undefined
  ) {
    return;
  }
  await ctx.db.patch(loan._id, {
    persetujuanSyaratPada: loan.persetujuanPengajuanPada,
    persetujuanSyaratVersi:
      loan.persetujuanPengajuanVersi ?? CONTRACT_TERMS_VERSION,
  });
}

async function pastikanPunyaPendana(ctx: MutationCtx, loan: Doc<"loans">): Promise<void> {
  if (loan.pendanaId !== undefined || (loan.pendanaNama ?? "").trim() !== "") return;
  const alokasi = await ctx.db
    .query("fundings")
    .withIndex("by_loan", (q) => q.eq("loanId", loan._id))
    .first();
  if (alokasi !== null && alokasi.status !== "dibatalkan") return;
  throw new Error(
    "Pinjaman ini belum punya penyedia dana, jadi tidak akan muncul di ruang pendana mana pun. Tetapkan pendananya lebih dulu, lalu tandai dana tersalurkan.",
  );
}

/**
 * Pindahkan status pinjaman (admin). Ini mengubah CATATAN saja: tidak ada uang
 * yang berpindah, tidak ada jurnal yang ditulis, tidak ada saldo yang berubah.
 *
 * Nominal yang disetujui admin diisi ke `pokokPinjaman` — satu-satunya angka
 * yang dipakai seluruh perhitungan (bunga, kewajiban, pencairan, kontrak) —
 * sehingga menyetujui lebih kecil daripada pengajuan tidak menciptakan dua
 * sumber kebenaran. `pokokDiajukan` menyimpan angka asli pengajuan.
 *
 * Catatan (`catatan`) OPSIONAL: kebijakan pemilik produk — admin tidak boleh
 * tertahan oleh kolom alasan saat mengubah status. Yang selalu ada adalah jejak
 * audit (`loan_<status>`) dan data pesan WhatsApp supaya pemanggil (dialog
 * admin) dapat mengirim kabar ke Peminjam. Pengiriman pesan itu sendiri adalah
 * action terpisah.
 */
async function setLoanStatus(
  ctx: MutationCtx,
  loanId: Id<"loans">,
  status: LoanStatusValue,
  catatan?: string,
  nominalDisetujuiUsulan?: number,
): Promise<{
  ok: true;
  status: LoanStatusValue;
  statusLama: string;
  pokokDiajukan: number;
  pokokPinjaman: number;
  /** Total kewajiban setelah perubahan (null bila belum bisa dihitung). */
  totalKewajiban: number | null;
  nomorWhatsApp: string | null;
  namaLengkap: string;
  nomorReferensi: string;
}> {
  const adminId = await requireAdmin(ctx);
  const loan = await ctx.db.get(loanId);
  if (loan === null) throw new Error("Aplikasi tidak ditemukan.");

  const alasan = catatan?.trim() ?? "";
  if (alasan.length > 500) {
    throw new Error("Catatan perubahan maksimal 500 karakter.");
  }
  // Aturan transisi (status kanonik, posisi lunas, status sama) ada di lib murni
  // agar bisa diuji. Catatan tidak diperiksa: boleh kosong.
  const cek = validasiUbahStatus(loan.status, status);
  if (!cek.ok) throw new Error(cek.alasan);

  const statusLama = loan.status;
  const pokokDiajukan = loan.pokokDiajukan ?? loan.pokokPinjaman;

  // Nominal hanya boleh disesuaikan selama dana belum tersalurkan. Setelah itu
  // angka pokok sudah terpakai kontrak, jurnal, dan pencairan.
  let pokokPinjaman = loan.pokokPinjaman;
  if (nominalDisetujuiUsulan !== undefined) {
    if (nominalTerkunci(statusLama)) {
      throw new Error(
        "Nominal pinjaman tidak dapat diubah setelah dana tersalurkan.",
      );
    }
    const nominal = nominalDisetujui(pokokDiajukan, nominalDisetujuiUsulan);
    if (!nominal.ok) throw new Error(nominal.alasan);
    pokokPinjaman = nominal.nilai;
  }

  if (status === "didanai") {
    await pastikanPunyaPendana(ctx, loan);
    // Pencairan mencatat perjanjian dari persetujuan yang MEMANG sudah
    // diberikan peminjam saat mengajukan (tanggal & versi aslinya). Bila
    // pinjaman tidak punya keduanya, perjanjian dibiarkan belum bertanda tangan.
    await catatPersetujuanPerjanjianDariPengajuan(ctx, loan);
  }
  if (status === "disetujui") {
    await ensureKodePeminjam(ctx, loan.userId);
  }
  await ctx.db.patch(loanId, {
    status,
    // Jejak "kapan diputuskan" untuk SEMUA perpindahan status oleh admin —
    // dipakai laporan dan notifikasi nasabah. Status yang punya tanggal acuan
    // sendiri (didanaiPada/lunasPada) tetap memakai tanggal itu untuk hitungan.
    diputuskanPada: Date.now(),
    catatanReview: alasan || undefined,
    // `pokokDiajukan` diisi sekali saja: pengajuan asli tidak ikut berubah bila
    // admin menyesuaikan nominalnya.
    pokokDiajukan,
    pokokPinjaman,
    // Tanggal acuan ditetapkan saat status berpindah ke "Disalurkan" — jalur
    // ini dan tombol "Tandai dana tersalurkan" (`danaiPinjaman`) menghasilkan
    // catatan yang sama, sehingga jatuh tempo tidak pernah kosong. Nilai yang
    // sudah ada tidak ditimpa (koreksi tidak boleh menggeser tanggal).
    ...(status === "didanai" && loan.didanaiPada === undefined
      ? { didanaiPada: Date.now() }
      : {}),
    // Tanggal acuan lunas juga ditetapkan di sini. Tanpa itu, pinjaman yang
    // ditandai lunas lewat tombol admin tidak punya tanggal acuan, sehingga
    // riwayat pelunasan dan notifikasi lunas tidak pernah muncul.
    ...(status === "lunas" && loan.lunasPada === undefined
      ? { lunasPada: Date.now() }
      : {}),
    // Status lunas menutup kewajiban pokok juga. Tanpa ini, pinjaman yang
    // pernah diperpanjang tetap membawa sisa pokok > 0 setelah ditutup admin.
    ...(status === "lunas"
      ? { remainingPrincipal: 0, nextInterestAmount: 0 }
      : {}),
  });

  const loanSetelah = (await ctx.db.get(loanId)) ?? loan;
  // Pencairan lewat jalur ubah status juga membuat jadwal angsuran — supaya
  // peminjam memegang tagihan yang sama dengan yang tampil di kontrak.
  await pastikanAngsuran(ctx, loanSetelah);
  // Pinjaman yang ditutup lewat panel admin (mis. pencatatan pembayaran di luar
  // aplikasi) juga memberi voucher apresiasi. Tanpa ini, nasabah yang
  // dilunasi manual tidak pernah menerima voucher apa pun.
  if (loanSetelah.status === "lunas") {
    const waktuLunas = loanSetelah.lunasPada ?? Date.now();
    await beriVoucherApresiasi(ctx, { loan: loanSetelah, sekarang: waktuLunas });
    await selesaikanReferralPelunasan(ctx, { loan: loanSetelah, sekarang: waktuLunas });
  }

  const admin = await ctx.db.get(adminId);
  const nominalBerubah = pokokPinjaman !== loan.pokokPinjaman;
  await audit(
    ctx,
    adminId,
    admin?.email ?? admin?.name ?? "admin",
    `loan_${status}`,
    loan.nomorReferensi,
    `${loan.namaLengkap} — ${statusLama} → ${status}` +
      (alasan === "" ? " (tanpa catatan)" : `: ${alasan}`) +
      (nominalBerubah
        ? ` (nominal ${pokokPinjaman}, diajukan ${pokokDiajukan})`
        : ""),
  );

  // Total kewajiban memakai nominal yang berlaku setelah perubahan + snapshot
  // bunga nasabah pada pinjaman ini.
  const totalKewajiban =
    status === "ditolak"
      ? null
      : loan.tenorBulan !== undefined
        ? hitungSimulasiBulanan(pokokPinjaman, loan.tenorBulan, {
            ...(loan.persenBunga === undefined ? {} : { persenBungaPerBulan: loan.persenBunga }),
            tarif: loan.tarifBulanan ?? null,
          }).totalPengembalian
        : loan.persenBunga === undefined
          ? quoteLoan(pokokPinjaman).totalKewajibanPelunasan
          : quoteLoanBunga(pokokPinjaman, loan.persenBunga).totalKewajibanPelunasan;

  // Kabar WhatsApp dijadwalkan SETELAH status tersimpan, lewat action terpisah:
  // pengiriman keluar (fetch) tidak boleh berjalan di dalam transaksi, dan
  // kegagalan gateway tidak boleh membatalkan perubahan status yang sah.
  // Action-nya tidak pernah melempar; percobaannya tercatat di waLogs.
  await ctx.scheduler.runAfter(0, internal.whatsapp._kirimStatusPinjaman, {
    loanId,
    alasan,
    statusLama,
  });

  // Laporan PDF pelunasan dikirim ke pendana pendana-nya pinjaman ini, juga
  // SETELAH status tersimpan. Hanya pada perpindahan KE lunas: mengirim ulang
  // saat status lain berubah akan mengabarkan pelunasan yang sudah lama terjadi.
  // Penerimanya ditentukan pemilik kanonik pinjaman (`pendanaId`); pinjaman
  // warisan yang hanya punya nama pendana dilewati, karena tidak ada akun yang
  // bisa dikirimi tanpa menebak.
  if (status === "lunas" && statusLama !== "lunas" && loan.pendanaId !== undefined) {
    await ctx.scheduler.runAfter(0, internal.laporanPendana.kirimLaporanPelunasan, {
      loanId,
      olehUserId: adminId,
    });
  }

  // Rincian resmi menyusul pencairan, supaya peminjam memegang jadwal dan
  // kewajibannya sejak dana turun. Hanya pada perpindahan KE didanai.
  if (status === "didanai" && statusLama !== "didanai") {
    await ctx.scheduler.runAfter(0, internal.rincianKirim.kirimRincianOtomatis, {
      loanId,
      olehUserId: adminId,
    });
  }

  return {
    ok: true,
    status,
    statusLama,
    pokokDiajukan,
    pokokPinjaman,
    totalKewajiban,
    nomorWhatsApp: loan.nomorWhatsApp ?? null,
    namaLengkap: loan.namaLengkap,
    nomorReferensi: loan.nomorReferensi,
  };
}

export const markLoanInReview = mutation({
  args: { loanId: v.id("loans"), /** Catatan opsional. */ reason: v.optional(v.string()) },
  handler: (ctx, args) =>
    setLoanStatus(ctx, args.loanId, "sedang_direview", args.reason),
});

/**
 * Setujui pinjaman. `pokokDisetujui` opsional: kosong = setujui penuh sesuai
 * pengajuan; diisi = admin menyetujui sebagian (tidak boleh melebihi pengajuan).
 */
export const approveLoan = mutation({
  args: {
    loanId: v.id("loans"),
    /** Catatan opsional — tidak lagi wajib diisi. */
    reason: v.optional(v.string()),
    pokokDisetujui: v.optional(v.number()),
  },
  handler: (ctx, args) =>
    setLoanStatus(
      ctx,
      args.loanId,
      "disetujui",
      args.reason,
      args.pokokDisetujui,
    ),
});

export const rejectLoan = mutation({
  args: { loanId: v.id("loans"), /** Catatan opsional. */ reason: v.optional(v.string()) },
  handler: (ctx, args) => setLoanStatus(ctx, args.loanId, "ditolak", args.reason),
});

/**
 * Ubah status pinjaman ke salah satu dari EMPAT status (admin) — satu pintu
 * untuk koreksi dan pemulihan. Catatan OPSIONAL; jejak audit selalu ditulis.
 *
 * Argumennya memakai status KANONIK (`ditinjau`/`didanai`/`ditolak`/`lunas`),
 * lalu dipetakan ke ejaan tersimpannya: "ditinjau" tersimpan sebagai
 * `sedang_direview` (lihat `lib/statusPinjaman.ts`), sehingga tahap lama yang
 * sudah digabung tidak lagi bisa dipilih admin.
 *
 * `pokokDisetujui` hanya berlaku selama dana belum ditandai tersalurkan.
 */
export const ubahStatusPinjaman = mutation({
  args: {
    loanId: v.id("loans"),
    status: loanStatusKanonikValidator,
    /** Catatan opsional — boleh dikosongkan. */
    reason: v.optional(v.string()),
    pokokDisetujui: v.optional(v.number()),
  },
  handler: (ctx, args) =>
    setLoanStatus(
      ctx,
      args.loanId,
      keStatusTersimpan(args.status) as LoanStatusValue,
      args.reason,
      args.pokokDisetujui,
    ),
});

/**
 * PEMINJAM menarik pengajuannya sendiri (status `dibatalkan`).
 *
 * Aturan yang dijaga:
 * - hanya pemiliknya, dan hanya selama pengajuan BELUM tersalurkan
 *   (`bolehDibatalkan` = masih tahap tinjauan);
 * - pengajuan yang sudah punya ALOKASI dana dari penyedia dana tidak boleh
 *   ditarik sendiri — alokasi itu tidak boleh menjadi yatim. Pesannya mengarah
 *   ke tim PINDAI, bukan gagal diam-diam;
 * - pembatalan TIDAK mengubah plafon: yang menahan plafon hanya pinjaman
 *   `didanai`, dan pengajuan ini belum pernah menjadi utang;
 * - jejaknya selalu masuk audit trail.
 */
export const batalkanPengajuan = mutation({
  args: {
    loanId: v.id("loans"),
    /** Alasan opsional — tidak pernah diwajibkan. */
    alasan: v.optional(v.string()),
  },
  returns: v.object({ ok: v.literal(true), status: v.literal("dibatalkan") }),
  handler: async (ctx, args) => {
    const { userId, user } = await requirePeminjam(ctx);
    const loan = await ctx.db.get(args.loanId);
    if (loan === null) throw new Error("Pengajuan tidak ditemukan.");
    if (loan.userId !== userId) {
      throw new Error("Pengajuan ini bukan milik Anda.");
    }
    if (!bolehDibatalkan(loan.status)) {
      throw new Error(
        `Pengajuan berstatus ${labelStatusPinjaman(loan.status)} tidak dapat dibatalkan sendiri. Hubungi tim PINDAI bila perlu perubahan.`,
      );
    }
    const alokasi = await ctx.db
      .query("fundings")
      .withIndex("by_loan", (q) => q.eq("loanId", args.loanId))
      .first();
    if (alokasi !== null) {
      throw new Error(
        "Pengajuan ini sudah memiliki alokasi dana dari penyedia dana, jadi tidak dapat dibatalkan sendiri. Hubungi tim PINDAI untuk menyesuaikannya.",
      );
    }
    const alasan = args.alasan?.trim() ?? "";
    if (alasan.length > 300) {
      throw new Error("Alasan pembatalan maksimal 300 karakter.");
    }
    const now = Date.now();
    await ctx.db.patch(args.loanId, {
      status: "dibatalkan",
      dibatalkanPada: now,
      dibatalkanOleh: user.email ?? user.name ?? "peminjam",
      ...(alasan !== "" ? { alasanPembatalan: alasan } : {}),
    });
    await audit(
      ctx,
      userId,
      user.email ?? user.name ?? "peminjam",
      "pengajuan_dibatalkan",
      loan.nomorReferensi,
      `Peminjam menarik pengajuan ${loan.nomorReferensi} sebelum pencairan. Pengajuan bukan utang; plafon tidak berubah.${alasan !== "" ? ` Alasan: ${alasan}` : ""}`,
    );
    return { ok: true, status: "dibatalkan" } as const;
  },
});

/**
 * Tandai pinjaman tersalurkan setelah admin menetapkan pendananya.
 *
 * Dipakai tombol "Simpan pendana" di dialog review: memilih pendana pada
 * pinjaman yang nominalnya sudah disetujui berarti pencairan siap jalan, jadi
 * admin tidak perlu menekan tombol kedua.
 *
 * Perjanjian TIDAK ditandatangani ulang atas nama peminjam. Yang dicatat adalah
 * persetujuan yang MEMANG sudah diberikan saat pengajuan: gambar tanda tangan
 * dan `persetujuanPengajuanPada` dipakai apa adanya, termasuk versi syaratnya.
 * Tanggalnya tidak dikarang, sehingga jejak audit tetap jujur. Bila pinjaman
 * tidak punya tanda tangan/persetujuan pengajuan (mis. catatan manual),
 * perjanjian dibiarkan belum bertanda tangan dan hanya pencairannya yang jalan.
 *
 * Hanya berjalan pada status `disetujui` — tahap ketika keputusan nominal sudah
 * tercatat dan satu-satunya langkah tersisa memang pencairan. Pinjaman yang
 * masih `diajukan`/`sedang_direview` tidak boleh melompati persetujuan admin.
 */
export async function cairkanSetelahPendana(
  ctx: MutationCtx,
  loanId: Id<"loans">,
): Promise<{ dicairkan: boolean }> {
  const loan = await ctx.db.get(loanId);
  if (loan === null || loan.status !== "disetujui") return { dicairkan: false };
  if (loan.pendanaId === undefined && (loan.pendanaNama ?? "").trim() === "") {
    return { dicairkan: false };
  }

  await setLoanStatus(
    ctx,
    loanId,
    "didanai",
    "Pendana ditetapkan; perjanjian mengikuti persetujuan pengajuan peminjam.",
  );
  return { dicairkan: true };
}

/**
 * Admin menandai pinjaman yang masih ditinjau sebagai berjalan pada ledger
 * internal (status Disalurkan + tanggal acuan). Tidak ada perpindahan dana di
 * aplikasi — pencairan dan transfer ditangani di luar aplikasi.
 *
 * Gerbangnya bukan lagi satu tahap persetujuan internal: sejak status
 * digabung menjadi empat, "Ditinjau" adalah satu-satunya tahap sebelum dana
 * ditandai tersalurkan (mencakup ejaan lama `diajukan`/`sedang_direview`/
 * `disetujui`).
 */
export const danaiPinjaman = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const adminId = await requireAdmin(ctx);
    const loan = await ctx.db.get(loanId);
    if (loan === null) throw new Error("Aplikasi tidak ditemukan.");
    if (!diTahapTinjauan(loan.status)) {
      throw new Error(
        "Hanya pinjaman yang masih berstatus Ditinjau dapat ditandai tersalurkan.",
      );
    }
    await pastikanPunyaPendana(ctx, loan);
    // Pencairan manual juga mencatat perjanjian dari persetujuan pengajuan,
    // sehingga status perjanjian tidak bergantung pada tombol mana yang dipakai.
    await catatPersetujuanPerjanjianDariPengajuan(ctx, loan);
    await ctx.db.patch(loanId, {
      status: "didanai",
      didanaiPada: Date.now(),
    });
    const loanSetelah = await ctx.db.get(loanId);
    await pastikanAngsuran(ctx, loanSetelah ?? loan);
    const admin = await ctx.db.get(adminId);
    await audit(
      ctx,
      adminId,
      admin?.email ?? admin?.name ?? "admin",
      "loan_didanai",
      loan.nomorReferensi,
      `${loan.namaLengkap} — dana ditandai tersalurkan pada ledger internal`,
    );
    // Jalur tombol ini menghasilkan catatan yang SAMA dengan `ubahStatusPinjaman`
    // (lihat catatan di sana), jadi kabar WhatsApp-nya juga harus sama: template
    // `pencairan` berangkat dari sini, bukan hanya dari jalur ubah status.
    await ctx.scheduler.runAfter(0, internal.whatsapp._kirimStatusPinjaman, {
      loanId,
      alasan: "Dana ditandai tersalurkan.",
      statusLama: loan.status,
    });
    // Jalur tombol ini juga pencairan, jadi rincian resmi ikut dikirim.
    await ctx.scheduler.runAfter(0, internal.rincianKirim.kirimRincianOtomatis, {
      loanId,
      olehUserId: adminId,
    });
    return { ok: true };
  },
});

async function setPawnStatus(
  ctx: MutationCtx,
  pawnId: Id<"pawns">,
  status: PawnStatusValue,
  opts: {
    nilaiTaksiran?: Rupiah;
    catatan?: string;
    hargaPasar?: Rupiah;
    kondisiFisik?: string;
    kodeRakVault?: string;
  },
) {
  const adminId = await requireAdmin(ctx);
  const pawn = await ctx.db.get(pawnId);
  if (pawn === null) throw new Error("Pengajuan gadai tidak ditemukan.");
  if (status === "diajukan") {
    throw new Error("Status tidak boleh dikembalikan ke diajukan.");
  }
  if (
    status === "disetujui" &&
    (opts.nilaiTaksiran === undefined ||
      !Number.isSafeInteger(opts.nilaiTaksiran) ||
      opts.nilaiTaksiran <= 0)
  ) {
    throw new Error(
      "Persetujuan gadai wajib menyertakan nilai taksiran rupiah bulat positif.",
    );
  }
  if (status === "ditolak" && (!opts.catatan || opts.catatan.trim().length === 0)) {
    throw new Error("Penolakan wajib menyertakan alasan.");
  }
  if (opts.nilaiTaksiran !== undefined) {
    validateRupiahAmount(opts.nilaiTaksiran, "Nilai taksiran");
  }
  if (opts.hargaPasar !== undefined) {
    validateRupiahAmount(opts.hargaPasar, "Harga pasar");
  }
  await ctx.db.patch(pawnId, {
    status,
    ...(opts.nilaiTaksiran !== undefined ? { nilaiTaksiran: opts.nilaiTaksiran } : {}),
    ...(opts.hargaPasar !== undefined ? { hargaPasar: opts.hargaPasar } : {}),
    ...(opts.kondisiFisik !== undefined ? { kondisiFisik: opts.kondisiFisik } : {}),
    ...(opts.kodeRakVault !== undefined ? { kodeRakVault: opts.kodeRakVault } : {}),
    catatanReview: opts.catatan?.trim() || undefined,
  });
  const admin = await ctx.db.get(adminId);
  await audit(
    ctx,
    adminId,
    admin?.email ?? admin?.name ?? "admin",
    `pawn_${status}`,
    pawn.nomorReferensi,
    `${pawn.namaLengkap} — ${status}${opts.nilaiTaksiran !== undefined ? `, taksiran ${opts.nilaiTaksiran}` : ""}`,
  );
}

export const markPawnInAppraisal = mutation({
  args: { pawnId: v.id("pawns") },
  handler: (ctx, args) =>
    setPawnStatus(ctx, args.pawnId, "sedang_dinilai", {}),
});

export const approvePawn = mutation({
  args: {
    pawnId: v.id("pawns"),
    nilaiTaksiran: v.number(),
    hargaPasar: v.optional(v.number()),
    kondisiFisik: v.optional(v.string()),
    kodeRakVault: v.optional(v.string()),
  },
  handler: (ctx, args) =>
    setPawnStatus(ctx, args.pawnId, "disetujui", {
      nilaiTaksiran: args.nilaiTaksiran,
      hargaPasar: args.hargaPasar,
      kondisiFisik: args.kondisiFisik,
      kodeRakVault: args.kodeRakVault,
    }),
});

// Catatan penolakan opsional: admin tidak boleh tertahan oleh kolom alasan.
export const rejectPawn = mutation({
  args: { pawnId: v.id("pawns"), reason: v.optional(v.string()) },
  handler: (ctx, args) =>
    setPawnStatus(ctx, args.pawnId, "ditolak", { catatan: args.reason }),
});

/**
 * Admin menandai gadai yang sudah disetujui sebagai berjalan pada ledger
 * internal setelah pokok acuan ditetapkan. Pencairan dana tetap ditangani di
 * luar aplikasi (lihat `cairkanGadai` yang fail-closed).
 */
export const aktifkanGadai = mutation({
  args: { pawnId: v.id("pawns") },
  handler: async (ctx, { pawnId }) => {
    const pawn = await ctx.db.get(pawnId);
    if (pawn === null) throw new Error("Pengajuan gadai tidak ditemukan.");
    if (pawn.status !== "disetujui") {
      throw new Error("Hanya gadai berstatus disetujui yang dapat ditandai berjalan.");
    }
    if (pawn.pokokGadai === undefined || (pawn.sisaPokok ?? 0) <= 0) {
      throw new Error("Tetapkan pokok gadai terlebih dahulu sebelum menandai berjalan.");
    }
    // Catatan review lama dipertahankan (setPawnStatus menimpa bila undefined).
    await setPawnStatus(ctx, pawnId, "aktif", { catatan: pawn.catatanReview });
    return { ok: true };
  },
});

/**
 * Super Admin menghapus data pinjaman yang salah input — termasuk pengajuan
 * yang sudah ditandatangani atau disetujui.
 *
 * Dua jalur, dan bedanya disengaja:
 *
 *  1. **Biasa** (tanpa `bersihkanDana`) — ditolak begitu ada catatan keuangan
 *     (alokasi dana atau jurnal `pinjaman:<id>`), supaya salah tekan tidak
 *     menghapus pinjaman yang uangnya sudah berpindah.
 *  2. **Menyeluruh** (`bersihkanDana: true`) — admin menyatakan sadar bahwa
 *     pinjaman ini sudah berpindah dana. Baris turunan keuangan (alokasi dana,
 *     transfer keuntungan, bukti bayar manual) ikut dihapus supaya tidak ada
 *     referensi yatim, tetapi **jurnal ledger TIDAK disentuh**: ledger bersifat
 *     append-only (Rule 5.1), jadi catatan keuangannya tetap menjadi riwayat —
 *     sama seperti `integrasiLedger.hapusPinjamanLama`. Audit trail menyebut
 *     jumlah baris yang dibersihkan dan jumlah entri jurnal yang dipertahankan.
 *
 * Perubahan ini menjawab permintaan pemilik produk: admin harus bisa
 * membersihkan pinjaman yang sudah didanai tanpa mengubah kebijakan ledger.
 * Konsekuensinya (pinjaman hilang dari rekap padahal jurnalnya masih ada) akan
 * tampak sebagai temuan "awas/gagal" pada panel QC konsistensi — itu memang
 * yang diinginkan: penghapusan menyeluruh harus terlihat, bukan senyap.
 */
export const hapusPinjaman = mutation({
  args: {
    loanId: v.id("loans"),
    /** Catatan penghapusan OPSIONAL — salah input boleh dibersihkan tanpa alasan. */
    reason: v.optional(v.string()),
    /** Konfirmasi eksplisit untuk pinjaman yang sudah punya alokasi/jurnal. */
    bersihkanDana: v.optional(v.boolean()),
  },
  handler: async (ctx, { loanId, reason, bersihkanDana }) => {
    const { userId, user } = await requireAdminSession(ctx);
    const alasan = (reason ?? "").trim();
    if (alasan.length > 500) {
      throw new Error("Catatan penghapusan maksimal 500 karakter.");
    }
    const loan = await ctx.db.get(loanId);
    if (loan === null) throw new Error("Data pinjaman tidak ditemukan.");
    // Super Admin boleh membersihkan salah input, termasuk pengajuan yang
    // sudah ditandatangani atau disetujui — tanda tangan formulir maupun
    // `persetujuanSyaratPada` BUKAN catatan keuangan. Yang tetap memblokir
    // hanyalah catatan KEUANGAN di bawah ini: alokasi dana (`fundings`) atau
    // jurnal `pinjaman:<id>`. Begitu ada uang tercatat berpindah, penghapusan
    // ditolak supaya riwayat tetap utuh.

    const [
      fundings,
      reminders,
      waLogs,
      locationTrail,
      locationWarnings,
      transfers,
      receipts,
      jurnal,
    ] = await Promise.all([
      ctx.db.query("fundings").withIndex("by_loan", (q) => q.eq("loanId", loanId)).collect(),
      ctx.db.query("pengingat").withIndex("by_loan", (q) => q.eq("loanId", loanId)).collect(),
      ctx.db.query("waLogs").withIndex("by_loan", (q) => q.eq("loanId", loanId)).collect(),
      ctx.db.query("lokasiJejak").withIndex("by_loan", (q) => q.eq("loanId", loanId)).collect(),
      ctx.db.query("lokasiPeringatan").withIndex("by_loan", (q) => q.eq("loanId", loanId)).collect(),
      ctx.db.query("transferPendana").withIndex("by_loan", (q) => q.eq("loanId", loanId)).collect(),
      ctx.db.query("manualPaymentReceipts").withIndex("by_loan", (q) => q.eq("loanId", loanId)).collect(),
      ctx.db.query("ledger_entries").withIndex("by_akun", (q) => q.eq("akun", `pinjaman:${loanId}`)).collect(),
    ]);
    // Catatan KEUANGAN memblokir jalur BIASA: pinjaman yang sudah punya alokasi
    // dana atau jurnal bukan lagi pengajuan kosong. Admin tetap bisa
    // membersihkannya, tetapi harus menyatakannya lewat `bersihkanDana` supaya
    // tidak terjadi karena salah tekan.
    if ((fundings.length > 0 || jurnal.length > 0) && bersihkanDana !== true) {
      throw new Error(
        "Data pinjaman memiliki alokasi atau jurnal terkait; tidak dihapus agar riwayat keuangan tetap utuh. " +
          "Centang \"Hapus menyeluruh\" bila penghapusan ini memang disengaja.",
      );
    }
    // Catatan OPERASIONAL (pengingat, log WhatsApp, jejak & peringatan lokasi)
    // adalah efek samping pengajuan, bukan riwayat keuangan — ikut dihapus
    // bersama pinjamannya supaya salah input dapat dibersihkan tanpa
    // meninggalkan catatan yatim, termasuk untuk pengajuan yang sudah
    // ditandatangani atau disetujui.
    for (const row of reminders) await ctx.db.delete(row._id);
    for (const row of waLogs) await ctx.db.delete(row._id);
    for (const row of locationTrail) await ctx.db.delete(row._id);
    for (const row of locationWarnings) await ctx.db.delete(row._id);

    // Baris turunan KEUANGAN ikut dibersihkan — juga pada jalur biasa, supaya
    // tidak ada alokasi/transfer/bukti yatim yang menunjuk pinjaman yang sudah
    // tidak ada. Jurnal ledger sengaja TIDAK disentuh (append-only); itulah
    // catatan keuangan yang tetap menjadi riwayat.
    for (const f of fundings) await ctx.db.delete(f._id);
    for (const row of transfers) await ctx.db.delete(row._id);
    for (const r of receipts) {
      if (await ctx.storage.getMetadata(r.buktiPembayaranId) !== null) {
        await ctx.storage.delete(r.buktiPembayaranId);
      }
      await ctx.db.delete(r._id);
    }

    await audit(
      ctx,
      userId,
      user.email ?? user.name ?? "admin",
      "loan_delete",
      loan.nomorReferensi,
      `${loan.namaLengkap} — pokok ${formatRupiah(loan.pokokPinjaman)}, status ${loan.status}; ` +
        (alasan === "" ? "tanpa catatan penghapusan" : `catatan: ${alasan}`) +
        (fundings.length > 0 || jurnal.length > 0
          ? `; PENGHAPUSAN MENYELURUH: ${fundings.length} alokasi dana, ${transfers.length} catatan transfer, ` +
            `${receipts.length} bukti bayar dihapus; ${jurnal.length} entri jurnal ledger dipertahankan (append-only).`
          : "; tanpa catatan keuangan"),
      // Angka terstruktur untuk panel Audit Trail: berapa baris yang benar-benar
      // ikut terhapus dan berapa entri jurnal yang dipertahankan.
      {
        menyeluruh: bersihkanDana === true,
        alokasiDana: fundings.length,
        catatanTransfer: transfers.length,
        buktiBayar: receipts.length,
        pengingat: reminders.length,
        logWhatsapp: waLogs.length,
        jejakLokasi: locationTrail.length + locationWarnings.length,
        jurnalDipertahankan: jurnal.length,
      },
    );
    await ctx.db.delete(loanId);
    for (const storageId of [loan.dokKtpId, loan.dokSelfieKtpId, loan.dokSlipGajiId]) {
      if (storageId !== undefined && await ctx.storage.getMetadata(storageId) !== null) {
        await ctx.storage.delete(storageId);
      }
    }
    return { ok: true };
  },
});

/** Super Admin menghapus pengajuan gadai yang salah input, tanpa jejak transaksi. */
/**
 * Super Admin menghapus catatan gadai yang salah input.
 *
 * Dua jalur, dengan pembagian yang disengaja:
 *
 *  1. **Biasa** — ditolak begitu ada catatan yang menyatakan gadai ini sudah
 *     berjalan (pencairan, persetujuan/tanda tangan, cicilan, atau jurnal),
 *     supaya salah tekan tidak menghapus catatan yang uangnya sudah berpindah.
 *  2. **Menyeluruh** (`bersihkanDana: true`) — admin menyatakan sadar dan
 *     cicilan (`pawnPayments`) ikut dibersihkan agar tidak ada referensi yatim;
 *     **jurnal ledger TIDAK disentuh** (append-only, Rule 5.1) dan justru tetap
 *     menjadi riwayat keuangannya.
 *
 * Yang TETAP memblokir di kedua jalur: barang jaminan yang masih tercatat di
 * rak penitipan (`kodeRakVault`, status `aktif`/`menunggu_pelepasan`). Itu bukan
 * catatan data, melainkan barang fisik yang masih ada di tangan kita —
 * menghapus barisnya akan membuat keberadaan barang itu tak lagi terlacak.
 * Lepaskan barangnya lewat alur gadai lebih dulu.
 */
export const hapusGadai = mutation({
  args: {
    pawnId: v.id("pawns"),
    /** Catatan penghapusan opsional — penghapusan tidak boleh tertahan kolom alasan. */
    reason: v.optional(v.string()),
    /** Konfirmasi eksplisit untuk gadai yang sudah punya catatan keuangan. */
    bersihkanDana: v.optional(v.boolean()),
  },
  handler: async (ctx, { pawnId, reason, bersihkanDana }) => {
    const { userId, user } = await requireAdminSession(ctx);
    // Catatan tidak wajib; hanya batas atas yang dijaga agar audit tetap terbaca.
    const alasan = (reason ?? "").trim();
    if (alasan.length > 500) {
      throw new Error("Catatan penghapusan maksimal 500 karakter.");
    }
    const pawn = await ctx.db.get(pawnId);
    if (pawn === null) throw new Error("Data gadai tidak ditemukan.");
    if (
      pawn.kodeRakVault !== undefined ||
      pawn.status === "aktif" ||
      pawn.status === "menunggu_pelepasan"
    ) {
      throw new Error(
        "Barang jaminan masih tercatat di rak penitipan; lepaskan barangnya lewat alur gadai sebelum menghapus catatannya.",
      );
    }
    if (
      bersihkanDana !== true &&
      (pawn.dicairkanPada !== undefined ||
        pawn.persetujuanSyaratPada !== undefined ||
        pawn.tandaTanganPeminjam !== undefined ||
        pawn.status === "lunas_dilepas")
    ) {
      throw new Error(
        "Gadai ini sudah masuk siklus pencairan atau memiliki persetujuan tercatat; tidak dihapus. " +
          "Centang \"Hapus menyeluruh\" bila penghapusan ini memang disengaja.",
      );
    }

    const [payments, ledger] = await Promise.all([
      ctx.db.query("pawnPayments").withIndex("by_pawn", (q) => q.eq("pawnId", pawnId)).collect(),
      ctx.db.query("ledger_entries").withIndex("by_akun", (q) => q.eq("akun", `gadai:${pawnId}`)).collect(),
    ]);
    if (bersihkanDana !== true && (payments.length > 0 || ledger.length > 0)) {
      throw new Error(
        "Data gadai memiliki pembayaran atau jurnal terkait; tidak dihapus agar riwayat tetap utuh. " +
          "Centang \"Hapus menyeluruh\" bila penghapusan ini memang disengaja.",
      );
    }

    // Cicilan ikut dibersihkan pada jalur menyeluruh supaya tidak ada baris
    // yatim yang menunjuk gadai yang sudah tidak ada. Jurnal ledger sengaja
    // TIDAK disentuh — itulah catatan keuangan yang tetap menjadi riwayat.
    for (const p of payments) await ctx.db.delete(p._id);

    await audit(
      ctx,
      userId,
      user.email ?? user.name ?? "admin",
      "pawn_delete",
      pawn.nomorReferensi,
      `${pawn.namaLengkap} — ${pawn.deskripsiBarang}, status ${pawn.status}; alasan: ${alasan}` +
        (payments.length > 0 || ledger.length > 0
          ? `; PENGHAPUSAN MENYELURUH: ${payments.length} cicilan dihapus; ` +
            `${ledger.length} entri jurnal ledger dipertahankan (append-only).`
          : "; tanpa catatan keuangan"),
      {
        menyeluruh: bersihkanDana === true,
        alokasiDana: 0,
        catatanTransfer: 0,
        buktiBayar: 0,
        pengingat: 0,
        logWhatsapp: 0,
        jejakLokasi: 0,
        jurnalDipertahankan: ledger.length,
      },
    );
    await ctx.db.delete(pawnId);
    if (pawn.fotoBarangId !== undefined && await ctx.storage.getMetadata(pawn.fotoBarangId) !== null) {
      await ctx.storage.delete(pawn.fotoBarangId);
    }
    return { ok: true };
  },
});

// =====================================================================
// Pelunasan (repayment) & pelepasan barang gadai
// =====================================================================

/**
 * Pelunasan oleh Peminjam — skema harian: pokok + bunga sesuai tarif tersimpan;
 * skema bulanan (tenorBulan): Σ cicilan + biaya layanan (fee platform).
 * Jurnal (semua dalam satu mutation transaksional, append-only):
 *   1. D platform:CASH total kewajiban | K pinjaman:<id>
 *   2. Per penyedia dana (satu jurnal seimbang):
 *      D akun dompet dana:i (uang kembali bagiannya − potongan admin)
 *      D platform:FEE (potongan admin = persen × pokok alokasi)
 *      K pinjaman:<id> (alokasi + Imbal Hasil bagiannya)
 * Dust pembulatan proporsi imbal hasil diberikan ke penyedia dana dengan alokasi
 * terbesar, sehingga akun pinjaman tepat nol dan total keluar tepat.
 *
 * Dasar potongan: **total kembali alokasi (pokok + Imbal Hasil)** — lihat
 * tabel kebijakan di kepala lib/bagiHasil.ts. Persentasenya dibaca dari Pengaturan Sistem (`persenAdmin`)
 * dan dihitung oleh lib/bagiHasil.ts dengan pembulatan ke bawah: sisa rupiah
 * selalu milik penyedia dana, tidak
 * pernah masuk ke kas admin. Alokasi yang sudah dibayar dicap `potonganAdmin`,
 * `imbalHasilNet`, dan `diselesaikanPada` sebagai bukti audit angka yang
 * benar-benar dibayarkan (bukan hitungan ulang saat pelaporan).
 */
export const repayLoan = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, args) => {
    const { userId, user } = await requirePeminjam(ctx);
    rejectUnverifiedMoneyMovement();
    // Gerbang lokasi: pelunasan hanya dilayani dengan GPS aktif & segar.
    await requireGerbangLokasi(ctx, userId, user);
    const loan = await ctx.db.get(args.loanId);
    if (loan === null) throw new Error("Pinjaman tidak ditemukan.");
    if (loan.userId !== userId) throw new Error("Bukan pinjaman Anda.");
    if (loan.status !== "didanai") {
      throw new Error("Hanya pinjaman berstatus Didanai yang dapat dilunasi.");
    }

    const now = Date.now();
    if (loan.didanaiPada === undefined) {
      throw new Error("Pinjaman ini belum memiliki waktu mulai berjalan yang valid.");
    }
    const cfg = await getConfig(ctx);
    const pelunasan = pelunasanInfo(loan, now, cfg.persenDendaKeterlambatan);
    if (pelunasan === null) {
      throw new Error("Kewajiban pelunasan tidak dapat dihitung untuk pinjaman ini.");
    }

    // Skema bulanan: bunga = hak penyedia dana; skema harian: bunga dari
    // quoteLoan (menghormati snapshot bunga nasabah). Kedua skema memotong
    // biaya admin & platform DI MUKA saat pencairan (jurnalnya di
    // convex/alokasiDana.ts), jadi pelunasan tidak memuat biaya tambahan.
    // simBulanan tetap dipakai untuk total Imbal Hasil.
    const simBulanan =
      loan.tenorBulan !== undefined
        ? simulasiBulananPinjaman({ ...loan, tenorBulan: loan.tenorBulan })
        : null;
    const q = quotePinjaman(loan);
    const totalKewajibanDana = loan.pokokPinjaman + (simBulanan !== null ? simBulanan.bungaTotal : q.bunga);
    // Potongan di muka (biaya admin 2%, biaya platform dihapus) sudah dipotong saat
    // pencairan. Yang tersisa di pelunasan hanya biaya admin cicilan 2% untuk
    // setiap pembayaran bulanan, yang memang dibayar bersama cicilan.
    const feePlatform = 0;
    const feeAdmin = simBulanan !== null ? simBulanan.biayaAdminCicilanTotal : 0;

    const fundings = await ctx.db
      .query("fundings")
      .withIndex("by_loan", (q2) => q2.eq("loanId", args.loanId))
      .collect();
    const aktif = fundings.filter((f) => f.status === "dialokasikan");
    if (aktif.length === 0) {
      throw new Error("Tidak ada posisi alokasi dana aktif pada pinjaman ini.");
    }

    // 1. Kas masuk: total kewajiban (+ denda bila terlambat). Denda dijurnal
    //    ke platform:FEE agar pembukuan kewajiban tetap bersih diaudit.
    const cashLines: Array<{
      akun: string;
      arah: "debit" | "kredit";
      jumlah: number;
    }> = [
      {
        akun: "platform:CASH",
        arah: "debit",
        jumlah: totalKewajibanDana + feePlatform + feeAdmin,
      },
      { akun: `pinjaman:${args.loanId}`, arah: "kredit", jumlah: totalKewajibanDana },
    ];
    if (pelunasan.dendaTerlambat > 0) {
      cashLines.push(
        { akun: "platform:CASH", arah: "debit", jumlah: pelunasan.dendaTerlambat },
        { akun: "platform:FEE", arah: "kredit", jumlah: pelunasan.dendaTerlambat },
      );
    }
    await appendJournal(ctx, {
      jenis: "repayment",
      skema: "pinjaman",
      keterangan: simBulanan !== null
        ? pelunasan.hariTerlambat > 0
          ? `Pelunasan ${loan.nomorReferensi} — skema bulanan + denda ${pelunasan.hariTerlambat} hari (${pelunasan.dendaTerlambat})`
          : `Pelunasan ${loan.nomorReferensi} — total cicilan skema bulanan`
        : pelunasan.hariTerlambat > 0
          ? `Pelunasan ${loan.nomorReferensi} — pokok + bunga + denda ${pelunasan.hariTerlambat} hari (${pelunasan.dendaTerlambat})`
          : `Pelunasan ${loan.nomorReferensi} — pokok + bunga`,
      aktor: userId,
      lines: cashLines,
    });

    // 2. Bayar tiap penyedia dana: pokok bagian + imbal hasil bagian (dari akun
    //    pinjaman). Urut dari alokasi terbesar — dust pembulatan diterimanya.
    aktif.sort((a, b) => b.jumlahAlokasi - a.jumlahAlokasi);
    // Hak pendana dibayar dari SNAPSHOT alokasinya (porsi 47 : 13 atas marjin
    // bagian). Perpanjangan atau cicil pokok di sisi peminjam tidak boleh
    // mengubah angka ini.
    const imbalBagian = aktif.map((f) => ({
      funding: f,
      imbal: f.imbalHasil,
    }));
    const totalHakPendana = imbalBagian.reduce(
      (acc, x) => acc + x.funding.jumlahAlokasi + x.imbal,
      0,
    );
    const totalImbalPendana = imbalBagian.reduce((acc, x) => acc + x.imbal, 0);
    const totalBungaNasabah = totalKewajibanDana - loan.pokokPinjaman;
    const marginSpread = totalBungaNasabah - totalImbalPendana;

    let terdistribusi = 0;
    let totalPotonganAdmin = 0;
    let totalKelebihan = 0;
    for (const { funding: f, imbal } of imbalBagian) {
      // Potongan admin dari POKOK alokasi ini — kebijakan Pengaturan Sistem.
      // Dipotong per alokasi, bukan sekali atas total pinjaman, supaya urutan
      // pendaftaran penyedia dana tidak mengubah hak siapa pun.
      const brutoBagian = f.jumlahAlokasi + imbal;
      // Alokasi bersiklus memakai snapshot biaya siklus (5% pokok) dan tujuan
      // pembayaran yang ditentukan status siklus. Baris lama tetap memakai
      // kebijakan biaya global di atas.
      let potonganAdmin: number;
      let imbalBersih: number;
      let akunPayout: string;
      let kelebihan = 0;
      // Bagian bunga nasabah yang benar-benar menjadi milik alokasi ini.
      // Dipakai untuk menghitung keuntungan putaran platform secara jujur;
      // tarif tenor pendek bisa lebih rendah dari snapshot 30% pendana.
      const bungaAktualBagian =
        loan.pokokPinjaman > 0
          ? Math.floor((totalBungaNasabah * f.jumlahAlokasi) / loan.pokokPinjaman)
          : 0;
      const jalurSiklus = await pembayaranSiklus(ctx, {
        ...f,
        bungaAktual: bungaAktualBagian,
        pelunasanPenuh: true,
      });
      if (jalurSiklus !== null) {
        potonganAdmin = jalurSiklus.potonganAdmin;
        imbalBersih = jalurSiklus.imbalBersih;
        akunPayout = jalurSiklus.akun;
        kelebihan = jalurSiklus.kelebihan;
      } else {
        // Baris lama tanpa siklus tetap memakai kebijakan biaya terkini:
        // potongan dihitung dari total kembali (pokok + Imbal Hasil).
        potonganAdmin = potonganDariKembali(brutoBagian, cfg.persenAdmin);
        imbalBersih = brutoBagian - potonganAdmin;
        akunPayout = akunDompetDana(f.danaId);
      }
      const payout = imbalBersih;
      await appendJournal(ctx, {
        jenis: "payout",
        skema: "pinjaman",
        keterangan:
          potonganAdmin > 0
            ? `Pelunasan: pembayaran ke ${f.nomorReferensi} (${loan.nomorReferensi}) — uang yang kembali bagian penyedia ${brutoBagian}, potongan admin ${cfg.persenAdmin}% sebesar ${potonganAdmin}, dibayarkan ${imbalBersih}`
            : `Pelunasan: pembayaran ke ${f.nomorReferensi} (${loan.nomorReferensi})`,
        aktor: "platform",
        lines: [
          // Debit menaikkan saldo dompet penyedia dana; kredit menurunkan akun pinjaman.
          // Putaran modal yang hak siklusnya sudah dibayar bisa menghasilkan
          // payout nol; baris nol tidak boleh masuk jurnal.
          ...(payout > 0
            ? [{ akun: akunPayout, arah: "debit" as const, jumlah: payout }]
            : []),
          // Potongan admin masuk kas admin; hanya ditulis bila ada nilainya.
          ...(potonganAdmin > 0
            ? [
                {
                  akun: "platform:FEE",
                  arah: "debit" as const,
                  jumlah: potonganAdmin,
                },
              ]
            : []),
          // Bagian yang melebihi hak siklus (mis. pembayaran kedua) menjadi
          // pemulihan jaminan platform, bukan tambahan dompet pendana.
          ...(kelebihan > 0
            ? [
                {
                  akun: "platform:GUARANTEE",
                  arah: "debit" as const,
                  jumlah: kelebihan,
                },
              ]
            : []),
          { akun: `pinjaman:${args.loanId}`, arah: "kredit", jumlah: f.jumlahAlokasi + imbal },
        ],
      });
      terdistribusi += payout;
      totalPotonganAdmin += potonganAdmin;
      totalKelebihan += kelebihan;
      // Cap bukti audit: berapa bruto, berapa dipotong, berapa dibayarkan.
      const siklus = siklusPendanaan(f.jumlahAlokasi, loan);
      await ctx.db.patch(f._id, {
        imbalHasil: imbal,
        periodDuration: siklus.periodDuration,
        expectedReturnRate: siklus.expectedReturnRate,
        lenderProfit: imbal - potonganAdmin,
        potonganAdmin,
        imbalHasilNet: imbalBersih,
        diselesaikanPada: now,
      });
    }

    // Bunga nasabah di atas kewajiban 30% pendana adalah margin platform,
    // bukan bagian hak pendana. Ia dicatat ke akun tersendiri supaya biaya
    // layanan (`platform:FEE`) dan margin tenor tidak tertukar. Sisa selisih
    // (bila alokasi warisan tidak sama dengan pokok pinjaman) tetap menjadi
    // penyesuaian pokok di platform:FEE.
    const selisihHak = totalKewajibanDana - totalHakPendana;
    await catatMarginSpread(ctx, {
      loanId: args.loanId,
      referensi: loan.nomorReferensi,
      margin: marginSpread,
      bungaNasabah: totalBungaNasabah,
      hakPendana: totalImbalPendana,
    });
    const penyesuaianPokok = selisihHak - marginSpread;
    if (penyesuaianPokok !== 0) {
      await appendJournal(ctx, {
        jenis: "principal_adjustment",
        skema: "pinjaman",
        keterangan: `Penyesuaian pokok pendanaan ${loan.nomorReferensi}`,
        aktor: "platform",
        lines:
          penyesuaianPokok > 0
            ? [
                { akun: `pinjaman:${args.loanId}`, arah: "debit", jumlah: penyesuaianPokok },
                {
                  akun: AKUN_PLATFORM_PRINCIPAL_CLEARING,
                  arah: "kredit",
                  jumlah: penyesuaianPokok,
                },
              ]
            : [
                {
                  akun: AKUN_PLATFORM_PRINCIPAL_CLEARING,
                  arah: "debit",
                  jumlah: -penyesuaianPokok,
                },
                { akun: `pinjaman:${args.loanId}`, arah: "kredit", jumlah: -penyesuaianPokok },
              ],
      });
    }

    // 3. Biaya tenor dipotong di muka saat pencairan (convex/alokasiDana.ts);
    //    yang dijurnal di sini hanya biaya admin cicilan tiap pembayaran bulanan
    //    (feePlatform selalu nol). Jurnal dibuat seimbang: debit platform:FEE, kredit akun
    //    pinjaman yang menanggung biaya.
    if (feePlatform + feeAdmin > 0) {
      await appendJournal(ctx, {
        jenis: "platform_fee",
        skema: "pinjaman",
        keterangan: `Biaya admin cicilan ${loan.nomorReferensi} (skema bulanan)`,
        aktor: "platform",
        lines: [
          { akun: "platform:FEE", arah: "debit", jumlah: feePlatform + feeAdmin },
          { akun: `pinjaman:${args.loanId}`, arah: "kredit", jumlah: feePlatform + feeAdmin },
        ],
      });
    }

    // 4. Sanity: total kas masuk (kewajiban + denda) = payout ke penyedia dana +
    //    potongan admin dari pokok + fee + denda. Gagal = rollback.
    //    Potongan admin TIDAK menambah kas (ia bagian dari kewajiban yang sudah
    //    masuk), jadi ia dikurangkan dari sisi yang dibayarkan — bukan ditambah.
    const totalKasMasuk = totalKewajibanDana + feePlatform + feeAdmin + pelunasan.dendaTerlambat;
    const totalDibayarkan =
      terdistribusi +
      totalPotonganAdmin +
      totalKelebihan +
      selisihHak +
      feePlatform +
      feeAdmin +
      pelunasan.dendaTerlambat;
    if (totalKasMasuk !== totalDibayarkan) {
      throw new Error(
        `Pelunasan tidak seimbang: selisih ${totalKasMasuk - totalDibayarkan}. Transaksi dibatalkan.`,
      );
    }

    // 5. Tutup posisi alokasi penyedia dana — posisi selesai setelah dibayar penuh.
    for (const f of aktif) {
      await ctx.db.patch(f._id, { status: "selesai" });
    }

    await ctx.db.patch(args.loanId, {
      status: "lunas",
      lunasPada: now,
      ...(pelunasan.dendaTerlambat > 0
        ? { dendaTerlambat: pelunasan.dendaTerlambat }
        : {}),
    });

    // Hanya pinjaman tunai pokok ≥Rp1 juta yang lunas paling lambat saat
    // jatuh tempo menghasilkan satu tahap kenaikan. Plafon diturunkan dari
    // riwayat loan yang sebenarnya; penanda warisan bukan bukti kelayakan.
    const lunasUntukPlafon = {
      ...loan,
      status: "lunas",
      lunasPada: now,
    };
    const tepatWaktu = apakahPelunasanTepatWaktu(lunasUntukPlafon);
    if (tepatWaktu) {
      await audit(
        ctx,
        userId,
        user.email ?? user.name ?? "peminjam",
        "plafon_naik_otomatis",
        loan.nomorReferensi,
        `Pinjaman tunai ${formatRupiah(loan.pokokPinjaman)} lunas tepat waktu; plafon dasar bertambah ${formatRupiah(PLAFON_KENAIKAN_PER_PELUNASAN)} hingga maksimum ${formatRupiah(PLAFON_NAIK_SETELAH_LUNAS)}. Override admin tetap berlaku.`,
      );
    }

    // Tiket Doorprize Emas: satu untuk peminjam yang lunas tepat waktu, dan
    // satu per kelipatan Rp1 juta untuk tiap penyedia dana yang siklusnya
    // selesai. Idempoten pada referensi, jadi aman bila pelunasan dicatat ulang.
    await beriTiketPelunasan(ctx, {
      pemilikId: loan.userId,
      nomorReferensi: loan.nomorReferensi,
      tepatWaktu,
      waktu: now,
    });
    // Voucher apresiasi terbit untuk setiap pinjaman yang lunas. Idempoten
    // lewat nomor referensi, jadi aman bila pelunasan dicatat ulang oleh admin.
    await beriVoucherApresiasi(ctx, { loan: lunasUntukPlafon, sekarang: now });
    await selesaikanReferralPelunasan(ctx, { loan: lunasUntukPlafon, sekarang: now });
    for (const { funding } of imbalBagian) {
      await beriTiketPendanaan(ctx, {
        pemilikId: funding.danaId,
        nomorReferensi: funding.nomorReferensi,
        jumlahAlokasi: funding.jumlahAlokasi,
        waktu: now,
      });
    }

    // Auto-matching: pokok tenor 7/14 hari kembali ke pool dan menunggu
    // peminjam berikutnya. Tenor 28 hari tetap di luar antrean cepat.
    await catatDanaKembali(ctx, loan, now);

    return {
      totalDibayar: totalKasMasuk,
      dendaTerlambat: pelunasan.dendaTerlambat,
      hariTerlambat: pelunasan.hariTerlambat,
      /** Potongan admin atas Imbal Hasil seluruh penyedia dana pada pinjaman ini. */
      potonganAdmin: totalPotonganAdmin,
      persenPotonganAdmin: cfg.persenAdmin,
    };
  },
});

/** Perubahan status terkait pelepasan ditutup sampai pembayaran dan serah-terima terverifikasi. */
export const requestPawnRelease = mutation({
  args: { pawnId: v.id("pawns") },
  handler: async (ctx) => {
    await requirePeminjam(ctx);
    rejectUnverifiedMoneyMovement();
  },
});

/**
 * Admin menandai gadai aktif setelah dana pencairan gadai dibayarkan ke
 * nasabah — memungkinkan alur pelepasan barang di kemudian hari.
 */
export const activatePawn = mutation({
  args: { pawnId: v.id("pawns") },
  handler: async (ctx) => {
    await requireAdmin(ctx);
    rejectUnverifiedMoneyMovement();
  },
});

/** Admin melepas barang — menandai gadai selesai sepenuhnya. */
export const releasePawn = mutation({
  args: { pawnId: v.id("pawns") },
  handler: async (ctx) => {
    await requireAdmin(ctx);
    rejectUnverifiedMoneyMovement();
  },
});

/** Internal helper dipakai oleh skrip/seed nanti — tidak diekspor ke HTTP. */
export const _internalSetLoanStatus = internalMutation({
  args: {
    loanId: v.id("loans"),
    status: loanStatusValidator,
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Jalur internal (seed/migrasi) tidak melalui dialog admin, jadi tidak ada
    // alasan yang diketik: pakai alasan sistem agar aturan tetap terpenuhi.
    await setLoanStatus(
      ctx,
      args.loanId,
      args.status,
      args.reason ?? "Perubahan status oleh sistem internal.",
    );
  },
});

// =====================================================================
// Pengingat jatuh tempo — cron harian, append-only, idempoten
// =====================================================================

function startOfUtcDay(now: number): number {
  return Math.floor(now / DAY_MS) * DAY_MS;
}

/** Inti sweep pengingat — dipakai cron harian dan aksi admin manual. */
async function generateRemindersHandler(ctx: MutationCtx) {
  const now = Date.now();
  const tanggal = startOfUtcDay(now);
  const loans = await ctx.db
    .query("loans")
    .withIndex("by_status", (q) => q.eq("status", "didanai"))
    .collect();

  let created = 0;
  let skipped = 0;
  const tarifDenda = await tarifDendaBerlaku(ctx);
  for (const loan of loans) {
    const info = pelunasanInfo(loan, now, tarifDenda);
    if (info === null) continue;
    if (info.sisaHari > 3) continue; // hanya H-3, H-0, dan terlambat

    const jenis =
      info.hariTerlambat > 0
        ? "terlambat"
        : info.sisaHari === 0
          ? "jatuh_tempo"
          : "h_minus_3";

    const existing = await ctx.db
      .query("pengingat")
      .withIndex("by_loan", (q) => q.eq("loanId", loan._id))
      .collect();
    const sudah = existing.some(
      (p) => p.tanggal === tanggal && p.jenis === jenis,
    );
    if (sudah) {
      skipped += 1;
      continue;
    }

    await ctx.db.insert("pengingat", {
      loanId: loan._id,
      tanggal,
      jenis,
      sisaHari: info.hariTerlambat > 0 ? -info.hariTerlambat : info.sisaHari,
      jumlahKewajiban: info.totalKewajibanDenganPenalti,
      waktu: now,
    });
    created += 1;
  }
  return { created, skipped, tanggal };
}

/**
 * Cron harian: tulis pengingat jatuh tempo untuk semua pinjaman berstatus
 * Didanai. Idempoten per (loan, tanggal): pemanggilan ulang di hari yang sama
 * tidak menulis apa pun (proteksi duplikat). Append-only — tidak pernah
 * mengubah/menghapus pengingat lama.
 */
export const generateDueReminders = internalMutation({
  args: {},
  handler: async (ctx) => {
    const hasil = await generateRemindersHandler(ctx);
    await catatDenyut(ctx, "daily-due-reminders");
    return hasil;
  },
});

/**
 * Jalankan sweep pengingat secara manual (admin) — sama persis dengan cron
 * harian; tetap idempoten per hari sehingga aman dipanggil kapan saja.
 */
export const runDueReminderSweep = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return generateRemindersHandler(ctx);
  },
});

/**
 * Pengingat hari ini untuk Peminjam — hasil cron yang sudah tercatat untuk
 * pinjaman miliknya. Jujur kosong saat cron belum berjalan.
 */
export const myRemindersToday = query({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requirePeminjam(ctx);
    const tanggal = startOfUtcDay(Date.now());
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const loanIds = new Set(loans.map((l) => l._id));
    const reminders = await ctx.db
      .query("pengingat")
      .withIndex("by_tanggal", (q) => q.eq("tanggal", tanggal))
      .collect();
    return reminders
      .filter((r) => loanIds.has(r.loanId))
      .map((r) => ({
        _id: r._id,
        loanId: r.loanId,
        jenis: r.jenis,
        sisaHari: r.sisaHari,
        jumlahKewajiban: r.jumlahKewajiban,
      }));
  },
});

/**
 * QA/dev helper: mundurkan tanggal pendanaan pinjaman `hariLalu` hari
 * (hari berjalan tanpa menunggu tenor). Internal — hanya via CLI
 * Convex (`bunx convex run loans:qaBackdateDidanai '{"loanId":"...","hariLalu":31}'`).
 */
export const qaBackdateDidanai = internalMutation({
  args: { loanId: v.id("loans"), hariLalu: v.number() },
  handler: async (ctx, args) => {
    const loan = await ctx.db.get(args.loanId);
    if (loan === null) throw new Error("Pinjaman tidak ditemukan.");
    if (loan.status !== "didanai") {
      throw new Error("Hanya pinjaman berstatus Didanai yang bisa di-backdate.");
    }
    if (!Number.isSafeInteger(args.hariLalu) || args.hariLalu < 0) {
      throw new Error("hariLalu harus bilangan bulat non-negatif.");
    }
    await ctx.db.patch(args.loanId, {
      didanaiPada: Date.now() - args.hariLalu * DAY_MS,
    });
    return { success: true };
  },
});
