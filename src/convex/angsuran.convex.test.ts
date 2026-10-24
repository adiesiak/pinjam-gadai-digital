/**
 * Tes rekonsiliasi bukti transfer angsuran.
 *
 * Yang dijaga:
 *  - verifikasi hanya sah bila nominal bukti dan nominal mutasi bank sama
 *    dengan tagihan yang dihitung server (termasuk denda pada tanggal transfer);
 *  - angsuran ditandai lunas dan bukti berubah `dicocokkan`;
 *  - jurnal mencatat pokok + bunga ke akun pinjaman, biaya admin ke platform,
 *    jadi ledger tetap seimbang;
 *  - nominal mutasi yang salah ditolak TANPA menulis jurnal atau mengubah
 *    status angsuran.
 *
 * Menjalankan: bunx vitest run src/convex/angsuran.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { siapkanPengguna } from "./test.helpers";
import { modules } from "./test.setup";

const now = 1_700_000_000_000;

/** Pinjaman satu angsuran dengan bukti transfer yang menunggu pencocokan. */
async function siapkanBukti(
  t: ReturnType<typeof convexTest>,
  userId: Id<"users">,
  danaId: Id<"users">,
) {
  return t.run(async (ctx) => {
    const loanId = await ctx.db.insert("loans", {
      userId,
      pokokPinjaman: 1_000_000,
      tujuan: "modal_usaha",
      namaLengkap: "Rani Angsuran",
      namaBank: "BCA",
      nomorRekening: "1234567890",
      status: "didanai",
      nomorReferensi: "PGD-ANGSURAN-UJI",
      tenorBulan: 1,
      tenorHari: 30,
      didanaiPada: now,
    });

    await ctx.db.insert("fundings", {
      loanId,
      danaId,
      jumlahAlokasi: 1_000_000,
      imbalHasil: 200_000,
      status: "dialokasikan",
      nomorReferensi: "ALOK-ANGSURAN-UJI",
    });

    const buktiPembayaranId = await ctx.storage.store(
      new Blob(["bukti transfer"], { type: "image/png" }),
    );

    const angsuranId = await ctx.db.insert("angsuran", {
      userId,
      loanId,
      nomor: 1,
      jatuhTempoPada: now,
      pokok: 1_000_000,
      bunga: 200_000,
      biayaAdmin: 24_000,
      total: 1_224_000,
      status: "menunggu_verifikasi",
    });

    const receiptId = await ctx.db.insert("manualPaymentReceipts", {
      userId,
      jenis: "pinjaman",
      loanId,
      angsuranId,
      jumlah: 1_224_000,
      metodePembayaran: "transfer",
      tanggalTransfer: now,
      referensiTransfer: "TRF-ANGSURAN-UJI",
      buktiPembayaranId,
      status: "menunggu_pencocokan",
      nomorReferensi: "BUKTI-ANGSURAN-UJI",
    });

    await ctx.db.patch(angsuranId, { receiptId, buktiPembayaranId });

    return { loanId, angsuranId, receiptId };
  });
}

async function siapkanSemua(t: ReturnType<typeof convexTest>) {
  const { sesi: admin } = await siapkanPengguna(t, "admin angsuran", {
    email: "admin-angsuran@pindai.test",
    role: "admin",
  });
  const { userId } = await siapkanPengguna(t, "rani angsuran", {
    email: "rani-angsuran@pindai.test",
    role: "peminjam",
  });
  const { userId: danaId } = await siapkanPengguna(t, "dana angsuran", {
    email: "dana-angsuran@pindai.test",
    role: "dana",
  });
  const bukti = await siapkanBukti(t, userId, danaId);
  return { admin, userId, ...bukti };
}

