import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { MASA_TAUTAN_BERKAS_MS, periksaTautanBerkas, tautanBerkas } from "./berkas";
import schema from "./schema";
import { modules } from "./test.setup";

/** Pecah tautan `/berkas?...` menjadi parameter yang diperiksa endpoint. */
function parameter(url: string) {
  const params = new URL(url, "https://contoh.test").searchParams;
  return {
    id: params.get("id") ?? "",
    exp: Number(params.get("exp")),
    sig: params.get("sig") ?? "",
  };
}

describe("tautan berkas sensitif", () => {
  it("menandatangani tautan; kedaluwarsa dan tanda tangan salah ditolak", async () => {
    const t = convexTest(schema, modules);
    const id = await t.run((ctx) => ctx.storage.store(new Blob(["ktp"])));

    const url = await tautanBerkas(id);
    expect(url).not.toBeNull();
    const { id: idTautan, exp, sig } = parameter(url as string);

    expect(idTautan).toBe(id);
    expect(exp).toBeGreaterThanOrEqual(Date.now() + MASA_TAUTAN_BERKAS_MS - 5_000);
    expect(await periksaTautanBerkas({ id: idTautan, exp, sig })).toBe(true);

    // Umur tautan dikunci di sepuluh menit: tautan ini kredensial bearer untuk
    // KTP, jadi memperpanjangnya harus gagal di tes, bukan lolos diam-diam.
    expect(MASA_TAUTAN_BERKAS_MS).toBe(10 * 60 * 1000);
    // Tanda tangan HMAC-SHA256 dalam hex — 32 byte, 64 karakter.
    expect(sig).toMatch(/^[0-9a-f]{64}$/);

    // Lewat satu milidetik dari waktu kedaluwarsa: tautan mati.
    expect(
      await periksaTautanBerkas({ id: idTautan, exp, sig, sekarang: exp + 1 }),
    ).toBe(false);

    // Tanda tangan yang diubah tidak lolos.
    const sigPalsu = `${sig.slice(0, -1)}${sig.endsWith("0") ? "1" : "0"}`;
    expect(await periksaTautanBerkas({ id: idTautan, exp, sig: sigPalsu })).toBe(false);

    // Umur yang diperpanjang tanpa tanda tangan baru juga ditolak.
    expect(await periksaTautanBerkas({ id: idTautan, exp: exp + 86_400_000, sig })).toBe(false);

    // Tanpa berkas: tidak ada tautan yang dibuat.
    expect(await tautanBerkas(null)).toBeNull();
  });

  it("tautan bertanda tangan tidak pernah berupa URL penyimpanan permanen", async () => {
    const t = convexTest(schema, modules);
    const id = await t.run((ctx) =>
      ctx.storage.store(new Blob(["bukti transfer"])),
    );

    const url = (await tautanBerkas(id)) as string;

    // Bentuk yang diharapkan: /berkas?id=…&exp=…&sig=…
    expect(url).toMatch(/\/berkas\?id=/);
    expect(url).toMatch(/&exp=\d+/);
    expect(url).toMatch(/&sig=[0-9a-f]{64}$/);

    // BUKAN URL penyimpanan Convex (`/api/storage/…`). URL itu PERMANEN dan
    // bisa dibuka siapa pun yang memegangnya — tidak ada autentikasi, tidak ada
    // kedaluwarsa. Seluruh dokumen keuangan (bukti setoran, bukti transfer,
    // bukti pembayaran angsuran) harus memakai bentuk bertanda tangan ini.
    expect(url).not.toContain("/api/storage/");

    // `getUrl` bawaan Convex memang menghasilkan bentuk yang dilarang itu —
    // ditegaskan di sini supaya perbedaannya tidak kabur saat menambah kode.
    const permanen = await t.run((ctx) => ctx.storage.getUrl(id));
    expect(permanen).toContain("/api/storage/");
    expect(permanen).not.toContain("/berkas?");
  });

  it("endpoint /berkas menyajikan berkas hanya dengan tautan sah", async () => {
    const t = convexTest(schema, modules);
    const id = await t.run((ctx) =>
      ctx.storage.store(new Blob(["isi-ktp"], { type: "image/jpeg" })),
    );

    const url = await tautanBerkas(id);
    const kueri = (url as string).split("?")[1];

    const sah = await t.fetch(`/berkas?${kueri}`);
    expect(sah.status).toBe(200);
    expect(sah.headers.get("content-type")).toBe("image/jpeg");
    expect(await sah.text()).toBe("isi-ktp");

    const sigPalsu = await t.fetch(
      `/berkas?id=${id}&exp=${Date.now() + 60_000}&sig=${"0".repeat(64)}`,
    );
    expect(sigPalsu.status).toBe(403);
  });

  it("tanpa rahasia asli tidak menandatangani, dan endpoint menjawab 503", async () => {
    const t = convexTest(schema, modules);
    const id = await t.run((ctx) => ctx.storage.store(new Blob(["ktp"])));
    const cadangan = {
      BERKAS_LINK_SECRET: process.env.BERKAS_LINK_SECRET,
      JWT_PRIVATE_KEY: process.env.JWT_PRIVATE_KEY,
    };
    delete process.env.BERKAS_LINK_SECRET;
    delete process.env.JWT_PRIVATE_KEY;
    try {
      // Tidak ada cadangan yang tertulis di kode: gagal, bukan menandatangani.
      await expect(tautanBerkas(id)).rejects.toThrow(/BERKAS_LINK_SECRET/);

      const jawaban = await t.fetch(
        `/berkas?id=${id}&exp=${Date.now() + 60_000}&sig=${"a".repeat(64)}`,
      );
      expect(jawaban.status).toBe(503);
      expect(await jawaban.text()).toContain("rahasia penanda tangan");
    } finally {
      // `process.env.X = undefined` menyimpan teks "undefined", jadi yang tidak
      // pernah ada harus dihapus, bukan dikembalikan sebagai nilai.
      for (const nama of ["BERKAS_LINK_SECRET", "JWT_PRIVATE_KEY"] as const) {
        const nilai = cadangan[nama];
        if (nilai === undefined) delete process.env[nama];
        else process.env[nama] = nilai;
      }
    }
  });
});
