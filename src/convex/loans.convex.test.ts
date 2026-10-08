/**
 * Tes penghapusan pinjaman oleh Super Admin (convex-test + vitest).
 *
 * Fokus: jalur **hapus menyeluruh** (`bersihkanDana: true`) yang menjawab
 * kebutuhan admin membersihkan pinjaman yang sudah berpindah dana. Aturan yang
 * dijaga berkas ini:
 *
 *  - tanpa konfirmasi, penghapusan tetap DITOLAK — perilaku lama tidak berubah;
 *  - dengan konfirmasi, baris turunan keuangan (alokasi dana, catatan transfer)
 *    ikut dihapus supaya tidak ada referensi yatim;
 *  - jurnal ledger TIDAK disentuh (append-only, Rule 5.1) dan ledger tetap
 *    seimbang setelah penghapusan;
 *  - audit trail mencatat penghapusan menyeluruh beserta jumlah barisnya.
 *
 * Dokumen storage sengaja dikosongkan (convexTest belum mendukung syscall
 * `storageGetMetadata`), dan bukti bayar manual tidak dipakai di sini — pola
 * yang sama dengan tes penghapusan pinjaman lama di integrasiLedger.
 *
 * Menjalankan: bunx vitest run src/convex/loans.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { siapkanPengguna } from "./test.helpers";
import { modules } from "./test.setup";

const REF = "PGD-HAPUS-MENYELURUH";
const now = 1_700_000_000_000;

/** Pinjaman berjalan (didanai) lengkap dengan alokasi dana, transfer, pengingat. */
async function siapkanPinjamanDidanai(
  t: ReturnType<typeof convexTest>,
  userId: Id<"users">,
  danaId: Id<"users">,
  adminId: Id<"users">,
): Promise<Id<"loans">> {
  return t.run(async (ctx) => {
    const loanId = await ctx.db.insert("loans", {
      userId,
      pokokPinjaman: 1_000_000,
      tujuan: "Modal usaha kecil",
      namaLengkap: "Rani Peminjam",
      namaBank: "BCA",
      nomorRekening: "1234567890",
      status: "didanai",
      nomorReferensi: REF,
      tenorHari: 30,
      didanaiPada: now,
    });

    await ctx.db.insert("fundings", {
      loanId,
      danaId,
      jumlahAlokasi: 1_000_000,
      imbalHasil: 300_000,
      status: "dialokasikan",
      nomorReferensi: "ALOK-HAPUS-M1",
    });

    await ctx.db.insert("transferPendana", {
      loanId,
      pendanaId: danaId,
      pendanaNama: "DANA UJI",
      nomorReferensiPinjaman: REF,
      jumlah: 235_000,
      metode: "transfer_bank",
      status: "dicatat",
      dicatatOleh: adminId,
      dicatatOlehLabel: "admin@pindai.test",
      dicatatPada: now,
    });

    await ctx.db.insert("pengingat", {
      loanId,
      tanggal: now,
      jenis: "h_minus_3",
      sisaHari: 3,
      jumlahKewajiban: 1_500_000,
      waktu: now,
    });

    // Jurnal seimbang yang mengkredit akun pinjaman ini — inilah catatan
    // keuangan yang harus TETAP ADA sesudah pinjamannya dihapus.
    await ctx.db.insert("ledger_entries", {
      groupId: "GRP-HAPUS-M1",
      arah: "debit",
      jumlah: 20_000,
      akun: "platform:FEE",
      jenis: "platform_fee",
      skema: "pinjaman",
      keterangan: `Biaya admin & platform ${REF}`,
      aktor: "uji",
      waktu: now,
    });
    await ctx.db.insert("ledger_entries", {
      groupId: "GRP-HAPUS-M1",
      arah: "kredit",
      jumlah: 20_000,
      akun: `pinjaman:${loanId}`,
      jenis: "platform_fee",
      skema: "pinjaman",
      keterangan: `Biaya admin & platform ${REF}`,
      aktor: "uji",
      waktu: now,
    });

    return loanId;
  });
}

