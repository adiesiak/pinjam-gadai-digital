/**
 * Tes promo bunga harian (convex-test + vitest).
 *
 * Yang dijaga: hanya Super Admin yang boleh mengatur, query publik hanya
 * mengembalikan promo yang benar-benar berlaku, dan pengajuan menyimpan angka
 * promo sebagai snapshot — bukan menghitung ulang saat dibaca.
 *
 * Menjalankan: bunx vitest run src/convex/promoBunga.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import { quotePinjaman } from "../lib/loan";
import {
  seedKycTerverifikasi,
  simpanBerkasUji,
  siapkanPengguna as siapkanPenggunaDasar,
  type KonteksUji,
  type SesiUji,
} from "./test.helpers";
import { modules } from "./test.setup";

const TITIK = { lat: -6.2, lng: 106.816666, akurasi: 25 };
const HARI_MS = 86_400_000;

/** Peminjam ber-KYC VERIFIED — gerbang pengajuan finansial. */
async function siapkanPeminjam(t: KonteksUji, nama: string, email: string) {
  const hasil = await siapkanPenggunaDasar(t, nama, { email, role: "peminjam" });
  await seedKycTerverifikasi(t, hasil.userId);
  await hasil.sesi.mutation(api.lokasi.catatLokasi, { ...TITIK, sumber: "web" });
  return hasil;
}

async function unggahKyc(t: KonteksUji) {
  return {
    ktp: await simpanBerkasUji(t, "ktp"),
    selfie: await simpanBerkasUji(t, "selfie"),
    slip: await simpanBerkasUji(t, "slip gaji"),
  };
}

async function ajukanHarian(
  sesi: SesiUji,
  kyc: Awaited<ReturnType<typeof unggahKyc>>,
  tenorHari: number,
) {
  return sesi.mutation(api.loans.createLoanApplication, {
    pokokPinjaman: 300_000,
    tujuan: "Modal usaha kecil",
    namaLengkap: "Rani Peminjam",
    namaBank: "BCA",
    nomorRekening: "1234567890",
    tenorHari,
    nik: "3201234567890003",
    nomorWhatsApp: "628123456791",
    penghasilanBulanan: 4_000_000,
    sumberPenghasilan: "Usaha warung",
    dokKtpId: kyc.ktp,
    dokSelfieKtpId: kyc.selfie,
    dokSlipGajiId: kyc.slip,
    lokasiAjukan: { ...TITIK, waktu: Date.now() },
    persetujuanSyarat: true,
    tandaTangan:
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/fMkAAAAASUVORK5CYII=",
  });
}

type JenisPromo = {
  nama?: string;
  jenis?: "bunga_pengganti" | "potongan_bunga" | "bebas_admin";
  persenBunga: number;
  potonganPersen?: number;
  tenor: number[];
  mulai?: number;
  selesai?: number;
  aktif?: boolean;
};

function isiPromo(promo: JenisPromo) {
  return {
    nama: promo.nama ?? "Bunga promo uji",
    ...(promo.jenis === undefined ? {} : { jenis: promo.jenis }),
    persenBunga: promo.persenBunga,
    ...(promo.potonganPersen === undefined
      ? {}
      : { potonganPersen: promo.potonganPersen }),
    tenor: promo.tenor,
    mulai: promo.mulai ?? Date.now() - HARI_MS,
    selesai: promo.selesai ?? Date.now() + 10 * HARI_MS,
    aktif: promo.aktif ?? true,
  };
}

async function buatPromo(admin: SesiUji, promo: JenisPromo) {
  return admin.mutation(api.promoBunga.simpan, isiPromo(promo));
}

