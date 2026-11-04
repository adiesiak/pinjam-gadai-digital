import { v } from "convex/values";

import { internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  apakahSumberDokumenBackupDrive,
  apakahTabelBackupDrive,
} from "../lib/backupDrive";
import { audit, bacaHalamanSnapshot } from "./system";

/**
 * Jembatan data untuk action backup Google Drive.
 *
 * Action Node tidak boleh membaca database langsung, jadi halaman tabel dan
 * tautan dokumen dibaca lewat query internal ini. Tautan storage hanya hidup
 * di server; action memakainya untuk mengunduh berkas lalu menghapusnya dari
 * ingatan setelah diunggah.
 */

export const halamanTabel = internalQuery({
  args: {
    tabel: v.string(),
    kursor: v.optional(v.string()),
    batas: v.optional(v.number()),
  },
  handler: async (ctx, { tabel, kursor, batas }) => {
    if (!apakahTabelBackupDrive(tabel)) {
      throw new Error(`Tabel backup Drive tidak dikenal: ${tabel}`);
    }
    // Baris pinjaman/KYC dapat memuat tanda tangan data URL yang besar, jadi
    // action meminta halaman lebih kecil untuk tabel tersebut. Batas di sini
    // tetap menjaga satu query tidak melewati batas hasil Convex.
    const ukuran = Math.min(200, Math.max(1, Math.floor(batas ?? 100)));
    const halaman = await bacaHalamanSnapshot(ctx, tabel, kursor ?? null, ukuran);
    return {
      baris: halaman.page,
      kursor: halaman.isDone ? null : halaman.continueCursor,
    };
  },
});

type DokumenBackup = {
  storageId: Id<"_storage">;
  jenis: string;
  pemilik: string;
  /** Null berarti baris menunjuk berkas yang sudah tidak ada di storage. */
  url: string | null;
  contentType: string | null;
  ukuran: number | null;
};

export const halamanDokumen = internalQuery({
  args: {
    sumber: v.string(),
    kursor: v.optional(v.string()),
    batas: v.optional(v.number()),
  },
  handler: async (ctx, { sumber, kursor, batas }) => {
    if (!apakahSumberDokumenBackupDrive(sumber)) {
      throw new Error(`Sumber dokumen backup Drive tidak dikenal: ${sumber}`);
    }
    const ukuran = Math.min(50, Math.max(1, Math.floor(batas ?? 50)));
    const opsi = { cursor: kursor ?? null, numItems: ukuran };
    const dokumen: DokumenBackup[] = [];
    const tambah = async (
      jenis: string,
      pemilik: string,
      id: Id<"_storage"> | undefined | null,
    ) => {
      if (!id) return;
      const [url, metadata] = await Promise.all([
        ctx.storage.getUrl(id),
        // `storage.getMetadata` tidak didukung convex-test; membaca baris
        // sistem `_storage` memberi fakta yang sama dan tetap hanya di server.
        ctx.db.system.get("_storage", id),
      ]);
      // Berkas yang sudah hilang dari storage tetap dicatat sebagai referensi;
      // action akan mencatatnya di `dokumenGagal`, bukan menganggap backup
      // lengkap padahal ada dokumen yang tidak bisa dipulihkan.
      dokumen.push({
        storageId: id,
        jenis,
        pemilik,
        url,
        contentType: metadata?.contentType ?? null,
        ukuran: metadata?.size ?? null,
      });
    };

    if (sumber === "kycProfil") {
      const halaman = await ctx.db.query("kycProfil").paginate(opsi);
      for (const k of halaman.page) {
        const pemilik = String(k.userId);
        await tambah("ktp", pemilik, k.ktpId);
        await tambah("selfie_ktp", pemilik, k.selfieKtpId);
        await tambah("bukti_penghasilan", pemilik, k.buktiPenghasilanId);
      }
      return {
        dokumen,
        kursor: halaman.isDone ? null : halaman.continueCursor,
      };
    }

    if (sumber === "nasabahProfil") {
      const halaman = await ctx.db.query("nasabahProfil").paginate(opsi);
      for (const n of halaman.page) {
        await tambah("foto_ktp_nasabah", String(n.userId), n.fotoKtpId);
      }
      return {
        dokumen,
        kursor: halaman.isDone ? null : halaman.continueCursor,
      };
    }

    if (sumber === "loans") {
      const halaman = await ctx.db.query("loans").paginate(opsi);
      for (const l of halaman.page) {
        const pemilik = l.nomorReferensi;
        await tambah("ktp_pinjaman", pemilik, l.dokKtpId);
        await tambah("selfie_ktp_pinjaman", pemilik, l.dokSelfieKtpId);
        await tambah("slip_gaji", pemilik, l.dokSlipGajiId);
        await tambah("kartu_keluarga", pemilik, l.dokKartuKeluargaId);
        await tambah("bukti_domisili", pemilik, l.dokBuktiDomisiliId);
        await tambah("kontrak_ttd_manual", pemilik, l.ttdManualBerkasId);
      }
      return {
        dokumen,
        kursor: halaman.isDone ? null : halaman.continueCursor,
      };
    }

    if (sumber === "manualPaymentReceipts") {
      const halaman = await ctx.db.query("manualPaymentReceipts").paginate(opsi);
      for (const r of halaman.page) {
        await tambah("bukti_pembayaran_manual", r.nomorReferensi, r.buktiPembayaranId);
      }
      return {
        dokumen,
        kursor: halaman.isDone ? null : halaman.continueCursor,
      };
    }

    const halaman = await ctx.db.query("pawns").paginate(opsi);
    for (const p of halaman.page) {
      await tambah("foto_barang_gadai", p.nomorReferensi, p.fotoBarangId);
    }
    return {
      dokumen,
      kursor: halaman.isDone ? null : halaman.continueCursor,
    };
  },
});

export const selesaikan = internalMutation({
  args: {
    jumlahTabel: v.number(),
    jumlahBaris: v.number(),
    jumlahDokumen: v.number(),
    jumlahDokumenGagal: v.number(),
    folder: v.string(),
    manifest: v.string(),
    status: v.union(v.literal("lengkap"), v.literal("sebagian")),
  },
  handler: async (ctx, args) => {
    const detail =
      `google-drive: ${args.status} · ${args.jumlahTabel} tabel · ` +
      `${args.jumlahBaris} baris · ${args.jumlahDokumen} dokumen · ` +
      `${args.jumlahDokumenGagal} gagal · ${args.folder} · ${args.manifest}`;
    // Aksi `backup` dipakai juga oleh ekspor manual, sehingga pemeriksa
    // kesegaran arsip yang sudah ada langsung melihat backup Drive ini.
    await audit(ctx, null, "sistem", "backup", "google-drive", detail);
    return { ok: true as const };
  },
});

export const gagalkan = internalMutation({
  args: { pesan: v.string(), pemicu: v.optional(v.string()) },
  handler: async (ctx, { pesan, pemicu }) => {
    await audit(
      ctx,
      null,
      "sistem",
      "backup_drive_gagal",
      "google-drive",
      `google-drive: gagal (${pemicu ?? "terjadwal"}) · ${pesan}`.slice(0, 500),
    );
    return { ok: true as const };
  },
});
