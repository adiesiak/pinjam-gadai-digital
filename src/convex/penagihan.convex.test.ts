/**
 * Uji integrasi modul penagihan (`convex/penagihan.ts`).
 *
 * Yang dibuktikan di sini, sesuai permintaan modul:
 *  - akses: tanpa sesi, peran non-admin, dan admin tanpa TOTP ditolak;
 *  - kewenangan: petugas hanya menindak kasus yang ditugaskan kepadanya;
 *  - pencatatan komunikasi: waktu (dari server), petugas, dan hasil tersimpan,
 *    pesan yang mengancam/menyebar data/kontak pihak lain DITOLAK;
 *  - eskalasi: naik bertingkat, tingkat yang butuh persetujuan wajib beralasan;
 *  - pembaruan status pembayaran: tidak boleh mengklaim lunas di bawah kewajiban;
 *  - kontak & rekening nasabah hanya keluar tersamar, dan pembukaan nomor utuh
 *    meninggalkan jejak audit.
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { jamWIB, pesanPengingatNetral } from "../lib/penagihan";
import { api } from "./_generated/api";
import schema from "./schema";
import { buatPengguna, buatSesi, siapkanPengguna, type KonteksUji } from "./test.helpers";
import { modules } from "./test.setup";

const HARI_MS = 86_400_000;

const buatKontek = () => convexTest(schema, modules);

const NOMOR_WA = "628123456789";
const NOMOR_REKENING = "1234567890";

/**
 * Pinjaman lunas? Tidak — pinjaman berstatus Didanai yang jatuh temponya sudah
 * lewat `hariTerlambat` hari, dengan tenor 30 hari (skema harian).
 */
async function seed(t: KonteksUji, hariTerlambat = 20) {
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", { name: "SITI PEMINJAM", role: "peminjam" }),
  );
  const loanId = await t.run((ctx) =>
    ctx.db.insert("loans", {
      userId,
      pokokPinjaman: 1_000_000,
      tujuan: "Modal usaha",
      namaLengkap: "SITI PEMINJAM",
      namaBank: "BCA",
      nomorRekening: NOMOR_REKENING,
      nomorWhatsApp: NOMOR_WA,
      status: "didanai",
      nomorReferensi: "PGD-UJI-1",
      tenorHari: 30,
      didanaiPada: Date.now() - (30 + hariTerlambat) * HARI_MS,
    }),
  );
  return { userId, loanId };
}

async function kasusUntuk(t: KonteksUji) {
  const rows = await t.run((ctx) => ctx.db.query("penagihanKasus").collect());
  return rows[0] ?? null;
}

async function auditAksi(t: KonteksUji) {
  const rows = await t.run((ctx) => ctx.db.query("auditLog").collect());
  return rows.map((r) => r.aksi);
}

const adminUtama = async (t: KonteksUji) =>
  siapkanPengguna(t, "Admin Utama", { email: "admin@pindai.test", role: "admin" });

describe("akses modul penagihan", () => {
  it("menolak pengunjung tanpa sesi", async () => {
    const t = buatKontek();
    await expect(t.query(api.penagihan.daftarKasus)).rejects.toThrow(/Harus masuk terlebih dahulu/);
    await expect(t.query(api.penagihan.laporanPenagihan)).rejects.toThrow(
      /Harus masuk terlebih dahulu/,
    );
  });

  it("menolak peran non-admin", async () => {
    const t = buatKontek();
    const asPeminjam = await buatSesi(t, "Peminjam", {
      email: "peminjam@pindai.test",
      role: "peminjam",
    });
    await expect(asPeminjam.query(api.penagihan.daftarKasus)).rejects.toThrow(
      /Akses khusus Super Admin/,
    );
    const asDana = await buatSesi(t, "Penyedia Dana", {
      email: "dana@pindai.test",
      role: "dana",
    });
    await expect(asDana.query(api.penagihan.aturanPenagihan)).rejects.toThrow(
      /Akses khusus Super Admin/,
    );
    await expect(
      asDana.mutation(api.penagihan.simpanAturan, {
        aktif: true,
        ambangRingan: 7,
        ambangSedang: 30,
        ambangBerat: 90,
        jamMulai: 8,
        jamSelesai: 20,
      }),
    ).rejects.toThrow(/Akses khusus Super Admin/);
  });

  it("menolak admin yang belum memverifikasi TOTP pada sesinya", async () => {
    const t = buatKontek();
    const admin = await buatPengguna(t, "Admin Tanpa TOTP", {
      email: "admin-tanpa-totp@pindai.test",
      role: "admin",
    });
    await expect(admin.sesi.query(api.penagihan.daftarKasus)).rejects.toThrow(
      /Aktifkan TOTP terlebih dahulu/,
    );
  });

  it("menerima admin terverifikasi dan mengembalikan daftar/aturan/laporan", async () => {
    const t = buatKontek();
    const admin = await adminUtama(t);

    const daftar = await admin.sesi.query(api.penagihan.daftarKasus);
    expect(daftar.baris).toEqual([]);
    expect(daftar.aktif).toBe(true);

    const aturan = await admin.sesi.query(api.penagihan.aturanPenagihan);
    expect(aturan.ambang).toEqual(aturan.ambangDefault);
    expect(aturan.jamKontak).toEqual(aturan.jamKontakDefault);
    expect(aturan.daftar.tahap.map((th) => th.kode)).toContain("macet");
    expect(aturan.daftar.pihakDihubungi).toEqual(["peminjam"]);

    const laporan = await admin.sesi.query(api.penagihan.laporanPenagihan);
    expect(laporan.totalKasus).toBe(0);
    expect(laporan.perTahap.macet).toBe(0);

    const petugas = await admin.sesi.query(api.penagihan.petugasPenagihan);
    expect(petugas.map((p) => p.label)).toEqual(["admin@pindai.test"]);
  });
});

