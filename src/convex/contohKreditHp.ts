/**
 * CONTOH DATA KREDIT HP — delapan pengajuan iPhone 18 Pro Max.
 *
 * Satu pengajuan kredit barang dibatasi pokok Rp10 juta, sedangkan data yang
 * diminta bernilai total Rp80 juta. Karena itu data dipecah menjadi delapan
 * pengajuan @ Rp10 juta (DP 10%, pokok dibiayai Rp9 juta per pengajuan).
 * Total harga barang tetap Rp80.000.000.
 *
 * Batas yang disengaja:
 *  - Dibuat untuk akun contoh "PEMINJAM CONTOH IPHONE", bukan nasabah nyata.
 *  - Status awal "diajukan" — belum ada alokasi dana, cicilan, atau jurnal.
 *    Admin tetap harus meninjau/menyetujui lewat antrean yang biasa.
 *  - Tidak membuat dompet, setoran, atau kewajiban pencairan.
 *
 * Tidak diekspos ke klien (internalMutation/internalQuery). Jalankan lewat CLI:
 *
 *   bunx convex run contohKreditHp:buat '{"konfirmasi":"BUAT_CONTOH_KREDIT_HP"}'
 *   bunx convex run contohKreditHp:ringkas '{}'
 *   bunx convex run contohKreditHp:hapus '{"konfirmasi":"HAPUS_CONTOH_KREDIT_HP"}'
 *
 * Idempoten: akun dikenali dari nomor WhatsApp dan tiap pengajuan dari nomor
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
import { KREDIT_ASUMSI_AWAL, quoteKreditBarang } from "../lib/kredit";
import { formatRupiah } from "../lib/money";
import { tarifBulananDariConfig } from "../lib/system-config";
import { ROLES } from "./schema";
import { audit, getConfig } from "./system";

const NAMA_PEMINJAM = "PEMINJAM CONTOH IPHONE";
const WA_PEMINJAM = "628000000011";
const NIK_PEMINJAM = "3200000000000009";
const NOMOR_REKENING = "0000000002";

const PREFIX_REF = "KRD-HP-20261031-";
const JUMLAH_KREDIT = 8;
const HARGA_BARANG = 10_000_000;
const DP_PERSEN = 10;
const TENOR_BULAN = 6;
const KATEGORI = "Elektronik";
const MERCHANT = "Apple Store";
const CATATAN =
  "Contoh data kredit HP: iPhone 18 Pro Max, Rp10.000.000 per pengajuan, total Rp80.000.000. Bukan pengajuan sungguhan.";

const KONFIRMASI_BUAT = "BUAT_CONTOH_KREDIT_HP";
const KONFIRMASI_HAPUS = "HAPUS_CONTOH_KREDIT_HP";

/** Nomor referensi tetap 01–08 agar seed idempoten dan mudah dicari. */
function refKe(nomor: number): string {
  return `${PREFIX_REF}${String(nomor).padStart(2, "0")}`;
}

async function cariPenggunaNomor(ctx: QueryCtx | MutationCtx, nomor: string) {
  return await ctx.db
    .query("users")
    .withIndex("by_nomorWhatsApp", (q) => q.eq("nomorWhatsApp", nomor))
    .first();
}

