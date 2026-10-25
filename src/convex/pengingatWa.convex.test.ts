/**
 * Tes integrasi PENGIRIMAN PESAN WHATSAPP OTOMATIS (convex-test + vitest).
 *
 * Yang dijaga berkas ini, lewat action yang sama dengan yang dipakai aplikasi:
 *
 *  - gateway nonaktif / pinjaman sudah lunas: TIDAK ada pesan keluar dan TIDAK
 *    ada baris log palsu ("berhenti otomatis setelah pembayaran tercatat");
 *  - pesan hanya berangkat ke NOMOR PEMINJAM, dan setiap percobaan tercatat di
 *    `waLogs` dengan jenis yang bisa diterjemahkan jadi label ramah;
 *  - template yang diatur admin dipakai apa adanya, sedangkan template tersimpan
 *    yang tidak sah jatuh ke teks bawaan, jadi tidak pernah ada pesan cacat;
 *  - peminjam tanpa nomor WhatsApp tidak dikirimi apa pun, tetapi kejadiannya
 *    tetap tercatat apa adanya.
 *
 * Fonnte dipanggil dari SERVER, jadi tes mengganti `globalThis.fetch` dan
 * membaca pesan yang benar-benar keluar.
 *
 * Menjalankan: bunx vitest run src/convex/pengingatWa.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { buatPengguna, siapkanPengguna, type KonteksUji } from "./test.helpers";
import { modules } from "./test.setup";

const NOMOR_PEMINJAM = "6281234567890";
const TOKEN_UJI = "token-uji-wa";

type KeluarWa = { target: string; message: string };

/** Fonnte palsu yang selalu sukses; selalu dipakai lewat try/finally. */
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
    return new Response(JSON.stringify({ status: true, detail: "success! message in queue" }), {
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

type KeluarJsonWa = { nomor?: string; pesan?: string };

/**
 * Gateway generik palsu (bukan Fonnte): body JSON dengan nama field dari panel,
 * dan token dibaca dari `WHATSAPP_API_KEY`. Dipakai lewat try/finally juga.
 */
function pasangGatewayJson() {
  const asli = globalThis.fetch;
  const keluar: KeluarJsonWa[] = [];
  process.env.WHATSAPP_API_KEY = TOKEN_UJI;
  globalThis.fetch = (async (_url: unknown, init?: { body?: unknown }) => {
    keluar.push(JSON.parse(String(init?.body ?? "{}")) as KeluarJsonWa);
    return new Response(JSON.stringify({ status: true, detail: "queued" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return {
    keluar,
    pulihkan: () => {
      globalThis.fetch = asli;
      delete process.env.WHATSAPP_API_KEY;
    },
  };
}

/** Satu baris pinjaman milik peminjam, dengan umur pendanaan yang ditentukan. */
async function seedPinjaman(
  t: KonteksUji,
  opsi: {
    userId: Id<"users">;
    status: "didanai" | "lunas";
    /** Sisa hari ke jatuh tempo (tenor 30 hari). */
    sisaHari?: number;
    nomorWhatsApp?: string | null;
  },
): Promise<Id<"loans">> {
  const now = Date.now();
  const hari = 30 - (opsi.sisaHari ?? 30);
  return t.run((ctx) =>
    ctx.db.insert("loans", {
      userId: opsi.userId,
      pokokPinjaman: 1_000_000,
      tujuan: "Modal usaha kecil",
      namaLengkap: "Rani Peminjam",
      namaBank: "BCA",
      nomorRekening: "1234567890",
      status: opsi.status,
      nomorReferensi: `PGD-WA-${Math.round(now % 100000)}`,
      tenorHari: 30,
      ...(opsi.nomorWhatsApp === null ? {} : { nomorWhatsApp: opsi.nomorWhatsApp ?? NOMOR_PEMINJAM }),
      ...(opsi.status === "didanai"
        ? { didanaiPada: now - hari * 86_400_000 }
        : {}),
    }),
  );
}

/** Baris konfigurasi gateway untuk slot tunggal. */
async function seedGateway(
  t: KonteksUji,
  opsi: { aktif: boolean; templatesWa?: Record<string, string> },
): Promise<void> {
  await t.run((ctx) =>
    ctx.db.insert("waSettings", {
      slot: "global",
      apiUrl: "https://api.fonnte.com/send",
      authHeader: "Authorization",
      authPrefix: "",
      fieldNomor: "target",
      fieldPesan: "message",
      aktif: opsi.aktif,
      templatesWa: opsi.templatesWa ?? {},
    }),
  );
}

/** Konfigurasi gateway yang sah, siap ditimpa per kasus uji. */
function konfigurasiGerbang(templatesWa: Record<string, string>) {
  return {
    apiUrl: "https://api.fonnte.com/send",
    authHeader: "Authorization",
    authPrefix: "",
    fieldNomor: "target",
    fieldPesan: "message",
    aktif: true,
    templatesWa,
  };
}

describe("saveConfig gerbang template pesan", () => {
  it("template sah tersimpan, dan kolom lama dikosongkan", async () => {
    const t = convexTest(schema, modules);
    const admin = await siapkanPengguna(t, "admin", {
      email: "admin-wa@pindai.test",
      role: "admin",
    });
    await seedGateway(t, { aktif: true, templatesWa: {} });
    // Baris lama berisi template di kolom lawas; sesudah simpan ia harus pindah.
    await t.run(async (ctx) => {
      const row = await ctx.db.query("waSettings").first();
      if (row) await ctx.db.patch(row._id, { templatePengingat: "Halo {nama} {jumlah}" });
    });

    await admin.sesi.mutation(
      api.whatsapp.saveConfig,
      konfigurasiGerbang({ pengingat_h3: "Halo {nama}, jatuh tempo {jatuh_tempo}, total {jumlah}." }),
    );

    const tersimpan = await t.run(async (ctx) => ctx.db.query("waSettings").first());
    expect(tersimpan?.templatesWa?.pengingat_h3).toBe(
      "Halo {nama}, jatuh tempo {jatuh_tempo}, total {jumlah}.",
    );
    expect(tersimpan?.templatePengingat).toBeUndefined();
    expect(tersimpan?.templateStatus).toBeUndefined();
    expect(tersimpan?.templateLokasi).toBeUndefined();
  });

  it("template tanpa placeholder wajib ditolak dengan alasan yang bisa dibaca", async () => {
    const t = convexTest(schema, modules);
    const admin = await siapkanPengguna(t, "admin", {
      email: "admin-wa2@pindai.test",
      role: "admin",
    });
    await seedGateway(t, { aktif: true });
    await expect(
      admin.sesi.mutation(
        api.whatsapp.saveConfig,
        konfigurasiGerbang({ pengingat_h3: "Halo {nama}, jangan lupa besok." }),
      ),
    ).rejects.toThrow(/Pengingat H-3 tidak bisa disimpan/);
    const tersimpan = await t.run(async (ctx) => ctx.db.query("waSettings").first());
    expect(tersimpan?.templatesWa?.pengingat_h3).toBeUndefined();
  });

  it("jenis di luar katalog ditolak", async () => {
    const t = convexTest(schema, modules);
    const admin = await siapkanPengguna(t, "admin", {
      email: "admin-wa3@pindai.test",
      role: "admin",
    });
    await seedGateway(t, { aktif: true });
    await expect(
      admin.sesi.mutation(api.whatsapp.saveConfig, konfigurasiGerbang({ entah: "Halo {nama}" })),
    ).rejects.toThrow(/Jenis template "entah" tidak dikenal/);
  });

  it("peta kosong tetap bisa disimpan dan berarti semua memakai bawaan", async () => {
    const t = convexTest(schema, modules);
    const admin = await siapkanPengguna(t, "admin", {
      email: "admin-wa4@pindai.test",
      role: "admin",
    });
    await seedGateway(t, { aktif: true });
    await admin.sesi.mutation(api.whatsapp.saveConfig, konfigurasiGerbang({}));
    const bawaan = await admin.sesi.query(api.whatsapp.getAdminConfig, {});
    expect(bawaan.config.templatesWa).toEqual({});
    expect(bawaan.config.aktif).toBe(true);
  });

  it("endpoint Fonnte: nama field tersimpan dipaksa target/message", async () => {
    const t = convexTest(schema, modules);
    const admin = await siapkanPengguna(t, "admin", {
      email: "admin-wa5@pindai.test",
      role: "admin",
    });
    await seedGateway(t, { aktif: true });
    await admin.sesi.mutation(api.whatsapp.saveConfig, {
      ...konfigurasiGerbang({}),
      fieldNomor: "customer",
      fieldPesan: "pesan",
    });
    const tersimpan = await t.run(async (ctx) => ctx.db.query("waSettings").first());
    expect(tersimpan?.fieldNomor).toBe("target");
    expect(tersimpan?.fieldPesan).toBe("message");
  });
});

describe("pengingat WhatsApp otomatis", () => {
  it("gateway nonaktif: tidak ada pesan keluar dan tidak ada log", async () => {
    // Jam dikunci di dalam jendela kirim supaya hasilnya tidak bergantung pada
    // jam saat tes dijalankan: yang diuji keadaan gateway, bukan jam.
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 10, 1, 3, 0, 0));
    const t = convexTest(schema, modules);
    const { userId } = await buatPengguna(t, "rani", { email: "rani@pindai.test", role: "peminjam" });
    await seedPinjaman(t, { userId, status: "didanai", sisaHari: 3 });
    await seedGateway(t, { aktif: false });
    const gateway = pasangGateway();
    try {
      const hasil = await t.action(internal.whatsapp.jalankanPengingatJatuhTempo, {});
      expect(hasil.alasan).toBe("nonaktif");
      expect(gateway.keluar).toHaveLength(0);
      expect(await t.run((ctx) => ctx.db.query("waLogs").collect())).toHaveLength(0);
    } finally {
      gateway.pulihkan();
      vi.useRealTimers();
    }
  });

  it("pinjaman yang pembayarannya sudah tercatat tidak lagi dikirimi pengingat", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await buatPengguna(t, "rani", { email: "rani2@pindai.test", role: "peminjam" });
    await seedPinjaman(t, { userId, status: "lunas", sisaHari: 3 });
    await seedGateway(t, { aktif: true });
    const gateway = pasangGateway();
    try {
      const hasil = await t.action(internal.whatsapp.jalankanPengingatJatuhTempo, {});
      // Di luar jendela kirim penjadwal berhenti lebih awal; di dalam jendela
      // tidak ada satu pun kandidat. Dua-duanya berakhir tanpa pesan.
      expect(["luar_jam_kirim", "jalan"]).toContain(hasil.alasan);
      expect(hasil.jumlahRencana).toBe(0);
      expect(gateway.keluar).toHaveLength(0);
      expect(await t.run((ctx) => ctx.db.query("waLogs").collect())).toHaveLength(0);
    } finally {
      gateway.pulihkan();
    }
  });

  it("konfirmasi pembayaran: ke nomor peminjam, memakai teks bawaan, tercatat ramah", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await buatPengguna(t, "rani", { email: "rani3@pindai.test", role: "peminjam" });
    const loanId = await seedPinjaman(t, { userId, status: "didanai", sisaHari: 10 });
    await seedGateway(t, { aktif: true });
    const gateway = pasangGateway();
    try {
      const hasil = await t.action(internal.whatsapp._kirimKonfirmasiPembayaran, {
        loanId,
        jumlah: 500_000,
      });
      expect(hasil.status).toBe("terkirim");
      expect(gateway.keluar).toHaveLength(1);
      expect(gateway.keluar[0].target).toBe(NOMOR_PEMINJAM);
      expect(gateway.keluar[0].message).toContain("sudah kami catat");
      expect(gateway.keluar[0].message).toContain("Rp 500.000");
      expect(gateway.keluar[0].message).toContain("RANI PEMINJAM");

      const logs = await t.run((ctx) => ctx.db.query("waLogs").collect());
      expect(logs).toHaveLength(1);
      expect(logs[0].jenis).toBe("konfirmasi_pembayaran");
      expect(logs[0].status).toBe("terkirim");
      expect(logs[0].nomorTujuan).toBe(NOMOR_PEMINJAM);
      expect(logs[0].loanId).toBe(loanId);
    } finally {
      gateway.pulihkan();
    }
  });

  it("template yang diatur admin dipakai apa adanya", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await buatPengguna(t, "rani", { email: "rani4@pindai.test", role: "peminjam" });
    const loanId = await seedPinjaman(t, { userId, status: "didanai", sisaHari: 10 });
    await seedGateway(t, {
      aktif: true,
      templatesWa: { konfirmasi_pembayaran: "Halo {nama}, catatan {ref}: {jumlah} diterima." },
    });
    const gateway = pasangGateway();
    try {
      const pinjaman = await t.run((ctx) => ctx.db.get(loanId));
      await t.action(internal.whatsapp._kirimKonfirmasiPembayaran, { loanId, jumlah: 250_000 });
      expect(gateway.keluar[0].message).toBe(
        `Halo RANI PEMINJAM, catatan ${pinjaman?.nomorReferensi}: Rp 250.000 diterima.`,
      );
    } finally {
      gateway.pulihkan();
    }
  });

  it("template tersimpan yang tidak sah jatuh ke teks bawaan, bukan dikirim cacat", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await buatPengguna(t, "rani", { email: "rani5@pindai.test", role: "peminjam" });
    const loanId = await seedPinjaman(t, { userId, status: "didanai", sisaHari: 10 });
    // Template ini kehilangan placeholder wajibnya ({nama} & {jumlah}).
    await seedGateway(t, {
      aktif: true,
      templatesWa: { konfirmasi_pembayaran: "Pembayaran Anda sudah dicatat." },
    });
    const gateway = pasangGateway();
    try {
      await t.action(internal.whatsapp._kirimKonfirmasiPembayaran, { loanId, jumlah: 500_000 });
      expect(gateway.keluar[0].message).toContain("sudah kami catat");
      expect(gateway.keluar[0].message).not.toContain("Pembayaran Anda sudah dicatat.");
    } finally {
      gateway.pulihkan();
    }
  });

  it("peminjam tanpa nomor WhatsApp tidak dikirimi apa pun, tetapi tercatat", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await buatPengguna(t, "rani", { email: "rani6@pindai.test", role: "peminjam" });
    const loanId = await seedPinjaman(t, { userId, status: "didanai", sisaHari: 10, nomorWhatsApp: null });
    await seedGateway(t, { aktif: true });
    const gateway = pasangGateway();
    try {
      const hasil = await t.action(internal.whatsapp._kirimKonfirmasiPembayaran, {
        loanId,
        jumlah: 500_000,
      });
      expect(hasil.status).toBe("tanpa_nomor");
      expect(gateway.keluar).toHaveLength(0);
      const logs = await t.run((ctx) => ctx.db.query("waLogs").collect());
      expect(logs).toHaveLength(1);
      expect(logs[0].status).toBe("tanpa_nomor");
      expect(logs[0].nomorTujuan).toBe("-");
      expect(logs[0].jenis).toBe("konfirmasi_pembayaran");
    } finally {
      gateway.pulihkan();
    }
  });

  it("pinjaman yang diperpanjang ditagih dari periode berjalan, termasuk denda", async () => {
    // 1 November 2026, 10.00 WIB — di dalam jendela kirim.
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 10, 1, 3, 0, 0));
    const t = convexTest(schema, modules);
    const { userId } = await buatPengguna(t, "syahril", {
      email: "syahril@pindai.test",
      role: "peminjam",
    });
    const now = Date.now();
    const DAY = 86_400_000;
    await t.run((ctx) =>
      ctx.db.insert("loans", {
        userId,
        pokokPinjaman: 1_000_000,
        tujuan: "Modal usaha",
        namaLengkap: "SYAHRIL FIRMANSYAH",
        namaBank: "BNI",
        nomorRekening: "1234567890",
        status: "didanai",
        nomorReferensi: "PGD-UJI-PERPANJANG",
        tenorHari: 28,
        nomorWhatsApp: NOMOR_PEMINJAM,
        didanaiPada: now - 40 * DAY,
        // Periode berjalan: sisa pokok 600.000, bunga 85.000, jatuh tempo
        // 8 hari lalu. Tagihan = 685.000 + denda 96.000 = 781.000.
        remainingPrincipal: 600_000,
        currentTierRate: 20,
        nextDueDate: now - 8 * DAY,
        nextInterestAmount: 85_000,
      }),
    );
    await seedGateway(t, { aktif: true });
    const gateway = pasangGateway();
    try {
      const hasil = await t.action(internal.whatsapp.jalankanPengingatJatuhTempo, {});
      expect(hasil.alasan).toBe("jalan");
      expect(gateway.keluar).toHaveLength(1);
      // Tanpa state perpanjangan, pesan jatuh ke tenor awal dan kehilangan denda.
      expect(gateway.keluar[0].message).toContain("Rp 781.000");
      expect(gateway.keluar[0].message).toContain("denda Rp 96.000");
    } finally {
      gateway.pulihkan();
      vi.useRealTimers();
    }
  });

  it("endpoint Fonnte memakai target/message walau panel menyimpan nama lain", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await buatPengguna(t, "rani", { email: "rani7@pindai.test", role: "peminjam" });
    const loanId = await seedPinjaman(t, { userId, status: "didanai", sisaHari: 10 });
    await seedGateway(t, { aktif: true });
    // Meniru konfigurasi yang tersimpan salah isi: panel menulis `customer`,
    // sedangkan API Fonnte hanya mengenal `target`.
    await t.run(async (ctx) => {
      const row = await ctx.db.query("waSettings").first();
      if (row) await ctx.db.patch(row._id, { fieldNomor: "customer", fieldPesan: "pesan" });
    });
    const gateway = pasangGateway();
    try {
      const hasil = await t.action(internal.whatsapp._kirimKonfirmasiPembayaran, {
        loanId,
        jumlah: 500_000,
      });
      expect(hasil.status).toBe("terkirim");
      expect(gateway.keluar).toHaveLength(1);
      expect(gateway.keluar[0].target).toBe(NOMOR_PEMINJAM);
      expect(gateway.keluar[0].message).toContain("Rp 500.000");
    } finally {
      gateway.pulihkan();
    }
  });

  it("gateway generik tetap memakai nama field dari panel", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await buatPengguna(t, "rani", { email: "rani8@pindai.test", role: "peminjam" });
    const loanId = await seedPinjaman(t, { userId, status: "didanai", sisaHari: 10 });
    await seedGateway(t, { aktif: true });
    await t.run(async (ctx) => {
      const row = await ctx.db.query("waSettings").first();
      if (row)
        await ctx.db.patch(row._id, {
          apiUrl: "https://api.example.com/send",
          fieldNomor: "nomor",
          fieldPesan: "pesan",
        });
    });
    const gateway = pasangGatewayJson();
    try {
      const hasil = await t.action(internal.whatsapp._kirimKonfirmasiPembayaran, {
        loanId,
        jumlah: 500_000,
      });
      expect(hasil.status).toBe("terkirim");
      expect(gateway.keluar).toHaveLength(1);
      expect(gateway.keluar[0].nomor).toBe(NOMOR_PEMINJAM);
      expect(gateway.keluar[0].pesan).toContain("Rp 500.000");
    } finally {
      gateway.pulihkan();
    }
  });
});
