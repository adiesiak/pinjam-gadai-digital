/**
 * Uji rincian pinjaman: siapa yang boleh membaca, dan pembatas laju kirim.
 *
 * Menjalankan: bunx vitest run src/convex/rincianPinjaman.convex.test.ts
 *
 * Pengiriman ke gateway tidak diuji di sini (butuh jaringan dan token nyata);
 * yang dijaga adalah kedua hal yang bisa merusak data atau membanjiri gateway:
 * akses baca, dan pagar sebelum kirim.
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { siapkanPengguna, type KonteksUji } from "./test.helpers";
import { modules } from "./test.setup";

const HARI = 86_400_000;
const NOMOR_UJI = "628123456789";

/** Pinjaman harian yang sudah dicairkan milik satu pengguna. */
async function buatPinjaman(
  t: KonteksUji,
  userId: Id<"users">,
  patch: Partial<{ nomorReferensi: string; nomorWhatsApp: string }> = {},
): Promise<Id<"loans">> {
  return t.run((ctx) =>
    ctx.db.insert("loans", {
      userId,
      pokokPinjaman: 500_000,
      tujuan: "Modal usaha",
      namaLengkap: "Rani Peminjam",
      namaBank: "BCA",
      nomorRekening: "1234567890",
      nomorWhatsApp: patch.nomorWhatsApp ?? "628123456789",
      status: "didanai",
      nomorReferensi: patch.nomorReferensi ?? "PNJ-2026-0042",
      tenorHari: 30,
      didanaiPada: Date.now() - 5 * HARI,
    }),
  );
}