describe("promo bunga harian", () => {
  it("menyimpan promo dan menolak angka yang tidak akan memotong", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPenggunaDasar(t, "admin-promo-bunga", {
      email: "admin-promo-bunga@pindai.test",
      role: "admin",
    });

    const { id } = await buatPromo(admin, { persenBunga: 15, tenor: [7] });
    const row = await t.run((ctx) => ctx.db.get(id));
    expect(row?.persenBunga).toBe(15);
    expect(row?.tenor).toEqual([7]);
    expect(row?.aktif).toBe(true);

    await expect(
      admin.mutation(api.promoBunga.simpan, {
        ...isiPromo({ persenBunga: 26, tenor: [7] }),
      }),
    ).rejects.toThrow(/1–25%/);

    // Tenor ganda dirapikan, bukan ditolak: admin mencentang sekali saja.
    const ganda = await buatPromo(admin, { persenBunga: 20, tenor: [14, 7, 14] });
    const rowGanda = await t.run((ctx) => ctx.db.get(ganda.id));
    expect(rowGanda?.tenor).toEqual([7, 14]);
  });

  it("query berjalan hanya mengembalikan promo aktif di dalam rentang", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPenggunaDasar(t, "admin-promo-berjalan", {
      email: "admin-promo-berjalan@pindai.test",
      role: "admin",
    });

    await buatPromo(admin, { nama: "Berjalan", persenBunga: 15, tenor: [7] });
    await buatPromo(admin, {
      nama: "Dijadwalkan",
      persenBunga: 18,
      tenor: [7],
      mulai: Date.now() + HARI_MS,
      selesai: Date.now() + 5 * HARI_MS,
    });
    await buatPromo(admin, {
      nama: "Berakhir",
      persenBunga: 20,
      tenor: [7],
      mulai: Date.now() - 5 * HARI_MS,
      selesai: Date.now() - HARI_MS,
    });
    await buatPromo(admin, {
      nama: "Nonaktif",
      persenBunga: 12,
      tenor: [7],
      aktif: false,
    });

    const berjalan = await t.query(api.promoBunga.berjalan, {});
    expect(berjalan.map((row) => row.nama)).toEqual(["Berjalan"]);

    const semua = await admin.query(api.promoBunga.daftar, {});
    expect(semua).toHaveLength(4);
    expect(semua.find((row) => row.nama === "Dijadwalkan")?.status).toBe("dijadwalkan");
    expect(semua.find((row) => row.nama === "Berakhir")?.status).toBe("berakhir");
    expect(semua.find((row) => row.nama === "Nonaktif")?.status).toBe("nonaktif");
  });

  it("pengajuan harian memakai bunga promo dan menyimpannya sebagai snapshot", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPenggunaDasar(t, "admin-promo-pakai", {
      email: "admin-promo-pakai@pindai.test",
      role: "admin",
    });
    const { sesi: peminjam } = await siapkanPeminjam(
      t,
      "rani-promo",
      "rani-promo@pindai.test",
    );
    const kyc = await unggahKyc(t);

    const { id: promoId } = await buatPromo(admin, {
      nama: "Bunga 15 tenor 7",
      persenBunga: 15,
      tenor: [7],
    });

    const hasil = await ajukanHarian(peminjam, kyc, 7);
    const loan = await t.run(async (ctx) => {
      const rows = await ctx.db.query("loans").collect();
      return rows.find((row) => row.nomorReferensi === hasil.nomorReferensi);
    });

    // Bunga tier 1 tenor 7 normal 32%; promo menggantikannya menjadi 15%.
    expect(loan?.persenBunga).toBe(15);
    expect(loan?.promoBungaId).toBe(promoId);
    expect(loan?.promoBungaNama).toBe("Bunga 15 tenor 7");
    expect(loan?.promoBungaPersenNormal).toBe(32);
    // Tarif promo dibekukan terpisah, supaya laporan subsidi tidak tertukar
    // dengan potongan voucher bunga yang mungkin dipakai bersamaan.
    expect(loan?.promoBungaPersen).toBe(15);

    // Tenor 14 tidak termasuk promo, jadi tarif matriks berlaku (37%).
    const kedua = await ajukanHarian(peminjam, kyc, 14);
    const loanKedua = await t.run(async (ctx) => {
      const rows = await ctx.db.query("loans").collect();
      return rows.find((row) => row.nomorReferensi === kedua.nomorReferensi);
    });
    expect(loanKedua?.persenBunga).toBe(37);
    expect(loanKedua?.promoBungaId).toBeUndefined();
  });

  it("promo tenor 10 hari dipakai otomatis saat tenor itu dipilih", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPenggunaDasar(t, "admin-promo-sepuluh", {
      email: "admin-promo-sepuluh@pindai.test",
      role: "admin",
    });
    const { sesi: peminjam } = await siapkanPeminjam(
      t,
      "rani-sepuluh",
      "rani-sepuluh@pindai.test",
    );
    const kyc = await unggahKyc(t);

    const { id: promoId } = await buatPromo(admin, {
      nama: "Bunga 20 tenor 10",
      persenBunga: 20,
      tenor: [10],
    });

    const hasil = await ajukanHarian(peminjam, kyc, 10);
    const loan = await t.run(async (ctx) => {
      const rows = await ctx.db.query("loans").collect();
      return rows.find((row) => row.nomorReferensi === hasil.nomorReferensi);
    });

    // Tier 1 tenor 10 berada di antara 32% (7 hari) dan 37% (14 hari),
    // yakni 34,14%; promo 20% menggantikannya dan dibekukan pada pinjaman.
    expect(loan?.tenorHari).toBe(10);
    expect(loan?.promoBungaId).toBe(promoId);
    expect(loan?.promoBungaPersenNormal).toBe(34.14);
    expect(loan?.persenBunga).toBe(20);
  });

  it("promo potongan bunga memotong tarif normal tenor itu", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPenggunaDasar(t, "admin-promo-potong", {
      email: "admin-promo-potong@pindai.test",
      role: "admin",
    });
    const { sesi: peminjam } = await siapkanPeminjam(
      t,
      "rani-potong",
      "rani-potong@pindai.test",
    );
    const kyc = await unggahKyc(t);

    const { id: promoId } = await buatPromo(admin, {
      nama: "Potongan 5 poin tenor 7",
      jenis: "potongan_bunga",
      persenBunga: 0,
      potonganPersen: 5,
      tenor: [7],
    });

    const hasil = await ajukanHarian(peminjam, kyc, 7);
    const loan = await t.run(async (ctx) => {
      const rows = await ctx.db.query("loans").collect();
      return rows.find((row) => row.nomorReferensi === hasil.nomorReferensi);
    });

    expect(loan?.promoBungaId).toBe(promoId);
    expect(loan?.promoBungaJenis).toBe("potongan_bunga");
    expect(loan?.promoBungaPersenNormal).toBe(32);
    expect(loan?.persenBunga).toBe(27);
    expect(loan?.promoBungaPersen).toBe(27);
    expect(loan?.promoBungaPotonganPersen).toBe(5);
  });

  it("promo bebas admin membebaskan biaya admin tanpa mengubah bunga", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPenggunaDasar(t, "admin-promo-admin", {
      email: "admin-promo-admin@pindai.test",
      role: "admin",
    });
    const { sesi: peminjam } = await siapkanPeminjam(
      t,
      "rani-admin",
      "rani-admin@pindai.test",
    );
    const kyc = await unggahKyc(t);

    const { id: promoId } = await buatPromo(admin, {
      nama: "Bebas admin tenor 7",
      jenis: "bebas_admin",
      persenBunga: 0,
      tenor: [7],
    });

    const hasil = await ajukanHarian(peminjam, kyc, 7);
    const loan = await t.run(async (ctx) => {
      const rows = await ctx.db.query("loans").collect();
      return rows.find((row) => row.nomorReferensi === hasil.nomorReferensi);
    });

    // Pokok Rp300.000: bunga tetap 32%, biaya admin 2% = Rp6.000 dibebaskan.
    expect(loan?.promoBungaId).toBe(promoId);
    expect(loan?.promoBungaJenis).toBe("bebas_admin");
    expect(loan?.persenBunga).toBe(32);
    expect(loan?.promoBungaPersenNormal).toBe(32);
    expect(loan?.promoBungaPersen).toBe(32);
    expect(loan?.promoDiskonAdmin).toBe(6_000);
    // Requote dokumen/kontrak harus membaca pembebasan yang dibekukan, bukan
    // hanya diskon voucher.
    expect(quotePinjaman(loan!).diskonAdmin).toBe(6_000);

    const laporan = await admin.query(api.promoBunga.efektivitas, {});
    expect(laporan.baris[0]?.subsidi).toBe(6_000);
    expect(laporan.tren[0]?.subsidi).toBe(6_000);
  });

  it("saat promo tumpang tindih, bunga terendah yang dipakai", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPenggunaDasar(t, "admin-promo-tumpang", {
      email: "admin-promo-tumpang@pindai.test",
      role: "admin",
    });
    const { sesi: peminjam } = await siapkanPeminjam(
      t,
      "rani-tumpang",
      "rani-tumpang@pindai.test",
    );
    const kyc = await unggahKyc(t);

    await buatPromo(admin, { nama: "Dua puluh", persenBunga: 20, tenor: [7] });
    const { id: terendah } = await buatPromo(admin, {
      nama: "Lima belas",
      persenBunga: 15,
      tenor: [7],
    });

    const hasil = await ajukanHarian(peminjam, kyc, 7);
    const loan = await t.run(async (ctx) => {
      const rows = await ctx.db.query("loans").collect();
      return rows.find((row) => row.nomorReferensi === hasil.nomorReferensi);
    });
    expect(loan?.persenBunga).toBe(15);
    expect(loan?.promoBungaId).toBe(terendah);
  });

  it("mematikan promo menghentikan pemakaian baru tanpa mengubah pinjaman lama", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPenggunaDasar(t, "admin-promo-mati", {
      email: "admin-promo-mati@pindai.test",
      role: "admin",
    });
    const { sesi: peminjam } = await siapkanPeminjam(
      t,
      "rani-mati",
      "rani-mati@pindai.test",
    );
    const kyc = await unggahKyc(t);

    const { id } = await buatPromo(admin, {
      nama: "Promo dimatikan",
      persenBunga: 15,
      tenor: [7],
    });
    const pertama = await ajukanHarian(peminjam, kyc, 7);

    await admin.mutation(api.promoBunga.setAktif, { id, aktif: false });
    expect(await t.query(api.promoBunga.berjalan, {})).toHaveLength(0);

    const kedua = await ajukanHarian(peminjam, kyc, 7);
    const loans = await t.run((ctx) => ctx.db.query("loans").collect());
    const loanPertama = loans.find((row) => row.nomorReferensi === pertama.nomorReferensi);
    const loanKedua = loans.find((row) => row.nomorReferensi === kedua.nomorReferensi);
    expect(loanPertama?.persenBunga).toBe(15);
    expect(loanKedua?.persenBunga).toBe(32);
    expect(loanKedua?.promoBungaId).toBeUndefined();
  });

  it("laporan efektivitas menghitung pemakaian dan subsidi promo", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPenggunaDasar(t, "admin-promo-efektif", {
      email: "admin-promo-efektif@pindai.test",
      role: "admin",
    });
    const { sesi: peminjam } = await siapkanPeminjam(
      t,
      "rani-efektif",
      "rani-efektif@pindai.test",
    );
    const kyc = await unggahKyc(t);

    const { id: promoId } = await buatPromo(admin, {
      nama: "Bunga 15 tenor 7",
      persenBunga: 15,
      tenor: [7],
    });
    await ajukanHarian(peminjam, kyc, 7);
    // Pengajuan tanpa promo tidak boleh ikut terhitung pada kampanye mana pun.
    await ajukanHarian(peminjam, kyc, 14);

    const laporan = await admin.query(api.promoBunga.efektivitas, {});
    expect(laporan.baris).toHaveLength(1);
    const baris = laporan.baris[0];
    expect(baris.id).toBe(promoId);
    expect(baris.pinjaman).toBe(1);
    // Pokok Rp300.000: normal 32% = Rp96.000, promo 15% = Rp45.000.
    expect(baris.subsidi).toBe(51_000);
    expect(baris.perkiraan).toBe(false);
    expect(laporan.total.subsidi).toBe(51_000);
    expect(laporan.total.pinjaman).toBe(1);
    expect(laporan.dibatasi).toBe(false);
    expect(laporan.tren).toHaveLength(1);
    expect(laporan.tren[0].pinjaman).toBe(1);
    expect(laporan.tren[0].subsidi).toBe(51_000);

    // Saringan tanggal memakai waktu pengajuan pinjaman, bukan tanggal promo:
    // rentang yang belum berjalan tidak boleh meminjam angka kampanye lama.
    const kosong = await admin.query(api.promoBunga.efektivitas, {
      dari: Date.now() + HARI_MS,
    });
    expect(kosong.total.pinjaman).toBe(0);
    expect(kosong.total.subsidi).toBe(0);
    expect(kosong.baris[0]?.pinjaman).toBe(0);
    expect(kosong.tren).toHaveLength(0);

    const sudahLewat = await admin.query(api.promoBunga.efektivitas, {
      sampai: Date.now() - HARI_MS,
    });
    expect(sudahLewat.total.pinjaman).toBe(0);

    const hariIni = await admin.query(api.promoBunga.efektivitas, {
      dari: Date.now() - HARI_MS,
      sampai: Date.now() + HARI_MS,
    });
    expect(hariIni.total.pinjaman).toBe(1);
    expect(hariIni.total.subsidi).toBe(51_000);

    await expect(peminjam.query(api.promoBunga.efektivitas, {})).rejects.toThrow(
      /Akses khusus Super Admin/,
    );
  });

  it("menolak nasabah mengatur promo bunga", async () => {
    const t = convexTest(schema, modules);
    const { sesi: peminjam } = await siapkanPeminjam(
      t,
      "rani-bukan-admin-promo",
      "rani-bukan-admin-promo@pindai.test",
    );

    await expect(peminjam.query(api.promoBunga.daftar, {})).rejects.toThrow(
      /Akses khusus Super Admin/,
    );
    await expect(
      peminjam.mutation(api.promoBunga.simpan, {
        ...isiPromo({ persenBunga: 10, tenor: [7] }),
      }),
    ).rejects.toThrow(/Akses khusus Super Admin/);
  });
});
