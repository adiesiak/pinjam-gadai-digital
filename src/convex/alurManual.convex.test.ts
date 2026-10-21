/**
 * Alur uang MODEL MANUAL, dijalankan tanpa deployment.
 *
 * Skrip `scripts/qa-pendana.ts`, `qa-repay.ts`, dan `qa-penalty.ts` memeriksa
 * hal serupa, tetapi semuanya menuntut deployment Convex yang hidup dan token
 * admin di berkas. Akibatnya alur uang tidak pernah terbukti di sandbox.
 * Berkas ini menjalankan alur yang sama sebagai tes `convex-test`, memakai
 * mutation yang benar-benar dipakai admin dan pendana di aplikasi.
 *
 * Urutan yang diuji, sesuai keputusan pemilik (semua transaksi dicatat manual,
 * satu pinjaman satu pendana):
 *  1. admin mencatat pinjaman nasabah (jalur manual);
 *  2. admin menyetujui, menetapkan satu pendana, lalu mencairkan;
 *  3. pendana melihat pinjaman itu di ruangnya, dengan angka yang sama dengan
 *     laporan portofolionya;
 *  4. pinjaman ditandai lunas;
 *  5. admin mencatat transfer keuntungan pendana (baru boleh setelah lunas);
 *  6. laporan pendana, rekap, dan ledger menunjukkan angka yang konsisten.
 *
 * Menjalankan: bunx vitest run src/convex/alurManual.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import { buatPengguna, siapkanPengguna } from "./test.helpers";
import { modules } from "./test.setup";

describe("alur pinjaman manual dari pencatatan sampai transfer keuntungan", () => {
  it("satu pinjaman, satu pendana: angka pendana, rekap, laporan, dan ledger sepakat", async () => {
    const t = convexTest(schema, modules);
    const admin = await siapkanPengguna(t, "admin alur", {
      email: "admin-alur@pindai.test",
      role: "admin",
    });
    const pendana = await siapkanPengguna(t, "Robert Tanaya", {
      email: "pendana-alur@pindai.test",
      role: "dana",
    });
    const peminjam = await buatPengguna(t, "Rani Peminjam", {
      email: "peminjam-alur@pindai.test",
      role: "peminjam",
    });

    // 1. Pencatatan manual oleh admin. Status awalnya `diajukan`; keputusan
    //    tetap lewat alur review, bukan langsung cair.
    const catat = await admin.sesi.mutation(api.adminPengajuan.catatPinjamanManual, {
      userIdTarget: peminjam.userId,
      pokokPinjaman: 1_000_000,
      tenorHari: 28,
      tujuan: "modal_usaha",
      namaLengkap: "RANI PEMINJAM",
      namaBank: "BCA",
      nomorRekening: "1234567890",
    });
    const loanId = catat.appId;

    // 2. Setujui, tetapkan SATU pendana, lalu cairkan.
    await admin.sesi.mutation(api.loans.approveLoan, { loanId });
    await admin.sesi.mutation(api.penyediaDana.ubahDataPinjaman, {
      loanId,
      pendanaUserId: pendana.userId,
      cairkanSekarang: true,
    });

    const setelahCair = await t.run((ctx) => ctx.db.get(loanId));
    expect(setelahCair?.status).toBe("didanai");
    expect(setelahCair?.pendanaId).toBe(pendana.userId);

    // 3. Pendana melihat pinjaman itu, dan laporan portofolionya memakai angka
    //    yang sama dengan layar.
    const ruang = await pendana.sesi.query(api.penyediaDana.daftarPengajuan, {});
    expect(ruang.pinjaman).toHaveLength(1);
    const baris = ruang.pinjaman[0];
    expect(baris._id).toBe(loanId);
    expect(baris.pendana).not.toBeNull();
    expect(baris.status).toBe("didanai");
    expect(baris.pokokPinjaman).toBe(1_000_000);

    const laporanBerjalan = await pendana.sesi.query(
      api.laporanPendana.dataLaporanPortofolio,
      {},
    );
    expect(laporanBerjalan?.totalDisalurkan).toBe(baris.pokokPinjaman);
    expect(laporanBerjalan?.jumlahBerjalan).toBe(1);
    expect(laporanBerjalan?.pinjamanBerjalan.map((p) => p.nomorReferensi)).toEqual([
      baris.nomorReferensi,
    ]);

    const rekapBerjalan = ruang.rekapPendana[0];
    expect(rekapBerjalan).toMatchObject({
      jumlahPinjaman: 1,
      jumlahAktif: 1,
      jumlahLunas: 0,
      totalDisalurkan: 1_000_000,
      keuntunganPendanaLunas: 0,
    });

    // 4. Pinjaman lunas. Model manual: admin mencatat kenyataan yang sudah
    //    terjadi di luar aplikasi.
    await admin.sesi.mutation(api.loans.ubahStatusPinjaman, { loanId, status: "lunas" });

    // 5. Keuntungan pendana baru boleh dicatat setelah lunas.
    const transfer = await admin.sesi.mutation(api.penyediaDana.catatTransferPendana, {
      loanId,
      metode: "transfer_bank",
      referensi: "MUTASI-ALUR-001",
    });

    // 6. Semua bacaan harus sepakat dengan angka yang baru dicatat.
    const ruangLunas = await pendana.sesi.query(api.penyediaDana.daftarPengajuan, {});
    const barisLunas = ruangLunas.pinjaman[0];
    expect(barisLunas.status).toBe("lunas");
    expect(barisLunas.transfer.status).toBe("dicatat");
    expect(transfer.jumlah).toBe(barisLunas.keuntunganPendana);

    const rekapLunas = ruangLunas.rekapPendana[0];
    expect(rekapLunas.jumlahLunas).toBe(1);
    expect(rekapLunas.jumlahAktif).toBe(0);
    expect(rekapLunas.keuntunganPendanaLunas).toBe(barisLunas.keuntunganPendana);
    expect(rekapLunas.transferBelumDicatat).toBe(0);

    const laporanLunas = await pendana.sesi.query(
      api.laporanPendana.dataLaporanPortofolio,
      {},
    );
    expect(laporanLunas?.keuntunganDibukukan).toBe(rekapLunas.keuntunganPendanaLunas);
    expect(laporanLunas?.pinjamanLunas.map((p) => p.nomorReferensi)).toEqual([
      barisLunas.nomorReferensi,
    ]);

    const rekapAdmin = await admin.sesi.query(api.laporanPendana.dataRekapPendana, {});
    expect(rekapAdmin?.total.jumlahPendana).toBe(1);
    expect(rekapAdmin?.total.keuntunganPendanaLunas).toBe(
      rekapLunas.keuntunganPendanaLunas,
    );

    // Ledger tetap seimbang setelah seluruh rantai pencatatan.
    const ringkas = await admin.sesi.query(api.admin.ledgerSummary, {});
    expect(ringkas.seimbang).toBe(true);
  });
});
