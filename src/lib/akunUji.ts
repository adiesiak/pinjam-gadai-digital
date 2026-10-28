/**
 * Identitas tetap AKUN UJI PINJAMAN — satu tempat untuk seed, pagar pratinjau,
 * dan gerbang lokasi.
 *
 * Akun ini milik tim, bukan nasabah: dibuat tanpa email dan tanpa nomor
 * WhatsApp di `users`, jadi tidak ada jalur masuk selain pratinjau admin.
 * Karena itu ia boleh dipakai mencoba alur uang dari ujung ke ujung, sementara
 * pratinjau ke akun nasabah sungguhan tetap hanya untuk melihat.
 *
 * Nomor WhatsApp dipakai sebagai penanda karena unik dan berindeks; nama ikut
 * dicocokkan supaya nomor yang kebetulan dipakai orang lain tidak dianggap
 * akun uji.
 */
export const AKUN_UJI = {
  nama: "AKUN UJI PINJAMAN",
  nik: "3200000000000002",
  nomorWhatsApp: "628000000002",
} as const;
