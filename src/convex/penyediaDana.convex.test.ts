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
import {
  imbalPendana,
  totalPengembalianPendana,
} from "../lib/imbalPendana";
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

/**
 * Tiga pengajuan (pinjaman, gadai, kredit) milik satu peminjam.
 *
 * Bila `pendana` diberikan, pinjaman dan kreditnya dialokasikan ke akun itu —
 * ruang penyedia dana kini portofolio pribadi, jadi akun pendana hanya melihat
 * barisnya sendiri. Gadai sengaja tetap tanpa alokasi: tidak ada tabel alokasi
 * untuk pawns, sehingga gadai memang tidak pernah masuk portofolio pendana.
 */
async function seedPengajuan(
  t: KonteksUji,
  userId: Id<"users">,
  pendana?: { userId: Id<"users">; nama: string },
) {
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
      ...(pendana === undefined
        ? {}
        : { pendanaId: pendana.userId, pendanaNama: pendana.nama }),
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
    if (pendana !== undefined) {
      await ctx.db.insert("kreditFundings", {
        kreditId,
        danaId: pendana.userId,
        jumlahAlokasi: 4_800_000,
        imbalHasil: 864_000,
        status: "dialokasikan",
        nomorReferensi: "FND-UJI-3",
      });
    }

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
    // Dua akun penyedia dana berbeda: `ubahDataPinjaman` hanya memigrasikan
    // baris-warisan saat pemiliknya benar-benar berpindah, dan guard menutup
    // pinjaman lunas — jadi migrasi diuji pada posisi berjalan.
    const { userId } = await siapkanPengguna(t, "rani-migrasi", {
      email: "rani-migrasi@pindai.test",
      role: "peminjam",
    });
    const { userId: danaLamaId } = await siapkanPengguna(t, "dana-lama", {
      email: "dana-lama@pindai.test",
      role: "dana",
    });
    const { userId: danaBaruId } = await siapkanPengguna(t, "dana-baru", {
      email: "dana-baru@pindai.test",
      role: "dana",
    });

    const loanId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("loans", {
        userId,
        pokokPinjaman: 1_000_000,
        tujuan: "Modal usaha",
        namaLengkap: NAMA_PEMOHON,
        nomorRekening: RAHASIA.nomorRekening,
        status: "didanai",
        nomorReferensi: "PGD-TRANSFER-1",
        tenorHari: 30,
        didanaiPada: 1_700_000_000_000,
        pendanaId: danaLamaId,
        pendanaNama: "Dana Lama",
      });
      // Baris-warisan `fundings` masih `dialokasikan` ke dana lama.
      await ctx.db.insert("fundings", {
        loanId: id,
        danaId: danaLamaId,
        jumlahAlokasi: 1_000_000,
        imbalHasil: 300_000,
        status: "dialokasikan",
        nomorReferensi: "ALOK-MIGRASI-1",
      });
      return id;
    });

    // 1) Admin mengubah pendana pinjaman: baris-warisan `fundings` dari dana
    //    lama dipindahkan ke dana baru, baris lama `dibatalkan`.
    const hasil = await admin.mutation(api.penyediaDana.ubahDataPinjaman, {
      loanId,
      pendanaUserId: danaBaruId,
      alasan: "Pindah pendana dari dana lama ke dana baru",
    });
    expect(hasil.perubahan.some((p) => /pendana/i.test(p))).toBe(true);

    const sesudah = await t.run((ctx) =>
      ctx.db.query("fundings").withIndex("by_loan", (q) => q.eq("loanId", loanId)).collect(),
    );
    const pendana = (await t.run((ctx) => ctx.db.get(loanId)))?.pendanaId;
    expect(pendana).toBe(danaBaruId);

    // Tidak ada `fundings` yang masih `dialokasikan` dari pinjaman ini.
    expect(sesudah.some((f) => f.status === "dialokasikan")).toBe(false);
    // Baris yang dipindahkan kini milik dana baru dan ditandai `dibatalkan`
    // (peran `dialokasikan_deduped` tidak ada di skema).
    expect(sesudah.some((f) => f.status === "dibatalkan" && f.danaId === danaBaruId)).toBe(true);
    expect(sesudah.some((f) => f.danaId !== danaBaruId)).toBe(false);

    // 2) Rekap mengikuti pemilik baru & saldo dompet tidak berubah.
    const rincian = await admin.query(api.penyediaDana.rincianInvestor, {
      userId: danaBaruId,
    });
    expect(rincian?.pinjaman.some((p) => p.referensi === "PGD-TRANSFER-1")).toBe(true);
    expect(rincian?.saldoDompet).toBeDefined();

    // 3) `batalkanTransferPendana` masih membuang catatan transfer lama.
    //    Keuntungan baru dapat dicatat setelah pinjaman lunas, jadi pakai
    //    pinjaman lunas terpisah (guard menutup migrasi di atas pinjaman lunas).
    const { loanId: loanLunas } = await seedPinjamanLunas(t);
    await admin.mutation(api.penyediaDana.catatTransferPendana, {
      loanId: loanLunas,
      metode: "e_wallet",
    });
    const ditandai = await admin.mutation(api.penyediaDana.batalkanTransferPendana, {
      loanId: loanLunas,
      alasan: "Debug migrasi boundary",
    });
    expect(ditandai.jumlahDibatalkan).toBe(1);
    const baris = await t.run((ctx) =>
      ctx.db.query("transferPendana").withIndex("by_loan", (q) => q.eq("loanId", loanLunas)).collect(),
    );

    expect(baris.filter((b) => b.status === "dicatat")).toHaveLength(0);
    expect(baris.filter((b) => b.status === "dibatalkan")).toHaveLength(1);
  });
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
    const { sesi: dana, userId: danaId } = await siapkanPengguna(t, "Penyedia Uji", {
      email: "dana@pindai.test",
      role: "dana",
    });
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin-uji@pindai.test",
      role: "admin",
    });
    await seedPengajuan(t, userId, { userId: danaId, nama: "Penyedia Uji" });

    // Ruang ini portofolio pribadi: akun pendana menerima pinjaman dan kredit
    // yang alokasinya atas namanya. Pengajuan gadai tidak pernah masuk — tidak
    // ada tabel alokasi untuk pawns (lihat komentar seedPengajuan).
    const pribadi = await dana.query(api.penyediaDana.daftarPengajuan, {});
    expect(pribadi.pinjaman.map((b) => b.nomorReferensi)).toEqual(["PGD-UJI-1"]);
    expect(pribadi.gadai).toEqual([]);
    expect(pribadi.kredit.map((b) => b.nomorReferensi)).toEqual(["PGD-UJI-3"]);
    expect(pribadi.pinjaman[0]?.pendana).toBe("Penyedia Uji");

    // Bentuk baris lengkap diperiksa lewat admin: panel pemantau memang
    // menerima seluruh baris ruang ini.
    const hasil = await admin.query(api.penyediaDana.daftarPengajuan, {});

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
      pendana: "Penyedia Uji",
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

    // Kepercayaan dihitung dari riwayat, jadi peminjam tanpa riwayat lunas
    // tampil jujur sebagai nasabah baru — bukan angka karangan.
    expect(hasil.pinjaman[0]?.kepercayaan).toMatchObject({
      tingkat: "baru",
      label: "Nasabah baru",
      ringkas: "0 tepat waktu · 0 terlambat",
    });
    expect(hasil.pinjaman[0]?.kepercayaan.alasan).toContain(
      "Belum ada pinjaman yang berjalan atau lunas",
    );
  });

  it("menilai kepercayaan peminjam dari riwayat pelunasan di catatan PINDAI", async () => {
    const t = convexTest(schema, modules);
    const { userId: rajin } = await siapkanPengguna(t, "rani-rajin", {
      email: "rajin@pindai.test",
      role: "peminjam",
    });
    const { userId: telat } = await siapkanPengguna(t, "rusdi-telat", {
      email: "telat@pindai.test",
      role: "peminjam",
    });
    const { sesi: dana, userId: danaId } = await siapkanPengguna(t, "penyedia-nilai", {
      email: "dana-nilai@pindai.test",
      role: "dana",
    });

    const HARI = 86_400_000;
    const DIDANAI = Date.now() - 120 * HARI;
    let idPinjamanPertama: Id<"loans"> | null = null;

    await t.run(async (ctx) => {
      await ctx.db.patch(rajin, { kodePeminjam: "PMN-RAJIN" });
      await ctx.db.patch(telat, { kodePeminjam: "PMN-TELAT" });

      // Dua pelunasan benar-benar tepat waktu (lunas ≤ jatuh tempo 30 hari).
      for (const i of [0, 1]) {
        const id = await ctx.db.insert("loans", {
          userId: rajin,
          pokokPinjaman: 2_500_000,
          tujuan: "Modal usaha",
          namaLengkap: "Rani Rajin",
          nomorRekening: RAHASIA.nomorRekening,
          nik: RAHASIA.nik,
          nomorWhatsApp: RAHASIA.nomorWhatsApp,
          status: "lunas",
          nomorReferensi: `PGD-RAJIN-${i + 1}`,
          tenorHari: 30,
          didanaiPada: DIDANAI + i * 40 * HARI,
          lunasPada: DIDANAI + i * 40 * HARI + 30 * HARI,
          // Portofolio pribadi: barisnya harus jelas milik pembaca.
          pendanaId: danaId,
          pendanaNama: "Penyedia Nilai",
        });
        if (i === 0) idPinjamanPertama = id;
      }

      // Data diri tersimpan — satu poin penilaian yang bisa diperiksa admin.
      await ctx.db.insert("nasabahProfil", {
        userId: rajin,
        namaLengkap: "Rani Rajin",
        nik: RAHASIA.nik,
        nomorWhatsApp: RAHASIA.nomorWhatsApp,
        alamat: "Jl. Contoh No. 2",
        diperbaruiPada: Date.now(),
        diperbaruiOlehLabel: "admin",
      });

      // Peminjam kedua: satu pinjaman berjalan yang sudah lewat jatuh tempo.
      await ctx.db.insert("loans", {
        userId: telat,
        pokokPinjaman: 1_500_000,
        tujuan: "Kebutuhan pribadi",
        namaLengkap: "Rusdi Telat",
        nomorRekening: RAHASIA.nomorRekening,
        status: "didanai",
        nomorReferensi: "PGD-TELAT-1",
        tenorHari: 30,
        didanaiPada: Date.now() - 40 * HARI,
        pendanaId: danaId,
        pendanaNama: "Penyedia Nilai",
      });
    });

    const hasil = await dana.query(api.penyediaDana.daftarPengajuan, {});
    expect(hasil.pinjaman).toHaveLength(3);

    const barisRajin = hasil.pinjaman.filter((b) => b.namaLengkap === "Rani Rajin");
    expect(barisRajin).toHaveLength(2);
    // Penilaian bersifat per PEMINJAM: dua baris orang yang sama identik.
    expect(barisRajin[0]?.kepercayaan).toEqual(barisRajin[1]?.kepercayaan);
    expect(barisRajin[0]?.kepercayaan).toMatchObject({
      tingkat: "kuat",
      label: "Terpercaya",
      ringkas: "2 tepat waktu · 0 terlambat",
    });
    expect(barisRajin[0]?.kepercayaan.skor).toBeGreaterThanOrEqual(78);
    expect(barisRajin[0]?.kepercayaan.alasan).toContain("2 pinjaman lunas tepat waktu");
    expect(barisRajin[0]?.kepercayaan.alasan).toContain("Data diri tersimpan lengkap");

    const barisTelat = hasil.pinjaman.find((b) => b.namaLengkap === "Rusdi Telat");
    expect(barisTelat?.kepercayaan).toMatchObject({
      tingkat: "perlu_perhatian",
      label: "Perlu perhatian",
    });
    expect(barisTelat?.kepercayaan.alasan.join(" | ")).toMatch(/lewat jatuh tempo/);
    expect(barisTelat?.kepercayaan.alasan).toContain("Data diri belum lengkap");
    expect(barisTelat?.kepercayaan.skor ?? 100).toBeLessThan(55);

    // Penilaian tidak membocorkan identitas: hanya label, skor, dan alasan.
    const teksKepercayaan = JSON.stringify(barisRajin.map((b) => b.kepercayaan));
    for (const rahasia of Object.values(RAHASIA)) {
      expect(teksKepercayaan).not.toContain(rahasia);
    }
    expect(JSON.stringify(hasil)).not.toContain(RAHASIA.nik);
    for (const kunci of ["nik", "nomorRekening", "nomorWhatsApp", "namaLengkap"]) {
      expect(barisRajin[0]?.kepercayaan).not.toHaveProperty(kunci);
    }

    // Dibaca ulang tanpa data berubah: skor tetap sama (deterministik).
    const ulang = await dana.query(api.penyediaDana.daftarPengajuan, {});
    expect(ulang.pinjaman.find((b) => b.namaLengkap === "Rani Rajin")?.kepercayaan.skor).toBe(
      barisRajin[0]?.kepercayaan.skor,
    );

    // Riwayat dibaca dari dokumen pinjaman yang sebenarnya, bukan dari
    // `kodePeminjam` atau klaim klien: melunasi satu pinjaman lagi mengubah
    // penilaian.
    const targetId = idPinjamanPertama;
    if (targetId === null) throw new Error("seed pinjaman pertama gagal");
    await t.run((ctx) => ctx.db.patch(targetId, { lunasPada: DIDANAI + 60 * HARI }));
    const setelahTerlambat = await dana.query(api.penyediaDana.daftarPengajuan, {});
    const rajinSetelah = setelahTerlambat.pinjaman.find((b) => b.namaLengkap === "Rani Rajin");
    expect(rajinSetelah?.kepercayaan.alasan.join(" | ")).toMatch(/melewati jatuh tempo/);
    expect(rajinSetelah?.kepercayaan.skor ?? 100).toBeLessThan(
      barisRajin[0]?.kepercayaan.skor ?? 0,
    );
  });

  it("memisahkan pengajuan awal dari persetujuan sebagian tanpa mengubah posisi dana", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await siapkanPengguna(t, "rani", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    const { sesi: dana, userId: danaId } = await siapkanPengguna(t, "Penyedia Uji", {
      email: "dana@pindai.test",
      role: "dana",
    });
    const { loanId } = await seedPengajuan(t, userId, {
      userId: danaId,
      nama: "Penyedia Uji",
    });
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
      // Alokasinya sudah ditetapkan, jadi kolom Pendana menampilkan pemiliknya
      // walau pinjaman belum ditandai tersalurkan.
      pendana: "Penyedia Uji",
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
    const { sesi: dana, userId: danaId } = await siapkanPengguna(t, "penyedia-lama", {
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
        pendanaId: danaId,
        pendanaNama: "Penyedia Lama",
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
    const { sesi: dana, userId: danaId } = await siapkanPengguna(t, "Penyedia Uji", {
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
          pendanaId: danaId,
          pendanaNama: "Penyedia Uji",
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

  it("akun pendana hanya menerima alokasi atas namanya, tanpa angka pendana lain", async () => {
    const t = convexTest(schema, modules);
    const { userId: rani } = await siapkanPengguna(t, "rani", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    const { userId: budi } = await siapkanPengguna(t, "budi", {
      email: "budi@pindai.test",
      role: "peminjam",
    });
    const { sesi: robert, userId: robertId } = await siapkanPengguna(t, "Robert", {
      email: "robert@pindai.test",
      role: "dana",
    });
    const { sesi: siti, userId: sitiId } = await siapkanPengguna(t, "Siti", {
      email: "siti@pindai.test",
      role: "dana",
    });
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin-ruang@pindai.test",
      role: "admin",
    });

    await t.run(async (ctx) => {
      const dasar = {
        pokokPinjaman: 1_000_000,
        pokokDiajukan: 1_000_000,
        tujuan: "Modal usaha",
        namaLengkap: NAMA_PEMOHON,
        nomorRekening: RAHASIA.nomorRekening,
        tenorHari: 30,
      };
      // Satu pinjaman berjalan per pendana (model 1 pinjaman = 1 pendana), plus
      // satu pengajuan yang belum dialokasikan ke siapa pun.
      await ctx.db.insert("loans", {
        ...dasar,
        userId: rani,
        status: "didanai",
        nomorReferensi: "PGD-ROBERT-1",
        didanaiPada: Date.now(),
        pendanaId: robertId,
        pendanaNama: "Robert",
      });
      await ctx.db.insert("loans", {
        ...dasar,
        userId: budi,
        status: "didanai",
        nomorReferensi: "PGD-SITI-1",
        didanaiPada: Date.now(),
        pendanaId: sitiId,
        pendanaNama: "Siti",
      });
      await ctx.db.insert("loans", {
        ...dasar,
        userId: rani,
        status: "diajukan",
        nomorReferensi: "PGD-BELUM-1",
      });
    });

    const robertHasil = await robert.query(api.penyediaDana.daftarPengajuan, {});
    expect(robertHasil.pinjaman.map((b) => b.nomorReferensi)).toEqual(["PGD-ROBERT-1"]);
    expect(robertHasil.rekapPendana).toHaveLength(1);
    expect(robertHasil.rekapPendana[0].nama).toBe("Robert");
    expect(robertHasil.rekapPendana[0].totalDisalurkan).toBe(1_000_000);
    // Angka bersama fitur admin tidak ikut: ringkasannya hanya dirinya.
    expect(robertHasil.ringkasan.totalKeuntunganPendana).toBe(
      robertHasil.rekapPendana[0].keuntunganPendana,
    );
    expect(robertHasil.ringkasan.totalKeuntunganAdmin).toBe(
      robertHasil.rekapPendana[0].keuntunganAdmin,
    );
    // Tidak ada jejak pendana lain maupun pengajuan yang bukan miliknya.
    const mentahRobert = JSON.stringify(robertHasil);
    expect(mentahRobert).not.toContain("Siti");
    expect(mentahRobert).not.toContain("PGD-SITI-1");
    expect(mentahRobert).not.toContain("PGD-BELUM-1");

    const sitiHasil = await siti.query(api.penyediaDana.daftarPengajuan, {});
    expect(sitiHasil.pinjaman.map((b) => b.nomorReferensi)).toEqual(["PGD-SITI-1"]);
    expect(sitiHasil.rekapPendana).toHaveLength(1);
    expect(sitiHasil.rekapPendana[0].nama).toBe("Siti");

    // Admin tetap menerima seluruh baris: pekerjaannya merekonsiliasi semua
    // pendana, dan angkanya harus lebih besar daripada satu pendana mana pun.
    const adminHasil = await admin.query(api.penyediaDana.daftarPengajuan, {});
    expect(adminHasil.pinjaman).toHaveLength(3);
    expect(adminHasil.rekapPendana.map((r) => r.nama).sort()).toEqual(["Robert", "Siti"]);
    expect(adminHasil.ringkasan.totalKeuntunganPendana).toBeGreaterThan(
      robertHasil.ringkasan.totalKeuntunganPendana,
    );
  });

  it("laporan transfer dan peta peminjam juga dibatasi ke alokasi milik pendana", async () => {
    const t = convexTest(schema, modules);
    const { userId: rani } = await siapkanPengguna(t, "rani", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    const { userId: budi } = await siapkanPengguna(t, "budi", {
      email: "budi@pindai.test",
      role: "peminjam",
    });
    const { sesi: robert, userId: robertId } = await siapkanPengguna(t, "Robert", {
      email: "robert@pindai.test",
      role: "dana",
    });
    const { sesi: siti, userId: sitiId } = await siapkanPengguna(t, "Siti", {
      email: "siti@pindai.test",
      role: "dana",
    });
    const { sesi: admin, userId: adminId } = await siapkanPengguna(t, "admin", {
      email: "admin-ruang@pindai.test",
      role: "admin",
    });

    await t.run(async (ctx) => {
      const dasar = {
        pokokPinjaman: 1_000_000,
        pokokDiajukan: 1_000_000,
        tujuan: "Modal usaha",
        namaLengkap: NAMA_PEMOHON,
        nomorRekening: RAHASIA.nomorRekening,
        tenorHari: 30,
        status: "lunas" as const,
        didanaiPada: Date.now(),
        lunasPada: Date.now(),
      };
      const loanRobert = await ctx.db.insert("loans", {
        ...dasar,
        userId: rani,
        nomorReferensi: "PGD-ROBERT-1",
        pendanaId: robertId,
        pendanaNama: "Robert",
      });
      const loanSiti = await ctx.db.insert("loans", {
        ...dasar,
        userId: budi,
        nomorReferensi: "PGD-SITI-1",
        pendanaId: sitiId,
        pendanaNama: "Siti",
      });
      await ctx.db.insert("transferPendana", {
        loanId: loanRobert,
        pendanaId: robertId,
        pendanaNama: "Robert",
        nomorReferensiPinjaman: "PGD-ROBERT-1",
        jumlah: 235_000,
        metode: "transfer_bank",
        status: "dicatat",
        dicatatOleh: adminId,
        dicatatOlehLabel: "admin@pindai.test",
        dicatatPada: Date.now(),
      });
      await ctx.db.insert("transferPendana", {
        loanId: loanSiti,
        pendanaId: sitiId,
        pendanaNama: "Siti",
        nomorReferensiPinjaman: "PGD-SITI-1",
        jumlah: 305_000,
        metode: "transfer_bank",
        status: "dicatat",
        dicatatOleh: adminId,
        dicatatOlehLabel: "admin@pindai.test",
        dicatatPada: Date.now(),
      });
      // Kedua peminjam melaporkan titik, supaya peta punya dua baris untuk admin.
      for (const [userId, lng] of [
        [rani, 106.816666],
        [budi, 110.369999],
      ] as const) {
        await ctx.db.insert("lokasiStatus", {
          userId,
          lat: -6.2,
          lng,
          akurasi: 24,
          waktu: Date.now(),
          sumber: "web",
        });
      }
    });

    const laporanRobert = await robert.query(api.penyediaDana.laporanTransferPendana, {});
    expect(laporanRobert.rows.map((r) => r.nomorReferensi)).toEqual(["PGD-ROBERT-1"]);
    expect(JSON.stringify(laporanRobert)).not.toContain("PGD-SITI-1");
    expect(laporanRobert.ringkasan.nilaiTercatat).toBe(235_000);

    const laporanSiti = await siti.query(api.penyediaDana.laporanTransferPendana, {});
    expect(laporanSiti.rows.map((r) => r.nomorReferensi)).toEqual(["PGD-SITI-1"]);

    const petaRobert = await robert.query(api.penyediaDana.titikPeminjam, {});
    expect(petaRobert.rows).toHaveLength(1);
    expect(petaRobert.rows[0].nomorReferensi).toBe("PGD-ROBERT-1");
    const petaSiti = await siti.query(api.penyediaDana.titikPeminjam, {});
    expect(petaSiti.rows).toHaveLength(1);
    expect(petaSiti.rows[0].nomorReferensi).toBe("PGD-SITI-1");
    // Peta admin tetap memuat keduanya — pembatasannya hanya untuk akun pendana.
    const petaAdmin = await admin.query(api.penyediaDana.titikPeminjam, {});
    expect(petaAdmin.rows.map((r) => r.nomorReferensi).sort()).toEqual([
      "PGD-ROBERT-1",
      "PGD-SITI-1",
    ]);
    const laporanAdmin = await admin.query(api.penyediaDana.laporanTransferPendana, {});
    expect(laporanAdmin.rows).toHaveLength(2);
  });

  it("tahan pinjaman warisan tanpa pendanaId: dibaca dari alokasi lama, identitas jatuh ke email", async () => {
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
      // Bentuk alokasi model lama: pinjamannya belum pernah diberi `pendanaId`,
      // jadi satu-satunya penunjuk pemiliknya ada di baris `fundings` ini.
      await ctx.db.insert("fundings", {
        loanId,
        danaId: danaId,
        jumlahAlokasi: 1_000_000,
        imbalHasil: 300_000,
        status: "dialokasikan",
        nomorReferensi: "FND-LEGACY-1",
      });
    });

    // Portofolio pendana tetap utuh lewat jalur alokasi lama — bukan kosong
    // hanya karena pinjaman warisan belum diberi `pendanaId`.
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

  it("admin membuat pendana baru yang langsung berakses ruang", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const { sesi: calon } = await siapkanPengguna(t, "calon", {
      email: "calon@pindai.test",
      role: "peminjam",
    });

    // Pembuatan akun pendana hanya untuk admin.
    await expect(
      calon.mutation(api.penyediaDana.buatPendana, {
        nama: "Pendana Nakal",
        email: "nakal@pindai.test",
      }),
    ).rejects.toThrow(/admin/i);

    // Nama dan email divalidasi.
    await expect(
      admin.mutation(api.penyediaDana.buatPendana, {
        nama: "X",
        email: "pendek@pindai.test",
      }),
    ).rejects.toThrow(/2–120/);
    await expect(
      admin.mutation(api.penyediaDana.buatPendana, {
        nama: "Pendana Baru",
        email: "bukan-email",
      }),
    ).rejects.toThrow(/valid/i);

    // Email yang sudah dipakai akun terdaftar ditolak — arahkan ke "Beri akses".
    await expect(
      admin.mutation(api.penyediaDana.buatPendana, {
        nama: "Bentrok",
        email: "calon@pindai.test",
      }),
    ).rejects.toThrow(/Beri akses/i);

    const hasil = await admin.mutation(api.penyediaDana.buatPendana, {
      nama: "Robert Tanaya",
      email: "Robert.Tanaya@Pindai.test",
      nomorWhatsApp: "0812 3456 7890",
      alasan: "Mitra pendanaan baru",
    });
    expect(hasil.nama).toBe("Robert Tanaya");
    expect(hasil.email).toBe("robert.tanaya@pindai.test");
    expect(hasil.nomorWhatsApp).toBe("6281234567890");

    const akun = await t.run((ctx) => ctx.db.get(hasil.userId));
    expect(akun?.role).toBe("dana");
    expect(akun?.name).toBe("Robert Tanaya");
    expect(akun?.email).toBe("robert.tanaya@pindai.test");
    expect(akun?.nomorWhatsApp).toBe("6281234567890");
    expect(akun?.isAnonymous).toBe(false);
    // Stub ditandai email terverifikasi agar OTP nanti menautkannya, bukan
    // membuat akun duplikat.
    expect(typeof akun?.emailVerificationTime).toBe("number");

    // Email yang sama tidak dapat dibuat dua kali.
    await expect(
      admin.mutation(api.penyediaDana.buatPendana, {
        nama: "Duplikat",
        email: "robert.tanaya@pindai.test",
      }),
    ).rejects.toThrow(/sudah/i);

    // Satu nomor WhatsApp hanya boleh menjadi pintu masuk satu akun.
    await expect(
      admin.mutation(api.penyediaDana.buatPendana, {
        nama: "Nomor Bentrok",
        email: "nomor.bentrok@pindai.test",
        nomorWhatsApp: "081234567890",
      }),
    ).rejects.toThrow(/sudah dipakai akun lain/i);

    // Langsung tampil di daftar investor dengan akses aktif.
    const daftar = await admin.query(api.penyediaDana.daftarInvestor, {});
    const baris = daftar.rows.find((r) => r.email === "robert.tanaya@pindai.test");
    expect(baris?.aksesAktif).toBe(true);

    // Tercatat di audit trail.
    const jejak = await admin.query(api.system.getConfigAdmin, {});
    expect(
      jejak.auditTerbaru.some(
        (j) =>
          j.aksi === "buat_pendana" &&
          (j.detail ?? "").includes("Mitra pendanaan baru"),
      ),
    ).toBe(true);
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
    const { sesi: robert, userId: robertId } = await siapkanPengguna(t, "Robert", {
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

    // Rekap dan baris daftar langsung mengikuti pendana baru: ruang baru
    // memuat barisnya, ruang lama tidak lagi (tidak ada baris yang tertinggal).
    const daftar = await asep.query(api.penyediaDana.daftarPengajuan, {});
    expect(daftar.pinjaman[0]?.pendana).toBe("Asep");
    const daftarLama = await robert.query(api.penyediaDana.daftarPengajuan, {});
    expect(daftarLama.pinjaman.map((p) => p.nomorReferensi)).not.toContain("PGD-UJI-1");

    // Catatan TIDAK wajib: koreksi pendana tanpa alasan apa pun harus tersimpan
    // (kebijakan pemilik produk) — dan audit trail tetap ditulis.
    const tanpaCatatan = await admin.mutation(api.penyediaDana.ubahDataPinjaman, {
      loanId,
      pendanaEmail: "robert@pindai.test",
    });
    expect(tanpaCatatan.perubahan).toEqual(["pendana → Robert"]);
    expect((await t.run((ctx) => ctx.db.get(loanId)))?.pendanaId).toBe(robertId);
    const auditTanpaCatatan = await t.run(async (ctx) => {
      const rows = await ctx.db.query("auditLog").collect();
      const cocok = rows.filter((r) => r.aksi === "ubah_data_pinjaman");
      return cocok.length === 0 ? null : cocok[cocok.length - 1];
    });
    expect(auditTanpaCatatan?.detail).toContain("pendana → Robert");
    expect(auditTanpaCatatan?.detail).toContain("tanpa catatan");

    // Pinjaman lunas tetap tidak dapat diubah lagi.
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

  it("melaporkan keuntungan pinjaman belum lunas terpisah dari yang sudah lunas", async () => {
    const t = convexTest(schema, modules);
    const { userId: peminjamId } = await siapkanPengguna(t, "rani", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    const { sesi: penyedia, userId: penyediaId } = await siapkanPengguna(t, "Robert", {
      email: "robert@pindai.test",
      role: "dana",
    });
    const { loanId } = await seedPengajuan(t, peminjamId);

    await t.run(async (ctx) => {
      // 1. Masih berjalan (belum lunas): pokok 2jt → Imbal Hasil 600rb,
      //    potongan admin 5% dari 2,6jt = 130rb.
      await ctx.db.patch(loanId, {
        status: "didanai",
        pokokPinjaman: 2_000_000,
        pendanaId: penyediaId,
        pendanaNama: "Robert",
        didanaiPada: Date.now(),
      });
      // 2. Sudah lunas: pokok 1jt → Imbal Hasil 300rb, potongan admin 65rb.
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

    const hasil = await penyedia.query(api.penyediaDana.daftarPengajuan, {});
    const rekap = hasil.rekapPendana.find((r) => r.nama === "Robert");
    expect(rekap).toBeDefined();

    // Pinjaman lunas 1jt: bersih 300rb − 65rb = 235rb (sudah dibukukan).
    expect(rekap?.keuntunganPendanaLunas).toBe(235_000);
    expect(rekap?.keuntunganAdminLunas).toBe(65_000);
    // Pinjaman berjalan 2jt: bersih 600rb − 130rb = 470rb (masih proyeksi).
    expect(rekap?.keuntunganPendanaBelumLunas).toBe(470_000);
    expect(rekap?.keuntunganAdminBelumLunas).toBe(130_000);
    // Total tetap jumlah kedua bagian, bukan angka yang tercampur.
    expect(rekap?.keuntunganPendana).toBe(705_000);
    expect(rekap?.keuntunganAdmin).toBe(195_000);
    expect(
      (rekap?.keuntunganPendanaLunas ?? 0) + (rekap?.keuntunganPendanaBelumLunas ?? 0),
    ).toBe(rekap?.keuntunganPendana);

    // Ringkasan bagian memakai pemisahan yang sama.
    expect(hasil.ringkasan).toMatchObject({
      totalKeuntunganPendana: 705_000,
      totalKeuntunganPendanaLunas: 235_000,
      totalKeuntunganPendanaBelumLunas: 470_000,
      totalKeuntunganAdmin: 195_000,
      totalKeuntunganAdminLunas: 65_000,
      totalKeuntunganAdminBelumLunas: 130_000,
    });
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
    // Admin 5% diambil dari UANG YANG KEMBALI (pokok + Imbal Hasil), bukan dari
    // Imbal Hasil saja: 65.000 (dari 1,3jt) + 32.500 (dari 650rb).
    expect(baris?.keuntunganAdmin).toBe(97_500);
    // Sisa uang yang kembali milik penyedia dana: (1,3jt − 65rb) + (650rb −
    // 32,5rb) = 352.500 — pokok selalu kembali utuh.
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
    // Admin 5% diambil dari UANG YANG KEMBALI: 130.000 (dari 2,6jt) + 65.000
    // (dari 1,3jt) — bukan 5% dari Imbal Hasil saja.
    expect(baris?.keuntunganAdmin).toBe(195_000);
    // Sisa uang yang kembali milik penyedia dana (900rb − 195rb) — pokok selalu
    // kembali utuh.
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
    // 5% dari uang yang kembali (2,6jt) = 130rb; penyedia dana menerima 2,47jt,
    // jadi keuntungannya 2,47jt − 2jt = 470rb.
    expect(berjalan?.potonganAdmin).toBe(130_000);
    expect(berjalan?.keuntunganPendana).toBe(470_000);
    const lunas = rincian?.pinjaman.find((p) => p.status === "lunas");
    expect(lunas?.referensi).toBe("PGD-BAGI-LUNAS");
    expect(lunas?.bunga).toBe(300_000);
    // 5% dari uang yang kembali (1,3jt) = 65rb; keuntungan 1,235jt − 1jt = 235rb.
    expect(lunas?.potonganAdmin).toBe(65_000);
    expect(lunas?.keuntunganPendana).toBe(235_000);
  });

  it("memakai skema pendana tetap meski pinjaman nasabah bulanan", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const { userId: penyediaId } = await siapkanPengguna(t, "Robert", {
      email: "robert@pindai.test",
      role: "dana",
    });
    const { userId: peminjamId } = await siapkanPengguna(t, "rani", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    const { loanId } = await seedPengajuan(t, peminjamId);

    // Pinjaman skema bulanan 3 bulan (bunga 10%/bulan). Hak pendana TIDAK
    // mengikuti tenor/bunga nasabah: tetap 30% dari pokok untuk siklus 30 hari.
    await t.run(async (ctx) => {
      await ctx.db.patch(loanId, {
        status: "didanai",
        pokokPinjaman: 2_000_000,
        tenorBulan: 3,
        persenBunga: 10,
        pendanaId: penyediaId,
        pendanaNama: "Robert",
        didanaiPada: Date.now(),
      });
    });

    const imbal = imbalPendana(2_000_000);
    const total = totalPengembalianPendana(2_000_000);
    const potonganAdmin = Math.floor((total * 5) / 100);
    expect(imbal).toBe(600_000);
    expect(total).toBe(2_600_000);
    expect(potonganAdmin).toBe(130_000);

    const rincian = await admin.query(api.penyediaDana.rincianInvestor, {
      userId: penyediaId,
    });
    const baris = rincian?.pinjaman.find((p) => p.referensi === "PGD-UJI-1");
    expect(baris?.bunga).toBe(imbal);
    expect(baris?.totalLunas).toBe(total);
    expect(baris?.tenorPendanaHari).toBe(30);
    expect(baris?.persenImbalPendana).toBe(30);
    expect(baris?.potonganAdmin).toBe(potonganAdmin);
    expect(baris?.keuntunganPendana).toBe(imbal - potonganAdmin);
    expect(baris?.keuntunganPendana).toBe(470_000);
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
      jumlahWarisanTanpaJejak: 1,    });
  });
});

describe("lokasi & berkas peminjam di ruang penyedia dana", () => {
  it("titikPeminjam menolak akun tanpa akses dan hanya berisi titik yang dilaporkan", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await siapkanPengguna(t, "rani", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    const { sesi: dana, userId: danaId } = await siapkanPengguna(t, "Penyedia Lokasi", {
      email: "penyedia@pindai.test",
      role: "dana",
    });
    await seedPengajuan(t, userId, { userId: danaId, nama: "Penyedia Lokasi" });

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
    const { sesi: dana, userId: danaId } = await siapkanPengguna(t, "Penyedia Lokasi", {
      email: "penyedia@pindai.test",
      role: "dana",
    });
    await seedPengajuan(t, userId, { userId: danaId, nama: "Penyedia Lokasi" });

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
        pendanaId: danaId,
        pendanaNama: "Penyedia Lokasi",
      }),
    );
    const awal = await dana.query(api.penyediaDana.daftarPengajuan, {});
    const barisAwal = awal.pinjaman.find((b) => b.nomorReferensi === "PGD-LOKASI-1");
    expect(barisAwal?.lokasi?.sumber).toBe("pengajuan");
    // Ruang penyedia dana menerima koordinat tingkat wilayah (2 desimal).
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
    // Kredit memakai titik yang sama (satu peminjam), dan -6.175392 dibulatkan
    // ke -6.18: ruang penyedia dana TIDAK menerima lokasi presisi peminjam
    // (hanya tingkat wilayah ≈1 km). Gadai tidak diperiksa di sini karena tidak
    // pernah menjadi bagian portofolio pendana (tanpa tabel alokasi).
    expect(akhir.kredit[0]?.lokasi?.lat).toBeCloseTo(-6.18);
    expect(akhir.kredit[0]?.lokasi?.lng).toBeCloseTo(106.83);
  });

  it("ruang penyedia dana hanya menerima koordinat tingkat wilayah; admin presisi penuh", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await siapkanPengguna(t, "rani-presisi", {
      email: "rani-presisi@pindai.test",
      role: "peminjam",
    });
    const { sesi: dana, userId: danaId } = await siapkanPengguna(t, "penyedia-presisi", {
      email: "penyedia-presisi@pindai.test",
      role: "dana",
    });
    await seedPengajuan(t, userId, { userId: danaId, nama: "penyedia-presisi" });
    await t.run((ctx) =>
      ctx.db.insert("lokasiStatus", {
        userId,
        lat: -6.175392,
        lng: 106.827153,
        akurasi: 12,
        waktu: 1_800_000_000_000,
        sumber: "aplikasi",
      }),
    );

    // Penyedia dana: dibulatkan ke 2 desimal (≈1 km).
    const sebagaiDana = await dana.query(api.penyediaDana.titikPeminjam, {});
    expect(sebagaiDana.rows[0]?.posisi.lat).toBeCloseTo(-6.18);
    expect(sebagaiDana.rows[0]?.posisi.lng).toBeCloseTo(106.83);

    // Admin memakai query yang sama dan tetap menerima presisi penuh.
    const { sesi: admin } = await siapkanPengguna(t, "admin-presisi", {
      email: "admin-presisi@pindai.test",
      role: "admin",
    });
    const sebagaiAdmin = await admin.query(api.penyediaDana.titikPeminjam, {});
    expect(sebagaiAdmin.rows[0]?.posisi.lat).toBeCloseTo(-6.175392, 5);
    expect(sebagaiAdmin.rows[0]?.posisi.lng).toBeCloseTo(106.827153, 5);
  });

  it("berkasPengajuan tidak pernah membocorkan dokumen identitas ke ruang penyedia dana", async () => {
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

    // Pinjaman: seluruh dokumennya identitas, jadi tidak ada yang boleh keluar.
    const pinjaman = await dana.query(api.penyediaDana.berkasPengajuan, {
      jenis: "pinjaman",
      id: loanId,
    });
    expect(pinjaman?.berkas).toEqual([]);
    expect(pinjaman?.catatan).toMatch(/hanya dapat dibuka oleh tim PINDAI/i);

    // URL berkas identitas tidak pernah ikut, dalam bentuk apa pun.
    const urlKtp = await t.run((ctx) => ctx.storage.getUrl(ktp));
    const urlSelfie = await t.run((ctx) => ctx.storage.getUrl(selfie));
    const mentah = JSON.stringify(pinjaman);
    expect(urlKtp).not.toBeNull();
    expect(mentah).not.toContain(urlKtp as string);
    expect(mentah).not.toContain(urlSelfie as string);
    expect(mentah).not.toContain("data:image/png");

    // Gadai: hanya foto BARANG jaminan (bukan identitas orang).
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
    // Alasan selalu dijelaskan — tidak pernah dikosongkan diam-diam.
    expect(tanpaBerkas?.catatan).toMatch(/hanya dapat dibuka oleh tim PINDAI/i);

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

    // Kebijakan default: bunga 30% dari 1jt = 300rb sehingga uang yang kembali
    // Rp1,3jt; potongan admin 5% diambil dari UANG YANG KEMBALI = 65rb,
    // sehingga keuntungan bersih pendana = 235rb.
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

  it("daftar transfer: hanya pinjaman lunas, yang belum dicatat selalu di atas", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const lunasA = await seedPinjamanLunas(t);
    const lunasB = await seedPinjamanLunas(t);
    const berjalan = await seedPinjamanLunas(t, { status: "didanai" });

    const awal = await admin.query(api.penyediaDana.daftarTransferPendana, {});
    // Pinjaman berjalan belum jatuh tempo, jadi tidak pernah jadi kewajiban.
    expect(awal.rows).toHaveLength(2);
    expect(awal.rows.some((r) => r.loanId === berjalan.loanId)).toBe(false);
    expect(awal.ringkasan.jumlahBelumDicatat).toBe(2);
    expect(awal.ringkasan.nilaiBelumDicatat).toBe(470_000);
    expect(awal.ringkasan.jumlahTercatat).toBe(0);

    await admin.mutation(api.penyediaDana.catatTransferPendana, {
      loanId: lunasA.loanId,
      metode: "transfer_bank",
      referensi: "TRX-A",
    });

    const sesudah = await admin.query(api.penyediaDana.daftarTransferPendana, {});
    // Yang masih menunggu transfer selalu muncul lebih dulu.
    expect(sesudah.rows[0].loanId).toBe(lunasB.loanId);
    expect(sesudah.rows[0].transfer.status).toBe("belum_dicatat");
    expect(sesudah.rows[1].loanId).toBe(lunasA.loanId);
    expect(sesudah.rows[1].transfer.referensi).toBe("TRX-A");
    expect(sesudah.ringkasan.jumlahBelumDicatat).toBe(1);
    expect(sesudah.ringkasan.nilaiBelumDicatat).toBe(235_000);
    expect(sesudah.ringkasan.jumlahTercatat).toBe(1);
    expect(sesudah.ringkasan.nilaiTercatat).toBe(235_000);
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

describe("ubah data login akun (panel admin)", () => {
  it("mengisi email akun tanpa email sehingga akun itu bisa menerima kode masuk", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    // Akun warisan: berperan pendana tetapi belum punya email sama sekali.
    const { userId } = await buatPengguna(t, "Robert", { role: "dana" });

    const hasil = await admin.mutation(api.penyediaDana.ubahAkunPendana, {
      userId,
      nama: "Robert Tanaya",
      email: "  Robert.Tanaya@Pindai.test ",
      alasan: "melengkapi data login pendana warisan",
    });
    expect(hasil).toMatchObject({
      ok: true,
      sudahSesuai: false,
      akunLoginDiperbarui: 0,
      email: "robert.tanaya@pindai.test",
    });

    const sesudah = await t.run((ctx) => ctx.db.get(userId));
    expect(sesudah?.name).toBe("Robert Tanaya");
    expect(sesudah?.email).toBe("robert.tanaya@pindai.test");

    // Alamat baru benar-benar menjadi identitas masuk: akun ditemukan lewat
    // indeks email, dan datanya tetap satu akun (tidak ada akun kedua).
    const emailTerdaftar = await admin.query(api.penyediaDana.daftarInvestor, {});
    expect(emailTerdaftar.rows.find((r) => r.userId === userId)?.email).toBe(
      "robert.tanaya@pindai.test",
    );

    const audit = await t.run((ctx) =>
      ctx.db
        .query("auditLog")
        .collect()
        .then((rows) => rows.filter((r) => r.aksi === "ubah_akun_pendana")),
    );
    expect(audit).toHaveLength(1);
    expect(audit[0].detail).toContain("(belum ada)");
    expect(audit[0].detail).toContain("robert.tanaya@pindai.test");
  });

  it("memindahkan akun login ke alamat baru saat email pendana diganti", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const { userId } = await siapkanPengguna(t, "Robert", {
      email: "robert@pindai.test",
      role: "dana",
    });
    // Jejak login lamanya: akun kata sandi/`authAccounts` milik alamat lama.
    const akunLamaId = await t.run((ctx) =>
      ctx.db.insert("authAccounts", {
        userId,
        provider: "email-otp",
        providerAccountId: "robert@pindai.test",
      }),
    );

    const hasil = await admin.mutation(api.penyediaDana.ubahAkunPendana, {
      userId,
      nama: "Robert Tanaya",
      email: "robert.baru@pindai.test",
    });
    expect(hasil.akunLoginDiperbarui).toBe(1);

    const akun = await t.run((ctx) => ctx.db.get(akunLamaId));
    expect(akun?.providerAccountId).toBe("robert.baru@pindai.test");
    expect(akun?.provider).toBe("email-otp");
  });

  it("menolak email yang sudah dipakai akun lain, termasuk akun tim", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const { userId } = await siapkanPengguna(t, "Robert", {
      email: "robert@pindai.test",
      role: "dana",
    });
    await siapkanPengguna(t, "rani", { email: "rani@pindai.test", role: "peminjam" });

    await expect(
      admin.mutation(api.penyediaDana.ubahAkunPendana, {
        userId,
        nama: "Robert",
        email: "rani@pindai.test",
      }),
    ).rejects.toThrow(/sudah dipakai akun lain/i);

    await expect(
      admin.mutation(api.penyediaDana.ubahAkunPendana, {
        userId,
        nama: "Robert",
        email: "admin@pindai.test",
      }),
    ).rejects.toThrow(/akun tim/i);
  });

  it("menolak target akun tim, akun tamu, email tidak valid, dan pemanggil bukan admin", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin, userId: adminId } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const { sesi: pendana, userId: pendanaId } = await siapkanPengguna(t, "Robert", {
      email: "robert@pindai.test",
      role: "dana",
    });
    const tamu = await buatPengguna(t, "Pemantau bersama", { isAnonymous: true });

    await expect(
      admin.mutation(api.penyediaDana.ubahAkunPendana, {
        userId: adminId,
        nama: "Super Admin",
        email: "admin.baru@pindai.test",
      }),
    ).rejects.toThrow(/Akun tim/i);

    await expect(
      admin.mutation(api.penyediaDana.ubahAkunPendana, {
        userId: tamu.userId,
        nama: "Pemantau bersama",
        email: "pemantau@pindai.test",
      }),
    ).rejects.toThrow(/Akun tamu/i);

    await expect(
      admin.mutation(api.penyediaDana.ubahAkunPendana, {
        userId: pendanaId,
        nama: "Robert",
        email: "bukan-email",
      }),
    ).rejects.toThrow(/email yang valid/i);

    await expect(
      pendana.mutation(api.penyediaDana.ubahAkunPendana, {
        userId: pendanaId,
        nama: "Robert",
        email: "robert@pindai.test",
      }),
    ).rejects.toThrow(/Super Admin/i);
  });

  it("mengembalikan sudahSesuai tanpa menulis audit bila tidak ada yang berubah", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const { userId } = await siapkanPengguna(t, "Robert", {
      email: "robert@pindai.test",
      role: "dana",
    });

    const hasil = await admin.mutation(api.penyediaDana.ubahAkunPendana, {
      userId,
      nama: "Robert",
      email: "robert@pindai.test",
    });
    expect(hasil).toMatchObject({ ok: true, sudahSesuai: true, akunLoginDiperbarui: 0 });

    const audit = await t.run((ctx) =>
      ctx.db
        .query("auditLog")
        .collect()
        .then((rows) => rows.filter((r) => r.aksi === "ubah_akun_pendana")),
    );
    expect(audit).toHaveLength(0);
  });
});

