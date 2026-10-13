/**
 * Tes integrasi MESIN OTP WHATSAPP (convex-test + vitest).
 *
 * Yang dijaga berkas ini — semuanya lewat action/mutation yang sama dengan yang
 * dipakai aplikasi, bukan memanggil aturan murni langsung:
 *
 *  - kode benar memverifikasi nomor HANYA setelah server mencocokkan hash;
 *  - kode salah, kedaluwarsa, dan kode yang sudah dipakai ditolak;
 *  - percobaan berlebih (per kode dan per pengguna) menutup pintu, dan
 *    hitungannya benar-benar TERSIMPAN (kegagalan dikembalikan sebagai hasil,
 *    bukan dilempar — lihat `convex/otpWhatsapp.ts`);
 *  - kirim ulang terlalu cepat ditahan cooldown;
 *  - Fonnte gagal / timeout / token kosong TIDAK pernah dianggap terverifikasi;
 *  - OTP milik orang lain dan OTP untuk tujuan lain tidak bisa dipakai;
 *  - kode aslinya tidak pernah tersimpan di database atau log (hanya hash).
 *
 * Fonnte dipanggil dari SERVER, jadi tes mengganti `globalThis.fetch` dan
 * membaca kode dari PESAN KELUAR — satu-satunya tempat kode aslinya pernah ada.
 *
 * Menjalankan: bunx vitest run src/convex/otpWhatsapp.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { buatPengguna, type KonteksUji, type SesiUji } from "./test.helpers";
import { modules } from "./test.setup";

const NOMOR = "6281234567890";
const NOMOR_LAIN = "628999888777";
const TOKEN_UJI = "token-uji-fonnte";

type PerilakuFonnte =
  | { jenis: "sukses" }
  | { jenis: "gagal"; reason: string }
  | { jenis: "timeout" }
  | { jenis: "http_galat"; status: number };

type KeluarFonnte = { target: string; message: string; auth: string | null };

/**
 * Ganti `fetch` dengan Fonnte palsu dan isi `FONNTE_TOKEN` dari environment.
 * Selalu dipakai lewat `try/finally` + `pulihkan()` supaya tes lain tidak
 * mewarisi jaringan palsu.
 */
