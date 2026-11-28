import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

/**
 * Pemantau gateway WhatsApp.
 *
 * Yang dikunci di sini adalah keputusan yang mahal bila salah:
 *  - gangguan sesaat TIDAK boleh langsung mengirim email;
 *  - gangguan yang sama TIDAK boleh diemail berulang tiap 15 menit (kuota
 *    Resend 100/hari akan habis, dan itu mematikan OTP email — satu-satunya
 *    jalur masuk yang tidak bergantung gateway);
 *  - gateway yang pulih harus mengembalikan status sehat dan mereset hitungan.
 */
describe("pemantau gateway WhatsApp", () => {
  it("gangguan pertama belum memicu peringatan", async () => {
    const t = convexTest(schema, modules);
    const hasil = await t.mutation(internal.jagaGatewayWa._simpanStatus, {
      sehat: false,
      apiUrl: "https://wa.contoh.test/send",
      alasan: "HTTP 502",
    });
    expect(hasil.perluPeringatan).toBe(false);
    expect(hasil.gagalBerturut).toBe(1);
  });

  it("gangguan kedua berturut-turut memicu peringatan", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.jagaGatewayWa._simpanStatus, {
      sehat: false,
      apiUrl: "https://wa.contoh.test/send",
      alasan: "HTTP 502",
    });
    const kedua = await t.mutation(internal.jagaGatewayWa._simpanStatus, {
      sehat: false,
      apiUrl: "https://wa.contoh.test/send",
      alasan: "HTTP 502",
    });
    expect(kedua.perluPeringatan).toBe(true);
    expect(kedua.gagalBerturut).toBe(2);
  });

  it("gangguan yang sama tidak diemail berulang dalam 6 jam", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.jagaGatewayWa._simpanStatus, {
      sehat: false,
      apiUrl: "https://wa.contoh.test/send",
      alasan: "HTTP 502",
    });
    await t.mutation(internal.jagaGatewayWa._simpanStatus, {
      sehat: false,
      apiUrl: "https://wa.contoh.test/send",
      alasan: "HTTP 502",
    });
    // Putaran berikutnya (15 menit kemudian) masih dalam jendela 6 jam.
    const ketiga = await t.mutation(internal.jagaGatewayWa._simpanStatus, {
      sehat: false,
      apiUrl: "https://wa.contoh.test/send",
      alasan: "HTTP 502",
    });
    expect(ketiga.perluPeringatan).toBe(false);
    expect(ketiga.gagalBerturut).toBe(3);
  });

  it("gateway pulih mereset hitungan dan menandai sehat", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.jagaGatewayWa._simpanStatus, {
      sehat: false,
      apiUrl: "https://wa.contoh.test/send",
      alasan: "HTTP 502",
    });
    await t.mutation(internal.jagaGatewayWa._simpanStatus, {
      sehat: false,
      apiUrl: "https://wa.contoh.test/send",
      alasan: "HTTP 502",
    });
    const pulih = await t.mutation(internal.jagaGatewayWa._simpanStatus, {
      sehat: true,
      apiUrl: "https://wa.contoh.test/send",
    });
    expect(pulih.gagalBerturut).toBe(0);
    expect(pulih.perluPeringatan).toBe(false);

    const status = await t.run(async (ctx) =>
      ctx.db.query("gatewayWaStatus").first(),
    );
    expect(status?.sehat).toBe(true);
    expect(status?.alasan).toBeUndefined();
    expect(status?.terakhirSehatPada).toBeTypeOf("number");
  });

  it("gangguan setelah pulih dilaporkan lagi", async () => {
    const t = convexTest(schema, modules);
    // Dua kegagalan → peringatan pertama.
    await t.mutation(internal.jagaGatewayWa._simpanStatus, {
      sehat: false,
      apiUrl: "https://wa.contoh.test/send",
      alasan: "HTTP 502",
    });
    await t.mutation(internal.jagaGatewayWa._simpanStatus, {
      sehat: false,
      apiUrl: "https://wa.contoh.test/send",
      alasan: "HTTP 502",
    });
    // Pulih.
    await t.mutation(internal.jagaGatewayWa._simpanStatus, {
      sehat: true,
      apiUrl: "https://wa.contoh.test/send",
    });
    // Jendela 6 jam masih berjalan, jadi gangguan baru BELUM diemail lagi:
    // penahan ini sengaja berbasis waktu, bukan berbasis status.
    await t.mutation(internal.jagaGatewayWa._simpanStatus, {
      sehat: false,
      apiUrl: "https://wa.contoh.test/send",
      alasan: "HTTP 503",
    });
    const kedua = await t.mutation(internal.jagaGatewayWa._simpanStatus, {
      sehat: false,
      apiUrl: "https://wa.contoh.test/send",
      alasan: "HTTP 503",
    });
    expect(kedua.perluPeringatan).toBe(false);
  });

  it("kegagalan mengirim peringatan membuka jalan percobaan ulang", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.jagaGatewayWa._simpanStatus, {
      sehat: false,
      apiUrl: "https://wa.contoh.test/send",
      alasan: "HTTP 502",
    });
    await t.mutation(internal.jagaGatewayWa._simpanStatus, {
      sehat: false,
      apiUrl: "https://wa.contoh.test/send",
      alasan: "HTTP 502",
    });

    // Email gagal: penanda waktu peringatan harus dikosongkan lagi, supaya
    // alarm tidak tertelan hanya karena pengirimannya gagal sekali.
    await t.mutation(internal.jagaGatewayWa._catatPeringatanTerkirim, {
      berhasil: false,
      catatan: "Gagal mengirim: RESEND_API_KEY belum diisi",
    });
    const status = await t.run(async (ctx) =>
      ctx.db.query("gatewayWaStatus").first(),
    );
    expect(status?.terakhirPeringatanPada).toBeUndefined();

    const berikutnya = await t.mutation(internal.jagaGatewayWa._simpanStatus, {
      sehat: false,
      apiUrl: "https://wa.contoh.test/send",
      alasan: "HTTP 502",
    });
    expect(berikutnya.perluPeringatan).toBe(true);
  });

  it("gangguan yang dilaporkan meninggalkan jejak audit", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.jagaGatewayWa._simpanStatus, {
      sehat: false,
      apiUrl: "https://wa.contoh.test/send",
      alasan: "HTTP 502",
    });
    await t.mutation(internal.jagaGatewayWa._simpanStatus, {
      sehat: false,
      apiUrl: "https://wa.contoh.test/send",
      alasan: "HTTP 502",
    });
    const audit = await t.run(async (ctx) =>
      (await ctx.db.query("auditLog").collect()).filter(
        (a) => a.aksi === "gateway_wa_tidak_sehat",
      ),
    );
    expect(audit.length).toBe(1);
    expect(audit[0]?.target).toBe("gatewayWa");
  });

  it("pemeriksaan manual tidak menelan jatah email alarm", async () => {
    const t = convexTest(schema, modules);
    // Dua kegagalan dari pemeriksaan MANUAL (admin menekan tombol periksa).
    await t.mutation(internal.jagaGatewayWa._simpanStatus, {
      sehat: false,
      apiUrl: "https://wa.contoh.test/send",
      alasan: "HTTP 502",
      tandaiSaatDiperiksa: false,
    });
    const kedua = await t.mutation(internal.jagaGatewayWa._simpanStatus, {
      sehat: false,
      apiUrl: "https://wa.contoh.test/send",
      alasan: "HTTP 502",
      tandaiSaatDiperiksa: false,
    });
    // Ambang tercapai, DAN penanda waktu belum ditulis.
    expect(kedua.perluPeringatan).toBe(true);
    const status = await t.run(async (ctx) =>
      ctx.db.query("gatewayWaStatus").first(),
    );
    expect(status?.terakhirPeringatanPada).toBeUndefined();

    // Karena penanda belum ditulis, cron berikutnya MASIH boleh mengirim email.
    const cron = await t.mutation(internal.jagaGatewayWa._simpanStatus, {
      sehat: false,
      apiUrl: "https://wa.contoh.test/send",
      alasan: "HTTP 502",
    });
    expect(cron.perluPeringatan).toBe(true);
    const sesudah = await t.run(async (ctx) =>
      ctx.db.query("gatewayWaStatus").first(),
    );
    expect(sesudah?.terakhirPeringatanPada).toBeTypeOf("number");
  });

  it("pemeriksaan manual tidak meninggalkan jejak audit peringatan", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.jagaGatewayWa._simpanStatus, {
      sehat: false,
      apiUrl: "https://wa.contoh.test/send",
      alasan: "HTTP 502",
      tandaiSaatDiperiksa: false,
    });
    await t.mutation(internal.jagaGatewayWa._simpanStatus, {
      sehat: false,
      apiUrl: "https://wa.contoh.test/send",
      alasan: "HTTP 502",
      tandaiSaatDiperiksa: false,
    });
    const audit = await t.run(async (ctx) =>
      (await ctx.db.query("auditLog").collect()).filter(
        (a) => a.aksi === "gateway_wa_tidak_sehat",
      ),
    );
    // Email tidak dikirim, jadi audit "sudah diperingatkan" juga tidak ditulis.
    expect(audit.length).toBe(0);
  });

  it("pemeriksaan dilewati saat gateway tidak aktif", async () => {
    const t = convexTest(schema, modules);
    const hasil = await t.action(internal.jagaGatewayWa.cekGateway, {});
    expect(hasil.diperiksa).toBe(false);
  });

  it("pemeriksaan dilewati untuk gateway tanpa endpoint kesehatan", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("waSettings", {
        slot: "global",
        apiUrl: "https://api.fonnte.com/send",
        aktif: true,
      });
    });
    const hasil = await t.action(internal.jagaGatewayWa.cekGateway, {});
    expect(hasil.diperiksa).toBe(false);
  });
});
