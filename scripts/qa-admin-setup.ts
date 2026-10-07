/**
 * Setup QA admin: masuk sebagai akun tamu baru, simpan token ke file sementara
 * agar skrip lanjutan bisa memakai identitas yang sama setelah dipromosikan.
 *
 * Jalankan: VITE_CONVEX_URL=<url> bunx tsx scripts/qa-admin-setup.ts
 */
import { ConvexHttpClient } from "convex/browser";
import { api } from "../src/convex/_generated/api";
import { writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const url = process.env.VITE_CONVEX_URL;
if (!url) {
  console.error("VITE_CONVEX_URL belum di-set.");
  process.exit(1);
}

const c = new ConvexHttpClient(url);
const res = await c.action(api.auth.signIn, {
  provider: "anonymous",
  params: {},
});
const token = res?.tokens?.token ?? res?.token;
if (!token) throw new Error("Sign-in anonim tidak mengembalikan token.");

// Identitas pengguna saat ini (butuh auth token)
c.setAuth(token);
const me = await c.query(api.users.currentUser);
if (!me?._id) throw new Error("Gagal membaca pengguna saat ini.");

// Promosikan via internal mutation (CLI Convex, akses deployment penuh)
execSync(
  `bunx convex run admin:qaPromoteUser '${JSON.stringify({ userId: me._id })}'`,
  { stdio: "pipe", cwd: process.cwd() },
);
console.log(`Akun QA dipromosikan menjadi admin (userId: ${me._id}).`);

writeFileSync("scripts/.qa-admin-token", token, "utf8");
console.log("Token QA admin tersimpan di scripts/.qa-admin-token");
