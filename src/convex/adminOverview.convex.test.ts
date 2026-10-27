import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import { CONTRACT_TERMS_VERSION } from "../lib/contract";
import schema from "./schema";
import { modules } from "./test.setup";
import { siapkanPengguna } from "./test.helpers";

describe("antrean admin — status perjanjian", () => {
  it("membawa tanda tangan dan persetujuan yang tercatat pada pinjaman", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await siapkanPengguna(t, "rani", {
      email: "rani-perjanjian@pindai.test",
      role: "peminjam",
    });
    const admin = await siapkanPengguna(t, "admin", {
      email: "admin-perjanjian@pindai.test",
      role: "admin",
    });

    const ditandatanganiPada = 1_700_000_000_000;
    const disetujuiPada = 1_700_000_100_000;
    const loanId = await t.run((ctx) =>
      ctx.db.insert("loans", {
        userId,
        pokokPinjaman: 1_000_000,
        tujuan: "Modal usaha",
        namaLengkap: "RANI PEMINJAM",
        nomorRekening: "1234567890",
        status: "didanai",
        nomorReferensi: "PGD-ADM-1",
        tenorHari: 30,
        tandaTanganPeminjam: "data:image/png;base64,AAAA",
        tandaTanganPada: ditandatanganiPada,
        persetujuanSyaratPada: disetujuiPada,
        persetujuanSyaratVersi: CONTRACT_TERMS_VERSION,
        persetujuanPengajuanPada: ditandatanganiPada,
        persetujuanPengajuanVersi: CONTRACT_TERMS_VERSION,
      }),
    );

    const overview = await admin.sesi.query(api.admin.adminOverview, {});
    const baris = overview.loans.find((l) => l._id === loanId);

    expect(baris).toMatchObject({
      tandaTanganAda: true,
      tandaTanganPada: ditandatanganiPada,
      persetujuanSyaratPada: disetujuiPada,
      persetujuanSyaratVersi: CONTRACT_TERMS_VERSION,
      persetujuanPengajuanPada: ditandatanganiPada,
      persetujuanPengajuanVersi: CONTRACT_TERMS_VERSION,
    });

    // Pinjaman tanpa tanda tangan tetap jujur: "belum", bukan field hilang.
    const loanKosong = await t.run((ctx) =>
      ctx.db.insert("loans", {
        userId,
        pokokPinjaman: 500_000,
        tujuan: "Biaya sekolah",
        namaLengkap: "RANI PEMINJAM",
        nomorRekening: "1234567890",
        status: "disetujui",
        nomorReferensi: "PGD-ADM-2",
        tenorHari: 30,
      }),
    );
    const overview2 = await admin.sesi.query(api.admin.adminOverview, {});
    expect(overview2.loans.find((l) => l._id === loanKosong)).toMatchObject({
      tandaTanganAda: false,
      tandaTanganPada: null,
      persetujuanSyaratPada: null,
      persetujuanSyaratVersi: null,
      persetujuanPengajuanPada: null,
      persetujuanPengajuanVersi: null,
    });
  });
});

describe("antrean admin — agregat ikut satu bacaan", () => {
  /**
   * Sejak layar "Hari ini" memakai satu `adminOverview`, kartu angka dan grafik
   * dihitung di dalamnya dari tabel yang sudah dibaca. Kontraknya: hasilnya
   * HARUS sama persis dengan query khusus `adminStats`/`adminAnalitik` yang
   * masih dipakai halaman lain (mis. QC). Kalau suatu saat keduanya berbeda,
   * satu layar akan menampilkan angka yang tidak cocok dengan layar lain —
   * dan tes ini gagal sebelum itu sampai ke admin.
   */
  it("stats dan analitik di overview sama dengan query khususnya", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await siapkanPengguna(t, "rani-agregat", {
      email: "rani-agregat@pindai.test",
      role: "peminjam",
    });
    const admin = await siapkanPengguna(t, "admin-agregat", {
      email: "admin-agregat@pindai.test",
      role: "admin",
    });

    const sekarang = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert("loans", {
        userId,
        pokokPinjaman: 2_000_000,
        pokokDiajukan: 2_000_000,
        tujuan: "Modal usaha",
        namaLengkap: "RANI AGREGAT",
        nomorRekening: "1234567890",
        status: "didanai",
        nomorReferensi: "PGD-AGR-1",
        tenorHari: 30,
        didanaiPada: sekarang - 5 * 24 * 60 * 60 * 1000,
      });
      await ctx.db.insert("loans", {
        userId,
        pokokPinjaman: 750_000,
        tujuan: "Biaya sekolah",
        namaLengkap: "RANI AGREGAT",
        nomorRekening: "1234567890",
        status: "sedang_direview",
        nomorReferensi: "PGD-AGR-2",
        tenorHari: 30,
        diajukanPada: sekarang - 2 * 24 * 60 * 60 * 1000,
      });
      await ctx.db.insert("pawns", {
        userId,
        deskripsiBarang: "Kalung emas 5 gram",
        kategori: "Emas",
        alamatPenilaian: "Jl. Contoh No. 3",
        namaLengkap: "RANI AGREGAT",
        nomorRekening: "1234567890",
        status: "aktif",
        nomorReferensi: "PGD-AGR-3",
        pokokGadai: 1_500_000,
        sisaPokok: 1_200_000,
      });
      await ctx.db.insert("nasabahProfil", {
        userId,
        namaLengkap: "RANI AGREGAT",
        nik: "3201234567890011",
        nomorWhatsApp: "628123456792",
        penghasilanBulanan: 1_000_000,
        diperbaruiPada: sekarang,
        diperbaruiOlehLabel: "RANI AGREGAT",
      });
    });

    const overview = await admin.sesi.query(api.admin.adminOverview, {});
    const stats = await admin.sesi.query(api.admin.adminStats, {});
    const analitik = await admin.sesi.query(api.admin.adminAnalitik, {});

    expect(overview.stats).toEqual(stats);
    // `dihitungPada` sengaja dinolkan saat membandingkan: dua pemanggilan
    // berurutan punya jam yang berbeda beberapa milidetik, dan yang diuji adalah
    // ISI agregatnya, bukan cap waktunya.
    expect({ ...overview.analitik, dihitungPada: 0 }).toEqual({
      ...analitik,
      dihitungPada: 0,
    });
    // Sanity: angkanya benar-benar terisi, bukan dua-duanya kosong.
    expect(overview.stats?.totalPinjaman).toBe(2);
    expect(overview.analitik?.komposisi.ditinjau).toBe(1);
  });
});
