/** Uji validasi URL gateway WhatsApp (anti-SSRF) tanpa server. */
import { validasiGatewayUrl } from "./waUrl";

let passed = 0;
let failed = 0;

function eq(label: string, actual: unknown, expected: unknown): void {
  if (actual === expected) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`✗ ${label}: diharapkan ${String(expected)}, dapat ${String(actual)}`);
  }
}

function ok(label: string, kondisi: boolean): void {
  eq(label, kondisi, true);
}

function tolak(label: string, url: string): void {
  ok(label, !validasiGatewayUrl(url).ok);
}

// ===== URL yang diterima =====
ok("endpoint gateway https biasa diterima", validasiGatewayUrl("https://api.fonnte.com/send").ok);
ok("path & query diterima", validasiGatewayUrl("https://graph.facebook.com/v20.0/123/messages?x=1").ok);
ok("port 443 eksplisit diterima", validasiGatewayUrl("https://api.example.co.id:443/hook").ok);
ok("spasi di tepi dimaafkan", validasiGatewayUrl("  https://api.example.com/send  ").ok);

// ===== Skema & kredensial =====
tolak("http ditolak", "http://api.example.com/send");
tolak("ftp ditolak", "ftp://api.example.com/send");
tolak("kredensial di URL ditolak", "https://user:rahasia@api.example.com/send");
tolak("URL kosong ditolak", "");
tolak("URL ngawur ditolak", "bukan-url");
tolak("URL terlalu panjang ditolak", `https://api.example.com/${"a".repeat(600)}`);

// ===== IP literal (termasuk bentuk alternatif yang dinormalkan parser) =====
tolak("IPv4 loopback ditolak", "https://127.0.0.1/send");
tolak("IPv4 privat ditolak", "https://10.0.0.5/send");
tolak("IPv4 metadata cloud ditolak", "https://169.254.169.254/latest/meta-data");
tolak("IPv4 heksadesimal ditolak", "https://0x7f000001/send");
tolak("IPv4 desimal ditolak", "https://2130706433/send");
tolak("IPv4 bentuk pendek ditolak", "https://127.1/send");
tolak("IPv6 loopback ditolak", "https://[::1]/send");
tolak("IPv6 mapped ditolak", "https://[::ffff:127.0.0.1]/send");

// ===== Host internal & wildcard DNS =====
tolak("localhost ditolak", "https://localhost/send");
tolak("subdomain localhost ditolak", "https://app.localhost/send");
tolak("single-label/internal ditolak", "https://intranet/send");
tolak("domain .local ditolak", "https://server.local/send");
tolak("domain .internal ditolak", "https://api.internal/send");
tolak("metadata.google.internal ditolak", "https://metadata.google.internal/computeMetadata/v1");
tolak("nip.io ditolak", "https://127.0.0.1.nip.io/send");
tolak("sslip.io ditolak", "https://10-0-0-5.sslip.io/send");
tolak("xip.io ditolak", "https://foo.xip.io/send");
tolak("localtest.me ditolak", "https://localtest.me/send");
tolak("trailing dot ditolak", "https://api.example.com./send");

// ===== Port =====
tolak("port non-standar ditolak", "https://api.example.com:8443/send");
tolak("port 80 ditolak", "https://api.example.com:80/send");

console.log(`waUrl tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
