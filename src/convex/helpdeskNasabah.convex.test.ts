/**
 * Uji helpdesk sisi NASABAH (`convex/penagihan.ts` + `convex/notifikasi.ts`).
 *
 * Yang dibuktikan:
 *  - nasabah dapat membuka pengaduan dari aplikasi; KANAL ditetapkan server
 *    ("aplikasi") sehingga laporan kanal tidak dapat dikarang klien;
 *  - pengaduan hanya boleh menempel pada pinjaman MILIK pemanggil;
 *  - nasabah hanya membaca pengaduannya sendiri (pengaduan orang lain → tidak
 *    ditemukan, tanpa membocorkan keberadaannya);
 *  - balasan PETUGAS menjadi notifikasi bagi nasabah (dengan tautan ke tab
 *    bantuan) dan dapat ditandai dibaca; pesan nasabah sendiri TIDAK menjadi
 *    notifikasi untuk dirinya;
 *  - pengaduan yang sudah ditutup tidak bisa dibalas nasabah;
 *  - akun tamu ditolak.
 *
 * Menjalankan: bunx vitest run src/convex/helpdeskNasabah.convex.test.ts
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import {
  buatPengguna,
  siapkanPengguna,
  type KonteksUji,
  type PenggunaUji,
} from "./test.helpers";
import { modules } from "./test.setup";

const buatKontek = () => convexTest(schema, modules);
const ISI = "Nominal tagihan yang muncul berbeda dari yang saya bayar kemarin.";

/** Satu pinjaman milik `userId` supaya pengaduan bisa menempel padanya. */
async function pinjamanMilik(t: KonteksUji, userId: PenggunaUji["userId"], nomor: string) {
  return await t.run((ctx) =>
    ctx.db.insert("loans", {
      userId,
      pokokPinjaman: 1_000_000,
      tujuan: "Modal usaha",
      namaLengkap: "RANI PEMINJAM",
      namaBank: "BCA",
      nomorRekening: "1234567890",
      nomorWhatsApp: "628123456789",
      status: "didanai",
      nomorReferensi: nomor,
      tenorHari: 30,
      didanaiPada: Date.now(),
    }),
  );
}

