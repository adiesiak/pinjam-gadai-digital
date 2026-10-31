/**
 * Daftar sub-tab antrean admin (pinjaman & gadai) — DATA MURNI, tanpa JSX.
 *
 * Dulu daftarnya tinggal di `src/pages/admin/queue-views.tsx`. Karena uji
 * render perlu memastikan setiap status punya sub-tabnya sendiri, daftarnya
 * harus diekspor dari sana — dan itu membuat berkas komponen mengekspor
 * konstanta (peringatan `react-refresh/only-export-components`).
 *
 * Dipindah ke sini supaya:
 * - komponen cukup merender, data penyaring cukup diuji sebagai skrip biasa;
 * - aturan "setiap status punya tepat satu sub-tab" bisa diperiksa langsung
 *   terhadap `LOAN_STATUS_FLOW` / status gadai, tanpa membawa React.
 *
 * Tanpa tab "Disalurkan", pinjaman yang dananya sudah tersalurkan tidak cocok
 * dengan sub-tab mana pun: barisnya hanya terlihat di "Semua", dan jumlah
 * seluruh sub-tab status tidak pernah sama dengan "Semua".
 *
 * Labelnya mengikuti EMPAT status pinjaman yang dipakai aplikasi (Ditinjau,
 * Disalurkan, Ditolak, Lunas) — lihat `lib/statusPinjaman.ts`. Tahap tinjauan
 * memakai satu sub-tab untuk ketiga ejaan tersimpannya.
 */
import type { LoanRow, OpsiSubTab, PawnRow } from "@/components/admin/admin-shared";
import { CONTRACT_TERMS_VERSION } from "@/lib/contract";
import { diTahapTinjauan } from "@/lib/statusPinjaman";

/** Perjanjian sudah disetujui tetapi belum punya bukti tanda tangan apa pun. */
function ttdTertunda(row: {
  persetujuanSyaratPada?: number | null;
  persetujuanSyaratVersi?: string | null;
  persetujuanMode?: "elektronik" | "manual" | null;
  tandaTanganAda?: boolean;
  ttdManualAda?: boolean;
}): boolean {
  const ttdElektronik =
    row.persetujuanMode !== "manual" && row.tandaTanganAda === true;
  return (
    row.persetujuanSyaratPada != null &&
    row.persetujuanSyaratVersi === CONTRACT_TERMS_VERSION &&
    !ttdElektronik &&
    row.ttdManualAda !== true
  );
}

/**
 * Sub-tab antrean pinjaman: memisahkan catatan yang masih perlu ditindak dari
 * yang sudah selesai, supaya satu daftar tidak mencampur keduanya. Urutannya
 * mengikuti alur status di `LOAN_STATUS_FLOW`.
 */
export const SUB_TAB_PINJAMAN: readonly OpsiSubTab<LoanRow>[] = [
  {
    id: "semua",
    label: "Semua",
    hint: "Seluruh catatan pinjaman, apa pun statusnya.",
    cocok: () => true,
  },
  {
    id: "belum-didanai",
    label: "Ditinjau",
    hint: "Pengajuan pada tahap tinjauan — belum ada dana yang tersalurkan.",
    cocok: (pinjaman) => diTahapTinjauan(pinjaman.status),
  },
  {
    id: "didanai",
    label: "Disalurkan",
    hint: "Dana sudah ditandai tersalurkan dan pinjaman sedang berjalan — belum lunas.",
    cocok: (pinjaman) => pinjaman.status === "didanai",
  },
  {
    id: "ttd-tertunda",
    label: "TTD tertunda",
    hint: "Perjanjian sudah disetujui, tetapi belum ada tanda tangan elektronik maupun bukti TTD manual.",
    cocok: ttdTertunda,
  },
  {
    id: "ditolak",
    label: "Ditolak",
    hint: "Catatan pengajuan yang tidak dilanjutkan.",
    cocok: (pinjaman) => pinjaman.status === "ditolak",
  },
  {
    id: "dibatalkan",
    label: "Dibatalkan",
    hint: "Pengajuan yang ditarik nasabah sebelum dana ditandai tersalurkan — bukan utang.",
    cocok: (pinjaman) => pinjaman.status === "dibatalkan",
  },
  {
    id: "lunas",
    label: "Lunas",
    hint: "Kewajiban yang sudah selesai di ledger internal.",
    cocok: (pinjaman) => pinjaman.status === "lunas",
  },
];

/** Sub-tab antrean gadai, mengikuti alur status di `PAWN_STATUS_FLOW`. */
export const SUB_TAB_GADAI: readonly OpsiSubTab<PawnRow>[] = [
  {
    id: "semua",
    label: "Semua",
    hint: "Seluruh catatan gadai, apa pun statusnya.",
    cocok: () => true,
  },
  {
    id: "belum-aktif",
    label: "Belum aktif",
    hint: "Diajukan, sedang dinilai, dan disetujui internal — barang belum tercatat aktif di ledger.",
    cocok: (gadai) =>
      gadai.status === "diajukan" ||
      gadai.status === "sedang_dinilai" ||
      gadai.status === "disetujui",
  },
  {
    id: "berjalan",
    label: "Berjalan",
    hint: "Gadai aktif dan yang menunggu pembaruan status pelepasan barang.",
    cocok: (gadai) => gadai.status === "aktif" || gadai.status === "menunggu_pelepasan",
  },
  {
    id: "ttd-tertunda",
    label: "TTD tertunda",
    hint: "Akad sudah disetujui, tetapi belum ada tanda tangan elektronik maupun bukti TTD manual.",
    cocok: ttdTertunda,
  },
  {
    id: "ditolak",
    label: "Ditolak",
    hint: "Pengajuan gadai yang tidak dilanjutkan.",
    cocok: (gadai) => gadai.status === "ditolak",
  },
  {
    id: "lunas",
    label: "Lunas",
    hint: "Kewajiban lunas dan barang sudah ditandai dilepas di ledger internal.",
    cocok: (gadai) => gadai.status === "lunas_dilepas",
  },
];
