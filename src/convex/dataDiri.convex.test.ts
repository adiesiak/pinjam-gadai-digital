/**
 * Tes data diri nasabah (admin) — isi, sunting, dan baca.
 *
 * Aturan yang dijaga:
 *  - hanya admin yang bisa membaca & menulis; akun tim (admin) sendiri tak bisa
 *    dijadikan target;
 *  - nilai yang tersimpan sudah DINORMALKAN (digit NIK/WA/rekening, angka
 *    penghasilan) — sama dengan aturan form di lib/dataDiri.ts;
 *  - isian tidak valid ditolak tanpa menulis apa pun;
 *  - setiap perubahan tercatat di Audit Trail;
 *  - foto KTP adalah referensi storage (dipasang dari kosong, atau dikosongkan);
 *  - menghapus akun nasabah ikut membersihkan baris data dirinya.
 *
 * Menjalankan: bunx vitest run src/convex/dataDiri.convex.test.ts
 *
 * Catatan: convexTest belum mendukung syscall `storage.getMetadata`, jadi tes
 * ini tidak mengganti/menghapus foto yang SUDAH ada (pola yang sama dipakai tes
 * hapus pinjaman). Pemasangan dari kosong dan pengosongan tetap diuji.
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { buatPengguna, simpanBerkasUji, siapkanPengguna } from "./test.helpers";
import { modules } from "./test.setup";

const NIK = "3271012345678901";
const WA = "6281234567890";

describe("data diri nasabah (admin)", () => {
  it("admin mengisi data diri → tersimpan ternormalisasi + tercatat di audit", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin-dd@pindai.test",
      role: "admin",
    });
    const { userId } = await siapkanPengguna(t, "Rani", {
      email: "rani-dd@pindai.test",
      role: "peminjam",
    });

    await expect(
      admin.mutation(api.admin.simpanDataDiriNasabah, {
        userId,
        namaLengkap: "  Rani   Puspita ",
        nik: "3271 0123 4567 8901",
        nomorWhatsApp: "62 812-3456-7890",
        alamat: "Jalan Merdeka No. 10, Bandung",
        pekerjaan: "Karyawan swasta",
        penghasilanBulanan: 5_000_000,
        namaBank: "BCA",
        nomorRekening: "1234-567-890",
      }),
    ).resolves.toMatchObject({ ok: true });

    const hasil = await t.run(async (ctx) => ({
      profil: await ctx.db.query("nasabahProfil").collect(),
      akun: await ctx.db.get(userId),
      audit: await ctx.db.query("auditLog").collect(),
    }));

    expect(hasil.profil).toHaveLength(1);
    // Nama disimpan HURUF BESAR (lib/nama.ts) supaya seragam di semua layar.
    expect(hasil.profil[0]).toMatchObject({
      userId,
      namaLengkap: "RANI PUSPITA",
      nik: NIK,
      nomorWhatsApp: WA,
      nomorRekening: "1234567890",
      penghasilanBulanan: 5_000_000,
    });
    // Nama akun mengikuti nama KTP: layar yang membaca `users.name` (pemilih
    // nasabah, panel plafon) menampilkan nama yang sama dengan ruang penyedia.
    expect(hasil.akun?.name).toBe("RANI PUSPITA");
    expect(hasil.audit.map((a) => a.aksi)).toContain("ubah_data_diri");

    // Query panel mengembalikan isian siap-pakai untuk form.
    const baca = await admin.query(api.admin.dataDiriNasabah, { userId });
    expect(baca.ada).toBe(true);
    expect(baca.data.nik).toBe(NIK);
    expect(baca.data.nomorWhatsApp).toBe(WA);
    expect(baca.data.penghasilanBulanan).toBe(5_000_000);
    expect(baca.fotoKtpUrl).toBeNull();
  });

  it("isian tidak valid ditolak tanpa menulis apa pun", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin-dd2@pindai.test",
      role: "admin",
    });
    const { userId } = await siapkanPengguna(t, "Rani", {
      email: "rani-dd2@pindai.test",
      role: "peminjam",
    });

    await expect(
      admin.mutation(api.admin.simpanDataDiriNasabah, {
        userId,
        namaLengkap: "Rani Puspita",
        nik: "12345",
        nomorWhatsApp: WA,
        alamat: "",
        pekerjaan: "",
        penghasilanBulanan: null,
        namaBank: "",
        nomorRekening: "",
      }),
    ).rejects.toThrow(/16 angka/);

    // Penghasilan berkoma ditolak, bukan "diperbaiki" diam-diam jadi 55.
    await expect(
      admin.mutation(api.admin.simpanDataDiriNasabah, {
        userId,
        namaLengkap: "Rani Puspita",
        nik: NIK,
        nomorWhatsApp: WA,
        alamat: "",
        pekerjaan: "",
        penghasilanBulanan: 5.5,
        namaBank: "",
        nomorRekening: "",
      }),
    ).rejects.toThrow(/rupiah bulat/);

    const profil = await t.run((ctx) => ctx.db.query("nasabahProfil").collect());
    expect(profil).toHaveLength(0);
  });

  it("foto KTP dari kosong tersimpan; menyimpan ulang tidak menghapusnya", async () => {
    // Catatan: mengganti/menghapus foto yang SUDAH ada memakai
    // `storage.getMetadata` — syscall yang belum didukung convexTest.
    // Karena itu jalur itu tidak diuji di sini (pola yang sama dipakai tes
    // hapus pinjaman untuk berkas KYC). Yang diuji: pemasangan dari kosong,
    // dan `fotoKtpId` yang tidak disebut tidak mengubah foto yang ada.
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin-dd3@pindai.test",
      role: "admin",
    });
    const { userId } = await siapkanPengguna(t, "Rani", {
      email: "rani-dd3@pindai.test",
      role: "peminjam",
    });
    // Berkas diberi tipe gambar: server memeriksa metadata gambar sebelum
    // menyimpan (bukan hanya form), jadi blob tanpa tipe memang ditolak.
    const fotoId = await simpanBerkasUji(t, "ktp-rani");

    const dasar = {
      userId,
      namaLengkap: "Rani Puspita",
      nik: NIK,
      nomorWhatsApp: WA,
      alamat: "",
      pekerjaan: "",
      penghasilanBulanan: null,
      namaBank: "",
      nomorRekening: "",
    };

    await admin.mutation(api.admin.simpanDataDiriNasabah, { ...dasar, fotoKtpId: fotoId });
    let profil = await t.run((ctx) => ctx.db.query("nasabahProfil").collect());
    expect(profil).toHaveLength(1);
    expect(profil[0].fotoKtpId).toBe(fotoId);

    // Menyimpan tanpa menyebut foto tidak menghapusnya.
    await admin.mutation(api.admin.simpanDataDiriNasabah, dasar);
    profil = await t.run((ctx) => ctx.db.query("nasabahProfil").collect());
    expect(profil[0].fotoKtpId).toBe(fotoId);

    // Pada data diri kosong, `null` tetap berarti "tanpa foto" (tidak error).
    const { userId: lain } = await siapkanPengguna(t, "Dewi", {
      email: "dewi-dd3@pindai.test",
      role: "peminjam",
    });
    await admin.mutation(api.admin.simpanDataDiriNasabah, {
      ...dasar,
      userId: lain,
      fotoKtpId: null,
    });
    const lainProfil = await t.run((ctx) => ctx.db.query("nasabahProfil").collect());
    expect(lainProfil.find((p) => p.userId === lain)?.fotoKtpId).toBeUndefined();

    // Audit mencatat foto KTP pernah tersimpan.
    const audit = await t.run((ctx) => ctx.db.query("auditLog").collect());
    expect(audit.some((a) => a.detail?.includes("foto KTP tersimpan"))).toBe(true);
  });

  it("bukan admin: tidak bisa membaca maupun menyimpan; akun tim juga ditolak", async () => {
    const t = convexTest(schema, modules);
    const { userId: adminId } = await siapkanPengguna(t, "admin", {
      email: "admin-dd4@pindai.test",
      role: "admin",
    });
    const { sesi: admin } = await siapkanPengguna(t, "admin2", {
      email: "admin-dd4b@pindai.test",
      role: "admin",
    });
    const { sesi: peminjam, userId } = await siapkanPengguna(t, "Rani", {
      email: "rani-dd4@pindai.test",
      role: "peminjam",
    });

    const isian = {
      userId,
      namaLengkap: "Rani Puspita",
      nik: NIK,
      nomorWhatsApp: WA,
      alamat: "",
      pekerjaan: "",
      penghasilanBulanan: null,
      namaBank: "",
      nomorRekening: "",
    };

    await expect(peminjam.query(api.admin.dataDiriNasabah, { userId })).rejects.toThrow(/admin/i);
    await expect(peminjam.mutation(api.admin.simpanDataDiriNasabah, isian)).rejects.toThrow(/admin/i);

    // Nasabah boleh dijadikan target, akun tim (admin) tidak.
    await expect(
      admin.mutation(api.admin.simpanDataDiriNasabah, { ...isian, userId: adminId }),
    ).rejects.toThrow(/akun tim/i);
  });

  it("menghapus akun nasabah ikut membersihkan baris data dirinya", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin-dd5@pindai.test",
      role: "admin",
    });
    const { userId } = await siapkanPengguna(t, "Rani", {
      email: "rani-dd5@pindai.test",
      role: "peminjam",
    });

    await admin.mutation(api.admin.simpanDataDiriNasabah, {
      userId,
      namaLengkap: "Rani Puspita",
      nik: NIK,
      nomorWhatsApp: WA,
      alamat: "",
      pekerjaan: "",
      penghasilanBulanan: null,
      namaBank: "",
      nomorRekening: "",
    });

    await admin.mutation(api.admin.hapusNasabah, {
      userId,
      alasan: "Permintaan penghapusan data dari nasabah.",
    });

    const sisa = await t.run(async (ctx) => ({
      user: await ctx.db.get(userId),
      profil: await ctx.db.query("nasabahProfil").collect(),
    }));
    expect(sisa.user).toBeNull();
    expect(sisa.profil).toHaveLength(0);
  });
});

describe("data diri mandiri (nasabah)", () => {
  it("nasabah mengisi data dirinya sendiri; sumber tercatat 'nasabah'", async () => {
    const t = convexTest(schema, modules);
    const { sesi: peminjam, userId } = await siapkanPengguna(t, "Rani", {
      email: "rani-sv@pindai.test",
      role: "peminjam",
    });

    await expect(
      peminjam.mutation(api.profilNasabah.simpanDataDiriSaya, {
        namaLengkap: "Rani Puspita",
        nik: "3271 0123 4567 8901",
        nomorWhatsApp: "62 812-3456-7890",
        alamat: "Jalan Merdeka No. 10, Bandung",
        pekerjaan: "Karyawan swasta",
        penghasilanBulanan: 4_000_000,
        namaBank: "BCA",
        nomorRekening: "1234567890",
      }),
    ).resolves.toMatchObject({ ok: true });

    const baca = await peminjam.query(api.profilNasabah.dataDiriSaya, {});
    expect(baca.ada).toBe(true);
    expect(baca.data.nik).toBe(NIK);
    expect(baca.data.nomorWhatsApp).toBe(WA);
    expect(baca.sumber).toBe("nasabah");

    const audit = await t.run((ctx) => ctx.db.query("auditLog").collect());
    expect(audit.some((a) => a.aksi === "data_diri_sendiri")).toBe(true);
    // Baris tersimpan atas nama pemilik akun itu sendiri.
    const baris = await t.run((ctx) => ctx.db.query("nasabahProfil").collect());
    expect(baris).toHaveLength(1);
    expect(baris[0].userId).toBe(userId);
  });

  it("suntingan admin sesudahnya menimpa dan menandai sumber 'admin'", async () => {
    const t = convexTest(schema, modules);
    const { sesi: peminjam, userId } = await siapkanPengguna(t, "Rani", {
      email: "rani-sv2@pindai.test",
      role: "peminjam",
    });
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin-sv2@pindai.test",
      role: "admin",
    });

    const isian = {
      namaLengkap: "Rani Puspita",
      nik: NIK,
      nomorWhatsApp: WA,
      alamat: "",
      pekerjaan: "",
      penghasilanBulanan: null,
      namaBank: "",
      nomorRekening: "",
    };
    await peminjam.mutation(api.profilNasabah.simpanDataDiriSaya, isian);
    await admin.mutation(api.admin.simpanDataDiriNasabah, { ...isian, userId });

    const baca = await peminjam.query(api.profilNasabah.dataDiriSaya, {});
    expect(baca.sumber).toBe("admin");
    // Hanya satu baris — suntingan admin memperbarui, bukan menambah.
    const baris = await t.run((ctx) => ctx.db.query("nasabahProfil").collect());
    expect(baris).toHaveLength(1);
  });

  it("akun tamu ditolak; akun baru TANPA peran tetap boleh (tanpa regresi dashboard)", async () => {
    const t = convexTest(schema, modules);
    const { sesi: tamu } = await siapkanPengguna(t, "Tamu", {
      email: "tamu-sv@pindai.test",
      role: "peminjam",
    });
    await t.run(async (ctx) => {
      const u = await ctx.db.query("users").first();
      if (u !== null) await ctx.db.patch(u._id, { isAnonymous: true });
    });
    await expect(tamu.query(api.profilNasabah.dataDiriSaya, {})).rejects.toThrow(/tamu/i);

    // Akun baru tanpa peran — dashboard tidak boleh gagal; gerbangnya sama
    // dengan endpoint Peminjam lain (cukup sudah masuk, bukan tamu).
    const { sesi: baru } = await buatPengguna(t, "Baru", { email: "baru-sv@pindai.test" });
    await expect(
      baru.mutation(api.profilNasabah.simpanDataDiriSaya, {
        namaLengkap: "Nasabah Baru",
        nik: NIK,
        nomorWhatsApp: WA,
        alamat: "",
        pekerjaan: "",
        penghasilanBulanan: null,
        namaBank: "",
        nomorRekening: "",
      }),
    ).resolves.toMatchObject({ ok: true });
  });
});

describe("putusan verifikasi identitas (admin)", () => {
  const isian = (userId: Id<"users">) => ({
    userId,
    namaLengkap: "Rani Puspita",
    nik: NIK,
    nomorWhatsApp: WA,
    alamat: "",
    pekerjaan: "",
    penghasilanBulanan: null,
    namaBank: "",
    nomorRekening: "",
  });

  it("menyimpan data diri TIDAK memverifikasi identitas (unggahan ≠ terverifikasi)", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin-ver1@pindai.test",
      role: "admin",
    });
    const { userId } = await siapkanPengguna(t, "Rani", {
      email: "rani-ver1@pindai.test",
      role: "peminjam",
    });

    await admin.mutation(api.admin.simpanDataDiriNasabah, isian(userId));
    // Lengkapi juga foto KTP — tetap tidak boleh dianggap terverifikasi.
    const fotoId = await simpanBerkasUji(t, "ktp");
    await admin.mutation(api.admin.simpanDataDiriNasabah, { ...isian(userId), fotoKtpId: fotoId });

    const baca = await admin.query(api.admin.dataDiriNasabah, { userId });
    expect(baca.verifikasiIdentitas).toBeNull();
    const profil = await t.run((ctx) => ctx.db.query("nasabahProfil").first());
    expect(profil?.verifikasiIdentitas).toBeUndefined();
  });

  it("petugas mencatat putusan; penolakan wajib beralasan + tercatat audit", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin-ver2@pindai.test",
      role: "admin",
    });
    const { userId } = await siapkanPengguna(t, "Rani", {
      email: "rani-ver2@pindai.test",
      role: "peminjam",
    });
    await admin.mutation(api.admin.simpanDataDiriNasabah, isian(userId));

    // Tolak tanpa catatan → ditolak server.
    await expect(
      admin.mutation(api.admin.verifikasiIdentitasNasabah, { userId, status: "ditolak" }),
    ).rejects.toThrow(/alasan/i);

    await expect(
      admin.mutation(api.admin.verifikasiIdentitasNasabah, {
        userId,
        status: "ditolak",
        catatan: "Foto KTP buram, NIK tidak terbaca",
      }),
    ).resolves.toMatchObject({ ok: true });

    let baca = await admin.query(api.admin.dataDiriNasabah, { userId });
    expect(baca.verifikasiIdentitas?.status).toBe("ditolak");
    expect(baca.verifikasiIdentitas?.catatan).toBe("Foto KTP buram, NIK tidak terbaca");

    // Petugas lain menandai terverifikasi — putusan terbaru menimpa.
    await admin.mutation(api.admin.verifikasiIdentitasNasabah, {
      userId,
      status: "terverifikasi",
      catatan: "Dokumen jelas",
    });
    baca = await admin.query(api.admin.dataDiriNasabah, { userId });
    expect(baca.verifikasiIdentitas?.status).toBe("terverifikasi");

    const audit = await t.run((ctx) => ctx.db.query("auditLog").collect());
    expect(audit.map((a) => a.aksi)).toContain("verifikasi_identitas_ditolak");
    expect(audit.map((a) => a.aksi)).toContain("verifikasi_identitas");
    // Audit tidak membocorkan NIK utuh.
    const baris = audit.find((a) => a.aksi === "verifikasi_identitas");
    expect(baris?.detail).not.toContain(NIK);
  });

  it("bukan admin ditolak; akun tim & nasabah tanpa data diri juga ditolak", async () => {
    const t = convexTest(schema, modules);
    const { userId: adminId } = await siapkanPengguna(t, "admin", {
      email: "admin-ver3@pindai.test",
      role: "admin",
    });
    const { sesi: admin } = await siapkanPengguna(t, "admin2", {
      email: "admin-ver3b@pindai.test",
      role: "admin",
    });
    const { sesi: peminjam, userId } = await siapkanPengguna(t, "Rani", {
      email: "rani-ver3@pindai.test",
      role: "peminjam",
    });

    await expect(
      peminjam.mutation(api.admin.verifikasiIdentitasNasabah, {
        userId,
        status: "terverifikasi",
      }),
    ).rejects.toThrow(/admin/i);

    // Data diri belum ada → tidak bisa diputuskan.
    await expect(
      admin.mutation(api.admin.verifikasiIdentitasNasabah, { userId, status: "terverifikasi" }),
    ).rejects.toThrow(/data diri/i);

    // Akun tim tidak dijadikan target putusan.
    await admin.mutation(api.admin.simpanDataDiriNasabah, isian(userId));
    await expect(
      admin.mutation(api.admin.verifikasiIdentitasNasabah, {
        userId: adminId,
        status: "terverifikasi",
      }),
    ).rejects.toThrow(/akun tim/i);
  });

  it("putusan dihapus saat nama/NIK/foto berubah, tetapi bertahan saat alamat berubah", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin-ver4@pindai.test",
      role: "admin",
    });
    const { userId } = await siapkanPengguna(t, "Rani", {
      email: "rani-ver4@pindai.test",
      role: "peminjam",
    });
    await admin.mutation(api.admin.simpanDataDiriNasabah, isian(userId));
    await admin.mutation(api.admin.verifikasiIdentitasNasabah, {
      userId,
      status: "terverifikasi",
    });

    // Perubahan yang BUKAN identitas tidak menghapus putusan.
    await admin.mutation(api.admin.simpanDataDiriNasabah, {
      ...isian(userId),
      alamat: "Jalan Baru No. 1",
    });
    let baca = await admin.query(api.admin.dataDiriNasabah, { userId });
    expect(baca.verifikasiIdentitas?.status).toBe("terverifikasi");

    // Mengubah NIK menghapus putusan lama.
    await admin.mutation(api.admin.simpanDataDiriNasabah, {
      ...isian(userId),
      nik: "3271012345678902",
    });
    baca = await admin.query(api.admin.dataDiriNasabah, { userId });
    expect(baca.verifikasiIdentitas).toBeNull();

    // Audit menyebut putusan lama dihapus karena data identitas berubah.
    const audit = await t.run((ctx) => ctx.db.query("auditLog").collect());
    expect(
      audit.some((a) => a.detail?.includes("Putusan verifikasi identitas DIHAPUS")),
    ).toBe(true);

    // Memverifikasi ulang menghapus catatan lama; foto baru juga menghapusnya.
    await admin.mutation(api.admin.verifikasiIdentitasNasabah, {
      userId,
      status: "terverifikasi",
    });
    const fotoId = await simpanBerkasUji(t, "ktp");
    await admin.mutation(api.admin.simpanDataDiriNasabah, {
      ...isian(userId),
      nik: "3271012345678902",
      fotoKtpId: fotoId,
    });
    baca = await admin.query(api.admin.dataDiriNasabah, { userId });
    expect(baca.verifikasiIdentitas).toBeNull();
  });
});
