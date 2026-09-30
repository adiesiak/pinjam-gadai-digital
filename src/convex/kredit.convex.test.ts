import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

const TEST_TOTP_SECRET = "JBSWY3DPEHPK3PXP";

async function siapkanPengguna(
  t: ReturnType<typeof convexTest>,
  subject: string,
  opts: { email: string; role: "peminjam" | "pendana" | "admin" },
): Promise<ReturnType<typeof t.withIdentity>> {
  const userId = await t.mutation((ctx) =>
    ctx.db.insert("users", {
      email: opts.email,
      name: subject,
      emailVerificationTime: Date.now(),
      role: opts.role,
    }),
  );
  const authSessionId = await t.run((ctx) =>
    ctx.db.insert("authSessions", {
      userId,
      expirationTime: Date.now() + 60 * 60 * 1000,
    }),
  );
  if (opts.role === "admin") {
    await t.run((ctx) =>
      ctx.db.insert("mfaSettings", {
        userId,
        totpSecret: TEST_TOTP_SECRET,
        totpVerifiedAuthSessionIds: [authSessionId],
      }),
    );
  }
  return t.withIdentity({ subject: `${userId}|${authSessionId}`, name: subject }) as never;
}

describe("manual review and unverified money movement", () => {
  it("keeps admin review but blocks deposit, funding, repayment, and ledger changes", async () => {
    const t = convexTest(schema, modules);
    const asAdmin = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const asPeminjam = await siapkanPengguna(t, "peminjam", {
      email: "peminjam@pindai.test",
      role: "peminjam",
    });
    const asPendana = await siapkanPengguna(t, "pendana", {
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
    await expect(
      asPendana.mutation(api.pendana.requestDeposit, {
        jumlah: 1_000_000,
        referensiTransfer: "MANUAL-REF-002",
      }),
    ).rejects.toThrow(guardMessage);
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
