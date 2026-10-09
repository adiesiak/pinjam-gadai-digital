import type { Id } from "../convex/_generated/dataModel";
import { MAX_FILE_BYTES } from "./kyc";

/**
 * Unggah SATU berkas dokumen ke Convex storage lewat URL unggah dari server.
 *
 * Dipakai bersama oleh panel admin (foto KTP data diri, selfie KTP, bukti
 * penghasilan pengajuan manual) supaya batas ukuran, cara POST, dan pesan
 * galatnya sama — bukan tiga salinan yang bisa berbeda diam-diam. Izin unggah
 * tetap ditentukan server: `mintaUrl` adalah mutation admin yang digerbang.
 *
 * `periksa` opsional dipanggil dengan storage id SETELAH unggah berhasil.
 * Situs pemanggil mengisinya dengan action pemeriksa ISI berkas (magic bytes,
 * `berkasIdentitas.periksaIsiBerkasKyc`); berkas yang mengaku gambar tetapi
 * isinya bukan gambar tertolak sebelum ditautkan ke pengajuan. Helper ini
 * sendiri tetap murni (tanpa Convex) lewat callback tersebut.
 */
export async function unggahDokumen(
  file: File,
  mintaUrl: () => Promise<string>,
  label = "Berkas",
  periksa?: (id: Id<"_storage">) => Promise<void>,
): Promise<Id<"_storage">> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`${label} maksimal ${Math.round(MAX_FILE_BYTES / (1024 * 1024))} MB.`);
  }
  const url = await mintaUrl();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  // Status HTTP diperiksa lebih dulu: badan galat dari server/storage sering
  // kosong atau bukan JSON, dan `res.json()` akan melempar SyntaxError yang
  // membingungkan sebelum pesan galat yang benar sempat dipakai.
  if (!res.ok) {
    throw new Error(`${label} gagal diunggah. Coba lagi.`);
  }
  // Badan sukses yang bukan JSON (proxy/redirect) tetap dianggap gagal bersih
  // alih-alih meledak dengan galat parsing.
  let json: { storageId?: Id<"_storage"> } | null = null;
  try {
    json = (await res.json()) as { storageId?: Id<"_storage"> };
  } catch {
    json = null;
  }
  if (!json || !json.storageId) {
    throw new Error(`${label} gagal diunggah. Coba lagi.`);
  }
  if (periksa !== undefined) await periksa(json.storageId);
  return json.storageId;
}
