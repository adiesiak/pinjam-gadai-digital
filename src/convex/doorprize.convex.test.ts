/**
 * Uji Doorprize triwulanan: tiket otomatis, hadiah per kuartal, dan pengundian.
 *
 * Yang dibuktikan:
 *  - tiket idempoten per referensi (pelunasan dicatat ulang tidak menggandakan);
 *  - kelipatan penempatan dana menghasilkan tiket sesuai aturan Rp1 juta;
 *  - ringkasan hanya menghitung tiket kuartal berjalan, termasuk tiket lama
 *    berperiode bulanan pada kuartal yang sama;
 *  - tiket kuartal sebelumnya tidak ikut kuartal baru (saldo kembali 0);
 *  - hadiah admin dipakai saat mengundi dan ditolak bila ≥ Rp1 juta;
 *  - pengundian baru dibuka pada hari pengundian resmi;
 *  - akun non-admin tidak bisa membaca rekap, menyimpan hadiah, atau mengundi.
 */
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import { beriTiket, beriTiketPendanaan } from "./doorprize";
import schema from "./schema";
import { buatSesiLain, siapkanPengguna } from "./test.helpers";
import { modules } from "./test.setup";
import {
  HADIAH_DOORPRIZE_BAWAAN,
  awalKuartal,
  kodeKuartal,
  pembukaanUndianKuartal,
  type Kuartal,
} from "../lib/doorprize";

const buatKontek = () => convexTest(schema, modules);

/** Q4 2026 — kuartal tetap agar uji tidak bergantung tanggal berjalan. */
const Q4: Kuartal = { year: 2026, quarter: 4 };

