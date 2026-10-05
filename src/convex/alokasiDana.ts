import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { ROLES } from "./schema";
import {
  DEFAULT_TENOR_HARI,
  pelunasanPinjaman,
  quotePinjaman,
  simulasiBulananPinjaman,
} from "../lib/loan";
import { hitungSimulasiBulanan, TENOR_BULANAN_OPTIONS } from "../lib/bulanan";
import {
  hakImbalHasilPerAlokasi,
  KREDIT_TENOR_BIAYA_ADMIN_PLATFORM,
  quoteKreditBarang,
} from "../lib/kredit";
import { formatRupiah, type Rupiah } from "../lib/money";
import { hitungBiayaPencairan } from "../lib/withdrawal";
import { kunciNamaPendana, pinjamanMilikPendana } from "./pendanaKepemilikan";
import { bagiHasilPinjaman } from "../lib/bagiHasil";
import { akunDompetDana, appendJournal, danaWalletBalance } from "./ledger";
import { getConfig } from "./system";
import { rejectUnverifiedMoneyMovement } from "./paymentGuard";

/** Rentang bisnis alokasi pendanaan per transaksi. */
export const MIN_ALOKASI = 100_000;
export const MAX_ALOKASI = 500_000_000;

function validateRupiahAmount(amount: Rupiah, label: string): void {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error(`${label} harus rupiah bulat positif (tanpa desimal).`);
  }
  if (amount < MIN_ALOKASI || amount > MAX_ALOKASI) {
    throw new Error(
      `${label} harus antara ${formatRupiah(MIN_ALOKASI)} dan ${formatRupiah(MAX_ALOKASI)}.`,
    );
  }
}

async function requireUser(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
  const user = await ctx.db.get(userId);
  if (user === null) throw new Error("Pengguna tidak ditemukan.");
  if (user.isAnonymous === true) {
    throw new Error("Akun tamu hanya dapat melihat informasi. Masuk dengan akun terverifikasi untuk mengakses ruang penyedia dana.");
  }
  return { userId, user };
}

async function requireDana(ctx: QueryCtx) {
  const { userId, user } = await requireUser(ctx);
  if (user.role !== ROLES.DANA) {
    throw new Error("Hanya akun penyedia dana yang dapat melakukan tindakan ini.");
  }
  return { userId, user };
}

/**
 * Gerbang OTP WhatsApp untuk transaksi finansial penyedia dana. Bila penyedia dana
 * mengaktifkan proteksi (mfaSettings.waOtpWajib), alokasi dana & penarikan
 * wajib menyertakan kode OTP yang masih valid (5 menit, sekali pakai).
 */
async function requireWaOtpIfEnabled(
  ctx: MutationCtx,
  userId: Id<"users">,
  kodeOtp?: string,
) {
  const mfa = await ctx.db
    .query("mfaSettings")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  if (mfa?.waOtpWajib !== true) return; // proteksi belum diaktifkan

  // Jalur 1: dialog WaOtpDialog sudah memverifikasi kode (jendela 2 menit).
  // Jendela langsung dihabiskan agar tidak bisa dipakai dua kali.
  if ((mfa.waOtpTerverifikasiSampai ?? 0) > Date.now()) {
    await ctx.db.patch(mfa._id, { waOtpTerverifikasiSampai: undefined });
    return;
  }

  // Jalur 2: kode dikirim langsung bersama mutation (validasi sekali pakai).
  if (!kodeOtp) {
    throw new Error(
      "Transaksi memerlukan kode OTP WhatsApp. Minta kode lalu masukkan 6 digit.",
    );
  }
  const benar =
    mfa.waOtpKode !== undefined &&
    kodeOtp === mfa.waOtpKode &&
    (mfa.waOtpKedaluwarsa ?? 0) > Date.now();
  if (!benar) {
    throw new Error("Kode OTP salah atau kedaluwarsa (berlaku 5 menit).");
  }
  // Sekali pakai — habiskan kode agar tidak bisa direplay.
  await ctx.db.patch(mfa._id, {
    waOtpKode: undefined,
    waOtpKedaluwarsa: undefined,
    waOtpGagal: 0,
  });
}

/**
 * Ringkasan pinjaman untuk ditampilkan ke penyedia dana — SATU sumber kebenaran
 * untuk skema harian (130% flat) dan skema bulanan (bunga flat per tenor).
 * Imbal
 * Hasil penyedia dana = 30% pokok (harian) atau Σ bunga bulanan; biaya tenor 3/6
 * memisahkan admin 2% dan platform 3%, dan SELURUH biaya dipotong di muka.
 */
type BarisJadwalDana = {
  bulan: number | null;
  hariKe: number | null;
  pokok: number;
  imbalHasil: number;
  biayaLayanan: number;
  biayaAdmin: number;
  biayaPlatform: number;
  total: number;
  sisaPokok: number;
};

type RingkasanPinjaman = {
  skemaBulanan: boolean;
  tenorHari: number;
  tenorBulan: number | null;
  imbalHasilTotal: number;
  totalKewajiban: number;
  cicilanPerBulan: number | null;
  biayaAdmin: number;
  biayaPlatform: number;
  totalPotonganDiMuka: number;
  biayaLayananTotal: number;
  /** Biaya admin 2% per cicilan (tenor 3/6; nol untuk tenor lain). */
  biayaAdminCicilanTotal: number;
  danaDiterimaPeminjam: number;
  jadwalPelunasan: BarisJadwalDana[];
  simulasiCicilanBulanan: BarisJadwalDana[];
  catatanJadwal: string;
};