describe("kewenangan per kasus", () => {
  it("menolak petugas lain dan mengizinkan petugas pemegang kasus", async () => {
    const t = buatKontek();
    const { loanId } = await seed(t);
    const satu = await siapkanPengguna(t, "Petugas Satu", {
      email: "petugas1@pindai.test",
      role: "admin",
    });
    const dua = await siapkanPengguna(t, "Petugas Dua", {
      email: "petugas2@pindai.test",
      role: "admin",
    });

    const tugas = await satu.sesi.mutation(api.penagihan.tugaskanPetugas, {
      loanId,
      petugasUserId: satu.userId,
    });
    expect(tugas.ok).toBe(true);
    expect(tugas.petugasLabel).toBe("petugas1@pindai.test");

    // Petugas hanya boleh menugaskan akun admin.
    const bukanAdmin = await buatPengguna(t, "Peminjam Lain", {
      email: "peminjam-lain@pindai.test",
      role: "peminjam",
    });
    await expect(
      satu.sesi.mutation(api.penagihan.tugaskanPetugas, {
        loanId,
        petugasUserId: bukanAdmin.userId,
      }),
    ).rejects.toThrow(/harus akun admin/);

    const kirim = () =>
      dua.sesi.mutation(api.penagihan.catatTindakan, {
        loanId,
        jenis: "lainnya",
        saluran: "sistem",
        hasil: "terhubung",
      });
    await expect(kirim()).rejects.toThrow(/ditugaskan kepada petugas1@pindai.test/);
    await expect(
      dua.sesi.mutation(api.penagihan.perbaruiStatusPembayaran, {
        loanId,
        status: "bayar_sebagian",
        nominal: 100_000,
      }),
    ).rejects.toThrow(/ditugaskan kepada/);
    await expect(
      dua.sesi.mutation(api.penagihan.catatPenyelesaian, {
        loanId,
        jenis: "keringanan_denda",
        nominal: 0,
        alasan: "Denda dikurangi karena nasabah kesulitan.",
      }),
    ).rejects.toThrow(/ditugaskan kepada/);
    await expect(dua.sesi.mutation(api.penagihan.bukaKontakPeminjam, { loanId })).rejects.toThrow(
      /ditugaskan kepada/,
    );

    const hasil = await satu.sesi.mutation(api.penagihan.catatTindakan, {
      loanId,
      jenis: "lainnya",
      saluran: "sistem",
      hasil: "terhubung",
    });
    expect(hasil.ok).toBe(true);

    const kasus = await kasusUntuk(t);
    expect(kasus?.petugasLabel).toBe("petugas1@pindai.test");
    expect((await auditAksi(t)).filter((a) => a === "tugaskan_penagihan").length).toBe(1);
  });

  it("mengikat kasus pada pemegangnya sampai dilepas, lalu boleh diambil petugas lain", async () => {
    const t = buatKontek();
    const { loanId } = await seed(t);
    const satu = await siapkanPengguna(t, "Petugas Satu", {
      email: "petugas1@pindai.test",
      role: "admin",
    });
    const dua = await siapkanPengguna(t, "Petugas Dua", {
      email: "petugas2@pindai.test",
      role: "admin",
    });
    await satu.sesi.mutation(api.penagihan.tugaskanPetugas, {
      loanId,
      petugasUserId: satu.userId,
    });

    // Penugasan adalah tindakan PENYELIA: petugas lain boleh memindahkan kasus
    // yang sedang dipegang orang lain (tanpa harus meminta pemegangnya melepas
    // lebih dulu), dan perpindahan itu tercatat audit. Yang dibatasi per
    // pemegang adalah tindakan PENANGANAN (lihat blok kewenangan di atas).
    await dua.sesi.mutation(api.penagihan.tugaskanPetugas, {
      loanId,
      petugasUserId: dua.userId,
    });
    const pindahKeDua = await kasusUntuk(t);
    expect(pindahKeDua?.petugasLabel).toBe("petugas2@pindai.test");

    await satu.sesi.mutation(api.penagihan.tugaskanPetugas, { loanId, petugasUserId: null });
    const dilepas = await kasusUntuk(t);
    expect(dilepas?.petugasUserId).toBeUndefined();
    expect(dilepas?.petugasLabel).toBeUndefined();

    await dua.sesi.mutation(api.penagihan.tugaskanPetugas, {
      loanId,
      petugasUserId: dua.userId,
    });
    const pindah = await kasusUntuk(t);
    expect(pindah?.petugasLabel).toBe("petugas2@pindai.test");
    expect(pindah?.petugasUserId).toBe(dua.userId);
    // Pelepasan juga tercatat audit, bukan hanya penugasan — dan SETIAP
    // penugasan/pelepasan meninggalkan tepat satu entri, jadi empat panggilan di
    // atas berarti empat entri (yang satu pun tidak boleh hilang dari jejak).
    const audit = await t.run((ctx) => ctx.db.query("auditLog").collect());
    const penugasan = audit.filter((a) => a.aksi === "tugaskan_penagihan");
    expect(penugasan).toHaveLength(4);
    expect(penugasan.some((a) => a.detail === "Penugasan dilepas.")).toBe(true);
  });
});

