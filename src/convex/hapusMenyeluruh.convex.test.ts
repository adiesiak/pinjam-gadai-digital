/**
 * Tes hapus menyeluruh untuk gadai & kredit barang, plus dua panel yang
 * melaporkannya: jurnal tanpa subjek (`admin.ledgerYatim`) dan daftar
 * penghapusan (`system.auditPenghapusan`).
 *
 * Aturan yang dijaga:
 *  - jalur biasa tetap DITOLAK begitu ada catatan keuangan (perilaku lama);
 *  - jalur menyeluruh (`bersihkanDana: true`) membersihkan baris turunan agar
 *    tidak ada referensi yatim, tetapi jurnal ledger TIDAK disentuh
 *    (append-only, Rule 5.1);
 *  - akibatnya terlihat: akun yatim dilaporkan, dan jumlah barisnya tercatat
 *    terstruktur di Audit Trail — bukan hanya kalimat;
 *  - barang jaminan yang masih tercatat di rak penitipan tetap TIDAK bisa
 *    dihapus walau memakai jalur menyeluruh (barang fisik, bukan catatan).
 *
 * Menjalankan: bunx vitest run src/convex/hapusMenyeluruh.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { siapkanPengguna } from "./test.helpers";
import { modules } from "./test.setup";

const now = 1_700_000_000_000;

/** Jurnal seimbang yang mengkredit akun subjek — harus tetap ada sesudah hapus. */
async function tulisJurnal(
  t: ReturnType<typeof convexTest>,
  akun: string,
  groupId: string,
): Promise<void> {
  await t.run(async (ctx) => {
    await ctx.db.insert("ledger_entries", {
      groupId,
      arah: "debit",
      jumlah: 500_000,
      akun: "platform:CASH",
      jenis: "disbursement",
      keterangan: `Pencairan ${akun}`,
      aktor: "uji",
      waktu: now,
    });
    await ctx.db.insert("ledger_entries", {
      groupId,
      arah: "kredit",
      jumlah: 500_000,
      akun,
      jenis: "disbursement",
      keterangan: `Pencairan ${akun}`,
      aktor: "uji",
      waktu: now,
    });
  });
}

