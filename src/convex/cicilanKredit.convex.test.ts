/**
 * Tes pencatatan cicilan Kredit Barang oleh admin.
 *
 * Yang dijaga:
 *  - nominal wajib sama dengan tagihan bulan berikutnya dari mesin harga;
 *  - cicilan tercatat berurutan, jurnal seimbang, dan biaya admin masuk
 *    `platform:FEE` — bukan menumpuk di akun kredit;
 *  - cicilan terakhir menutup kredit dan seluruh alokasi pendana;
 *  - bukti transfer yang dipilih ikut ditandai `dicocokkan`;
 *  - nominal salah ditolak tanpa menulis cicilan maupun jurnal.
 *
 * Menjalankan: bunx vitest run src/convex/cicilanKredit.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { quoteKreditBarang } from "../lib/kredit";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { siapkanPengguna } from "./test.helpers";
import { modules } from "./test.setup";

const HARI = 24 * 60 * 60 * 1000;

/** Kredit 1 bulan yang sudah dicairkan + alokasi penuh satu pendana. */
async function siapkanKredit(t: ReturnType<typeof convexTest>) {
  const admin = await siapkanPengguna(t, "Admin Kredit", {
    email: "admin-kredit@uji.test",
    role: "admin",
  });
  const pendana = await siapkanPengguna(t, "Pendana Uji", {
    email: "pendana-kredit@uji.test",
    role: "dana",
  });
  const peminjam = await siapkanPengguna(t, "Peminjam Kredit", {
    email: "peminjam-kredit@uji.test",
    role: "peminjam",
  });

  const quote = quoteKreditBarang({
    hargaBarang: 2_400_000,
    dpPersen: 0,
    tenorBulan: 1,
    marginPersenPerBulan: 0,
  });

  const kreditId = await t.run(async (ctx) =>
    ctx.db.insert("kreditBarang", {
      userId: peminjam.userId,
      nomorReferensi: "KRD-CICILAN-UJI",
      namaBarang: "Laptop Uji",
      kategori: "Elektronik",
      merchant: "Toko Uji",
      hargaBarang: 2_400_000,
      dpPersen: 0,
      tenorBulan: 1,
      marginPersenPerBulan: 0,
      status: "didanai",
      namaLengkap: "PEMINJAM UJI",
      nik: "3201234567890001",
      nomorRekening: "1234567890",
      nomorWhatsApp: "628123456780",
      didanaiPada: Date.now() - 3 * HARI,
    }),
  );

  const alokasiId = await t.run(async (ctx) =>
    ctx.db.insert("kreditFundings", {
      kreditId,
      danaId: pendana.userId,
      jumlahAlokasi: quote.pokokDibiayai,
      imbalHasil: quote.marginTotal,
      status: "dialokasikan",
      nomorReferensi: "KFD-CICILAN-UJI",
    }),
  );

  return { admin, pendana, peminjam, kreditId, alokasiId, quote };
}

/** Bukti transfer peminjam untuk tagihan bulan pertama. */
async function siapkanBukti(
  t: ReturnType<typeof convexTest>,
  kreditId: Id<"kreditBarang">,
  userId: Id<"users">,
  jumlah: number,
) {
  return t.run(async (ctx) => {
    const buktiPembayaranId = await ctx.storage.store(
      new Blob(["bukti cicilan kredit"], { type: "image/png" }),
    );
    return ctx.db.insert("manualPaymentReceipts", {
      userId,
      jenis: "kredit_barang",
      kreditId,
      jumlah,
      metodePembayaran: "transfer",
      tanggalTransfer: Date.now() - HARI,
      referensiTransfer: "TRF-CICILAN-UJI",
      buktiPembayaranId,
      status: "menunggu_pencocokan",
      nomorReferensi: "BUKTI-CICILAN-UJI",
    });
  });
}

describe("cicilanKredit.catatCicilanKredit", () => {
  it("mencatat cicilan terakhir, menyeimbangkan jurnal, dan menutup alokasi", async () => {
    const t = convexTest(schema, modules);
    const { admin, kreditId, alokasiId, quote } = await siapkanKredit(t);

    const hasil = await admin.sesi.mutation(api.cicilanKredit.catatCicilanKredit, {
      kreditId,
      jumlah: quote.jadwal[0].total,
      tanggal: Date.now() - HARI,
      referensiMutasi: "TRF-20261023-001",
    });
    expect(hasil).toMatchObject({ bulanKe: 1, lunas: true, sisaPokok: 0 });

    const sesudah = await t.run(async (ctx) => ({
      kredit: await ctx.db.get(kreditId),
      pembayaran: await ctx.db.query("kreditPayments").collect(),
      alokasi: await ctx.db.get(alokasiId),
      jurnal: await ctx.db.query("ledger_entries").collect(),
    }));

    expect(sesudah.kredit?.status).toBe("lunas");
    expect(sesudah.kredit?.lunasPada).toBeDefined();
    expect(sesudah.pembayaran).toHaveLength(1);
    expect(sesudah.pembayaran[0]).toMatchObject({
      bulanKe: 1,
      pokokDibayar: quote.jadwal[0].pokok,
      marginDibayar: quote.jadwal[0].margin,
      totalDibayar: quote.jadwal[0].total,
      referensiMutasi: "TRF-20261023-001",
    });
    expect(sesudah.alokasi?.status).toBe("selesai");

    const debit = sesudah.jurnal
      .filter((e) => e.arah === "debit")
      .reduce((n, e) => n + e.jumlah, 0);
    const kredit = sesudah.jurnal
      .filter((e) => e.arah === "kredit")
      .reduce((n, e) => n + e.jumlah, 0);
    expect(debit).toBe(quote.jadwal[0].total);
    expect(kredit).toBe(quote.jadwal[0].total);
    expect(
      sesudah.jurnal.find((e) => e.akun === "platform:FEE")?.jumlah,
    ).toBe(quote.jadwal[0].biayaAdmin);
  });

  it("mencocokkan bukti transfer yang dipilih dan menolak nominal salah", async () => {
    const t = convexTest(schema, modules);
    const { admin, peminjam, kreditId, quote } = await siapkanKredit(t);
    const receiptId = await siapkanBukti(
      t,
      kreditId,
      peminjam.userId,
      quote.jadwal[0].total,
    );

    await expect(
      admin.sesi.mutation(api.cicilanKredit.catatCicilanKredit, {
        kreditId,
        jumlah: quote.jadwal[0].total - 1,
        tanggal: Date.now() - HARI,
        referensiMutasi: "TRF-SALAH",
        receiptId,
      }),
    ).rejects.toThrow(/tagihan/i);

    const kosong = await t.run(async (ctx) => ({
      pembayaran: await ctx.db.query("kreditPayments").collect(),
      jurnal: await ctx.db.query("ledger_entries").collect(),
      receipt: await ctx.db.get(receiptId),
    }));
    expect(kosong.pembayaran).toHaveLength(0);
    expect(kosong.jurnal).toHaveLength(0);
    expect(kosong.receipt?.status).toBe("menunggu_pencocokan");

    await admin.sesi.mutation(api.cicilanKredit.catatCicilanKredit, {
      kreditId,
      jumlah: quote.jadwal[0].total,
      tanggal: Date.now() - HARI,
      referensiMutasi: "TRF-BENAR",
      receiptId,
    });

    const receipt = await t.run(async (ctx) => ctx.db.get(receiptId));
    expect(receipt).toMatchObject({
      status: "dicocokkan",
      referensiMutasi: "TRF-BENAR",
      jumlahMutasi: quote.jadwal[0].total,
    });
  });
});