describe("aturan penagihan", () => {
  it("menyimpan aturan yang sah dan mencatat audit", async () => {
    const t = buatKontek();
    const admin = await adminUtama(t);
    await admin.sesi.mutation(api.penagihan.simpanAturan, {
      aktif: true,
      ambangRingan: 7,
      ambangSedang: 30,
      ambangBerat: 90,
      jamMulai: 8,
      jamSelesai: 20,
    });
    const aturan = await admin.sesi.query(api.penagihan.aturanPenagihan);
    expect(aturan.ambang).toEqual({ ringan: 7, sedang: 30, berat: 90 });
    expect(aturan.diperbaruiOlehLabel).toBe("admin@pindai.test");
    expect(aturan.diperbaruiPada).toBeGreaterThan(0);
    expect(await auditAksi(t)).toContain("ubah_aturan_penagihan");
  });

  it("menolak ambang tidak menaik dan jendela jam kontak yang tidak sah", async () => {
    const t = buatKontek();
    const admin = await adminUtama(t);
    await expect(
      admin.sesi.mutation(api.penagihan.simpanAturan, {
        aktif: true,
        ambangRingan: 30,
        ambangSedang: 7,
        ambangBerat: 90,
        jamMulai: 8,
        jamSelesai: 20,
      }),
    ).rejects.toThrow(/Ambang harus menaik/);
    await expect(
      admin.sesi.mutation(api.penagihan.simpanAturan, {
        aktif: true,
        ambangRingan: 7,
        ambangSedang: 30,
        ambangBerat: 90,
        jamMulai: 20,
        jamSelesai: 8,
      }),
    ).rejects.toThrow(/Jam selesai harus lebih besar/);
    await expect(
      admin.sesi.mutation(api.penagihan.simpanAturan, {
        aktif: true,
        ambangRingan: 7,
        ambangSedang: 30,
        ambangBerat: 90,
        jamMulai: 8,
        jamSelesai: 24,
      }),
    ).rejects.toThrow(/0–23/);
  });
});

describe("pencatatan komunikasi", () => {
  it("menyimpan waktu server, petugas, dan hasil; menaikkan keadaan kasus", async () => {
    const t = buatKontek();
    const { loanId } = await seed(t);
    const admin = await adminUtama(t);
    const sebelum = Date.now();

    const hasil = await admin.sesi.mutation(api.penagihan.catatTindakan, {
      loanId,
      jenis: "panggilan",
      saluran: "sistem",
      hasil: "bersedia_bayar",
      catatan: "Peminjam minta waktu dua hari.",
    });
    expect(hasil.ok).toBe(true);

    const tindakan = await t.run((ctx) => ctx.db.query("penagihanTindakan").collect());
    expect(tindakan).toHaveLength(1);
    expect(tindakan[0].waktu).toBeGreaterThanOrEqual(sebelum);
    expect(tindakan[0].petugasLabel).toBe("admin@pindai.test");
    expect(tindakan[0].petugasUserId).toBe(admin.userId);
    expect(tindakan[0].hasil).toBe("bersedia_bayar");
    expect(tindakan[0].pihak).toBe("peminjam");
    expect(tindakan[0].catatan).toBe("Peminjam minta waktu dua hari.");

    const kasus = await kasusUntuk(t);
    expect(kasus?.jumlahTindakan).toBe(1);
    expect(kasus?.status).toBe("ditangani");
    expect(kasus?.tindakanTerakhirPada).toBeGreaterThanOrEqual(sebelum);

    const riwayat = await admin.sesi.query(api.penagihan.riwayatPenagihan, { loanId });
    expect(riwayat?.tindakan[0]?.petugasLabel).toBe("admin@pindai.test");
    expect(riwayat?.tindakan[0]?.nomorTujuan).not.toBe(NOMOR_WA);
    expect(await auditAksi(t)).toContain("tindakan_penagihan");
  });

  it("menolak jenis, saluran, dan hasil yang tidak dikenal", async () => {
    const t = buatKontek();
    const { loanId } = await seed(t);
    const admin = await adminUtama(t);
    const dasar = { loanId, jenis: "lainnya", saluran: "sistem", hasil: "terhubung" };

    await expect(
      admin.sesi.mutation(api.penagihan.catatTindakan, { ...dasar, jenis: "santet" }),
    ).rejects.toThrow(/Jenis tindakan "santet" tidak dikenali/);
    await expect(
      admin.sesi.mutation(api.penagihan.catatTindakan, { ...dasar, saluran: "asap" }),
    ).rejects.toThrow(/Saluran "asap" tidak dikenali/);
    await expect(
      admin.sesi.mutation(api.penagihan.catatTindakan, { ...dasar, hasil: "dibayar" }),
    ).rejects.toThrow(/Hasil tindakan "dibayar" tidak dikenali/);
    expect(await t.run((ctx) => ctx.db.query("penagihanTindakan").collect())).toHaveLength(0);
  });

  it("mewajibkan isi pesan untuk pesan tertulis/WhatsApp", async () => {
    const t = buatKontek();
    const { loanId } = await seed(t);
    const admin = await adminUtama(t);
    await expect(
      admin.sesi.mutation(api.penagihan.catatTindakan, {
        loanId,
        jenis: "pesan_tertulis",
        saluran: "sistem",
        hasil: "terhubung",
      }),
    ).rejects.toThrow(/Isi pesan wajib diisi/);
    expect(await t.run((ctx) => ctx.db.query("penagihanTindakan").collect())).toHaveLength(0);
  });

  it("menolak modul yang sedang dinonaktifkan", async () => {
    const t = buatKontek();
    const { loanId } = await seed(t);
    const admin = await adminUtama(t);
    await admin.sesi.mutation(api.penagihan.simpanAturan, {
      aktif: false,
      ambangRingan: 7,
      ambangSedang: 30,
      ambangBerat: 90,
      jamMulai: 8,
      jamSelesai: 20,
    });
    await expect(
      admin.sesi.mutation(api.penagihan.catatTindakan, {
        loanId,
        jenis: "lainnya",
        saluran: "sistem",
        hasil: "terhubung",
      }),
    ).rejects.toThrow(/dinonaktifkan/);
    await expect(
      admin.sesi.mutation(api.penagihan.eskalasiKasus, { loanId }),
    ).rejects.toThrow(/dinonaktifkan/);
  });
});

