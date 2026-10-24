import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { HARI_MS, hitungSiklusPendana } from "../lib/siklusPendana";
import { api } from "./_generated/api";
import { akunDompetDana } from "./ledger";
import schema from "./schema";
import { pembayaranSiklus } from "./siklusPendana";
import { aktifkanTotpUntukSesi, buatPengguna } from "./test.helpers";
import { modules } from "./test.setup";

function siklusFields(pokok: number, mulaiPada: number) {
  const hitung = hitungSiklusPendana(pokok);
  return {
    pokok: hitung.pokok,
    imbal: hitung.imbal,
    potongan: hitung.potongan,
    totalCair: hitung.totalCair,
    mulaiPada,
    jatuhTempoPada: mulaiPada + 30 * HARI_MS,
  };
}

describe("siklus pendana 30 hari", () => {
  it("membayar tepat satu kali hak siklus; pembayaran berikutnya masuk jaminan", async () => {
    const t = convexTest(schema, modules);
    const { userId: pendanaId } = await buatPengguna(t, "Pendana Siklus", {
      email: "pendana-siklus@pindai.test",
      role: "dana",
    });
    const mulai = Date.UTC(2026, 9, 1);
    const siklusId = await t.run((ctx) =>
      ctx.db.insert("siklusPendana", {
        pendanaId,
        ...siklusFields(1_000_000, mulai),
        status: "berjalan",
        totalMasuk: 0,
      }),
    );
    const funding = {
      siklusId,
      jumlahAlokasi: 1_000_000,
      imbalHasil: 300_000,
      potonganAdmin: 50_000,
    };

    const pertama = await t.run((ctx) => pembayaranSiklus(ctx, funding));
    expect(pertama).toEqual({
      akun: akunDompetDana(pendanaId),
      potonganAdmin: 50_000,
      imbalBersih: 1_250_000,
      kelebihan: 0,
    });
    expect((await t.run((ctx) => ctx.db.get(siklusId)))?.totalMasuk).toBe(
      1_250_000,
    );

    // Pembayaran kedua atas siklus yang sama (mis. perpanjangan) tidak boleh
    // menambah dompet pendana atau menagih biaya platform lagi.
    const kedua = await t.run((ctx) => pembayaranSiklus(ctx, funding));
    expect(kedua).toEqual({
      akun: akunDompetDana(pendanaId),
      potonganAdmin: 0,
      imbalBersih: 0,
      kelebihan: 1_300_000,
    });
    expect((await t.run((ctx) => ctx.db.get(siklusId)))?.totalMasuk).toBe(
      1_250_000,
    );
  });

  it("mencairkan pada jatuh tempo dan menutup kekurangan dari jaminan platform", async () => {
    const t = convexTest(schema, modules);
    const admin = await buatPengguna(t, "Admin Siklus", {
      email: "admin-siklus@pindai.test",
      role: "admin",
    });
    await aktifkanTotpUntukSesi(t, admin.userId, admin.authSessionId);
    const { userId: pendanaId } = await buatPengguna(t, "Pendana Cair", {
      email: "pendana-cair@pindai.test",
      role: "dana",
    });

    const sekarang = Date.now();
    const siklusId = await t.run((ctx) =>
      ctx.db.insert("siklusPendana", {
        pendanaId,
        ...siklusFields(1_000_000, sekarang - 31 * HARI_MS),
        status: "berjalan",
        totalMasuk: 0,
      }),
    );
    // Baru pokok Rp1.000.000 yang kembali dari pinjaman; imbal belum tertutup.
    await t.run((ctx) =>
      pembayaranSiklus(ctx, {
        siklusId,
        jumlahAlokasi: 1_000_000,
        imbalHasil: 0,
        potonganAdmin: 0,
      }),
    );

    const hasil = await admin.sesi.mutation(api.siklusPendana.cairkanSiklus, {
      siklusId,
    });
    expect(hasil.totalCair).toBe(1_250_000);
    expect(hasil.kurang).toBe(250_000);

    const siklus = await t.run((ctx) => ctx.db.get(siklusId));
    expect(siklus?.status).toBe("dicairkan");
    expect(siklus?.totalMasuk).toBe(1_250_000);
    expect(siklus?.dicairkanPada).toBeGreaterThan(0);

    const jaminan = await t.run(async (ctx) => {
      const entries = await ctx.db.query("ledger_entries").collect();
      return entries.filter((e) => e.akun === "platform:GUARANTEE");
    });
    expect(jaminan).toHaveLength(1);
    expect(jaminan[0]).toMatchObject({ arah: "kredit", jumlah: 250_000 });

    const dompet = await t.run(async (ctx) => {
      const entries = await ctx.db.query("ledger_entries").collect();
      return entries
        .filter((e) => e.akun === akunDompetDana(pendanaId))
        .reduce(
          (saldo, e) => saldo + (e.arah === "debit" ? e.jumlah : -e.jumlah),
          0,
        );
    });
    // Yang dicatat di sini hanya top-up jaminan; Rp1.000.000 sebelumnya sudah
    // dijurnal oleh pemanggil settlement saat uang pinjaman masuk.
    expect(dompet).toBe(250_000);
  });

  it("memutar ulang siklus sesuai pilihan pendana: pokok baru = total cair lama", async () => {
    const t = convexTest(schema, modules);
    const admin = await buatPengguna(t, "Admin Putar", {
      email: "admin-putar@pindai.test",
      role: "admin",
    });
    await aktifkanTotpUntukSesi(t, admin.userId, admin.authSessionId);
    const pendana = await buatPengguna(t, "Pendana Putar", {
      email: "pendana-putar@pindai.test",
      role: "dana",
    });

    const siklusId = await t.run((ctx) =>
      ctx.db.insert("siklusPendana", {
        pendanaId: pendana.userId,
        ...siklusFields(1_000_000, Date.now() - 31 * HARI_MS),
        status: "berjalan",
        totalMasuk: 0,
      }),
    );

    await pendana.sesi.mutation(api.siklusPendana.pilihSiklus, {
      siklusId,
      pilihan: "putar_ulang",
    });
    expect((await t.run((ctx) => ctx.db.get(siklusId)))?.pilihanPendana).toBe(
      "putar_ulang",
    );

    const hasil = await admin.sesi.mutation(api.siklusPendana.putarUlangSiklus, {
      siklusId,
    });
    expect(hasil.pokokBaru).toBe(1_250_000);

    const lama = await t.run((ctx) => ctx.db.get(siklusId));
    expect(lama?.status).toBe("diputar_ulang");
    expect(lama?.siklusLanjutanId).toBe(hasil.siklusBaruId);

    // Pokok siklus baru adalah seluruh hak siklus lama, sudah dihitung masuk
    // dompet; yang masih ditagih hanya Imbal Hasil bersih 30 hari berikutnya.
    const baru = await t.run((ctx) => ctx.db.get(hasil.siklusBaruId));
    expect(baru).toMatchObject({
      pendanaId: pendana.userId,
      pokok: 1_250_000,
      imbal: 375_000,
      potongan: 62_500,
      totalCair: 1_562_500,
      totalMasuk: 1_250_000,
      siklusAsalId: siklusId,
      status: "berjalan",
    });

    const jaminan = await t.run(async (ctx) => {
      const entries = await ctx.db.query("ledger_entries").collect();
      return entries.filter((e) => e.akun === "platform:GUARANTEE");
    });
    expect(jaminan).toHaveLength(1);
    expect(jaminan[0]).toMatchObject({ arah: "kredit", jumlah: 1_250_000 });
  });

  it("menolak putar ulang tanpa pilihan pendana, sebelum jatuh tempo, atau milik akun lain", async () => {
    const t = convexTest(schema, modules);
    const admin = await buatPengguna(t, "Admin Tolak", {
      email: "admin-tolak-putar@pindai.test",
      role: "admin",
    });
    await aktifkanTotpUntukSesi(t, admin.userId, admin.authSessionId);
    const pendana = await buatPengguna(t, "Pendana Tolak", {
      email: "pendana-tolak-putar@pindai.test",
      role: "dana",
    });
    const lain = await buatPengguna(t, "Pendana Lain", {
      email: "pendana-lain-putar@pindai.test",
      role: "dana",
    });

    const siklusId = await t.run((ctx) =>
      ctx.db.insert("siklusPendana", {
        pendanaId: pendana.userId,
        ...siklusFields(500_000, Date.now() - 31 * HARI_MS),
        status: "berjalan",
        totalMasuk: 0,
      }),
    );

    await expect(
      lain.sesi.mutation(api.siklusPendana.pilihSiklus, {
        siklusId,
        pilihan: "putar_ulang",
      }),
    ).rejects.toThrow(/bukan milik akun Anda/i);
    await expect(
      admin.sesi.mutation(api.siklusPendana.putarUlangSiklus, { siklusId }),
    ).rejects.toThrow(/belum memilih untuk memutar ulang/i);

    await pendana.sesi.mutation(api.siklusPendana.pilihSiklus, {
      siklusId,
      pilihan: "cairkan",
    });
    await expect(
      admin.sesi.mutation(api.siklusPendana.putarUlangSiklus, { siklusId }),
    ).rejects.toThrow(/belum memilih untuk memutar ulang/i);

    const belumJatuhTempo = await t.run((ctx) =>
      ctx.db.insert("siklusPendana", {
        pendanaId: pendana.userId,
        ...siklusFields(500_000, Date.now()),
        status: "berjalan",
        totalMasuk: 0,
      }),
    );
    await pendana.sesi.mutation(api.siklusPendana.pilihSiklus, {
      siklusId: belumJatuhTempo,
      pilihan: "putar_ulang",
    });
    await expect(
      admin.sesi.mutation(api.siklusPendana.putarUlangSiklus, {
        siklusId: belumJatuhTempo,
      }),
    ).rejects.toThrow(/belum jatuh tempo/i);
    expect(
      (await t.run((ctx) => ctx.db.get(belumJatuhTempo)))?.status,
    ).toBe("berjalan");
  });

  it("membuka modal siap putar setelah pelunasan dan mencatat keuntungan putaran", async () => {
    const t = convexTest(schema, modules);
    const { userId: pendanaId } = await buatPengguna(t, "Pendana Putar Modal", {
      email: "pendana-putar-modal@pindai.test",
      role: "dana",
    });

    const siklusId = await t.run((ctx) =>
      ctx.db.insert("siklusPendana", {
        pendanaId,
        ...siklusFields(1_000_000, Date.now() - HARI_MS),
        status: "berjalan",
        // Dompet pendana sudah penuh dan terkunci; modal pokok sedang bekerja
        // di pinjaman melalui akun jaminan platform.
        totalMasuk: 1_250_000,
        modalSiapPutar: 0,
        modalDikerjakan: 1_000_000,
        jumlahPutaran: 1,
        totalKeuntunganPutaran: 0,
      }),
    );

    const hasil = await t.run((ctx) =>
      pembayaranSiklus(ctx, {
        siklusId,
        jumlahAlokasi: 1_000_000,
        imbalHasil: 300_000,
        potonganAdmin: 50_000,
        peranSiklus: "putar",
        // Pinjaman tenor 7 hari membayar 26%, bukan snapshot pendana 30%.
        bungaAktual: 260_000,
        pelunasanPenuh: true,
      }),
    );
    // Hak pendana sudah dibayar penuh, jadi seluruh uang kembali masuk ke
    // jaminan platform. Bunga aktual 260 ribu menjadi keuntungan platform;
    // pokok 1 juta hanya kembali, bukan keuntungan.
    expect(hasil).toEqual({
      akun: akunDompetDana(pendanaId),
      potonganAdmin: 0,
      imbalBersih: 0,
      kelebihan: 1_300_000,
    });

    const siklus = await t.run((ctx) => ctx.db.get(siklusId));
    expect(siklus).toMatchObject({
      totalMasuk: 1_250_000,
      modalSiapPutar: 1_000_000,
      modalDikerjakan: 0,
      totalKeuntunganPutaran: 260_000,
    });
  });

  it("menutup putaran modal selama gerbang pembayaran belum terverifikasi", async () => {
    const t = convexTest(schema, modules);
    const admin = await buatPengguna(t, "Admin Putar Modal", {
      email: "admin-putar-modal@pindai.test",
      role: "admin",
    });
    await aktifkanTotpUntukSesi(t, admin.userId, admin.authSessionId);
    const pendana = await buatPengguna(t, "Pendana Modal Kerja", {
      email: "pendana-modal-kerja@pindai.test",
      role: "dana",
    });
    const peminjam = await buatPengguna(t, "Peminjam Modal Kerja", {
      email: "peminjam-modal-kerja@pindai.test",
      role: "peminjam",
    });

    const siklusId = await t.run((ctx) =>
      ctx.db.insert("siklusPendana", {
        pendanaId: pendana.userId,
        ...siklusFields(1_000_000, Date.now() - HARI_MS),
        status: "berjalan",
        totalMasuk: 1_250_000,
        modalSiapPutar: 1_000_000,
        modalDikerjakan: 0,
        jumlahPutaran: 0,
        totalKeuntunganPutaran: 0,
      }),
    );
    const loanId = await t.run((ctx) =>
      ctx.db.insert("loans", {
        userId: peminjam.userId,
        pokokPinjaman: 1_000_000,
        tujuan: "Tambahan modal warung",
        namaLengkap: "Peminjam Modal Kerja",
        nomorRekening: "1234567890",
        status: "disetujui",
        nomorReferensi: "PGD-PUTAR-MODAL",
        tenorHari: 7,
      }),
    );

    await expect(
      admin.sesi.mutation(api.alokasiDana.putarModalSiklus, {
        siklusId,
        loanId,
        jumlah: 1_000_000,
      }),
    ).rejects.toThrow("penyedia pembayaran belum dipilih atau terintegrasi");

    // Gagal tertutup: tidak ada modal, status pinjaman, atau alokasi yang
    // berubah saat gerbang pembayaran belum terverifikasi.
    const siklus = await t.run((ctx) => ctx.db.get(siklusId));
    expect(siklus).toMatchObject({
      totalMasuk: 1_250_000,
      modalSiapPutar: 1_000_000,
      modalDikerjakan: 0,
      jumlahPutaran: 0,
    });

    const pinjaman = await t.run((ctx) => ctx.db.get(loanId));
    expect(pinjaman?.status).toBe("disetujui");

    const funding = await t.run(async (ctx) =>
      ctx.db
        .query("fundings")
        .withIndex("by_loan", (q) => q.eq("loanId", loanId))
        .first(),
    );
    expect(funding).toBeNull();
  });

  it("menolak pencairan sebelum jatuh tempo", async () => {
    const t = convexTest(schema, modules);
    const admin = await buatPengguna(t, "Admin Dini", {
      email: "admin-dini@pindai.test",
      role: "admin",
    });
    await aktifkanTotpUntukSesi(t, admin.userId, admin.authSessionId);
    const { userId: pendanaId } = await buatPengguna(t, "Pendana Dini", {
      email: "pendana-dini@pindai.test",
      role: "dana",
    });

    const siklusId = await t.run((ctx) =>
      ctx.db.insert("siklusPendana", {
        pendanaId,
        ...siklusFields(500_000, Date.now()),
        status: "berjalan",
        totalMasuk: 0,
      }),
    );

    await expect(
      admin.sesi.mutation(api.siklusPendana.cairkanSiklus, { siklusId }),
    ).rejects.toThrow(/belum jatuh tempo/i);
    expect((await t.run((ctx) => ctx.db.get(siklusId)))?.status).toBe(
      "berjalan",
    );
  });
});
