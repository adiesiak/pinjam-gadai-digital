/**
 * Tes contoh data ruang pendana.
 *
 * Yang dijaga:
 * - Dua pinjaman contoh (berjalan + lunas) benar-benar muncul di rekap ruang
 *   /penyedia-dana sebagai portofolio "PENDANA UJI COBA", dengan pembagian
 *   marjin 47 : 13 yang sama dengan mesin harga.
 * - Dua kredit contoh (3 dan 6 bulan) tampil dengan progres cicilan 2 dari 3/6
 *   dan Imbal Hasil dari alokasi penuh, bukan angka yang diketik terpisah.
 * - Seed idempoten: dijalankan dua kali tidak menggandakan akun/pinjaman/kredit.
 * - Seed TIDAK menyentuh dompet, ledger, maupun siklus 30 hari — contoh data
 *   tidak boleh menciptakan kewajiban pencairan.
 * - Penghapusan hanya menyentuh baris contoh dan aman dijalankan dua kali.
 *
 * Menjalankan: bunx vitest run src/convex/contohPendana.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";
import { siapkanPengguna, type KonteksUji } from "./test.helpers";
import { modules } from "./test.setup";

const BUAT = { konfirmasi: "BUAT_CONTOH_PENDANA" } as const;
const HAPUS = { konfirmasi: "HAPUS_CONTOH_PENDANA" } as const;

/** Hitung baris satu tabel dari konteks uji tanpa membuka data ke klien. */
async function jumlahBaris(
  t: KonteksUji,
  tabel:
    | "loans"
    | "users"
    | "siklusPendana"
    | "ledger_entries"
    | "kreditBarang"
    | "kreditPayments"
    | "kreditFundings",
): Promise<number> {
  return t.run(async (ctx) => (await ctx.db.query(tabel).collect()).length);
}

