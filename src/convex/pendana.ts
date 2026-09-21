import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { ROLES } from "./schema";
import { calculateRepayment, DEFAULT_TENOR_HARI, quoteLoan } from "../lib/loan";
import { formatRupiah, type Rupiah } from "../lib/money";
import { appendJournal, pendanaWalletBalance } from "./ledger";

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
  return { userId, user };
}

async function requirePendana(ctx: QueryCtx) {
  const { userId, user } = await requireUser(ctx);
  if (user.role !== ROLES.PENDANA) {
    throw new Error("Hanya akun Pendana yang dapat melakukan tindakan ini.");
  }
  return { userId, user };
}

function referenceNumber(prefix: string): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = Array.from({ length: 4 }, () =>
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".charAt(Math.floor(Math.random() * 32)),
  ).join("");
  return `${prefix}-${date}-${suffix}`;
}

// =====================================================================
// Peran Pendana
// =====================================================================

/** Naik peran menjadi Pendana. Sekali Pendana, peran tidak bisa diubah sendiri. */
export const becomePendana = mutation({
  args: {},
  handler: async (ctx) => {
    const { userId, user } = await requireUser(ctx);
    if (user.role === ROLES.ADMIN) {
      throw new Error("Akun admin tidak perlu menjadi Pendana.");
    }
    if (user.role === ROLES.PENDANA) {
      return { already: true };
    }
    await ctx.db.patch(userId, { role: ROLES.PENDANA });
    return { already: false };
  },
});

// =====================================================================
// Setoran dana
// =====================================================================

/** Ajukan setoran dana (Pendana) — menunggu verifikasi admin. */
export const requestDeposit = mutation({
  args: {
    jumlah: v.number(),
    referensiTransfer: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requirePendana(ctx);
    validateRupiahAmount(args.jumlah, "Jumlah setoran");

    const ref = args.referensiTransfer.trim();
    if (ref.length < 4) {
      throw new Error(
        "Nomor referensi transfer wajib diisi (minimal 4 karakter).",
      );
    }

    await ctx.db.insert("deposits", {
      pendanaId: userId,
      jumlah: args.jumlah,
      referensiTransfer: ref,
      status: "menunggu_verifikasi",
      nomorReferensi: referenceNumber("DEP"),
    });
  },
});

/** Riwayat + status setoran milik Pendana. */
export const myDeposits = query({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requirePendana(ctx);
    const rows = await ctx.db
      .query("deposits")
      .withIndex("by_pendana", (q) => q.eq("pendanaId", userId))
      .collect();
    return rows
      .sort((a, b) => b._creationTime - a._creationTime)
      .map((d) => ({
        _id: d._id,
        _creationTime: d._creationTime,
        jumlah: d.jumlah,
        referensiTransfer: d.referensiTransfer,
        status: d.status,
        catatanAdmin: d.catatanAdmin,
        nomorReferensi: d.nomorReferensi,
      }));
  },
});

/**
 * Dompet Pendana: saldo aktual dibaca langsung dari ledger (bukan field
 * cache), plus posisi alokasi aktif.
 */