describe("penjaga isi pesan & pihak yang dihubungi", () => {
  it("menolak pesan yang mengancam atau menyebar data, tanpa menyimpan apa pun", async () => {
    const t = buatKontek();
    const { loanId } = await seed(t);
    const admin = await adminUtama(t);

    await expect(
      admin.sesi.mutation(api.penagihan.catatTindakan, {
        loanId,
        jenis: "pesan_tertulis",
        saluran: "sistem",
        hasil: "terhubung",
        isiPesan: "Kami akan sebar foto KTP anda ke tetangga kalau tidak segera bayar",
      }),
    ).rejects.toThrow(/Pesan ditolak/);
    await expect(
      admin.sesi.mutation(api.penagihan.catatTindakan, {
        loanId,
        jenis: "pesan_tertulis",
        saluran: "sistem",
        hasil: "terhubung",
        isiPesan: "Kami akan kerahkan preman ke rumah Anda",
      }),
    ).rejects.toThrow(/ancaman kekerasan/);
    expect(await t.run((ctx) => ctx.db.query("penagihanTindakan").collect())).toHaveLength(0);
    expect(await kasusUntuk(t)).toBeNull();
  });

  it("menerima pesan pengingat netral", async () => {
    const t = buatKontek();
    const { loanId } = await seed(t);
    const admin = await adminUtama(t);
    const netral = pesanPengingatNetral({
      nama: "SITI PEMINJAM",
      nomorReferensi: "PGD-UJI-1",
      hariTerlambat: 20,
      totalKewajiban: 1_300_000,
    });
    const hasil = await admin.sesi.mutation(api.penagihan.catatTindakan, {
      loanId,
      jenis: "pesan_tertulis",
      saluran: "sistem",
      hasil: "terhubung",
      isiPesan: netral,
    });
    expect(hasil.ok).toBe(true);
    const tindakan = await t.run((ctx) => ctx.db.query("penagihanTindakan").collect());
    expect(tindakan[0].isiPesan).toBe(netral);
  });

  it("menolak kontak ke pihak selain peminjam", async () => {
    const t = buatKontek();
    const { loanId } = await seed(t);
    const admin = await adminUtama(t);
    for (const pihak of ["keluarga", "kontak_darurat", "atasan", "tetangga", "pihak_lain"]) {
      await expect(
        admin.sesi.mutation(api.penagihan.catatTindakan, {
          loanId,
          jenis: "lainnya",
          saluran: "sistem",
          hasil: "terhubung",
          pihak,
        }),
      ).rejects.toThrow(/tidak boleh dihubungi|Hanya peminjam sendiri/);
    }
    await expect(
      admin.sesi.mutation(api.penagihan.catatTindakan, {
        loanId,
        jenis: "lainnya",
        saluran: "sistem",
        hasil: "terhubung",
        pihak: "teman_sekolah",
      }),
    ).rejects.toThrow(/tidak dikenali dan tidak boleh dihubungi/);
    expect(await t.run((ctx) => ctx.db.query("penagihanTindakan").collect())).toHaveLength(0);
  });
});

