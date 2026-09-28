import { httpRouter } from "convex/server";

import { internal } from "./_generated/api";
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
 * (internal mutation) → `simpanTitik` (validasi wilayah, akurasi, lompatan).
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

export default http;
