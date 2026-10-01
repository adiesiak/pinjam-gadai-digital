/**
 * Tes akses bersama penyedia dana — convex-test + vitest.
 *
 * Yang dijaga di sini:
 * - Hanya admin (sesi TOTP) yang dapat menerbitkan/menonaktifkan kode.
 * - Kode asli hanya keluar sekali; basis data & audit hanya menyimpan hash.
 * - Tamu + kode benar → peran `pengamat` (lihat saja) dan tetap tidak bisa
 *   menyentuh gerbang dana/admin mana pun.
 * - Kode salah tercatat, dan percobaan beruntun membekukan pemakaian kode.
 * - Rotasi/nonaktif kode langsung memutus pemakai lama (versi kode).
 *
 * Menjalankan: bunx vitest run src/convex/aksesBersama.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { KODE_PANJANG, MAKS_GAGAL, normalisasiKode } from "./aksesBersama";
import schema from "./schema";
import { buatPengguna, siapkanPengguna, type KonteksUji } from "./test.helpers";
import { modules } from "./test.setup";

const KODE_SALAH = "AAAAA-BBBBB-CCCCC-DDDDD";

/** Satu pengajuan pinjaman agar ruang pemantau punya isi. */
async function seedPengajuan(t: KonteksUji, userId: Id<"users">) {
  return t.run(async (ctx) => {
    await ctx.db.patch(userId, { kodePeminjam: "PMN-BERSAMA123456789" });
    return await ctx.db.insert("loans", {
      userId,
      pokokPinjaman: 1_500_000,
      tujuan: "Modal usaha warung",
      namaLengkap: "Rani Peminjam",
      nomorRekening: "1234567890",
      status: "diajukan",
      nomorReferensi: "PGD-AB-1",
      tenorHari: 30,
    });
  });
}

async function barisKode(t: KonteksUji) {
  return t.run(async (ctx) => (await ctx.db.query("aksesBersama").collect())[0] ?? null);
}

