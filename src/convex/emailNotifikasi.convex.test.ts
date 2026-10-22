/**
 * Tes pengiriman email pengingat (`emailNotifikasi.kirimPengingat`).
 *
 * Gateway diganti `globalThis.fetch`, jadi yang diperiksa adalah permintaan yang
 * BENAR-BENAR keluar: alamat tujuan, subjek, dan isi. Yang dijaga:
 *  - email hanya ke alamat akun pemilik, dan hanya bila kanal email aktif;
 *  - satu pengingat tidak dikirim dua kali (cron berjalan tiap jam);
 *  - tanpa kunci gateway, statusnya dicatat jujur dan tidak dicoba berulang;
 *  - akun tanpa email tidak dikirimi apa pun.
 *
 * Menjalankan: bunx vitest run src/convex/emailNotifikasi.convex.test.ts
 */
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it } from "vitest";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { buatPengguna } from "./test.helpers";
import { modules } from "./test.setup";

type KirimanEmail = {
  url: string;
  otorisasi: string;
  to: string;
  subject: string;
  text: string;
  redirect: string;
};

const ASLI_KEY = process.env.VLY_INTEGRATION_KEY;
const ASLI_BASE = process.env.VLY_INTEGRATION_BASE_URL;

/** Gateway email palsu yang selalu sukses; selalu dipulihkan lewat afterEach. */
function pasangGatewayEmail() {
  const asli = globalThis.fetch;
  const keluar: KirimanEmail[] = [];
  process.env.VLY_INTEGRATION_KEY = "kunci-email-uji";
  process.env.VLY_INTEGRATION_BASE_URL = "https://email.uji/";
  globalThis.fetch = (async (
    url: unknown,
    init?: { body?: unknown; headers?: unknown; redirect?: string },
  ) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      to?: string;
      subject?: string;
      text?: string;
    };
    keluar.push({
      url: String(url),
      otorisasi: headers.Authorization ?? "",
      to: body.to ?? "",
      subject: body.subject ?? "",
      text: body.text ?? "",
      redirect: init?.redirect ?? "",
    });
    return new Response(
      JSON.stringify({ success: true, data: { status: "sent" } }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }) as unknown as typeof fetch;
  return {
    keluar,
    pulihkan: () => {
      globalThis.fetch = asli;
    },
  };
}

afterEach(() => {
  if (ASLI_KEY === undefined) delete process.env.VLY_INTEGRATION_KEY;
  else process.env.VLY_INTEGRATION_KEY = ASLI_KEY;
  if (ASLI_BASE === undefined) delete process.env.VLY_INTEGRATION_BASE_URL;
  else process.env.VLY_INTEGRATION_BASE_URL = ASLI_BASE;
});

const PESAN =
  "Halo Rani, angsuran ke-2 pinjaman PND-1 jatuh tempo HARI INI (3 November 2026). Tagihan Rp550.000.";

function argumen(userId: Id<"users">) {
  return {
    userId,
    kunci: "angsuran:uji:1767225600000:hari_h",
    jenis: "pengingat_angsuran",
    judul: "Pengingat angsuran ke-2 pinjaman PND-1",
    isi: PESAN,
  };
}

