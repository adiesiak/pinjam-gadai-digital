/**
 * Tes jembatan data backup Google Drive.
 *
 * Yang dijaga:
 * - hanya tabel dalam kontrak yang boleh dibaca action;
 * - baris KYC dan pinjaman benar-benar terambil;
 * - dokumen KYC menghasilkan tautan storage untuk diunduh action;
 * - hasil backup dicatat sebagai aksi `backup` yang dikenali pemantau.
 *
 * Menjalankan: bunx vitest run src/convex/backupDriveData.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema";
import { siapkanPengguna } from "./test.helpers";
import { modules } from "./test.setup";

describe("data backup Google Drive", () => {
  it("menolak tabel di luar kontrak KYC/pinjaman", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.query(internal.backupDriveData.halamanTabel, {
        tabel: "auditLog",
      }),
    ).rejects.toThrow(/tidak dikenal/i);
  });

  it("mengambil baris KYC dan tautan dokumennya", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await siapkanPengguna(t, "NASABAH KYC", {
      email: "kyc-drive@contoh.test",
      role: "peminjam",
    });
    const storageId = await t.run(async (ctx) =>
      ctx.storage.store(new Blob(["foto ktp uji"], { type: "image/jpeg" })),
    );
    await t.run(async (ctx) => {
      await ctx.db.insert("kycProfil", {
        userId,
        status: "PENDING_REVIEW",
        ktpId: storageId,
        dibuatPada: Date.now(),
        diperbaruiPada: Date.now(),
      });
    });

    const halaman = await t.query(internal.backupDriveData.halamanTabel, {
      tabel: "kycProfil",
      batas: 10,
    });
    expect(halaman.baris).toHaveLength(1);
    expect(halaman.kursor).toBeNull();

    const dokumen = await t.query(internal.backupDriveData.halamanDokumen, {
      sumber: "kycProfil",
      batas: 10,
    });
    expect(dokumen.dokumen).toHaveLength(1);
    expect(dokumen.dokumen[0]?.jenis).toBe("ktp");
    expect(dokumen.dokumen[0]?.storageId).toBe(storageId);
    expect(dokumen.dokumen[0]?.url).toContain("http");
  });

  it("mengambil bukti pembayaran manual milik pinjaman", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await siapkanPengguna(t, "NASABAH BUKTI", {
      email: "bukti-drive@contoh.test",
      role: "peminjam",
    });
    const buktiId = await t.run(async (ctx) =>
      ctx.storage.store(new Blob(["bukti transfer uji"], { type: "image/png" })),
    );
    await t.run(async (ctx) => {
      await ctx.db.insert("manualPaymentReceipts", {
        userId,
        jenis: "pinjaman",
        jumlah: 150_000,
        metodePembayaran: "transfer",
        tanggalTransfer: Date.now(),
        referensiTransfer: "TRF-BUKTI-DRIVE",
        buktiPembayaranId: buktiId,
        status: "menunggu_pencocokan",
        nomorReferensi: "BUKTI-DRIVE-UJI",
      });
    });

    const dokumen = await t.query(internal.backupDriveData.halamanDokumen, {
      sumber: "manualPaymentReceipts",
      batas: 10,
    });
    expect(dokumen.dokumen).toHaveLength(1);
    expect(dokumen.dokumen[0]?.jenis).toBe("bukti_pembayaran_manual");
    expect(dokumen.dokumen[0]?.storageId).toBe(buktiId);
    expect(dokumen.dokumen[0]?.url).toContain("http");
  });

  it("mencatat hasil backup sebagai aksi backup", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.backupDriveData.selesaikan, {
      jumlahTabel: 1,
      jumlahBaris: 2,
      jumlahDokumen: 1,
      jumlahDokumenGagal: 0,
      folder: "PINDAI Backup",
      manifest: "manifest-uji.json.enc",
      status: "lengkap",
    });
    const audit = await t.run(async (ctx) =>
      ctx.db.query("auditLog").withIndex("by_aksi", (q) => q.eq("aksi", "backup")).first(),
    );
    expect(audit?.detail).toContain("google-drive");
    expect(audit?.detail).toContain("manifest-uji.json.enc");
  });
});
