/**
 * Tes integrasi LAPORAN PENDANA lewat WhatsApp (convex-test + vitest).
 *
 * Dua jalur yang dijanjikan ke pemilik produk:
 *  1. laporan PELUNASAN berangkat sendiri saat admin menandai pinjaman lunas,
 *     dan hanya ke akun pendana pemilik pinjaman itu;
 *  2. laporan KINERJA PORTOFOLIO dikirim saat pendana memintanya sendiri dari
 *     ruang pendana, ke nomor yang ia simpan di akunnya.
 *
 * Yang dijaga berkas ini:
 *  - nomor laporan adalah milik AKUN: hanya akun penyedia dana yang boleh
 *    menyimpan/menghapusnya, dan aksi pengiriman tidak menerima nomor tujuan
 *    dari pemanggil, sehingga laporan keuangan tidak bisa dialihkan ke nomor
 *    lain oleh siapa pun yang menemukan tombolnya;
 *  - tanpa nomor tersimpan, TIDAK ada berkas yang dikirim keluar, tetapi
 *    kejadiannya tetap tercatat di `waLogs` beserta alasannya;
 *  - lampiran PDF benar-benar disertakan (lewat endpoint Fonnte), dan berkasnya
 *    dihapus kembali oleh penjadwalan retensi supaya tautannya tidak menganggur;
 *  - gateway yang tidak mendukung lampiran ditolak dengan alasan yang bisa
 *    dibaca admin, bukan dicatat "terkirim" padahal berkasnya tidak ikut;
 *  - pelunasan pinjaman tanpa pemilik kanonik dilewati, bukan dikirim ke akun
 *    yang hanya kebetulan mirip namanya.
 *
 * Fonnte dipanggil dari SERVER, jadi tes mengganti `globalThis.fetch` dan membaca
 * permintaan yang benar-benar keluar.
 *
 * Menjalankan: bunx vitest run src/convex/laporanPendana.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { formatRupiahAman } from "../lib/money";
import schema from "./schema";
import { buatPengguna, siapkanPengguna, type KonteksUji } from "./test.helpers";
import { modules } from "./test.setup";

const NOMOR_PENDANA = "6281234567890";
const NOMOR_PENDANA_LAIN = "6289999999999";
const TOKEN_UJI = "token-uji-laporan";

type KeluarFonnte = {
  target: string;
  message: string;
  /** URL berkas yang diambil Fonnte; kosong bila tidak ada lampiran. */
  url: string;
  /** Nama berkas lampiran seperti yang dibaca penerima. */
  filename: string;
};

