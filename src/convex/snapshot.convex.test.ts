import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import { siapkanPengguna } from "./test.helpers";
import { modules } from "./test.setup";

/**
 * Penjaga backup per halaman.
 *
 * Snapshot dulu membaca 19 tabel sekaligus dalam satu fungsi. Satu fungsi
 * Convex hanya boleh membaca ribuan dokumen, jadi arsipnya akan berhenti bisa
 * diunduh begitu data tumbuh — dan kegagalan itu baru terasa saat backup
 * dibutuhkan. Tes ini mengunci janji penggantinya: pembacaan bertahap, tidak
 * ada baris hilang, tidak ada baris dobel, dan kursor selalu berakhir.
 */
describe("snapshot backup per halaman", () => {
  it("merangkai semua baris tanpa duplikat dan berhenti di kursor null", async () => {
    const t = convexTest(schema, modules);
    const admin = await siapkanPengguna(t, "ADMIN SNAPSHOT", {
      email: "admin-snapshot@contoh.test",
      role: "admin",
    });
    // Helper admin membuat satu baris users; tambah enam supaya perlu beberapa halaman.
    await t.run(async (ctx) => {
      for (let i = 0; i < 6; i += 1) {
        await ctx.db.insert("users", { name: `NASABAH ${i}` });
      }
    });

    const terkumpul: string[] = [];
    let kursor: string | null = null;
    let halamanDibaca = 0;
    do {
      const halaman: { baris: unknown[]; kursor: string | null } = await admin.sesi.query(
        api.system.snapshotBagian,
        {
          tabel: "users",
          batas: 3,
          kursor: kursor ?? undefined,
        },
      );
      expect(halaman.baris.length).toBeLessThanOrEqual(3);
      for (const baris of halaman.baris) {
        terkumpul.push((baris as { _id: string })._id);
      }
      kursor = halaman.kursor;
      halamanDibaca += 1;
      // Jaring pengaman: kursor yang tidak pernah selesai menggantung di sini.
      expect(halamanDibaca).toBeLessThan(50);
    } while (kursor !== null);

    expect(halamanDibaca).toBeGreaterThan(1);
    expect(terkumpul.length).toBe(7);
    expect(new Set(terkumpul).size).toBe(7);
  });

  it("menolak nama tabel yang tidak ada di kontrak backup", async () => {
    const t = convexTest(schema, modules);
    const admin = await siapkanPengguna(t, "ADMIN TABEL", {
      email: "admin-tabel@contoh.test",
      role: "admin",
    });
    await expect(
      admin.sesi.query(api.system.snapshotBagian, { tabel: "bukan_tabel" }),
    ).rejects.toThrow(/tidak dikenal/);
  });

  it("menolak pembacaan dari akun non-admin", async () => {
    const t = convexTest(schema, modules);
    const nasabah = await siapkanPengguna(t, "NASABAH", {
      email: "nasabah-snapshot@contoh.test",
      role: "peminjam",
    });
    await expect(
      nasabah.sesi.query(api.system.snapshotBagian, { tabel: "users" }),
    ).rejects.toThrow();
  });

  it("tautan dokumen QRIS dibaca dari konfigurasi, bukan tabel transaksi", async () => {
    const t = convexTest(schema, modules);
    const admin = await siapkanPengguna(t, "ADMIN QRIS", {
      email: "admin-qris@contoh.test",
      role: "admin",
    });
    // Action, bukan query: ekspor tautan dokumen wajib meninggalkan jejak audit.
    const hasil = await admin.sesi.action(api.system.snapshotDokumen, { sumber: "qris" });
    expect(hasil.kursor).toBeNull();
    expect(Array.isArray(hasil.dokumen)).toBe(true);
  });

  it("ekspor tautan dokumen meninggalkan jejak audit", async () => {
    const t = convexTest(schema, modules);
    const admin = await siapkanPengguna(t, "ADMIN EKSPOR", {
      email: "admin-ekspor@contoh.test",
      role: "admin",
    });
    const sebelum = await t.run(async (ctx) =>
      (await ctx.db.query("auditLog").collect()).filter(
        (a) => a.aksi === "backup_dokumen",
      ).length,
    );

    await admin.sesi.action(api.system.snapshotDokumen, { sumber: "loans" });

    const sesudah = await t.run(async (ctx) =>
      (await ctx.db.query("auditLog").collect()).filter(
        (a) => a.aksi === "backup_dokumen",
      ),
    );
    expect(sesudah.length).toBe(sebelum + 1);
    const terakhir = sesudah[sesudah.length - 1];
    expect(terakhir.target).toBe("loans");
    expect(terakhir.aktorLabel).toContain("admin-ekspor@contoh.test");
  });

  it("nasabah biasa tidak bisa mengekspor tautan dokumen", async () => {
    const t = convexTest(schema, modules);
    const nasabah = await siapkanPengguna(t, "NASABAH EKSPOR", {
      email: "nasabah-ekspor@contoh.test",
      role: "nasabah",
    });
    await expect(
      nasabah.sesi.action(api.system.snapshotDokumen, { sumber: "loans" }),
    ).rejects.toThrow();
  });
});
