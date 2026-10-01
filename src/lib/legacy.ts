/**
 * Istilah lama era "Pendana" — dikumpulkan di SATU modul ini.
 *
 * Semua nilai di bawah SUDAH TERSIMPAN di database (role pengguna, nama kolom
 * dan index, prefix akun ledger, kode audit) atau menjadi URL publik lama.
 * JANGAN diubah tanpa migrasi data, karena:
 *   - dokumen lama akan gagal validasi skema Convex;
 *   - `ledger_entries` bersifat append-only (Rule 5.1), sehingga baris lama
 *     tetap memakai string ini dan saldo tidak akan cocok bila prefix diubah;
 *   - riwayat audit memakai kode ini.
 *
 * Kode baru memakai istilah "Dana". Literal lama hanya hidup di sini sebagai
 * jembatan kompatibilitas data — bukan sebagai nama produk, komponen, atau
 * field internal baru.
 */

/** Role lama pada `users.role`; dinormalkan menjadi Peminjam saat aktivitas berikutnya. */
export const ROLE_LAMA = "pendana" as const;

/** Nama kolom alokasi dana pada deposits/withdrawals/fundings/kreditFundings. */
export const KOLOM_DANA = "pendanaId" as const;

/** Nama index pada kolom {@link KOLOM_DANA} di tabel yang sama. */
export const INDEX_DANA = "by_pendana" as const;

/** Prefix akun dompet dana pada `ledger_entries.akun` (mis. `<prefix><userId>`). */
export const PREFIX_AKUN_DANA = "pendana:WALLET:" as const;

/** Rute lama ruang penyedia dana — hanya dipakai untuk pengalihan URL. */
export const RUTE_LAMA_DANA = "/pendana" as const;

/** Kode audit trail lama. */
export const AUDIT_SETORAN_DICocokkan = "setoran_pendana_dicocokkan" as const;
export const AUDIT_SETORAN_DITOLAK = "setoran_pendana_ditolak" as const;
export const AUDIT_GADAI_DANA = "gadai_pendanaan" as const;

/** Nama akun ledger dompet dana untuk satu pengguna. */
export function akunDompetDana(id: string): string {
  return `${PREFIX_AKUN_DANA}${id}`;
}
