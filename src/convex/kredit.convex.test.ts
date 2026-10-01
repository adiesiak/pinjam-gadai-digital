import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import { buatSesi } from "./test.helpers";
import { modules } from "./test.setup";

describe("manual review and unverified money movement", () => {
  it("keeps admin review but blocks deposit, funding, repayment, and ledger changes", async () => {
    const t = convexTest(schema, modules);
    const asAdmin = await buatSesi(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const asPeminjam = await buatSesi(t, "peminjam", {
      email: "peminjam@pindai.test",
      role: "peminjam",
    });
    const asPendana = await buatSesi(t, "pendana", {
      email: "pendana@pindai.test",
      role: "pendana",
    });

    await asPeminjam.mutation(api.lokasi.catatLokasi, {
      lat: -6.2,
      lng: 106.816666,
      akurasi: 25,
      sumber: "web",
    });
    await asPeminjam.mutation(api.kredit.ajukanKreditBarang, {
      namaBarang: "Smartphone kelas menengah",
      kategori: "Elektronik",
      merchant: "Toko mitra",
      hargaBarang: 8_000_000,
      dpPersen: 0,
      tenorBulan: 6,
      marginPersenPerBulan: 3.5,
      namaLengkap: "Budi Peminjam",
      nik: "3201234567890002",
      nomorRekening: "1234567891",
      nomorWhatsApp: "628123456790",
    });
    const [pengajuan] = await asPeminjam.query(api.kredit.kreditSaya, {});
    expect(pengajuan.status).toBe("diajukan");

    // Persetujuan admin tetap menjadi keputusan review, bukan bukti transaksi.
    await asAdmin.mutation(api.kredit.setujuiKreditBarang, {
      kreditId: pengajuan._id,
    });
    const [disetujui] = await asPeminjam.query(api.kredit.kreditSaya, {});
    expect(disetujui.status).toBe("disetujui");

    const depositId = await t.run(async (ctx) => {
      const pendana = (await ctx.db.query("users").collect()).find(
        (user) => user.email === "pendana@pindai.test",
      );
      if (pendana === undefined) throw new Error("Pendana uji tidak ditemukan.");
      return ctx.db.insert("deposits", {
        pendanaId: pendana._id,
        jumlah: 10_000_000,
        referensiTransfer: "MANUAL-REF-001",
        status: "menunggu_verifikasi",
        nomorReferensi: "DEP-TEST-001",
      });
    });
    const ledgerCountBefore = await t.run(async (ctx) =>
      (await ctx.db.query("ledger_entries").collect()).length,
    );

    const guardMessage = "penyedia pembayaran belum dipilih atau terintegrasi";
    // Intake setoran masih ditutup tombol operasional — tetap fail-closed,
    // hanya pesannya yang berbeda dari gerbang pembayaran.
    await expect(
      asPendana.mutation(api.pendana.requestDeposit, {
        jumlah: 1_000_000,
        referensiTransfer: "MANUAL-REF-002",
        metodePembayaran: "transfer",
        tanggalTransfer: Date.now(),
        buktiPembayaranId: await t.run((ctx) => ctx.storage.store(new Blob(["bukti"]))),
      }),
    ).rejects.toThrow("Penerimaan setoran Pendana belum diaktifkan tim operasional.");
    await expect(
      asAdmin.mutation(api.admin.confirmDeposit, { depositId }),
    ).rejects.toThrow(guardMessage);
    await expect(
      asPendana.mutation(api.pendana.alokasiKreditBarang, {
        kreditId: pengajuan._id,
        jumlah: 1_000_000,
      }),
    ).rejects.toThrow(guardMessage);
    await expect(
      asPeminjam.mutation(api.kredit.bayarCicilanKredit, {
        kreditId: pengajuan._id,
      }),
    ).rejects.toThrow(guardMessage);

    const [depositAfter] = await t.run((ctx) =>
      ctx.db.query("deposits").collect(),
    );
    const entriesAfter = await t.run(async (ctx) =>
      (await ctx.db.query("ledger_entries").collect()).length,
    );
    const paymentsAfter = await t.run((ctx) =>
      ctx.db.query("kreditPayments").collect(),
    );
    expect(depositAfter.status).toBe("menunggu_verifikasi");
    expect(entriesAfter).toBe(ledgerCountBefore);
    expect(paymentsAfter).toHaveLength(0);
  });
});
