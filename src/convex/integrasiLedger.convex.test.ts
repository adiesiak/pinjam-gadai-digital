/**
 * Tes integrasi pinjaman lama ke ledger internal + penghapusan per baris.
 *
 * Menjalankan: bunx vitest run src/convex/integrasiLedger.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { siapkanPengguna, type KonteksUji } from "./test.helpers";
import { modules } from "./test.setup";
import { DEFAULT_CONFIG } from "../lib/system-config";

/** Pinjaman tunai minimal untuk pembukuan biaya. */
async function siapkanPinjaman(
  t: KonteksUji,
  userId: Id<"users">,
  pokokPinjaman: number,
  status: "disetujui" | "didanai" | "lunas" | "ditolak" | "diajukan",
): Promise<Id<"loans">> {
  return t.run((ctx) =>
    ctx.db.insert("loans", {
      userId,
      pokokPinjaman,
      tujuan: "Modal usaha kecil",
      namaLengkap: "RANI PEMINJAM",
      namaBank: "BCA",
      nomorRekening: "1234567890",
      status,
      nomorReferensi: `PGD-ITG-${pokokPinjaman}-${status}`,
      tenorHari: 30,
    }),
  );
}

async function jumlahEntriPlatform(
  t: KonteksUji,
  loanId: Id<"loans">,
): Promise<number[]> {
  return t.run(async (ctx) => {
    const entries = await ctx.db.query("ledger_entries").collect();
    return entries
      .filter((e) => e.jenis === "platform_fee" && e.akun === `pinjaman:${loanId}`)
      .map((e) => e.jumlah);
  });
}

describe("integrasi pinjaman ke ledger internal", () => {
  it("membukukan biaya admin & platform 2% dan idempoten", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await siapkanPengguna(t, "rani", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });

    const loanId = await siapkanPinjaman(t, userId, 1_000_000, "disetujui");
    const pengajuan = await siapkanPinjaman(t, userId, 500_000, "diajukan");

    const status = await admin.query(api.integrasiLedger.statusIntegrasiLedger, {});
    expect(status.perluIntegrasi).toBe(1);
    const barisLayak = status.rows.find((r) => r._id === loanId);
    expect(barisLayak?.layak).toBe(true);
    expect(barisLayak?.biayaIntegrasi).toBe(20_000);
    const barisBelum = status.rows.find((r) => r._id === pengajuan);
    expect(barisBelum?.layak).toBe(false);
    expect(barisBelum?.terintegrasi).toBe(false);

    const hasil = await admin.mutation(api.integrasiLedger.integrasikanPinjamanKeLedger, {});
    expect(hasil.jumlah).toBe(1);
    expect(hasil.totalBiaya).toBe(20_000);
    expect(hasil.sisa).toBe(0);
    expect(await jumlahEntriPlatform(t, loanId)).toEqual([20_000]);

    // Idempoten — pemanggilan kedua tidak menggandakan jurnal.
    const ulang = await admin.mutation(api.integrasiLedger.integrasikanPinjamanKeLedger, {});
    expect(ulang.jumlah).toBe(0);
    expect(await jumlahEntriPlatform(t, loanId)).toEqual([20_000]);

    const setelah = await admin.query(api.integrasiLedger.statusIntegrasiLedger, {});
    expect(setelah.perluIntegrasi).toBe(0);
    expect(setelah.rows.find((r) => r._id === loanId)?.terintegrasi).toBe(true);
  });

  it("mengikuti persentase biaya dari Pengaturan Sistem", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await siapkanPengguna(t, "rani", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });

    await admin.mutation(api.system.saveConfig, {
      ...DEFAULT_CONFIG,
      persenBiayaIntegrasi: 5,
    });
    const loanId = await siapkanPinjaman(t, userId, 1_000_000, "disetujui");

    const status = await admin.query(api.integrasiLedger.statusIntegrasiLedger, {});
    expect(status.persenBiaya).toBe(5);
    expect(status.rows.find((r) => r._id === loanId)?.biayaIntegrasi).toBe(50_000);

    const hasil = await admin.mutation(api.integrasiLedger.integrasikanPinjamanKeLedger, {});
    expect(hasil.totalBiaya).toBe(50_000);
    expect(await jumlahEntriPlatform(t, loanId)).toEqual([50_000]);
  });

  it("menolak integrasi dari akun non-admin", async () => {
    const t = convexTest(schema, modules);
    const { sesi: peminjam } = await siapkanPengguna(t, "rani", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    // Pesan diperiksa: tanpa itu, galat apa pun (mis. konfigurasi hilang) akan
    // membuat uji lulus padahal gerbang admin justru sedang rusak.
    await expect(
      peminjam.mutation(api.integrasiLedger.integrasikanPinjamanKeLedger, {}),
    ).rejects.toThrow(/Akses khusus Super Admin/);
  });
});

