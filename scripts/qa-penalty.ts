/**
 * QA penalti keterlambatan + pengingat jatuh tempo (satu skrip penuh).
 *  1. Pinjaman Rp 1jt tenor 30 hari → setujui → didanai penuh →
 *     backdate didanaiPada −31 hari (terlambat 1 hari).
 *  2. Info pelunasan: denda 0,5% × 1 hari = 5.000; total 1.305.000.
 *  3. Sweep pengingat (admin manual = cron harian): append-only, idempoten.
 *  4. repayLoan membayar 130% + denda; saldo Pendana tepat pokok+imbal hasil;
 *     ledger tetap seimbang; pelunasan ganda ditolak.
 *
 * VITE_CONVEX_URL=<url> bunx tsx scripts/qa-penalty.ts
 */
import { ConvexHttpClient } from "convex/browser";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { api } from "../src/convex/_generated/api";
import { kycArgs } from "./qa-kyc";

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

async function signUpAnonymous(): Promise<ConvexHttpClient> {
  const c = new ConvexHttpClient(url);
  const res: any = await c.action(api.auth.signIn, {
    provider: "anonymous",
    params: {},
  });
  const token = res?.tokens?.token ?? res?.token;
  if (!token) throw new Error("Sign-in anonim gagal.");
  c.setAuth(token);
  return c;
}

console.log("1) Pinjaman Rp 1.000.000 tenor 30 hari: ajukan → setujui → didanai…");
const borrower = await signUpAnonymous();
const loan = await borrower.mutation(api.loans.createLoanApplication, {
  pokokPinjaman: 1_000_000,
  tenorHari: 30,
  tujuan: "kebutuhan_pribadi",
  namaLengkap: "Nasabah QA Penalti",
  nomorRekening: "9988776655",
  ...(await kycArgs(borrower)),
});

const pendana = await signUpAnonymous();
await pendana.mutation(api.pendana.becomePendana, {});
await pendana.mutation(api.pendana.requestDeposit, {
  jumlah: 5_000_000,
  referensiTransfer: "QAPENALTY-001",
});

const admin = new ConvexHttpClient(url);
admin.setAuth(readFileSync("scripts/.qa-admin-token", "utf8").trim());

const pending: any[] = await admin.query(api.admin.pendingDeposits);
const dep = pending.find((d) => d.referensiTransfer === "QAPENALTY-001");
await admin.mutation(api.admin.confirmDeposit, { depositId: dep._id });
await admin.mutation(api.loans.approveLoan, { loanId: loan.appId });
await pendana.mutation(api.pendana.allocateFunding, {
  loanId: loan.appId,
  jumlah: 1_000_000,
});

const funded: any = await borrower.query(api.loans.getMyLoan, { loanId: loan.appId });
ok(funded.status === "didanai", "status didanai");

console.log("2) Backdate −31 hari (internal via CLI) + info pelunasan…");
execSync(
  `bunx convex run loans:qaBackdateDidanai '{"loanId":"${loan.appId}","hariLalu":31}'`,
  { stdio: "pipe" },
);

const backdated: any = await borrower.query(api.loans.getMyLoan, { loanId: loan.appId });
ok(backdated.pelunasan !== null, "info pelunasan tersedia");
ok(backdated.pelunasan.hariTerlambat === 1, `terlambat 1 hari (dapat ${backdated.pelunasan?.hariTerlambat})`);
ok(backdated.pelunasan.dendaTerlambat === 5_000, `denda 0,5% × 1 hari = 5.000 (dapat ${backdated.pelunasan?.dendaTerlambat})`);
ok(backdated.pelunasan.totalKewajibanDenganPenalti === 1_305_000, `total dengan penalti 1.305.000 (dapat ${backdated.pelunasan?.totalKewajibanDenganPenalti})`);

console.log("3) Sweep pengingat (admin manual, idempoten per hari)…");
const gen1: any = await admin.mutation(api.loans.runDueReminderSweep, {});
ok(gen1.created >= 1, `pengingat ditulis (created=${gen1.created})`);
const gen2: any = await admin.mutation(api.loans.runDueReminderSweep, {});
ok(gen2.created === 0, `idempoten: run kedua tidak menulis (created=${gen2.created})`);

console.log("4) Pelunasan dengan denda…");
const wBefore: any = await pendana.query(api.pendana.myWallet);
const saldoBefore = wBefore.saldo;

