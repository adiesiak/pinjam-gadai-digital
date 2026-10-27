import { httpRouter } from "convex/server";

import { api, internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { auth } from "./auth";
import { periksaTautanBerkas } from "./berkas";

const http = httpRouter();

auth.addHttpRoutes(http);

/**
 * Endpoint heartbeat lokasi untuk layanan native.
 *
 * Kenapa ini ada padahal sudah ada mutasi `lokasi.catatLokasi`: Android
 * membatasi permintaan jaringan yang berasal dari WebView setelah ±5 menit
 * aplikasi di latar belakang, sedangkan permintaan HTTP native tidak. Layanan
 * lokasi (foreground service Android / Background Modes iOS) juga tidak
 * memegang sesi Convex Auth, jadi ia mengirim titik dengan token perangkat.
 *
 * Alur: klien native → POST /lokasi/heartbeat (token) → `heartbeatNative`
 * (internal mutation) → `simpanTitik` (validasi wilayah, akurasi, lompatan,
 * dan deteksi mock location dari field `mock`).
 * Sumber titik ditetapkan SERVER sebagai "aplikasi", bukan diklaim klien.
 */

/** Batas ukuran body — cukup untuk satu titik, menutup body raksasa. */
const MAX_BODY_BYTE = 2_048;

/**
 * Header CORS. Aman memakai "*" karena endpoint ini diautentikasi token
 * (bukan cookie), sehingga tidak ada kredensial yang ikut terkirim otomatis.
 */
const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

function balas(status: number, isi: unknown): Response {
  return new Response(JSON.stringify(isi), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

/**
 * Header CORS untuk endpoint BACA (pengaturan aplikasi). Aman `*` karena
 * endpointnya publik dan tidak menerima kredensial apa pun.
 */
const CORS_BACA: Record<string, string> = {
  ...CORS,
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

/** Token dari header `Authorization: Bearer ...` atau field `token`. */
function tokenDari(request: Request, isi: Record<string, unknown>): string {
  const otorisasi = request.headers.get("Authorization") ?? "";
  if (otorisasi.toLowerCase().startsWith("bearer ")) {
    const dariHeader = otorisasi.slice(7).trim();
    if (dariHeader !== "") return dariHeader;
  }
  return typeof isi.token === "string" ? isi.token.trim() : "";
}

function angkaMasuk(isi: Record<string, unknown>, kunci: string): number | null {
  const nilai = isi[kunci];
  return typeof nilai === "number" && Number.isFinite(nilai) ? nilai : null;
}

http.route({
  path: "/lokasi/heartbeat",
  method: "OPTIONS",
  handler: httpAction(async () => new Response(null, { status: 204, headers: CORS })),
});

http.route({
  path: "/lokasi/heartbeat",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const mentah = await request.text();
    if (mentah.length > MAX_BODY_BYTE) {
      return balas(413, { ok: false, error: "Body terlalu besar." });
    }

    let diurai: unknown;
    try {
      diurai = JSON.parse(mentah);
    } catch {
      return balas(400, { ok: false, error: "Body harus berupa JSON." });
    }
    if (typeof diurai !== "object" || diurai === null || Array.isArray(diurai)) {
      return balas(400, { ok: false, error: "Body harus berupa objek JSON." });
    }
    const isi = diurai as Record<string, unknown>;

    const token = tokenDari(request, isi);
    if (token === "") {
      return balas(401, { ok: false, error: "Token perangkat wajib dikirim." });
    }

    const lat = angkaMasuk(isi, "lat");
    const lng = angkaMasuk(isi, "lng");
    const akurasi = angkaMasuk(isi, "akurasi");
    if (lat === null || lng === null || akurasi === null) {
      return balas(400, {
        ok: false,
        error: "`lat`, `lng`, dan `akurasi` wajib berupa angka.",
      });
    }

    try {
      const hasil = await ctx.runMutation(internal.lokasi.heartbeatNative, {
        token,
        lat,
        lng,
        akurasi,
        platform: typeof isi.platform === "string" ? isi.platform : undefined,
        versiApp: typeof isi.versiApp === "string" ? isi.versiApp : undefined,
        // Perangkat yang jujur melaporkan mock location-nya sendiri; titik itu
        // ditolak `simpanTitik` (yang juga punya heuristik tanpa kerja sama
        // klien: akurasi mustahil & lompatan tidak wajar).
        mock: isi.mock === true ? true : undefined,
      });
      if (!hasil.ok) {
        return balas(401, { ok: false, error: "Token perangkat tidak dikenal." });
      }
      return balas(200, { ok: true, waktu: hasil.waktu });
    } catch (err) {
      // Validasi titik (di luar wilayah, akurasi buruk, lompatan mustahil)
      // berasal dari `simpanTitik`; pesannya sudah siap ditampilkan ke pengguna.
      const pesan = err instanceof Error ? err.message : "Gagal menyimpan titik lokasi.";
      return balas(400, { ok: false, error: pesan });
    }
  }),
});

/**
 * Pengaturan aplikasi Android untuk klien apa pun.
 *
 * Kenapa lewat HTTP, bukan hanya query Convex: aplikasi Android boleh jadi
 * pembungkus WebView/native yang tidak memakai SDK Convex (mis. Kotlin, Flutter,
 * atau Capacitor). Endpoint GET sederhana ini memuat splash screen, logo, nama,
 * dan warna yang diatur admin dari panel — jadi ganti splash/logo tidak perlu
 * build ulang: aplikasi cukup memuat ulang endpoint ini saat dibuka.
 *
 * Isinya sama persis dengan `api.androidApp.asetAktif` (satu sumber di
 * lib/asetAndroidApp), tidak ada data sensitif, dan tanpa autentikasi.
 */
http.route({
  path: "/api/aplikasi-android",
  method: "OPTIONS",
  handler: httpAction(async () => new Response(null, { status: 204, headers: CORS_BACA })),
});

http.route({
  path: "/api/aplikasi-android",
  method: "GET",
  handler: httpAction(async (ctx) => {
    try {
      const data = await ctx.runQuery(api.androidApp.asetAktif, {});
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: {
          ...CORS_BACA,
          "Content-Type": "application/json",
          // Selalu segar: aplikasi memakainya sebagai sumber aset saat dibuka.
          "Cache-Control": "no-store",
        },
      });
    } catch (err) {
      const pesan = err instanceof Error ? err.message : "Gagal membaca pengaturan aplikasi.";
      return new Response(JSON.stringify({ ok: false, error: pesan }), {
        status: 500,
        headers: { ...CORS_BACA, "Content-Type": "application/json" },
      });
    }
  }),
});

