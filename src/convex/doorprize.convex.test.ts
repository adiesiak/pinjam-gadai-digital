/**
 * Uji Doorprize Emas: tiket otomatis, rekap widget, dan pengundian admin.
 *
 * Yang dibuktikan:
 *  - tiket idempoten per referensi (pelunasan dicatat ulang tidak menggandakan);
 *  - kelipatan pendanaan menghasilkan tiket sesuai aturan Rp1 juta;
 *  - ringkasan akun hanya menghitung tiket periode berjalan miliknya;
 *  - pengundian memilih tiket aktif, menandainya menang, dan menolak undian
 *    kedua pada periode yang sama;
 *  - akun non-admin tidak bisa membaca rekap maupun mengundi.
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import { beriTiket, beriTiketPendanaan } from "./doorprize";
import schema from "./schema";
import { siapkanPengguna } from "./test.helpers";
import { modules } from "./test.setup";

const buatKontek = () => convexTest(schema, modules);

describe("doorprize emas", () => {
  it("menerbitkan tiket idempoten dan menghitung kelipatan pendanaan", async () => {
    const t = buatKontek();
    const peminjam = await siapkanPengguna(t, "Peminjam Tiket", {
      email: "peminjam-tiket@pindai.test",
      role: "peminjam",
    });
    const pendana = await siapkanPengguna(t, "Pendana Tiket", {
      email: "pendana-tiket@pindai.test",
      role: "dana",
    });
    const waktu = Date.now();

    const pertama = await t.run((ctx) =>
      beriTiket(ctx, {
        pemilikId: peminjam.userId,
        peran: "peminjam",
        referensi: "PINJAMAN:PGD-UJI",
        sumber: "pelunasan_tepat_waktu",
        waktu,
      }),
    );
    const kedua = await t.run((ctx) =>
      beriTiket(ctx, {
        pemilikId: peminjam.userId,
        peran: "peminjam",
        referensi: "PINJAMAN:PGD-UJI",
        sumber: "pelunasan_tepat_waktu",
        waktu,
      }),
    );
    expect(pertama).toBe(1);
    expect(kedua).toBe(0);

    await t.run((ctx) =>
      beriTiketPendanaan(ctx, {
        pemilikId: pendana.userId,
        nomorReferensi: "FND-UJI",
        jumlahAlokasi: 2_500_000,
        waktu,
      }),
    );

    const ringkasanPeminjam = await peminjam.sesi.query(api.doorprize.ringkasanSaya, {});
    expect(ringkasanPeminjam?.tiketPeminjam).toBe(1);
    expect(ringkasanPeminjam?.tiketPendana).toBe(0);
    expect(ringkasanPeminjam?.tiketAktif).toBe(1);

    const ringkasanPendana = await pendana.sesi.query(api.doorprize.ringkasanSaya, {});
    expect(ringkasanPendana?.tiketPendana).toBe(2);
    expect(ringkasanPendana?.tiketAktif).toBe(2);

    const tiket = await t.run((ctx) => ctx.db.query("doorprizeTiket").collect());
    expect(tiket).toHaveLength(3);
  });

  it("mengundi satu pemenang per periode dan menolak undian kedua", async () => {
    const t = buatKontek();
    const admin = await siapkanPengguna(t, "Admin Undian", {
      email: "admin-undian@pindai.test",
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
        waktu: Date.now(),
      }),
    );

    const rekap = await admin.sesi.query(api.doorprize.ringkasanAdmin, {});
    expect(rekap.tiketAktif).toBe(1);
    expect(rekap.pemenang).toBeNull();

    const hasil = await admin.sesi.mutation(api.doorprize.acakPemenang, {});
    expect(hasil.nama).toBe("Pemenang Uji");
    expect(hasil.jumlahTiket).toBe(1);
    expect(hasil.hadiah).toBe("Emas 1 gram");

    const tiket = await t.run((ctx) => ctx.db.query("doorprizeTiket").collect());
    expect(tiket[0].status).toBe("menang");
    const undian = await t.run((ctx) => ctx.db.query("doorprizeUndian").collect());
    expect(undian).toHaveLength(1);
    expect(undian[0].pemilikId).toBe(peminjam.userId);

    await expect(admin.sesi.mutation(api.doorprize.acakPemenang, {})).rejects.toThrow(
      /sudah diundi/i,
    );
    const rekapAkhir = await admin.sesi.query(api.doorprize.ringkasanAdmin, {});
    expect(rekapAkhir.pemenang?.nama).toBe("Pemenang Uji");
  });

  it("menolak akun non-admin dan undian tanpa tiket", async () => {
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
