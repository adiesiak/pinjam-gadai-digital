/**
 * Tes formulir minat calon pendana.
 *
 * Yang dijaga:
 *  - nomor disimpan dalam bentuk 62… dan formulir publik tidak butuh akun;
 *  - honeypot/validasi menolak kiriman yang tidak masuk akal tanpa membuat row;
 *  - nomor yang sama dalam 24 jam memperbarui satu baris, bukan menggandakan;
 *  - daftar dan perubahan status hanya bisa dibaca/dilakukan admin ber-TOTP,
 *    dan perubahan status meninggalkan audit.
 *
 * Menjalankan: bunx vitest run src/convex/minatPendana.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import { siapkanPengguna } from "./test.helpers";
import { modules } from "./test.setup";

const NOMOR = "081234567890";

function isian(overrides: Partial<Parameters<typeof dasar>[0]> = {}) {
  return dasar(overrides);
}

function dasar(overrides: {
  nama?: string;
  nomorWhatsApp?: string;
  nominalRencana?: number;
  kota?: string;
  catatan?: string;
  sumber?: "instagram" | "whatsapp" | "komunitas" | "rekomendasi" | "lainnya";
  setuju?: boolean;
  formDibukaPada?: number;
  jebakan?: string;
} = {}) {
  return {
    nama: "Rina Pendana",
    nomorWhatsApp: NOMOR,
    nominalRencana: 5_000_000,
    kota: "Bandung",
    sumber: "instagram" as const,
    setuju: true,
    formDibukaPada: Date.now() - 5_000,
    ...overrides,
  };
}

describe("minat calon pendana", () => {
  it("menyimpan minat publik dan menormalkan nomor WhatsApp", async () => {
    const t = convexTest(schema, modules);
    const hasil = await t.mutation(api.minatPendana.kirimMinat, isian());
    expect(hasil).toEqual({ ok: true, duplikat: false });

    const rows = await t.run((ctx) => ctx.db.query("minatPendana").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]?.nomorWhatsApp).toBe("6281234567890");
    expect(rows[0]?.status).toBe("baru");
    expect(rows[0]?.persetujuanPada).toBeGreaterThan(0);
  });

  it("menolak honeypot dan nomor yang tidak sah tanpa membuat row", async () => {
    const t = convexTest(schema, modules);
    const bot = await t.mutation(
      api.minatPendana.kirimMinat,
      isian({ jebakan: "diisi robot" }),
    );
    expect(bot.ok).toBe(false);

    const nomorSalah = await t.mutation(
      api.minatPendana.kirimMinat,
      isian({ nomorWhatsApp: "123" }),
    );
    expect(nomorSalah.ok).toBe(false);

    const rows = await t.run((ctx) => ctx.db.query("minatPendana").collect());
    expect(rows).toHaveLength(0);
  });

  it("memperbarui baris yang sama untuk nomor yang sama dalam 24 jam", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.minatPendana.kirimMinat, isian());
    const kedua = await t.mutation(
      api.minatPendana.kirimMinat,
      isian({ nominalRencana: 7_500_000, catatan: "Ingin mulai kecil" }),
    );
    expect(kedua).toEqual({ ok: true, duplikat: true });

    const rows = await t.run((ctx) => ctx.db.query("minatPendana").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]?.nominalRencana).toBe(7_500_000);
    expect(rows[0]?.catatan).toBe("Ingin mulai kecil");
    expect(rows[0]?.diperbaruiPada).toBeGreaterThan(0);
  });

  it("hanya admin ber-TOTP yang bisa membaca dan mengubah status", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.minatPendana.kirimMinat, isian());
    const admin = await siapkanPengguna(t, "Admin Pendana", {
      email: "admin-pendana@pindai.test",
      role: "admin",
    });

    const rows = await admin.sesi.query(api.minatPendana.daftar, {});
    expect(rows).toHaveLength(1);
    const id = rows[0]!._id;

    await admin.sesi.mutation(api.minatPendana.ubahStatus, {
      id,
      status: "dihubungi",
    });
    const sesudah = await t.run((ctx) => ctx.db.get(id));
    expect(sesudah?.status).toBe("dihubungi");
    expect(sesudah?.olehUserId).toBe(admin.userId);

    const audit = await t.run((ctx) =>
      ctx.db
        .query("auditLog")
        .withIndex("by_aksi", (q) => q.eq("aksi", "minat_pendana_status"))
        .collect(),
    );
    expect(audit).toHaveLength(1);
    expect(audit[0]?.detail).toBe("baru -> dihubungi");

    const penggunaBiasa = await siapkanPengguna(t, "Pengguna Biasa", {
      email: "pengguna-biasa@pindai.test",
      role: "peminjam",
    });
    await expect(penggunaBiasa.sesi.query(api.minatPendana.daftar, {})).rejects.toThrow();
    await expect(t.query(api.minatPendana.daftar, {})).rejects.toThrow();
  });
});
