/**
 * Tes pendanaan gadai oleh penyedia dana.
 *
 * Yang dijaga:
 *  - hanya admin yang boleh menetapkan pendana dan mencatat pembayaran;
 *  - pembayaran dihitung server dari sisa pokok, bukan nominal bebas;
 *  - sewa modal dibagi 47 : 13 dan setiap baris menyimpan snapshot;
 *  - gadai hanya terlihat oleh pendana yang menanggung pokoknya;
 *  - gadai tanpa pendana tetap dicatat, dengan seluruh sewa menjadi platform;
 *  - pelunasan penuh memindahkan status ke menunggu pelepasan.
 *
 * Menjalankan: bunx vitest run src/convex/gadaiPendana.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { buatPengguna, siapkanPengguna } from "./test.helpers";
import { modules } from "./test.setup";

describe("pendanaan gadai oleh penyedia dana", () => {
  it("membagi sewa 47 : 13, mencatat pembayaran, dan hanya mengirim gadai milik pendana", async () => {
    const t = convexTest(schema, modules);
    const admin = await siapkanPengguna(t, "Admin Gadai", {
      email: "admin-gadai@uji.test",
      role: "admin",
    });
    const pendana = await siapkanPengguna(t, "Pendana Gadai", {
      email: "pendana-gadai@uji.test",
      role: "dana",
    });
    const pendanaLain = await siapkanPengguna(t, "Pendana Lain", {
      email: "pendana-lain@uji.test",
      role: "dana",
    });
    const peminjam = await buatPengguna(t, "Peminjam Gadai", {
      email: "peminjam-gadai@uji.test",
      role: "peminjam",
    });

    const pawnId = await t.run((ctx) =>
      ctx.db.insert("pawns", {
        userId: peminjam.userId,
        deskripsiBarang: "Kamera uji",
        kategori: "Elektronik",
        alamatPenilaian: "Jakarta",
        namaLengkap: "PEMINJAM GADAI",
        nomorRekening: "1234567890",
        status: "aktif",
        nomorReferensi: "PGD-UJI-001",
        hargaPasar: 8_000_000,
        nilaiTaksiran: 6_000_000,
        pokokGadai: 3_500_000,
        persenSewaModal: 10,
        sisaPokok: 3_500_000,
      }),
    );
    const pawnLainId = await t.run(async (ctx) =>
      ctx.db.insert("pawns", {
        userId: peminjam.userId,
        deskripsiBarang: "Laptop uji",
        kategori: "Elektronik",
        alamatPenilaian: "Bandung",
        namaLengkap: "PEMINJAM GADAI",
        nomorRekening: "1234567891",
        status: "aktif",
        nomorReferensi: "PGD-UJI-002",
        hargaPasar: 5_000_000,
        nilaiTaksiran: 4_000_000,
        pokokGadai: 2_000_000,
        persenSewaModal: 5,
        sisaPokok: 2_000_000,
      }),
    );

    await admin.sesi.mutation(api.gadai.tetapkanPendanaGadai, {
      pawnId,
      danaId: pendana.userId,
    });
    await admin.sesi.mutation(api.gadai.tetapkanPendanaGadai, {
      pawnId: pawnLainId,
      danaId: pendanaLain.userId,
    });

    // Peminjam atau pendana tidak boleh menetapkan pemilik posisi.
    await expect(
      pendana.sesi.mutation(api.gadai.tetapkanPendanaGadai, {
        pawnId,
        danaId: pendanaLain.userId,
      }),
    ).rejects.toThrow();

    const hasil = await admin.sesi.mutation(api.gadai.catatPembayaranGadai, {
      pawnId,
      cicilPokok: 1_000_000,
      referensi: "TRF-GADAI-001",
    });
    expect(hasil).toMatchObject({
      pokokDicicil: 1_000_000,
      sewaDibayar: 350_000,
      totalBayar: 1_350_000,
      sisaPokokSetelah: 2_500_000,
      sewaModalBerikut: 250_000,
      porsiPendana: 274_167,
      porsiPlatform: 75_833,
    });

    // Setelah pembayaran tercatat, pemilik posisi tidak boleh diganti karena
    // baris pembayaran hanya menyimpan porsi, bukan id pemiliknya.
    await expect(
      admin.sesi.mutation(api.gadai.tetapkanPendanaGadai, {
        pawnId,
        danaId: pendanaLain.userId,
      }),
    ).rejects.toThrow(/pembayaran tercatat/i);

    const rincian = await admin.sesi.query(api.gadai.rincianPembayaranGadai, {
      pawnId,
    });
    expect(rincian).toMatchObject({
      sisaPokok: 2_500_000,
      sewaBerikut: 250_000,
      porsiPendanaBerikut: 195_834,
      porsiPlatformBerikut: 54_166,
      totalPorsiPendana: 274_167,
      totalPorsiPlatform: 75_833,
      pendanaId: pendana.userId,
    });
    expect(rincian?.riwayat[0]).toMatchObject({
      pokokDicicil: 1_000_000,
      sewaDibayar: 350_000,
      porsiPendana: 274_167,
      porsiPlatform: 75_833,
      referensi: "TRF-GADAI-001",
    });

    // Ruang pendana hanya memuat gadai yang pokoknya ia tanggung.
    const ruang = await pendana.sesi.query(api.penyediaDana.daftarPengajuan, {});
    expect(ruang.gadai).toHaveLength(1);
    expect(ruang.gadai[0]).toMatchObject({
      _id: pawnId,
      sisaPokok: 2_500_000,
      sewaBerikut: 250_000,
      porsiPendanaBerikut: 195_834,
      porsiPlatformBerikut: 54_166,
      porsiPendanaTercatat: 274_167,
      porsiPlatformTercatat: 75_833,
    });
    expect(ruang.rekapPendana[0]?.gadai).toMatchObject({
      jumlah: 1,
      pokok: 3_500_000,
      sisaPokok: 2_500_000,
      sewaBerikut: 250_000,
      porsiPendanaBerikut: 195_834,
      porsiPlatformBerikut: 54_166,
      porsiPendanaTercatat: 274_167,
    });

    const ruangLain = await pendanaLain.sesi.query(
      api.penyediaDana.daftarPengajuan,
      {},
    );
    expect(ruangLain.gadai).toHaveLength(1);
    expect(ruangLain.gadai[0]?._id).toBe(pawnLainId);
    expect(ruangLain.rekapPendana[0]?.gadai?.pokok).toBe(2_000_000);

    // Nominal melebihi sisa pokok ditolak tanpa menulis baris pembayaran.
    await expect(
      admin.sesi.mutation(api.gadai.catatPembayaranGadai, {
        pawnId,
        cicilPokok: 2_500_001,
      }),
    ).rejects.toThrow(/sisa pokok/i);
    const jumlahPembayaran = await t.run(async (ctx) =>
      ctx.db.query("pawnPayments").collect(),
    );
    expect(jumlahPembayaran).toHaveLength(1);

    // Pelunasan penuh mengubah status ledger dan menutup pencatatan berikutnya.
    const lunas = await admin.sesi.mutation(api.gadai.catatPembayaranGadai, {
      pawnId,
      cicilPokok: 2_500_000,
      bayarHanyaSewa: false,
    });
    expect(lunas).toMatchObject({
      sisaPokokSetelah: 0,
      sewaModalBerikut: 0,
      porsiPendana: 195_834,
      porsiPlatform: 54_166,
    });
    const sesudah = await t.run((ctx) => ctx.db.get(pawnId));
    expect(sesudah?.status).toBe("menunggu_pelepasan");
    await expect(
      admin.sesi.mutation(api.gadai.catatPembayaranGadai, {
        pawnId,
        cicilPokok: 0,
        bayarHanyaSewa: true,
      }),
    ).rejects.toThrow(/aktif/i);
  });

  it("gadai tanpa pendana: seluruh sewa menjadi platform dan tidak masuk portofolio siapa pun", async () => {
    const t = convexTest(schema, modules);
    const admin = await siapkanPengguna(t, "Admin Gadai Platform", {
      email: "admin-gadai-platform@uji.test",
      role: "admin",
    });
    const pendana = await siapkanPengguna(t, "Pendana Tanpa Gadai", {
      email: "pendana-tanpa-gadai@uji.test",
      role: "dana",
    });
    const peminjam = await buatPengguna(t, "Peminjam Platform", {
      email: "peminjam-platform@uji.test",
      role: "peminjam",
    });
    const pawnId = await t.run(async (ctx) =>
      ctx.db.insert("pawns", {
        userId: peminjam.userId,
        deskripsiBarang: "Motor uji",
        kategori: "Kendaraan",
        alamatPenilaian: "Surabaya",
        namaLengkap: "PEMINJAM PLATFORM",
        nomorRekening: "9876543210",
        status: "aktif",
        nomorReferensi: "PGD-UJI-003",
        pokokGadai: 1_000_000,
        persenSewaModal: 5,
        sisaPokok: 1_000_000,
      }),
    );

    const hasil = await admin.sesi.mutation(api.gadai.catatPembayaranGadai, {
      pawnId,
      cicilPokok: 0,
      bayarHanyaSewa: true,
    });
    expect(hasil).toMatchObject({
      sewaDibayar: 50_000,
      porsiPendana: 0,
      porsiPlatform: 50_000,
    });

    const rincian = await admin.sesi.query(api.gadai.rincianPembayaranGadai, {
      pawnId,
    });
    expect(rincian?.porsiPendanaBerikut).toBe(0);
    expect(rincian?.porsiPlatformBerikut).toBe(50_000);

    const ruang = await pendana.sesi.query(api.penyediaDana.daftarPengajuan, {});
    expect(ruang.gadai).toHaveLength(0);
    expect(ruang.rekapPendana).toHaveLength(0);
  });

  it("transfer hak pendana gadai: belum dicatat, dicatat, dibatalkan dengan alasan, lalu dicatat ulang", async () => {
    const t = convexTest(schema, modules);
    const admin = await siapkanPengguna(t, "Admin Transfer Gadai", {
      email: "admin-transfer-gadai@uji.test",
      role: "admin",
    });
    const pendana = await siapkanPengguna(t, "Pendana Transfer Gadai", {
      email: "pendana-transfer-gadai@uji.test",
      role: "dana",
    });
    const peminjam = await buatPengguna(t, "Peminjam Transfer Gadai", {
      email: "peminjam-transfer-gadai@uji.test",
      role: "peminjam",
    });
    const pawnId = await t.run((ctx) =>
      ctx.db.insert("pawns", {
        userId: peminjam.userId,
        deskripsiBarang: "Kamera uji transfer",
        kategori: "Elektronik",
        alamatPenilaian: "Jakarta",
        namaLengkap: "PEMINJAM TRANSFER GADAI",
        nomorRekening: "1234567892",
        status: "aktif",
        nomorReferensi: "PGD-UJI-TRF",
        hargaPasar: 8_000_000,
        nilaiTaksiran: 6_000_000,
        pokokGadai: 3_500_000,
        persenSewaModal: 10,
        sisaPokok: 3_500_000,
      }),
    );
    await admin.sesi.mutation(api.gadai.tetapkanPendanaGadai, {
      pawnId,
      danaId: pendana.userId,
    });
    const bayar = await admin.sesi.mutation(api.gadai.catatPembayaranGadai, {
      pawnId,
      cicilPokok: 1_000_000,
      referensi: "TRF-GADAI-002",
    });

    // Sebelum dicatat, kewajibannya tampil sebagai "belum dicatat" dan porsi
    // pendana masih utuh di kolom "belum ditandai transfer".
    const sebelum = await admin.sesi.query(api.gadai.daftarTransferGadai, {});
    expect(sebelum.ringkasan).toMatchObject({
      jumlahBelumDicatat: 1,
      nilaiBelumDicatat: bayar.porsiPendana,
      jumlahTercatat: 0,
      nilaiTercatat: 0,
    });
    expect(sebelum.rows[0]).toMatchObject({
      pawnId,
      nomorReferensi: "PGD-UJI-TRF",
      pendanaNama: "Pendana Transfer Gadai",
      jumlah: bayar.porsiPendana,
      transfer: { id: null, status: "belum_dicatat" },
    });
    const ruangSebelum = await pendana.sesi.query(api.penyediaDana.daftarPengajuan, {});
    expect(ruangSebelum.gadai[0]).toMatchObject({
      porsiPendanaTransfer: 0,
      porsiPendanaBelumTransfer: bayar.porsiPendana,
    });

    // Admin mencatat transfer dengan nominal dari snapshot pembayaran.
    const paymentId = sebelum.rows[0]!.paymentId;
    const dicatat = await admin.sesi.mutation(api.gadai.catatTransferGadai, {
      paymentId,
      metode: "transfer_bank",
      referensi: "MUTASI-GADAI-001",
    });
    expect(dicatat.jumlah).toBe(bayar.porsiPendana);

    const sesudah = await admin.sesi.query(api.gadai.daftarTransferGadai, {});
    expect(sesudah.ringkasan).toMatchObject({
      jumlahBelumDicatat: 0,
      nilaiBelumDicatat: 0,
      jumlahTercatat: 1,
      nilaiTercatat: bayar.porsiPendana,
    });
    expect(sesudah.rows[0]?.transfer).toMatchObject({
      status: "dicatat",
      jumlah: bayar.porsiPendana,
      metode: "transfer_bank",
      referensi: "MUTASI-GADAI-001",
      dicatatOlehLabel: "admin-transfer-gadai@uji.test",
    });
    const ruangSesudah = await pendana.sesi.query(api.penyediaDana.daftarPengajuan, {});
    expect(ruangSesudah.gadai[0]).toMatchObject({
      porsiPendanaTransfer: bayar.porsiPendana,
      porsiPendanaBelumTransfer: 0,
    });

    // Satu pembayaran hanya boleh punya satu transfer aktif.
    await expect(
      admin.sesi.mutation(api.gadai.catatTransferGadai, {
        paymentId,
        metode: "tunai",
      }),
    ).rejects.toThrow(/sudah punya transfer/i);

    // Pembatalan wajib beralasan dan hanya boleh dilakukan admin.
    await expect(
      admin.sesi.mutation(api.gadai.batalkanTransferGadai, {
        transferId: dicatat.transferId,
        alasan: "  ",
      }),
    ).rejects.toThrow(/alasan/i);
    await expect(
      pendana.sesi.mutation(api.gadai.batalkanTransferGadai, {
        transferId: dicatat.transferId,
        alasan: "bukan admin",
      }),
    ).rejects.toThrow();

    await admin.sesi.mutation(api.gadai.batalkanTransferGadai, {
      transferId: dicatat.transferId,
      alasan: "salah nominal",
    });
    const setelahBatal = await admin.sesi.query(api.gadai.daftarTransferGadai, {});
    expect(setelahBatal.rows[0]?.transfer).toMatchObject({
      status: "dibatalkan",
      alasanBatal: "salah nominal",
    });
    expect(setelahBatal.ringkasan).toMatchObject({
      jumlahBelumDicatat: 1,
      nilaiBelumDicatat: bayar.porsiPendana,
      jumlahTercatat: 0,
    });
    const ruangBatal = await pendana.sesi.query(api.penyediaDana.daftarPengajuan, {});
    expect(ruangBatal.gadai[0]).toMatchObject({
      porsiPendanaTransfer: 0,
      porsiPendanaBelumTransfer: bayar.porsiPendana,
    });

    // Setelah dibatalkan, kewajibannya terbuka lagi dan boleh dicatat ulang.
    const ulang = await admin.sesi.mutation(api.gadai.catatTransferGadai, {
      paymentId,
      metode: "e_wallet",
      referensi: "EWALLET-GADAI-002",
    });
    expect(ulang.jumlah).toBe(bayar.porsiPendana);
    const akhir = await admin.sesi.query(api.gadai.daftarTransferGadai, {});
    expect(akhir.rows[0]?.transfer).toMatchObject({
      status: "dicatat",
      metode: "e_wallet",
      referensi: "EWALLET-GADAI-002",
    });

    // Jejak audit menyimpan pembatalan, bukan menghapusnya.
    const auditTrail = await t.run((ctx) => ctx.db.query("auditLog").collect());
    expect(auditTrail.some((a) => a.aksi === "gadai_transfer_batal")).toBe(true);
    expect(auditTrail.some((a) => a.aksi === "gadai_transfer")).toBe(true);
  });

  it("rekap transfer gadai hanya memuat milik pendana pembaca dan membuka antrean setelah dibatalkan", async () => {
    const t = convexTest(schema, modules);
    const admin = await siapkanPengguna(t, "Admin Rekap Gadai", {
      email: "admin-rekap-gadai@uji.test",
      role: "admin",
    });
    const pendanaA = await siapkanPengguna(t, "Pendana Rekap A", {
      email: "pendana-rekap-a@uji.test",
      role: "dana",
    });
    const pendanaB = await siapkanPengguna(t, "Pendana Rekap B", {
      email: "pendana-rekap-b@uji.test",
      role: "dana",
    });
    const peminjam = await buatPengguna(t, "Peminjam Rekap Gadai", {
      email: "peminjam-rekap-gadai@uji.test",
      role: "peminjam",
    });

    /** Gadai aktif dengan satu pembayaran, ditanggung pendana tertentu. */
    async function siapkanGadai(pendanaId: Id<"users">, nomor: string) {
      const pawnId = await t.run((ctx) =>
        ctx.db.insert("pawns", {
          userId: peminjam.userId,
          deskripsiBarang: `Barang ${nomor}`,
          kategori: "Elektronik",
          alamatPenilaian: "Jakarta",
          namaLengkap: "PEMINJAM REKAP GADAI",
          nomorRekening: "1234567893",
          status: "aktif",
          nomorReferensi: nomor,
          pokokGadai: 2_000_000,
          persenSewaModal: 10,
          sisaPokok: 2_000_000,
          pendanaId,
        }),
      );
      const bayar = await admin.sesi.mutation(api.gadai.catatPembayaranGadai, {
        pawnId,
        cicilPokok: 500_000,
      });
      return { pawnId, bayar };
    }

    const gadaiA = await siapkanGadai(pendanaA.userId, "PGD-REKAP-A");
    const gadaiB = await siapkanGadai(pendanaB.userId, "PGD-REKAP-B");

    // Sebelum ada catatan: kewajiban pendana A masuk antrean, milik B tidak.
    const awalA = await pendanaA.sesi.query(
      api.penyediaDana.laporanTransferGadaiPendana,
      {},
    );
    expect(awalA.rows).toHaveLength(0);
    expect(awalA.belum).toHaveLength(1);
    expect(awalA.belum[0]).toMatchObject({
      referensi: "PGD-REKAP-A",
      jumlah: gadaiA.bayar.porsiPendana,
    });
    expect(awalA.ringkasan).toMatchObject({
      jumlahTercatat: 0,
      jumlahBelumDicatat: 1,
      nilaiBelumDicatat: gadaiA.bayar.porsiPendana,
    });

    // Admin mencatat transfer untuk kedua pendana.
    const daftar = await admin.sesi.query(api.gadai.daftarTransferGadai, {});
    const untukA = daftar.rows.find((r) => r.pawnId === gadaiA.pawnId)!;
    const untukB = daftar.rows.find((r) => r.pawnId === gadaiB.pawnId)!;
    const transferA = await admin.sesi.mutation(api.gadai.catatTransferGadai, {
      paymentId: untukA.paymentId,
      metode: "transfer_bank",
      referensi: "MUTASI-REKAP-A",
    });
    await admin.sesi.mutation(api.gadai.catatTransferGadai, {
      paymentId: untukB.paymentId,
      metode: "tunai",
    });

    const sesudahA = await pendanaA.sesi.query(
      api.penyediaDana.laporanTransferGadaiPendana,
      {},
    );
    expect(sesudahA.rows).toHaveLength(1);
    expect(sesudahA.rows[0]).toMatchObject({
      nomorReferensi: "PGD-REKAP-A",
      jumlah: gadaiA.bayar.porsiPendana,
      metode: "transfer_bank",
      referensi: "MUTASI-REKAP-A",
      status: "dicatat",
    });
    expect(sesudahA.belum).toHaveLength(0);
    expect(sesudahA.ringkasan).toMatchObject({
      jumlahTercatat: 1,
      nilaiTercatat: gadaiA.bayar.porsiPendana,
      jumlahBelumDicatat: 0,
    });

    // Admin melihat dua catatan sekaligus; pendana B hanya miliknya.
    const rekapAdmin = await admin.sesi.query(
      api.penyediaDana.laporanTransferGadaiPendana,
      {},
    );
    expect(rekapAdmin.rows).toHaveLength(2);
    expect(rekapAdmin.ringkasan.jumlahTercatat).toBe(2);
    const rekapB = await pendanaB.sesi.query(
      api.penyediaDana.laporanTransferGadaiPendana,
      {},
    );
    expect(rekapB.rows).toHaveLength(1);
    expect(rekapB.rows[0]?.nomorReferensi).toBe("PGD-REKAP-B");

    // Pembatalan membuka lagi kewajiban pendana A, bukan menutupnya permanen.
    await admin.sesi.mutation(api.gadai.batalkanTransferGadai, {
      transferId: transferA.transferId,
      alasan: "salah pendana",
    });
    const setelahBatal = await pendanaA.sesi.query(
      api.penyediaDana.laporanTransferGadaiPendana,
      {},
    );
    expect(setelahBatal.belum).toHaveLength(1);
    expect(setelahBatal.ringkasan).toMatchObject({
      jumlahTercatat: 0,
      jumlahDibatalkan: 1,
      nilaiDibatalkan: gadaiA.bayar.porsiPendana,
      nilaiBelumDicatat: gadaiA.bayar.porsiPendana,
    });
  });
});
