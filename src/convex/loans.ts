import { getAuthUserId } from "@convex-dev/auth/server";
import {
  internalMutation,
  mutation,
  query,
  MutationCtx,
  QueryCtx,
} from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import {
  ROLES,
  loanStatusValidator,
  LoanStatusValue,
  PawnStatusValue,
} from "./schema";
import {
  pesanPlafonTerlampaui,
  PLAFON_POKOK_MINIMUM_LUNAS,
  plafonPeminjam,
  pokokDalamPlafon,
} from "../lib/plafon";
import { assertPokokPinjamanValid,
  calculateRepayment,
  pelunasanPinjaman,
  quoteLoan,
  TENOR_OPTIONS,
} from "../lib/loan";
import {
  assertSimulasiBulananValid,
  hitungSimulasiBulanan,
  TENOR_BULANAN_OPTIONS,
} from "../lib/bulanan";
import { formatRupiah, type Rupiah } from "../lib/money";
import { COLLATERAL_CATEGORIES } from "../lib/pawn";
import { appendJournal } from "./ledger";
import { getConfig, audit } from "./system";
import { requireGerbangLokasi } from "./lokasi";
import { requireAdminSession } from "./adminAuthz";

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
  return { userId, user };
}

/**
 * Role gate for v1: Peminjam. A user without an explicit role is promoted to
 * Peminjam on first application activity; Pendana is reserved for a later phase.
 */
async function requirePeminjam(ctx: QueryCtx) {
  const { userId, user } = await requireUser(ctx);
  if (user.role === ROLES.PENDANA) {
    throw new Error(
      "Akun Pendana tidak dapat mengajukan. Gunakan akun Peminjam.",
    );
  }
  return { userId, user };
}

