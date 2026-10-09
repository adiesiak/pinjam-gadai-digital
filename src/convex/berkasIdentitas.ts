import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import { action, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { jenisGambarDariByte, periksaBerkasIdentitas, periksaIsiGambar } from "../lib/kyc";

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
 */
export const periksaIsiBerkasKyc = action({
  args: { id: v.id("_storage"), label: v.string() },
  returns: v.object({ ok: v.literal(true), jenis: v.string() }),
  handler: async (ctx, { id, label }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Harus masuk terlebih dahulu.");
    const nama = label.trim().slice(0, 40) || "Berkas";
    const blob = await ctx.storage.get(id);
    const head = blob === null ? null : new Uint8Array(await blob.slice(0, 16).arrayBuffer());
    const pesan = periksaIsiGambar(nama, head);
    if (pesan !== null) throw new Error(pesan);
    return { ok: true as const, jenis: jenisGambarDariByte(head ?? new Uint8Array(0)) ?? "gambar" };
  },
});
