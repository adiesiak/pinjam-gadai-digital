/**
 * Tes ALUR KYC mandiri di sisi server (convex-test + vitest).
 *
 * Yang dijaga berkas ini — semuanya lewat mutation/query yang sama dengan yang
 * dipakai UI, bukan memanggil aturan murni langsung:
 *
 *  - nasabah bisa memulai, menyimpan progres setengah jalan, melanjutkan, dan
 *    melihat status; modul ini tidak membuat pengajuan pinjaman apa pun;
 *  - hanya transisi yang sah yang lolos (terutama: nasabah TIDAK pernah bisa
 *    menaikkan statusnya sendiri, dan petugas tidak bisa memverifikasi
 *    pengajuan yang belum dikirim);
 *  - setiap perubahan penting meninggalkan satu baris `kycRiwayat` (waktu,
 *    aktor, alasan) dan satu entri `auditLog`;
 *  - keputusan yang merugikan nasabah (REJECTED / NEEDS_CORRECTION) WAJIB
 *    beralasan;
 *  - data identitas penting yang berubah setelah VERIFIED memicu verifikasi
 *    ulang, sedangkan data kontak biasa tidak;
 *  - berkas hanya bisa ditautkan bila isinya benar-benar sudah diperiksa server
 *    (magic bytes) — tanpa penanda, mutation menolak.
 *
 * Menjalankan: bunx vitest run src/convex/kyc.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { VERSI_ATURAN_KYC } from "../lib/kycAturan";
import { VERSI_PERSETUJUAN_KYC } from "../lib/persetujuanKyc";
import { buatPengguna, siapkanPengguna, type KonteksUji, type SesiUji } from "./test.helpers";
import { modules } from "./test.setup";

const NIK = "3271012345678901";
const WA = "6281234567890";

/** 16 byte pertama sebuah PNG — cukup bagi server mengenali isinya gambar. */
const BYTE_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);
/** Isi berkas PDF (bukan gambar) untuk menguji penolakan magic bytes. */
const BYTE_PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
/** Isi JPEG minimal — berkas LAIN dengan jenis & sidik jari yang berbeda. */
const BYTE_JPG = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
]);

/** Isian lengkap & sah menurut aturan yang sama dengan form data diri. */
const ISI_LENGKAP = {
  namaLengkap: "Rani Puspita",
  nik: NIK,
  nomorWhatsApp: WA,
  alamat: "Jalan Merdeka No. 10, Bandung",
  pekerjaan: "Karyawan swasta",
  penghasilanBulanan: 5_000_000,
  sumberPenghasilan: "Gaji bulanan",
  namaBank: "BCA",
  nomorRekening: "1234567890",
};

type BerkasKyc = {
  ktpId: Id<"_storage">;
  selfieKtpId: Id<"_storage">;
  buktiPenghasilanId: Id<"_storage">;
};

/**
 * Simpan berkas gambar uji dengan metadata contentType — persis pola
 * `simpanBerkasUji`, tetapi memakai BYTE asli supaya pemeriksaan magic bytes
 * benar-benar melihat tanda tangan berkasnya.
 */
async function simpanGambarUji(t: KonteksUji, byte = BYTE_PNG): Promise<Id<"_storage">> {
  return t.run(async (ctx) => {
    const id = await ctx.storage.store(new Blob([byte.buffer as ArrayBuffer], { type: "image/png" }));
    await (
      ctx.db as unknown as {
        patch: (table: string, id: string, value: Record<string, unknown>) => Promise<void>;
      }
    ).patch("_storage", id, { contentType: "image/png" });
    return id;
  });
}

/** Unggah lewat jalur nyata: simpan berkas, lalu jalankan action pemeriksa isi. */
async function unggah(
  t: KonteksUji,
  sesi: SesiUji,
  label: string,
  byte = BYTE_PNG,
): Promise<Id<"_storage">> {
  const id = await simpanGambarUji(t, byte);
  await sesi.action(api.berkasIdentitas.periksaIsiBerkasKyc, { id, label });
  return id;
}

/**
 * Catat persetujuan pemrosesan data — syarat mutlak sebelum isian/berkas apa pun
 * boleh disimpan. Dipakai semua alur di bawah supaya tidak ada uji yang lolos
 * "berkat" melewati gerbang persetujuan.
 */
async function setujui(sesi: SesiUji): Promise<void> {
  await sesi.mutation(api.kyc.catatPersetujuanKyc, { versi: VERSI_PERSETUJUAN_KYC });
}

/** Isi semuanya + unggah tiga berkas, lalu kirim pengajuan (PENDING_REVIEW). */
async function kirimLengkap(t: KonteksUji, sesi: SesiUji): Promise<BerkasKyc> {
  await setujui(sesi);
  const ktpId = await unggah(t, sesi, "Foto KTP");
  const selfieKtpId = await unggah(t, sesi, "Selfie dengan KTP");
  const buktiPenghasilanId = await unggah(t, sesi, "Bukti penghasilan");
  await sesi.mutation(api.kyc.simpanProgresKyc, {
    ...ISI_LENGKAP,
    ktpId,
    selfieKtpId,
    buktiPenghasilanId,
  });
  await sesi.mutation(api.kyc.ajukanKyc, {});
  return { ktpId, selfieKtpId, buktiPenghasilanId };
}