describe("jendela jam kontak", () => {
  it("menolak kontak langsung di luar jendela dan mengizinkan saluran sistem", async () => {
    const t = buatKontek();
    const { loanId } = await seed(t);
    const admin = await adminUtama(t);
    const jam = jamWIB(Date.now());

    // Jendela [a, a+1) yang DIJAMIN tidak memuat jam berjalan:
    // ((jam + 2) mod 22) selalu berada di luar [jam, jam+1].
    const a = (jam + 2) % 22;
    await admin.sesi.mutation(api.penagihan.simpanAturan, {
      aktif: true,
      ambangRingan: 7,
      ambangSedang: 30,
      ambangBerat: 90,
      jamMulai: a,
      jamSelesai: a + 1,
    });

    const netral = pesanPengingatNetral({
      nama: "SITI PEMINJAM",
      nomorReferensi: "PGD-UJI-1",
      hariTerlambat: 20,
      totalKewajiban: 1_300_000,
    });
    await expect(
      admin.sesi.mutation(api.penagihan.catatTindakan, {
        loanId,
        jenis: "pengingat",
        saluran: "whatsapp",
        hasil: "terhubung",
        isiPesan: netral,
      }),
    ).rejects.toThrow(/Di luar jam kontak/);
    expect(await t.run((ctx) => ctx.db.query("penagihanTindakan").collect())).toHaveLength(0);

    // Saluran internal tetap boleh dicatat di luar jendela kontak.
    const sistem = await admin.sesi.mutation(api.penagihan.catatTindakan, {
      loanId,
      jenis: "lainnya",
      saluran: "sistem",
      hasil: "tidak_relevan",
    });
    expect(sistem.ok).toBe(true);

    // Jendela yang memuat jam berjalan. Jendela kontak dibatasi 0–23 dengan
    // batas atas EKSKLUSIF, jadi pukul 23:00 WIB memang tidak dapat dicakup
    // oleh jendela mana pun — kasus itu dilewati, bukan dipaksakan.
    if (jam < 23) {
      await admin.sesi.mutation(api.penagihan.simpanAturan, {
        aktif: true,
        ambangRingan: 7,
        ambangSedang: 30,
        ambangBerat: 90,
        jamMulai: jam,
        jamSelesai: jam + 1,
      });
      const hasil = await admin.sesi.mutation(api.penagihan.catatTindakan, {
        loanId,
        jenis: "pengingat",
        saluran: "whatsapp",
        hasil: "terhubung",
        isiPesan: netral,
      });
      expect(hasil.ok).toBe(true);
      const daftar = await admin.sesi.query(api.penagihan.daftarKasus);
      expect(daftar.bolehKontakSekarang).toBe(true);
    }
  });
});

describe("eskalasi", () => {
  it("naik bertingkat dan mewajibkan catatan persetujuan pada tingkat tertentu", async () => {
    const t = buatKontek();
    const { loanId } = await seed(t);
    const admin = await adminUtama(t);

    const satu = await admin.sesi.mutation(api.penagihan.eskalasiKasus, { loanId });
    expect(satu.tingkat).toBe(1);
    const dua = await admin.sesi.mutation(api.penagihan.eskalasiKasus, { loanId });
    expect(dua.tingkat).toBe(2);

    await expect(admin.sesi.mutation(api.penagihan.eskalasiKasus, { loanId })).rejects.toThrow(
      /memerlukan catatan persetujuan penyelia/,
    );
    await expect(
      admin.sesi.mutation(api.penagihan.eskalasiKasus, { loanId, catatan: "cek" }),
    ).rejects.toThrow(/minimal 10 karakter/);

    const tiga = await admin.sesi.mutation(api.penagihan.eskalasiKasus, {
      loanId,
      catatan: "Disetujui penyelia untuk penawaran restrukturisasi.",
    });
    expect(tiga.tingkat).toBe(3);
    expect(tiga.label).toBe("Penawaran restrukturisasi");

    const empat = await admin.sesi.mutation(api.penagihan.eskalasiKasus, {
      loanId,
      catatan: "Disetujui penyelia untuk penanganan khusus.",
    });
    expect(empat.tingkat).toBe(4);
    await expect(admin.sesi.mutation(api.penagihan.eskalasiKasus, { loanId })).rejects.toThrow(
      /tertinggi/,
    );

    const kasus = await kasusUntuk(t);
    expect(kasus?.tingkatEskalasi).toBe(4);
    // Eskalasi juga meninggalkan jejak tindakan (waktu, petugas, hasil).
    const tindakan = await t.run((ctx) => ctx.db.query("penagihanTindakan").collect());
    expect(tindakan.filter((r) => r.jenis === "lainnya" && r.saluran === "sistem")).toHaveLength(4);
    expect(tindakan.every((r) => r.petugasLabel === "admin@pindai.test")).toBe(true);
    expect(await auditAksi(t)).toContain("eskalasi_penagihan");
  });
});