describe("hapus pinjaman lama per baris", () => {
  it("menghapus pinjaman lama beserta turunannya dan mempertahankan jurnal", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await siapkanPengguna(t, "rani", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });

    const loanId = await siapkanPinjaman(t, userId, 1_000_000, "lunas");
    await admin.mutation(api.integrasiLedger.integrasikanPinjamanKeLedger, {});

    const danaId = await t.run((ctx) =>
      ctx.db.insert("users", {
        email: "dana@pindai.test",
        name: "Penyedia Dana",
        role: "dana",
      }),
    );
    await t.run((ctx) =>
      ctx.db.insert("fundings", {
        loanId,
        danaId,
        jumlahAlokasi: 1_000_000,
        imbalHasil: 300_000,
        status: "selesai",
        nomorReferensi: "FND-ITG-1",
      }),
    );

    const status = await admin.query(api.integrasiLedger.statusIntegrasiLedger, {});
    expect(status.rows.find((r) => r._id === loanId)?.bolehDihapus).toBe(true);

    const hasil = await admin.mutation(api.integrasiLedger.hapusPinjamanLama, {
      loanIds: [loanId],
      alasan: "pembersihan data pinjaman seed lama",
    });
    expect(hasil.dihapus).toBe(1);
    expect(hasil.terlewat).toHaveLength(0);

    const sisa = await t.run(async (ctx) => ({
      loan: await ctx.db.get(loanId),
      fundings: await ctx.db.query("fundings").collect(),
      // Jurnal tidak boleh ikut terhapus.
      jurnal: await ctx.db.query("ledger_entries").collect(),
    }));
    expect(sisa.loan).toBeNull();
    expect(sisa.fundings).toHaveLength(0);
    expect(sisa.jurnal.some((e) => e.akun === `pinjaman:${loanId}`)).toBe(true);

    // Jurnal integrasi harus bertag skema `pinjaman`: ringkasan ledger lalu
    // mengklasifikasikan biayanya dari tag itu, bukan dari tebakan teks
    // keterangan — inilah yang membuat angka per skema cocok dengan pinjaman.
    const jurnalIntegrasi = sisa.jurnal.filter((e) => e.akun === `pinjaman:${loanId}`);
    expect(jurnalIntegrasi.length).toBeGreaterThan(0);
    expect(jurnalIntegrasi.every((e) => e.skema === "pinjaman")).toBe(true);

    const ringkas = await admin.query(api.admin.ledgerSummary, {});
    expect(ringkas.rincianSkema.pinjaman).toBeGreaterThan(0);
    expect(ringkas.rincianSkema.lainnya).toBe(0);
    expect(ringkas.seimbang).toBe(true);
  });

  it("menolak pinjaman berjalan dan yang punya alokasi dana aktif", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await siapkanPengguna(t, "rani", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });

    const berjalan = await siapkanPinjaman(t, userId, 1_000_000, "didanai");
    const adaAlokasi = await siapkanPinjaman(t, userId, 1_000_000, "lunas");
    const danaId = await t.run((ctx) =>
      ctx.db.insert("users", { email: "dana2@pindai.test", name: "Dana 2", role: "dana" }),
    );
    await t.run((ctx) =>
      ctx.db.insert("fundings", {
        loanId: adaAlokasi,
        danaId,
        jumlahAlokasi: 1_000_000,
        imbalHasil: 0,
        status: "dialokasikan",
        nomorReferensi: "FND-ITG-2",
      }),
    );

    const hasil = await admin.mutation(api.integrasiLedger.hapusPinjamanLama, {
      loanIds: [berjalan, adaAlokasi],
      alasan: "percobaan hapus pinjaman aktif",
    });
    expect(hasil.dihapus).toBe(0);
    expect(hasil.terlewat).toHaveLength(2);

    const masihAda = await t.run(async (ctx) => ({
      a: await ctx.db.get(berjalan),
      b: await ctx.db.get(adaAlokasi),
    }));
    expect(masihAda.a).not.toBeNull();
    expect(masihAda.b).not.toBeNull();
  });

  it("menolak alasan yang terlalu pendek", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await siapkanPengguna(t, "rani", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const loanId = await siapkanPinjaman(t, userId, 1_000_000, "ditolak");
    await expect(
      admin.mutation(api.integrasiLedger.hapusPinjamanLama, {
        loanIds: [loanId],
        alasan: "pendek",
      }),
    ).rejects.toThrow(/Alasan wajib 10.500 karakter/);
  });
});

