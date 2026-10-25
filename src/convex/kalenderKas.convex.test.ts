/**
 * Uji pengaturan peringatan kas dan biaya operasional.
 * Run: bunx vitest run src/convex/kalenderKas.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import { aktifkanTotpUntukSesi, buatPengguna, type KonteksUji } from "./test.helpers";
import { modules } from "./test.setup";

async function adminSiap(t: KonteksUji) {
  const admin = await buatPengguna(t, "Admin Kas", {
    email: "admin-kas@pindai.test",
    role: "admin",
  });
  await aktifkanTotpUntukSesi(t, admin.userId, admin.authSessionId);
  return admin;
}

describe("kalender kas admin", () => {
  it("menyimpan pengaturan peringatan dan menolak nominal tidak sah", async () => {
    const t = convexTest(schema, modules);
    const admin = await adminSiap(t);

    await expect(
      admin.sesi.mutation(api.kalenderKas.simpanPengaturanKas, {
        aktif: true,
        saldoKas: -1,
        saldoMinimum: 0,
        hariPeringatan: 7,
      }),
    ).rejects.toThrow(/Saldo kas/);

    await expect(
      admin.sesi.mutation(api.kalenderKas.simpanPengaturanKas, {
        aktif: true,
        saldoKas: 1_000_000,
        saldoMinimum: 200_000,
        hariPeringatan: 0,
      }),
    ).rejects.toThrow(/1–60/);

    await admin.sesi.mutation(api.kalenderKas.simpanPengaturanKas, {
      aktif: true,
      saldoKas: 1_000_000,
      saldoMinimum: 200_000,
      hariPeringatan: 7,
      nomorWhatsApp: "+62 812 3456 7890",
    });

    const data = await admin.sesi.query(api.kalenderKas.kalenderKas, { hari: 7 });
    expect(data.pengaturan.aktif).toBe(true);
    expect(data.pengaturan.saldoKas).toBe(1_000_000);
    expect(data.pengaturan.saldoMinimum).toBe(200_000);
    expect(data.pengaturan.hariPeringatan).toBe(7);
    expect(data.pengaturan.nomorWhatsApp).toBe("+6281234567890");
    expect(data.pengaturan.saldoDiperbaruiPada).not.toBeNull();
    expect(data.baris).toHaveLength(7);
  });

  it("menambah, mengubah, dan menghapus biaya operasional", async () => {
    const t = convexTest(schema, modules);
    const admin = await adminSiap(t);

    await expect(
      admin.sesi.mutation(api.kalenderKas.tambahBiaya, {
        judul: "ab",
        nominal: 100_000,
        hariDalamBulan: 1,
      }),
    ).rejects.toThrow(/3–80/);

    await admin.sesi.mutation(api.kalenderKas.tambahBiaya, {
      judul: "Sewa kantor",
      nominal: 2_500_000,
      hariDalamBulan: 5,
    });
    let data = await admin.sesi.query(api.kalenderKas.kalenderKas, { hari: 14 });
    expect(data.biaya).toHaveLength(1);
    expect(data.biaya[0]).toMatchObject({
      judul: "Sewa kantor",
      nominal: 2_500_000,
      hariDalamBulan: 5,
      aktif: true,
    });

    const id = data.biaya[0].id as never;
    await admin.sesi.mutation(api.kalenderKas.ubahBiaya, {
      biayaId: id,
      judul: "Sewa kantor",
      nominal: 2_750_000,
      hariDalamBulan: 5,
      aktif: false,
    });
    data = await admin.sesi.query(api.kalenderKas.kalenderKas, { hari: 14 });
    expect(data.biaya[0].aktif).toBe(false);
    expect(data.biaya[0].nominal).toBe(2_750_000);
    expect(data.biayaAktif).toBe(0);

    await admin.sesi.mutation(api.kalenderKas.hapusBiaya, { biayaId: id });
    data = await admin.sesi.query(api.kalenderKas.kalenderKas, { hari: 14 });
    expect(data.biaya).toHaveLength(0);
  });

  it("menolak akun non-admin", async () => {
    const t = convexTest(schema, modules);
    const { sesi } = await buatPengguna(t, "Bukan Admin", {
      email: "bukan-admin@pindai.test",
      role: "peminjam",
    });
    await expect(sesi.query(api.kalenderKas.kalenderKas, { hari: 30 })).rejects.toThrow();
  });
});