/** Aktor audit: admin yang disebut CLI, atau penanda seed internal. */
async function aktorSeed(
  ctx: MutationCtx,
  adminEmail: string | undefined,
): Promise<{ userId: Id<"users"> | undefined; label: string }> {
  const email = adminEmail?.trim().toLowerCase();
  if (email === undefined || email === "") {
    return { userId: undefined, label: "Seed contoh kredit HP (CLI)" };
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

/** Seluruh baris contoh, dikenali dari awalan nomor referensi tetap. */
async function cariKreditContoh(ctx: QueryCtx | MutationCtx) {
  const rows = await ctx.db.query("kreditBarang").collect();
  return rows.filter((row) => row.nomorReferensi.startsWith(PREFIX_REF));
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

    // Profil data diri membuat baris contoh bisa dibuka di panel nasabah.
    const profilWa = await ctx.db
      .query("nasabahProfil")
      .withIndex("by_nomorWhatsApp", (q) => q.eq("nomorWhatsApp", WA_PEMINJAM))
      .first();
    if (profilWa !== null && profilWa.userId !== peminjamId) {
      throw new Error(
        `Profil dengan nomor ${WA_PEMINJAM} milik akun lain. Seed dihentikan.`,
      );
    }
    if (profilWa === null) {
      const profilNik = await ctx.db
        .query("nasabahProfil")
        .withIndex("by_nik", (q) => q.eq("nik", NIK_PEMINJAM))
        .first();
      if (profilNik !== null && profilNik.userId !== peminjamId) {
        throw new Error(
          `NIK ${NIK_PEMINJAM} sudah dipakai akun lain. Seed dihentikan.`,
        );
      }
      await ctx.db.insert("nasabahProfil", {
        userId: peminjamId,
        namaLengkap: NAMA_PEMINJAM,
        nik: NIK_PEMINJAM,
        nomorWhatsApp: WA_PEMINJAM,
        namaBank: "BCA",
        nomorRekening: NOMOR_REKENING,
        diperbaruiPada: sekarang,
        diperbaruiOlehLabel: aktor.label,
        sumber: "admin",
      });
    }

    // ==== Delapan pengajuan, satu per nomor referensi tetap ====
    const tarifBulanan = tarifBulananDariConfig(await getConfig(ctx));
    const quote = quoteKreditBarang({
      hargaBarang: HARGA_BARANG,
      dpPersen: DP_PERSEN,
      tenorBulan: TENOR_BULAN,
      marginPersenPerBulan: KREDIT_ASUMSI_AWAL.marginPersenPerBulan,
      tarif: tarifBulanan,
    });
    const kreditAda = await cariKreditContoh(ctx);
    const kreditDibuat: {
      nomorReferensi: string;
      hargaBarang: number;
      pokokDibiayai: number;
      status: string;
    }[] = [];

    for (let nomor = 1; nomor <= JUMLAH_KREDIT; nomor += 1) {
      const nomorReferensi = refKe(nomor);
      const adaRow =
        kreditAda.find((row) => row.nomorReferensi === nomorReferensi) ?? null;
      if (adaRow !== null) {
        if (adaRow.userId !== peminjamId) {
          throw new Error(
            `Nomor referensi ${nomorReferensi} sudah dipakai kredit lain. Seed dihentikan; periksa data sebelum melanjutkan.`,
          );
        }
        kreditDibuat.push({
          nomorReferensi,
          hargaBarang: adaRow.hargaBarang,
          pokokDibiayai: quote.pokokDibiayai,
          status: adaRow.status,
        });
        continue;
      }

      await ctx.db.insert("kreditBarang", {
        userId: peminjamId,
        nomorReferensi,
        namaBarang: "iPhone 18 Pro Max",
        kategori: KATEGORI,
        merchant: MERCHANT,
        hargaBarang: HARGA_BARANG,
        dpPersen: DP_PERSEN,
        tenorBulan: TENOR_BULAN,
        marginPersenPerBulan: KREDIT_ASUMSI_AWAL.marginPersenPerBulan,
        tarifBulanan: quote.tarifBulanan,
        status: "diajukan",
        namaLengkap: NAMA_PEMINJAM,
        nik: NIK_PEMINJAM,
        nomorRekening: NOMOR_REKENING,
        nomorWhatsApp: WA_PEMINJAM,
        catatanPeminjam: CATATAN,
      });
      kreditDibuat.push({
        nomorReferensi,
        hargaBarang: HARGA_BARANG,
        pokokDibiayai: quote.pokokDibiayai,
        status: "diajukan",
      });
    }

    const totalHargaBarang = HARGA_BARANG * JUMLAH_KREDIT;
    await audit(
      ctx,
      aktor.userId,
      aktor.label,
      "seed_contoh_kredit_hp",
      PREFIX_REF,
      `${kreditDibuat.length} pengajuan iPhone 18 Pro Max untuk ${NAMA_PEMINJAM}: total harga ${formatRupiah(
        totalHargaBarang,
      )}, pokok dibiayai ${formatRupiah(quote.pokokDibiayai * JUMLAH_KREDIT)}.`,
    );

    return {
      ok: true as const,
      peminjamId,
      jumlah: kreditDibuat.length,
      totalHargaBarang,
      totalPokokDibiayai: quote.pokokDibiayai * JUMLAH_KREDIT,
      kredit: kreditDibuat,
    };
  },
});

/** Angka yang benar-benar tersimpan — dipakai untuk memeriksa hasil seed. */
export const ringkas = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await cariKreditContoh(ctx);
    const peminjam = await cariPenggunaNomor(ctx, WA_PEMINJAM);
    let totalPokokDibiayai = 0;
    const kredit = rows.map((row) => {
      let pokokDibiayai: number | null = null;
      try {
        const quote = quoteKreditBarang({
          hargaBarang: row.hargaBarang,
          dpPersen: row.dpPersen,
          tenorBulan: row.tenorBulan,
          marginPersenPerBulan: row.marginPersenPerBulan,
          tarif: row.tarifBulanan ?? null,
        });
        pokokDibiayai = quote.pokokDibiayai;
        totalPokokDibiayai += quote.pokokDibiayai;
      } catch {
        pokokDibiayai = null;
      }
      return {
        nomorReferensi: row.nomorReferensi,
        namaBarang: row.namaBarang,
        hargaBarang: row.hargaBarang,
        pokokDibiayai,
        status: row.status,
      };
    });
    return {
      peminjamId: peminjam?._id ?? null,
      jumlah: kredit.length,
      totalHargaBarang: kredit.reduce((acc, row) => acc + row.hargaBarang, 0),
      totalPokokDibiayai,
      kredit,
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
    const peminjam = await cariPenggunaNomor(ctx, WA_PEMINJAM);
    const rows = await cariKreditContoh(ctx);
    if (peminjam === null && rows.length > 0) {
      throw new Error(
        `Akun ${NAMA_PEMINJAM} tidak ditemukan; penghapusan dihentikan agar baris milik akun lain tidak ikut hilang.`,
      );
    }
    if (peminjam !== null && rows.some((row) => row.userId !== peminjam._id)) {
      throw new Error(
        "Ada baris contoh yang bukan milik akun contoh. Penghapusan dihentikan.",
      );
    }

    for (const row of rows) await ctx.db.delete(row._id);

    let profilDihapus = 0;
    let peminjamDihapus = false;
    if (peminjam !== null) {
      const profil = await ctx.db
        .query("nasabahProfil")
        .withIndex("by_user", (q) => q.eq("userId", peminjam._id))
        .first();
      if (profil !== null) {
        await ctx.db.delete(profil._id);
        profilDihapus = 1;
      }
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

    await audit(
      ctx,
      aktor.userId,
      aktor.label,
      "hapus_contoh_kredit_hp",
      PREFIX_REF,
      `Menghapus ${rows.length} pengajuan contoh; profil ${profilDihapus} dihapus; akun peminjam ${peminjamDihapus ? "dihapus" : "dipertahankan"}.`,
    );

    return {
      ok: true as const,
      kreditDihapus: rows.length,
      profilDihapus,
      peminjamDihapus,
    };
  },
});
