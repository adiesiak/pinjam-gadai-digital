/**
 * Uji alur referral lewat server.
 * Run: bunx vitest run src/convex/referral.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { selesaikanReferralPelunasan } from "./referral";
import schema from "./schema";
import { buatPengguna, type KonteksUji } from "./test.helpers";
import { modules } from "./test.setup";

async function pinjamanLunas(
  t: KonteksUji,
  userId: Id<"users">,
  nomorReferensi: string,
  pokok: number,
) {
  const id = await t.run((ctx) =>
    ctx.db.insert("loans", {
      userId,
      pokokPinjaman: pokok,
      tujuan: "Uji referral",
      namaLengkap: "Nasabah Uji",
      nomorRekening: "1234567890",
      status: "lunas",
      nomorReferensi,
      tenorHari: 7,
    }),
  );
  const loan = await t.run((ctx) => ctx.db.get(id));
  if (loan === null) throw new Error("Pinjaman uji gagal dibuat.");
  return loan;
}

describe("referral nasabah", () => {
  it("kode hanya terbuka setelah satu pinjaman lunas", async () => {
    const t = convexTest(schema, modules);
    const { userId, sesi } = await buatPengguna(t, "Rina Perujuk", {
      email: "rina@pindai.test",
      role: "peminjam",
    });

    await expect(sesi.mutation(api.referral.aktifkanKode, {})).rejects.toThrow(
      /Selesaikan satu pinjaman/,
    );

    await pinjamanLunas(t, userId, "PGD-RINA-1", 1_000_000);
    const pertama = await sesi.mutation(api.referral.aktifkanKode, {});
    expect(pertama.baru).toBe(true);
    expect(pertama.kode.length).toBeGreaterThanOrEqual(4);

    const kedua = await sesi.mutation(api.referral.aktifkanKode, {});
    expect(kedua).toEqual({ kode: pertama.kode, baru: false });
  });

  it("klaim sekali, lalu dua voucher terbit saat pinjaman lunas", async () => {
    const t = convexTest(schema, modules);
    const perujuk = await buatPengguna(t, "Rina Perujuk", {
      email: "rina2@pindai.test",
      role: "peminjam",
    });
    const pengundang = await buatPengguna(t, "Budi Pengundang", {
      email: "budi@pindai.test",
      role: "peminjam",
    });
    await pinjamanLunas(t, perujuk.userId, "PGD-RINA-2", 1_000_000);
    const { kode } = await perujuk.sesi.mutation(api.referral.aktifkanKode, {});

    const klaim = await pengundang.sesi.mutation(api.referral.klaimKode, {
      kode: kode.toLowerCase(),
    });
    expect(klaim).toEqual({ kode, status: "menunggu_lunas" });

    await expect(
      pengundang.sesi.mutation(api.referral.klaimKode, { kode }),
    ).rejects.toThrow(/sudah memakai/);
    await expect(
      perujuk.sesi.mutation(api.referral.klaimKode, { kode }),
    ).rejects.toThrow(/sendiri/);

    const loan = await pinjamanLunas(t, pengundang.userId, "PGD-BUDI-1", 1_000_000);
    await t.run((ctx) =>
      selesaikanReferralPelunasan(ctx, { loan, sekarang: Date.now() }),
    );

    const voucherPerujuk = await t.run((ctx) =>
      ctx.db
        .query("voucher")
        .withIndex("by_pemilik", (q) => q.eq("pemilikId", perujuk.userId))
        .collect(),
    );
    const voucherPengundang = await t.run((ctx) =>
      ctx.db
        .query("voucher")
        .withIndex("by_pemilik", (q) => q.eq("pemilikId", pengundang.userId))
        .collect(),
    );
    expect(voucherPerujuk).toHaveLength(1);
    expect(voucherPengundang).toHaveLength(1);
    expect(voucherPerujuk[0].nilai).toBe(50_000);
    expect(voucherPengundang[0].nilai).toBe(25_000);
    expect(voucherPerujuk[0].sumber).toBe("referral");
    expect(voucherPerujuk[0].pemilikId).toBe(perujuk.userId);

    const klaimTersimpan = await t.run((ctx) =>
      ctx.db
        .query("referralKlaim")
        .withIndex("by_pengundang", (q) => q.eq("pengundangId", pengundang.userId))
        .first(),
    );
    expect(klaimTersimpan?.status).toBe("hadiah_diberikan");

    // Pelunasan dicatat ulang tidak boleh menggandakan hadiah.
    await t.run((ctx) =>
      selesaikanReferralPelunasan(ctx, { loan, sekarang: Date.now() }),
    );
    const setelahUlang = await t.run((ctx) =>
      ctx.db.query("voucher").collect(),
    );
    expect(setelahUlang).toHaveLength(2);
  });

  it("pinjaman di bawah pokok minimum membatalkan klaim, bukan menggantung", async () => {
    const t = convexTest(schema, modules);
    const perujuk = await buatPengguna(t, "Sari Perujuk", {
      email: "sari@pindai.test",
      role: "peminjam",
    });
    const pengundang = await buatPengguna(t, "Tono Pengundang", {
      email: "tono@pindai.test",
      role: "peminjam",
    });
    await pinjamanLunas(t, perujuk.userId, "PGD-SARI-1", 1_000_000);
    const { kode } = await perujuk.sesi.mutation(api.referral.aktifkanKode, {});
    await pengundang.sesi.mutation(api.referral.klaimKode, { kode });

    const loan = await pinjamanLunas(t, pengundang.userId, "PGD-TONO-1", 50_000);
    await t.run((ctx) =>
      selesaikanReferralPelunasan(ctx, { loan, sekarang: Date.now() }),
    );

    const klaim = await t.run((ctx) =>
      ctx.db
        .query("referralKlaim")
        .withIndex("by_pengundang", (q) => q.eq("pengundangId", pengundang.userId))
        .first(),
    );
    expect(klaim?.status).toBe("batal");
    expect(await t.run((ctx) => ctx.db.query("voucher").collect())).toHaveLength(0);
  });
});
