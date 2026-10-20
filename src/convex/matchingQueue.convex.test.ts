/**
 * Uji antrean auto-matching: hanya tenor 7/14 hari, idempoten per pinjaman,
 * dan hanya admin yang boleh menandai dana tersalurkan.
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import { catatDanaKembali } from "./matchingQueue";
import schema from "./schema";
import { siapkanPengguna } from "./test.helpers";
import { modules } from "./test.setup";

const buatKontek = () => convexTest(schema, modules);

async function pinjamanUji(
  t: ReturnType<typeof buatKontek>,
  userId: Awaited<ReturnType<typeof siapkanPengguna>>["userId"],
  nomorReferensi: string,
  tenorHari: number,
) {
  return t.run((ctx) =>
    ctx.db.insert("loans", {
      userId,
      pokokPinjaman: 500_000,
      tujuan: "modal_usaha",
      namaLengkap: "Nasabah Antrean",
      nomorRekening: "1234567890",
      status: "lunas",
      nomorReferensi,
      tenorHari,
      lunasPada: Date.now(),
    }),
  );
}

describe("antrean auto-matching", () => {
  it("mencatat pokok tenor 7/14 hari sekali saja", async () => {
    const t = buatKontek();
    const peminjam = await siapkanPengguna(t, "Nasabah Antrean", {
      email: "nasabah-antrean@pindai.test",
      role: "peminjam",
    });
    const cepat = await pinjamanUji(t, peminjam.userId, "PGD-CEPAT", 7);
    const lambat = await pinjamanUji(t, peminjam.userId, "PGD-LAMBAT", 28);

    const waktu = Date.now();
    const id1 = await t.run((ctx) =>
      catatDanaKembali(
        ctx,
        {
          _id: cepat,
          nomorReferensi: "PGD-CEPAT",
          pokokPinjaman: 500_000,
          tenorHari: 7,
        },
        waktu,
      ),
    );
    expect(id1).not.toBeNull();
    const id2 = await t.run((ctx) =>
      catatDanaKembali(
        ctx,
        {
          _id: cepat,
          nomorReferensi: "PGD-CEPAT",
          pokokPinjaman: 500_000,
          tenorHari: 7,
        },
        waktu + 1_000,
      ),
    );
    expect(id2).toBe(id1);

    const tidakMasuk = await t.run((ctx) =>
      catatDanaKembali(
        ctx,
        {
          _id: lambat,
          nomorReferensi: "PGD-LAMBAT",
          pokokPinjaman: 500_000,
          tenorHari: 28,
        },
        waktu,
      ),
    );
    expect(tidakMasuk).toBeNull();

    const baris = await t.run((ctx) => ctx.db.query("matchingQueue").collect());
    expect(baris).toHaveLength(1);
    expect(baris[0].status).toBe("tersedia");
  });

  it("admin melihat total pool dan menandai dana tersalurkan", async () => {
    const t = buatKontek();
    const admin = await siapkanPengguna(t, "Admin Antrean", {
      email: "admin-antrean@pindai.test",
      role: "admin",
    });
    const peminjam = await siapkanPengguna(t, "Nasabah Pool", {
      email: "nasabah-pool@pindai.test",
      role: "peminjam",
    });
    const loanId = await pinjamanUji(t, peminjam.userId, "PGD-POOL", 14);
    const queueId = await t.run((ctx) =>
      catatDanaKembali(
        ctx,
        { _id: loanId, nomorReferensi: "PGD-POOL", pokokPinjaman: 500_000, tenorHari: 14 },
        Date.now(),
      ),
    );
    if (queueId === null) throw new Error("Antrean tidak terbentuk.");

    const ringkas = await admin.sesi.query(api.matchingQueue.ringkasanAntrean, {});
    expect(ringkas.jumlahTersedia).toBe(1);
    expect(ringkas.totalTersedia).toBe(500_000);

    await admin.sesi.mutation(api.matchingQueue.tandaiTersalurkan, { id: queueId });
    const sesudah = await admin.sesi.query(api.matchingQueue.ringkasanAntrean, {});
    expect(sesudah.jumlahTersedia).toBe(0);
    expect(sesudah.sudahTersalurkan).toBe(1);

    await expect(
      admin.sesi.mutation(api.matchingQueue.tandaiTersalurkan, { id: queueId }),
    ).rejects.toThrow(/sudah ditandai/i);
  });

  it("menolak akun non-admin", async () => {
    const t = buatKontek();
    const peminjam = await siapkanPengguna(t, "Nasabah Biasa", {
      email: "nasabah-biasa@pindai.test",
      role: "peminjam",
    });
    await expect(
      peminjam.sesi.query(api.matchingQueue.ringkasanAntrean, {}),
    ).rejects.toThrow(/Super Admin/i);
  });
});
