import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/**
 * Waktu sebuah berkas benar-benar masuk ke penyimpanan Convex.
 *
 * Dipakai pemeriksaan masa berlaku dokumen underwriting. Dua sumber waktu
 * digabung karena masing-masing bisa lebih tua dari yang seharusnya:
 *
 *  - `_creationTime` tabel `_storage` — waktu unggahan asli. Ini yang dipakai
 *    saat berkas baru diunggah sekali.
 *  - baris terakhir `berkasTerverifikasi` untuk berkas itu. Penyimpanan Convex
 *    boleh menyimpan satu salinan untuk isi yang identik, sehingga mengunggah
 *    ulang foto yang sama bisa mengembalikan id lama. Pemeriksaan isi menulis
 *    baris baru setiap kali berkas diperiksa ulang, jadi waktu itulah yang
 *    mewakili "nasabah baru saja mengunggah ini lagi".
 *
 * Hasilnya `null` bila berkas tidak ada (mis. sudah dihapus): pemanggil
 * memperlakukannya sebagai dokumen yang belum ada, bukan yang berlaku
 * selamanya.
 */
type KonteksBaca = Pick<QueryCtx, "db">;

export async function waktuBerkasDiunggah(
  ctx: KonteksBaca,
  id: Id<"_storage">,
): Promise<number | null> {
  const meta = await ctx.db.system.get("_storage", id);
  if (meta === null) return null;
  const terakhir = await ctx.db
    .query("berkasTerverifikasi")
    .withIndex("by_storageId", (q) => q.eq("storageId", id))
    .order("desc")
    .first();
  return Math.max(meta._creationTime, terakhir?.waktu ?? 0);
}