describe("verifikasi bukti angsuran", () => {
  it("menandai lunas, mencatat jurnal pokok/bunga/biaya, dan menjaga ledger seimbang", async () => {
    const t = convexTest(schema, modules);
    const { admin, loanId, angsuranId, receiptId, userId } = await siapkanSemua(t);

    await expect(
      admin.mutation(api.angsuran.verifikasiBuktiAngsuran, {
        receiptId,
        angsuranId,
        keputusan: "terima",
        referensiMutasi: "MUTASI-ANGSURAN-001",
        jumlahMutasi: 1_224_000,
      }),
    ).resolves.toEqual({ ok: true, lunas: true, semuaLunas: true });

    const hasil = await t.run(async (ctx) => {
      const row = await ctx.db.get(angsuranId);
      const receipt = await ctx.db.get(receiptId);
      const loan = await ctx.db.get(loanId);
      const entries = await ctx.db.query("ledger_entries").collect();
      const audit = await ctx.db.query("auditLog").collect();
      return { row, receipt, loan, entries, audit };
    });

    expect(hasil.loan?.status).toBe("lunas");
    expect(hasil.audit.some((a) => a.aksi === "plafon_naik_otomatis")).toBe(true);

    // Menutup pinjaman lewat jadwal angsuran juga menerbitkan tiket doorprize
    // kuartal — jalur ini tidak boleh ketinggalan dari pelunasan satu kali.
    const tiket = await t.run((ctx) => ctx.db.query("doorprizeTiket").collect());
    expect(tiket).toHaveLength(1);
    expect(tiket[0]).toMatchObject({
      peran: "peminjam",
      pemilikId: userId,
      sumber: "pelunasan_tepat_waktu",
      referensi: "PINJAMAN:PGD-ANGSURAN-UJI",
    });
    expect(hasil.row?.status).toBe("lunas");
    expect(hasil.row?.dendaDibayar).toBe(0);
    expect(hasil.row?.dibayarPada).toBe(now);
    expect(hasil.receipt?.status).toBe("dicocokkan");
    expect(hasil.receipt?.referensiMutasi).toBe("MUTASI-ANGSURAN-001");

    const repayment = hasil.entries.filter((e) => e.jenis === "repayment");
    expect(repayment).toHaveLength(4);
    expect(
      repayment.find((e) => e.akun === "platform:CASH"),
    ).toMatchObject({ arah: "debit", jumlah: 1_224_000 });
    // Pokok dan bunga dicatat sebagai dua baris kredit terpisah ke akun
    // pinjaman yang sama, sehingga alokasinya terbaca di ledger.
    expect(
      repayment
        .filter((e) => e.akun === `pinjaman:${loanId}`)
        .map((e) => e.jumlah)
        .sort((a, b) => a - b),
    ).toEqual([200_000, 1_000_000]);
    expect(
      repayment.find((e) => e.akun === "platform:FEE"),
    ).toMatchObject({ arah: "kredit", jumlah: 24_000 });

    // Bunga angsuran 20% (Rp200.000) lebih kecil daripada hak pendana tetap
    // 30% (Rp300.000), jadi platform menanggung selisih Rp100.000 sebagai
    // margin spread negatif — bukan menurunkan hak pendana.
    const spread = hasil.entries.find((e) => e.akun === "PLATFORM_SPREAD_MARGIN");
    expect(spread).toMatchObject({ arah: "debit", jumlah: 100_000 });
    const biayaPendana = hasil.entries.find(
      (e) => e.akun === "platform:FEE" && e.jenis === "payout",
    );
    expect(biayaPendana).toMatchObject({ arah: "debit", jumlah: 50_000 });

    const debit = hasil.entries
      .filter((e) => e.arah === "debit")
      .reduce((acc, e) => acc + e.jumlah, 0);
    const kredit = hasil.entries
      .filter((e) => e.arah === "kredit")
      .reduce((acc, e) => acc + e.jumlah, 0);
    expect(debit).toBe(kredit);
  });

  it("menolak nominal mutasi yang tidak cocok tanpa mengubah status atau jurnal", async () => {
    const t = convexTest(schema, modules);
    const { admin, angsuranId, receiptId } = await siapkanSemua(t);

    await expect(
      admin.mutation(api.angsuran.verifikasiBuktiAngsuran, {
        receiptId,
        angsuranId,
        keputusan: "terima",
        referensiMutasi: "MUTASI-ANGSURAN-002",
        jumlahMutasi: 1_000_000,
      }),
    ).rejects.toThrow(/tidak sama/i);

    const sesudah = await t.run(async (ctx) => ({
      row: await ctx.db.get(angsuranId),
      receipt: await ctx.db.get(receiptId),
      entries: await ctx.db.query("ledger_entries").collect(),
    }));

    expect(sesudah.row?.status).toBe("menunggu_verifikasi");
    expect(sesudah.receipt?.status).toBe("menunggu_pencocokan");
    expect(sesudah.entries).toHaveLength(0);
  });
});
