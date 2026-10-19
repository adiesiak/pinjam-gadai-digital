/**
 * Tes integrasi sakelar WhatsApp pada cron pengingat ANGSURAN.
 *
 * Yang dijaga: saat ADMIN mematikan WhatsApp di Pengaturan Sistem, tidak ada
 * satu pun pesan keluar — tetapi baris pengingat tetap dibuat supaya pusat
 * notifikasi in-app tidak ikut hilang. Saat sakelar dinyalakan kembali pada hari
 * yang sama, pengingat yang belum terkirim berangkat sekali.
 *
 * Gateway diganti `globalThis.fetch`, jadi yang diperiksa adalah permintaan
 * yang benar-benar keluar, bukan nilai balik fungsi.
 *
 * Menjalankan: bunx vitest run src/convex/pengingatPreferensi.convex.test.ts
 */
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { buatPengguna } from "./test.helpers";
import { modules } from "./test.setup";

/** 10.00 WIB — di dalam jendela kirim 08.00–20.00. */
const PAGI = Date.UTC(2026, 10, 1, 3, 0, 0);
const NOMOR = "628123450009";

const ASLI_KEY = process.env.VLY_INTEGRATION_KEY;
const ASLI_TOKEN = process.env.FONNTE_TOKEN;

afterEach(() => {
  vi.useRealTimers();
  if (ASLI_KEY === undefined) delete process.env.VLY_INTEGRATION_KEY;
  else process.env.VLY_INTEGRATION_KEY = ASLI_KEY;
  if (ASLI_TOKEN === undefined) delete process.env.FONNTE_TOKEN;
  else process.env.FONNTE_TOKEN = ASLI_TOKEN;
});

function pasangGateway() {
  const asli = globalThis.fetch;
  const keluar: string[] = [];
  process.env.FONNTE_TOKEN = "token-uji-pengingat";
  // Email tidak ikut diuji di sini; tanpa kunci gateway email, aksinya mencatat
  // "tanpa_konfigurasi" tanpa melakukan fetch.
  delete process.env.VLY_INTEGRATION_KEY;
  globalThis.fetch = (async (_url: unknown, init?: { body?: unknown }) => {
    const body = new URLSearchParams(String(init?.body ?? ""));
    keluar.push(body.get("message") ?? "");
    return new Response(JSON.stringify({ status: true, detail: "queued" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return {
    keluar,
    pulihkan: () => {
      globalThis.fetch = asli;
    },
  };
}

async function seedPengingatHariIni(t: ReturnType<typeof convexTest>, userId: Id<"users">) {
  const loanId = await t.run((ctx) =>
    ctx.db.insert("loans", {
      userId,
      pokokPinjaman: 1_000_000,
      tujuan: "Modal usaha",
      namaLengkap: "RANI PENGINGAT",
      nomorRekening: "1234567890",
      status: "didanai",
      nomorReferensi: "PND-ANG-1",
      tenorHari: 30,
      nomorWhatsApp: NOMOR,
    }),
  );
  const angsuranId = await t.run((ctx) =>
    ctx.db.insert("angsuran", {
      userId,
      loanId,
      nomor: 1,
      // Tiga hari lagi (2,96 hari → dibulatkan 3 oleh sisaHariAngsuran).
      jatuhTempoPada: PAGI + 3 * 86_400_000 - 3_600_000,
      pokok: 500_000,
      bunga: 50_000,
      biayaAdmin: 0,
      total: 550_000,
      status: "belum_dibayar",
    }),
  );
  await t.run((ctx) =>
    ctx.db.insert("waSettings", {
      slot: "global",
      apiUrl: "https://api.fonnte.com/send",
      authHeader: "Authorization",
      authPrefix: "",
      fieldNomor: "target",
      fieldPesan: "message",
      aktif: true,
      templatesWa: {},
    }),
  );
  return { loanId, angsuranId };
}

describe("sakelar WhatsApp pada pengingat angsuran", () => {
  it("mati: tidak ada pesan keluar, baris in-app tetap dibuat", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(PAGI);
    const t = convexTest(schema, modules);
    const { userId } = await buatPengguna(t, "Rani Mati", {
      email: "rani-mati-angsuran@pindai.test",
    });
    await t.run((ctx) =>
      ctx.db.insert("systemConfig", {
        slot: "global",
        notifWhatsappAktif: false,
        diperbaruiPada: Date.now(),
      }),
    );
    await seedPengingatHariIni(t, userId);
    const gateway = pasangGateway();
    try {
      const hasil = await t.action(
        internal.angsuranPengingat.jalankanPengingatAngsuran,
        {},
      );
      expect(hasil.dikirim).toBe(0);
      expect(gateway.keluar).toHaveLength(0);

      const baris = await t.run((ctx) => ctx.db.query("pengingatAngsuran").collect());
      expect(baris).toHaveLength(1);
      expect(baris[0]).toMatchObject({ userId, jenis: "h_minus_3", percobaan: 0 });
      expect(baris[0].waStatus).toBeUndefined();
    } finally {
      gateway.pulihkan();
    }
  });

  it("override nasabah mati: tidak ada pesan walau global menyala", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(PAGI);
    const t = convexTest(schema, modules);
    const { userId } = await buatPengguna(t, "Rani Override", {
      email: "rani-override-angsuran@pindai.test",
    });
    // Tidak ada baris systemConfig = sakelar global bawaan aktif.
    await t.run((ctx) => ctx.db.patch(userId, { notifWhatsapp: false }));
    await seedPengingatHariIni(t, userId);
    const gateway = pasangGateway();
    try {
      const hasil = await t.action(
        internal.angsuranPengingat.jalankanPengingatAngsuran,
        {},
      );
      expect(hasil.dikirim).toBe(0);
      expect(gateway.keluar).toHaveLength(0);
      const baris = await t.run((ctx) => ctx.db.query("pengingatAngsuran").collect());
      expect(baris).toHaveLength(1);
      expect(baris[0].waStatus).toBeUndefined();
    } finally {
      gateway.pulihkan();
    }
  });

  it("dinyalakan kembali: pengingat yang belum terkirim berangkat sekali", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(PAGI);
    const t = convexTest(schema, modules);
    const { userId } = await buatPengguna(t, "Rani Nyala", {
      email: "rani-nyala-angsuran@pindai.test",
    });
    await t.run((ctx) =>
      ctx.db.insert("systemConfig", {
        slot: "global",
        notifWhatsappAktif: false,
        diperbaruiPada: Date.now(),
      }),
    );
    await seedPengingatHariIni(t, userId);
    const gateway = pasangGateway();
    try {
      await t.action(internal.angsuranPengingat.jalankanPengingatAngsuran, {});
      expect(gateway.keluar).toHaveLength(0);

      await t.run(async (ctx) => {
        const cfg = await ctx.db
          .query("systemConfig")
          .withIndex("by_slot", (q) => q.eq("slot", "global"))
          .first();
        if (cfg !== null) await ctx.db.patch(cfg._id, { notifWhatsappAktif: true });
      });
      const hasil = await t.action(
        internal.angsuranPengingat.jalankanPengingatAngsuran,
        {},
      );
      expect(hasil.dikirim).toBe(1);
      expect(gateway.keluar).toHaveLength(1);
      expect(gateway.keluar[0]).toContain("RANI PENGINGAT");

      const baris = await t.run((ctx) => ctx.db.query("pengingatAngsuran").collect());
      expect(baris).toHaveLength(1);
      expect(baris[0].waStatus).toBe("terkirim");
      expect(baris[0].percobaan).toBe(1);
    } finally {
      gateway.pulihkan();
    }
  });
});
