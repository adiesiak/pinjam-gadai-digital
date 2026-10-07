/**
 * QA peran Pendana + ledger double-entry.
 * Alur: nasabah baru ajukan pinjaman Rp 2jt → 2 Pendana setor → admin
 * verifikasi → admin setujui pinjaman → alokasi parsial → uji anti-overfunding
 * → pelunasan alokasi → pinjaman "didanai" → ledger tetap seimbang.
 *
 * Jalankan: VITE_CONVEX_URL=<url> bunx tsx scripts/qa-pendana.ts
 * (butuh scripts/.qa-admin-token dari qa-admin-setup.ts)
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

// ---------------------------------------------------------------------
console.log("1) Nasabah baru mengajukan pinjaman Rp 2.000.000…");
const borrower = await signUpAnonymous();
const loan = await borrower.mutation(api.loans.createLoanApplication, {
  pokokPinjaman: 2_000_000,
  tenorHari: 60,
  tujuan: "modal_usaha",
  namaLengkap: "Nasabah QA Pendanaan",
  nomorRekening: "9876543210",
  ...(await kycArgs(borrower)),
});
ok(!!loan.appId, "pinjaman QA terbuat");

console.log("2) Dua Pendana mendaftar & mengajukan setoran…");
const p1 = await signUpAnonymous();
await p1.mutation(api.alokasiDana.naikPeranDana, {});
const me1 = await p1.query(api.users.currentUser);
ok(me1.role === "pendana", "P1 menjadi pendana");

const p2 = await signUpAnonymous();
await p2.mutation(api.alokasiDana.naikPeranDana, {});
const me2 = await p2.query(api.users.currentUser);
ok(me2.role === "pendana", "P2 menjadi pendana");

// Saldo awal jujur = 0 (Zero Fake Data)
const w0 = await p1.query(api.alokasiDana.myWallet);
ok(w0.saldo === 0, "saldo awal P1 = 0 (jujur)");

await p1.mutation(api.alokasiDana.requestDeposit, {
  jumlah: 5_000_000,
  referensiTransfer: "QAREF-0001",
});
await p2.mutation(api.alokasiDana.requestDeposit, {
  jumlah: 1_000_000,
  referensiTransfer: "QAREF-0002",
});
ok(true, "dua setoran diajukan");

// Alokasi sebelum verifikasi/setujui harus ditolak
await expectError(
  () => p1.mutation(api.alokasiDana.allocateFunding, { loanId: loan.appId, jumlah: 1_000_000 }),
  "alokasi ke pinjaman non-disetujui ditolak",
);

console.log("3) Admin memverifikasi setoran…");
const admin = new ConvexHttpClient(url);
admin.setAuth(readFileSync("scripts/.qa-admin-token", "utf8").trim());

const pending = await admin.query(api.admin.pendingDeposits);
const dep1 = pending.find((d) => d.referensiTransfer === "QAREF-0001");
const dep2 = pending.find((d) => d.referensiTransfer === "QAREF-0002");
ok(!!dep1 && !!dep2, "kedua setoran terlihat di antrean admin");

await admin.mutation(api.admin.confirmDeposit, { depositId: dep1._id });
await admin.mutation(api.admin.confirmDeposit, { depositId: dep2._id });
const w1a = await p1.query(api.alokasiDana.myWallet);
const w2a = await p2.query(api.alokasiDana.myWallet);
ok(w1a.saldo === 5_000_000, `saldo P1 = 5.000.000 (dapat ${w1a.saldo})`);
ok(w2a.saldo === 1_000_000, `saldo P2 = 1.000.000 (dapat ${w2a.saldo})`);

// Setoran sudah diputuskan → konfirmasi ulang harus gagal
await expectError(
  () => admin.mutation(api.admin.confirmDeposit, { depositId: dep1._id }),
  "konfirmasi ganda ditolak",
);

console.log("4) Admin menyetujui pinjaman…");
await admin.mutation(api.loans.approveLoan, { loanId: loan.appId });

console.log("5) Marketplace & alokasi parsial…");
const mk = await p1.query(api.alokasiDana.marketplace);
const row = mk.find((r) => r._id === loan.appId);
ok(!!row, "pinjaman muncul di marketplace");
ok(row.sisaKebutuhan === 2_000_000, "sisa kebutuhan = 2.000.000");

await p1.mutation(api.alokasiDana.allocateFunding, {
  loanId: loan.appId,
  jumlah: 1_500_000,
});
const mk2 = await p1.query(api.alokasiDana.marketplace);
const row2 = mk2.find((r) => r._id === loan.appId);
ok(row2.sisaKebutuhan === 500_000, "sisa kebutuhan tinggal 500.000");

console.log("6) Uji anti-overfunding…");
await expectError(
  () =>
    p1.mutation(api.alokasiDana.allocateFunding, {
      loanId: loan.appId,
      jumlah: 2_000_000, // melebihi sisa 500rb
    }),
  "alokasi melebihi sisa ditolak",
);
await expectError(
  () =>
    p2.mutation(api.alokasiDana.allocateFunding, {
      loanId: loan.appId,
      jumlah: 2_500_000, // melebihi saldo P2
    }),
  "alokasi melebihi saldo ditolak",
);

// P1 melengkapi → pinjaman didanai penuh
await p1.mutation(api.alokasiDana.allocateFunding, {
  loanId: loan.appId,
  jumlah: 500_000,
});

console.log("7) Verifikasi status & saldo akhir…");
const loanFinal = await borrower.query(api.loans.getMyLoan, {
  loanId: loan.appId,
});
ok(loanFinal.status === "didanai", "status pinjaman = didanai");

const mk3 = await p1.query(api.alokasiDana.marketplace);
ok(!mk3.some((r) => r._id === loan.appId), "pinjaman keluar dari marketplace");

const w1b = await p1.query(api.alokasiDana.myWallet);
const w2b = await p2.query(api.alokasiDana.myWallet);
ok(w1b.saldo === 3_000_000, `saldo P1 akhir = 3.000.000 (dapat ${w1b.saldo})`);
ok(w2b.saldo === 1_000_000, `saldo P2 akhir tetap 1.000.000`);
ok(w1b.danaBekerja === 2_000_000, "dana bekerja P1 = 2.000.000");
ok(w1b.imbalHasilDiharapkan === 600_000, `imbal hasil P1 = 600.000 (dapat ${w1b.imbalHasilDiharapkan})`);

console.log("8) Ledger tetap seimbang…");
const led = await admin.query(api.admin.ledgerSummary);
ok(led.seimbang === true, `debit == kredit (D=${led.totalDebit}, K=${led.totalKredit})`);
ok(led.entryCount >= 8, `entri append-only tercatat (${led.entryCount} entri)`);

console.log("");
console.log(`Hasil QA Pendana: ${passed} lulus, ${failed} gagal`);
process.exit(failed > 0 ? 1 : 0);
