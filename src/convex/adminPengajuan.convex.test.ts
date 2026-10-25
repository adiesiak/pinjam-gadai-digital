/**
 * Tes pencatatan pengajuan manual oleh admin (pinjaman, gadai, kredit barang).
 * Jalankan: bunx vitest run src/convex/adminPengajuan.convex.test.ts
 *
 * Yang dijaga berkas ini — janji fitur "admin bisa menambahkan pengajuan secara
 * manual", supaya tidak diterjemahkan sebagai jalan pintas:
 *  1. barisnya benar-benar masuk antrean produknya dengan status `diajukan`,
 *     jadi keputusan tetap lewat dialog review yang sudah diaudit;
 *  2. plafon nasabah TIDAK mengikat jalur manual — pengajuan yang sudah
 *     diputuskan di luar aplikasi tetap bisa dipindahkan; yang tetap berlaku
 *     hanyalah batas produk & langit-langit sistem;
 *  3. identitas (NIK, WhatsApp, penghasilan, rekening) diambil dari data diri
 *     tersimpan, dan kredit barang menolak dicatat sebelum data diri lengkap;
 *  4. setiap pencatatan tercatat di Audit Trail dengan aksi `pengajuan_manual_*`;
 *  5. hanya admin terverifikasi TOTP yang bisa mencari nasabah dan mencatat.
 *
 * Kill switch sengaja TIDAK menutup jalur ini (diuji di akhir): kill switch
 * menghentikan pengajuan BARU dari aplikasi nasabah, sedangkan admin memakainya
 * justru saat alur normal bermasalah.
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { simpanBerkasUji, siapkanPengguna } from "./test.helpers";
import { modules } from "./test.setup";

/** Data diri lengkap satu nasabah — sumber identitas pencatatan manual. */
async function simpanDataDiri(
  t: ReturnType<typeof convexTest>,
  userId: Id<"users">,
  overrides: Partial<{
    namaLengkap: string;
    nik: string;
    nomorWhatsApp: string;
    namaBank: string;
    nomorRekening: string;
    penghasilanBulanan: number;
    pekerjaan: string;
  }> = {},
): Promise<void> {
  await t.run((ctx) =>
    ctx.db.insert("nasabahProfil", {
      userId,
      namaLengkap: overrides.namaLengkap ?? "Rani Peminjam",
      nik: overrides.nik ?? "3201234567890003",
      nomorWhatsApp: overrides.nomorWhatsApp ?? "628123456791",
      ...(overrides.namaBank !== undefined ? { namaBank: overrides.namaBank } : {}),
      ...(overrides.nomorRekening !== undefined
        ? { nomorRekening: overrides.nomorRekening }
        : {}),
      ...(overrides.pekerjaan !== undefined ? { pekerjaan: overrides.pekerjaan } : {}),
      ...(overrides.penghasilanBulanan !== undefined
        ? { penghasilanBulanan: overrides.penghasilanBulanan }
        : {}),
      diperbaruiPada: Date.now(),
      diperbaruiOlehLabel: "admin@pindai.test",
      sumber: "admin" as const,
    }),
  );
}

/** Baris audit terbaru untuk satu aksi. */
async function auditTerakhir(t: ReturnType<typeof convexTest>, aksi: string) {
  const rows = await t.run((ctx) => ctx.db.query("auditLog").collect());
  return rows.filter((row) => row.aksi === aksi).sort((a, b) => b.waktu - a.waktu)[0] ?? null;
}

