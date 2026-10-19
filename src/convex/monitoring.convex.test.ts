/**
 * Uji peringatan sistem pada panel kesehatan.
 *
 * Menjalankan: bunx vitest run src/convex/monitoring.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import { siapkanPengguna } from "./test.helpers";
import { modules } from "./test.setup";

const JAM = 60 * 60 * 1000;
const buatKontek = () => convexTest(schema, modules);

describe("peringatan sistem", () => {
  it("menandai ledger tidak seimbang, WA gagal, dan cron yang terlambat", async () => {
    const t = buatKontek();
    const admin = await siapkanPengguna(t, "Admin", {
      email: "monitor@pindai.test",
      role: "admin",
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("ledger_entries", {
        groupId: "J-UJI",
        arah: "debit",
        jumlah: 1_000,
        akun: "pinjaman:uji",
        jenis: "disbursement",
        keterangan: "entri uji tidak seimbang",
        aktor: "uji",
        waktu: Date.now(),
      });
      await ctx.db.insert("waLogs", {
        nomorTujuan: "0812****",
        jenis: "pengingat",
        isiPesan: "(uji)",
        status: "gagal",
        respon: "HTTP 500: gateway menolak",
        waktu: Date.now() - JAM,
      });
      await ctx.db.insert("cronDenyut", {
        nama: "pengingat-jatuh-tempo-wa",
        terakhirPada: Date.now() - 10 * JAM,
        jumlah: 4,
      });
    });

    const hasil = await admin.sesi.query(api.kesehatan.kesehatanSistem, {});
    const kunci = hasil.peringatan.map((p) => p.kunci);

    expect(kunci).toContain("ledger");
    expect(kunci).toContain("wa-gagal");
    expect(kunci).toContain("cron:pengingat-jatuh-tempo-wa");
    expect(hasil.peringatan.find((p) => p.kunci === "ledger")?.tingkat).toBe("kritis");
  });

  it("tidak menuduh cron yang belum pernah berdenyut pada sistem kosong", async () => {
    const t = buatKontek();
    const admin = await siapkanPengguna(t, "Admin", {
      email: "monitor2@pindai.test",
      role: "admin",
    });

    const hasil = await admin.sesi.query(api.kesehatan.kesehatanSistem, {});
    expect(hasil.peringatan).toHaveLength(0);
  });
});
