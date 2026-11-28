/**
 * Validasi URL gateway WhatsApp — pengerasan anti-SSRF.
 *
 * Dipakai saat admin menyimpan konfigurasi DAN saat pengiriman (fail-closed):
 * URL yang tidak lolos aturan tidak pernah di-fetch. Yang bisa ditegakkan
 * tanpa resolver DNS sendiri: skema HTTPS, tanpa kredensial di URL, hostname
 * domain publik (bukan IP literal/localhost/domain internal), port HTTPS
 * standar, dan penolakan layanan wildcard-DNS yang lazim dipakai menembus
 * filter SSRF.
 */

/** Layanan DNS wildcard yang bisa memetakan nama domain ke IP privat. */
const LAYANAN_WILDCARD_DNS: readonly string[] = [
  "nip.io",
  "sslip.io",
  "xip.io",
  "traefik.me",
  "localtest.me",
  "lvh.me",
  "vcap.me",
];

export type HasilValidasiGateway = { ok: true } | { ok: false; alasan: string };

export function validasiGatewayUrl(mentah: string): HasilValidasiGateway {
  const teks = mentah.trim();
  if (teks.length === 0 || teks.length > 500) {
    return { ok: false, alasan: "URL wajib diisi (maksimal 500 karakter)." };
  }

  let url: URL;
  try {
    url = new URL(teks);
  } catch {
    return { ok: false, alasan: "URL tidak dapat diurai." };
  }

  if (url.protocol !== "https:") {
    return { ok: false, alasan: "Endpoint wajib memakai HTTPS." };
  }
  if (url.username !== "" || url.password !== "") {
    return {
      ok: false,
      alasan: "URL tidak boleh memuat kredensial (bentuk user:pass@host).",
    };
  }
  if (url.port !== "" && url.port !== "443") {
    return { ok: false, alasan: "Gunakan port HTTPS standar (443)." };
  }

  const host = url.hostname.toLowerCase();
  if (host.length === 0 || host.endsWith(".")) {
    return { ok: false, alasan: "Hostname tidak valid." };
  }
  if (host.startsWith("[")) {
    return {
      ok: false,
      alasan: "Alamat IP literal tidak diizinkan — pakai nama domain publik.",
    };
  }
  // URL parser menormalkan bentuk alternatif IPv4 (oktal, desimal, bentuk
  // pendek seperti 127.1) menjadi titik-desimal, jadi satu regex ini
  // menangkap seluruh variasi penulisan IP.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    return {
      ok: false,
      alasan: "Alamat IP literal tidak diizinkan — pakai nama domain publik.",
    };
  }
  if (!host.includes(".")) {
    return { ok: false, alasan: "Hostname harus berupa nama domain publik." };
  }
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "metadata.google.internal" ||
    host.endsWith(".metadata.goog")
  ) {
    return { ok: false, alasan: "Host lokal/internal tidak diizinkan." };
  }
  for (const domain of LAYANAN_WILDCARD_DNS) {
    if (host === domain || host.endsWith(`.${domain}`)) {
      return {
        ok: false,
        alasan: "Layanan DNS wildcard (mis. nip.io/xip.io) tidak diizinkan.",
      };
    }
  }

  return { ok: true };
}

/**
 * URL pemeriksaan kesehatan dari `apiUrl` gateway WhatsApp.
 *
 * `null` berarti gateway ini tidak punya endpoint kesehatan yang bisa ditanya.
 * Fonnte hanya menyediakan `/send`, jadi menembaknya dengan `/health` akan
 * menghasilkan 404 dan peringatan palsu setiap kali.
 *
 * Gateway generik yang dipasang PINDAI (lihat `deploy/wa-sender/server.mjs`)
 * melayani `GET /health` yang membalas `{ok, siap, alasan}`.
 */
export function urlKesehatanGateway(apiUrl: string): string | null {
  let u: URL;
  try {
    u = new URL(apiUrl.trim());
  } catch {
    return null;
  }
  if (u.hostname.toLowerCase() === "api.fonnte.com") return null;
  if (!/\/send\/?$/.test(u.pathname)) return null;
  u.pathname = u.pathname.replace(/\/send\/?$/, "/health");
  u.search = "";
  u.hash = "";
  return u.toString();
}
