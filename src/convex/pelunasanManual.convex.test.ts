/**
 * Tes pelunasan manual oleh admin.
 *
 * Yang dijaga:
 *  - "lunas" tidak bisa dicapai lewat ubah status biasa selama tagihan masih ada;
 *  - pelunasan harian dan bulanan wajib menyebut nominal persis; nomor mutasi
 *    bank bersifat opsional dan keduanya tetap mencatat uang yang sama;
 *  - jurnal ditulis, seluruh angsuran ditutup, dan posisi penyedia dana selesai;
 *  - nominal yang salah ditolak tanpa mengubah status atau jurnal.
 *
 * Menjalankan: bunx vitest run src/convex/pelunasanManual.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { siapkanPengguna } from "./test.helpers";
import { modules } from "./test.setup";

const HARI = 86_400_000;

type OpsiPinjaman = {
  userId: Id<"users">;
  danaId: Id<"users">;
  nomorReferensi: string;
  tenorBulan?: number;
};

async function siapkanPinjaman(
  t: ReturnType<typeof convexTest>,
  opsi: OpsiPinjaman,
): Promise<Id<"loans">> {
  const mulai = Date.now() - 5 * HARI;
  const bulanan = opsi.tenorBulan !== undefined;
  const pokok = bulanan ? 3_000_000 : 1_000_000;
  return t.run(async (ctx) => {
    const loanId = await ctx.db.insert("loans", {
      userId: opsi.userId,
      pokokPinjaman: pokok,
      tujuan: "Modal usaha",
      namaLengkap: "Rani Pelunasan",
      namaBank: "BCA",
      nomorRekening: "1234567890",
      status: "didanai",
      nomorReferensi: opsi.nomorReferensi,
      tenorHari: bulanan ? 90 : 30,
      ...(opsi.tenorBulan === undefined ? {} : { tenorBulan: opsi.tenorBulan }),
      didanaiPada: mulai,
    });
    await ctx.db.insert("fundings", {
      loanId,
      danaId: opsi.danaId,
      jumlahAlokasi: pokok,
      // Snapshot hak pendana: 235 rb untuk 1 jt, 1,41 jt untuk 3 jt.
      imbalHasil: bulanan ? 1_410_000 : 235_000,
      status: "dialokasikan",
      nomorReferensi: `ALOK-${opsi.nomorReferensi}`,
    });
    return loanId;
  });
}

/**
 * Pinjaman yang pendananya dicatat admin di luar aplikasi: `pendanaId` terisi
 * tetapi tidak ada baris `fundings`, persis seperti pinjaman yang dicatat
 * manual. Pelunasan tetap harus bisa dicatat tanpa mengarang posisi pendana.
 */
async function siapkanPinjamanTanpaAlokasi(
  t: ReturnType<typeof convexTest>,
  opsi: {
    userId: Id<"users">;
    pendanaId: Id<"users">;
    nomorReferensi: string;
    tenorBulan?: number;
  },
): Promise<Id<"loans">> {
  const bulanan = opsi.tenorBulan !== undefined;
  return t.run(async (ctx) =>
    ctx.db.insert("loans", {
      userId: opsi.userId,
      pokokPinjaman: bulanan ? 3_000_000 : 1_000_000,
      tujuan: "Modal usaha",
      namaLengkap: "Rani Manual",
      namaBank: "BCA",
      nomorRekening: "1234567890",
      status: "didanai",
      nomorReferensi: opsi.nomorReferensi,
      tenorHari: bulanan ? 90 : 30,
      ...(opsi.tenorBulan === undefined ? {} : { tenorBulan: opsi.tenorBulan }),
      pendanaId: opsi.pendanaId,
      pendanaNama: "Dana Manual",
      didanaiPada: Date.now() - 5 * HARI,
    }),
  );
}

async function siapkanAdminDanNasabah(t: ReturnType<typeof convexTest>) {
  const admin = await siapkanPengguna(t, "admin pelunasan", {
    email: "admin-pelunasan@pindai.test",
    role: "admin",
  });
  const peminjam = await siapkanPengguna(t, "rani pelunasan", {
    email: "rani-pelunasan@pindai.test",
    role: "peminjam",
  });
  const pendana = await siapkanPengguna(t, "dana pelunasan", {
    email: "dana-pelunasan@pindai.test",
    role: "dana",
  });
  return { admin, peminjam, pendana };
}

