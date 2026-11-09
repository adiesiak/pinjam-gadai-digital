/**
 * Tes PENGINGAT SIKLUS PENDANA (convex-test + vitest).
 *
 * Yang dijaga:
 *  - hanya pinjaman yang didanai akun `dana` itu sendiri yang masuk digest;
 *  - nomor tujuan dibaca dari `users.nomorWhatsApp` dan dinormalisasi ke 62…;
 *  - beberapa siklus untuk satu pendana menjadi SATU pesan, dan pendana lain
 *    tidak menerima referensi milik orang lain;
 *  - pengingat idempoten per hari walau action dijalankan berkali-kali;
 *  - pendana yang mematikan WhatsApp, atau action di luar 08.00-20.00 WIB,
 *    tidak mengirim apa pun.
 *
 * Fonnte palsu dipasang lewat `globalThis.fetch`, sama seperti tes pengingat
 * tagihan: yang diperiksa adalah pesan yang benar-benar keluar.
 *
 * Menjalankan: bunx vitest run src/convex/pengingatPendana.convex.test.ts
 */
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { siapkanPengguna, type KonteksUji } from "./test.helpers";
import { modules } from "./test.setup";

const HARI_MS = 86_400_000;
const TOKEN_UJI = "token-uji-wa";

type KeluarWa = { target: string; message: string };

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

