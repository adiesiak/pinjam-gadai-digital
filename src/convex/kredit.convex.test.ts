import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import { buatSesi as buatSesiDasar, seedKycTerverifikasiEmail } from "./test.helpers";
import { modules } from "./test.setup";

/**
 * `buatSesi` + KYC `VERIFIED` untuk peran peminjam.
 *
 * Sejak gerbang KYC dipasang (`requireKycTerverifikasi`), pengajuan finansial
 * hanya dilayani bila modul KYC nasabah sudah VERIFIED. Berkas tes ini menguji
 * hal LAIN, jadi peminjamnya sengaja selalu siap-KYC; gerbang KYC sendiri
 * diuji di `kyc.convex.test.ts`.
 */
async function buatSesi(
  t: Parameters<typeof buatSesiDasar>[0],
  nama: string,
  opsi: Parameters<typeof buatSesiDasar>[2],
): ReturnType<typeof buatSesiDasar> {
  const sesi = await buatSesiDasar(t, nama, opsi);
  if (opsi.role === "peminjam") await seedKycTerverifikasiEmail(t, opsi.email);
  return sesi;
}


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
    const asDana = await buatSesi(t, "dana", {
      email: "dana@pindai.test",
      role: "dana",
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
      dpPersen: 20,
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
      const akunDana = (await ctx.db.query("users").collect()).find(
        (user) => user.email === "dana@pindai.test",
      );
      if (akunDana === undefined) throw new Error("Akun dana uji tidak ditemukan.");
      return ctx.db.insert("deposits", {
        danaId: akunDana._id,
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
      asDana.mutation(api.alokasiDana.requestDeposit, {
        jumlah: 1_000_000,
        referensiTransfer: "MANUAL-REF-002",
        metodePembayaran: "transfer",
        tanggalTransfer: Date.now(),
        buktiPembayaranId: await t.run((ctx) => ctx.storage.store(new Blob(["bukti"]))),
      }),
    ).rejects.toThrow("Penerimaan setoran penyedia dana belum diaktifkan tim operasional.");
    await expect(
      asAdmin.mutation(api.admin.confirmDeposit, { depositId }),
    ).rejects.toThrow(guardMessage);
    await expect(
      asDana.mutation(api.alokasiDana.alokasiKreditBarang, {
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

describe("DP wajib kredit barang", () => {
  it("menolak pengajuan tanpa DP dan menyimpan DP pada kontrak", async () => {
    const t = convexTest(schema, modules);
    const asPeminjam = await buatSesi(t, "peminjam-dp", {
      email: "peminjam-dp@pindai.test",
      role: "peminjam",
    });
    await asPeminjam.mutation(api.lokasi.catatLokasi, {
      lat: -6.2,
      lng: 106.816666,
      akurasi: 25,
      sumber: "web",
    });
    const pengajuanDasar = {
      namaBarang: "Kulkas dua pintu",
      kategori: "Elektronik",
      merchant: "Toko mitra",
      hargaBarang: 5_000_000,
      tenorBulan: 3,
      marginPersenPerBulan: 3.5,
      namaLengkap: "Sari Peminjam",
      nik: "3201234567890004",
      nomorRekening: "1234567892",
      nomorWhatsApp: "628123456792",
    } as const;

    await expect(
      asPeminjam.mutation(api.kredit.ajukanKreditBarang, {
        ...pengajuanDasar,
        dpPersen: 0,
      }),
    ).rejects.toThrow("Uang muka (DP) wajib 10–50% dari harga barang.");

    await asPeminjam.mutation(api.kredit.ajukanKreditBarang, {
      ...pengajuanDasar,
      dpPersen: 20,
    });
    const [pengajuan] = await asPeminjam.query(api.kredit.kreditSaya, {});
    expect(pengajuan.dp).toBe(1_000_000);
    expect(pengajuan.pokokDibiayai).toBe(4_000_000);
  });
});
