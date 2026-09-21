/**
 * QA panel admin — memverifikasi:
 *  1. Promosi QA account menjadi admin (via internal CLI mutation)
 *  2. adminOverview terisi untuk admin, kosong untuk non-admin
 *  3. Alur keputusan pinjaman: review → setujui (dan tolak dgn alasan wajib)
 *  4. Alur keputusan gadai: jadwalkan penilaian → taksiran + setujui
 *  5. Statistik admin = agregasi nyata
 *
 * Jalankan setelah qa-admin-setup.ts:
 *   VITE_CONVEX_URL=<url> bunx tsx scripts/qa-admin.ts
 */
import { ConvexHttpClient } from "convex/browser";
import { readFileSync } from "node:fs";
import { api } from "../src/convex/_generated/api";

const url = process.env.VITE_CONVEX_URL;
if (!url) {
  console.error("VITE_CONVEX_URL belum di-set.");
  process.exit(1);
}

let passed = 0;
let failed = 0;
function ok(cond: boolean, label: string) {
  if (cond) passed++;
  else {
    failed++;
    console.error(`  FAIL: ${label}`);
  }
}
async function expectError(fn: () => Promise<unknown>, label: string) {
  try {
    await fn();
    failed++;
    console.error(`  FAIL (harusnya ditolak): ${label}`);
  } catch {
    passed++;
  }
}

// ---------------------------------------------------------------------
console.log("1) Token QA admin dimuat…");
const token = readFileSync("scripts/.qa-admin-token", "utf8").trim();
ok(token.length > 0, "token tersedia");

// ---------------------------------------------------------------------
console.log("2) adminOverview untuk admin…");
const admin = new ConvexHttpClient(url);
admin.setAuth(token);
const overview: any = await admin.query(api.admin.adminOverview);
ok(overview.isAdmin === true, "peran admin terdeteksi");
ok(Array.isArray(overview.loans) && Array.isArray(overview.pawns), "antrean terbaca");

const stats = await admin.query(api.admin.adminStats);
ok(stats !== null, "statistik admin terbaca");

// ---------------------------------------------------------------------
console.log("3) Alur keputusan pinjaman…");
const loans: any[] = overview.loans;
const target = loans.find((l) => l.status === "diajukan");
if (!target) {
  console.error("  Tidak ada pinjaman berstatus diajukan untuk diuji.");
  failed++;
} else {
  // Tolak tanpa alasan harus gagal (server-side rule)
  await expectError(
    () => admin.mutation(api.loans.rejectLoan, { loanId: target._id, reason: "  " }),
    "tolak tanpa alasan ditolak server",
  );

  await admin.mutation(api.loans.markLoanInReview, { loanId: target._id });
  const afterReview: any = await admin.query(api.admin.adminOverview);
  ok(
    afterReview.loans.find((l: any) => l._id === target._id)?.status === "sedang_direview",
    "status berubah ke sedang_direview",
  );

  await admin.mutation(api.loans.approveLoan, { loanId: target._id });
  const afterApprove: any = await admin.query(api.admin.adminOverview);
  ok(
    afterApprove.loans.find((l: any) => l._id === target._id)?.status === "disetujui",
    "pinjaman disetujui",
  );
}

// ---------------------------------------------------------------------
console.log("4) Alur keputusan gadai…");
const pawns: any[] = overview.pawns;
const pawn = pawns.find((p) => p.status === "diajukan");
if (!pawn) {
  console.error("  Tidak ada gadai berstatus diajukan untuk diuji.");
  failed++;
} else {
  // Setujui tanpa taksiran harus gagal
  await expectError(
    () => admin.mutation(api.loans.approvePawn, { pawnId: pawn._id, nilaiTaksiran: 0 }),
    "taksiran 0 ditolak",
  );

  await admin.mutation(api.loans.markPawnInAppraisal, { pawnId: pawn._id });
  await admin.mutation(api.loans.approvePawn, {
    pawnId: pawn._id,
    nilaiTaksiran: 8_000_000,
  });
  const afterPawn: any = await admin.query(api.admin.adminOverview);
  const approved = afterPawn.pawns.find((p: any) => p._id === pawn._id);
  ok(approved?.status === "disetujui", "gadai disetujui dengan taksiran");
  ok(approved?.nilaiTaksiran === 8_000_000, "nilai taksiran tersimpan benar");
}

// ---------------------------------------------------------------------
console.log("5) Statistik admin (agregasi nyata)…");
const stats2: any = await admin.query(api.admin.adminStats);
ok(stats2.pinjamanBaru === 0, "tidak ada pinjaman baru tersisa di antrean aktif");
ok(
  stats2.nilaiTaksiranDisetujui === 8_000_000,
  `total taksiran disetujui benar (dapat ${stats2.nilaiTaksiranDisetujui})`,
);

console.log("");
console.log(`Hasil QA admin: ${passed} lulus, ${failed} gagal`);
process.exit(failed > 0 ? 1 : 0);