describe("email pengingat", () => {
  it("mengirim ke alamat akun dengan subjek dan isi yang jujur", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await buatPengguna(t, "Rani Email", {
      email: "rani-email@pindai.test",
    });
    const gateway = pasangGatewayEmail();
    try {
      const hasil = await t.action(
        internal.emailNotifikasi.kirimPengingat,
        argumen(userId),
      );
      expect(hasil.status).toBe("terkirim");
      expect(gateway.keluar).toHaveLength(1);
      const kiriman = gateway.keluar[0];
      expect(kiriman.url).toBe("https://email.uji/v1/email/send");
      expect(kiriman.otorisasi).toBe("Bearer kunci-email-uji");
      expect(kiriman.redirect).toBe("error");
      expect(kiriman.to).toBe("rani-email@pindai.test");
      expect(kiriman.subject).toBe(
        "PINDAI · Pengingat angsuran ke-2 pinjaman PND-1",
      );
      expect(kiriman.text).toContain(PESAN);
      expect(kiriman.text).toContain("diatur tim PINDAI");

      const log = await t.run((ctx) =>
        ctx.db.query("emailNotifikasiLog").collect(),
      );
      expect(log).toHaveLength(1);
      expect(log[0]).toMatchObject({
        userId,
        kunci: argumen(userId).kunci,
        ke: "rani-email@pindai.test",
        status: "terkirim",
        percobaan: 1,
      });
    } finally {
      gateway.pulihkan();
    }
  });

  it("tidak mengirim pengingat yang sama dua kali", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await buatPengguna(t, "Rani Ganda", {
      email: "rani-ganda@pindai.test",
    });
    const gateway = pasangGatewayEmail();
    try {
      expect(
        (
          await t.action(
            internal.emailNotifikasi.kirimPengingat,
            argumen(userId),
          )
        ).status,
      ).toBe("terkirim");
      expect(
        (
          await t.action(
            internal.emailNotifikasi.kirimPengingat,
            argumen(userId),
          )
        ).status,
      ).toBe("sudah_selesai");
      expect(gateway.keluar).toHaveLength(1);
    } finally {
      gateway.pulihkan();
    }
  });

  it("menghormati sakelar email global yang dimatikan admin", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await buatPengguna(t, "Rani Mati", {
      email: "rani-mati@pindai.test",
    });
    await t.run((ctx) =>
      ctx.db.insert("systemConfig", {
        slot: "global",
        notifEmailAktif: false,
        diperbaruiPada: Date.now(),
      }),
    );
    const gateway = pasangGatewayEmail();
    try {
      const hasil = await t.action(
        internal.emailNotifikasi.kirimPengingat,
        argumen(userId),
      );
      expect(hasil.status).toBe("dimatikan");
      expect(gateway.keluar).toHaveLength(0);
      const log = await t.run((ctx) =>
        ctx.db.query("emailNotifikasiLog").collect(),
      );
      expect(log).toHaveLength(0);
    } finally {
      gateway.pulihkan();
    }
  });

  it("tanpa kunci gateway: dicatat, tidak dikirim, dan tidak dicoba ulang", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await buatPengguna(t, "Rani Tanpa Kunci", {
      email: "rani-tanpa-kunci@pindai.test",
    });
    const gateway = pasangGatewayEmail();
    delete process.env.VLY_INTEGRATION_KEY;
    try {
      const hasil = await t.action(
        internal.emailNotifikasi.kirimPengingat,
        argumen(userId),
      );
      expect(hasil.status).toBe("tanpa_konfigurasi");
      expect(gateway.keluar).toHaveLength(0);
      const log = await t.run((ctx) =>
        ctx.db.query("emailNotifikasiLog").collect(),
      );
      expect(log).toHaveLength(1);
      expect(log[0].status).toBe("tanpa_konfigurasi");

      expect(
        (
          await t.action(
            internal.emailNotifikasi.kirimPengingat,
            argumen(userId),
          )
        ).status,
      ).toBe("sudah_selesai");
      expect(gateway.keluar).toHaveLength(0);
    } finally {
      gateway.pulihkan();
    }
  });

  it("override email nasabah yang dimatikan menahan pengiriman", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await buatPengguna(t, "Rani Override Email", {
      email: "rani-override-email@pindai.test",
    });
    await t.run((ctx) => ctx.db.patch(userId, { notifEmail: false }));
    const gateway = pasangGatewayEmail();
    try {
      const hasil = await t.action(
        internal.emailNotifikasi.kirimPengingat,
        argumen(userId),
      );
      expect(hasil.status).toBe("dimatikan");
      expect(gateway.keluar).toHaveLength(0);
      expect(
        await t.run((ctx) => ctx.db.query("emailNotifikasiLog").collect()),
      ).toHaveLength(0);
    } finally {
      gateway.pulihkan();
    }
  });

  it("akun tanpa email tidak dikirimi apa pun", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await buatPengguna(t, "Rani Tanpa Email");
    const gateway = pasangGatewayEmail();
    try {
      const hasil = await t.action(
        internal.emailNotifikasi.kirimPengingat,
        argumen(userId),
      );
      expect(hasil.status).toBe("tanpa_email");
      expect(gateway.keluar).toHaveLength(0);
    } finally {
      gateway.pulihkan();
    }
  });
});
