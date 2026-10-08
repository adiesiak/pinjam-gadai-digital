/**
 * Nama orang — satu bentuk kanonik untuk SELURUH aplikasi.
 *
 * Kenapa berkas ini ada: nama peminjam muncul di banyak tempat (antrean admin,
 * ruang penyedia dana, dashboard, kontrak, pesan WhatsApp, audit trail). Sebelum
 * ini sebagian tempat menulisnya apa adanya / Title Case dan sebagian
 * menampilkannya HURUF BESAR, sehingga orang yang sama tampak berbeda di dua
 * layar — dan data yang tersimpan pun ikut bercampur.
 *
 * Aturannya sekarang satu: **nama disimpan dan ditampilkan HURUF BESAR**, sama
 * seperti data pinjaman di ruang penyedia dana. Fungsi di sini dipakai baik oleh
 * jalur tulis (data diri, pengajuan manual) maupun jalur tampil (komponen), jadi
 * baris lama yang masih huruf kecil pun ikut tampil seragam tanpa migrasi.
 *
 * Murni: tanpa React, tanpa Convex, tanpa DOM — bisa diuji sebagai skrip biasa
 * (`bun src/lib/nama.test.ts`).
 */

/** Rapikan spasi berlebih di dalam & di ujung nama. */
function rapikan(nama: string): string {
  return nama.trim().replace(/\s+/g, " ");
}

/**
 * Bentuk kanonik satu nama: spasi dirapikan, hurufnya BESAR semua.
 * Nama kosong tetap menjadi string kosong (pemanggil yang memutuskan fallback).
 */
export function namaHurufBesar(nama: string): string {
  return rapikan(nama).toUpperCase();
}

/**
 * Nama tampilan dari daftar kandidat: kandidat PERTAMA yang berisi dipakai
 * (mis. nama di data pinjaman lebih dulu, baru nama akun), dalam HURUF BESAR.
 * `fallback` dikembalikan apa adanya bila semua kandidat kosong.
 */
export function namaTampil(
  kandidat: Array<string | null | undefined>,
  fallback = "TANPA NAMA",
): string {
  for (const kandidat_ of kandidat) {
    if (typeof kandidat_ === "string" && rapikan(kandidat_) !== "") {
      return namaHurufBesar(kandidat_);
    }
  }
  return fallback;
}

/** True bila teks ini sudah berbentuk kanonik (dipakai untuk membersihkan data). */
export function sudahHurufBesar(nama: string): boolean {
  return namaHurufBesar(nama) === nama;
}
