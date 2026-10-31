/**
 * Aturan modal "Perjanjian Pinjaman" (dipakai juga oleh perjanjian gadai) —
 * logika & kelas MURNI tanpa React/DOM, supaya perilakunya bisa diuji tanpa
 * kanvas maupun peramban.
 *
 * Modal ini sengaja mengisi kotak persetujuan SECARA OTOMATIS (saat dibuka dan
 * saat tanda tangan dibubuhkan), jadi yang tersisa untuk dijaga hanyalah satu
 * hal: kapan tombol [Setujui Perjanjian] boleh ditekan. Aturan itu di sini,
 * bukan tersebar di dalam JSX. Tanda tangan elektronik bersifat opsional karena
 * dokumen juga disiapkan untuk ditandatangani manual setelah diunduh.
 *
 * Kotak persetujuan tetap berupa kotak centang biasa: pengisian otomatis adalah
 * kenyamanan, bukan pencabutan kendali — peminjam masih bisa membatalkannya
 * sendiri sebelum menekan tombol, dan server tetap menerima `persetujuanPeminjam`
 * hanya dari tindakan menekan tombol itu.
 */

/**
 * Kelas tombol utama perjanjian: Deep Emerald solid, teks putih, dan kursor
 * tangan saat aktif.
 *
 * `cursor-pointer` ditulis eksplisit karena Tailwind v4 tidak lagi memberi
 * `cursor: pointer` bawaan pada `<button>` — tanpa itu tombol aktif terbaca
 * sebagai tombol mati. Saat `disabled` varian tombol sudah memasang
 * `pointer-events-none`, jadi `disabled:cursor-not-allowed` hanya menegaskan
 * tampilannya bagi pembaca layar/pointer yang tetap menyorot.
 */
export const KELAS_TOMBOL_SETUJU_PERJANJIAN =
  "min-w-52 cursor-pointer rounded-xl border-0 bg-emerald-800 text-white hover:bg-emerald-900 disabled:cursor-not-allowed";

/**
 * Tanda tangan siap dikirim: ada goresan BARU di kanvas, ATAU gambar tanda
 * tangan yang sudah termuat dari perjanjian ini.
 *
 * Kasus kedua nyata dan penting: perjanjian yang sudah punya gambar lama tetapi
 * catatan persetujuannya belum untuk versi syarat sekarang. Tanpa jalur ini,
 * peminjam dipaksa menggambar ulang hanya untuk memperbarui catatan aplikasi —
 * sekarang gambar lama itu boleh dipakai apa adanya, dan satu klik cukup.
 */
export function tandaTanganSiap(
  hasSignature: boolean,
  tandaTanganTersimpan: string | null,
): boolean {
  return hasSignature || tandaTanganTersimpan !== null;
}

/**
 * Tombol kirim aktif. Persetujuan terisi otomatis saat modal dibuka, sehingga
 * satu klik pada tombol langsung mencatat persetujuan ke Convex
 * (`simpanTandaTangan`). Tanda tangan elektronik TIDAK wajib: perjanjian dapat
 * disetujui lebih dulu, diunduh, lalu ditandatangani manual. `busy` tetap
 * mengunci tombol selama mutasi berjalan supaya tidak terkirim dua kali.
 */
export function bolehKirimPerjanjian(args: {
  busy: boolean;
  consentChecked: boolean;
}): boolean {
  return !args.busy && args.consentChecked;
}
