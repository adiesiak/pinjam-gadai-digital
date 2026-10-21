/**
 * Tes kampanye promo pinjaman di jalur Convex nyata.
 * Menjalankan: bunx vitest run src/convex/promoPinjaman.convex.test.ts
 *
 * Yang dijaga:
 *  - query publik hanya mengembalikan kampanye aktif, dalam masa berlaku, dan
 *    yang memang memilih penempatan itu;
 *  - kampanye terbaru menang saat dua-duanya valid, tanpa admin mematikan yang lama;
 *  - penulisan dan penghapusan hanya lewat sesi admin (TOTP), bukan admin biasa;
 *  - validasi tanggal dan penempatan berjalan di server, bukan hanya di panel.
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import { buatPengguna, buatSesi, siapkanPengguna } from "./test.helpers";
import { modules } from "./test.setup";

const HARI = 86_400_000;

type IsiUji = {
  badge: string;
  judul: string;
  deskripsi: string;
  mulai: number;
  selesai: number;
  penempatan: ("beranda" | "dashboard" | "promo" | "pengajuan")[];
  aktif: boolean;
};

function isi(sekarang: number, ubah: Partial<IsiUji> = {}): IsiUji {
  return {
    badge: "Promo uji",
    judul: "Tenor pilihan lebih panjang",
    deskripsi: "Ajukan pinjaman tenor 28 hari lewat formulir pengajuan.",
    mulai: sekarang - HARI,
    selesai: sekarang + HARI,
    penempatan: ["dashboard"],
    aktif: true,
    ...ubah,
  };
}

describe("promo pinjaman", () => {
  it("tanpa kampanye, keempat penempatan tidak menampilkan apa pun", async () => {
    const t = convexTest(schema, modules);
    for (const penempatan of ["beranda", "dashboard", "promo", "pengajuan"] as const) {
      await expect(
        t.query(api.promoPinjaman.promoAktif, { penempatan }),
      ).resolves.toBeNull();
    }
  });

  it("menyimpan dari sesi admin lalu tampil hanya di penempatan yang dipilih", async () => {
    const t = convexTest(schema, modules);
    const admin = await siapkanPengguna(t, "admin promo", {
      email: "promo-admin@pindai.test",
      role: "admin",
    });
    const sekarang = Date.now();

    const { id } = await admin.sesi.mutation(
      api.promoPinjaman.simpan,
      isi(sekarang, { penempatan: ["dashboard", "pengajuan"] }),
    );

    expect(id).toBeTruthy();

    await expect(
      t.query(api.promoPinjaman.promoAktif, { penempatan: "dashboard" }),
    ).resolves.toMatchObject({
      judul: "Tenor pilihan lebih panjang",
      badge: "Promo uji",
      mulai: sekarang - HARI,
    });
    await expect(
      t.query(api.promoPinjaman.promoAktif, { penempatan: "pengajuan" }),
    ).resolves.not.toBeNull();
    await expect(
      t.query(api.promoPinjaman.promoAktif, { penempatan: "beranda" }),
    ).resolves.toBeNull();
    await expect(
      t.query(api.promoPinjaman.promoAktif, { penempatan: "promo" }),
    ).resolves.toBeNull();
  });

  it("kampanye terbaru yang menang bila dua-duanya valid", async () => {
    const t = convexTest(schema, modules);
    const admin = await siapkanPengguna(t, "admin promo", {
      email: "promo-admin2@pindai.test",
      role: "admin",
    });
    const sekarang = Date.now();

    const lama = await admin.sesi.mutation(
      api.promoPinjaman.simpan,
      isi(sekarang, { judul: "Kampanye lama" }),
    );
    // Waktu server bisa sama persis dalam satu tes; geser penanda yang lama.
    await t.run((ctx) =>
      ctx.db.patch(lama.id, { diperbaruiPada: sekarang - 60_000 }),
    );
    await admin.sesi.mutation(
      api.promoPinjaman.simpan,
      isi(sekarang, { judul: "Kampanye baru" }),
    );

    const aktif = await t.query(api.promoPinjaman.promoAktif, {
      penempatan: "dashboard",
    });
    expect(aktif?.judul).toBe("Kampanye baru");
  });

  it("kampanye nonaktif, dijadwalkan, dan sudah berakhir tidak tampil", async () => {
    const t = convexTest(schema, modules);
    const admin = await siapkanPengguna(t, "admin promo", {
      email: "promo-admin3@pindai.test",
      role: "admin",
    });
    const sekarang = Date.now();

    await admin.sesi.mutation(
      api.promoPinjaman.simpan,
      isi(sekarang, { judul: "Kampanye nonaktif", aktif: false }),
    );
    await expect(
      t.query(api.promoPinjaman.promoAktif, { penempatan: "dashboard" }),
    ).resolves.toBeNull();

    await admin.sesi.mutation(
      api.promoPinjaman.simpan,
      isi(sekarang, {
        judul: "Kampanye mendatang",
        mulai: sekarang + HARI,
        selesai: sekarang + 2 * HARI,
      }),
    );
    await expect(
      t.query(api.promoPinjaman.promoAktif, { penempatan: "dashboard" }),
    ).resolves.toBeNull();

    await admin.sesi.mutation(
      api.promoPinjaman.simpan,
      isi(sekarang, {
        judul: "Kampanye selesai",
        mulai: sekarang - 3 * HARI,
        selesai: sekarang - 2 * HARI,
      }),
    );
    await expect(
      t.query(api.promoPinjaman.promoAktif, { penempatan: "dashboard" }),
    ).resolves.toBeNull();
  });

  it("menolak tanggal terbalik dan penempatan kosong", async () => {
    const t = convexTest(schema, modules);
    const admin = await siapkanPengguna(t, "admin promo", {
      email: "promo-admin4@pindai.test",
      role: "admin",
    });
    const sekarang = Date.now();

    await expect(
      admin.sesi.mutation(
        api.promoPinjaman.simpan,
        isi(sekarang, {
          mulai: sekarang + HARI,
          selesai: sekarang - HARI,
        }),
      ),
    ).rejects.toThrow("Tanggal selesai tidak boleh sebelum tanggal mulai.");

    await expect(
      admin.sesi.mutation(
        api.promoPinjaman.simpan,
        isi(sekarang, { penempatan: [] }),
      ),
    ).rejects.toThrow("Pilih minimal satu tempat tampil.");

    const jumlah = await t.run((ctx) =>
      ctx.db.query("promoPinjaman").collect(),
    );
    expect(jumlah).toHaveLength(0);
  });

  it("menolak pengguna non-admin dan admin tanpa sesi terverifikasi", async () => {
    const t = convexTest(schema, modules);
    const peminjam = await buatSesi(t, "peminjam promo", {
      email: "promo-peminjam@pindai.test",
      role: "peminjam",
    });

    await expect(
      peminjam.mutation(
        api.promoPinjaman.simpan,
        isi(Date.now(), { penempatan: ["dashboard"] }),
      ),
    ).rejects.toThrow();

    await expect(peminjam.query(api.promoPinjaman.daftar, {})).rejects.toThrow();

    // Admin yang belum menyelesaikan TOTP juga tidak boleh mengubah kampanye.
    // `buatPengguna` sengaja dipakai, bukan `buatSesi`: yang terakhir memasang
    // TOTP otomatis untuk peran admin.
    const adminBelumTotp = await buatPengguna(t, "admin tanpa totp", {
      email: "promo-admin5@pindai.test",
      emailVerificationTime: Date.now(),
      role: "admin",
    });
    await expect(
      adminBelumTotp.sesi.mutation(
        api.promoPinjaman.simpan,
        isi(Date.now(), { penempatan: ["dashboard"] }),
      ),
    ).rejects.toThrow();
  });

  it("daftar admin memuat semua kampanye dan status berjalannya", async () => {
    const t = convexTest(schema, modules);
    const admin = await siapkanPengguna(t, "admin promo", {
      email: "promo-admin6@pindai.test",
      role: "admin",
    });
    const sekarang = Date.now();

    const aktif = await admin.sesi.mutation(
      api.promoPinjaman.simpan,
      isi(sekarang, { judul: "Kampanye berjalan" }),
    );
    await admin.sesi.mutation(
      api.promoPinjaman.simpan,
      isi(sekarang, {
        judul: "Kampanye nonaktif",
        aktif: false,
        penempatan: ["beranda"],
      }),
    );

    const rows = await admin.sesi.query(api.promoPinjaman.daftar, {});
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r._id === aktif.id)).toMatchObject({
      judul: "Kampanye berjalan",
      berjalan: true,
      aktif: true,
      status: "berjalan",
    });
    expect(rows.find((r) => r.judul === "Kampanye nonaktif")).toMatchObject({
      berjalan: false,
      aktif: false,
      status: "nonaktif",
    });
  });

  it("hapus menghilangkan kampanye dari semua penempatan", async () => {
    const t = convexTest(schema, modules);
    const admin = await siapkanPengguna(t, "admin promo", {
      email: "promo-admin7@pindai.test",
      role: "admin",
    });
    const sekarang = Date.now();

    const { id } = await admin.sesi.mutation(
      api.promoPinjaman.simpan,
      isi(sekarang, { penempatan: ["beranda", "dashboard"] }),
    );
    await admin.sesi.mutation(api.promoPinjaman.hapus, { id });

    await expect(
      t.query(api.promoPinjaman.promoAktif, { penempatan: "beranda" }),
    ).resolves.toBeNull();
    await expect(
      t.query(api.promoPinjaman.promoAktif, { penempatan: "dashboard" }),
    ).resolves.toBeNull();
  });
});
