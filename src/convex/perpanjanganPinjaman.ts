/**
 * Pembayaran tingkat pinjaman harian: bayar bunga saja, cicil pokok, atau
 * pelunasan total.
 *
 * Nasabah mengirim bukti transfer lewat `loans.submitManualPaymentReceipt`
 * (dengan `paymentType`). Antrean di sini adalah tempat admin mencocokkan mutasi
 * bank; hanya setelah itu state pinjaman dan jurnal ledger berubah.
 */
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { requireAdminRole, requireAdminSession } from "./adminAuthz";
import { pastikanAngsuran } from "./angsuranJadwal";
import {
  AKUN_PLATFORM_DIRECT_REVENUE,
  AKUN_PLATFORM_PRINCIPAL_CLEARING,
  akunDompetDana,
  appendJournal,
  catatMarginSpread,
} from "./ledger";
import { bagiMargin } from "../lib/kebijakanPinjaman";
import { dendaAngsuran, jadwalAngsuranPinjaman } from "../lib/angsuran";
import { hitungRencanaPembayaran } from "../lib/perpanjanganPinjaman";

import { apakahPelunasanTepatWaktu } from "../lib/plafon";
import { beriTiketPelunasan, beriTiketPendanaan } from "./doorprize";
import { catatDanaKembali } from "./matchingQueue";
import { quotePinjaman } from "../lib/loan";
import { formatRupiah } from "../lib/money";
import { audit, tarifDendaBerlaku } from "./system";
import { pembayaranSiklus } from "./siklusPendana";
import { siklusPendanaan } from "../lib/imbalPendana";
import { selesaikanReferralPelunasan } from "./referral";
import { beriVoucherApresiasi } from "./voucher";

const DAY_MS = 86_400_000;

function batasJatuhTempo(loan: Doc<"loans">): number {
  if (loan.nextDueDate !== undefined) return loan.nextDueDate;
  if (loan.didanaiPada === undefined) {
    throw new Error("Tanggal pencairan belum tercatat.");
  }
  return loan.didanaiPada + (loan.tenorHari ?? 30) * DAY_MS;
}

function bungaBerjalan(loan: Doc<"loans">): number {
  return loan.nextInterestAmount ?? quotePinjaman(loan).bunga;
}

/**
 * Pastikan snapshot rencana masih cocok dengan state pinjaman. Bukti lama tidak
 * boleh diterapkan ke tagihan yang sudah berubah (mis. karena admin mencatat
 * perpanjangan lain lebih dulu).
 */
function pastikanRencanaMasihBerlaku(
  loan: Doc<"loans">,
  rencana: NonNullable<Doc<"manualPaymentReceipts">["rencana"]>,
) {
  if (loan.status !== "didanai") {
    throw new Error("Pinjaman ini tidak sedang berjalan.");
  }
  if (loan.tenorBulan !== undefined) {
    throw new Error("Pembayaran ini hanya untuk pinjaman harian.");
  }
  const principalSekarang = loan.remainingPrincipal ?? loan.pokokPinjaman;
  const dueSekarang = batasJatuhTempo(loan);
  const bungaSekarang = bungaBerjalan(loan);
  if (
    rencana.principalSebelum !== principalSekarang ||
    rencana.jatuhTempoSebelum !== dueSekarang ||
    rencana.interestDue !== bungaSekarang
  ) {
    throw new Error(
      "Tagihan pinjaman sudah berubah sejak bukti dikirim. Minta nasabah mengirim bukti baru sesuai tagihan terbaru.",
    );
  }
}

/** Antrean bukti pembayaran tingkat pinjaman untuk admin. */
export const daftarPembayaranPinjaman = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminRole(ctx);
    const rows = await ctx.db
      .query("manualPaymentReceipts")
      .withIndex("by_status", (q) => q.eq("status", "menunggu_pencocokan"))
      .collect();
    const hasil = [];
    for (const receipt of rows) {
      if (
        receipt.jenis !== "pinjaman" ||
        receipt.loanId === undefined ||
        receipt.paymentType === undefined ||
        receipt.rencana === undefined
      ) {
        continue;
      }
      const loan = await ctx.db.get(receipt.loanId);
      if (loan === null) continue;
      hasil.push({
        _id: receipt._id,
        nomorReferensi: receipt.nomorReferensi,
        paymentType: receipt.paymentType,
        extensionDays: receipt.extensionDays ?? null,
        principalAmount: receipt.principalAmount ?? null,
        jumlah: receipt.jumlah,
        tanggalTransfer: receipt.tanggalTransfer,
        referensiTransfer: receipt.referensiTransfer,
        metodePembayaran: receipt.metodePembayaran,
        buktiUrl: await ctx.storage.getUrl(receipt.buktiPembayaranId),
        loanId: loan._id,
        nomorPinjaman: loan.nomorReferensi,
        namaPeminjam: loan.namaLengkap,
        rencana: receipt.rencana,
        sisaPokokSekarang: loan.remainingPrincipal ?? loan.pokokPinjaman,
        jatuhTempoSekarang: batasJatuhTempo(loan),
        bungaSekarang: bungaBerjalan(loan),
      });
    }
    return { rows: hasil, jumlah: hasil.length };
  },
});