describe("pencatatan pengajuan manual oleh admin", () => {
  it("mencatat pinjaman manual dari data diri dan masuk antrean review", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const { userId } = await siapkanPengguna(t, "rani", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    await simpanDataDiri(t, userId, {
      namaBank: "BRI",
      nomorRekening: "1234567890",
      pekerjaan: "Usaha warung",
      penghasilanBulanan: 3_500_000,
    });

    const hasil = await admin.mutation(api.adminPengajuan.catatPinjamanManual, {
      userIdTarget: userId,
      pokokPinjaman: 900_000,
      tenorHari: 28,
      tujuan: "modal_usaha",
      namaLengkap: "rani peminjam",
    });
    expect(hasil.nomorReferensi).toMatch(/^PGD-\d{8}-[A-Z2-9]{4}$/);

    const loan = await t.run((ctx) => ctx.db.get(hasil.appId));
    expect(loan).toMatchObject({
      userId,
      status: "diajukan",
      pokokPinjaman: 900_000,
      pokokDiajukan: 900_000,
      namaLengkap: "RANI PEMINJAM",
      namaBank: "BRI",
      nomorRekening: "1234567890",
      tenorHari: 28,
      // Identitas & pekerjaan datang dari data diri, bukan diketik admin.
      nik: "3201234567890003",
      nomorWhatsApp: "628123456791",
      penghasilanBulanan: 3_500_000,
      sumberPenghasilan: "Usaha warung",
      // Rp900.000/28 hari berada di Tier 2: bunga 35%.
      persenBunga: 35,
    });
    // Baris baru tidak melewati keputusan: catatan review masih kosong.
    expect(loan?.catatanReview).toBeUndefined();

    const user = await t.run((ctx) => ctx.db.get(userId));
    expect(user?.kodePeminjam).toMatch(/^PMN-/);

    const audit = await auditTerakhir(t, "pengajuan_manual_pinjaman");
    expect(audit?.target).toBe(hasil.nomorReferensi);
    // Label aktor = email admin, dan asal-usul manualnya tetap terbaca.
    expect(audit?.aktorLabel).toBe("admin@pindai.test");
    expect(audit?.detail).toContain("Pencatatan manual oleh admin");
    expect(audit?.detail).toContain("antrean review");
  });

  it("plafon nasabah TIDAK mengikat manual, tapi langit-langit Rp 10 juta tetap ada", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const { userId } = await siapkanPengguna(t, "budi", {
      email: "budi@pindai.test",
      role: "peminjam",
    });
    await simpanDataDiri(t, userId, { nomorRekening: "1234567890" });

    // Plafon nasabah diturunkan jauh di bawah pengajuan yang akan dicatat.
    await admin.mutation(api.admin.setPlafonPeminjam, {
      userId,
      plafon: 300_000,
      alasan: "Plafon diturunkan untuk uji",
    });

    // Pengajuan di ATAS plafon nasabah tetap tercatat: jalur ini memindahkan
    // pinjaman yang sudah diputuskan di luar aplikasi, jadi plafon dalam
    // aplikasi bukan syaratnya.
    await expect(
      admin.mutation(api.adminPengajuan.catatPinjamanManual, {
        userIdTarget: userId,
        pokokPinjaman: 9_000_000,
        tenorBulan: 3,
        tujuan: "modal_usaha",
        namaLengkap: "Budi Peminjam",
        namaBank: "BCA",
        nomorRekening: "1234567890",
      }),
    ).resolves.toMatchObject({ nomorReferensi: expect.stringMatching(/^PGD-/) });

    // Plafon nasabah TIDAK ikut berubah diam-diam: menaikkannya tetap keputusan
    // terpisah yang punya audit sendiri.
    const setelah = await t.run(async (ctx) => ctx.db.get(userId));
    expect(setelah?.plafonPinjaman).toBe(300_000);

    // Langit-langit sistem tetap: di atas Rp 10 juta ditolak.
    await expect(
      admin.mutation(api.adminPengajuan.catatPinjamanManual, {
        userIdTarget: userId,
        pokokPinjaman: 11_000_000,
        tenorBulan: 6,
        tujuan: "modal_usaha",
        namaLengkap: "Budi Peminjam",
        namaBank: "BCA",
        nomorRekening: "1234567890",
      }),
    ).rejects.toThrow(/maksimal Rp 10\.000\.000/);

    // Batas PRODUK skema harian Rp 1 juta TIDAK berlaku untuk pencatatan admin:
    // yang dicatat adalah pinjaman yang sudah diputuskan di luar aplikasi, jadi
    // yang mengikat hanya langit-langit jalur manual (Rp 10 juta).
    await expect(
      admin.mutation(api.adminPengajuan.catatPinjamanManual, {
        userIdTarget: userId,
        pokokPinjaman: 10_000_000,
        tenorHari: 28,
        tujuan: "modal_usaha",
        namaLengkap: "Budi Peminjam",
        namaBank: "BCA",
        nomorRekening: "1234567890",
      }),
    ).resolves.toMatchObject({ nomorReferensi: expect.stringMatching(/^PGD-/) });

    await expect(
      admin.mutation(api.adminPengajuan.catatPinjamanManual, {
        userIdTarget: userId,
        pokokPinjaman: 10_100_000,
        tenorHari: 28,
        tujuan: "modal_usaha",
        namaLengkap: "Budi Peminjam",
        namaBank: "BCA",
        nomorRekening: "1234567890",
      }),
    ).rejects.toThrow(/Pokok pinjaman harian harus antara/);
  });

  it("mencatat gadai manual sebagai diajukan tanpa menaksir barang", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const { userId } = await siapkanPengguna(t, "sari", {
      email: "sari@pindai.test",
      role: "peminjam",
    });

    const hasil = await admin.mutation(api.adminPengajuan.catatGadaiManual, {
      userIdTarget: userId,
      deskripsiBarang: "iPhone 14 Pro 256 GB, kotak lengkap",
      kategori: "Elektronik",
      alamatPenilaian: "Jl. Merdeka No. 10, Bandung",
      namaLengkap: "sari pemohon",
      namaBank: "DANA",
      nomorRekening: "081234567890",
    });

    const pawn = await t.run((ctx) => ctx.db.get(hasil.appId));
    expect(pawn).toMatchObject({
      userId,
      status: "diajukan",
      kategori: "Elektronik",
      namaLengkap: "SARI PEMOHON",
      nomorReferensi: hasil.nomorReferensi,
    });
    // Penilaian tim tidak boleh ditebak saat pencatatan manual.
    expect(pawn?.nilaiTaksiran).toBeUndefined();
    expect(pawn?.hargaPasar).toBeUndefined();
    expect(pawn?.kondisiFisik).toBeUndefined();

    const audit = await auditTerakhir(t, "pengajuan_manual_gadai");
    expect(audit?.target).toBe(hasil.nomorReferensi);
  });

  it("menolak kredit manual sebelum data diri lengkap, lalu memakai identitas data diri", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const { userId } = await siapkanPengguna(t, "dina", {
      email: "dina@pindai.test",
      role: "peminjam",
    });

    const permintaan = {
      userIdTarget: userId,
      namaBarang: "Samsung Galaxy A55 8/256",
      kategori: "Elektronik",
      merchant: "Tokopedia",
      hargaBarang: 5_000_000,
      tenorBulan: 6,
    } as const;

    await expect(
      admin.mutation(api.adminPengajuan.catatKreditManual, permintaan),
    ).rejects.toThrow(/Data diri nasabah belum lengkap/);

    await simpanDataDiri(t, userId, { nomorRekening: "1234567892" });
    const hasil = await admin.mutation(api.adminPengajuan.catatKreditManual, permintaan);
    expect(hasil.nomorReferensi).toMatch(/^KRD-\d{8}-[A-Z2-9]{4}$/);

    const kredit = await t.run((ctx) => ctx.db.get(hasil.appId));
    expect(kredit).toMatchObject({
      userId,
      status: "diajukan",
      // DP wajib: tanpa isian admin, form memakai DP bawaan 20%.
      dpPersen: 20,
      tenorBulan: 6,
      hargaBarang: 5_000_000,
      namaLengkap: "Rani Peminjam",
      nik: "3201234567890003",
      nomorWhatsApp: "628123456791",
      // Rekening kosong di form diisi dari data diri, bukan string kosong.
      nomorRekening: "1234567892",
    });

    const audit = await auditTerakhir(t, "pengajuan_manual_kredit");
    expect(audit?.target).toBe(hasil.nomorReferensi);
  });

  it("hanya admin terverifikasi yang boleh mencari nasabah dan mencatat", async () => {
    const t = convexTest(schema, modules);
    const { sesi: peminjam } = await siapkanPengguna(t, "rini", {
      email: "rini@pindai.test",
      role: "peminjam",
    });
    const { userId: targetId } = await siapkanPengguna(t, "bayu", {
      email: "bayu@pindai.test",
      role: "peminjam",
    });

    await expect(peminjam.query(api.adminPengajuan.cariNasabah, { kueri: "" })).rejects.toThrow(
      /Akses khusus/i,
    );
    await expect(
      peminjam.mutation(api.adminPengajuan.catatPinjamanManual, {
        userIdTarget: targetId,
        pokokPinjaman: 500_000,
        tenorHari: 28,
        tujuan: "modal_usaha",
        namaLengkap: "Bayu Peminjam",
        namaBank: "BCA",
        nomorRekening: "1234567890",
      }),
    ).rejects.toThrow(/Akses khusus/i);
    // Tidak ada baris yang tercipta saat gerbang menolak.
    const loans = await t.run((ctx) => ctx.db.query("loans").collect());
    expect(loans).toHaveLength(0);
  });

  it("pemilih nasabah menawarkan nasabah biasa, bukan akun admin, dan menandai data diri", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const { userId: denganDataDiri } = await siapkanPengguna(t, "rani", {
      email: "rani@pindai.test",
      role: "peminjam",
    });
    const { userId: tanpaDataDiri } = await siapkanPengguna(t, "bayu", {
      email: "bayu@pindai.test",
      role: "peminjam",
    });
    await simpanDataDiri(t, denganDataDiri, { nomorRekening: "1234567890" });

    const semua = await admin.query(api.adminPengajuan.cariNasabah, { kueri: "" });
    const idDitemukan = semua.hasil.map((n) => n.userId);
    expect(idDitemukan).toContain(denganDataDiri);
    expect(idDitemukan).toContain(tanpaDataDiri);
    expect(idDitemukan).not.toContain(
      (await admin.query(api.adminPengajuan.cariNasabah, { kueri: "admin@pindai.test" })).hasil[0]
        ?.userId,
    );

    const pencarian = await admin.query(api.adminPengajuan.cariNasabah, { kueri: "rani" });
    expect(pencarian.hasil).toHaveLength(1);
    // Nama diambil dari data diri (KTP) dan selalu HURUF BESAR — sama dengan
    // data pinjaman di ruang penyedia dana.
    expect(pencarian.hasil[0]).toMatchObject({
      nama: "RANI PEMINJAM",
      email: "rani@pindai.test",
      adaDataDiri: true,
      dibuatAdmin: false,
      nomorRekening: "1234567890",
    });

    const kosong = await admin.query(api.adminPengajuan.cariNasabah, { kueri: "tidak-ada" });
    expect(kosong.hasil).toHaveLength(0);
  });

  it("kill switch tidak menutup pencatatan manual admin", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin@pindai.test",
      role: "admin",
    });
    const { userId } = await siapkanPengguna(t, "tomi", {
      email: "tomi@pindai.test",
      role: "peminjam",
    });
    await t.run((ctx) =>
      ctx.db.insert("systemConfig", {
        slot: "global",
        killSwitch: true,
        diperbaruiPada: Date.now(),
      }),
    );

    await expect(
      admin.mutation(api.adminPengajuan.catatGadaiManual, {
        userIdTarget: userId,
        deskripsiBarang: "Sepeda motor Honda Beat 2020",
        kategori: "Kendaraan",
        alamatPenilaian: "Jl. Sudirman No. 5, Jakarta",
        namaLengkap: "Tomi Pemohon",
        namaBank: "BCA",
        nomorRekening: "1234567891",
      }),
    ).resolves.toMatchObject({ nomorReferensi: expect.stringMatching(/^PGD-/) });
  });

  it("mencatat pemohon BARU tanpa akun, lalu pengajuan + dokumennya", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin-walkin@pindai.test",
      role: "admin",
    });
    const fotoKtp = await simpanBerkasUji(t, "ktp");

    const pemohon = await admin.mutation(api.adminPengajuan.buatNasabahBaru, {
      namaLengkap: "  asep firm an  hanafi ",
      nik: "3201 2345 6789 0001",
      nomorWhatsApp: "62 812-3456-7890",
      alamat: "Jl. Merdeka No. 10",
      pekerjaan: "Pedagang",
      penghasilanBulanan: 2_500_000,
      namaBank: "BRI",
      nomorRekening: "1234-567-890",
      fotoKtpId: fotoKtp,
    });

    // Nama HURUF BESAR dan data diri langsung siap dipakai formulir pengajuan.
    expect(pemohon).toMatchObject({
      nama: "ASEP FIRM AN HANAFI",
      email: null,
      adaDataDiri: true,
      dibuatAdmin: true,
      namaBank: "BRI",
      nomorRekening: "1234567890",
    });

    const state = await t.run(async (ctx) => ({
      user: await ctx.db.get(pemohon.userId),
      akunAuth: await ctx.db.query("authAccounts").collect(),
      profil: await ctx.db.query("nasabahProfil").collect(),
    }));
    expect(state.user).toMatchObject({ name: "ASEP FIRM AN HANAFI", role: "peminjam" });
    expect(state.user?.dibuatAdminPada).toBeTypeOf("number");
    expect(state.user?.kodePeminjam).toMatch(/^PMN-/);
    // Akun pencatatan SENGAJA tanpa kredensial: pemohon tidak bisa masuk dengan
    // akun ini, tetapi pengajuan & data dirinya punya pemilik yang sah.
    expect(state.akunAuth).toHaveLength(0);
    expect(state.profil[0]).toMatchObject({
      namaLengkap: "ASEP FIRM AN HANAFI",
      nik: "3201234567890001",
      nomorWhatsApp: "6281234567890",
      fotoKtpId: fotoKtp,
    });

    const auditPemohon = await auditTerakhir(t, "nasabah_baru_manual");
    expect(auditPemohon?.target).toBe("ASEP FIRM AN HANAFI");
    expect(auditPemohon?.detail).toContain("tanpa akun aplikasi");

    // Pengajuan pinjaman atas nama pemohon baru ini langsung bisa dicatat, dan
    // ketiga dokumen KYC ikut tersimpan pada baris pinjamannya.
    const selfie = await simpanBerkasUji(t, "selfie");
    const slip = await simpanBerkasUji(t, "slip");
    const hasil = await admin.mutation(api.adminPengajuan.catatPinjamanManual, {
      userIdTarget: pemohon.userId,
      pokokPinjaman: 900_000,
      tenorHari: 28,
      tujuan: "modal_usaha",
      dokSelfieKtpId: selfie,
      dokSlipGajiId: slip,
    });
    const loan = await t.run((ctx) => ctx.db.get(hasil.appId));
    expect(loan).toMatchObject({
      status: "diajukan",
      namaLengkap: "ASEP FIRM AN HANAFI",
      namaBank: "BRI",
      nomorRekening: "1234567890",
      nik: "3201234567890001",
      nomorWhatsApp: "6281234567890",
      penghasilanBulanan: 2_500_000,
      // Foto KTP mengikuti data diri; dua berkas lain dari unggahan admin.
      dokKtpId: fotoKtp,
      dokSelfieKtpId: selfie,
      dokSlipGajiId: slip,
    });

    const auditPinjaman = await auditTerakhir(t, "pengajuan_manual_pinjaman");
    expect(auditPinjaman?.detail).toContain("dokumen: KTP, selfie KTP, bukti penghasilan");
  });

  it("menolak NIK yang sudah tercatat dan menolak non-admin", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin-ganda@pindai.test",
      role: "admin",
    });
    const { sesi: peminjam } = await siapkanPengguna(t, "dina", {
      email: "dina-ganda@pindai.test",
      role: "peminjam",
    });

    const identitas = {
      namaLengkap: "Dina Pemohon",
      nik: "3201234567890009",
      nomorWhatsApp: "628123456792",
      alamat: "Jl. Melati No. 2",
      pekerjaan: "Karyawan",
      penghasilanBulanan: null,
      namaBank: "BCA",
      nomorRekening: "1234567892",
    };

    await expect(
      peminjam.mutation(api.adminPengajuan.buatNasabahBaru, identitas),
    ).rejects.toThrow(/Super Admin/i);

    await expect(
      admin.mutation(api.adminPengajuan.buatNasabahBaru, identitas),
    ).resolves.toMatchObject({ dibuatAdmin: true });

    // Satu orang satu data diri: NIK yang sama tidak membuat akun kedua.
    await expect(
      admin.mutation(api.adminPengajuan.buatNasabahBaru, {
        ...identitas,
        namaLengkap: "Dina Kedua",
      }),
    ).rejects.toThrow(/sudah tercatat/i);

    const jumlah = await t.run(async (ctx) => ({
      users: await ctx.db.query("users").collect(),
      profil: await ctx.db.query("nasabahProfil").collect(),
    }));
    expect(jumlah.profil).toHaveLength(1);
    // admin@pindai.test + dina@pindai.test + satu pemohon walk-in.
    expect(jumlah.users).toHaveLength(3);
  });

  it("menolak duplikat saat NIK salah ketik tapi nomor WhatsApp sama", async () => {
    // Duplikat nyata dari data luar aplikasi: orang yang sama dicatat dua kali
    // karena NIK-nya salah ketik (satu digit berbeda), sehingga muncul nama
    // typo di samping nama lengkapnya. Nomor WhatsApp yang sama harus menolak
    // pembuatan akun kedua.
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin-duplikat@pindai.test",
      role: "admin",
    });

    const identitas = {
      namaLengkap: "Alfian Rifki Juniawan",
      nik: "3201234567890003",
      nomorWhatsApp: "628123456791",
      alamat: "Jl. Kenanga No. 5",
      pekerjaan: "Karyawan",
      penghasilanBulanan: null,
      namaBank: "BCA",
      nomorRekening: "1234567890",
    };
    await admin.mutation(api.adminPengajuan.buatNasabahBaru, identitas);

    await expect(
      admin.mutation(api.adminPengajuan.buatNasabahBaru, {
        ...identitas,
        namaLengkap: "Alifan",
        nik: "3201234567890004",
      }),
    ).rejects.toThrow(/Nomor WhatsApp ini sudah tercatat/i);

    // Satu orang tetap satu baris, dan nama yang tampil adalah yang lengkap —
    // tidak ada salinan typo yang ikut ditawarkan ke admin.
    const semua = await admin.query(api.adminPengajuan.cariNasabah, { kueri: "" });
    expect(semua.hasil.map((n) => n.nama)).toEqual(["ALFIAN RIFKI JUNIAWAN"]);
  });

  it("pemilih nasabah memakai nama CATATAN terbaru — sama dengan ruang penyedia dana", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin-nama@pindai.test",
      role: "admin",
    });
    const { userId } = await siapkanPengguna(t, "hasbi", {
      email: "hasbi@pindai.test",
      role: "peminjam",
    });
    // Data diri (KTP) memakai ejaan yang lebih lengkap…
    await simpanDataDiri(t, userId, { namaLengkap: "Hasbi Sukmanda Wijaya" });
    // …sedangkan catatan pinjamanlah yang tampil di ruang penyedia dana. Nama
    // dari catatan itu yang harus ditawarkan ke admin, supaya pengajuan manual
    // berikutnya tidak tercatat dengan nama yang berbeda dari ruang dana.
    await t.run((ctx) =>
      ctx.db.insert("loans", {
        userId,
        pokokPinjaman: 900_000,
        pokokDiajukan: 900_000,
        tujuan: "modal_usaha",
        namaLengkap: "HASBI SUKMANDA",
        namaBank: "BCA",
        nomorRekening: "1234567890",
        status: "diajukan",
        nomorReferensi: "PGD-20260101-AAAA",
        tenorHari: 30,
      }),
    );

    const hasil = await admin.query(api.adminPengajuan.cariNasabah, { kueri: "hasbi" });
    expect(hasil.hasil).toHaveLength(1);
    expect(hasil.hasil[0]?.nama).toBe("HASBI SUKMANDA");

    // Nama data diri tetap bisa dicari — ia cadangan yang dipakai bila nasabah
    // belum punya catatan sama sekali.
    const lewatDataDiri = await admin.query(api.adminPengajuan.cariNasabah, {
      kueri: "sukmanda wijaya",
    });
    expect(lewatDataDiri.hasil.map((n) => n.nama)).toEqual(["HASBI SUKMANDA"]);
  });
});
