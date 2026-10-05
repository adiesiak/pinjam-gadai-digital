/**
 * Tes bunga pinjaman per nasabah (convex-test + vitest).
 *
 * Admin dapat menetapkan bunga khusus satu nasabah. Override itu:
 *  - menang atas default Pengaturan Sistem dan terbaca oleh form pengajuan;
 *  - tersimpan sebagai snapshot pada tiap pengajuan (pinjaman yang belum cair
 *    ikut diperbarui, pinjaman yang sudah cair tidak berubah);
 *  - dipakai untuk menghitung kewajiban Peminjam (skema harian 130% default).
 *
 * Admin juga dapat menghapus AKUN nasabah; pengajuan & riwayat keuangannya
 * sengaja dibiarkan utuh.
 *
 * Menjalankan: bunx vitest run src/convex/bunga.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { siapkanPengguna, type KonteksUji } from "./test.helpers";
import { modules } from "./test.setup";

/** Pinjaman tunai yang sudah didanai — cukup untuk membaca kewajiban. */
async function siapkanPinjamanDidanai(
  t: KonteksUji,
  userId: Id<"users">,
  pokokPinjaman: number,
  persenBunga: number | undefined,
  status: "didanai" | "lunas" = "didanai",
): Promise<Id<"loans">> {
  return t.run(async (ctx) => {
    const now = Date.now();
    const danaId = await ctx.db.insert("users", {
      email: `dana-bunga-${pokokPinjaman}-${status}@pindai.test`,
      name: "Penyedia dana seed",
      emailVerificationTime: now,
      role: "dana",
    });
    const loanId = await ctx.db.insert("loans", {
      userId,
      pokokPinjaman,
      tujuan: "Modal usaha kecil",
      namaLengkap: "RANI PEMINJAM",
      namaBank: "BCA",
      nomorRekening: "1234567890",
      status,
      nomorReferensi: `PGB-${pokokPinjaman}-${status}`,
      tenorHari: 30,
      didanaiPada: now - 86_400_000,
      pendanaId: danaId,
      pendanaNama: "Penyedia dana seed",
      ...(persenBunga === undefined ? {} : { persenBunga }),
    });
    await ctx.db.insert("fundings", {
      loanId,
      danaId,
      jumlahAlokasi: pokokPinjaman,
      imbalHasil: persenBunga === undefined ? 0 : Math.round((pokokPinjaman * persenBunga) / 100),
      status: "dialokasikan",
      nomorReferensi: `FNB-${pokokPinjaman}-${status}`,
    });
    return loanId;
  });
}

/** Pengajuan yang belum cair (status diajukan) untuk menguji propagasi. */
async function siapkanPengajuan(
  t: KonteksUji,
  userId: Id<"users">,
  pokokPinjaman: number,
  persenBunga: number,
): Promise<Id<"loans">> {
  return t.run((ctx) =>
    ctx.db.insert("loans", {
      userId,
      pokokPinjaman,
      tujuan: "Modal usaha kecil",
      namaLengkap: "RANI PEMINJAM",
      namaBank: "BCA",
      nomorRekening: "1234567890",
      status: "diajukan",
      nomorReferensi: `PGD-PENDING-${pokokPinjaman}`,
      tenorHari: 30,
      persenBunga,
    }),
  );
}

