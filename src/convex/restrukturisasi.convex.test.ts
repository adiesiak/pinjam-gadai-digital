/**
 * Uji RESTRUKTURISASI perpanjangan tenor (convex-test + vitest).
 *
 * Yang dijaga:
 *  - hanya admin ber-TOTP yang boleh mengajukan dan memutuskan;
 *  - persetujuan menggeser jatuh tempo dengan mengubah tenor, tanpa menyentuh
 *    pokok/status pinjaman;
 *  - penolakan tidak mengubah tenor sama sekali;
 *  - skema bulanan, pinjaman lunas, dan usulan ganda ditolak dengan alasan.
 *
 * Menjalankan: bunx vitest run src/convex/restrukturisasi.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { pelunasanPinjaman } from "../lib/loan";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { buatPengguna, siapkanPengguna, type KonteksUji } from "./test.helpers";
import { modules } from "./test.setup";

const HARI = 86_400_000;

const buatKontek = () => convexTest(schema, modules);

async function seedPinjaman(
  t: KonteksUji,
  opsi: { tenorHari?: number; tenorBulan?: number; status?: "didanai" | "lunas"; hariTerlambat?: number } = {},
): Promise<{ userId: Id<"users">; loanId: Id<"loans"> }> {
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", { name: "SITI PEMINJAM", role: "peminjam" }),
  );
  const didanaiPada = Date.now() - ((opsi.tenorHari ?? 30) + (opsi.hariTerlambat ?? 4)) * HARI;
  const loanId = await t.run((ctx) =>
    ctx.db.insert("loans", {
      userId,
      pokokPinjaman: 1_000_000,
      tujuan: "Modal usaha",
      namaLengkap: "SITI PEMINJAM",
      nomorRekening: "1234567890",
      status: opsi.status ?? "didanai",
      nomorReferensi: "RST-UJI-1",
      tenorHari: opsi.tenorHari ?? 30,
      ...(opsi.tenorBulan !== undefined ? { tenorBulan: opsi.tenorBulan } : {}),
      didanaiPada,
      ...(opsi.status === "lunas" ? { lunasPada: Date.now() } : {}),
    }),
  );
  return { userId, loanId };
}

const adminUtama = async (t: KonteksUji) =>
  siapkanPengguna(t, "Admin Utama", { email: "admin@pindai.test", role: "admin" });

async function aksiAudit(t: KonteksUji) {
  const rows = await t.run((ctx) => ctx.db.query("auditLog").collect());
  return rows.map((r) => r.aksi);
}

describe("akses restrukturisasi", () => {
  it("menolak admin tanpa TOTP terverifikasi", async () => {
    const t = buatKontek();
    const { loanId } = await seedPinjaman(t);
    const admin = await buatPengguna(t, "Admin Tanpa TOTP", {
      email: "admin-tanpa-totp@pindai.test",
      role: "admin",
    });

    await expect(
      admin.sesi.query(api.restrukturisasi.ringkasanRestrukturisasi, { loanId }),
    ).rejects.toThrow(/TOTP/);
  });
});

describe("pengajuan & keputusan", () => {
  it("menyetujui perpanjangan menggeser jatuh tempo tanpa mengubah pokok", async () => {
    const t = buatKontek();
    const { loanId } = await seedPinjaman(t);
    const admin = await adminUtama(t);
    const sebelum = await t.run((ctx) => ctx.db.get(loanId));
    const awal = pelunasanPinjaman(sebelum!, Date.now(), 2);

    await expect(
      admin.sesi.mutation(api.restrukturisasi.ajukanRestrukturisasi, {
        loanId,
        tambahanHari: 14,
        alasan: "coba",
      }),
    ).rejects.toThrow(/minimal 10 karakter/);

    const usul = await admin.sesi.mutation(api.restrukturisasi.ajukanRestrukturisasi, {
      loanId,
      tambahanHari: 14,
      alasan: "Nasabah kehilangan penghasilan bulan ini.",
    });
    expect(usul.tenorBaruHari).toBe(44);

    const ringkas = await admin.sesi.query(api.restrukturisasi.ringkasanRestrukturisasi, {
      loanId,
    });
    expect(ringkas.boleh).toBe(false);
    expect(ringkas.menunggu?.tambahanHari).toBe(14);

    const putus = await admin.sesi.mutation(api.restrukturisasi.putuskanRestrukturisasi, {
      id: usul.id,
      setuju: true,
      catatan: "Disetujui karena penghasilan menurun.",
    });
    expect(putus.status).toBe("disetujui");
    expect(putus.tenorBaruHari).toBe(44);

    const sesudah = await t.run((ctx) => ctx.db.get(loanId));
    expect(sesudah?.tenorHari).toBe(44);
    expect(sesudah?.pokokPinjaman).toBe(sebelum?.pokokPinjaman);
    expect(sesudah?.status).toBe("didanai");
    const akhir = pelunasanPinjaman(sesudah!, Date.now(), 2);
    expect(akhir!.jatuhTempoPada).toBe(awal!.jatuhTempoPada + 14 * HARI);
    expect(akhir!.hariTerlambat).toBe(0);

    expect(await aksiAudit(t)).toContain("restrukturisasi_diajukan");
    expect(await aksiAudit(t)).toContain("restrukturisasi_disetujui");
  });

  it("menolak usulan tidak mengubah tenor", async () => {
    const t = buatKontek();
    const { loanId } = await seedPinjaman(t);
    const admin = await adminUtama(t);

    const usul = await admin.sesi.mutation(api.restrukturisasi.ajukanRestrukturisasi, {
      loanId,
      tambahanHari: 7,
      alasan: "Nasabah meminta waktu tambahan.",
    });
    const putus = await admin.sesi.mutation(api.restrukturisasi.putuskanRestrukturisasi, {
      id: usul.id,
      setuju: false,
      catatan: "Kemampuan bayar belum terbukti.",
    });
    expect(putus.status).toBe("ditolak");
    expect(putus.tenorBaruHari).toBeNull();

    const loan = await t.run((ctx) => ctx.db.get(loanId));
    expect(loan?.tenorHari).toBe(30);
    expect(await aksiAudit(t)).toContain("restrukturisasi_ditolak");
  });

  it("menolak usulan kedua selama masih ada yang menggantung", async () => {
    const t = buatKontek();
    const { loanId } = await seedPinjaman(t);
    const admin = await adminUtama(t);

    await admin.sesi.mutation(api.restrukturisasi.ajukanRestrukturisasi, {
      loanId,
      tambahanHari: 7,
      alasan: "Nasabah meminta waktu tambahan.",
    });
    await expect(
      admin.sesi.mutation(api.restrukturisasi.ajukanRestrukturisasi, {
        loanId,
        tambahanHari: 14,
        alasan: "Usulan kedua yang seharusnya ditolak.",
      }),
    ).rejects.toThrow(/menunggu keputusan/);
  });

  it("menolak keputusan ganda atas usulan yang sama", async () => {
    const t = buatKontek();
    const { loanId } = await seedPinjaman(t);
    const admin = await adminUtama(t);
    const usul = await admin.sesi.mutation(api.restrukturisasi.ajukanRestrukturisasi, {
      loanId,
      tambahanHari: 7,
      alasan: "Nasabah meminta waktu tambahan.",
    });
    await admin.sesi.mutation(api.restrukturisasi.putuskanRestrukturisasi, {
      id: usul.id,
      setuju: true,
    });
    await expect(
      admin.sesi.mutation(api.restrukturisasi.putuskanRestrukturisasi, {
        id: usul.id,
        setuju: true,
      }),
    ).rejects.toThrow(/sudah diputuskan/);
  });
});

describe("batas jenis pinjaman", () => {
  it("menolak pinjaman skema bulanan", async () => {
    const t = buatKontek();
    const { loanId } = await seedPinjaman(t, { tenorBulan: 3 });
    const admin = await adminUtama(t);

    const ringkas = await admin.sesi.query(api.restrukturisasi.ringkasanRestrukturisasi, {
      loanId,
    });
    expect(ringkas.boleh).toBe(false);
    expect(ringkas.alasan).toMatch(/skema harian/);
    await expect(
      admin.sesi.mutation(api.restrukturisasi.ajukanRestrukturisasi, {
        loanId,
        tambahanHari: 7,
        alasan: "Nasabah meminta waktu tambahan.",
      }),
    ).rejects.toThrow(/skema harian/);
  });

  it("menolak pinjaman yang sudah lunas", async () => {
    const t = buatKontek();
    const { loanId } = await seedPinjaman(t, { status: "lunas" });
    const admin = await adminUtama(t);

    const ringkas = await admin.sesi.query(api.restrukturisasi.ringkasanRestrukturisasi, {
      loanId,
    });
    expect(ringkas.boleh).toBe(false);
    expect(ringkas.alasan).toMatch(/sudah lunas/);
  });
});