function ringkasPinjaman(loan: {
  pokokPinjaman: number;
  tenorHari?: number;
  tenorBulan?: number;
  persenBunga?: number;
}): RingkasanPinjaman {
  if (loan.tenorBulan !== undefined) {
    const sim = simulasiBulananPinjaman({
      pokokPinjaman: loan.pokokPinjaman,
      tenorBulan: loan.tenorBulan,
      persenBunga: loan.persenBunga,
    });
    const tenorHari = loan.tenorBulan * 30;
    return {
      skemaBulanan: true,
      tenorHari,
      tenorBulan: loan.tenorBulan,
      imbalHasilTotal: sim.bungaTotal,
      totalKewajiban: sim.totalPengembalian,
      cicilanPerBulan: sim.cicilanPerBulan,
      biayaAdmin: sim.biayaAdminTotal,
      biayaPlatform: sim.biayaPlatformTotal,
      totalPotonganDiMuka: sim.potonganDiMuka,
      biayaLayananTotal: sim.biayaLayananTotal,
      biayaAdminCicilanTotal: sim.biayaAdminCicilanTotal,
      danaDiterimaPeminjam: sim.danaDiterima,
      // Backend saat ini mencatat satu pelunasan penuh di akhir tenor.
      jadwalPelunasan: [
        {
          bulan: loan.tenorBulan,
          hariKe: tenorHari,
          pokok: loan.pokokPinjaman,
          imbalHasil: sim.bungaTotal,
          // Biaya tenor dipotong di muka; tenor 3/6 menambahkan biaya admin 2%
          // per cicilan yang dibayar bersama cicilan.
          biayaLayanan: 0,
          biayaAdmin: sim.biayaAdminCicilanTotal,
          biayaPlatform: 0,
          total: sim.totalPengembalian,
          sisaPokok: 0,
        },
      ],
      // Ringkasan terpisah agar tidak disalahartikan sebagai cicilan yang sudah ditagih.
      simulasiCicilanBulanan: sim.jadwal.map((c) => ({
        bulan: c.bulan,
        hariKe: null,
        pokok: c.pokok,
        imbalHasil: c.bunga,
        biayaLayanan: c.biayaLayanan,
        biayaAdmin: c.biayaAdminCicilan,
        biayaPlatform: c.biayaPlatform,
        total: c.total,
        sisaPokok: c.sisaPokok,
      })),
      catatanJadwal:
        "Biaya admin 2% dan platform 3% untuk tenor 3/6 bulan (atau biaya layanan 3% untuk tenor 1) dipotong di muka dari dana yang diterima; tenor 3 dan 6 bulan dikenai tambahan biaya admin 2% dari nominal cicilan yang dibayar bersama setiap cicilan.",
    };
  }
  const q = quotePinjaman(loan);
  const tenorHari = loan.tenorHari ?? DEFAULT_TENOR_HARI;
  return {
    skemaBulanan: false,
    tenorHari,
    tenorBulan: null,
    imbalHasilTotal: q.bunga,
    totalKewajiban: q.totalKewajibanPelunasan,
    cicilanPerBulan: null,
    biayaAdmin: q.biayaAdmin,
    biayaPlatform: q.biayaPlatform,
    totalPotonganDiMuka: q.totalPotonganDiMuka,
    biayaLayananTotal: 0,
    biayaAdminCicilanTotal: 0,
    danaDiterimaPeminjam: q.danaBersihDitransfer,
    jadwalPelunasan: [
      {
        bulan: null,
        hariKe: tenorHari,
        pokok: loan.pokokPinjaman,
        imbalHasil: q.bunga,
        biayaLayanan: 0,
        biayaAdmin: 0,
        biayaPlatform: 0,
        total: q.totalKewajibanPelunasan,
        sisaPokok: 0,
      },
    ],
    simulasiCicilanBulanan: [],
    catatanJadwal: "Proyeksi satu kali pelunasan pada akhir tenor; bukan tagihan atau bukti transaksi.",
  };
}

function statusPersetujuanTim(status: string): string {
  if (status === "disetujui" || status === "didanai" || status === "lunas") {
    return "Disetujui tim PINDAI";
  }
  if (status === "ditolak") return "Tidak disetujui tim PINDAI";
  return "Menunggu review tim PINDAI";
}

function referenceNumber(prefix: string): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = Array.from({ length: 4 }, () =>
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".charAt(Math.floor(Math.random() * 32)),
  ).join("");
  return `${prefix}-${date}-${suffix}`;
}

// =====================================================================
// Peran penyedia dana
// =====================================================================

/** Naik peran menjadi penyedia dana. Sekali menjadi penyedia dana, peran tidak bisa diubah sendiri. */
export const naikPeranDana = mutation({
  args: {},
  handler: async (ctx) => {
    const { userId, user } = await requireUser(ctx);
    if (user.role === ROLES.ADMIN) {
      throw new Error("Akun admin tidak perlu menjadi penyedia dana.");
    }
    if (user.role === ROLES.DANA) {
      return { already: true };
    }
    await ctx.db.patch(userId, { role: ROLES.DANA });
    return { already: false };
  },
});

// =====================================================================
// Setoran dana
// =====================================================================

/** URL unggahan bukti setoran; hanya akun penyedia dana yang dapat memintanya. */
export const generateDepositUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireDana(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/** Ajukan setoran dana (penyedia dana) — menunggu pencocokan manual, tanpa kredit saldo. */
export const requestDeposit = mutation({
  args: {
    jumlah: v.number(),
    referensiTransfer: v.string(),
    metodePembayaran: v.union(v.literal("qris"), v.literal("transfer")),
    tanggalTransfer: v.number(),
    buktiPembayaranId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireDana(ctx);
    const config = await ctx.db
      .query("systemConfig")
      .withIndex("by_slot", (q) => q.eq("slot", "global"))
      .first();
    if (config?.manualDepositEnabled !== true) {
      throw new Error("Penerimaan setoran penyedia dana belum diaktifkan tim operasional.");
    }
    if (args.metodePembayaran === "qris" &&
      (!config.qrisImageId || !(await ctx.storage.getUrl(config.qrisImageId)))) {
      throw new Error("QRIS belum tersedia; pilih transfer atau hubungi admin.");
    }
    validateRupiahAmount(args.jumlah, "Jumlah setoran");
    const ref = args.referensiTransfer.trim();
    if (ref.length < 4 || ref.length > 120) {
      throw new Error("Nomor referensi/berita transfer wajib diisi (4–120 karakter).");
    }
    if (!Number.isSafeInteger(args.tanggalTransfer) || args.tanggalTransfer > Date.now() + 5 * 60_000) {
      throw new Error("Tanggal transfer tidak valid.");
    }
    const metadata = await ctx.storage.getMetadata(args.buktiPembayaranId);
    if (!metadata || metadata.size > 5_000_000 ||
      !["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(metadata.contentType ?? "")) {
      throw new Error("Bukti harus berupa JPG, PNG, WebP, atau PDF maksimal 5 MB.");
    }

    await ctx.db.insert("deposits", {
      danaId: userId,
      jumlah: args.jumlah,
      referensiTransfer: ref,
      metodePembayaran: args.metodePembayaran,
      tanggalTransfer: args.tanggalTransfer,
      buktiPembayaranId: args.buktiPembayaranId,
      status: "menunggu_verifikasi",
      nomorReferensi: referenceNumber("DEP"),
    });
  },
});

/** Riwayat + status setoran milik penyedia dana. */
export const myDeposits = query({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requireDana(ctx);
    const rows = await ctx.db
      .query("deposits")
      .withIndex("by_dana", (q) => q.eq("danaId", userId))
      .collect();
    return rows
      .sort((a, b) => b._creationTime - a._creationTime)
      .map((d) => ({
        _id: d._id,
        _creationTime: d._creationTime,
        jumlah: d.jumlah,
        referensiTransfer: d.referensiTransfer,
        status: d.status,
        statusPencocokan: d.statusPencocokan ?? null,
        metodePembayaran: d.metodePembayaran ?? null,
        tanggalTransfer: d.tanggalTransfer ?? null,
        catatanAdmin: d.catatanAdmin ?? null,
        nomorReferensi: d.nomorReferensi,
      }));
  },
});

/**
 * Dompet penyedia dana: saldo aktual dibaca langsung dari ledger (bukan field
 * cache), plus posisi alokasi aktif.
 */
export const myWallet = query({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requireDana(ctx);
    const saldo = await danaWalletBalance(ctx, userId);

    const fundings = await ctx.db
      .query("fundings")
      .withIndex("by_dana", (q) => q.eq("danaId", userId))
      .collect();
    const user = await ctx.db.get(userId);
    const namaKunci = kunciNamaPendana(user ?? {});
    /**
     * Dompet menghitung uang yang BENAR-BENAR keluar dari dompet ini. Baris
     * alokasi yang pinjamannya sudah dipindah ke pendana lain tidak lagi
     * dihitung di sini — posisinya berpindah ke pemilik baru (lihat
     * `myPortfolio`/`myFundingContracts`). Jadi dompet dan portofolio memakai
     * aturan kepemilikan yang sama, tanpa mengubah saldo ledger.
     */
    const active: Doc<"fundings">[] = [];
    for (const f of fundings) {
      if (f.status !== "dialokasikan") continue;
      const loan = await ctx.db.get(f.loanId);
      if (loan !== null && !pinjamanMilikPendana(loan, userId, namaKunci)) continue;
      active.push(f);
    }

    // Alokasi Kredit Barang (Skema C) dihitung pada ringkasan yang sama agar
    // dana yang dipindahkan dari dompet tidak "hilang" dari total penyedia dana.
    const kreditFundings = await ctx.db
      .query("kreditFundings")
      .withIndex("by_dana", (q) => q.eq("danaId", userId))
      .collect();
    const kreditAktif = kreditFundings.filter((f) => f.status === "dialokasikan");

    const danaBekerja =
      active.reduce((acc, f) => acc + f.jumlahAlokasi, 0) +
      kreditAktif.reduce((acc, f) => acc + f.jumlahAlokasi, 0);
    const imbalHasilDiharapkan =
      active.reduce((acc, f) => acc + f.imbalHasil, 0) +
      kreditAktif.reduce((acc, f) => acc + f.imbalHasil, 0);

    return {
      saldo,
      posisiAlokasi: active.length + kreditAktif.length,
      danaBekerja,
      imbalHasilDiharapkan,
    };
  },
});

