/** Tes integrasi Convex untuk memastikan akses admin dijaga di backend. */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { CONTRACT_TERMS_VERSION } from "../lib/contract";
import schema from "./schema";
import { modules } from "./test.setup";

type Tx = ReturnType<typeof convexTest>;
type Sesi = ReturnType<Tx["withIdentity"]>;

async function buatPengguna(
  t: Tx,
  nama: string,
  opsi: {
    email?: string;
    emailVerificationTime?: number;
    isAnonymous?: boolean;
    role?: "admin" | "pendana" | "peminjam";
  } = {},
): Promise<{ sesi: Sesi; userId: Id<"users"> }> {
  const userId = await t.mutation((ctx) =>
    ctx.db.insert("users", {
      ...(opsi.email !== undefined ? { email: opsi.email } : {}),
      ...(opsi.emailVerificationTime !== undefined
        ? { emailVerificationTime: opsi.emailVerificationTime }
        : {}),
      ...(opsi.isAnonymous !== undefined ? { isAnonymous: opsi.isAnonymous } : {}),
      name: nama,
      ...(opsi.role !== undefined ? { role: opsi.role } : {}),
    }),
  );
  return {
    userId,
    sesi: t.withIdentity({ subject: userId, name: nama }) as never,
  };
}

describe("otorisasi endpoint admin", () => {
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

  it("adminLoanQuote hanya dapat dipanggil oleh admin", async () => {
    const t = convexTest(schema, modules);
    const args = { pokokPinjaman: 1_000_000 };
    await expect(t.query(api.admin.adminLoanQuote, args)).rejects.toThrow(/masuk/i);

    const { sesi: peminjam } = await buatPengguna(t, "Peminjam", {
      email: "peminjam-quote@pindai.test",
      role: "peminjam",
    });
    await expect(peminjam.query(api.admin.adminLoanQuote, args)).rejects.toThrow(/admin/i);

    const { sesi: admin } = await buatPengguna(t, "Admin", {
      email: "admin-quote@pindai.test",
      role: "admin",
    });
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
    const { sesi: admin } = await buatPengguna(t, "Admin akad", {
      email: "admin-akad@pindai.test",
      role: "admin",
    });
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
    const { sesi: admin } = await buatPengguna(t, "Admin gadai akad", {
      email: "admin-gadai-akad@pindai.test",
      role: "admin",
    });
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
    await expect(
      peminjam.query(api.security.totpGateStatus, { sessionId: "sesi-peminjam" }),
    ).rejects.toThrow(/admin/i);
    await expect(peminjam.mutation(api.security.startTotpSetup, {})).rejects.toThrow(/admin/i);
    await expect(
      peminjam.mutation(api.security.confirmTotpSetup, { kode: "000000" }),
    ).rejects.toThrow(/admin/i);
    await expect(
      peminjam.mutation(api.security.verifyTotp, {
        kode: "000000",
        sessionId: "sesi-peminjam",
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
});
