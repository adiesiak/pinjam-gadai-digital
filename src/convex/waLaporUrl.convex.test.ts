import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

const TOKEN = "token-uji-gateway-0123456789abcdef";

function kontek() {
  return convexTest(schema, modules);
}

describe("pelaporan URL gateway WhatsApp", () => {
  const envAsli = process.env.WHATSAPP_API_KEY;

  beforeEach(() => {
    process.env.WHATSAPP_API_KEY = TOKEN;
  });
  afterEach(() => {
    if (envAsli === undefined) delete process.env.WHATSAPP_API_KEY;
    else process.env.WHATSAPP_API_KEY = envAsli;
  });

  it("menolak token yang salah tanpa mengubah apiUrl", async () => {
    const t = kontek();
    await t.run(async (ctx) => {
      await ctx.db.insert("waSettings", {
        slot: "global",
        apiUrl: "https://lama.trycloudflare.com/send",
      });
    });

    const hasil = await t.mutation(api.waLaporUrl.laporkanUrl, {
      token: "token-palsu",
      apiUrl: "https://penyerang.trycloudflare.com/send",
    });

    expect(hasil.ok).toBe(false);
    const baris = await t.run(async (ctx) =>
      ctx.db.query("waSettings").first(),
    );
    expect(baris?.apiUrl).toBe("https://lama.trycloudflare.com/send");
  });

  it("menolak host di luar daftar izin meski token benar", async () => {
    const t = kontek();
    await t.run(async (ctx) => {
      await ctx.db.insert("waSettings", {
        slot: "global",
        apiUrl: "https://lama.trycloudflare.com/send",
      });
    });

    // Token benar, tetapi host bukan milik PINDAI maupun Cloudflare quick
    // tunnel. Tanpa batas ini, token yang bocor bisa mengalihkan OTP ke
    // server penyerang.
    const hasil = await t.mutation(api.waLaporUrl.laporkanUrl, {
      token: TOKEN,
      apiUrl: "https://penyerang.example.com/send",
    });

    expect(hasil.ok).toBe(false);
    const baris = await t.run(async (ctx) =>
      ctx.db.query("waSettings").first(),
    );
    expect(baris?.apiUrl).toBe("https://lama.trycloudflare.com/send");
  });

  it("menolak URL non-https", async () => {
    const t = kontek();
    const hasil = await t.mutation(api.waLaporUrl.laporkanUrl, {
      token: TOKEN,
      apiUrl: "http://abc.trycloudflare.com/send",
    });
    expect(hasil.ok).toBe(false);
  });

  it("menerima URL trycloudflare baru dan mencatat audit", async () => {
    const t = kontek();
    await t.run(async (ctx) => {
      await ctx.db.insert("waSettings", {
        slot: "global",
        apiUrl: "https://lama.trycloudflare.com/send",
      });
    });

    const baru = "https://baru-sekali.trycloudflare.com/send";
    const hasil = await t.mutation(api.waLaporUrl.laporkanUrl, {
      token: TOKEN,
      apiUrl: baru,
    });

    expect(hasil.ok).toBe(true);
    const baris = await t.run(async (ctx) =>
      ctx.db.query("waSettings").first(),
    );
    expect(baris?.apiUrl).toBe(baru);

    const auditBaris = await t.run(async (ctx) =>
      ctx.db.query("auditLog").collect(),
    );
    const catatan = auditBaris.find((a) => a.aksi === "gateway_url_diperbarui");
    expect(catatan).toBeDefined();
    expect(catatan?.detail).toContain("lama.trycloudflare.com");
    expect(catatan?.detail).toContain("baru-sekali.trycloudflare.com");
  });

  it("idempoten: URL sama tidak menulis ulang dan tidak menambah audit", async () => {
    const t = kontek();
    const url = "https://tetap.trycloudflare.com/send";
    await t.run(async (ctx) => {
      await ctx.db.insert("waSettings", { slot: "global", apiUrl: url });
    });

    const hasil = await t.mutation(api.waLaporUrl.laporkanUrl, {
      token: TOKEN,
      apiUrl: url,
    });
    expect(hasil.ok).toBe(true);
    if (hasil.ok) expect(hasil.berubah).toBe(false);

    const auditBaris = await t.run(async (ctx) =>
      ctx.db.query("auditLog").collect(),
    );
    expect(auditBaris.filter((a) => a.aksi === "gateway_url_diperbarui")).toHaveLength(0);
  });

  it("menolak bila server belum punya token gateway", async () => {
    delete process.env.WHATSAPP_API_KEY;
    const t = kontek();
    const hasil = await t.mutation(api.waLaporUrl.laporkanUrl, {
      token: TOKEN,
      apiUrl: "https://abc.trycloudflare.com/send",
    });
    expect(hasil.ok).toBe(false);
  });
});