// =====================================================================
// Marketplace pendanaan
// =====================================================================

/**
 * Daftar pinjaman terbuka untuk didanai: disetujui tim, belum didanai.
 * `sisaKebutuhan` dihitung live dari alokasi aktif — Zero Fake Data.
 */
export const marketplace = query({
  args: {},
  handler: async (ctx) => {
    await requireDana(ctx);

    const loans = await ctx.db
      .query("loans")
      .withIndex("by_status", (q) => q.eq("status", "disetujui"))
      .collect();

    const rows = [];
    for (const loan of loans) {
      const peminjam = await ctx.db.get(loan.userId);
      // Jangan tampilkan data warisan yang belum memiliki kode pseudonim.
      // Admin dapat menerbitkannya bertahap lewat panel Backup & Keamanan.
      if (peminjam?.kodePeminjam === undefined) continue;

      const fundings = await ctx.db
        .query("fundings")
        .withIndex("by_loan", (q) => q.eq("loanId", loan._id))
        .collect();
      const terkumpul = fundings
        .filter((f) => f.status === "dialokasikan")
        .reduce((acc, f) => acc + f.jumlahAlokasi, 0);
      const ringkas = ringkasPinjaman(loan);

      rows.push({
        _id: loan._id,
        nomorReferensi: loan.nomorReferensi,
        kodePeminjam: peminjam.kodePeminjam,
        statusVerifikasi: "Disetujui tim PINDAI",
        tujuan: loan.tujuan,
        pokokPinjaman: loan.pokokPinjaman,
        ...ringkas,
        terkumpul,
        sisaKebutuhan: loan.pokokPinjaman - terkumpul,
        danaBersih: ringkas.danaDiterimaPeminjam,
        bunga: ringkas.imbalHasilTotal,
        _creationTime: loan._creationTime,
      });
    }
    return rows.sort((a, b) => b._creationTime - a._creationTime);
  },
});

/**
 * Alokasikan dana ke pinjaman — ANTI-OVERFUNDING atomik:
 * 1. Baca ulang seluruh alokasi aktif pinjaman DI DALAM mutation ini.
 * 2. Validasi sisa kebutuhan (melempar error → seluruh transaksi rollback).
 * 3. Kurangi saldo dompet dari ledger (saldo tidak boleh kurang).
 * 4. Bila pinjaman terpenuhi penuh: catat disbursement + fee ke ledger,
 *    potong porsi penyedia dana, dan ubah status pinjaman menjadi "didanai".
 * Convex mengeksekusi satu mutation secara transaksional & serial —
 * dua penyedia dana yang berlomba tidak dapat melebihi sisa kebutuhan.
 */
