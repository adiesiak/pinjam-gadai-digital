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
