/**
 * CONTOH DATA RUANG PENDANA — portofolio akun "PENDANA UJI COBA".
 *
 * Ruang /penyedia-dana kosong sulit dinilai: tabel, ringkasan keuntungan, dan
 * pembagian marjin baru terlihat bentuknya setelah ada pinjaman yang benar-benar
 * berjalan. Modul ini menyiapkan angka contoh tanpa memakai data pendana
 * sungguhan:
 *
 *  - Pinjaman BERJALAN Rp2.000.000 (28 hari, bunga 30%) — didanai 12 hari lalu.
 *    Marjin Rp600.000 dibagi 47 : 13 menjadi pendana Rp470.000 dan platform
 *    Rp130.000. Di tabel ia muncul sebagai "Perkiraan (belum lunas)".
 *  - Pinjaman LUNAS Rp1.000.000 — didanai 40 hari lalu dan lunas 12 hari lalu.
 *    Marjin Rp300.000 menjadi pendana Rp235.000 dan platform Rp65.000. Ini yang
 *    mengisi kolom "Dibukukan (lunas)"; transfer keuntungannya sengaja belum
 *    dicatat supaya saringan "Transfer tertunda" ada isinya.
 *  - Kredit barang 3 bulan Rp3.000.000 dan 6 bulan Rp6.000.000, keduanya sudah
 *    DICICIL 2 KALI. Baris cicilannya dihitung dari jadwal engine yang sama
 *    dengan kontrak, jadi sisa pokok dan progres "2 dari 3/6" di layar bukan
 *    angka karangan.
 *
 * Batas yang disengaja: TIDAK ada dompet, ledger, setoran, penarikan, atau
 * siklus 30 hari yang dibuat. Baris pinjaman dan cicilan ini tidak menciptakan
 * kewajiban pencairan, jadi menjalankan seed tidak memindahkan uang dan tidak
 * bisa membuat saldo pendana berubah.
 *
 * Tidak diekspos ke klien (internalMutation). Jalankan lewat CLI:
 *
 *   bunx convex run contohPendana:buat '{"konfirmasi":"BUAT_CONTOH_PENDANA"}'
 *   bunx convex run contohPendana:ringkas '{}'
 *   bunx convex run contohPendana:hapus '{"konfirmasi":"HAPUS_CONTOH_PENDANA"}'
 *
 * Idempoten: akun dan pinjaman dikenali dari email, nomor WhatsApp, dan nomor
 * referensi tetap; menjalankan ulang tidak membuat duplikat.
 */
import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { hakPendana } from "../lib/imbalPendana";
import { quoteKreditBarang } from "../lib/kredit";
import { persenBungaHarian } from "../lib/loan";
import { ruangPendana } from "./penyediaDana";
import { ROLES } from "./schema";
import { audit } from "./system";

/** Identitas tetap — juga dipakai untuk mencari baris yang sudah ada. */
const NAMA_PENDANA = "PENDANA UJI COBA";
const EMAIL_PENDANA = "pendana.uji@pindai.test";
const NAMA_PEMINJAM = "PEMINJAM CONTOH PINDAI";
const WA_PEMINJAM = "628000000010";
const NIK_PEMINJAM = "3200000000000001";

const REF_BERJALAN = "PGD-CONTOH-0001";
const REF_LUNAS = "PGD-CONTOH-0002";
const REF_KREDIT_3 = "KRD-CONTOH-0001";
const REF_KREDIT_6 = "KRD-CONTOH-0002";

const KONFIRMASI_BUAT = "BUAT_CONTOH_PENDANA";
const KONFIRMASI_HAPUS = "HAPUS_CONTOH_PENDANA";

const HARI_MS = 86_400_000;