/** 2 Oktober 2026 09.00 WIB — kuartal berjalan, pengundian belum dibuka. */
const WAKTU_AWAL = Date.UTC(2026, 9, 2, 2, 0);
/** 31 Desember 2026 08.00 WIB — hari pengundian resmi. */
const WAKTU_UNDIAN = pembukaanUndianKuartal(Q4) + 8 * 3_600_000;
/** 15 Juli 2026 — kuartal sebelumnya, untuk menguji reset tiket. */
const WAKTU_Q3 = Date.UTC(2026, 6, 15, 3, 0);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("doorprize triwulanan", () => {
  it("menerbitkan tiket idempoten, membaca tiket lama, dan mereset per kuartal", async () => {
    vi.spyOn(Date, "now").mockReturnValue(WAKTU_AWAL);
    const t = buatKontek();
    const peminjam = await siapkanPengguna(t, "Peminjam Tiket", {
      email: "peminjam-tiket@pindai.test",
      role: "peminjam",
    });
    const pendana = await siapkanPengguna(t, "Pendana Tiket", {
      email: "pendana-tiket@pindai.test",
      role: "dana",
    });
    const lama = await siapkanPengguna(t, "Peserta Tiket Lama", {
      email: "tiket-lama@pindai.test",
      role: "peminjam",
    });
    const kuartalLalu = await siapkanPengguna(t, "Peserta Kuartal Lalu", {
      email: "kuartal-lalu@pindai.test",
      role: "peminjam",
    });

    const pertama = await t.run((ctx) =>
      beriTiket(ctx, {
        pemilikId: peminjam.userId,
        peran: "peminjam",
        referensi: "PINJAMAN:PGD-UJI",
        sumber: "pelunasan_tepat_waktu",
        waktu: WAKTU_AWAL,
      }),
    );
    const kedua = await t.run((ctx) =>
      beriTiket(ctx, {
        pemilikId: peminjam.userId,
        peran: "peminjam",
        referensi: "PINJAMAN:PGD-UJI",
        sumber: "pelunasan_tepat_waktu",
        waktu: WAKTU_AWAL,
      }),
    );
    expect(pertama).toBe(1);
    expect(kedua).toBe(0);

    await t.run((ctx) =>
      beriTiketPendanaan(ctx, {
        pemilikId: pendana.userId,
        nomorReferensi: "FND-UJI",
        jumlahAlokasi: 2_500_000,
        waktu: WAKTU_AWAL,
      }),
    );

    // Tiket lama bulanan pada kuartal yang sama tetap dihitung.
    await t.run((ctx) =>
      ctx.db.insert("doorprizeTiket", {
        pemilikId: lama.userId,
        peran: "peminjam",
        periode: "2026-11",
        sumber: "pelunasan_tepat_waktu",
        referensi: "PINJAMAN:LEGACY",
        status: "aktif",
        dibuatPada: WAKTU_AWAL,
      }),
    );

    // Tiket kuartal sebelumnya tidak ikut kuartal berjalan.
    await t.run((ctx) =>
      beriTiket(ctx, {
        pemilikId: kuartalLalu.userId,
        peran: "peminjam",
        referensi: "PINJAMAN:Q3",
        sumber: "pelunasan_tepat_waktu",
        waktu: WAKTU_Q3,
      }),
    );

    const ringkasanPeminjam = await peminjam.sesi.query(api.doorprize.ringkasanSaya, {});
    expect(ringkasanPeminjam?.kode).toBe("2026-Q4");
    expect(ringkasanPeminjam?.tiketPeminjam).toBe(1);
    expect(ringkasanPeminjam?.tiketPendana).toBe(0);
    expect(ringkasanPeminjam?.tiketAktif).toBe(1);
    expect(ringkasanPeminjam?.labelTanggalUndian).toBe("31 Desember 2026");

    const ringkasanPendana = await pendana.sesi.query(api.doorprize.ringkasanSaya, {});
    expect(ringkasanPendana?.tiketPendana).toBe(2);
    expect(ringkasanPendana?.tiketAktif).toBe(2);

    const ringkasanLama = await lama.sesi.query(api.doorprize.ringkasanSaya, {});
    expect(ringkasanLama?.tiketAktif).toBe(1);

    const ringkasanKuartalLalu = await kuartalLalu.sesi.query(
      api.doorprize.ringkasanSaya,
      {},
    );
    expect(ringkasanKuartalLalu?.tiketAktif).toBe(0);

    const tiket = await t.run((ctx) => ctx.db.query("doorprizeTiket").collect());
    expect(tiket).toHaveLength(5);
    const baru = tiket.filter((row) => row.referensi !== "PINJAMAN:LEGACY");
    expect(baru.every((row) => row.periode === "2026-Q4" || row.periode === "2026-Q3")).toBe(
      true,
    );
    expect(baru.filter((row) => row.periode === "2026-Q4")).toHaveLength(3);
  });

  it("menyimpan hadiah kuartal dan menolak nilai Rp1 juta atau lebih", async () => {
    vi.spyOn(Date, "now").mockReturnValue(WAKTU_AWAL);
    const t = buatKontek();
    const admin = await siapkanPengguna(t, "Admin Hadiah", {
      email: "admin-hadiah@pindai.test",
      role: "admin",
    });
    const peminjam = await siapkanPengguna(t, "Bukan Admin Hadiah", {
      email: "bukan-admin-hadiah@pindai.test",
      role: "peminjam",
    });

    const awal = await admin.sesi.query(api.doorprize.ringkasanAdmin, {});
    expect(awal.hadiah.nama).toBe(HADIAH_DOORPRIZE_BAWAAN.nama);
    expect(awal.hadiah.diatur).toBe(false);

    await admin.sesi.mutation(api.doorprize.simpanHadiahKuartal, {
      kategori: "ELECTRONICS",
      nama: "TWS Earbuds Premium",
      nilai: 450_000,
    });

    const sesudah = await admin.sesi.query(api.doorprize.ringkasanAdmin, {});
    expect(sesudah.hadiah.nama).toBe("TWS Earbuds Premium");
    expect(sesudah.hadiah.kategori).toBe("ELECTRONICS");
    expect(sesudah.hadiah.nilaiPerkiraan).toBe(450_000);
    expect(sesudah.hadiah.diatur).toBe(true);
    expect(sesudah.teksKetentuan).toContain("akhir setiap kuartal");

    const baris = await t.run((ctx) => ctx.db.query("doorprizePeriode").collect());
    expect(baris).toHaveLength(1);
    expect(baris[0]).toMatchObject({
      kode: "2026-Q4",
      quarter: 4,
      year: 2026,
      startDate: awalKuartal(Q4),
    });

    await expect(
      admin.sesi.mutation(api.doorprize.simpanHadiahKuartal, {
        kategori: "GOLD",
        nama: "Emas 1 gram",
        nilai: 1_000_000,
      }),
    ).rejects.toThrow(/di bawah Rp1\.000\.000/i);
    await expect(
      admin.sesi.mutation(api.doorprize.simpanHadiahKuartal, {
        kategori: "GOLD",
        nama: "Emas 1 gram",
        nilai: 5_000,
      }),
    ).rejects.toThrow(/Nilai hadiah/i);
    await expect(
      admin.sesi.mutation(api.doorprize.simpanHadiahKuartal, {
        kategori: "GOLD",
        nama: "E",
        nilai: 100_000,
      }),
    ).rejects.toThrow(/Nama hadiah/i);

    await expect(
      peminjam.sesi.mutation(api.doorprize.simpanHadiahKuartal, {
        kategori: "VOUCHER",
        nama: "Saldo E-Wallet Rp100.000",
        nilai: 100_000,
      }),
    ).rejects.toThrow(/Super Admin/i);
  });

  it("menolak pengundian sebelum hari pengundian, lalu mengundi sekali dengan hadiah tersimpan", async () => {
    vi.spyOn(Date, "now").mockReturnValue(WAKTU_AWAL);
    const t = buatKontek();
    const adminAwal = await siapkanPengguna(t, "Admin Awal", {
      email: "admin-awal@pindai.test",
      role: "admin",
    });
    const peminjam = await siapkanPengguna(t, "Pemenang Uji", {
      email: "pemenang-uji@pindai.test",
      role: "peminjam",
    });
    await t.run((ctx) =>
      beriTiket(ctx, {
        pemilikId: peminjam.userId,
        peran: "peminjam",
        referensi: "PINJAMAN:PEMENANG",
        sumber: "pelunasan_tepat_waktu",
        waktu: WAKTU_AWAL,
      }),
    );

    const rekapAwal = await adminAwal.sesi.query(api.doorprize.ringkasanAdmin, {});
    expect(rekapAwal.tiketAktif).toBe(1);
    expect(rekapAwal.bisaDiundi).toBe(false);
    expect(rekapAwal.pemenang).toBeNull();
    await expect(
      adminAwal.sesi.mutation(api.doorprize.acakPemenang, {}),
    ).rejects.toThrow(/baru dibuka pada 31 Desember 2026/i);

    // Hari pengundian tiba: sesi admin baru agar tidak kedaluwarsa karena waktu
    // uji dimajukan, lalu hadiah dipilih sebelum mengundi.
    vi.spyOn(Date, "now").mockReturnValue(WAKTU_UNDIAN);
    const admin = await siapkanPengguna(t, "Admin Undian", {
      email: "admin-undian@pindai.test",
      role: "admin",
    });
    await admin.sesi.mutation(api.doorprize.simpanHadiahKuartal, {
      kategori: "GOLD",
      nama: "Emas Antam 0,25 gram",
      nilai: 450_000,
    });

    const hasil = await admin.sesi.mutation(api.doorprize.acakPemenang, {});
    expect(hasil.kode).toBe("2026-Q4");
    expect(hasil.nama).toBe("Pemenang Uji");
    expect(hasil.jumlahTiket).toBe(1);
    expect(hasil.hadiah).toBe("Emas Antam 0,25 gram");

    const tiket = await t.run((ctx) => ctx.db.query("doorprizeTiket").collect());
    expect(tiket[0].status).toBe("menang");

    // Saldo tiket pengguna kembali 0 setelah undian, tetapi jumlah yang ikut
    // undian tetap terbaca agar riwayatnya tidak hilang.
    const sesiPeminjam = await buatSesiLain(t, "Pemenang Uji", peminjam.userId);
    const ringkasanPemenang = await sesiPeminjam.sesi.query(api.doorprize.ringkasanSaya, {});
    expect(ringkasanPemenang?.sudahDiundi).toBe(true);
    expect(ringkasanPemenang?.tiketPeminjam).toBe(0);
    expect(ringkasanPemenang?.tiketAktif).toBe(0);
    expect(ringkasanPemenang?.tiketTerkumpul).toBe(1);
    expect(ringkasanPemenang?.pemenang?.nama).toBe("Pemenang Uji");

    const undian = await t.run((ctx) => ctx.db.query("doorprizeUndian").collect());
    expect(undian).toHaveLength(1);
    expect(undian[0]).toMatchObject({
      periode: kodeKuartal(Q4),
      pemilikId: peminjam.userId,
      hadiah: "Emas Antam 0,25 gram",
    });

    await expect(admin.sesi.mutation(api.doorprize.acakPemenang, {})).rejects.toThrow(
      /sudah diundi/i,
    );
    const rekapAkhir = await admin.sesi.query(api.doorprize.ringkasanAdmin, {});
    expect(rekapAkhir.pemenang?.nama).toBe("Pemenang Uji");
    expect(rekapAkhir.hadiah.nama).toBe("Emas Antam 0,25 gram");
  });

  it("menolak akun non-admin dan undian tanpa tiket", async () => {
    vi.spyOn(Date, "now").mockReturnValue(WAKTU_UNDIAN);
    const t = buatKontek();
    const peminjam = await siapkanPengguna(t, "Bukan Admin", {
      email: "bukan-admin@pindai.test",
      role: "peminjam",
    });
    await expect(peminjam.sesi.query(api.doorprize.ringkasanAdmin, {})).rejects.toThrow(
      /Super Admin/i,
    );
    await expect(peminjam.sesi.mutation(api.doorprize.acakPemenang, {})).rejects.toThrow(
      /Super Admin/i,
    );

    const admin = await siapkanPengguna(t, "Admin Kosong", {
      email: "admin-kosong@pindai.test",
      role: "admin",
    });
    await expect(admin.sesi.mutation(api.doorprize.acakPemenang, {})).rejects.toThrow(
      /Belum ada tiket/i,
    );
  });
});
