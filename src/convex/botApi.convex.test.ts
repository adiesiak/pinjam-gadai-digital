import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { internal } from "./_generated/api";
import {
  kunciBot,
  normalisasiNomor,
  samaAman,
} from "./botApi";
import schema from "./schema";
import { modules } from "./test.setup";

const TOKEN = "kunci-bot-uji-0123456789abcdef";

function kontek() {
  return convexTest(schema, modules);
}

describe("helper API bot", () => {
  it("normalisasi nomor WhatsApp ke bentuk 62…", () => {
    expect(normalisasiNomor("08123456789")).toBe("628123456789");
    expect(normalisasiNomor("+62 812-3456-789")).toBe("628123456789");
    expect(normalisasiNomor("8123456789")).toBe("628123456789");
    expect(normalisasiNomor("628123456789")).toBe("628123456789");
    // Bukan nomor: tidak boleh menghasilkan apa pun yang bisa dicocokkan.
    expect(normalisasiNomor("bukan nomor")).toBe("");
    expect(normalisasiNomor("")).toBe("");
  });

  it("perbandingan kunci memakai waktu konstan", () => {
    expect(samaAman("abc", "abc")).toBe(true);
    expect(samaAman("abc", "abd")).toBe(false);
    // Panjang berbeda langsung ditolak (tidak membocorkan isi).
    expect(samaAman("abc", "abcd")).toBe(false);
    expect(samaAman("", "")).toBe(true);
  });
});

describe("pendaftaran lewat bot", () => {
  const lama = process.env.BOT_API_KEY;

  beforeEach(() => {
    process.env.BOT_API_KEY = TOKEN;
  });
  afterEach(() => {
    if (lama === undefined) delete process.env.BOT_API_KEY;
    else process.env.BOT_API_KEY = lama;
  });

  it("kunciBot membaca environment", () => {
    expect(kunciBot()).toBe(TOKEN);
  });

  it("mendaftarkan nomor baru sebagai peminjam", async () => {
    const t = kontek();
    const hasil = await t.mutation(internal.botApi._daftarDariBot, {
      nomor: "08123456789",
      nama: "Budi Santoso",
    });

    expect(hasil.baru).toBe(true);
    const user = await t.run(async (ctx) => ctx.db.get(hasil.userId));
    expect(user?.name).toBe("Budi Santoso");
    expect(user?.nomorWhatsApp).toBe("628123456789");
    expect(user?.role).toBe("peminjam");

    // Pendaftaran harus meninggalkan jejak audit.
    const auditBaris = await t.run(async (ctx) =>
      ctx.db.query("auditLog").collect(),
    );
    expect(auditBaris.some((a) => a.aksi === "daftar_dari_bot")).toBe(true);
  });

  it("tidak membuat duplikat untuk nomor yang sudah ada", async () => {
    const t = kontek();
    const pertama = await t.mutation(internal.botApi._daftarDariBot, {
      nomor: "08123456789",
      nama: "Budi",
    });
    const kedua = await t.mutation(internal.botApi._daftarDariBot, {
      nomor: "+62 812-3456-789",
      nama: "Budi Lagi",
    });

    expect(kedua.baru).toBe(false);
    expect(kedua.userId).toBe(pertama.userId);
    const jumlah = await t.run(async (ctx) =>
      (await ctx.db.query("users").collect()).length,
    );
    expect(jumlah).toBe(1);
  });

  it("menolak nomor atau nama yang tidak masuk akal", async () => {
    const t = kontek();
    await expect(
      t.mutation(internal.botApi._daftarDariBot, { nomor: "123", nama: "Budi" }),
    ).rejects.toThrow(/Nomor/);
    await expect(
      t.mutation(internal.botApi._daftarDariBot, {
        nomor: "08123456789",
        nama: "B",
      }),
    ).rejects.toThrow(/Nama/);
  });
});

describe("pencarian dan status lewat bot", () => {
  it("menemukan user dari nomor WhatsApp dengan format apa pun", async () => {
    const t = kontek();
    const { userId } = await t.mutation(internal.botApi._daftarDariBot, {
      nomor: "08123456789",
      nama: "Budi",
    });

    for (const nomor of ["08123456789", "+628123456789", "628123456789"]) {
      const ketemu = await t.query(internal.botApi._cariUserByNomor, { nomor });
      expect(ketemu?.userId).toBe(userId);
    }
  });

  it("mengembalikan null untuk nomor yang belum terdaftar", async () => {
    const t = kontek();
    const ketemu = await t.query(internal.botApi._cariUserByNomor, {
      nomor: "08999999999",
    });
    expect(ketemu).toBeNull();
  });

  it("status hanya berisi pengajuan milik nomor itu", async () => {
    const t = kontek();
    const budi = await t.mutation(internal.botApi._daftarDariBot, {
      nomor: "08123456789",
      nama: "Budi",
    });
    const sari = await t.mutation(internal.botApi._daftarDariBot, {
      nomor: "08987654321",
      nama: "Sari",
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("loans", {
        userId: budi.userId,
        nomorReferensi: "PGD-20261128-AAAA",
        status: "diajukan",
        pokokPinjaman: 1_000_000,
        tenorHari: 28,
      } as never);
      await ctx.db.insert("loans", {
        userId: sari.userId,
        nomorReferensi: "PGD-20261128-BBBB",
        status: "diajukan",
        pokokPinjaman: 2_000_000,
        tenorHari: 28,
      } as never);
    });

    const hasil = await t.query(internal.botApi._statusPengajuan, {
      nomor: "08123456789",
    });
    expect(hasil.ok).toBe(true);
    if (hasil.ok) {
      expect(hasil.pengajuan.map((p) => p.nomorReferensi)).toEqual([
        "PGD-20261128-AAAA",
      ]);
    }
  });

  it("status menolak nomor yang belum terdaftar tanpa membocorkan apa pun", async () => {
    const t = kontek();
    const hasil = await t.query(internal.botApi._statusPengajuan, {
      nomor: "08999999999",
    });
    expect(hasil.ok).toBe(false);
  });
});