/** Aktor audit: admin yang disebut CLI, atau penanda seed internal. */
async function aktorSeed(
  ctx: MutationCtx,
  adminEmail: string | undefined,
): Promise<{ userId: Id<"users"> | undefined; label: string }> {
  const email = adminEmail?.trim().toLowerCase();
  if (email === undefined || email === "") {
    return { userId: undefined, label: "Seed contoh pendana (CLI)" };
  }
  const admin = await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", email))
    .first();
  if (admin === null || admin.role !== ROLES.ADMIN) {
    throw new Error(`Email ${email} bukan akun admin. Periksa lagi.`);
  }
  return {
    userId: admin._id,
    label: admin.email?.trim() || admin.name?.trim() || "admin",
  };
}

async function cariPenggunaEmail(ctx: QueryCtx | MutationCtx, email: string) {
  return await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", email))
    .first();
}

async function cariPenggunaNomor(ctx: QueryCtx | MutationCtx, nomor: string) {
  return await ctx.db
    .query("users")
    .withIndex("by_nomorWhatsApp", (q) => q.eq("nomorWhatsApp", nomor))
    .first();
}

/**
 * Pinjaman contoh milik akun uji. Dicari dari nomor referensi tetapnya: jendela
 * 200 pengajuan terbaru cukup karena seed dijalankan pada data yang baru dibuat,
 * dan tidak perlu indeks baru hanya untuk satu perintah CLI.
 */
async function cariPinjamanContoh(ctx: MutationCtx) {
  const jendela = await ctx.db.query("loans").order("desc").take(200);
  return {
    berjalan: jendela.find((row) => row.nomorReferensi === REF_BERJALAN) ?? null,
    lunas: jendela.find((row) => row.nomorReferensi === REF_LUNAS) ?? null,
  };
}

/** Baris kredit contoh dicari dari nomor referensi tetapnya (lihat catatan pinjaman). */
async function cariKreditContoh(ctx: MutationCtx) {
  const jendela = await ctx.db.query("kreditBarang").order("desc").take(200);
  return jendela.filter(
    (row) => row.nomorReferensi === REF_KREDIT_3 || row.nomorReferensi === REF_KREDIT_6,
  );
}

