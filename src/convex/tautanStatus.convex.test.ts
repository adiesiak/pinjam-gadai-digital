/**
 * Tes integrasi TAUTAN STATUS & VERIFIKASI LOKASI (convex-test + vitest).
 *
 * Yang dijaga berkas ini — semuanya lewat pintu yang sama dengan aplikasi
 * (mutasi internal yang dipanggil HTTP action, query publik halaman cek status,
 * dan query panel admin), bukan memanggil aturan murni langsung:
 *
 *  - tautan hanya bisa dibuat admin sesi TOTP, dan pembuatannya idempoten
 *    selama masa berlaku (tautan yang sudah dikirim ke peminjam tidak mati);
 *  - halaman publik hanya menerima token yang sah; token asing/kedaluwarsa
 *    dijawab dengan pesan yang tidak membocorkan data pinjaman mana pun;
 *  - ping lokasi masuk ke `live_locations` dengan sumber `whatsapp_link_click`
 *    dan ikut tersalin ke jejak resmi (`lokasiJejak`) sehingga peta live admin
 *    serta deteksi lokasi palsu tetap bekerja;
 *  - ping yang terlalu rapat diabaikan, dan titik yang DITOLAK pemeriksa lokasi
 *    tetap terekam sebagai catatan — apa yang dilaporkan perangkat tidak hilang;
 *  - verifikasi selfie menyimpan berkas + waktu + koordinat + IP/user agent,
 *    menolak berkas kosong, dan menandai tautan sudah terverifikasi;
 *  - riwayat verifikasi hanya bisa dibaca admin.
 *
 * Menjalankan: bunx vitest run src/convex/tautanStatus.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { siapkanPengguna, simpanBerkasUji, type KonteksUji } from "./test.helpers";
import { modules } from "./test.setup";

/** Koordinat uji: Jakarta, lalu Surabaya (lompatan mustahil bila berdekatan). */
const JAKARTA = { lat: -6.2, lng: 106.816666, akurasi: 25 };
const SURABAYA = { lat: -7.2575, lng: 112.7521, akurasi: 30 };

/** Satu peminjam + satu pinjaman berjalan; mengembalikan id pinjamannya. */
async function seedPinjaman(t: KonteksUji, nama = "RANI PEMINJAM"): Promise<{
  userId: Id<"users">;
  loanId: Id<"loans">;
}> {
  const { userId } = await siapkanPengguna(t, nama, {
    email: `peminjam-${nama.replace(/\s+/g, "-").toLowerCase()}@contoh.test`,
    role: "peminjam",
  });
  const loanId = await t.run((ctx) =>
    ctx.db.insert("loans", {
      userId,
      pokokPinjaman: 2_000_000,
      tujuan: "Modal usaha",
      namaLengkap: nama,
      nomorRekening: "1234567890",
      status: "didanai",
      nomorReferensi: "PNJ-UJI-001",
      tenorHari: 30,
      nomorWhatsApp: "6281234567890",
      didanaiPada: Date.now() - 2 * 86_400_000,
    }),
  );
  return { userId, loanId };
}

/** Admin dengan sesi TOTP terverifikasi. */
async function seedAdmin(t: KonteksUji) {
  return await siapkanPengguna(t, "BENDAHARA ADMIN", {
    email: "admin-tautan@contoh.test",
    role: "admin",
  });
}

/** Alamat IP/UA uji — nilainya harus muncul apa adanya di baris audit. */
const IP = "103.20.30.40";
const UA = "Mozilla/5.0 (Linux; Android 13) PINDAI-Uji";

describe("tautanStatus.buatTautan", () => {
  it("menolak peminjam dan menerima admin sesi TOTP", async () => {
    const t = convexTest(schema, modules);
    const { userId, loanId } = await seedPinjaman(t);

    await expect(
      t.withIdentity({ subject: `${userId}|salah` }).mutation(api.tautanStatus.buatTautan, {
        loanId,
      }),
    ).rejects.toThrow();

    const admin = await seedAdmin(t);
    const hasil = await admin.sesi.mutation(api.tautanStatus.buatTautan, { loanId });
    expect(hasil.token).toMatch(/^[0-9a-f]{32}$/);
    expect(hasil.dibuatBaru).toBe(true);
  });

  it("memakai ulang token yang masih berlaku saat ditekan dua kali", async () => {
    const t = convexTest(schema, modules);
    const { loanId } = await seedPinjaman(t);
    const admin = await seedAdmin(t);

    const pertama = await admin.sesi.mutation(api.tautanStatus.buatTautan, { loanId });
    const kedua = await admin.sesi.mutation(api.tautanStatus.buatTautan, { loanId });

    expect(kedua.token).toBe(pertama.token);
    expect(kedua.dibuatBaru).toBe(false);
    const baris = await t.run((ctx) => ctx.db.query("tautanVerifikasi").collect());
    expect(baris).toHaveLength(1);
  });

  it("membuat token baru setelah tautan lama kedaluwarsa", async () => {
    const t = convexTest(schema, modules);
    const { loanId } = await seedPinjaman(t);
    const admin = await seedAdmin(t);

    const lama = await admin.sesi.mutation(api.tautanStatus.buatTautan, { loanId });
    // Simulasi tautan berumur lebih dari masa berlaku (30 hari).
    await t.run(async (ctx) => {
      const baris = await ctx.db.query("tautanVerifikasi").collect();
      await ctx.db.patch(baris[0]._id, { kedaluwarsaPada: Date.now() - 1 });
    });

    const baru = await admin.sesi.mutation(api.tautanStatus.buatTautan, { loanId });
    expect(baru.token).not.toBe(lama.token);
    expect(baru.dibuatBaru).toBe(true);
  });
});

