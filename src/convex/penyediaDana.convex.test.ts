/**
 * Tes ruang penyedia dana (lihat saja) — convex-test + vitest.
 *
 * Yang dijaga di sini:
 * - Gerbang akses di server: tamu, akun biasa, dan akun tanpa peran ditolak —
 *   termasuk untuk `titikPeminjam` dan `berkasPengajuan`. Sesi kode akses
 *   bersama (`pengamat`) boleh melihat titik lokasi, tetapi TIDAK berkas
 *   identitas pemohon; bagian itu diuji di aksesBersama.convex.test.ts.
 * - Privasi: NIK, nomor rekening, dan nomor WhatsApp tidak pernah terkirim
 *   sebagai teks. Nama lengkap pemohon, titik lokasi terakhir, serta berkas
 *   pengajuan memang ditampilkan atas keputusan admin ruang pemantau — berkas
 *   hanya diberikan lewat query terpisah saat dialog Detail dibuka.
 * - Batas baris per kategori + penanda `terpotong`.
 * - Pemberian/pencabutan akses hanya oleh admin, idempoten, dan ber-audit.
 *
 * Menjalankan: bunx vitest run src/convex/penyediaDana.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { akunDompetDana } from "./ledger";
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
    await expect(calon.query(api.penyediaDana.daftarInvestor, {})).rejects.toThrow(
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

    const daftar = await admin.query(api.penyediaDana.daftarInvestor, {});
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

describe("kelola penyedia dana (panel admin)", () => {
  it("meringkas posisi dana tiap akun dan hanya terbuka untuk admin", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const { userId: peminjamId } = await siapkanPengguna(t, "rani", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    const { sesi: penyedia, userId: penyediaId } = await siapkanPengguna(t, "Robert", {
      email: "robert@pindai.test",
      role: "dana",
    });
    const { loanId } = await seedPengajuan(t, peminjamId);

    // Gerbang: penyedia dana sendiri tidak boleh membaca panel kelola.
    await expect(
      penyedia.query(api.penyediaDana.daftarInvestor, {}),
    ).rejects.toThrow(/admin/i);
    await expect(
      penyedia.query(api.penyediaDana.rincianInvestor, { userId: penyediaId }),
    ).rejects.toThrow(/admin/i);

    await t.run(async (ctx) => {
      await ctx.db.insert("fundings", {
        loanId,
        danaId: penyediaId,
        jumlahAlokasi: 1_000_000,
        imbalHasil: 300_000,
        status: "dialokasikan",
        nomorReferensi: "FND-KELOLA-1",
      });
      await ctx.db.insert("fundings", {
        loanId,
        danaId: penyediaId,
        jumlahAlokasi: 500_000,
        imbalHasil: 150_000,
        status: "selesai",
        nomorReferensi: "FND-KELOLA-2",
      });
      await ctx.db.insert("deposits", {
        danaId: penyediaId,
        jumlah: 2_000_000,
        referensiTransfer: "TRF-1",
        status: "terverifikasi",
        nomorReferensi: "DEP-KELOLA-1",
      });
      await ctx.db.insert("deposits", {
        danaId: penyediaId,
        jumlah: 750_000,
        referensiTransfer: "TRF-2",
        status: "menunggu_verifikasi",
        nomorReferensi: "DEP-KELOLA-2",
      });
      await ctx.db.insert("withdrawals", {
        danaId: penyediaId,
        jumlah: 400_000,
        namaBank: "BCA",
        nomorRekening: "1234567890",
        status: "menunggu_proses",
        nomorReferensi: "WD-KELOLA-1",
      });
      // Saldo dompet dibaca dari ledger, bukan field cache.
      await ctx.db.insert("ledger_entries", {
        groupId: "uji-kelola-1",
        arah: "debit",
        jumlah: 2_000_000,
        akun: akunDompetDana(penyediaId),
        jenis: "deposit",
        keterangan: "setoran uji",
        aktor: penyediaId,
        waktu: Date.now(),
      });
      await ctx.db.insert("ledger_entries", {
        groupId: "uji-kelola-2",
        arah: "kredit",
        jumlah: 1_000_000,
        akun: akunDompetDana(penyediaId),
        jenis: "disbursement",
        keterangan: "alokasi uji",
        aktor: penyediaId,
        waktu: Date.now(),
      });
    });

    const daftar = await admin.query(api.penyediaDana.daftarInvestor, {});
    const baris = daftar.rows.find((r) => r.userId === penyediaId);
    expect(baris).toBeDefined();
    expect(baris?.akunBersama).toBe(false);
    expect(baris?.aksesAktif).toBe(true);
    expect(baris?.jumlahAlokasi).toBe(2);
    // Hanya alokasi berstatus "dialokasikan" yang masuk saldo berjalan.
    expect(baris?.saldoBerjalan).toBe(1_000_000);
    expect(baris?.imbalBrutoDiharapkan).toBe(300_000);
    // 5% dari Rp 300.000 dipotong untuk admin (kebijakan uji di bawah).
    expect(baris?.potonganAdminDiharapkan).toBe(15_000);
    expect(baris?.imbalBersihDiharapkan).toBe(285_000);
    expect(baris?.totalSetoran).toBe(2_000_000);
    expect(baris?.setoranMenunggu).toBe(1);
    expect(baris?.totalPenarikan).toBe(0);
    expect(baris?.penarikanMenunggu).toBe(1);
    expect(baris?.saldoDompet).toBe(1_000_000);
    expect(baris?.aktivitasTerakhir).toBeGreaterThan(0);

    expect(daftar.ringkasan).toMatchObject({
      jumlahAkun: 1,
      jumlahAkses: 1,
      jumlahPeranLegacy: 0,
      jumlahPemantau: 0,
      persenPotonganAdmin: 5,
      totalDisalurkan: 1_500_000,
      saldoBerjalan: 1_000_000,
      imbalBrutoDiharapkan: 300_000,
      potonganAdminDiharapkan: 15_000,
      imbalBersihDiharapkan: 285_000,
      totalSetoran: 2_000_000,
      saldoDompet: 1_000_000,
      setoranMenunggu: 1,
      penarikanMenunggu: 1,
    });

    const rincian = await admin.query(api.penyediaDana.rincianInvestor, {
      userId: penyediaId,
    });
    expect(rincian?.email).toBe("robert@pindai.test");
    expect(rincian?.akunBersama).toBe(false);
    expect(rincian?.saldoDompet).toBe(1_000_000);
    expect(rincian?.alokasiPinjaman).toHaveLength(2);
    expect(rincian?.alokasiPinjaman[0]?.referensi).toBe("PGD-UJI-1");
    expect(rincian?.alokasiKredit).toHaveLength(0);
    // Riwayat selalu diurutkan dari yang terbaru.
    expect(rincian?.setoran.map((s) => s.referensi)).toEqual([
      "DEP-KELOLA-2",
      "DEP-KELOLA-1",
    ]);
    expect(rincian?.penarikan).toHaveLength(1);
  });

  it("menandai pemantau kode bersama terpisah dari penyedia dana beremail", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const { userId: tamuId } = await buatPengguna(t, "tamu", { isAnonymous: true });
    await t.run((ctx) => ctx.db.patch(tamuId, { role: "pengamat", aksesBersamaVersi: 1 }));
    await t.run((ctx) =>
      ctx.db.insert("aksesBersama", {
        slot: "global",
        kodeHash: "a".repeat(64),
        aktif: true,
        versi: 1,
        diterbitkanPada: Date.now(),
        diperbaruiPada: Date.now(),
        gagalTerakhir: [],
      }),
    );

    const daftar = await admin.query(api.penyediaDana.daftarInvestor, {});
    const baris = daftar.rows.find((r) => r.userId === tamuId);
    expect(baris?.akunBersama).toBe(true);
    expect(baris?.aksesAktif).toBe(true);
    expect(baris?.email).toBeNull();
    expect(daftar.ringkasan).toMatchObject({
      jumlahAkun: 1,
      jumlahAkses: 1,
      jumlahPeranLegacy: 0,
      jumlahPemantau: 1,
      pemantauAktif: 1,
    });
  });

  it("menampilkan akun berperan lama (pendana) sebagai belum berakses, lalu menormalkannya", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const { userId: peminjamId } = await siapkanPengguna(t, "rani", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    // Akun warisan: peran tersimpan "pendana" (bukan `dana`) seperti data lama.
    const { userId: legacyId } = await buatPengguna(t, "Penyedia Lama", {
      email: "lama@pindai.test",
      emailVerificationTime: 1_700_000_000_000,
    });
    await t.run((ctx) => ctx.db.patch(legacyId, { role: "pendana" as never }));
    const { loanId } = await seedPengajuan(t, peminjamId);
    await t.run((ctx) =>
      ctx.db.insert("fundings", {
        loanId,
        danaId: legacyId,
        jumlahAlokasi: 2_000_000,
        imbalHasil: 600_000,
        status: "dialokasikan",
        nomorReferensi: "FND-WARISAN-1",
      }),
    );

    const daftar = await admin.query(api.penyediaDana.daftarInvestor, {});
    const baris = daftar.rows.find((r) => r.userId === legacyId);
    expect(baris?.peran).toBe("pendana");
    expect(baris?.peranLegacy).toBe(true);
    // Peran lama tidak dikenali gerbang ruang → belum berakses, walau dananya nyata.
    expect(baris?.aksesAktif).toBe(false);
    expect(baris?.saldoBerjalan).toBe(2_000_000);
    expect(daftar.ringkasan).toMatchObject({
      jumlahAkun: 1,
      jumlahAkses: 0,
      jumlahPeranLegacy: 1,
      saldoBerjalan: 2_000_000,
    });

    // Admin menormalkan peran lewat tombol Beri akses (ubahAkses).
    await admin.mutation(api.penyediaDana.ubahAkses, {
      email: "lama@pindai.test",
      aktif: true,
      alasan: "Normalisasi akun warisan",
    });
    expect((await t.run((ctx) => ctx.db.get(legacyId)))?.role).toBe("dana");
    const sesudah = await admin.query(api.penyediaDana.daftarInvestor, {});
    const barisSesudah = sesudah.rows.find((r) => r.userId === legacyId);
    expect(barisSesudah?.peranLegacy).toBe(false);
    expect(barisSesudah?.aksesAktif).toBe(true);
    expect(sesudah.ringkasan).toMatchObject({ jumlahAkses: 1, jumlahPeranLegacy: 0 });
  });

  it("memisahkan keuntungan yang sudah dibayar (cap settlement) dari yang masih berjalan", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const { userId: peminjamId } = await siapkanPengguna(t, "rani", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    const { userId: penyediaId } = await siapkanPengguna(t, "Robert", {
      email: "robert@pindai.test",
      role: "dana",
    });
    const { loanId } = await seedPengajuan(t, peminjamId);

    await t.run(async (ctx) => {
      // 1. Sudah lunas SESUDAH kebijakan potongan: ada cap settlement.
      await ctx.db.insert("fundings", {
        loanId,
        danaId: penyediaId,
        jumlahAlokasi: 1_000_000,
        imbalHasil: 300_000,
        status: "selesai",
        nomorReferensi: "FND-BAGI-1",
        potonganAdmin: 15_000,
        imbalHasilNet: 285_000,
        diselesaikanPada: 1_800_000_000_000,
      });
      // 2. Lunas SEBELUM kebijakan ada: tanpa cap, dibayar penuh (bukan dikarang mundur).
      await ctx.db.insert("fundings", {
        loanId,
        danaId: penyediaId,
        jumlahAlokasi: 500_000,
        imbalHasil: 150_000,
        status: "selesai",
        nomorReferensi: "FND-BAGI-2",
      });
      // 3. Masih berjalan: angkanya perkiraan dengan kebijakan sekarang (5%).
      await ctx.db.insert("fundings", {
        loanId,
        danaId: penyediaId,
        jumlahAlokasi: 2_000_000,
        imbalHasil: 600_000,
        status: "dialokasikan",
        nomorReferensi: "FND-BAGI-3",
      });
    });

    const daftar = await admin.query(api.penyediaDana.daftarInvestor, {});
    const baris = daftar.rows.find((r) => r.userId === penyediaId);
    expect(baris?.jumlahAlokasi).toBe(3);
    expect(baris?.jumlahLunas).toBe(2);
    expect(baris?.jumlahAktif).toBe(1);
    expect(baris?.totalDisalurkan).toBe(3_500_000);
    expect(baris?.saldoBerjalan).toBe(2_000_000);
    // Sudah dibayar: bruto 450.000, potongan 15.000 (hanya alokasi bercap), bersih 435.000.
    expect(baris?.imbalBrutoTerealisasi).toBe(450_000);
    expect(baris?.potonganAdminTerealisasi).toBe(15_000);
    expect(baris?.imbalBersihTerealisasi).toBe(435_000);
    // Masih berjalan: 5% dari 600.000.
    expect(baris?.imbalBrutoDiharapkan).toBe(600_000);
    expect(baris?.potonganAdminDiharapkan).toBe(30_000);
    expect(baris?.imbalBersihDiharapkan).toBe(570_000);
    expect(daftar.ringkasan).toMatchObject({
      persenPotonganAdmin: 5,
      imbalBrutoTerealisasi: 450_000,
      potonganAdminTerealisasi: 15_000,
      imbalBersihTerealisasi: 435_000,
      imbalBersihDiharapkan: 570_000,
    });

    const rincian = await admin.query(api.penyediaDana.rincianInvestor, {
      userId: penyediaId,
    });
    expect(rincian?.ringkasKeuntungan).toMatchObject({
      persenPotonganAdmin: 5,
      pokok: 3_500_000,
      saldoBerjalan: 2_000_000,
      brutoTerealisasi: 450_000,
      potonganTerealisasi: 15_000,
      bersihTerealisasi: 435_000,
      bersihDiharapkan: 570_000,
    });
    const perkiraan = rincian?.alokasiPinjaman.filter((a) => a.perkiraan) ?? [];
    expect(perkiraan).toHaveLength(1);
    expect(perkiraan[0]?.referensi).toBe("PGD-UJI-1");
    expect(perkiraan[0]?.potonganAdmin).toBe(30_000);
    expect(perkiraan[0]?.imbalBersih).toBe(570_000);
    const bercap = rincian?.alokasiPinjaman.find((a) => !a.perkiraan && a.potonganAdmin === 15_000);
    expect(bercap?.imbalBersih).toBe(285_000);
    // Alokasi lunas tanpa cap tetap dianggap dibayar penuh.
    const tanpaCap = rincian?.alokasiPinjaman.find(
      (a) => !a.perkiraan && a.imbalHasil === 150_000,
    );
    expect(tanpaCap?.potonganAdmin).toBe(0);
    expect(tanpaCap?.imbalBersih).toBe(150_000);
  });

  it("menyembunyikan akun peran lama tanpa jejak dana dan tanpa email", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const { userId: kosongId } = await buatPengguna(t, "Tanpa Jejak");
    await t.run((ctx) => ctx.db.patch(kosongId, { role: "pendana" as never }));

    const daftar = await admin.query(api.penyediaDana.daftarInvestor, {});
    expect(daftar.rows.some((r) => r.userId === kosongId)).toBe(false);
    expect(daftar.ringkasan).toMatchObject({
      jumlahAkun: 0,
      jumlahAkses: 0,
      jumlahPeranLegacy: 0,
      jumlahWarisanTanpaJejak: 1,
    });
  });
});

describe("lokasi & berkas peminjam di ruang penyedia dana", () => {
  it("titikPeminjam menolak akun tanpa akses dan hanya berisi titik yang dilaporkan", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await siapkanPengguna(t, "rani", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    const { sesi: dana } = await siapkanPengguna(t, "penyedia", {
      email: "penyedia@pindai.test",
      role: "dana",
    });
    await seedPengajuan(t, userId);

    // Sebelum ada titik: peminjam tetap muncul sebagai "belum ada titik".
    const kosong = await dana.query(api.penyediaDana.titikPeminjam, {});
    expect(kosong.rows).toHaveLength(0);
    expect(kosong.tanpaTitik).toBe(1);

    await t.run(async (ctx) => {
      await ctx.db.insert("lokasiStatus", {
        userId,
        lat: -6.2,
        lng: 106.816666,
        akurasi: 24,
        waktu: Date.now(),
        sumber: "web",
      });
    });

    const hasil = await dana.query(api.penyediaDana.titikPeminjam, {});
    expect(hasil.rows).toHaveLength(1);
    expect(hasil.rows[0].namaLengkap).toBe(NAMA_PEMOHON);
    expect(hasil.rows[0].posisi.lat).toBeCloseTo(-6.2);
    expect(hasil.rows[0].posisi.sumber).toBe("web");
    expect(hasil.rows[0].kodePeminjam).toBe(KODE_PEMINJAM);
    // Identitas sensitif tidak ikut pada payload peta.
    const mentah = JSON.stringify(hasil);
    for (const rahasia of Object.values(RAHASIA)) {
      expect(mentah).not.toContain(rahasia);
    }

    // Gerbang server: akun tanpa akses lihat-saja ditolak.
    const { sesi: peminjam } = await siapkanPengguna(t, "rani-dua", {
      email: "rani-dua@pindai.test",
      role: "peminjam",
    });
    await expect(
      peminjam.query(api.penyediaDana.titikPeminjam, {}),
    ).rejects.toThrow(/akses lihat saja/i);
  });

  it("baris daftar membawa lokasi terakhir dari status, jejak, atau titik pengajuan", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await siapkanPengguna(t, "rani", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    const { sesi: dana } = await siapkanPengguna(t, "penyedia", {
      email: "penyedia@pindai.test",
      role: "dana",
    });
    await seedPengajuan(t, userId);

    // Tanpa heartbeat: pinjaman jatuh ke titik GPS saat pengajuan dikirim.
    await t.run((ctx) =>
      ctx.db.insert("loans", {
        userId,
        pokokPinjaman: 1_000_000,
        tujuan: "Modal usaha",
        namaLengkap: NAMA_PEMOHON,
        nomorRekening: RAHASIA.nomorRekening,
        status: "diajukan",
        nomorReferensi: "PGD-LOKASI-1",
        tenorHari: 30,
        lokasiAjukan: { lat: -6.9, lng: 107.6, akurasi: 30, waktu: 1_700_000_000_000 },
      }),
    );
    const awal = await dana.query(api.penyediaDana.daftarPengajuan, {});
    const barisAwal = awal.pinjaman.find((b) => b.nomorReferensi === "PGD-LOKASI-1");
    expect(barisAwal?.lokasi?.sumber).toBe("pengajuan");
    expect(barisAwal?.lokasi?.lat).toBeCloseTo(-6.9);

    // Setelah perangkat mengirim titik: status terkini menang atas titik pengajuan.
    await t.run((ctx) =>
      ctx.db.insert("lokasiStatus", {
        userId,
        lat: -6.175392,
        lng: 106.827153,
        akurasi: 12,
        waktu: 1_800_000_000_000,
        sumber: "aplikasi",
        tanda: ["koordinat_berulang"],
      }),
    );
    const akhir = await dana.query(api.penyediaDana.daftarPengajuan, {});
    const barisAkhir = akhir.pinjaman.find((b) => b.nomorReferensi === "PGD-LOKASI-1");
    expect(barisAkhir?.lokasi?.sumber).toBe("aplikasi");
    expect(barisAkhir?.lokasi?.tanda).toEqual(["koordinat_berulang"]);
    // Gadai & kredit ikut memakai titik yang sama (satu peminjam).
    expect(akhir.gadai[0]?.lokasi?.lat).toBeCloseTo(-6.175392);
    expect(akhir.kredit[0]?.lokasi?.lat).toBeCloseTo(-6.175392);
  });

  it("berkasPengajuan hanya untuk sesi ber-akses dan memuat URL berkas tersimpan", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await siapkanPengguna(t, "rani", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    const { sesi: dana } = await siapkanPengguna(t, "penyedia", {
      email: "penyedia@pindai.test",
      role: "dana",
    });
    const { loanId, pawnId, kreditId } = await seedPengajuan(t, userId);

    const [ktp, selfie, fotoBarang] = await t.run(async (ctx) => [
      await ctx.storage.store(new Blob(["ktp"])),
      await ctx.storage.store(new Blob(["selfie"])),
      await ctx.storage.store(new Blob(["foto barang"])),
    ]);
    await t.run((ctx) =>
      ctx.db.patch(loanId, {
        dokKtpId: ktp,
        dokSelfieKtpId: selfie,
        tandaTanganPeminjam: "data:image/png;base64,AAAA",
        tandaTanganPada: 1_700_000_000_000,
      }),
    );
    await t.run((ctx) => ctx.db.patch(pawnId, { fotoBarangId: fotoBarang }));

    const pinjaman = await dana.query(api.penyediaDana.berkasPengajuan, {
      jenis: "pinjaman",
      id: loanId,
    });
    expect(pinjaman?.berkas.map((b) => b.label)).toEqual(["KTP", "Selfie dengan KTP"]);
    expect(pinjaman?.berkas.every((b) => b.url.startsWith("http"))).toBe(true);
    expect(pinjaman?.catatan).toBeNull();
    expect(pinjaman?.tandaTangan).toBe("data:image/png;base64,AAAA");
    expect(pinjaman?.tandaTanganPada).toBe(1_700_000_000_000);

    const gadai = await dana.query(api.penyediaDana.berkasPengajuan, {
      jenis: "gadai",
      id: pawnId,
    });
    expect(gadai?.berkas.map((b) => b.label)).toEqual(["Foto barang"]);

    // Kredit barang memang tidak menyimpan berkas gambar — dijelaskan, bukan dikosongkan diam-diam.
    const kredit = await dana.query(api.penyediaDana.berkasPengajuan, {
      jenis: "kredit",
      id: kreditId,
    });
    expect(kredit?.berkas).toHaveLength(0);
    expect(kredit?.catatan).toMatch(/tidak menyimpan berkas/i);

    // Tanpa berkas tersimpan: catatan jelas, bukan galat.
    const kosong = await t.run((ctx) =>
      ctx.db.insert("loans", {
        userId,
        pokokPinjaman: 500_000,
        tujuan: "Usaha",
        namaLengkap: NAMA_PEMOHON,
        nomorRekening: RAHASIA.nomorRekening,
        status: "diajukan",
        nomorReferensi: "PGD-BERKAS-KOSONG",
        tenorHari: 30,
      }),
    );
    const tanpaBerkas = await dana.query(api.penyediaDana.berkasPengajuan, {
      jenis: "pinjaman",
      id: kosong,
    });
    expect(tanpaBerkas?.berkas).toHaveLength(0);
    expect(tanpaBerkas?.catatan).toMatch(/belum ada berkas/i);

    // Id tidak valid & id dari tabel lain tidak pernah membocorkan dokumen.
    expect(
      await dana.query(api.penyediaDana.berkasPengajuan, {
        jenis: "pinjaman",
        id: "bukan-id",
      }),
    ).toBeNull();
    expect(
      await dana.query(api.penyediaDana.berkasPengajuan, { jenis: "gadai", id: loanId }),
    ).toBeNull();

    // Gerbang server: akun biasa tidak boleh meminta berkas sama sekali.
    const { sesi: peminjam } = await siapkanPengguna(t, "rani-dua", {
      email: "rani-dua@pindai.test",
      role: "peminjam",
    });
    await expect(
      peminjam.query(api.penyediaDana.berkasPengajuan, { jenis: "pinjaman", id: loanId }),
    ).rejects.toThrow(/akses lihat saja/i);
  });
});
