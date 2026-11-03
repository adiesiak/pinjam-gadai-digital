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
  it("menolak alokasi, pelunasan, dan gadai tanpa mengubah ledger atau status", async () => {
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
    await admin.mutation(api.loans.markLoanInReview, {
      loanId,
      reason: "Berkas lengkap, mulai ditinjau.",
    });
    expect((await peminjam.query(api.loans.listMyLoans, {}))[0]?.status).toBe(
      "sedang_direview",
    );
    await admin.mutation(api.loans.approveLoan, {
      loanId,
      reason: "Layak disetujui penuh.",
    });
    expect((await peminjam.query(api.loans.listMyLoans, {}))[0]?.status).toBe(
      "disetujui",
    );

    // Alokasi, pelunasan, dan gadai tetap ditutup paymentGuard. Jalur setoran
    // dan penarikan manual diuji terpisah di bawah.
    const pawnId = await t.run(async (ctx) =>
      ctx.db.insert("pawns", {
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
      }),
    );
    const ledgerCountBefore = await t.run(async (ctx) =>
      (await ctx.db.query("ledger_entries").collect()).length,
    );
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
    const pawnAfter = await t.run((ctx) => ctx.db.get(pawnId));
    const pawnPaymentsAfter = await t.run((ctx) =>
      ctx.db.query("pawnPayments").withIndex("by_pawn", (q) => q.eq("pawnId", pawnId)).collect(),
    );
    expect(ledgerCountAfter).toBe(ledgerCountBefore);
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

  it("mengkredit setoran manual dan memproses penarikan manual dengan jurnal seimbang", async () => {
    const t = convexTest(schema, modules);
    const { sesi: dana } = await siapkanPengguna(
      t,
      "dana-jalur-manual",
      "dana-jalur-manual@pindai.test",
      "dana",
    );
    const { sesi: admin } = await siapkanPengguna(
      t,
      "admin-jalur-manual",
      "admin-jalur-manual@pindai.test",
      "admin",
    );
    const buktiMasuk = await t.run((ctx) =>
      ctx.storage.store(new Blob(["bukti setoran"], { type: "image/png" })),
    );
    const depositId = await t.run(async (ctx) => {
      const danaId = (await ctx.db.query("users").collect()).find(
        (user) => user.email === "dana-jalur-manual@pindai.test",
      )?._id;
      if (danaId === undefined) throw new Error("Akun dana uji tidak ditemukan.");
      return ctx.db.insert("deposits", {
        danaId,
        jumlah: 2_000_000,
        referensiTransfer: "TRF-MANUAL-001",
        status: "menunggu_verifikasi",
        metodePembayaran: "transfer",
        jalur: "manual",
        buktiPembayaranId: buktiMasuk,
        nomorReferensi: "DEP-MANUAL-001",
      });
    });

    await admin.mutation(api.admin.matchDepositEvidence, {
      depositId,
      referensiMutasi: "MUTASI-MASUK-001",
      jumlahMutasi: 2_000_000,
    });
    const deposit = await t.run((ctx) => ctx.db.get(depositId));
    expect(deposit).toMatchObject({
      status: "terverifikasi",
      statusPencocokan: "dicocokkan",
      referensiMutasi: "MUTASI-MASUK-001",
      dikreditkanPada: expect.any(Number),
      jurnalGroupId: expect.any(String),
    });
    expect(await dana.query(api.alokasiDana.myWallet, {})).toMatchObject({
      saldo: 2_000_000,
      terkunci: 0,
      tertahanPenarikan: 0,
      bisaDitarik: 2_000_000,
    });

    // Rute otomatis tetap tertutup dan tidak membuat baris baru.
    const depositCount = await t.run(async (ctx) =>
      (await ctx.db.query("deposits").collect()).length,
    );
    await expect(
      dana.mutation(api.alokasiDana.requestDepositOtomatis, { jumlah: 1_000_000 }),
    ).rejects.toThrow("Jalur otomatis dimatikan sementara");
    await expect(
      dana.mutation(api.alokasiDana.requestWithdrawalOtomatis, {
        jumlah: 500_000,
        namaBank: "BCA",
        nomorRekening: "1234567890",
      }),
    ).rejects.toThrow("Jalur otomatis dimatikan sementara");
    expect(
      await t.run(async (ctx) => (await ctx.db.query("deposits").collect()).length),
    ).toBe(depositCount);

    await dana.mutation(api.alokasiDana.requestWithdrawal, {
      jumlah: 500_000,
      namaBank: "BCA",
      nomorRekening: "1234567890",
    });
    const withdrawal = (await dana.query(api.alokasiDana.myWithdrawals, {}))[0];
    expect(withdrawal).toMatchObject({
      jumlah: 500_000,
      biayaPencairan: 25_000,
      jumlahBersih: 475_000,
      status: "menunggu_proses",
      jalur: "manual",
    });
    // Permintaan yang masih mengantre sudah mereservasi saldo.
    expect(await dana.query(api.alokasiDana.myWallet, {})).toMatchObject({
      saldo: 2_000_000,
      tertahanPenarikan: 500_000,
      bisaDitarik: 1_500_000,
    });

    const buktiKeluar = await t.run((ctx) =>
      ctx.storage.store(new Blob(["bukti transfer keluar"], { type: "image/png" })),
    );
    await admin.mutation(api.admin.processWithdrawal, {
      withdrawalId: withdrawal._id,
      referensiTransfer: "TRF-KELUAR-001",
      buktiTransferId: buktiKeluar,
    });
    const withdrawalAfter = await t.run((ctx) => ctx.db.get(withdrawal._id));
    expect(withdrawalAfter).toMatchObject({
      status: "diproses",
      referensiTransfer: "TRF-KELUAR-001",
      diprosesPada: expect.any(Number),
      jurnalGroupId: expect.any(String),
    });
    expect(await dana.query(api.alokasiDana.myWallet, {})).toMatchObject({
      saldo: 1_500_000,
      tertahanPenarikan: 0,
      bisaDitarik: 1_500_000,
    });

    const ledger = await t.run((ctx) => ctx.db.query("ledger_entries").collect());
    expect(ledger).toHaveLength(4);
    expect(
      ledger.filter((row) => row.akun === "platform:DANA_CLEARING"),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ jenis: "deposit", arah: "kredit", jumlah: 2_000_000 }),
        expect.objectContaining({ jenis: "withdrawal", arah: "debit", jumlah: 500_000 }),
      ]),
    );
    expect(await admin.query(api.admin.ledgerSummary, {})).toMatchObject({
      entryCount: 4,
      seimbang: true,
    });
  });

  it("mencatat penolakan bukti setoran hanya sebagai metadata, tanpa mengubah status atau ledger", async () => {
    const t = convexTest(schema, modules);
    const { userId: danaId } = await siapkanPengguna(
      t,
      "dana-bukti-ditolak",
      "dana-bukti-ditolak@pindai.test",
      "dana",
    );
    const { sesi: admin } = await siapkanPengguna(
      t,
      "admin-bukti-ditolak",
      "admin-bukti-ditolak@pindai.test",
      "admin",
    );
    const depositId = await t.run((ctx) =>
      ctx.db.insert("deposits", {
        danaId,
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

  it("mengkredit setoran lama tanpa bukti hanya lewat referensi mutasi admin", async () => {
    const t = convexTest(schema, modules);
    const { userId: danaId, sesi: dana } = await siapkanPengguna(
      t,
      "dana-setoran-lama",
      "dana-setoran-lama@pindai.test",
      "dana",
    );
    const { sesi: admin } = await siapkanPengguna(
      t,
      "admin-setoran-lama",
      "admin-setoran-lama@pindai.test",
      "admin",
    );
    const depositId = await t.run((ctx) =>
      ctx.db.insert("deposits", {
        danaId,
        jumlah: 250_000,
        referensiTransfer: "TRF-LAMA-001",
        status: "menunggu_verifikasi",
        nomorReferensi: "DEP-LAMA-001",
      }),
    );

    await admin.mutation(api.admin.creditLegacyDeposit, {
      depositId,
      referensiMutasi: "MUTASI-LAMA-001",
    });
    expect(await dana.query(api.alokasiDana.myWallet, {})).toMatchObject({
      saldo: 250_000,
      bisaDitarik: 250_000,
    });
    const deposit = await t.run((ctx) => ctx.db.get(depositId));
    expect(deposit).toMatchObject({
      status: "terverifikasi",
      statusPencocokan: "dicocokkan",
      referensiMutasi: "MUTASI-LAMA-001",
      dikreditkanPada: expect.any(Number),
    });
    const ledger = await t.run((ctx) => ctx.db.query("ledger_entries").collect());
    expect(ledger).toHaveLength(2);
    expect(await admin.query(api.admin.ledgerSummary, {})).toMatchObject({
      entryCount: 2,
      seimbang: true,
    });
  });

  it("menghubungkan posisi pendana lintas model: penetapan pendana tampil di portofolio, penggantian memindahkannya", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(
      t,
      "admin-hubung",
      "admin-hubung@pindai.test",
      "admin",
    );
    const { userId: peminjamId } = await siapkanPengguna(
      t,
      "rani-hubung",
      "rani-hubung@pindai.test",
      "peminjam",
    );
    const { sesi: robert, userId: robertId } = await siapkanPengguna(
      t,
      "Robert",
      "robert-hubung@pindai.test",
      "dana",
    );
    const { sesi: asep, userId: asepId } = await siapkanPengguna(
      t,
      "Asep",
      "asep-hubung@pindai.test",
      "dana",
    );

    // Pinjaman berjalan milik Robert (model 1 pinjaman = 1 pendana) PLUS baris
    // alokasi lama yang juga menunjuk Robert — sumber ganda yang harus dibaca
    // sekali saja, bukan dua kali.
    const loanId = await t.run(async (ctx) => {
      await ctx.db.patch(peminjamId, { kodePeminjam: "PMN-HUBUNG1" });
      const id = await ctx.db.insert("loans", {
        userId: peminjamId,
        pokokPinjaman: 1_000_000,
        pokokDiajukan: 1_000_000,
        tujuan: "Modal usaha",
        namaLengkap: "Rani Peminjam",
        nomorRekening: "1234567890",
        status: "didanai",
        nomorReferensi: "PGD-HUBUNG-1",
        tenorHari: 30,
        didanaiPada: Date.now(),
        pendanaId: robertId,
        pendanaNama: "Robert",
      });
      await ctx.db.insert("fundings", {
        loanId: id,
        danaId: robertId,
        jumlahAlokasi: 1_000_000,
        imbalHasil: 300_000,
        status: "dialokasikan",
        nomorReferensi: "FND-HUBUNG-1",
      });
      return id;
    });

    const awal = await robert.query(api.alokasiDana.myPortfolio, {});
    expect(awal.map((r) => r.loanRef)).toEqual(["PGD-HUBUNG-1"]);
    expect(awal[0]).toMatchObject({
      pokokPinjaman: 1_000_000,
      jumlahAlokasi: 1_000_000,
      statusPinjaman: "didanai",
    });
    expect(
      (await robert.query(api.alokasiDana.myFundingContracts, {})).map((r) => r.loanRef),
    ).toEqual(["PGD-HUBUNG-1"]);
    // Pendana lain tidak ikut mengklaim.
    expect(await asep.query(api.alokasiDana.myPortfolio, {})).toEqual([]);

    // Admin memindahkan pendananya ke Asep dari ruang penyedia dana.
    await admin.mutation(api.penyediaDana.ubahDataPinjaman, {
      loanId,
      pendanaEmail: "asep-hubung@pindai.test",
      alasan: "Pendana dipindah ke Asep",
    });

    // Robert tidak lagi melihat posisi itu walau baris alokasi lamanya masih ada.
    expect(await robert.query(api.alokasiDana.myPortfolio, {})).toEqual([]);
    expect(await robert.query(api.alokasiDana.myFundingContracts, {})).toEqual([]);
    // Asep melihatnya tepat satu kali (dari model kanonik, tanpa baris alokasi).
    const setelah = await asep.query(api.alokasiDana.myPortfolio, {});
    expect(setelah.map((r) => r.loanRef)).toEqual(["PGD-HUBUNG-1"]);
    expect(setelah[0]?.statusAlokasi).toBe("dialokasikan");
    expect(asepId).toBeDefined();

    // Dompet tetap murni ledger — tidak bertambah/berkurang oleh koreksi
    // catatan — dan posisinya ikut berpindah bersama kepemilikan pinjaman.
    expect(await robert.query(api.alokasiDana.myWallet, {})).toMatchObject({
      saldo: 0,
      posisiAlokasi: 0,
      danaBekerja: 0,
    });
    expect(await asep.query(api.alokasiDana.myWallet, {})).toMatchObject({
      saldo: 0,
      danaBekerja: 0,
    });
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
      "dana",
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
      biayaLayananTotal: 20_000,
      totalPotonganDiMuka: 20_000,
      danaBersih: 980_000,
      jadwalPelunasan: [{ bulan: 3, hariKe: 90, total: 1_264_801 }],
      simulasiCicilanBulanan: expect.arrayContaining([
        expect.objectContaining({ bulan: 1 }),
      ]),
      catatanJadwal:
        "Biaya admin 2% (biaya platform dihapus) untuk tenor 3/6 bulan (atau biaya layanan 2% untuk tenor 1) dipotong di muka dari dana yang diterima; setiap pembayaran bulanan (tenor 1, 3, dan 6 bulan) dikenai tambahan biaya admin 2% dari nominal cicilan.",
    });
    expect(peluang.jadwalPelunasan).toHaveLength(1);
    expect(peluang.simulasiCicilanBulanan).toHaveLength(3);
    expect(peluang).not.toHaveProperty("namaLengkap");
  });
});
