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
 *    (magic bytes) — tanpa penanda, mutation menolak;
 *  - mesin keputusan otomatis MENAIKKAN status ke VERIFIED sendiri hanya bila
 *    seluruh pemeriksaan yang bisa diverifikasi mesin lulus — dan hasil yang
 *    gagal/tidak pasti hanya DICATAT, tidak menutup jalur verifikasi petugas.
 *
 * Menjalankan: bunx vitest run src/convex/kyc.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { VERSI_ATURAN_KYC } from "../lib/kycAturan";
import { KYC_STATUS } from "../lib/kycStatus";
import { VERSI_ATURAN_AUTO_KYC } from "../lib/kycAutoApproval";
import { VERSI_PERSETUJUAN_KYC } from "../lib/persetujuanKyc";
import { buatPengguna, siapkanPengguna, type KonteksUji, type SesiUji } from "./test.helpers";
import { modules } from "./test.setup";

const NIK = "3271012345678901";
const WA = "6281234567890";

/**
 * Susun berkas uji dari header asli + padding nol sampai melewati
 * `MIN_FILE_BYTES`: jalur nyata (data diri) juga memeriksa ukuran minimum,
 * sedangkan header tetap harus benar supaya pemeriksaan dimensi berjalan.
 */
function berkasUji(header: number[], ukuran = 2048): Uint8Array {
  const b = new Uint8Array(ukuran);
  b.set(header);
  return b;
}

/**
 * PNG 800×600: signature + chunk `IHDR` berisi lebar/tinggi, lalu padding.
 * Server membaca dimensi dari header, jadi berkas uji harus punya IHDR benar —
 * bukan sekadar magic bytes.
 */
const BYTE_PNG = berkasUji([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // signature
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // panjang + "IHDR"
  0x00, 0x00, 0x03, 0x20, // lebar 800
  0x00, 0x00, 0x02, 0x58, // tinggi 600
]);
/** PNG 20×10 — di bawah `DIMENSI_MIN`, untuk menguji penolakan "terlalu kecil". */
const BYTE_PNG_KECIL = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x14, // lebar 20
  0x00, 0x00, 0x00, 0x0a, // tinggi 10
]);
/** Isi berkas PDF (bukan gambar) untuk menguji penolakan magic bytes. */
const BYTE_PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
/** GIF ber-header sah — format yang TIDAK lagi diterima. */
const BYTE_GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x00, 0x00]);
/**
 * JPEG 800×600 (APP0 + SOF0 + EOI) — berkas LAIN dengan jenis & sidik jari yang
 * berbeda, dan dengan header dimensi yang bisa dibaca.
 */
