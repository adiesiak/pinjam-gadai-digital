/**
 * Uji persetujuan risiko pendana — catatan SISI SERVER (`convex/persetujuanRisiko.ts`).
 *
 * Yang dibuktikan:
 *  - persetujuan tercatat atas nama AKUN di tabel server, lengkap dengan versi
 *    teks dan bunyi pernyataan yang disetujui (bukan hanya nomor versi);
 *  - idempoten per versi: menyetujui dua kali tidak menambah baris kedua;
 *  - halaman usang ditolak — versi dari klien harus sama dengan versi berlaku,
 *    supaya yang tercatat tidak pernah persetujuan atas kalimat yang tak dibaca;
 *  - versi teks naik: pendana diminta menyetujui lagi, riwayat versi lama tetap;
 *  - admin tidak mencatat persetujuan (ia hanya meninjau), dan akun di luar
 *    gerbang ruang pendana ditolak;
 *  - setiap pencatatan meninggalkan jejak di audit trail.
 *
 * Menjalankan: bunx vitest run src/convex/persetujuanRisiko.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import { PERNYATAAN_PERSETUJUAN, RISK_TEXT_VERSION } from "../lib/teksRisikoPendanaan";
import schema from "./schema";
import { siapkanPengguna, type KonteksUji } from "./test.helpers";
import { modules } from "./test.setup";

const buatKontek = () => convexTest(schema, modules);

/** Akun pendana beremail — pemegang akses lihat-saja dari admin. */
async function pendanaUji(t: KonteksUji, nama: string) {
  return siapkanPengguna(t, nama, {
    email: `${nama}@pindai.test`,
    role: "dana",
  });
}

