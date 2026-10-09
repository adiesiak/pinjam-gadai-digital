/**
 * Tes unggahDokumen (lib) — penanganan batas ukuran & jalur gagal API.
 *
 * `unggahDokumen` menerjemahkan dua gagal yang berasal dari server/storage
 * menjadi pesan galat klien yang stabil:
 *  - File terlalu besar → galat ukuran maksimal.
 *  - Upload HTTP gagal (non-ok) atau respons tanpa storageId → galat unggah umum.
 *
 * Karena berkas ini tidak tersedia sebagai Convex function, ia diuji sebagai
 * skrip biasa (bun) dengan `fetch` tiruan.
 */
import { describe, expect, it } from "vitest";
import { unggahDokumen } from "./unggahDokumen";

function faketFile(lebar: number): File {
  const buf = new Uint8Array(lebar);
  return new File([buf], "uploaddokumen.raw", { type: "application/octet-stream" });
}

describe("unggahDokumen", () => {
  it("menolak berkas yang melebihi batas ukuran", async () => {
    const file = faketFile(10_000_001);
    const mintaUrl = async () => "https://storage.example/v1/upload?id=abc";

    await expect(
      unggahDokumen(file, mintaUrl),
    ).rejects.toThrow(
      /maksimal 5 MB/i,
    );
  });

  it("menolak respons HTTP non-ok", async () => {
    const file = faketFile(1_000);
    const mintaUrl = async () =>
      "https://storage.example/v1/upload?id=abc";

    // fetch tiruan: respons 500 → dianggap gagal unggah.
    const asli = globalThis.fetch;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = async () =>
      new Response(null, { status: 500, statusText: "Server Error" });

    await expect(
      unggahDokumen(file, mintaUrl),
    ).rejects.toThrow(
      /gagal diunggah/i,
    );

    // Kembalikan fetch asli.
    (globalThis as any).fetch = asli;
  });

  it("menolak respons tanpa storageId", async () => {
    const file = faketFile(1_000);
    const mintaUrl = async () =>
      "https://storage.example/v1/upload?id=abc";

    const asli = globalThis.fetch;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = async () =>
      new Response(
        JSON.stringify({ ok: true }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );

    await expect(
      unggahDokumen(file, mintaUrl),
    ).rejects.toThrow(
      /gagal diunggah/i,
    );

    (globalThis as any).fetch = asli;
  });
});
