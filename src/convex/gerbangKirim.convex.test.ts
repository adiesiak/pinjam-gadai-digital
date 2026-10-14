/**
 * Uji gerbang anti-pengiriman palsu lewat jalur pengajuan SUNGGUHAN
 * (convex-test + vitest).
 *
 * Dua lapis yang diuji di sini, dan kenapa keduanya ada:
 *
 *  1. `gerbangKirim.mintaIzinKirim` - dipanggil formulir SEBELUM mengirim.
 *     Penolakannya dijawab sebagai NILAI, bukan galat, sehingga baris
 *     pelanggaran, jejak `auditLog`, dan hitungan kunci sementara benar-benar
 *     tersimpan. Kalau penolakan dilempar dari dalam mutasi pengajuan, Convex
 *     membatalkan seluruh tulisan mutasi itu dan catatannya ikut hilang, jadi
 *     kuncinya tidak pernah bisa aktif.
 *  2. `loans.createLoanApplication` - penjaga terakhir untuk pemanggil yang
 *     melewati gerbang. Ia menolak dengan GALAT (jejaknya memang tidak
 *     tersimpan, itu batas Convex), lalu membaca kunci sementara yang sudah
 *     dicatat gerbang.
 *
 * Menjalankan: bunx vitest run src/convex/gerbangKirim.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import { MAKS_KIRIM, MAKS_PELANGGARAN } from "./gerbangKirim";
import schema from "./schema";
import {
  buatSesi,
  seedKycTerverifikasiEmail,
  simpanBerkasUji,
  type SesiUji,
} from "./test.helpers";
import { modules } from "./test.setup";

const TITIK = { lat: -6.2, lng: 106.816666, akurasi: 25 };
const TTD =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/fMkAAAAASUVORK5CYII=";

type Tx = ReturnType<typeof convexTest>;

/** Peminjam siap-KYC + lokasi aktif: prasyarat gerbang pengajuan. */
async function peminjamSiap(t: Tx, email: string): Promise<SesiUji> {
  const sesi = await buatSesi(t, "peminjam-gerbang", { email, role: "peminjam" });
  await seedKycTerverifikasiEmail(t, email);
  await sesi.mutation(api.lokasi.catatLokasi, { ...TITIK, sumber: "web" });
  return sesi;
}

/** Panggil gerbang izin seperti formulir aplikasi: jebakan + cap waktu buka. */
async function mintaIzin(
  sesi: SesiUji,
  jejak: { jebakan?: string; formDibukaPada?: number } = {},
) {
  return sesi.mutation(api.gerbangKirim.mintaIzinKirim, {
    ...(jejak.jebakan !== undefined ? { jebakan: jejak.jebakan } : {}),
    ...(jejak.formDibukaPada !== undefined ? { formDibukaPada: jejak.formDibukaPada } : {}),
  });
}

/**
 * Kirim pengajuan tunai dengan jejak gerbang yang bisa diatur.
 *
 * `jebakan` dan `formDibukaPada` dibiarkan KOSONG bila tidak disebut, persis
 * seperti pemanggil lama, supaya tes ini sekaligus membuktikan bahwa pemanggil
 * tanpa jejak gerbang tidak langsung tertuduh robot.
 */
async function ajukan(
  t: Tx,
  sesi: SesiUji,
  jejak: { jebakan?: string; formDibukaPada?: number; kunci?: string } = {},
): Promise<{ appId: string; nomorReferensi: string }> {
  const ktp = await simpanBerkasUji(t, "ktp-gerbang");
  const selfie = await simpanBerkasUji(t, "selfie-gerbang");
  const slip = await simpanBerkasUji(t, "slip-gerbang");
  return sesi.mutation(api.loans.createLoanApplication, {
    pokokPinjaman: 500_000,
    tujuan: "Modal usaha kecil",
    namaLengkap: "Rani Peminjam",
    namaBank: "BCA",
    nomorRekening: "1234567890",
    tenorHari: 30,
    nik: "3201234567890003",
    nomorWhatsApp: "628123456791",
    penghasilanBulanan: 4_000_000,
    sumberPenghasilan: "Usaha warung",
    dokKtpId: ktp,
    dokSelfieKtpId: selfie,
    dokSlipGajiId: slip,
    lokasiAjukan: { ...TITIK, waktu: Date.now() },
    persetujuanSyarat: true,
    tandaTangan: TTD,
    ...(jejak.jebakan !== undefined ? { jebakan: jejak.jebakan } : {}),
    ...(jejak.formDibukaPada !== undefined ? { formDibukaPada: jejak.formDibukaPada } : {}),
    ...(jejak.kunci !== undefined ? { kunciIdempotensi: jejak.kunci } : {}),
  });
}