describe("tautanStatus.infoTautan", () => {
  it("mengembalikan ringkasan kewajiban dari ledger untuk token yang sah", async () => {
    const t = convexTest(schema, modules);
    const { loanId } = await seedPinjaman(t);
    const admin = await seedAdmin(t);
    const { token } = await admin.sesi.mutation(api.tautanStatus.buatTautan, { loanId });

    const info = await t.query(api.tautanStatus.infoTautan, { token });
    expect(info.valid).toBe(true);
    if (!info.valid) return;
    expect(info.sudahVerifikasi).toBe(false);
    expect(info.ringkasan.nomorReferensi).toBe("PNJ-UJI-001");
    expect(info.ringkasan.namaLengkap).toBe("RANI PEMINJAM");
    expect(info.ringkasan.pokokPinjaman).toBe(2_000_000);
    // Pinjaman didanai → ada jatuh tempo & kewajiban berjalan (dihitung lib/loan).
    expect(info.ringkasan.jatuhTempoPada).not.toBeNull();
    expect(info.ringkasan.totalKewajiban).toBeGreaterThan(2_000_000);
    expect(info.ringkasan.tanggalJatuhTempo).not.toBeNull();
  });

  it("tidak membuka apa pun untuk token asing maupun format salah", async () => {
    const t = convexTest(schema, modules);
    const { loanId } = await seedPinjaman(t);
    const admin = await seedAdmin(t);
    await admin.sesi.mutation(api.tautanStatus.buatTautan, { loanId });

    const asing = await t.query(api.tautanStatus.infoTautan, { token: "f".repeat(32) });
    expect(asing.valid).toBe(false);
    if (!asing.valid) expect(asing.pesan).toMatch(/tidak dikenali/i);

    const format = await t.query(api.tautanStatus.infoTautan, { token: "PNJ-UJI-001" });
    expect(format.valid).toBe(false);
    if (!format.valid) expect(format.pesan).toMatch(/tidak lengkap/i);
  });

  it("menolak token yang sudah kedaluwarsa", async () => {
    const t = convexTest(schema, modules);
    const { loanId } = await seedPinjaman(t);
    const admin = await seedAdmin(t);
    const { token } = await admin.sesi.mutation(api.tautanStatus.buatTautan, { loanId });
    await t.run(async (ctx) => {
      const baris = await ctx.db.query("tautanVerifikasi").collect();
      await ctx.db.patch(baris[0]._id, { kedaluwarsaPada: Date.now() - 1 });
    });

    const info = await t.query(api.tautanStatus.infoTautan, { token });
    expect(info.valid).toBe(false);
    if (!info.valid) expect(info.pesan).toMatch(/kedaluwarsa/i);
  });
});