const repay = await borrower.mutation(api.loans.repayLoan, { loanId: loan.appId });
ok(repay.totalDibayar === 1_305_000, `total dibayar = 1.305.000 (dapat ${repay.totalDibayar})`);
ok(repay.dendaTerlambat === 5_000, `denda tercatat = 5.000 (dapat ${repay.dendaTerlambat})`);

const after: any = await borrower.query(api.loans.getMyLoan, { loanId: loan.appId });
ok(after.status === "lunas", "status lunas");

const wAfter: any = await pendana.query(api.pendana.myWallet);
ok(
  wAfter.saldo === saldoBefore + 1_300_000,
  `saldo Pendana bertambah tepat pokok+imbal hasil 1.300.000 (dapat +${wAfter.saldo - saldoBefore})`,
);

await expectError(
  () => borrower.mutation(api.loans.repayLoan, { loanId: loan.appId }),
  "pelunasan ganda ditolak",
);

const led: any = await admin.query(api.admin.ledgerSummary);
ok(led.seimbang === true, `debit == kredit (D=${led.totalDebit}, K=${led.totalKredit})`);

console.log("5) Klasifikasi jenis pengingat: jatuh_tempo / h_minus_3 / skip…");
// Pinjaman kedua khusus pengujian jenis pengingat.
const loan2 = await borrower.mutation(api.loans.createLoanApplication, {
  pokokPinjaman: 500_000,
  tenorHari: 30,
  tujuan: "kebutuhan_pribadi",
  namaLengkap: "Nasabah QA Penalti",
  nomorRekening: "9988776655",
  ...(await kycArgs(borrower)),
});
await admin.mutation(api.loans.approveLoan, { loanId: loan2.appId });
await pendana.mutation(api.pendana.allocateFunding, {
  loanId: loan2.appId,
  jumlah: 500_000,
});

// 30 hari lalu + tenor 30 → jatuh tempo persis (sisa 0, belum terlambat).
execSync(
  `bunx convex run loans:qaBackdateDidanai '{"loanId":"${loan2.appId}","hariLalu":30}'`,
  { stdio: "pipe" },
);
await admin.mutation(api.loans.runDueReminderSweep, {});
let rem2: any[] = await borrower.query(api.loans.myRemindersToday);
const jt = rem2.find((r) => r.loanId === loan2.appId && r.jenis === "jatuh_tempo");
ok(jt !== undefined, "jenis jatuh_tempo tercatat saat jatuh tempo persis");

// 27 hari lalu → sisa 3 hari → H-3.
execSync(
  `bunx convex run loans:qaBackdateDidanai '{"loanId":"${loan2.appId}","hariLalu":27}'`,
  { stdio: "pipe" },
);
await admin.mutation(api.loans.runDueReminderSweep, {});
rem2 = await borrower.query(api.loans.myRemindersToday);
ok(
  rem2.some((r) => r.loanId === loan2.appId && r.jenis === "h_minus_3"),
  "jenis h_minus_3 tercatat saat sisa 3 hari",
);

// 5 hari lalu → sisa 25 hari → di-skip (tidak ada pengingat baru).
execSync(
  `bunx convex run loans:qaBackdateDidanai '{"loanId":"${loan2.appId}","hariLalu":5}'`,
  { stdio: "pipe" },
);
await admin.mutation(api.loans.runDueReminderSweep, {});
rem2 = await borrower.query(api.loans.myRemindersToday);
const jenisLoan2 = rem2
  .filter((r) => r.loanId === loan2.appId)
  .map((r) => r.jenis)
  .sort();
ok(
  JSON.stringify(jenisLoan2) === JSON.stringify(["h_minus_3", "jatuh_tempo"]),
  `sisa 25 hari tidak menulis pengingat (dapat ${JSON.stringify(jenisLoan2)})`,
);

console.log("6) Statistik admin memuat keterlambatan…");
const stats: any = await admin.query(api.admin.adminStats);
ok(typeof stats.pinjamanTerlambat === "number", "statistik pinjamanTerlambat ada");
ok(typeof stats.totalDendaBerjalan === "number", "statistik totalDendaBerjalan ada");

console.log(`\nHasil: ${passed} lulus, ${failed} gagal`);
process.exit(failed > 0 ? 1 : 0);
