import type { Id } from "../convex/_generated/dataModel";
import { MAX_FILE_BYTES } from "./kyc";

/**
 * Unggah SATU berkas dokumen ke Convex storage lewat URL unggah dari server.
 *
 * Dipakai bersama oleh panel admin (foto KTP data diri, selfie KTP, bukti
 * penghasilan pengajuan manual) supaya batas ukuran, cara POST, dan pesan
 * galatnya sama — bukan tiga salinan yang bisa berbeda diam-diam. Izin unggah
 * tetap ditentukan server: `mintaUrl` adalah mutation admin yang digerbang.
 */
export async function unggahDokumen(
  file: File,
  mintaUrl: () => Promise<string>,
  label = "Berkas",
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
  const json = (await res.json()) as { storageId?: Id<"_storage"> };
  if (!res.ok || !json.storageId) {
    throw new Error(`${label} gagal diunggah. Coba lagi.`);
  }
  return json.storageId;
}
