/**
 * Tes hak subjek data: salinan data pribadi sendiri & penghapusan akun mandiri.
 *
 * Aturan yang dijaga:
 *  - salinan hanya memuat baris MILIK pemanggil dan tidak pernah memuat token
 *    perangkat;
 *  - penghapusan menuntut frasa konfirmasi yang tepat;
 *  - pengajuan yang masih berjalan menahan penghapusan;
 *  - akun tim dan akun penyedia dana tidak bisa menghapus sendiri;
 *  - penghapusan membersihkan akun, data KYC, berkasnya, dan tercatat di audit.
 *
 * Menjalankan: bunx vitest run src/convex/dataSaya.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import { siapkanPengguna, simpanBerkasUji } from "./test.helpers";
import { modules } from "./test.setup";

const TOKEN_PERANGKAT_UJI = "token-rahasia-perangkat-uji";

describe("hak subjek data nasabah", () => {
  it("salinan memuat data milik sendiri dan TIDAK memuat token perangkat", async () => {
    const t = convexTest(schema, modules);
    const { sesi, userId } = await siapkanPengguna(t, "Sari", {
      email: "sari-data@pindai.test",
      role: "peminjam",
    });
    const { userId: lainId } = await siapkanPengguna(t, "Budi", {
      email: "budi-data@pindai.test",
      role: "peminjam",
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("nasabahProfil", {
        userId,
        namaLengkap: "Sari Dewi",
        nik: "3271012345678901",
        nomorWhatsApp: "6281234567890",
        alamat: "Jalan Merdeka 10",
        pekerjaan: "Karyawan",
        penghasilanBulanan: 5_000_000,
        namaBank: "BCA",
        nomorRekening: "1234567890",
        sumber: "nasabah",
        diperbaruiOlehLabel: "Nasabah",
        diperbaruiPada: Date.now(),
      });
      await ctx.db.insert("kycProfil", {
        userId,
        status: "VERIFIED",
        dibuatPada: Date.now(),
        diperbaruiPada: Date.now(),
        namaLengkap: "Sari Dewi",
        nik: "3271012345678901",
        tandaTangan: "data:image/png;base64,AAAA",
      });
      await ctx.db.insert("loans", {
        userId,
        namaLengkap: "Sari Dewi",
        pokokPinjaman: 500_000,
        tujuan: "Modal usaha",
        nomorReferensi: "PJM-1",
        tenorHari: 30,
        namaBank: "BCA",
        nomorRekening: "1234567890",
        diajukanPada: Date.now(),
        status: "lunas",
      });
      await ctx.db.insert("perangkat", {
        userId,
        deviceId: "dev-1",
        platform: "android",
        versiApp: "1.4.0",
        token: TOKEN_PERANGKAT_UJI,
        terdaftarPada: Date.now(),
        terakhirDilihat: Date.now(),
      });
      // Baris milik akun lain: tidak boleh muncul di salinan siapa pun.
      await ctx.db.insert("loans", {
        userId: lainId,
        namaLengkap: "Budi Santoso",
        pokokPinjaman: 900_000,
        tujuan: "Milik Budi",
        nomorReferensi: "PJM-MILIK-BUDI",
        tenorHari: 30,
        namaBank: "BNI",
        nomorRekening: "999",
        diajukanPada: Date.now(),
        status: "lunas",
      });
    });

    const salinan = await sesi.query(api.dataSaya.salinanSaya, {});
    const teks = JSON.stringify(salinan);

    expect(salinan.akun.nama).toBe("Sari");
    expect(salinan.dataDiri?.nik).toBe("3271012345678901");
    expect(salinan.pengajuan.pinjaman).toHaveLength(1);
    expect(salinan.pengajuan.pinjaman[0].nomorReferensi).toBe("PJM-1");
    // Gambar tanda tangan tidak disalin; penandanya tetap ada.
    expect(salinan.kyc?.adaTandaTangan).toBe(true);
    expect(teks).not.toContain("data:image/png;base64,AAAA");
    // Token perangkat tidak pernah ikut keluar.
    expect(teks).not.toContain(TOKEN_PERANGKAT_UJI);
    expect(teks).not.toContain("PJM-MILIK-BUDI");
  });

  it("tanpa sesi, salinan ditolak", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.dataSaya.salinanSaya, {})).rejects.toThrow(/Sesi tidak ditemukan/);
  });

  it("frasa konfirmasi yang salah menahan penghapusan", async () => {
    const t = convexTest(schema, modules);
    const { sesi, userId } = await siapkanPengguna(t, "Tono", {
      email: "tono-data@pindai.test",
      role: "peminjam",
    });

    await expect(
      sesi.mutation(api.dataSaya.hapusAkunSendiri, { konfirmasi: "hapus" }),
    ).rejects.toThrow(/HAPUS AKUN SAYA/);
    const masihAda = await t.run((ctx) => ctx.db.get(userId));
    expect(masihAda).not.toBeNull();
  });

  it("pengajuan yang masih berjalan menahan penghapusan", async () => {
    const t = convexTest(schema, modules);
    const { sesi, userId } = await siapkanPengguna(t, "Umar", {
      email: "umar-data@pindai.test",
      role: "peminjam",
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("loans", {
        userId,
        namaLengkap: "Sari Dewi",
        pokokPinjaman: 500_000,
        tujuan: "Modal",
        nomorReferensi: "PJM-BERJALAN",
        tenorHari: 30,
        namaBank: "BCA",
        nomorRekening: "123",
        diajukanPada: Date.now(),
        status: "didanai",
      });
    });

    await expect(
      sesi.mutation(api.dataSaya.hapusAkunSendiri, { konfirmasi: "HAPUS AKUN SAYA" }),
    ).rejects.toThrow(/pinjaman yang masih berjalan/);
  });

  it("akun penyedia dana tidak bisa menghapus sendiri", async () => {
    const t = convexTest(schema, modules);
    const { sesi } = await siapkanPengguna(t, "Dana", {
      email: "dana-data@pindai.test",
      role: "dana",
    });
    await expect(
      sesi.mutation(api.dataSaya.hapusAkunSendiri, { konfirmasi: "HAPUS AKUN SAYA" }),
    ).rejects.toThrow(/penyedia dana/);
  });

  it("penghapusan membersihkan akun, KYC, berkasnya, dan tercatat di audit", async () => {
    const t = convexTest(schema, modules);
    const { sesi, userId } = await siapkanPengguna(t, "Wati", {
      email: "wati-data@pindai.test",
      role: "peminjam",
    });
    const ktpId = await simpanBerkasUji(t, "foto-ktp-wati");
    await t.run(async (ctx) => {
      await ctx.db.insert("nasabahProfil", {
        userId,
        namaLengkap: "Wati Lestari",
        nik: "3271012345678902",
        nomorWhatsApp: "6281200000000",
        alamat: "Jalan Baru 1",
        pekerjaan: "Pedagang",
        penghasilanBulanan: 3_000_000,
        namaBank: "BNI",
        nomorRekening: "9876543210",
        fotoKtpId: ktpId,
        sumber: "nasabah",
        diperbaruiOlehLabel: "Nasabah",
        diperbaruiPada: Date.now(),
      });
      await ctx.db.insert("kycProfil", {
        userId,
        status: "VERIFIED",
        ktpId,
        dibuatPada: Date.now(),
        diperbaruiPada: Date.now(),
      });
    });

    const hasil = await sesi.mutation(api.dataSaya.hapusAkunSendiri, {
      konfirmasi: "HAPUS AKUN SAYA",
      alasan: "Tidak akan memakai layanan lagi",
    });
    expect(hasil.ok).toBe(true);

    const sisa = await t.run(async (ctx) => ({
      akun: await ctx.db.get(userId),
      kyc: await ctx.db.query("kycProfil").collect(),
      profil: await ctx.db.query("nasabahProfil").collect(),
      sesiAuth: await ctx.db.query("authSessions").collect(),
      berkas: await ctx.storage.getUrl(ktpId),
      audit: await ctx.db.query("auditLog").collect(),
    }));
    expect(sisa.akun).toBeNull();
    expect(sisa.kyc).toHaveLength(0);
    expect(sisa.profil).toHaveLength(0);
    expect(sisa.sesiAuth).toHaveLength(0);
    expect(sisa.berkas).toBeNull();
    const catatan = sisa.audit.find((a) => a.aksi === "akun_hapus_mandiri");
    expect(catatan).toBeDefined();
    expect(catatan?.detail ?? "").toContain("Tidak akan memakai layanan lagi");
  });
});