async function jumlahPinjaman(t: Tx): Promise<number> {
  return t.run(async (ctx) => (await ctx.db.query("loans").collect()).length);
}

async function auditGerbang(t: Tx) {
  return t.run(async (ctx) =>
    (await ctx.db.query("auditLog").collect()).filter(
      (baris) => baris.aksi === "pengajuan_ditolak_gerbang",
    ),
  );
}

describe("gerbang izin kirim", () => {
  it("pengguna sungguhan dengan jeda wajar diizinkan", async () => {
    const t = convexTest(schema, modules);
    const sesi = await peminjamSiap(t, "izin-wajar@pindai.test");

    const izin = await mintaIzin(sesi, { jebakan: "", formDibukaPada: Date.now() - 9_000 });

    expect(izin.ok).toBe(true);
    expect(izin.alasan).toBeNull();
    expect(await auditGerbang(t)).toHaveLength(0);
  });

  it("pemanggil tanpa jejak gerbang tetap diizinkan", async () => {
    const t = convexTest(schema, modules);
    const sesi = await peminjamSiap(t, "izin-tanpa-jejak@pindai.test");

    expect((await mintaIzin(sesi)).ok).toBe(true);
  });

  it("jebakan yang terisi ditolak dan jejaknya tersimpan", async () => {
    const t = convexTest(schema, modules);
    const sesi = await peminjamSiap(t, "izin-jebakan@pindai.test");

    const izin = await mintaIzin(sesi, {
      jebakan: "robot@contoh.test",
      formDibukaPada: Date.now() - 9_000,
    });

    expect(izin.ok).toBe(false);
    expect(izin.alasan).toMatch(/tidak dapat diproses otomatis/i);
    const jejak = await auditGerbang(t);
    expect(jejak).toHaveLength(1);
    expect(jejak[0]?.detail).toMatch(/tidak dapat diproses otomatis/i);
  });

  it("kiriman di bawah dua detik ditolak", async () => {
    const t = convexTest(schema, modules);
    const sesi = await peminjamSiap(t, "izin-cepat@pindai.test");

    const izin = await mintaIzin(sesi, { jebakan: "", formDibukaPada: Date.now() });

    expect(izin.ok).toBe(false);
    expect(izin.alasan).toMatch(/terlalu cepat/i);
    expect(await auditGerbang(t)).toHaveLength(1);
  });

  it("jejak waktu di masa depan ditolak", async () => {
    const t = convexTest(schema, modules);
    const sesi = await peminjamSiap(t, "izin-masa-depan@pindai.test");

    const izin = await mintaIzin(sesi, { jebakan: "", formDibukaPada: Date.now() + 60_000 });

    expect(izin.ok).toBe(false);
    expect(izin.alasan).toMatch(/jejak waktu/i);
  });

  it(`setelah ${MAKS_PELANGGARAN} percobaan mencurigakan, pengajuan akun dikunci sementara`, async () => {
    const t = convexTest(schema, modules);
    const sesi = await peminjamSiap(t, "izin-kunci@pindai.test");

    for (let i = 0; i < MAKS_PELANGGARAN; i += 1) {
      const izin = await mintaIzin(sesi, { jebakan: `robot-${i}@contoh.test` });
      expect(izin.ok).toBe(false);
    }
    expect(await auditGerbang(t)).toHaveLength(MAKS_PELANGGARAN);

    // Tolakan berikutnya memakai kalimat kunci sementara, dan TIDAK menambah
    // pelanggaran baru: hukumannya berbatas, bukan diperpanjang tanpa henti.
    const terkunci = await mintaIzin(sesi, { jebakan: "", formDibukaPada: Date.now() - 9_000 });
    expect(terkunci.ok).toBe(false);
    expect(terkunci.alasan).toMatch(/dikunci sementara/i);
    expect(await auditGerbang(t)).toHaveLength(MAKS_PELANGGARAN);
  });
});