describe("tautanStatus.catatPing", () => {
  it("menyimpan titik ke live_locations dan menyalinnya ke jejak lokasi", async () => {
    const t = convexTest(schema, modules);
    const { userId, loanId } = await seedPinjaman(t);
    const admin = await seedAdmin(t);
    const { token } = await admin.sesi.mutation(api.tautanStatus.buatTautan, { loanId });

    const hasil = await t.mutation(internal.tautanStatus.catatPing, {
      token,
      ...JAKARTA,
      ipAddress: IP,
      userAgent: UA,
    });
    expect(hasil.ok).toBe(true);

    const titik = await t.run((ctx) => ctx.db.query("live_locations").collect());
    expect(titik).toHaveLength(1);
    expect(titik[0].source).toBe("whatsapp_link_click");
    expect(titik[0].borrowerId).toBe(userId);
    expect(titik[0].loanId).toBe(loanId);
    expect(titik[0].latitude).toBeCloseTo(JAKARTA.lat, 5);
    expect(titik[0].accuracy).toBe(JAKARTA.akurasi);
    expect(titik[0].ipAddress).toBe(IP);
    expect(titik[0].userAgent).toBe(UA);
    expect(titik[0].catatan).toBeUndefined();

    // Peta live admin membaca `lokasiJejak`: titik dari tautan harus ikut ke sana.
    const jejak = await t.run((ctx) => ctx.db.query("lokasiJejak").collect());
    expect(jejak).toHaveLength(1);
    expect(jejak[0].userId).toBe(userId);
    expect(jejak[0].loanId).toBe(loanId);
  });

  it("mengabaikan ping yang datang terlalu rapat tanpa menulis titik baru", async () => {
    const t = convexTest(schema, modules);
    const { loanId } = await seedPinjaman(t);
    const admin = await seedAdmin(t);
    const { token } = await admin.sesi.mutation(api.tautanStatus.buatTautan, { loanId });

    await t.mutation(internal.tautanStatus.catatPing, { token, ...JAKARTA });
    const kedua = await t.mutation(internal.tautanStatus.catatPing, { token, ...JAKARTA });

    expect(kedua.ok).toBe(false);
    if (!kedua.ok) {
      expect(kedua.diabaikan).toBe(true);
      expect(kedua.pesan.length).toBeGreaterThan(0);
    }
    const titik = await t.run((ctx) => ctx.db.query("live_locations").collect());
    expect(titik).toHaveLength(1);
  });

  it("tetap merekam titik yang ditolak pemeriksa lokasi, lengkap dengan catatannya", async () => {
    const t = convexTest(schema, modules);
    const { loanId } = await seedPinjaman(t);
    const admin = await seedAdmin(t);
    const { token } = await admin.sesi.mutation(api.tautanStatus.buatTautan, { loanId });

    await t.mutation(internal.tautanStatus.catatPing, { token, ...JAKARTA });
    // Seolah 10 detik kemudian titik dilaporkan di kota lain: lompatan yang
    // tidak mungkin dari sensor GPS sungguhan.
    await t.run(async (ctx) => {
      const baris = await ctx.db.query("tautanVerifikasi").collect();
      await ctx.db.patch(baris[0]._id, { terakhirPing: Date.now() - 60_000 });
    });
    const hasil = await t.mutation(internal.tautanStatus.catatPing, {
      token,
      ...SURABAYA,
      ipAddress: IP,
    });
    expect(hasil.ok).toBe(true);
    if (hasil.ok) expect(hasil.catatan).not.toBeNull();

    const titik = await t.run((ctx) => ctx.db.query("live_locations").collect());
    expect(titik).toHaveLength(2);
    const terakhir = titik.find((row) => row.latitude === SURABAYA.lat);
    expect(terakhir?.catatan).toBeTruthy();
    // Jejak resmi hanya memuat titik yang lolos; peta live tidak ikut tercemar.
    const jejak = await t.run((ctx) => ctx.db.query("lokasiJejak").collect());
    expect(jejak).toHaveLength(1);
  });

  it("menolak token tidak sah", async () => {
    const t = convexTest(schema, modules);
    const hasil = await t.mutation(internal.tautanStatus.catatPing, {
      token: "x".repeat(32),
      ...JAKARTA,
    });
    expect(hasil.ok).toBe(false);
    const titik = await t.run((ctx) => ctx.db.query("live_locations").collect());
    expect(titik).toHaveLength(0);
  });
});

