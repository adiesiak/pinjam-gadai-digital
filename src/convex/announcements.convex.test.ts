/**
 * Tes integrasi Convex — CMS konten situs oleh admin.
 *
 * Membuktikan halaman publik memakai default, perubahan admin langsung
 * terbaca publik setelah disimpan, dan konten kembali ke default saat reset.
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import { siapkanPengguna } from "./test.helpers";
import { modules } from "./test.setup";
import { DEFAULTS } from "./announcements";
import { BATAS_LANDING, KONTEN_LANDING_DEFAULT } from "../lib/landing-cms";
import {
  BATAS_PENDANA,
  KONTEN_PENDANA_DEFAULT,
} from "../lib/kontenPendana";

describe("CMS situs publik — pengaturan admin", () => {
  it("admin mengubah konten landing, publik melihatnya, lalu reset ke default", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "Admin CMS", {
      email: "admin-cms@pindai.test",
      role: "admin",
    });

    // Pengunjung belum login tetap bisa membaca konten publik bawaan.
    const defaultPublik = await t.query(api.announcements.getPublic, {});
    expect(defaultPublik.heroJudul).toBe(DEFAULTS.hero.judul);
    expect(defaultPublik.barAktif).toBe(true);
    expect(await t.query(api.announcements.getCmsRow, {})).toBeNull();

    await expect(
      admin.mutation(api.announcements.save, {
        teks: "  Promo Ramadan PINDAI  ",
        tautan: "/auth?mode=signup",
        barAktif: false,
        popupJudul: "Promo khusus",
        floatDelayDetik: 90,
        heroJudul: "PINDAI untuk usaha",
        heroCta1: "Ajukan sekarang",
      }),
    ).resolves.toEqual({ ok: true });

    const tersimpan = await admin.query(api.announcements.getCmsRow, {});
    expect(tersimpan).toMatchObject({
      slot: "global",
      teks: "Promo Ramadan PINDAI",
      tautan: "/auth?mode=signup",
      aktif: false,
      popupJudul: "Promo khusus",
      floatDelayDetik: 60,
      heroJudul: "PINDAI untuk usaha",
      heroCta1: "Ajukan sekarang",
    });

    const publik = await t.query(api.announcements.getPublic, {});
    expect(publik).toMatchObject({
      barTeks: "Promo Ramadan PINDAI",
      barAktif: false,
      popupJudul: "Promo khusus",
      floatDelayDetik: 60,
      heroJudul: "PINDAI untuk usaha",
      heroCta1: "Ajukan sekarang",
      heroJudul2: DEFAULTS.hero.judul2,
    });

    await expect(admin.mutation(api.announcements.resetToDefaults, {})).resolves.toEqual({
      ok: true,
    });
    expect(await admin.query(api.announcements.getCmsRow, {})).toBeNull();
    expect(await t.query(api.announcements.getPublic, {})).toMatchObject({
      heroJudul: DEFAULTS.hero.judul,
      barTeks: DEFAULTS.bar.teks,
      barAktif: true,
    });
  });

  it("admin mengubah teks beranda, publik memakai teks CMS, field kosong kembali ke bawaan", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "Admin Landing", {
      email: "admin-landing@pindai.test",
      role: "admin",
    });

    // Sebelum disimpan: publik membaca konten utuh dari bawaan, termasuk tiga
    // kartu dan tiga panduan — bukan undefined yang harus dirakit klien.
    const awal = await t.query(api.announcements.getPublic, {});
    expect(awal.landing.heroJudul1).toBe(KONTEN_LANDING_DEFAULT.heroJudul1);
    expect(awal.landing.layanan).toHaveLength(3);
    expect(awal.landing.panduan).toHaveLength(3);

    await expect(
      admin.mutation(api.announcements.save, {
        landing: {
          heroJudul1: "  Biaya yang terbaca  ",
          // Kosong → pembacaan memakai bawaan, bukan judul kosong.
          heroJudul2: "   ",
          heroMikro: "m".repeat(BATAS_LANDING.heroMikro + 40),
          layanan: [
            { judul: "Kartu utama", ringkasan: "Ringkasan utama", detail: "Detail utama" },
          ],
          panduan: [{ judul: "Langkah satu", isi: "Isi langkah satu" }],
          footerDeskripsi: "Footer baru.",
        },
      }),
    ).resolves.toEqual({ ok: true });

    // Baris mentah hanya menyimpan yang dikirim, sudah dipangkas dan dipotong.
    const baris = await admin.query(api.announcements.getCmsRow, {});
    expect(baris?.landing?.heroJudul1).toBe("Biaya yang terbaca");
    expect(baris?.landing?.heroJudul2).toBeUndefined();
    expect(baris?.landing?.heroMikro).toHaveLength(BATAS_LANDING.heroMikro);
    expect(baris?.landing?.layanan).toHaveLength(1);

    const publik = await t.query(api.announcements.getPublic, {});
    expect(publik.landing.heroJudul1).toBe("Biaya yang terbaca");
    expect(publik.landing.heroJudul2).toBe(
      KONTEN_LANDING_DEFAULT.heroJudul2,
    );
    expect(publik.landing.heroMikro).toHaveLength(BATAS_LANDING.heroMikro);
    expect(publik.landing.layanan[0].judul).toBe("Kartu utama");
    // Kartu yang tidak dikirim dilengkapi bawaan pada indeks yang sama.
    expect(publik.landing.layanan[1].judul).toBe(
      KONTEN_LANDING_DEFAULT.layanan[1].judul,
    );
    expect(publik.landing.panduan[0].judul).toBe("Langkah satu");
    expect(publik.landing.panduan[2].judul).toBe(
      KONTEN_LANDING_DEFAULT.panduan[2].judul,
    );
    expect(publik.landing.footerDeskripsi).toBe("Footer baru.");

    // Bar pengumuman tidak ikut berubah hanya karena teks beranda disimpan.
    expect(publik.barTeks).toBe(DEFAULTS.bar.teks);
  });

  it("migrasi membersihkan teks CMS lama era penyedia dana dan idempoten", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "Admin Migrasi", {
      email: "admin-migrasi@pindai.test",
      role: "admin",
    });

    // Tanpa baris CMS: tidak ada yang perlu dibersihkan.
    await expect(admin.mutation(api.announcements.bersihkanTeksLama, {})).resolves.toEqual({
      ok: true,
      diganti: [],
    });

    // Simulasi konten lama era "Pendana" yang benar-benar tersimpan di DB —
    // literalnya dibiarkan apa adanya agar migrasi terbukti mengenalinya;
    // satu teks kustom bersih untuk memastikan tidak ikut dihapus.
    await expect(
      admin.mutation(api.announcements.save, {
        teks: "Alokasi dana Pendana kini tersedia untuk pinjaman pilihan.",
        tautan: "/pendana",
        popupJudul: "Pendana baru bergabung",
        heroSub: "Sisa bagi hasil untuk Pendana tercatat otomatis.",
        pinjamanJudul: "Pinjaman tunai untuk semua",
      }),
    ).resolves.toEqual({ ok: true });

    const hasil = await admin.mutation(api.announcements.bersihkanTeksLama, {});
    expect(hasil.ok).toBe(true);
    expect(hasil.diganti).toEqual(
      expect.arrayContaining(["Teks berjalan", "Tautan CTA bar", "Judul popup", "Sub-judul hero"]),
    );
    expect(hasil.diganti).not.toContain("Judul kartu pinjaman");

    // Field lama dikosongkan → publik memakai default baru; teks kustom tetap.
    const baris = await admin.query(api.announcements.getCmsRow, {});
    expect(baris?.teks).toBeUndefined();
    expect(baris?.tautan).toBeUndefined();
    expect(baris?.popupJudul).toBeUndefined();
    expect(baris?.heroSub).toBeUndefined();
    expect(baris?.pinjamanJudul).toBe("Pinjaman tunai untuk semua");

    const publik = await t.query(api.announcements.getPublic, {});
    expect(publik.barTeks).toBe(DEFAULTS.bar.teks);
    expect(publik.barTautan).toBe(DEFAULTS.bar.tautan);
    expect(publik.heroSub).toBe(DEFAULTS.hero.sub);
    // Default pengganti harus teks baru — bukan teks lama era penyedia dana.
    expect(DEFAULTS.bar.teks).not.toMatch(/pendana|alokasi/i);

    // Idempoten: pemanggilan kedua tidak mengubah apa pun.
    await expect(admin.mutation(api.announcements.bersihkanTeksLama, {})).resolves.toEqual({
      ok: true,
      diganti: [],
    });
  });

  it("non-admin boleh baca konten publik tetapi tidak melihat baris CMS atau mengubahnya", async () => {
    const t = convexTest(schema, modules);
    const { sesi: peminjam } = await siapkanPengguna(t, "Peminjam", {
      email: "peminjam-cms@pindai.test",
      role: "peminjam",
    });

    await expect(peminjam.query(api.announcements.getPublic, {})).resolves.toMatchObject({
      heroJudul: DEFAULTS.hero.judul,
    });
    await expect(peminjam.query(api.announcements.getCmsRow, {})).resolves.toBeNull();
    await expect(
      peminjam.mutation(api.announcements.save, { heroJudul: "Teks tidak sah" }),
    ).rejects.toThrow(/admin/i);
    await expect(
      peminjam.mutation(api.announcements.save, {
        landing: { heroJudul1: "Teks tidak sah" },
      }),
    ).rejects.toThrow(/admin/i);
    await expect(peminjam.mutation(api.announcements.resetToDefaults, {})).rejects.toThrow(
      /admin/i,
    );
    await expect(
      peminjam.mutation(api.announcements.bersihkanTeksLama, {}),
    ).rejects.toThrow(/admin/i);
  });

  it("admin mengubah konten halaman pendana tanpa menghapus berkas proposal", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "Admin Pendana", {
      email: "admin-pendana@pindai.test",
      role: "admin",
    });

    // Halaman baru: publik membaca konten utuh dari bawaan, termasuk daftar.
    const awal = await t.query(api.announcements.getPublic, {});
    expect(awal.pendana.heroJudul).toBe(KONTEN_PENDANA_DEFAULT.heroJudul);
    expect(awal.pendana.prinsip).toHaveLength(4);
    expect(awal.pendana.faq).toHaveLength(6);

    await expect(
      admin.mutation(api.announcements.simpanKontenPendana, {
        pendana: {
          heroJudul: "  Judul pendana baru  ",
          // Kosong → pembacaan memakai bawaan, bukan judul kosong.
          prinsipJudul: "   ",
          heroDeskripsi: "d".repeat(BATAS_PENDANA.heroDeskripsi + 30),
          prinsip: [{ judul: "Prinsip admin", isi: "Isi prinsip admin" }],
          proposalIsi: ["Baris pertama"],
          faq: [{ tanya: "Tanya admin?", jawab: "Jawab admin." }],
        },
      }),
    ).resolves.toEqual({ ok: true });

    const baris = await admin.query(api.announcements.getCmsRow, {});
    expect(baris?.pendana?.heroJudul).toBe("Judul pendana baru");
    expect(baris?.pendana?.prinsipJudul).toBeUndefined();
    expect(baris?.pendana?.heroDeskripsi).toHaveLength(
      BATAS_PENDANA.heroDeskripsi,
    );
    expect(baris?.pendana?.prinsip).toHaveLength(1);

    const publik = await t.query(api.announcements.getPublic, {});
    expect(publik.pendana.heroJudul).toBe("Judul pendana baru");
    expect(publik.pendana.prinsipJudul).toBe(
      KONTEN_PENDANA_DEFAULT.prinsipJudul,
    );
    expect(publik.pendana.prinsip[0].judul).toBe("Prinsip admin");
    expect(publik.pendana.prinsip[1].judul).toBe(
      KONTEN_PENDANA_DEFAULT.prinsip[1].judul,
    );
    expect(publik.pendana.proposalIsi[0]).toBe("Baris pertama");
    expect(publik.pendana.proposalIsi[1]).toBe(
      KONTEN_PENDANA_DEFAULT.proposalIsi[1],
    );
    expect(publik.pendana.faq[0].tanya).toBe("Tanya admin?");
    expect(publik.pendana.faq[5].tanya).toBe(
      KONTEN_PENDANA_DEFAULT.faq[5].tanya,
    );

    // Teks halaman tidak boleh mengubah konten landing.
    expect(publik.landing.heroJudul1).toBe(
      KONTEN_LANDING_DEFAULT.heroJudul1,
    );

    // Menyimpan teks berikutnya tidak boleh melepas berkas proposal yang
    // sudah dipasang: formulir admin mengirim teks saja, bukan berkas.
    const pdf = await t.run((ctx) =>
      ctx.storage.store(
        new Blob(["%PDF-1.4 proposal"], { type: "application/pdf" }),
      ),
    );
    await admin.action(api.announcements.pasangProposal, {
      berkasId: pdf,
      namaBerkas: "proposal.pdf",
    });
    await admin.mutation(api.announcements.simpanKontenPendana, {
      pendana: { heroJudul: "Judul kedua" },
    });
    const setelah = await admin.query(api.announcements.getCmsRow, {});
    expect(setelah?.pendana?.berkasNama).toBe("proposal.pdf");
    expect(setelah?.pendana?.heroJudul).toBe("Judul kedua");
  });

  it("proposal PDF hanya terbaca sesi masuk, diverifikasi, dan bisa dikembalikan", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "Admin Proposal", {
      email: "admin-proposal@pindai.test",
      role: "admin",
    });

    // Tanpa berkas: unduhan disusun aplikasi.
    expect(await t.query(api.announcements.proposalPendanaAktif, {})).toBeNull();

    const pdf = await t.run((ctx) =>
      ctx.storage.store(
        new Blob(["%PDF-1.4 isi proposal"], { type: "application/pdf" }),
      ),
    );
    await expect(
      admin.action(api.announcements.pasangProposal, {
        berkasId: pdf,
        namaBerkas: "proposal 2027/final.pdf",
      }),
    ).resolves.toMatchObject({ ok: true, namaBerkas: "proposal 2027-final.pdf" });

    // Pengunjung anonim tidak menerima tautan penyimpanan.
    expect(await t.query(api.announcements.proposalPendanaAktif, {})).toBeNull();

    const { sesi: pendana } = await siapkanPengguna(t, "Pendana", {
      email: "pendana-proposal@pindai.test",
      role: "dana",
    });
    const aktif = await pendana.query(
      api.announcements.proposalPendanaAktif,
      {},
    );
    expect(aktif?.namaBerkas).toBe("proposal 2027-final.pdf");
    expect(aktif?.url).toMatch(/^https?:/);

    // Query publik tidak membawa URL berkas.
    const publik = await t.query(api.announcements.getPublic, {});
    expect(JSON.stringify(publik)).not.toContain("convex.cloud");

    // Berkas non-PDF ditolak.
    const teks = await t.run((ctx) =>
      ctx.storage.store(new Blob(["bukan pdf"], { type: "text/plain" })),
    );
    await expect(
      admin.action(api.announcements.pasangProposal, { berkasId: teks }),
    ).rejects.toThrow(/PDF/i);

    await expect(admin.mutation(api.announcements.hapusProposal, {})).resolves.toEqual({
      ok: true,
    });
    expect(await pendana.query(api.announcements.proposalPendanaAktif, {})).toBeNull();
  });

  it("hanya admin yang boleh mengganti proposal dan menyimpan konten pendana", async () => {
    const t = convexTest(schema, modules);
    const { sesi: peminjam } = await siapkanPengguna(t, "Peminjam Pendana", {
      email: "peminjam-pendana@pindai.test",
      role: "peminjam",
    });
    await expect(
      peminjam.mutation(api.announcements.simpanKontenPendana, {
        pendana: { heroJudul: "Teks tidak sah" },
      }),
    ).rejects.toThrow(/admin/i);
    await expect(
      peminjam.mutation(api.announcements.generateUploadProposalUrl, {}),
    ).rejects.toThrow(/admin/i);
    await expect(
      peminjam.mutation(api.announcements.hapusProposal, {}),
    ).rejects.toThrow(/admin/i);
  });
});
