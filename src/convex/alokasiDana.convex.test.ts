/**
 * Tes integrasi Convex — alur penyedia dana dan pinjaman tunai.
 *
 * Menjalankan alur setoran → verifikasi admin → marketplace → alokasi Dana →
 * pelunasan Peminjam → penarikan penyedia dana, sambil memeriksa dompet dan ledger.
 * Pinjaman ditanam sebagai aplikasi yang menunggu review karena convex-test
 * belum mendukung storageGetMetadata untuk unggahan KYC.
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import {
  siapkanPengguna as siapkanPenggunaUji,
  type KonteksUji,
  type PeranUji,
  type PenggunaUji,
} from "./test.helpers";
import { modules } from "./test.setup";
import { KOLOM_DANA, ROLE_LAMA } from "../lib/legacy";

type Tx = KonteksUji;

/** Adapter argumen posisional → helper identitas bersama. */
async function siapkanPengguna(
  t: Tx,
  subject: string,
  email: string,
  role: PeranUji,
): Promise<PenggunaUji> {
  return siapkanPenggunaUji(t, subject, { email, role });
}

describe("alur penyedia dana — pinjaman tunai", () => {
  it("menolak setoran, alokasi, pelunasan, dan penarikan tanpa mengubah ledger atau status", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(
      t,
      "admin-alur-dana",
      "admin-alur-dana@pindai.test",
      "admin",
    );
    const { userId: peminjamId, sesi: peminjam } = await siapkanPengguna(
      t,
      "peminjam-alur-dana",
      "peminjam-alur-dana@pindai.test",
      "peminjam",
    );
    const { sesi: dana } = await siapkanPengguna(
      t,
      "dana-alur",
      "dana-alur@pindai.test",
      "peminjam",
    );

    // Peran penyedia dana dapat diaktifkan mandiri, dan pemanggilan ulang idempoten.
    await expect(dana.mutation(api.alokasiDana.naikPeranDana, {})).resolves.toEqual({
      already: false,
    });
    await expect(dana.mutation(api.alokasiDana.naikPeranDana, {})).resolves.toEqual({
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
        nomorReferensi: "PGD-ALUR-DANA",
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
      const danaId = (await ctx.db.query("users").collect()).find(
        (user) => user.email === "dana-alur@pindai.test",
      )?._id;
      if (danaId === undefined) throw new Error("Akun dana uji tidak ditemukan.");
      const depositId = await ctx.db.insert("deposits", {
        [KOLOM_DANA]: danaId,
        jumlah: 2_000_000,
        referensiTransfer: "TRF-ALUR-001",
        status: "menunggu_verifikasi",
        nomorReferensi: "DEP-ALUR-001",
      });
      const withdrawalId = await ctx.db.insert("withdrawals", {
        [KOLOM_DANA]: danaId,
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
      dana.mutation(api.alokasiDana.requestDeposit, {
        jumlah: 2_000_000,
        referensiTransfer: "TRF-ALUR-002",
        metodePembayaran: "transfer",
        tanggalTransfer: Date.now(),
        buktiPembayaranId: await t.run((ctx) => ctx.storage.store(new Blob(["bukti"]))),
      }),
    ).rejects.toThrow("Penerimaan setoran penyedia dana belum diaktifkan tim operasional.");
    await expect(
      admin.mutation(api.admin.confirmDeposit, { depositId }),
    ).rejects.toThrow("penyedia pembayaran belum dipilih atau terintegrasi");
    await expect(
      dana.mutation(api.alokasiDana.allocateFunding, {
        loanId,
        jumlah: 1_000_000,
      }),
    ).rejects.toThrow("penyedia pembayaran belum dipilih atau terintegrasi");
    await expect(
      peminjam.mutation(api.loans.repayLoan, { loanId }),
    ).rejects.toThrow("penyedia pembayaran belum dipilih atau terintegrasi");
    await expect(
      dana.mutation(api.alokasiDana.requestWithdrawal, {
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
    expect(await dana.query(api.alokasiDana.myFundings, {})).toHaveLength(0);
    expect(await dana.query(api.alokasiDana.myWallet, {})).toMatchObject({
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
    const { userId: danaId } = await siapkanPengguna(
      t,
      "dana-bukti-ditolak",
      "dana-bukti-ditolak@pindai.test",
      ROLE_LAMA,
    );
    const { sesi: admin } = await siapkanPengguna(
      t,
      "admin-bukti-ditolak",
      "admin-bukti-ditolak@pindai.test",
      "admin",
    );
    const depositId = await t.run((ctx) =>
      ctx.db.insert("deposits", {
        [KOLOM_DANA]: danaId,
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
    const { sesi: dana } = await siapkanPengguna(
      t,
      "dana-bulanan",
      "dana-bulanan@pindai.test",
      ROLE_LAMA,
    );
    await t.run((ctx) =>
      ctx.db.insert("loans", {
        userId: peminjamId,
        pokokPinjaman: 1_000_000,
        tujuan: "modal_usaha",
        namaLengkap: "Nama Rahasia Bulanan",
        nomorRekening: "1234567890",
        status: "disetujui",
        nomorReferensi: "PGD-BULANAN-DANA",
        tenorHari: 90,
        tenorBulan: 3,
      }),
    );

    const [peluang] = await dana.query(api.alokasiDana.marketplace, {});
    expect(peluang).toMatchObject({
      kodePeminjam: "PMN-1234567890ABCDEF1234",
      biayaLayananTotal: 50_000,
      totalPotonganDiMuka: 50_000,
      danaBersih: 950_000,
      jadwalPelunasan: [{ bulan: 3, hariKe: 90, total: 1_785_001 }],
      simulasiCicilanBulanan: expect.arrayContaining([
        expect.objectContaining({ bulan: 1 }),
      ]),
      catatanJadwal:
        "Biaya admin 2% dan platform 3% untuk tenor 3/6 bulan (atau biaya layanan 3% untuk tenor 1) dipotong di muka dari dana yang diterima; tenor 3 dan 6 bulan dikenai tambahan biaya admin 2% dari nominal cicilan yang dibayar bersama setiap cicilan.",
    });
    expect(peluang.jadwalPelunasan).toHaveLength(1);
    expect(peluang.simulasiCicilanBulanan).toHaveLength(3);
    expect(peluang).not.toHaveProperty("namaLengkap");
  });
});