export const allocateFunding = mutation({
  args: {
    loanId: v.id("loans"),
    jumlah: v.number(),
    /** Kode OTP WA — wajib bila penyedia dana mengaktifkan proteksi transaksi. */
    kodeOtp: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireDana(ctx);
    rejectUnverifiedMoneyMovement();
    validateRupiahAmount(args.jumlah, "Jumlah alokasi");
    await requireWaOtpIfEnabled(ctx, userId, args.kodeOtp);

    // 1. Pinjaman harus terbuka untuk pendanaan.
    const loan = await ctx.db.get(args.loanId);
    if (loan === null) throw new Error("Pinjaman tidak ditemukan.");
    if (loan.status !== "disetujui") {
      throw new Error(
        "Hanya pinjaman berstatus Disetujui yang dapat didanai.",
      );
    }

    // 2. ANTI-OVERFUNDING: hitung ulang total alokasi aktif saat ini.
    const fundings = await ctx.db
      .query("fundings")
      .withIndex("by_loan", (q) => q.eq("loanId", args.loanId))
      .collect();
    const terkumpul = fundings
      .filter((f) => f.status === "dialokasikan")
      .reduce((acc, f) => acc + f.jumlahAlokasi, 0);
    const sisa = loan.pokokPinjaman - terkumpul;
    if (sisa <= 0) {
      throw new Error("Pinjaman ini sudah terpenuhi penuh oleh penyedia dana lain.");
    }
    if (args.jumlah > sisa) {
      throw new Error(
        `Melebihi sisa kebutuhan. Sisa: ${formatRupiah(sisa)}. Kurangi jumlah alokasi Anda.`,
      );
    }

    // 3. Saldo dompet dari ledger — tidak boleh minus.
    const saldo = await danaWalletBalance(ctx, userId);
    if (saldo < args.jumlah) {
      throw new Error(
        `Saldo tidak cukup. Saldo: ${formatRupiah(saldo)}, alokasi: ${formatRupiah(args.jumlah)}.`,
      );
    }

    // 4. Tulis posisi alokasi. Imbal Hasil = porsi proporsional dari total hak
    //    penyedia dana pinjaman ini (harian: 30% pokok; bulanan: Σ bunga bulanan).
    const ringkas = ringkasPinjaman(loan);
    const imbalHasil = ringkas.imbalHasilTotal > 0
      ? Math.floor((ringkas.imbalHasilTotal * args.jumlah) / loan.pokokPinjaman)
      : 0;
    const fndRef = referenceNumber("FND");
    await ctx.db.insert("fundings", {
      loanId: args.loanId,
      danaId: userId,
      jumlahAlokasi: args.jumlah,
      imbalHasil,
      status: "dialokasikan",
      nomorReferensi: fndRef,
    });

    // 5. Jurnal: dana pindah dari dompet penyedia dana ke akun pinjaman.
    await appendJournal(ctx, {
      jenis: "disbursement",
      keterangan: `Alokasi pendanaan ${fndRef} ke ${loan.nomorReferensi}`,
      aktor: userId,
      lines: [
        { akun: `pinjaman:${args.loanId}`, arah: "debit", jumlah: args.jumlah },
        { akun: akunDompetDana(userId), arah: "kredit", jumlah: args.jumlah },
      ],
    });

    // 6. Bila penuh: cairkan dana bersih + potong fee platform.
    const terkumpulSetelah = terkumpul + args.jumlah;
    if (terkumpulSetelah === loan.pokokPinjaman) {
      const ringkasPenuh = ringkasPinjaman(loan);
      const now = Date.now();

      // Jurnal biaya: admin + platform dipotong di muka untuk KEDUA skema
      // (harian 2% + 3% dari quoteLoan; bulanan 2% + 3% tenor 3/6 atau
      // layanan 3% tenor 1 dari mesin bulanan).
      if (ringkasPenuh.totalPotonganDiMuka > 0) {
        await appendJournal(ctx, {
          jenis: "platform_fee",
          keterangan: `Biaya admin & platform ${loan.nomorReferensi}`,
          aktor: "platform",
          lines: [
            { akun: "platform:FEE", arah: "debit", jumlah: ringkasPenuh.totalPotonganDiMuka },
            { akun: `pinjaman:${args.loanId}`, arah: "kredit", jumlah: ringkasPenuh.totalPotonganDiMuka },
          ],
        });
      }

      // Jurnal pencairan ke Peminjam — KEDUA skema memakai dana bersih setelah
      // potongan di muka: harian 95% pokok; bulanan pokok − (admin 2% +
      // platform 3%) untuk tenor 3/6, atau pokok − layanan 3% untuk tenor 1.
      await appendJournal(ctx, {
        jenis: "disbursement",
        keterangan: ringkasPenuh.skemaBulanan
          ? `Pencairan pokok penuh ${loan.nomorReferensi} (skema bulanan)`
          : `Pencairan dana bersih ${loan.nomorReferensi}`,
        aktor: "platform",
        lines: [
          {
            akun: `peminjam:${loan.userId}`,
            arah: "debit",
            jumlah: ringkasPenuh.danaDiterimaPeminjam,
          },
          {
            akun: `pinjaman:${args.loanId}`,
            arah: "kredit",
            jumlah: ringkasPenuh.danaDiterimaPeminjam,
          },
        ],
      });

      // Hak Imbal Hasil tiap penyedia dana: proporsional alokasi dengan alokasi
      // terbesar menyerap dust pembulatan — SAMA PERSIS dengan distribusi saat
      // pelunasan (lihat repayLoan di convex/loans.ts).
      // Baca ulang alokasi dari DB — snapshot lama tidak memuat baris yang
      // baru di-insert mutation ini (bug yang sama dengan kredit barang).
      const fundingsTerbaru = await ctx.db
        .query("fundings")
        .withIndex("by_loan", (q2) => q2.eq("loanId", loan._id))
        .collect();
      const aktif = fundingsTerbaru
        .filter((x) => x.status === "dialokasikan")
        .sort(
          (a, b) =>
            b.jumlahAlokasi - a.jumlahAlokasi ||
            a.nomorReferensi.localeCompare(b.nomorReferensi),
        );
      const hak = hakImbalHasilPerAlokasi(
        ringkasPenuh.imbalHasilTotal,
        loan.pokokPinjaman,
        aktif.map((f) => f.jumlahAlokasi),
      );
      for (let i = 0; i < aktif.length; i += 1) {
        await ctx.db.patch(aktif[i]._id, { imbalHasil: hak[i] });
      }

      await ctx.db.patch(loan._id, { status: "didanai", didanaiPada: now });
    }

    return { success: true, terkumpulSetelah };
  },
});

// =====================================================================
// Penarikan dana (withdrawal) ke rekening pribadi penyedia dana
// =====================================================================

/** Ajukan penarikan saldo dompet ke rekening bank pribadi penyedia dana. */
export const requestWithdrawal = mutation({
  args: {
    jumlah: v.number(),
    namaBank: v.string(),
    nomorRekening: v.string(),
    /** Kode OTP WA — wajib bila penyedia dana mengaktifkan proteksi transaksi. */
    kodeOtp: v.optional(v.string()),
  },
  returns: v.object({ nomorReferensi: v.string() }),
  handler: async (ctx, args) => {
    const { userId } = await requireDana(ctx);
    rejectUnverifiedMoneyMovement();
    await requireWaOtpIfEnabled(ctx, userId, args.kodeOtp);

    const bank = args.namaBank.trim();
    const rek = args.nomorRekening.trim().replace(/\s+/g, "");
    if (bank.length < 2) {
      throw new Error("Nama bank wajib diisi (mis. BCA, Mandiri).");
    }
    if (!/^\d{6,20}$/.test(rek)) {
      throw new Error("Nomor rekening harus 6–20 digit angka.");
    }

    // Saldo dicek di sini untuk umpan balik cepat; pemotongan final terjadi
    // saat admin memproses (jurnal) dan divalidasi ulang pada momen itu.
    const saldo = await danaWalletBalance(ctx, userId);
    if (saldo < args.jumlah) {
      throw new Error(
        `Saldo tidak cukup. Saldo: ${formatRupiah(saldo)}, penarikan: ${formatRupiah(args.jumlah)}.`,
      );
    }

    const nomorReferensi = referenceNumber("WDR");
    await ctx.db.insert("withdrawals", {
      danaId: userId,
      jumlah: args.jumlah,
      namaBank: bank,
      nomorRekening: rek,
      status: "menunggu_proses",
      nomorReferensi,
    });
    return { nomorReferensi };
  },
});

/** Batalkan permintaan penarikan yang masih menunggu diproses. */
export const cancelWithdrawal = mutation({
  args: { withdrawalId: v.id("withdrawals") },
  handler: async (ctx, args) => {
    const { userId } = await requireDana(ctx);
    const w = await ctx.db.get(args.withdrawalId);
    if (w === null || w.danaId !== userId) {
      throw new Error("Permintaan penarikan tidak ditemukan.");
    }
    if (w.status !== "menunggu_proses") {
      throw new Error("Permintaan yang sudah diproses tidak dapat dibatalkan.");
    }
    await ctx.db.patch(args.withdrawalId, { status: "ditolak", catatanAdmin: "Dibatalkan oleh penyedia dana" });
  },
});