/**
 * ENDPOINT HALAMAN CEK STATUS (tautan WhatsApp).
 *
 * Kenapa lewat HTTP action, bukan mutasi Convex biasa: hanya HTTP action yang
 * memegang header permintaan, sehingga **IP pemakai** bisa dibaca server
 * (`x-forwarded-for` / `cf-connecting-ip`) — bukan diklaim klien. Audit
 * verifikasi memang harus bisa dipertanggungjawabkan siapa-dari-mana, dan IP
 * yang dikirim klien tidak bisa dipercaya.
 *
 * Ketiganya publik (peminjam belum tentu punya akun aktif) tetapi tidak pernah
 * menerima kredensial: otorisasinya adalah token tautan 128 bit milik satu
 * pinjaman, dan setiap batas (jeda ping, kuota harian, jumlah unggahan)
 * ditegakkan di mutasi internal, bukan di klien.
 */

/** Batas body JSON endpoint cek-status — cukup untuk satu titik/verifikasi. */
const MAX_BODY_CEK_STATUS = 2_048;

/** IP pemakai dari header proxy; string kosong bila tidak ada. */
function ipPemakai(request: Request): string {
  const diteruskan = (request.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ?? "";
  const kandidat = diteruskan !== "" ? diteruskan : (request.headers.get("cf-connecting-ip") ?? "").trim();
  return kandidat.slice(0, 64);
}

/** User agent pemakai (dipotong agar tidak membengkakkan baris audit). */
function uaPemakai(request: Request): string {
  return (request.headers.get("user-agent") ?? "").slice(0, 200);
}

/**
 * IP pemakai menurut server, untuk log anomali masuk (TOTP, klaim akun lama).
 *
 * Peramban tidak bisa membaca header proxy sendiri, jadi sebelum ini halaman
 * menanyakan IP-nya ke layanan pihak ketiga — permintaan itu diblokir CSP dan
 * mengirim alamat pemakai ke luar. Endpoint ini menjawab dari header yang sama
 * dengan `/api/cek-status/*`, tanpa pihak ketiga. Publik dan tanpa kredensial:
 * isinya hanya alamat pemanggil itu sendiri.
 */
http.route({
  path: "/api/klien/ip",
  method: "GET",
  handler: httpAction(async (_ctx, request) => {
    return new Response(JSON.stringify({ ip: ipPemakai(request) }), {
      status: 200,
      headers: {
        ...CORS_BACA,
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  }),
});

/** Urai body JSON objek dengan batas ukuran; null bila tidak sah. */
function uraiObjek(mentah: string): Record<string, unknown> | null {
  if (mentah.length > MAX_BODY_CEK_STATUS) return null;
  try {
    const nilai: unknown = JSON.parse(mentah);
    if (typeof nilai !== "object" || nilai === null || Array.isArray(nilai)) return null;
    return nilai as Record<string, unknown>;
  } catch {
    return null;
  }
}

for (const lokasiCekStatus of ["/api/cek-status/titik", "/api/cek-status/url-unggah", "/api/cek-status/verifikasi"]) {
  http.route({
    path: lokasiCekStatus,
    method: "OPTIONS",
    handler: httpAction(async () => new Response(null, { status: 204, headers: CORS })),
  });
}

http.route({
  path: "/api/cek-status/url-unggah",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const isi = uraiObjek(await request.text());
    if (isi === null) return balas(400, { ok: false, error: "Body harus berupa objek JSON yang wajar." });
    const token = typeof isi.token === "string" ? isi.token : "";
    try {
      const hasil = await ctx.runMutation(internal.tautanStatus.urlUnggahSelfie, { token });
      if (!hasil.ok) return balas(403, { ok: false, error: hasil.pesan });
      return balas(200, { ok: true, url: hasil.url, maksByte: hasil.maksByte });
    } catch (err) {
      const pesan = err instanceof Error ? err.message : "Gagal menyiapkan unggahan foto.";
      return balas(400, { ok: false, error: pesan });
    }
  }),
});

http.route({
  path: "/api/cek-status/titik",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const isi = uraiObjek(await request.text());
    if (isi === null) return balas(400, { ok: false, error: "Body harus berupa objek JSON yang wajar." });
    const token = typeof isi.token === "string" ? isi.token : "";
    const lat = angkaMasuk(isi, "lat");
    const lng = angkaMasuk(isi, "lng");
    const akurasi = angkaMasuk(isi, "akurasi");
    if (lat === null || lng === null || akurasi === null) {
      return balas(400, { ok: false, error: "`lat`, `lng`, dan `akurasi` wajib berupa angka." });
    }
    try {
      const hasil = await ctx.runMutation(internal.tautanStatus.updateBorrowerLiveLocation, {
        token,
        lat,
        lng,
        akurasi,
        ipAddress: ipPemakai(request),
        userAgent: uaPemakai(request),
      });
      // Ping yang terlalu rapat diabaikan dengan status 200: itu bukan galat
      // pengguna, dan klien tidak perlu menampilkan apa pun.
      if (!hasil.ok) return balas(200, { ok: false, diabaikan: true, error: hasil.pesan });
      return balas(200, { ok: true, waktu: hasil.waktu, catatan: hasil.catatan });
    } catch (err) {
      const pesan = err instanceof Error ? err.message : "Gagal menyimpan titik lokasi.";
      return balas(400, { ok: false, error: pesan });
    }
  }),
});

