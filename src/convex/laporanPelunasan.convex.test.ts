import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { DEFAULT_CONFIG } from "../lib/system-config";
import { internal } from "./_generated/api";
import schema from "./schema";
import { siapkanPengguna } from "./test.helpers";
import { modules } from "./test.setup";

/**
 * Penjaga sakelar laporan pelunasan.
 *
 * Laporan pelunasan memuat catatan keuntungan pendana: dokumen keuangan yang
 * keluar dari aplikasi. Sejak sakelar `laporanPelunasanOtomatis` ada, bawaan
 * harus MATI — laporan hanya berangkat bila admin menyalakannya atau memintanya
 * sendiri — dan setiap pengiriman harus meninggalkan jejak audit.
 */
describe("sakelar laporan pelunasan", () => {
  it("bawaan mati: laporan tidak berangkat sendiri", () => {
    expect(DEFAULT_CONFIG.laporanPelunasanOtomatis).toBe(false);
  });

  it("sakelar dibaca dari konfigurasi yang berlaku", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(internal.system._laporanPelunasanOtomatis, {})).toBe(false);

    await t.run(async (ctx) => {
      await ctx.db.insert("systemConfig", {
        slot: "global",
        laporanPelunasanOtomatis: true,
        diperbaruiPada: Date.now(),
      });
    });
    expect(await t.query(internal.system._laporanPelunasanOtomatis, {})).toBe(true);
  });

  it("pengiriman laporan meninggalkan jejak di Audit Trail", async () => {
    const t = convexTest(schema, modules);
    const admin = await siapkanPengguna(t, "ADMIN LAPORAN", {
      email: "admin-laporan@contoh.test",
      role: "admin",
    });

    await t.mutation(internal.system._auditLaporanPendana, {
      aksi: "laporan_pelunasan",
      target: "PGD-20260101-AAAA",
      detail: "Laporan pelunasan terkirim (diminta admin).",
      olehUserId: admin.userId,
    });

    const baris = await t.run((ctx) => ctx.db.query("auditLog").collect());
    expect(baris.length).toBe(1);
    expect(baris[0].aksi).toBe("laporan_pelunasan");
    expect(baris[0].target).toBe("PGD-20260101-AAAA");
    expect(baris[0].aktorLabel).toBe("admin-laporan@contoh.test");
  });
});