const BYTE_JPG = berkasUji([
  0xff, 0xd8, // SOI
  0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01,
  0x00, 0x00, // APP0 "JFIF" (panjang 16)
  0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x58, 0x03, 0x20, 0x03, // SOF0: tinggi 600, lebar 800
  0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, // komponen
  0xff, 0xd9, // EOI
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

  it("Kontak darurat: opsional, tetapi nilai yang diisi diperiksa server juga", async () => {
    const { t, nasabah } = await siapkanDua();
    await setujui(nasabah.sesi);

    // Nilai yang tidak masuk akal ditolak SERVER, bukan hanya dikunci di layar:
    // nomor kontak darurat yang salah ketik justru tidak berguna saat dibutuhkan.
    await expect(
      nasabah.sesi.mutation(api.kyc.simpanProgresKyc, { nomorKontakDarurat: "0812345678" }),
    ).rejects.toThrow(/Nomor kontak darurat harus format 62/);
    await expect(
      nasabah.sesi.mutation(api.kyc.simpanProgresKyc, { namaKontakDarurat: "Al" }),
    ).rejects.toThrow(/Nama kontak darurat minimal 3 karakter/);
    await expect(
      nasabah.sesi.mutation(api.kyc.simpanProgresKyc, { hubunganKontakDarurat: "x" }),
    ).rejects.toThrow(/Hubungan minimal 3 karakter/);

    // Nilai yang sah tersimpan dan kembali lewat query yang sama dengan UI.
    await nasabah.sesi.mutation(api.kyc.simpanProgresKyc, {
      namaKontakDarurat: "Siti Rahayu",
      nomorKontakDarurat: "6281299887766",
      hubunganKontakDarurat: "Kakak",
    });
    const tersimpan = await nasabah.sesi.query(api.kyc.kycSaya, {});
    expect(tersimpan.isian.namaKontakDarurat).toBe("Siti Rahayu");
    expect(tersimpan.isian.nomorKontakDarurat).toBe("6281299887766");
    expect(tersimpan.isian.hubunganKontakDarurat).toBe("Kakak");

    // Menyimpan sebagian tidak menghapus kolom lain (yang tidak dikirim tetap).
    await nasabah.sesi.mutation(api.kyc.simpanProgresKyc, { hubunganKontakDarurat: "Adik" });
    const sesudah = await nasabah.sesi.query(api.kyc.kycSaya, {});
    expect(sesudah.isian.namaKontakDarurat).toBe("Siti Rahayu");
    expect(sesudah.isian.nomorKontakDarurat).toBe("6281299887766");
    expect(sesudah.isian.hubunganKontakDarurat).toBe("Adik");

    // OPSIONAL: kolom ini tidak pernah muncul sebagai kekurangan pengajuan.
    expect(sesudah.kekurangan.join(" ")).not.toMatch(/darurat/i);

    // Kontak darurat yang sah tidak menahan pengajuan yang lengkap.
    await kirimLengkap(t, nasabah.sesi);
    expect((await nasabah.sesi.query(api.kyc.kycSaya, {})).status).toBe("PENDING_REVIEW");

    // Baris yang MENYIMPAN nomor keliru (mis. diisi sebelum aturan ini ada)
    // tetap bisa disunting — hanya kolom yang dikirim yang diperiksa — tetapi
    // tidak boleh diajukan sebelum dibereskan: pengajuan adalah gerbang akhirnya.
    await t.run(async (ctx) => {
      const row = await ctx.db
        .query("kycProfil")
        .withIndex("by_user", (q) => q.eq("userId", nasabah.userId))
        .first();
      if (row === null) throw new Error("baris KYC uji tidak ada");
      await ctx.db.patch(row._id, { nomorKontakDarurat: "0812" });
    });
    await nasabah.sesi.mutation(api.kyc.simpanProgresKyc, { alamat: "Jalan Baru No. 3, Bogor" });
    await expect(nasabah.sesi.mutation(api.kyc.ajukanKyc, {})).rejects.toThrow(
      /Kontak darurat perlu diperbaiki/,
    );

    // Dikosongkan pun sah: yang salah hanya nilai yang DIISI tetapi keliru.
    await nasabah.sesi.mutation(api.kyc.simpanProgresKyc, { nomorKontakDarurat: "" });
    const hasil = await nasabah.sesi.mutation(api.kyc.ajukanKyc, {});
    expect(hasil.status).toBe("PENDING_REVIEW");
    const akhir = await nasabah.sesi.query(api.kyc.kycSaya, {});
    expect(akhir.isian.nomorKontakDarurat).toBe("");
    expect(akhir.isian.namaKontakDarurat).toBe("Siti Rahayu");
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

    // Format "berbahaya" walau berawalan image/: GIF (bisa beranimasi) ditolak.
    const gif = await simpanGambarUji(t, BYTE_GIF);
    await expect(
      nasabah.sesi.action(api.berkasIdentitas.periksaIsiBerkasKyc, { id: gif, label: "Foto KTP" }),
    ).rejects.toThrow(/tidak dikenali sebagai gambar/);

    // Gambar terbaca tetapi terlalu kecil (20×10) ditolak sebagai tidak terbaca.
    const kecil = await simpanGambarUji(t, BYTE_PNG_KECIL);
    await expect(
      nasabah.sesi.action(api.berkasIdentitas.periksaIsiBerkasKyc, { id: kecil, label: "Foto KTP" }),
    ).rejects.toThrow(/terlalu kecil/);

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
      // Dimensi dibaca dari HEADER berkas (800×600 pada BYTE_PNG) — bukan klaim klien.
      expect(p.lebar).toBe(800);
      expect(p.tinggi).toBe(600);
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

  it("Membatasi laju permintaan URL unggah berkas KYC per pengguna", async () => {
    const { t, nasabah } = await siapkanDua("Rani Puspita", "rani-laju@pindai.test");
    await setujui(nasabah.sesi);
    for (let i = 0; i < 30; i += 1) {
      await nasabah.sesi.mutation(api.kyc.urlUnggahBerkasKyc, {});
    }
    // Permintaan ke-31 dalam jendela 15 menit ditolak; pencatatnya di server.
    await expect(nasabah.sesi.mutation(api.kyc.urlUnggahBerkasKyc, {})).rejects.toThrow(
      /Terlalu banyak unggahan berkas/,
    );
    // Hanya mencatat id pengguna + waktu — tidak ada berkas atau isinya.
    const log = await t.run((ctx) => ctx.db.query("kycUnggahLog").collect());
    expect(log).toHaveLength(30);
    expect(log.every((b) => b.userId === nasabah.userId && typeof b.waktu === "number")).toBe(true);
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

/* ==========================================================================
 * KEPUTUSAN OTOMATIS — mesin `lib/kycAutoApproval.ts`
 * ==========================================================================
 *
 * Yang dijaga blok ini:
 *  - status naik ke VERIFIED SENDIRI hanya bila seluruh pemeriksaan yang bisa
 *    diverifikasi mesin lulus (isian, bentuk NIK, berkas yang diperiksa server,
 *    snapshot OCR di atas ambang, OTP WhatsApp);
 *  - hasil yang GAGAL atau BELUM PASTI hanya DICATAT lengkap (waktu, hasil tiap
 *    rule, alasan, versi aturan, sumber, aktor) — status TIDAK diturunkan mesin,
 *    pengajuan tetap di antrean petugas, dan petugas tetap bisa memverifikasi;
 *  - pemeriksaan ulang atas FAKTA yang sama tidak menulis keputusan kedua.
 */

/**
 * NIK dengan komponen tanggal lahir yang wajar (DDMMYY = 010100). Mesin memeriksa
 * bentuk itu sedangkan isian form tidak, jadi NIK lain akan membuat pemeriksaan
 * "format NIK" gagal dan menutupi pemeriksaan yang sedang diuji.
 */
const NIK_MESIN = "3271010101000001";

/** Isian KYC yang lulus seluruh pemeriksaan mesin. */
const ISI_MESIN = { ...ISI_LENGKAP, nik: NIK_MESIN };

/** Snapshot OCR yang cocok dengan isian di atas (keyakinan di atas ambang 80). */
const OCR_COCOK = {
  konfidensi: 92,
  nik: NIK_MESIN,
  nama: "RANI PUSPITA",
  alamat: ISI_LENGKAP.alamat,
};

type KeluarFonnte = { target: string; message: string };

/**
 * Fonnte palsu — cukup untuk memverifikasi nomor lewat jalur OTP yang SAMA dengan
 * produksi (`mintaOtpWa` → kode benar-benar dikirim → `verifikasiOtpWa`).
 */
function pasangFonnte() {
  const asli = globalThis.fetch;
  const keluar: KeluarFonnte[] = [];
  process.env.FONNTE_TOKEN = "token-uji-fonnte";
  globalThis.fetch = (async (_url: unknown, init?: { body?: unknown }) => {
    const body = new URLSearchParams(String(init?.body ?? ""));
    keluar.push({ target: body.get("target") ?? "", message: body.get("message") ?? "" });
    return new Response(JSON.stringify({ status: true, detail: "success! message in queue" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return {
    keluar,
    pulihkan: () => {
      globalThis.fetch = asli;
      delete process.env.FONNTE_TOKEN;
    },
  };
}

/** Verifikasi nomor WhatsApp lewat kode yang benar-benar dikirim keluar. */
async function verifikasiWa(sesi: SesiUji): Promise<void> {
  const fonnte = pasangFonnte();
  try {
    const kirim = await sesi.action(api.otpWhatsapp.mintaOtpWa, {
      tujuan: "verifikasi_nomor",
      ip: "10.0.0.1",
    });
    expect(kirim.terkirim).toBe(true);
    const kode = fonnte.keluar[0]?.message.match(/\d{6}/)?.[0] ?? "";
    expect(kode).toHaveLength(6);
    const hasil = await sesi.mutation(api.otpWhatsapp.verifikasiOtpWa, {
      tujuan: "verifikasi_nomor",
      kode,
      ip: "10.0.0.1",
    });
    expect(hasil.ok).toBe(true);
  } finally {
    fonnte.pulihkan();
  }
}

/**
 * Siapkan pengajuan: persetujuan, tiga berkas yang isinya diperiksa server,
 * isian lengkap + snapshot OCR, lalu (bila diminta) nomor WhatsApp diverifikasi
 * lewat OTP. Berkas dikembalikan supaya uji bisa menyimpan ULANG data yang sama.
 */
async function siapkanMesin(
  t: KonteksUji,
  sesi: SesiUji,
  opsi: { ocr?: boolean; wa?: boolean } = {},
): Promise<BerkasKyc> {
  const pakaiOcr = opsi.ocr ?? true;
  const pakaiWa = opsi.wa ?? true;
  await setujui(sesi);
  const berkas: BerkasKyc = {
    ktpId: await unggah(t, sesi, "Foto KTP"),
    selfieKtpId: await unggah(t, sesi, "Selfie dengan KTP"),
    buktiPenghasilanId: await unggah(t, sesi, "Bukti penghasilan"),
  };
  await simpanUlang(sesi, berkas, pakaiOcr);
  if (pakaiWa) await verifikasiWa(sesi);
  return berkas;
}

/**
 * Simpan ULANG isian yang sama. Menyunting saat `PENDING_REVIEW` menarik
 * pengajuan kembali ke `IN_PROGRESS` (lihat `statusSetelahSunting`), jadi ini
 * jalur nyata "kirim ulang" — bukan panggilan mesin secara langsung.
 */
async function simpanUlang(
  sesi: SesiUji,
  berkas: BerkasKyc,
  pakaiOcr = true,
): Promise<void> {
  await sesi.mutation(api.kyc.simpanProgresKyc, {
    ...ISI_MESIN,
    ...berkas,
    ...(pakaiOcr ? { ocrKtp: OCR_COCOK } : {}),
  });
}

/** Semua keputusan otomatis milik satu nasabah, urut waktu. */
async function keputusanMesin(t: KonteksUji, userId: Id<"users">) {
  return t.run(async (ctx) =>
    ctx.db
      .query("kycKeputusanOtomatis")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
  );
}

describe("keputusan otomatis KYC", () => {
  it("Seluruh pemeriksaan lulus → KYC otomatis VERIFIED, tercatat lengkap sekali", async () => {
    const { t, nasabah } = await siapkanDua();
    await siapkanMesin(t, nasabah.sesi);

    const hasil = await nasabah.sesi.mutation(api.kyc.ajukanKyc, {});
    expect(hasil.status).toBe("VERIFIED");
    expect(hasil.otomatis).toEqual({ keputusan: "VERIFIED", diterapkan: true });

    const keputusan = await keputusanMesin(t, nasabah.userId);
    expect(keputusan).toHaveLength(1);
    const k = keputusan[0]!;
    expect(k).toMatchObject({
      statusSebelum: "PENDING_REVIEW",
      keputusan: "VERIFIED",
      alasan: "otomatis_semua_pemeriksaan_lulus",
      versiAturan: VERSI_ATURAN_AUTO_KYC,
      sumber: "otomatis",
      aktor: "sistem",
      diterapkan: true,
    });
    // Waktu pemeriksaan + hasil SETIAP rule + dari mana faktanya berasal.
    expect(typeof k.waktu).toBe("number");
    expect(k.aturan).toHaveLength(9);
    expect(k.aturan.every((r) => r.status === "lulus")).toBe(true);
    expect(k.aturan.some((r) => r.id === "nomor_wa_terverifikasi" && r.sumber === "server")).toBe(
      true,
    );
    expect(k.aturan.some((r) => r.id === "ocr_tersedia_threshold" && r.sumber === "klien")).toBe(
      true,
    );
    // Sidik jari: bahan idempotensi, dan TIDAK memuat data pribadi.
    expect(k.sidikJari).toContain(VERSI_ATURAN_AUTO_KYC);
    expect(k.sidikJari).not.toContain(NIK_MESIN);

    // Jejak: riwayat + audit menulis aktor "sistem" beserta dasar aturannya.
    const { riwayat, audit, loans } = await t.run(async (ctx) => ({
      riwayat: await ctx.db.query("kycRiwayat").collect(),
      audit: await ctx.db.query("auditLog").collect(),
      loans: await ctx.db.query("loans").collect(),
    }));
    const jejak = riwayat.find((r) => r.ke === "VERIFIED");
    expect(jejak).toMatchObject({
      aktor: "sistem",
      aktorLabel: "Sistem (keputusan otomatis)",
      alasan: "otomatis_semua_pemeriksaan_lulus",
      versiAturan: VERSI_ATURAN_KYC,
    });
    expect(typeof jejak?.waktu).toBe("number");
    expect(audit.some((a) => a.aksi === "kyc_verified")).toBe(true);
    // VERIFIED hanya berarti proses KYC berhasil — bukan pinjaman/dana.
    expect(loans).toHaveLength(0);
  });

  it("Ada pemeriksaan yang gagal → mesin hanya mencatat; petugas tetap bisa memverifikasi", async () => {
    const { t, admin, nasabah } = await siapkanDua();
    // Nomor WhatsApp sengaja BELUM diverifikasi lewat OTP.
    await siapkanMesin(t, nasabah.sesi, { wa: false });

    const hasil = await nasabah.sesi.mutation(api.kyc.ajukanKyc, {});
    // Mesin TIDAK menurunkan status: pengajuan tetap di antrean petugas.
    expect(hasil.status).toBe("PENDING_REVIEW");
    expect(hasil.otomatis).toEqual({ keputusan: "NEEDS_CORRECTION", diterapkan: false });

    const keputusan = await keputusanMesin(t, nasabah.userId);
    expect(keputusan).toHaveLength(1);
    const k = keputusan[0]!;
    expect(k).toMatchObject({ keputusan: "NEEDS_CORRECTION", diterapkan: false });
    const gagal = k.aturan.filter((r) => r.status === "gagal");
    expect(gagal.map((r) => r.id)).toContain("nomor_wa_terverifikasi");
    // Hasil yang gagal DIKATAKAN apa adanya: pesan OTP hanya soal kontrol nomor.
    expect(gagal.map((r) => r.pesan).join(" ")).toMatch(/OTP/i);
    expect(k.ringkasan.length).toBeGreaterThan(0);

    // Di sisi nasabah keputusan mesin terlihat, dengan status tetap menunggu.
    const saya = await nasabah.sesi.query(api.kyc.kycSaya, {});
    expect(saya.status).toBe("PENDING_REVIEW");
    expect(saya.keputusanOtomatis).toMatchObject({
      keputusan: "NEEDS_CORRECTION",
      diterapkan: false,
      versiAturan: VERSI_ATURAN_AUTO_KYC,
    });

    // Dan yang PENTING: petugas tetap bisa memverifikasi (tidak terkunci).
    await expect(
      admin.sesi.mutation(api.kyc.tinjauKyc, {
        userId: nasabah.userId,
        keputusan: "VERIFIED",
      }),
    ).resolves.toMatchObject({ ok: true, status: "VERIFIED" });
  });

  it("OCR belum tersedia → bukan gagal, tapi belum pasti: dicatat, ditinjau petugas", async () => {
    const { t, nasabah } = await siapkanDua();
    await siapkanMesin(t, nasabah.sesi, { ocr: false });

    const hasil = await nasabah.sesi.mutation(api.kyc.ajukanKyc, {});
    expect(hasil.status).toBe("PENDING_REVIEW");
    expect(hasil.otomatis).toEqual({ keputusan: "PENDING_REVIEW", diterapkan: false });

    const k = (await keputusanMesin(t, nasabah.userId))[0]!;
    expect(k).toMatchObject({
      keputusan: "PENDING_REVIEW",
      alasan: "otomatis_menunggu_peninjauan",
      diterapkan: false,
    });
    // Tidak ada yang GAGAL; yang ada adalah pemeriksaan yang tak bisa dipastikan.
    expect(k.aturan.filter((r) => r.status === "gagal")).toHaveLength(0);
    const takPasti = k.aturan.filter((r) => r.status === "tidak_pasti").map((r) => r.id);
    expect(takPasti).toContain("ocr_tersedia_threshold");
    expect(takPasti).toContain("ocr_konsisten");
    expect(takPasti).toContain("tanpa_ketidaksesuaian_material");
  });

  it("IDEMPOTEN: fakta yang sama saat kirim ulang tidak membuat keputusan kedua", async () => {
    const { t, nasabah } = await siapkanDua();
    const berkas = await siapkanMesin(t, nasabah.sesi, { wa: false });

    await nasabah.sesi.mutation(api.kyc.ajukanKyc, {});
    const pertama = await keputusanMesin(t, nasabah.userId);
    expect(pertama).toHaveLength(1);

    // Kirim ulang TANPA mengubah fakta yang diperiksa mesin.
    await simpanUlang(nasabah.sesi, berkas);
    const ulang = await nasabah.sesi.mutation(api.kyc.ajukanKyc, {});
    expect(ulang.status).toBe("PENDING_REVIEW");
    expect(ulang.otomatis?.diterapkan).toBe(false);

    const kedua = await keputusanMesin(t, nasabah.userId);
    // Satu keputusan per sidik jari: barisnya tidak digandakan dan tidak diubah.
    expect(kedua).toHaveLength(1);
    expect(kedua[0]).toMatchObject({ _id: pertama[0]!._id, waktu: pertama[0]!.waktu });
  });

  it("Nasabah memperbaiki, kirim ulang → mesin mencatat keputusan BARU dan memverifikasi", async () => {
    const { t, nasabah } = await siapkanDua();
    const berkas = await siapkanMesin(t, nasabah.sesi, { wa: false });

    await nasabah.sesi.mutation(api.kyc.ajukanKyc, {});
    expect((await keputusanMesin(t, nasabah.userId))[0]?.keputusan).toBe("NEEDS_CORRECTION");

    // Nasabah melengkapi kekurangannya (nomor WhatsApp diverifikasi lewat OTP),
    // lalu mengirim ulang. Fakta berubah ⇒ sidik jari berubah ⇒ keputusan baru.
    await simpanUlang(nasabah.sesi, berkas);
    await verifikasiWa(nasabah.sesi);
    const ulang = await nasabah.sesi.mutation(api.kyc.ajukanKyc, {});

    expect(ulang.status).toBe("VERIFIED");
    expect(ulang.otomatis).toEqual({ keputusan: "VERIFIED", diterapkan: true });
    const keputusan = await keputusanMesin(t, nasabah.userId);
    expect(keputusan).toHaveLength(2);
    expect(keputusan.map((k) => [k.keputusan, k.diterapkan])).toEqual([
      ["NEEDS_CORRECTION", false],
      ["VERIFIED", true],
    ]);
    expect(keputusan[0]!.sidikJari).not.toBe(keputusan[1]!.sidikJari);
  });
});

/* ==========================================================================
 * KONSOL PEMERIKSAAN KYC di panel petugas
 * ==========================================================================
 *
 * Yang dijaga blok ini:
 *  - penyaringan (kata kunci, status, rentang tanggal, HASIL PEMERIKSAAN)
 *    dijalankan SERVER: nilai saringan yang tidak dikenal diabaikan (bukan
 *    ditebak), cacah per status mengikuti saringan yang aktif, dan hasil tiap
 *    saringan konsisten dengan fakta yang dilaporkan barisnya;
 *  - rincian yang dibutuhkan petugas tersedia lengkap: hasil OCR apa adanya,
 *    ketidaksesuaian material/lunak, keadaan tiap dokumen, dasar aturan, hasil
 *    mesin, dan jejak audit nasabah itu sendiri;
 *  - dokumen identitas tetap PRIVAT: URL bertanda tangan hanya keluar dari
 *    `detailKycAdmin` (admin ber-TOTP), nasabah lain tidak melihat apa pun milik
 *    orang lain, dan antrean petugas tidak pernah memuat URL.
 */

/** Tanggal `YYYY-MM-DD` menurut zona waktu server — sama dengan `rentangTanggal`. */
function tanggalLokal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

describe("konsol pemeriksaan KYC di panel petugas", () => {
  it("Menyaring antrean: kata kunci, status, tanggal, dan hasil pemeriksaan", async () => {
    const t = convexTest(schema, modules);
    const admin = await siapkanPengguna(t, "Petugas KYC", {
      email: "petugas3@pindai.test",
      role: "admin",
    });
    const ayu = await siapkanPengguna(t, "Ayu Lestari", {
      email: "ayu3@pindai.test",
      role: "peminjam",
    });
    const budi = await siapkanPengguna(t, "Budi Santoso", {
      email: "budi3@pindai.test",
      role: "peminjam",
    });

    // Ayu mengirim pengajuan LENGKAP (menunggu peninjauan, nomor WhatsApp belum
    // dibuktikan OTP); Budi baru menyimpan satu field (sedang diisi, isian kurang).
    await kirimLengkap(t, ayu.sesi);
    await setujui(budi.sesi);
    await budi.sesi.mutation(api.kyc.simpanProgresKyc, { namaLengkap: "Budi Santoso" });
    // Kode pseudonim diterbitkan saat akun punya pengajuan pinjaman; di uji ini
    // baris pengajuan tidak dibuat, jadi kodenya diisi langsung supaya pencarian
    // "nomor/kode nasabah" benar-benar diuji (dan bukan lewat jalur pinjaman).
    const KODE_AYU = "PGD-20261010-AYU1";
    await t.run((ctx) => ctx.db.patch(ayu.userId, { kodePeminjam: KODE_AYU }));

    const semua = await admin.sesi.query(api.kyc.daftarKycAdmin, {});
    expect(semua.total).toBe(2);
    expect(semua.tampil).toBe(2);
    const barisAyu = semua.item.find((i) => i.userId === ayu.userId);
    expect(barisAyu?.kodePeminjam).toBe(KODE_AYU);
    expect(barisAyu?.kekurangan).toEqual([]);
    // Nama tampil baris adalah nama hasil PENYELARASAN data diri: isian KYC yang
    // menang atas nama akun, jadi pencarian nama diuji dengan bentuk itu.
    expect(barisAyu?.nama).toBe("RANI PUSPITA");

    // ===== Kata kunci: nama, kode nasabah, dan email =====
    for (const cari of ["ayu", "AYU3@PINDAI.TEST", "rani puspita", "RANI", KODE_AYU, "20261010-ayu1"]) {
      const hasil = await admin.sesi.query(api.kyc.daftarKycAdmin, { cari });
      expect(hasil.item.map((i) => i.userId), `cari="${cari}"`).toEqual([ayu.userId]);
      // Cacah mengikuti saringan TANPA bagian status: Budi tidak ikut dihitung.
      expect(hasil.cacah.PENDING_REVIEW).toBe(1);
      expect(hasil.cacah.IN_PROGRESS).toBe(0);
      // `total` tetap seluruh baris — bukan jumlah hasil saringan.
      expect(hasil.total).toBe(2);
    }
    const takAda = await admin.sesi.query(api.kyc.daftarKycAdmin, { cari: "tidak-ada-nasabah" });
    expect(takAda.item).toHaveLength(0);
    expect(takAda.total).toBe(2);

    // ===== Status =====
    const menunggu = await admin.sesi.query(api.kyc.daftarKycAdmin, { status: "PENDING_REVIEW" });
    expect(menunggu.item.map((i) => i.userId)).toEqual([ayu.userId]);
    const sedangDiisi = await admin.sesi.query(api.kyc.daftarKycAdmin, { status: "IN_PROGRESS" });
    expect(sedangDiisi.item.map((i) => i.userId)).toEqual([budi.userId]);
    // Cacah selalu memuat SELURUH status (termasuk yang nol) supaya tombolnya stabil.
    expect(Object.keys(menunggu.cacah).sort()).toEqual([...KYC_STATUS].sort());

    // Saringan yang TIDAK DIKENAL diabaikan — bukan diterjemahkan ke status lain.
    const statusNgawur = await admin.sesi.query(api.kyc.daftarKycAdmin, { status: "STATUS_NGAWUR" });
    expect(statusNgawur.item).toHaveLength(2);
    const hasilNgawur = await admin.sesi.query(api.kyc.daftarKycAdmin, { hasil: "ngawur" });
    expect(hasilNgawur.item).toHaveLength(2);

    // ===== Rentang tanggal (batas `sampai` INKLUSIF) =====
    const hariIni = tanggalLokal(new Date());
    const kemarin = tanggalLokal(new Date(Date.now() - 24 * 60 * 60 * 1000));
    const hariIniSaja = await admin.sesi.query(api.kyc.daftarKycAdmin, {
      dari: hariIni,
      sampai: hariIni,
    });
    expect(hariIniSaja.item).toHaveLength(2);
    const kemarinSaja = await admin.sesi.query(api.kyc.daftarKycAdmin, {
      dari: kemarin,
      sampai: kemarin,
    });
    expect(kemarinSaja.item).toHaveLength(0);
    const masaDepan = await admin.sesi.query(api.kyc.daftarKycAdmin, { dari: "2999-01-01" });
    expect(masaDepan.item).toHaveLength(0);
    // Teks yang bukan `YYYY-MM-DD` diabaikan (bukan ditafsirkan sebagai tanggal).
    const tanggalNgawur = await admin.sesi.query(api.kyc.daftarKycAdmin, { dari: "31-12-2026" });
    expect(tanggalNgawur.item).toHaveLength(2);

    // ===== Hasil pemeriksaan =====
    const belumOtp = await admin.sesi.query(api.kyc.daftarKycAdmin, { hasil: "belum_otp" });
    expect(belumOtp.item).toHaveLength(2);
    expect(belumOtp.item.every((i) => i.nomorWhatsAppTerbukti === false)).toBe(true);
    const isianKurang = await admin.sesi.query(api.kyc.daftarKycAdmin, { hasil: "isian_kurang" });
    expect(isianKurang.item.map((i) => i.userId)).toEqual([budi.userId]);

    // Hasil mesin: saringan `otomatis_*` dibaca dari keputusan mesin terakhir.
    const perluPerbaikan = await admin.sesi.query(api.kyc.daftarKycAdmin, {
      hasil: "otomatis_perlu_perbaikan",
    });
    expect(perluPerbaikan.item.map((i) => i.userId)).toEqual([ayu.userId]);
    expect(perluPerbaikan.item[0]?.keputusanOtomatis?.keputusan).toBe("NEEDS_CORRECTION");
    const otomatisVerifikasi = await admin.sesi.query(api.kyc.daftarKycAdmin, {
      hasil: "otomatis_verifikasi",
    });
    expect(otomatisVerifikasi.item).toHaveLength(0);

    // Fakta mahal (keputusan mesin) hanya dibaca saat saringannya meminta: daftar
    // tanpa saringan `otomatis_*` melaporkan `null`, dan itu memang disengaja.
    expect(semua.item.every((i) => i.keputusanOtomatis === null)).toBe(true);

    const lewatTigaSaringan: Id<"users">[] = [];
    for (const hasil of [
      "otomatis_verifikasi",
      "otomatis_perlu_perbaikan",
      "otomatis_menunggu",
    ] as const) {
      const hasilMesin = await admin.sesi.query(api.kyc.daftarKycAdmin, { hasil });
      for (const item of hasilMesin.item) {
        // Baris yang lolos saringan mesin SELALU membawa hasil mesinnya.
        expect(item.keputusanOtomatis).not.toBeNull();
        lewatTigaSaringan.push(item.userId);
      }
    }
    // Gabungan ketiga saringan `otomatis_*` = tepat baris yang punya catatan mesin
    // di tabel — dibandingkan dengan datanya langsung, bukan dengan tebakan.
    const keputusanTersimpan = await t.run((ctx) =>
      ctx.db.query("kycKeputusanOtomatis").collect(),
    );
    expect(keputusanTersimpan.map((k) => k.userId)).toEqual([ayu.userId]);
    expect(lewatSaringanSorted(lewatTigaSaringan)).toEqual(
      lewatSaringanSorted(keputusanTersimpan.map((k) => k.userId)),
    );

    // ===== Fakta mahal hanya dibaca saat saringannya meminta =====
    const rowAyu = await t.run((ctx) =>
      ctx.db
        .query("kycProfil")
        .withIndex("by_user", (q) => q.eq("userId", ayu.userId))
        .first(),
    );
    if (rowAyu === null) throw new Error("Baris KYC Ayu tidak ditemukan.");
    // Berkas tersimpan TANPA penanda pemeriksaan isi (mis. baris lama) — slot itu
    // belum bisa dinilai petugas.
    const tanpaPenanda = await simpanGambarUji(t);
    await t.run((ctx) => ctx.db.patch(rowAyu._id, { ktpId: tanpaPenanda }));
    const belumDiperiksa = await admin.sesi.query(api.kyc.daftarKycAdmin, {
      hasil: "dokumen_belum_diperiksa",
    });
    expect(belumDiperiksa.item.map((i) => i.userId)).toEqual([ayu.userId]);
    // Putusan lama yang tercatat dengan versi aturan tidak berlaku lagi.
    await t.run((ctx) =>
      ctx.db.patch(rowAyu._id, {
        aturanTerverifikasi: { versi: "kyc-aturan-2020-01", pada: Date.now() },
      }),
    );
    const aturanLama = await admin.sesi.query(api.kyc.daftarKycAdmin, { hasil: "aturan_lama" });
    expect(aturanLama.item.map((i) => i.userId)).toEqual([ayu.userId]);
    // `verifikasi_ulang` hanya cocok untuk data identitas yang berubah setelah VERIFIED.
    const verifikasiUlang = await admin.sesi.query(api.kyc.daftarKycAdmin, {
      hasil: "verifikasi_ulang",
    });
    expect(verifikasiUlang.item).toHaveLength(0);
  });

  it("Rincian KYC menyajikan OCR, ketidaksesuaian, keadaan dokumen, dan jejak audit", async () => {
    const { t, admin, nasabah } = await siapkanDua("Rani Puspita", "rani3@pindai.test");
    await t.run((ctx) => ctx.db.patch(nasabah.userId, { kodePeminjam: "PGD-20261010-RNI1" }));
    await setujui(nasabah.sesi);
    const berkas: BerkasKyc = {
      ktpId: await unggah(t, nasabah.sesi, "Foto KTP"),
      selfieKtpId: await unggah(t, nasabah.sesi, "Selfie dengan KTP"),
      buktiPenghasilanId: await unggah(t, nasabah.sesi, "Bukti penghasilan"),
    };
    // Snapshot OCR di atas ambang keyakinan, tetapi NIK-nya BEDA dari isian →
    // perbedaan MATERIAL yang harus terlihat petugas sebelum memutuskan.
    await nasabah.sesi.mutation(api.kyc.simpanProgresKyc, {
      ...ISI_LENGKAP,
      ...berkas,
      ocrKtp: {
        konfidensi: 93,
        nik: NIK.replace(/\d$/, "9"),
        nama: "RANI PUSPITA",
        alamat: ISI_LENGKAP.alamat,
      },
    });
    await nasabah.sesi.mutation(api.kyc.ajukanKyc, {});

    const detail = await admin.sesi.query(api.kyc.detailKycAdmin, { userId: nasabah.userId });
    expect(detail).not.toBeNull();
    if (detail === null) return;

    expect(detail.status).toBe("PENDING_REVIEW");
    expect(detail.kodePeminjam).toBe("PGD-20261010-RNI1");
    expect(detail.persetujuanAktif).toBe(true);
    expect(detail.kekurangan).toEqual([]);
    expect(detail.nomorWhatsAppTerbukti).toBe(false);
    expect(detail.verifikasiUlangTertunda).toBe(false);

    // Hasil OCR apa adanya (sumber klien) + pembandingan material/lunak.
    expect(detail.ocrKtp).toMatchObject({
      konfidensi: 93,
      sumber: "klien",
      nama: "RANI PUSPITA",
    });
    expect(detail.ketidaksesuaian.material.map((b) => b.field)).toEqual(["nik"]);
    expect(detail.ketidaksesuaian.lunak).toEqual([]);

    // Keadaan tiap dokumen + metadata yang dibaca dari ISI berkas.
    expect(detail.berkas.map((b) => b.slot)).toEqual(["ktp", "selfie", "bukti"]);
    expect(detail.berkas.map((b) => b.statusDokumen)).toEqual(["siap", "siap", "siap"]);
    expect(detail.berkas.map((b) => b.dipakaiAkunLain)).toEqual([0, 0, 0]);
    const ktp = detail.berkas[0];
    expect(ktp).toMatchObject({ jenis: "png", lebar: 800, tinggi: 600, aturanUsang: false });
    expect(ktp?.ukuranByte ?? 0).toBeGreaterThan(0);
    expect(ktp?.sidikJari).toMatch(/^[A-Za-z0-9+/]{43}=$/);

    // Tautan bertanda tangan & berumur pendek: hanya dari rincian ini.
    expect(detail.url.ktp).toContain("/berkas?id=");
    expect(detail.url.ktp).toContain("&sig=");
    expect(detail.url.selfie).toContain("/berkas?id=");

    // Dasar aturan, hasil mesin, riwayat status, dan JEJAK AUDIT nasabah ini.
    expect(detail.versiAturan).toBe(VERSI_ATURAN_KYC);
    expect(detail.aturanTerverifikasi).toBeNull();
    expect(detail.keputusanOtomatis?.aturan.length ?? 0).toBeGreaterThan(0);
    expect(detail.keputusanOtomatis?.diterapkan).toBe(false);
    expect(detail.riwayat.some((r) => r.ke === "PENDING_REVIEW" && r.aktor === "nasabah")).toBe(true);
    const aksiAudit = detail.audit.map((a) => a.aksi);
    expect(aksiAudit).toContain("kyc_persetujuan");
    expect(aksiAudit).toContain("kyc_pending_review");
    expect(detail.audit.every((a) => typeof a.aktorLabel === "string" && a.aktorLabel !== "")).toBe(true);
  });

  it("Dokumen identitas tetap privat: hanya panel admin ber-TOTP yang bisa membukanya", async () => {
    const { t, admin, nasabah } = await siapkanDua("Rani Puspita", "rani4@pindai.test");
    const berkas = await kirimLengkap(t, nasabah.sesi);
    const pendana = await siapkanPengguna(t, "Penyedia Dana", {
      email: "dana4@pindai.test",
      role: "dana",
    });
    const nasabahLain = await siapkanPengguna(t, "Nasabah Lain", {
      email: "lain4@pindai.test",
      role: "peminjam",
    });
    const adminTanpaTotp = await buatPengguna(t, "Admin Baru", {
      email: "admin-baru4@pindai.test",
      role: "admin",
    });

    // Satu-satunya permukaan yang mengeluarkan URL dokumen identitas: penyedia
    // dana dan nasabah lain sama-sama ditolak.
    for (const sesi of [pendana.sesi, nasabahLain.sesi]) {
      await expect(
        sesi.query(api.kyc.detailKycAdmin, { userId: nasabah.userId }),
      ).rejects.toThrow(/Akses khusus Super Admin/);
    }
    // Admin tanpa TOTP pun ditolak: panel identitas butuh langkah kedua.
    await expect(
      adminTanpaTotp.sesi.query(api.kyc.detailKycAdmin, { userId: nasabah.userId }),
    ).rejects.toThrow(/TOTP/);

    // Nasabah lain hanya melihat baris KYC-nya sendiri — tanpa id berkas, NIK,
    // maupun URL milik orang lain.
    const milikLain = JSON.stringify(await nasabahLain.sesi.query(api.kyc.kycSaya, {}));
    for (const rahasia of [berkas.ktpId, berkas.selfieKtpId, NIK]) {
      expect(milikLain).not.toContain(rahasia);
    }

    // Antrean petugas memuat METADATA saja: tidak pernah tautan berkas.
    const antrean = await admin.sesi.query(api.kyc.daftarKycAdmin, {});
    expect(antrean.item).toHaveLength(1);
    expect(JSON.stringify(antrean)).not.toContain("/berkas?");

    // Gerbangnya bukan tombol mati: admin ber-TOTP tetap bisa membukanya.
    const detail = await admin.sesi.query(api.kyc.detailKycAdmin, { userId: nasabah.userId });
    expect(detail?.url.ktp).toContain("/berkas?id=");
    expect(detail?.url.ktp).toContain("&sig=");
  });
});

/** Urutkan daftar id agar perbandingan himpunan tidak bergantung urutan baris. */
function lewatSaringanSorted(ids: Id<"users">[]): string[] {
  return [...ids].map((id) => String(id)).sort();
}

/**
 * Gerbang KYC pada pengajuan finansial.
 *
 * Sebelum ini modul KYC berdiri sendiri tanpa mengikat pengajuan: nasabah bisa
 * mengirim pinjaman/gadai/kredit tanpa status VERIFIED. Tes ini memastikan
 * gerbangnya HIDUP di server (bukan hanya peringatan di UI) dan bahwa setelah
 * VERIFIED jalur pengajuan kembali normal.
 */
describe("gerbang KYC pada pengajuan finansial", () => {
  const TITIK = { lat: -6.2, lng: 106.816666, akurasi: 25 };

  /** Peminjam dengan lokasi aktif — supaya yang diuji benar-benar gerbang KYC. */
  async function peminjamSiap(t: KonteksUji, email: string) {
    const { sesi, userId } = await siapkanPengguna(t, "gerbang-kyc", {
      email,
      role: "peminjam",
    });
    await sesi.mutation(api.lokasi.catatLokasi, { ...TITIK, sumber: "web" });
    return { sesi, userId };
  }

  const GADAI = {
    deskripsiBarang: "iPhone 14 Pro 256 GB lengkap dengan kotak",
    kategori: "Elektronik",
    alamatPenilaian: "Jl. Merdeka No. 10, Jakarta Pusat",
    namaLengkap: "Rani Peminjam",
    namaBank: "BCA",
    nomorRekening: "1234567890",
  };

  const KREDIT = {
    namaBarang: "Kulkas dua pintu",
    kategori: "Elektronik",
    merchant: "Tokopedia",
    hargaBarang: 1_000_000,
    // DP wajib 10–50% sejak pengajuan; 20% menjaga pokok dibiayai di bawah batas.
    dpPersen: 20,
    tenorBulan: 6,
    marginPersenPerBulan: 3,
    namaLengkap: "Rani Peminjam",
    nik: "3201234567890003",
    nomorRekening: "1234567892",
    nomorWhatsApp: "628123456791",
  };

  async function tandaiVerified(t: KonteksUji, userId: Id<"users">): Promise<void> {
    const now = Date.now();
    await t.run((ctx) =>
      ctx.db.insert("kycProfil", {
        userId,
        status: "VERIFIED",
        namaLengkap: "RANI PEMINJAM",
        nik: "3201234567890003",
        nomorWhatsApp: "628123456791",
        dibuatPada: now,
        diperbaruiPada: now,
      }),
    );
  }

  it("menolak pengajuan gadai sebelum KYC VERIFIED", async () => {
    const t = convexTest(schema, modules);
    const { sesi } = await peminjamSiap(t, "gerbang-gadai@pindai.test");
    await expect(sesi.mutation(api.loans.createPawnApplication, GADAI)).rejects.toThrow(
      /KYC diperlukan sebelum pengajuan dapat dikirim/i,
    );
  });

  it("menolak pengajuan kredit barang sebelum KYC VERIFIED", async () => {
    const t = convexTest(schema, modules);
    const { sesi } = await peminjamSiap(t, "gerbang-kredit@pindai.test");
    await expect(
      sesi.mutation(api.kredit.ajukanKreditBarang, KREDIT),
    ).rejects.toThrow(/KYC diperlukan sebelum pengajuan dapat dikirim/i);
  });

  it("melayani pengajuan gadai setelah KYC VERIFIED", async () => {
    const t = convexTest(schema, modules);
    const { sesi, userId } = await peminjamSiap(t, "gerbang-gadai-ok@pindai.test");
    await tandaiVerified(t, userId);
    await expect(sesi.mutation(api.loans.createPawnApplication, GADAI)).resolves.toBeDefined();
  });

  it("melayani pengajuan kredit barang setelah KYC VERIFIED", async () => {
    const t = convexTest(schema, modules);
    const { sesi, userId } = await peminjamSiap(t, "gerbang-kredit-ok@pindai.test");
    await tandaiVerified(t, userId);
    await expect(
      sesi.mutation(api.kredit.ajukanKreditBarang, KREDIT),
    ).resolves.toBeDefined();
  });
});

describe("KYC manual oleh petugas", () => {
  const MANUAL = {
    namaLengkap: "Siti Aminah",
    nik: "3271012345678902",
    nomorWhatsApp: "6281299887766",
    alamat: "Jalan Melati No. 5, Depok",
    pekerjaan: "Wirausaha",
    penghasilanBulanan: 4_500_000,
    sumberPenghasilan: "Usaha warung",
    namaBank: "BRI",
    nomorRekening: "9876543210",
    catatanVerifikasi:
      "KTP asli diperiksa tatap muka di kantor, 24 Okt 2026; nasabah menyetujui pemrosesan data.",
    konfirmasiDokumenFisik: true,
  };

  /**
   * Isian manual + foto KTP. Foto WAJIB sejak jalur ini menutup celah
   * "terverifikasi tanpa satu pun bukti identitas", jadi setiap tes yang
   * mengharapkan simpan berhasil harus menyertakannya.
   */
  async function manual(t: KonteksUji) {
    return { ...MANUAL, fotoKtpId: await simpanGambarUji(t) };
  }

  it("mencatat identitas, persetujuan, riwayat, dan putusan data diri sekaligus", async () => {
    const { t, admin, nasabah } = await siapkanDua();

    const hasil = await admin.sesi.mutation(api.kyc.catatKycManual, {
      userId: nasabah.userId,
      ...(await manual(t)),
    });
    expect(hasil).toMatchObject({ ok: true, status: "VERIFIED", userId: nasabah.userId });

    const kyc = await nasabah.sesi.query(api.kyc.kycSaya, {});
    expect(kyc.status).toBe("VERIFIED");
    expect(kyc.isian.namaLengkap).toBe("SITI AMINAH");
    expect(kyc.isian.nik).toBe(MANUAL.nik);
    expect(kyc.persetujuanAktif).toBe(true);
    expect(kyc.diputuskanOlehLabel).toBe("petugas@pindai.test");
    // Bukti OTP TIDAK dikarang oleh verifikasi manual.
    expect(kyc.nomorWhatsAppTerbukti).toBe(false);

    const detail = await admin.sesi.query(api.kyc.detailKycAdmin, {
      userId: nasabah.userId,
    });
    expect(detail?.sumberVerifikasi).toBe("manual_admin");
    expect(detail?.keputusanCatatan).toBe(MANUAL.catatanVerifikasi);
    expect(detail?.persetujuanAktif).toBe(true);

    const { row, profil, akun, riwayat, audit } = await t.run(async (ctx) => ({
      row: await ctx.db
        .query("kycProfil")
        .withIndex("by_user", (q) => q.eq("userId", nasabah.userId))
        .first(),
      profil: await ctx.db
        .query("nasabahProfil")
        .withIndex("by_user", (q) => q.eq("userId", nasabah.userId))
        .first(),
      akun: await ctx.db.get(nasabah.userId),
      riwayat: await ctx.db.query("kycRiwayat").collect(),
      audit: await ctx.db.query("auditLog").collect(),
    }));

    expect(row?.stempelTerverifikasi).toMatchObject({
      namaLengkap: "SITI AMINAH",
      nik: MANUAL.nik,
      selfieKtpId: null,
      buktiPenghasilanId: null,
    });
    // Foto KTP benar-benar tertaut — bukan sekadar "ada berkas di storage".
    expect(row?.ktpId).toBeDefined();
    // Putusan manual tidak boleh mengaku diperiksa aturan otomatis.
    expect(row?.aturanTerverifikasi).toBeUndefined();
    expect(profil?.verifikasiIdentitas?.status).toBe("terverifikasi");
    expect(akun?.name).toBe("SITI AMINAH");
    expect(
      riwayat.some(
        (r) => r.ke === "VERIFIED" && r.aktor === "admin" && r.alasan === "verifikasi_manual_petugas",
      ),
    ).toBe(true);
    expect(audit.some((a) => a.aksi === "kyc_verified")).toBe(true);
  });

  it("menolak pemanggil non-admin dan isian yang tidak lengkap", async () => {
    const { t, admin, nasabah } = await siapkanDua();

    await expect(
      nasabah.sesi.mutation(api.kyc.catatKycManual, {
        userId: nasabah.userId,
        ...MANUAL,
      }),
    ).rejects.toThrow(/Akses khusus Super Admin/);

    await expect(
      admin.sesi.mutation(api.kyc.catatKycManual, {
        userId: nasabah.userId,
        ...MANUAL,
        konfirmasiDokumenFisik: false,
      }),
    ).rejects.toThrow(/dokumen fisik sudah diperiksa/i);

    await expect(
      admin.sesi.mutation(api.kyc.catatKycManual, {
        userId: nasabah.userId,
        ...MANUAL,
        catatanVerifikasi: "singkat",
      }),
    ).rejects.toThrow(/minimal 10 karakter/i);

    await expect(
      admin.sesi.mutation(api.kyc.catatKycManual, {
        userId: nasabah.userId,
        ...MANUAL,
        nik: "327101234567890",
      }),
    ).rejects.toThrow(/NIK/i);

    expect((await nasabah.sesi.query(api.kyc.kycSaya, {})).status).toBe("NOT_STARTED");
    expect(await t.run((ctx) => ctx.db.query("kycProfil").collect())).toHaveLength(0);
  });

  it("tidak menimpa KYC yang sudah terverifikasi", async () => {
    const { t, admin, nasabah } = await siapkanDua();
    await admin.sesi.mutation(api.kyc.catatKycManual, {
      userId: nasabah.userId,
      ...(await manual(t)),
    });

    await expect(
      admin.sesi.mutation(api.kyc.catatKycManual, {
        userId: nasabah.userId,
        ...MANUAL,
        namaLengkap: "Nama Lain",
      }),
      // Baris manual menunjuk jalan keluarnya: koreksi, bukan verifikasi ulang
      // mandiri yang menuntut dokumen yang justru tidak ada.
    ).rejects.toThrow(/sudah diverifikasi manual/i);

    const row = await t.run((ctx) =>
      ctx.db
        .query("kycProfil")
        .withIndex("by_user", (q) => q.eq("userId", nasabah.userId))
        .first(),
    );
    expect(row?.namaLengkap).toBe("SITI AMINAH");
  });

  it("pencarian nasabah hanya untuk admin dan membawa status KYC", async () => {
    const { t, admin, nasabah } = await siapkanDua();
    await admin.sesi.mutation(api.kyc.catatKycManual, {
      userId: nasabah.userId,
      ...(await manual(t)),
    });

    const hasil = await admin.sesi.query(api.kyc.cariNasabahUntukKycAdmin, { cari: "siti" });
    expect(hasil.some((b) => b.userId === nasabah.userId && b.statusKyc === "VERIFIED")).toBe(
      true,
    );

    await expect(
      nasabah.sesi.query(api.kyc.cariNasabahUntukKycAdmin, { cari: "siti" }),
    ).rejects.toThrow(/Akses khusus Super Admin/);
  });

  it("mencari lewat NIK dan nomor WhatsApp tanpa memindai seluruh tabel", async () => {
    const { t, admin, nasabah } = await siapkanDua();
    await admin.sesi.mutation(api.kyc.catatKycManual, {
      userId: nasabah.userId,
      ...(await manual(t)),
    });

    const lewatNik = await admin.sesi.query(api.kyc.cariNasabahUntukKycAdmin, {
      cari: MANUAL.nik,
    });
    expect(lewatNik.some((b) => b.userId === nasabah.userId)).toBe(true);

    // Nomor ditulis dalam bentuk lokal — pencarian menormalkannya lebih dulu.
    const lewatWa = await admin.sesi.query(api.kyc.cariNasabahUntukKycAdmin, {
      cari: "0812-9988-7766",
    });
    expect(lewatWa.some((b) => b.userId === nasabah.userId)).toBe(true);
  });

  it("menolak NIK yang sudah dipakai akun lain", async () => {
    const { t, admin, nasabah } = await siapkanDua();
    const lain = await siapkanPengguna(t, "Nasabah Lain", {
      email: "lain-manual@pindai.test",
      role: "peminjam",
    });
    await admin.sesi.mutation(api.kyc.catatKycManual, {
      userId: lain.userId,
      ...(await manual(t)),
    });

    await expect(
      admin.sesi.mutation(api.kyc.catatKycManual, {
        userId: nasabah.userId,
        ...(await manual(t)),
      }),
    ).rejects.toThrow(/sudah tercatat pada akun/i);
    // Tidak ada baris KYC kedua yang tercipta.
    const baris = await t.run((ctx) =>
      ctx.db
        .query("kycProfil")
        .withIndex("by_user", (q) => q.eq("userId", nasabah.userId))
        .first(),
    );
    expect(baris).toBeNull();
  });

  it("menolak verifikasi manual tanpa satu pun foto KTP", async () => {
    const { admin, nasabah } = await siapkanDua();
    await expect(
      admin.sesi.mutation(api.kyc.catatKycManual, { userId: nasabah.userId, ...MANUAL }),
    ).rejects.toThrow(/Foto KTP wajib dilampirkan/i);
  });

  it("mengoreksi salah tulis tanpa menurunkan status", async () => {
    const { t, admin, nasabah } = await siapkanDua();
    await admin.sesi.mutation(api.kyc.catatKycManual, {
      userId: nasabah.userId,
      ...(await manual(t)),
    });

    const CATATAN =
      "Koreksi NIK: digit terakhir salah ketik. KTP asli diperiksa ulang di kantor, 25 Okt 2026.";
    await admin.sesi.mutation(api.kyc.koreksiKycManual, {
      userId: nasabah.userId,
      ...MANUAL,
      namaLengkap: "Siti Aminah Rahayu",
      nik: "3271012345678999",
      catatanVerifikasi: CATATAN,
      konfirmasiDokumenFisik: true,
    });

    const kyc = await nasabah.sesi.query(api.kyc.kycSaya, {});
    expect(kyc.status).toBe("VERIFIED");
    expect(kyc.isian.nik).toBe("3271012345678999");
    expect(kyc.isian.namaLengkap).toBe("SITI AMINAH RAHAYU");

    const { row, riwayat, audit } = await t.run(async (ctx) => ({
      row: await ctx.db
        .query("kycProfil")
        .withIndex("by_user", (q) => q.eq("userId", nasabah.userId))
        .first(),
      riwayat: await ctx.db.query("kycRiwayat").collect(),
      audit: await ctx.db.query("auditLog").collect(),
    }));
    expect(row?.stempelTerverifikasi?.nik).toBe("3271012345678999");
    expect(riwayat.some((r) => r.alasan === "koreksi_manual_petugas")).toBe(true);
    expect(audit.some((a) => a.aksi === "kyc_koreksi_manual_petugas")).toBe(true);
  });

  it("koreksi hanya untuk baris manual, dan hanya oleh admin", async () => {
    const { t, admin, nasabah } = await siapkanDua();
    // Baris VERIFIED biasa (bukan manual) tidak boleh dikoreksi lewat jalur ini.
    await t.run((ctx) =>
      ctx.db.insert("kycProfil", {
        userId: nasabah.userId,
        status: "VERIFIED",
        namaLengkap: "RANI PUSPITA",
        nik: MANUAL.nik,
        nomorWhatsApp: MANUAL.nomorWhatsApp,
        dibuatPada: Date.now(),
        diperbaruiPada: Date.now(),
      }),
    );

    await expect(
      admin.sesi.mutation(api.kyc.koreksiKycManual, {
        userId: nasabah.userId,
        ...MANUAL,
        konfirmasiDokumenFisik: true,
      }),
    ).rejects.toThrow(/diverifikasi manual/i);

    await expect(
      nasabah.sesi.mutation(api.kyc.koreksiKycManual, {
        userId: nasabah.userId,
        ...MANUAL,
        konfirmasiDokumenFisik: true,
      }),
    ).rejects.toThrow(/Akses khusus Super Admin/i);
  });

  it("rekap menyebut pekerjaan manual hari ini dan baris tanpa foto", async () => {
    const { t, admin, nasabah } = await siapkanDua();
    await admin.sesi.mutation(api.kyc.catatKycManual, {
      userId: nasabah.userId,
      ...(await manual(t)),
    });

    const rekap = await admin.sesi.query(api.kyc.rekapKycManualAdmin, {});
    expect(rekap.totalManual).toBe(1);
    expect(rekap.hariIni.total).toBe(1);
    expect(rekap.hariIni.perPetugas[0]).toMatchObject({
      label: "petugas@pindai.test",
      jumlah: 1,
    });
    expect(rekap.tanpaFotoKtp).toBe(0);

    await expect(
      nasabah.sesi.query(api.kyc.rekapKycManualAdmin, {}),
    ).rejects.toThrow(/Akses khusus Super Admin/i);
  });

  it("antrean bisa disaring ke baris yang diverifikasi manual", async () => {
    const { t, admin, nasabah } = await siapkanDua();
    await admin.sesi.mutation(api.kyc.catatKycManual, {
      userId: nasabah.userId,
      ...(await manual(t)),
    });

    const daftar = await admin.sesi.query(api.kyc.daftarKycAdmin, {
      status: "VERIFIED",
      hasil: "manual_admin",
    });
    expect(daftar.item.some((b) => b.userId === nasabah.userId)).toBe(true);
  });
});