describe("pelunasan manual oleh admin", () => {
  it("melunasi pinjaman harian, menutup angsuran dan posisi pendana", async () => {
    const t = convexTest(schema, modules);
    const { admin, peminjam, pendana } = await siapkanAdminDanNasabah(t);
    const loanId = await siapkanPinjaman(t, {
      userId: peminjam.userId,
      danaId: pendana.userId,
      nomorReferensi: "PGD-LUNAS-HARIAN",
    });

    const info = await admin.sesi.query(api.perpanjanganPinjaman.infoPelunasanManual, {
      loanId,
    });
    if (info === null || !info.bisa) throw new Error("Info pelunasan tidak tersedia.");
    expect(info.jalur).toBe("harian");
    expect(info.pokok).toBe(1_000_000);
    expect(info.totalDue).toBe(1_000_000 + info.bunga + info.denda);

    await expect(
      admin.sesi.mutation(api.perpanjanganPinjaman.catatPelunasanManual, {
        loanId,
        referensiMutasi: "MUTASI-HARIAN-001",
        jumlahMutasi: info.totalDue - 1_000,
        tanggal: Date.now(),
      }),
    ).rejects.toThrow(/tidak sama/i);

    await admin.sesi.mutation(api.perpanjanganPinjaman.catatPelunasanManual, {
      loanId,
      jumlahMutasi: info.totalDue,
      tanggal: Date.now(),
      catatan: "Setoran tunai di kantor",
    });

    // Tanpa nomor mutasi pun jejak audit tetap menjelaskan asal uangnya.
    const jejak = await t.run(async (ctx) =>
      ctx.db
        .query("auditLog")
        .filter((q) => q.eq(q.field("aksi"), "pelunasan_manual_dicatat"))
        .first(),
    );
    expect(jejak?.detail ?? "").toMatch(/tanpa nomor mutasi/i);

    const hasil = await t.run(async (ctx) => {
      const loan = await ctx.db.get(loanId);
      const fundings = await ctx.db
        .query("fundings")
        .withIndex("by_loan", (q) => q.eq("loanId", loanId))
        .collect();
      const angsuran = await ctx.db
        .query("angsuran")
        .withIndex("by_loan", (q) => q.eq("loanId", loanId))
        .collect();
      const entries = await ctx.db.query("ledger_entries").collect();
      return { loan, fundings, angsuran, entries };
    });

    expect(hasil.loan?.status).toBe("lunas");
    expect(hasil.loan?.remainingPrincipal).toBe(0);
    expect(hasil.fundings.every((row) => row.status === "selesai")).toBe(true);
    expect(hasil.angsuran.length).toBeGreaterThan(0);
    expect(hasil.angsuran.every((row) => row.status === "lunas")).toBe(true);

    const debit = hasil.entries
      .filter((entry) => entry.arah === "debit")
      .reduce((acc, entry) => acc + entry.jumlah, 0);
    const kredit = hasil.entries
      .filter((entry) => entry.arah === "kredit")
      .reduce((acc, entry) => acc + entry.jumlah, 0);
    expect(debit).toBe(kredit);

    // Posisi sudah ditutup, jadi pencatatan kedua ditolak, bukan menggandakan jurnal.
    await expect(
      admin.sesi.mutation(api.perpanjanganPinjaman.catatPelunasanManual, {
        loanId,
        referensiMutasi: "MUTASI-HARIAN-002",
        jumlahMutasi: info.totalDue,
        tanggal: Date.now(),
      }),
    ).rejects.toThrow(/Didanai/i);
  });

  it("melunasi pinjaman bulanan setelah seluruh sisa angsuran dihitung server", async () => {
    const t = convexTest(schema, modules);
    const { admin, peminjam, pendana } = await siapkanAdminDanNasabah(t);
    const loanId = await siapkanPinjaman(t, {
      userId: peminjam.userId,
      danaId: pendana.userId,
      nomorReferensi: "PGD-LUNAS-BULANAN",
      tenorBulan: 3,
    });

    const info = await admin.sesi.query(api.perpanjanganPinjaman.infoPelunasanManual, {
      loanId,
    });
    if (info === null || !info.bisa) throw new Error("Info pelunasan tidak tersedia.");
    expect(info.jalur).toBe("bulanan");
    expect(info.jumlahAngsuran).toBe(3);
    expect(info.pokok).toBe(3_000_000);

    await expect(
      admin.sesi.mutation(api.angsuran.catatPelunasanManualBulanan, {
        loanId,
        referensiMutasi: "MUTASI-BULANAN-001",
        jumlahMutasi: info.totalDue - 10_000,
        tanggal: Date.now(),
      }),
    ).rejects.toThrow(/tidak sama/i);

    const hasil = await admin.sesi.mutation(api.angsuran.catatPelunasanManualBulanan, {
      loanId,
      referensiMutasi: "MUTASI-BULANAN-001",
      jumlahMutasi: info.totalDue,
      tanggal: Date.now(),
    });
    expect(hasil.semuaLunas).toBe(true);

    const sesudah = await t.run(async (ctx) => {
      const loan = await ctx.db.get(loanId);
      const fundings = await ctx.db
        .query("fundings")
        .withIndex("by_loan", (q) => q.eq("loanId", loanId))
        .collect();
      const angsuran = await ctx.db
        .query("angsuran")
        .withIndex("by_loan", (q) => q.eq("loanId", loanId))
        .collect();
      const entries = await ctx.db.query("ledger_entries").collect();
      return { loan, fundings, angsuran, entries };
    });

    expect(sesudah.loan?.status).toBe("lunas");
    expect(sesudah.fundings.every((row) => row.status === "selesai")).toBe(true);
    expect(sesudah.angsuran).toHaveLength(3);
    expect(sesudah.angsuran.every((row) => row.status === "lunas")).toBe(true);

    const debit = sesudah.entries
      .filter((entry) => entry.arah === "debit")
      .reduce((acc, entry) => acc + entry.jumlah, 0);
    const kredit = sesudah.entries
      .filter((entry) => entry.arah === "kredit")
      .reduce((acc, entry) => acc + entry.jumlah, 0);
    expect(debit).toBe(kredit);
  });

  it("melunasi pinjaman harian tanpa posisi alokasi pendana di aplikasi", async () => {
    const t = convexTest(schema, modules);
    const { admin, peminjam, pendana } = await siapkanAdminDanNasabah(t);
    const loanId = await siapkanPinjamanTanpaAlokasi(t, {
      userId: peminjam.userId,
      pendanaId: pendana.userId,
      nomorReferensi: "PGD-MANUAL-HARIAN",
    });

    const info = await admin.sesi.query(api.perpanjanganPinjaman.infoPelunasanManual, {
      loanId,
    });
    if (info === null || !info.bisa) throw new Error("Info pelunasan tidak tersedia.");
    expect(info.totalDue).toBeGreaterThan(1_000_000);

    await admin.sesi.mutation(api.perpanjanganPinjaman.catatPelunasanManual, {
      loanId,
      referensiMutasi: "MUTASI-MANUAL-001",
      jumlahMutasi: info.totalDue,
      tanggal: Date.now(),
    });

    const sesudah = await t.run(async (ctx) => {
      const loan = await ctx.db.get(loanId);
      const angsuran = await ctx.db
        .query("angsuran")
        .withIndex("by_loan", (q) => q.eq("loanId", loanId))
        .collect();
      const entries = await ctx.db.query("ledger_entries").collect();
      return { loan, angsuran, entries };
    });

    expect(sesudah.loan?.status).toBe("lunas");
    expect(sesudah.loan?.remainingPrincipal).toBe(0);
    expect(sesudah.angsuran.every((row) => row.status === "lunas")).toBe(true);
    // Pinjaman lama tanpa penanda tetap terbaca sebagai dana di luar aplikasi.
    const daftar = await admin.sesi.query(api.penyediaDana.daftarPengajuan, {});
    expect(
      daftar.pinjaman.find((p) => p._id === loanId)?.pendanaanLuarAplikasi,
    ).toBe(true);
    // Kas masuk dicatat, tetapi tidak ada pembayaran pendana yang dikarang.
    expect(sesudah.entries.length).toBeGreaterThan(0);
    expect(sesudah.entries.every((entry) => entry.jenis === "repayment")).toBe(true);

    const jejak = await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("auditLog")
        .filter((q) => q.eq(q.field("aksi"), "loan_lunas"))
        .collect();
      return rows[rows.length - 1] ?? null;
    });
    expect(jejak?.detail ?? "").toMatch(/tanpa posisi alokasi pendana/i);
  });

  it("melunasi pinjaman bulanan tanpa posisi alokasi pendana di aplikasi", async () => {
    const t = convexTest(schema, modules);
    const { admin, peminjam, pendana } = await siapkanAdminDanNasabah(t);
    const loanId = await siapkanPinjamanTanpaAlokasi(t, {
      userId: peminjam.userId,
      pendanaId: pendana.userId,
      nomorReferensi: "PGD-MANUAL-BULANAN",
      tenorBulan: 3,
    });

    const info = await admin.sesi.query(api.perpanjanganPinjaman.infoPelunasanManual, {
      loanId,
    });
    if (info === null || !info.bisa) throw new Error("Info pelunasan tidak tersedia.");

    const hasil = await admin.sesi.mutation(api.angsuran.catatPelunasanManualBulanan, {
      loanId,
      jumlahMutasi: info.totalDue,
      tanggal: Date.now(),
    });
    expect(hasil.semuaLunas).toBe(true);

    const sesudah = await t.run(async (ctx) => {
      const loan = await ctx.db.get(loanId);
      const angsuran = await ctx.db
        .query("angsuran")
        .withIndex("by_loan", (q) => q.eq("loanId", loanId))
        .collect();
      const entries = await ctx.db.query("ledger_entries").collect();
      return { loan, angsuran, entries };
    });

    expect(sesudah.loan?.status).toBe("lunas");
    expect(sesudah.angsuran).toHaveLength(3);
    expect(sesudah.angsuran.every((row) => row.status === "lunas")).toBe(true);
    expect(sesudah.entries.some((entry) => entry.jenis === "payout")).toBe(false);
  });

  it("mencatat sumber dana pendana saat dana ditandai tersalurkan", async () => {
    const t = convexTest(schema, modules);
    const { admin, peminjam, pendana } = await siapkanAdminDanNasabah(t);

    // Pinjaman yang dananya masuk di luar aplikasi: tidak ada baris alokasi.
    const manualId = await t.run((ctx) =>
      ctx.db.insert("loans", {
        userId: peminjam.userId,
        pokokPinjaman: 1_000_000,
        tujuan: "Modal usaha",
        namaLengkap: "Rani Manual",
        namaBank: "BCA",
        nomorRekening: "1234567890",
        status: "disetujui",
        nomorReferensi: "PGD-SUMBER-MANUAL",
        tenorHari: 30,
        pendanaId: pendana.userId,
        pendanaNama: "Dana Manual",
      }),
    );
    await admin.sesi.mutation(api.loans.danaiPinjaman, { loanId: manualId });
    expect(
      (await t.run((ctx) => ctx.db.get(manualId)))?.pendanaanLuarAplikasi,
    ).toBe(true);

    // Ruang pendana dan admin membaca penanda yang sama.
    const daftar = await admin.sesi.query(api.penyediaDana.daftarPengajuan, {});
    expect(
      daftar.pinjaman.find((p) => p._id === manualId)?.pendanaanLuarAplikasi,
    ).toBe(true);

    // Pinjaman yang sudah punya posisi dompet tidak ditandai luar aplikasi.
    const lewatDompetId = await t.run(async (ctx) => {
      const loanId = await ctx.db.insert("loans", {
        userId: peminjam.userId,
        pokokPinjaman: 1_000_000,
        tujuan: "Modal usaha",
        namaLengkap: "Rani Dompet",
        namaBank: "BCA",
        nomorRekening: "1234567890",
        status: "disetujui",
        nomorReferensi: "PGD-SUMBER-DOMPET",
        tenorHari: 30,
        pendanaId: pendana.userId,
        pendanaNama: "Dana Manual",
      });
      await ctx.db.insert("fundings", {
        loanId,
        danaId: pendana.userId,
        jumlahAlokasi: 1_000_000,
        imbalHasil: 235_000,
        status: "dialokasikan",
        nomorReferensi: "ALOK-SUMBER-DOMPET",
      });
      return loanId;
    });
    await admin.sesi.mutation(api.loans.danaiPinjaman, { loanId: lewatDompetId });
    expect(
      (await t.run((ctx) => ctx.db.get(lewatDompetId)))?.pendanaanLuarAplikasi,
    ).toBeUndefined();
  });

  it("menolak tombol ubah status ke lunas selama tagihan masih terbuka", async () => {
    const t = convexTest(schema, modules);
    const { admin, peminjam, pendana } = await siapkanAdminDanNasabah(t);
    const loanId = await siapkanPinjaman(t, {
      userId: peminjam.userId,
      danaId: pendana.userId,
      nomorReferensi: "PGD-TOLAK-LUNAS",
    });

    await expect(
      admin.sesi.mutation(api.loans.ubahStatusPinjaman, {
        loanId,
        status: "lunas",
      }),
    ).rejects.toThrow(/Catat pelunasan/i);

    // Dana pendana sudah keluar, jadi status juga tidak boleh mundur ke tahap
    // sebelum pencairan tanpa membalik alokasi dan jurnalnya.
    await expect(
      admin.sesi.mutation(api.loans.ubahStatusPinjaman, {
        loanId,
        status: "ditinjau",
      }),
    ).rejects.toThrow(/tidak bisa dikembalikan/i);

    const loan = await t.run((ctx) => ctx.db.get(loanId));
    expect(loan?.status).toBe("didanai");
  });
});