describe("penjaga terakhir di mutasi pengajuan", () => {
  it("pengguna sungguhan lolos dan pengajuannya tercatat", async () => {
    const t = convexTest(schema, modules);
    const sesi = await peminjamSiap(t, "mutasi-wajar@pindai.test");

    const hasil = await ajukan(t, sesi, {
      jebakan: "",
      formDibukaPada: Date.now() - 9_000,
    });

    expect(hasil.nomorReferensi).toMatch(/^PGD-\d{8}-/);
    expect(await jumlahPinjaman(t)).toBe(1);
  });

  it("jebakan yang terisi ditolak walau gerbang izin dilewati", async () => {
    const t = convexTest(schema, modules);
    const sesi = await peminjamSiap(t, "mutasi-jebakan@pindai.test");

    await expect(
      ajukan(t, sesi, { jebakan: "robot@contoh.test", formDibukaPada: Date.now() - 9_000 }),
    ).rejects.toThrow(/tidak dapat diproses otomatis/i);

    expect(await jumlahPinjaman(t)).toBe(0);
  });

  it("kiriman di bawah dua detik ditolak walau gerbang izin dilewati", async () => {
    const t = convexTest(schema, modules);
    const sesi = await peminjamSiap(t, "mutasi-cepat@pindai.test");

    await expect(ajukan(t, sesi, { jebakan: "", formDibukaPada: Date.now() })).rejects.toThrow(
      /terlalu cepat/i,
    );

    expect(await jumlahPinjaman(t)).toBe(0);
  });

  it(`pengajuan ke-${MAKS_KIRIM + 1} dalam satu menit ditolak`, async () => {
    const t = convexTest(schema, modules);
    const sesi = await peminjamSiap(t, "mutasi-laju@pindai.test");

    for (let i = 0; i < MAKS_KIRIM; i += 1) {
      await ajukan(t, sesi, {
        jebakan: "",
        formDibukaPada: Date.now() - 9_000,
        kunci: `laju-${i}`,
      });
    }
    expect(await jumlahPinjaman(t)).toBe(MAKS_KIRIM);

    await expect(
      ajukan(t, sesi, { jebakan: "", formDibukaPada: Date.now() - 9_000, kunci: "laju-akhir" }),
    ).rejects.toThrow(new RegExp(`Batas ${MAKS_KIRIM} pengajuan per menit`, "i"));

    // Kiriman yang ditolak pembatas laju tidak menambah pengajuan apa pun.
    expect(await jumlahPinjaman(t)).toBe(MAKS_KIRIM);
  });

  it("pengiriman ulang dengan kunci idempotensi sama tidak memakan jatah laju", async () => {
    const t = convexTest(schema, modules);
    const sesi = await peminjamSiap(t, "mutasi-idempoten@pindai.test");
    const jejak = { jebakan: "", formDibukaPada: Date.now() - 9_000, kunci: "kunci-sama" };

    const pertama = await ajukan(t, sesi, jejak);
    const ulang = await ajukan(t, sesi, jejak);

    expect(ulang.appId).toBe(pertama.appId);
    expect(await jumlahPinjaman(t)).toBe(1);
  });

  it("kunci sementara dari gerbang juga menahan mutasi pengajuan", async () => {
    const t = convexTest(schema, modules);
    const sesi = await peminjamSiap(t, "mutasi-kunci@pindai.test");

    for (let i = 0; i < MAKS_PELANGGARAN; i += 1) {
      await mintaIzin(sesi, { jebakan: `robot-${i}@contoh.test` });
    }

    await expect(
      ajukan(t, sesi, { jebakan: "", formDibukaPada: Date.now() - 9_000 }),
    ).rejects.toThrow(/dikunci sementara/i);
    expect(await jumlahPinjaman(t)).toBe(0);
  });
});
