/**
 * Tes "Ingat perangkat ini" (perangkat dipercaya) — convex-test + vitest.
 *
 * Alur yang diuji:
 *  - verifyTotp dengan `ingatPerangkat` menerbitkan token; server hanya
 *    menyimpan hash-nya (token mentah tidak pernah tersimpan).
 *  - Perangkat dipercaya melewati gate TOTP pada sesi Auth BARU tanpa kode.
 *  - Token kedaluwarsa, dicabut, atau milik akun lain ditolak.
 *  - Menonaktifkan 2FA mencabut seluruh perangkat dipercaya.
 *
 * Menjalankan: bunx vitest run src/convex/perangkatPercaya.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import {
  TEST_TOTP_SECRET,
  buatPengguna,
  buatSesiLain,
  type KonteksUji,
  type PenggunaUji,
  type SesiUji,
} from "./test.helpers";
import { modules } from "./test.setup";
import { totpNow } from "../lib/totp";

const PERANGKAT = "Browser Uji";
const IP = "127.0.0.1";

/** Admin tanpa bukti sesi TOTP — gerbang tertutup sampai diverifikasi. */
async function adminTanpaSesiTerverifikasi(
  t: KonteksUji,
  email: string,
): Promise<PenggunaUji> {
  const pengguna = await buatPengguna(t, "Admin Perangkat", {
    email,
    emailVerificationTime: Date.now(),
    role: "admin",
  });
  await t.run((ctx) =>
    ctx.db.insert("mfaSettings", {
      userId: pengguna.userId,
      totpSecret: TEST_TOTP_SECRET,
    }),
  );
  return pengguna;
}

/** Verifikasi TOTP + "ingat perangkat ini"; kembalikan token mentah. */
async function verifikasiDenganIngat(sesi: SesiUji): Promise<string> {
  const kode = await totpNow(TEST_TOTP_SECRET);
  const hasil = await sesi.mutation(api.security.verifyTotp, {
    kode,
    perangkat: PERANGKAT,
    ip: IP,
    ingatPerangkat: true,
  });
  if (hasil.tokenPerangkat === null) throw new Error("Token perangkat tidak diterbitkan.");
  return hasil.tokenPerangkat;
}

