/**
 * Inspeksi antrean admin — menampilkan seluruh pinjaman & gadai beserta statusnya.
 * VITE_CONVEX_URL=<url> bunx tsx scripts/qa-inspect.ts
 */
import { ConvexHttpClient } from "convex/browser";
import { readFileSync } from "node:fs";
import { api } from "../src/convex/_generated/api";

const url = process.env.VITE_CONVEX_URL;
if (!url) {
  console.error("VITE_CONVEX_URL belum di-set.");
  process.exit(1);
}

const c = new ConvexHttpClient(url);
c.setAuth(readFileSync("scripts/.qa-admin-token", "utf8").trim());
const o = await c.query(api.admin.adminOverview);

console.log(`Antrean (${o.loans.length} pinjaman, ${o.pawns.length} gadai):`);
for (const l of o.loans) {
  console.log(
    `  LOAN ${l.nomorReferensi} | ${l.status} | pokok=${l.pokokPinjaman} | ${l.emailPeminjam ?? "?"}`,
  );
}
for (const p of o.pawns) {
  console.log(
    `  PAWN ${p.nomorReferensi} | ${p.status} | kategori=${p.kategori} | taksiran=${p.nilaiTaksiran ?? "-"} | ${p.emailPeminjam ?? "?"}`,
  );
}