describe("persetujuan risiko pendana", () => {
  it("mencatat persetujuan akun: versi, kalimat yang disetujui, dan audit", async () => {
    const t = buatKontek();
    const pendana = await pendanaUji(t, "pendana-setuju");

    // Sebelum menyetujui: versi berlaku diketahui, tetapi belum ada persetujuan.
    const awal = await pendana.sesi.query(api.persetujuanRisiko.statusPersetujuanRisiko, {});
    expect(awal.versiBerlaku).toBe(RISK_TEXT_VERSION);
    expect(awal.perluSetuju).toBe(true);
    expect(awal.versiDisetujui).toBeNull();
    expect(awal.bolehSetuju).toBe(true);
    expect(awal.pernyataan).toBe(PERNYATAAN_PERSETUJUAN);

    const hasil = await pendana.sesi.mutation(api.persetujuanRisiko.catatPersetujuanRisiko, {
      versiTeks: RISK_TEXT_VERSION,
    });
    expect(hasil.ok).toBe(true);
    expect(hasil.sudahAda).toBe(false);
    expect(hasil.versiTeks).toBe(RISK_TEXT_VERSION);

    const baris = await t.run((ctx) => ctx.db.query("persetujuanRisikoPendana").collect());
    expect(baris).toHaveLength(1);
    expect(baris[0].userId).toBe(pendana.userId);
    expect(baris[0].versiTeks).toBe(RISK_TEXT_VERSION);
    expect(baris[0].peran).toBe("dana");
    // Kalimat yang dibaca ikut tersimpan, bukan hanya nomor versinya.
    expect(baris[0].pernyataan).toBe(PERNYATAAN_PERSETUJUAN);

    const sesudah = await pendana.sesi.query(api.persetujuanRisiko.statusPersetujuanRisiko, {});
    expect(sesudah.perluSetuju).toBe(false);
    expect(sesudah.versiDisetujui).toBe(RISK_TEXT_VERSION);
    expect(sesudah.disetujuiPada).toBe(hasil.disetujuiPada);
    expect(sesudah.riwayat).toHaveLength(1);

    // Jejak audit: siapa menyetujui versi berapa.
    const audit = await t.run((ctx) =>
      ctx.db
        .query("auditLog")
        .withIndex("by_aksi", (q) => q.eq("aksi", "setuju_risiko_pendana"))
        .collect(),
    );
    expect(audit).toHaveLength(1);
    expect(audit[0].detail).toContain(`versi ${RISK_TEXT_VERSION}`);
  });

  it("idempoten per versi: menyetujui dua kali tidak menambah baris", async () => {
    const t = buatKontek();
    const pendana = await pendanaUji(t, "pendana-dobel");

    const pertama = await pendana.sesi.mutation(api.persetujuanRisiko.catatPersetujuanRisiko, {
      versiTeks: RISK_TEXT_VERSION,
    });
    const kedua = await pendana.sesi.mutation(api.persetujuanRisiko.catatPersetujuanRisiko, {
      versiTeks: RISK_TEXT_VERSION,
    });

    expect(kedua.ok).toBe(true);
    expect(kedua.sudahAda).toBe(true);
    // Waktu yang dikembalikan adalah waktu persetujuan yang SUDAH ADA.
    expect(kedua.disetujuiPada).toBe(pertama.disetujuiPada);
    const baris = await t.run((ctx) => ctx.db.query("persetujuanRisikoPendana").collect());
    expect(baris).toHaveLength(1);
  });

  it("menolak halaman usang: versi klien harus sama dengan versi berlaku", async () => {
    const t = buatKontek();
    const pendana = await pendanaUji(t, "pendana-usang");

    await expect(
      pendana.sesi.mutation(api.persetujuanRisiko.catatPersetujuanRisiko, {
        versiTeks: RISK_TEXT_VERSION + 1,
      }),
    ).rejects.toThrow(/diperbarui/i);

    // Percobaan gagal tidak meninggalkan baris apa pun.
    const baris = await t.run((ctx) => ctx.db.query("persetujuanRisikoPendana").collect());
    expect(baris).toHaveLength(0);
  });

  it("versi teks naik: diminta menyetujui lagi, riwayat versi lama tetap tersimpan", async () => {
    const t = buatKontek();
    const pendana = await pendanaUji(t, "pendana-riwayat");

    // Baris versi lama (0) mensimulasikan teks yang berlaku sebelum perubahan.
    await t.run((ctx) =>
      ctx.db.insert("persetujuanRisikoPendana", {
        userId: pendana.userId,
        versiTeks: 0,
        peran: "dana",
        pernyataan: "Pernyataan versi lama.",
        disetujuiPada: 1_700_000_000_000,
      }),
    );

    const lama = await pendana.sesi.query(api.persetujuanRisiko.statusPersetujuanRisiko, {});
    // Versi lama tidak lagi cukup, tetapi tidak dihapus: ia jadi riwayat.
    expect(lama.perluSetuju).toBe(true);
    expect(lama.versiDisetujui).toBe(0);
    expect(lama.disetujuiPada).toBeNull();
    expect(lama.riwayat).toHaveLength(1);

    await pendana.sesi.mutation(api.persetujuanRisiko.catatPersetujuanRisiko, {
      versiTeks: RISK_TEXT_VERSION,
    });

    const baru = await pendana.sesi.query(api.persetujuanRisiko.statusPersetujuanRisiko, {});
    expect(baru.perluSetuju).toBe(false);
    expect(baru.versiDisetujui).toBe(RISK_TEXT_VERSION);
    expect(baru.riwayat).toHaveLength(2);
    const baris = await t.run((ctx) => ctx.db.query("persetujuanRisikoPendana").collect());
    expect(baris).toHaveLength(2);
  });

  it("admin hanya meninjau: status terbaca, pencatatan ditolak", async () => {
    const t = buatKontek();
    const { sesi: admin } = await siapkanPengguna(t, "admin-setuju", {
      email: "admin-setuju@pindai.test",
      role: "admin",
    });

    const status = await admin.query(api.persetujuanRisiko.statusPersetujuanRisiko, {});
    expect(status.peran).toBe("admin");
    expect(status.bolehSetuju).toBe(false);

    await expect(
      admin.mutation(api.persetujuanRisiko.catatPersetujuanRisiko, {
        versiTeks: RISK_TEXT_VERSION,
      }),
    ).rejects.toThrow(/hanya meninjau/i);
    const baris = await t.run((ctx) => ctx.db.query("persetujuanRisikoPendana").collect());
    expect(baris).toHaveLength(0);
  });

  it("gerbang yang sama dengan ruang pendana: peminjam dan tamu ditolak", async () => {
    const t = buatKontek();
    const { sesi: peminjam } = await siapkanPengguna(t, "peminjam-setuju", {
      email: "peminjam-setuju@pindai.test",
      role: "peminjam",
    });

    await expect(
      peminjam.query(api.persetujuanRisiko.statusPersetujuanRisiko, {}),
    ).rejects.toThrow(/Ruang penyedia dana/i);
    await expect(
      peminjam.mutation(api.persetujuanRisiko.catatPersetujuanRisiko, {
        versiTeks: RISK_TEXT_VERSION,
      }),
    ).rejects.toThrow(/Ruang penyedia dana/i);

    // Tamu (tanpa identitas) tidak boleh membaca maupun mencatat.
    await expect(t.query(api.persetujuanRisiko.statusPersetujuanRisiko, {})).rejects.toThrow(
      /Harus masuk/i,
    );
    await expect(
      t.mutation(api.persetujuanRisiko.catatPersetujuanRisiko, { versiTeks: RISK_TEXT_VERSION }),
    ).rejects.toThrow(/Harus masuk/i);
  });
});
