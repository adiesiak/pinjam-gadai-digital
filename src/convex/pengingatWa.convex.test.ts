/**
 * Tes integrasi PENGIRIMAN PESAN WHATSAPP OTOMATIS (convex-test + vitest).
 *
 * Yang dijaga berkas ini — lewat action yang sama dengan yang dipakai aplikasi:
 *
 *  - gateway nonaktif / pinjaman sudah lunas: TIDAK ada pesan keluar dan TIDAK
 *    ada baris log palsu ("berhenti otomatis setelah pembayaran tercatat");
 *  - pesan hanya berangkat ke NOMOR PEMINJAM, dan setiap percobaan tercatat di
 *    `waLogs` dengan jenis yang bisa diterjemahkan jadi label ramah;
 *  - template yang diatur admin dipakai apa adanya, sedangkan template tersimpan
 *    yang tidak sah jatuh ke teks bawaan — tidak pernah dikirim cacat;
 *  - peminjam tanpa nomor WhatsApp tidak dikirimi apa pun, tetapi kejadiannya
 *    tetap tercatat apa adanya.
 *
 * Fonnte dipanggil dari SERVER, jadi tes mengganti `globalThis.fetch` dan
 * membaca pesan yang benar-benar keluar.
 *
 * Menjalankan: bunx vitest run src/convex/pengingatWa.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { buatPengguna, type KonteksUji } from "./test.helpers";
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

describe("pengingat WhatsApp otomatis", () => {
  it("gateway nonaktif: tidak ada pesan keluar dan tidak ada log", async () => {
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
});