function pasangFonnte(perilaku: PerilakuFonnte) {
  const asli = globalThis.fetch;
  const keluar: KeluarFonnte[] = [];
  process.env.FONNTE_TOKEN = TOKEN_UJI;
  globalThis.fetch = (async (
    _url: unknown,
    init?: { body?: unknown; headers?: Record<string, string> },
  ) => {
    const body = new URLSearchParams(String(init?.body ?? ""));
    keluar.push({
      target: body.get("target") ?? "",
      message: body.get("message") ?? "",
      auth: init?.headers?.Authorization ?? null,
    });
    if (perilaku.jenis === "timeout") {
      const galat = new Error("pengiriman dihentikan");
      galat.name = "AbortError";
      throw galat;
    }
    if (perilaku.jenis === "http_galat") {
      return new Response("gateway sedang bermasalah", { status: perilaku.status });
    }
    if (perilaku.jenis === "gagal") {
      return new Response(JSON.stringify({ status: false, reason: perilaku.reason }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
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

/** Kode OTP yang benar-benar dikirim keluar (6 digit pertama di pesan). */
function kodeTerkirim(keluar: KeluarFonnte[], indeks = 0): string {
  const pesan = keluar[indeks]?.message ?? "";
  const kode = pesan.match(/\d{6}/)?.[0] ?? "";
  expect(kode).toHaveLength(6);
  return kode;
}

/** Kode yang DIJAMIN berbeda dari kode benar (untuk menguji kode salah). */
function kodeSalah(benar: string): string {
  return benar === "000000" ? "111111" : "000000";
}

async function siapkan(
  t: KonteksUji,
  opsi: { nama?: string; nomor?: string | null; role?: "peminjam" | "dana" } = {},
): Promise<{ sesi: SesiUji; userId: Id<"users"> }> {
  const nama = opsi.nama ?? "Nasabah OTP";
  const nomor = opsi.nomor === undefined ? NOMOR : opsi.nomor;
  const { sesi, userId } = await buatPengguna(t, nama, {
    email: `${nama.toLowerCase().replace(/\s+/g, "-")}@pindai.test`,
    role: opsi.role ?? "peminjam",
  });
  if (nomor !== null) {
    await t.run(async (ctx) => {
      await ctx.db.insert("kycProfil", {
        userId,
        status: "IN_PROGRESS",
        nomorWhatsApp: nomor,
        dibuatPada: Date.now(),
        diperbaruiPada: Date.now(),
      });
    });
  }
  return { sesi, userId };
}

async function barisKyc(t: KonteksUji, userId: Id<"users">) {
  return t.run(async (ctx) =>
    ctx.db
      .query("kycProfil")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first(),
  );
}

async function tantangan(t: KonteksUji, userId: Id<"users">) {
  return t.run(async (ctx) =>
    ctx.db
      .query("waOtpChallenges")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
  );
}

/** Geser waktu SEMUA baris tantangan — untuk menguji kedaluwarsa & cooldown. */
async function geserWaktu(
  t: KonteksUji,
  userId: Id<"users">,
  patch: { dibuatPada?: number; kedaluwarsaPada?: number },
) {
  await t.run(async (ctx) => {
    const rows = await ctx.db
      .query("waOtpChallenges")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const row of rows) await ctx.db.patch(row._id, patch);
  });
}

/**
 * Geser HANYA baris tantangan terbaru. Dipakai agar urutan "tantangan terakhir"
 * tetap pasti (kalau semua baris dibuat sama tuanya, pemecah serinya ambigu).
 */
async function geserTerbaru(
  t: KonteksUji,
  userId: Id<"users">,
  patch: { dibuatPada?: number },
) {
  await t.run(async (ctx) => {
    const rows = await ctx.db
      .query("waOtpChallenges")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const terbaru = rows.sort((a, b) => b.dibuatPada - a.dibuatPada)[0];
    if (terbaru !== undefined) await ctx.db.patch(terbaru._id, patch);
  });
}

type HasilVerifikasi = { ok: true } | { ok: false; pesan: string };

/** Verifikasi lewat mutation publik — hasilnya nilai, bukan lemparan. */
async function cocokkan(
  sesi: SesiUji,
  tujuan: "verifikasi_nomor" | "transaksi",
  kode: string,
  ip?: string,
): Promise<HasilVerifikasi> {
  return (await sesi.mutation(api.otpWhatsapp.verifikasiOtpWa, {
    tujuan,
    kode,
    ...(ip === undefined ? {} : { ip }),
  })) as HasilVerifikasi;
}

/** Pastikan verifikasi GAGAL dengan pesan yang cocok. */
function harusGagal(hasil: HasilVerifikasi, pola: RegExp) {
  expect(hasil.ok).toBe(false);
  if (!hasil.ok) expect(hasil.pesan).toMatch(pola);
}

/** Minta kode dan kembalikan kode yang benar-benar dikirim ke Fonnte. */
async function mintaKode(
  sesi: SesiUji,
  tujuan: "verifikasi_nomor" | "transaksi" = "verifikasi_nomor",
): Promise<{ ok: boolean; terkirim: boolean; pesan: string; sisaDetik: number }> {
  return sesi.action(api.otpWhatsapp.mintaOtpWa, { tujuan, ip: "10.0.0.1" });
}

describe("OTP WhatsApp (Fonnte)", () => {
  it("OTP valid memverifikasi nomor hanya setelah server mencocokkan kode", async () => {
    const t = convexTest(schema, modules);
    const { sesi, userId } = await siapkan(t);
    const fonnte = pasangFonnte({ jenis: "sukses" });
    try {
      const minta = await mintaKode(sesi);
      expect(minta).toMatchObject({ ok: true, terkirim: true });
      // Kode tidak pernah ikut di balasan action.
      expect(JSON.stringify(minta)).not.toMatch(/\d{6}/);

      const kode = kodeTerkirim(fonnte.keluar);
      // PENTING: pengiriman sukses BUKAN verifikasi.
      expect((await barisKyc(t, userId))?.nomorWhatsAppTerverifikasi).toBeUndefined();

      expect(await cocokkan(sesi, "verifikasi_nomor", kode, "10.0.0.1")).toEqual({ ok: true });

      expect((await barisKyc(t, userId))?.nomorWhatsAppTerverifikasi).toMatchObject({
        nomor: NOMOR,
        metode: "wa_otp",
      });

      // Hasil pemeriksaan ikut terlihat nasabah lewat modul KYC.
      const kycSaya = await sesi.query(api.kyc.kycSaya, {});
      expect(kycSaya.nomorWhatsAppTerbukti).toBe(true);

      // Jejak audit ditulis tanpa nomor lengkap.
      const audit = await t.run(async (ctx) =>
        ctx.db.query("auditLog").withIndex("by_waktu").order("desc").take(20),
      );
      const entri = audit.find((a) => a.aksi === "kyc_nomor_wa_terverifikasi");
      expect(entri).toBeDefined();
      expect(entri?.detail ?? "").not.toContain(NOMOR);
    } finally {
      fonnte.pulihkan();
    }
  });

  it("kode salah ditolak, dihitung, dan kode yang benar masih bisa dipakai", async () => {
    const t = convexTest(schema, modules);
    const { sesi, userId } = await siapkan(t);
    const fonnte = pasangFonnte({ jenis: "sukses" });
    try {
      await mintaKode(sesi);
      const kode = kodeTerkirim(fonnte.keluar);

      harusGagal(await cocokkan(sesi, "verifikasi_nomor", kodeSalah(kode)), /Kode OTP salah/);

      const rows = await tantangan(t, userId);
      expect(rows).toHaveLength(1);
      // Hitungan percobaan TERSIMPAN (tidak ikut ter-rollback).
      expect(rows[0].percobaanGagal).toBe(1);
      expect((await barisKyc(t, userId))?.nomorWhatsAppTerverifikasi).toBeUndefined();

      // Percobaan gagal tidak menghabiskan kode selama batas belum lewat.
      expect(await cocokkan(sesi, "verifikasi_nomor", kode)).toEqual({ ok: true });
    } finally {
      fonnte.pulihkan();
    }
  });

  it("kode kedaluwarsa (lewat 5 menit) ditolak", async () => {
    const t = convexTest(schema, modules);
    const { sesi, userId } = await siapkan(t);
    const fonnte = pasangFonnte({ jenis: "sukses" });
    try {
      await mintaKode(sesi);
      const kode = kodeTerkirim(fonnte.keluar);
      const rows = await tantangan(t, userId);
      // Umur kode 5 menit sejak dibuat.
      expect(rows[0].kedaluwarsaPada - rows[0].dibuatPada).toBe(5 * 60 * 1000);
      await geserWaktu(t, userId, { kedaluwarsaPada: Date.now() - 1 });

      harusGagal(await cocokkan(sesi, "verifikasi_nomor", kode), /kedaluwarsa/i);
      expect((await barisKyc(t, userId))?.nomorWhatsAppTerverifikasi).toBeUndefined();
    } finally {
      fonnte.pulihkan();
    }
  });

  it("kode hanya bisa dipakai sekali", async () => {
    const t = convexTest(schema, modules);
    const { sesi } = await siapkan(t);
    const fonnte = pasangFonnte({ jenis: "sukses" });
    try {
      await mintaKode(sesi);
      const kode = kodeTerkirim(fonnte.keluar);
      expect(await cocokkan(sesi, "verifikasi_nomor", kode)).toEqual({ ok: true });
      harusGagal(await cocokkan(sesi, "verifikasi_nomor", kode), /sudah dipakai/i);
    } finally {
      fonnte.pulihkan();
    }
  });

  it("terlalu banyak percobaan menghabiskan kode", async () => {
    const t = convexTest(schema, modules);
    const { sesi, userId } = await siapkan(t);
    const fonnte = pasangFonnte({ jenis: "sukses" });
    try {
      await mintaKode(sesi);
      const kode = kodeTerkirim(fonnte.keluar);
      const salah = kodeSalah(kode);
      for (let ke = 1; ke <= 5; ke += 1) {
        harusGagal(await cocokkan(sesi, "verifikasi_nomor", salah), /Kode OTP salah/);
      }
      const rows = await tantangan(t, userId);
      expect(rows[0].percobaanGagal).toBe(5);
      expect(rows[0].maksPercobaan).toBe(5);

      // Kode yang BENAR pun tidak diterima lagi untuk kode yang sudah hangus.
      harusGagal(
        await cocokkan(sesi, "verifikasi_nomor", kode),
        /Terlalu banyak percobaan untuk kode ini/,
      );
      expect((await barisKyc(t, userId))?.nomorWhatsAppTerverifikasi).toBeUndefined();
    } finally {
      fonnte.pulihkan();
    }
  });

  it("batas percobaan berlaku juga lintas kode (per pengguna)", async () => {
    const t = convexTest(schema, modules);
    const { sesi, userId } = await siapkan(t);
    const fonnte = pasangFonnte({ jenis: "sukses" });
    try {
      for (let putaran = 0; putaran < 2; putaran += 1) {
        await mintaKode(sesi);
        const kode = kodeTerkirim(fonnte.keluar, putaran);
        const salah = kodeSalah(kode);
        for (let ke = 1; ke <= 5; ke += 1) {
          harusGagal(await cocokkan(sesi, "verifikasi_nomor", salah), /Kode OTP salah/);
        }
        // Lepaskan cooldown supaya kode berikutnya boleh diminta.
        await geserTerbaru(t, userId, { dibuatPada: Date.now() - 61_000 });
      }

      // 10 kegagalan dalam satu jam: permintaan berikutnya ditahan walaupun
      // kodenya benar.
      const kodeTerakhir = kodeTerkirim(fonnte.keluar, 1);
      harusGagal(
        await cocokkan(sesi, "verifikasi_nomor", kodeTerakhir),
        /Terlalu banyak percobaan kode/i,
      );

      const logs = await t.run(async (ctx) =>
        ctx.db.query("loginLogs").withIndex("by_waktu").order("desc").take(20),
      );
      expect(logs.some((l) => l.status === "diblokir" && l.metode === "wa_otp")).toBe(true);
    } finally {
      fonnte.pulihkan();
    }
  });

  it("kirim ulang yang terlalu cepat ditahan cooldown", async () => {
    const t = convexTest(schema, modules);
    const { sesi, userId } = await siapkan(t);
    const fonnte = pasangFonnte({ jenis: "sukses" });
    try {
      expect((await mintaKode(sesi)).ok).toBe(true);
      const kedua = await mintaKode(sesi);
      expect(kedua).toMatchObject({ ok: false, terkirim: false });
      expect(kedua.pesan).toMatch(/Tunggu \d+ detik/);
      expect(kedua.sisaDetik).toBeGreaterThan(0);
      // Yang ditahan tidak mengirim apa pun ke gateway.
      expect(fonnte.keluar).toHaveLength(1);

      // Setelah cooldown lewat, kode baru boleh diminta — dan kode lama mati.
      await geserTerbaru(t, userId, { dibuatPada: Date.now() - 61_000 });
      expect((await mintaKode(sesi)).ok).toBe(true);
      expect(fonnte.keluar).toHaveLength(2);
      expect(await tantangan(t, userId)).toHaveLength(2);

      const kodeLama = kodeTerkirim(fonnte.keluar, 0);
      harusGagal(await cocokkan(sesi, "verifikasi_nomor", kodeLama), /salah|kedaluwarsa/i);
    } finally {
      fonnte.pulihkan();
    }
  });

  it("pengiriman yang gagal tidak memakan kuota; yang berhasil tetap dibatasi", async () => {
    const t = convexTest(schema, modules);
    const { sesi, userId } = await siapkan(t);

    // Gateway bermasalah: seluruh percobaan gagal DI PENGIRIMAN. Kode seperti ini
    // tidak pernah sampai ke pengguna, jadi ia tidak boleh menghabiskan kuota —
    // kalau dihitung, orang yang mencoba lagi justru terkunci satu jam tepat saat
    // operator sedang memasang tokennya.
    const gagal = pasangFonnte({ jenis: "gagal", reason: "insufficient quota" });
    try {
      for (let i = 0; i < 7; i += 1) {
        const hasil = await mintaKode(sesi);
        expect(hasil).toMatchObject({ ok: false, terkirim: false });
        // Pesannya soal pengiriman, bukan "kuota permintaan habis".
        expect(hasil.pesan).not.toMatch(/Terlalu banyak/);
      }
    } finally {
      gagal.pulihkan();
    }

    // Baris tantangannya tetap tercatat — kode yang terkirim sebagian masih bisa
    // diverifikasi sampai kedaluwarsa — tetapi semuanya berstatus gagal.
    const gagalRows = await tantangan(t, userId);
    expect(gagalRows).toHaveLength(7);
    expect(gagalRows.every((b) => b.statusPengiriman === "gagal")).toBe(true);

    // Gateway sehat: permintaan berikutnya LANGSUNG boleh dikirim…
    const sehat = pasangFonnte({ jenis: "sukses" });
    try {
      expect(await mintaKode(sesi)).toMatchObject({ ok: true, terkirim: true });
      expect(sehat.keluar).toHaveLength(1);

      // …dan sejak itu cooldown berlaku lagi untuk kiriman yang benar-benar
      // terkirim: percobaan berikutnya ditahan tanpa menghubungi gateway.
      const cepat = await mintaKode(sesi);
      expect(cepat).toMatchObject({ ok: false, terkirim: false });
      expect(cepat.pesan).toMatch(/Tunggu \d+ detik/);
      expect(sehat.keluar).toHaveLength(1);
    } finally {
      sehat.pulihkan();
    }
  });

  it("Fonnte gagal: kode tidak terkirim dan nomor TIDAK menjadi terverifikasi", async () => {
    const t = convexTest(schema, modules);
    const { sesi, userId } = await siapkan(t);
    const fonnte = pasangFonnte({ jenis: "gagal", reason: "target invalid" });
    try {
      const hasil = await mintaKode(sesi);
      expect(hasil).toMatchObject({ ok: false, terkirim: false });
      expect(hasil.pesan).toMatch(/Nomor tujuan tidak valid/);

      const kode = kodeTerkirim(fonnte.keluar);
      const rows = await tantangan(t, userId);
      expect(rows[0].statusPengiriman).toBe("gagal");
      expect((await barisKyc(t, userId))?.nomorWhatsAppTerverifikasi).toBeUndefined();

      // Log pengiriman tidak pernah memuat kode.
      const logs = await t.run(async (ctx) => ctx.db.query("waLogs").collect());
      expect(logs).toHaveLength(1);
      expect(logs[0].status).toBe("gagal");
      expect(logs[0].jenis).toBe("otp_verifikasi_nomor");
      expect(logs[0].respon ?? "").not.toContain(kode);
      expect(JSON.stringify(logs[0])).not.toContain(kode);
    } finally {
      fonnte.pulihkan();
    }
  });

  it("Fonnte timeout: dilaporkan jelas dan tidak memverifikasi apa pun", async () => {
    const t = convexTest(schema, modules);
    const { sesi, userId } = await siapkan(t);
    const fonnte = pasangFonnte({ jenis: "timeout" });
    try {
      const hasil = await mintaKode(sesi);
      expect(hasil).toMatchObject({ ok: false, terkirim: false });
      expect(hasil.pesan).toMatch(/timeout/i);
      const rows = await tantangan(t, userId);
      expect(rows[0].statusPengiriman).toBe("gagal");
      expect((await barisKyc(t, userId))?.nomorWhatsAppTerverifikasi).toBeUndefined();
    } finally {
      fonnte.pulihkan();
    }
  });

  it("token Fonnte kosong / HTTP gagal: permintaan dilaporkan gagal", async () => {
    const t = convexTest(schema, modules);
    const { sesi, userId } = await siapkan(t);
    const asli = globalThis.fetch;
    delete process.env.FONNTE_TOKEN;
    try {
      const tanpaToken = await mintaKode(sesi);
      expect(tanpaToken).toMatchObject({ ok: false, terkirim: false });
      expect(tanpaToken.pesan).toMatch(/FONNTE_TOKEN/);
    } finally {
      globalThis.fetch = asli;
    }

    // Lepaskan cooldown supaya permintaan berikutnya benar-benar dikirim.
    await geserTerbaru(t, userId, { dibuatPada: Date.now() - 61_000 });
    const fonnte = pasangFonnte({ jenis: "http_galat", status: 500 });
    try {
      const http = await mintaKode(sesi);
      expect(http).toMatchObject({ ok: false, terkirim: false });
      expect(http.pesan).toMatch(/Fonnte menolak/i);
    } finally {
      fonnte.pulihkan();
    }
  });

  it("OTP milik pengguna lain tidak bisa dipakai", async () => {
    const t = convexTest(schema, modules);
    const a = await siapkan(t, { nama: "Pemilik OTP" });
    const b = await siapkan(t, { nama: "Orang Lain", nomor: NOMOR_LAIN });
    const fonnte = pasangFonnte({ jenis: "sukses" });
    try {
      await mintaKode(a.sesi);
      const kode = kodeTerkirim(fonnte.keluar);

      harusGagal(
        await cocokkan(b.sesi, "verifikasi_nomor", kode),
        /Belum ada kode OTP/,
      );
      expect((await barisKyc(t, b.userId))?.nomorWhatsAppTerverifikasi).toBeUndefined();

      // Kode pemiliknya sendiri tetap sah.
      expect(await cocokkan(a.sesi, "verifikasi_nomor", kode)).toEqual({ ok: true });
    } finally {
      fonnte.pulihkan();
    }
  });

  it("OTP untuk satu tujuan tidak bisa dipakai di tujuan lain", async () => {
    const t = convexTest(schema, modules);
    const { sesi } = await siapkan(t, { nama: "Penyedia Dana OTP", role: "dana" });
    const fonnte = pasangFonnte({ jenis: "sukses" });
    try {
      await mintaKode(sesi, "transaksi");
      const kode = kodeTerkirim(fonnte.keluar);
      harusGagal(await cocokkan(sesi, "verifikasi_nomor", kode), /Belum ada kode OTP/);
    } finally {
      fonnte.pulihkan();
    }
  });

  it("akun non-penyedia-dana tidak bisa memakai OTP transaksi", async () => {
    const t = convexTest(schema, modules);
    const { sesi } = await siapkan(t, { nama: "Peminjam Transaksi" });
    const asli = globalThis.fetch;
    process.env.FONNTE_TOKEN = TOKEN_UJI;
    try {
      const minta = await mintaKode(sesi, "transaksi");
      expect(minta).toMatchObject({ ok: false, terkirim: false });
      expect(minta.pesan).toMatch(/penyedia dana/i);
    } finally {
      globalThis.fetch = asli;
      delete process.env.FONNTE_TOKEN;
    }
  });

  it("nomor yang berubah membatalkan bukti verifikasi", async () => {
    const t = convexTest(schema, modules);
    const { sesi, userId } = await siapkan(t);
    const fonnte = pasangFonnte({ jenis: "sukses" });
    try {
      // (1) Kode diminta untuk nomor lama, lalu nomornya diganti sebelum kode
      //     dimasukkan → verifikasi ditolak.
      await mintaKode(sesi);
      const kode = kodeTerkirim(fonnte.keluar);
      await t.run(async (ctx) => {
        const row = await ctx.db
          .query("kycProfil")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .first();
        if (row !== null) await ctx.db.patch(row._id, { nomorWhatsApp: NOMOR_LAIN });
      });
      harusGagal(await cocokkan(sesi, "verifikasi_nomor", kode), /berubah/i);

      // (2) Setelah diverifikasi untuk nomor baru, mengganti nomor lagi membuat
      //     bukti lama tidak lagi berlaku.
      await geserTerbaru(t, userId, { dibuatPada: Date.now() - 61_000 });
      await mintaKode(sesi);
      const kodeBaru = kodeTerkirim(fonnte.keluar, 1);
      expect(await cocokkan(sesi, "verifikasi_nomor", kodeBaru)).toEqual({ ok: true });
      expect((await sesi.query(api.kyc.kycSaya, {})).nomorWhatsAppTerbukti).toBe(true);

      await t.run(async (ctx) => {
        const row = await ctx.db
          .query("kycProfil")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .first();
        if (row !== null) await ctx.db.patch(row._id, { nomorWhatsApp: NOMOR });
      });
      const kycSaya = await sesi.query(api.kyc.kycSaya, {});
      expect(kycSaya.nomorWhatsAppTerbukti).toBe(false);
      expect(kycSaya.nomorWhatsAppTerverifikasi?.cocok).toBe(false);
    } finally {
      fonnte.pulihkan();
    }
  });

  it("tanpa nomor tersimpan, OTP tidak bisa diminta", async () => {
    const t = convexTest(schema, modules);
    const { sesi } = await siapkan(t, { nama: "Tanpa Nomor", nomor: null });
    const asli = globalThis.fetch;
    process.env.FONNTE_TOKEN = TOKEN_UJI;
    try {
      const hasil = await mintaKode(sesi);
      expect(hasil).toMatchObject({ ok: false, terkirim: false });
      expect(hasil.pesan).toMatch(/Nomor WhatsApp belum tersimpan/);
    } finally {
      globalThis.fetch = asli;
      delete process.env.FONNTE_TOKEN;
    }
  });

  it("kode tersimpan hanya sebagai hash — bukan plaintext", async () => {
    const t = convexTest(schema, modules);
    const { sesi, userId } = await siapkan(t);
    const fonnte = pasangFonnte({ jenis: "sukses" });
    try {
      await mintaKode(sesi);
      const kode = kodeTerkirim(fonnte.keluar);
      const rows = await tantangan(t, userId);
      expect(rows[0].kodeHash).toMatch(/^[0-9a-f]{64}$/);
      expect(rows[0].salt).toMatch(/^[0-9a-f]{32}$/);
      expect(JSON.stringify(rows[0])).not.toContain(kode);
    } finally {
      fonnte.pulihkan();
    }
  });
});

// ===== OTP lewat gateway yang DIATUR PANEL ADMIN =====

const KUNCI_PANEL = "kunci-panel-uji";

type KeluarGateway = {
  url: string;
  auth: string | null;
  contentType: string | null;
  body: string;
};

/** Ganti `fetch` dengan gateway palsu + isi token panel dari environment. */
function pasangGatewayPanel(respons: string, status = 200) {
  const asli = globalThis.fetch;
  const keluar: KeluarGateway[] = [];
  process.env.WHATSAPP_API_KEY = KUNCI_PANEL;
  globalThis.fetch = (async (
    url: unknown,
    init?: { body?: unknown; headers?: Record<string, string> },
  ) => {
    keluar.push({
      url: String(url),
      auth: init?.headers?.Authorization ?? null,
      contentType: init?.headers?.["Content-Type"] ?? null,
      body: String(init?.body ?? ""),
    });
    return new Response(respons, {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return {
    keluar,
    pulihkan: () => {
      globalThis.fetch = asli;
      delete process.env.WHATSAPP_API_KEY;
    },
  };
}

/** Simpan konfigurasi gateway seperti tombol "Simpan" di panel admin. */
async function setelGateway(
  t: KonteksUji,
  patch: {
    apiUrl: string;
    aktif?: boolean;
    authHeader?: string;
    authPrefix?: string;
    fieldNomor?: string;
    fieldPesan?: string;
  },
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("waSettings", {
      slot: "global",
      apiUrl: patch.apiUrl,
      authHeader: patch.authHeader ?? "Authorization",
      authPrefix: patch.authPrefix ?? "",
      fieldNomor: patch.fieldNomor ?? "target",
      fieldPesan: patch.fieldPesan ?? "message",
      aktif: patch.aktif ?? true,
      templatePengingat: "{nama} {jumlah}",
      diperbaruiPada: Date.now(),
    });
  });
}

describe("OTP WhatsApp lewat gateway panel admin", () => {
  it("memakai endpoint, nama field, dan token panel — bukan jalur Fonnte langsung", async () => {
    const t = convexTest(schema, modules);
    const { sesi } = await siapkan(t);
    await setelGateway(t, {
      apiUrl: "https://wa.example.com/kirim",
      fieldNomor: "phone",
      fieldPesan: "text",
    });
    // FONNTE_TOKEN sengaja TIDAK diisi: kalau jalur lama yang terpakai, kirim
    // akan gagal. Keberhasilan di sini membuktikan gateway panel yang dipakai.
    delete process.env.FONNTE_TOKEN;
    const gateway = pasangGatewayPanel(JSON.stringify({ success: true }));
    try {
      const minta = await mintaKode(sesi);
      expect(minta).toMatchObject({ ok: true, terkirim: true });
      expect(gateway.keluar).toHaveLength(1);
      const kirim = gateway.keluar[0];
      expect(kirim.url).toBe("https://wa.example.com/kirim");
      expect(kirim.auth).toBe(KUNCI_PANEL);
      expect(kirim.contentType).toBe("application/json");
      const body = JSON.parse(kirim.body) as Record<string, string>;
      expect(body.phone).toBe(NOMOR);
      const kode = body.text.match(/\d{6}/)?.[0] ?? "";
      expect(kode).toHaveLength(6);

      // Kode yang berangkat lewat gateway panel tetap bisa diverifikasi.
      expect(await cocokkan(sesi, "verifikasi_nomor", kode)).toEqual({ ok: true });
    } finally {
      gateway.pulihkan();
    }
  });

  it("endpoint Fonnte di panel tetap form-urlencoded, token dibaca dari WHATSAPP_API_KEY", async () => {
    const t = convexTest(schema, modules);
    const { sesi } = await siapkan(t);
    await setelGateway(t, { apiUrl: "https://api.fonnte.com/send" });
    delete process.env.FONNTE_TOKEN;
    const gateway = pasangGatewayPanel(JSON.stringify({ status: true, detail: "success" }));
    try {
      const minta = await mintaKode(sesi);
      expect(minta).toMatchObject({ ok: true, terkirim: true });
      const kirim = gateway.keluar[0];
      expect(kirim.auth).toBe(KUNCI_PANEL);
      expect(kirim.contentType).toBe("application/x-www-form-urlencoded");
      const body = new URLSearchParams(kirim.body);
      expect(body.get("target")).toBe(NOMOR);
      expect(body.get("message")).toMatch(/\d{6}/);
    } finally {
      gateway.pulihkan();
    }
  });

  it("balasan Fonnte status:false dari gateway panel dianggap gagal", async () => {
    const t = convexTest(schema, modules);
    const { sesi, userId } = await siapkan(t);
    await setelGateway(t, { apiUrl: "https://api.fonnte.com/send" });
    const gateway = pasangGatewayPanel(JSON.stringify({ status: false, reason: "token invalid" }));
    try {
      const hasil = await mintaKode(sesi);
      expect(hasil).toMatchObject({ ok: false, terkirim: false });
      expect(hasil.pesan).toMatch(/WHATSAPP_API_KEY/);
      const rows = await tantangan(t, userId);
      expect(rows[0].statusPengiriman).toBe("gagal");
    } finally {
      gateway.pulihkan();
    }
  });

  it("gateway panel nonaktif: tidak mengirim dan tidak menyentuh jaringan", async () => {
    const t = convexTest(schema, modules);
    const { sesi } = await siapkan(t);
    await setelGateway(t, { apiUrl: "https://wa.example.com/kirim", aktif: false });
    const gateway = pasangGatewayPanel(JSON.stringify({ success: true }));
    try {
      const hasil = await mintaKode(sesi);
      expect(hasil).toMatchObject({ ok: false, terkirim: false });
      expect(hasil.pesan).toMatch(/panel admin/i);
      expect(gateway.keluar).toHaveLength(0);
    } finally {
      gateway.pulihkan();
    }
  });

  it("gateway panel aktif tanpa token: pesannya menunjuk WHATSAPP_API_KEY", async () => {
    const t = convexTest(schema, modules);
    const { sesi } = await siapkan(t);
    await setelGateway(t, { apiUrl: "https://wa.example.com/kirim" });
    delete process.env.FONNTE_TOKEN;
    delete process.env.WHATSAPP_API_KEY;
    try {
      const hasil = await mintaKode(sesi);
      expect(hasil).toMatchObject({ ok: false, terkirim: false });
      expect(hasil.pesan).toMatch(/WHATSAPP_API_KEY/);
    } finally {
      delete process.env.WHATSAPP_API_KEY;
    }
  });
});