describe("data rincian pinjaman", () => {
  it("pemilik membaca rinciannya sendiri, tapi tidak boleh mengirim", async () => {
    const t = convexTest(schema, modules);
    const rani = await siapkanPengguna(t, "Rani Peminjam", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    const loanId = await buatPinjaman(t, rani.userId);

    const hasil = await rani.sesi.query(api.rincianPinjaman.dataRincian, { loanId });

    expect(hasil.bolehKirim).toBe(false);
    expect(hasil.email).toBe("rani@pindai.test");
    expect(hasil.whatsapp).toBe("628123456789");
    expect(hasil.dokumen.nomorReferensi).toBe("PNJ-2026-0042");
    expect(hasil.dokumen.totalKewajiban).toBe(650_000);
    expect(hasil.dokumen.jadwal).toBeNull();
  });

  it("menolak pengguna lain yang bukan admin", async () => {
    const t = convexTest(schema, modules);
    const rani = await siapkanPengguna(t, "Rani Peminjam", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    const lain = await siapkanPengguna(t, "Budi Peminjam", {
      email: "budi@pindai.test",
      role: "peminjam",
    });
    const loanId = await buatPinjaman(t, rani.userId);

    await expect(lain.sesi.query(api.rincianPinjaman.dataRincian, { loanId })).rejects.toThrow(
      /Super Admin|khusus/i,
    );
  });

  it("admin dengan TOTP terverifikasi boleh mengirim ke kontak terdaftar", async () => {
    const t = convexTest(schema, modules);
    const rani = await siapkanPengguna(t, "Rani Peminjam", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    const admin = await siapkanPengguna(t, "Super Admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const loanId = await buatPinjaman(t, rani.userId);

    const hasil = await admin.sesi.query(api.rincianPinjaman.dataRincian, { loanId });

    expect(hasil.bolehKirim).toBe(true);
    expect(hasil.email).toBe("rani@pindai.test");
    expect(hasil.whatsapp).toBe("628123456789");
  });

  it("tanpa nomor KYC, nomor WhatsApp akun jadi cadangan", async () => {
    const t = convexTest(schema, modules);
    const rani = await siapkanPengguna(t, "Rani Peminjam", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    await t.run((ctx) => ctx.db.patch(rani.userId, { nomorWhatsApp: "628999888777" }));
    const loanId = await t.run((ctx) =>
      ctx.db.insert("loans", {
        userId: rani.userId,
        pokokPinjaman: 400_000,
        tujuan: "Kebutuhan pribadi",
        namaLengkap: "Rani Peminjam",
        nomorRekening: "1234567890",
        status: "disetujui",
        nomorReferensi: "PNJ-2026-0043",
        tenorHari: 30,
      }),
    );

    const hasil = await rani.sesi.query(api.rincianPinjaman.dataRincian, { loanId });
    expect(hasil.whatsapp).toBe("628999888777");
    expect(hasil.dokumen.totalKewajiban).toBeNull();
  });
});

describe("pembatas laju kirim rincian", () => {
  it("menolak kiriman kedua dalam satu menit dan mencatat status kiriman", async () => {
    const t = convexTest(schema, modules);
    const rani = await siapkanPengguna(t, "Rani Peminjam", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    const admin = await siapkanPengguna(t, "Super Admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const loanId = await buatPinjaman(t, rani.userId);
    const arg = {
      loanId,
      kanal: "whatsapp" as const,
      tujuan: "628123456789",
      olehUserId: admin.userId,
    };

    const pertama = await t.mutation(internal.rincianPinjaman.mulaiKirim, arg);
    expect(pertama.ok).toBe(true);
    if (!pertama.ok) return;

    const kedua = await t.mutation(internal.rincianPinjaman.mulaiKirim, arg);
    expect(kedua.ok).toBe(false);
    if (kedua.ok) return;
    expect(kedua.pesan).toMatch(/Tunggu \d+ detik/i);

    await t.mutation(internal.rincianPinjaman.selesaikanKirim, {
      logId: pertama.logId,
      status: "terkirim",
      respon: "WhatsApp dengan lampiran PDF",
    });
    const baris = await t.run((ctx) => ctx.db.get(pertama.logId));
    expect(baris?.status).toBe("terkirim");
    expect(baris?.kanal).toBe("whatsapp");
    expect(baris?.tujuan).toBe("628123456789");
  });

  it("menghitung kuota per kanal terpisah", async () => {
    const t = convexTest(schema, modules);
    const rani = await siapkanPengguna(t, "Rani Peminjam", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    const admin = await siapkanPengguna(t, "Super Admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const loanId = await buatPinjaman(t, rani.userId);

    await t.mutation(internal.rincianPinjaman.mulaiKirim, {
      loanId,
      kanal: "whatsapp",
      tujuan: "628123456789",
      olehUserId: admin.userId,
    });
    const emailPertama = await t.mutation(internal.rincianPinjaman.mulaiKirim, {
      loanId,
      kanal: "email",
      tujuan: "rani@pindai.test",
      olehUserId: admin.userId,
    });
    expect(emailPertama.ok).toBe(true);
  });

  it("kiriman otomatis tidak dibatasi jatah harian admin", async () => {
    const t = convexTest(schema, modules);
    const rani = await siapkanPengguna(t, "Rani Peminjam", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    const admin = await siapkanPengguna(t, "Super Admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const loanId = await buatPinjaman(t, rani.userId);

    const siap = await t.mutation(internal.rincianPinjaman.mulaiKirimOtomatis, {
      loanId,
      kanal: "whatsapp",
      tujuan: NOMOR_UJI,
      olehUserId: admin.userId,
    });

    expect(siap.ok).toBe(true);
    const log = await t.run((ctx) => ctx.db.query("rincianKirimLog").collect());
    expect(log).toHaveLength(1);
    expect(log[0].otomatis).toBe(true);
    expect(log[0].status).toBe("diproses");
  });
});

describe("log kiriman otomatis", () => {
  it("kiriman otomatis yang sudah berhasil tidak diulang", async () => {
    const t = convexTest(schema, modules);
    const rani = await siapkanPengguna(t, "Rani Peminjam", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    const admin = await siapkanPengguna(t, "Super Admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const loanId = await buatPinjaman(t, rani.userId);
    const arg = {
      loanId,
      kanal: "whatsapp" as const,
      tujuan: NOMOR_UJI,
      olehUserId: admin.userId,
    };

    const pertama = await t.mutation(internal.rincianPinjaman.mulaiKirimOtomatis, arg);
    expect(pertama.ok).toBe(true);
    if (!pertama.ok) return;
    await t.mutation(internal.rincianPinjaman.selesaikanKirim, {
      logId: pertama.logId,
      status: "terkirim",
    });

    const kedua = await t.mutation(internal.rincianPinjaman.mulaiKirimOtomatis, arg);
    expect(kedua.ok).toBe(false);
    if (kedua.ok) return;
    expect(kedua.sudah).toBe(true);
  });

  it("riwayat kirim terbaca admin, bukan pengguna lain", async () => {
    const t = convexTest(schema, modules);
    const rani = await siapkanPengguna(t, "Rani Peminjam", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    const lain = await siapkanPengguna(t, "Budi Peminjam", {
      email: "budi@pindai.test",
      role: "peminjam",
    });
    const admin = await siapkanPengguna(t, "Super Admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const loanId = await buatPinjaman(t, rani.userId);
    await t.mutation(internal.rincianPinjaman.mulaiKirimOtomatis, {
      loanId,
      kanal: "whatsapp",
      tujuan: NOMOR_UJI,
      olehUserId: admin.userId,
    });

    const riwayat = await admin.sesi.query(api.rincianPinjaman.riwayatKirim, { loanId });
    expect(riwayat).toHaveLength(1);
    expect(riwayat[0].kanal).toBe("whatsapp");
    expect(riwayat[0].status).toBe("diproses");
    expect(riwayat[0].otomatis).toBe(true);

    await expect(lain.sesi.query(api.rincianPinjaman.riwayatKirim, { loanId })).rejects.toThrow(
      /Super Admin|khusus/i,
    );
  });
});
