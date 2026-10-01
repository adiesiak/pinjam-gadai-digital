/** Tes integrasi Convex untuk memastikan akses admin dijaga di backend. */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "./_generated/api";
import { CONTRACT_TERMS_VERSION } from "../lib/contract";
import { totpNow } from "../lib/totp";
import schema from "./schema";
import {
  aktifkanTotpUntukSesi,
  buatPengguna,
  buatSesiLain,
  TEST_TOTP_SECRET,
} from "./test.helpers";
import { modules } from "./test.setup";

describe("otorisasi endpoint admin", () => {
  it("hanya admin unik dengan email terverifikasi yang dapat memakai password admin", async () => {
    const t = convexTest(schema, modules);
    await buatPengguna(t, "Admin belum verifikasi", {
      email: "admin-belum-verifikasi@pindai.test",
      role: "admin",
    });
    await buatPengguna(t, "Admin anonim", {
      email: "admin-anonim@pindai.test",
      emailVerificationTime: Date.now(),
      isAnonymous: true,
      role: "admin",
    });
    await buatPengguna(t, "Peminjam", {
      email: "bukan-admin@pindai.test",
      emailVerificationTime: Date.now(),
      role: "peminjam",
    });
    await buatPengguna(t, "Admin sah", {
      email: "admin-sah@pindai.test",
      emailVerificationTime: Date.now(),
      role: "admin",
    });

    await expect(
      t.query(internal.users.isAdminEmailForPasswordAuth, {
        email: "admin-belum-verifikasi@pindai.test",
      }),
    ).resolves.toBe(false);
    await expect(
      t.query(internal.users.isAdminEmailForPasswordAuth, {
        email: "admin-anonim@pindai.test",
      }),
    ).resolves.toBe(false);
    await expect(
      t.query(internal.users.isAdminEmailForPasswordAuth, {
        email: "bukan-admin@pindai.test",
      }),
    ).resolves.toBe(false);
    await expect(
      t.query(internal.users.isAdminEmailForPasswordAuth, {
        email: "admin-sah@pindai.test",
      }),
    ).resolves.toBe(true);
    await expect(
      t.query(internal.users.isAdminEmailForPasswordAuth, {
        email: "ADMIN-SAH@pindai.test",
      }),
    ).resolves.toBe(false);

    await buatPengguna(t, "Duplikat admin", {
      email: "admin-sah@pindai.test",
      emailVerificationTime: Date.now(),
      role: "admin",
    });
    await expect(
      t.query(internal.users.isAdminEmailForPasswordAuth, {
        email: "admin-sah@pindai.test",
      }),
    ).resolves.toBe(false);
  });

  it("adminExists mewajibkan login, tetapi tetap mendukung alur bootstrap", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.admin.adminExists, {})).rejects.toThrow(/masuk/i);

    const { sesi: peminjam } = await buatPengguna(t, "Peminjam", {
      email: "peminjam-authz@pindai.test",
      role: "peminjam",
    });
    await expect(peminjam.query(api.admin.adminExists, {})).resolves.toBe(false);

    await buatPengguna(t, "Admin", {
      email: "admin-authz@pindai.test",
      emailVerificationTime: Date.now(),
      role: "admin",
    });
    await expect(peminjam.query(api.admin.adminExists, {})).resolves.toBe(true);
  });

  it("bootstrap hanya menerima email terverifikasi dan berhenti setelah admin pertama", async () => {
    const t = convexTest(schema, modules);
    const { sesi: emailBelumTerverifikasi, userId: belumTerverifikasiId } =
      await buatPengguna(t, "Email belum terverifikasi", {
        email: "belum-verifikasi@pindai.test",
      });
    await expect(
      emailBelumTerverifikasi.mutation(api.admin.bootstrapFirstAdmin, {}),
    ).rejects.toThrow(/email terverifikasi/i);
    expect(
      await t.run(async (ctx) => (await ctx.db.get(belumTerverifikasiId))?.role),
    ).not.toBe("admin");

    const { sesi: akunTamu } = await buatPengguna(t, "Akun tamu", {
      email: "tamu@pindai.test",
      emailVerificationTime: Date.now(),
      isAnonymous: true,
    });
    await expect(akunTamu.mutation(api.admin.bootstrapFirstAdmin, {})).rejects.toThrow(
      /email terverifikasi/i,
    );

    const { sesi: adminPertama } = await buatPengguna(t, "Admin pertama", {
      email: "admin-pertama@pindai.test",
      emailVerificationTime: Date.now(),
    });
    await expect(adminPertama.mutation(api.admin.bootstrapFirstAdmin, {})).resolves.toEqual({
      success: true,
    });

    const { sesi: penggunaKedua, userId: penggunaKeduaId } = await buatPengguna(
      t,
      "Pengguna kedua",
      {
        email: "pengguna-kedua@pindai.test",
        emailVerificationTime: Date.now(),
        role: "peminjam",
      },
    );
    await expect(penggunaKedua.mutation(api.admin.bootstrapFirstAdmin, {})).rejects.toThrow(
      /admin sudah ada/i,
    );
    expect(await t.run(async (ctx) => (await ctx.db.get(penggunaKeduaId))?.role)).toBe(
      "peminjam",
    );
  });

  it("dokumen identitas pinjaman hanya dapat dibuka admin dengan TOTP pada sesi aktif", async () => {
    const t = convexTest(schema, modules);
    const { userId: borrowerId } = await buatPengguna(t, "Peminjam KYC", {
      email: "peminjam-kyc-authz@pindai.test",
      role: "peminjam",
    });
    const { sesi: admin, userId: adminId, authSessionId } = await buatPengguna(
      t,
      "Admin KYC",
      { email: "admin-kyc-authz@pindai.test", role: "admin" },
    );
    const loanId = await t.run((ctx) =>
      ctx.db.insert("loans", {
        userId: borrowerId,
        pokokPinjaman: 500_000,
        tujuan: "pendidikan",
        namaLengkap: "Nama Rahasia",
        nomorRekening: "12345678",
        status: "diajukan",
        nomorReferensi: "LON-KYC-AUTHZ",
        tenorHari: 30,
        nik: "3201234567890001",
        nomorWhatsApp: "6281234567890",
        penghasilanBulanan: 5_000_000,
        sumberPenghasilan: "usaha",
        lokasiAjukan: { lat: -6.2, lng: 106.816666, akurasi: 25, waktu: Date.now() },
      }),
    );

    await expect(t.query(api.admin.dokumenKycUrls, { loanId })).rejects.toThrow(/masuk/i);
    const { sesi: peminjam } = await buatPengguna(t, "Peminjam lain", {
      email: "peminjam-lain-kyc@pindai.test",
      role: "peminjam",
    });
    await expect(peminjam.query(api.admin.dokumenKycUrls, { loanId })).rejects.toThrow(/admin/i);
    await expect(admin.query(api.admin.dokumenKycUrls, { loanId })).rejects.toThrow(/TOTP/i);

    await aktifkanTotpUntukSesi(t, adminId, authSessionId);
    await expect(admin.query(api.admin.dokumenKycUrls, { loanId })).resolves.toMatchObject({
      nik: "3201234567890001",
      nomorWhatsApp: "6281234567890",
      penghasilanBulanan: 5_000_000,
      sumberPenghasilan: "usaha",
      lokasiAjukan: { lat: -6.2, lng: 106.816666 },
      ktpUrl: null,
      selfieUrl: null,
      slipUrl: null,
    });
  });

  it("backfill kode pseudonim hanya dapat dijalankan admin dan memproses data lama bertahap", async () => {
    const t = convexTest(schema, modules);
    const { userId: borrowerId } = await buatPengguna(t, "Peminjam warisan", {
      email: "peminjam-backfill@pindai.test",
      role: "peminjam",
    });
    await t.run((ctx) =>
      ctx.db.insert("loans", {
        userId: borrowerId,
        pokokPinjaman: 500_000,
        tujuan: "pendidikan",
        namaLengkap: "Nama Rahasia",
        nomorRekening: "12345678",
        status: "disetujui",
        nomorReferensi: "LON-BACKFILL",
        tenorHari: 30,
      }),
    );
    const { sesi: admin, userId: adminId, authSessionId } = await buatPengguna(
      t,
      "Admin migrasi",
      { email: "admin-backfill@pindai.test", role: "admin" },
    );
    await expect(t.mutation(api.admin.backfillKodePeminjam, { cursor: null })).rejects.toThrow(/masuk/i);
    await aktifkanTotpUntukSesi(t, adminId, authSessionId);
    const hasil = await admin.mutation(api.admin.backfillKodePeminjam, { cursor: null });
    expect(hasil.diterbitkan).toBe(1);
    const user = await t.run((ctx) => ctx.db.get(borrowerId));
    expect(user?.kodePeminjam).toMatch(/^PMN-[A-F0-9]{20}$/);
  });

  it("adminLoanQuote hanya dapat dipanggil oleh admin", async () => {
    const t = convexTest(schema, modules);
    const args = { pokokPinjaman: 1_000_000 };
    await expect(t.query(api.admin.adminLoanQuote, args)).rejects.toThrow(/masuk/i);

    const { sesi: peminjam } = await buatPengguna(t, "Peminjam", {
      email: "peminjam-quote@pindai.test",
      role: "peminjam",
    });
    await expect(peminjam.query(api.admin.adminLoanQuote, args)).rejects.toThrow(/admin/i);

    const { sesi: admin, userId: adminId, authSessionId } = await buatPengguna(
      t,
      "Admin",
      {
        email: "admin-quote@pindai.test",
        role: "admin",
      },
    );
    await aktifkanTotpUntukSesi(t, adminId, authSessionId);
    await expect(admin.query(api.admin.adminLoanQuote, args)).resolves.toMatchObject({
      skema: "harian",
    });
  });
});