/**
 * Cocokkan bukti transfer tingkat pinjaman.
 *
 * Dua gerbang wajib: nominal mutasi bank sama dengan rencana server, dan state
 * pinjaman belum bergeser sejak bukti dikirim. Jurnal ditulis dengan eventType
 * eksplisit supaya audit tahu ini bukan angsuran biasa.
 */
export const verifikasiPembayaranPinjaman = mutation({
  args: {
    receiptId: v.id("manualPaymentReceipts"),
    keputusan: v.union(v.literal("terima"), v.literal("tolak")),
    referensiMutasi: v.optional(v.string()),
    jumlahMutasi: v.optional(v.number()),
    catatan: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId: adminId, user } = await requireAdminSession(ctx);
    const adminLabel = user.email ?? user.name ?? "admin";
    const receipt = await ctx.db.get(args.receiptId);
    if (receipt === null) throw new Error("Bukti pembayaran tidak ditemukan.");
    if (receipt.status !== "menunggu_pencocokan") {
      throw new Error("Bukti ini sudah diproses.");
    }
    if (receipt.paymentType === undefined || receipt.rencana === undefined) {
      throw new Error("Bukti ini bukan pembayaran tingkat pinjaman.");
    }
    if (receipt.loanId === undefined) throw new Error("Pinjaman pada bukti tidak ditemukan.");
    const loan = await ctx.db.get(receipt.loanId);
    if (loan === null) throw new Error("Pinjaman tidak ditemukan.");
    const catatan = (args.catatan ?? "").trim();
    if (catatan.length > 500) throw new Error("Catatan maksimal 500 karakter.");

    if (args.keputusan === "tolak") {
      await ctx.db.patch(receipt._id, {
        status: "ditolak",
        catatanAdmin: catatan === "" ? undefined : catatan,
        dicocokkanPada: Date.now(),
        dicocokkanOleh: adminId,
      });
      await audit(
        ctx,
        adminId,
        adminLabel,
        "pembayaran_pinjaman_ditolak",
        loan.nomorReferensi,
        `Bukti ${receipt.nomorReferensi} ditolak.${catatan === "" ? "" : ` Catatan: ${catatan}`}`,
      );
      return { ok: true as const, lunas: false as const };
    }

    const referensi = (args.referensiMutasi ?? "").trim();
    if (referensi.length < 4 || referensi.length > 120) {
      throw new Error("Referensi mutasi bank wajib 4–120 karakter.");
    }
    if (
      args.jumlahMutasi === undefined ||
      !Number.isSafeInteger(args.jumlahMutasi) ||
      args.jumlahMutasi <= 0
    ) {
      throw new Error("Nominal mutasi bank wajib rupiah bulat positif.");
    }
    pastikanRencanaMasihBerlaku(loan, receipt.rencana);
    const jadwalBerjalan = await ctx.db
      .query("angsuran")
      .withIndex("by_loan", (q) => q.eq("loanId", loan._id))
      .collect();
    if (jadwalBerjalan.some((row) => row.status === "menunggu_verifikasi")) {
      throw new Error(
        "Ada bukti angsuran yang menunggu pencocokan. Selesaikan atau tolak dulu agar tagihan tidak bertabrakan.",
      );
    }
    if (receipt.jumlah !== receipt.rencana.totalDue) {
      throw new Error("Nominal bukti tidak sama dengan rencana pembayaran.");
    }
    if (args.jumlahMutasi !== receipt.rencana.totalDue) {
      throw new Error(
        `Nominal mutasi ${formatRupiah(args.jumlahMutasi)} tidak sama dengan tagihan ${formatRupiah(receipt.rencana.totalDue)}.`,
      );
    }

    const now = Date.now();
    if (receipt.paymentType === "pelunasan_total") {
      await catatPelunasanTotal(
        ctx,
        loan,
        {
          tanggal: receipt.tanggalTransfer,
          asal: "bukti",
          nomorReferensi: receipt.nomorReferensi,
          buktiPembayaranId: receipt.buktiPembayaranId,
          receiptId: receipt._id,
        },
        rencanaDari(receipt),
        adminId,
        adminLabel,
      );
      await ctx.db.patch(receipt._id, {
        status: "dicocokkan",
        referensiMutasi: referensi,
        jumlahMutasi: args.jumlahMutasi,
        catatanAdmin: catatan === "" ? undefined : catatan,
        dicocokkanPada: now,
        dicocokkanOleh: adminId,
      });
      return { ok: true as const, lunas: true as const };
    }

    await catatPerpanjangan(
      ctx,
      loan,
      receipt,
      rencanaDari(receipt),
      adminId,
      adminLabel,
      referensi,
      now,
    );
    await ctx.db.patch(receipt._id, {
      status: "dicocokkan",
      referensiMutasi: referensi,
      jumlahMutasi: args.jumlahMutasi,
      catatanAdmin: catatan === "" ? undefined : catatan,
      dicocokkanPada: now,
      dicocokkanOleh: adminId,
    });
    return { ok: true as const, lunas: false as const };
  },
});

