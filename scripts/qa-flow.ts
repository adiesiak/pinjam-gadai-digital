/**
 * QA flow Pinjam Gadai Digital — meniru alur nasabah di UI:
 *  1. Daftar (jalur tamu/anonim, sama seperti tombol "Lanjut sebagai tamu")
 *  2. Ajukan pinjaman  → cek detail + rincian biaya
 *  3. Ajukan gadai     → cek detail + status taksiran
 *  4. Ringkasan nasabah
 *  5. Pengaman: validasi, isolasi kepemilikan, gerbang admin, presisi
 *
 * Jalankan: VITE_CONVEX_URL=<url> bunx tsx scripts/qa-flow.ts
 */
import { ConvexHttpClient } from "convex/browser";
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
  if (!token) throw new Error("Sign-in anonim tidak mengembalikan token.");
  c.setAuth(token);
  return c;
}

// ---------------------------------------------------------------------
console.log("1) Daftar — jalur tamu (anonymous)…");
const userA = await signUpAnonymous();
const meA: any = await userA.query(api.users.currentUser);
ok(meA !== null, "pengguna terdaftar & ter-autentikasi");
ok(meA.role === undefined, "peran baru masih kosong (akan jadi peminjam)");

// ---------------------------------------------------------------------
console.log("2) Ajukan pinjaman (Rp 10.000.000)…");
const loan = await userA.mutation(api.loans.createLoanApplication, {
  pokokPinjaman: 10_000_000,
  tenorHari: 30,
  tujuan: "modal_usaha",
  namaLengkap: "Nasabah Uji Alur",
  nomorRekening: "1234567890",
  catatanPeminjam: "Uji coba alur QA",
  ...(await kycArgs(userA)),
});
ok(typeof loan.nomorReferensi === "string" && loan.nomorReferensi.startsWith("PGD-"),
  `nomor referensi format PGD- (${loan.nomorReferensi})`);

const loanDetail: any = await userA.query(api.loans.getMyLoan, {
  loanId: loan.appId,
});
ok(loanDetail !== null, "detail pinjaman bisa dibuka");
ok(loanDetail.status === "diajukan", "status awal = diajukan");
const q = loanDetail.quote;
ok(q.biayaAdmin === 200_000, `biaya admin 2% = Rp 200.000 (dapat ${q.biayaAdmin})`);
ok(q.biayaPlatform === 0, `biaya platform 0% (dihapus) = Rp 0`);
ok(q.totalPotonganDiMuka === 200_000, "potongan di muka 2% = Rp 200.000");
ok(q.danaBersihDitransfer === 9_800_000, "dana bersih 98% = Rp 9.800.000");
ok(q.bunga === 3_000_000, "bunga 30% = Rp 3.000.000");
ok(q.totalKewajibanPelunasan === 13_000_000, "total kewajiban 130% = Rp 13.000.000");

const meA2: any = await userA.query(api.users.currentUser);
ok(meA2.role === "peminjam", "peran otomatis menjadi peminjam");

console.log("3) Validasi pinjaman (harus ditolak server)…");
await expectError(
  () =>
    userA.mutation(api.loans.createLoanApplication, {
      pokokPinjaman: 99_999, // di bawah minimum
      tenorHari: 30,
      tujuan: "modal_usaha",
      namaLengkap: "Nasabah Uji Alur",
      nomorRekening: "1234567890",
    }),
  "pokok di bawah Rp 100.000 ditolak",
);
await expectError(
  () =>
    userA.mutation(api.loans.createLoanApplication, {
      pokokPinjaman: 10_000_000.5, // desimal dilarang
      tenorHari: 30,
      tujuan: "modal_usaha",
      namaLengkap: "Nasabah Uji Alur",
      nomorRekening: "1234567890",
    }),
  "pokok desimal ditolak",
);
await expectError(
  () =>
    userA.mutation(api.loans.createLoanApplication, {
      pokokPinjaman: 5_000_000,
      tenorHari: 30,
      tujuan: "modal_usaha",
      namaLengkap: "Ab",
      nomorRekening: "1234567890",
    }),
  "nama terlalu pendek ditolak",
);
await expectError(
  () =>
    userA.mutation(api.loans.createLoanApplication, {
      pokokPinjaman: 5_000_000,
      tenorHari: 30,
      tujuan: "modal_usaha",
      namaLengkap: "Nasabah Uji Alur",
      nomorRekening: "abc123",
    }),
  "rekening non-digit ditolak",
);

