/**
 * Uji laporan transfer keuntungan di ruang pendana
 * (`penyediaDana.laporanTransferPendana`) — convex-test + vitest.
 *
 * Yang dibuktikan:
 *  - laporan memuat catatan yang sudah dibuat admin beserta nomor referensi
 *    pinjaman, nominal yang dihitung server, metode, dan referensi mutasinya;
 *  - antrean rekonsiliasi hanya berisi pinjaman LUNAS berpendana yang belum
 *    punya catatan berlaku — pinjaman berjalan belum jatuh tempo;
 *  - catatan yang dibatalkan tidak dihapus: ia pindah status dan pinjamannya
 *    kembali masuk antrean, sebab keuntungannya kembali belum tercatat;
 *  - pembatalan satu pinjaman tidak menyentuh catatan pinjaman lain (laporan
 *    pendana lain tidak boleh terbaca seolah transfernya diurungkan);
 *  - cakupan portofolio pribadi ikut berlaku di laporan: akun pendana hanya
 *    menerima catatan DAN antrean atas namanya, sedangkan admin/pemantau tetap
 *    menerima seluruh baris ruang ini;
 *  - gerbang ruang penyedia dana berlaku juga di laporan ini.
 *
 * Menjalankan: bunx vitest run src/convex/laporanTransferPendana.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import { siapkanPengguna, type KonteksUji } from "./test.helpers";
import { modules } from "./test.setup";

const buatKontek = () => convexTest(schema, modules);

/** Keuntungan bersih pendana atas pinjaman 1 juta dengan kebijakan default. */
const UNTUNG = 235_000;

/**
 * Satu pinjaman lunas berpendana + akun pendananya.
 * Nomor referensi dibuat unik supaya baris mudah dibedakan di laporan.
 */
async function seedLunas(t: KonteksUji, nomorReferensi: string) {
  const { userId } = await siapkanPengguna(t, `peminjam-${nomorReferensi}`, {
    email: `peminjam-${nomorReferensi}@pindai.test`,
    role: "peminjam",
  });
  const penyedia = await siapkanPengguna(t, `pendana-${nomorReferensi}`, {
    email: `pendana-${nomorReferensi}@pindai.test`,
    role: "dana",
  });
  const loanId = await t.run((ctx) =>
    ctx.db.insert("loans", {
      userId,
      pokokPinjaman: 1_000_000,
      tujuan: "Modal usaha",
      namaLengkap: "RANI PEMINJAM",
      nomorRekening: "1234567890",
      status: "lunas",
      nomorReferensi,
      tenorHari: 30,
      didanaiPada: 1_700_000_000_000,
      lunasPada: 1_700_100_000_000,
      pendanaId: penyedia.userId,
      pendanaNama: "Penyedia Dana",
    }),
  );
  return { loanId, penyedia, userId };
}

async function admin(t: KonteksUji) {
  return (
    await siapkanPengguna(t, "admin-laporan", {
      email: "admin-laporan@pindai.test",
      role: "admin",
    })
  ).sesi;
}