/**
 * Angka pelunasan yang akan dicatat admin untuk satu pinjaman.
 *
 * Dipakai dialog "Catat pelunasan" supaya nominal yang diketik sama dengan
 * hitungan server. Pinjaman harian memakai mesin rencana pembayaran, pinjaman
 * bulanan menjumlahkan angsuran yang belum lunas beserta denda pada hari ini.
 */
export const infoPelunasanManual = query({
  args: {
    loanId: v.id("loans"),
    /** Tanggal terima pilihan admin; kosong = hari ini. */
    tanggal: v.optional(v.number()),
  },
  handler: async (ctx, { loanId, tanggal }) => {
    await requireAdminRole(ctx);
    const loan = await ctx.db.get(loanId);
    if (loan === null) return null;
    const jalur = loan.tenorBulan === undefined ? "harian" : "bulanan";
    if (loan.status !== "didanai") {
      return {
        bisa: false as const,
        jalur,
        alasan: "Hanya pinjaman berjalan yang bisa dilunasi.",
        totalDue: 0,
        pokok: 0,
        bunga: 0,
        biayaAdmin: 0,
        denda: 0,
        jumlahAngsuran: 0,
      };
    }

    const tarif = await tarifDendaBerlaku(ctx);
    const sekarang = tanggal ?? Date.now();
    if (loan.tenorBulan === undefined) {
      const rencana = hitungRencanaPembayaran({
        loan,
        mode: "pelunasan_total",
        waktuTransaksi: sekarang,
        tarifDendaPerHari: tarif,
      });
      return {
        bisa: true as const,
        jalur,
        totalDue: rencana.totalDue,
        pokok: rencana.principalSebelum,
        bunga: rencana.interestDue,
        biayaAdmin: 0,
        denda: rencana.lateFee,
        jumlahAngsuran: 1,
      };
    }

    const rows = await ctx.db
      .query("angsuran")
      .withIndex("by_loan", (q) => q.eq("loanId", loanId))
      .collect();
    const belum = rows
      .filter((row) => row.status !== "lunas")
      .sort((a, b) => a.nomor - b.nomor);
    // Pinjaman lama bisa belum punya baris angsuran. Hitung dari jadwal murni
    // supaya dialog tetap memberi angka yang sama dengan yang nanti dibuat
    // `pastikanAngsuran` saat pelunasan dicatat.
    const jadwal = belum.length === 0 && rows.length === 0
      ? jadwalAngsuranPinjaman(loan).map((row) => ({
          nomor: row.nomor,
          jatuhTempoPada: row.jatuhTempoPada,
          pokok: row.pokok,
          bunga: row.bunga,
          biayaAdmin: row.biayaAdmin,
          total: row.total,
        }))
      : belum;
    if (jadwal.length === 0) {
      return {
        bisa: false as const,
        jalur,
        alasan: "Tidak ada angsuran yang tersisa; pinjaman ini sudah selesai.",
        totalDue: 0,
        pokok: 0,
        bunga: 0,
        biayaAdmin: 0,
        denda: 0,
        jumlahAngsuran: 0,
      };
    }
    const jumlah = (pilih: (row: { pokok: number; bunga: number; biayaAdmin: number; total: number }) => number) =>
      jadwal.reduce((acc, row) => acc + pilih(row), 0);
    const denda = jadwal.reduce(
      (acc, row) => acc + dendaAngsuran(row.pokok, row.jatuhTempoPada, sekarang, tarif),
      0,
    );
    return {
      bisa: true as const,
      jalur,
      totalDue: jumlah((row) => row.total) + denda,
      pokok: jumlah((row) => row.pokok),
      bunga: jumlah((row) => row.bunga),
      biayaAdmin: jumlah((row) => row.biayaAdmin),
      denda,
      jumlahAngsuran: jadwal.length,
    };
  },
});