describe("akses bersama penyedia dana", () => {
  it("hanya admin yang dapat menerbitkan, menonaktifkan, dan membaca status kode", async () => {
    const t = convexTest(schema, modules);
    const { sesi: peminjam } = await siapkanPengguna(t, "rani", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    const { sesi: dana } = await siapkanPengguna(t, "penyedia", {
      email: "dana@pindai.test",
      role: "dana",
    });

    await expect(
      peminjam.mutation(api.aksesBersama.terbitkanKodeBersama, {}),
    ).rejects.toThrow(/admin/i);
    await expect(
      dana.mutation(api.aksesBersama.terbitkanKodeBersama, {}),
    ).rejects.toThrow(/admin/i);
    await expect(
      dana.mutation(api.aksesBersama.nonaktifkanKodeBersama, {}),
    ).rejects.toThrow(/admin/i);
    await expect(
      dana.query(api.aksesBersama.statusKodeBersama, {}),
    ).rejects.toThrow(/admin/i);
  });

  it("kode ditampilkan sekali dan disimpan hanya sebagai hash", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });

    const terbit = await admin.mutation(api.aksesBersama.terbitkanKodeBersama, {});
    expect(terbit.versi).toBe(1);
    expect(terbit.kode).toMatch(
      /^[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}$/,
    );
    expect(normalisasiKode(terbit.kode)).toHaveLength(KODE_PANJANG);

    const isi = await t.run(async (ctx) => ({
      baris: await ctx.db.query("aksesBersama").collect(),
      audit: await ctx.db.query("auditLog").collect(),
      pengguna: await ctx.db.query("users").collect(),
    }));
    expect(isi.baris).toHaveLength(1);
    expect(isi.baris[0]?.aktif).toBe(true);
    expect(isi.baris[0]?.kodeHash).toMatch(/^[0-9a-f]{64}$/);
    // Kode asli (tertaut pemisah maupun tanpa) tidak pernah tersimpan.
    const semua = JSON.stringify(isi);
    expect(semua).not.toContain(terbit.kode);
    expect(semua).not.toContain(normalisasiKode(terbit.kode));
    expect(semua).toContain("terbitkan_kode_akses_bersama");
  });

  it("tamu dengan kode benar menjadi pemantau lihat-saja; kode salah dicatat", async () => {
    const t = convexTest(schema, modules);
    const { userId: peminjamId } = await siapkanPengguna(t, "rani", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const { sesi: tamu, userId: tamuId } = await buatPengguna(t, "tamu", {
      isAnonymous: true,
    });
    const loanId = await seedPengajuan(t, peminjamId);

    const { kode } = await admin.mutation(api.aksesBersama.terbitkanKodeBersama, {});

    // Tanpa kode, tamu tetap ditolak.
    await expect(tamu.query(api.penyediaDana.daftarPengajuan, {})).rejects.toThrow(
      /tamu/i,
    );

    const salah = await tamu.mutation(api.aksesBersama.masukDenganKodeBersama, {
      kode: KODE_SALAH,
    });
    expect(salah).toEqual({ ok: false, pesan: "Kode akses bersama tidak cocok." });
    expect((await barisKode(t))?.gagalTerakhir ?? []).toHaveLength(1);

    const berhasil = await tamu.mutation(api.aksesBersama.masukDenganKodeBersama, {
      kode,
    });
    expect(berhasil).toEqual({ ok: true, sudahSesuai: false });
    const pemantau = await t.run((ctx) => ctx.db.get(tamuId));
    expect(pemantau?.role).toBe("pengamat");
    expect(pemantau?.aksesBersamaVersi).toBe(1);
    // Kode benar membersihkan catatan percobaan gagal.
    expect((await barisKode(t))?.gagalTerakhir ?? []).toHaveLength(0);

    const daftar = await tamu.query(api.penyediaDana.daftarPengajuan, {});
    expect(daftar.pinjaman[0]?.nomorReferensi).toBe("PGD-AB-1");

    // Peta titik lokasi boleh dibaca pemantau akun bersama (masih kosong di uji ini).
    const titik = await tamu.query(api.penyediaDana.titikPeminjam, {});
    expect(titik.rows).toHaveLength(0);
    expect(titik.tanpaTitik).toBe(1);

    // Berkas identitas pemohon TIDAK: kode bersama dibagikan ke banyak orang dan
    // tidak dapat ditelusuri ke satu akun, sedangkan KTP/selfie adalah data pribadi.
    await expect(
      tamu.query(api.penyediaDana.berkasPengajuan, { jenis: "pinjaman", id: loanId }),
    ).rejects.toThrow(/akun penyedia dana/i);

    // Akun beremail dengan peran `dana` tetap dapat membuka berkas yang sama.
    const { sesi: penyedia } = await siapkanPengguna(t, "penyedia", {
      email: "penyedia@pindai.test",
      role: "dana",
    });
    const berkas = await penyedia.query(api.penyediaDana.berkasPengajuan, {
      jenis: "pinjaman",
      id: loanId,
    });
    expect(berkas?.jenis).toBe("pinjaman");
    expect(berkas?.catatan).toMatch(/belum ada berkas/i);

    // Tetap hanya baca: gerbang penyedia dana sungguhan & gerbang admin menolak.
    await expect(tamu.query(api.alokasiDana.myWallet, {})).rejects.toThrow(
      /penyedia dana/i,
    );
    await expect(
      tamu.mutation(api.admin.setPlafonPeminjam, { userId: tamuId, plafon: 1_000_000 }),
    ).rejects.toThrow(/admin/i);
    await expect(
      tamu.mutation(api.penyediaDana.ubahAkses, {
        email: "seseorang@pindai.test",
        aktif: true,
      }),
    ).rejects.toThrow(/admin/i);

    // Memakai kode yang sama lagi aman (idempoten).
    expect(
      await tamu.mutation(api.aksesBersama.masukDenganKodeBersama, { kode }),
    ).toEqual({ ok: true, sudahSesuai: true });
  });

  it("akun email tidak boleh memakai kode bersama", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const { sesi: peminjam, userId: peminjamId } = await siapkanPengguna(t, "rani", {
      email: "rani@pindai.test",
      role: "peminjam",
    });

    const { kode } = await admin.mutation(api.aksesBersama.terbitkanKodeBersama, {});
    await expect(
      peminjam.mutation(api.aksesBersama.masukDenganKodeBersama, { kode }),
    ).rejects.toThrow(/tamu/i);

    // Peran akun email tidak berubah.
    expect((await t.run((ctx) => ctx.db.get(peminjamId)))?.role).toBe("peminjam");
  });

  it("membekukan pemakaian kode setelah percobaan gagal beruntun", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const { sesi: tamu } = await buatPengguna(t, "tamu", { isAnonymous: true });
    const { kode } = await admin.mutation(api.aksesBersama.terbitkanKodeBersama, {});

    for (let i = 0; i < MAKS_GAGAL; i += 1) {
      const hasil = await tamu.mutation(api.aksesBersama.masukDenganKodeBersama, {
        kode: KODE_SALAH,
      });
      expect(hasil.ok).toBe(false);
    }

    // Setelah batas terlampaui, kode yang BENAR pun ditolak sementara.
    await expect(
      tamu.mutation(api.aksesBersama.masukDenganKodeBersama, { kode }),
    ).rejects.toThrow(/Terlalu banyak percobaan/);
    expect((await barisKode(t))?.blokirSampai ?? 0).toBeGreaterThan(Date.now());
  });

  it("rotasi dan nonaktif kode langsung memutus pemakai lama", async () => {
    const t = convexTest(schema, modules);
    const { userId: peminjamId } = await siapkanPengguna(t, "rani", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const { sesi: tamu } = await buatPengguna(t, "tamu", { isAnonymous: true });
    await seedPengajuan(t, peminjamId);

    const pertama = await admin.mutation(api.aksesBersama.terbitkanKodeBersama, {});
    await tamu.mutation(api.aksesBersama.masukDenganKodeBersama, {
      kode: pertama.kode,
    });

    // Rotasi: pemakai lama terputus walau sesinya masih hidup.
    const kedua = await admin.mutation(api.aksesBersama.terbitkanKodeBersama, {});
    expect(kedua.versi).toBe(2);
    await expect(tamu.query(api.penyediaDana.daftarPengajuan, {})).rejects.toThrow(
      /diputus admin/i,
    );
    expect(
      await tamu.mutation(api.aksesBersama.masukDenganKodeBersama, { kode: kedua.kode }),
    ).toEqual({ ok: true, sudahSesuai: false });
    await expect(
      tamu.query(api.penyediaDana.daftarPengajuan, {}),
    ).resolves.toBeDefined();

    // Nonaktif: pemakai aktif diputus dan tidak ada yang dapat bergabung.
    const nonaktif = await admin.mutation(api.aksesBersama.nonaktifkanKodeBersama, {});
    expect(nonaktif.versi).toBe(3);
    await expect(tamu.query(api.penyediaDana.daftarPengajuan, {})).rejects.toThrow(
      /diputus admin/i,
    );
    await expect(
      tamu.mutation(api.aksesBersama.masukDenganKodeBersama, { kode: kedua.kode }),
    ).rejects.toThrow(/dinonaktifkan/i);
    // Kode lama setelah rotasi juga sudah tidak berlaku.
    await expect(
      tamu.mutation(api.aksesBersama.masukDenganKodeBersama, { kode: pertama.kode }),
    ).rejects.toThrow(/dinonaktifkan/i);
  });

  it("status kode dan daftar akses melaporkan pemakai bersama untuk panel admin", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const { sesi: dana, userId: danaId } = await siapkanPengguna(t, "penyedia", {
      email: "dana@pindai.test",
      role: "dana",
    });
    const { sesi: tamu, userId: tamuId } = await buatPengguna(t, "tamu", {
      isAnonymous: true,
    });
    void dana;

    const belum = await admin.query(api.aksesBersama.statusKodeBersama, {});
    expect(belum).toMatchObject({ adaKode: false, aktif: false, versi: 0 });

    const { kode, versi } = await admin.mutation(
      api.aksesBersama.terbitkanKodeBersama,
      {},
    );
    await tamu.mutation(api.aksesBersama.masukDenganKodeBersama, { kode });

    const status = await admin.query(api.aksesBersama.statusKodeBersama, {});
    expect(status).toMatchObject({
      adaKode: true,
      aktif: true,
      versi,
      pemakaiAktif: 1,
      pemakaiTercatat: 1,
      gagalDalamJendela: 0,
      blokirSampai: null,
    });

    const akses = await admin.query(api.penyediaDana.daftarAkses, {});
    const barisDana = akses.rows.find((r) => r.userId === danaId);
    const barisTamu = akses.rows.find((r) => r.userId === tamuId);
    expect(barisDana?.akunBersama).toBe(false);
    expect(barisDana?.aksesAktif).toBe(true);
    expect(barisTamu?.akunBersama).toBe(true);
    expect(barisTamu?.aksesAktif).toBe(true);
    expect(barisTamu?.email).toBeNull();

    // Setelah nonaktif, baris akun bersama ditandai tidak aktif lagi.
    await admin.mutation(api.aksesBersama.nonaktifkanKodeBersama, {});
    const setelah = await admin.query(api.penyediaDana.daftarAkses, {});
    expect(setelah.rows.find((r) => r.userId === tamuId)?.aksesAktif).toBe(false);
  });
});
