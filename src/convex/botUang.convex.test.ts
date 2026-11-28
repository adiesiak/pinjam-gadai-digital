import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import { siapkanPengguna } from "./test.helpers";

const TOKEN = "kunci-bot-uji-0123456789abcdef";

function kontek() {
  return convexTest(schema, modules);
}

describe("endpoint uang lewat bot", () => {
  const lama = process.env.WHATSAPP_API_KEY;

  beforeEach(() => {
    process.env.BOT_API_KEY = TOKEN;
  });
  afterEach(() => {
    if (lama === undefined) delete process.env.BOT_API_KEY;
    else process.env.BOT_API_KEY = lama;
  });

  it("mencairkan pinjaman lewat bot membuat jadwal angsuran", { timeout: 30_000 }, async () => {
    const t = kontek();
    await siapkanPengguna(t, "Admin", {
      email: "admin-bot@pindai.test",
      role: "admin",
    });
    const peminjam = await siapkanPengguna(t, "Budi", {
      email: "budi@pindai.test",
      role: "peminjam",
    });

    // Pinjaman pada tahap tinjauan — siap dicairkan.
    const loanId = await t.run(async (ctx) => {
      return await ctx.db.insert("loans", {
        userId: peminjam.userId,
        nomorReferensi: "PGD-20261128-BOT1",
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
        // Pencairan menuntut pinjaman sudah punya pendana; tanpa ini
        // `pastikanPunyaPendana` menolak sebelum jadwal dibuat.
        pendanaNama: "Pendana Uji",
      } as never);
    });

    const hasil = await t.mutation(internal.loans._danaiDariBot, {
      nomorReferensi: "PGD-20261128-BOT1",
    });
    expect(hasil.ok).toBe(true);
    if (hasil.ok) expect(hasil.sudah).toBe(false);

    const loan = await t.run(async (ctx) => await ctx.db.get(loanId as never));
    expect((loan as { status: string }).status).toBe("didanai");

    // Pencairan WAJIB membuat jadwal angsuran; tanpa itu tagihan tidak pernah
    // muncul dan nasabah tidak pernah ditagih.
    const angsuran = await t.run(async (ctx) =>
      ctx.db.query("angsuran").collect(),
    );
    expect(angsuran.length).toBeGreaterThan(0);

    // Jejak audit harus menyebut bot, bukan menyamar sebagai klik panel.
    const auditBaris = await t.run(async (ctx) =>
      ctx.db.query("auditLog").collect(),
    );
    const catatan = auditBaris.find((a) => a.aksi === "pencairan_dari_bot");
    expect(catatan).toBeDefined();
    expect(catatan?.aktorLabel).toBe("bot-whatsapp");
  });

  it("idempoten: pencairan kedua tidak membuat jadwal angsuran kedua", { timeout: 30_000 }, async () => {
    const t = kontek();
    await siapkanPengguna(t, "Admin", {
      email: "admin-bot2@pindai.test",
      role: "admin",
    });
    const peminjam = await siapkanPengguna(t, "Sari", {
      email: "sari@pindai.test",
      role: "peminjam",
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("loans", {
        userId: peminjam.userId,
        nomorReferensi: "PGD-20261128-BOT2",
        status: "sedang_direview",
        pokokPinjaman: 1_000_000,
        tenorHari: 28,
        namaLengkap: "Sari",
        namaBank: "BCA",
        nomorRekening: "1234567890",
        tujuan: "Modal",
        nik: "3273012345678902",
        nomorWhatsApp: "6281234567891",
        penghasilanBulanan: 5_000_000,
        sumberPenghasilan: "Karyawan",
        persetujuanPengajuanPada: Date.now(),
        // Pencairan menuntut pinjaman sudah punya pendana; tanpa ini
        // `pastikanPunyaPendana` menolak sebelum jadwal dibuat.
        pendanaNama: "Pendana Uji",
      } as never);
    });

    const pertama = await t.mutation(internal.loans._danaiDariBot, {
      nomorReferensi: "PGD-20261128-BOT2",
    });
    if (pertama.ok) expect(pertama.sudah).toBe(false);

    const jumlahPertama = await t.run(async (ctx) =>
      (await ctx.db.query("angsuran").collect()).length,
    );

    const kedua = await t.mutation(internal.loans._danaiDariBot, {
      nomorReferensi: "PGD-20261128-BOT2",
    });
    expect(kedua.ok).toBe(true);
    if (kedua.ok) expect(kedua.sudah).toBe(true);

    const jumlahKedua = await t.run(async (ctx) =>
      (await ctx.db.query("angsuran").collect()).length,
    );
    expect(jumlahKedua).toBe(jumlahPertama);
  });

  it("menolak referensi yang tidak ada", async () => {
    const t = kontek();
    await siapkanPengguna(t, "Admin", {
      email: "admin-bot3@pindai.test",
      role: "admin",
    });
    await expect(
      t.mutation(internal.loans._danaiDariBot, {
        nomorReferensi: "PGD-TIDAK-ADA",
      }),
    ).rejects.toThrow(/tidak ditemukan/i);
  });
});

describe("tagihan lewat bot", () => {
  it("mengembalikan tagihan lengkap untuk nomor terdaftar", async () => {
    const t = kontek();
    const user = await siapkanPengguna(t, "Budi", {
      email: "budi-tagihan@pindai.test",
      role: "peminjam",
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(user.userId, { nomorWhatsApp: "6281234567899" });
      const loanId = await ctx.db.insert("loans", {
        userId: user.userId,
        nomorReferensi: "PGD-20261128-TAG1",
        status: "didanai",
        pokokPinjaman: 1_000_000,
        tenorHari: 28,
        namaLengkap: "Budi",
        namaBank: "BCA",
        nomorRekening: "1234567890",
        tujuan: "Modal",
        nik: "3273012345678903",
        nomorWhatsApp: "6281234567899",
        penghasilanBulanan: 5_000_000,
        sumberPenghasilan: "Karyawan",
        didanaiPada: Date.now() - 7 * 24 * 3600_000,
      } as never);
      await ctx.db.insert("angsuran", {
        userId: user.userId,
        loanId,
        nomor: 1,
        pokok: 1_000_000,
        bunga: 100_000,
        total: 1_100_000,
        status: "belum_dibayar",
        jatuhTempoPada: Date.now() - 2 * 24 * 3600_000,
      } as never);
    });

    const hasil = await t.query(internal.botApi._tagihanBot, {
      nomor: "6281234567899",
    });
    expect(hasil.ok).toBe(true);
    if (hasil.ok) {
      expect(hasil.pinjaman.length).toBe(1);
      expect(hasil.pinjaman[0]?.nomorReferensi).toBe("PGD-20261128-TAG1");
      // Terlambat 2 hari: denda harus ikut dihitung, bukan nol.
      expect(hasil.pinjaman[0]?.ringkasan.terlambat).toBe(1);
      expect(hasil.pinjaman[0]?.ringkasan.dendaBerjalan).toBeGreaterThan(0);
    }
  });

  it("menolak nomor yang belum terdaftar", async () => {
    const t = kontek();
    const hasil = await t.query(internal.botApi._tagihanBot, {
      nomor: "089999999999",
    });
    expect(hasil.ok).toBe(false);
  });
});
