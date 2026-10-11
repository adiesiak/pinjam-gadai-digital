/**
 * Uji helpdesk pengaduan: prioritas + utas percakapan (`convex/penagihan.ts`).
 *
 * Yang dibuktikan:
 *  - pengaduan baru mendapat PRIORITAS bawaan dari kategorinya dan uraiannya
 *    menjadi pesan PERTAMA utas (tidak ada percakapan yang hilang);
 *  - daftar pengaduan diurutkan prioritas, bukan hanya waktu;
 *  - menaikkan ke Kritis wajib beralasan; status tidak berubah oleh pesan;
 *  - utas append-only: pesan hanya ditambah, pengaduan yang sudah ditutup
 *    tidak bisa dibalas tanpa dibuka kembali;
 *  - akun non-admin ditolak.
 *
 * Menjalankan: bunx vitest run src/convex/helpdesk.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import { siapkanPengguna, type KonteksUji } from "./test.helpers";
import { modules } from "./test.setup";

const buatKontek = () => convexTest(schema, modules);

/** Catat satu pengaduan sebagai admin; kembalikan id-nya. */
async function buatPengaduan(
  t: KonteksUji,
  sesi: { mutation: unknown },
  kategori: string,
  isi = "Nominal tagihan tidak sesuai dengan yang saya bayar kemarin.",
) {
  return await (
    sesi as {
      mutation: (
        fn: unknown,
        args: Record<string, unknown>,
      ) => Promise<{ ok: boolean; pengaduanId: string }>;
    }
  ).mutation(api.penagihan.bukaPengaduan, { kanal: "whatsapp", kategori, isi });
}

