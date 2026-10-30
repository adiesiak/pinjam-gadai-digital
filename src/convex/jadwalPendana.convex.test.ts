/**
 * Tes transparansi perubahan jadwal untuk penyedia dana.
 *
 * Yang dijaga:
 *  - mengubah tenor pinjaman yang dananya SUDAH berjalan mencatat jejak
 *    `jadwalDiubah*` di pinjamannya, bukan hanya di audit trail;
 *  - pendananya menerima kabar di pusat notifikasi dan melihat jejak yang sama
 *    di ruang pendana;
 *  - pinjaman yang belum berjalan tidak menghasilkan kabar apa pun, karena
 *    belum ada dana siapa pun yang terkunci di dalamnya.
 *
 * Menjalankan: bunx vitest run src/convex/jadwalPendana.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { siapkanPengguna } from "./test.helpers";
import { modules } from "./test.setup";

const HARI = 86_400_000;

async function siapkanPinjaman(
  t: ReturnType<typeof convexTest>,
  opsi: {
    userId: Id<"users">;
    pendanaId: Id<"users">;
    status: "didanai" | "diajukan";
    nomorReferensi: string;
  },
): Promise<Id<"loans">> {
  return t.run(async (ctx) =>
    ctx.db.insert("loans", {
      userId: opsi.userId,
      pokokPinjaman: 1_000_000,
      pokokDiajukan: 1_000_000,
      tujuan: "Modal usaha",
      namaLengkap: "Rani Jadwal",
      namaBank: "BCA",
      nomorRekening: "1234567890",
      status: opsi.status,
      nomorReferensi: opsi.nomorReferensi,
      tenorHari: 30,
      pendanaId: opsi.pendanaId,
      pendanaNama: "Robert Jadwal",
      ...(opsi.status === "didanai"
        ? { didanaiPada: Date.now() - 5 * HARI }
        : {}),
    }),
  );
}

async function siapkanAdminNasabahPendana(t: ReturnType<typeof convexTest>) {
  const admin = await siapkanPengguna(t, "admin jadwal", {
    email: "admin-jadwal@pindai.test",
    role: "admin",
  });
  const peminjam = await siapkanPengguna(t, "rani jadwal", {
    email: "rani-jadwal@pindai.test",
    role: "peminjam",
  });
  const pendana = await siapkanPengguna(t, "Robert Jadwal", {
    email: "robert-jadwal@pindai.test",
    role: "dana",
  });
  return { admin, peminjam, pendana };
}

describe("perubahan tenor pinjaman berjalan diketahui pendananya", () => {
  it("mencatat jejak jadwal, memberi kabar pendana, dan menampilkannya di ruang pendana", async () => {
    const t = convexTest(schema, modules);
    const { admin, peminjam, pendana } = await siapkanAdminNasabahPendana(t);
    const loanId = await siapkanPinjaman(t, {
      userId: peminjam.userId,
      pendanaId: pendana.userId,
      status: "didanai",
      nomorReferensi: "PGD-JADWAL-1",
    });

    const hasil = await admin.sesi.mutation(api.penyediaDana.ubahDataPinjaman, {
      loanId,
      tenorHari: 45,
    });
    expect(hasil.pendanaDiberitahu).toBe(true);
    expect(hasil.perubahan).toContain("tenor 45 hari");

    const loan = await t.run((ctx) => ctx.db.get(loanId));
    expect(loan?.tenorHari).toBe(45);
    expect(loan?.jadwalDiubahPada).toBeTypeOf("number");
    expect(loan?.jadwalDiubahDari).toBe("30 hari");
    expect(loan?.jadwalDiubahKe).toBe("45 hari");

    // Audit menyebut sebelum → sesudah, bukan hanya nilai baru.
    const jejak = await t.run(async (ctx) => {
      const rows = await ctx.db.query("auditLog").collect();
      const cocok = rows.filter((r) => r.aksi === "ubah_data_pinjaman");
      return cocok[cocok.length - 1] ?? null;
    });
    expect(jejak?.detail ?? "").toContain("30 hari → 45 hari");
    expect(jejak?.detail ?? "").toMatch(/pendana diberi tahu/i);

    // Pendana menerima kabar di pusat notifikasi.
    const notif = await pendana.sesi.query(api.notifikasi.daftar, {});
    const kabar = notif.item.find((it) =>
      it.kunci.startsWith(`pendana:${loanId}:jadwal:`),
    );
    expect(kabar?.jenis).toBe("peringatan");
    expect(kabar?.judul).toMatch(/jadwal/i);
    expect(kabar?.ringkasan ?? "").toContain("30 hari menjadi 45 hari");

    // Jejak yang sama terbaca di ruang pendana, bukan hanya di notifikasi.
    const daftar = await pendana.sesi.query(api.penyediaDana.daftarPengajuan, {});
    const baris = daftar.pinjaman.find((p) => p._id === loanId);
    expect(baris?.jadwalDiubah?.dari).toBe("30 hari");
    expect(baris?.jadwalDiubah?.ke).toBe("45 hari");

    // Admin sendiri bukan pendana pinjaman ini: tidak ada kabar untuknya.
    const notifAdmin = await admin.sesi.query(api.notifikasi.daftar, {});
    expect(notifAdmin.item.some((it) => it.kunci.includes(":jadwal:"))).toBe(
      false,
    );
  });

  it("tidak mengarang kabar untuk tenor yang diubah sebelum dana berjalan", async () => {
    const t = convexTest(schema, modules);
    const { admin, peminjam, pendana } = await siapkanAdminNasabahPendana(t);
    const loanId = await siapkanPinjaman(t, {
      userId: peminjam.userId,
      pendanaId: pendana.userId,
      status: "diajukan",
      nomorReferensi: "PGD-JADWAL-2",
    });

    const hasil = await admin.sesi.mutation(api.penyediaDana.ubahDataPinjaman, {
      loanId,
      tenorHari: 45,
    });
    expect(hasil.pendanaDiberitahu).toBe(false);

    const loan = await t.run((ctx) => ctx.db.get(loanId));
    expect(loan?.tenorHari).toBe(45);
    expect(loan?.jadwalDiubahPada).toBeUndefined();
    expect(loan?.jadwalDiubahDari).toBeUndefined();

    const notif = await pendana.sesi.query(api.notifikasi.daftar, {});
    expect(notif.item.some((it) => it.kunci.includes(":jadwal:"))).toBe(false);
  });
});
