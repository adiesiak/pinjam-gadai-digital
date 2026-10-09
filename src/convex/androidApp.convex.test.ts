/**
 * Tes pengaturan aplikasi Android — server.
 *
 * Aturan yang dijaga:
 *  - bukan admin (tanpa sesi TOTP terverifikasi) tidak bisa membaca baris mentah
 *    maupun menyimpan/mengembalikan pengaturan;
 *  - sebelum admin menyimpan, aplikasi sudah menerima JSON bawaan yang lengkap
 *    (nama, warna, dan id aset bawaan untuk tiap slot);
 *  - simpan menormalkan nama/warna, menaikkan `versi`, dan tercatat di Audit Trail;
 *  - slot yang dikosongkan (`null`) kembali ke berkas bawaan;
 *  - reset menghapus baris + tercatat di audit;
 *  - endpoint publik `GET /api/aplikasi-android` mengembalikan JSON yang sama
 *    dengan query `androidApp.asetAktif`, lengkap dengan header CORS.
 *
 * Menjalankan: bunx vitest run src/convex/androidApp.convex.test.ts
 *
 * Catatan: convexTest belum mendukung syscall `storage.getMetadata`, jadi tes ini
 * tidak menguji pemasangan BERKAS (unggahan) — aturan validasi berkasnya diuji
 * sebagai fungsi murni di `src/lib/asetAndroidApp.test.ts`, dan penolakan berkas
 * dari storage terjadi di jalur yang sama.
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import { siapkanPengguna } from "./test.helpers";
import { modules } from "./test.setup";

type T = ReturnType<typeof convexTest>;

/** Baris audit terakhir untuk satu aksi (label aktor ikut dikembalikan). */
async function auditTerakhir(t: T, aksi: string) {
  const baris = await t.run((ctx) => ctx.db.query("auditLog").collect());
  const cocok = baris.filter((b) => b.aksi === aksi);
  return cocok.length === 0 ? undefined : cocok[cocok.length - 1];
}

/** Row pengaturan aplikasi (mentah) dari basis data. */
async function barisPengaturan(t: T) {
  const rows = await t.run((ctx) => ctx.db.query("androidAppConfig").collect());
  return rows.length === 0 ? null : rows[rows.length - 1];
}