/** Fonnte palsu yang selalu sukses; selalu dipakai lewat try/finally. */
function pasangGateway() {
  const asli = globalThis.fetch;
  const keluar: KeluarFonnte[] = [];
  process.env.FONNTE_TOKEN = TOKEN_UJI;
  globalThis.fetch = (async (_url: unknown, init?: { body?: unknown }) => {
    const body = new URLSearchParams(String(init?.body ?? ""));
    keluar.push({
      target: body.get("target") ?? "",
      message: body.get("message") ?? "",
      url: body.get("url") ?? "",
      filename: body.get("filename") ?? "",
    });
    return new Response(JSON.stringify({ status: true, detail: "success! message in queue" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return {
    keluar,
    /** Permintaan yang membawa lampiran saja (laporan, bukan pesan biasa). */
    lampiran: () => keluar.filter((k) => k.filename !== ""),
    pulihkan: () => {
      globalThis.fetch = asli;
      delete process.env.FONNTE_TOKEN;
    },
  };
}

/** Baris konfigurasi gateway untuk slot tunggal. */
async function seedGateway(
  t: KonteksUji,
  opsi: { aktif: boolean; apiUrl?: string },
): Promise<void> {
  await t.run((ctx) =>
    ctx.db.insert("waSettings", {
      slot: "global",
      apiUrl: opsi.apiUrl ?? "https://api.fonnte.com/send",
      authHeader: "Authorization",
      authPrefix: "",
      fieldNomor: "target",
      fieldPesan: "message",
      aktif: opsi.aktif,
      templatesWa: {},
    }),
  );
}

/** Satu pinjaman yang dimiliki pendana tertentu (aturan kanonik: `pendanaId`). */
async function seedPinjaman(
  t: KonteksUji,
  opsi: {
    userId: Id<"users">;
    status: "didanai" | "lunas";
    nomorReferensi: string;
    pendanaId?: Id<"users">;
  },
): Promise<Id<"loans">> {
  const now = Date.now();
  return t.run((ctx) =>
    ctx.db.insert("loans", {
      userId: opsi.userId,
      pokokPinjaman: 1_000_000,
      tujuan: "Modal usaha kecil",
      namaLengkap: "RANI PEMINJAM",
      namaBank: "BCA",
      nomorRekening: "1234567890",
      status: opsi.status,
      nomorReferensi: opsi.nomorReferensi,
      tenorHari: 30,
      didanaiPada: now - 30 * 86_400_000,
      ...(opsi.status === "lunas" ? { lunasPada: now } : {}),
      ...(opsi.pendanaId === undefined ? {} : { pendanaId: opsi.pendanaId }),
    }),
  );
}

/** Pendana dengan nomor laporan yang sudah tersimpan di akunnya. */
async function pendanaDenganNomor(
  t: KonteksUji,
  email: string,
  nomor: string,
): Promise<{ userId: Id<"users">; sesi: Awaited<ReturnType<typeof siapkanPengguna>>["sesi"] }> {
  const pendana = await siapkanPengguna(t, "Robert Tanaya", { email, role: "dana" });
  await t.run((ctx) => ctx.db.patch(pendana.userId, { nomorWhatsApp: nomor }));
  return { userId: pendana.userId, sesi: pendana.sesi };
}

describe("nomor laporan milik akun pendana", () => {
  it("nomor disimpan dalam bentuk 62 dan terbaca kembali oleh akun itu", async () => {
    const t = convexTest(schema, modules);
    const pendana = await siapkanPengguna(t, "Robert Tanaya", {
      email: "pendana-nomor@pindai.test",
      role: "dana",
    });

    const hasil = await pendana.sesi.mutation(api.penyediaDana.simpanKontakLaporan, {
      nomor: "0812 3456 7890",
    });
    expect(hasil.nomorWhatsApp).toBe(NOMOR_PENDANA);
    await expect(pendana.sesi.query(api.penyediaDana.kontakLaporanSaya, {})).resolves.toEqual({
      nomorWhatsApp: NOMOR_PENDANA,
    });
  });

  it("mengosongkan isian menghapus nomornya, jadi tidak ada laporan yang dikirim", async () => {
    const t = convexTest(schema, modules);
    const { sesi } = await pendanaDenganNomor(
      t,
      "pendana-hapus@pindai.test",
      NOMOR_PENDANA,
    );

    await expect(sesi.mutation(api.penyediaDana.simpanKontakLaporan, { nomor: "   " })).resolves.toEqual(
      { nomorWhatsApp: null },
    );
    await expect(sesi.query(api.penyediaDana.kontakLaporanSaya, {})).resolves.toEqual({
      nomorWhatsApp: null,
    });
  });

  it("nomor yang tidak dikenali ditolak dengan contoh penulisan", async () => {
    const t = convexTest(schema, modules);
    const pendana = await siapkanPengguna(t, "Robert Tanaya", {
      email: "pendana-salah@pindai.test",
      role: "dana",
    });

    await expect(
      pendana.sesi.mutation(api.penyediaDana.simpanKontakLaporan, { nomor: "12345" }),
    ).rejects.toThrow(/tidak dikenali/);
    await expect(pendana.sesi.query(api.penyediaDana.kontakLaporanSaya, {})).resolves.toEqual({
      nomorWhatsApp: null,
    });
  });

  it("akun peminjam tidak boleh menyimpan nomor laporan", async () => {
    const t = convexTest(schema, modules);
    const peminjam = await siapkanPengguna(t, "Rani Peminjam", {
      email: "peminjam-nomor@pindai.test",
      role: "peminjam",
    });

    await expect(
      peminjam.sesi.mutation(api.penyediaDana.simpanKontakLaporan, { nomor: "081234567890" }),
    ).rejects.toThrow(/Hanya akun penyedia dana/);
  });

  it("admin tidak menerima nomor laporan siapa pun", async () => {
    const t = convexTest(schema, modules);
    const admin = await siapkanPengguna(t, "admin", {
      email: "admin-nomor@pindai.test",
      role: "admin",
    });

    await expect(admin.sesi.query(api.penyediaDana.kontakLaporanSaya, {})).resolves.toBeNull();
  });

  it("belum masuk: tidak ada nomor yang dibocorkan", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.penyediaDana.kontakLaporanSaya, {})).resolves.toBeNull();
  });
});

describe("laporan kinerja portofolio atas permintaan pendana", () => {
  it("tanpa nomor tersimpan: tidak ada berkas keluar, alasannya tercatat", async () => {
    const t = convexTest(schema, modules);
    const pendana = await siapkanPengguna(t, "Robert Tanaya", {
      email: "pendana-tanpa-nomor@pindai.test",
      role: "dana",
    });
    await seedGateway(t, { aktif: true });
    const gateway = pasangGateway();
    try {
      await expect(
        pendana.sesi.action(api.laporanPendana.kirimLaporanPortofolio, {}),
      ).rejects.toThrow(/Nomor WhatsApp laporan belum diisi/);
      expect(gateway.lampiran()).toHaveLength(0);

      const logs = await t.run((ctx) => ctx.db.query("waLogs").collect());
      expect(logs).toHaveLength(1);
      expect(logs[0].jenis).toBe("laporan_portofolio");
      expect(logs[0].status).toBe("tanpa_nomor");
      expect(logs[0].nomorTujuan).toBe("-");
      expect(logs[0].olehUserId).toBe(pendana.userId);
    } finally {
      gateway.pulihkan();
    }
  });

  it("dengan nomor tersimpan: PDF terkirim ke nomor akun itu sendiri", async () => {
    const t = convexTest(schema, modules);
    const { userId, sesi } = await pendanaDenganNomor(
      t,
      "pendana-kinerja@pindai.test",
      NOMOR_PENDANA,
    );
    const peminjam = await buatPengguna(t, "rani", {
      email: "peminjam-kinerja@pindai.test",
      role: "peminjam",
    });
    await seedPinjaman(t, {
      userId: peminjam.userId,
      status: "didanai",
      nomorReferensi: "PND-LAPORAN-BERJALAN",
      pendanaId: userId,
    });
    await seedGateway(t, { aktif: true });

    const gateway = pasangGateway();
    try {
      const hasil = await sesi.action(api.laporanPendana.kirimLaporanPortofolio, {});
      expect(hasil.ok).toBe(true);
      expect(hasil.jumlahBerjalan).toBe(1);

      const keluar = gateway.lampiran();
      expect(keluar).toHaveLength(1);
      expect(keluar[0].target).toBe(NOMOR_PENDANA);
      expect(keluar[0].filename).toMatch(/^laporan-pendanaan-\d{4}-\d{2}-\d{2}\.pdf$/);
      expect(keluar[0].url).not.toBe("");
      expect(keluar[0].message).toContain("salinan laporan kinerja pendanaan Anda");
      // Angka di pesan harus angka ruang pendana, bukan hitungan kedua: dibaca
      // dari query yang sama dengan yang dilihat pendana di layar.
      const ruang = await sesi.query(api.penyediaDana.daftarPengajuan, {});
      expect(keluar[0].message).toContain(
        formatRupiahAman(ruang.rekapPendana[0].totalDisalurkan),
      );
      // Nomor tujuan tidak bisa dipilih pemanggil: aksi ini tidak menerima
      // argumen nomor sama sekali, dan yang tercatat adalah nomor akun itu.
      expect(keluar[0].target).not.toBe(NOMOR_PENDANA_LAIN);

      const logs = await t.run((ctx) => ctx.db.query("waLogs").collect());
      expect(logs).toHaveLength(1);
      expect(logs[0].jenis).toBe("laporan_portofolio");
      expect(logs[0].status).toBe("terkirim");
      expect(logs[0].nomorTujuan).toBe(NOMOR_PENDANA);
      expect(logs[0].olehUserId).toBe(userId);
    } finally {
      gateway.pulihkan();
    }
  });

  it("gateway non-Fonnte ditolak dengan alasan yang bisa dibaca admin", async () => {
    const t = convexTest(schema, modules);
    const { sesi } = await pendanaDenganNomor(t, "pendana-gateway@pindai.test", NOMOR_PENDANA);
    await seedGateway(t, { aktif: true, apiUrl: "https://api.contoh.com/send" });

    const gateway = pasangGateway();
    try {
      await expect(sesi.action(api.laporanPendana.kirimLaporanPortofolio, {})).rejects.toThrow(
        /belum mendukung lampiran berkas/,
      );
      const logs = await t.run((ctx) => ctx.db.query("waLogs").collect());
      expect(logs).toHaveLength(1);
      expect(logs[0].status).toBe("gagal");
      expect(logs[0].respon).toMatch(/Fonnte/);
    } finally {
      gateway.pulihkan();
    }
  });

  it("integrasi WhatsApp nonaktif: laporan ditahan dan alasannya dinyatakan", async () => {
    const t = convexTest(schema, modules);
    const { sesi } = await pendanaDenganNomor(t, "pendana-mati@pindai.test", NOMOR_PENDANA);
    await seedGateway(t, { aktif: false });

    const gateway = pasangGateway();
    try {
      await expect(sesi.action(api.laporanPendana.kirimLaporanPortofolio, {})).rejects.toThrow(
        /Integrasi WhatsApp belum aktif/,
      );
      expect(gateway.lampiran()).toHaveLength(0);
      const logs = await t.run((ctx) => ctx.db.query("waLogs").collect());
      expect(logs[0].status).toBe("dinonaktifkan");
    } finally {
      gateway.pulihkan();
    }
  });

  it("peminjam tidak punya laporan kinerja pendanaan", async () => {
    const t = convexTest(schema, modules);
    const peminjam = await siapkanPengguna(t, "Rani Peminjam", {
      email: "peminjam-kinerja2@pindai.test",
      role: "peminjam",
    });

    await expect(
      peminjam.sesi.action(api.laporanPendana.kirimLaporanPortofolio, {}),
    ).rejects.toThrow(/hanya untuk akun penyedia dana/);
  });
});

describe("laporan pelunasan otomatis", () => {
  it("pinjaman yang ditandai lunas mengirim laporan ke pendananya, lalu berkasnya dibersihkan", async () => {
    vi.useFakeTimers();
    const gateway = pasangGateway();
    try {
      const t = convexTest(schema, modules);
      const admin = await siapkanPengguna(t, "admin", {
        email: "admin-lunas@pindai.test",
        role: "admin",
      });
      const { userId: pendanaId, sesi: sesiPendana } = await pendanaDenganNomor(
        t,
        "pendana-lunas@pindai.test",
        NOMOR_PENDANA,
      );
      const peminjam = await buatPengguna(t, "rani", {
        email: "peminjam-lunas@pindai.test",
        role: "peminjam",
      });
      const loanId = await seedPinjaman(t, {
        userId: peminjam.userId,
        status: "didanai",
        nomorReferensi: "PND-LAPORAN-LUNAS",
        pendanaId,
      });
      await seedGateway(t, { aktif: true });

      await admin.sesi.mutation(api.loans.ubahStatusPinjaman, { loanId, status: "lunas" });
      // Pengiriman berjalan di penjadwal, bukan di dalam transaksi perubahan status.
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      const keluar = gateway.lampiran();
      expect(keluar).toHaveLength(1);
      expect(keluar[0].target).toBe(NOMOR_PENDANA);
      expect(keluar[0].filename).toBe("laporan-pelunasan-pnd-laporan-lunas.pdf");
      expect(keluar[0].message).toContain("PND-LAPORAN-LUNAS");
      expect(keluar[0].message).toContain("tercatat lunas pada");
      // Keuntungan yang disebut di pesan = keuntungan yang tampil di ruang
      // pendana (satu sumber angka, bukan perhitungan kedua di laporan).
      const ruang = await sesiPendana.query(api.penyediaDana.daftarPengajuan, {});
      const baris = ruang.pinjaman.find((p) => p._id === loanId);
      expect(baris).toBeDefined();
      expect(keluar[0].message).toContain(formatRupiahAman(baris?.keuntunganPendana ?? -1));

      const logs = await t.run((ctx) =>
        ctx.db.query("waLogs").collect().then((rows) =>
          rows.filter((r) => r.jenis === "laporan_pelunasan"),
        ),
      );
      expect(logs).toHaveLength(1);
      expect(logs[0].status).toBe("terkirim");
      expect(logs[0].loanId).toBe(loanId);
      expect(logs[0].nomorTujuan).toBe(NOMOR_PENDANA);
      expect(logs[0].olehUserId).toBe(admin.userId);

      // Retensi: berkas laporan tidak dibiarkan menganggur di penyimpanan.
      const berkas = await t.run((ctx) => ctx.db.system.query("_storage").collect());
      expect(berkas).toHaveLength(0);
    } finally {
      gateway.pulihkan();
      vi.useRealTimers();
    }
  });

  it("pendana tanpa nomor: pelunasan tetap tercatat, laporan tidak dikirim", async () => {
    vi.useFakeTimers();
    const gateway = pasangGateway();
    try {
      const t = convexTest(schema, modules);
      const admin = await siapkanPengguna(t, "admin", {
        email: "admin-lunas2@pindai.test",
        role: "admin",
      });
      const pendana = await siapkanPengguna(t, "Robert Tanaya", {
        email: "pendana-lunas2@pindai.test",
        role: "dana",
      });
      const peminjam = await buatPengguna(t, "rani", {
        email: "peminjam-lunas2@pindai.test",
        role: "peminjam",
      });
      const loanId = await seedPinjaman(t, {
        userId: peminjam.userId,
        status: "didanai",
        nomorReferensi: "PND-LAPORAN-TANPA-NOMOR",
        pendanaId: pendana.userId,
      });
      await seedGateway(t, { aktif: true });

      await admin.sesi.mutation(api.loans.ubahStatusPinjaman, { loanId, status: "lunas" });
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      expect(gateway.lampiran()).toHaveLength(0);
      const log = await t.run((ctx) =>
        ctx.db.query("waLogs").collect().then((rows) =>
          rows.find((r) => r.jenis === "laporan_pelunasan"),
        ),
      );
      expect(log?.status).toBe("tanpa_nomor");
      expect(log?.respon).toMatch(/Isi di ruang penyedia dana/);
    } finally {
      gateway.pulihkan();
      vi.useRealTimers();
    }
  });

  it("pinjaman tanpa pemilik kanonik dilewati, bukan dikirim ke nama yang mirip", async () => {
    vi.useFakeTimers();
    const gateway = pasangGateway();
    try {
      const t = convexTest(schema, modules);
      const admin = await siapkanPengguna(t, "admin", {
        email: "admin-lunas3@pindai.test",
        role: "admin",
      });
      // Pendana dengan nama yang sama, tetapi pinjamannya TIDAK menunjuk akunnya.
      await pendanaDenganNomor(t, "pendana-lunas3@pindai.test", NOMOR_PENDANA);
      const peminjam = await buatPengguna(t, "rani", {
        email: "peminjam-lunas3@pindai.test",
        role: "peminjam",
      });
      const loanId = await seedPinjaman(t, {
        userId: peminjam.userId,
        status: "didanai",
        nomorReferensi: "PND-LAPORAN-WARISAN",
      });
      await seedGateway(t, { aktif: true });

      await admin.sesi.mutation(api.loans.ubahStatusPinjaman, { loanId, status: "lunas" });
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      expect(gateway.lampiran()).toHaveLength(0);
      const laporan = await t.run((ctx) =>
        ctx.db.query("waLogs").collect().then((rows) =>
          rows.filter((r) => r.jenis.startsWith("laporan_")),
        ),
      );
      expect(laporan).toHaveLength(0);
    } finally {
      gateway.pulihkan();
      vi.useRealTimers();
    }
  });
});

describe("angka laporan untuk unduhan PDF manual", () => {
  it("mengembalikan angka portofolio yang sama untuk akun pendana", async () => {
    const t = convexTest(schema, modules);
    const pendana = await pendanaDenganNomor(
      t,
      "pendana-unduh@pindai.test",
      NOMOR_PENDANA,
    );
    const peminjam = await buatPengguna(t, "rani", {
      email: "peminjam-unduh@pindai.test",
      role: "peminjam",
    });
    await seedPinjaman(t, {
      userId: peminjam.userId,
      status: "didanai",
      nomorReferensi: "PND-UNDUH-1",
      pendanaId: pendana.userId,
    });

    const data = await pendana.sesi.query(api.laporanPendana.dataLaporanPortofolio, {});
    expect(data).not.toBeNull();
    expect(data?.totalDisalurkan).toBe(1_000_000);
    expect(data?.jumlahBerjalan).toBe(1);
    expect(data?.pinjamanBerjalan.map((p) => p.nomorReferensi)).toEqual(["PND-UNDUH-1"]);
    expect(data?.dicetakPada).toBeGreaterThan(0);
  });

  it("tidak menyusun laporan untuk akun yang bukan penyedia dana", async () => {
    const t = convexTest(schema, modules);
    const peminjam = await siapkanPengguna(t, "rani", {
      email: "bukan-pendana@pindai.test",
      role: "peminjam",
    });
    await expect(
      peminjam.sesi.query(api.laporanPendana.dataLaporanPortofolio, {}),
    ).resolves.toBeNull();
  });
});

describe("rekap pinjaman seluruh pendana", () => {
  it("admin mengirim satu PDF rekap ke nomor yang ia tulis, dan kejadiannya tercatat", async () => {
    const gateway = pasangGateway();
    try {
      const t = convexTest(schema, modules);
      const admin = await siapkanPengguna(t, "admin", {
        email: "admin-rekap@pindai.test",
        role: "admin",
      });
      const pendana = await pendanaDenganNomor(
        t,
        "pendana-rekap@pindai.test",
        NOMOR_PENDANA,
      );
      const peminjam = await buatPengguna(t, "rani", {
        email: "peminjam-rekap@pindai.test",
        role: "peminjam",
      });
      await seedPinjaman(t, {
        userId: peminjam.userId,
        status: "didanai",
        nomorReferensi: "PND-REKAP-1",
        pendanaId: pendana.userId,
      });
      await seedGateway(t, { aktif: true });

      // Angka unduhan dan angka kiriman dibaca dari query yang sama.
      const data = await admin.sesi.query(api.laporanPendana.dataRekapPendana, {});
      expect(data?.total.jumlahPendana).toBe(1);
      expect(data?.total.jumlahPinjaman).toBe(1);
      expect(data?.baris.map((r) => r.nama)).toEqual(["Robert Tanaya"]);

      const hasil = await admin.sesi.action(api.laporanPendana.kirimRekapPendana, {
        nomor: "0812 3456 7890",
      });
      expect(hasil).toEqual({ ok: true, tujuan: NOMOR_PENDANA, jumlahPendana: 1 });

      const keluar = gateway.lampiran();
      expect(keluar).toHaveLength(1);
      expect(keluar[0].target).toBe(NOMOR_PENDANA);
      expect(keluar[0].filename).toMatch(/^rekap-pendana-\d{4}-\d{2}-\d{2}\.pdf$/);
      expect(keluar[0].message).toContain("1 pendana, 1 pinjaman");
      expect(keluar[0].message).toContain(formatRupiahAman(1_000_000));

      const log = await t.run((ctx) =>
        ctx.db.query("waLogs").collect().then((rows) =>
          rows.find((r) => r.jenis === "rekap_pendana"),
        ),
      );
      expect(log?.status).toBe("terkirim");
      expect(log?.nomorTujuan).toBe(NOMOR_PENDANA);
      expect(log?.olehUserId).toBe(admin.userId);
    } finally {
      gateway.pulihkan();
    }
  });

  it("akun pendana tidak bisa menyusun atau mengirim rekap seluruh pendana", async () => {
    const t = convexTest(schema, modules);
    const pendana = await pendanaDenganNomor(t, "pendana-rekap2@pindai.test", NOMOR_PENDANA);
    await expect(
      pendana.sesi.query(api.laporanPendana.dataRekapPendana, {}),
    ).resolves.toBeNull();

    const gateway = pasangGateway();
    try {
      await expect(
        pendana.sesi.action(api.laporanPendana.kirimRekapPendana, { nomor: NOMOR_PENDANA }),
      ).rejects.toThrow(/hanya untuk Super Admin/);
      expect(gateway.lampiran()).toHaveLength(0);
    } finally {
      gateway.pulihkan();
    }
  });

  it("tanpa pendana, tidak ada berkas kosong yang dikirim", async () => {
    const t = convexTest(schema, modules);
    const admin = await siapkanPengguna(t, "admin", {
      email: "admin-rekap-kosong@pindai.test",
      role: "admin",
    });
    await seedGateway(t, { aktif: true });

    const gateway = pasangGateway();
    try {
      await expect(
        admin.sesi.action(api.laporanPendana.kirimRekapPendana, { nomor: NOMOR_PENDANA }),
      ).rejects.toThrow(/Belum ada pendana/);
      expect(gateway.lampiran()).toHaveLength(0);
    } finally {
      gateway.pulihkan();
    }
  });
});
