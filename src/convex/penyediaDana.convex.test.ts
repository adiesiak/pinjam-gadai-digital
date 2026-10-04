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
import { kunciNamaPendana, pinjamanMilikPendana } from "./pendanaKepemilikan";
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
      // Pengajuan baru selalu menyimpan jejak pengajuan asli (lihat
      // `createLoanApplication`), jadi seed disamakan dengan bentuk nyata itu.
      pokokDiajukan: 2_500_000,
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

describe("aturan kepemilikan pinjaman (murni)", () => {
  const ROBERT = "id_robert" as Id<"users">;
  const ASEP = "id_asep" as Id<"users">;
  const kunciRobert = kunciNamaPendana({ name: "Robert", email: "robert@pindai.test" });

  it("id pendana menang atas nama tampil, termasuk saat nama cocok", () => {
    // Sudah dipindah ke Asep, tetapi nama lamanya masih tersimpan.
    expect(
      pinjamanMilikPendana({ pendanaId: ASEP, pendanaNama: "Robert" }, ROBERT, kunciRobert),
    ).toBe(false);
    expect(
      pinjamanMilikPendana({ pendanaId: ASEP, pendanaNama: "Robert" }, ASEP, kunciRobert),
    ).toBe(true);
  });

  it("tanpa id pendana, nama tampil dicocokkan persis dengan nama atau email akun", () => {
    expect(pinjamanMilikPendana({ pendanaNama: "Robert" }, ROBERT, kunciRobert)).toBe(true);
    expect(pinjamanMilikPendana({ pendanaNama: "robert@pindai.test" }, ROBERT, kunciRobert)).toBe(
      true,
    );
    // Bukan pencocokan longgar: beda huruf besar/kecil dan spasi tidak lolos.
    expect(pinjamanMilikPendana({ pendanaNama: "robert" }, ROBERT, kunciRobert)).toBe(false);
    expect(pinjamanMilikPendana({ pendanaNama: " Robert " }, ROBERT, kunciRobert)).toBe(false);
    expect(pinjamanMilikPendana({ pendanaNama: "Asep" }, ROBERT, kunciRobert)).toBe(false);
  });

  it("pinjaman tanpa pemilik tidak diklaim siapa pun", () => {
    expect(pinjamanMilikPendana({}, ROBERT, kunciRobert)).toBe(false);
    expect(pinjamanMilikPendana({ pendanaNama: undefined }, ROBERT, kunciRobert)).toBe(false);
  });


  /** Pinjaman lunas milik satu penyedia dana — dasar kewajiban transfer. */
  async function seedPinjamanLunas(
    t: KonteksUji,
    opts: { status?: "lunas" | "didanai"; pendana?: boolean } = {},
  ) {
    const { userId } = await siapkanPengguna(t, "rani", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    const penyedia = await siapkanPengguna(t, "penyedia", {
      email: "penyedia@pindai.test",
      role: "dana",
    });
    const loanId = await t.run((ctx) =>
      ctx.db.insert("loans", {
        userId,
        pokokPinjaman: 1_000_000,
        tujuan: "Modal usaha",
        namaLengkap: NAMA_PEMOHON,
        nomorRekening: RAHASIA.nomorRekening,
        status: opts.status ?? "lunas",
        nomorReferensi: "PGD-TRANSFER-1",
        tenorHari: 30,
        didanaiPada: 1_700_000_000_000,
        lunasPada: 1_700_100_000_000,
        ...(opts.pendana === false
          ? {}
          : { pendanaId: penyedia.userId, pendanaNama: "Penyedia Dana" }),
      }),
    );
    return { loanId, penyedia, userId };
  }

  it("memverifikasi batas migrasi fundings yang dipindahkan ke dana baru", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const { loanId, penyedia } = await seedPinjamanLunas(t);

    // 1) Admin mengubah pendana pinjaman: baris-warisan `fundings` dari dana
    //    lama dipindahkan ke dana baru, baris lama `dibatalkan`.
    const sebelumnya = await t.run((ctx) => ctx.db.query("fundings").collect());
    const hasil = await admin.mutation(api.penyediaDana.ubahDataPinjaman, {
      loanId,
      pendanaEmail: penyedia.email,
      alasan: "Pindah pendana dari admin ke admin",
    });
    expect(hasil.perubahan.some((p) => /pendana/i.test(p))).toBe(true);

    const sesudah = await t.run((ctx) => ctx.db.query("fundings").collect());
    const loanPendingTransfer = (await t.run((ctx) => ctx.db.get(loanId)))?.pendanaId;
    const yangBerusahaDipindahkan = sebelumnya.filter(
      (f) => f.danaId === loanPendingTransfer,
    );

    // Tidak ada `fundings` yang masih `dialokasikan` dari pinjaman ini.
    expect(sesudah.some((f) => f.loanId === loanId && f.status === "dialokasikan")).toBe(false);
    // Baris yang dipindahkan ditandai `dibatalkan`, bukan `dialokasikan_deduped`.
    expect(sesudah.some((f) => f.loanId === loanId && f.status === "dibatalkan")).toBe(true);
    expect(
      sesudah.some(
        (f) => f.loanId === loanId && f.danaId !== (await t.run((ctx) => ctx.db.get(loanId)))?.pendanaId,
      ),
    ).toBe(false);

    // 2) Rekap tetap eksis & saldo dompet tidak berubah.
    const rincian = await admin.query(api.penyediaDana.rincianInvestor, {
      userId: penyedia.userId,
    });
    expect(rincian?.pinjaman.some((p) => p.referensi === "PGD-TRANSFER-1")).toBe(true);
    expect(rincian?.saldoDompet).toBeDefined();

    // 3) `batalkanTransferPendana` masih membuang catatan transfer lama.
    await admin.mutation(api.penyediaDana.catatTransferPendana, {
      loanId,
      metode: "e_wallet",
    });
    const ditandai = await admin.mutation(api.penyediaDana.batalkanTransferPendana, {
      loanId,
      alasan: "Debug migrasi boundary",
    });
    expect(ditandai.jumlahDibatalkan).toBe(1);
    const baris = await t.run((ctx) =>
      ctx.db.query("transferPendana").withIndex("by_loan", (q) => q.eq("loanId", loanId)).collect(),
    );

    expect(baris.filter((b) => b.status === "dicatat")).toHaveLength(0);
    expect(baris.filter((b) => b.status === "dibatalkan")).toHaveLength(1);
  });

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
      pokokDiajukan: 2_500_000,
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

  it("memisahkan pengajuan awal dari persetujuan sebagian tanpa mengubah posisi dana", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await siapkanPengguna(t, "rani", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    const { sesi: dana } = await siapkanPengguna(t, "penyedia", {
      email: "dana@pindai.test",
      role: "dana",
    });
    const { loanId } = await seedPengajuan(t, userId);
    await t.run((ctx) => ctx.db.patch(loanId, {
      pokokDiajukan: 2_500_000,
      pokokPinjaman: 1_500_000,
      status: "disetujui",
    }));
    const hasil = await dana.query(api.penyediaDana.daftarPengajuan, {});
    expect(hasil.pinjaman[0]).toMatchObject({
      pokokDiajukan: 2_500_000,
      pokokPinjaman: 1_500_000,
      status: "disetujui",
      didanaiPada: null,
      pendana: null,
    });
    expect(hasil.ringkasan.nilaiPinjaman).toBe(1_500_000);
    expect(hasil.rekapPendana).toEqual([]);
    expect(JSON.stringify(hasil)).not.toContain(RAHASIA.nik);
    expect(await t.run((ctx) => ctx.db.query("ledger_entries").collect())).toEqual([]);
  });

  it("memakai pokok tercatat sebagai pengajuan pada dokumen lama", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await siapkanPengguna(t, "rani-lama", {
      email: "rani-lama@pindai.test",
      role: "peminjam",
    });
    const { sesi: dana } = await siapkanPengguna(t, "penyedia-lama", {
      email: "penyedia-lama@pindai.test",
      role: "dana",
    });
    const { sesi: admin } = await siapkanPengguna(t, "admin-lama", {
      email: "admin-lama@pindai.test",
      role: "admin",
    });
    // Dokumen warisan: `pokokDiajukan` belum ada sama sekali.
    const loanId = await t.run((ctx) =>
      ctx.db.insert("loans", {
        userId,
        pokokPinjaman: 900_000,
        tujuan: "Data warisan",
        namaLengkap: NAMA_PEMOHON,
        nomorRekening: RAHASIA.nomorRekening,
        status: "diajukan",
        nomorReferensi: "PGD-WARISAN-1",
        tenorHari: 30,
      }),
    );

    const hasil = await dana.query(api.penyediaDana.daftarPengajuan, {});
    expect(hasil.pinjaman[0]).toMatchObject({
      pokokPinjaman: 900_000,
      pokokDiajukan: 900_000,
    });

    // Batas "tidak melebihi pengajuan" tetap ditegakkan dari pokok tercatat.
    await expect(
      admin.mutation(api.penyediaDana.ubahDataPinjaman, {
        loanId,
        alasan: "Coba melebihi pengajuan warisan",
        pokokDisetujui: 1_000_000,
      }),
    ).rejects.toThrow(/melebihi/i);
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

  it("Super Admin memindahkan pendana pinjaman tanpa menyentuh ledger", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const { userId: peminjamId } = await siapkanPengguna(t, "rani", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    const { userId: robertId } = await siapkanPengguna(t, "Robert", {
      email: "robert@pindai.test",
      role: "dana",
    });
    const { sesi: asep, userId: asepId } = await siapkanPengguna(t, "Asep", {
      email: "asep@pindai.test",
      role: "dana",
    });
    const { loanId } = await seedPengajuan(t, peminjamId);
    await t.run((ctx) =>
      ctx.db.patch(loanId, {
        status: "didanai",
        pokokDiajukan: 2_500_000,
        pokokPinjaman: 2_500_000,
        pendanaId: robertId,
        pendanaNama: "Robert",
        didanaiPada: Date.now(),
      }),
    );

    // Penyedia dana sendiri tidak boleh mengubah catatan — gerbangnya di server.
    await expect(
      asep.mutation(api.penyediaDana.ubahDataPinjaman, {
        loanId,
        pendanaEmail: "asep@pindai.test",
        alasan: "Pindah pendana",
      }),
    ).rejects.toThrow(/Super Admin/i);

    const hasil = await admin.mutation(api.penyediaDana.ubahDataPinjaman, {
      loanId,
      pendanaEmail: "asep@pindai.test",
      alasan: "Salah pilih pendana saat pencatatan",
    });
    expect(hasil.perubahan).toEqual(["pendana → Asep"]);
    const pinjaman = await t.run((ctx) => ctx.db.get(loanId));
    expect(pinjaman?.pendanaId).toBe(asepId);
    expect(pinjaman?.pendanaNama).toBe("Asep");
    // Pokok, status, dan tanggal pendanaan tidak ikut berubah.
    expect(pinjaman?.pokokPinjaman).toBe(2_500_000);
    expect(pinjaman?.status).toBe("didanai");
    // Murni koreksi catatan: tidak ada saldo/ledger maupun dompet yang tersentuh.
    expect(await t.run((ctx) => ctx.db.query("ledger_entries").collect())).toEqual([]);

    // Rekap dan baris daftar langsung mengikuti pendana baru.
    const daftar = await asep.query(api.penyediaDana.daftarPengajuan, {});
    expect(daftar.pinjaman[0]?.pendana).toBe("Asep");

    // Alasan wajib, dan pinjaman lunas tidak dapat diubah lagi.
    await expect(
      admin.mutation(api.penyediaDana.ubahDataPinjaman, {
        loanId,
        pendanaEmail: "robert@pindai.test",
        alasan: "ok",
      }),
    ).rejects.toThrow(/5/);
    await t.run((ctx) => ctx.db.patch(loanId, { status: "lunas" }));
    await expect(
      admin.mutation(api.penyediaDana.ubahDataPinjaman, {
        loanId,
        pendanaEmail: "robert@pindai.test",
        alasan: "Kembalikan ke Robert setelah lunas",
      }),
    ).rejects.toThrow(/lunas/i);
  });

  it("menolak akun tanpa peran dana dan melepas pendana hanya bila belum tersalurkan", async () => {
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
    const { userId: biasaId } = await siapkanPengguna(t, "Biasa", {
      email: "biasa@pindai.test",
      role: "peminjam",
    });
    const { loanId } = await seedPengajuan(t, peminjamId);

    // Akun tanpa akses penyedia dana ditolak sebagai pendana.
    await expect(
      admin.mutation(api.penyediaDana.ubahDataPinjaman, {
        loanId,
        pendanaEmail: "biasa@pindai.test",
        alasan: "Coba akun biasa",
      }),
    ).rejects.toThrow(/penyedia dana/i);
    expect((await t.run((ctx) => ctx.db.get(loanId)))?.pendanaId).toBeUndefined();
    expect(biasaId).toBeDefined();

    // Belum tersalurkan → pendana boleh dilepas lagi.
    await admin.mutation(api.penyediaDana.ubahDataPinjaman, {
      loanId,
      pendanaEmail: "robert@pindai.test",
      alasan: "Tandai pendana Robert",
    });
    const lepas = await admin.mutation(api.penyediaDana.ubahDataPinjaman, {
      loanId,
      pendanaEmail: null,
      alasan: "Robert batal mendanai",
    });
    expect(lepas.perubahan[0]).toMatch(/lepas/i);
    expect((await t.run((ctx) => ctx.db.get(loanId)))?.pendanaId).toBeUndefined();

    // Sudah tersalurkan → pelepasan ditolak supaya rekap tidak kehilangan pemilik dana.
    await t.run((ctx) =>
      ctx.db.patch(loanId, {
        status: "didanai",
        pendanaId: penyediaId,
        pendanaNama: "Robert",
        didanaiPada: Date.now(),
      }),
    );
    await expect(
      admin.mutation(api.penyediaDana.ubahDataPinjaman, {
        loanId,
        pendanaEmail: null,
        alasan: "Lepas setelah tersalurkan",
      }),
    ).rejects.toThrow(/tidak dapat dilepas|tersalurkan/i);
  });

  it("mengubah tujuan, tenor, dan nominal disetujui serta mencatat audit trail", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const { userId } = await siapkanPengguna(t, "rani", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    // Pokok 2,5jt · tenor 30 hari · masih `diajukan`.
    const { loanId } = await seedPengajuan(t, userId);

    // Menyetujui lebih besar daripada pengajuan bukan penilaian kredit — ditolak.
    await expect(
      admin.mutation(api.penyediaDana.ubahDataPinjaman, {
        loanId,
        alasan: "Naikkan pokok di atas pengajuan",
        pokokDisetujui: 3_000_000,
      }),
    ).rejects.toThrow(/melebihi/i);

    const hasil = await admin.mutation(api.penyediaDana.ubahDataPinjaman, {
      loanId,
      alasan: "Setujui sebagian dan rapikan tenor",
      tujuan: "Modal usaha warung sembako",
      tenorHari: 45,
      pokokDisetujui: 1_500_000,
    });
    expect(hasil.perubahan).toEqual(
      expect.arrayContaining(["tujuan diperbarui", "tenor 45 hari", "pokok 1500000"]),
    );
    const pinjaman = await t.run((ctx) => ctx.db.get(loanId));
    expect(pinjaman?.pokokPinjaman).toBe(1_500_000);
    // Jejak pengajuan asli tidak ikut berubah.
    expect(pinjaman?.pokokDiajukan).toBe(2_500_000);
    expect(pinjaman?.tenorHari).toBe(45);
    expect(pinjaman?.tujuan).toBe("Modal usaha warung sembako");

    // Nominal terkunci setelah dana ditandai tersalurkan.
    await t.run((ctx) =>
      ctx.db.patch(loanId, { status: "didanai", didanaiPada: Date.now() }),
    );
    await expect(
      admin.mutation(api.penyediaDana.ubahDataPinjaman, {
        loanId,
        alasan: "Ubah nominal setelah dana tersalurkan",
        pokokDisetujui: 1_000_000,
      }),
    ).rejects.toThrow(/sudah tersalurkan/i);

    // Perubahan yang benar-benar tersimpan masuk audit trail beserta alasannya.
    const jejak = await admin.query(api.system.getConfigAdmin, {});
    const entri = jejak.auditTerbaru.filter((j) => j.aksi === "ubah_data_pinjaman");
    expect(entri).toHaveLength(1);
    expect(entri[0].detail ?? "").toContain("rapikan tenor");

    // Tanpa perubahan apa pun: tidak ada baris audit tambahan, aksi idempoten.
    const kosong = await admin.mutation(api.penyediaDana.ubahDataPinjaman, {
      loanId,
      alasan: "Kirim ulang tanpa perubahan",
      tujuan: "Modal usaha warung sembako",
      tenorHari: 45,
    });
    expect(kosong.perubahan).toEqual([]);
    const sesudah = await admin.query(api.system.getConfigAdmin, {});
    expect(sesudah.auditTerbaru.filter((j) => j.aksi === "ubah_data_pinjaman")).toHaveLength(1);
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
      // Model baru: satu pinjaman = satu pendana. Pinjaman dari seedPengajuan
      // dinormalkan menjadi sedang berjalan milik Robert, dan satu pinjaman
      // lunas ditambahkan sebagai posisi yang sudah kembali.
      await ctx.db.patch(loanId, {
        status: "didanai",
        pokokPinjaman: 1_000_000,
        pendanaId: penyediaId,
        pendanaNama: "Robert",
        didanaiPada: Date.now(),
      });
      await ctx.db.insert("loans", {
        userId: peminjamId,
        pokokPinjaman: 500_000,
        tujuan: "Modal usaha",
        namaLengkap: NAMA_PEMOHON,
        nomorRekening: RAHASIA.nomorRekening,
        status: "lunas",
        nomorReferensi: "PGD-KELOLA-LUNAS",
        tenorHari: 30,
        didanaiPada: Date.now() - 1_000,
        lunasPada: Date.now(),
        pendanaId: penyediaId,
        pendanaNama: "Robert",
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
    expect(baris?.jumlahPinjaman).toBe(2);
    expect(baris?.jumlahAktif).toBe(1);
    expect(baris?.jumlahLunas).toBe(1);
    // Hanya pinjaman berstatus "didanai" yang masuk saldo berjalan.
    expect(baris?.saldoBerjalan).toBe(1_000_000);
    expect(baris?.totalDisalurkan).toBe(1_500_000);
    // Bunga 30%: 300.000 + 150.000.
    expect(baris?.totalBunga).toBe(450_000);
    // Admin 5% dari total kewajiban: 65.000 + 32.500.
    expect(baris?.keuntunganAdmin).toBe(97_500);
    expect(baris?.keuntunganPendana).toBe(352_500);
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
      persenBunga: 30,
      totalDisalurkan: 1_500_000,
      saldoBerjalan: 1_000_000,
      totalBunga: 450_000,
      keuntunganAdmin: 97_500,
      keuntunganPendana: 352_500,
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
    expect(rincian?.pinjaman).toHaveLength(2);
    expect(rincian?.pinjaman.some((p) => p.referensi === "PGD-UJI-1")).toBe(true);
    expect(rincian?.ringkasKeuntungan).toMatchObject({
      persenPotonganAdmin: 5,
      persenBunga: 30,
      pokok: 1_500_000,
      saldoBerjalan: 1_000_000,
      totalBunga: 450_000,
      keuntunganAdmin: 97_500,
      keuntunganPendana: 352_500,
    });
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
      ctx.db.patch(loanId, {
        status: "didanai",
        pokokPinjaman: 2_000_000,
        pendanaId: legacyId,
        didanaiPada: Date.now(),
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

  it("menghitung bunga, potongan admin, dan keuntungan pendana dari model pinjaman tunggal", async () => {
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
      // 1. Pinjaman berjalan: pokok 2jt → bunga 600rb, kewajiban 2,6jt.
      await ctx.db.patch(loanId, {
        status: "didanai",
        pokokPinjaman: 2_000_000,
        pendanaId: penyediaId,
        pendanaNama: "Robert",
        didanaiPada: Date.now(),
      });
      // 2. Pinjaman lunas: pokok 1jt → bunga 300rb.
      await ctx.db.insert("loans", {
        userId: peminjamId,
        pokokPinjaman: 1_000_000,
        tujuan: "Renovasi rumah",
        namaLengkap: NAMA_PEMOHON,
        nomorRekening: RAHASIA.nomorRekening,
        status: "lunas",
        nomorReferensi: "PGD-BAGI-LUNAS",
        tenorHari: 30,
        didanaiPada: Date.now() - 5_000,
        lunasPada: Date.now(),
        pendanaId: penyediaId,
        pendanaNama: "Robert",
      });
    });

    const daftar = await admin.query(api.penyediaDana.daftarInvestor, {});
    const baris = daftar.rows.find((r) => r.userId === penyediaId);
    expect(baris?.jumlahPinjaman).toBe(2);
    expect(baris?.jumlahAktif).toBe(1);
    expect(baris?.jumlahLunas).toBe(1);
    expect(baris?.totalDisalurkan).toBe(3_000_000);
    expect(baris?.saldoBerjalan).toBe(2_000_000);
    // Bunga 30% dari pokok: 600.000 + 300.000.
    expect(baris?.totalBunga).toBe(900_000);
    // Admin 5% dari total kewajiban: 130.000 + 65.000.
    expect(baris?.keuntunganAdmin).toBe(195_000);
    // Keuntungan bersih pendana = kewajiban − potongan − pokok.
    expect(baris?.keuntunganPendana).toBe(705_000);
    expect(daftar.ringkasan).toMatchObject({
      persenPotonganAdmin: 5,
      persenBunga: 30,
      totalBunga: 900_000,
      keuntunganAdmin: 195_000,
      keuntunganPendana: 705_000,
    });

    const rincian = await admin.query(api.penyediaDana.rincianInvestor, {
      userId: penyediaId,
    });
    expect(rincian?.ringkasKeuntungan).toMatchObject({
      persenPotonganAdmin: 5,
      persenBunga: 30,
      pokok: 3_000_000,
      saldoBerjalan: 2_000_000,
      totalBunga: 900_000,
      keuntunganAdmin: 195_000,
      keuntunganPendana: 705_000,
    });
    const berjalan = rincian?.pinjaman.find((p) => p.status === "didanai");
    expect(berjalan?.referensi).toBe("PGD-UJI-1");
    expect(berjalan?.bunga).toBe(600_000);
    expect(berjalan?.totalLunas).toBe(2_600_000);
    expect(berjalan?.potonganAdmin).toBe(130_000);
    expect(berjalan?.keuntunganPendana).toBe(470_000);
    const lunas = rincian?.pinjaman.find((p) => p.status === "lunas");
    expect(lunas?.referensi).toBe("PGD-BAGI-LUNAS");
    expect(lunas?.bunga).toBe(300_000);
    expect(lunas?.potonganAdmin).toBe(65_000);
    expect(lunas?.keuntunganPendana).toBe(235_000);
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

describe("pelacakan transfer keuntungan pendana", () => {
  /** Pinjaman lunas milik satu penyedia dana — dasar kewajiban transfer. */
  async function seedPinjamanLunas(
    t: KonteksUji,
    opts: { status?: "lunas" | "didanai"; pendana?: boolean } = {},
  ) {
    const { userId } = await siapkanPengguna(t, "rani", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    const penyedia = await siapkanPengguna(t, "penyedia", {
      email: "penyedia@pindai.test",
      role: "dana",
    });
    const loanId = await t.run((ctx) =>
      ctx.db.insert("loans", {
        userId,
        pokokPinjaman: 1_000_000,
        tujuan: "Modal usaha",
        namaLengkap: NAMA_PEMOHON,
        nomorRekening: RAHASIA.nomorRekening,
        status: opts.status ?? "lunas",
        nomorReferensi: "PGD-TRANSFER-1",
        tenorHari: 30,
        didanaiPada: 1_700_000_000_000,
        lunasPada: 1_700_100_000_000,
        ...(opts.pendana === false
          ? {}
          : { pendanaId: penyedia.userId, pendanaNama: "Penyedia Dana" }),
      }),
    );
    return { loanId, penyedia, userId };
  }

  it("menolak non-admin — gerbang pencatatan ada di server", async () => {
    const t = convexTest(schema, modules);
    const { loanId, penyedia } = await seedPinjamanLunas(t);

    // Penyedia dana sendiri pun tidak boleh mencatat; ini wewenang admin.
    await expect(
      penyedia.sesi.mutation(api.penyediaDana.catatTransferPendana, {
        loanId,
        metode: "transfer_bank",
      }),
    ).rejects.toThrow(/Super Admin/i);

    const { sesi: peminjam } = await siapkanPengguna(t, "rani-dua", {
      email: "rani-dua@pindai.test",
      role: "peminjam",
    });
    await expect(
      peminjam.mutation(api.penyediaDana.catatTransferPendana, {
        loanId,
        metode: "transfer_bank",
      }),
    ).rejects.toThrow(/Super Admin/i);
  });

  it("mencatat transfer pinjaman lunas: nominal dihitung server, bukan klien", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const { loanId } = await seedPinjamanLunas(t);

    // Kebijakan default: bunga 30% dari 1jt = 300rb, total 1,3jt, potongan
    // admin 5% = 65rb, sehingga keuntungan bersih pendana = 235rb.
    const hasil = await admin.mutation(api.penyediaDana.catatTransferPendana, {
      loanId,
      metode: "transfer_bank",
      referensi: "TRX-001",
      catatan: "ditransfer bersama pelunasan lain",
    });
    expect(hasil.jumlah).toBe(235_000);

    const baris = await t.run((ctx) =>
      ctx.db.query("transferPendana").withIndex("by_loan", (q) => q.eq("loanId", loanId)).collect(),
    );
    expect(baris).toHaveLength(1);
    expect(baris[0].jumlah).toBe(235_000);
    expect(baris[0].status).toBe("dicatat");
    expect(baris[0].referensi).toBe("TRX-001");
    expect(baris[0].pendanaNama).toBe("Penyedia Dana");

    // Catatan pembukuan: tidak ada saldo/ledger yang tersentuh.
    const ledger = await t.run((ctx) => ctx.db.query("ledger_entries").collect());
    expect(ledger).toHaveLength(0);

    const audit = await t.run((ctx) =>
      ctx.db.query("auditLog").collect(),
    );
    expect(audit.some((a) => a.aksi === "catat_transfer_pendana")).toBe(true);
  });

  it("menolak pinjaman belum lunas dan pinjaman tanpa pendana", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const berjalan = await seedPinjamanLunas(t, { status: "didanai" });
    await expect(
      admin.mutation(api.penyediaDana.catatTransferPendana, {
        loanId: berjalan.loanId,
        metode: "transfer_bank",
      }),
    ).rejects.toThrow(/lunas/i);

    const tanpaPendana = await seedPinjamanLunas(t, { pendana: false });
    await expect(
      admin.mutation(api.penyediaDana.catatTransferPendana, {
        loanId: tanpaPendana.loanId,
        metode: "transfer_bank",
      }),
    ).rejects.toThrow(/penyedia dana/i);
  });

  it("menolak pencatatan ganda sebelum catatan lama dibatalkan", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const { loanId } = await seedPinjamanLunas(t);

    await admin.mutation(api.penyediaDana.catatTransferPendana, {
      loanId,
      metode: "tunai",
    });
    await expect(
      admin.mutation(api.penyediaDana.catatTransferPendana, {
        loanId,
        metode: "transfer_bank",
      }),
    ).rejects.toThrow(/sudah dicatat/i);

    // Setelah dibatalkan, pencatatan ulang boleh.
    await admin.mutation(api.penyediaDana.batalkanTransferPendana, {
      loanId,
      alasan: "salah metode pengiriman",
    });
    const ulang = await admin.mutation(api.penyediaDana.catatTransferPendana, {
      loanId,
      metode: "transfer_bank",
      referensi: "TRX-002",
    });
    expect(ulang.jumlah).toBe(235_000);

    const baris = await t.run((ctx) =>
      ctx.db.query("transferPendana").withIndex("by_loan", (q) => q.eq("loanId", loanId)).collect(),
    );
    // Riwayat tidak dihapus: baris lama tetap ada sebagai jejak audit.
    expect(baris).toHaveLength(2);
    expect(baris.filter((b) => b.status === "dicatat")).toHaveLength(1);
    expect(baris.filter((b) => b.status === "dibatalkan")).toHaveLength(1);
  });

  it("pembatalan wajib beralasan dan tidak mengubah saldo/ledger", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const { loanId } = await seedPinjamanLunas(t);

    await expect(
      admin.mutation(api.penyediaDana.batalkanTransferPendana, { loanId, alasan: "x" }),
    ).rejects.toThrow(/alasan/i);

    await admin.mutation(api.penyediaDana.catatTransferPendana, {
      loanId,
      metode: "e_wallet",
    });
    const hasil = await admin.mutation(api.penyediaDana.batalkanTransferPendana, {
      loanId,
      alasan: "salah nominal",
    });
    expect(hasil.jumlahDibatalkan).toBe(1);

    const loan = await t.run((ctx) => ctx.db.get(loanId));
    expect(loan?.status).toBe("lunas");
    const ledger = await t.run((ctx) => ctx.db.query("ledger_entries").collect());
    expect(ledger).toHaveLength(0);
  });

  it("panel admin membaca status transfer per akun dan per pinjaman", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const { loanId, penyedia } = await seedPinjamanLunas(t);

    const awal = await admin.query(api.penyediaDana.rincianInvestor, {
      userId: penyedia.userId,
    });
    expect(awal?.transfer.jumlahLunas).toBe(1);
    expect(awal?.transfer.jumlahBelumDicatat).toBe(1);
    expect(awal?.transfer.keuntunganBelumDicatat).toBe(235_000);
    expect(awal?.pinjaman[0].transfer.status).toBe("belum_dicatat");

    await admin.mutation(api.penyediaDana.catatTransferPendana, {
      loanId,
      metode: "transfer_bank",
      referensi: "TRX-777",
    });

    const sesudah = await admin.query(api.penyediaDana.rincianInvestor, {
      userId: penyedia.userId,
    });
    expect(sesudah?.transfer.jumlahTercatat).toBe(1);
    expect(sesudah?.transfer.jumlahBelumDicatat).toBe(0);
    expect(sesudah?.transfer.keuntunganTercatat).toBe(235_000);
    expect(sesudah?.pinjaman[0].transfer.status).toBe("dicatat");
    expect(sesudah?.pinjaman[0].transfer.referensi).toBe("TRX-777");

    const daftar = await admin.query(api.penyediaDana.daftarInvestor, {});
    const barisPenyedia = daftar.rows.find((r) => r.userId === penyedia.userId);
    expect(barisPenyedia?.transfer.jumlahTercatat).toBe(1);
    expect(daftar.ringkasan.keuntunganTercatat).toBe(235_000);
    expect(daftar.ringkasan.pinjamanBelumDicatat).toBe(0);
  });

  it("ruang penyedia dana menampilkan status transfer sebagai catatan", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const { loanId, penyedia } = await seedPinjamanLunas(t);
    await admin.mutation(api.penyediaDana.catatTransferPendana, {
      loanId,
      metode: "tunai",
    });

    const data = await penyedia.sesi.query(api.penyediaDana.daftarPengajuan, {});
    const baris = data.pinjaman.find((p) => p._id === loanId);
    expect(baris?.transfer.status).toBe("dicatat");
    expect(data.ringkasan.totalTransferBelumDicatat).toBe(0);
  });
});
