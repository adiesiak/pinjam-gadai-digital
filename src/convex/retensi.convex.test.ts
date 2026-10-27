import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

const HARI_MS = 24 * 60 * 60 * 1000;

/**
 * Retensi job harian: isi pesan WhatsApp dan jejak audit dibersihkan menurut
 * ambang admin, dan pembersihannya bertahap supaya satu putaran tidak menembus
 * batas eksekusi Convex.
 */
describe("retensi log pesan WhatsApp & jejak audit", () => {
  it("menghapus baris lebih tua dari ambang dan menyisakan yang baru", async () => {
    const t = convexTest(schema, modules);
    const sekarang = Date.now();

    await t.run(async (ctx) => {
      await ctx.db.insert("systemConfig", {
        slot: "global",
        versi: 1,
        diperbaruiPada: sekarang,
        retensiLogWaHari: 30,
        retensiAuditHari: 90,
      });
      await ctx.db.insert("waLogs", {
        nomorTujuan: "628111111111",
        jenis: "pengingat",
        isiPesan: "pesan lama",
        status: "terkirim",
        waktu: sekarang - 40 * HARI_MS,
      });
      await ctx.db.insert("waLogs", {
        nomorTujuan: "628222222222",
        jenis: "pengingat",
        isiPesan: "pesan baru",
        status: "terkirim",
        waktu: sekarang - 2 * HARI_MS,
      });
      await ctx.db.insert("auditLog", {
        aktorLabel: "admin",
        aksi: "ubah_config",
        waktu: sekarang - 120 * HARI_MS,
      });
      await ctx.db.insert("auditLog", {
        aktorLabel: "admin",
        aksi: "ubah_config",
        waktu: sekarang - 3 * HARI_MS,
      });
    });

    const hapusWa = await t.mutation(internal.retensi.bersihkanLogWhatsapp, {});
    expect(hapusWa.dihapus).toBe(1);
    const hapusAudit = await t.mutation(internal.retensi.bersihkanAudit, {});
    expect(hapusAudit.dihapus).toBe(1);

    const sisa = await t.run(async (ctx) => ({
      wa: await ctx.db.query("waLogs").collect(),
      audit: await ctx.db.query("auditLog").collect(),
    }));
    expect(sisa.wa.map((r) => r.isiPesan)).toEqual(["pesan baru"]);
    expect(sisa.audit.map((r) => r.aksi)).toEqual(["ubah_config"]);
    expect(sisa.audit[0].waktu).toBeGreaterThan(sekarang - 4 * HARI_MS);
  });

  it("memakai ambang bawaan saat konfigurasi belum menyebut retensi", async () => {
    const t = convexTest(schema, modules);
    const sekarang = Date.now();
    // Bawaan 180 hari untuk log pesan: baris 200 hari terhapus, 30 hari tetap.
    await t.run(async (ctx) => {
      for (const hari of [200, 30]) {
        await ctx.db.insert("waLogs", {
          nomorTujuan: "628333333333",
          jenis: "pengingat",
          isiPesan: `pesan ${hari} hari`,
          status: "terkirim",
          waktu: sekarang - hari * HARI_MS,
        });
      }
    });

    const hasil = await t.mutation(internal.retensi.bersihkanLogWhatsapp, {});
    expect(hasil.dihapus).toBe(1);
    const sisa = await t.run((ctx) => ctx.db.query("waLogs").collect());
    expect(sisa).toHaveLength(1);
    expect(sisa[0].isiPesan).toBe("pesan 30 hari");
  });

  it("membatasi satu putaran ke 500 baris dan meninggalkan sisanya", async () => {
    const t = convexTest(schema, modules);
    const sekarang = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert("systemConfig", {
        slot: "global",
        versi: 1,
        diperbaruiPada: sekarang,
        retensiLogWaHari: 30,
      });
      for (let i = 0; i < 520; i += 1) {
        await ctx.db.insert("waLogs", {
          nomorTujuan: "628444444444",
          jenis: "pengingat",
          isiPesan: `pesan ${i}`,
          status: "terkirim",
          waktu: sekarang - 60 * HARI_MS,
        });
      }
    });

    const pertama = await t.mutation(internal.retensi.bersihkanLogWhatsapp, {});
    expect(pertama.dihapus).toBe(500);
    const kedua = await t.mutation(internal.retensi.bersihkanLogWhatsapp, {});
    expect(kedua.dihapus).toBe(20);
    const sisa = await t.run((ctx) => ctx.db.query("waLogs").collect());
    expect(sisa).toHaveLength(0);
  });
});
