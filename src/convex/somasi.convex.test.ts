/**
 * Uji SURAT SOMASI (convex-test + vitest).
 *
 * Yang dijaga:
 *  - hanya admin ber-TOTP yang dapat membaca, mengunduh, dan mengirim;
 *  - surat baru tersedia setelah H+3, dan ditahan saat ada janji bayar aktif
 *    atau pengaduan yang belum selesai;
 *  - unduhan pertama membekukan snapshot, unduhan berikutnya identik;
 *  - pengiriman hanya di dalam jam kontak, dengan jeda, dan menandai surat
 *    sudah diserahkan;
 *  - pemindaian audit mencatat penerbitan, unduhan, dan penyerahan.
 *
 * Menjalankan: bunx vitest run src/convex/somasi.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { formatRupiah } from "../lib/money";
import schema from "./schema";
import { siapkanPengguna, type KonteksUji } from "./test.helpers";
import { modules } from "./test.setup";

const HARI = 86_400_000;
const NOMOR_UJI = "628123456789";
/** 10:00 WIB, di dalam jam kontak bawaan 8:00-20:00. */
const PAGI = Date.UTC(2026, 9, 19, 3, 0);

type KeluarGateway = { target: string; filename: string; message: string };

function pasangGatewayWa() {
  const asli = globalThis.fetch;
  const keluar: KeluarGateway[] = [];
  process.env.FONNTE_TOKEN = "token-uji-somasi";
  globalThis.fetch = (async (_url: unknown, init?: { body?: unknown }) => {
    const body = new URLSearchParams(String(init?.body ?? ""));
    keluar.push({
      target: body.get("target") ?? "",
      filename: body.get("filename") ?? "",
      message: body.get("message") ?? "",
    });
    return new Response(JSON.stringify({ status: true, detail: "success! message in queue" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return {
    lampiran: () => keluar.filter((k) => k.filename !== ""),
    pulihkan: () => {
      globalThis.fetch = asli;
      delete process.env.FONNTE_TOKEN;
    },
  };
}

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

async function buatPinjaman(
  t: KonteksUji,
  userId: Id<"users">,
  opsi: { didanaiPada: number; nomorReferensi?: string; nomorWhatsApp?: string },
): Promise<Id<"loans">> {
  return t.run((ctx) =>
    ctx.db.insert("loans", {
      userId,
      pokokPinjaman: 500_000,
      tujuan: "Modal usaha",
      namaLengkap: "Rani Peminjam",
      namaBank: "BCA",
      nomorRekening: "1234567890",
      nomorWhatsApp: opsi.nomorWhatsApp ?? NOMOR_UJI,
      status: "didanai",
      nomorReferensi: opsi.nomorReferensi ?? "PNJ-2026-0042",
      tenorHari: 30,
      didanaiPada: opsi.didanaiPada,
    }),
  );
}

/** Kasus + janji aktif untuk menguji gerbang janji bayar. */
async function seedJanjiAktif(
  t: KonteksUji,
  loanId: Id<"loans">,
  userId: Id<"users">,
  adminId: Id<"users">,
): Promise<void> {
  await t.run(async (ctx) => {
    const kasusId = await ctx.db.insert("penagihanKasus", {
      loanId,
      userId,
      nomorReferensi: "PNJ-2026-0042",
      status: "ditangani",
      tingkatEskalasi: 0,
      statusPembayaran: "belum_bayar",
      jumlahTindakan: 1,
      dibuatPada: PAGI,
      diperbaruiPada: PAGI,
    });
    await ctx.db.insert("penagihanJanji", {
      kasusId,
      loanId,
      userId,
      nominal: 300_000,
      tanggalJanji: PAGI + 2 * HARI,
      kanal: "whatsapp",
      status: "aktif",
      dibuatOlehUserId: adminId,
      dibuatOlehLabel: "admin@pindai.test",
      dibuatPada: PAGI,
    });
  });
}

async function seedPengaduan(
  t: KonteksUji,
  loanId: Id<"loans">,
  userId: Id<"users">,
): Promise<void> {
  await t.run((ctx) =>
    ctx.db.insert("pengaduanNasabah", {
      loanId,
      userId,
      nomorReferensi: "PNJ-2026-0042",
      kanal: "whatsapp",
      kategori: "penagihan",
      isi: "Mohon penjadwalan ulang.",
      status: "baru",
      dibuatPada: PAGI,
      diperbaruiPada: PAGI,
    }),
  );
}

describe("surat somasi", () => {
  it("admin membaca surat untuk pinjaman yang sudah lewat H+3", async () => {
    const t = convexTest(schema, modules);
    const rani = await siapkanPengguna(t, "Rani Peminjam", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    const admin = await siapkanPengguna(t, "Super Admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const loanId = await buatPinjaman(t, rani.userId, {
      didanaiPada: Date.now() - 40 * HARI,
    });

    const hasil = await admin.sesi.query(api.somasi.dataSomasi, { loanId });

    expect(hasil.tersedia).toBe(true);
    if (!hasil.tersedia) return;
    expect(hasil.surat.nomorSurat).toMatch(/^SOMASI\/PNJ-2026-0042\/\d{8}$/);
    expect(hasil.surat.kepada).toBe("Rani Peminjam");
    expect(hasil.surat.paragraf.some((p) => p.includes("10 hari"))).toBe(true);
    const rincian = (awalan: string) =>
      hasil.surat.rincian.find((r) => r.label.startsWith(awalan))?.nilai;
    expect(rincian("Pokok pinjaman")).toBe(formatRupiah(500_000));
    expect(rincian("Bunga dan biaya tercatat")).toBe(formatRupiah(150_000));
    expect(rincian("Denda keterlambatan")).toBe(formatRupiah(100_000));
    expect(hasil.surat.rincian[hasil.surat.rincian.length - 1]?.nilai).toBe(
      formatRupiah(750_000),
    );
    expect(hasil.terbit).toBeNull();
    expect(hasil.bolehKirim).toBe(true);
    expect(hasil.kontak).toEqual({ email: true, whatsapp: true });
  });

  it("peminjam tidak boleh membaca surat", async () => {
    const t = convexTest(schema, modules);
    const rani = await siapkanPengguna(t, "Rani Peminjam", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    const loanId = await buatPinjaman(t, rani.userId, {
      didanaiPada: Date.now() - 40 * HARI,
    });

    await expect(rani.sesi.query(api.somasi.dataSomasi, { loanId })).rejects.toThrow(
      /Super Admin|khusus/i,
    );
  });

  it("H+2 dan pinjaman yang belum jatuh tempo belum bisa disomasi", async () => {
    const t = convexTest(schema, modules);
    const rani = await siapkanPengguna(t, "Rani Peminjam", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    const admin = await siapkanPengguna(t, "Super Admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const baru = await buatPinjaman(t, rani.userId, {
      didanaiPada: Date.now() - 5 * HARI,
      nomorReferensi: "PNJ-BELUM",
    });
    const h2 = await buatPinjaman(t, rani.userId, {
      didanaiPada: Date.now() - 32 * HARI,
      nomorReferensi: "PNJ-H2",
    });

    const hasilBaru = await admin.sesi.query(api.somasi.dataSomasi, { loanId: baru });
    expect(hasilBaru.tersedia).toBe(false);
    if (!hasilBaru.tersedia) {
      expect(hasilBaru.alasan).toMatch(/belum melewati jatuh tempo/i);
    }

    const hasilH2 = await admin.sesi.query(api.somasi.dataSomasi, { loanId: h2 });
    expect(hasilH2.tersedia).toBe(false);
    if (!hasilH2.tersedia) {
      expect(hasilH2.alasan).toMatch(/setelah keterlambatan 3 hari/i);
    }
  });

  it("janji bayar aktif menahan somasi", async () => {
    const t = convexTest(schema, modules);
    const rani = await siapkanPengguna(t, "Rani Peminjam", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    const admin = await siapkanPengguna(t, "Super Admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const loanId = await buatPinjaman(t, rani.userId, {
      didanaiPada: Date.now() - 40 * HARI,
    });
    await seedJanjiAktif(t, loanId, rani.userId, admin.userId);

    const hasil = await admin.sesi.query(api.somasi.dataSomasi, { loanId });

    expect(hasil.tersedia).toBe(false);
    if (!hasil.tersedia) expect(hasil.alasan).toMatch(/janji pembayaran aktif/i);
  });

  it("pengaduan yang belum selesai menahan somasi", async () => {
    const t = convexTest(schema, modules);
    const rani = await siapkanPengguna(t, "Rani Peminjam", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    const admin = await siapkanPengguna(t, "Super Admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const loanId = await buatPinjaman(t, rani.userId, {
      didanaiPada: Date.now() - 40 * HARI,
    });
    await seedPengaduan(t, loanId, rani.userId);

    const hasil = await admin.sesi.query(api.somasi.dataSomasi, { loanId });

    expect(hasil.tersedia).toBe(false);
    if (!hasil.tersedia) expect(hasil.alasan).toMatch(/pengaduan nasabah/i);
  });

  it("pinjaman yang sudah lunas tidak dibuatkan somasi", async () => {
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
        status: "lunas",
        nomorReferensi: "PNJ-LUNAS",
        tenorHari: 30,
        didanaiPada: Date.now() - 40 * HARI,
        lunasPada: Date.now() - 2 * HARI,
      }),
    );

    const hasil = await admin.sesi.query(api.somasi.dataSomasi, { loanId });

    expect(hasil.tersedia).toBe(false);
    if (!hasil.tersedia) expect(hasil.alasan).toMatch(/sudah lunas/i);
  });

  it("unduhan kedua memakai snapshot yang sama dengan unduhan pertama", async () => {
    const t = convexTest(schema, modules);
    const rani = await siapkanPengguna(t, "Rani Peminjam", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    const admin = await siapkanPengguna(t, "Super Admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const loanId = await buatPinjaman(t, rani.userId, {
      didanaiPada: Date.now() - 40 * HARI,
    });

    const pertama = await admin.sesi.action(api.somasi.unduhSomasi, { loanId });
    const kedua = await admin.sesi.action(api.somasi.unduhSomasi, { loanId });

    expect(pertama.nomorSurat).toBe(kedua.nomorSurat);
    expect(pertama.base64).toBe(kedua.base64);
    expect(pertama.namaBerkas).toBe("somasi-pnj-2026-0042.pdf");
    const isi = Buffer.from(pertama.base64, "base64").toString("latin1");
    expect(isi.startsWith("%PDF-")).toBe(true);
    expect(isi).toContain(pertama.nomorSurat);

    const terbit = await t.run((ctx) => ctx.db.query("somasiTerbit").collect());
    expect(terbit).toHaveLength(1);
    expect(terbit[0]?.nomorSurat).toBe(pertama.nomorSurat);

    const audit = await t.run((ctx) =>
      ctx.db
        .query("auditLog")
        .collect()
        .then((rows) => rows.map((r) => r.aksi)),
    );
    expect(audit.filter((a) => a === "somasi_diterbitkan")).toHaveLength(1);
    expect(audit.filter((a) => a === "somasi_diunduh")).toHaveLength(2);
  });

  it("tanda diserahkan bisa dipasang dan dibatalkan", async () => {
    const t = convexTest(schema, modules);
    const rani = await siapkanPengguna(t, "Rani Peminjam", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    const admin = await siapkanPengguna(t, "Super Admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const loanId = await buatPinjaman(t, rani.userId, {
      didanaiPada: Date.now() - 40 * HARI,
    });
    await admin.sesi.action(api.somasi.unduhSomasi, { loanId });

    await admin.sesi.mutation(api.somasi.tandaiSomasiDiserahkan, {
      loanId,
      melalui: "manual",
    });
    const setelah = await admin.sesi.query(api.somasi.dataSomasi, { loanId });
    expect(setelah.tersedia).toBe(true);
    if (setelah.tersedia) {
      expect(setelah.terbit?.diserahkanMelalui).toBe("manual");
      expect(setelah.terbit?.diserahkanPada).not.toBeNull();
    }

    await expect(
      admin.sesi.mutation(api.somasi.tandaiSomasiDiserahkan, { loanId }),
    ).rejects.toThrow(/sudah ditandai diserahkan/i);

    await admin.sesi.mutation(api.somasi.batalkanPenyerahanSomasi, { loanId });
    const dibatalkan = await admin.sesi.query(api.somasi.dataSomasi, { loanId });
    expect(dibatalkan.tersedia).toBe(true);
    if (dibatalkan.tersedia) expect(dibatalkan.terbit?.diserahkanPada).toBeNull();
  });

  it("tindak lanjut hanya bisa dicatat setelah surat diserahkan", async () => {
    const t = convexTest(schema, modules);
    const rani = await siapkanPengguna(t, "Rani Peminjam", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    const admin = await siapkanPengguna(t, "Super Admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const loanId = await buatPinjaman(t, rani.userId, {
      didanaiPada: Date.now() - 40 * HARI,
    });
    await admin.sesi.action(api.somasi.unduhSomasi, { loanId });

    await expect(
      admin.sesi.mutation(api.somasi.catatTindakLanjutSomasi, {
        loanId,
        tindakLanjut: "dibayar",
      }),
    ).rejects.toThrow(/diserahkan dulu/i);

    await admin.sesi.mutation(api.somasi.tandaiSomasiDiserahkan, {
      loanId,
      melalui: "manual",
    });
    await admin.sesi.mutation(api.somasi.catatTindakLanjutSomasi, {
      loanId,
      tindakLanjut: "dibayar",
    });

    const data = await admin.sesi.query(api.somasi.dataSomasi, { loanId });
    expect(data.tersedia).toBe(true);
    if (data.tersedia) {
      expect(data.terbit?.tindakLanjut).toBe("dibayar");
      expect(data.terbit?.tindakLanjutPada).not.toBeNull();
    }

    const audit = await t.run((ctx) =>
      ctx.db
        .query("auditLog")
        .collect()
        .then((rows) => rows.map((r) => r.aksi)),
    );
    expect(audit).toContain("somasi_tindak_lanjut");

    await expect(
      admin.sesi.mutation(api.somasi.catatTindakLanjutSomasi, {
        loanId,
        tindakLanjut: "tidak_dikenal",
      }),
    ).rejects.toThrow(/tidak dikenal/i);
  });

  it("WhatsApp terkirim dengan lampiran lalu menandai diserahkan", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(PAGI);
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
      const loanId = await buatPinjaman(t, rani.userId, {
        didanaiPada: Date.now() - 40 * HARI,
      });

      const hasil = await admin.sesi.action(api.somasi.kirimSomasiWhatsapp, { loanId });

      expect(hasil.ok).toBe(true);
      expect(hasil.tujuan).toBe(NOMOR_UJI);
      expect(hasil.lampiran).toBe(true);
      const kiriman = gateway.lampiran();
      expect(kiriman).toHaveLength(1);
      expect(kiriman[0]?.filename).toBe("somasi-pnj-2026-0042.pdf");
      expect(kiriman[0]?.message).toContain("SOMASI");

      const log = await t.run((ctx) => ctx.db.query("somasiKirimLog").collect());
      expect(log).toHaveLength(1);
      expect(log[0]?.status).toBe("terkirim");

      const data = await admin.sesi.query(api.somasi.dataSomasi, { loanId });
      expect(data.tersedia).toBe(true);
      if (data.tersedia) expect(data.terbit?.diserahkanMelalui).toBe("whatsapp");

      // Kiriman kedua langsung ditahan jeda 60 detik.
      await expect(
        admin.sesi.action(api.somasi.kirimSomasiWhatsapp, { loanId }),
      ).rejects.toThrow(/Tunggu \d+ detik/i);
    } finally {
      gateway.pulihkan();
      vi.useRealTimers();
    }
  });

  it("pengiriman ditolak di luar jam kontak", async () => {
    vi.useFakeTimers();
    // 23:00 WIB, di luar jendela 8:00-20:00.
    vi.setSystemTime(Date.UTC(2026, 9, 19, 16, 0));
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
      const loanId = await buatPinjaman(t, rani.userId, {
        didanaiPada: Date.now() - 40 * HARI,
      });

      await expect(
        admin.sesi.action(api.somasi.kirimSomasiWhatsapp, { loanId }),
      ).rejects.toThrow(/jam kontak/i);
      expect(gateway.lampiran()).toHaveLength(0);
    } finally {
      gateway.pulihkan();
      vi.useRealTimers();
    }
  });

  it("email yang gagal dicatat tanpa menandai surat diserahkan", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(PAGI);
    const simpanKey = process.env.VLY_INTEGRATION_KEY;
    delete process.env.VLY_INTEGRATION_KEY;
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
      const loanId = await buatPinjaman(t, rani.userId, {
        didanaiPada: Date.now() - 40 * HARI,
      });

      await expect(
        admin.sesi.action(api.somasi.kirimSomasiEmail, { loanId }),
      ).rejects.toThrow(/VLY_INTEGRATION_KEY/i);

      const log = await t.run((ctx) => ctx.db.query("somasiKirimLog").collect());
      expect(log).toHaveLength(1);
      expect(log[0]?.kanal).toBe("email");
      expect(log[0]?.status).toBe("gagal");

      const data = await admin.sesi.query(api.somasi.dataSomasi, { loanId });
      expect(data.tersedia).toBe(true);
      if (data.tersedia) expect(data.terbit?.diserahkanPada).toBeNull();
    } finally {
      if (simpanKey !== undefined) process.env.VLY_INTEGRATION_KEY = simpanKey;
      vi.useRealTimers();
    }
  });
});
