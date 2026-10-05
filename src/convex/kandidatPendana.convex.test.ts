/**
 * Tes kandidat pendana & koreksi pemilik pinjaman (convex-test + vitest).
 *
 * Panel koreksi admin harus menampilkan SEMUA akun yang pernah menjadi pendana
 * — bukan hanya akun berperan `dana` beremail — supaya pendana lama tetap bisa
 * dipilih sebagai pengganti. Penetapan boleh lewat `pendanaUserId` (id akun).
 *
 * Menjalankan: bunx vitest run src/convex/kandidatPendana.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { siapkanPengguna, type KonteksUji } from "./test.helpers";
import { modules } from "./test.setup";

async function buatPinjaman(
  t: KonteksUji,
  userId: Id<"users">,
  status: "disetujui" | "didanai" | "lunas",
  pendanaNama?: string,
  pendanaId?: Id<"users">,
): Promise<Id<"loans">> {
  return t.run((ctx) =>
    ctx.db.insert("loans", {
      userId,
      pokokPinjaman: 1_000_000,
      tujuan: "Modal usaha kecil",
      namaLengkap: "RANI PEMINJAM",
      namaBank: "BCA",
      nomorRekening: "1234567890",
      status,
      nomorReferensi: `PGD-KAND-${status}-${pendanaNama ?? "x"}`,
      tenorHari: 30,
      ...(pendanaNama === undefined ? {} : { pendanaNama }),
      ...(pendanaId === undefined ? {} : { pendanaId }),
    }),
  );
}

describe("kandidat pendana & ubah pemilik pinjaman", () => {
  it("menampilkan pendana lama (peran bukan dana) dan bisa ditetapkan lewat id", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const { userId: peminjamId } = await siapkanPengguna(t, "rani", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    // Pendana lama: akun berperan `peminjam`, tetapi namanya dipakai sebagai
    // pendana pada sebuah pinjaman (data warisan tanpa pendanaId).
    const { userId: pendanaLamaId } = await siapkanPengguna(t, "Firman Hanafi", {
      email: "firman@pindai.test",
      role: "peminjam",
    });

    const loanId = await buatPinjaman(t, peminjamId, "disetujui", "Firman Hanafi");

    // Kandidat memuat pendana lama walau perannya bukan `dana`.
    const kandidat = await admin.query(api.penyediaDana.kandidatPendana, {});
    const baris = kandidat.rows.find((r) => r.userId === pendanaLamaId);
    expect(baris).toBeDefined();
    expect(baris?.nama).toBe("Firman Hanafi");

    // Tetapkan pemilik lewat id akun.
    const hasil = await admin.mutation(api.penyediaDana.ubahDataPinjaman, {
      loanId,
      alasan: "Koreksi pendana warisan",
      pendanaUserId: pendanaLamaId,
    });
    expect(hasil.perubahan.join(" ")).toContain("Firman Hanafi");

    const loan = await t.run((ctx) => ctx.db.get(loanId));
    expect(loan?.pendanaId).toBe(pendanaLamaId);
    expect(loan?.pendanaNama).toBe("Firman Hanafi");
  });

  it("menolak akun yang belum pernah menjadi pendana", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const { userId: peminjamId } = await siapkanPengguna(t, "rani", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    const { userId: orangBaruId } = await siapkanPengguna(t, "Orang Baru", {
      email: "orang-baru@pindai.test",
      role: "peminjam",
    });

    const loanId = await buatPinjaman(t, peminjamId, "disetujui");

    await expect(
      admin.mutation(api.penyediaDana.ubahDataPinjaman, {
        loanId,
        alasan: "Percobaan pemilik sembarangan",
        pendanaUserId: orangBaruId,
      }),
    ).rejects.toThrow(/belum pernah menjadi pendana/i);

    const loan = await t.run((ctx) => ctx.db.get(loanId));
    expect(loan?.pendanaId).toBeUndefined();
  });

  it("kandidat pendana hanya untuk admin", async () => {
    const t = convexTest(schema, modules);
    const { sesi: peminjam } = await siapkanPengguna(t, "rani", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    await expect(
      peminjam.query(api.penyediaDana.kandidatPendana, {}),
    ).rejects.toThrow(/admin/i);
  });
});