describe("pembaruan status pembayaran", () => {
  it("menolak klaim lunas di bawah kewajiban dan menutup kasus saat lunas", async () => {
    const t = buatKontek();
    const { loanId } = await seed(t);
    const admin = await adminUtama(t);

    const daftar = await admin.sesi.query(api.penagihan.daftarKasus);
    const kewajiban = daftar.baris[0].jumlahKewajiban;
    expect(kewajiban).toBeGreaterThan(0);
    expect(daftar.baris[0].hariTerlambat).toBeGreaterThan(0);
    expect(daftar.baris[0].tahapKode).toBe("sedang");
    // Antrean kerja memakai skor prioritas yang bisa dijelaskan.
    expect(daftar.baris[0].prioritas.skor).toBeGreaterThan(0);
    expect(daftar.baris[0].prioritas.disarankanHariIni).toBe(true);
    expect(daftar.baris[0].prioritas.alasan.length).toBeGreaterThan(0);
    expect(daftar.baris[0].prioritas.alasan).toContain("Belum ada tindakan tercatat");

    await expect(
      admin.sesi.mutation(api.penagihan.perbaruiStatusPembayaran, {
        loanId,
        status: "lunas_dicatat",
        nominal: kewajiban - 1,
      }),
    ).rejects.toThrow(/kurang dari total kewajiban/);
    await expect(
      admin.sesi.mutation(api.penagihan.perbaruiStatusPembayaran, {
        loanId,
        status: "bayar_sebagian",
        nominal: 0,
      }),
    ).rejects.toThrow(/wajib diisi lebih dari nol/);
    await expect(
      admin.sesi.mutation(api.penagihan.perbaruiStatusPembayaran, {
        loanId,
        status: "belum_bayar",
        nominal: 5_000,
      }),
    ).rejects.toThrow(/tidak boleh disertai nominal/);
    expect(await t.run((ctx) => ctx.db.query("penagihanPembayaran").collect())).toHaveLength(0);

    await admin.sesi.mutation(api.penagihan.perbaruiStatusPembayaran, {
      loanId,
      status: "bayar_sebagian",
      nominal: 100_000,
      catatan: "Setoran pertama diterima petugas.",
    });
    const setelahSebagian = await kasusUntuk(t);
    expect(setelahSebagian?.statusPembayaran).toBe("bayar_sebagian");
    expect(setelahSebagian?.nominalDibayar).toBe(100_000);

    await admin.sesi.mutation(api.penagihan.perbaruiStatusPembayaran, {
      loanId,
      status: "lunas_dicatat",
      nominal: kewajiban,
    });
    const setelahLunas = await kasusUntuk(t);
    expect(setelahLunas?.statusPembayaran).toBe("lunas_dicatat");
    expect(["selesai", "ditutup"]).toContain(setelahLunas?.status);
    expect(setelahLunas?.selesaiPada).toBeGreaterThan(0);

    const pembayaran = await t.run((ctx) => ctx.db.query("penagihanPembayaran").collect());
    expect(pembayaran).toHaveLength(2);
    expect(pembayaran.every((p) => p.petugasLabel === "admin@pindai.test")).toBe(true);
    expect(pembayaran.every((p) => typeof p.waktu === "number")).toBe(true);

    const laporan = await admin.sesi.query(api.penagihan.laporanPenagihan);
    expect(laporan.totalKasus).toBe(1);
    expect(laporan.kasusAktif).toBe(0);
    expect(await auditAksi(t)).toContain("pembayaran_penagihan");
  });
});

describe("janji pembayaran", () => {
  it("memvalidasi janji, menggeser janji lama, dan menutup kasus saat dipenuhi", async () => {
    const t = buatKontek();
    const { loanId } = await seed(t);
    const admin = await adminUtama(t);

    await expect(
      admin.sesi.mutation(api.penagihan.catatJanjiBayar, {
        loanId,
        nominal: 0,
        tanggalJanji: Date.now() + HARI_MS,
        kanal: "telepon",
      }),
    ).rejects.toThrow(/Nominal janji harus rupiah bulat positif/);
    await expect(
      admin.sesi.mutation(api.penagihan.catatJanjiBayar, {
        loanId,
        nominal: 500_000,
        tanggalJanji: Date.now() - 30 * HARI_MS,
        kanal: "telepon",
      }),
    ).rejects.toThrow(/ke belakang/);
    await expect(
      admin.sesi.mutation(api.penagihan.catatJanjiBayar, {
        loanId,
        nominal: 500_000,
        tanggalJanji: Date.now() + 200 * HARI_MS,
        kanal: "telepon",
      }),
    ).rejects.toThrow(/ke depan/);
    await expect(
      admin.sesi.mutation(api.penagihan.catatJanjiBayar, {
        loanId,
        nominal: 500_000,
        tanggalJanji: Date.now() + HARI_MS,
        kanal: "merpati",
      }),
    ).rejects.toThrow(/Kanal "merpati" tidak dikenali/);

    const pertama = await admin.sesi.mutation(api.penagihan.catatJanjiBayar, {
      loanId,
      nominal: 500_000,
      tanggalJanji: Date.now() + 3 * HARI_MS,
      kanal: "telepon",
      catatan: "Peminjam berjanji membayar sebagian.",
    });
    expect(pertama.ok).toBe(true);
    const setelahPertama = await kasusUntuk(t);
    expect(setelahPertama?.status).toBe("janji_aktif");
    expect(setelahPertama?.janjiAktifId).toBe(pertama.janjiId);

    const created = await t.run((ctx) => ctx.db.query("penagihanTindakan").collect());
    expect(created.some((r) => r.jenis === "kesepakatan" && r.hasil === "janji_dibuat")).toBe(true);

    await expect(
      admin.sesi.mutation(api.penagihan.tutupJanji, { janjiId: pertama.janjiId, status: "aktif" }),
    ).rejects.toThrow(/hanya boleh dipenuhi\/dilanggar\/dibatalkan/);

    const kedua = await admin.sesi.mutation(api.penagihan.catatJanjiBayar, {
      loanId,
      nominal: 700_000,
      tanggalJanji: Date.now() + 5 * HARI_MS,
      kanal: "whatsapp",
    });
    const janjiRows = await t.run((ctx) => ctx.db.query("penagihanJanji").collect());
    expect(janjiRows).toHaveLength(2);
    expect(janjiRows.find((j) => j._id === pertama.janjiId)?.status).toBe("dibatalkan");
    expect(janjiRows.find((j) => j._id === kedua.janjiId)?.status).toBe("aktif");
    // Satu janji aktif per kasus — ditunjuk lewat `janjiAktifId`, bukan lewat
    // urutan baris (dua baris bisa lahir pada milidetik yang sama).
    const setelahKedua = await kasusUntuk(t);
    expect(setelahKedua?.janjiAktifId).toBe(kedua.janjiId);

    await admin.sesi.mutation(api.penagihan.tutupJanji, {
      janjiId: kedua.janjiId,
      status: "dipenuhi",
      catatan: "Pembayaran diterima sesuai janji.",
    });
    const setelahTutup = await kasusUntuk(t);
    expect(setelahTutup?.status).toBe("selesai");
    expect(setelahTutup?.janjiAktifId).toBeUndefined();
    await expect(
      admin.sesi.mutation(api.penagihan.tutupJanji, { janjiId: kedua.janjiId, status: "dilanggar" }),
    ).rejects.toThrow(/sudah berstatus/);

    const statusJanji = (await t.run((ctx) => ctx.db.query("penagihanJanji").collect()))
      .map((j) => j.status)
      .sort();
    expect(statusJanji).toEqual(["dibatalkan", "dipenuhi"]);

    const laporan = await admin.sesi.query(api.penagihan.laporanPenagihan);
    expect(laporan.totalKasus).toBe(1);
    expect(laporan.perTahap.sedang).toBe(1);
    expect(laporan.kasusAktif).toBe(0);
    // Kasus ini belum pernah DITUGASKAN ke petugas: `catatJanjiBayar` tidak
    // mengisi petugas, jadi beban kerja tidak boleh muncul atas nama siapa pun.
    expect(laporan.belumDitugaskan).toBe(1);
    expect(laporan.perPetugas).toEqual([]);
    expect(await auditAksi(t)).toContain("janji_bayar_penagihan");
  });
});