function referenceNumber(now: number): string {
  const date = new Date(now).toISOString().slice(0, 10).replace(/-/g, "");
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

export const createLoanApplication = mutation({
  args: {
    pokokPinjaman: v.number(),
    tujuan: v.string(),
    namaLengkap: v.string(),
    nomorRekening: v.string(),
    catatanPeminjam: v.optional(v.string()),
    /** Tanda tangan digital peminjam (canvas → data URL PNG, opsional). */
    tandaTangan: v.optional(v.string()),
    /**
     * Tenor pinjaman dalam hari (skema 1 jt / 30 hari) — divalidasi server
     * terhadap opsi resmi. Diabaikan bila `tenorBulan` disertakan.
     */
    tenorHari: v.number(),
    /**
     * Tenor bulanan (skema bulanan: DP 0%, layanan 3%, bunga 10/8/7,5% per
     * bulan) — pinjaman DI LUAR plafon 1 jt / 30 hari. Bila diisi, `tenorHari`
     * diabaikan.
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
  },
  returns: v.object({ appId: v.id("loans"), nomorReferensi: v.string() }),
  handler: async (ctx, args) => {
    const { userId, user } = await requirePeminjam(ctx);
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
    // Batas pinjaman tunai: Rp 100.000 s.d. PLAFON NASABAH (default global
    // 1 juta, admin bisa naikkan/turunkan per orang — lib/plafon.ts).
    // Skema bulanan (tenorBulan diisi) memakai mesin yang sama dengan plafon
    // yang sama; plafon hanya memotong sisi atas pokok.
    const plafon = await plafonPeminjam(ctx, userId);
    if (!pokokDalamPlafon(args.pokokPinjaman, plafon)) {
      throw new Error(pesanPlafonTerlampaui(plafon));
    }
    let tenorBulanSim: number | undefined;
    if (args.tenorBulan !== undefined) {
      if (!(TENOR_BULANAN_OPTIONS as readonly number[]).includes(args.tenorBulan)) {
        throw new Error(
          `Tenor bulanan harus salah satu dari ${TENOR_BULANAN_OPTIONS.join(" / ")} bulan.`,
        );
      }
      assertSimulasiBulananValid(args.pokokPinjaman, args.tenorBulan);
      tenorBulanSim = args.tenorBulan;
    } else {
      assertPokokPinjamanValid(args.pokokPinjaman);
    }
    // Server-side pricing engine — fee fields are never accepted from the client.
    const quote = quoteLoan(args.pokokPinjaman);
    if (tenorBulanSim === undefined && !(TENOR_OPTIONS as readonly number[]).includes(args.tenorHari)) {
      throw new Error(
        `Tenor harus salah satu dari ${TENOR_OPTIONS.join(" / ")} hari (maksimal 30 hari).`,
      );
    }

    const trimmedName = args.namaLengkap.trim();
    const trimmedAccount = args.nomorRekening.trim().replace(/\s+/g, "");
    if (trimmedName.length < 3) {
      throw new Error("Nama lengkap wajib diisi (minimal 3 karakter).");
    }
    if (!/^\d{6,20}$/.test(trimmedAccount)) {
      throw new Error("Nomor rekening harus 6–20 digit angka.");
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
    // Dokumen wajib benar-benar ada di storage.
    for (const [label, id] of [
      ["Foto KTP", args.dokKtpId],
      ["Selfie dengan KTP", args.dokSelfieKtpId],
      ["Slip gaji / bukti penghasilan", args.dokSlipGajiId],
    ] as const) {
      const meta = await ctx.storage.getMetadata(id);
      if (meta === null) {
        throw new Error(`${label} wajib diunggah.`);
      }
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

    // Tanda tangan digital (opsional tapi divalidasi ketat saat ada).
    let tandaTangan: string | undefined;
    if (args.tandaTangan !== undefined) {
      if (!args.tandaTangan.startsWith("data:image/png;base64,")) {
        throw new Error("Format tanda tangan tidak valid.");
      }
      if (args.tandaTangan.length > 200_000) {
        throw new Error("Data tanda tangan terlalu besar.");
      }
      tandaTangan = args.tandaTangan;
    }

    if (user.role === undefined) {
      await ctx.db.patch(userId, { role: ROLES.PEMINJAM });
    }

    const now = Date.now();
    const nomorReferensi = referenceNumber(now);
    const loanId = await ctx.db.insert("loans", {
      userId,
      pokokPinjaman: quote.pokok,
      tujuan: args.tujuan.trim(),
      catatanPeminjam: args.catatanPeminjam?.trim() || undefined,
      namaLengkap: trimmedName,
      nomorRekening: trimmedAccount,
      status: "diajukan",
      nomorReferensi,
      tenorHari: args.tenorHari,
      tenorBulan: tenorBulanSim,
      nik,
      nomorWhatsApp: wa,
      penghasilanBulanan: args.penghasilanBulanan,
      sumberPenghasilan: args.sumberPenghasilan.trim(),
      dokKtpId: args.dokKtpId,
      dokSelfieKtpId: args.dokSelfieKtpId,
      dokSlipGajiId: args.dokSlipGajiId,
      lokasiAjukan: { ...lok, waktu: now },
      tandaTanganPeminjam: tandaTangan,
      tandaTanganPada: tandaTangan !== undefined ? now : undefined,
    });
    return { appId: loanId, nomorReferensi };
  },
});

/**
 * Turunan pelunasan live untuk satu pinjaman didanai: jatuh tempo, sisa hari,
 * hari terlambat, denda, dan total kewajiban saat ini — satu sumber kebenaran
 * dari lib/loan.ts (skema harian 130% dan skema bulanan).
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
        tujuan: l.tujuan,
        status: l.status,
        catatanReview: l.catatanReview,
        tenorBulan: l.tenorBulan ?? null,
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
    const pelunasan =
      loan.status === "didanai" && loan.didanaiPada !== undefined
        ? calculateRepayment(
            loan.pokokPinjaman,
            loan.tenorHari ?? DEFAULT_TENOR_HARI,
            loan.didanaiPada,
            Date.now(),
          )
        : null;
    // Skema bulanan: kewajiban diturunkan dari mesin bulanan, bukan 130%.
    const sim =
      loan.tenorBulan !== undefined
        ? hitungSimulasiBulanan(loan.pokokPinjaman, loan.tenorBulan)
        : null;
    return {
      _id: loan._id,
      _creationTime: loan._creationTime,
      nomorReferensi: loan.nomorReferensi,
      pokokPinjaman: loan.pokokPinjaman,
      tujuan: loan.tujuan,
      status: loan.status,
      catatanReview: loan.catatanReview,
      tenorHari: loan.tenorHari ?? null,
      tenorBulan: loan.tenorBulan ?? null,
      quote: quoteLoan(loan.pokokPinjaman),
      imbalHasilTotal: sim !== null ? sim.bungaTotal : quoteLoan(loan.pokokPinjaman).bunga,
      totalKewajiban: sim !== null ? sim.totalPengembalian : quoteLoan(loan.pokokPinjaman).totalKewajibanPelunasan,
      pelunasan,
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
          status: l.status,
          tandaTanganAda: l.tandaTanganPeminjam !== undefined,
          tandaTanganPada: l.tandaTanganPada ?? null,
          createdAt: l._creationTime,
          nik: l.nik ?? null,
          namaLengkap: l.namaLengkap,
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
    return loans
      .filter((l) => l.status === "didanai" || l.status === "lunas")
      .sort((a, b) => b._creationTime - a._creationTime)
      .map((l) => {
        const info = pelunasanInfo(l, now);
        return {
          _id: l._id,
          nomorReferensi: l.nomorReferensi,
          pokokPinjaman: l.pokokPinjaman,
          status: l.status,
          tenorHari: l.tenorHari ?? DEFAULT_TENOR_HARI,
          tenorBulan: l.tenorBulan ?? null,
          didanaiPada: l.didanaiPada ?? null,
          quote: quoteLoan(l.pokokPinjaman),
          imbalHasilTotal:
            l.tenorBulan !== undefined
              ? hitungSimulasiBulanan(l.pokokPinjaman, l.tenorBulan).bungaTotal
              : quoteLoan(l.pokokPinjaman).bunga,
          totalKewajiban:
            l.tenorBulan !== undefined
              ? hitungSimulasiBulanan(l.pokokPinjaman, l.tenorBulan).totalPengembalian
              : quoteLoan(l.pokokPinjaman).totalKewajibanPelunasan,
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

    for (const loan of loans) {
      if (loan.status !== "didanai") continue;
      const info = pelunasanInfo(loan, Date.now());
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
    nomorRekening: v.string(),
    catatanPeminjam: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, user } = await requirePeminjam(ctx);
    // Gerbang lokasi: gadai juga hanya dilayani dengan GPS aktif & segar.
    await requireGerbangLokasi(ctx, userId, user);
    // Kill switch: blokir seluruh pengajuan baru saat darurat.
    const sys = await getConfig(ctx);
    if (sys.killSwitch) {
      throw new Error(
        "Pengajuan sementara dihentikan oleh sistem (kill switch aktif). Coba lagi nanti.",
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
    const nama = args.namaLengkap.trim();
    if (nama.length < 3) {
      throw new Error("Nama lengkap wajib diisi (minimal 3 karakter).");
    }
    const rekening = args.nomorRekening.trim().replace(/\s+/g, "");
    if (!/^\d{6,20}$/.test(rekening)) {
      throw new Error("Nomor rekening harus 6–20 digit angka.");
    }

    if (user.role === undefined) {
      await ctx.db.patch(userId, { role: ROLES.PEMINJAM });
    }

    await ctx.db.insert("pawns", {
      userId,
      deskripsiBarang: deskripsi,
      kategori: args.kategori,
      alamatPenilaian: alamat,
      namaLengkap: nama,
      nomorRekening: rekening,
      catatanPeminjam: args.catatanPeminjam?.trim() || undefined,
      status: "diajukan",
      nomorReferensi: referenceNumber(Date.now()),
    });
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

async function setLoanStatus(
  ctx: MutationCtx,
  loanId: Id<"loans">,
  status: LoanStatusValue,
  catatan?: string,
) {
  const adminId = await requireAdmin(ctx);
  const loan = await ctx.db.get(loanId);
  if (loan === null) throw new Error("Aplikasi tidak ditemukan.");
  if (status === "diajukan") {
    throw new Error("Status tidak boleh dikembalikan ke diajukan.");
  }
  if (status === "ditolak" && (!catatan || catatan.trim().length === 0)) {
    throw new Error("Penolakan wajib menyertakan alasan.");
  }
  await ctx.db.patch(loanId, {
    status,
    catatanReview: catatan?.trim() || undefined,
  });
  const admin = await ctx.db.get(adminId);
  await audit(
    ctx,
    adminId,
    admin?.email ?? admin?.name ?? "admin",
    `loan_${status}`,
    loan.nomorReferensi,
    `${loan.namaLengkap} — ${status}${catatan ? `: ${catatan}` : ""}`,
  );
}

export const markLoanInReview = mutation({
  args: { loanId: v.id("loans") },
  handler: (ctx, args) => setLoanStatus(ctx, args.loanId, "sedang_direview"),
});

export const approveLoan = mutation({
  args: { loanId: v.id("loans") },
  handler: (ctx, args) => setLoanStatus(ctx, args.loanId, "disetujui"),
});

export const rejectLoan = mutation({
  args: { loanId: v.id("loans"), reason: v.string() },
  handler: (ctx, args) => setLoanStatus(ctx, args.loanId, "ditolak", args.reason),
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

export const rejectPawn = mutation({
  args: { pawnId: v.id("pawns"), reason: v.string() },
  handler: (ctx, args) =>
    setPawnStatus(ctx, args.pawnId, "ditolak", { catatan: args.reason }),
});

// =====================================================================
// Pelunasan (repayment) & pelepasan barang gadai
// =====================================================================

/**
 * Pelunasan oleh Peminjam — skema harian: total kewajiban 130% dari pokok;
 * skema bulanan (tenorBulan): Σ cicilan + biaya layanan (fee platform).
 * Jurnal (semua dalam satu mutation transaksional, append-only):
 *   1. D platform:CASH total kewajiban | K pinjaman:<id>
 *   2. D pinjaman:<id> p_i+im_i | K pendana:WALLET:i  (bayar tiap Pendana)
 * Dust pembulatan proporsi imbal hasil diberikan ke Pendana dengan alokasi
 * terbesar, sehingga akun pinjaman tepat nol dan total keluar tepat.
 */
export const repayLoan = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, args) => {
    const { userId, user } = await requirePeminjam(ctx);
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
      throw new Error("Pinjaman ini belum memiliki waktu pendanaan yang valid.");
    }
    const pelunasan = pelunasanInfo(loan, now);
    if (pelunasan === null) {
      throw new Error("Kewajiban pelunasan tidak dapat dihitung untuk pinjaman ini.");
    }

    // Skema bulanan: fee platform = biaya layanan 3%; bunga = hak Pendana.
    // Skema harian: bunga 30% dari quoteLoan (fee sudah dipotong di muka).
    const simBulanan =
      loan.tenorBulan !== undefined
        ? hitungSimulasiBulanan(loan.pokokPinjaman, loan.tenorBulan)
        : null;
    const q = quoteLoan(loan.pokokPinjaman);
    const totalPokokPendana = loan.pokokPinjaman;
    const totalImbalPendana = simBulanan !== null ? simBulanan.bungaTotal : q.bunga;
    const totalKewajibanPendana = totalPokokPendana + totalImbalPendana;
    const feePlatform =
      simBulanan !== null ? simBulanan.biayaLayananTotal : q.totalKewajibanPelunasan - q.pokok - q.bunga;

    const fundings = await ctx.db
      .query("fundings")
      .withIndex("by_loan", (q2) => q2.eq("loanId", args.loanId))
      .collect();
    const aktif = fundings.filter((f) => f.status === "dialokasikan");
    if (aktif.length === 0) {
      throw new Error("Tidak ada posisi Pendana aktif pada pinjaman ini.");
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
        jumlah: totalKewajibanPendana + feePlatform,
      },
      { akun: `pinjaman:${args.loanId}`, arah: "kredit", jumlah: totalKewajibanPendana },
    ];
    if (pelunasan.dendaTerlambat > 0) {
      cashLines.push(
        { akun: "platform:CASH", arah: "debit", jumlah: pelunasan.dendaTerlambat },
        { akun: "platform:FEE", arah: "kredit", jumlah: pelunasan.dendaTerlambat },
      );
    }
    await appendJournal(ctx, {
      jenis: "repayment",
      keterangan: simBulanan !== null
        ? pelunasan.hariTerlambat > 0
          ? `Pelunasan ${loan.nomorReferensi} — skema bulanan + denda ${pelunasan.hariTerlambat} hari (${pelunasan.dendaTerlambat})`
          : `Pelunasan ${loan.nomorReferensi} — total cicilan skema bulanan`
        : pelunasan.hariTerlambat > 0
          ? `Pelunasan ${loan.nomorReferensi} — 130% + denda ${pelunasan.hariTerlambat} hari (${pelunasan.dendaTerlambat})`
          : `Pelunasan ${loan.nomorReferensi} — total kewajiban 130%`,
      aktor: userId,
      lines: cashLines,
    });

    // 2. Bayar tiap Pendana: pokok bagian + imbal hasil bagian (dari akun
    //    pinjaman). Urut dari alokasi terbesar — dust pembulatan diterimanya.
    aktif.sort((a, b) => b.jumlahAlokasi - a.jumlahAlokasi);
    const imbalBagian = aktif.map((f) => ({
      funding: f,
      imbal: Math.floor((totalImbalPendana * f.jumlahAlokasi) / totalPokokPendana),
    }));
    const dust =
      totalImbalPendana - imbalBagian.reduce((acc, x) => acc + x.imbal, 0);
    imbalBagian[0].imbal += dust; // dust selalu >= 0 dan < jumlah Pendana

    let terdistribusi = 0;
    for (const { funding: f, imbal } of imbalBagian) {
      const payout = f.jumlahAlokasi + imbal;
      await appendJournal(ctx, {
        jenis: "payout",
        keterangan: `Pelunasan: pembayaran ke ${f.nomorReferensi} (${loan.nomorReferensi})`,
        aktor: "platform",
        lines: [
          // Debit menaikkan saldo dompet Pendana; kredit menurunkan akun pinjaman.
          { akun: `pendana:WALLET:${f.pendanaId}`, arah: "debit", jumlah: payout },
          { akun: `pinjaman:${args.loanId}`, arah: "kredit", jumlah: payout },
        ],
      });
      terdistribusi += payout;
    }

    // 3. Fee platform dijurnal dari akun pinjaman ke platform:FEE. Skema
    //    harian: totalPotonganDiMuka sudah dipotong saat pencairan (fee = 0).
    if (feePlatform > 0) {
      await appendJournal(ctx, {
        jenis: "platform_fee",
        keterangan: `Biaya layanan platform ${loan.nomorReferensi} (skema bulanan)`,
        aktor: "platform",
        lines: [
          { akun: "platform:FEE", arah: "debit", jumlah: feePlatform },
          { akun: `pinjaman:${args.loanId}`, arah: "kredit", jumlah: feePlatform },
        ],
      });
    }

    // 4. Sanity: total kas masuk (kewajiban + denda) = kewajiban ke akun
    //    pinjaman (payout Pendana + fee) + denda. Gagal = rollback penuh.
    const totalKasMasuk = totalKewajibanPendana + feePlatform + pelunasan.dendaTerlambat;
    if (totalKasMasuk !== terdistribusi + feePlatform + pelunasan.dendaTerlambat) {
      throw new Error(
        `Pelunasan tidak seimbang: selisih ${totalKasMasuk - terdistribusi - feePlatform - pelunasan.dendaTerlambat}. Transaksi dibatalkan.`,
      );
    }

    // 5. Tutup posisi alokasi Pendana — posisi selesai setelah dibayar penuh.
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

    // Kualifikasi naik plafon hanya saat pelunasan penuh pinjaman tunai
    // minimal Rp1 juta. Simpan penanda terpisah agar override admin tetap
    // berlaku dan reset override kelak kembali ke plafon otomatis Rp10 juta.
    if (
      loan.pokokPinjaman >= PLAFON_POKOK_MINIMUM_LUNAS &&
      user.plafonPinjamanNaikPada === undefined
    ) {
      await ctx.db.patch(userId, { plafonPinjamanNaikPada: now });
      await audit(
        ctx,
        userId,
        user.email ?? user.name ?? "peminjam",
        "plafon_naik_otomatis",
        loan.nomorReferensi,
        `Pinjaman tunai ${formatRupiah(loan.pokokPinjaman)} lunas penuh; plafon dasar naik menjadi Rp10.000.000. Override admin, bila ada, tetap berlaku.`,
      );
    }

    return {
      totalDibayar: totalKasMasuk,
      dendaTerlambat: pelunasan.dendaTerlambat,
      hariTerlambat: pelunasan.hariTerlambat,
    };
  },
});

