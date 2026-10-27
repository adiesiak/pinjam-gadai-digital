/** Run: bun src/lib/session.test.ts — utilitas sesi klien (pure). */
import { deviceLabelFromUa, samarkanIp, urlIpKlien } from "./session";

let passed = 0;
let failed = 0;
function eq(label: string, actual: unknown, expected: unknown): void {
  if (actual === expected) passed += 1;
  else {
    failed += 1;
    console.error(`✗ ${label}: diharapkan ${JSON.stringify(expected)}, dapat ${JSON.stringify(actual)}`);
  }
}
function ok(label: string, kondisi: boolean): void {
  eq(label, kondisi, true);
}

// --- Penyamaran IP --------------------------------------------------------
eq("IPv4 → dua oktet pertama", samarkanIp("36.85.123.9"), "36.85.*.*");
eq("IPv4 berbeda tetap dua oktet", samarkanIp("10.0.0.1"), "10.0.*.*");
eq("IPv6 → dua kelompok pertama", samarkanIp("2404:6800:4003:c00::"), "2404:6800:*");
eq("nilai kosong → tidak diketahui", samarkanIp("   "), "tidak diketahui");
eq("nilai tak dikenal tetap apa adanya", samarkanIp("tidak diketahui"), "tidak diketahui");
ok("tidak ada bintang-berlebih untuk IPv6", !samarkanIp("2404:6800:1:2:3:4:5:6").includes("2404:6800:1"));
ok("oktet terakhir IPv4 tidak bocor", !samarkanIp("36.85.123.9").includes("123.9"));

// --- Label perangkat dari User-Agent --------------------------------------
eq("iPhone dikenali", deviceLabelFromUa("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)"), "iOS");
eq("Android dikenali", deviceLabelFromUa("Mozilla/5.0 (Linux; Android 14)"), "Android");
eq("Windows dikenali", deviceLabelFromUa("Mozilla/5.0 (Windows NT 10.0)"), "Windows");
eq("macOS dikenali", deviceLabelFromUa("Mozilla/5.0 (Macintosh; Intel Mac OS X)"), "macOS");
eq("UA asing → perangkat tidak dikenal", deviceLabelFromUa("curl/8.0"), "Perangkat tidak dikenal");

// --- Endpoint IP klien ----------------------------------------------------
// Alamatnya diturunkan dari env yang sama dengan jalur HTTP lain: domain
// cloud (klien) diterjemahkan ke domain situs tempat HTTP action hidup.
eq(
  "domain cloud diturunkan ke domain situs",
  urlIpKlien("https://dapper-goshawk-437.convex.cloud", undefined),
  "https://dapper-goshawk-437.convex.site/api/klien/ip",
);
eq(
  "domain situs dipakai apa adanya (garis miring dibuang)",
  urlIpKlien("https://abc.convex.cloud", "https://abc.convex.site/"),
  "https://abc.convex.site/api/klien/ip",
);
eq("tanpa env tidak ada alamat", urlIpKlien(undefined, undefined), null);
eq("env kosong tidak menghasilkan alamat", urlIpKlien("", ""), null);

console.log(`session tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