describe("persetujuan dan tanda tangan akad Peminjam", () => {
  const tandaTanganValid =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/fMkAAAAASUVORK5CYII=";

  it("menyimpan persetujuan pinjaman dan tanda tangan secara atomik hanya melalui admin", async () => {
    const t = convexTest(schema, modules);
    const { userId: borrowerId, sesi: peminjam } = await buatPengguna(
      t,
      "Peminjam akad",
      { email: "peminjam-akad@pindai.test", role: "peminjam" },
    );
    const { sesi: admin, userId: adminId, authSessionId } = await buatPengguna(
      t,
      "Admin akad",
      { email: "admin-akad@pindai.test", role: "admin" },
    );
    await aktifkanTotpUntukSesi(t, adminId, authSessionId);
    const loanId = await t.run((ctx) =>
      ctx.db.insert("loans", {
        userId: borrowerId,
        pokokPinjaman: 500_000,
        tujuan: "pendidikan",
        namaLengkap: "Peminjam akad",
        nomorRekening: "12345678",
        status: "disetujui",
        nomorReferensi: "LON-AKAD-01",
        tenorHari: 30,
      }),
    );
    const args = {
      loanId,
      dataUrl: tandaTanganValid,
      persetujuanPeminjam: true as const,
    };

    await expect(t.mutation(api.admin.simpanTandaTangan, args)).rejects.toThrow(/masuk/i);
    await expect(peminjam.mutation(api.admin.simpanTandaTangan, args)).rejects.toThrow(
      /admin/i,
    );
    await expect(
      admin.mutation(api.admin.simpanTandaTangan, {
        ...args,
        dataUrl: "data:image/png;base64,AAAA",
      }),
    ).rejects.toThrow(/kosong/i);

    await expect(admin.mutation(api.admin.simpanTandaTangan, args)).resolves.toMatchObject({
      ok: true,
      versi: CONTRACT_TERMS_VERSION,
    });
    const stored = await admin.query(api.admin.contractData, { loanId });
    expect(stored).toMatchObject({
      ttdPeminjam: tandaTanganValid,
      persetujuanVersi: CONTRACT_TERMS_VERSION,
    });
    expect(stored?.ttdPada).toEqual(stored?.persetujuanPada);
    await expect(admin.mutation(api.admin.simpanTandaTangan, args)).rejects.toThrow(
      /sudah disetujui/i,
    );
    expect(
      await t.run((ctx) =>
        ctx.db.query("auditLog").collect().then((rows) =>
          rows.filter((row) => row.aksi === "kontrak_pinjaman_disetujui").length,
        ),
      ),
    ).toBe(1);
  });

  it("menolak tanda tangan pinjaman yang ditolak dan mencatat akad gadai yang sudah lengkap", async () => {
    const t = convexTest(schema, modules);
    const { userId: borrowerId, sesi: peminjam } = await buatPengguna(
      t,
      "Peminjam gadai",
      { email: "peminjam-gadai-akad@pindai.test", role: "peminjam" },
    );
    const { sesi: admin, userId: adminId, authSessionId } = await buatPengguna(
      t,
      "Admin gadai akad",
      { email: "admin-gadai-akad@pindai.test", role: "admin" },
    );
    await aktifkanTotpUntukSesi(t, adminId, authSessionId);
    const loanId = await t.run((ctx) =>
      ctx.db.insert("loans", {
        userId: borrowerId,
        pokokPinjaman: 500_000,
        tujuan: "pendidikan",
        namaLengkap: "Peminjam gadai",
        nomorRekening: "12345678",
        status: "ditolak",
        nomorReferensi: "LON-DITOLAK-01",
        tenorHari: 30,
      }),
    );
    const pawnId = await t.run((ctx) =>
      ctx.db.insert("pawns", {
        userId: borrowerId,
        deskripsiBarang: "Cincin emas",
        kategori: "perhiasan",
        alamatPenilaian: "Jakarta",
        namaLengkap: "Peminjam gadai",
        nomorRekening: "12345678",
        status: "disetujui",
        nomorReferensi: "PAW-AKAD-01",
        nilaiTaksiran: 2_000_000,
        hargaPasar: 2_500_000,
        pokokGadai: 1_200_000,
        persenSewaModal: 5,
      }),
    );

    await expect(
      admin.mutation(api.admin.simpanTandaTangan, {
        loanId,
        dataUrl: tandaTanganValid,
        persetujuanPeminjam: true,
      }),
    ).rejects.toThrow(/ditolak/i);
    await expect(
      peminjam.mutation(api.admin.simpanTandaTanganGadai, {
        pawnId,
        dataUrl: tandaTanganValid,
        persetujuanPeminjam: true,
      }),
    ).rejects.toThrow(/admin/i);

    await expect(
      admin.mutation(api.admin.simpanTandaTanganGadai, {
        pawnId,
        dataUrl: tandaTanganValid,
        persetujuanPeminjam: true,
      }),
    ).resolves.toMatchObject({ ok: true, versi: CONTRACT_TERMS_VERSION });
    await expect(admin.query(api.admin.contractDetailPawn, { pawnId })).resolves.toMatchObject({
      ttdPeminjam: tandaTanganValid,
      persetujuanVersi: CONTRACT_TERMS_VERSION,
      pokokGadai: 1_200_000,
      persenSewaModal: 5,
    });
    await expect(
      admin.mutation(api.admin.simpanTandaTanganGadai, {
        pawnId,
        dataUrl: tandaTanganValid,
        persetujuanPeminjam: true,
      }),
    ).rejects.toThrow(/sudah disetujui/i);
    expect(
      await t.run((ctx) =>
        ctx.db.query("auditLog").collect().then((rows) =>
          rows.filter((row) => row.aksi === "kontrak_gadai_disetujui").length,
        ),
      ),
    ).toBe(1);
  });
});