export const buat = internalMutation({
  args: {
    konfirmasi: v.string(),
    adminEmail: v.optional(v.string()),
  },
  handler: async (ctx, { konfirmasi, adminEmail }) => {
    if (konfirmasi !== KONFIRMASI_BUAT) {
      throw new Error(`Tulis konfirmasi "${KONFIRMASI_BUAT}" untuk menjalankan seed.`);
    }
    const aktor = await aktorSeed(ctx, adminEmail);
    const sekarang = Date.now();

    // ==== Akun pendana uji ====
    const pendanaAda = await cariPenggunaEmail(ctx, EMAIL_PENDANA);
    let pendanaId: Id<"users">;
    if (pendanaAda === null) {
      pendanaId = await ctx.db.insert("users", {
        name: NAMA_PENDANA,
        email: EMAIL_PENDANA,
        emailVerificationTime: sekarang,
        role: ROLES.DANA,
        isAnonymous: false,
        dibuatAdminPada: sekarang,
      });
    } else if (pendanaAda.role !== ROLES.DANA) {
      throw new Error(
        `${EMAIL_PENDANA} sudah dipakai akun lain (${pendanaAda.role ?? "tanpa peran"}). Ganti dulu sebelum menjalankan seed.`,
      );
    } else if (pendanaAda.name !== NAMA_PENDANA) {
      throw new Error(
        `Akun ${EMAIL_PENDANA} bernama "${pendanaAda.name ?? "tanpa nama"}". Seed tidak menimpa akun yang sudah ada.`,
      );
    } else {
      pendanaId = pendanaAda._id;
    }

    // ==== Akun peminjam contoh (tanpa kredensial masuk) ====
    const peminjamAda = await cariPenggunaNomor(ctx, WA_PEMINJAM);
    let peminjamId: Id<"users">;
    if (peminjamAda === null) {
      peminjamId = await ctx.db.insert("users", {
        name: NAMA_PEMINJAM,
        role: ROLES.PEMINJAM,
        isAnonymous: false,
        nomorWhatsApp: WA_PEMINJAM,
        dibuatAdminPada: sekarang,
      });
    } else if (peminjamAda.name !== NAMA_PEMINJAM) {
      throw new Error(
        `Nomor ${WA_PEMINJAM} sudah dipakai "${peminjamAda.name ?? "tanpa nama"}". Seed tidak menimpa akun yang sudah ada.`,
      );
    } else {
      peminjamId = peminjamAda._id;
    }

    // ==== Dua pinjaman contoh ====
    const ada = await cariPinjamanContoh(ctx);
    for (const [label, loan] of [
      [REF_BERJALAN, ada.berjalan],
      [REF_LUNAS, ada.lunas],
    ] as const) {
      if (loan !== null && (loan.userId !== peminjamId || loan.pendanaId !== pendanaId)) {
        throw new Error(
          `Nomor referensi ${label} sudah dipakai pinjaman lain. Seed dihentikan; periksa data sebelum melanjutkan.`,
        );
      }
    }

    const bungaBerjalan = persenBungaHarian(2_000_000, 28) ?? 30;
    const bungaLunas = persenBungaHarian(1_000_000, 28) ?? 30;

    const idBerjalan =
      ada.berjalan?._id ??
      (await ctx.db.insert("loans", {
        userId: peminjamId,
        pokokPinjaman: 2_000_000,
        pokokDiajukan: 2_000_000,
        tujuan: "modal_usaha",
        catatanPeminjam:
          "Contoh data ruang pendana. Bukan pengajuan sungguhan; dibuat untuk memeriksa tampilan portofolio.",
        namaLengkap: NAMA_PEMINJAM,
        namaBank: "BCA",
        nomorRekening: "0000000001",
        status: "didanai",
        nomorReferensi: REF_BERJALAN,
        tenorHari: 28,
        cairEkspres: false,
        persenBunga: bungaBerjalan,
        diajukanPada: sekarang - 13 * HARI_MS,
        didanaiPada: sekarang - 12 * HARI_MS,
        pendanaId,
        pendanaNama: NAMA_PENDANA,
      }));

    const idLunas =
      ada.lunas?._id ??
      (await ctx.db.insert("loans", {
        userId: peminjamId,
        pokokPinjaman: 1_000_000,
        pokokDiajukan: 1_000_000,
        tujuan: "modal_usaha",
        catatanPeminjam:
          "Contoh data ruang pendana (sudah lunas). Bukan pengajuan sungguhan.",
        namaLengkap: NAMA_PEMINJAM,
        namaBank: "BCA",
        nomorRekening: "0000000001",
        status: "lunas",
        nomorReferensi: REF_LUNAS,
        tenorHari: 28,
        cairEkspres: false,
        persenBunga: bungaLunas,
        diajukanPada: sekarang - 41 * HARI_MS,
        didanaiPada: sekarang - 40 * HARI_MS,
        lunasPada: sekarang - 12 * HARI_MS,
        pendanaId,
        pendanaNama: NAMA_PENDANA,
      }));

    // ==== Dua contoh kredit barang, masing-masing sudah dicicil 2 kali ====
    // Angka cicilan diambil dari jadwal engine (bukan diketik manual), jadi
    // sisa pokok dan progres di layar selalu cocok dengan kontraknya.
    const kreditAda = await cariKreditContoh(ctx);
    const contohKredit = [
      {
        ref: REF_KREDIT_3,
        namaBarang: "Samsung Galaxy A55 8/256",
        kategori: "Elektronik",
        merchant: "Shopee",
        hargaBarang: 3_000_000,
        tenorBulan: 3,
      },
      {
        ref: REF_KREDIT_6,
        namaBarang: "Lenovo IdeaPad Slim 3 8/512",
        kategori: "Elektronik",
        merchant: "Tokopedia",
        hargaBarang: 6_000_000,
        tenorBulan: 6,
      },
    ] as const;
    const kreditDibuat: {
      nomorReferensi: string;
      tenorBulan: number;
      hargaBarang: number;
      cicilanDibayar: number;
    }[] = [];

    for (const contoh of contohKredit) {
      const quote = quoteKreditBarang({
        hargaBarang: contoh.hargaBarang,
        dpPersen: 0,
        tenorBulan: contoh.tenorBulan,
        marginPersenPerBulan: 2,
      });
      const adaRow = kreditAda.find((row) => row.nomorReferensi === contoh.ref) ?? null;
      if (adaRow !== null && adaRow.userId !== peminjamId) {
        throw new Error(
          `Nomor referensi ${contoh.ref} sudah dipakai kredit lain. Seed dihentikan; periksa data sebelum melanjutkan.`,
        );
      }

      // Didanai 70 hari lalu: cicilan bulan ke-1 dan ke-2 sudah jatuh tempo,
      // cicilan berikutnya masih berjalan.
      const didanaiPada = sekarang - 70 * HARI_MS;
      const kreditId =
        adaRow?._id ??
        (await ctx.db.insert("kreditBarang", {
          userId: peminjamId,
          nomorReferensi: contoh.ref,
          namaBarang: contoh.namaBarang,
          kategori: contoh.kategori,
          merchant: contoh.merchant,
          hargaBarang: contoh.hargaBarang,
          dpPersen: 0,
          tenorBulan: contoh.tenorBulan,
          marginPersenPerBulan: 2,
          tarifBulanan: quote.tarifBulanan,
          status: "didanai",
          namaLengkap: NAMA_PEMINJAM,
          nik: NIK_PEMINJAM,
          nomorRekening: "0000000001",
          nomorWhatsApp: WA_PEMINJAM,
          catatanPeminjam:
            "Contoh data ruang pendana (kredit barang). Bukan pengajuan sungguhan.",
          didanaiPada,
        }));

      const alokasi = await ctx.db
        .query("kreditFundings")
        .withIndex("by_kredit", (q) => q.eq("kreditId", kreditId))
        .collect();
      if (!alokasi.some((row) => row.danaId === pendanaId)) {
        if (alokasi.length > 0) {
          throw new Error(
            `Kredit ${contoh.ref} sudah punya alokasi dana lain. Seed dihentikan agar hak pendana lain tidak tertimpa.`,
          );
        }
        await ctx.db.insert("kreditFundings", {
          kreditId,
          danaId: pendanaId,
          jumlahAlokasi: quote.pokokDibiayai,
          // Porsi penuh (100%): hak Imbal Hasil = seluruh marjin kontrak.
          imbalHasil: quote.imbalHasil,
          status: "dialokasikan",
          nomorReferensi: `KFD-CONTOH-${contoh.tenorBulan}`,
        });
      }

      const pembayaranAda = await ctx.db
        .query("kreditPayments")
        .withIndex("by_kredit", (q) => q.eq("kreditId", kreditId))
        .collect();
      for (const bulanKe of [1, 2]) {
        if (pembayaranAda.some((row) => row.bulanKe === bulanKe)) continue;
        const jadwal = quote.jadwal[bulanKe - 1];
        await ctx.db.insert("kreditPayments", {
          kreditId,
          userId: peminjamId,
          bulanKe,
          pokokDibayar: jadwal.pokok,
          marginDibayar: jadwal.margin,
          totalDibayar: jadwal.pokok + jadwal.margin,
          sisaPokokSetelah: jadwal.sisaPokok,
          waktu: didanaiPada + bulanKe * 30 * HARI_MS,
        });
      }

      kreditDibuat.push({
        nomorReferensi: contoh.ref,
        tenorBulan: contoh.tenorBulan,
        hargaBarang: contoh.hargaBarang,
        cicilanDibayar: 2,
      });
    }

    await audit(
      ctx,
      aktor.userId,
      aktor.label,
      "seed_contoh_pendana",
      EMAIL_PENDANA,
      `Contoh data ruang pendana: ${REF_BERJALAN} (berjalan), ${REF_LUNAS} (lunas), ${REF_KREDIT_3} dan ${REF_KREDIT_6} (kredit, dicicil 2 kali).`,
    );

    // Angka pembagian diambil dari mesin yang sama dengan ruang pendana, bukan
    // disalin dari dokumentasi, supaya balasan CLI bisa dicocokkan langsung
    // dengan yang tampil di layar.
    const ringkas = (pokok: number, bunga: number) => {
      const hak = hakPendana(pokok, { pokokPinjaman: pokok, persenBunga: bunga });
      return {
        pokok,
        margin: hak.marginTotal,
        pendana: hak.keuntungan,
        platform: hak.potonganAdmin,
      };
    };

    return {
      ok: true as const,
      pendanaId,
      peminjamId,
      pinjaman: [idBerjalan, idLunas],
      pembagian: {
        berjalan: ringkas(2_000_000, bungaBerjalan),
        lunas: ringkas(1_000_000, bungaLunas),
      },
      kredit: kreditDibuat,
    };
  },
});

