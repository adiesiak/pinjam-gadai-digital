/**
 * Tes integrasi Convex — alur Pendana dan pinjaman tunai.
 *
 * Menjalankan alur setoran → verifikasi admin → marketplace → alokasi Dana →
 * pelunasan Peminjam → penarikan Pendana, sambil memeriksa dompet dan ledger.
 * Pinjaman ditanam sebagai aplikasi yang menunggu review karena convex-test
 * belum mendukung storageGetMetadata untuk unggahan KYC.
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";

type Tx = ReturnType<typeof convexTest>;
type Sesi = ReturnType<Tx["withIdentity"]>;
const TEST_TOTP_SECRET = "JBSWY3DPEHPK3PXP";

async function siapkanPengguna(
  t: Tx,
  subject: string,
  email: string,
  role: "peminjam" | "pendana" | "admin",
): Promise<{ userId: Id<"users">; sesi: Sesi }> {
  const userId = await t.mutation((ctx) =>
    ctx.db.insert("users", {
      email,
      name: subject,
      emailVerificationTime: Date.now(),
      role,
    }),
  );
  const authSessionId = await t.run((ctx) =>
    ctx.db.insert("authSessions", {
      userId,
      expirationTime: Date.now() + 60 * 60 * 1000,
    }),
  );
  if (role === "admin") {
    await t.run((ctx) =>
      ctx.db.insert("mfaSettings", {
        userId,
        totpSecret: TEST_TOTP_SECRET,
        totpVerifiedAuthSessionIds: [authSessionId],
      }),
    );
  }
  return {
    userId,
    sesi: t.withIdentity({ subject: `${userId}|${authSessionId}`, name: subject }) as never,
  };
}

describe("alur Pendana — pinjaman tunai", () => {
  it("menolak setoran, alokasi, pelunasan, dan penarikan tanpa mengubah ledger atau status", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(
      t,
      "admin-alur-pendana",
      "admin-alur-pendana@pindai.test",
      "admin",
    );
    const { userId: peminjamId, sesi: peminjam } = await siapkanPengguna(
      t,
      "peminjam-alur-pendana",
      "peminjam-alur-pendana@pindai.test",
      "peminjam",
    );
    const { sesi: pendana } = await siapkanPengguna(
      t,
      "pendana-alur",
      "pendana-alur@pindai.test",
      "peminjam",
    );

    // Peran Pendana dapat diaktifkan mandiri, dan pemanggilan ulang idempoten.
    await expect(pendana.mutation(api.pendana.becomePendana, {})).resolves.toEqual({
      already: false,
    });
    await expect(pendana.mutation(api.pendana.becomePendana, {})).resolves.toEqual({
      already: true,
    });

    // Pinjaman sudah diajukan; admin meninjau lalu menyetujuinya.
    const loanId = await t.run(async (ctx) => {
      await ctx.db.insert("lokasiStatus", {
        userId: peminjamId,
        lat: -6.2,
        lng: 106.816666,
        akurasi: 25,
        waktu: Date.now(),
        sumber: "web",
      });
      return ctx.db.insert("loans", {
        userId: peminjamId,
        pokokPinjaman: 1_000_000,
        tujuan: "modal_usaha",
        namaLengkap: "Rani Peminjam",
        nomorRekening: "1234567890",
        status: "diajukan",
        nomorReferensi: "PGD-ALUR-PENDANA",
        tenorHari: 30,
      });
    });
    expect((await peminjam.query(api.loans.listMyLoans, {}))[0]?.status).toBe("diajukan");
    await admin.mutation(api.loans.markLoanInReview, { loanId });
    expect((await peminjam.query(api.loans.listMyLoans, {}))[0]?.status).toBe(
      "sedang_direview",
    );
    await admin.mutation(api.loans.approveLoan, { loanId });
    expect((await peminjam.query(api.loans.listMyLoans, {}))[0]?.status).toBe(
      "disetujui",
    );

    // Penerimaan bukti deposit tetap tertutup sampai gerbang admin dibuka; semua perintah uang ditolak tanpa ledger.
    const [depositId, withdrawalId, pawnId] = await t.run(async (ctx) => {
      const pendanaId = (await ctx.db.query("users").collect()).find(
        (user) => user.email === "pendana-alur@pindai.test",
      )?._id;
      if (pendanaId === undefined) throw new Error("Pendana uji tidak ditemukan.");
      const depositId = await ctx.db.insert("deposits", {
        pendanaId,
        jumlah: 2_000_000,
        referensiTransfer: "TRF-ALUR-001",
        status: "menunggu_verifikasi",
        nomorReferensi: "DEP-ALUR-001",
      });
      const withdrawalId = await ctx.db.insert("withdrawals", {
        pendanaId,
        jumlah: 500_000,
        namaBank: "BCA",
        nomorRekening: "1234567890",
        status: "menunggu_proses",
        nomorReferensi: "WDR-ALUR-001",
      });
      const pawnId = await ctx.db.insert("pawns", {
        userId: peminjamId,
        deskripsiBarang: "Barang uji gadai",
        kategori: "Elektronik",
        alamatPenilaian: "Alamat yang dicantumkan pemohon",
        namaLengkap: "Rani Peminjam",
        nomorRekening: "1234567890",
        status: "aktif",
        nomorReferensi: "PGD-GADAI-UJI",
        pokokGadai: 100_000,
        sisaPokok: 100_000,
        persenSewaModal: 5,
      });
      return [depositId, withdrawalId, pawnId] as const;
    });
    const ledgerCountBefore = await t.run(async (ctx) =>
      (await ctx.db.query("ledger_entries").collect()).length,
    );
    await expect(
      pendana.mutation(api.pendana.requestDeposit, {
        jumlah: 2_000_000,
        referensiTransfer: "TRF-ALUR-002",
        metodePembayaran: "transfer",
        tanggalTransfer: Date.now(),
        buktiPembayaranId: await t.run((ctx) => ctx.storage.store(new Blob(["bukti"]))),
      }),
    ).rejects.toThrow("Penerimaan setoran Pendana belum diaktifkan tim operasional.");
    await expect(
      admin.mutation(api.admin.confirmDeposit, { depositId }),
    ).rejects.toThrow("penyedia pembayaran belum dipilih atau terintegrasi");
    await expect(
      pendana.mutation(api.pendana.allocateFunding, {
        loanId,
        jumlah: 1_000_000,
      }),
    ).rejects.toThrow("penyedia pembayaran belum dipilih atau terintegrasi");
    await expect(
      peminjam.mutation(api.loans.repayLoan, { loanId }),
    ).rejects.toThrow("penyedia pembayaran belum dipilih atau terintegrasi");
    await expect(
      pendana.mutation(api.pendana.requestWithdrawal, {
        jumlah: 500_000,
        namaBank: "BCA",
        nomorRekening: "1234567890",
      }),
    ).rejects.toThrow("penyedia pembayaran belum dipilih atau terintegrasi");
    await expect(
      admin.mutation(api.admin.processWithdrawal, { withdrawalId }),
    ).rejects.toThrow("penyedia pembayaran belum dipilih atau terintegrasi");
    await expect(
      peminjam.mutation(api.gadai.bayarGadai, {
        pawnId,
        cicilPokok: 100_000,
      }),
    ).rejects.toThrow("penyedia pembayaran belum dipilih atau terintegrasi");
    await expect(
      peminjam.mutation(api.loans.requestPawnRelease, { pawnId }),
    ).rejects.toThrow("penyedia pembayaran belum dipilih atau terintegrasi");
    await expect(
      admin.mutation(api.gadai.cairkanGadai, { pawnId }),
    ).rejects.toThrow("penyedia pembayaran belum dipilih atau terintegrasi");
    await expect(
      admin.mutation(api.loans.activatePawn, { pawnId }),
    ).rejects.toThrow("penyedia pembayaran belum dipilih atau terintegrasi");
    await expect(
      admin.mutation(api.loans.releasePawn, { pawnId }),
    ).rejects.toThrow("penyedia pembayaran belum dipilih atau terintegrasi");

    const ledgerCountAfter = await t.run(async (ctx) =>
      (await ctx.db.query("ledger_entries").collect()).length,
    );
    const depositAfter = await t.run((ctx) => ctx.db.get(depositId));
    const withdrawalAfter = await t.run((ctx) => ctx.db.get(withdrawalId));
    const pawnAfter = await t.run((ctx) => ctx.db.get(pawnId));
    const pawnPaymentsAfter = await t.run((ctx) =>
      ctx.db.query("pawnPayments").withIndex("by_pawn", (q) => q.eq("pawnId", pawnId)).collect(),
    );
    expect(ledgerCountAfter).toBe(ledgerCountBefore);
    expect(depositAfter?.status).toBe("menunggu_verifikasi");
    expect(withdrawalAfter?.status).toBe("menunggu_proses");
    expect(pawnAfter?.status).toBe("aktif");
    expect(pawnAfter?.sisaPokok).toBe(100_000);
    expect(pawnPaymentsAfter).toHaveLength(0);
    expect((await peminjam.query(api.loans.listMyLoans, {}))[0]?.status).toBe("disetujui");
    expect(await pendana.query(api.pendana.myFundings, {})).toHaveLength(0);
    expect(await pendana.query(api.pendana.myWallet, {})).toMatchObject({
      saldo: 0,
      danaBekerja: 0,
    });
    expect(await admin.query(api.admin.ledgerSummary, {})).toMatchObject({
      entryCount: ledgerCountBefore,
      seimbang: true,
    });
  });

  it("mencatat penolakan bukti setoran hanya sebagai metadata, tanpa mengubah status atau ledger", async () => {
    const t = convexTest(schema, modules);
    const { userId: pendanaId } = await siapkanPengguna(
      t,
      "pendana-bukti-ditolak",
      "pendana-bukti-ditolak@pindai.test",
      "pendana",
    );
    const { sesi: admin } = await siapkanPengguna(
      t,
      "admin-bukti-ditolak",
      "admin-bukti-ditolak@pindai.test",
      "admin",
    );
    const depositId = await t.run((ctx) =>
      ctx.db.insert("deposits", {
        pendanaId,
        jumlah: 250_000,
        referensiTransfer: "TRF-BUKTI-001",
        status: "menunggu_verifikasi",
        nomorReferensi: "DEP-BUKTI-001",
      }),
    );

    await admin.mutation(api.admin.rejectDeposit, {
      depositId,
      reason: "Referensi bukti tidak sesuai.",
    });

    const deposit = await t.run((ctx) => ctx.db.get(depositId));
    const ledger = await t.run((ctx) => ctx.db.query("ledger_entries").collect());
    expect(deposit).toMatchObject({
      status: "menunggu_verifikasi",
      statusPencocokan: "ditolak",
      catatanAdmin: "Referensi bukti tidak sesuai.",
      dicocokkanOleh: expect.any(String),
    });
    expect(ledger).toHaveLength(0);
  });

  it("menampilkan jadwal pinjaman bulanan sebagai proyeksi internal, bukan pembayaran aktual", async () => {
    const t = convexTest(schema, modules);
    const peminjamId = await t.mutation((ctx) =>
      ctx.db.insert("users", {
        email: "peminjam-bulanan@pindai.test",
        name: "Nama Rahasia Bulanan",
        role: "peminjam",
        kodePeminjam: "PMN-1234567890ABCDEF1234",
      }),
    );
    const { sesi: pendana } = await siapkanPengguna(
      t,
      "pendana-bulanan",
      "pendana-bulanan@pindai.test",
      "pendana",
    );
    await t.run((ctx) =>
      ctx.db.insert("loans", {
        userId: peminjamId,
        pokokPinjaman: 1_000_000,
        tujuan: "modal_usaha",
        namaLengkap: "Nama Rahasia Bulanan",
        nomorRekening: "1234567890",
        status: "disetujui",
        nomorReferensi: "PGD-BULANAN-PENDANA",
        tenorHari: 90,
        tenorBulan: 3,
      }),
    );

    const [peluang] = await pendana.query(api.pendana.marketplace, {});
    expect(peluang).toMatchObject({
      kodePeminjam: "PMN-1234567890ABCDEF1234",
      biayaLayananTotal: 50_000,
      totalPotonganDiMuka: 50_000,
      danaBersih: 950_000,
      jadwalPelunasan: [{ bulan: 3, hariKe: 90, total: 1_500_001 }],
      simulasiCicilanBulanan: expect.arrayContaining([
        expect.objectContaining({ bulan: 1 }),
      ]),
      catatanJadwal:
        "Biaya admin 2% dan platform 3% untuk tenor 3/6 bulan (atau biaya layanan 3% untuk tenor 1) dipotong di muka dari dana yang diterima; cicilan bulanan hanya berisi pokok dan bunga.",
    });
    expect(peluang.jadwalPelunasan).toHaveLength(1);
    expect(peluang.simulasiCicilanBulanan).toHaveLength(3);
    expect(peluang).not.toHaveProperty("namaLengkap");
  });
});
