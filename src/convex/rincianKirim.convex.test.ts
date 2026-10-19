/**
 * Uji KIRIMAN RINCIAN OTOMATIS lewat gateway (convex-test + vitest).
 *
 * Dua janji yang dijaga:
 *  1. menandai pinjaman tersalurkan mengirim rincian PDF ke WhatsApp peminjam
 *     tanpa klik admin, dan kejadiannya tercatat sebagai kiriman otomatis;
 *  2. bila nomor WhatsApp belum ada, email akun dipakai sebagai cadangan.
 *
 * Fonnte dipanggil dari server, jadi tes mengganti `globalThis.fetch` dan
 * membaca permintaan yang benar-benar keluar.
 *
 * Menjalankan: bunx vitest run src/convex/rincianKirim.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";
import { siapkanPengguna, type KonteksUji } from "./test.helpers";
import { modules } from "./test.setup";

const NOMOR_UJI = "628123456789";

type KeluarGateway = {
  target: string;
  message: string;
  /** Nama berkas lampiran; kosong untuk pesan teks biasa. */
  filename: string;
};

/** Fonnte palsu yang selalu sukses; selalu dipulihkan lewat try/finally. */
function pasangGatewayWa() {
  const asli = globalThis.fetch;
  const keluar: KeluarGateway[] = [];
  process.env.FONNTE_TOKEN = "token-uji-rincian";
  globalThis.fetch = (async (_url: unknown, init?: { body?: unknown }) => {
    const body = new URLSearchParams(String(init?.body ?? ""));
    keluar.push({
      target: body.get("target") ?? "",
      message: body.get("message") ?? "",
      filename: body.get("filename") ?? "",
    });
    return new Response(JSON.stringify({ status: true, detail: "success! message in queue" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return {
    /** Permintaan yang membawa lampiran rincian, bukan pesan status. */
    lampiran: () => keluar.filter((k) => k.filename !== ""),
    pulihkan: () => {
      globalThis.fetch = asli;
      delete process.env.FONNTE_TOKEN;
    },
  };
}

/** Baris konfigurasi gateway WhatsApp aktif. */
async function seedGatewayWa(t: KonteksUji): Promise<void> {
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
}

describe("kiriman rincian otomatis", () => {
  it("pinjaman yang ditandai tersalurkan mengirim rincian ke WhatsApp peminjam", async () => {
    vi.useFakeTimers();
    const gateway = pasangGatewayWa();
    try {
      const t = convexTest(schema, modules);
      const rani = await siapkanPengguna(t, "Rani Peminjam", {
        email: "rani@pindai.test",
        role: "peminjam",
      });
      const admin = await siapkanPengguna(t, "Super Admin", {
        email: "admin@pindai.test",
        role: "admin",
      });
      await seedGatewayWa(t);
      const loanId = await t.run((ctx) =>
        ctx.db.insert("loans", {
          userId: rani.userId,
          pokokPinjaman: 500_000,
          tujuan: "Modal usaha",
          namaLengkap: "Rani Peminjam",
          nomorRekening: "1234567890",
          nomorWhatsApp: NOMOR_UJI,
          status: "disetujui",
          nomorReferensi: "PNJ-OTOMATIS",
          tenorHari: 30,
          pendanaNama: "DANA TETAP",
        }),
      );

      await admin.sesi.mutation(api.loans.ubahStatusPinjaman, { loanId, status: "didanai" });
      // Pengiriman berjalan di penjadwal, bukan di dalam transaksi status.
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      const kiriman = gateway.lampiran();
      expect(kiriman).toHaveLength(1);
      expect(kiriman[0].target).toBe(NOMOR_UJI);
      expect(kiriman[0].filename).toBe("rincian-pinjaman-PNJ-OTOMATIS.pdf");
      expect(kiriman[0].message).toContain("PNJ-OTOMATIS");

      const log = await t.run((ctx) => ctx.db.query("rincianKirimLog").collect());
      expect(log).toHaveLength(1);
      expect(log[0].otomatis).toBe(true);
      expect(log[0].kanal).toBe("whatsapp");
      expect(log[0].status).toBe("terkirim");
      expect(log[0].tujuan).toBe(NOMOR_UJI);
      expect(log[0].olehUserId).toBe(admin.userId);
    } finally {
      gateway.pulihkan();
      vi.useRealTimers();
    }
  });

  it("tanpa nomor WhatsApp, email dipakai sebagai cadangan", async () => {
    const simpanKey = process.env.VLY_INTEGRATION_KEY;
    delete process.env.VLY_INTEGRATION_KEY;
    const gateway = pasangGatewayWa();
    try {
      const t = convexTest(schema, modules);
      const rani = await siapkanPengguna(t, "Rani Peminjam", {
        email: "rani@pindai.test",
        role: "peminjam",
      });
      const admin = await siapkanPengguna(t, "Super Admin", {
        email: "admin@pindai.test",
        role: "admin",
      });
      const loanId = await t.run((ctx) =>
        ctx.db.insert("loans", {
          userId: rani.userId,
          pokokPinjaman: 500_000,
          tujuan: "Modal usaha",
          namaLengkap: "Rani Peminjam",
          nomorRekening: "1234567890",
          status: "didanai",
          nomorReferensi: "PNJ-OTOMATIS-EMAIL",
          tenorHari: 30,
          didanaiPada: Date.now() - 86_400_000,
        }),
      );

      const hasil = await t.action(internal.rincianKirim.kirimRincianOtomatis, {
        loanId,
        olehUserId: admin.userId,
      });

      expect(hasil.ok).toBe(false);
      expect(hasil.kanal).toBeNull();
      expect(gateway.lampiran()).toHaveLength(0);

      const log = await t.run((ctx) => ctx.db.query("rincianKirimLog").collect());
      expect(log).toHaveLength(1);
      expect(log[0].kanal).toBe("email");
      expect(log[0].tujuan).toBe("rani@pindai.test");
      expect(log[0].otomatis).toBe(true);
      expect(log[0].status).toBe("gagal");
    } finally {
      gateway.pulihkan();
      if (simpanKey !== undefined) process.env.VLY_INTEGRATION_KEY = simpanKey;
    }
  });
});
