/**
 * Tes ruang penyedia dana (lihat saja) — convex-test + vitest.
 *
 * Yang dijaga di sini:
 * - Gerbang akses di server: tamu, akun biasa, dan akun tanpa peran ditolak.
 * - Privasi: payload hanya berisi field whitelist; NIK, nomor rekening, nomor
 *   WhatsApp, alamat, dan dokumen tidak pernah ikut terkirim. Nama lengkap
 *   pemohon memang ditampilkan (keputusan admin ruang pemantau).
 * - Batas baris per kategori + penanda `terpotong`.
 * - Pemberian/pencabutan akses hanya oleh admin, idempoten, dan ber-audit.
 *
 * Menjalankan: bunx vitest run src/convex/penyediaDana.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { BATAS_BARIS } from "./penyediaDana";
import schema from "./schema";
import { buatPengguna, siapkanPengguna, type KonteksUji } from "./test.helpers";
import { modules } from "./test.setup";

/** Nilai identitas sensitif — tidak boleh muncul di payload mana pun. */
const RAHASIA = {
  nik: "3201234567890003",
  nomorRekening: "1234567890",
  nomorWhatsApp: "628123456791",
};

/** Nama lengkap pemohon — ditampilkan di ruang pemantau, bukan rahasia. */
const NAMA_PEMOHON = "Rani Peminjam";

const KODE_PEMINJAM = "PMN-UJICOBA12345678";

/** Tiga pengajuan (pinjaman, gadai, kredit) milik satu peminjam. */
async function seedPengajuan(t: KonteksUji, userId: Id<"users">) {
  return t.run(async (ctx) => {
    await ctx.db.patch(userId, { kodePeminjam: KODE_PEMINJAM });

    const loanId = await ctx.db.insert("loans", {
      userId,
      pokokPinjaman: 2_500_000,
      tujuan: "Modal usaha warung",
      namaLengkap: NAMA_PEMOHON,
      nomorRekening: RAHASIA.nomorRekening,
      nik: RAHASIA.nik,
      nomorWhatsApp: RAHASIA.nomorWhatsApp,
      status: "diajukan",
      nomorReferensi: "PGD-UJI-1",
      tenorHari: 30,
    });
    const pawnId = await ctx.db.insert("pawns", {
      userId,
      deskripsiBarang: "Kalung emas 10 gram",
      kategori: "Emas",
      alamatPenilaian: "Jl. Contoh No. 1",
      namaLengkap: NAMA_PEMOHON,
      nomorRekening: RAHASIA.nomorRekening,
      status: "sedang_dinilai",
      nomorReferensi: "PGD-UJI-2",
      nilaiTaksiran: 3_500_000,
      hargaPasar: 5_000_000,
      kodeRakVault: "RAK-A1",
    });
    const kreditId = await ctx.db.insert("kreditBarang", {
      userId,
      nomorReferensi: "PGD-UJI-3",
      namaBarang: "Kulkas dua pintu",
      kategori: "Elektronik",
      merchant: "Tokopedia",
      hargaBarang: 6_000_000,
      dpPersen: 20,
      tenorBulan: 6,
      marginPersenPerBulan: 3,
      status: "disetujui",
      namaLengkap: NAMA_PEMOHON,
      nik: RAHASIA.nik,
      nomorRekening: RAHASIA.nomorRekening,
      nomorWhatsApp: RAHASIA.nomorWhatsApp,
    });

    return { loanId, pawnId, kreditId };
  });
}