describe("laporan transfer keuntungan pendana", () => {
  it("memuat riwayat catatan yang sudah dibuat admin + antrean yang belum", async () => {
    const t = buatKontek();
    const sesiAdmin = await admin(t);
    const lunasA = await seedLunas(t, "PGD-LAPOR-A");
    const lunasB = await seedLunas(t, "PGD-LAPOR-B");
    // Pinjaman berjalan: keuntungannya belum jatuh tempo, jadi tidak dihitung.
    const berjalan = await seedLunas(t, "PGD-LAPOR-C");
    await t.run((ctx) => ctx.db.patch(berjalan.loanId, { status: "didanai", lunasPada: undefined }));

    await sesiAdmin.mutation(api.penyediaDana.catatTransferPendana, {
      loanId: lunasA.loanId,
      metode: "transfer_bank",
      referensi: "TRX-A",
      catatan: "ditransfer bersama pelunasan lain",
    });

    const laporan = await lunasA.penyedia.sesi.query(
      api.penyediaDana.laporanTransferPendana,
      {},
    );

    expect(laporan.rows).toHaveLength(1);
    const baris = laporan.rows[0];
    expect(baris.nomorReferensi).toBe("PGD-LAPOR-A");
    // Nominal datang dari perhitungan server, bukan dari klien.
    expect(baris.jumlah).toBe(UNTUNG);
    expect(baris.metode).toBe("transfer_bank");
    expect(baris.referensi).toBe("TRX-A");
    expect(baris.catatan).toBe("ditransfer bersama pelunasan lain");
    expect(baris.status).toBe("dicatat");
    expect(baris.dicatatOlehLabel).toBe("admin-laporan@pindai.test");
    expect(baris.pendanaId).toBe(lunasA.penyedia.userId);
    expect(laporan.idSaya).toBe(lunasA.penyedia.userId);
    expect(laporan.terpotong).toBe(false);

    expect(laporan.ringkasan.jumlahTercatat).toBe(1);
    expect(laporan.ringkasan.nilaiTercatat).toBe(UNTUNG);
    expect(laporan.ringkasan.jumlahDibatalkan).toBe(0);
    // Antrean pembaca adalah antreannya SENDIRI: transfernya sudah dicatat,
    // jadi tidak ada yang menunggu. Pinjaman berjalan tidak pernah masuk
    // antrean siapa pun — keuntungannya belum jatuh tempo.
    expect(laporan.ringkasan.jumlahBelumDicatat).toBe(0);
    expect(laporan.ringkasan.nilaiBelumDicatat).toBe(0);
    expect(laporan.belum).toHaveLength(0);

    // Admin tetap menerima seluruh antrean: pinjaman lunas pendana lain (B)
    // memang belum dicatat, dan itulah yang harus ia tindaklanjuti.
    const laporanAdmin = await sesiAdmin.query(api.penyediaDana.laporanTransferPendana, {});
    expect(laporanAdmin.ringkasan.jumlahBelumDicatat).toBe(1);
    expect(laporanAdmin.belum.map((b) => b.referensi)).toEqual(["PGD-LAPOR-B"]);
    expect(laporanAdmin.belum[0].pendanaId).toBe(lunasB.penyedia.userId);
    expect(laporanAdmin.belum[0].jumlah).toBe(UNTUNG);
  });

  it("pembatalan tidak menghapus jejak dan mengembalikan pinjaman ke antrean", async () => {
    const t = buatKontek();
    const sesiAdmin = await admin(t);
    const lunas = await seedLunas(t, "PGD-LAPOR-D");

    await sesiAdmin.mutation(api.penyediaDana.catatTransferPendana, {
      loanId: lunas.loanId,
      metode: "e_wallet",
      referensi: "TRX-D",
    });
    await sesiAdmin.mutation(api.penyediaDana.batalkanTransferPendana, {
      loanId: lunas.loanId,
      alasan: "Salah nominal",
    });

    const laporan = await lunas.penyedia.sesi.query(
      api.penyediaDana.laporanTransferPendana,
      {},
    );

    // Baris lama tetap ada, hanya berubah status — riwayatnya tidak dihapus.
    expect(laporan.rows).toHaveLength(1);
    expect(laporan.rows[0].status).toBe("dibatalkan");
    expect(laporan.rows[0].alasanBatal).toBe("Salah nominal");
    expect(laporan.rows[0].dibatalkanOlehLabel).toBe("admin-laporan@pindai.test");
    expect(laporan.rows[0].dibatalkanPada).not.toBeNull();

    expect(laporan.ringkasan.jumlahTercatat).toBe(0);
    expect(laporan.ringkasan.jumlahDibatalkan).toBe(1);
    expect(laporan.ringkasan.nilaiDibatalkan).toBe(UNTUNG);
    // Catatan batal = kewajiban yang kembali belum tercatat.
    expect(laporan.ringkasan.jumlahBelumDicatat).toBe(1);
    expect(laporan.ringkasan.nilaiBelumDicatat).toBe(UNTUNG);
  });

  it("pembatalan satu pinjaman tidak menyentuh catatan pinjaman lain", async () => {
    const t = buatKontek();
    const sesiAdmin = await admin(t);
    const lunasA = await seedLunas(t, "PGD-LAPOR-E");
    const lunasB = await seedLunas(t, "PGD-LAPOR-F");

    await sesiAdmin.mutation(api.penyediaDana.catatTransferPendana, {
      loanId: lunasA.loanId,
      metode: "transfer_bank",
      referensi: "TRX-E",
    });
    await sesiAdmin.mutation(api.penyediaDana.catatTransferPendana, {
      loanId: lunasB.loanId,
      metode: "transfer_bank",
      referensi: "TRX-F",
    });
    const hasil = await sesiAdmin.mutation(api.penyediaDana.batalkanTransferPendana, {
      loanId: lunasA.loanId,
      alasan: "Nomor rekening salah",
    });
    expect(hasil.jumlahDibatalkan).toBe(1);

    // Catatan pinjaman lain tetap berlaku: pendananya tidak boleh melihat
    // transfernya seolah diurungkan.
    const laporanB = await lunasB.penyedia.sesi.query(
      api.penyediaDana.laporanTransferPendana,
      {},
    );
    const barisB = laporanB.rows.find((r) => r.nomorReferensi === "PGD-LAPOR-F");
    expect(barisB?.status).toBe("dicatat");
    expect(barisB?.referensi).toBe("TRX-F");
    expect(laporanB.rows).toHaveLength(1);
    expect(laporanB.ringkasan.jumlahTercatat).toBe(1);
    // Catatan pendana lain tidak ikut terkirim, jadi pembatalannya pun tidak
    // terlihat di sini — bukan berarti pembatalan itu tidak terjadi.
    expect(laporanB.ringkasan.jumlahDibatalkan).toBe(0);
    expect(laporanB.ringkasan.jumlahBelumDicatat).toBe(0);

    const laporanAdmin = await sesiAdmin.query(api.penyediaDana.laporanTransferPendana, {});
    expect(laporanAdmin.ringkasan.jumlahDibatalkan).toBe(1);
    // Antrean admin hanya memuat pinjaman yang catatannya tidak berlaku lagi:
    // satu pinjaman yang dibatalkan, sedangkan pinjaman B tetap tercatat.
    expect(laporanAdmin.belum.map((b) => b.referensi)).toEqual(["PGD-LAPOR-E"]);
  });

  it("baris pendana lain tidak terkirim ke akun pendana, tetapi tetap utuh bagi admin", async () => {
    const t = buatKontek();
    const sesiAdmin = await admin(t);
    const lunasA = await seedLunas(t, "PGD-LAPOR-G");
    const lunasB = await seedLunas(t, "PGD-LAPOR-H");

    await sesiAdmin.mutation(api.penyediaDana.catatTransferPendana, {
      loanId: lunasA.loanId,
      metode: "tunai",
    });

    const laporan = await lunasB.penyedia.sesi.query(
      api.penyediaDana.laporanTransferPendana,
      {},
    );

    // Portofolio pribadi: catatan milik pendana lain tidak pernah terkirim.
    expect(laporan.rows).toHaveLength(0);
    expect(laporan.ringkasan.jumlahTercatat).toBe(0);
    // `idSaya` tetap dikirim: panel admin memakainya untuk menandai baris milik
    // pembaca di antara seluruh catatan yang ia terima.
    expect(laporan.idSaya).toBe(lunasB.penyedia.userId);

    const laporanAdmin = await sesiAdmin.query(api.penyediaDana.laporanTransferPendana, {});
    expect(laporanAdmin.rows).toHaveLength(1);
    expect(laporanAdmin.rows[0].pendanaId).toBe(lunasA.penyedia.userId);
    expect(laporanAdmin.rows[0].pendanaId).not.toBe(laporanAdmin.idSaya);
  });

  it("gerbang ruang penyedia dana juga berlaku di laporan", async () => {
    const t = buatKontek();
    const { sesi: peminjam } = await siapkanPengguna(t, "peminjam-laporan", {
      email: "peminjam-laporan@pindai.test",
      role: "peminjam",
    });

    await expect(
      peminjam.query(api.penyediaDana.laporanTransferPendana, {}),
    ).rejects.toThrow(/Ruang penyedia dana/i);
    await expect(t.query(api.penyediaDana.laporanTransferPendana, {})).rejects.toThrow(
      /Harus masuk/i,
    );

    // Admin membuka ruang ini untuk pratinjau, jadi ia boleh membacanya.
    const sesiAdmin = await admin(t);
    const laporanAdmin = await sesiAdmin.query(api.penyediaDana.laporanTransferPendana, {});
    expect(laporanAdmin.peran).toBe("admin");
    expect(laporanAdmin.rows).toHaveLength(0);
    expect(laporanAdmin.ringkasan.jumlahBelumDicatat).toBe(0);
  });
});