describe("helpdesk: prioritas & utas pengaduan", () => {
  it("pengaduan baru memakai prioritas bawaan kategori + membuat pesan pertama", async () => {
    const t = buatKontek();
    const { sesi: asAdmin } = await siapkanPengguna(t, "admin-helpdesk", {
      email: "admin-helpdesk@pindai.test",
      role: "admin",
    });

    // Kategori keluhan penagihan → prioritas Tinggi (bawaan).
    const { pengaduanId } = await buatPengaduan(t, asAdmin, "salah_tagih");
    // Kategori umum → Normal (bawaan).
    await buatPengaduan(t, asAdmin, "permintaan_penjelasan");

    const daftar = await asAdmin.query(api.penagihan.daftarPengaduan, {});
    const tinggi = daftar.find((p) => p.kategori === "salah_tagih");
    const normal = daftar.find((p) => p.kategori === "permintaan_penjelasan");
    expect(tinggi?.prioritas).toBe("tinggi");
    expect(tinggi?.prioritasLabel).toBe("Tinggi");
    expect(normal?.prioritas).toBe("normal");
    // Urutan: prioritas lebih tinggi lebih dulu, meski dibuat lebih dulu.
    expect(daftar[0].kategori).toBe("salah_tagih");

    // Uraian awal tersimpan sebagai pesan pertama dengan arah nasabah.
    const utas = await asAdmin.query(api.penagihan.pesanPengaduan, {
      pengaduanId: pengaduanId as never,
    });
    expect(utas).toHaveLength(1);
    expect(utas[0].arah).toBe("nasabah");
    expect(utas[0].isi).toContain("Nominal tagihan");

    // Ringkasan utas ikut terkirim ke daftar (jumlah + pesan terakhir).
    expect(tinggi?.jumlahPesan).toBe(1);
    expect(tinggi?.pesanTerakhirArah).toBe("nasabah");
  });

  it("menaikkan ke Kritis wajib beralasan dan tercatat audit; pesan menandai petugas", async () => {
    const t = buatKontek();
    const { sesi: asAdmin } = await siapkanPengguna(t, "admin-helpdesk2", {
      email: "admin-helpdesk2@pindai.test",
      role: "admin",
    });
    const { pengaduanId } = await buatPengaduan(t, asAdmin, "permintaan_penjelasan");

    await expect(
      asAdmin.mutation(api.penagihan.ubahPrioritasPengaduan, {
        pengaduanId: pengaduanId as never,
        prioritas: "kritis",
      }),
    ).rejects.toThrow(/Kritis/i);

    // Menaikkan ke Tinggi tanpa catatan tetap boleh.
    await asAdmin.mutation(api.penagihan.ubahPrioritasPengaduan, {
      pengaduanId: pengaduanId as never,
      prioritas: "tinggi",
    });
    await asAdmin.mutation(api.penagihan.ubahPrioritasPengaduan, {
      pengaduanId: pengaduanId as never,
      prioritas: "kritis",
      catatan: "Nasabah mengancam menyebarkan data — perlu penanganan segera.",
    });

    const daftar = await asAdmin.query(api.penagihan.daftarPengaduan, {});
    expect(daftar[0].prioritas).toBe("kritis");
    expect(daftar[0].prioritasLabel).toBe("Kritis");

    // Balasan petugas masuk ke utas dan menandai penanggung jawab.
    await asAdmin.mutation(api.penagihan.tambahPesanPengaduan, {
      pengaduanId: pengaduanId as never,
      isi: "Kami sedang mencocokkan bukti transfer Anda dengan catatan sistem.",
    });
    const utas = await asAdmin.query(api.penagihan.pesanPengaduan, {
      pengaduanId: pengaduanId as never,
    });
    expect(utas).toHaveLength(2);
    expect(utas[1].arah).toBe("petugas");
    expect(utas[1].penulisLabel).toBe("admin-helpdesk2@pindai.test");

    const rows = await t.run((ctx) => ctx.db.query("pengaduanNasabah").collect());
    expect(rows[0].petugasLabel).toBe("admin-helpdesk2@pindai.test");
    // Pesan TIDAK mengubah status pengaduan.
    expect(rows[0].status).toBe("baru");

    const auditRows = await t.run((ctx) => ctx.db.query("auditLog").collect());
    const aksi = auditRows.map((a) => a.aksi);
    expect(aksi).toContain("ubah_prioritas_pengaduan");
    expect(aksi).toContain("pesan_pengaduan");
  });

  it("menolak pesan kosong dan balasan pada pengaduan yang sudah ditutup", async () => {
    const t = buatKontek();
    const { sesi: asAdmin } = await siapkanPengguna(t, "admin-helpdesk3", {
      email: "admin-helpdesk3@pindai.test",
      role: "admin",
    });
    const { pengaduanId } = await buatPengaduan(t, asAdmin, "permintaan_penjelasan");

    await expect(
      asAdmin.mutation(api.penagihan.tambahPesanPengaduan, {
        pengaduanId: pengaduanId as never,
        isi: " ",
      }),
    ).rejects.toThrow(/kosong/i);

    // Tutup pengaduan (baru → ditinjau → selesai), keduanya butuh alasan.
    await asAdmin.mutation(api.penagihan.tanganiPengaduan, {
      pengaduanId: pengaduanId as never,
      status: "ditinjau",
    });
    await asAdmin.mutation(api.penagihan.tanganiPengaduan, {
      pengaduanId: pengaduanId as never,
      status: "selesai",
      penyelesaian: "Selisih tagihan dikoreksi dan nasabah sudah diberi tahu.",
    });

    await expect(
      asAdmin.mutation(api.penagihan.tambahPesanPengaduan, {
        pengaduanId: pengaduanId as never,
        isi: "Kami balas lagi setelah pengaduan ditutup.",
      }),
    ).rejects.toThrow(/ditutup/i);

    // Utas tidak bertambah setelah penolakan.
    const utas = await asAdmin.query(api.penagihan.pesanPengaduan, {
      pengaduanId: pengaduanId as never,
    });
    expect(utas).toHaveLength(1);
  });

  it("menolak akun non-admin pada daftar, prioritas, dan pesan", async () => {
    const t = buatKontek();
    const { sesi: asAdmin } = await siapkanPengguna(t, "admin-helpdesk4", {
      email: "admin-helpdesk4@pindai.test",
      role: "admin",
    });
    const { sesi: asPeminjam } = await siapkanPengguna(t, "peminjam-helpdesk4", {
      email: "peminjam-helpdesk4@pindai.test",
      role: "peminjam",
    });
    const { pengaduanId } = await buatPengaduan(t, asAdmin, "permintaan_penjelasan");

    await expect(asPeminjam.query(api.penagihan.daftarPengaduan, {})).rejects.toThrow(
      /Super Admin/i,
    );
    await expect(
      asPeminjam.mutation(api.penagihan.ubahPrioritasPengaduan, {
        pengaduanId: pengaduanId as never,
        prioritas: "kritis",
      }),
    ).rejects.toThrow(/Super Admin/i);
    await expect(
      asPeminjam.mutation(api.penagihan.tambahPesanPengaduan, {
        pengaduanId: pengaduanId as never,
        isi: "Saya nasabah, saya ingin menambah pesan.",
      }),
    ).rejects.toThrow(/Super Admin/i);
  });
});
