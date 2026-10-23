import { namaHurufBesar } from "@/lib/nama";

import type { KreditRowData } from "./KreditReviewDialog";
import { KreditStatusBadge, STATUS_LABEL_KREDIT } from "./KreditStatusBadge";
import { TombolAksiAntrean, type BarisAntrean } from "./TabelAntrean";

/**
 * Satu pengajuan kredit → satu baris tabel antrean.
 *
 * Dipisah dari panel supaya pemetaan kolomnya bisa diuji tanpa Convex, dan
 * supaya panel hanya mengurus pencarian + pemilihan baris. Rincian yang tidak
 * muat di kolom (DP, cicilan, NIK) tetap dibuka di dialog review.
 */
export function barisKredit(
  r: KreditRowData,
  onOpen: (row: KreditRowData) => void,
): BarisAntrean {
  const perluKeputusan = r.status === "diajukan" || r.status === "sedang_ditinjau";
  const labelAksi = perluKeputusan ? "Proses" : "Detail";
  return {
    id: r._id,
    nama: namaHurufBesar(r.namaLengkap),
    email: r.emailPemohon,
    referensi: r.nomorReferensi,
    nominal: r.hargaBarang,
    keperluan: `${r.namaBarang} · ${r.merchant}`,
    waktu: r._creationTime,
    statusTeks: STATUS_LABEL_KREDIT[r.status] ?? r.status,
    status: <KreditStatusBadge status={r.status} />,
    aksi: (
      <TombolAksiAntrean
        label={labelAksi}
        utama={perluKeputusan}
        onClick={() => onOpen(r)}
        ariaLabel={`${labelAksi} pengajuan ${r.nomorReferensi}`}
      />
    ),
  };
}