http.route({
  path: "/api/cek-status/verifikasi",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const isi = uraiObjek(await request.text());
    if (isi === null) return balas(400, { ok: false, error: "Body harus berupa objek JSON yang wajar." });
    const token = typeof isi.token === "string" ? isi.token : "";
    const fileId = typeof isi.fileId === "string" ? isi.fileId : "";
    const diambilPada = angkaMasuk(isi, "diambilPada");
    if (fileId === "" || diambilPada === null) {
      return balas(400, { ok: false, error: "`fileId` dan `diambilPada` wajib dikirim." });
    }
    // Bentuk ID penyimpanan disaring DI SINI (panjang & karakter) supaya
    // permintaan yang jelas ngawur tidak sampai ke penyimpanan; kebenaran ID-nya
    // sendiri diperiksa mutasi lewat keberadaan baris `_storage`.
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(fileId)) {
      return balas(400, {
        ok: false,
        error: "ID berkas foto tidak sah. Ambil ulang foto verifikasi dari halaman ini.",
      });
    }
    const lat = angkaMasuk(isi, "lat");
    const lng = angkaMasuk(isi, "lng");
    const akurasi = angkaMasuk(isi, "akurasi");
    try {
      const hasil = await ctx.runMutation(internal.tautanStatus.catatVerifikasi, {
        token,
        // Mutasi memverifikasi bahwa berkasnya benar-benar ada dan ukurannya
        // wajar; ID yang tidak ada berakhir sebagai pesan jujur ke peminjam.
        selfieFileId: fileId,
        diambilPada,
        ...(lat !== null ? { lat } : {}),
        ...(lng !== null ? { lng } : {}),
        ...(akurasi !== null ? { akurasi } : {}),
        ipAddress: ipPemakai(request),
        userAgent: uaPemakai(request),
      });
      if (!hasil.ok) return balas(400, { ok: false, error: hasil.pesan });
      return balas(200, { ok: true, waktu: hasil.waktu });
    } catch (err) {
      const pesan = err instanceof Error ? err.message : "Gagal menyimpan verifikasi.";
      return balas(400, { ok: false, error: pesan });
    }
  }),
});

