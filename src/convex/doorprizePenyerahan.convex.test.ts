/**
 * Tes penyerahan hadiah doorprize + kabar pemenang (convex-test + vitest).
 *
 * Yang dijaga:
 *  - pemenang mendapat notifikasi in-app dari baris undian yang benar-benar ada;
 *  - akun lain tidak mendapat kabar kemenangan itu;
 *  - penyerahan hadiah dicatat SEKALI (tanggal adalah bukti, bukan setelan),
 *    hanya oleh admin, dengan jejak audit;
 *  - papan pemenang publik menyamarkan nama dan tidak pernah mengirim id akun,
 *    email, atau nomor — hanya periode, hadiah, dan status penyerahan.
 *
 * Menjalankan: bunx vitest run src/convex/doorprizePenyerahan.convex.test.ts
 */
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import { beriTiket } from "./doorprize";
import schema from "./schema";
import { buatSesiLain, siapkanPengguna } from "./test.helpers";
import { modules } from "./test.setup";
import { pembukaanUndianKuartal, type Kuartal } from "../lib/doorprize";

const Q4: Kuartal = { year: 2026, quarter: 4 };
/** 31 Desember 2026 08.00 WIB — hari pengundian resmi. */
const WAKTU_UNDIAN = pembukaanUndianKuartal(Q4) + 8 * 3_600_000;

afterEach(() => {
  vi.restoreAllMocks();
});

async function siapkanUndian(t: ReturnType<typeof convexTest>) {
  vi.spyOn(Date, "now").mockReturnValue(WAKTU_UNDIAN);
  const pemenang = await siapkanPengguna(t, "Pemenang Undian", {
    email: "pemenang-undian@pindai.test",
    role: "peminjam",
  });
  const lain = await siapkanPengguna(t, "Nasabah Lain", {
    email: "nasabah-lain@pindai.test",
    role: "peminjam",
  });
  await t.run((ctx) =>
    beriTiket(ctx, {
      pemilikId: pemenang.userId,
      peran: "peminjam",
      referensi: "PINJAMAN:PGD-UJI-UNDIAN",
      sumber: "pelunasan_tepat_waktu",
      jumlah: 1,
      waktu: WAKTU_UNDIAN - 86_400_000,
    }),
  );
  const admin = await siapkanPengguna(t, "Admin Undian", {
    email: "admin-penyerahan@pindai.test",
    role: "admin",
  });
  await admin.sesi.mutation(api.doorprize.simpanHadiahKuartal, {
    kategori: "GOLD",
    nama: "Emas Antam 0,25 gram",
    nilai: 450_000,
  });
  await admin.sesi.mutation(api.doorprize.acakPemenang, {});
  const undian = await t.run(async (ctx) => {
    const rows = await ctx.db.query("doorprizeUndian").collect();
    return rows[0];
  });
  // Baris undian dibaca ulang setelah pengundian: tipe `Doc` di sini sempit,
  // jadi id-nya yang dipakai membaca baris utuh.
  return { pemenang, lain, admin, undianId: undian._id };
}

describe("doorprize: kabar pemenang dan penyerahan hadiah", () => {
  it("pemenang mendapat notifikasi, akun lain tidak", async () => {
    const t = convexTest(schema, modules);
    const { pemenang, lain } = await siapkanUndian(t);

    const sesiPemenang = await buatSesiLain(t, "Pemenang Undian", pemenang.userId);
    const notif = await sesiPemenang.sesi.query(api.notifikasi.daftar, {});
    const kabar = notif.item.find((item) => item.kunci.startsWith("undian:"));
    expect(kabar).toBeDefined();
    expect(kabar?.judul).toContain("Anda menang undian");
    expect(kabar?.ringkasan).toContain("Emas Antam 0,25 gram");
    expect(kabar?.jenis).toBe("sukses");

    const sesiLain = await buatSesiLain(t, "Nasabah Lain", lain.userId);
    const notifLain = await sesiLain.sesi.query(api.notifikasi.daftar, {});
    expect(notifLain.item.some((item) => item.kunci.startsWith("undian:"))).toBe(false);
  });

  it("penyerahan hadiah dicatat sekali, hanya admin, dan tercatat di audit", async () => {
    const t = convexTest(schema, modules);
    const { admin, pemenang, undianId } = await siapkanUndian(t);

    await expect(
      (await buatSesiLain(t, "Pemenang Undian", pemenang.userId)).sesi.mutation(
        api.doorprize.catatPenyerahanHadiah,
        { undianId },
      ),
    ).rejects.toThrow();

    const hasil = await admin.sesi.mutation(api.doorprize.catatPenyerahanHadiah, {
      undianId,
      catatan: "Kurir internal, diterima langsung",
    });
    expect(hasil.diserahkanPada).toBe(WAKTU_UNDIAN);

    // Sekali saja: tanggal penyerahan adalah bukti.
    await expect(
      admin.sesi.mutation(api.doorprize.catatPenyerahanHadiah, { undianId }),
    ).rejects.toThrow(/sudah tercatat diserahkan/);

    const tersimpan = await t.run((ctx) =>
      ctx.db.query("doorprizeUndian").first(),
    );
    expect(tersimpan?.hadiahDiserahkanPada).toBe(WAKTU_UNDIAN);
    expect(tersimpan?.catatanPenyerahan).toBe("Kurir internal, diterima langsung");

    const audit = await t.run(async (ctx) => {
      const rows = await ctx.db.query("auditLog").collect();
      return rows.find((row) => row.aksi === "doorprize_hadiah_diserahkan");
    });
    expect(audit?.target).toBe("2026-Q4");

    // Notifikasi pemenang ikut berubah menjadi "sudah diserahkan".
    const sesiPemenang = await buatSesiLain(t, "Pemenang Undian", pemenang.userId);
    const notif = await sesiPemenang.sesi.query(api.notifikasi.daftar, {});
    const kabar = notif.item.find((item) => item.kunci.startsWith("undian:"));
    expect(kabar?.ringkasan).toContain("sudah dicatat diserahkan");
  });

  it("papan pemenang publik menyamarkan nama dan tidak membocorkan kontak", async () => {
    const t = convexTest(schema, modules);
    await siapkanUndian(t);

    const daftar = await t.query(api.doorprize.pemenangPublik, {});
    expect(daftar).toHaveLength(1);
    const baris = daftar[0]!;
    expect(baris.labelPeriode).toBe("Q4 2026");
    expect(baris.hadiah).toBe("Emas Antam 0,25 gram");
    expect(baris.hadiahDiserahkan).toBe(false);

    // Nama disamarkan: dua huruf pertama tetap, sisanya bintang.
    expect(baris.nama.startsWith("Pe")).toBe(true);
    expect(baris.nama).toContain("*");
    expect(baris.nama).not.toContain("Pemenang Undian");
    expect(baris.nama).not.toContain("@");
    expect(JSON.stringify(baris)).not.toContain("pindai.test");
    expect(JSON.stringify(baris)).not.toContain("pemilikId");
  });
});