describe("pengaduan & penyelesaian", () => {
  it("mencatat pengaduan, menolak penutupan tanpa alasan, dan menutupnya", async () => {
    const t = buatKontek();
    const { loanId } = await seed(t);
    const admin = await adminUtama(t);

    await expect(
      admin.sesi.mutation(api.penagihan.bukaPengaduan, {
        loanId,
        kanal: "whatsapp",
        kategori: "entah",
        isi: "Uraian pengaduan yang cukup panjang.",
      }),
    ).rejects.toThrow(/Kategori pengaduan "entah" tidak dikenali/);
    await expect(
      admin.sesi.mutation(api.penagihan.bukaPengaduan, {
        loanId,
        kanal: "whatsapp",
        kategori: "salah_nominal",
        isi: "pendek",
      }),
    ).rejects.toThrow(/minimal 10 karakter/);

    const dibuat = await admin.sesi.mutation(api.penagihan.bukaPengaduan, {
      loanId,
      kanal: "whatsapp",
      kategori: "salah_nominal",
      isi: "Menurut saya nominal catatan tidak sesuai kesepakatan.",
    });
    expect(dibuat.ok).toBe(true);

    const daftarPengaduan = await admin.sesi.query(api.penagihan.daftarPengaduan);
    expect(daftarPengaduan).toHaveLength(1);
    expect(daftarPengaduan[0].status).toBe("baru");
    expect(daftarPengaduan[0].nomorReferensi).toBe("PGD-UJI-1");

    // Tidak ada LOMPATAN status: dari "baru" pengaduan harus ditinjau dulu
    // (`TRANSISI_PENGADUAN` di lib/penagihan.ts). Ditolak SEBELUM sempat
    // ditutup, bukan hanya karena catatannya kosong.
    await expect(
      admin.sesi.mutation(api.penagihan.tanganiPengaduan, {
        pengaduanId: dibuat.pengaduanId,
        status: "selesai",
      }),
    ).rejects.toThrow(/tidak diizinkan/);

    // Penutupan WAJIB beralasan — diuji pada transisi yang memang sah.
    await expect(
      admin.sesi.mutation(api.penagihan.tanganiPengaduan, {
        pengaduanId: dibuat.pengaduanId,
        status: "ditolak",
      }),
    ).rejects.toThrow(/minimal 10 karakter/);

    await admin.sesi.mutation(api.penagihan.tanganiPengaduan, {
      pengaduanId: dibuat.pengaduanId,
      status: "ditinjau",
      penyelesaian: "Pengaduan diterima dan sedang ditinjau.",
    });
    await admin.sesi.mutation(api.penagihan.tanganiPengaduan, {
      pengaduanId: dibuat.pengaduanId,
      status: "selesai",
      penyelesaian: "Nominal dikoreksi dan dijelaskan kepada nasabah.",
    });
    const selesai = await t.run((ctx) => ctx.db.query("pengaduanNasabah").collect());
    expect(selesai[0].status).toBe("selesai");
    expect(selesai[0].petugasLabel).toBe("admin@pindai.test");
    expect(selesai[0].ditutupPada).toBeGreaterThan(0);

    await expect(
      admin.sesi.mutation(api.penagihan.tanganiPengaduan, {
        pengaduanId: dibuat.pengaduanId,
        status: "baru",
        penyelesaian: "Membuka kembali pengaduan ini.",
      }),
    ).rejects.toThrow(/tidak diizinkan/);
    expect(await auditAksi(t)).toContain("tangani_pengaduan");
  });

  it("mencatat penyelesaian: menolak pelunasan di bawah kewajiban, menerima keringanan denda", async () => {
    const t = buatKontek();
    const { loanId } = await seed(t);
    const admin = await adminUtama(t);

    const kewajiban = (await admin.sesi.query(api.penagihan.daftarKasus)).baris[0].jumlahKewajiban;
    await expect(
      admin.sesi.mutation(api.penagihan.catatPenyelesaian, {
        loanId,
        jenis: "pelunasan_penuh",
        nominal: kewajiban - 1,
        alasan: "Nasabah menyatakan sudah melunasi.",
      }),
    ).rejects.toThrow(/tidak boleh kurang dari total kewajiban/);
    await expect(
      admin.sesi.mutation(api.penagihan.catatPenyelesaian, {
        loanId,
        jenis: "keringanan_denda",
        nominal: 0,
        alasan: "singkat",
      }),
    ).rejects.toThrow(/minimal 10 karakter/);
    await expect(
      admin.sesi.mutation(api.penagihan.catatPenyelesaian, {
        loanId,
        jenis: "entah",
        nominal: 0,
        alasan: "Jenis penyelesaian tidak dikenal sama sekali.",
      }),
    ).rejects.toThrow(/Jenis penyelesaian "entah" tidak dikenali/);
    expect(await t.run((ctx) => ctx.db.query("penagihanPenyelesaian").collect())).toHaveLength(0);

    const ok = await admin.sesi.mutation(api.penagihan.catatPenyelesaian, {
      loanId,
      jenis: "keringanan_denda",
      nominal: 50_000,
      alasan: "Nasabah kesulitan, denda dikurangi setelah peninjauan.",
    });
    expect(ok.ok).toBe(true);
    const kasus = await kasusUntuk(t);
    expect(kasus?.status).toBe("selesai");
    expect(kasus?.sebabSelesai).toMatch(/Keringanan denda/);
    const catatan = await t.run((ctx) => ctx.db.query("penagihanPenyelesaian").collect());
    expect(catatan).toHaveLength(1);
    expect(catatan[0].totalKewajiban).toBe(kewajiban);
    const audit = await t.run((ctx) => ctx.db.query("auditLog").collect());
    const entri = audit.find((a) => a.aksi === "penyelesaian_penagihan");
    expect(entri?.detail).toMatch(/tanpa perpindahan dana/);
  });
});

