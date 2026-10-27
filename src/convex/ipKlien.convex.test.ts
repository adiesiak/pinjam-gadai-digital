import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import schema from "./schema";
import { modules } from "./test.setup";

/**
 * Endpoint IP klien dipakai halaman masuk untuk mencatat "dari mana" pada log
 * anomali (TOTP, klaim akun lama). Nilainya harus datang dari header proxy yang
 * hanya terbaca server, bukan dari apa pun yang dikirim klien.
 */
describe("endpoint IP klien", () => {
  it("membaca IP dari header proxy dan mengabaikan sisa rantainya", async () => {
    const t = convexTest(schema, modules);

    const diteruskan = await t.fetch("/api/klien/ip", {
      headers: { "x-forwarded-for": "36.85.12.7, 10.0.0.1" },
    });
    expect(diteruskan.status).toBe(200);
    expect(diteruskan.headers.get("access-control-allow-origin")).toBe("*");
    expect(diteruskan.headers.get("cache-control")).toBe("no-store");
    expect(await diteruskan.json()).toEqual({ ip: "36.85.12.7" });
  });

  it("memakai cf-connecting-ip bila x-forwarded-for tidak ada", async () => {
    const t = convexTest(schema, modules);
    const jawaban = await t.fetch("/api/klien/ip", {
      headers: { "cf-connecting-ip": "203.0.113.9" },
    });
    expect(await jawaban.json()).toEqual({ ip: "203.0.113.9" });
  });

  it("tanpa header proxy menjawab string kosong, bukan angka karangan", async () => {
    const t = convexTest(schema, modules);
    const jawaban = await t.fetch("/api/klien/ip");
    expect(await jawaban.json()).toEqual({ ip: "" });
  });
});
