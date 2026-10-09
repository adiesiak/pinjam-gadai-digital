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

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
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