describe("hapus pinjaman yang sudah berpindah dana", () => {
  it("ditolak tanpa konfirmasi — perilaku lama tidak berubah", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin, userId: adminId } = await siapkanPengguna(t, "admin", {
      email: "admin-hm@pindai.test",
      role: "admin",
    });
    const { userId } = await siapkanPengguna(t, "rani", {
      email: "rani-hm@pindai.test",
      role: "peminjam",
    });
    const { userId: danaId } = await siapkanPengguna(t, "dana", {
      email: "dana-hm@pindai.test",
      role: "dana",
    });
    const loanId = await siapkanPinjamanDidanai(t, userId, danaId, adminId);

    await expect(
      admin.mutation(api.loans.hapusPinjaman, {
        loanId,
        reason: "Coba hapus biasa tanpa konfirmasi menyeluruh.",
      }),
    ).rejects.toThrow(/alokasi atau jurnal/);

    // Tidak ada yang berubah: pinjaman dan alokasinya masih utuh.
    const sisa = await t.run(async (ctx) => ({
      loan: await ctx.db.get(loanId),
      fundings: await ctx.db.query("fundings").collect(),
    }));
    expect(sisa.loan).not.toBeNull();
    expect(sisa.fundings).toHaveLength(1);
  });

  it("berhasil dengan konfirmasi: turunan dibersihkan, jurnal ledger tetap utuh", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin, userId: adminId } = await siapkanPengguna(t, "admin", {
      email: "admin-hm2@pindai.test",
      role: "admin",
    });
    const { userId } = await siapkanPengguna(t, "rani", {
      email: "rani-hm2@pindai.test",
      role: "peminjam",
    });
    const { userId: danaId } = await siapkanPengguna(t, "dana", {
      email: "dana-hm2@pindai.test",
      role: "dana",
    });
    const loanId = await siapkanPinjamanDidanai(t, userId, danaId, adminId);

    const sebelum = await t.run(async (ctx) => ({
      jurnal: (await ctx.db.query("ledger_entries").collect()).length,
    }));

    await expect(
      admin.mutation(api.loans.hapusPinjaman, {
        loanId,
        reason: "Salah input pendanaan — dibersihkan menyeluruh.",
        bersihkanDana: true,
      }),
    ).resolves.toMatchObject({ ok: true });

    const sisa = await t.run(async (ctx) => ({
      loan: await ctx.db.get(loanId),
      fundings: await ctx.db.query("fundings").collect(),
      transfer: await ctx.db.query("transferPendana").collect(),
      pengingat: await ctx.db.query("pengingat").collect(),
      jurnal: await ctx.db.query("ledger_entries").collect(),
      audit: await ctx.db.query("auditLog").collect(),
    }));

    // Pinjaman dan seluruh baris turunannya hilang — tanpa referensi yatim.
    expect(sisa.loan).toBeNull();
    expect(sisa.fundings).toHaveLength(0);
    expect(sisa.transfer).toHaveLength(0);
    expect(sisa.pengingat).toHaveLength(0);

    // Jurnal ledger TIDAK ikut terhapus dan tetap menyebut pinjaman itu.
    expect(sisa.jurnal).toHaveLength(sebelum.jurnal);
    expect(sisa.jurnal.some((e) => e.akun === `pinjaman:${loanId}`)).toBe(true);

    // Ledger tetap seimbang setelah penghapusan (tidak ada sisi yang hilang).
    const ringkas = await admin.query(api.admin.ledgerSummary, {});
    expect(ringkas.seimbang).toBe(true);

    // Audit menyebut penghapusan menyeluruh beserta jumlah barisnya. Nomor
    // referensi tersimpan di kolom `target`, rinciannya di `detail`.
    const hapus = sisa.audit.filter((row) => row.aksi === "loan_delete");
    expect(hapus).toHaveLength(1);
    expect(hapus[0].target).toBe(REF);
    expect(hapus[0].detail).toContain("PENGHAPUSAN MENYELURUH");
    expect(hapus[0].detail).toContain("1 alokasi dana");
    expect(hapus[0].detail).toContain("1 catatan transfer");
    expect(hapus[0].detail).toContain("1 entri jurnal ledger dipertahankan");
  });

  it("menghapus salah input tanpa catatan tetap sah dan tetap berjejak", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin-hm4@pindai.test",
      role: "admin",
    });
    const { userId } = await siapkanPengguna(t, "rani", {
      email: "rani-hm4@pindai.test",
      role: "peminjam",
    });
    // Pengajuan kosong tanpa catatan keuangan — persis kasus "salah input".
    const loanId = await t.run((ctx) =>
      ctx.db.insert("loans", {
        userId,
        pokokPinjaman: 500_000,
        tujuan: "modal_usaha",
        namaLengkap: "RANI PEMINJAM",
        namaBank: "BCA",
        nomorRekening: "1234567890",
        status: "sedang_direview",
        nomorReferensi: "PGD-HAPUS-TANPA-CATATAN",
        tenorHari: 30,
      }),
    );

    // Kebijakan pemilik produk: admin TIDAK perlu menulis alasan penghapusan.
    await expect(
      admin.mutation(api.loans.hapusPinjaman, { loanId }),
    ).resolves.toMatchObject({ ok: true });

    const sisa = await t.run(async (ctx) => ({
      loan: await ctx.db.get(loanId),
      audit: await ctx.db.query("auditLog").collect(),
    }));
    expect(sisa.loan).toBeNull();

    // Jejaknya tetap lengkap: siapa, apa, kapan — hanya catatannya yang kosong.
    const hapus = sisa.audit.filter((row) => row.aksi === "loan_delete");
    expect(hapus).toHaveLength(1);
    expect(hapus[0].target).toBe("PGD-HAPUS-TANPA-CATATAN");
    expect(hapus[0].aktorLabel).toBe("admin-hm4@pindai.test");
    expect(hapus[0].detail).toContain("tanpa catatan penghapusan");
  });

  it("hanya admin yang boleh memakai jalur menyeluruh", async () => {
    const t = convexTest(schema, modules);
    const { userId: adminId } = await siapkanPengguna(t, "admin", {
      email: "admin-hm3@pindai.test",
      role: "admin",
    });
    const { sesi: peminjam, userId } = await siapkanPengguna(t, "rani", {
      email: "rani-hm3@pindai.test",
      role: "peminjam",
    });
    const { sesi: dana, userId: danaId } = await siapkanPengguna(t, "dana", {
      email: "dana-hm3@pindai.test",
      role: "dana",
    });
    const loanId = await siapkanPinjamanDidanai(t, userId, danaId, adminId);

    await expect(
      peminjam.mutation(api.loans.hapusPinjaman, {
        loanId,
        reason: "Peminjam mencoba menghapus pinjamannya sendiri.",
        bersihkanDana: true,
      }),
    ).rejects.toThrow(/admin/i);

    await expect(
      dana.mutation(api.loans.hapusPinjaman, {
        loanId,
        reason: "Penyedia dana mencoba menghapus pinjaman.",
        bersihkanDana: true,
      }),
    ).rejects.toThrow(/admin/i);

    const masihAda = await t.run((ctx) => ctx.db.get(loanId));
    expect(masihAda).not.toBeNull();
  });
});
