import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import { action, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  dimensiGambar,
  jenisGambarDariByte,
  MAX_FILE_BYTES,
  periksaBerkasIdentitas,
  periksaIsiGambar,
  periksaUkuranGambar,
} from "../lib/kyc";

/**
 * Byte pertama yang dibaca untuk memeriksa isi + header dimensi. Cukup untuk
 * header PNG/WEBP (beberapa byte pertama) dan untuk hampir semua JPEG, yang
 * `SOF`-nya muncul sebelum scan-line pertama.
 */
const PREFIKS_BACA = 64 * 1024;

/**
 * Periksa SATU berkas identitas yang sudah ada di Convex storage — di sisi
 * SERVER, bukan di peramban.
 *
 * Kenapa perlu: unggahan memakai URL unggah bertanda tangan
 * (`generateUploadUrl`), jadi klien bisa mengirim apa pun langsung ke URL itu
 * tanpa melewati form. Batas 5 MB dan syarat "harus gambar" yang hanya hidup
 * di form karena itu bisa dilewati sepenuhnya; pemeriksaan ini menutupnya.
 *
 * Metadata dibaca dari tabel sistem `_storage`
 * (`ctx.db.system.get("_storage", id)`), cara yang dianjurkan Convex — bukan
 * `ctx.storage.getMetadata` yang sudah usang.
 *
 * Batas yang jujur: `contentType` ditentukan klien saat mengunggah, jadi ia
 * menahan salah unggah (PDF/ZIP/dokumen lain) tetapi bukan bukti isi berkas.
 * Pemeriksaan ISI (magic bytes) tersedia lewat action di modul ini, dan hanya
 * action yang boleh membaca isi berkas di Convex.
 *
 * Melempar `Error` dengan kalimat siap tampil bila berkas tidak lolos.
 */
export async function periksaBerkasIdentitasStorage(
  ctx: MutationCtx,
  label: string,
  id: Id<"_storage">,
  opsi: { bolehPdf?: boolean } = {},
): Promise<{ size: number; contentType: string }> {
  const meta = await ctx.db.system.get("_storage", id);
  const bentuk = periksaBerkasIdentitas(
    label,
    meta === null ? null : { size: meta.size, contentType: meta.contentType ?? "" },
    opsi,
  );
  if (bentuk !== null) throw new Error(bentuk);
  return { size: meta?.size ?? 0, contentType: meta?.contentType ?? "" };
}

/**
 * Periksa ISI satu berkas identitas (magic bytes) — ACTION, bukan mutation.
 *
 * `ctx.storage.get` yang membaca isi berkas hanya tersedia di action, jadi
 * pemeriksaan ini dijalankan action setelah unggah (form nasabah maupun form
 * admin) supaya berkas yang bukan gambar tertolak SEBELUM ditautkan ke
 * pengajuan. Mutation tetap memeriksa metadata/ukuran sebagai penjaga akhir.
 *
 * `label` hanya dipakai pada kalimat galat, jadi panjangnya dibatasi.
 *
 * Berkas yang LOLOS ditandai di tabel `berkasTerverifikasi` (lewat mutation
 * internal). Penanda itulah yang membuat pemeriksaan ini tidak bisa dilewati:
 * mutation yang menautkan dokumen KYC (`convex/kyc.ts`) menolak storage id yang
 * belum punya penanda. Tanpa penanda, "sudah diperiksa" hanya klaim klien.
 */
export const periksaIsiBerkasKyc = action({
  args: { id: v.id("_storage"), label: v.string() },
  returns: v.object({ ok: v.literal(true), jenis: v.string() }),
  handler: async (ctx, { id, label }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
    const nama = label.trim().slice(0, 40) || "Berkas";
    const blob = await ctx.storage.get(id);
    if (blob === null) {
      throw new Error(`${nama} tidak ditemukan di penyimpanan. Unggah ulang berkasnya.`);
    }
    // Batas ukuran ditegakkan di sini juga: action inilah yang menandai berkas
    // "terverifikasi", jadi berkas yang dikirim langsung ke URL unggah (tanpa
    // melewati mutation) tetap tidak bisa lolos.
    if (blob.size > MAX_FILE_BYTES) {
      throw new Error(`${nama} maksimal ${Math.round(MAX_FILE_BYTES / (1024 * 1024))} MB.`);
    }
    const head = new Uint8Array(await blob.slice(0, PREFIKS_BACA).arrayBuffer());
    // 1) Isinya benar-benar gambar menurut magic bytes.
    const pesanIsi = periksaIsiGambar(nama, head.slice(0, 16));
    if (pesanIsi !== null) throw new Error(pesanIsi);
    // 2) Gambarnya terbaca, cukup besar, dan rasionya wajar (bukan strip
    //    terpotong). Ini pemeriksaan keterbacaan — bukan penilaian keaslian.
    const dimensi = dimensiGambar(head);
    const pesanUkuran = periksaUkuranGambar(nama, dimensi);
    if (pesanUkuran !== null) throw new Error(pesanUkuran);
    const jenis = jenisGambarDariByte(head) ?? "gambar";
    // Penanda ditulis setelah isi berkas terbukti gambar yang terbaca —
    // satu-satunya bukti bahwa pemeriksaan ini benar-benar berjalan.
    await ctx.runMutation(internal.kyc.catatBerkasTerverifikasi, {
      storageId: id,
      label: nama,
      jenis,
      lebar: dimensi?.lebar,
      tinggi: dimensi?.tinggi,
      olehUserId: userId,
    });
    return { ok: true as const, jenis };
  },
});
