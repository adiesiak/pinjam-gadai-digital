import { httpRouter } from "convex/server";

import { api, internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";

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

export default http;
