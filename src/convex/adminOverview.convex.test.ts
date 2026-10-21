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