describe("perlindungan kontak & informasi finansial", () => {
  it("hanya mengirim kontak tersamar dan mencatat audit saat nomor utuh dibuka", async () => {
    const t = buatKontek();
    const { loanId } = await seed(t);
    const admin = await adminUtama(t);

    const daftar = await admin.sesi.query(api.penagihan.daftarKasus);
    const kontak = daftar.baris[0].kontak;
    expect(kontak.whatsapp).not.toBe(NOMOR_WA);
    expect(kontak.whatsapp).toContain("•");
    expect(kontak.whatsapp?.endsWith("6789")).toBe(true);
    expect(kontak.rekening).not.toBe(NOMOR_REKENING);
    expect(kontak.rekening).toMatch(/^•+7890$/);

    // Payload daftar kerja tidak boleh memuat nomor utuh sama sekali.
    const payload = JSON.stringify(daftar);
    expect(payload).not.toContain(NOMOR_WA);
    expect(payload).not.toContain(NOMOR_REKENING);

    expect(await auditAksi(t)).not.toContain("buka_kontak_penagihan");

    const buka = await admin.sesi.mutation(api.penagihan.bukaKontakPeminjam, { loanId });
    expect(buka.nomorWhatsApp).toBe(NOMOR_WA);
    expect(buka.nomorRekening).toBe(NOMOR_REKENING);
    expect(buka.namaBank).toBe("BCA");

    const audit = await t.run((ctx) => ctx.db.query("auditLog").collect());
    const entri = audit.find((a) => a.aksi === "buka_kontak_penagihan");
    expect(entri?.aktorLabel).toBe("admin@pindai.test");
    expect(entri?.target).toBe("PGD-UJI-1");
  });

  it("menyamarkan kontak di riwayat tindakan", async () => {
    const t = buatKontek();
    const { loanId } = await seed(t);
    const admin = await adminUtama(t);
    await admin.sesi.mutation(api.penagihan.catatTindakan, {
      loanId,
      jenis: "lainnya",
      saluran: "sistem",
      hasil: "terhubung",
    });
    const riwayat = await admin.sesi.query(api.penagihan.riwayatPenagihan, { loanId });
    expect(riwayat?.tindakan[0]?.nomorTujuan).toContain("•");
    expect(JSON.stringify(riwayat?.tindakan)).not.toContain(NOMOR_WA);
  });
});