/** Tulis satu grup jurnal mentah (tanpa lewat appendJournal) untuk uji purge. */
async function siapkanGrup(
  t: KonteksUji,
  groupId: string,
  lines: Array<{ akun: string; arah: "debit" | "kredit"; jumlah: number }>,
): Promise<void> {
  await t.run(async (ctx) => {
    for (const l of lines) {
      await ctx.db.insert("ledger_entries", {
        groupId,
        arah: l.arah,
        jumlah: l.jumlah,
        akun: l.akun,
        jenis: "platform_fee",
        keterangan: `uji ${groupId}`,
        aktor: "uji",
        waktu: 1,
      });
    }
  });
}

describe("pembersihan jurnal per grup (CLI sekali pakai)", () => {
  it("menghapus grup seimbang tanpa memecah keseimbangan dan melaporkan grup tak ditemukan", async () => {
    const t = convexTest(schema, modules);
    await siapkanGrup(t, "J-uji-1", [
      { akun: "platform:FEE", arah: "debit", jumlah: 20_000 },
      { akun: "pinjaman:a", arah: "kredit", jumlah: 20_000 },
    ]);
    await siapkanGrup(t, "J-uji-2", [
      { akun: "platform:FEE", arah: "debit", jumlah: 10_000 },
      { akun: "pinjaman:b", arah: "kredit", jumlah: 10_000 },
    ]);
    // Grup di luar daftar wajib tidak tersentuh.
    await siapkanGrup(t, "J-uji-lain", [
      { akun: "platform:FEE", arah: "debit", jumlah: 5_000 },
      { akun: "pinjaman:c", arah: "kredit", jumlah: 5_000 },
    ]);

    const hasil = await t.mutation(internal.integrasiLedger.qaPurgeJurnalGroups, {
      groupIds: ["J-uji-1", "J-uji-2", "J-tidak-ada"],
      alasan: "pembersihan data uji ledger internal",
    });

    expect(hasil.dihapus.map((d) => d.groupId)).toEqual(["J-uji-1", "J-uji-2"]);
    expect(hasil.dihapus.every((d) => d.entri === 2)).toBe(true);
    expect(hasil.entriDihapus).toBe(4);
    expect(hasil.dilewati).toEqual([{ groupId: "J-tidak-ada", pesan: "Grup tidak ditemukan." }]);
    expect(hasil.sebelum.entryCount).toBe(6);
    expect(hasil.sesudah.entryCount).toBe(2);
    expect(hasil.sesudah.seimbang).toBe(true);

    const sisa = await t.run((ctx) => ctx.db.query("ledger_entries").collect());
    expect(sisa.every((e) => e.groupId === "J-uji-lain")).toBe(true);
  });

  it("melewati grup tidak seimbang dan tidak menghapus satu sisinya", async () => {
    const t = convexTest(schema, modules);
    await siapkanGrup(t, "J-pincang", [
      { akun: "platform:FEE", arah: "debit", jumlah: 1_858_333 },
    ]);
    await siapkanGrup(t, "J-ok", [
      { akun: "platform:FEE", arah: "debit", jumlah: 6_000 },
      { akun: "pinjaman:d", arah: "kredit", jumlah: 6_000 },
    ]);

    const hasil = await t.mutation(internal.integrasiLedger.qaPurgeJurnalGroups, {
      groupIds: ["J-pincang", "J-ok"],
      alasan: "uji penolakan grup tidak seimbang",
    });

    expect(hasil.dihapus.map((d) => d.groupId)).toEqual(["J-ok"]);
    expect(hasil.dilewati).toHaveLength(1);
    expect(hasil.dilewati[0]?.pesan).toContain("tidak seimbang");
    // Grup pincang tetap utuh — tidak ada penghapusan sebagian.
    const sisa = await t.run((ctx) => ctx.db.query("ledger_entries").collect());
    expect(sisa.map((e) => e.groupId)).toEqual(["J-pincang"]);
  });

  it("mencatat penghapusan ke audit log", async () => {
    const t = convexTest(schema, modules);

    await siapkanGrup(t, "J-audit", [
      { akun: "platform:CASH", arah: "debit", jumlah: 1_000_000 },
      { akun: "pinjaman:e", arah: "kredit", jumlah: 1_000_000 },
    ]);
    await t.mutation(internal.integrasiLedger.qaPurgeJurnalGroups, {
      groupIds: ["J-audit"],
      alasan: "pembersihan data uji ledger internal",
    });

    // Catatan: `internalMutation` hanya terekspos lewat CLI deployment —
    // convex-test memanggil semua fungsi lewat registry modul, jadi tidak bisa
    // membuktikan ketiadaan jalur klien di sini; yang diuji adalah jejaknya.
    const log = await t.run((ctx) => ctx.db.query("auditLog").collect());
    const baris = log.find((l) => l.aksi === "ledger_purge_grup");
    expect(baris).toBeDefined();
    expect(baris?.aktorLabel).toBe("cli:qaPurgeJurnalGroups");
    expect(baris?.detail).toContain("pembersihan data uji ledger internal");
    expect(baris?.detail).toContain("entri 2 -> 0");
  });

  it("menolak alasan terlalu pendek dan daftar grup kosong", async () => {
    const t = convexTest(schema, modules);
    // Dua alasan penolakan yang berbeda: pesannya dipisah supaya tertukar
    // (mis. menolak karena daftar kosong padahal alasannya yang salah) ketahuan.
    await expect(
      t.mutation(internal.integrasiLedger.qaPurgeJurnalGroups, {
        groupIds: ["J-x"],
        alasan: "pendek",
      }),
    ).rejects.toThrow(/Alasan wajib 10.500 karakter/);
    await expect(
      t.mutation(internal.integrasiLedger.qaPurgeJurnalGroups, {
        groupIds: [],
        alasan: "pembersihan data uji ledger internal",
      }),
    ).rejects.toThrow(/Kirim minimal satu groupId/);
  });
});

