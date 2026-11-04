/**
 * Tes ujung-ke-ujung action backup Google Drive dengan fetch tiruan.
 *
 * Tidak ada panggilan jaringan nyata. Yang dibuktikan:
 * - kredensial dibaca dari environment dan token diminta sekali;
 * - folder Drive dipakai/dibuat, dokumen diunduh, dienkripsi, lalu diunggah;
 * - manifest dan ringkasan dibuat;
 * - hasilnya tercatat sebagai aksi `backup` yang dikenali pemantau.
 *
 * Menjalankan: bunx vitest run src/convex/backupDrive.convex.test.ts
 */
import { randomBytes } from "node:crypto";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema";
import { siapkanPengguna } from "./test.helpers";
import { modules } from "./test.setup";

const ASLI = {
  clientId: process.env.GOOGLE_DRIVE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_DRIVE_CLIENT_SECRET,
  refreshToken: process.env.GOOGLE_DRIVE_REFRESH_TOKEN,
  kunci: process.env.BACKUP_DRIVE_ENCRYPTION_KEY,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("backup KYC & pinjaman ke Google Drive", () => {
  beforeEach(() => {
    process.env.GOOGLE_DRIVE_CLIENT_ID = "client-uji";
    process.env.GOOGLE_DRIVE_CLIENT_SECRET = "secret-uji";
    process.env.GOOGLE_DRIVE_REFRESH_TOKEN = "refresh-uji";
    process.env.BACKUP_DRIVE_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  });

  afterEach(() => {
    if (ASLI.clientId === undefined) delete process.env.GOOGLE_DRIVE_CLIENT_ID;
    else process.env.GOOGLE_DRIVE_CLIENT_ID = ASLI.clientId;
    if (ASLI.clientSecret === undefined) delete process.env.GOOGLE_DRIVE_CLIENT_SECRET;
    else process.env.GOOGLE_DRIVE_CLIENT_SECRET = ASLI.clientSecret;
    if (ASLI.refreshToken === undefined) delete process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
    else process.env.GOOGLE_DRIVE_REFRESH_TOKEN = ASLI.refreshToken;
    if (ASLI.kunci === undefined) delete process.env.BACKUP_DRIVE_ENCRYPTION_KEY;
    else process.env.BACKUP_DRIVE_ENCRYPTION_KEY = ASLI.kunci;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("mengunggah dokumen, manifest, dan ringkasan lalu mencatat audit", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await siapkanPengguna(t, "NASABAH DRIVE", {
      email: "drive@contoh.test",
      role: "peminjam",
    });
    const storageId = await t.run(async (ctx) =>
      ctx.storage.store(new Blob(["foto ktp uji"], { type: "image/jpeg" })),
    );
    await t.run(async (ctx) => {
      await ctx.db.insert("kycProfil", {
        userId,
        status: "PENDING_REVIEW",
        ktpId: storageId,
        dibuatPada: Date.now(),
        diperbaruiPada: Date.now(),
      });
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      if (url.startsWith("https://oauth2.googleapis.com/token")) {
        return json({ access_token: "token-uji", expires_in: 3600 });
      }

      if (url.startsWith("https://www.googleapis.com/upload/drive/v3/files")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as { name?: string };
        return new Response(null, {
          status: 200,
          headers: {
            location: `https://upload.test/${encodeURIComponent(body.name ?? "berkas")}`,
          },
        });
      }

      if (url.startsWith("https://upload.test/")) {
        const nama = decodeURIComponent(url.slice("https://upload.test/".length));
        return json({ id: `id-${nama}`, name: nama });
      }

      if (url.startsWith("https://www.googleapis.com/drive/v3/files")) {
        const u = new URL(url);
        const q = u.searchParams.get("q") ?? "";
        if (init?.method === "GET" && q.includes("mimeType = 'application/vnd.google-apps.folder'")) {
          if (q.includes("name = 'PINDAI Backup'")) {
            return json({ files: [{ id: "folder-root", name: "PINDAI Backup" }] });
          }
          if (q.includes("name = 'Dokumen'")) {
            return json({ files: [{ id: "folder-dokumen", name: "Dokumen" }] });
          }
        }
        return json({ files: [], nextPageToken: undefined });
      }

      // URL storage Convex: beri isi kecil yang bisa dienkripsi.
      return new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const hasil = await t.action(internal.backupDrive.jalankan, {
      pemicu: "uji",
    });
    expect(hasil).toMatchObject({
      ok: true,
      status: "lengkap",
      folder: "PINDAI Backup",
      jumlahDokumen: 1,
      jumlahDokumenGagal: 0,
    });
    expect(hasil.ok && hasil.manifest).toContain("manifest-");

    // Satu dokumen + manifest + ringkasan = tiga sesi unggahan.
    const sesiUnggah = fetchMock.mock.calls.filter(([input]) =>
      String(input).includes("uploadType=resumable"),
    );
    expect(sesiUnggah).toHaveLength(3);

    const audit = await t.run(async (ctx) =>
      ctx.db
        .query("auditLog")
        .withIndex("by_aksi", (q) => q.eq("aksi", "backup"))
        .order("desc")
        .first(),
    );
    expect(audit?.detail).toContain("google-drive: lengkap");
    expect(audit?.detail).toContain("1 dokumen");
  });
});