export const myWallet = query({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requirePendana(ctx);
    const saldo = await pendanaWalletBalance(ctx, userId);

    const fundings = await ctx.db
      .query("fundings")
      .withIndex("by_pendana", (q) => q.eq("pendanaId", userId))
      .collect();
    const active = fundings.filter((f) => f.status === "dialokasikan");
    const danaBekerja = active.reduce((acc, f) => acc + f.jumlahAlokasi, 0);
    const imbalHasilDiharapkan = active.reduce(
      (acc, f) => acc + f.imbalHasil,
      0,
    );

    return {
      saldo,
      posisiAlokasi: active.length,
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
    await requirePendana(ctx);

    const loans = await ctx.db
      .query("loans")
      .withIndex("by_status", (q) => q.eq("status", "disetujui"))
      .collect();

    const rows = [];
    for (const loan of loans) {
      const fundings = await ctx.db
        .query("fundings")
        .withIndex("by_loan", (q) => q.eq("loanId", loan._id))
        .collect();
      const terkumpul = fundings
        .filter((f) => f.status === "dialokasikan")
        .reduce((acc, f) => acc + f.jumlahAlokasi, 0);
      const quote = quoteLoan(loan.pokokPinjaman);

      // Info gadai terhubung (nilai taksiran/LTV/rak vault) — peminjam yang
      // sama + gadai tertaksir, untuk badge "Gadai Digital" di marketplace.
      let gadai: {
        deskripsiBarang: string;
        kategori: string;
        nilaiTaksiran: number;
        ltvPersen: number;
        kodeRakVault: string | null;
      } | null = null;
      const pawns = await ctx.db
        .query("pawns")
        .withIndex("by_user", (q) => q.eq("userId", loan.userId))
        .collect();
      const pawnMatch = pawns.find(
        (p) => p.namaLengkap === loan.namaLengkap && p.nilaiTaksiran !== undefined,
      );
      if (pawnMatch && pawnMatch.nilaiTaksiran !== undefined) {
        gadai = {
          deskripsiBarang: pawnMatch.deskripsiBarang,
          kategori: pawnMatch.kategori,
          nilaiTaksiran: pawnMatch.nilaiTaksiran,
          ltvPersen:
            pawnMatch.hargaPasar && pawnMatch.hargaPasar > 0
              ? Math.round((pawnMatch.nilaiTaksiran / pawnMatch.hargaPasar) * 100)
              : 70,
          kodeRakVault: pawnMatch.kodeRakVault ?? null,
        };
      }

      rows.push({
        _id: loan._id,
        nomorReferensi: loan.nomorReferensi,
        tujuan: loan.tujuan,
        pokokPinjaman: loan.pokokPinjaman,
        tenorHari: loan.tenorHari ?? 30,
        terkumpul,
        sisaKebutuhan: loan.pokokPinjaman - terkumpul,
        danaBersih: quote.danaBersihDitransfer,
        bunga: quote.bunga,
        gadai,
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
 *    potong porsi Pendana, dan ubah status pinjaman menjadi "didanai".
 * Convex mengeksekusi satu mutation secara transaksional & serial —
 * dua Pendana yang berlomba tidak dapat melebihi sisa kebutuhan.
 */
export const allocateFunding = mutation({
  args: {
    loanId: v.id("loans"),
    jumlah: v.number(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requirePendana(ctx);
    validateRupiahAmount(args.jumlah, "Jumlah alokasi");

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
      throw new Error("Pinjaman ini sudah terpenuhi penuh oleh Pendana lain.");
    }
    if (args.jumlah > sisa) {
      throw new Error(
        `Melebihi sisa kebutuhan. Sisa: ${formatRupiah(sisa)}. Kurangi jumlah alokasi Anda.`,
      );
    }

    // 3. Saldo dompet dari ledger — tidak boleh minus.
    const saldo = await pendanaWalletBalance(ctx, userId);
    if (saldo < args.jumlah) {
      throw new Error(
        `Saldo tidak cukup. Saldo: ${formatRupiah(saldo)}, alokasi: ${formatRupiah(args.jumlah)}.`,
      );
    }

    // 4. Tulis posisi alokasi.
    const quote = quoteLoan(loan.pokokPinjaman);
    const imbalHasil = quote.bunga > 0
      ? Math.floor((quote.bunga * args.jumlah) / loan.pokokPinjaman)
      : 0;
    const fndRef = referenceNumber("FND");
    await ctx.db.insert("fundings", {
      loanId: args.loanId,
      pendanaId: userId,
      jumlahAlokasi: args.jumlah,
      imbalHasil,
      status: "dialokasikan",
      nomorReferensi: fndRef,
    });

    // 5. Jurnal: dana pindah dari dompet Pendana ke akun pinjaman.
    await appendJournal(ctx, {
      jenis: "disbursement",
      keterangan: `Alokasi pendanaan ${fndRef} ke ${loan.nomorReferensi}`,
      aktor: userId,
      lines: [
        { akun: `pinjaman:${args.loanId}`, arah: "debit", jumlah: args.jumlah },
        { akun: `pendana:WALLET:${userId}`, arah: "kredit", jumlah: args.jumlah },
      ],
    });

    // 6. Bila penuh: cairkan dana bersih + potong fee platform.
    const terkumpulSetelah = terkumpul + args.jumlah;
    if (terkumpulSetelah === loan.pokokPinjaman) {
      const q = quoteLoan(loan.pokokPinjaman);
      const now = Date.now();

      // Jurnal biaya: admin + platform fee dari akun pinjaman ke platform.
      await appendJournal(ctx, {
        jenis: "platform_fee",
        keterangan: `Biaya admin & platform ${loan.nomorReferensi}`,
        aktor: "platform",
        lines: [
          { akun: "platform:FEE", arah: "debit", jumlah: q.totalPotonganDiMuka },
          { akun: `pinjaman:${args.loanId}`, arah: "kredit", jumlah: q.totalPotonganDiMuka },
        ],
      });

      // Jurnal pencairan dana bersih ke Peminjam.
      await appendJournal(ctx, {
        jenis: "disbursement",
        keterangan: `Pencairan dana bersih ${loan.nomorReferensi}`,
        aktor: "platform",
        lines: [
          { akun: `peminjam:${loan.userId}`, arah: "debit", jumlah: q.danaBersihDitransfer },
          { akun: `pinjaman:${args.loanId}`, arah: "kredit", jumlah: q.danaBersihDitransfer },
        ],
      });

      // Potong porsi imbal hasil ke masing-masing Pendana sesuai alokasi.
      for (const f of fundings.filter((x) => x.status === "dialokasikan")) {
        await ctx.db.patch(f._id, { imbalHasil: Math.floor((quote.bunga * f.jumlahAlokasi) / loan.pokokPinjaman) });
      }

      await ctx.db.patch(loan._id, { status: "didanai", didanaiPada: now });
    }

    return { success: true, terkumpulSetelah };
  },
});

// =====================================================================
// Penarikan dana (withdrawal) ke rekening pribadi Pendana
// =====================================================================

/** Ajukan penarikan saldo dompet ke rekening bank pribadi Pendana. */
export const requestWithdrawal = mutation({
  args: {
    jumlah: v.number(),
    namaBank: v.string(),
    nomorRekening: v.string(),
  },
  returns: v.object({ nomorReferensi: v.string() }),
  handler: async (ctx, args) => {
    const { userId } = await requirePendana(ctx);
    validateRupiahAmount(args.jumlah, "Jumlah penarikan");

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
    const saldo = await pendanaWalletBalance(ctx, userId);
    if (saldo < args.jumlah) {
      throw new Error(
        `Saldo tidak cukup. Saldo: ${formatRupiah(saldo)}, penarikan: ${formatRupiah(args.jumlah)}.`,
      );
    }

    const nomorReferensi = referenceNumber("WDR");
    await ctx.db.insert("withdrawals", {
      pendanaId: userId,
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
    const { userId } = await requirePendana(ctx);
    const w = await ctx.db.get(args.withdrawalId);
    if (w === null || w.pendanaId !== userId) {
      throw new Error("Permintaan penarikan tidak ditemukan.");
    }
    if (w.status !== "menunggu_proses") {
      throw new Error("Permintaan yang sudah diproses tidak dapat dibatalkan.");
    }
    await ctx.db.patch(args.withdrawalId, { status: "ditolak", catatanAdmin: "Dibatalkan oleh Pendana" });
  },
});

/** Riwayat penarikan milik Pendana. */
export const myWithdrawals = query({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requirePendana(ctx);
    const rows = await ctx.db
      .query("withdrawals")
      .withIndex("by_pendana", (q) => q.eq("pendanaId", userId))
      .collect();
    return rows
      .sort((a, b) => b._creationTime - a._creationTime)
      .map((w) => ({
        _id: w._id,
        _creationTime: w._creationTime,
        nomorReferensi: w.nomorReferensi,
        jumlah: w.jumlah,
        namaBank: w.namaBank,
        nomorRekening: w.nomorRekening,
        status: w.status,
        catatanAdmin: w.catatanAdmin ?? null,
      }));
  },
});

/**
 * Portofolio Pendana: setiap alokasi aktif dengan status pelunasan live dari
 * data pinjaman (lancar / berjalan / menunggak), privasi peminjam dijaga
 * (hanya inisial nama), plus info jaminan gadai bila terhubung.
 */
export const myPortfolio = query({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requirePendana(ctx);
    const fundings = await ctx.db
      .query("fundings")
      .withIndex("by_pendana", (q) => q.eq("pendanaId", userId))
      .collect();
    const now = Date.now();
    const result = [];
    for (const f of fundings.sort((a, b) => b._creationTime - a._creationTime)) {
      if (f.status !== "dialokasikan") continue;
      const loan = await ctx.db.get(f.loanId);
      if (loan === null) continue;

      const rep =
        loan.status === "didanai" && loan.didanaiPada !== undefined
          ? calculateRepayment(
              loan.pokokPinjaman,
              loan.tenorHari ?? DEFAULT_TENOR_HARI,
              loan.didanaiPada,
              now,
            )
          : null;

      // Status pelunasan dari sudut pandang Pendana.
      let statusPelunasan: "lancar" | "berjalan" | "menunggak";
      if (loan.status === "lunas") {
        statusPelunasan = "lancar";
      } else if (rep === null) {
        statusPelunasan = "berjalan";
      } else if (rep.hariTerlambat > 0) {
        statusPelunasan = "menunggak";
      } else {
        statusPelunasan = "berjalan";
      }

      // Inisial peminjam demi privasi (mis. "Budi Santoso" → "B. S.").
      const inisial = loan.namaLengkap
        .split(/\s+/)
        .slice(0, 2)
        .map((k) => `${k.charAt(0).toUpperCase()}.`)
        .join(" ");

      // Jaminan gadai dengan deskripsi cocok nama peminjam + kategori.
      let jaminan: {
        deskripsiBarang: string;
        kategori: string;
        nilaiTaksiran: number | null;
        kodeRakVault: string | null;
      } | null = null;
      if (loan.namaLengkap) {
        const pawns = await ctx.db
          .query("pawns")
          .withIndex("by_user", (q) => q.eq("userId", loan.userId))
          .collect();
        const match = pawns.find(
          (p) => p.namaLengkap === loan.namaLengkap && p.nilaiTaksiran !== undefined,
        );
        if (match) {
          jaminan = {
            deskripsiBarang: match.deskripsiBarang,
            kategori: match.kategori,
            nilaiTaksiran: match.nilaiTaksiran ?? null,
            kodeRakVault: match.kodeRakVault ?? null,
          };
        }
      }

      result.push({
        _id: f._id,
        nomorReferensi: f.nomorReferensi,
        loanId: loan._id,
        loanRef: loan.nomorReferensi,
        tujuan: loan.tujuan,
        peminjamInisial: inisial || "—",
        jumlahAlokasi: f.jumlahAlokasi,
        imbalHasil: f.imbalHasil,
        statusAlokasi: f.status,
        statusPinjaman: loan.status,
        statusPelunasan,
        tenorHari: loan.tenorHari ?? DEFAULT_TENOR_HARI,
        pelunasan:
          rep === null
            ? null
            : {
                jatuhTempoPada: rep.jatuhTempoPada,
                sisaHari: rep.sisaHari,
                hariTerlambat: rep.hariTerlambat,
                dendaTerlambat: rep.dendaTerlambat,
              },
        jaminan,
      });
    }
    return result;
  },
});

/**
 * Dokumen perjanjian pendanaan milik Pendana: satu entri per alokasi yang
 * sudah terikat pada pinjaman disetujui/didanai/lunas.
 */
export const myFundingContracts = query({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requirePendana(ctx);
    const fundings = await ctx.db
      .query("fundings")
      .withIndex("by_pendana", (q) => q.eq("pendanaId", userId))
      .collect();
    const result = [];
    for (const f of fundings.sort((a, b) => b._creationTime - a._creationTime)) {
      if (f.status !== "dialokasikan" && f.status !== "selesai") continue;
      const loan = await ctx.db.get(f.loanId);
      if (loan === null) continue;
      if (loan.status === "diajukan" || loan.status === "sedang_direview" || loan.status === "ditolak") {
        continue;
      }
      result.push({
        _id: f._id,
        nomorReferensi: f.nomorReferensi,
        loanRef: loan.nomorReferensi,
        tujuan: loan.tujuan,
        jumlahAlokasi: f.jumlahAlokasi,
        imbalHasil: f.imbalHasil,
        statusAlokasi: f.status,
        statusPinjaman: loan.status,
        tenorHari: loan.tenorHari ?? DEFAULT_TENOR_HARI,
        pokokPinjaman: loan.pokokPinjaman,
        createdAt: f._creationTime,
      });
    }
    return result;
  },
});

/** Riwayat alokasi milik Pendana. */
export const myFundings = query({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requirePendana(ctx);
    const rows = await ctx.db
      .query("fundings")
      .withIndex("by_pendana", (q) => q.eq("pendanaId", userId))
      .collect();
    const result = [];
    for (const f of rows.sort((a, b) => b._creationTime - a._creationTime)) {
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
      });
    }
    return result;
  },
});