describe("pengaturan aplikasi Android", () => {
  it("sebelum diatur, aplikasi menerima JSON bawaan yang lengkap", async () => {
    const t = convexTest(schema, modules);

    const aktif = await t.query(api.androidApp.asetAktif, {});

    expect(aktif.aplikasi).toBe("PINDAI");
    expect(aktif.diubahAdmin).toBe(false);
    expect(aktif.versi).toBe(0);
    expect(aktif.warna.latarSplash).toBe("#0A2624");
    expect(aktif.warna.teksSplash).toBe("#FBF8F1");
    for (const kunci of ["ikon", "ikonSplash", "splash"] as const) {
      expect(aktif.aset[kunci].jenis).toBe("bawaan");
      expect(aktif.aset[kunci].url).toBeNull();
      // Aplikasi harus tahu berkas bawaan mana yang dipakai dari APK-nya.
      expect(aktif.aset[kunci].asetBawaanId.length).toBeGreaterThan(0);
    }
    expect(aktif.berlaku.butuhApkBaru.join(" ").toLowerCase()).toContain("launcher");
  });

  it("bukan admin tidak bisa menyimpan, membaca baris mentah, atau reset", async () => {
    const t = convexTest(schema, modules);
    const { sesi: peminjam } = await siapkanPengguna(t, "Rani", {
      email: "rani-app@pindai.test",
      role: "peminjam",
    });

    await expect(
      peminjam.mutation(api.androidApp.simpan, { namaAplikasi: "PINDAI X" }),
    ).rejects.toThrow();
    await expect(peminjam.mutation(api.androidApp.reset, {})).rejects.toThrow();
    await expect(peminjam.mutation(api.androidApp.generateUploadUrl, {})).rejects.toThrow();
    // Query baris mentah: bukan admin = null (bukan halaman galat).
    await expect(peminjam.query(api.androidApp.getConfigRow, {})).resolves.toBeNull();
    expect(await barisPengaturan(t)).toBeNull();
  });

  it("admin menyimpan nama & warna → aplikasi melihatnya, versi naik, tercatat di audit", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin-app@pindai.test",
      role: "admin",
    });

    await admin.mutation(api.androidApp.simpan, {
      namaAplikasi: "  pindai app ",
      warnaSplash: "#0f3d3a",
      warnaTeksSplash: "#ffd166",
    });

    const aktif = await t.query(api.androidApp.asetAktif, {});
    expect(aktif.aplikasi).toBe("PINDAI APP");
    expect(aktif.diubahAdmin).toBe(true);
    expect(aktif.warna.latarSplash).toBe("#0F3D3A");
    expect(aktif.warna.teksSplash).toBe("#FFD166");
    expect(aktif.diperbaruiOleh).toBe("admin-app@pindai.test");
    expect(aktif.versi).toBeGreaterThan(0);

    // Baris mentah hanya untuk admin terverifikasi.
    const baris = await admin.query(api.androidApp.getConfigRow, {});
    expect(baris?.namaAplikasi).toBe("PINDAI APP");
    expect(baris?.slot).toBe("global");

    const audit = await auditTerakhir(t, "ubah_aplikasi_android");
    expect(audit?.aktorLabel).toBe("admin-app@pindai.test");
    expect(audit?.detail).toContain("nama/warna");
  });

  it("warna tidak sah jatuh ke bawaan, bukan menyimpan nilai rusak", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin-warna@pindai.test",
      role: "admin",
    });

    await admin.mutation(api.androidApp.simpan, { warnaSplash: "biru", warnaTeksSplash: "#12" });

    const aktif = await t.query(api.androidApp.asetAktif, {});
    expect(aktif.warna.latarSplash).toBe("#0A2624");
    expect(aktif.warna.teksSplash).toBe("#FBF8F1");
  });

  it("menyimpan tanpa perubahan ditolak", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin-kosong@pindai.test",
      role: "admin",
    });

    await expect(admin.mutation(api.androidApp.simpan, {})).rejects.toThrow(/Tidak ada perubahan/);
    expect(await barisPengaturan(t)).toBeNull();
  });

  it("slot dikosongkan (null) → aplikasi kembali memakai berkas bawaan", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin-kosong-slot@pindai.test",
      role: "admin",
    });

    await admin.mutation(api.androidApp.simpan, { ikonId: null, splashId: null });

    const baris = await barisPengaturan(t);
    expect(baris?.ikonId).toBeNull();
    expect(baris?.splashId).toBeNull();

    const aktif = await t.query(api.androidApp.asetAktif, {});
    expect(aktif.aset.ikon.jenis).toBe("bawaan");
    expect(aktif.aset.splash.jenis).toBe("bawaan");
    expect(aktif.aset.ikonSplash.jenis).toBe("bawaan");
  });

  it("reset menghapus pengaturan & tercatat di audit", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin-reset@pindai.test",
      role: "admin",
    });

    await admin.mutation(api.androidApp.simpan, { namaAplikasi: "PINDAI APP" });
    expect(await barisPengaturan(t)).not.toBeNull();

    const hasil = await admin.mutation(api.androidApp.reset, {});
    expect(hasil.ok).toBe(true);
    expect(hasil.dihapus).toBe(0); // tidak ada berkas unggahan di tes ini
    expect(await barisPengaturan(t)).toBeNull();

    const aktif = await t.query(api.androidApp.asetAktif, {});
    expect(aktif.aplikasi).toBe("PINDAI");
    expect(aktif.diubahAdmin).toBe(false);

    const audit = await auditTerakhir(t, "reset_aplikasi_android");
    expect(audit?.detail).toContain("bawaan");

    // Reset saat sudah bawaan tetap aman (idempoten).
    await expect(admin.mutation(api.androidApp.reset, {})).resolves.toMatchObject({ dihapus: 0 });
  });

  it("endpoint publik GET /api/aplikasi-android mengembalikan JSON yang sama", async () => {
    const t = convexTest(schema, modules);
    const { sesi: admin } = await siapkanPengguna(t, "admin", {
      email: "admin-endpoint@pindai.test",
      role: "admin",
    });
    await admin.mutation(api.androidApp.simpan, { namaAplikasi: "PINDAI APP" });

    const res = await t.fetch("/api/aplikasi-android", { method: "GET" });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Cache-Control")).toBe("no-store");

    const isi = (await res.json()) as { aplikasi: string; versi: number };
    const query = await t.query(api.androidApp.asetAktif, {});
    expect(isi.aplikasi).toBe("PINDAI APP");
    expect(isi.aplikasi).toBe(query.aplikasi);
    expect(isi.versi).toBe(query.versi);

    // Preflight CORS untuk klien native/WebView.
    const preflight = await t.fetch("/api/aplikasi-android", { method: "OPTIONS" });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Methods")).toContain("GET");
  });

  it("endpoint publik tetap melayani saat pengaturan masih bawaan", async () => {
    const t = convexTest(schema, modules);
    const res = await t.fetch("/api/aplikasi-android", { method: "GET" });
    expect(res.status).toBe(200);
    const isi = (await res.json()) as { aplikasi: string; aset: Record<string, { jenis: string }> };
    expect(isi.aplikasi).toBe("PINDAI");
    expect(isi.aset.splash?.jenis).toBe("bawaan");
  });
});