describe("hapus menyeluruh gadai & kredit barang", () => {
  it("gadai: ditolak tanpa konfirmasi, dibersihkan dengan konfirmasi — jurnal tetap utuh", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin, userId: adminId } = await siapkanPengguna(t, "admin", {
      email: "admin-hg@pindai.test",
      role: "admin",
    });
    const { userId } = await siapkanPengguna(t, "rani", {
      email: "rani-hg@pindai.test",
      role: "peminjam",
    });

    const pawnId = await t.run((ctx) =>
      ctx.db.insert("pawns", {
        userId,
        deskripsiBarang: "Cincin emas 22k",
        kategori: "Perhiasan",
        alamatPenilaian: "Jl. Contoh 1",
        namaLengkap: "Rani Peminjam",
        nomorRekening: "1234567890",
        status: "disetujui",
        nomorReferensi: "GD-HAPUS-M1",
        dicairkanPada: now,
        persetujuanSyaratPada: now,
        pokokGadai: 1_000_000,
        sisaPokok: 800_000,
      }),
    );
    await t.run((ctx) =>
      ctx.db.insert("pawnPayments", {
        pawnId,
        pokokDicicil: 200_000,
        sewaDibayar: 50_000,
        sisaPokokSetelah: 800_000,
        sewaModalBerikut: 50_000,
        userId,
        waktu: now,
      }),
    );
    await tulisJurnal(t, `gadai:${pawnId}`, "GRP-GADAI-1");

    // Jalur biasa tetap ditolak — perilaku lama tidak berubah.
    await expect(
      admin.mutation(api.loans.hapusGadai, {
        pawnId,
        reason: "Salah input gadai, coba hapus biasa dulu.",
      }),
    ).rejects.toThrow(/pencairan/);

    await expect(
      admin.mutation(api.loans.hapusGadai, {
        pawnId,
        reason: "Salah input gadai — dibersihkan menyeluruh.",
        bersihkanDana: true,
      }),
    ).resolves.toMatchObject({ ok: true });

    const sisa = await t.run(async (ctx) => ({
      pawn: await ctx.db.get(pawnId),
      cicilan: await ctx.db.query("pawnPayments").collect(),
      jurnal: await ctx.db.query("ledger_entries").collect(),
      audit: await ctx.db.query("auditLog").collect(),
    }));
    expect(sisa.pawn).toBeNull();
    expect(sisa.cicilan).toHaveLength(0);

    // Jurnal TIDAK ikut terhapus dan tetap menyebut gadai yang sudah hilang.
    expect(sisa.jurnal).toHaveLength(2);
    expect(sisa.jurnal.some((e) => e.akun === `gadai:${pawnId}`)).toBe(true);

    const hapus = sisa.audit.filter((row) => row.aksi === "pawn_delete");
    expect(hapus).toHaveLength(1);
    expect(hapus[0].target).toBe("GD-HAPUS-M1");
    // Satu entri jurnal yang benar-benar menyentuh akun gadai ini
    // (pasangannya menyentuh platform:CASH, bukan akun gadai).
    expect(hapus[0].rincianHapus).toMatchObject({ menyeluruh: true, jurnalDipertahankan: 1 });
    expect(hapus[0].detail).toContain("1 cicilan dihapus");

    // Akibatnya terlihat di panel: akun gadai itu kini tanpa subjek.
    const yatim = await admin.query(api.admin.ledgerYatim, {});
    expect(yatim.akun).toBe(1);
    expect(yatim.kelompok[0].akun).toBe(`gadai:${pawnId}`);
    expect(yatim.kelompok[0].jumlahEntri).toBe(1);

    // Panel Audit Trail menyaringnya sebagai penghapusan gadai.
    const auditPanel = await admin.query(api.system.auditPenghapusan, { jenis: "gadai" });
    expect(auditPanel.rows).toHaveLength(1);
    expect(auditPanel.ringkasan.menyeluruh).toBe(1);
    expect(auditPanel.ringkasan.jurnalDipertahankan).toBe(1);
  });

  it("gadai: barang yang masih di rak penitipan tetap tidak bisa dihapus", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin-hg2@pindai.test",
      role: "admin",
    });
    const { userId } = await siapkanPengguna(t, "rani", {
      email: "rani-hg2@pindai.test",
      role: "peminjam",
    });

    const pawnId = await t.run((ctx) =>
      ctx.db.insert("pawns", {
        userId,
        deskripsiBarang: "Motor Honda",
        kategori: "Kendaraan",
        alamatPenilaian: "Jl. Contoh 2",
        namaLengkap: "Rani Peminjam",
        nomorRekening: "1234567890",
        status: "aktif",
        nomorReferensi: "GD-HAPUS-M2",
        kodeRakVault: "RAK-A1",
        dicairkanPada: now,
      }),
    );

    await expect(
      admin.mutation(api.loans.hapusGadai, {
        pawnId,
        reason: "Coba hapus walau barang masih di rak.",
        bersihkanDana: true,
      }),
    ).rejects.toThrow(/rak penitipan/);

    expect(await t.run((ctx) => ctx.db.get(pawnId))).not.toBeNull();
  });

  it("kredit: alokasi & cicilan dibersihkan, jurnal tetap; ditolak tanpa konfirmasi", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin-hk@pindai.test",
      role: "admin",
    });
    const { userId } = await siapkanPengguna(t, "budi", {
      email: "budi-hk@pindai.test",
      role: "peminjam",
    });
    const { userId: danaId } = await siapkanPengguna(t, "dana", {
      email: "dana-hk@pindai.test",
      role: "dana",
    });

    const kreditId = await t.run((ctx) =>
      ctx.db.insert("kreditBarang", {
        userId,
        nomorReferensi: "KRD-HAPUS-M1",
        namaBarang: "Samsung Galaxy A55",
        kategori: "Elektronik",
        merchant: "Toko mitra",
        hargaBarang: 5_000_000,
        dpPersen: 20,
        tenorBulan: 6,
        marginPersenPerBulan: 3,
        status: "didanai",
        namaLengkap: "Budi Peminjam",
        nik: "3201234567890002",
        nomorRekening: "1234567891",
        nomorWhatsApp: "628123456790",
        didanaiPada: now,
      }),
    );
    await t.run((ctx) =>
      ctx.db.insert("kreditFundings", {
        kreditId,
        danaId,
        jumlahAlokasi: 4_000_000,
        imbalHasil: 720_000,
        status: "dialokasikan",
        nomorReferensi: "ALOK-KRD-1",
      }),
    );
    await t.run((ctx) =>
      ctx.db.insert("kreditPayments", {
        kreditId,
        userId,
        bulanKe: 1,
        pokokDibayar: 600_000,
        marginDibayar: 120_000,
        totalDibayar: 720_000,
        sisaPokokSetelah: 3_400_000,
        waktu: now,
      }),
    );
    await tulisJurnal(t, `kredit:${kreditId}`, "GRP-KRD-1");

    await expect(
      admin.mutation(api.kredit.hapusKreditBarang, {
        kreditId,
        reason: "Salah input kredit, coba hapus biasa dulu.",
      }),
    ).rejects.toThrow(/sudah berjalan/);

    await expect(
      admin.mutation(api.kredit.hapusKreditBarang, {
        kreditId,
        reason: "Salah input kredit — dibersihkan menyeluruh.",
        bersihkanDana: true,
      }),
    ).resolves.toMatchObject({ ok: true });

    const sisa = await t.run(async (ctx) => ({
      kredit: await ctx.db.get(kreditId),
      alokasi: await ctx.db.query("kreditFundings").collect(),
      cicilan: await ctx.db.query("kreditPayments").collect(),
      jurnal: await ctx.db.query("ledger_entries").collect(),
      audit: await ctx.db.query("auditLog").collect(),
    }));
    expect(sisa.kredit).toBeNull();
    expect(sisa.alokasi).toHaveLength(0);
    expect(sisa.cicilan).toHaveLength(0);
    expect(sisa.jurnal).toHaveLength(2);

    const hapus = sisa.audit.filter((row) => row.aksi === "kredit_delete");
    expect(hapus).toHaveLength(1);
    expect(hapus[0].rincianHapus).toMatchObject({
      menyeluruh: true,
      alokasiDana: 1,
      jurnalDipertahankan: 1,
    });

    const yatim = await admin.query(api.admin.ledgerYatim, {});
    expect(yatim.kelompok.map((k) => k.akun)).toEqual([`kredit:${kreditId}`]);
  });

  it("jurnal tanpa subjek tidak melaporkan subjek yang masih ada, dan admin saja", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin-yatim@pindai.test",
      role: "admin",
    });
    const { sesi: peminjam, userId } = await siapkanPengguna(t, "rani", {
      email: "rani-yatim@pindai.test",
      role: "peminjam",
    });

    // Subjek yang MASIH ada: tidak boleh muncul sebagai yatim.
    const loanId = await t.run((ctx) =>
      ctx.db.insert("loans", {
        userId,
        pokokPinjaman: 1_000_000,
        tujuan: "Modal usaha",
        namaLengkap: "Rani Peminjam",
        namaBank: "BCA",
        nomorRekening: "1234567890",
        status: "didanai",
        nomorReferensi: "PGD-YATIM-1",
        tenorHari: 30,
        didanaiPada: now,
      }),
    );
    await tulisJurnal(t, `pinjaman:${loanId}`, "GRP-YATIM-1");

    const yatimBersih = await admin.query(api.admin.ledgerYatim, {});
    expect(yatimBersih.akun).toBe(0);
    expect(yatimBersih.entri).toBe(0);

    // Subjek yang sudah hilang: dilaporkan, tanpa merusak angka subjek lain.
    await t.run((ctx) => ctx.db.delete(loanId));
    const yatim = await admin.query(api.admin.ledgerYatim, {});
    expect(yatim.akun).toBe(1);
    expect(yatim.entri).toBe(1);
    expect(yatim.nilai).toBe(500_000);
    expect(yatim.kelompok[0].akun).toBe(`pinjaman:${loanId}`);
    expect(yatim.kelompok[0].saldo).toBe(-500_000);

    await expect(peminjam.query(api.admin.ledgerYatim, {})).rejects.toThrow(/admin/i);
    await expect(peminjam.query(api.system.auditPenghapusan, {})).rejects.toThrow(/admin/i);
  });

  it("panel audit penghapusan menyaring per jenis dan menjumlahkan rincian", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin, userId: adminId } = await siapkanPengguna(t, "admin", {
      email: "admin-audit@pindai.test",
      role: "admin",
    });

    const rincian = (patch: Record<string, unknown> = {}) => ({
      menyeluruh: true,
      alokasiDana: 0,
      catatanTransfer: 0,
      buktiBayar: 0,
      pengingat: 0,
      logWhatsapp: 0,
      jejakLokasi: 0,
      jurnalDipertahankan: 0,
      ...patch,
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("auditLog", {
        aktorUserId: adminId,
        aktorLabel: "admin@pindai.test",
        aksi: "loan_delete",
        target: "PGD-A",
        detail: "penghapusan menyeluruh",
        rincianHapus: rincian({ alokasiDana: 1, jurnalDipertahankan: 2 }),
        waktu: now,
      });
      await ctx.db.insert("auditLog", {
        aktorUserId: adminId,
        aktorLabel: "admin@pindai.test",
        aksi: "kredit_delete",
        target: "KRD-A",
        detail: "penghapusan menyeluruh",
        rincianHapus: rincian({ alokasiDana: 2, jurnalDipertahankan: 4 }),
        waktu: now + 1,
      });
      // Baris lama tanpa rincian terstruktur — tidak boleh dikarang angkanya.
      await ctx.db.insert("auditLog", {
        aktorUserId: adminId,
        aktorLabel: "admin@pindai.test",
        aksi: "pawn_delete",
        target: "GD-A",
        detail: "tanpa catatan keuangan",
        waktu: now + 2,
      });
      // Bukan penghapusan: tidak boleh ikut terhitung.
      await ctx.db.insert("auditLog", {
        aktorUserId: adminId,
        aktorLabel: "admin@pindai.test",
        aksi: "config_save",
        target: "global",
        waktu: now + 3,
      });
    });

    const semua = await admin.query(api.system.auditPenghapusan, { jenis: "semua" });
    expect(semua.rows).toHaveLength(3);
    expect(semua.rows[0].aksi).toBe("pawn_delete");
    expect(semua.ringkasan.jumlah).toBe(3);
    expect(semua.ringkasan.perJenis.loan_delete).toBe(1);
    expect(semua.ringkasan.menyeluruh).toBe(2);
    expect(semua.ringkasan.alokasiDana).toBe(3);
    expect(semua.ringkasan.jurnalDipertahankan).toBe(6);
    expect(semua.ringkasan.tanpaRincian).toBe(1);

    const hanyaKredit = await admin.query(api.system.auditPenghapusan, { jenis: "kredit-barang" });
    expect(hanyaKredit.rows).toHaveLength(1);
    expect(hanyaKredit.rows[0].aksi).toBe("kredit_delete");
    expect(hanyaKredit.ringkasan.alokasiDana).toBe(2);
    expect(hanyaKredit.ringkasan.tanpaRincian).toBe(0);
  });
});
