/**
 * Utilitas sesi klien — ID sesi per perangkat (localStorage) & deteksi IP.
 *
 * sessionId: acak per perangkat, dipakai untuk Single Active Session (sesi
 * lama digugurkan saat login di perangkat lain) dan heartbeat TOTP gate.
 *
 * IP publik ditanyakan ke endpoint `/api/klien/ip` milik deployment sendiri,
 * bukan ke layanan luar: header proxy (`x-forwarded-for`) hanya terbaca server,
 * jadi angka yang dicatat adalah yang dilihat server. Sebelumnya peramban
 * memanggil api.ipify.org, yang diblokir CSP (`connect-src`) sehingga kolom IP
 * selalu "tidak diketahui" sambil mengirim alamat pemakai ke pihak ketiga.
 * IP ini hanya untuk log anomali, bukan otorisasi.
 */
import { dasarSitusConvex } from "./native";

const SESSION_KEY = "pindai.sessionId";

/** Selang pemakaian ulang IP yang sudah diambil (ms). */
const UMUR_IP_MS = 5 * 60 * 1000;

let ipTersimpan: { nilai: string; pada: number } | null = null;

function envVite(): Record<string, string | undefined> | undefined {
  return (import.meta as { env?: Record<string, string | undefined> }).env;
}

/**
 * URL endpoint IP klien untuk pasangan env tertentu; null bila env tidak diisi.
 * Aturan penurunan domainnya sama dengan jalur HTTP lain (`dasarSitusConvex`).
 */
export function urlIpKlien(urlConvex?: string, urlSitus?: string): string | null {
  const asal = dasarSitusConvex(urlConvex, urlSitus);
  return asal === null ? null : `${asal}/api/klien/ip`;
}

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

/**
 * IP pemakai menurut server, atau "tidak diketahui" bila endpointnya belum
 * bisa dihubungi. Satu hasil dipakai ulang 5 menit: satu rangkaian masuk
 * (kirim kode, verifikasi, buka sesi) cukup sekali panggil.
 */
export async function getClientIp(): Promise<string> {
  const sekarang = Date.now();
  if (ipTersimpan !== null && sekarang - ipTersimpan.pada < UMUR_IP_MS) {
    return ipTersimpan.nilai;
  }

  const env = envVite();
  const url = urlIpKlien(env?.VITE_CONVEX_URL, env?.VITE_CONVEX_SITE_URL);
  if (url === null) return "tidak diketahui";

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return "tidak diketahui";
    const data: { ip?: unknown } = await res.json();
    const ip = typeof data.ip === "string" ? data.ip.trim() : "";
    if (ip === "") return "tidak diketahui";
    ipTersimpan = { nilai: ip, pada: sekarang };
    return ip;
  } catch {
    // Jaringan putus atau endpoint belum siap: jangan simpan, coba lagi nanti.
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
