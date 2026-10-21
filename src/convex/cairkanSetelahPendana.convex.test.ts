/**
 * Tes alur "pilih pendana = perjanjian tercatat + dana tersalurkan".
 *
 * Yang dijaga: memilih pendana pada pinjaman yang nominalnya sudah disetujui
 * TIDAK mengarang tanda tangan baru. Yang dipakai adalah tanda tangan dan
 * persetujuan yang memang sudah dicatat saat pengajuan, dengan tanggal dan
 * versi aslinya. Pinjaman yang belum disetujui tetap di tempatnya, dan tanpa
 * flag `cairkanSekarang` perilaku lama tidak berubah.
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { CONTRACT_TERMS_VERSION } from "../lib/contract";
import schema from "./schema";
import { modules } from "./test.setup";
import { siapkanPengguna, type KonteksUji } from "./test.helpers";

const DISETUJUI_PADA = 1_700_000_000_000;

async function seedPinjaman(
  t: KonteksUji,
  opsi: {
    userId: Id<"users">;
    status: "diajukan" | "disetujui";
    nomorReferensi: string;
    denganTandaTangan?: boolean;
  },
): Promise<Id<"loans">> {
  return t.run((ctx) =>
    ctx.db.insert("loans", {
      userId: opsi.userId,
      pokokPinjaman: 1_000_000,
      tujuan: "Modal usaha",
      namaLengkap: "RANI PEMINJAM",
      namaBank: "BCA",
      nomorRekening: "1234567890",
      status: opsi.status,
      nomorReferensi: opsi.nomorReferensi,
      tenorHari: 30,
      ...(opsi.denganTandaTangan === false
        ? {}
        : {
            tandaTanganPeminjam: "data:image/png;base64,AAAA",
            tandaTanganPada: DISETUJUI_PADA,
            persetujuanPengajuanPada: DISETUJUI_PADA,
            persetujuanPengajuanVersi: CONTRACT_TERMS_VERSION,
          }),
    }),
  );
}

describe("memilih pendana — perjanjian & pencairan otomatis", () => {
  it("mencatat persetujuan pengajuan lalu menandai dana tersalurkan", async () => {
    const t = convexTest(schema, modules);
    const peminjam = await siapkanPengguna(t, "rani", {
      email: "rani-otomatis@pindai.test",
      role: "peminjam",
    });
    const pendana = await siapkanPengguna(t, "dana", {
      email: "dana-otomatis@pindai.test",
      role: "dana",
    });
    const admin = await siapkanPengguna(t, "admin", {
      email: "admin-otomatis@pindai.test",
      role: "admin",
    });
    const loanId = await seedPinjaman(t, {
      userId: peminjam.userId,
      status: "disetujui",
      nomorReferensi: "PGD-OTOMATIS-1",
    });

    const hasil = await admin.sesi.mutation(api.penyediaDana.ubahDataPinjaman, {
      loanId,
      pendanaUserId: pendana.userId,
      cairkanSekarang: true,
    });
    expect(hasil.dicairkan).toBe(true);

    const loan = await t.run((ctx) => ctx.db.get(loanId));
    expect(loan?.status).toBe("didanai");
    expect(loan?.pendanaId).toBe(pendana.userId);
    expect(loan?.didanaiPada).toBeGreaterThan(0);
    // Tanggal persetujuan TIDAK digeser ke waktu pencairan: yang dicatat adalah
    // persetujuan yang benar-benar diberikan peminjam saat mengajukan.
    expect(loan?.persetujuanSyaratPada).toBe(DISETUJUI_PADA);
    expect(loan?.persetujuanSyaratVersi).toBe(CONTRACT_TERMS_VERSION);

    // Pencairan lewat jalur ini juga membuat jadwal angsuran.
    const angsuran = await t.run((ctx) =>
      ctx.db
        .query("angsuran")
        .withIndex("by_loan", (q) => q.eq("loanId", loanId))
        .collect(),
    );
    expect(angsuran.length).toBeGreaterThan(0);
  });

  it("tidak melompati persetujuan nominal", async () => {
    const t = convexTest(schema, modules);
    const peminjam = await siapkanPengguna(t, "rani", {
      email: "rani-belum@pindai.test",
      role: "peminjam",
    });
    const pendana = await siapkanPengguna(t, "dana", {
      email: "dana-belum@pindai.test",
      role: "dana",
    });
    const admin = await siapkanPengguna(t, "admin", {
      email: "admin-belum@pindai.test",
      role: "admin",
    });
    const loanId = await seedPinjaman(t, {
      userId: peminjam.userId,
      status: "diajukan",
      nomorReferensi: "PGD-BELUM-1",
    });

    const hasil = await admin.sesi.mutation(api.penyediaDana.ubahDataPinjaman, {
      loanId,
      pendanaUserId: pendana.userId,
      cairkanSekarang: true,
    });
    expect(hasil.dicairkan).toBe(false);

    const loan = await t.run((ctx) => ctx.db.get(loanId));
    expect(loan?.status).toBe("diajukan");
    expect(loan?.pendanaId).toBe(pendana.userId);
    expect(loan?.persetujuanSyaratPada).toBeUndefined();
  });

  it("tanpa flag pencairan, memilih pendana tetap hanya mencatat", async () => {
    const t = convexTest(schema, modules);
    const peminjam = await siapkanPengguna(t, "rani", {
      email: "rani-manual@pindai.test",
      role: "peminjam",
    });
    const pendana = await siapkanPengguna(t, "dana", {
      email: "dana-manual@pindai.test",
      role: "dana",
    });
    const admin = await siapkanPengguna(t, "admin", {
      email: "admin-manual@pindai.test",
      role: "admin",
    });
    const loanId = await seedPinjaman(t, {
      userId: peminjam.userId,
      status: "disetujui",
      nomorReferensi: "PGD-MANUAL-1",
    });

    const hasil = await admin.sesi.mutation(api.penyediaDana.ubahDataPinjaman, {
      loanId,
      pendanaUserId: pendana.userId,
    });
    expect(hasil.dicairkan).toBe(false);

    const loan = await t.run((ctx) => ctx.db.get(loanId));
    expect(loan?.status).toBe("disetujui");
    expect(loan?.persetujuanSyaratPada).toBeUndefined();
  });
});
