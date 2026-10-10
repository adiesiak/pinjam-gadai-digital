/** Tes integrasi Convex untuk memastikan akses admin dijaga di backend. */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "./_generated/api";
import {
  alurPermintaanToken,
  alurVerifikasiKode,
  PESAN_KREDENSIAL_SALAH,
  PESAN_KODE_RESET_SALAH,
  PESAN_KODE_VERIFIKASI_SALAH,
  pesanBlokirOtpAdmin,
  pesanKodeSalah,
  pesanSandiNonAdmin,
} from "./auth/enumerasi";
import { CONTRACT_TERMS_VERSION } from "../lib/contract";
import { totpNow } from "../lib/totp";
import schema from "./schema";
import { ROLES } from "./schema";
import {
  aktifkanTotpUntukSesi,
  buatPengguna,
  buatSesiLain,
  TEST_TOTP_SECRET,
} from "./test.helpers";
import { modules } from "./test.setup";

/** Rahasia bootstrap uji — environment diisi agar jalur fail-closed lolos. */
const RAHASIA_BOOTSTRAP_UJI = "rahasia-bootstrap-uji-minimal-24-karakter-123";
process.env.ADMIN_BOOTSTRAP_SECRET = RAHASIA_BOOTSTRAP_UJI;

/** Argumen `auth:store` untuk permintaan kode OTP email (`createVerificationCode`). */
function mintaKodeOtp(email: string, code = "123456") {
  return {
    args: {
      type: "createVerificationCode" as const,
      provider: "email-otp",
      email,
      code,
      expirationTime: Date.now() + 60_000,
      allowExtraProviders: true,
    },
  };
}

