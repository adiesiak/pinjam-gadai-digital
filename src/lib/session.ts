/**
 * Utilitas sesi klien — ID sesi per perangkat (localStorage) & deteksi IP.
 *
 * sessionId: acak per perangkat, dipakai untuk Single Active Session (sesi
 * lama digugurkan saat login di perangkat lain) dan heartbeat TOTP gate.
 * IP publik dideteksi via api.ipify.org (gratis) — hanya untuk log anomali,
 * bukan otorisasi (server tetap memverifikasi identitas via token).
 */

const SESSION_KEY = "pindai.sessionId";

export function getSessionId(): string {
  if (typeof window === "undefined") return "server";
  let id = localStorage.getItem(SESSION_KEY);
  if (id === null) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    id = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export async function getClientIp(): Promise<string> {
  try {
    const res = await fetch("https://api.ipify.org?format=json", {
      signal: AbortSignal.timeout(4000),
    });
    const data: { ip?: string } = await res.json();
    return data.ip ?? "tidak diketahui";
  } catch {
    return "tidak diketahui";
  }
}

export function getUserAgent(): string {
  return typeof navigator !== "undefined" ? navigator.userAgent : "unknown";
}

export function deviceLabelFromUa(ua: string): string {
  if (/iphone|ipad|ipod/i.test(ua)) return "iOS";
  if (/android/i.test(ua)) return "Android";
  if (/windows/i.test(ua)) return "Windows";
  if (/mac os/i.test(ua)) return "macOS";
  if (/linux/i.test(ua)) return "Linux";
  return "Perangkat tidak dikenal";
}

/**
 * Samarkan alamat IP untuk ditampilkan ke pemilik akun.
 *
 * Tujuannya menolong pemilik mengenali "ini saya" tanpa menyimpan alamat
 * lengkap di layar yang mungkin terlihat orang lain (atau difoto). Aturan:
 *  - IPv4  → dua oktet pertama tampil, sisanya bintang (`36.85.*.*`).
 *  - IPv6/format lain → dua kelompok pertama, sisanya bintang.
 *  - Nilai kosong/tak dikenal → dikembalikan apa adanya (jangan mengarang).
 */
export function samarkanIp(ip: string): string {
  const bersih = ip.trim();
  if (bersih === "" || bersih === "tidak diketahui") return "tidak diketahui";
  if (bersih.includes(":")) {
    const bagian = bersih.split(":");
    if (bagian.length < 2) return "***";
    return `${bagian[0]}:${bagian[1]}:*`;
  }
  const oktet = bersih.split(".");
  if (oktet.length < 2) return "***";
  return `${oktet[0]}.${oktet[1]}.*.*`;
}