const AWALAN_REF = "PGD-CONTOH-";
const AWALAN_REF_KREDIT = "KRD-CONTOH-";

/**
 * Angka yang benar-benar dilihat akun uji di ruang /penyedia-dana.
 *
 * Memakai `ruangPendana` yang sama dengan halaman, bukan hitungan kedua: kalau
 * angka di sini cocok dengan layar, yang diuji adalah layarnya, bukan salinan
 * rumusnya. Membaca sebagai akun pendana uji, jadi cakupannya otomatis hanya
 * pinjaman miliknya.
 */
export const ringkas = internalQuery({
  args: {},
  handler: async (ctx) => {
    const pendana = await cariPenggunaEmail(ctx, EMAIL_PENDANA);
    if (pendana === null) return null;
    const ruang = await ruangPendana(ctx, pendana);
    const alokasiKredit = await ctx.db
      .query("kreditFundings")
      .withIndex("by_dana", (q) => q.eq("danaId", pendana._id))
      .collect();
    return {
      rekap: ruang.rekapPendana.find((row) => row.nama === NAMA_PENDANA) ?? null,
      pinjaman: ruang.pinjaman
        .filter((row) => row.nomorReferensi.startsWith(AWALAN_REF))
        .map((row) => ({
          nomorReferensi: row.nomorReferensi,
          status: row.status,
          pokok: row.pokokPinjaman,
          keuntunganPendana: row.keuntunganPendana,
          biayaPlatform: row.keuntunganAdmin,
          transfer: row.transfer.status,
        })),
      kredit: ruang.kredit
        .filter((row) => row.nomorReferensi.startsWith(AWALAN_REF_KREDIT))
        .map((row) => ({
          nomorReferensi: row.nomorReferensi,
          status: row.status,
          tenorBulan: row.tenorBulan,
          hargaBarang: row.hargaBarang,
          cicilanDibayar: row.cicilanDibayar,
          imbalPendana:
            alokasiKredit.find((f) => f.kreditId === row._id)?.imbalHasil ?? null,
        })),
    };
  },
});

