/**
 * Kontrak berkas backup JSON PINDAI.
 *
 * Satu daftar untuk dua pihak: server memakainya untuk menolak nama tabel yang
 * tidak dikenal saat membaca per halaman, dan panel Ekspor memakainya untuk
 * merangkai halaman menjadi satu berkas. Kalau daftarnya ditulis dua kali,
 * cepat atau lambat backup kehilangan satu tabel hanya karena satu sisi lupa
 * diperbarui — dan arsip yang bolong tidak terlihat bolong.
 *
 * Urutan tabel dipertahankan seperti snapshot satu-tabel sebelumnya, dan
 * `LABEL_JUMLAH` mempertahankan nama kunci ringkasan yang sudah dipakai
 * (`ledgerEntries` untuk tabel `ledger_entries`) supaya pembaca berkas backup
 * lama tetap menemukan angka yang sama di tempat yang sama.
 */

export const TABEL_SNAPSHOT = [
  "loans",
  "pawns",
  "kreditBarang",
  "pawnPayments",
  "kreditPayments",
  "deposits",
  "fundings",
  "kreditFundings",
  "withdrawals",
  "transferPendana",
  "manualPaymentReceipts",
  "waLogs",
  "lokasiJejak",
  "pengingat",
  "lokasiPeringatan",
  "pengumuman",
  "ledger_entries",
  "auditLog",
  "users",
] as const;

export type TabelSnapshot = (typeof TABEL_SNAPSHOT)[number];

/** Tabel yang barisnya memuat id dokumen penyimpanan, jadi tautannya ikut backup. */
export const SUMBER_DOKUMEN = [
  "loans",
  "pawns",
  "manualPaymentReceipts",
  "deposits",
  "qris",
] as const;

export type SumberDokumen = (typeof SUMBER_DOKUMEN)[number];

/** Kunci `jumlah` pada berkas backup untuk tiap tabel. */
export const LABEL_JUMLAH: Record<TabelSnapshot, string> = {
  loans: "loans",
  pawns: "pawns",
  kreditBarang: "kreditBarang",
  pawnPayments: "pawnPayments",
  kreditPayments: "kreditPayments",
  deposits: "deposits",
  fundings: "fundings",
  kreditFundings: "kreditFundings",
  withdrawals: "withdrawals",
  transferPendana: "transferPendana",
  manualPaymentReceipts: "manualPaymentReceipts",
  waLogs: "waLogs",
  lokasiJejak: "lokasiJejak",
  pengingat: "pengingat",
  lokasiPeringatan: "lokasiPeringatan",
  pengumuman: "pengumuman",
  ledger_entries: "ledgerEntries",
  auditLog: "auditLog",
  users: "users",
};

/** Nama tabel snapshot yang sah — dipakai server sebelum membaca apa pun. */
export function apakahTabelSnapshot(nilai: string): nilai is TabelSnapshot {
  return (TABEL_SNAPSHOT as readonly string[]).includes(nilai);
}

/** Sumber dokumen yang sah untuk pengambilan tautan unduhan. */
export function apakahSumberDokumen(nilai: string): nilai is SumberDokumen {
  return (SUMBER_DOKUMEN as readonly string[]).includes(nilai);
}
