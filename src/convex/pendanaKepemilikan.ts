/**
 * Aturan TUNGGAL kepemilikan pinjaman oleh penyedia dana.
 *
 * Sebelumnya dua jalur data saling lepas:
 *  - `loans.pendanaId` — model baru (1 pinjaman = 1 pendana), diubah admin dari
 *    ruang penyedia dana;
 *  - tabel warisan `fundings`/`kreditFundings` — model alokasi lama, masih
 *    dibaca dompet/portofolio penyedia dana lewat `danaId`.
 *
 * Akibatnya penggantian pendana bisa membuat pinjaman tetap tampil di
 * portofolio pendana lama, dan tidak muncul di pendana baru. Modul ini
 * menyatukan aturannya supaya kedua sisi menjawab hal yang sama:
 *
 *  1. Bila `loans.pendanaId` terisi, IA yang menentukan pemiliknya — nama
 *     tampil dan baris alokasi lama tidak bisa "mengklaim" pinjaman itu.
 *  2. Bila `pendanaId` kosong (data warisan), nama tampil dicocokkan persis
 *     dengan nama akun atau emailnya.
 *
 * Aturan ini murni pembacaan: tidak ada saldo, ledger, maupun baris alokasi
 * yang diubah di sini.
 */
import type { Id } from "./_generated/dataModel";

/** Kunci nama tampil sebuah akun: nama (di-trim) dan emailnya. */
export function kunciNamaPendana(user: {
  name?: string;
  email?: string;
}): Set<string> {
  const kunci = new Set<string>();
  const nama = user.name?.trim();
  if (nama) kunci.add(nama);
  if (user.email) kunci.add(user.email);
  return kunci;
}

/** Apakah `loan` milik akun `userId` menurut aturan tunggal di atas? */
export function pinjamanMilikPendana(
  loan: { pendanaId?: Id<"users">; pendanaNama?: string },
  userId: Id<"users">,
  namaKunci: Set<string>,
): boolean {
  if (loan.pendanaId !== undefined) return loan.pendanaId === userId;
  return loan.pendanaNama !== undefined && namaKunci.has(loan.pendanaNama);
}

/**
 * Apakah pinjaman ini sudah punya pemilik kanonik yang BUKAN `userId`?
 * Dipakai untuk mengabaikan baris alokasi lama yang sudah tidak berlaku,
 * supaya pinjaman tidak dihitung dua kali atau tertinggal di pendana lama.
 */
export function dipindahKePendanaLain(
  loan: { pendanaId?: Id<"users"> },
  userId: Id<"users">,
): boolean {
  return loan.pendanaId !== undefined && loan.pendanaId !== userId;
}
