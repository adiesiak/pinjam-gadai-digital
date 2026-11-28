import { convexTest } from "convex-test";
import { beforeEach, afterEach, describe, expect, it } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import { siapkanPengguna } from "./test.helpers";

function kontek() {
  return convexTest(schema, modules);
}

/** Siapkan pinjaman yang sudah didanai lewat jalur bot (jadwal angsuran ada). */
async function pinjamanDidanai(t: ReturnType<typeof kontek>, referensi: string) {
  await siapkanPengguna(t, "Admin", {
    email: `admin-${referensi}@pindai.test`,
    role: "admin",
  });
  const peminjam = await siapkanPengguna(t, "Budi", {
    email: `budi-${referensi}@pindai.test`,
    role: "peminjam",
  });

  await t.run(async (ctx) => {
    await ctx.db.insert("loans", {
      userId: peminjam.userId,
      nomorReferensi: referensi,
      status: "sedang_direview",
      pokokPinjaman: 1_000_000,
      tenorHari: 28,
      namaLengkap: "Budi",
      namaBank: "BCA",
      nomorRekening: "1234567890",
      tujuan: "Modal",
      nik: "3273012345678901",
      nomorWhatsApp: "6281234567890",
      penghasilanBulanan: 5_000_000,
      sumberPenghasilan: "Karyawan",
      persetujuanPengajuanPada: Date.now(),
      pendanaNama: "Pendana Uji",
    } as never);
  });

  await t.mutation(internal.loans._danaiDariBot, { nomorReferensi: referensi });
}

describe("pembayaran lewat bot", () => {
  const lama = process.env.BOT_API_KEY;

  beforeEach(() => {
    process.env.BOT_API_KEY = "kunci-bot-uji";
  });
  afterEach(() => {
    if (lama === undefined) delete process.env.BOT_API_KEY;
    else process.env.BOT_API_KEY = lama;
  });

  it("menolak nominal yang tidak sama persis dan menyebut kekurangannya", {
    timeout: 30_000,
  }, async () => {
    const t = kontek();
    await pinjamanDidanai(t, "PGD-20261128-BYR1");

    // Nominal jauh di bawah kewajiban: server menolak dengan pesan yang
    // menyebut total seharusnya. Bot memakainya untuk memberi tahu nasabah.
    const hasil = await t.mutation(
      internal.botBayar._catatPembayaranDariBot,
      {
        nomorReferensi: "PGD-20261128-BYR1",
        referensi: "MUTASI-BYR1-A",
        jumlahMutasi: 1_000,
      },
    );

    expect(hasil.ok).toBe(false);
    if (hasil.ok === false) {
      expect(hasil.alasan).toBe("sebagian");
      expect(hasil.totalDue).toBeGreaterThan(1_000);
      expect(hasil.kurang).toBe(hasil.totalDue - hasil.dibayar);
      expect(hasil.jalur).toBe("harian");
    }
  });

  it("mencatat pelunasan penuh lalu idempoten pada kunci yang sama", {
    timeout: 30_000,
  }, async () => {
    const t = kontek();
    await pinjamanDidanai(t, "PGD-20261128-BYR2");

    // Cari total kewajiban lewat percobaan pertama dengan nominal mustahil,
    // supaya tes tidak perlu menghitung ulang rumus bunga/denda.
    const probe = await t.mutation(
      internal.botBayar._catatPembayaranDariBot,
      {
        nomorReferensi: "PGD-20261128-BYR2",
        referensi: "MUTASI-BYR2-PROBE",
        jumlahMutasi: 1,
      },
    );
    expect(probe.ok).toBe(false);
    if (probe.ok !== false) return;

    const hasil = await t.mutation(
      internal.botBayar._catatPembayaranDariBot,
      {
        nomorReferensi: "PGD-20261128-BYR2",
        referensi: "MUTASI-BYR2-B",
        jumlahMutasi: probe.totalDue,
      },
    );
    expect(hasil.ok).toBe(true);
    if (hasil.ok) {
      expect(hasil.jalur).toBe("harian");
      expect(hasil.ulangan).toBe(false);
    }

    // Kiriman ulang dengan kunci yang sama: hasil sama, bukan pembayaran kedua.
    const ulang = await t.mutation(
      internal.botBayar._catatPembayaranDariBot,
      {
        nomorReferensi: "PGD-20261128-BYR2",
        referensi: "MUTASI-BYR2-B",
        jumlahMutasi: probe.totalDue,
      },
    );
    expect(ulang.ok).toBe(true);
    if (ulang.ok) expect(ulang.ulangan).toBe(true);
  });

  it("menolak referensi pinjaman yang tidak ada", async () => {
    const t = kontek();
    await siapkanPengguna(t, "Admin", {
      email: "admin-byr3@pindai.test",
      role: "admin",
    });
    await expect(
      t.mutation(internal.botBayar._catatPembayaranDariBot, {
        nomorReferensi: "PGD-TIDAK-ADA",
        referensi: "MUTASI-BYR3",
        jumlahMutasi: 1_000,
      }),
    ).rejects.toThrow(/tidak ditemukan/i);
  });
});
