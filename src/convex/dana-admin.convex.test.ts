/**
 * Tes alur "admin menandai pengajuan berjalan" setelah ruang penyedia dana dihapus.
 *
 * Tidak ada perpindahan dana di aplikasi: admin menyetujui pengajuan, lalu
 * menandainya berjalan pada ledger internal (status + tanggal acuan) sehingga
 * jadwal pelunasan dan bukti pembayaran manual QRIS/bank menjadi aktif.
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import { buatSesi, type KonteksUji } from "./test.helpers";
import { modules } from "./test.setup";

/** Id pengguna uji berdasarkan email (helper lokal, tanpa asumsi urutan). */
async function idPengguna(t: KonteksUji, email: string) {
  return t.run(async (ctx) => {
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .first();
    if (user === null) throw new Error("pengguna uji tidak ditemukan");
    return user._id;
  });
}

describe("penandaan pengajuan berjalan oleh admin (tanpa penyedia dana)", () => {
  it("pinjaman: hanya admin dan hanya selama tahap tinjauan", async () => {
    const t = convexTest(schema, modules);
    const asPeminjam = await buatSesi(t, "Peminjam dana", {
      email: "peminjam-dana@pindai.test",
      role: "peminjam",
    });
    const asAdmin = await buatSesi(t, "Admin dana", {
      email: "admin-dana@pindai.test",
      role: "admin",
    });
    const peminjamId = await idPengguna(t, "peminjam-dana@pindai.test");
    const loanId = await t.run((ctx) =>
      ctx.db.insert("loans", {
        userId: peminjamId,
        pokokPinjaman: 1_000_000,
        tujuan: "modal_usaha",
        namaLengkap: "Peminjam Uji",
        nomorRekening: "12345678",
        status: "disetujui",
        nomorReferensi: "LON-DANA-01",
        tenorHari: 30,
      }),
    );

    // Bukan admin → gerbang admin menolak (Akses khusus Super Admin).
    await expect(
      asPeminjam.mutation(api.loans.danaiPinjaman, { loanId }),
    ).rejects.toThrow(/admin/i);

    await expect(
      asAdmin.mutation(api.loans.danaiPinjaman, { loanId }),
    ).resolves.toEqual({ ok: true });
    const berjalan = await t.run((ctx) => ctx.db.get(loanId));
    expect(berjalan?.status).toBe("didanai");
    // Tanggal acuan wajib terisi agar jadwal pelunasan tidak kosong.
    expect(typeof berjalan?.didanaiPada).toBe("number");

    // Sejak status digabung menjadi EMPAT (Ditinjau/Disalurkan/Ditolak/Lunas),
    // "Ditinjau" adalah satu-satunya tahap sebelum dana ditandai tersalurkan —
    // pengajuan baru maupun tahap tinjauan lama berada di situ.
    const tinjauanId = await t.run((ctx) =>
      ctx.db.insert("loans", {
        userId: peminjamId,
        pokokPinjaman: 500_000,
        tujuan: "kebutuhan_pribadi",
        namaLengkap: "Peminjam Uji",
        nomorRekening: "12345678",
        status: "diajukan",
        nomorReferensi: "LON-DANA-02",
        tenorHari: 30,
      }),
    );
    await expect(
      asAdmin.mutation(api.loans.danaiPinjaman, { loanId: tinjauanId }),
    ).resolves.toEqual({ ok: true });
    const tinjauanBerjalan = await t.run((ctx) => ctx.db.get(tinjauanId));
    expect(tinjauanBerjalan?.status).toBe("didanai");
    expect(typeof tinjauanBerjalan?.didanaiPada).toBe("number");

    // Baris yang sudah ditutup tidak pernah bisa dibuka lagi.
    const ditolakId = await t.run((ctx) =>
      ctx.db.insert("loans", {
        userId: peminjamId,
        pokokPinjaman: 400_000,
        tujuan: "kebutuhan_pribadi",
        namaLengkap: "Peminjam Uji",
        nomorRekening: "12345678",
        status: "ditolak",
        nomorReferensi: "LON-DANA-03",
        tenorHari: 30,
      }),
    );
    await expect(
      asAdmin.mutation(api.loans.danaiPinjaman, { loanId: ditolakId }),
    ).rejects.toThrow(/Ditinjau/i);

    const lunasId = await t.run((ctx) =>
      ctx.db.insert("loans", {
        userId: peminjamId,
        pokokPinjaman: 400_000,
        tujuan: "kebutuhan_pribadi",
        namaLengkap: "Peminjam Uji",
        nomorRekening: "12345678",
        status: "lunas",
        nomorReferensi: "LON-DANA-04",
        tenorHari: 30,
      }),
    );
    await expect(
      asAdmin.mutation(api.loans.danaiPinjaman, { loanId: lunasId }),
    ).rejects.toThrow(/Ditinjau/i);
  });

  it("gadai: wajib pokok acuan lebih dulu dan hanya admin", async () => {
    const t = convexTest(schema, modules);
    const asPeminjam = await buatSesi(t, "Peminjam gadai dana", {
      email: "peminjam-gadai-dana@pindai.test",
      role: "peminjam",
    });
    const asAdmin = await buatSesi(t, "Admin gadai dana", {
      email: "admin-gadai-dana@pindai.test",
      role: "admin",
    });
    const peminjamId = await idPengguna(t, "peminjam-gadai-dana@pindai.test");
    const pawnId = await t.run((ctx) =>
      ctx.db.insert("pawns", {
        userId: peminjamId,
        deskripsiBarang: "Cincin emas",
        kategori: "perhiasan",
        alamatPenilaian: "Jakarta",
        namaLengkap: "Peminjam Uji",
        nomorRekening: "12345678",
        status: "disetujui",
        nomorReferensi: "PAW-DANA-01",
        nilaiTaksiran: 2_000_000,
      }),
    );

    await expect(
      asAdmin.mutation(api.loans.aktifkanGadai, { pawnId }),
    ).rejects.toThrow(/pokok/i);

    await t.run((ctx) =>
      ctx.db.patch(pawnId, {
        pokokGadai: 1_200_000,
        persenSewaModal: 5,
        sisaPokok: 1_200_000,
      }),
    );
    await expect(
      asPeminjam.mutation(api.loans.aktifkanGadai, { pawnId }),
    ).rejects.toThrow(/admin/i);
    await expect(
      asAdmin.mutation(api.loans.aktifkanGadai, { pawnId }),
    ).resolves.toEqual({ ok: true });
    const aktif = await t.run((ctx) => ctx.db.get(pawnId));
    expect(aktif?.status).toBe("aktif");
  });

  it("kredit barang: admin menandai berjalan dengan tanggal acuan", async () => {
    const t = convexTest(schema, modules);
    const asPeminjam = await buatSesi(t, "Peminjam kredit dana", {
      email: "peminjam-kredit-dana@pindai.test",
      role: "peminjam",
    });
    const asAdmin = await buatSesi(t, "Admin kredit dana", {
      email: "admin-kredit-dana@pindai.test",
      role: "admin",
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

    await asAdmin.mutation(api.kredit.setujuiKreditBarang, {
      kreditId: pengajuan._id,
    });
    await asAdmin.mutation(api.kredit.danaiKreditBarang, {
      kreditId: pengajuan._id,
    });
    const berjalan = await t.run((ctx) => ctx.db.get(pengajuan._id));
    expect(berjalan?.status).toBe("didanai");
    expect(typeof berjalan?.didanaiPada).toBe("number");
  });
});