describe("contoh data pendana", () => {
  it("membuat portofolio contoh dengan pembagian marjin yang bisa dicocokkan", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "Admin Contoh", {
      email: "admin-contoh@pindai.test",
      role: "admin",
    });

    const hasil = await t.mutation(internal.contohPendana.buat, BUAT);

    // Pembagian marjin: Rp2.000.000 @32% → Rp640.000, dibagi 47 : 13.
    expect(hasil.pembagian.berjalan).toEqual({
      pokok: 2_000_000,
      margin: 640_000,
      pendana: 501_334,
      platform: 138_666,
    });
    // Rp1.000.000 @32% → Rp320.000; angka yang sama dengan contoh di aturan.
    expect(hasil.pembagian.lunas).toEqual({
      pokok: 1_000_000,
      margin: 320_000,
      pendana: 250_667,
      platform: 69_333,
    });

    // Ruang pendana (dibaca admin) melihat keduanya sebagai portofolio akun uji.
    const ruang = await admin.query(api.penyediaDana.daftarPengajuan, {});
    const rekap = ruang.rekapPendana.find((r) => r.nama === "PENDANA UJI COBA");
    expect(rekap).toBeDefined();
    expect(rekap).toMatchObject({
      jumlahPinjaman: 2,
      jumlahAktif: 1,
      jumlahLunas: 1,
      totalDisalurkan: 3_000_000,
      saldoBerjalan: 2_000_000,
      keuntunganPendana: 752_001,
      keuntunganPendanaLunas: 250_667,
      keuntunganPendanaBelumLunas: 501_334,
      keuntunganAdmin: 207_999,
      transferTercatat: 0,
      transferBelumDicatat: 1,
      keuntunganBelumDicatat: 250_667,
    });

    // Kredit contoh masuk ke blok kredit pada baris rekap yang sama, dengan
    // angka dari mesin quote — bukan hitungan kedua di halaman.
    expect(rekap?.kredit).toMatchObject({
      jumlahAlokasi: 2,
      pokok: 9_000_000,
      marginKontrak: 5_040_000,
      imbalPendana: 5_040_000,
      biayaPlatform: 460_800,
      cicilanDibayar: 4,
      cicilanTotal: 9,
    });
    expect(
      rekap?.kredit?.baris
        .map((b) => ({
          nomorReferensi: b.nomorReferensi,
          pokok: b.pokok,
          marginKontrak: b.marginKontrak,
          imbalPendana: b.imbalPendana,
        }))
        .sort((a, b) => a.nomorReferensi.localeCompare(b.nomorReferensi)),
    ).toEqual([
      {
        nomorReferensi: "KRD-CONTOH-0001",
        pokok: 3_000_000,
        marginKontrak: 720_000,
        imbalPendana: 720_000,
      },
      {
        nomorReferensi: "KRD-CONTOH-0002",
        pokok: 6_000_000,
        marginKontrak: 4_320_000,
        imbalPendana: 4_320_000,
      },
    ]);

    const contoh = ruang.pinjaman.filter((p) => p.nomorReferensi.startsWith("PGD-CONTOH-"));
    expect(contoh).toHaveLength(2);
    expect(contoh.map((p) => p.status).sort()).toEqual(["didanai", "lunas"]);
    const berjalan = contoh.find((p) => p.nomorReferensi === "PGD-CONTOH-0001");
    const lunas = contoh.find((p) => p.nomorReferensi === "PGD-CONTOH-0002");
    expect(berjalan).toMatchObject({
      status: "didanai",
      pokokPinjaman: 2_000_000,
      pendana: "PENDANA UJI COBA",
      keuntunganPendana: 501_334,
      keuntunganAdmin: 138_666,
    });
    expect(lunas).toMatchObject({
      status: "lunas",
      pokokPinjaman: 1_000_000,
      keuntunganPendana: 250_667,
      keuntunganAdmin: 69_333,
    });

    // Kredit contoh: tenor 3 dan 6 bulan, masing-masing sudah dicicil 2 kali.
    expect(hasil.kredit).toEqual([
      {
        nomorReferensi: "KRD-CONTOH-0001",
        tenorBulan: 3,
        hargaBarang: 3_000_000,
        cicilanDibayar: 2,
      },
      {
        nomorReferensi: "KRD-CONTOH-0002",
        tenorBulan: 6,
        hargaBarang: 6_000_000,
        cicilanDibayar: 2,
      },
    ]);
    const kredit = ruang.kredit.filter((k) =>
      k.nomorReferensi.startsWith("KRD-CONTOH-"),
    );
    expect(kredit).toHaveLength(2);
    expect(kredit.find((k) => k.nomorReferensi === "KRD-CONTOH-0001")).toMatchObject({
      status: "didanai",
      tenorBulan: 3,
      cicilanDibayar: 2,
      pendana: "PENDANA UJI COBA",
    });
    expect(kredit.find((k) => k.nomorReferensi === "KRD-CONTOH-0002")).toMatchObject({
      status: "didanai",
      tenorBulan: 6,
      cicilanDibayar: 2,
      pendana: "PENDANA UJI COBA",
    });

    // Dua cicilan per kredit, satu alokasi penuh per kredit.
    expect(await jumlahBaris(t, "kreditBarang")).toBe(2);
    expect(await jumlahBaris(t, "kreditPayments")).toBe(4);
    expect(await jumlahBaris(t, "kreditFundings")).toBe(2);

    // Contoh data bukan transaksi: tidak ada dompet, jurnal, atau siklus.
    expect(await jumlahBaris(t, "ledger_entries")).toBe(0);
    expect(await jumlahBaris(t, "siklusPendana")).toBe(0);
  });

  it("idempoten dan bisa dihapus tanpa menyentuh data lain", async () => {
    const t = convexTest(schema, modules);
    const pertama = await t.mutation(internal.contohPendana.buat, BUAT);
    const kedua = await t.mutation(internal.contohPendana.buat, BUAT);

    expect(kedua.pendanaId).toBe(pertama.pendanaId);
    expect(kedua.peminjamId).toBe(pertama.peminjamId);
    expect(kedua.pinjaman).toEqual(pertama.pinjaman);
    expect(kedua.kredit).toEqual(pertama.kredit);
    expect(await jumlahBaris(t, "loans")).toBe(2);
    expect(await jumlahBaris(t, "kreditBarang")).toBe(2);
    expect(await jumlahBaris(t, "kreditPayments")).toBe(4);
    expect(await jumlahBaris(t, "kreditFundings")).toBe(2);
    expect(await jumlahBaris(t, "users")).toBe(2);

    // Akun pendana lain tidak boleh ikut hilang.
    const t2 = convexTest(schema, modules);
    const { userId: lainId } = await siapkanPengguna(t2, "Pendana Lain", {
      email: "pendana-lain@pindai.test",
      role: "dana",
    });
    const contoh = await t2.mutation(internal.contohPendana.buat, BUAT);

    const hapus = await t2.mutation(internal.contohPendana.hapus, HAPUS);
    expect(hapus).toEqual({
      ok: true,
      pinjamanDihapus: 2,
      kreditDihapus: 2,
      peminjamDihapus: true,
      pendanaDihapus: true,
    });
    expect(await jumlahBaris(t2, "loans")).toBe(0);
    expect(await jumlahBaris(t2, "kreditBarang")).toBe(0);
    expect(await jumlahBaris(t2, "kreditPayments")).toBe(0);
    expect(await jumlahBaris(t2, "kreditFundings")).toBe(0);
    expect(await t2.run(async (ctx) => ctx.db.get(lainId))).not.toBeNull();
    expect(await t2.run(async (ctx) => ctx.db.get(contoh.pendanaId))).toBeNull();

    // Dijalankan lagi: tidak ada yang tersisa, tidak melempar.
    const ulang = await t2.mutation(internal.contohPendana.hapus, HAPUS);
    expect(ulang.pinjamanDihapus).toBe(0);
  });

  it("menolak konfirmasi yang salah dan tidak menimpa akun bernama lain", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(internal.contohPendana.buat, { konfirmasi: "ASAL_JALAN" }),
    ).rejects.toThrow(/BUAT_CONTOH_PENDANA/);

    // Email tetap sudah dipakai akun pendana sungguhan → seed berhenti, bukan
    // mengganti nama atau perannya.
    await t.run(async (ctx) =>
      ctx.db.insert("users", {
        name: "Pendana Nyata",
        email: "pendana.uji@pindai.test",
        role: "dana",
      }),
    );
    await expect(t.mutation(internal.contohPendana.buat, BUAT)).rejects.toThrow(
      /tidak menimpa|bernama/i,
    );
    expect(await jumlahBaris(t, "loans")).toBe(0);
  });
});
