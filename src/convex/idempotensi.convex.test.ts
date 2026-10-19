/**
 * Uji kunci idempotensi & penjagaan konkurensi (convex-test + vitest).
 *
 * Yang dijaga berkas ini:
 *  - pengiriman ulang dengan KUNCI SAMA tidak melahirkan pengajuan kedua —
 *    hasil yang pertama dikembalikan apa adanya;
 *  - kunci yang sama dipakai untuk operasi LAIN ditolak, bukan mengembalikan
 *    hasil yang salah;
 *  - tanpa kunci, perilaku lama tidak berubah (dua pengajuan sah dibuat);
 *  - keputusan admin yang diulang tidak berlaku dua kali (guard transisi status);
 *  - pengajuan yang sudah dibatalkan tidak bisa dipindahkan lagi.
 *
 * Menjalankan: bunx vitest run src/convex/idempotensi.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import { buatSesi, seedKycTerverifikasiEmail, simpanBerkasUji, type SesiUji } from "./test.helpers";
import { modules } from "./test.setup";

const TITIK = { lat: -6.2, lng: 106.816666, akurasi: 25 };
const TTD =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/fMkAAAAASUVORK5CYII=";

type Tx = ReturnType<typeof convexTest>;

/** Peminjam siap-KYC + lokasi aktif — prasyarat gerbang pengajuan. */
async function peminjamSiap(t: Tx, email: string): Promise<SesiUji> {
  const sesi = await buatSesi(t, "peminjam-idem", { email, role: "peminjam" });
  await seedKycTerverifikasiEmail(t, email);
  await sesi.mutation(api.lokasi.catatLokasi, { ...TITIK, sumber: "web" });
  return sesi;
}

/** Kirim pengajuan tunai; berkas dibuat baru tiap panggilan. */
async function ajukan(t: Tx, sesi: SesiUji, kunci: string | undefined) {
  const ktp = await simpanBerkasUji(t, "ktp-idem");
  const selfie = await simpanBerkasUji(t, "selfie-idem");
  const slip = await simpanBerkasUji(t, "slip-idem");
  return sesi.mutation(api.loans.createLoanApplication, {
    pokokPinjaman: 500_000,
    tujuan: "Modal usaha kecil",
    namaLengkap: "Rani Peminjam",
    namaBank: "BCA",
    nomorRekening: "1234567890",
    tenorHari: 28,
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
    ...(kunci !== undefined ? { kunciIdempotensi: kunci } : {}),
  });
}

async function jumlahPinjaman(t: Tx): Promise<number> {
  return t.run(async (ctx) => (await ctx.db.query("loans").collect()).length);
}

describe("kunci idempotensi", () => {
  it("pengiriman ulang dengan kunci sama hanya membuat SATU pengajuan", async () => {
    const t = convexTest(schema, modules);
    const sesi = await peminjamSiap(t, "idem-satu@pindai.test");

    const pertama = await ajukan(t, sesi, "kunci-abc-123");
    const ulang = await ajukan(t, sesi, "kunci-abc-123");

    expect(ulang.appId).toBe(pertama.appId);
    expect(ulang.nomorReferensi).toBe(pertama.nomorReferensi);
    expect(await jumlahPinjaman(t)).toBe(1);
  });

  it("kunci BERBEDA tetap membuat pengajuan terpisah (perilaku lama)", async () => {
    const t = convexTest(schema, modules);
    const sesi = await peminjamSiap(t, "idem-dua@pindai.test");

    const a = await ajukan(t, sesi, "kunci-1");
    const b = await ajukan(t, sesi, "kunci-2");

    expect(b.appId).not.toBe(a.appId);
    expect(await jumlahPinjaman(t)).toBe(2);
  });

  it("tanpa kunci, perilaku lama tidak berubah", async () => {
    const t = convexTest(schema, modules);
    const sesi = await peminjamSiap(t, "idem-tanpa@pindai.test");

    await ajukan(t, sesi, undefined);
    await ajukan(t, sesi, undefined);

    expect(await jumlahPinjaman(t)).toBe(2);
  });

  it("kunci yang sama untuk operasi berbeda ditolak, bukan salah jawab", async () => {
    const t = convexTest(schema, modules);
    const sesi = await peminjamSiap(t, "idem-beda-op@pindai.test");

    await ajukan(t, sesi, "kunci-bentrok");

    await expect(
      sesi.mutation(api.loans.createPawnApplication, {
        deskripsiBarang: "iPhone 14 Pro 256 GB lengkap kotak",
        kategori: "Elektronik",
        alamatPenilaian: "Jl. Merdeka No. 10, Jakarta Pusat",
        namaLengkap: "Rani Peminjam",
        namaBank: "BCA",
        nomorRekening: "1234567890",
        kunciIdempotensi: "kunci-bentrok",
      }),
    ).rejects.toThrow(/operasi lain/i);
  });
});

describe("konkurensi keputusan & pembatalan", () => {
  it("menyetujui pinjaman dua kali tidak mengubahnya dua kali", async () => {
    const t = convexTest(schema, modules);
    const peminjam = await peminjamSiap(t, "konkuren-peminjam@pindai.test");
    const { appId } = await ajukan(t, peminjam, undefined);
    const admin = await buatSesi(t, "admin-konkuren", {
      email: "admin-konkuren@pindai.test",
      role: "admin",
    });

    const pertama = await admin.mutation(api.loans.approveLoan, { loanId: appId });
    expect(pertama.ok).toBe(true);

    // Percobaan kedua: status tujuan sama dengan status saat ini → ditolak.
    await expect(admin.mutation(api.loans.approveLoan, { loanId: appId })).rejects.toThrow(
      /sudah berstatus/i,
    );
  });

  it("pinjaman yang sudah dibatalkan tidak dapat dipindahkan lagi", async () => {
    const t = convexTest(schema, modules);
    const peminjam = await peminjamSiap(t, "konkuren-batal@pindai.test");
    const { appId } = await ajukan(t, peminjam, undefined);

    const hasil = await peminjam.mutation(api.loans.batalkanPengajuan, { loanId: appId });
    expect(hasil.status).toBe("dibatalkan");

    const admin = await buatSesi(t, "admin-batal", {
      email: "admin-batal@pindai.test",
      role: "admin",
    });
    await expect(
      admin.mutation(api.loans.ubahStatusPinjaman, { loanId: appId, status: "didanai" }),
    ).rejects.toThrow(/lunas tidak dapat diubah|dibatalkan/i);
  });
});