/** Satu baris jurnal mentah — mencerminkan bentuk yang ditulis appendJournal. */
function baris(
  groupId: string,
  akun: string,
  arah: "debit" | "kredit",
  jumlah: number,
  jenis: string,
  keterangan: string,
) {
  return {
    groupId,
    akun,
    arah,
    jumlah,
    jenis,
    skema: "pinjaman" as const,
    keterangan,
    aktor: "platform",
    waktu: Date.now(),
  };
}

describe("ringkasan pendapatan platform", () => {
  it("menghitung potongan admin pada jurnal payout, dan tidak mencampur denda", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin-ledger", {
      email: "admin-ledger@pindai.test",
      role: "admin",
    });

    await t.run(async (ctx) => {
      // 1. Biaya dipotong di muka saat pendanaan penuh (jurnal platform_fee).
      await ctx.db.insert(
        "ledger_entries",
        baris("J-fee", "platform:FEE", "debit", 20_000, "platform_fee", "Biaya admin & platform PGD-X"),
      );
      await ctx.db.insert(
        "ledger_entries",
        baris("J-fee", "pinjaman:x", "kredit", 20_000, "platform_fee", "Biaya admin & platform PGD-X"),
      );
      // 2. Potongan admin atas UANG YANG KEMBALI (pokok + Imbal Hasil) bagian
      //    penyedia dana, dibukukan saat pelunasan (payout). Nominalnya mengikuti
      //    kebijakan berjalan untuk pinjaman 1jt @30% (5% × Rp1.300.000 =
      //    Rp65.000, lihat lib/bagiHasil.ts); yang diuji di sini klasifikasi
      //    ringkasan ledger, bukan perhitungannya.
      await ctx.db.insert(
        "ledger_entries",
        baris("J-payout", "platform:FEE", "debit", 65_000, "payout", "Pelunasan: pembayaran ke dana PGD-X"),
      );
      await ctx.db.insert(
        "ledger_entries",
        baris("J-payout", "pinjaman:x", "kredit", 65_000, "payout", "Pelunasan: pembayaran ke dana PGD-X"),
      );
      // 3. Denda keterlambatan: sanksi ke Peminjam, bukan pendapatan jasa.
      await ctx.db.insert(
        "ledger_entries",
        baris("J-denda", "platform:CASH", "debit", 50_000, "repayment", "Pelunasan PGD-X — denda 5 hari"),
      );
      await ctx.db.insert(
        "ledger_entries",
        baris("J-denda", "platform:FEE", "kredit", 50_000, "repayment", "Pelunasan PGD-X — denda 5 hari"),
      );
    });

    const ringkas = await admin.query(api.admin.ledgerSummary, {});
    // 20.000 (potongan di muka 2%) + 65.000 (potongan admin atas uang yang
    // kembali) = 85.000 — sama dengan pendapatan platform satu pinjaman 1jt @30%
    // yang ditampilkan kartu "Aliran uang" panel Ringkasan.
    expect(ringkas.pendapatanPlatform).toBe(85_000);
    expect(ringkas.rincianSkema.pinjaman).toBe(85_000);
    expect(ringkas.seimbang).toBe(true);

    // Kartu tren memakai sumber yang sama: Σ semua bulan = pendapatanPlatform.
    const tren = await admin.query(api.admin.trenPendapatanBulanan, {});
    expect(tren.reduce((total, b) => total + b.jumlah, 0)).toBe(85_000);
  });
});