/** Riwayat penarikan milik penyedia dana. */
export const myWithdrawals = query({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requireDana(ctx);
    const rows = await ctx.db
      .query("withdrawals")
      .withIndex("by_dana", (q) => q.eq("danaId", userId))
      .collect();
    return rows
      .sort((a, b) => b._creationTime - a._creationTime)
      .map((w) => ({
        _id: w._id,
        _creationTime: w._creationTime,
        nomorReferensi: w.nomorReferensi,
        jumlah: w.jumlah,
        ...hitungBiayaPencairan(w.jumlah),
        namaBank: w.namaBank,
        nomorRekening: w.nomorRekening,
        status: w.status,
        catatanAdmin: w.catatanAdmin ?? null,
      }));
  },
});

/**
 * Portofolio penyedia dana: status pelunasan live dan kode peminjam pseudonim.
 * Data identitas, alamat, koordinat, serta lokasi penyimpanan jaminan tidak
 * disertakan dalam payload ini.
 */
export const myPortfolio = query({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requireDana(ctx);
    const user = await ctx.db.get(userId);
    const namaKunci = kunciNamaPendana(user ?? {});
    const cfg = await getConfig(ctx);
    const now = Date.now();
    const result = [];
    const sudahMasuk = new Set<string>();

    /**
     * Satu bentuk baris portofolio untuk kedua sumber kepemilikan, supaya
     * baris alokasi lama dan pinjaman model baru tidak pernah berbeda tampilan.
     */
    const baris = async (
      loan: Doc<"loans">,
      meta: {
        _id: Id<"fundings"> | Id<"loans">;
        nomorReferensi: string;
        jumlahAlokasi: number;
        imbalHasil: number;
        statusAlokasi: string;
      },
    ) => {
      const peminjam = await ctx.db.get(loan.userId);
      if (peminjam?.kodePeminjam === undefined) return null;
      // Satu sumber kebenaran pelunasan: skema harian & bulanan sekaligus.
      const rep = pelunasanPinjaman(loan, now);
      // Status pelunasan dari sudut pandang penyedia dana.
      const statusPelunasan: "lancar" | "berjalan" | "menunggak" =
        loan.status === "lunas"
          ? "lancar"
          : rep === null || rep.hariTerlambat <= 0
            ? "berjalan"
            : "menunggak";
      return {
        _id: meta._id,
        nomorReferensi: meta.nomorReferensi,
        loanId: loan._id,
        loanRef: loan.nomorReferensi,
        kodePeminjam: peminjam.kodePeminjam,
        statusVerifikasi: "Disetujui tim PINDAI",
        tujuan: loan.tujuan,
        pokokPinjaman: loan.pokokPinjaman,
        jumlahAlokasi: meta.jumlahAlokasi,
        imbalHasil: meta.imbalHasil,
        statusAlokasi: meta.statusAlokasi,
        statusPinjaman: loan.status,
        statusPelunasan,
        ...ringkasPinjaman(loan),
        pelunasan:
          rep === null
            ? null
            : {
                jatuhTempoPada: rep.jatuhTempoPada,
                sisaHari: rep.sisaHari,
                hariTerlambat: rep.hariTerlambat,
                dendaTerlambat: rep.dendaTerlambat,
                totalKewajibanPelunasan: rep.totalKewajibanPelunasan,
                totalKewajibanDenganPenalti: rep.totalKewajibanDenganPenalti,
              },
      };
    };

    // 1. Baris alokasi (model lama) — hanya yang pemiliknya MASIH akun ini.
    //    Pinjaman yang sudah dipindah ke pendana lain tidak lagi ikut terhitung.
    const fundings = await ctx.db
      .query("fundings")
      .withIndex("by_dana", (q) => q.eq("danaId", userId))
      .collect();
    for (const f of fundings.sort((a, b) => b._creationTime - a._creationTime)) {
      if (f.status !== "dialokasikan" && f.status !== "selesai") continue;
      const loan = await ctx.db.get(f.loanId);
      if (loan === null) continue;
      if (!pinjamanMilikPendana(loan, userId, namaKunci)) continue;
      const isi = await baris(loan, {
        _id: f._id,
        nomorReferensi: f.nomorReferensi,
        jumlahAlokasi: f.jumlahAlokasi,
        imbalHasil: f.imbalHasil,
        statusAlokasi: f.status,
      });
      if (isi === null) continue;
      sudahMasuk.add(loan._id);
      result.push(isi);
    }

    // 2. Pinjaman yang ditetapkan lewat model 1 pinjaman = 1 pendana (ruang
    //    penyedia dana) tetap tampil walau belum punya baris alokasi lama,
    //    sehingga dua sisi benar-benar terhubung.
    const kanonik = await ctx.db
      .query("loans")
      .withIndex("by_pendana", (q) => q.eq("pendanaId", userId))
      .collect();
    for (const loan of kanonik.sort(
      (a, b) => (b.didanaiPada ?? b._creationTime) - (a.didanaiPada ?? a._creationTime),
    )) {
      if (sudahMasuk.has(loan._id)) continue;
      if (loan.status !== "didanai" && loan.status !== "lunas") continue;
      const isi = await baris(loan, {
        _id: loan._id,
        nomorReferensi: loan.nomorReferensi,
        jumlahAlokasi: loan.pokokPinjaman,
        // Estimasi dari kebijakan yang berlaku sekarang (sama seperti ruang
        // penyedia dana): model baru tidak menyimpan imbal hasil per alokasi.
        imbalHasil:
          cobaBagi(
            loan.pokokPinjaman,
            loan.persenBunga ?? cfg.persenBunga,
            cfg.persenAdmin,
          )?.keuntunganPendana ?? 0,
        statusAlokasi: "dialokasikan",
      });
      if (isi === null) continue;
      result.push(isi);
    }

    return result;
  },
});

/** Bagi hasil tahan data warisan: pokok non-standar tidak merobohkan query. */
function cobaBagi(pokok: number, persenBunga: number, persenAdmin: number) {
  try {
    return bagiHasilPinjaman(pokok, persenBunga, persenAdmin);
  } catch {
    return null;
  }
}

/**
 * Dokumen perjanjian pendanaan milik penyedia dana: satu entri per alokasi yang
 * sudah terikat pada pinjaman disetujui/didanai/lunas.
 */
