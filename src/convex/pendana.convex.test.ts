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
  it("setor, danai marketplace, terima pelunasan, lalu tarik saldo", async () => {
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

    // Setoran baru belum masuk saldo sampai diverifikasi admin.
    await pendana.mutation(api.pendana.requestDeposit, {
      jumlah: 2_000_000,
      referensiTransfer: "TRF-ALUR-001",
    });
    const [setoran] = await pendana.query(api.pendana.myDeposits, {});
    expect(setoran.status).toBe("menunggu_verifikasi");
    expect(await pendana.query(api.pendana.myWallet, {})).toMatchObject({ saldo: 0 });
    const [setoranAdmin] = await admin.query(api.admin.pendingDeposits, {});
    expect(setoranAdmin._id).toBe(setoran._id);
    await admin.mutation(api.admin.confirmDeposit, { depositId: setoran._id });
    expect(await pendana.query(api.pendana.myWallet, {})).toMatchObject({ saldo: 2_000_000 });

    // Marketplace hanya memuat kode pseudonim dan detail finansial yang aman.
    const [peluang] = await pendana.query(api.pendana.marketplace, {});
    const kodeTersimpan = await t.run(async (ctx) => (await ctx.db.get(peminjamId))?.kodePeminjam);
    expect(kodeTersimpan).toMatch(/^PMN-[A-F0-9]{20}$/);
    expect(peluang).toMatchObject({
      _id: loanId,
      kodePeminjam: kodeTersimpan,
      statusVerifikasi: "Disetujui tim PINDAI",
      tujuan: "modal_usaha",
      pokokPinjaman: 1_000_000,
      tenorHari: 30,
      biayaAdmin: 30_000,
      biayaPlatform: 20_000,
      totalPotonganDiMuka: 50_000,
      danaBersih: 950_000,
      totalKewajiban: 1_300_000,
      jadwalPelunasan: [{ hariKe: 30, total: 1_300_000 }],
      sisaKebutuhan: 1_000_000,
    });
    for (const field of [
      "namaLengkap", "name", "peminjamInisial", "nik", "nomorWhatsApp",
      "penghasilanBulanan", "sumberPenghasilan", "nomorRekening", "dokKtpId",
      "dokSelfieKtpId", "dokSlipGajiId", "lokasiAjukan", "lat", "lng",
      "alamat", "alamatPenilaian", "kodeRakVault", "jaminan",
    ]) {
      expect(peluang).not.toHaveProperty(field);
    }
    await pendana.mutation(api.pendana.allocateFunding, {
      loanId,
      jumlah: 1_000_000,
    });
    expect(await pendana.query(api.pendana.myWallet, {})).toMatchObject({
      saldo: 1_000_000,
      danaBekerja: 1_000_000,
      imbalHasilDiharapkan: 300_000,
    });
    const [posisi] = await pendana.query(api.pendana.myPortfolio, {});
    expect(posisi).toMatchObject({
      loanId,
      kodePeminjam: kodeTersimpan,
      statusVerifikasi: "Disetujui tim PINDAI",
      statusPinjaman: "didanai",
      jumlahAlokasi: 1_000_000,
      biayaAdmin: 30_000,
      biayaPlatform: 20_000,
      totalPotonganDiMuka: 50_000,
      danaDiterimaPeminjam: 950_000,
      jadwalPelunasan: [{ total: 1_300_000 }],
    });
    for (const field of ["namaLengkap", "peminjamInisial", "nik", "nomorRekening", "lokasiAjukan", "lat", "lng", "kodeRakVault", "jaminan"]) {
      expect(posisi).not.toHaveProperty(field);
    }

    // Peminjam melunasi pinjaman Rp1 juta; hak Pendana masuk ke dompet dan
    // plafon tunai Peminjam memenuhi aturan kenaikan setelah lunas penuh.
    const pelunasan = await peminjam.mutation(api.loans.repayLoan, { loanId });
    expect(pelunasan.totalDibayar).toBe(1_300_000);
    expect(await peminjam.query(api.lokasi.plafonSaya, {})).toBe(10_000_000);
    expect(await pendana.query(api.pendana.myFundings, {})).toMatchObject([
      { loanStatus: "lunas", status: "selesai", jenis: "pinjaman" },
    ]);
    expect(await pendana.query(api.pendana.myWallet, {})).toMatchObject({
      saldo: 2_300_000,
      danaBekerja: 0,
    });

    // Penarikan menunggu proses sampai admin mengirimkannya.
    await pendana.mutation(api.pendana.requestWithdrawal, {
      jumlah: 500_000,
      namaBank: "BCA",
      nomorRekening: "1234567890",
    });
    const [penarikan] = await pendana.query(api.pendana.myWithdrawals, {});
    expect(penarikan.status).toBe("menunggu_proses");
    const [penarikanAdmin] = await admin.query(api.admin.pendingWithdrawals, {});
    expect(penarikanAdmin._id).toBe(penarikan._id);
    await admin.mutation(api.admin.processWithdrawal, {
      withdrawalId: penarikan._id,
    });
    expect((await pendana.query(api.pendana.myWithdrawals, {}))[0].status).toBe(
      "diproses",
    );
    expect(await pendana.query(api.pendana.myWallet, {})).toMatchObject({
      saldo: 1_800_000,
    });

    const ledger = await admin.query(api.admin.ledgerSummary, {});
    expect(ledger.seimbang).toBe(true);
    expect(ledger.rincianSkema.pinjaman).toBe(50_000);
  });

  it("membedakan jadwal pelunasan aktual dari simulasi bulanan pinjaman tunai", async () => {
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
      biayaLayananTotal: 30_000,
      totalPotonganDiMuka: 0,
      danaBersih: 1_000_000,
      jadwalPelunasan: [{ bulan: 3, hariKe: 90, total: 1_270_000 }],
      simulasiCicilanBulanan: expect.arrayContaining([
        expect.objectContaining({ bulan: 1 }),
      ]),
      catatanJadwal: "Pelunasan aktual dicatat sekaligus pada akhir tenor; rincian bulanan hanya simulasi.",
    });
    expect(peluang.jadwalPelunasan).toHaveLength(1);
    expect(peluang.simulasiCicilanBulanan).toHaveLength(3);
    expect(peluang).not.toHaveProperty("namaLengkap");
  });
});
