/**
 * Uji RESTRUKTURISASI perpanjangan tenor dan permohonan nasabah
 * (convex-test + vitest).
 *
 * Yang dijaga:
 *  - hanya admin ber-TOTP yang boleh memutuskan;
 *  - nasabah hanya bisa mengajukan untuk pinjamannya sendiri;
 *  - persetujuan perpanjangan menggeser jatuh tempo dengan mengubah tenor,
 *    tanpa menyentuh pokok/status pinjaman;
 *  - persetujuan cicilan hanya mencatat kesepakatan, tidak mengubah tenor;
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

type OpsiPinjamanUji = {
  tenorHari?: number;
  tenorBulan?: number;
  status?: "didanai" | "lunas";
  hariTerlambat?: number;
};

async function seedPinjamanMilik(
  t: KonteksUji,
  userId: Id<"users">,
  opsi: OpsiPinjamanUji = {},
): Promise<Id<"loans">> {
  const didanaiPada =
    Date.now() - ((opsi.tenorHari ?? 30) + (opsi.hariTerlambat ?? 4)) * HARI;
  return await t.run((ctx) =>
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
}

async function seedPinjaman(
  t: KonteksUji,
  opsi: OpsiPinjamanUji = {},
): Promise<{ userId: Id<"users">; loanId: Id<"loans"> }> {
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", { name: "SITI PEMINJAM", role: "peminjam" }),
  );
  const loanId = await seedPinjamanMilik(t, userId, opsi);
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

describe("permohonan dari dashboard nasabah", () => {
  it("nasabah mengajukan perpanjangan untuk pinjamannya sendiri", async () => {
    const t = buatKontek();
    const nasabah = await buatPengguna(t, "SITI PEMINJAM", { role: "peminjam" });
    const loanId = await seedPinjamanMilik(t, nasabah.userId);

    const r = await nasabah.sesi.mutation(api.restrukturisasi.ajukanPermohonanNasabah, {
      loanId,
      jenis: "perpanjangan_tenor",
      tambahanHari: 14,
      alasan: "Penghasilan turun karena usaha sepi.",
    });
    expect(r.tenorBaruHari).toBe(44);

    const ringkas = await nasabah.sesi.query(
      api.restrukturisasi.ringkasanPermohonanNasabah,
      { loanId },
    );
    expect(ringkas.bolehPerpanjangan).toBe(false);
    expect(ringkas.menunggu?.jenis).toBe("perpanjangan_tenor");
    expect(ringkas.menunggu?.tambahanHari).toBe(14);

    const admin = await adminUtama(t);
    const antrean = await admin.sesi.query(
      api.restrukturisasi.daftarPermohonanMenunggu,
      {},
    );
    expect(antrean).toHaveLength(1);
    expect(antrean[0].diajukanOlehNasabah).toBe(true);
    expect(antrean[0].namaLengkap).toBe("SITI PEMINJAM");

    const putus = await admin.sesi.mutation(api.restrukturisasi.putuskanRestrukturisasi, {
      id: r.id,
      setuju: true,
      catatan: "Disetujui setelah konfirmasi penghasilan.",
    });
    expect(putus.jenis).toBe("perpanjangan_tenor");
    expect(putus.tenorBaruHari).toBe(44);

    const loan = await t.run((ctx) => ctx.db.get(loanId));
    expect(loan?.tenorHari).toBe(44);
    expect(await aksiAudit(t)).toContain("permohonan_nasabah_diajukan");
    expect(
      await admin.sesi.query(api.restrukturisasi.daftarPermohonanMenunggu, {}),
    ).toHaveLength(0);
  });

  it("menyetujui usulan cicilan tidak mengubah tenor", async () => {
    const t = buatKontek();
    const nasabah = await buatPengguna(t, "SITI PEMINJAM", { role: "peminjam" });
    const loanId = await seedPinjamanMilik(t, nasabah.userId, {
      tenorBulan: 3,
      tenorHari: 90,
    });

    const r = await nasabah.sesi.mutation(api.restrukturisasi.ajukanPermohonanNasabah, {
      loanId,
      jenis: "cicilan",
      usulanCicilan: 400_000,
      alasan: "Ingin membayar bertahap setiap dua minggu.",
    });
    expect(r.jenis).toBe("cicilan");
    expect(r.tenorBaruHari).toBeNull();
    expect(r.perkiraanJumlahCicilan).toBeGreaterThan(1);

    const admin = await adminUtama(t);
    const putus = await admin.sesi.mutation(api.restrukturisasi.putuskanRestrukturisasi, {
      id: r.id,
      setuju: true,
      catatan: "Cicilan disepakati lewat telepon.",
    });
    expect(putus.jenis).toBe("cicilan");
    expect(putus.tenorBaruHari).toBeNull();

    const loan = await t.run((ctx) => ctx.db.get(loanId));
    expect(loan?.tenorHari).toBe(90);
    expect(loan?.tenorBulan).toBe(3);
  });

  it("menolak permohonan untuk pinjaman milik orang lain", async () => {
    const t = buatKontek();
    const pemilik = await buatPengguna(t, "SITI PEMINJAM", { role: "peminjam" });
    const lain = await buatPengguna(t, "ORANG LAIN", { role: "peminjam" });
    const loanId = await seedPinjamanMilik(t, pemilik.userId);

    await expect(
      lain.sesi.mutation(api.restrukturisasi.ajukanPermohonanNasabah, {
        loanId,
        jenis: "perpanjangan_tenor",
        tambahanHari: 7,
        alasan: "Mencoba mengajukan untuk pinjaman orang lain.",
      }),
    ).rejects.toThrow(/tidak ditemukan/);
    await expect(
      lain.sesi.query(api.restrukturisasi.ringkasanPermohonanNasabah, { loanId }),
    ).rejects.toThrow(/tidak ditemukan/);
  });

  it("menolak usulan cicilan di atas total kewajiban", async () => {
    const t = buatKontek();
    const nasabah = await buatPengguna(t, "SITI PEMINJAM", { role: "peminjam" });
    const loanId = await seedPinjamanMilik(t, nasabah.userId);

    await expect(
      nasabah.sesi.mutation(api.restrukturisasi.ajukanPermohonanNasabah, {
        loanId,
        jenis: "cicilan",
        usulanCicilan: 5_000_000,
        alasan: "Nominal ini jelas melebihi kewajiban.",
      }),
    ).rejects.toThrow(/melebihi total kewajiban/);
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
