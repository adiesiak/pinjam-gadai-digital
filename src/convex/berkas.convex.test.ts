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
});
