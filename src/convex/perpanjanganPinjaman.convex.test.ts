/**
 * Tes pembayaran bunga saja, cicil pokok, dan pelunasan total.
 *
 * Yang dijaga:
 *  - verifikasi admin memperbarui remainingPrincipal, currentTierRate,
 *    nextInterestAmount, dan nextDueDate;
 *  - event ledger INTEREST_ONLY_PAYMENT / PARTIAL_PRINCIPAL_PAYMENT /
 *    LOAN_REPAYMENT tertulis dan ledger tetap seimbang;
 *  - nominal mutasi yang salah ditolak tanpa mengubah pinjaman;
 *  - pinjaman lunas menutup alokasi penyedia dana.
 *
 * Bukti disisipkan dengan bentuk yang sama seperti yang ditulis mutation
 * submit (rencana dihitung lib yang sama); convex-test tidak mendukung
 * `storage.getMetadata` yang dipakai jalur unggah.
 *
 * Jalankan: bunx vitest run src/convex/perpanjanganPinjaman.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { hitungRencanaPembayaran } from "../lib/perpanjanganPinjaman";
import { siapkanPengguna } from "./test.helpers";
import { modules } from "./test.setup";

const HARI = 86_400_000;

type JenisBukti = "pelunasan_total" | "bunga_saja" | "cicil_pokok";

async function siapkan(t: ReturnType<typeof convexTest>, persenBunga = 30) {
  const { sesi: admin } = await siapkanPengguna(t, "admin perpanjangan", {
    email: "admin-perpanjangan@pindai.test",
    role: "admin",
  });
  const { sesi: peminjam, userId } = await siapkanPengguna(t, "sari perpanjangan", {
    email: "sari-perpanjangan@pindai.test",
    role: "peminjam",
  });
  const { userId: danaId } = await siapkanPengguna(t, "dana perpanjangan", {
    email: "dana-perpanjangan@pindai.test",
    role: "dana",
  });
  const sekarang = Date.now();
  const bukti = await t.run(async (ctx) => {
    const loanId = await ctx.db.insert("loans", {
      userId,
      pokokPinjaman: 1_000_000,
      tujuan: "modal_usaha",
      namaLengkap: "Sari Perpanjangan",
      namaBank: "BCA",
      nomorRekening: "1234567890",
      status: "didanai",
      nomorReferensi: "PGD-PERPANJANGAN-UJI",
      tenorHari: 28,
      persenBunga,
      didanaiPada: sekarang - 28 * HARI,
    });
    await ctx.db.insert("fundings", {
      loanId,
      danaId,
      jumlahAlokasi: 1_000_000,
      imbalHasil: 300_000,
      status: "dialokasikan",
      nomorReferensi: "ALOK-PERPANJANGAN-UJI",
    });
    const buktiPembayaranId = await ctx.storage.store(
      new Blob(["bukti transfer perpanjangan"], { type: "image/png" }),
    );
    return { loanId, buktiPembayaranId, userId };
  });
  return { admin, danaId, sekarang, peminjam, ...bukti };
}

async function buatBukti(
  t: ReturnType<typeof convexTest>,
  args: {
    loanId: Id<"loans">;
    userId: Id<"users">;
    buktiPembayaranId: Id<"_storage">;
    paymentType: JenisBukti;
    extensionDays?: number;
    principalAmount?: number;
    tanggalTransfer: number;
    nomorReferensi: string;
  },
): Promise<{ receiptId: Id<"manualPaymentReceipts">; totalDue: number }> {
  return t.run(async (ctx) => {
    const loan = await ctx.db.get(args.loanId);
    if (loan === null) throw new Error("loan uji hilang");
    const rencana = hitungRencanaPembayaran({
      loan,
      mode: args.paymentType,
      extensionDays: args.extensionDays,
      principalPaid: args.principalAmount ?? 0,
      waktuTransaksi: args.tanggalTransfer,
    });
    const receiptId = await ctx.db.insert("manualPaymentReceipts", {
      userId: args.userId,
      jenis: "pinjaman",
      loanId: args.loanId,
      paymentType: args.paymentType,
      extensionDays: args.extensionDays,
      principalAmount: args.principalAmount,
      rencana,
      jumlah: rencana.totalDue,
      metodePembayaran: "transfer",
      tanggalTransfer: args.tanggalTransfer,
      referensiTransfer: `TRF-${args.nomorReferensi}`,
      buktiPembayaranId: args.buktiPembayaranId,
      status: "menunggu_pencocokan",
      nomorReferensi: args.nomorReferensi,
    });
    return { receiptId, totalDue: rencana.totalDue };
  });
}

async function ambilAntrean(admin: Awaited<ReturnType<typeof siapkan>>["admin"]) {
  return admin.query(api.perpanjanganPinjaman.daftarPembayaranPinjaman, {});
}

async function totalLedger(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => {
    const rows = await ctx.db.query("ledger_entries").collect();
    return {
      rows,
      debit: rows.reduce((acc, e) => acc + (e.arah === "debit" ? e.jumlah : 0), 0),
      kredit: rows.reduce((acc, e) => acc + (e.arah === "kredit" ? e.jumlah : 0), 0),
    };
  });
}

describe("pembayaran tingkat pinjaman", () => {
  it("mencatat bunga saja, menghitung ulang tier, lalu melunasi", async () => {
    const t = convexTest(schema, modules);
    const data = await siapkan(t);

    // Bunga awal 30% x Rp1 juta = Rp300.000; transaksi tepat pada jatuh tempo.
    const pertama = await buatBukti(t, {
      ...data,
      paymentType: "bunga_saja",
      extensionDays: 28,
      tanggalTransfer: data.sekarang,
      nomorReferensi: "BUKTI-PERPANJANGAN-001",
    });
    expect(pertama.totalDue).toBe(305_000);

    const antrean = await ambilAntrean(data.admin);
    expect(antrean.jumlah).toBe(1);
    expect(antrean.rows[0].rencana.principalSebelum).toBe(1_000_000);
    expect(antrean.rows[0].rencana.tierRate).toBe(30);
    expect(antrean.rows[0].rencana.nextInterestAmount).toBe(300_000);

    await data.admin.mutation(api.perpanjanganPinjaman.verifikasiPembayaranPinjaman, {
      receiptId: pertama.receiptId,
      keputusan: "terima",
      referensiMutasi: "MUTASI-PERPANJANGAN-001",
      jumlahMutasi: 305_000,
    });

    const setelahBunga = await t.run(async (ctx) => {
      const loan = await ctx.db.get(data.loanId);
      const jadwal = await ctx.db
        .query("angsuran")
        .withIndex("by_loan", (q) => q.eq("loanId", data.loanId))
        .first();
      return { loan, jadwal };
    });
    expect(setelahBunga.loan?.remainingPrincipal).toBe(1_000_000);
    expect(setelahBunga.loan?.currentTierRate).toBe(30);
    expect(setelahBunga.loan?.nextInterestAmount).toBe(300_000);
    expect(setelahBunga.loan?.bungaTerbayar).toBe(300_000);
    expect(setelahBunga.loan?.nextDueDate).toBe(data.sekarang + 28 * HARI);
    expect(setelahBunga.jadwal?.bunga).toBe(300_000);
    expect(setelahBunga.jadwal?.jatuhTempoPada).toBe(data.sekarang + 28 * HARI);
    const ledger1 = await totalLedger(t);
    expect(ledger1.rows.every((e) => e.eventType === "INTEREST_ONLY_PAYMENT")).toBe(true);
    expect(ledger1.debit).toBe(ledger1.kredit);

    // Cicil pokok Rp200.000: bunga berjalan Rp300.000 + pokok = Rp500.000.
    const kedua = await buatBukti(t, {
      ...data,
      paymentType: "cicil_pokok",
      extensionDays: 28,
      principalAmount: 200_000,
      tanggalTransfer: data.sekarang,
      nomorReferensi: "BUKTI-PERPANJANGAN-002",
    });
    expect(kedua.totalDue).toBe(500_000);
    await data.admin.mutation(api.perpanjanganPinjaman.verifikasiPembayaranPinjaman, {
      receiptId: kedua.receiptId,
      keputusan: "terima",
      referensiMutasi: "MUTASI-PERPANJANGAN-002",
      jumlahMutasi: 500_000,
    });

    const setelahCicil = await t.run(async (ctx) => {
      const loan = await ctx.db.get(data.loanId);
      return loan;
    });
    expect(setelahCicil?.remainingPrincipal).toBe(800_000);
    expect(setelahCicil?.currentTierRate).toBe(35);
    expect(setelahCicil?.nextInterestAmount).toBe(280_000);
    expect(setelahCicil?.bungaTerbayar).toBe(600_000);
    const ledger2 = await totalLedger(t);
    expect(
      ledger2.rows.filter((e) => e.eventType === "PARTIAL_PRINCIPAL_PAYMENT").length,
    ).toBeGreaterThan(0);
    expect(ledger2.debit).toBe(ledger2.kredit);

    // Pelunasan total: sisa pokok Rp800.000 + bunga Rp280.000.
    const ketiga = await buatBukti(t, {
      ...data,
      paymentType: "pelunasan_total",
      tanggalTransfer: data.sekarang,
      nomorReferensi: "BUKTI-PERPANJANGAN-003",
    });
    expect(ketiga.totalDue).toBe(1_080_000);
    await data.admin.mutation(api.perpanjanganPinjaman.verifikasiPembayaranPinjaman, {
      receiptId: ketiga.receiptId,
      keputusan: "terima",
      referensiMutasi: "MUTASI-PERPANJANGAN-003",
      jumlahMutasi: 1_080_000,
    });

    const akhir = await t.run(async (ctx) => {
      const loan = await ctx.db.get(data.loanId);
      const funding = await ctx.db
        .query("fundings")
        .withIndex("by_loan", (q) => q.eq("loanId", data.loanId))
        .first();
      return { loan, funding };
    });
    expect(akhir.loan?.status).toBe("lunas");
    expect(akhir.loan?.remainingPrincipal).toBe(0);
    expect(akhir.loan?.nextInterestAmount).toBe(0);
    expect(akhir.funding?.status).toBe("selesai");
    const ledger3 = await totalLedger(t);
    expect(ledger3.rows.some((e) => e.eventType === "LOAN_REPAYMENT")).toBe(true);
    expect(ledger3.debit).toBe(ledger3.kredit);

    // Kuitansi peminjam: tiga transaksi yang sudah dicocokkan, terbaru dulu,
    // masing-masing membawa snapshot rencana yang dipakai admin.
    const kuitansi = await data.peminjam.query(api.loans.myLoanReceipts, {
      loanId: data.loanId,
    });
    expect(kuitansi).toHaveLength(3);
    expect(kuitansi[0].paymentType).toBe("pelunasan_total");
    expect(kuitansi.map((row) => row.rencana.tierRate)).toEqual([30, 35, 30]);
    expect(kuitansi[0].rencana.principalSesudah).toBe(0);
    expect(kuitansi[1].rencana.principalSesudah).toBe(800_000);
    expect(kuitansi[2].rencana.principalSesudah).toBe(1_000_000);
    expect(kuitansi[0].dicocokkanPada).not.toBeNull();
  });

  it("memisahkan margin platform dari hak pendana yang tetap 30%", async () => {
    const t = convexTest(schema, modules);
    // Bunga nasabah 35%, sedangkan hak pendana tetap 30% × Rp1 juta.
    const data = await siapkan(t, 35);
    const bukti = await buatBukti(t, {
      ...data,
      paymentType: "pelunasan_total",
      tanggalTransfer: data.sekarang,
      nomorReferensi: "BUKTI-SPREAD-001",
    });
    expect(bukti.totalDue).toBe(1_350_000);

    await data.admin.mutation(api.perpanjanganPinjaman.verifikasiPembayaranPinjaman, {
      receiptId: bukti.receiptId,
      keputusan: "terima",
      referensiMutasi: "MUTASI-SPREAD-001",
      jumlahMutasi: 1_350_000,
    });

    const hasil = await t.run(async (ctx) => {
      const funding = await ctx.db
        .query("fundings")
        .withIndex("by_loan", (q) => q.eq("loanId", data.loanId))
        .first();
      const entries = await ctx.db.query("ledger_entries").collect();
      return { funding, entries };
    });

    // Snapshot siklus pendana tetap 30 hari / 30%, tidak ikut bunga 35%.
    expect(hasil.funding?.imbalHasil).toBe(300_000);
    expect(hasil.funding?.lenderProfit).toBe(300_000);
    expect(hasil.funding?.periodDuration).toBe(30);
    expect(hasil.funding?.expectedReturnRate).toBe(30);

    // Selisih 5% bunga nasabah masuk akun margin platform, bukan platform:FEE.
    const spread = hasil.entries.filter((e) => e.akun === "PLATFORM_SPREAD_MARGIN");
    expect(spread).toHaveLength(1);
    // 2,5% dari margin Rp50.000 disisihkan ke dana proteksi risiko.
    expect(spread[0]).toMatchObject({ arah: "kredit", jumlah: 48_750 });
    expect(spread[0].keterangan).toContain("bunga nasabah");
    const pool = hasil.entries.filter((e) => e.akun === "RISK_PROTECTION_POOL");
    expect(pool).toHaveLength(1);
    expect(pool[0]).toMatchObject({ arah: "kredit", jumlah: 1_250 });

    // Ringkasan admin membaca akun spread sebagai pendapatan platform.
    const ringkasan = await data.admin.query(api.admin.ledgerSummary, {});
    // Pendapatan = potongan admin payout Rp65.000 + margin spread Rp48.750
    // (Rp1.250 disisihkan ke dana proteksi risiko, bukan pendapatan).
    expect(ringkasan.pendapatanPlatform).toBe(113_750);

    // Biaya layanan 5% tetap terpisah dari margin tenor.
    const fee = hasil.entries.find(
      (e) => e.akun === "platform:FEE" && e.jenis === "payout",
    );
    expect(fee).toMatchObject({ arah: "debit", jumlah: 65_000 });
    const debit = hasil.entries
      .filter((e) => e.arah === "debit")
      .reduce((acc, e) => acc + e.jumlah, 0);
    const kredit = hasil.entries
      .filter((e) => e.arah === "kredit")
      .reduce((acc, e) => acc + e.jumlah, 0);
    expect(debit).toBe(kredit);
  });

  it("menolak nominal mutasi yang tidak sama dengan tagihan tanpa mengubah state", async () => {
    const t = convexTest(schema, modules);
    const data = await siapkan(t);
    const bukti = await buatBukti(t, {
      ...data,
      paymentType: "bunga_saja",
      extensionDays: 28,
      tanggalTransfer: data.sekarang,
      nomorReferensi: "BUKTI-PERPANJANGAN-SALAH",
    });

    await expect(
      data.admin.mutation(api.perpanjanganPinjaman.verifikasiPembayaranPinjaman, {
        receiptId: bukti.receiptId,
        keputusan: "terima",
        referensiMutasi: "MUTASI-SALAH",
        jumlahMutasi: 299_999,
      }),
    ).rejects.toThrow(/tidak sama dengan tagihan/);

    const loan = await t.run(async (ctx) => ctx.db.get(data.loanId));
    expect(loan?.remainingPrincipal).toBeUndefined();
    expect(loan?.nextInterestAmount).toBeUndefined();
    const ledger = await totalLedger(t);
    expect(ledger.rows.length).toBe(0);
  });
});
