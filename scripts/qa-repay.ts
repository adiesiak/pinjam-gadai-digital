/**
 * QA alur pelunasan + pelepasan gadai.
 *  1. Nasabah ajukan pinjaman Rp 1jt → disetujui → didanai Penuh oleh 1 Pendana
 *  2. Nasabah lunasi 130% → jurnal repayment + payout → status "lunas"
 *  3. Saldo Pendana bertambah pokok + imbal hasil (600.000 → 1.300.000)
 *  4. Ledger tetap seimbang
 *  5. Alur gadai: aktif → ajukan pelepasan → admin rilis → lunas_dilepas
 *
 * VITE_CONVEX_URL=<url> bunx tsx scripts/qa-repay.ts
 */
import { ConvexHttpClient } from "convex/browser";
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
  const res = await c.action(api.auth.signIn, {
    provider: "anonymous",
    params: {},
  });
  const token = res?.tokens?.token ?? res?.token;
  if (!token) throw new Error("Sign-in anonim gagal.");
  c.setAuth(token);
  return c;
}

console.log("1) Pinjaman Rp 1.000.000: ajukan → setujui → didanai penuh…");
const borrower = await signUpAnonymous();
const loan = await borrower.mutation(api.loans.createLoanApplication, {
  pokokPinjaman: 1_000_000,
  tenorHari: 30,
  tujuan: "kebutuhan_pribadi",
  namaLengkap: "Nasabah QA Pelunasan",
  nomorRekening: "1122334455",
  ...(await kycArgs(borrower)),
});

const pendana = await signUpAnonymous();
await pendana.mutation(api.alokasiDana.naikPeranDana, {});
await pendana.mutation(api.alokasiDana.requestDeposit, {
  jumlah: 5_000_000,
  referensiTransfer: "QAREPAY-001",
});

const admin = new ConvexHttpClient(url);
admin.setAuth(readFileSync("scripts/.qa-admin-token", "utf8").trim());

const pending = await admin.query(api.admin.pendingDeposits);
const dep = pending.find((d) => d.referensiTransfer === "QAREPAY-001");
await admin.mutation(api.admin.confirmDeposit, { depositId: dep._id });
await admin.mutation(api.loans.approveLoan, { loanId: loan.appId });
await pendana.mutation(api.alokasiDana.allocateFunding, {
  loanId: loan.appId,
  jumlah: 1_000_000,
});

const wBefore = await pendana.query(api.alokasiDana.myWallet);
ok(wBefore.saldo === 4_000_000, `saldo Pendana sebelum lunas = 4.000.000 (dapat ${wBefore.saldo})`);
ok(wBefore.imbalHasilDiharapkan === 300_000, `imbal hasil 300.000 (dapat ${wBefore.imbalHasilDiharapkan})`);

const loanNow = await borrower.query(api.loans.getMyLoan, { loanId: loan.appId });
ok(loanNow.status === "didanai", "status didanai");

console.log("2) Pelunasan 130% oleh nasabah…");
const lw = await borrower.query(api.loans.getMyLoan, { loanId: loan.appId });
ok(lw.quote.totalKewajibanPelunasan === 1_300_000, "total kewajiban = 1.300.000");

const repay = await borrower.mutation(api.loans.repayLoan, { loanId: loan.appId });
ok(repay.totalDibayar === 1_300_000, "total dibayar = 1.300.000");

const loanAfter = await borrower.query(api.loans.getMyLoan, { loanId: loan.appId });
ok(loanAfter.status === "lunas", "status menjadi lunas");

const wAfter = await pendana.query(api.alokasiDana.myWallet);
ok(wAfter.saldo === 5_300_000, `saldo Pendana setelah lunas = 5.300.000 (dapat ${wAfter.saldo})`);
ok(wAfter.danaBekerja === 0, "dana bekerja kembali 0");

// Pelunasan ganda harus ditolak
await expectError(
  () => borrower.mutation(api.loans.repayLoan, { loanId: loan.appId }),
  "pelunasan ganda ditolak",
);

console.log("3) Ledger tetap seimbang…");
const led = await admin.query(api.admin.ledgerSummary);
ok(led.seimbang === true, `debit == kredit (D=${led.totalDebit}, K=${led.totalKredit})`);

console.log("4) Alur gadai: aktif → pelepasan → rilis…");
// Nasabah mengajukan gadai, admin setujui + taksiran, lalu aktifkan.
await borrower.mutation(api.loans.createPawnApplication, {
  deskripsiBarang: "Laptop MacBook Air M2 untuk uji pelepasan gadai",
  kategori: "Elektronik",
  alamatPenilaian: "Jl. QA No. 99, Jakarta",
  namaLengkap: "Nasabah QA Pelunasan",
  nomorRekening: "1122334455",
});
const myPawns = await borrower.query(api.loans.listMyPawns);
const pawn = myPawns.find((p) => p.status === "diajukan");
await admin.mutation(api.loans.approvePawn, {
  pawnId: pawn._id,
  nilaiTaksiran: 12_000_000,
});
await admin.mutation(api.loans.activatePawn, { pawnId: pawn._id });
const active = await borrower.query(api.loans.getMyPawn, { pawnId: pawn._id });
ok(active.status === "aktif", "gadai aktif");

await borrower.mutation(api.loans.requestPawnRelease, { pawnId: pawn._id });
const waiting = await borrower.query(api.loans.getMyPawn, { pawnId: pawn._id });
ok(waiting.status === "menunggu_pelepasan", "menunggu pelepasan");

// Rilis oleh non-admin harus ditolak
await expectError(
  () => borrower.mutation(api.loans.releasePawn, { pawnId: pawn._id }),
  "rilis oleh non-admin ditolak",
);

await admin.mutation(api.loans.releasePawn, { pawnId: pawn._id });
const released = await borrower.query(api.loans.getMyPawn, { pawnId: pawn._id });
ok(released.status === "lunas_dilepas", "gadai lunas_dilepas");

// Pelepasan ulang harus ditolak
await expectError(
  () => borrower.mutation(api.loans.requestPawnRelease, { pawnId: pawn._id }),
  "ajukan pelepasan ulang ditolak",
);

console.log("");
console.log(`Hasil QA pelunasan: ${passed} lulus, ${failed} gagal`);
process.exit(failed > 0 ? 1 : 0);