describe("ruang penyedia dana (lihat saja)", () => {
  it("menolak tamu dan akun tanpa akses — gerbang ada di server", async () => {
    const t = convexTest(schema, modules);
    const { sesi: tamu } = await buatPengguna(t, "tamu", { isAnonymous: true });
    const { sesi: peminjam } = await siapkanPengguna(t, "rani", {
      email: "rani@pindai.test",
      role: "peminjam",
    });

    await expect(tamu.query(api.penyediaDana.daftarPengajuan, {})).rejects.toThrow(
      /tamu/i,
    );
    await expect(
      peminjam.query(api.penyediaDana.daftarPengajuan, {}),
    ).rejects.toThrow(/akses lihat saja/i);
  });

  it("penyedia dana melihat nama pemohon tanpa data identitas lain", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await siapkanPengguna(t, "rani", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    const { sesi: dana } = await siapkanPengguna(t, "penyedia", {
      email: "dana@pindai.test",
      role: "dana",
    });
    await seedPengajuan(t, userId);

    const hasil = await dana.query(api.penyediaDana.daftarPengajuan, {});

    expect(hasil.pinjaman).toHaveLength(1);
    expect(hasil.pinjaman[0]).toMatchObject({
      nomorReferensi: "PGD-UJI-1",
      namaLengkap: NAMA_PEMOHON,
      kodePeminjam: KODE_PEMINJAM,
      pokokPinjaman: 2_500_000,
      tenorHari: 30,
      status: "diajukan",
      didanaiPada: null,
      pendana: null,
    });
    expect(hasil.gadai[0]).toMatchObject({
      nomorReferensi: "PGD-UJI-2",
      namaLengkap: NAMA_PEMOHON,
      kategori: "Emas",
      nilaiTaksiran: 3_500_000,
      status: "sedang_dinilai",
    });
    expect(hasil.kredit[0]).toMatchObject({
      nomorReferensi: "PGD-UJI-3",
      namaLengkap: NAMA_PEMOHON,
      namaBarang: "Kulkas dua pintu",
      merchant: "Tokopedia",
      hargaBarang: 6_000_000,
      dpPersen: 20,
      tenorBulan: 6,
      status: "disetujui",
      didanaiPada: null,
      pendana: null,
    });

    // Tidak ada nilai identitas sensitif yang ikut terkirim.
    const mentah = JSON.stringify(hasil);
    for (const rahasia of Object.values(RAHASIA)) {
      expect(mentah).not.toContain(rahasia);
    }
    // Kunci sensitif tidak pernah ada, bahkan sebagai properti kosong.
    for (const baris of [...hasil.pinjaman, ...hasil.gadai, ...hasil.kredit]) {
      for (const kunci of [
        "nik",
        "nomorRekening",
        "nomorWhatsApp",
        "alamatPenilaian",
        "kodeRakVault",
        "hargaPasar",
        "tandaTanganPeminjam",
        "dokKtpId",
        "dokSelfieKtpId",
        "dokSlipGajiId",
      ]) {
        expect(baris).not.toHaveProperty(kunci);
      }
    }

    // Ringkasan dihitung dari baris yang dikirim.
    expect(hasil.ringkasan).toMatchObject({
      jumlahPinjaman: 1,
      jumlahGadai: 1,
      jumlahKredit: 1,
      menungguReview: 2,
      nilaiPinjaman: 2_500_000,
      nilaiGadai: 3_500_000,
      nilaiKredit: 6_000_000,
    });
    expect(hasil.terpotong).toEqual({
      pinjaman: false,
      gadai: false,
      kredit: false,
    });
  });

  it("admin boleh membuka sebagai pratinjau", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await siapkanPengguna(t, "rani", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    await seedPengajuan(t, userId);

    const hasil = await admin.query(api.penyediaDana.daftarPengajuan, {});
    expect(hasil.pinjaman[0]?.nomorReferensi).toBe("PGD-UJI-1");
    // Admin tetap menerima payload pseudonim yang sama — tanpa jalur khusus.
    expect(JSON.stringify(hasil)).not.toContain(RAHASIA.nik);
  });

  it("membatasi daftar ke baris terbaru dan menandai terpotong", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await siapkanPengguna(t, "rani", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    const { sesi: dana } = await siapkanPengguna(t, "penyedia", {
      email: "dana@pindai.test",
      role: "dana",
    });

    await t.run(async (ctx) => {
      for (let i = 0; i < BATAS_BARIS + 5; i += 1) {
        await ctx.db.insert("loans", {
          userId,
          pokokPinjaman: 1_000_000,
          tujuan: `Pengajuan uji ${i}`,
          namaLengkap: NAMA_PEMOHON,
          nomorRekening: RAHASIA.nomorRekening,
          status: "diajukan",
          nomorReferensi: `PGD-BANJIR-${i}`,
          tenorHari: 30,
        });
      }
    });

    const hasil = await dana.query(api.penyediaDana.daftarPengajuan, {});
    expect(hasil.batas).toBe(BATAS_BARIS);
    expect(hasil.pinjaman).toHaveLength(BATAS_BARIS);
    expect(hasil.terpotong.pinjaman).toBe(true);
    expect(hasil.ringkasan.jumlahPinjaman).toBe(BATAS_BARIS);
  });

  it("menampilkan nama penyedia dana pada baris yang sudah didanai", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await siapkanPengguna(t, "rani", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    const { sesi: dana, userId: danaId } = await siapkanPengguna(t, "Robert", {
      email: "robert@pindai.test",
      role: "dana",
    });

    await t.run(async (ctx) => {
      const loanId = await ctx.db.insert("loans", {
        userId,
        pokokPinjaman: 1_000_000,
        tujuan: "Modal usaha",
        namaLengkap: NAMA_PEMOHON,
        nomorRekening: RAHASIA.nomorRekening,
        status: "didanai",
        nomorReferensi: "PGD-DANAI-1",
        tenorHari: 30,
        didanaiPada: Date.now(),
      });
      await ctx.db.insert("fundings", {
        loanId,
        danaId,
        jumlahAlokasi: 1_000_000,
        imbalHasil: 300_000,
        status: "dialokasikan",
        nomorReferensi: "FND-UJI-1",
      });
      const kreditId = await ctx.db.insert("kreditBarang", {
        userId,
        nomorReferensi: "PGD-DANAI-2",
        namaBarang: "Laptop",
        kategori: "Elektronik",
        merchant: "Tokopedia",
        hargaBarang: 5_000_000,
        dpPersen: 20,
        tenorBulan: 6,
        marginPersenPerBulan: 3,
        status: "didanai",
        namaLengkap: NAMA_PEMOHON,
        nik: RAHASIA.nik,
        nomorRekening: RAHASIA.nomorRekening,
        nomorWhatsApp: RAHASIA.nomorWhatsApp,
        didanaiPada: Date.now(),
      });
      await ctx.db.insert("kreditFundings", {
        kreditId,
        danaId,
        jumlahAlokasi: 4_000_000,
        imbalHasil: 240_000,
        status: "dialokasikan",
        nomorReferensi: "FND-UJI-2",
      });
    });

    const hasil = await dana.query(api.penyediaDana.daftarPengajuan, {});
    const pinjaman = hasil.pinjaman.find((b) => b.nomorReferensi === "PGD-DANAI-1");
    const kredit = hasil.kredit.find((b) => b.nomorReferensi === "PGD-DANAI-2");
    expect(pinjaman?.pendana).toBe("Robert");
    expect(pinjaman?.didanaiPada).not.toBeNull();
    expect(kredit?.pendana).toBe("Robert");

    // Nama penyedia dana tampil, identitas sensitif pemohon tetap di server.
    const mentah = JSON.stringify(hasil);
    expect(mentah).toContain("Robert");
    for (const rahasia of Object.values(RAHASIA)) {
      expect(mentah).not.toContain(rahasia);
    }
  });

  it("tahan baris alokasi lama (field `pendanaId`) dan memakai email sebagai identitas cadangan", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await siapkanPengguna(t, "rani", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    // Akun penyedia dana tanpa `name` — identitas jatuh ke email.
    const { sesi: dana, userId: danaId } = await siapkanPengguna(t, "", {
      email: "robert@pindai.test",
      role: "dana",
    });
    await t.run(async (ctx) => {
      const loanId = await ctx.db.insert("loans", {
        userId,
        pokokPinjaman: 1_000_000,
        tujuan: "Modal usaha",
        namaLengkap: NAMA_PEMOHON,
        nomorRekening: RAHASIA.nomorRekening,
        status: "didanai",
        nomorReferensi: "PGD-LEGACY-1",
        tenorHari: 30,
        didanaiPada: Date.now(),
      });
      // Bentuk baris lama: id penyedia tersimpan sebagai `pendanaId`.
      await ctx.db.insert("fundings", {
        loanId,
        pendanaId: danaId,
        jumlahAlokasi: 1_000_000,
        imbalHasil: 300_000,
        status: "dialokasikan",
        nomorReferensi: "FND-LEGACY-1",
      } as never);
    });

    const hasil = await dana.query(api.penyediaDana.daftarPengajuan, {});
    const baris = hasil.pinjaman.find((b) => b.nomorReferensi === "PGD-LEGACY-1");
    expect(baris?.pendana).toBe("robert@pindai.test");
  });

  it("akses hanya diberikan/dicabut admin, idempoten, dan tercatat di audit", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const { sesi: calon, userId: calonId } = await siapkanPengguna(t, "calon", {
      email: "calon@pindai.test",
      role: "peminjam",
    });

    // Akun tanpa peran admin tidak boleh mengubah akses siapa pun.
    await expect(
      calon.mutation(api.penyediaDana.ubahAkses, {
        email: "calon@pindai.test",
        aktif: true,
      }),
    ).rejects.toThrow(/admin/i);
    // Akun tanpa peran admin juga tidak boleh membaca daftar akses.
    await expect(calon.query(api.penyediaDana.daftarAkses, {})).rejects.toThrow(
      /admin/i,
    );

    // Sebelum diberi akses, ruangnya tertutup.
    await expect(
      calon.query(api.penyediaDana.daftarPengajuan, {}),
    ).rejects.toThrow(/akses lihat saja/i);

    const beri = await admin.mutation(api.penyediaDana.ubahAkses, {
      email: "calon@pindai.test",
      aktif: true,
      alasan: "Uji akses",
    });
    expect(beri.sudahSesuai).toBe(false);
    expect((await t.run((ctx) => ctx.db.get(calonId)))?.role).toBe("dana");
    await expect(
      calon.query(api.penyediaDana.daftarPengajuan, {}),
    ).resolves.toBeDefined();

    // Idempoten: memberi akses lagi tidak mengubah apa pun.
    const ulang = await admin.mutation(api.penyediaDana.ubahAkses, {
      email: "calon@pindai.test",
      aktif: true,
    });
    expect(ulang.sudahSesuai).toBe(true);

    const daftar = await admin.query(api.penyediaDana.daftarAkses, {});
    expect(daftar.rows.map((r) => r.email)).toEqual(["calon@pindai.test"]);

    // Email dengan huruf besar tetap menemukan akun yang sama.
    const cabut = await admin.mutation(api.penyediaDana.ubahAkses, {
      email: "CALON@PINDAI.TEST",
      aktif: false,
      alasan: "Selesai uji",
    });
    expect(cabut.sudahSesuai).toBe(false);
    expect((await t.run((ctx) => ctx.db.get(calonId)))?.role).toBeUndefined();
    await expect(
      calon.query(api.penyediaDana.daftarPengajuan, {}),
    ).rejects.toThrow(/akses lihat saja/i);

    const jejak = await admin.query(api.system.getConfigAdmin, {});
    const entri = jejak.auditTerbaru.filter(
      (j) => j.aksi === "ubah_akses_penyedia_dana",
    );
    expect(entri).toHaveLength(2);
    expect(entri.some((j) => (j.detail ?? "").includes("Selesai uji"))).toBe(true);
  });

  it("menolak email tak dikenal, email tidak valid, dan akun tim (admin)", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    await siapkanPengguna(t, "admin-dua", {
      email: "admin-dua@pindai.test",
      role: "admin",
    });
    // Sesi anonim yang tetap membawa alamat email — tetap tidak diberi akses.
    await buatPengguna(t, "tamu-email", {
      email: "tamu-email@pindai.test",
      isAnonymous: true,
    });

    await expect(
      admin.mutation(api.penyediaDana.ubahAkses, {
        email: "tidak-ada@pindai.test",
        aktif: true,
      }),
    ).rejects.toThrow(/Tidak ada akun/);
    await expect(
      admin.mutation(api.penyediaDana.ubahAkses, { email: "bukan-email", aktif: true }),
    ).rejects.toThrow(/valid/i);
    await expect(
      admin.mutation(api.penyediaDana.ubahAkses, {
        email: "admin-dua@pindai.test",
        aktif: true,
      }),
    ).rejects.toThrow(/admin/i);

    // Akun tamu tidak bisa dijadikan penyedia dana meski punya email.
    await expect(
      admin.mutation(api.penyediaDana.ubahAkses, {
        email: "tamu-email@pindai.test",
        aktif: true,
      }),
    ).rejects.toThrow(/tamu/i);

    // Tidak ada akun yang berubah peran oleh percobaan gagal di atas.
    const semua = await t.run((ctx) => ctx.db.query("users").collect());
    expect(semua.filter((u) => u.role === "dana")).toHaveLength(0);
  });
});
