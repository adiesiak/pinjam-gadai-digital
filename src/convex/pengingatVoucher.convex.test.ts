/**
 * Tes pengingat WhatsApp voucher H-3 (convex-test + vitest).
 *
 * Yang dijaga:
 *  - hanya voucher AKTIF yang masih punya kuota dan jatuh tempo ≤3 hari;
 *  - satu voucher dikirimi SEKALI walau cron berjalan berkali-kali;
 *  - gateway yang belum siap TIDAK menghanguskan pengingat — voucher tetap
 *    dicoba lagi setelah gateway dinyalakan;
 *  - di luar jam kirim (08.00–20.00 WIB) tidak ada pesan yang keluar.
 *
 * Fonnte palsu dipasang dengan mengganti `globalThis.fetch`, sama seperti tes
 * pengingat tagihan: yang diperiksa adalah pesan yang benar-benar keluar.
 *
 * Menjalankan: bunx vitest run src/convex/pengingatVoucher.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { siapkanPengguna, type KonteksUji } from "./test.helpers";
import { modules } from "./test.setup";

const NOMOR = "6281234567890";
const TOKEN_UJI = "token-uji-wa";
const JAM_MS = 3_600_000;

type KeluarWa = { target: string; message: string };

/** Fonnte palsu yang selalu sukses; selalu dipulihkan lewat try/finally. */
function pasangGateway() {
  const asli = globalThis.fetch;
  const keluar: KeluarWa[] = [];
  process.env.FONNTE_TOKEN = TOKEN_UJI;
  globalThis.fetch = (async (_url: unknown, init?: { body?: unknown }) => {
    const body = new URLSearchParams(String(init?.body ?? ""));
    keluar.push({
      target: body.get("target") ?? "",
      message: body.get("message") ?? "",
    });
    return new Response(JSON.stringify({ status: true, detail: "queued" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return {
    keluar,
    pulihkan: () => {
      globalThis.fetch = asli;
      delete process.env.FONNTE_TOKEN;
    },
  };
}

async function seedGateway(t: KonteksUji, aktif: boolean): Promise<void> {
  await t.run((ctx) =>
    ctx.db.insert("waSettings", {
      slot: "global",
      apiUrl: "https://api.fonnte.com/send",
      authHeader: "Authorization",
      authPrefix: "",
      fieldNomor: "target",
      fieldPesan: "message",
      aktif,
      templatesWa: {},
    }),
  );
}

/** Nasabah dengan nomor WhatsApp dan kanal notifikasi menyala. */
async function nasabah(t: KonteksUji, email: string) {
  const hasil = await siapkanPengguna(t, email.split("@")[0], {
    email,
    role: "peminjam",
  });
  await t.run((ctx) =>
    ctx.db.patch(hasil.userId, {
      nomorWhatsApp: NOMOR,
      whatsappNotificationEnabled: true,
    }),
  );
  return hasil;
}

async function seedVoucher(
  t: KonteksUji,
  opsi: {
    pemilikId: Id<"users">;
    berlakuSampai: number;
    terpakai?: number;
    batasPemakaian?: number;
    status?: "aktif" | "terpakai" | "dicabut";
    kode?: string;
  },
): Promise<Id<"voucher">> {
  return t.run((ctx) =>
    ctx.db.insert("voucher", {
      kode: opsi.kode ?? "VCR-H3UJI",
      jenis: "diskon_admin",
      judul: "Potongan biaya admin",
      nilai: 25_000,
      minPokok: 100_000,
      batasPemakaian: opsi.batasPemakaian ?? 1,
      terpakai: opsi.terpakai ?? 0,
      pemilikId: opsi.pemilikId,
      sumber: "admin",
      status: opsi.status ?? "aktif",
      berlakuSampai: opsi.berlakuSampai,
      dibuatPada: Date.now() - 20 * 86_400_000,
    }),
  );
}

describe("pengingat WhatsApp voucher H-3", () => {
  it("mengirim sekali untuk voucher yang jatuh tempo dalam tiga hari", async () => {
    vi.useFakeTimers();
    // 27 Oktober 2026, 09.00 WIB — di dalam jendela kirim.
    vi.setSystemTime(new Date("2026-10-27T02:00:00Z"));
    const gateway = pasangGateway();
    try {
      const t = convexTest(schema, modules);
      const { userId } = await nasabah(t, "rani-h3@pindai.test");
      await seedGateway(t, true);
      const voucherId = await seedVoucher(t, {
        pemilikId: userId,
        berlakuSampai: Date.now() + 2 * 86_400_000 + 5 * JAM_MS,
      });

      const hasil = await t.action(internal.pengingatVoucher.jalankanPengingatVoucher, {});
      expect(hasil.terkirim).toBe(1);
      expect(hasil.gagal).toBe(0);

      expect(gateway.keluar).toHaveLength(1);
      expect(gateway.keluar[0]?.target).toBe(NOMOR);
      expect(gateway.keluar[0]?.message).toContain("VCR-H3UJI");
      expect(gateway.keluar[0]?.message).toContain("2 hari lagi");

      const log = await t.run(async (ctx) => {
        const rows = await ctx.db.query("pengingatVoucher").collect();
        return rows;
      });
      expect(log).toHaveLength(1);
      expect(log[0]?.voucherId).toBe(voucherId);
      expect(log[0]?.status).toBe("terkirim");

      // Putaran berikutnya: kandidat sudah difilter oleh log, tidak ada kiriman
      // kedua meskipun vouchernya masih di dalam jendela H-3.
      const kedua = await t.action(internal.pengingatVoucher.jalankanPengingatVoucher, {});
      expect(kedua.terkirim).toBe(0);
      expect(kedua.kandidat).toBe(0);
      expect(gateway.keluar).toHaveLength(1);
    } finally {
      gateway.pulihkan();
      vi.useRealTimers();
    }
  });

  it("gateway yang belum siap tidak menghanguskan pengingat", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-27T02:00:00Z"));
    const gateway = pasangGateway();
    try {
      const t = convexTest(schema, modules);
      const { userId } = await nasabah(t, "rani-gateway@pindai.test");
      await seedGateway(t, false);
      await seedVoucher(t, {
        pemilikId: userId,
        berlakuSampai: Date.now() + 2 * 86_400_000,
      });

      const pertama = await t.action(internal.pengingatVoucher.jalankanPengingatVoucher, {});
      expect(pertama.terkirim).toBe(0);
      expect(pertama.gagal).toBe(1);
      expect(gateway.keluar).toHaveLength(0);

      // Kegagalan infrastruktur tidak dicatat — begitu gateway dinyalakan,
      // voucher yang sama masih bisa diingatkan.
      const log = await t.run(async (ctx) => ctx.db.query("pengingatVoucher").collect());
      expect(log).toHaveLength(0);

      await t.run(async (ctx) => {
        const row = await ctx.db.query("waSettings").first();
        if (row) await ctx.db.patch(row._id, { aktif: true });
      });
      const kedua = await t.action(internal.pengingatVoucher.jalankanPengingatVoucher, {});
      expect(kedua.terkirim).toBe(1);
      expect(gateway.keluar).toHaveLength(1);
    } finally {
      gateway.pulihkan();
      vi.useRealTimers();
    }
  });

  it("melewati voucher yang sudah habis kuota atau sudah lewat masa berlaku", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-27T02:00:00Z"));
    const gateway = pasangGateway();
    try {
      const t = convexTest(schema, modules);
      const { userId } = await nasabah(t, "rani-lewat@pindai.test");
      await seedGateway(t, true);
      // Kuota habis.
      await seedVoucher(t, {
        pemilikId: userId,
        berlakuSampai: Date.now() + 86_400_000,
        terpakai: 1,
        kode: "VCR-HABIS",
      });
      // Sudah lewat masa berlaku.
      await seedVoucher(t, {
        pemilikId: userId,
        berlakuSampai: Date.now() - 86_400_000,
        kode: "VCR-LEWAT",
      });
      // Masih jauh dari jatuh tempo (H-10).
      await seedVoucher(t, {
        pemilikId: userId,
        berlakuSampai: Date.now() + 10 * 86_400_000,
        kode: "VCR-JAUH",
      });

      const hasil = await t.action(internal.pengingatVoucher.jalankanPengingatVoucher, {});
      expect(hasil.kandidat).toBe(0);
      expect(gateway.keluar).toHaveLength(0);
    } finally {
      gateway.pulihkan();
      vi.useRealTimers();
    }
  });

  it("di luar jam kirim tidak mengirim apa pun dan tidak mencatat", async () => {
    vi.useFakeTimers();
    // 23.00 WIB.
    vi.setSystemTime(new Date("2026-10-27T16:00:00Z"));
    const gateway = pasangGateway();
    try {
      const t = convexTest(schema, modules);
      const { userId } = await nasabah(t, "rani-malam@pindai.test");
      await seedGateway(t, true);
      await seedVoucher(t, {
        pemilikId: userId,
        berlakuSampai: Date.now() + 86_400_000,
      });

      const hasil = await t.action(internal.pengingatVoucher.jalankanPengingatVoucher, {});
      expect(hasil.alasan).toBe("luar_jam_kirim");
      expect(gateway.keluar).toHaveLength(0);
      const log = await t.run(async (ctx) => ctx.db.query("pengingatVoucher").collect());
      expect(log).toHaveLength(0);
    } finally {
      gateway.pulihkan();
      vi.useRealTimers();
    }
  });
});