describe("helpdesk sisi nasabah", () => {
  it("membuka pengaduan dari aplikasi: kanal dari server, prioritas dari kategori, utas terisi", async () => {
    const t = buatKontek();
    const nasabah = await siapkanPengguna(t, "nasabah-hd", {
      email: "nasabah-hd@pindai.test",
      role: "peminjam",
    });

    const hasil = await nasabah.sesi.mutation(api.penagihan.bukaPengaduanSaya, {
      kategori: "salah_nominal",
      isi: ISI,
    });
    expect(hasil.ok).toBe(true);

    const daftar = await nasabah.sesi.query(api.penagihan.pengaduanSaya, {});
    expect(daftar).toHaveLength(1);
    expect(daftar[0].kanal).toBe("aplikasi");
    expect(daftar[0].prioritas).toBe("tinggi");
    expect(daftar[0].status).toBe("baru");
    expect(daftar[0].bolehBalas).toBe(true);
    expect(daftar[0].jumlahPesan).toBe(1);
    expect(daftar[0].pesanTerakhirArah).toBe("nasabah");

    const utas = await nasabah.sesi.query(api.penagihan.pesanPengaduanSaya, {
      pengaduanId: daftar[0]._id,
    });
    expect(utas).toHaveLength(1);
    expect(utas[0].arah).toBe("nasabah");
    expect(utas[0].isi).toBe(ISI);
  });

  it("menolak menempelkan pinjaman milik orang lain dan kategori tak dikenal", async () => {
    const t = buatKontek();
    const nasabah = await siapkanPengguna(t, "nasabah-hd2", {
      email: "nasabah-hd2@pindai.test",
      role: "peminjam",
    });
    const orangLain = await siapkanPengguna(t, "nasabah-hd2b", {
      email: "nasabah-hd2b@pindai.test",
      role: "peminjam",
    });
    const pinjamanOrangLain = await pinjamanMilik(t, orangLain.userId, "PGD-ORANG-LAIN");

    await expect(
      nasabah.sesi.mutation(api.penagihan.bukaPengaduanSaya, {
        kategori: "salah_tagih",
        isi: ISI,
        loanId: pinjamanOrangLain,
      }),
    ).rejects.toThrow(/bukan milik akun Anda/i);

    await expect(
      nasabah.sesi.mutation(api.penagihan.bukaPengaduanSaya, {
        kategori: "kategori_karangan",
        isi: ISI,
      }),
    ).rejects.toThrow(/tidak dikenali/i);

    await expect(
      nasabah.sesi.mutation(api.penagihan.bukaPengaduanSaya, {
        kategori: "salah_tagih",
        isi: "pendek",
      }),
    ).rejects.toThrow(/minimal/i);

    const rows = await t.run((ctx) => ctx.db.query("pengaduanNasabah").collect());
    expect(rows).toHaveLength(0);
  });

  it("pengaduan sendiri boleh ditempelkan ke pinjaman sendiri", async () => {
    const t = buatKontek();
    const nasabah = await siapkanPengguna(t, "nasabah-hd3", {
      email: "nasabah-hd3@pindai.test",
      role: "peminjam",
    });
    const pinjaman = await pinjamanMilik(t, nasabah.userId, "PGD-SENDIRI");

    await nasabah.sesi.mutation(api.penagihan.bukaPengaduanSaya, {
      kategori: "salah_tagih",
      isi: ISI,
      loanId: pinjaman,
    });
    const daftar = await nasabah.sesi.query(api.penagihan.pengaduanSaya, {});
    expect(daftar[0].nomorReferensi).toBe("PGD-SENDIRI");
  });

  it("nasabah tidak dapat membaca pengaduan milik orang lain", async () => {
    const t = buatKontek();
    const nasabah = await siapkanPengguna(t, "nasabah-hd4", {
      email: "nasabah-hd4@pindai.test",
      role: "peminjam",
    });
    const lain = await siapkanPengguna(t, "nasabah-hd4b", {
      email: "nasabah-hd4b@pindai.test",
      role: "peminjam",
    });
    const { pengaduanId } = await lain.sesi.mutation(api.penagihan.bukaPengaduanSaya, {
      kategori: "permintaan_penjelasan",
      isi: ISI,
    });

    // Daftar milik sendiri tetap kosong…
    const daftar = await nasabah.sesi.query(api.penagihan.pengaduanSaya, {});
    expect(daftar).toHaveLength(0);
    // …dan membuka utasnya ditolak dengan pesan yang sama seperti tidak ada.
    await expect(
      nasabah.sesi.query(api.penagihan.pesanPengaduanSaya, { pengaduanId }),
    ).rejects.toThrow(/tidak ditemukan/i);
    await expect(
      nasabah.sesi.mutation(api.penagihan.balasPengaduanSaya, {
        pengaduanId,
        isi: "Menyusup ke utas orang lain.",
      }),
    ).rejects.toThrow(/tidak ditemukan/i);
  });

  it("balasan petugas menjadi notifikasi nasabah; pesan sendiri tidak", async () => {
    const t = buatKontek();
    const nasabah = await siapkanPengguna(t, "nasabah-hd5", {
      email: "nasabah-hd5@pindai.test",
      role: "peminjam",
    });
    const admin = await siapkanPengguna(t, "admin-hd5", {
      email: "admin-hd5@pindai.test",
      role: "admin",
    });

    const { pengaduanId } = await nasabah.sesi.mutation(api.penagihan.bukaPengaduanSaya, {
      kategori: "salah_tagih",
      isi: ISI,
    });

    // Sebelum petugas menyentuh apa pun: belum ada notifikasi pengaduan.
    const sebelum = await nasabah.sesi.query(api.notifikasi.daftar, {});
    expect(sebelum.item.filter((n) => n.judul.includes("pengaduan"))).toHaveLength(0);

    // Petugas meninjau dan membalas.
    await admin.sesi.mutation(api.penagihan.tanganiPengaduan, {
      pengaduanId,
      status: "ditinjau",
    });
    await admin.sesi.mutation(api.penagihan.tambahPesanPengaduan, {
      pengaduanId,
      isi: "Kami sedang mencocokkan bukti transfer Anda dengan catatan sistem.",
    });

    const sesudah = await nasabah.sesi.query(api.notifikasi.daftar, {});
    const notifPengaduan = sesudah.item.filter((n) => n.tautan === "/dashboard?tab=bantuan");
    const judul = notifPengaduan.map((n) => n.judul);
    expect(judul).toContain("Ada balasan pada pengaduan Anda");
    expect(judul.some((j) => j.includes("berstatus"))).toBe(true);
    expect(sesudah.belumDibaca).toBeGreaterThan(0);

    // Menandai dibaca menghilangkan hitungan belum dibaca untuk kunci itu.
    const balasan = notifPengaduan.find((n) => n.judul === "Ada balasan pada pengaduan Anda");
    expect(balasan).toBeDefined();
    await nasabah.sesi.mutation(api.notifikasi.tandaiDibaca, { kunci: balasan!.kunci });
    const setelahDibaca = await nasabah.sesi.query(api.notifikasi.daftar, {});
    const sama = setelahDibaca.item.find((n) => n.kunci === balasan!.kunci);
    expect(sama?.dibaca).toBe(true);

    // Pesan nasabah sendiri TIDAK menjadi notifikasi untuk dirinya.
    await nasabah.sesi.mutation(api.penagihan.balasPengaduanSaya, {
      pengaduanId,
      isi: "Baik, bukti transfer saya lampirkan nomornya: TRX-991.",
    });
    const setelahBalas = await nasabah.sesi.query(api.notifikasi.daftar, {});
    const jumlahBalasanPetugas = setelahBalas.item.filter(
      (n) => n.judul === "Ada balasan pada pengaduan Anda",
    ).length;
    expect(jumlahBalasanPetugas).toBe(1);
  });

  it("pengaduan yang sudah ditutup tidak bisa dibalas nasabah", async () => {
    const t = buatKontek();
    const nasabah = await siapkanPengguna(t, "nasabah-hd6", {
      email: "nasabah-hd6@pindai.test",
      role: "peminjam",
    });
    const admin = await siapkanPengguna(t, "admin-hd6", {
      email: "admin-hd6@pindai.test",
      role: "admin",
    });
    const { pengaduanId } = await nasabah.sesi.mutation(api.penagihan.bukaPengaduanSaya, {
      kategori: "kesulitan_bayar",
      isi: ISI,
    });
    await admin.sesi.mutation(api.penagihan.tanganiPengaduan, {
      pengaduanId,
      status: "ditinjau",
    });
    await admin.sesi.mutation(api.penagihan.tanganiPengaduan, {
      pengaduanId,
      status: "selesai",
      penyelesaian: "Jadwal pembayaran disesuaikan dan nasabah sudah diberi tahu.",
    });

    await expect(
      nasabah.sesi.mutation(api.penagihan.balasPengaduanSaya, {
        pengaduanId,
        isi: "Saya ingin menambah keterangan baru.",
      }),
    ).rejects.toThrow(/sudah ditutup/i);

    const daftar = await nasabah.sesi.query(api.penagihan.pengaduanSaya, {});
    expect(daftar[0].status).toBe("selesai");
    expect(daftar[0].bolehBalas).toBe(false);
    expect(daftar[0].penyelesaian).toContain("Jadwal pembayaran");
  });

  it("menolak akun tamu dan pengguna yang belum masuk", async () => {
    const t = buatKontek();
    const tamu = await buatPengguna(t, "tamu-hd", { isAnonymous: true });

    await expect(tamu.sesi.query(api.penagihan.pengaduanSaya, {})).rejects.toThrow(/tamu/i);
    await expect(
      tamu.sesi.mutation(api.penagihan.bukaPengaduanSaya, { kategori: "lainnya", isi: ISI }),
    ).rejects.toThrow(/tamu/i);

    // Identitas yang menunjuk pengguna tidak ada ditolak sebagai pengguna tak
    // ditemukan (bukan diteruskan sebagai sesi kosong).
    const identitasAneh = t.withIdentity({ subject: "bukan-siapa" });
    await expect(identitasAneh.query(api.penagihan.pengaduanSaya, {})).rejects.toThrow(
      /tidak ditemukan/i,
    );
  });
});