describe("otorisasi MFA backend", () => {
  it("query dan mutation TOTP admin menolak non-admin", async () => {
    const t = convexTest(schema, modules);
    const { sesi: peminjam } = await buatPengguna(t, "Peminjam", {
      email: "peminjam-totp@pindai.test",
      role: "peminjam",
    });
    const { sesi: admin } = await buatPengguna(t, "Admin", {
      email: "admin-totp@pindai.test",
      role: "admin",
    });

    await expect(t.query(api.security.myTotpStatus, {})).rejects.toThrow(/masuk/i);
    await expect(peminjam.query(api.security.myTotpStatus, {})).rejects.toThrow(/admin/i);
    await expect(peminjam.query(api.security.totpGateStatus, {})).resolves.toMatchObject({
      isAdmin: false,
      verified: false,
    });
    await expect(peminjam.mutation(api.security.startTotpSetup, {})).rejects.toThrow(/admin/i);
    await expect(
      peminjam.mutation(api.security.confirmTotpSetup, { kode: "000000" }),
    ).rejects.toThrow(/admin/i);
    await expect(
      peminjam.mutation(api.security.verifyTotp, {
        kode: "000000",
        perangkat: "browser",
        ip: "127.0.0.1",
      }),
    ).rejects.toThrow(/admin/i);
    await expect(
      peminjam.mutation(api.security.disableTotp, { kode: "000000" }),
    ).rejects.toThrow(/admin/i);

    await expect(admin.query(api.security.myTotpStatus, {})).resolves.toEqual({
      aktif: false,
      setupBerlangsung: false,
    });
  });

  it("TOTP bootstrap mengikat bukti ke sesi Auth dan menolak ID localStorage palsu", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin, userId: adminId, authSessionId } = await buatPengguna(
      t,
      "Admin TOTP",
      { email: "admin-totp-proof@pindai.test", role: "admin" },
    );

    await expect(admin.query(api.admin.adminOverview, {})).rejects.toThrow(/aktifkan TOTP/i);
    await expect(admin.query(api.security.totpGateStatus, {})).resolves.toMatchObject({
      isAdmin: true,
      aktif: false,
      butuh: true,
      verified: false,
    });

    await t.run((ctx) =>
      ctx.db.insert("mfaSettings", {
        userId: adminId,
        totpSecret: TEST_TOTP_SECRET,
        // localStorage session ID must never count as a verified Auth session.
        totpVerifiedAuthSessionIds: ["pindai.sessionId.fake"],
      }),
    );
    await expect(admin.query(api.security.totpGateStatus, {})).resolves.toMatchObject({
      aktif: true,
      butuh: true,
      verified: false,
    });
    await expect(admin.query(api.admin.adminOverview, {})).rejects.toThrow(/TOTP/i);

    const kode = await totpNow(TEST_TOTP_SECRET);
    await expect(
      admin.mutation(api.security.verifyTotp, {
        kode,
        perangkat: "browser",
        ip: "127.0.0.1",
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(admin.query(api.security.totpGateStatus, {})).resolves.toMatchObject({
      aktif: true,
      butuh: false,
      verified: true,
    });
    await expect(admin.query(api.admin.adminOverview, {})).resolves.toMatchObject({
      isAdmin: true,
      loans: [],
      pawns: [],
      kredit: [],
    });

    const { sesi: sesiLain, authSessionId: otherSessionId } = await buatSesiLain(
      t,
      "Admin TOTP",
      adminId,
    );
    await expect(sesiLain.query(api.security.totpGateStatus, {})).resolves.toMatchObject({
      aktif: true,
      butuh: true,
      verified: false,
    });
    await expect(sesiLain.query(api.admin.adminOverview, {})).rejects.toThrow(/TOTP/i);
    expect(authSessionId).not.toBe(otherSessionId);
  });

  it("admin bootstrap dapat mengaktifkan TOTP sebelum akses operasional", async () => {
    const t = convexTest(schema, modules);
    const { sesi: firstAdmin, userId, authSessionId } = await buatPengguna(
      t,
      "Admin bootstrap TOTP",
      {
        email: "admin-bootstrap-totp@pindai.test",
        emailVerificationTime: Date.now(),
      },
    );

    await expect(firstAdmin.mutation(api.admin.bootstrapFirstAdmin, {})).resolves.toEqual({
      success: true,
    });
    const setup = await firstAdmin.mutation(api.security.startTotpSetup, {});
    const kode = await totpNow(setup.secret);
    await expect(
      firstAdmin.mutation(api.security.confirmTotpSetup, { kode }),
    ).resolves.toEqual({ ok: true });
    await expect(firstAdmin.query(api.security.totpGateStatus, {})).resolves.toMatchObject({
      isAdmin: true,
      aktif: true,
      butuh: false,
      verified: true,
    });
    await expect(firstAdmin.query(api.admin.adminOverview, {})).resolves.toMatchObject({
      isAdmin: true,
    });
    expect(userId).toBeDefined();
    expect(authSessionId).toBeDefined();
  });

  it("menghapus bukti sesi lama saat TOTP dinonaktifkan dan diaktifkan ulang", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin, userId, authSessionId } = await buatPengguna(
      t,
      "Admin rotasi TOTP",
      { email: "admin-rotasi-totp@pindai.test", role: "admin" },
    );
    const { sesi: adminSesiLain, authSessionId: authSessionLain } = await buatSesiLain(
      t,
      "Admin rotasi TOTP",
      userId,
    );
    await aktifkanTotpUntukSesi(t, userId, authSessionId, [authSessionId, authSessionLain]);

    await expect(adminSesiLain.query(api.security.totpGateStatus, {})).resolves.toMatchObject({
      aktif: true,
      verified: true,
    });

    const rotasi = await admin.mutation(api.security.startTotpSetup, {});
    await expect(
      admin.mutation(api.security.confirmTotpSetup, {
        kode: await totpNow(rotasi.secret),
      }),
    ).resolves.toEqual({ ok: true });
    await expect(adminSesiLain.query(api.security.totpGateStatus, {})).resolves.toMatchObject({
      aktif: true,
      verified: true,
    });

    await expect(
      admin.mutation(api.security.disableTotp, {
        kode: await totpNow(rotasi.secret),
      }),
    ).resolves.toEqual({ ok: true });
    await expect(admin.query(api.security.totpGateStatus, {})).resolves.toMatchObject({
      aktif: false,
      verified: false,
    });

    const setup = await admin.mutation(api.security.startTotpSetup, {});
    await expect(
      admin.mutation(api.security.confirmTotpSetup, {
        kode: await totpNow(setup.secret),
      }),
    ).resolves.toEqual({ ok: true });
    await expect(admin.query(api.security.totpGateStatus, {})).resolves.toMatchObject({
      aktif: true,
      verified: true,
    });
    await expect(
      adminSesiLain.query(api.security.totpGateStatus, {}),
    ).resolves.toMatchObject({
      aktif: true,
      verified: false,
    });
    await expect(adminSesiLain.query(api.admin.adminOverview, {})).rejects.toThrow(/TOTP/i);
  });

  it("pengaturan OTP hanya untuk Pendana dan verifikasi OTP menolak role lain", async () => {
    const t = convexTest(schema, modules);
    const { sesi: peminjam } = await buatPengguna(t, "Peminjam OTP", {
      email: "peminjam-otp@pindai.test",
      role: "peminjam",
    });
    const { sesi: admin } = await buatPengguna(t, "Admin OTP", {
      email: "admin-otp-wa@pindai.test",
      role: "admin",
    });
    const { sesi: pendana, userId: pendanaId } = await buatPengguna(t, "Pendana OTP", {
      email: "pendana-otp@pindai.test",
      role: "pendana",
    });

    await expect(t.mutation(api.security.setWaOtpRequired, { wajib: true })).rejects.toThrow(
      /masuk/i,
    );
    await expect(
      peminjam.mutation(api.security.setWaOtpRequired, { wajib: true }),
    ).rejects.toThrow(/pendana/i);
    await expect(admin.mutation(api.security.setWaOtpRequired, { wajib: true })).rejects.toThrow(
      /pendana/i,
    );
    await expect(
      pendana.mutation(api.security.setWaOtpRequired, { wajib: true }),
    ).resolves.toEqual({ ok: true });

    await expect(
      peminjam.mutation(api.security.verifyWaOtp, {
        kode: "123456",
        ip: "127.0.0.1",
        userAgent: "browser",
      }),
    ).rejects.toThrow(/pendana/i);

    await t.mutation(async (ctx) => {
      const settings = await ctx.db
        .query("mfaSettings")
        .withIndex("by_user", (q) => q.eq("userId", pendanaId))
        .first();
      const otp = {
        waOtpKode: "123456",
        waOtpKedaluwarsa: Date.now() + 60_000,
        waOtpGagal: 0,
      };
      if (settings === null) {
        await ctx.db.insert("mfaSettings", { userId: pendanaId, ...otp });
      } else {
        await ctx.db.patch(settings._id, otp);
      }
    });
    await expect(
      pendana.mutation(api.security.verifyWaOtp, {
        kode: "123456",
        ip: "127.0.0.1",
        userAgent: "browser",
      }),
    ).resolves.toEqual({ ok: true });
  });

  it("membatasi percobaan kata sandi Super Admin di server dan mencatatnya", async () => {
    const t = convexTest(schema, modules);
    const email = "admin-rate@pindai.test";
    const { userId } = await buatPengguna(t, "Admin rate limit", {
      email,
      emailVerificationTime: Date.now(),
      role: "admin",
    });

    // Lima percobaan pertama masih lolos. Hitungannya murni dari server:
    // mutation ini tidak menerima IP/identifier kiriman klien, jadi skrip yang
    // memanggil API langsung tetap terhitung.
    for (let ke = 1; ke <= 5; ke += 1) {
      await expect(
        t.mutation(internal.security.catatPercobaanKataSandiAdmin, { email }),
      ).resolves.toEqual({ blocked: false, sisaDetik: 0 });
    }

    const keenam = await t.mutation(internal.security.catatPercobaanKataSandiAdmin, {
      email,
    });
    expect(keenam.blocked).toBe(true);
    expect(keenam.sisaDetik).toBeGreaterThan(0);

    // Upaya masuk terekam agar terlihat tim di panel keamanan + audit trail.
    const log = await t.run((ctx) => ctx.db.query("loginLogs").collect());
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ userId, status: "diblokir", metode: "password" });
    const audit = await t.run((ctx) => ctx.db.query("auditLog").collect());
    expect(audit.map((a) => a.aksi)).toContain("admin_login_diblokir");

    // Blokir berlaku per email admin, bukan global.
    await expect(
      t.mutation(internal.security.catatPercobaanKataSandiAdmin, {
        email: "admin-lain@pindai.test",
      }),
    ).resolves.toEqual({ blocked: false, sisaDetik: 0 });
  });
});