/** Validasi masukan pencatatan pelunasan yang dipakai dua jalur di atas. */
function periksaMasukanPelunasan(
  referensiMasuk: string | undefined,
  args: { jumlahMutasi: number; tanggal: number },
  loan: Doc<"loans">,
): string {
  // Nomor mutasi bersifat opsional: admin boleh mencatat pelunasan langsung
  // dari ruang pendana tanpa nomor. Yang tetap wajib adalah nominal yang sama
  // persis dengan sisa tagihan — jurnal dan penutupan alokasi tetap berjalan.
  const referensi = (referensiMasuk ?? "").trim();
  if (referensi.length > 120) {
    throw new Error("Referensi mutasi bank maksimal 120 karakter.");
  }
  if (!Number.isSafeInteger(args.jumlahMutasi) || args.jumlahMutasi <= 0) {
    throw new Error("Nominal mutasi bank wajib rupiah bulat positif.");
  }
  if (
    !Number.isSafeInteger(args.tanggal) ||
    args.tanggal <= 0 ||
    args.tanggal > Date.now() + 5 * 60_000
  ) {
    throw new Error("Tanggal terima pembayaran tidak valid.");
  }
  if (loan.didanaiPada !== undefined && args.tanggal < loan.didanaiPada) {
    throw new Error("Tanggal terima tidak boleh sebelum dana disalurkan.");
  }
  return referensi;
}

/**
 * Catat pelunasan penuh pinjaman HARIAN dari mutasi bank yang sudah diterima.
 *
 * Jalur ini menulis jurnal pelunasan, menutup seluruh angsuran, membayar hak
 * penyedia dana, dan menutup posisi alokasinya. Bedanya dengan tombol "lunas"
 * lama: tidak ada status yang berubah tanpa uang dan tanpa jurnal. Pinjaman
 * bulanan memakai `angsuran.catatPelunasanManualBulanan`.
 */
export const catatPelunasanManual = mutation({
  args: {
    loanId: v.id("loans"),
    referensiMutasi: v.optional(v.string()),
    jumlahMutasi: v.number(),
    tanggal: v.number(),
    catatan: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId: adminId, user } = await requireAdminSession(ctx);
    const adminLabel = user.email ?? user.name ?? "admin";
    const loan = await ctx.db.get(args.loanId);
    if (loan === null) throw new Error("Pinjaman tidak ditemukan.");
    if (loan.status !== "didanai") {
      throw new Error("Hanya pinjaman berstatus Didanai yang bisa dilunasi.");
    }
    if (loan.tenorBulan !== undefined) {
      throw new Error(
        "Pinjaman bulanan dilunasi lewat angsuran. Gunakan catat pelunasan angsuran agar setiap cicilan punya barisnya sendiri.",
      );
    }
    const referensi = periksaMasukanPelunasan(args.referensiMutasi, args, loan);
    const catatan = (args.catatan ?? "").trim();
    if (catatan.length > 500) throw new Error("Catatan maksimal 500 karakter.");

    const menunggu = await ctx.db
      .query("manualPaymentReceipts")
      .withIndex("by_loan", (q) => q.eq("loanId", loan._id))
      .collect();
    if (menunggu.some((row) => row.status === "menunggu_pencocokan")) {
      throw new Error(
        "Ada bukti pembayaran yang menunggu pencocokan. Selesaikan atau tolak bukti itu lebih dulu.",
      );
    }

    const rencana = hitungRencanaPembayaran({
      loan,
      mode: "pelunasan_total",
      waktuTransaksi: args.tanggal,
      tarifDendaPerHari: await tarifDendaBerlaku(ctx),
    });
    if (args.jumlahMutasi !== rencana.totalDue) {
      throw new Error(
        `Nominal mutasi ${formatRupiah(args.jumlahMutasi)} tidak sama dengan total pelunasan ${formatRupiah(rencana.totalDue)} (pokok ${formatRupiah(rencana.principalSebelum)}, bunga ${formatRupiah(rencana.interestDue)}, denda ${formatRupiah(rencana.lateFee)}).`,
      );
    }

    await catatPelunasanTotal(
      ctx,
      loan,
      { tanggal: args.tanggal, asal: "mutasi", nomorReferensi: referensi },
      rencana,
      adminId,
      adminLabel,
    );
    await audit(
      ctx,
      adminId,
      adminLabel,
      "pelunasan_manual_dicatat",
      loan.nomorReferensi,
      `${referensi === "" ? "Pelunasan tanpa nomor mutasi" : `Mutasi ${referensi}`} sebesar ${formatRupiah(rencana.totalDue)} dicatat sebagai pelunasan penuh${catatan === "" ? "" : `; catatan: ${catatan}`}.`,
    );
    return { ok: true as const, totalDue: rencana.totalDue };
  },
});