describe("bunga pinjaman per nasabah", () => {
  it("admin menetapkan bunga khusus; form & daftar admin ikut menyesuaikan", async () => {
    const t = convexTest(schema, modules);
    const { sesi: peminjam, userId } = await siapkanPengguna(t, "rani", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });

    // Daftar hanya memuat nasabah yang pernah mengajukan — buat satu pengajuan.
    await siapkanPengajuan(t, userId, 1_000_000, 30);
    // Default global = 30%.
    expect(await peminjam.query(api.lokasi.bungaSaya, {})).toBe(30);

    const hasil = await admin.mutation(api.admin.setBungaPeminjam, {
      userId,
      persenBunga: 42,
      alasan: "Nasabah berisiko, bunga dinaikkan",
    });
    expect(hasil.persenBunga).toBe(42);
    expect(await peminjam.query(api.lokasi.bungaSaya, {})).toBe(42);

    const daftar = await admin.query(api.admin.daftarPlafonPeminjam, {});
    const baris = daftar.rows.find((r) => r.userId === userId);
    expect(baris?.persenBungaPribadi).toBe(42);
    expect(baris?.persenBungaEfektif).toBe(42);

    // Quote admin menghormati bunga khusus (130% → 142%).
    const quote = await admin.query(api.admin.adminLoanQuote, {
      pokokPinjaman: 1_000_000,
      persenBunga: 42,
    });
    expect(quote.quote.totalKewajibanPelunasan).toBe(1_420_000);
    expect(quote.quote.bunga).toBe(420_000);
  });

  it("bunga khusus hanya mengubah pengajuan yang belum cair", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await siapkanPengguna(t, "budi", {
      email: "budi@pindai.test",
      role: "peminjam",
    });
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });

    const pengajuan = await siapkanPengajuan(t, userId, 1_000_000, 30);
    const didanai = await siapkanPinjamanDidanai(t, userId, 1_000_000, 30);

    const hasil = await admin.mutation(api.admin.setBungaPeminjam, {
      userId,
      persenBunga: 55,
    });
    expect(hasil.pengajuanDiperbarui).toBe(1);

    const state = await t.run(async (ctx) => ({
      pengajuan: await ctx.db.get(pengajuan),
      didanai: await ctx.db.get(didanai),
    }));
    expect(state.pengajuan?.persenBunga).toBe(55);
    // Pinjaman yang sudah cair tetap memakai snapshotnya (30%).
    expect(state.didanai?.persenBunga).toBe(30);
  });

  it("kewajiban Peminjam memakai snapshot bunga pinjaman", async () => {
    const t = convexTest(schema, modules);
    const { sesi: peminjam, userId } = await siapkanPengguna(t, "nina", {
      email: "nina@pindai.test",
      role: "peminjam",
    });
    const loanId = await siapkanPinjamanDidanai(t, userId, 1_000_000, 40);

    const detail = await peminjam.query(api.loans.getMyLoan, { loanId });
    expect(detail?.persenBunga).toBe(40);
    expect(detail?.quote.bunga).toBe(400_000);
    expect(detail?.totalKewajiban).toBe(1_400_000);
  });

  it("bunga null mengembalikan nasabah ke default global", async () => {
    const t = convexTest(schema, modules);
    const { sesi: peminjam, userId } = await siapkanPengguna(t, "sari", {
      email: "sari@pindai.test",
      role: "peminjam",
    });
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });

    await admin.mutation(api.admin.setBungaPeminjam, { userId, persenBunga: 60 });
    expect(await peminjam.query(api.lokasi.bungaSaya, {})).toBe(60);

    const reset = await admin.mutation(api.admin.setBungaPeminjam, {
      userId,
      persenBunga: null,
    });
    expect(reset.persenBunga).toBe(30);
    expect(await peminjam.query(api.lokasi.bungaSaya, {})).toBe(30);
  });

  it("hanya admin yang boleh mengubah bunga", async () => {
    const t = convexTest(schema, modules);
    const { sesi: peminjam } = await siapkanPengguna(t, "tomi", {
      email: "tomi@pindai.test",
      role: "peminjam",
    });
    const { userId: targetId } = await siapkanPengguna(t, "bayu", {
      email: "bayu@pindai.test",
      role: "peminjam",
    });

    await expect(
      peminjam.mutation(api.admin.setBungaPeminjam, { userId: targetId, persenBunga: 80 }),
    ).rejects.toThrow(/admin/i);
  });
});

describe("hapus akun nasabah", () => {
  it("menghapus akun tetapi mempertahankan pengajuan & riwayat keuangan", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await siapkanPengguna(t, "dina", {
      email: "dina@pindai.test",
      role: "peminjam",
    });
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const loanId = await siapkanPinjamanDidanai(t, userId, 1_000_000, 30);

    const hasil = await admin.mutation(api.admin.hapusNasabah, {
      userId,
      alasan: "Akun duplikat hasil uji coba",
    });
    expect(hasil.ok).toBe(true);

    const state = await t.run(async (ctx) => ({
      user: await ctx.db.get(userId),
      loan: await ctx.db.get(loanId),
      fundings: await ctx.db.query("fundings").collect(),
      audit: await ctx.db.query("auditLog").collect(),
    }));
    expect(state.user).toBeNull();
    expect(state.loan).not.toBeNull();
    expect(state.fundings.length).toBe(1);
    expect(state.audit.some((row) => row.aksi === "nasabah_delete")).toBe(true);
  });

  it("menolak alasan terlalu pendek dan melindungi akun admin", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin, userId: adminId } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const { userId } = await siapkanPengguna(t, "eko", {
      email: "eko@pindai.test",
      role: "peminjam",
    });

    await expect(
      admin.mutation(api.admin.hapusNasabah, { userId, alasan: "pendek" }),
    ).rejects.toThrow(/10–500/);
    await expect(
      admin.mutation(api.admin.hapusNasabah, {
        userId: adminId,
        alasan: "Mencoba menghapus akun tim sendiri",
      }),
    ).rejects.toThrow(/akun tim/i);
  });

  it("hanya admin yang boleh menghapus akun", async () => {
    const t = convexTest(schema, modules);
    const { sesi: peminjam } = await siapkanPengguna(t, "fajar", {
      email: "fajar@pindai.test",
      role: "peminjam",
    });
    const { userId: targetId } = await siapkanPengguna(t, "gita", {
      email: "gita@pindai.test",
      role: "peminjam",
    });

    await expect(
      peminjam.mutation(api.admin.hapusNasabah, {
        userId: targetId,
        alasan: "Percobaan tanpa hak admin",
      }),
    ).rejects.toThrow(/admin/i);
    expect(await t.run((ctx) => ctx.db.get(targetId))).not.toBeNull();
  });
});