export const hapus = internalMutation({
  args: {
    konfirmasi: v.string(),
    adminEmail: v.optional(v.string()),
  },
  handler: async (ctx, { konfirmasi, adminEmail }) => {
    if (konfirmasi !== KONFIRMASI_HAPUS) {
      throw new Error(`Tulis konfirmasi "${KONFIRMASI_HAPUS}" untuk menghapus contoh.`);
    }
    const aktor = await aktorSeed(ctx, adminEmail);
    const pendana = await cariPenggunaEmail(ctx, EMAIL_PENDANA);
    const ada = await cariPinjamanContoh(ctx);
    let dihapus = 0;
    for (const loan of [ada.berjalan, ada.lunas]) {
      if (loan === null) continue;
      if (loan.pendanaNama !== NAMA_PENDANA) {
        throw new Error(
          `${loan.nomorReferensi} bukan milik ${NAMA_PENDANA}. Hapus dibatalkan agar data lain tidak ikut hilang.`,
        );
      }
      await ctx.db.delete(loan._id);
      dihapus += 1;
    }

    // Kredit contoh: cicilan dan alokasinya ikut dibersihkan supaya tidak ada
    // baris yatim. Alokasi milik pendana lain membuat penghapusan dibatalkan.
    const kreditContoh = await cariKreditContoh(ctx);
    let kreditDihapus = 0;
    for (const kredit of kreditContoh) {
      if (pendana === null) {
        throw new Error(
          `Kredit ${kredit.nomorReferensi} tidak bisa diverifikasi kepemilikannya karena akun ${NAMA_PENDANA} tidak ada.`,
        );
      }
      const [cicilan, alokasi] = await Promise.all([
        ctx.db
          .query("kreditPayments")
          .withIndex("by_kredit", (q) => q.eq("kreditId", kredit._id))
          .collect(),
        ctx.db
          .query("kreditFundings")
          .withIndex("by_kredit", (q) => q.eq("kreditId", kredit._id))
          .collect(),
      ]);
      if (alokasi.some((row) => row.danaId !== pendana._id)) {
        throw new Error(
          `Kredit ${kredit.nomorReferensi} punya alokasi pendana lain. Hapus dibatalkan agar hak pendana lain tidak ikut hilang.`,
        );
      }
      for (const row of cicilan) await ctx.db.delete(row._id);
      for (const row of alokasi) await ctx.db.delete(row._id);
      await ctx.db.delete(kredit._id);
      kreditDihapus += 1;
    }

    // Akun peminjam contoh hanya dihapus bila tidak punya pinjaman/kredit lain.
    const peminjam = await cariPenggunaNomor(ctx, WA_PEMINJAM);
    let peminjamDihapus = false;
    if (peminjam !== null && peminjam.name === NAMA_PEMINJAM) {
      const [pinjamanSisa, kreditSisa] = await Promise.all([
        ctx.db
          .query("loans")
          .withIndex("by_user", (q) => q.eq("userId", peminjam._id))
          .first(),
        ctx.db
          .query("kreditBarang")
          .withIndex("by_user", (q) => q.eq("userId", peminjam._id))
          .first(),
      ]);
      if (pinjamanSisa === null && kreditSisa === null) {
        await ctx.db.delete(peminjam._id);
        peminjamDihapus = true;
      }
    }

    // Akun pendana dipertahankan bila sudah dipakai data lain; bila tidak,
    // dihapus supaya daftar akun pendana tidak menyisakan akun contoh.
    let pendanaDihapus = false;
    if (pendana !== null && pendana.name === NAMA_PENDANA) {
      const [pinjamanSisa, alokasiSisa, alokasiKreditSisa, siklusSisa] =
        await Promise.all([
          ctx.db
            .query("loans")
            .withIndex("by_pendana", (q) => q.eq("pendanaId", pendana._id))
            .first(),
          ctx.db
            .query("fundings")
            .withIndex("by_dana", (q) => q.eq("danaId", pendana._id))
            .first(),
          ctx.db
            .query("kreditFundings")
            .withIndex("by_dana", (q) => q.eq("danaId", pendana._id))
            .first(),
          ctx.db
            .query("siklusPendana")
            .withIndex("by_pendana", (q) => q.eq("pendanaId", pendana._id))
            .first(),
        ]);
      if (
        pinjamanSisa === null &&
        alokasiSisa === null &&
        alokasiKreditSisa === null &&
        siklusSisa === null
      ) {
        await ctx.db.delete(pendana._id);
        pendanaDihapus = true;
      }
    }

    await audit(
      ctx,
      aktor.userId,
      aktor.label,
      "hapus_contoh_pendana",
      EMAIL_PENDANA,
      `Menghapus ${dihapus} pinjaman dan ${kreditDihapus} kredit contoh. Akun peminjam ${peminjamDihapus ? "dihapus" : "dipertahankan"}; akun pendana ${pendanaDihapus ? "dihapus" : "dipertahankan"}.`,
    );

    return {
      ok: true as const,
      pinjamanDihapus: dihapus,
      kreditDihapus,
      peminjamDihapus,
      pendanaDihapus,
    };
  },
});