describe("tautanStatus.catatVerifikasi", () => {
  it("menolak berkas kosong yang tidak ada di penyimpanan", async () => {
    const t = convexTest(schema, modules);
    const { loanId } = await seedPinjaman(t);
    const admin = await seedAdmin(t);
    const { token } = await admin.sesi.mutation(api.tautanStatus.buatTautan, { loanId });
    const fileId = await t.run((ctx) => ctx.storage.store(new Blob(["x"])));

    const hasil = await t.mutation(internal.tautanStatus.catatVerifikasi, {
      token,
      selfieFileId: fileId,
      diambilPada: Date.now(),
      ...JAKARTA,
    });
    expect(hasil.ok).toBe(false);
    const baris = await t.run((ctx) => ctx.db.query("verifikasiLokasi").collect());
    expect(baris).toHaveLength(0);
  });

  it("menyimpan audit verifikasi lengkap dan menandai tautan terverifikasi", async () => {
    const t = convexTest(schema, modules);
    const { userId, loanId } = await seedPinjaman(t);
    const admin = await seedAdmin(t);
    const { token } = await admin.sesi.mutation(api.tautanStatus.buatTautan, { loanId });
    // Berkas ≥ 2 KB seperti foto selfie hasil kompresi di perangkat.
    const fileId = await simpanBerkasUji(t, "s".repeat(3_000), "image/jpeg");
    const diambilPada = Date.now() - 5_000;

    const hasil = await t.mutation(internal.tautanStatus.catatVerifikasi, {
      token,
      selfieFileId: fileId,
      diambilPada,
      ...JAKARTA,
      ipAddress: IP,
      userAgent: UA,
    });
    expect(hasil.ok).toBe(true);

    const audit = await t.run((ctx) => ctx.db.query("verifikasiLokasi").collect());
    expect(audit).toHaveLength(1);
    expect(audit[0].loanId).toBe(loanId);
    expect(audit[0].borrowerId).toBe(userId);
    expect(audit[0].selfieFileId).toBe(fileId);
    expect(audit[0].selfieByte).toBeGreaterThanOrEqual(2_048);
    expect(audit[0].diambilPada).toBe(diambilPada);
    expect(audit[0].latitude).toBeCloseTo(JAKARTA.lat, 5);
    expect(audit[0].longitude).toBeCloseTo(JAKARTA.lng, 5);
    expect(audit[0].ipAddress).toBe(IP);
    expect(audit[0].userAgent).toBe(UA);
    expect(audit[0].sumber).toBe("verifikasi_tautan");

    // Koordinat verifikasi juga tercatat sebagai titik lokasi bersumber verifikasi.
    const titik = await t.run((ctx) =>
      ctx.db
        .query("live_locations")
        .withIndex("by_loan", (q) => q.eq("loanId", loanId))
        .collect(),
    );
    expect(titik.some((row) => row.source === "verifikasi_tautan")).toBe(true);

    const info = await t.query(api.tautanStatus.infoTautan, { token });
    expect(info.valid).toBe(true);
    if (info.valid) expect(info.sudahVerifikasi).toBe(true);
  });

  it("membatasi waktu pengambilan yang dilaporkan perangkat", async () => {
    const t = convexTest(schema, modules);
    const { loanId } = await seedPinjaman(t);
    const admin = await seedAdmin(t);
    const { token } = await admin.sesi.mutation(api.tautanStatus.buatTautan, { loanId });
    const fileId = await simpanBerkasUji(t, "s".repeat(3_000), "image/jpeg");

    // Jam perangkat yang jauh di masa depan tidak boleh dianggap sah.
    await t.mutation(internal.tautanStatus.catatVerifikasi, {
      token,
      selfieFileId: fileId,
      diambilPada: Date.now() + 10 * 86_400_000,
    });

    const audit = await t.run((ctx) => ctx.db.query("verifikasiLokasi").collect());
    expect(audit).toHaveLength(1);
    expect(audit[0].diambilPada).toBeLessThanOrEqual(audit[0].diterimaPada + 5 * 60_000);
  });
});

describe("tautanStatus.verifikasiTerbaru", () => {
  it("hanya bisa dibaca admin dan memuat tautan foto serta IP", async () => {
    const t = convexTest(schema, modules);
    const { loanId } = await seedPinjaman(t);
    const admin = await seedAdmin(t);
    const { token } = await admin.sesi.mutation(api.tautanStatus.buatTautan, { loanId });
    const fileId = await simpanBerkasUji(t, "s".repeat(3_000), "image/jpeg");
    await t.mutation(internal.tautanStatus.catatVerifikasi, {
      token,
      selfieFileId: fileId,
      diambilPada: Date.now(),
      ...JAKARTA,
      ipAddress: IP,
      userAgent: UA,
    });

    const data = await admin.sesi.query(api.tautanStatus.verifikasiTerbaru, { limit: 10 });
    expect(data.verifikasi).toHaveLength(1);
    expect(data.verifikasi[0].nomorReferensi).toBe("PNJ-UJI-001");
    expect(data.verifikasi[0].ipAddress).toBe(IP);
    expect(data.titik.length).toBeGreaterThan(0);

    // Tanpa identitas admin, query ini harus ditolak (data lokasi sensitif).
    await expect(t.query(api.tautanStatus.verifikasiTerbaru, { limit: 10 })).rejects.toThrow();
  });
});

describe("tautanStatus.statusTautanPinjaman", () => {
  it("melaporkan tautan aktif dan jumlah verifikasi ke baris admin", async () => {
    const t = convexTest(schema, modules);
    const { loanId } = await seedPinjaman(t);
    const admin = await seedAdmin(t);
    await admin.sesi.mutation(api.tautanStatus.buatTautan, { loanId });
    await t.mutation(api.tautanStatus.bukaTautan, {
      token: (await t.run((ctx) => ctx.db.query("tautanVerifikasi").collect()))[0].token,
    });

    const status = await admin.sesi.query(api.tautanStatus.statusTautanPinjaman, { loanId });
    expect(status.adaTautanAktif).toBe(true);
    expect(status.jumlahBuka).toBe(1);
    expect(status.sudahVerifikasi).toBe(false);
    expect(status.kedaluwarsaPada).not.toBeNull();
  });
});