// ---------------------------------------------------------------------
console.log("4) Ajukan gadai (iPhone 14 Pro)…");
await userA.mutation(api.loans.createPawnApplication, {
  deskripsiBarang: "iPhone 14 Pro 256 GB warna titanium, dus lengkap",
  kategori: "Elektronik",
  alamatPenilaian: "Jl. Mawar No. 12, Jakarta Selatan",
  namaLengkap: "Nasabah Uji Alur",
  nomorRekening: "1234567890",
});
const pawns: any[] = await userA.query(api.loans.listMyPawns);
ok(pawns.length === 1, "pengajuan gadai tersimpan");
const pawnDetail: any = await userA.query(api.loans.getMyPawn, {
  pawnId: pawns[0]._id,
});
ok(pawnDetail.status === "diajukan", "status gadai awal = diajukan");
ok(pawnDetail.nilaiTaksiran === undefined, "taksiran masih kosong (oleh petugas)");

console.log("5) Validasi gadai (harus ditolak server)…");
await expectError(
  () =>
    userA.mutation(api.loans.createPawnApplication, {
      deskripsiBarang: "pendek",
      kategori: "Elektronik",
      alamatPenilaian: "Jl. Mawar No. 12, Jakarta Selatan",
      namaLengkap: "Nasabah Uji Alur",
      nomorRekening: "1234567890",
    }),
  "deskripsi terlalu pendek ditolak",
);
await expectError(
  () =>
    userA.mutation(api.loans.createPawnApplication, {
      deskripsiBarang: "Barang yang cukup panjang deskripsinya",
      kategori: "TidakAda",
      alamatPenilaian: "Jl. Mawar No. 12, Jakarta Selatan",
      namaLengkap: "Nasabah Uji Alur",
      nomorRekening: "1234567890",
    }),
  "kategori tidak dikenal ditolak",
);

// ---------------------------------------------------------------------
console.log("6) Ringkasan nasabah…");
const summary = await userA.query(api.loans.myLoanSummary);
ok(summary.totalAplikasi === 1 && summary.diajukan === 1, "ringkasan pinjaman benar");
const pawnSummary = await userA.query(api.loans.myPawnSummary);
ok(pawnSummary.totalGadai === 1, "ringkasan gadai benar");

// ---------------------------------------------------------------------
console.log("7) Isolasi antar-nasabah…");
const userB = await signUpAnonymous();
const borrowedLoan: any = await userB.query(api.loans.getMyLoan, {
  loanId: loan.appId,
});
ok(borrowedLoan === null, "nasabah lain TIDAK bisa membuka pinjaman A");
const bPawns: any[] = await userB.query(api.loans.listMyPawns);
ok(bPawns.length === 0, "daftar gadai B kosong (Zero Fake Data)");
const bSummary = await userB.query(api.loans.myLoanSummary);
ok(bSummary.totalAplikasi === 0, "ringkasan B jujur = 0");

console.log("8) Gerbang admin (nasabah biasa tidak boleh mengubah status)…");
await expectError(
  () => userB.mutation(api.loans.markLoanInReview, { loanId: loan.appId }),
  "markLoanInReview ditolak untuk non-admin",
);
await expectError(
  () => userB.mutation(api.loans.approveLoan, { loanId: loan.appId }),
  "approveLoan ditolak untuk non-admin",
);
await expectError(
  () => userB.mutation(api.loans.rejectLoan, { loanId: loan.appId, reason: "x" }),
  "rejectLoan ditolak untuk non-admin",
);
await expectError(
  () =>
    userB.mutation(api.loans.approvePawn, {
      pawnId: pawns[0]._id,
      nilaiTaksiran: 8_000_000,
    }),
  "approvePawn ditolak untuk non-admin",
);

console.log("");
console.log(`Hasil QA: ${passed} lulus, ${failed} gagal`);
process.exit(failed > 0 ? 1 : 0);