/** Argumen `auth:store` untuk verifikasi kode OTP email. */
function verifikasiKodeOtp(email: string, code: string) {
  return {
    args: {
      type: "verifyCodeAndSignIn" as const,
      params: { email, code },
      provider: "email-otp",
      generateTokens: false,
      allowExtraProviders: true,
    },
  };
}

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
      emailBelumTerverifikasi.mutation(api.admin.bootstrapFirstAdmin, {
        secret: RAHASIA_BOOTSTRAP_UJI,
      }),
    ).rejects.toThrow(/email terverifikasi/i);
    expect(
      await t.run(async (ctx) => (await ctx.db.get(belumTerverifikasiId))?.role),
    ).not.toBe("admin");

    const { sesi: akunTamu } = await buatPengguna(t, "Akun tamu", {
      email: "tamu@pindai.test",
      emailVerificationTime: Date.now(),
      isAnonymous: true,
    });
    await expect(
      akunTamu.mutation(api.admin.bootstrapFirstAdmin, { secret: RAHASIA_BOOTSTRAP_UJI }),
    ).rejects.toThrow(
      /email terverifikasi/i,
    );

    const { sesi: adminPertama } = await buatPengguna(t, "Admin pertama", {
      email: "admin-pertama@pindai.test",
      emailVerificationTime: Date.now(),
    });
    await expect(
      adminPertama.mutation(api.admin.bootstrapFirstAdmin, { secret: RAHASIA_BOOTSTRAP_UJI }),
    ).resolves.toEqual({
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
    await expect(
      penggunaKedua.mutation(api.admin.bootstrapFirstAdmin, { secret: RAHASIA_BOOTSTRAP_UJI }),
    ).rejects.toThrow(
      /admin sudah ada/i,
    );
    expect(await t.run(async (ctx) => (await ctx.db.get(penggunaKeduaId))?.role)).toBe(
      "peminjam",
    );
  });

  it("bootstrap fail-closed: rahasia salah atau belum dikonfigurasi selalu ditolak", async () => {
    const t = convexTest(schema, modules);
    const { sesi, userId } = await buatPengguna(t, "Admin rahasia bootstrap", {
      email: "admin-rahasia-bootstrap@pindai.test",
      emailVerificationTime: Date.now(),
    });

    await expect(
      sesi.mutation(api.admin.bootstrapFirstAdmin, {
        secret: "rahasia-yang-salah-tapi-cukup-panjang",
      }),
    ).rejects.toThrow(/rahasia bootstrap salah/i);
    expect(await t.run(async (ctx) => (await ctx.db.get(userId))?.role)).not.toBe("admin");

    const tersimpan = process.env.ADMIN_BOOTSTRAP_SECRET;
    process.env.ADMIN_BOOTSTRAP_SECRET = "pendek";
    try {
      await expect(
        sesi.mutation(api.admin.bootstrapFirstAdmin, { secret: "pendek" }),
      ).rejects.toThrow(/ADMIN_BOOTSTRAP_SECRET/);
    } finally {
      process.env.ADMIN_BOOTSTRAP_SECRET = tersimpan;
    }

    await expect(
      sesi.mutation(api.admin.bootstrapFirstAdmin, { secret: RAHASIA_BOOTSTRAP_UJI }),
    ).resolves.toEqual({ success: true });
    expect(await t.run(async (ctx) => (await ctx.db.get(userId))?.role)).toBe("admin");
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

    await expect(
      firstAdmin.mutation(api.admin.bootstrapFirstAdmin, { secret: RAHASIA_BOOTSTRAP_UJI }),
    ).resolves.toEqual({
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

  it("pengaturan OTP hanya untuk penyedia dana dan verifikasi OTP menolak role lain", async () => {
    const t = convexTest(schema, modules);
    const { sesi: peminjam } = await buatPengguna(t, "Peminjam OTP", {
      email: "peminjam-otp@pindai.test",
      role: "peminjam",
    });
    const { sesi: admin } = await buatPengguna(t, "Admin OTP", {
      email: "admin-otp-wa@pindai.test",
      role: "admin",
    });
    const { sesi: dana, userId: danaId } = await buatPengguna(t, "Penyedia Dana OTP", {
      email: "dana-otp@pindai.test",
      role: "dana",
    });

    await expect(t.mutation(api.security.setWaOtpRequired, { wajib: true })).rejects.toThrow(
      /masuk/i,
    );
    await expect(
      peminjam.mutation(api.security.setWaOtpRequired, { wajib: true }),
    ).rejects.toThrow(/penyedia dana/i);
    await expect(admin.mutation(api.security.setWaOtpRequired, { wajib: true })).rejects.toThrow(
      /penyedia dana/i,
    );
    await expect(
      dana.mutation(api.security.setWaOtpRequired, { wajib: true }),
    ).resolves.toEqual({ ok: true });

    // Gerbang peran hidup di mesin OTP tunggal (`convex/otpWhatsapp.ts`), bukan
    // hanya di saklarnya: akun non-penyedia-dana tidak bisa memakai OTP transaksi.
    // Verifikasi mengembalikan hasil (bukan melempar) supaya hitungan percobaan
    // yang perlu disimpan tidak ikut ter-rollback.
    await expect(
      peminjam.mutation(api.otpWhatsapp.verifikasiOtpWa, {
        tujuan: "transaksi",
        kode: "123456",
      }),
    ).resolves.toMatchObject({ ok: false, pesan: expect.stringMatching(/penyedia dana/i) });

    // Mesin OTP mengirim ke nomor yang tersimpan di modul KYC; tanpa nomor itu
    // tidak ada OTP yang bisa diminta.
    await expect(
      dana.action(api.otpWhatsapp.mintaOtpWa, { tujuan: "transaksi" }),
    ).resolves.toMatchObject({ ok: false, terkirim: false });

    await t.run(async (ctx) => {
      await ctx.db.insert("kycProfil", {
        userId: danaId,
        status: "IN_PROGRESS",
        nomorWhatsApp: "6281234567890",
        dibuatPada: Date.now(),
        diperbaruiPada: Date.now(),
      });
    });

    // Fonnte dipanggil dari SERVER. Tes mengganti `fetch` dan membaca kode dari
    // PESAN KELUAR — satu-satunya tempat kode aslinya pernah ada. Token hanya
    // dikirim sebagai header permintaan itu.
    const fetchAsli = globalThis.fetch;
    const keluar: Array<{ target: string; message: string; auth: string | null }> = [];
    process.env.FONNTE_TOKEN = "token-uji-fonnte";
    globalThis.fetch = (async (
      _url: unknown,
      init?: { body?: unknown; headers?: Record<string, string> },
    ) => {
      const body = new URLSearchParams(String(init?.body ?? ""));
      keluar.push({
        target: body.get("target") ?? "",
        message: body.get("message") ?? "",
        auth: init?.headers?.Authorization ?? null,
      });
      return new Response(JSON.stringify({ status: true, detail: "success! message in queue" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;
    try {
      const hasil = await dana.action(api.otpWhatsapp.mintaOtpWa, { tujuan: "transaksi" });
      expect(hasil.ok).toBe(true);
      expect(keluar).toHaveLength(1);
      expect(keluar[0].target).toBe("6281234567890");
      expect(keluar[0].auth).toBe("token-uji-fonnte");
      const kode = keluar[0].message.match(/\d{6}/)?.[0] ?? "";
      expect(kode).toHaveLength(6);

      // Yang tersimpan hanya HASH: kode aslinya tidak ada di baris tantangan.
      const baris = await t.run(async (ctx) =>
        ctx.db
          .query("waOtpChallenges")
          .withIndex("by_user", (q) => q.eq("userId", danaId))
          .first(),
      );
      expect(JSON.stringify(baris)).not.toContain(kode);

      await expect(
        dana.mutation(api.otpWhatsapp.verifikasiOtpWa, { tujuan: "transaksi", kode }),
      ).resolves.toEqual({ ok: true });
    } finally {
      globalThis.fetch = fetchAsli;
      delete process.env.FONNTE_TOKEN;
    }
  });

  it("membatasi percobaan kata sandi di server dan mencatatnya", async () => {
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
        t.mutation(internal.security.catatPercobaanKataSandiAdmin, {
          email,
          admin: true,
        }),
      ).resolves.toEqual({ blocked: false, sisaDetik: 0 });
    }

    const keenam = await t.mutation(internal.security.catatPercobaanKataSandiAdmin, {
      email,
      admin: true,
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
        admin: true,
      }),
    ).resolves.toEqual({ blocked: false, sisaDetik: 0 });

    // Alamat non-admin dibatasi sama persis — kalau batas ini hanya berlaku
    // untuk alamat admin, munculnya balasan blokir sudah mengonfirmasi admin.
    // Jejak keamanannya sengaja tidak ditulis untuk alamat non-admin.
    const emailBiasa = "bukan-admin-rate@pindai.test";
    for (let ke = 1; ke <= 6; ke += 1) {
      const hasil = await t.mutation(
        internal.security.catatPercobaanKataSandiAdmin,
        { email: emailBiasa, admin: false },
      );
      expect(hasil.blocked).toBe(ke === 6);
    }
    expect(await t.run((ctx) => ctx.db.query("loginLogs").collect())).toHaveLength(1);
    expect(await t.run((ctx) => ctx.db.query("auditLog").collect())).toHaveLength(1);
  });
});

describe("penutupan enumerasi akun Super Admin", () => {
  it("permintaan OTP email dibalas sama untuk alamat admin dan alamat biasa", async () => {
    const t = convexTest(schema, modules);
    const emailAdmin = "admin-enumerasi@pindai.test";
    await buatPengguna(t, "Admin enumerasi", {
      email: emailAdmin,
      emailVerificationTime: Date.now(),
      role: "admin",
    });

    // Dulu permintaan untuk email admin melempar pesan yang menyebut "Super
    // Admin", sehingga status admin sebuah alamat bisa ditebak dari pesan
    // error. Sekarang tahap permintaan kode dijawab identik untuk keduanya
    // (identifier email itu sendiri), tanpa mengirim email ke alamat admin.
    await expect(t.mutation(internal.auth.store, mintaKodeOtp(emailAdmin))).resolves.toBe(
      emailAdmin,
    );
    await expect(
      t.mutation(
        internal.auth.store,
        mintaKodeOtp("belum-terdaftar@pindai.test", "123457"),
      ),
    ).resolves.toBe("belum-terdaftar@pindai.test");
  });

  it("verifikasi OTP email diblokir untuk admin memakai pesan kode salah yang sama", async () => {
    const t = convexTest(schema, modules);
    const emailAdmin = "admin-verifikasi@pindai.test";
    await buatPengguna(t, "Admin verifikasi OTP", {
      email: emailAdmin,
      emailVerificationTime: Date.now(),
      role: "admin",
    });
    await t.mutation(internal.auth.store, mintaKodeOtp(emailAdmin, "234567"));

    // Admin memang tidak boleh masuk lewat OTP email; pesannya sama persis
    // dengan kode salah milik alamat biasa supaya tidak membedakan admin.
    await expect(
      t.mutation(internal.auth.store, verifikasiKodeOtp(emailAdmin, "234567")),
    ).rejects.toThrow(PESAN_KODE_VERIFIKASI_SALAH);

    // Alamat biasa dengan kode yang sama tetap bisa masuk: blokirnya khusus
    // admin, bukan kerusakan alur OTP secara umum.
    const emailPeminjam = "peminjam-verifikasi@pindai.test";
    await t.mutation(internal.auth.store, mintaKodeOtp(emailPeminjam, "345678"));
    await expect(
      t.mutation(internal.auth.store, verifikasiKodeOtp(emailPeminjam, "345678")),
    ).resolves.toMatchObject({ userId: expect.anything() });
  });

  it("menyamakan balasan provider kata sandi untuk alamat non-admin", () => {
    // Pesan mengikuti Convex Auth, bukan pesan khusus peran: masuk memakai
    // kredensial salah, tahap verifikasi memakai kode salah.
    expect(pesanSandiNonAdmin("signIn")).toBe(PESAN_KREDENSIAL_SALAH);
    expect(pesanSandiNonAdmin("reset-verification")).toBe(PESAN_KODE_RESET_SALAH);
    expect(pesanSandiNonAdmin("email-verification")).toBe(
      PESAN_KODE_VERIFIKASI_SALAH,
    );
    // Aktivasi/reset dilanjutkan seperti permintaan token biasa (tanpa email),
    // sehingga bentuk responsnya sama dengan milik admin.
    expect(pesanSandiNonAdmin("signUp")).toBeNull();
    expect(pesanSandiNonAdmin("reset")).toBeNull();

    // Verifikasi kode memakai pesan Convex Auth untuk flow-nya masing-masing,
    // termasuk saat akun kata sandinya memang belum ada.
    expect(alurVerifikasiKode("reset-verification")).toBe(true);
    expect(alurVerifikasiKode("email-verification")).toBe(true);
    expect(alurVerifikasiKode("signUp")).toBe(false);
    expect(pesanKodeSalah("reset-verification")).toBe(PESAN_KODE_RESET_SALAH);
    expect(pesanKodeSalah("email-verification")).toBe(PESAN_KODE_VERIFIKASI_SALAH);

    // Tahap permintaan kode tidak pernah membocorkan; tahap verifikasi memakai
    // pesan kode salah yang sama dengan kode salah milik email biasa.
    expect(pesanBlokirOtpAdmin("email", true)).toBeNull();
    expect(pesanBlokirOtpAdmin("verification", true)).toBe(
      PESAN_KODE_VERIFIKASI_SALAH,
    );
    expect(pesanBlokirOtpAdmin("verification", false)).toBeNull();
  });

  it("membaca status akun kata sandi untuk menyamakan balasan tiap flow", async () => {
    const t = convexTest(schema, modules);
    const emailAdmin = "admin-status@pindai.test";
    const emailAdminTanpaSandi = "admin-tanpa-sandi@pindai.test";
    const emailPeminjam = "peminjam-status@pindai.test";
    await buatPengguna(t, "Admin status", {
      email: emailAdmin,
      emailVerificationTime: Date.now(),
      role: "admin",
    });
    await buatPengguna(t, "Admin tanpa sandi", {
      email: emailAdminTanpaSandi,
      emailVerificationTime: Date.now(),
      role: "admin",
    });
    const { userId: peminjamId } = await buatPengguna(t, "Peminjam status", {
      email: emailPeminjam,
      emailVerificationTime: Date.now(),
      role: "peminjam",
    });
    await t.run(async (ctx) => {
      const admin = await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", emailAdmin))
        .first();
      if (admin === null) throw new Error("pengguna uji admin tidak ditemukan");
      // Akun kata sandi yang sudah aktif (hasil aktivasi admin).
      await ctx.db.insert("authAccounts", {
        userId: admin._id,
        provider: "password",
        providerAccountId: emailAdmin,
      });
      // Akun kata sandi lama milik non-admin: tetap bukan admin, tetapi
      // ditandai punya kata sandi supaya alurnya dibalas seragam.
      await ctx.db.insert("authAccounts", {
        userId: peminjamId,
        provider: "password",
        providerAccountId: emailPeminjam,
      });
    });

    await expect(
      t.query(internal.users.statusAkunKataSandi, { email: emailAdmin }),
    ).resolves.toEqual({ admin: true, punyaKataSandi: true });
    await expect(
      t.query(internal.users.statusAkunKataSandi, { email: emailAdminTanpaSandi }),
    ).resolves.toEqual({ admin: true, punyaKataSandi: false });
    await expect(
      t.query(internal.users.statusAkunKataSandi, { email: emailPeminjam }),
    ).resolves.toEqual({ admin: false, punyaKataSandi: true });
    await expect(
      t.query(internal.users.statusAkunKataSandi, { email: "belum-ada@pindai.test" }),
    ).resolves.toEqual({ admin: false, punyaKataSandi: false });
  });

  it("membatasi permintaan token aktivasi/reset sebelum email dikirim", async () => {
    // Hanya flow aktivasi/reset yang mengirim token; verifikasi kode tidak.
    expect(alurPermintaanToken("signUp")).toBe(true);
    expect(alurPermintaanToken("reset")).toBe(true);
    expect(alurPermintaanToken("signIn")).toBe(false);
    expect(alurPermintaanToken("reset-verification")).toBe(false);
    expect(alurPermintaanToken("email-verification")).toBe(false);
    expect(alurPermintaanToken("activate")).toBe(false);

    const t = convexTest(schema, modules);
    const email = "admin-token@pindai.test";
    const { userId } = await buatPengguna(t, "Admin token", {
      email,
      emailVerificationTime: Date.now(),
      role: "admin",
    });

    // Tiga permintaan pertama lolos; permintaan keempat ditolak SEBELUM
    // provider membuat kode baru — token yang sudah terkirim tetap berlaku.
    for (let ke = 1; ke <= 3; ke += 1) {
      await expect(
        t.mutation(internal.security.catatPermintaanTokenAdmin, {
          email,
          admin: true,
        }),
      ).resolves.toEqual({ blocked: false, sisaDetik: 0 });
    }
    const keempat = await t.mutation(
      internal.security.catatPermintaanTokenAdmin,
      { email, admin: true },
    );
    expect(keempat.blocked).toBe(true);
    expect(keempat.sisaDetik).toBeGreaterThan(0);
    await expect(
      t.run((ctx) => ctx.db.query("adminTokenRequests").collect()),
    ).resolves.toHaveLength(3);

    // Jejak keamanan ditulis untuk alamat admin...
    const log = await t.run((ctx) => ctx.db.query("loginLogs").collect());
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      userId,
      status: "diblokir",
      metode: "password_token",
    });
    const audit = await t.run((ctx) => ctx.db.query("auditLog").collect());
    expect(audit.map((a) => a.aksi)).toContain("admin_token_diblokir");

    // ...dan batas token tidak mengunci batas percobaan kata sandi: keduanya
    // pencatat terpisah.
    await expect(
      t.mutation(internal.security.catatPercobaanKataSandiAdmin, {
        email,
        admin: true,
      }),
    ).resolves.toEqual({ blocked: false, sisaDetik: 0 });

    // Alamat biasa dikenai batas yang sama persis (tidak hanya admin) supaya
    // balasan blokir tidak menandai alamat admin — tanpa log palsu.
    const emailBiasa = "bukan-admin-token@pindai.test";
    for (let ke = 1; ke <= 4; ke += 1) {
      const hasil = await t.mutation(
        internal.security.catatPermintaanTokenAdmin,
        { email: emailBiasa, admin: false },
      );
      expect(hasil.blocked).toBe(ke === 4);
    }
    expect(await t.run((ctx) => ctx.db.query("loginLogs").collect())).toHaveLength(1);
    expect(await t.run((ctx) => ctx.db.query("auditLog").collect())).toHaveLength(1);

    // Kuota dihitung per alamat.
    await expect(
      t.mutation(internal.security.catatPermintaanTokenAdmin, {
        email: "admin-token-lain@pindai.test",
        admin: true,
      }),
    ).resolves.toEqual({ blocked: false, sisaDetik: 0 });
  });

  it("membuka batas percobaan kata sandi dengan kode TOTP admin", async () => {
    const t = convexTest(schema, modules);
    const email = "admin-pulih@pindai.test";
    const { userId, authSessionId } = await buatPengguna(t, "Admin pemulihan", {
      email,
      emailVerificationTime: Date.now(),
      role: "admin",
    });
    await aktifkanTotpUntukSesi(t, userId, authSessionId, []);

    // Penyerang menghabiskan batas 5 percobaan per 15 menit.
    for (let ke = 1; ke <= 5; ke += 1) {
      await t.mutation(internal.security.catatPercobaanKataSandiAdmin, {
        email,
        admin: true,
      });
    }
    await expect(
      t.mutation(internal.security.catatPercobaanKataSandiAdmin, {
        email,
        admin: true,
      }),
    ).resolves.toMatchObject({ blocked: true });

    const kode = await totpNow(TEST_TOTP_SECRET);
    const kodeSalah = kode === "000000" ? "111111" : "000000";
    await expect(
      t.mutation(internal.security.bukaBatasKataSandiDenganTotp, {
        email,
        kode: kodeSalah,
      }),
    ).resolves.toEqual({ ok: false });
    // Kode salah tidak membuka apa pun: catatan percobaan tetap ada (lima
    // baris; percobaan keenam yang sudah diblokir memang tidak menambah baris).
    await expect(
      t.run(async (ctx) => (await ctx.db.query("adminLoginAttempts").collect()).length),
    ).resolves.toBe(5);

    await expect(
      t.mutation(internal.security.bukaBatasKataSandiDenganTotp, { email, kode }),
    ).resolves.toEqual({ ok: true });
    // Hitungan dibuang sehingga percobaan berikutnya (dengan kata sandi yang
    // benar) tidak ikut terblokir.
    await expect(
      t.run(async (ctx) => (await ctx.db.query("adminLoginAttempts").collect()).length),
    ).resolves.toBe(0);
    await expect(
      t.mutation(internal.security.catatPercobaanKataSandiAdmin, {
        email,
        admin: true,
      }),
    ).resolves.toEqual({ blocked: false, sisaDetik: 0 });

    // Anti-replay: kode yang sama tidak bisa dipakai dua kali.
    await expect(
      t.mutation(internal.security.bukaBatasKataSandiDenganTotp, { email, kode }),
    ).resolves.toEqual({ ok: false });
    // Pemulihan tercatat agar terlihat tim di panel keamanan + audit trail.
    const audit = await t.run((ctx) => ctx.db.query("auditLog").collect());
    expect(audit.map((a) => a.aksi)).toContain("admin_batas_kata_sandi_dibuka");

    // Alamat yang bukan admin ber-TOTP tidak punya jalur pemulihan ini.
    await expect(
      t.mutation(internal.security.bukaBatasKataSandiDenganTotp, {
        email: "bukan-admin-pulih@pindai.test",
        kode,
      }),
    ).resolves.toEqual({ ok: false });
  });

/** Seed aplikasi pinjaman tunai dari penyedia dana + peminjam, lalu pastikan
 * setiap aplikasi tercatat sebagai jurnal ledger internal yang seimbang.
 */
describe("seed aplikasi pinjaman tunai", () => {
  it("membuat pinjaman dari penyedia dana + peminjam dan menulis jurnal seimbang", async () => {
    const t = convexTest(schema, modules);
    const danaId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "dana@pindai.test",
        name: "Penyedia Dana",
        role: ROLES.DANA,
      }),
    );
    const peminjamId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "peminjam@pindai.test",
        name: "Peminjam",
        role: ROLES.PEMINJAM,
      }),
    );
    await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "admin@pindai.test",
        name: "Super Admin",
        role: ROLES.ADMIN,
        emailVerificationTime: Date.now(),
      }),
    );
    await t.mutation(internal.admin.seedLoanApplication, {
      danaId,
      peminjamId,
      kodePeminjam: "PMN-SEED-0000000000000000",
      nik: "3201234567890000",
      nomorRekening: "1234567890",
      nomorWhatsApp: "6281234567890",
      penghasilanBulanan: 3_000_000,
      sumberPenghasilan: "usaha",
      tujuan: "Modal usaha",
      catatanPeminjam: "Seed dari penyedia dana",
      namaLengkap: "Nama Peminjam",
      namaBank: "Bank Demo",
      status: "disetujui",
      tenorBulan: 3,
    });
    const loans = await t.run((ctx) =>
      ctx.db.query("loans")
        .withIndex("by_status", (q) => q.eq("status", "disetujui"))
        .collect(),
    );
    expect(loans).toHaveLength(1);
    expect(loans[0].pokokPinjaman).toBe(1_500_000);
    expect(loans[0].pendanaId).toBe(danaId);

    // Setiap pinjaman disetujui menghasilkan jurnal debit/kredit yang
    // salidannya mencerminkan pinjaman + biaya platform.
    const entries = await t.run((ctx) =>
      ctx.db.query("ledger_entries")
        .filter((q) => q.eq(q.field("akun"), `pinjaman:${loans[0]._id}`))
        .collect(),
    );
    expect(entries).toHaveLength(2);
    const totalDebit = entries.reduce((acc, e) => acc + (e.arah === "debit" ? e.jumlah : 0), 0);
    const totalKredit = entries.reduce((acc, e) => acc + (e.arah === "kredit" ? e.jumlah : 0), 0);
    expect(totalDebit).toBe(totalKredit);
    expect(totalDebit).toBeGreaterThan(0);

    // Biaya platform 2% (30.000): diakui sebagai pendapatan dengan mendebit
    // platform:FEE (jenis platform_fee, agar terhitung di ringkasan admin)
    // dan mengkredit dompet penyedia dana sehingga saldonya turun.
    const semuaEntri = await t.run((ctx) =>
      ctx.db.query("ledger_entries").collect(),
    );
    const entriPlatform = semuaEntri.filter((e) => e.akun === "platform:FEE");
    expect(entriPlatform).toHaveLength(1);
    expect(entriPlatform[0].jenis).toBe("platform_fee");
    expect(entriPlatform[0].arah).toBe("debit");
    expect(entriPlatform[0].jumlah).toBe(30_000);

    const entriDana = semuaEntri.filter(
      (e) => e.akun === `dana:WALLET:${danaId}`,
    );
    expect(entriDana).toHaveLength(1);
    expect(entriDana[0].arah).toBe("kredit");
    expect(entriDana[0].jumlah).toBe(30_000);
  });

  it("menolak seed dari akun bukan admin atau pengguna tidak lengkap", async () => {
    const t = convexTest(schema, modules);
    const danaId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "dana-lain@pindai.test",
        role: ROLES.DANA,
      }),
    );
    const peminjamId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "peminjam-lain@pindai.test",
        role: ROLES.PEMINJAM,
      }),
    );
    await expect(
      t.mutation(internal.admin.seedLoanApplication, {
        danaId,
        peminjamId,
        kodePeminjam: "PMN-SEED-TIDAK-ADMIN",
        nik: "3201234567890011",
        nomorRekening: "0987654321",
        nomorWhatsApp: "6281234567891",
        penghasilanBulanan: 1_000_000,
        sumberPenghasilan: "gaji",
        tujuan: "Belum lulus",
        namaLengkap: "Bukan Admin",
        namaBank: "Bank Lain",
        status: "diajukan",
      }),
    ).rejects.toThrow(/admin/i);
  });
});
});
