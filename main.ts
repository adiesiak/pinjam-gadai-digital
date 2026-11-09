/**
 * Server statis produksi (Deno + Hono).
 *
 * Semua berkas hasil build disajikan dari `./dist`, dan rute lain jatuh ke
 * `index.html` supaya React Router yang menentukan halamannya.
 *
 * Header keamanan dipasang DI SINI, bukan di HTML atau di klien: HSTS dan
 * X-Content-Type-Options hanya berlaku bila dikirim sebagai header respons, dan
 * `frame-ancestors` diabaikan bila ditulis sebagai <meta>. Nilai CSP ditulis
 * satu kali di bawah, dengan alasan tiap izin, supaya tidak ada pengecualian
 * yang ditambahkan tanpa sadar.
 */
import { Hono } from "hono";
import { serveStatic } from "hono/deno";

const app = new Hono();

/**
 * Asal Convex yang boleh dihubungi peramban.
 *
 * Diambil dari environment deployment bila ada, supaya deployment dengan domain
 * khusus tetap berjalan. Bila tidak terbaca, dipakai pola bawaan Convex:
 * `*.convex.cloud` untuk API dan WebSocket, `*.convex.site` untuk endpoint HTTP
 * (termasuk alur masuk OAuth).
 */
function asalConvex(): string {
  const url = Deno.env.get("VITE_CONVEX_URL") ?? Deno.env.get("CONVEX_URL") ?? "";
  try {
    const u = new URL(url);
    const ws = `${u.protocol === "https:" ? "wss:" : "ws:"}//${u.host}`;
    // Endpoint HTTP Convex Auth hidup di domain `.convex.site` pasangannya,
    // bukan di domain WebSocket `.convex.cloud`.
    const situs = u.host.replace(/\.convex\.cloud$/, ".convex.site");
    const asalSitus = `${u.protocol}//${situs}`;
    const wsSitus = `${u.protocol === "https:" ? "wss:" : "ws:"}//${situs}`;
    return `${u.origin} ${ws} ${asalSitus} ${wsSitus}`;
  } catch {
    return [
      "https://*.convex.cloud",
      "wss://*.convex.cloud",
      "https://*.convex.site",
      "wss://*.convex.site",
    ].join(" ");
  }
}

/**
 * Kebijakan keamanan isi.
 *
 * - `script-src 'self'`: tidak ada skrip sebaris. Skrip tema sudah dipindah ke
 *   `/tema-awal.js` khusus untuk ini. Worker & core Tesseract dibundel dari
 *   origin sendiri lewat `?url`, dan model OCR ada di `/ocr`; tidak ada CDN
 *   skrip. `challenges.cloudflare.com` tetap diperlukan untuk Turnstile.
 * - `'wasm-unsafe-eval'`: Tesseract menjalankan WebAssembly; tanpa izin ini
 *   pemindaian KTP gagal tanpa pesan yang jelas.
 * - `style-src 'unsafe-inline'`: React menulis atribut `style` (lebar bilah,
 *   posisi peta), dan atribut itu tunduk pada aturan yang sama.
 * - `img-src https:`: avatar Google, gambar QRIS, dan berkas dari storage Convex
 *   berasal dari host yang berbeda per deployment.
 * - `frame-src`: pratinjau kontrak memakai `srcdoc` (diizinkan `'self'`), peta
 *   memakai embed OpenStreetMap, Turnstile memakai iframe Cloudflare.
 */
function kebijakanCsp(): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "manifest-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval' https://challenges.cloudflare.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    `connect-src 'self' ${asalConvex()} https://challenges.cloudflare.com https://integrations.vly.ai`,
    "frame-src 'self' https://www.openstreetmap.org https://challenges.cloudflare.com",
    "upgrade-insecure-requests",
  ].join("; ");
}

const HEADER_KEAMANAN: Record<string, string> = {
  "Content-Security-Policy": kebijakanCsp(),
  // Setahun, tanpa `preload`: preload sulit dicabut bila ada subdomain lama
  // yang belum memakai HTTPS.
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // Popup dipakai alur masuk Google: `same-origin` penuh akan memutus
  // komunikasi jendela popup dengan halaman pembuka.
  "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
  // Kamera (pindai KTP), mikrofon (verifikasi video), dan lokasi (gerbang
  // lokasi) dipakai fitur aplikasi; selebihnya ditutup.
  "Permissions-Policy":
    "camera=(self), microphone=(self), geolocation=(self), payment=(), usb=(), magnetometer=(), gyroscope=()",
};

app.use("*", async (c, next) => {
  await next();
  // Header disalin ke respons baru: `Response` dari `serveStatic` membawa header
  // yang tidak selalu bisa diubah langsung.
  const respons = new Response(c.res.body, c.res);
  for (const [nama, nilai] of Object.entries(HEADER_KEAMANAN)) {
    respons.headers.set(nama, nilai);
  }
  c.res = respons;
});

// 1) Serve anything in /assets/**
app.use("/assets/*", serveStatic({ root: "./dist/assets" }));

// 2) Catch *all* other files in dist (CSS, JS, images, etc.)
app.use("*", serveStatic({ root: "./dist" }));

// 3) Fallback to index.html for the SPA
app.get("*", serveStatic({ path: "./dist/index.html" }));

Deno.serve(app.fetch);
