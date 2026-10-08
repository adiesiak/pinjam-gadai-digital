/**
 * QA panel admin — memverifikasi:
 *  1. Promosi QA account menjadi admin (via internal CLI mutation)
 *  2. adminOverview terisi untuk admin, kosong untuk non-admin
 *  3. Alur keputusan pinjaman: review → setujui (catatan opsional, boleh kosong)
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
const overview = await admin.query(api.admin.adminOverview);
ok(overview.isAdmin === true, "peran admin terdeteksi");
ok(Array.isArray(overview.loans) && Array.isArray(overview.pawns), "antrean terbaca");

const stats = await admin.query(api.admin.adminStats);
ok(stats !== null, "statistik admin terbaca");
// Snapshot awal untuk asersi delta — skrip tetap benar walau database berisi
// data dari run QA sebelumnya.
const awal = {
  pinjamanBaru: stats.pinjamanBaru,
  nilaiTaksiranDisetujui: stats.nilaiTaksiranDisetujui,
};

// ---------------------------------------------------------------------
console.log("3) Alur keputusan pinjaman…");
const loans = overview.loans;
const target = loans.find((l) => l.status === "diajukan");
if (!target) {
  console.error("  Tidak ada pinjaman berstatus diajukan untuk diuji.");
  failed++;
} else {
  // Catatan opsional: memindahkan status TANPA alasan harus berhasil sekarang
  // (kebijakan pemilik produk) — dulu justru ditolak server.
  await admin.mutation(api.loans.rejectLoan, { loanId: target._id });
  const afterTolak = await admin.query(api.admin.adminOverview);
  ok(
    afterTolak.loans.find((l) => l._id === target._id)?.status === "ditolak",
    "tolak tanpa alasan diterima server (catatan opsional)",
  );

  await admin.mutation(api.loans.markLoanInReview, { loanId: target._id });
  const afterReview = await admin.query(api.admin.adminOverview);
  ok(
    afterReview.loans.find((l) => l._id === target._id)?.status === "sedang_direview",
    "status berubah ke sedang_direview",
  );

  await admin.mutation(api.loans.approveLoan, { loanId: target._id });
  const afterApprove = await admin.query(api.admin.adminOverview);
  ok(
    afterApprove.loans.find((l) => l._id === target._id)?.status === "disetujui",
    "pinjaman disetujui",
  );
}

// ---------------------------------------------------------------------
console.log("4) Alur keputusan gadai…");
const pawns = overview.pawns;
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
  const afterPawn = await admin.query(api.admin.adminOverview);
  const approved = afterPawn.pawns.find((p) => p._id === pawn._id);
  ok(approved?.status === "disetujui", "gadai disetujui dengan taksiran");
  ok(approved?.nilaiTaksiran === 8_000_000, "nilai taksiran tersimpan benar");
}

// ---------------------------------------------------------------------
console.log("5) Statistik admin (agregasi nyata)…");
const stats2 = await admin.query(api.admin.adminStats);
ok(
  stats2.pinjamanBaru === awal.pinjamanBaru - 1,
  `antrean berkurang tepat 1 (pengajuan uji dikonsumsi saat disetujui; delta ${stats2.pinjamanBaru - awal.pinjamanBaru})`,
);
ok(
  stats2.nilaiTaksiranDisetujui - awal.nilaiTaksiranDisetujui === 8_000_000,
  `taksiran bertambah tepat 8.000.000 (delta ${stats2.nilaiTaksiranDisetujui - awal.nilaiTaksiranDisetujui})`,
);

console.log("");
console.log(`Hasil QA admin: ${passed} lulus, ${failed} gagal`);
process.exit(failed > 0 ? 1 : 0);
