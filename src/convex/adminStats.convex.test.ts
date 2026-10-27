/**
 * Tes agregasi ringkasan admin (`admin.adminStats`).
 *
 * - Gadai & kredit: menjaga angka "sedang berjalan" yang dipakai kartu utama
 *   panel admin (tab Pinjaman / Gadai / Kredit).
 * - Pinjaman: menjaga dua aggregat yang dipakai lintas layar admin:
 *   `pinjamanBaru` (jumlah menunggu) dan `totalPinjamanDiajukan` (nominal atas
 *   pengajuan yang menunggu), serta konfirmasi bahwa keduanya berintegrasi
 *   dengan lencana sub-tab admin (`lib/admin-queue.ts`).
 *
 * Menjalankan: bunx vitest run src/convex/adminStats.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import { siapkanPengguna } from "./test.helpers";
import { modules } from "./test.setup";
import { hitungMenunggu } from "../lib/admin-queue";
import { diTahapTinjauan } from "../lib/statusPinjaman";
import { quoteKreditBarang } from "../lib/kredit";
import { DEFAULT_CONFIG } from "../lib/system-config";

const NIK = "3201234567890003";
const REKENING = "1234567890";
const WA = "628123456791";

describe("ringkasan admin: total sedang berjalan", () => {
  it("menjumlahkan sisa pokok gadai aktif dan pokok dibiayai kredit berjalan", async () => {
    const t = convexTest(schema, modules);
    const { sesi: asAdmin } = await siapkanPengguna(t, "admin-stats", {
      email: "admin-stats@pindai.test",
      role: "admin",
    });
    const { userId } = await siapkanPengguna(t, "peminjam-stats", {
      email: "peminjam-stats@pindai.test",
      role: "peminjam",
    });

    await t.run(async (ctx) => {
      // Gadai AKTIF: sisa pokok menurun (2 jt) — yang dihitung.
      await ctx.db.insert("pawns", {
        userId,
        deskripsiBarang: "Kalung emas 10 gram",
        kategori: "Emas",
        alamatPenilaian: "Jl. Contoh No. 1",
        namaLengkap: "Rani Peminjam",
        nomorRekening: REKENING,
        status: "aktif",
        nomorReferensi: "PGD-STATS-1",
        pokokGadai: 2_500_000,
        sisaPokok: 2_000_000,
      });
      // Gadai sudah lepas — diabaikan.
      await ctx.db.insert("pawns", {
        userId,
        deskripsiBarang: "Motor",
        kategori: "Kendaraan",
        alamatPenilaian: "Jl. Contoh No. 2",
        namaLengkap: "Rani Peminjam",
        nomorRekening: REKENING,
        status: "lunas_dilepas",
        nomorReferensi: "PGD-STATS-2",
        pokokGadai: 9_000_000,
        sisaPokok: 0,
      });
      // Kredit BERJALAN: 6 jt − DP 20% = 4,8 jt dibiayai.
      await ctx.db.insert("kreditBarang", {
        userId,
        nomorReferensi: "PJD-STATS-1",
        namaBarang: "Kulkas dua pintu",
        kategori: "Elektronik",
        merchant: "Tokopedia",
        hargaBarang: 6_000_000,
        dpPersen: 20,
        tenorBulan: 6,
        marginPersenPerBulan: 3,
        status: "didanai",
        namaLengkap: "Rani Peminjam",
        nik: NIK,
        nomorRekening: REKENING,
        nomorWhatsApp: WA,
      });
      // Kredit masih diajukan — diabaikan.
      await ctx.db.insert("kreditBarang", {
        userId,
        nomorReferensi: "PJD-STATS-2",
        namaBarang: "Televisi",
        kategori: "Elektronik",
        merchant: "Shopee",
        hargaBarang: 3_000_000,
        dpPersen: 20,
        tenorBulan: 3,
        marginPersenPerBulan: 3,
        status: "diajukan",
        namaLengkap: "Rani Peminjam",
        nik: NIK,
        nomorRekening: REKENING,
        nomorWhatsApp: WA,
      });
    });

    const stats = await asAdmin.query(api.admin.adminStats, {});

    expect(stats.totalGadaiBerjalan).toBe(2_000_000);

    // Nilai kredit dihitung dari helper yang sama dengan produksi agar tidak
    // ada dua sumber kebenaran untuk pokok dibiayai.
    const dibiayai = quoteKreditBarang({
      hargaBarang: 6_000_000,
      dpPersen: 20,
      tenorBulan: 6,
      marginPersenPerBulan: 3,
    }).pokokDibiayai;
    expect(stats.totalKreditBerjalan).toBe(dibiayai);
  });
});

describe("ringkasan admin: agregat pinjaman menunggu", () => {
  // Pinjaman baru umumnya masuk ke antrean review TANPA melalui admin
  // (nasabah pengusul langsung tulis `sedang_direview`). Dalam fixture ini kita
  // menulis kedua ejaan sehingga asersi menegaskan bahwa keduanya terhitung.
  it("jumlah dan nominal pengajuan menunggu mencakup diajukan dan sedang_direview", async () => {
    const t = convexTest(schema, modules);
    const { sesi: asAdmin } = await siapkanPengguna(t, "admin-stats-menunggu", {
      email: "admin-stats-menunggu@pindai.test",
      role: "admin",
    });
    const { userId: peminjam1 } = await siapkanPengguna(t, "peminjam1-stats", {
      email: "p1@pindai.test",
      role: "peminjam",
    });
    const { userId: peminjam2 } = await siapkanPengguna(t, "peminjam2-stats", {
      email: "p2@pindai.test",
      role: "peminjam",
    });

    await t.run(async (ctx) => {
      // Baris 1: ejaan warisan (masih sah dibaca).
      await ctx.db.insert("loans", {
        userId: peminjam1,
        pokokPinjaman: 5_000_000,
        pokokDiajukan: 5_000_000,
        nomorReferensi: "PGL-MENUNGGU-1",
        tujuan: "modal_usaha",
        status: "diajukan",
        namaLengkap: "Rani Peminjam",
        nomorRekening: REKENING,
        nik: NIK,
        nomorWhatsApp: WA,
        sumberPenghasilan: "gaji",
        tenorHari: 30,
      });
      // Baris 2: ejaan yang ditulis aplikasi saat status bergerak ke tinjauan.
      await ctx.db.insert("loans", {
        userId: peminjam2,
        pokokPinjaman: 10_000_000,
        pokokDiajukan: 10_000_000,
        nomorReferensi: "PGL-MENUNGGU-2",
        tujuan: "kebutuhan_pribadi",
        status: "sedang_direview",
        namaLengkap: "Bayu Peminjam",
        nomorRekening: REKENING,
        nik: "3202345678901007",
        nomorWhatsApp: "6282345678901",
        sumberPenghasilan: "usaha",
        tenorHari: 30,
      });
    });

    const stats = await asAdmin.query(api.admin.adminStats, {});

    // Administrasi: kedua baris ini masuk antrean review; yang sudah disetujui
    // atau didanai tidak masuk.
    expect(stats.pinjamanBaru).toBe(2);
    expect(diTahapTinjauan("diajukan")).toBe(true);
    expect(diTahapTinjauan("sedang_direview")).toBe(true);
    expect(diTahapTinjauan("didanai")).toBe(false);

    // Unit test independen: fungsi pembilang lencana admin seharusnya memakai
    // aturan yang sama dengan kardinal dan nominal di atas.
    const semuaBaris = [
      { status: "diajukan" },
      { status: "sedang_direview" },
      { status: "didanai" },
    ] as const;
    expect(hitungMenunggu(semuaBaris, "pinjaman")).toBe(2);
  });

  it("totalPinjamanDiajukan menggunakan pokokDiajukan bila ada", async () => {
    const t = convexTest(schema, modules);
    const { sesi: asAdmin } = await siapkanPengguna(t, "admin-stats-diajukan", {
      email: "admin-stats-diajukan@pindai.test",
      role: "admin",
    });
    const { userId } = await siapkanPengguna(t, "peminjam-stats-diajukan", {
      email: "p@pindai.test",
      role: "peminjam",
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("loans", {
        userId,
        pokokPinjaman: 4_000_000,
        pokokDiajukan: 7_000_000,
        nomorReferensi: "PGL-DIAJUKD-1",
        tujuan: "modal_usaha",
        status: "sedang_direview",
        namaLengkap: "Rani Peminjam",
        nomorRekening: REKENING,
        nik: NIK,
        nomorWhatsApp: WA,
        sumberPenghasilan: "gaji",
        tenorHari: 30,
      });
    });

    const stats = await asAdmin.query(api.admin.adminStats, {});
    expect(stats.totalPinjamanDiajukan).toBe(7_000_000);
    expect(stats.pinjamanBaru).toBe(1);
  });
});

describe("ringkasan admin: jarak lokasi dari brankas", () => {
  /**
   * `gpsMismatch` dibaca dari titik TERAKHIR di `lokasiStatus`, bukan dari
   * riwayat `lokasiJejak` per pinjaman. Fixture ini sengaja membuat riwayat
   * yang BERLAWANAN dengan status, jadi kedua sumber memberi angka berbeda:
   *
   *   - A: status jauh (±111 km), riwayat dekat  → status: dihitung.
   *   - B: status dekat (±1 km), riwayat jauh     → status: tidak dihitung.
   *   - C: status jauh, tanpa riwayat sama sekali  → status: dihitung.
   *
   * Sumber status = 2. Kalau query kembali membaca riwayat, hasilnya 1 (hanya
   * B) — dan kalau ia membaca riwayat lalu jatuh ke "tanpa titik", hasilnya 0.
   * Angka 2 inilah yang membedakan ketiganya.
   */
  it("menghitung dari lokasiStatus terakhir, bukan dari riwayat jejak", async () => {
    const t = convexTest(schema, modules);
    const { sesi: asAdmin } = await siapkanPengguna(t, "admin-gps", {
      email: "admin-gps@pindai.test",
      role: "admin",
    });
    const { userId: userA } = await siapkanPengguna(t, "peminjam-gps-a", {
      email: "gps-a@pindai.test",
      role: "peminjam",
    });
    const { userId: userB } = await siapkanPengguna(t, "peminjam-gps-b", {
      email: "gps-b@pindai.test",
      role: "peminjam",
    });
    const { userId: userC } = await siapkanPengguna(t, "peminjam-gps-c", {
      email: "gps-c@pindai.test",
      role: "peminjam",
    });

    // Koordinat relatif terhadap brankas dari konfigurasi bawaan, supaya tes
    // tidak bergantung pada koordinat gudang yang sebenarnya.
    const dekat = { lat: DEFAULT_CONFIG.vaultLat + 0.01, lng: DEFAULT_CONFIG.vaultLng };
    const jauh = { lat: DEFAULT_CONFIG.vaultLat + 1, lng: DEFAULT_CONFIG.vaultLng };

    await t.run(async (ctx) => {
      const now = Date.now();
      for (const [userId, nomorReferensi] of [
        [userA, "PGL-GPS-A"],
        [userB, "PGL-GPS-B"],
        [userC, "PGL-GPS-C"],
      ] as const) {
        await ctx.db.insert("loans", {
          userId,
          pokokPinjaman: 1_000_000,
          nomorReferensi,
          tujuan: "modal_usaha",
          status: "didanai",
          namaLengkap: "Peminjam GPS",
          nomorRekening: REKENING,
          tenorHari: 30,
          didanaiPada: now,
        });
      }

      await ctx.db.insert("lokasiStatus", {
        userId: userA,
        ...jauh,
        akurasi: 8,
        waktu: now,
        sumber: "web",
      });
      await ctx.db.insert("lokasiStatus", {
        userId: userB,
        ...dekat,
        akurasi: 8,
        waktu: now,
        sumber: "web",
      });
      await ctx.db.insert("lokasiStatus", {
        userId: userC,
        ...jauh,
        akurasi: 8,
        waktu: now,
        sumber: "web",
      });

      // Riwayat yang berlawanan dengan status.
      await ctx.db.insert("lokasiJejak", {
        userId: userA,
        ...dekat,
        akurasi: 8,
        waktu: now,
      });
      await ctx.db.insert("lokasiJejak", {
        userId: userB,
        ...jauh,
        akurasi: 8,
        waktu: now,
      });
    });

    const stats = await asAdmin.query(api.admin.adminStats, {});
    expect(stats.gpsMismatch).toBe(2);
  });
});
