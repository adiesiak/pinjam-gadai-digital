/** Run: bun src/lib/unggahDokumen.test.ts */
import { MAX_FILE_BYTES } from "./kyc";
import { unggahDokumen } from "./unggahDokumen";

let passed = 0;
let failed = 0;

function eq(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) passed += 1;
  else {
    failed += 1;
    console.error(
      `FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

/** Menegaskan pemanggilan ditolak dengan pesan yang cocok pola. */
async function tolak(
  jalankan: () => Promise<unknown>,
  pola: RegExp,
  label: string,
) {
  try {
    await jalankan();
  } catch (e) {
    const pesan = e instanceof Error ? e.message : String(e);
    if (pola.test(pesan)) {
      passed += 1;
    } else {
      failed += 1;
      console.error(`FAIL ${label}: pesan "${pesan}" tidak cocok ${pola}`);
    }
    return;
  }
  failed += 1;
  console.error(`FAIL ${label}: seharusnya menolak, malah berhasil`);
}

function berkas(ukuran: number, nama = "dokumen.png", tipe = "image/png"): File {
  return new File([new Uint8Array(ukuran)], nama, { type: tipe });
}

/** Jalankan dengan `fetch` tiruan, lalu kembalikan fetch asli apa pun hasilnya. */
async function denganFetch(
  palsu: typeof fetch,
  jalankan: () => Promise<void>,
): Promise<void> {
  const asli = globalThis.fetch;
  globalThis.fetch = palsu;
  try {
    await jalankan();
  } finally {
    globalThis.fetch = asli;
  }
}

const URL_TIRUAN = "https://storage.example/v1/upload?id=abc";
const mintaUrlSukses = async () => URL_TIRUAN;

// ===== batas ukuran: dicek sebelum minta URL =====
{
  let dipanggil = 0;
  await tolak(
    () =>
      unggahDokumen(
        berkas(MAX_FILE_BYTES + 1),
        async () => {
          dipanggil += 1;
          return URL_TIRUAN;
        },
      ),
    /maksimal 5 MB/i,
    "berkas di atas batas ditolak",
  );
  eq(dipanggil, 0, "berkas kebesaran tidak memanggil server (tanpa URL)");

  await tolak(
    () => unggahDokumen(berkas(MAX_FILE_BYTES + 1), mintaUrlSukses, "Foto KTP"),
    /Foto KTP maksimal 5 MB/i,
    "label ikut tampil di pesan ukuran",
  );
}

// ===== badan galat kosong (500) =====
// Kasus paling mudah lolos: `res.json()` dulu baru cek `res.ok` → SyntaxError.
// Implementasi wajib memeriksa status HTTP lebih dulu.
await denganFetch(
  async () => new Response(null, { status: 500, statusText: "Server Error" }),
  async () => {
    await tolak(
      () => unggahDokumen(berkas(1_000), mintaUrlSukses),
      /gagal diunggah/i,
      "HTTP non-ok dengan badan kosong",
    );
  },
);

await denganFetch(
  async () =>
    new Response("<html>502 Bad Gateway</html>", {
      status: 502,
      headers: { "Content-Type": "text/html" },
    }),
  async () => {
    await tolak(
      () => unggahDokumen(berkas(1_000), mintaUrlSukses, "Selfie KTP"),
      /Selfie KTP gagal diunggah/i,
      "HTTP non-ok dengan badan bukan JSON",
    );
  },
);

// ===== sukses HTTP tapi tanpa storageId =====
await denganFetch(
  async () =>
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  async () => {
    await tolak(
      () => unggahDokumen(berkas(1_000), mintaUrlSukses),
      /gagal diunggah/i,
      "respons sukses tanpa storageId",
    );
  },
);

// ===== sukses HTTP tapi badan bukan JSON =====
await denganFetch(
  async () =>
    new Response("bukan json", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    }),
  async () => {
    await tolak(
      () => unggahDokumen(berkas(1_000), mintaUrlSukses),
      /gagal diunggah/i,
      "respons sukses dengan badan bukan JSON",
    );
  },
);

// ===== jalur sukses =====
{
  let terpakaiUrl: RequestInfo | URL | null = null;
  let metode: string | undefined;
  let tipeKonten: string | null = null;
  await denganFetch(
    (async (input: RequestInfo | URL, init?: RequestInit) => {
      terpakaiUrl = input;
      metode = init?.method;
      tipeKonten = new Headers(init?.headers).get("Content-Type");
      return new Response(JSON.stringify({ storageId: "storage-123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch,
    async () => {
      const id = await unggahDokumen(berkas(1_000), mintaUrlSukses);
      eq(id, "storage-123", "storageId dikembalikan apa adanya");
    },
  );
  eq(String(terpakaiUrl), URL_TIRUAN, "URL dari mintaUrl yang dipakai");
  eq(metode, "POST", "berkas dikirim dengan POST");
  eq(tipeKonten, "image/png", "tipe berkas jadi Content-Type");
}

// Berkas tepat pada batas masih boleh diunggah (`>` bukan `>=`).
await denganFetch(
  async () =>
    new Response(JSON.stringify({ storageId: "storage-batas" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  async () => {
    const id = await unggahDokumen(berkas(MAX_FILE_BYTES), mintaUrlSukses);
    eq(id, "storage-batas", "berkas tepat di batas ukuran diterima");
  },
);

// Tanpa tipe (file.type kosong) tetap terkirim sebagai octet-stream.
{
  let tipeKonten: string | null = null;
  await denganFetch(
    (async (_input: RequestInfo | URL, init?: RequestInit) => {
      tipeKonten = new Headers(init?.headers).get("Content-Type");
      return new Response(JSON.stringify({ storageId: "storage-x" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch,
    async () => {
      await unggahDokumen(berkas(1_000, "tanpa-tipe", ""), mintaUrlSukses);
    },
  );
  eq(tipeKonten, "application/octet-stream", "tipe kosong jadi octet-stream");
}

console.log(`unggahDokumen.test: ${passed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