/** Peminjam mengajukan pelepasan barang gadai yang sudah aktif. */
export const requestPawnRelease = mutation({
  args: { pawnId: v.id("pawns") },
  handler: async (ctx, args) => {
    const { userId } = await requirePeminjam(ctx);
    const pawn = await ctx.db.get(args.pawnId);
    if (pawn === null) throw new Error("Pengajuan gadai tidak ditemukan.");
    if (pawn.userId !== userId) throw new Error("Bukan pengajuan Anda.");
    if (pawn.status !== "aktif") {
      throw new Error(
        "Hanya gadai berstatus Aktif yang dapat diajukan pelepasan.",
      );
    }
    await ctx.db.patch(args.pawnId, { status: "menunggu_pelepasan" });
  },
});

/**
 * Admin menandai gadai aktif setelah dana pencairan gadai dibayarkan ke
 * nasabah — memungkinkan alur pelepasan barang di kemudian hari.
 */
export const activatePawn = mutation({
  args: { pawnId: v.id("pawns") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const pawn = await ctx.db.get(args.pawnId);
    if (pawn === null) throw new Error("Pengajuan gadai tidak ditemukan.");
    if (pawn.status !== "disetujui") {
      throw new Error(
        "Hanya gadai berstatus Disetujui yang dapat diaktifkan.",
      );
    }
    await ctx.db.patch(args.pawnId, { status: "aktif" });
  },
});

/** Admin melepas barang — menandai gadai selesai sepenuhnya. */
export const releasePawn = mutation({
  args: { pawnId: v.id("pawns") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const pawn = await ctx.db.get(args.pawnId);
    if (pawn === null) throw new Error("Pengajuan gadai tidak ditemukan.");
    if (pawn.status !== "menunggu_pelepasan") {
      throw new Error(
        "Pelepasan hanya untuk gadai berstatus Menunggu Pelepasan.",
      );
    }
    await ctx.db.patch(args.pawnId, { status: "lunas_dilepas" });
  },
});

/** Internal helper dipakai oleh skrip/seed nanti — tidak diekspor ke HTTP. */
export const _internalSetLoanStatus = internalMutation({
  args: {
    loanId: v.id("loans"),
    status: loanStatusValidator,
    reason: v.optional(v.string()),
  },
  handler: (ctx, args) =>
    setLoanStatus(ctx, args.loanId, args.status, args.reason),
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
  for (const loan of loans) {
    const info = pelunasanInfo(loan, now);
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
  handler: generateRemindersHandler,
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
 * (simulasi hari berjalan tanpa menunggu tenor). Internal — hanya via CLI
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