async function siapkanDua(nama = "Rani Puspita", email = "rani@pindai.test") {
  const t = convexTest(schema, modules);
  const admin = await siapkanPengguna(t, "Petugas KYC", {
    email: "petugas@pindai.test",
    role: "admin",
  });
  const nasabah = await siapkanPengguna(t, nama, { email, role: "peminjam" });
  return { t, admin, nasabah };
}

describe("alur KYC mandiri", () => {
  it("Nasabah memulai, menyimpan progres setengah jalan, dan melanjutkan", async () => {
    const { t, nasabah } = await siapkanDua();

    const awal = await nasabah.sesi.query(api.kyc.kycSaya, {});
    expect(awal.adaBaris).toBe(false);
    expect(awal.status).toBe("NOT_STARTED");
    expect(awal.lengkap).toBe(false);
    expect(awal.kekurangan).toContain("Foto KTP");

    // Mulai → IN_PROGRESS, dan idempoten (dipanggil dua kali tetap satu baris).
    await nasabah.sesi.mutation(api.kyc.mulaiKyc, {});
    const mulai = await nasabah.sesi.mutation(api.kyc.mulaiKyc, {});
    expect(mulai.status).toBe("IN_PROGRESS");

    // Gerbang persetujuan: tanpa persetujuan tercatat di server, isian apa pun
    // yang menyentuh data pribadi DITOLAK — bukan hanya dikunci di layar.
    await expect(
      nasabah.sesi.mutation(api.kyc.simpanProgresKyc, { namaLengkap: "Rani Puspita" }),
    ).rejects.toThrow(/Persetujuan pemrosesan data belum tercatat/);
    expect((await nasabah.sesi.query(api.kyc.kycSaya, {})).persetujuanAktif).toBe(false);

    // Versi penjelasan yang basi juga ditolak (pengguna harus membaca ulang).
    await expect(
      nasabah.sesi.mutation(api.kyc.catatPersetujuanKyc, { versi: "versi-lama" }),
    ).rejects.toThrow(/Versi penjelasan pemrosesan data sudah berubah/);

    // Persetujuan berlaku → tercatat di server beserta auditnya.
    await setujui(nasabah.sesi);
    const sesudahSetuju = await nasabah.sesi.query(api.kyc.kycSaya, {});
    expect(sesudahSetuju.persetujuanAktif).toBe(true);
    expect(sesudahSetuju.persetujuan?.versi).toBe(VERSI_PERSETUJUAN_KYC);

    // Progres setengah jalan: isian kosong boleh, isian yang DIISI harus sah.
    await expect(
      nasabah.sesi.mutation(api.kyc.simpanProgresKyc, { namaLengkap: "Rani", nik: "123" }),
    ).rejects.toThrow(/Nomor KTP \(NIK\) harus terdiri dari 16 angka/);

    const progres = await nasabah.sesi.mutation(api.kyc.simpanProgresKyc, {
      namaLengkap: "Rani Puspita",
      nik: NIK,
      nomorWhatsApp: WA,
    });
    expect(progres.status).toBe("IN_PROGRESS");

    const tengah = await nasabah.sesi.query(api.kyc.kycSaya, {});
    expect(tengah.status).toBe("IN_PROGRESS");
    expect(tengah.isian.namaLengkap).toBe("Rani Puspita");
    expect(tengah.dokumen.ktpId).toBeNull();
    expect(tengah.kekurangan).toContain("Foto KTP");
    // Progres tersimpan tanpa membuat pengajuan pinjaman apa pun.
    expect(await t.run((ctx) => ctx.db.query("loans").collect())).toHaveLength(0);
  });

  it("Mengajukan peninjauan menuntut isian lengkap DAN berkas yang diperiksa server", async () => {
    const { t, nasabah } = await siapkanDua();
    await nasabah.sesi.mutation(api.kyc.mulaiKyc, {});
    await setujui(nasabah.sesi);

    // Berkas yang belum lewat action pemeriksa isi: ditolak walau metadatanya gambar.
    const tanpaPenanda = await simpanGambarUji(t);
    await expect(
      nasabah.sesi.mutation(api.kyc.simpanProgresKyc, { ...ISI_LENGKAP, ktpId: tanpaPenanda }),
    ).rejects.toThrow(/Foto KTP belum diperiksa server/);

    // Action pemeriksa isi menolak berkas yang bukan gambar.
    const pdf = await simpanGambarUji(t, BYTE_PDF);
    await expect(
      nasabah.sesi.action(api.berkasIdentitas.periksaIsiBerkasKyc, { id: pdf, label: "Foto KTP" }),
    ).rejects.toThrow(/tidak dikenali sebagai gambar/);

    // Penanda milik akun lain tidak bisa dipakai (berkas bukan miliknya).
    const orangLain = await siapkanPengguna(t, "Orang Lain", {
      email: "lain@pindai.test",
      role: "peminjam",
    });
    const milikOrangLain = await unggah(t, orangLain.sesi, "Foto KTP");
    await expect(
      nasabah.sesi.mutation(api.kyc.simpanProgresKyc, { ktpId: milikOrangLain }),
    ).rejects.toThrow(/bukan milik akun ini/);

    // Isi lengkap + berkas terverifikasi → boleh, dan kelengkapan dilaporkan benar.
    const berkas = await kirimLengkap(t, nasabah.sesi);
    const sesudah = await nasabah.sesi.query(api.kyc.kycSaya, {});
    expect(sesudah.status).toBe("PENDING_REVIEW");
    expect(sesudah.lengkap).toBe(true);
    expect(sesudah.kekurangan).toEqual([]);
    expect(sesudah.diajukanPada).not.toBeNull();
    expect(sesudah.dokumen).toMatchObject({
      ktpId: berkas.ktpId,
      selfieKtpId: berkas.selfieKtpId,
      buktiPenghasilanId: berkas.buktiPenghasilanId,
    });
    // Riwayat & audit mencatat pengajuan (waktu, aktor, alasan).
    const { riwayat, audit } = await t.run(async (ctx) => ({
      riwayat: await ctx.db.query("kycRiwayat").collect(),
      audit: await ctx.db.query("auditLog").collect(),
    }));
    expect(riwayat.some((r) => r.ke === "PENDING_REVIEW" && r.aktor === "nasabah")).toBe(true);
    expect(riwayat.every((r) => typeof r.waktu === "number" && r.alasan.length > 0)).toBe(true);
    expect(audit.some((a) => a.aksi === "kyc_pending_review")).toBe(true);
  });

  it("Hanya petugas yang memutuskan; keputusan tidak sah & tanpa alasan ditolak", async () => {
    const { t, admin, nasabah } = await siapkanDua();
    await kirimLengkap(t, nasabah.sesi);

    // Nasabah tidak bisa memverifikasi dirinya sendiri (ditolak izin, bukan UI).
    await expect(
      nasabah.sesi.mutation(api.kyc.tinjauKyc, {
        userId: nasabah.userId,
        keputusan: "VERIFIED",
      }),
    ).rejects.toThrow(/Akses khusus Super Admin/);
    expect((await nasabah.sesi.query(api.kyc.kycSaya, {})).status).toBe("PENDING_REVIEW");

    // Keputusan yang merugikan nasabah wajib beralasan.
    await expect(
      admin.sesi.mutation(api.kyc.tinjauKyc, { userId: nasabah.userId, keputusan: "REJECTED" }),
    ).rejects.toThrow(/Alasan penolakan wajib diisi/);
    await expect(
      admin.sesi.mutation(api.kyc.tinjauKyc, {
        userId: nasabah.userId,
        keputusan: "NEEDS_CORRECTION",
      }),
    ).rejects.toThrow(/Catatan perbaikan wajib diisi/);

    // Verifikasi berhasil → status, keputusan, dan proyeksi data diri menyatu.
    const putusan = await admin.sesi.mutation(api.kyc.tinjauKyc, {
      userId: nasabah.userId,
      keputusan: "VERIFIED",
    });
    expect(putusan).toMatchObject({ ok: true, status: "VERIFIED" });

    const sesudah = await nasabah.sesi.query(api.kyc.kycSaya, {});
    expect(sesudah.status).toBe("VERIFIED");
    expect(sesudah.diputuskanOlehLabel).toBe("petugas@pindai.test");
    expect(sesudah.diputuskanPada).not.toBeNull();

    const { profil, akun, riwayat, audit } = await t.run(async (ctx) => ({
      profil: await ctx.db.query("nasabahProfil").collect(),
      akun: await ctx.db.get(nasabah.userId),
      riwayat: await ctx.db.query("kycRiwayat").collect(),
      audit: await ctx.db.query("auditLog").collect(),
    }));
    expect(profil).toHaveLength(1);
    expect(profil[0]).toMatchObject({
      userId: nasabah.userId,
      namaLengkap: "RANI PUSPITA",
      nik: NIK,
      nomorWhatsApp: WA,
      sumber: "admin",
      verifikasiIdentitas: { status: "terverifikasi", olehLabel: "petugas@pindai.test" },
    });
    expect(akun?.name).toBe("RANI PUSPITA");
    expect(riwayat.some((r) => r.ke === "VERIFIED" && r.aktor === "admin")).toBe(true);
    expect(audit.some((a) => a.aksi === "kyc_verified")).toBe(true);

    // Setelah VERIFIED, transisi apa pun selain verifikasi ulang tidak sah.
    await expect(
      admin.sesi.mutation(api.kyc.tinjauKyc, { userId: nasabah.userId, keputusan: "VERIFIED" }),
    ).rejects.toThrow(/sudah VERIFIED/);
    await expect(
      admin.sesi.mutation(api.kyc.tinjauKyc, {
        userId: nasabah.userId,
        keputusan: "NEEDS_CORRECTION",
        catatan: "Perbaiki foto KTP.",
      }),
    ).rejects.toThrow(/VERIFIED → NEEDS_CORRECTION tidak diizinkan/);

    // Petugas tidak bisa memverifikasi pengajuan yang belum dikirim.
    const { t: t2, admin: admin2, nasabah: nasabah2 } = await siapkanDua(
      "Budi Santoso",
      "budi@pindai.test",
    );
    await kirimLengkap(t2, nasabah2.sesi);
    await nasabah2.sesi.mutation(api.kyc.simpanProgresKyc, { alamat: "Jalan Baru No. 5, Bogor" });
    expect((await nasabah2.sesi.query(api.kyc.kycSaya, {})).status).toBe("IN_PROGRESS");
    await expect(
      admin2.sesi.mutation(api.kyc.tinjauKyc, { userId: nasabah2.userId, keputusan: "VERIFIED" }),
    ).rejects.toThrow(/IN_PROGRESS → VERIFIED tidak diizinkan/);
  });

  it("Perbaikan: petugas meminta koreksi, nasabah memperbaiki lalu kirim ulang", async () => {
    const { t, admin, nasabah } = await siapkanDua();
    await kirimLengkap(t, nasabah.sesi);

    await admin.sesi.mutation(api.kyc.tinjauKyc, {
      userId: nasabah.userId,
      keputusan: "NEEDS_CORRECTION",
      catatan: "Foto KTP buram, mohon difoto ulang.",
    });
    const sesudahKoreksi = await nasabah.sesi.query(api.kyc.kycSaya, {});
    expect(sesudahKoreksi.status).toBe("NEEDS_CORRECTION");
    // Nasabah melihat alasannya — bukan hanya statusnya.
    expect(sesudahKoreksi.keputusanCatatan).toBe("Foto KTP buram, mohon difoto ulang.");
    expect(sesudahKoreksi.riwayat[0]).toMatchObject({
      dari: "PENDING_REVIEW",
      ke: "NEEDS_CORRECTION",
      aktor: "admin",
    });

    // Perbaikan lalu kirim ulang → kembali menunggu peninjauan.
    const ktpBaru = await unggah(t, nasabah.sesi, "Foto KTP");
    await nasabah.sesi.mutation(api.kyc.simpanProgresKyc, { ktpId: ktpBaru });
    const ulang = await nasabah.sesi.mutation(api.kyc.ajukanKyc, {});
    expect(ulang.status).toBe("PENDING_REVIEW");
    const riwayatUlang = (await nasabah.sesi.query(api.kyc.kycSaya, {})).riwayat[0];
    expect(riwayatUlang).toMatchObject({ ke: "PENDING_REVIEW", alasan: "perbaikan_dikirim_ulang" });

    // Penolakan beralasan → REJECTED; menyunting data memulai peninjauan ulang.
    await admin.sesi.mutation(api.kyc.tinjauKyc, {
      userId: nasabah.userId,
      keputusan: "REJECTED",
      catatan: "Data upah tidak konsisten dengan bukti.",
    });
    expect((await nasabah.sesi.query(api.kyc.kycSaya, {})).status).toBe("REJECTED");
    await nasabah.sesi.mutation(api.kyc.simpanProgresKyc, { penghasilanBulanan: 6_000_000 });
    const ulangLagi = await nasabah.sesi.query(api.kyc.kycSaya, {});
    expect(ulangLagi.status).toBe("IN_PROGRESS");
    expect(ulangLagi.riwayat[0]).toMatchObject({ dari: "REJECTED", alasan: "peninjauan_ulang_dimulai" });
  });

  it("Menyunting data saat menunggu peninjauan menarik pengajuan kembali", async () => {
    const { t, admin, nasabah } = await siapkanDua();
    await kirimLengkap(t, nasabah.sesi);

    await nasabah.sesi.mutation(api.kyc.simpanProgresKyc, { alamat: "Jalan Asia Afrika No. 1, Bandung" });
    const sesudah = await nasabah.sesi.query(api.kyc.kycSaya, {});
    expect(sesudah.status).toBe("IN_PROGRESS");
    expect(sesudah.riwayat[0]).toMatchObject({
      dari: "PENDING_REVIEW",
      ke: "IN_PROGRESS",
      alasan: "pengajuan_ditarik_karena_diubah",
    });
    // Petugas yang membuka antrean tidak menemukan pengajuan itu lagi.
    const antrean = await admin.sesi.query(api.kyc.daftarKycAdmin, {});
    expect(antrean.cacah.PENDING_REVIEW).toBe(0);
    void t;
  });

  it("Data identitas penting berubah setelah VERIFIED → wajib verifikasi ulang", async () => {
    const { t, admin, nasabah } = await siapkanDua();
    const berkas = await kirimLengkap(t, nasabah.sesi);
    await admin.sesi.mutation(api.kyc.tinjauKyc, {
      userId: nasabah.userId,
      keputusan: "VERIFIED",
      catatan: "Dokumen jelas.",
    });

    // Data kontak/pencairan biasa TIDAK membatalkan putusan verifikasi.
    await nasabah.sesi.mutation(api.kyc.simpanProgresKyc, {
      alamat: "Jalan Diponegoro No. 7, Bandung",
      namaBank: "Mandiri",
      nomorRekening: "9876543210",
    });
    expect((await nasabah.sesi.query(api.kyc.kycSaya, {})).status).toBe("VERIFIED");

    // Mengganti foto KTP mengubah identitas penting → verifikasi ulang (sistem).
    const ktpBaru = await unggah(t, nasabah.sesi, "Foto KTP");
    await nasabah.sesi.mutation(api.kyc.simpanProgresKyc, { ktpId: ktpBaru, ...ISI_LENGKAP });
    const perluUlang = await nasabah.sesi.query(api.kyc.kycSaya, {});
    expect(perluUlang.status).toBe("REVERIFICATION_REQUIRED");
    expect(perluUlang.dokumen.ktpId).toBe(ktpBaru);
    expect(perluUlang.riwayat[0]).toMatchObject({
      dari: "VERIFIED",
      ke: "REVERIFICATION_REQUIRED",
      aktor: "sistem",
      alasan: "data_identitas_berubah",
    });

    // Ajukan verifikasi ulang → petugas memeriksa lagi → kembali terverifikasi.
    await nasabah.sesi.mutation(api.kyc.ajukanKyc, {});
    const diajukanUlang = await nasabah.sesi.query(api.kyc.kycSaya, {});
    expect(diajukanUlang.status).toBe("PENDING_REVIEW");
    expect(diajukanUlang.riwayat[0]).toMatchObject({ alasan: "verifikasi_ulang_diajukan" });

    await admin.sesi.mutation(api.kyc.tinjauKyc, {
      userId: nasabah.userId,
      keputusan: "VERIFIED",
      catatan: "KTP baru sudah diperiksa.",
    });
    const akhir = await nasabah.sesi.query(api.kyc.kycSaya, {});
    expect(akhir.status).toBe("VERIFIED");
    const profil = await t.run((ctx) =>
      ctx.db
        .query("nasabahProfil")
        .withIndex("by_user", (q) => q.eq("userId", nasabah.userId))
        .first(),
    );
    expect(profil?.fotoKtpId).toBe(ktpBaru);
    expect(profil?.verifikasiIdentitas?.status).toBe("terverifikasi");
    expect(berkas.ktpId).not.toBe(ktpBaru);
  });

  it("Mencatat metadata dokumen & hasil pemeriksaan dari server, bukan dari klien", async () => {
    const { t, admin, nasabah } = await siapkanDua();
    await kirimLengkap(t, nasabah.sesi);

    const penanda = await t.run((ctx) => ctx.db.query("berkasTerverifikasi").collect());
    expect(penanda).toHaveLength(3);
    for (const p of penanda) {
      expect(p.jenis).toBe("png");
      expect(p.ukuranByte).toBeGreaterThan(0);
      expect(p.contentType).toBe("image/png");
      // Sidik jari SHA-256 dihitung PENYIMPANAN (base64), bukan dikirim pemanggil.
      expect(p.sidikJari).toMatch(/^[A-Za-z0-9+/]{43}=$/);
      expect(p.versiAturan).toBe(VERSI_ATURAN_KYC);
      expect(p.olehUserId).toBe(nasabah.userId);
    }

    // Berkas LAIN menghasilkan jenis & sidik jari yang berbeda — metadata benar
    // membaca berkasnya, bukan menyalin label slot.
    const jpg = await unggah(t, nasabah.sesi, "Foto KTP", BYTE_JPG);
    const penandaJpg = await t.run((ctx) =>
      ctx.db
        .query("berkasTerverifikasi")
        .withIndex("by_storageId", (q) => q.eq("storageId", jpg))
        .first(),
    );
    expect(penandaJpg?.jenis).toBe("jpeg");
    expect(penandaJpg?.sidikJari).not.toBe(penanda[0].sidikJari);

    // Berkas yang sudah TIDAK ADA tidak boleh ditandai "terverifikasi":
    // penanda untuk berkas yang sudah dihapus hanya jadi bukti palsu.
    const dihapus = await simpanGambarUji(t);
    await t.run((ctx) => ctx.storage.delete(dihapus));
    await expect(
      t.mutation(internal.kyc.catatBerkasTerverifikasi, {
        storageId: dihapus,
        label: "Foto KTP",
        jenis: "png",
      }),
    ).rejects.toThrow(/tidak ditemukan di penyimpanan/);

    // Berkas identitas yang ISINYA sama dipakai akun LAIN: terlihat dari sidik
    // jarinya (indeks `by_sidikJari`), dan yang dilaporkan hanya jumlahnya.
    const orangLain = await siapkanPengguna(t, "Orang Lain", {
      email: "lain3@pindai.test",
      role: "peminjam",
    });
    await unggah(t, orangLain.sesi, "Foto KTP", BYTE_PNG);
    const detailDenganUlang = await admin.sesi.query(api.kyc.detailKycAdmin, {
      userId: nasabah.userId,
    });
    const berkasKtp = detailDenganUlang?.berkas.find((b) => b.slot === "ktp");
    expect(berkasKtp?.dipakaiAkunLain).toBe(1);
    const berkasBukti = detailDenganUlang?.berkas.find((b) => b.slot === "bukti");
    expect(berkasBukti?.dipakaiAkunLain).toBe(1);
    expect(JSON.stringify(detailDenganUlang)).not.toContain(orangLain.userId);

    // Petugas melihat metadata itu di rincian, bersama dasar aturan putusan.
    await admin.sesi.mutation(api.kyc.tinjauKyc, {
      userId: nasabah.userId,
      keputusan: "VERIFIED",
      catatan: "Berkas jelas.",
    });
    const detail = await admin.sesi.query(api.kyc.detailKycAdmin, { userId: nasabah.userId });
    expect(detail?.versiAturan).toBe(VERSI_ATURAN_KYC);
    expect(detail?.aturanTerverifikasi?.versi).toBe(VERSI_ATURAN_KYC);
    expect(detail?.aturanUsang).toBe(false);
    expect(detail?.keteranganAturanUsang).toBeNull();
    expect(detail?.berkas.map((b) => b.slot)).toEqual(["ktp", "selfie", "bukti"]);
    expect(detail?.berkas.every((b) => b.ada && b.jenis === "png" && (b.ukuranByte ?? 0) > 0)).toBe(
      true,
    );
    expect(detail?.berkas.every((b) => (b.sidikJari ?? "").length >= 43)).toBe(true);
    // Riwayat mencatat dasar aturannya, bukan hanya pelaku & waktunya.
    expect(detail?.riwayat.every((r) => r.versiAturan === VERSI_ATURAN_KYC)).toBe(true);
  });

  it("Pengajuan ganda tidak menggandakan riwayat/audit (idempoten)", async () => {
    const { t, nasabah } = await siapkanDua();
    await kirimLengkap(t, nasabah.sesi);

    const sebelum = await t.run(async (ctx) => ({
      riwayat: (await ctx.db.query("kycRiwayat").collect()).length,
      audit: (await ctx.db.query("auditLog").collect()).length,
      row: await ctx.db
        .query("kycProfil")
        .withIndex("by_user", (q) => q.eq("userId", nasabah.userId))
        .first(),
    }));

    // Klik ganda: hasilnya tetap satu pengajuan, tanpa baris riwayat/audit baru,
    // dan waktu pengajuan yang sedang ditinjau petugas tidak digeser.
    const lagi = await nasabah.sesi.mutation(api.kyc.ajukanKyc, {});
    expect(lagi.status).toBe("PENDING_REVIEW");

    const sesudah = await t.run(async (ctx) => ({
      riwayat: (await ctx.db.query("kycRiwayat").collect()).length,
      audit: (await ctx.db.query("auditLog").collect()).length,
      row: await ctx.db
        .query("kycProfil")
        .withIndex("by_user", (q) => q.eq("userId", nasabah.userId))
        .first(),
    }));
    expect(sesudah.riwayat).toBe(sebelum.riwayat);
    expect(sesudah.audit).toBe(sebelum.audit);
    expect(sesudah.row?.diajukanPada).toBe(sebelum.row?.diajukanPada);
    expect(sesudah.row?.status).toBe("PENDING_REVIEW");
  });

  it("Nasabah lain tidak bisa membaca atau mengubah baris KYC nasabah ini", async () => {
    const { t, nasabah } = await siapkanDua();
    await kirimLengkap(t, nasabah.sesi);
    const lain = await siapkanPengguna(t, "Orang Lain", {
      email: "lain2@pindai.test",
      role: "peminjam",
    });

    // Membaca: yang terlihat hanya barisnya sendiri — belum mulai, bukan data orang lain.
    const milikLain = await lain.sesi.query(api.kyc.kycSaya, {});
    expect(milikLain.adaBaris).toBe(false);
    expect(milikLain.status).toBe("NOT_STARTED");
    expect(milikLain.isian.nik).toBe("");
    expect(milikLain.dokumen.ktpId).toBeNull();

    // Mengubah: menyimpan & mengajukan hanya menyentuh baris sendiri.
    await setujui(lain.sesi);
    await lain.sesi.mutation(api.kyc.simpanProgresKyc, { namaLengkap: "Orang Lain" });
    // Mengajukan tetap ditolak karena isiannya sendiri belum lengkap — bukan
    // mengambil alih isian/berkas nasabah lain.
    await expect(lain.sesi.mutation(api.kyc.ajukanKyc, {})).rejects.toThrow(
      /Nomor KTP \(NIK\) harus terdiri dari 16 angka/,
    );

    const semua = await t.run((ctx) => ctx.db.query("kycProfil").collect());
    expect(semua).toHaveLength(2);
    const barisPertama = semua.find((r) => r.userId === nasabah.userId);
    expect(barisPertama?.namaLengkap).toBe("RANI PUSPITA");
    expect(barisPertama?.status).toBe("PENDING_REVIEW");
    const barisLain = semua.find((r) => r.userId === lain.userId);
    expect(barisLain?.status).toBe("IN_PROGRESS");
    expect(barisLain?.ktpId).toBeUndefined();
  });

  it("Baris KYC lama (tanpa kolom aturan/persetujuan) tetap terbaca & bisa diputuskan", async () => {
    const { t, admin, nasabah } = await siapkanDua();
    // Bentuk baris yang ADA SEBELUM kolom versi aturan/persetujuan ditambahkan:
    // tidak ada `aturanTerverifikasi`, tidak ada `stempelTerverifikasi`, tidak ada
    // berkas. Migrasi tidak boleh membuat baris seperti ini tidak terbaca.
    await t.run((ctx) =>
      ctx.db.insert("kycProfil", {
        userId: nasabah.userId,
        status: "PENDING_REVIEW",
        namaLengkap: "RANI PUSPITA",
        nik: NIK,
        nomorWhatsApp: WA,
        penghasilanBulanan: 5_000_000,
        sumberPenghasilan: "Gaji bulanan",
        dibuatPada: 1_600_000_000_000,
        diperbaruiPada: 1_600_000_000_000,
        diajukanPada: 1_600_000_000_000,
      }),
    );

    const saya = await nasabah.sesi.query(api.kyc.kycSaya, {});
    expect(saya.status).toBe("PENDING_REVIEW");
    expect(saya.aturanTerverifikasi).toBeNull();
    // Baris lama TIDAK ditandai usang — migrasi tidak memaksa KYC ulang massal.
    expect(saya.aturanUsang).toBe(false);
    expect(saya.versiAturan).toBe(VERSI_ATURAN_KYC);
    expect(saya.riwayat).toEqual([]);

    const detail = await admin.sesi.query(api.kyc.detailKycAdmin, { userId: nasabah.userId });
    expect(detail?.aturanTerverifikasi).toBeNull();
    expect(detail?.aturanUsang).toBe(false);
    expect(detail?.berkas.every((b) => b.ada === false)).toBe(true);

    // Verifikasi tetap TIDAK bisa diambil hanya karena barisnya sudah lama ada.
    await expect(
      admin.sesi.mutation(api.kyc.tinjauKyc, { userId: nasabah.userId, keputusan: "VERIFIED" }),
    ).rejects.toThrow(/isian belum lengkap/);

    // Keputusan yang sah tetap jalan, dan datanya tidak hilang.
    const putusan = await admin.sesi.mutation(api.kyc.tinjauKyc, {
      userId: nasabah.userId,
      keputusan: "NEEDS_CORRECTION",
      catatan: "Lengkapi foto KTP, selfie, dan bukti penghasilan.",
    });
    expect(putusan.status).toBe("NEEDS_CORRECTION");
    const sesudah = await nasabah.sesi.query(api.kyc.kycSaya, {});
    expect(sesudah.status).toBe("NEEDS_CORRECTION");
    expect(sesudah.isian.nik).toBe(NIK);
    // Riwayat petugas menyimpan dasar aturannya (versi aturan tidak dikirim ke
    // tampilan nasabah — cukup bagi petugas yang mengaudit putusannya).
    const detailSesudah = await admin.sesi.query(api.kyc.detailKycAdmin, {
      userId: nasabah.userId,
    });
    expect(detailSesudah?.riwayat[0]).toMatchObject({
      dari: "PENDING_REVIEW",
      ke: "NEEDS_CORRECTION",
      versiAturan: VERSI_ATURAN_KYC,
    });

    // Baris lama tanpa persetujuan TIDAK boleh menampung data pribadi baru.
    await expect(
      nasabah.sesi.mutation(api.kyc.simpanProgresKyc, { alamat: "Jalan Baru No. 1, Bogor" }),
    ).rejects.toThrow(/Persetujuan pemrosesan data belum tercatat/);
  });

  it("Migrasi metadata berkas: admin-only, idempoten, dan tidak mengarang versi aturan", async () => {
    const t = convexTest(schema, modules);
    const admin = await siapkanPengguna(t, "Petugas Migrasi", {
      email: "petugas3@pindai.test",
      role: "admin",
    });
    const nasabah = await siapkanPengguna(t, "Rani Puspita", {
      email: "rani2@pindai.test",
      role: "peminjam",
    });

    // Baris "lama": berkasnya masih ada di storage, metadatanya belum tercatat.
    const idLama = await simpanGambarUji(t);
    await t.run((ctx) =>
      ctx.db.insert("berkasTerverifikasi", {
        storageId: idLama,
        label: "Foto KTP",
        jenis: "png",
        waktu: 1_600_000_000_000,
      }),
    );

    // Gerbang: nasabah (dan petugas tanpa TOTP) tidak boleh menjalankan migrasi.
    await expect(
      nasabah.sesi.mutation(api.kyc.backfillMetadataBerkas, { cursor: null }),
    ).rejects.toThrow(/Akses khusus Super Admin/);

    const pertama = await admin.sesi.mutation(api.kyc.backfillMetadataBerkas, { cursor: null });
    expect(pertama.dilengkapi).toBe(1);
    expect(pertama.berkasHilang).toBe(0);
    expect(pertama.selesai).toBe(true);

    const baris = await t.run((ctx) => ctx.db.query("berkasTerverifikasi").collect());
    expect(baris[0].ukuranByte).toBe(BYTE_PNG.byteLength);
    expect(baris[0].contentType).toBe("image/png");
    expect(baris[0].sidikJari).toMatch(/^[A-Za-z0-9+/]{43}=$/);
    // Aturan yang memeriksa berkas lama TIDAK diketahui — jangan dikarang.
    expect(baris[0].versiAturan).toBeUndefined();

    // Idempoten: pemanggilan berikutnya tidak menulis apa pun.
    const kedua = await admin.sesi.mutation(api.kyc.backfillMetadataBerkas, { cursor: null });
    expect(kedua.dilengkapi).toBe(0);
    expect(kedua.berkasHilang).toBe(0);
  });

  it("Menghapus akun juga menghapus data KYC & berkas identitasnya", async () => {
    const { t, admin, nasabah } = await siapkanDua();
    const berkas = await kirimLengkap(t, nasabah.sesi);

    // Catatan: `convexTest` belum mendukung syscall `storage.getMetadata`,
    // sehingga keberadaan blob diperiksa lewat `storage.getUrl` — yang juga
    // mengembalikan null setelah blob benar-benar dihapus.
    const sebelum = await t.run(async (ctx) => ({
      kyc: (await ctx.db.query("kycProfil").collect()).length,
      riwayat: (await ctx.db.query("kycRiwayat").collect()).length,
      penanda: (await ctx.db.query("berkasTerverifikasi").collect()).length,
      ktp: await ctx.storage.getUrl(berkas.ktpId),
    }));
    expect(sebelum.kyc).toBe(1);
    expect(sebelum.riwayat).toBeGreaterThan(0);
    expect(sebelum.penanda).toBe(3);
    expect(sebelum.ktp).not.toBeNull();

    await admin.sesi.mutation(api.admin.hapusNasabah, { userId: nasabah.userId });

    const sesudah = await t.run(async (ctx) => ({
      kyc: (await ctx.db.query("kycProfil").collect()).length,
      riwayat: (await ctx.db.query("kycRiwayat").collect()).length,
      penanda: (await ctx.db.query("berkasTerverifikasi").collect()).length,
      ktp: await ctx.storage.getUrl(berkas.ktpId),
      selfie: await ctx.storage.getUrl(berkas.selfieKtpId),
      bukti: await ctx.storage.getUrl(berkas.buktiPenghasilanId),
    }));
    // Tidak ada baris KYC, riwayat, atau penanda berkas yang tertinggal...
    expect(sesudah.kyc).toBe(0);
    expect(sesudah.riwayat).toBe(0);
    expect(sesudah.penanda).toBe(0);
    // ...dan foto identitasnya benar-benar hilang dari penyimpanan.
    expect(sesudah.ktp).toBeNull();
    expect(sesudah.selfie).toBeNull();
    expect(sesudah.bukti).toBeNull();
  });

  it("Akses: tamu & non-petugas ditolak, antrean admin berisi cacah per status", async () => {
    const t = convexTest(schema, modules);
    const admin = await siapkanPengguna(t, "Petugas KYC", {
      email: "petugas2@pindai.test",
      role: "admin",
    });
    const nasabahA = await siapkanPengguna(t, "Ayu Lestari", {
      email: "ayu@pindai.test",
      role: "peminjam",
    });
    const nasabahB = await siapkanPengguna(t, "Budi Santoso", {
      email: "budi2@pindai.test",
      role: "peminjam",
    });
    const tamu = await buatPengguna(t, "Tamu", { isAnonymous: true });
    const adminTanpaTotp = await buatPengguna(t, "Admin Baru", {
      email: "admin-baru@pindai.test",
      role: "admin",
    });

    // Tanpa sesi & akun tamu tidak bisa memakai modul KYC sama sekali.
    await expect(t.mutation(api.kyc.mulaiKyc, {})).rejects.toThrow(/Harus masuk terlebih dahulu/);
    await expect(t.query(api.kyc.kycSaya, {})).rejects.toThrow(/Harus masuk terlebih dahulu/);
    await expect(tamu.sesi.mutation(api.kyc.mulaiKyc, {})).rejects.toThrow(
      /Akun tamu hanya dapat melihat informasi/,
    );

    // Nasabah biasa tidak boleh membuka antrean petugas; admin tanpa TOTP juga.
    await expect(nasabahA.sesi.query(api.kyc.daftarKycAdmin, {})).rejects.toThrow(
      /Akses khusus Super Admin/,
    );
    await expect(adminTanpaTotp.sesi.query(api.kyc.daftarKycAdmin, {})).rejects.toThrow(
      /TOTP/,
    );

    await kirimLengkap(t, nasabahA.sesi);
    await setujui(nasabahB.sesi);
    await nasabahB.sesi.mutation(api.kyc.simpanProgresKyc, { namaLengkap: "Budi Santoso" });

    const antrean = await admin.sesi.query(api.kyc.daftarKycAdmin, {});
    expect(antrean.total).toBe(2);
    expect(antrean.cacah.PENDING_REVIEW).toBe(1);
    expect(antrean.cacah.IN_PROGRESS).toBe(1);

    const hanyaMenunggu = await admin.sesi.query(api.kyc.daftarKycAdmin, {
      status: "PENDING_REVIEW",
    });
    expect(hanyaMenunggu.item).toHaveLength(1);
    expect(hanyaMenunggu.item[0]).toMatchObject({ userId: nasabahA.userId, status: "PENDING_REVIEW" });

    const detail = await admin.sesi.query(api.kyc.detailKycAdmin, { userId: nasabahA.userId });
    expect(detail).toMatchObject({ status: "PENDING_REVIEW", nik: NIK, kekurangan: [] });
    expect(detail?.url.ktp).not.toBeNull();
    expect(detail?.riwayat.length).toBeGreaterThan(0);

    // Nasabah yang belum pernah menyentuh modul KYC → tidak ada baris.
    await expect(
      admin.sesi.query(api.kyc.detailKycAdmin, { userId: tamu.userId }),
    ).resolves.toBeNull();
    await expect(
      admin.sesi.mutation(api.kyc.tinjauKyc, { userId: tamu.userId, keputusan: "VERIFIED" }),
    ).rejects.toThrow(/Baris KYC nasabah tidak ditemukan/);
  });
});