function rencanaDari(receipt: Doc<"manualPaymentReceipts">) {
  if (receipt.rencana === undefined) throw new Error("Rencana pembayaran tidak ada.");
  return receipt.rencana;
}

async function catatPerpanjangan(
  ctx: MutationCtx,
  loan: Doc<"loans">,
  receipt: Doc<"manualPaymentReceipts">,
  rencana: NonNullable<Doc<"manualPaymentReceipts">["rencana"]>,
  adminId: Id<"users">,
  adminLabel: string,
  referensi: string,
  now: number,
) {
  if (rencana.nextDueDate === null) {
    throw new Error("Rencana perpanjangan tidak punya jatuh tempo baru.");
  }
  const lines = [
    { akun: "platform:CASH", arah: "debit" as const, jumlah: rencana.totalDue },
    { akun: `pinjaman:${loan._id}`, arah: "kredit" as const, jumlah: rencana.interestDue },
  ];
  if (rencana.principalPaid > 0) {
    lines.push({
      akun: `pinjaman:${loan._id}`,
      arah: "kredit",
      jumlah: rencana.principalPaid,
    });
  }
  if (rencana.lateFee > 0) {
    lines.push({ akun: "platform:FEE", arah: "kredit", jumlah: rencana.lateFee });
  }
  const rolloverFee = rencana.rolloverFee ?? 0;
  if (rolloverFee > 0) {
    lines.push({
      akun: AKUN_PLATFORM_DIRECT_REVENUE,
      arah: "kredit",
      jumlah: rolloverFee,
    });
  }
  await appendJournal(ctx, {
    jenis: "repayment",
    skema: "pinjaman",
    eventType:
      receipt.paymentType === "cicil_pokok"
        ? "PARTIAL_PRINCIPAL_PAYMENT"
        : "INTEREST_ONLY_PAYMENT",
    keterangan:
      receipt.paymentType === "cicil_pokok"
        ? `Cicil pokok ${loan.nomorReferensi}: bunga ${formatRupiah(rencana.interestDue)}, pokok ${formatRupiah(rencana.principalPaid)}, sisa ${formatRupiah(rencana.principalSesudah)}, tenor ${rencana.extensionDays} hari`
        : `Bayar bunga saja ${loan.nomorReferensi}: bunga ${formatRupiah(rencana.interestDue)}, pokok tetap ${formatRupiah(rencana.principalSebelum)}, tenor ${rencana.extensionDays} hari`,
    aktor: adminId,
    lines,
  });

  await pastikanAngsuran(ctx, loan);
  const jadwal = await ctx.db
    .query("angsuran")
    .withIndex("by_loan", (q) => q.eq("loanId", loan._id))
    .collect();
  for (const row of jadwal) {
    if (row.status === "lunas") continue;
    await ctx.db.patch(row._id, {
      jatuhTempoPada: rencana.nextDueDate,
      pokok: rencana.principalSesudah,
      bunga: rencana.nextInterestAmount,
      biayaAdmin: 0,
      total: rencana.principalSesudah + rencana.nextInterestAmount,
      status: "belum_dibayar",
      dibayarPada: undefined,
      dendaDibayar: undefined,
      buktiPembayaranId: undefined,
      receiptId: undefined,
    });
  }

  await ctx.db.patch(loan._id, {
    remainingPrincipal: rencana.principalSesudah,
    currentTierRate: rencana.tierRate,
    nextDueDate: rencana.nextDueDate,
    nextInterestAmount: rencana.nextInterestAmount,
    bungaTerbayar: (loan.bungaTerbayar ?? 0) + rencana.interestDue,
    perpanjanganCount: (loan.perpanjanganCount ?? 0) + 1,
    perpanjanganTerakhirPada: now,
  });

  await audit(
    ctx,
    adminId,
    adminLabel,
    receipt.paymentType === "cicil_pokok"
      ? "pembayaran_cicil_pokok_dicocokkan"
      : "pembayaran_bunga_saja_dicocokkan",
    loan.nomorReferensi,
    `Bukti ${receipt.nomorReferensi}: ${formatRupiah(rencana.totalDue)} (bunga ${formatRupiah(
      rencana.interestDue,
    )}${rencana.principalPaid > 0 ? `, pokok ${formatRupiah(rencana.principalPaid)}` : ""}${
      rencana.lateFee > 0 ? `, denda ${formatRupiah(rencana.lateFee)}` : ""
    }). Sisa pokok ${formatRupiah(rencana.principalSesudah)}, tier ${rencana.tierRate}%, bunga berikut ${formatRupiah(
      rencana.nextInterestAmount,
    )}, jatuh tempo baru ${new Date(rencana.nextDueDate).toISOString().slice(0, 10)}; mutasi ${referensi}.`,
  );
}

