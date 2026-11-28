/**
 * Uji peringatan sistem pada panel kesehatan.
 *
 * Menjalankan: bunx vitest run src/convex/monitoring.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "./_generated/api";
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

  it("backup yang terlantar tercatat di audit meski bukan masalah kritis", async () => {
    const t = buatKontek();
    await siapkanPengguna(t, "Admin", {
      email: "monitor3@pindai.test",
      role: "admin",
    });

    // Ledger berisi (supaya pemeriksa backup aktif) dan backup terakhir lama.
    await t.run(async (ctx) => {
      await ctx.db.insert("ledger_entries", {
        groupId: "J-BACKUP",
        arah: "debit",
        jumlah: 1_000,
        akun: "pinjaman:uji",
        jenis: "uji",
        keterangan: "uji",
        waktu: Date.now(),
      });
      await ctx.db.insert("auditLog", {
        aktorLabel: "admin@pindai.test",
        aksi: "backup",
        target: "snapshot-json",
        detail: "backup manual",
        // 40 hari lalu — jauh melewati batas 7 hari.
        waktu: Date.now() - 40 * 24 * JAM,
      });
    });

    const sebelum = await t.run(async (ctx) =>
      (await ctx.db.query("auditLog").collect()).filter(
        (a) => a.aksi === "peringatan_sistem",
      ).length,
    );
    expect(sebelum).toBe(0);

    const hasil = await t.mutation(internal.monitoring.periksaSistem, {});
    expect(hasil.dicatat).toBeGreaterThan(0);

    // Sebelum perbaikan, peringatan "backup" bertingkat "peringatan" TIDAK
    // pernah dicatat — hanya yang kritis. Backup 48 hari di produksi karena itu
    // tidak meninggalkan satu pun jejak audit.
    const sesudah = await t.run(async (ctx) =>
      (await ctx.db.query("auditLog").collect()).filter(
        (a) => a.aksi === "peringatan_sistem",
      ),
    );
    expect(sesudah.length).toBe(1);
    expect(sesudah[0]?.detail).toContain("backup");
  });

  it("peringatan yang sama tidak dicatat berulang dalam 24 jam", async () => {
    const t = buatKontek();
    await siapkanPengguna(t, "Admin", {
      email: "monitor4@pindai.test",
      role: "admin",
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("ledger_entries", {
        groupId: "J-BACKUP2",
        arah: "debit",
        jumlah: 1_000,
        akun: "pinjaman:uji",
        jenis: "uji",
        keterangan: "uji",
        waktu: Date.now(),
      });
    });

    await t.mutation(internal.monitoring.periksaSistem, {});
    const pertama = await t.run(async (ctx) =>
      (await ctx.db.query("auditLog").collect()).filter(
        (a) => a.aksi === "peringatan_sistem",
      ).length,
    );
    expect(pertama).toBe(1);

    // Putaran berikutnya (masih dalam jendela 24 jam) tidak menambah entri.
    const kedua = await t.mutation(internal.monitoring.periksaSistem, {});
    expect(kedua.dicatat).toBe(0);
    const sesudah = await t.run(async (ctx) =>
      (await ctx.db.query("auditLog").collect()).filter(
        (a) => a.aksi === "peringatan_sistem",
      ).length,
    );
    expect(sesudah).toBe(1);
  });
});