/**
 * Penyaji berkas sensitif (KTP, selfie, slip, foto jaminan).
 *
 * Bukan `ctx.storage.getUrl()`: URL penyimpanan Convex permanen dan terbuka
 * bagi siapa pun yang memegangnya. Tautan di sini harus membawa tanda tangan
 * berumur pendek yang dibuat `berkas.tautanBerkas`, jadi tautan yang pernah
 * diteruskan berhenti bekerja setelah satu jam.
 */
http.route({
  path: "/berkas",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const id = url.searchParams.get("id") ?? "";
    const exp = Number(url.searchParams.get("exp"));
    const sig = url.searchParams.get("sig") ?? "";

    // Rahasia yang hilang bukan tautan palsu: bedakan jawabannya supaya admin
    // membaca "konfigurasi belum lengkap", bukan "tautan kedaluwarsa".
    let sah: boolean;
    try {
      sah = await periksaTautanBerkas({ id, exp, sig });
    } catch (galat) {
      console.error("Tautan berkas tidak bisa diverifikasi:", galat);
      return new Response(
        "Berkas belum bisa disajikan: rahasia penanda tangan tautan belum diset di environment deployment.",
        {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
        },
      );
    }
    if (!sah) {
      return new Response("Tautan berkas tidak valid atau sudah kedaluwarsa.", {
        status: 403,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      });
    }

    // Bentuk ID disaring sebelum menyentuh penyimpanan; tanda tangan di atas
    // sudah memastikan ID ini yang diterbitkan server, bukan tebakan pemanggil.
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(id)) {
      return new Response("Berkas tidak ditemukan.", {
        status: 404,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      });
    }

    const blob = await ctx.storage.get(id as Id<"_storage">);
    if (blob === null) {
      return new Response("Berkas tidak ditemukan.", {
        status: 404,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      });
    }

    return new Response(blob, {
      headers: {
        "Content-Type": blob.type || "application/octet-stream",
        "Content-Disposition": "inline",
        // Jangan disimpan di cache publik: tautannya pribadi dan berumur pendek.
        "Cache-Control": "private, max-age=60",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }),
});

export default http;