/**
 * Asal uang pelunasan yang dicatat admin.
 *
 * `bukti` berasal dari unggahan nasabah yang dicocokkan, `mutasi` dari
 * pencatatan langsung admin setelah dana masuk rekening usaha. Keduanya harus
 * menyebut nomor yang bisa ditelusuri, bukan sekadar tombol "lunas".
 */
type SumberPelunasan = {
  tanggal: number;
  asal: "bukti" | "mutasi";
  /**
   * Nomor bukti nasabah atau referensi mutasi bank. Bisa kosong untuk
   * pelunasan manual yang dicatat admin tanpa nomor mutasi.
   */
  nomorReferensi: string;
  buktiPembayaranId?: Id<"_storage">;
  receiptId?: Id<"manualPaymentReceipts">;
};

async function catatPelunasanTotal(
  ctx: MutationCtx,
  loan: Doc<"loans">,
  sumber: SumberPelunasan,
  rencana: NonNullable<Doc<"manualPaymentReceipts">["rencana"]>,
  adminId: Id<"users">,
  adminLabel: string,
) {
  const fundings = await ctx.db
    .query("fundings")
    .withIndex("by_loan", (q) => q.eq("loanId", loan._id))
    .collect();
  const aktif = fundings.filter((f) => f.status === "dialokasikan");
  // Pinjaman yang dicatat admin dengan pendana di luar aplikasi tidak punya
  // baris `fundings` sama sekali: dananya tidak pernah bergerak lewat ledger,
  // jadi tidak ada posisi pendana yang bisa ditutup. Pelunasan tetap dicatat
  // (kas masuk, angsuran ditutup, status lunas); yang dilewati hanya pembagian
  // ke pendana. Yang ditolak adalah alokasi yang SUDAH selesai: itu tanda
  // pinjaman pernah diselesaikan, dan mencatat lunas dua kali akan menggandakan
  // laporan pendana.
  if (aktif.length === 0 && fundings.some((f) => f.status === "selesai")) {
    throw new Error(
      "Posisi alokasi dana pinjaman ini sudah ditutup sebelumnya. Periksa laporan pendana sebelum mencatat pelunasan lagi.",
    );
  }
  if (aktif.length > 0) {
    const totalAlokasi = aktif.reduce((acc, f) => acc + f.jumlahAlokasi, 0);
    if (totalAlokasi !== loan.pokokPinjaman) {
      throw new Error(
        `Alokasi dana (${formatRupiah(totalAlokasi)}) tidak cocok dengan pokok pinjaman (${formatRupiah(loan.pokokPinjaman)}).`,
      );
    }
  }

  await appendJournal(ctx, {
    jenis: "repayment",
    skema: "pinjaman",
    eventType: "LOAN_REPAYMENT",
    keterangan: `Pelunasan ${loan.nomorReferensi}: sisa pokok ${formatRupiah(
      rencana.principalSebelum,
    )} + bunga ${formatRupiah(rencana.interestDue)}${
      rencana.lateFee > 0 ? ` + denda ${formatRupiah(rencana.lateFee)}` : ""
    }`,
    aktor: adminId,
    lines: [
      { akun: "platform:CASH", arah: "debit", jumlah: rencana.totalDue },
      {
        akun: `pinjaman:${loan._id}`,
        arah: "kredit",
        jumlah: rencana.principalSebelum + rencana.interestDue,
      },
      ...(rencana.lateFee > 0
        ? [
            {
              akun: "platform:FEE",
              arah: "kredit" as const,
              jumlah: rencana.lateFee,
            },
          ]
        : []),
    ],
  });

  // Hak pendana TETAP, tidak mengikuti bunga akumulatif dari perpanjangan /
  // cicil pokok. Selisih kas peminjam menjadi pendapatan atau beban platform.
  // Tanpa posisi alokasi, tidak ada dompet pendana yang dibayar dan tidak ada
  // margin spread yang diakui: dananya memang tidak pernah masuk lewat aplikasi.
  if (aktif.length > 0) {
  aktif.sort((a, b) => b.jumlahAlokasi - a.jumlahAlokasi);
  const bagian = aktif.map((f) => ({
    funding: f,
    imbal: f.imbalHasil,
  }));
  const totalHakPendana = bagian.reduce(
    (acc, x) => acc + x.funding.jumlahAlokasi + x.imbal,
    0,
  );
  const totalImbalPendana = bagian.reduce((acc, x) => acc + x.imbal, 0);
  // Bunga yang sudah dibayar pada periode sebelumnya ikut dihitung: margin
  // platform adalah total bunga nasabah sepanjang umur pinjaman dikurangi hak
  // pendana yang tetap. Tanpa `bungaTerbayar`, perpanjangan akan menghapus
  // margin dari periode yang sudah lewat.
  const totalBungaNasabah = (loan.bungaTerbayar ?? 0) + rencana.interestDue;
  const marginSpread = totalBungaNasabah - totalImbalPendana;

  let terdistribusi = 0;
  let totalPotongan = 0;
  for (const { funding, imbal } of bagian) {
    const bruto = funding.jumlahAlokasi + imbal;
    let potonganAdmin: number;
    let imbalBersih: number;
    let akunPayout: string;
    let kelebihan = 0;
    const jalurSiklus = await pembayaranSiklus(ctx, funding);
    if (jalurSiklus !== null) {
      potonganAdmin = jalurSiklus.potonganAdmin;
      imbalBersih = jalurSiklus.imbalBersih;
      akunPayout = jalurSiklus.akun;
      kelebihan = jalurSiklus.kelebihan;
    } else {
      // Baris lama tanpa siklus: porsi platform 13/60 dari marjin, sisa ke pendana.
      potonganAdmin = bagiMargin(imbal).platform;
      imbalBersih = bruto - potonganAdmin;
      akunPayout = akunDompetDana(funding.danaId);
    }
    await appendJournal(ctx, {
      jenis: "payout",
      skema: "pinjaman",
      keterangan:
        potonganAdmin > 0
          ? `Pelunasan ${loan.nomorReferensi}: pembayaran ke ${funding.nomorReferensi}, bruto ${formatRupiah(bruto)}, porsi platform 13/60 marjin ${formatRupiah(potonganAdmin)}, dibayarkan ${formatRupiah(imbalBersih)}`
          : `Pelunasan ${loan.nomorReferensi}: pembayaran ke ${funding.nomorReferensi}`,
      aktor: "platform",
      lines: [
        { akun: akunPayout, arah: "debit", jumlah: imbalBersih },
        ...(potonganAdmin > 0
          ? [
              {
                akun: "platform:FEE",
                arah: "debit" as const,
                jumlah: potonganAdmin,
              },
            ]
          : []),
        ...(kelebihan > 0
          ? [
              {
                akun: "platform:GUARANTEE",
                arah: "debit" as const,
                jumlah: kelebihan,
              },
            ]
          : []),
        { akun: `pinjaman:${loan._id}`, arah: "kredit", jumlah: bruto },
      ],
    });
    const siklus = siklusPendanaan(funding.jumlahAlokasi, loan);
    await ctx.db.patch(funding._id, {
      imbalHasil: imbal,
      periodDuration: siklus.periodDuration,
      expectedReturnRate: siklus.expectedReturnRate,
      lenderProfit: imbal - potonganAdmin,
      potonganAdmin,
      imbalHasilNet: imbalBersih,
      diselesaikanPada: sumber.tanggal,
      status: "selesai",
    });
    terdistribusi += imbalBersih;
    totalPotongan += potonganAdmin;
  }

  const kasPeminjam = rencana.principalSebelum + rencana.interestDue;
  const selisihHak = kasPeminjam - totalHakPendana;
  await catatMarginSpread(ctx, {
    loanId: loan._id,
    referensi: loan.nomorReferensi,
    margin: marginSpread,
    bungaNasabah: totalBungaNasabah,
    hakPendana: totalImbalPendana,
  });
  // Selisih yang tersisa berasal dari pokok yang sudah dicicil lebih dulu atau
  // dari bunga periode lama yang sudah masuk ke kas. Itu penyesuaian pokok,
  // bukan margin tenor, jadi tidak boleh dicampur ke akun spread.
  const penyesuaianPokok = selisihHak - marginSpread;
  if (penyesuaianPokok !== 0) {
    await appendJournal(ctx, {
      jenis: "principal_adjustment",
      skema: "pinjaman",
      keterangan: `Penyesuaian pokok/bunga periode sebelumnya ${loan.nomorReferensi}`,
      aktor: "platform",
      lines:
        penyesuaianPokok > 0
          ? [
              { akun: `pinjaman:${loan._id}`, arah: "debit", jumlah: penyesuaianPokok },
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
              { akun: `pinjaman:${loan._id}`, arah: "kredit", jumlah: -penyesuaianPokok },
            ],
    });
  }

  const totalKas = kasPeminjam + rencana.lateFee;
  if (terdistribusi + totalPotongan + selisihHak + rencana.lateFee !== totalKas) {
    throw new Error("Pelunasan tidak seimbang. Transaksi dibatalkan.");
  }
  }

  await pastikanAngsuran(ctx, loan);
  const jadwal = await ctx.db
    .query("angsuran")
    .withIndex("by_loan", (q) => q.eq("loanId", loan._id))
    .collect();
  for (const row of jadwal) {
    await ctx.db.patch(row._id, {
      status: "lunas",
      dibayarPada: sumber.tanggal,
      ...(rencana.lateFee > 0 ? { dendaDibayar: rencana.lateFee } : {}),
      ...(sumber.buktiPembayaranId === undefined
        ? {}
        : { buktiPembayaranId: sumber.buktiPembayaranId }),
      ...(sumber.receiptId === undefined ? {} : { receiptId: sumber.receiptId }),
    });
  }

  await ctx.db.patch(loan._id, {
    status: "lunas",
    lunasPada: sumber.tanggal,
    remainingPrincipal: 0,
    // Simpan bunga periode terakhir agar laporan penyedia dana menghitung
    // seluruh Imbal Hasil, bukan hanya periode yang sudah dibayar sebelumnya.
    bungaTerbayar: (loan.bungaTerbayar ?? 0) + rencana.interestDue,
    nextInterestAmount: 0,
    ...(rencana.lateFee > 0 ? { dendaTerlambat: rencana.lateFee } : {}),
  });

  await audit(
    ctx,
    adminId,
    adminLabel,
    "loan_lunas",
    loan.nomorReferensi,
    `${loan.namaLengkap}: pelunasan total ${formatRupiah(rencana.totalDue)} dicocokkan dari ${
      sumber.asal === "bukti"
        ? `bukti ${sumber.nomorReferensi}`
        : sumber.nomorReferensi === ""
          ? "pencocokan admin tanpa nomor mutasi"
          : `mutasi bank ${sumber.nomorReferensi}`
    }; ${aktif.length > 0 ? "sisa pokok 0, alokasi penyedia dana ditutup." : "sisa pokok 0, tanpa posisi alokasi pendana di aplikasi."}`,
  );

  // Tiket Doorprize Emas pada jalur pencocokan admin, dengan aturan yang sama
  // seperti pelunasan nasabah: peminjam harus lunas tepat waktu, pendana
  // mendapat satu tiket per kelipatan Rp1 juta alokasinya.
  const tepatWaktu = apakahPelunasanTepatWaktu({
    ...loan,
    status: "lunas",
    lunasPada: sumber.tanggal,
  });
  await beriTiketPelunasan(ctx, {
    pemilikId: loan.userId,
    nomorReferensi: loan.nomorReferensi,
    tepatWaktu,
    waktu: sumber.tanggal,
  });
  // Jalur inilah yang paling sering menutup pinjaman (admin mencocokkan bukti
  // transfer), jadi voucher apresiasi harus terbit di sini juga — dulu hanya
  // jalur pelunasan lain yang memanggilnya, sehingga peminjam yang lunas lewat
  // pencocokan mutasi tidak pernah menerima voucher.
  await beriVoucherApresiasi(ctx, {
    loan: { ...loan, status: "lunas", lunasPada: sumber.tanggal },
    sekarang: sumber.tanggal,
  });
  await selesaikanReferralPelunasan(ctx, {
    loan: { ...loan, status: "lunas", lunasPada: sumber.tanggal },
    sekarang: sumber.tanggal,
  });
  for (const funding of aktif) {
    await beriTiketPendanaan(ctx, {
      pemilikId: funding.danaId,
      nomorReferensi: funding.nomorReferensi,
      jumlahAlokasi: funding.jumlahAlokasi,
      waktu: sumber.tanggal,
    });
  }
  await catatDanaKembali(ctx, loan, sumber.tanggal);

  if (loan.pendanaId !== undefined) {
    await ctx.scheduler.runAfter(0, internal.laporanPendana.kirimLaporanPelunasan, {
      loanId: loan._id,
      olehUserId: adminId,
    });
  }
  await ctx.scheduler.runAfter(0, internal.whatsapp._kirimStatusPinjaman, {
    loanId: loan._id,
    alasan: "Pelunasan total dicocokkan.",
    statusLama: "didanai",
  });
}
