/**
 * Tes contoh data ruang pendana.
 *
 * Yang dijaga:
 * - Dua pinjaman contoh (berjalan + lunas) benar-benar muncul di rekap ruang
 *   /penyedia-dana sebagai portofolio "PENDANA UJI COBA", dengan pembagian
 *   marjin 47 : 13 yang sama dengan mesin harga.
 * - Seed idempoten: dijalankan dua kali tidak menggandakan akun/pinjaman.
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
  tabel: "loans" | "users" | "siklusPendana" | "ledger_entries",
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

    // Pembagian marjin: Rp2.000.000 @30% → Rp600.000, dibagi 47 : 13.
    expect(hasil.pembagian.berjalan).toEqual({
      pokok: 2_000_000,
      margin: 600_000,
      pendana: 470_000,
      platform: 130_000,
    });
    // Rp1.000.000 @30% → Rp300.000; angka yang sama dengan contoh di aturan.
    expect(hasil.pembagian.lunas).toEqual({
      pokok: 1_000_000,
      margin: 300_000,
      pendana: 235_000,
      platform: 65_000,
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
      keuntunganPendana: 705_000,
      keuntunganPendanaLunas: 235_000,
      keuntunganPendanaBelumLunas: 470_000,
      keuntunganAdmin: 195_000,
      transferTercatat: 0,
      transferBelumDicatat: 1,
      keuntunganBelumDicatat: 235_000,
    });

    const contoh = ruang.pinjaman.filter((p) => p.nomorReferensi.startsWith("PGD-CONTOH-"));
    expect(contoh).toHaveLength(2);
    expect(contoh.map((p) => p.status).sort()).toEqual(["didanai", "lunas"]);
    const berjalan = contoh.find((p) => p.nomorReferensi === "PGD-CONTOH-0001");
    const lunas = contoh.find((p) => p.nomorReferensi === "PGD-CONTOH-0002");
    expect(berjalan).toMatchObject({
      status: "didanai",
      pokokPinjaman: 2_000_000,
      pendana: "PENDANA UJI COBA",
      keuntunganPendana: 470_000,
      keuntunganAdmin: 130_000,
    });
    expect(lunas).toMatchObject({
      status: "lunas",
      pokokPinjaman: 1_000_000,
      keuntunganPendana: 235_000,
      keuntunganAdmin: 65_000,
    });

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
    expect(await jumlahBaris(t, "loans")).toBe(2);
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
      peminjamDihapus: true,
      pendanaDihapus: true,
    });
    expect(await jumlahBaris(t2, "loans")).toBe(0);
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