async function seedGateway(t: KonteksUji): Promise<void> {
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

async function seedPendana(
  t: KonteksUji,
  opsi: { nama: string; email: string; nomor: string; kanalWa?: boolean },
) {
  const hasil = await siapkanPengguna(t, opsi.nama, {
    email: opsi.email,
    role: "dana",
  });
  await t.run((ctx) =>
    ctx.db.patch(hasil.userId, {
      nomorWhatsApp: opsi.nomor,
      whatsappNotificationEnabled: opsi.kanalWa ?? true,
    }),
  );
  return hasil;
}

let urutanRef = 0;

async function seedPinjaman(
  t: KonteksUji,
  opsi: {
    pendanaId: Id<"users">;
    sisaHari: number;
    status?: "didanai" | "lunas";
    referensi?: string;
  },
): Promise<{ loanId: Id<"loans">; referensi: string }> {
  const peminjam = await siapkanPengguna(t, `Peminjam ${++urutanRef}`, {
    email: `peminjam-${urutanRef}@pindai.test`,
    role: "peminjam",
  });
  const now = Date.now();
  const referensi = opsi.referensi ?? `PGD-UJI-${urutanRef}`;
  const loanId = await t.run((ctx) =>
    ctx.db.insert("loans", {
      userId: peminjam.userId,
      pendanaId: opsi.pendanaId,
      pokokPinjaman: 1_000_000,
      tujuan: "Modal usaha",
      namaLengkap: "Peminjam Uji",
      namaBank: "BCA",
      nomorRekening: "1234567890",
      status: opsi.status ?? "didanai",
      nomorReferensi: referensi,
      tenorHari: 30,
      // Siklus pendana = 30 hari sejak pendanaan, terpisah dari tenor pinjaman.
      didanaiPada: now - (30 - opsi.sisaHari) * HARI_MS,
    }),
  );
  return { loanId, referensi };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("pengingat siklus pendana", () => {
  it("mengirim satu digest per pendana, hanya berisi pinjaman miliknya", async () => {
    vi.useFakeTimers();
    // 1 November 2026, 09.00 WIB — di dalam jendela kirim.
    vi.setSystemTime(new Date("2026-11-01T02:00:00Z"));
    const gateway = pasangGateway();
    try {
      const t = convexTest(schema, modules);
      await seedGateway(t);

      const robert = await seedPendana(t, {
        nama: "Robert",
        email: "robert@pindai.test",
        nomor: "081234567890",
      });
      const lain = await seedPendana(t, {
        nama: "Pendana Lain",
        email: "lain@pindai.test",
        nomor: "6287777777777",
      });

      const h3 = await seedPinjaman(t, { pendanaId: robert.userId, sisaHari: 3 });
      const h1 = await seedPinjaman(t, { pendanaId: robert.userId, sisaHari: 1 });
      // Di luar jadwal pengingat, tidak boleh ikut.
      await seedPinjaman(t, { pendanaId: robert.userId, sisaHari: 10 });
      const milikLain = await seedPinjaman(t, { pendanaId: lain.userId, sisaHari: 3 });

      const hasil = await t.action(
        internal.pengingatPendana.jalankanPengingatPendana,
        {},
      );
      expect(hasil.alasan).toBe("jalan");
      expect(hasil.terkirim).toBe(2);
      expect(hasil.jumlahPinjaman).toBe(3);
      expect(gateway.keluar).toHaveLength(2);

      const pesanRobert = gateway.keluar.find(
        (m) => m.target === "6281234567890",
      );
      expect(pesanRobert).toBeDefined();
      expect(pesanRobert?.message).toContain(h3.referensi);
      expect(pesanRobert?.message).toContain(h1.referensi);
      expect(pesanRobert?.message).not.toContain(milikLain.referensi);
      expect(pesanRobert?.message).toContain("3 hari lagi");

      const pesanLain = gateway.keluar.find(
        (m) => m.target === "6287777777777",
      );
      expect(pesanLain?.message).toContain(milikLain.referensi);
      expect(pesanLain?.message).not.toContain(h3.referensi);

      const log = await t.run(async (ctx) =>
        ctx.db.query("waLogs").collect(),
      );
      expect(log).toHaveLength(2);
      expect(log.every((row) => row.status === "terkirim")).toBe(true);
      expect(log.every((row) => row.jenis === "pengingat_pendana_harian")).toBe(true);

      // Putaran kedua pada hari yang sama tidak boleh mengirim ulang.
      const kedua = await t.action(
        internal.pengingatPendana.jalankanPengingatPendana,
        {},
      );
      expect(kedua.terkirim).toBe(0);
      expect(gateway.keluar).toHaveLength(2);
    } finally {
      gateway.pulihkan();
    }
  });

  it("opsi userId hanya mengirim ke pendana yang dipilih", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-01T02:00:00Z"));
    const gateway = pasangGateway();
    try {
      const t = convexTest(schema, modules);
      await seedGateway(t);
      const robert = await seedPendana(t, {
        nama: "Robert",
        email: "robert-target@pindai.test",
        nomor: "081234567890",
      });
      const lain = await seedPendana(t, {
        nama: "Pendana Lain",
        email: "lain-target@pindai.test",
        nomor: "6287777777777",
      });
      await seedPinjaman(t, { pendanaId: robert.userId, sisaHari: 3 });
      await seedPinjaman(t, { pendanaId: lain.userId, sisaHari: 3 });

      const hasil = await t.action(
        internal.pengingatPendana.jalankanPengingatPendana,
        { userId: robert.userId },
      );
      expect(hasil.terkirim).toBe(1);
      expect(gateway.keluar.map((m) => m.target)).toEqual(["6281234567890"]);
    } finally {
      gateway.pulihkan();
    }
  });

  it("menghormati preferensi WhatsApp pendana", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-01T02:00:00Z"));
    const gateway = pasangGateway();
    try {
      const t = convexTest(schema, modules);
      await seedGateway(t);
      const pendana = await seedPendana(t, {
        nama: "Robert",
        email: "robert-mati@pindai.test",
        nomor: "081234567890",
        kanalWa: false,
      });
      await seedPinjaman(t, { pendanaId: pendana.userId, sisaHari: 3 });

      const hasil = await t.action(
        internal.pengingatPendana.jalankanPengingatPendana,
        {},
      );
      expect(hasil.terkirim).toBe(0);
      expect(gateway.keluar).toHaveLength(0);
      const log = await t.run(async (ctx) => ctx.db.query("waLogs").collect());
      expect(log).toHaveLength(0);
    } finally {
      gateway.pulihkan();
    }
  });

  it("tidak mengirim di luar jendela 08.00-20.00 WIB", async () => {
    vi.useFakeTimers();
    // 1 November 2026, 23.00 WIB.
    vi.setSystemTime(new Date("2026-11-01T16:00:00Z"));
    const gateway = pasangGateway();
    try {
      const t = convexTest(schema, modules);
      await seedGateway(t);
      const pendana = await seedPendana(t, {
        nama: "Robert",
        email: "robert-malam@pindai.test",
        nomor: "081234567890",
      });
      await seedPinjaman(t, { pendanaId: pendana.userId, sisaHari: 3 });

      const hasil = await t.action(
        internal.pengingatPendana.jalankanPengingatPendana,
        {},
      );
      expect(hasil.alasan).toBe("luar_jam_kirim");
      expect(hasil.terkirim).toBe(0);
      expect(gateway.keluar).toHaveLength(0);
      const log = await t.run(async (ctx) => ctx.db.query("waLogs").collect());
      expect(log).toHaveLength(0);
    } finally {
      gateway.pulihkan();
    }
  });

  it("melewati pendana tanpa nomor WhatsApp", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-01T02:00:00Z"));
    const gateway = pasangGateway();
    try {
      const t = convexTest(schema, modules);
      await seedGateway(t);
      const pendana = await seedPendana(t, {
        nama: "Robert",
        email: "robert-tanpa-nomor@pindai.test",
        nomor: "081234567890",
      });
      await t.run((ctx) =>
        ctx.db.patch(pendana.userId, { nomorWhatsApp: undefined }),
      );
      await seedPinjaman(t, { pendanaId: pendana.userId, sisaHari: 3 });

      const hasil = await t.action(
        internal.pengingatPendana.jalankanPengingatPendana,
        {},
      );
      expect(hasil.terkirim).toBe(0);
      expect(gateway.keluar).toHaveLength(0);
    } finally {
      gateway.pulihkan();
    }
  });
});
