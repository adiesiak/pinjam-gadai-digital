/**
 * Token "ingat perangkat ini" — disimpan di localStorage perangkat.
 *
 * Nilai aslinya HANYA ada di sini; server menyimpan hash-nya saja. Token
 * membuat perangkat yang sudah lolos TOTP melewati gate TOTP sampai
 * kedaluwarsa (30 hari) atau dicabut dari panel keamanan.
 */

const KUNCI = "pindai.perangkatPercaya.v1";

/** Token perangkat tersimpan, atau null bila tidak ada / storage tak tersedia. */
export function ambilTokenPerangkat(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const nilai = window.localStorage.getItem(KUNCI);
    return nilai !== null && nilai.trim() !== "" ? nilai : null;
  } catch {
    return null;
  }
}

/** Simpan token perangkat (dipanggil setelah TOTP sukses dengan "ingat"). */
export function simpanTokenPerangkat(token: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KUNCI, token);
  } catch {
    // Storage diblokir/penuh — perangkat tidak akan diingat, fitur tetap aman.
  }
}

/** Hapus token perangkat dari perangkat ini. */
export function lupakanTokenPerangkat(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KUNCI);
  } catch {
    // Tidak ada yang bisa dilakukan; token server tetap dapat dicabut dari panel.
  }
}
