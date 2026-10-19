/**
 * Uji SURAT SOMASI (convex-test + vitest).
 *
 * Yang dijaga:
 *  - hanya admin ber-TOTP yang dapat membaca dan mengunduh surat;
 *  - surat hanya tersedia untuk pinjaman yang sudah melewati jatuh tempo;
 *  - angka di surat berasal dari mesin pelunasan yang sama dengan daftar kasus;
 *  - unduhan menghasilkan PDF dan tercatat di audit trail.
 *
 * Menjalankan: bunx vitest run src/convex/somasi.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { formatRupiah } from "../lib/money";
import schema from "./schema";
import { siapkanPengguna, type KonteksUji } from "./test.helpers";
import { modules } from "./test.setup";

const HARI = 86_400_000;

async function buatPinjaman(
  t: KonteksUji,
  userId: Id<"users">,
  opsi: { didanaiPada: number; nomorReferensi?: string },
): Promise<Id<"loans">> {
  return t.run((ctx) =>
    ctx.db.insert("loans", {
      userId,
      pokokPinjaman: 500_000,
      tujuan: "Modal usaha",
      namaLengkap: "Rani Peminjam",
      namaBank: "BCA",
      nomorRekening: "1234567890",
      nomorWhatsApp: "628123456789",
      status: "didanai",
      nomorReferensi: opsi.nomorReferensi ?? "PNJ-2026-0042",
      tenorHari: 30,
      didanaiPada: opsi.didanaiPada,
    }),
  );
}

describe("surat somasi", () => {
  it("admin membaca surat untuk pinjaman yang sudah lewat jatuh tempo", async () => {
    const t = convexTest(schema, modules);
    const rani = await siapkanPengguna(t, "Rani Peminjam", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    const admin = await siapkanPengguna(t, "Super Admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const loanId = await buatPinjaman(t, rani.userId, {
      didanaiPada: Date.now() - 40 * HARI,
    });

    const hasil = await admin.sesi.query(api.somasi.dataSomasi, { loanId });

    expect(hasil.tersedia).toBe(true);
    if (!hasil.tersedia) return;
    expect(hasil.surat.nomorSurat).toMatch(/^SOMASI\/PNJ-2026-0042\/\d{8}$/);
    expect(hasil.surat.kepada).toBe("Rani Peminjam");
    expect(hasil.surat.paragraf.some((p) => p.includes("10 hari"))).toBe(true);
    const rincian = (awalan: string) =>
      hasil.surat.rincian.find((r) => r.label.startsWith(awalan))?.nilai;
    expect(rincian("Pokok pinjaman")).toBe(formatRupiah(500_000));
    expect(rincian("Bunga dan biaya tercatat")).toBe(formatRupiah(150_000));
    expect(rincian("Denda keterlambatan")).toBe(formatRupiah(100_000));
    expect(hasil.surat.rincian[hasil.surat.rincian.length - 1]?.nilai).toBe(
      formatRupiah(750_000),
    );
    expect(hasil.namaBerkas).toBe("somasi-pnj-2026-0042.pdf");
  });

  it("peminjam tidak boleh membaca surat", async () => {
    const t = convexTest(schema, modules);
    const rani = await siapkanPengguna(t, "Rani Peminjam", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    const loanId = await buatPinjaman(t, rani.userId, {
      didanaiPada: Date.now() - 40 * HARI,
    });

    await expect(rani.sesi.query(api.somasi.dataSomasi, { loanId })).rejects.toThrow(
      /Super Admin|khusus/i,
    );
  });

  it("belum jatuh tempo berarti surat tidak dibuat", async () => {
    const t = convexTest(schema, modules);
    const rani = await siapkanPengguna(t, "Rani Peminjam", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    const admin = await siapkanPengguna(t, "Super Admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const loanId = await buatPinjaman(t, rani.userId, {
      didanaiPada: Date.now() - 5 * HARI,
    });

    const hasil = await admin.sesi.query(api.somasi.dataSomasi, { loanId });

    expect(hasil.tersedia).toBe(false);
    if (hasil.tersedia) return;
    expect(hasil.alasan).toMatch(/belum melewati jatuh tempo/i);
  });

  it("pinjaman yang sudah lunas tidak dibuatkan somasi", async () => {
    const t = convexTest(schema, modules);
    const rani = await siapkanPengguna(t, "Rani Peminjam", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    const admin = await siapkanPengguna(t, "Super Admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const loanId = await t.run((ctx) =>
      ctx.db.insert("loans", {
        userId: rani.userId,
        pokokPinjaman: 500_000,
        tujuan: "Modal usaha",
        namaLengkap: "Rani Peminjam",
        nomorRekening: "1234567890",
        status: "lunas",
        nomorReferensi: "PNJ-LUNAS",
        tenorHari: 30,
        didanaiPada: Date.now() - 40 * HARI,
        lunasPada: Date.now() - 2 * HARI,
      }),
    );

    const hasil = await admin.sesi.query(api.somasi.dataSomasi, { loanId });

    expect(hasil.tersedia).toBe(false);
    if (hasil.tersedia) return;
    expect(hasil.alasan).toMatch(/sudah lunas/i);
  });

  it("unduhan menghasilkan PDF dan tercatat di audit trail", async () => {
    const t = convexTest(schema, modules);
    const rani = await siapkanPengguna(t, "Rani Peminjam", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    const admin = await siapkanPengguna(t, "Super Admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const loanId = await buatPinjaman(t, rani.userId, {
      didanaiPada: Date.now() - 40 * HARI,
    });

    const hasil = await admin.sesi.action(api.somasi.unduhSomasi, { loanId });

    const isi = Buffer.from(hasil.base64, "base64").toString("latin1");
    expect(isi.startsWith("%PDF-")).toBe(true);
    expect(isi).toContain(hasil.nomorSurat);
    expect(hasil.namaBerkas).toBe("somasi-pnj-2026-0042.pdf");
    expect(hasil.batasBayarTeks).not.toBe("");

    const audit = await t.run((ctx) =>
      ctx.db
        .query("auditLog")
        .collect()
        .then((rows) => rows.filter((r) => r.aksi === "somasi_dibuat")),
    );
    expect(audit).toHaveLength(1);
    expect(audit[0]?.target).toBe("PNJ-2026-0042");
    expect(audit[0]?.detail).toContain(hasil.nomorSurat);
  });

  it("unduhan ditolak untuk peminjam", async () => {
    const t = convexTest(schema, modules);
    const rani = await siapkanPengguna(t, "Rani Peminjam", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    const loanId = await buatPinjaman(t, rani.userId, {
      didanaiPada: Date.now() - 40 * HARI,
    });

    await expect(rani.sesi.action(api.somasi.unduhSomasi, { loanId })).rejects.toThrow(
      /Super Admin|khusus/i,
    );
  });
});