describe("perangkat dipercaya (ingat perangkat ini)", () => {
  it("menerbitkan token, menyimpan hash-nya saja, dan membuka gate sesi baru", async () => {
    const t = convexTest(schema, modules);
    const { sesi, userId } = await adminTanpaSesiTerverifikasi(t, "pd-1@pindai.test");

    expect(await sesi.query(api.security.totpGateStatus, {})).toMatchObject({
      isAdmin: true,
      verified: false,
    });

    const token = await verifikasiDenganIngat(sesi);
    expect(token).toMatch(/^[0-9a-f]{64}$/);

    const rows = await t.run((ctx) => ctx.db.query("trustedDevices").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(userId);
    // Token mentah TIDAK pernah disimpan — hanya hash-nya.
    expect(rows[0].tokenHash).not.toBe(token);
    expect(rows[0].kedaluwarsaPada).toBeGreaterThan(Date.now());

    // Sesi Auth baru pada akun yang sama: gate tertutup…
    const { sesi: sesiBaru } = await buatSesiLain(t, "Admin Perangkat", userId);
    expect(await sesiBaru.query(api.security.totpGateStatus, {})).toMatchObject({
      verified: false,
    });

    // …lalu terbuka memakai token perangkat tanpa mengetik kode.
    expect(
      await sesiBaru.mutation(api.security.cobaPerangkatPercaya, {
        token,
        perangkat: PERANGKAT,
        ip: IP,
      }),
    ).toEqual({ ok: true });
    expect(await sesiBaru.query(api.security.totpGateStatus, {})).toMatchObject({
      verified: true,
    });

    // Token asing tetap ditolak.
    const { sesi: sesiLain } = await buatSesiLain(t, "Admin Perangkat", userId);
    expect(
      await sesiLain.mutation(api.security.cobaPerangkatPercaya, {
        token: "0".repeat(64),
        perangkat: PERANGKAT,
        ip: IP,
      }),
    ).toEqual({ ok: false });
    expect(await sesiLain.query(api.security.totpGateStatus, {})).toMatchObject({
      verified: false,
    });
  });

  it("menolak token kedaluwarsa dan token milik akun lain", async () => {
    const t = convexTest(schema, modules);
    const { sesi, userId } = await adminTanpaSesiTerverifikasi(t, "pd-2@pindai.test");
    const token = await verifikasiDenganIngat(sesi);

    await t.run(async (ctx) => {
      const row = await ctx.db.query("trustedDevices").first();
      if (row !== null) await ctx.db.patch(row._id, { kedaluwarsaPada: Date.now() - 1 });
    });
    const { sesi: sesiBaru } = await buatSesiLain(t, "Admin Perangkat", userId);
    expect(
      await sesiBaru.mutation(api.security.cobaPerangkatPercaya, {
        token,
        perangkat: PERANGKAT,
        ip: IP,
      }),
    ).toEqual({ ok: false });

    // Token milik admin lain dipakai di akun admin pertama → ditolak.
    const admin2 = await adminTanpaSesiTerverifikasi(t, "pd-2b@pindai.test");
    const token2 = await verifikasiDenganIngat(admin2.sesi);
    expect(
      await sesiBaru.mutation(api.security.cobaPerangkatPercaya, {
        token: token2,
        perangkat: PERANGKAT,
        ip: IP,
      }),
    ).toEqual({ ok: false });
  });

  it("pencabutan per perangkat dan penonaktifan 2FA menutup kembali gate", async () => {
    const t = convexTest(schema, modules);
    const { sesi, userId } = await adminTanpaSesiTerverifikasi(t, "pd-3@pindai.test");
    const token = await verifikasiDenganIngat(sesi);

    const daftar = await sesi.query(api.security.daftarPerangkatPercaya, {});
    expect(daftar).toHaveLength(1);

    // Cabut lewat daftar → sesi baru tidak bisa memakai token.
    await sesi.mutation(api.security.cabutPerangkatPercaya, { id: daftar[0]._id });
    const { sesi: sesiBaru } = await buatSesiLain(t, "Admin Perangkat", userId);
    expect(
      await sesiBaru.mutation(api.security.cobaPerangkatPercaya, {
        token,
        perangkat: PERANGKAT,
        ip: IP,
      }),
    ).toEqual({ ok: false });

    // Simulasi perangkat kedua terdaftar, lalu 2FA dinonaktifkan.
    await t.run((ctx) =>
      ctx.db.insert("trustedDevices", {
        userId,
        tokenHash: "a".repeat(64),
        perangkat: "Perangkat kedua",
        dibuatPada: Date.now(),
        kedaluwarsaPada: Date.now() + 86_400_000,
      }),
    );
    const kode = await totpNow(TEST_TOTP_SECRET);
    await sesi.mutation(api.security.disableTotp, { kode });
    const semuaDicabut = await t.run(async (ctx) => {
      const rows = await ctx.db.query("trustedDevices").collect();
      return rows.length > 0 && rows.every((r) => r.dicabutPada !== undefined);
    });
    expect(semuaDicabut).toBe(true);
    expect(await sesiBaru.query(api.security.totpGateStatus, {})).toMatchObject({
      aktif: false,
      butuh: true,
    });
  });

  it("lupakanPerangkatPercaya mencabut token yang dikirim klien", async () => {
    const t = convexTest(schema, modules);
    const { sesi } = await adminTanpaSesiTerverifikasi(t, "pd-4@pindai.test");
    const token = await verifikasiDenganIngat(sesi);

    await sesi.mutation(api.security.lupakanPerangkatPercaya, { token });
    expect(await sesi.query(api.security.daftarPerangkatPercaya, {})).toHaveLength(0);

    await expect(
      sesi.mutation(api.security.lupakanPerangkatPercaya, { token: "" }),
    ).resolves.toEqual({ ok: true });
  });

  it("mengunci verifikasi TOTP setelah lima kode salah", async () => {
    const t = convexTest(schema, modules);
    const { sesi } = await adminTanpaSesiTerverifikasi(t, "pd-5@pindai.test");
    const benar = await totpNow(TEST_TOTP_SECRET);
    const salah = benar === "000000" ? "111111" : "000000";

    for (let i = 0; i < 5; i += 1) {
      const hasil = await sesi.mutation(api.security.verifyTotp, {
        kode: salah,
        perangkat: PERANGKAT,
        ip: IP,
      });
      expect(hasil.ok).toBe(false);
    }

    await expect(
      sesi.mutation(api.security.verifyTotp, {
        kode: benar,
        perangkat: PERANGKAT,
        ip: IP,
      }),
    ).rejects.toThrow(/dikunci/);
  });
});