export const myFundingContracts = query({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requireDana(ctx);
    const user = await ctx.db.get(userId);
    const namaKunci = kunciNamaPendana(user ?? {});
    const cfg = await getConfig(ctx);
    const result = [];
    const sudahMasuk = new Set<string>();

    /** Pinjaman yang belum berkontrak tidak pernah muncul sebagai perjanjian. */
    const belumBerkontrak = (status: string) =>
      status === "diajukan" || status === "sedang_direview" || status === "ditolak";

    const baris = async (
      loan: Doc<"loans">,
      meta: {
        _id: Id<"fundings"> | Id<"loans">;
        nomorReferensi: string;
        jumlahAlokasi: number;
        imbalHasil: number;
        statusAlokasi: string;
        createdAt: number;
      },
    ) => {
      const peminjam = await ctx.db.get(loan.userId);
      if (peminjam?.kodePeminjam === undefined) return null;
      return {
        _id: meta._id,
        nomorReferensi: meta.nomorReferensi,
        loanRef: loan.nomorReferensi,
        kodePeminjam: peminjam.kodePeminjam,
        tujuan: loan.tujuan,
        jumlahAlokasi: meta.jumlahAlokasi,
        imbalHasil: meta.imbalHasil,
        statusAlokasi: meta.statusAlokasi,
        statusPinjaman: loan.status,
        ...ringkasPinjaman(loan),
        pokokPinjaman: loan.pokokPinjaman,
        createdAt: meta.createdAt,
      };
    };

    // 1. Baris alokasi (model lama) milik akun ini dan masih menjadi haknya.
    const fundings = await ctx.db
      .query("fundings")
      .withIndex("by_dana", (q) => q.eq("danaId", userId))
      .collect();
    for (const f of fundings.sort((a, b) => b._creationTime - a._creationTime)) {
      if (f.status !== "dialokasikan" && f.status !== "selesai") continue;
      const loan = await ctx.db.get(f.loanId);
      if (loan === null) continue;
      if (belumBerkontrak(loan.status)) continue;
      if (!pinjamanMilikPendana(loan, userId, namaKunci)) continue;
      const isi = await baris(loan, {
        _id: f._id,
        nomorReferensi: f.nomorReferensi,
        jumlahAlokasi: f.jumlahAlokasi,
        imbalHasil: f.imbalHasil,
        statusAlokasi: f.status,
        createdAt: f._creationTime,
      });
      if (isi === null) continue;
      sudahMasuk.add(loan._id);
      result.push(isi);
    }

    // 2. Pinjaman model baru (1 pinjaman = 1 pendana) tetap punya perjanjian
    //    walau belum pernah melalui alokasi dompet.
    const kanonik = await ctx.db
      .query("loans")
      .withIndex("by_pendana", (q) => q.eq("pendanaId", userId))
      .collect();
    for (const loan of kanonik) {
      if (sudahMasuk.has(loan._id)) continue;
      if (belumBerkontrak(loan.status)) continue;
      const isi = await baris(loan, {
        _id: loan._id,
        nomorReferensi: loan.nomorReferensi,
        jumlahAlokasi: loan.pokokPinjaman,
        imbalHasil:
          cobaBagi(
            loan.pokokPinjaman,
            loan.persenBunga ?? cfg.persenBunga,
            cfg.persenAdmin,
          )?.keuntunganPendana ?? 0,
        statusAlokasi: "dialokasikan",
        createdAt: loan.didanaiPada ?? loan.diajukanPada ?? loan._creationTime,
      });
      if (isi === null) continue;
      result.push(isi);
    }

    return result.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/**
 * Riwayat alokasi milik penyedia dana — mencakup pinjaman tunai DAN kredit barang,
 * agar seluruh perpindahan dana dari dompet terlihat di satu tempat.
 */
export const myFundings = query({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requireDana(ctx);
    const rows = await ctx.db
      .query("fundings")
      .withIndex("by_dana", (q) => q.eq("danaId", userId))
      .collect();
    const result: Array<{
      _id: Id<"fundings"> | Id<"kreditFundings">;
      _creationTime: number;
      nomorReferensi: string;
      jumlahAlokasi: number;
      imbalHasil: number;
      status: string;
      loanRef: string;
      loanStatus: string;
      jenis: "pinjaman" | "kredit";
    }> = [];
    for (const f of rows) {
      const loan = await ctx.db.get(f.loanId);
      result.push({
        _id: f._id,
        _creationTime: f._creationTime,
        nomorReferensi: f.nomorReferensi,
        jumlahAlokasi: f.jumlahAlokasi,
        imbalHasil: f.imbalHasil,
        status: f.status,
        loanRef: loan?.nomorReferensi ?? "-",
        loanStatus: loan?.status ?? "-",
        jenis: "pinjaman",
      });
    }
    const kreditRows = await ctx.db
      .query("kreditFundings")
      .withIndex("by_dana", (q) => q.eq("danaId", userId))
      .collect();
    for (const f of kreditRows) {
      const kredit = await ctx.db.get(f.kreditId);
      result.push({
        _id: f._id,
        _creationTime: f._creationTime,
        nomorReferensi: f.nomorReferensi,
        jumlahAlokasi: f.jumlahAlokasi,
        imbalHasil: f.imbalHasil,
        status: f.status,
        loanRef: kredit?.nomorReferensi ?? "-",
        loanStatus: kredit?.status ?? "-",
        jenis: "kredit",
      });
    }
    return result.sort((a, b) => b._creationTime - a._creationTime);
  },
});

// =====================================================================
// Kredit Barang (Skema C) — peluang pendanaan & Alokasi Dana
// =====================================================================

/** Akun ledger merchant tujuan pembayaran barang (mis. merchant:SHOPEE). */
function akunMerchant(merchant: string): string {
  const kode = merchant
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `merchant:${kode || "MITRA"}`;
}

/**
 * Peluang pendanaan Kredit Barang: pengajuan yang sudah disetujui tim dan
 * belum terpenuhi penuh oleh penyedia dana. Sisa kebutuhan dihitung live dari
 * alokasi aktif (Zero Fake Data); identitas hanya berupa kode peminjam.
 */
export const marketplaceKredit = query({
  args: {},
  handler: async (ctx) => {
    await requireDana(ctx);
    const rows = await ctx.db
      .query("kreditBarang")
      .withIndex("by_status", (q) => q.eq("status", "disetujui"))
      .collect();

    const hasil = [];
    for (const k of rows) {
      const peminjam = await ctx.db.get(k.userId);
      if (peminjam?.kodePeminjam === undefined) continue;

      let quote;
      try {
        quote = quoteKreditBarang({
          hargaBarang: k.hargaBarang,
          dpPersen: k.dpPersen,
          tenorBulan: k.tenorBulan,
          marginPersenPerBulan: k.marginPersenPerBulan,
        });
      } catch {
        continue; // data warisan di luar rentang skema — lewati
      }
      const fundings = await ctx.db
        .query("kreditFundings")
        .withIndex("by_kredit", (q) => q.eq("kreditId", k._id))
        .collect();
      const terkumpul = fundings
        .filter((f) => f.status === "dialokasikan")
        .reduce((acc, f) => acc + f.jumlahAlokasi, 0);
      const simulasiBulanan = (
        TENOR_BULANAN_OPTIONS as readonly number[]
      ).includes(k.tenorBulan)
        ? hitungSimulasiBulanan(quote.pokokDibiayai, k.tenorBulan, {
            tenorBiayaAdminPlatform: KREDIT_TENOR_BIAYA_ADMIN_PLATFORM,
          })
        : null;
      const jadwalPembayaran = quote.jadwal.map((c) => ({
        bulan: c.bulan,
        pokok: c.pokok,
        imbalHasil: c.margin,
        biayaLayanan: c.biayaLayanan,
        biayaAdmin: c.biayaAdmin,
        biayaPlatform: c.biayaPlatform,
        total: c.total,
        sisaPokok: c.sisaPokok,
      }));
      // Seluruh tenor membayar biaya layanan di muka.
      const biayaLayananDiMuka = quote.biayaLayanan;

      hasil.push({
        _id: k._id,
        _creationTime: k._creationTime,
        nomorReferensi: k.nomorReferensi,
        kodePeminjam: peminjam.kodePeminjam,
        statusVerifikasi: "Disetujui tim PINDAI",
        namaBarang: k.namaBarang,
        kategori: k.kategori,
        merchant: k.merchant,
        hargaBarang: quote.hargaBarang,
        dp: quote.dp,
        dpPersen: k.dpPersen,
        pokokDibiayai: quote.pokokDibiayai,
        tenorBulan: k.tenorBulan,
        marginPersenPerBulan: k.marginPersenPerBulan,
        cicilanPerBulan: quote.cicilanPerBulan,
        imbalHasilTotal: quote.marginTotal,
        persenImbalHasil: quote.persenImbalHasil,
        persenImbalHasilTahunan: quote.persenImbalHasilTahunan,
        biayaLayanan: quote.biayaLayanan,
        biayaAdmin: quote.biayaAdmin,
        biayaPlatform: quote.biayaPlatform,
        biayaAdminCicilanTotal: quote.biayaAdminCicilanTotal,
        biayaLayananDiMuka,
        biayaLayananPerBulan: simulasiBulanan?.biayaLayananPerBulan ?? 0,
        totalDibayarKonsumen: quote.totalDibayarKonsumen,
        jadwalPembayaran,
        catatanJadwal:
          simulasiBulanan === null
            ? "Biaya layanan dibayar di muka dan tidak termasuk dalam jumlah cicilan bulanan."
            : "Biaya admin 2% + platform 3% dari pokok dipotong di muka untuk seluruh tenor 1/3/6 bulan; tenor 3 dan 6 bulan dikenai tambahan biaya admin 2% dari nominal cicilan yang dibayar bersama setiap cicilan.",
        terkumpul,
        sisaKebutuhan: quote.pokokDibiayai - terkumpul,
      });
    }
    return hasil.sort((a, b) => b._creationTime - a._creationTime);
  },
});

/**
 * Alokasikan Dana ke pengajuan Kredit Barang — ANTI-OVERFUNDING atomik:
 * 1. Pengajuan harus berstatus Disetujui (belum penuh).
 * 2. Sisa kebutuhan dihitung ulang DI DALAM mutation ini.
 * 3. Saldo dompet dari ledger tidak boleh kurang.
 * 4. Bila terpenuhi penuh: jurnal pencairan ke merchant mitra, bagi hak
 *    Imbal Hasil proporsional, dan status pengajuan menjadi "didanai".
 * Convex mengeksekusi mutation secara transaksional & serial sehingga dua
 * penyedia dana yang berlomba tidak dapat melebihi sisa kebutuhan.
 */
export const alokasiKreditBarang = mutation({
  args: {
    kreditId: v.id("kreditBarang"),
    jumlah: v.number(),
    /** Kode OTP WA — wajib bila penyedia dana mengaktifkan proteksi transaksi. */
    kodeOtp: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireDana(ctx);
    rejectUnverifiedMoneyMovement();
    validateRupiahAmount(args.jumlah, "Jumlah alokasi");
    await requireWaOtpIfEnabled(ctx, userId, args.kodeOtp);

    const kredit = await ctx.db.get(args.kreditId);
    if (kredit === null) throw new Error("Pengajuan kredit barang tidak ditemukan.");
    if (kredit.status !== "disetujui") {
      throw new Error(
        "Hanya pengajuan kredit barang berstatus Disetujui yang dapat didanai.",
      );
    }

    // Pengajuan lama bisa berada di luar rentang skema saat ini — tolak dengan
    // pesan yang jelas, bukan error engine mentah.
    let quote: ReturnType<typeof quoteKreditBarang>;
    try {
      quote = quoteKreditBarang({
        hargaBarang: kredit.hargaBarang,
        dpPersen: kredit.dpPersen,
        tenorBulan: kredit.tenorBulan,
        marginPersenPerBulan: kredit.marginPersenPerBulan,
      });
    } catch {
      throw new Error(
        "Rincian pengajuan ini di luar rentang skema kredit saat ini — hubungi tim PINDAI.",
      );
    }

    const fundings = await ctx.db
      .query("kreditFundings")
      .withIndex("by_kredit", (q) => q.eq("kreditId", args.kreditId))
      .collect();
    const terkumpul = fundings
      .filter((f) => f.status === "dialokasikan")
      .reduce((acc, f) => acc + f.jumlahAlokasi, 0);
    const sisa = quote.pokokDibiayai - terkumpul;
    if (sisa <= 0) {
      throw new Error("Pengajuan ini sudah terpenuhi penuh oleh penyedia dana lain.");
    }
    if (args.jumlah > sisa) {
      throw new Error(
        `Melebihi sisa kebutuhan. Sisa: ${formatRupiah(sisa)}. Kurangi jumlah alokasi Anda.`,
      );
    }

    const saldo = await danaWalletBalance(ctx, userId);
    if (saldo < args.jumlah) {
      throw new Error(
        `Saldo tidak cukup. Saldo: ${formatRupiah(saldo)}, alokasi: ${formatRupiah(args.jumlah)}.`,
      );
    }

    // Hak Imbal Hasil proporsional porsi pokok yang didanai.
    const imbalHasil = Math.floor(
      (quote.marginTotal * args.jumlah) / quote.pokokDibiayai,
    );
    const ref = referenceNumber("KFD");
    await ctx.db.insert("kreditFundings", {
      kreditId: args.kreditId,
      danaId: userId,
      jumlahAlokasi: args.jumlah,
      imbalHasil,
      status: "dialokasikan",
      nomorReferensi: ref,
    });

    // Jurnal: dana pindah dari dompet penyedia dana ke akun kredit barang.
    await appendJournal(ctx, {
      jenis: "disbursement",
      keterangan: `Alokasi pendanaan ${ref} ke ${kredit.nomorReferensi} (Kredit Barang)`,
      aktor: userId,
      lines: [
        { akun: `kredit:${args.kreditId}`, arah: "debit", jumlah: args.jumlah },
        { akun: akunDompetDana(userId), arah: "kredit", jumlah: args.jumlah },
      ],
    });

    // Bila penuh: teruskan pokok ke merchant mitra & tandai didanai.
    const terkumpulSetelah = terkumpul + args.jumlah;
    if (terkumpulSetelah === quote.pokokDibiayai) {
      await appendJournal(ctx, {
        jenis: "disbursement",
        keterangan: `Pencairan pokok ke ${kredit.merchant} untuk ${kredit.nomorReferensi}`,
        aktor: "platform",
        lines: [
          {
            akun: akunMerchant(kredit.merchant),
            arah: "debit",
            jumlah: quote.pokokDibiayai,
          },
          {
            akun: `kredit:${args.kreditId}`,
            arah: "kredit",
            jumlah: quote.pokokDibiayai,
          },
        ],
      });

      // Biaya layanan platform — margin platform, dibayar DI MUKA pada semua
      // tenor: kontrak warisan 12/24 layanan 3% dari pokok dibiayai; tenor
      // resmi 1/3/6 admin 2% + platform 3% dari pokok.
      // Tidak ada biaya yang diamortisasi ke cicilan.
      const bayarFeeDiMuka = true;
      if (bayarFeeDiMuka) {
        await appendJournal(ctx, {
          jenis: "platform_fee",
          keterangan: `Biaya layanan platform ${kredit.nomorReferensi} (Kredit Barang)`,
          aktor: "platform",
          lines: [
            { akun: "platform:FEE", arah: "debit", jumlah: quote.biayaLayanan },
            {
              akun: `peminjam:${kredit.userId}`,
              arah: "kredit",
              jumlah: quote.biayaLayanan,
            },
          ],
        });
      }

      // Selaraskan hak Imbal Hasil dengan engine: Σ hak = total Imbal Hasil
      // dan alokasi terbesar menyerap pembulatan — tepat seperti yang
      // diterima setiap bulan lewat bagiCicilanKeDana.
      // PENTING: baca ulang alokasi dari DB — snapshot `fundings` di atas
      // belum memuat baris yang baru di-insert mutation ini; memakai snapshot
      // membuat Σ hak < total Imbal Hasil dan alokasi terakhir selalu gagal.
      const fundingsTerbaru = await ctx.db
        .query("kreditFundings")
        .withIndex("by_kredit", (q) => q.eq("kreditId", args.kreditId))
        .collect();
      const aktif = fundingsTerbaru
        .filter((x) => x.status === "dialokasikan")
        .sort(
          (a, b) =>
            b.jumlahAlokasi - a.jumlahAlokasi ||
            a.nomorReferensi.localeCompare(b.nomorReferensi),
        );
      const hak = hakImbalHasilPerAlokasi(
        quote.marginTotal,
        quote.pokokDibiayai,
        aktif.map((f) => f.jumlahAlokasi),
      );
      for (let i = 0; i < aktif.length; i += 1) {
        await ctx.db.patch(aktif[i]._id, { imbalHasil: hak[i] });
      }

      await ctx.db.patch(kredit._id, {
        status: "didanai",
        didanaiPada: Date.now(),
      });
    }

    return {
      success: true,
      nomorReferensi: ref,
      terkumpulSetelah,
      sisaSetelah: quote.pokokDibiayai - terkumpulSetelah,
    };
  },
});

/** Portofolio Alokasi Dana Kredit Barang milik penyedia dana. */
export const myKreditFundings = query({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requireDana(ctx);
    const rows = await ctx.db
      .query("kreditFundings")
      .withIndex("by_dana", (q) => q.eq("danaId", userId))
      .collect();
    const hasil = [];
    for (const f of rows.sort((a, b) => b._creationTime - a._creationTime)) {
      const kredit = await ctx.db.get(f.kreditId);
      if (kredit === null) continue;
      const peminjam = await ctx.db.get(kredit.userId);
      if (peminjam?.kodePeminjam === undefined) continue;
      // Progres cicilan bulanan: jumlah pembayaran tercatat (berurutan).
      const payments = await ctx.db
        .query("kreditPayments")
        .withIndex("by_kredit", (q) => q.eq("kreditId", f.kreditId))
        .collect();
      let quote = null;
      try {
        quote = quoteKreditBarang({
          hargaBarang: kredit.hargaBarang,
          dpPersen: kredit.dpPersen,
          tenorBulan: kredit.tenorBulan,
          marginPersenPerBulan: kredit.marginPersenPerBulan,
        });
      } catch {
        quote = null;
      }
      const simulasiBulanan =
        quote !== null &&
        (TENOR_BULANAN_OPTIONS as readonly number[]).includes(kredit.tenorBulan)
          ? hitungSimulasiBulanan(quote.pokokDibiayai, kredit.tenorBulan, {
              tenorBiayaAdminPlatform: KREDIT_TENOR_BIAYA_ADMIN_PLATFORM,
            })
          : null;
      const jadwalPembayaran =
        quote?.jadwal.map((c) => ({
          bulan: c.bulan,
          pokok: c.pokok,
          imbalHasil: c.margin,
          biayaLayanan: c.biayaLayanan,
          biayaAdmin: c.biayaAdmin,
          biayaPlatform: c.biayaPlatform,
          total: c.total,
          sisaPokok: c.sisaPokok,
        })) ?? [];

      hasil.push({
        _id: f._id,
        _creationTime: f._creationTime,
        nomorReferensi: f.nomorReferensi,
        kreditRef: kredit.nomorReferensi,
        kodePeminjam: peminjam.kodePeminjam,
        statusPersetujuanTim: statusPersetujuanTim(kredit.status),
        namaBarang: kredit.namaBarang,
        kategori: kredit.kategori,
        merchant: kredit.merchant,
        statusKredit: kredit.status,
        statusAlokasi: f.status,
        jumlahAlokasi: f.jumlahAlokasi,
        imbalHasil: f.imbalHasil,
        totalDiterima: f.jumlahAlokasi + f.imbalHasil,
        dibayarBulan: payments.length,
        tenorBulan: kredit.tenorBulan,
        marginPersenPerBulan: kredit.marginPersenPerBulan,
        pokokDibiayai: quote?.pokokDibiayai ?? null,
        cicilanPerBulan: quote?.cicilanPerBulan ?? null,
        persenImbalHasil: quote?.persenImbalHasil ?? null,
        biayaLayanan: quote?.biayaLayanan ?? null,
        biayaAdmin: quote?.biayaAdmin ?? 0,
        biayaPlatform: quote?.biayaPlatform ?? 0,
        biayaAdminCicilanTotal: quote?.biayaAdminCicilanTotal ?? 0,
        biayaLayananDiMuka: simulasiBulanan === null ? quote?.biayaLayanan ?? null : 0,
        biayaLayananPerBulan: simulasiBulanan?.biayaLayananPerBulan ?? 0,
        totalDibayarKonsumen: quote?.totalDibayarKonsumen ?? null,
        jadwalPembayaran,
      });
    }
    return hasil;
  },
});
