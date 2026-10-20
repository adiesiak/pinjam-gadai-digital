/**
 * Teks email pengingat tagihan PINDAI (murni, tanpa server maupun React).
 *
 * Isi email memakai kalimat pengingat yang SAMA dengan WhatsApp: pemanggil
 * mengirim teks yang sudah pasti benar (nominal, tanggal, nomor referensi),
 * lalu modul ini hanya menambahkan subjek dan keterangan siapa yang mengatur
 * kanalnya. Tidak ada angka atau status yang dikarang di sini.
 */

/** Subjek ringkas; nama produk di depan supaya mudah dikenali di kotak masuk. */
export function subjekEmailPengingat(judul: string): string {
  return `PINDAI · ${judul.trim()}`;
}

/**
 * Badan email dalam teks biasa.
 *
 * Teks biasa dipilih, bukan HTML: isinya hanya satu paragraf pengingat dan satu
 * keterangan pilihan kanal, jadi tidak ada tata letak yang perlu dipertahankan —
 * dan tidak ada gambar/tombol yang bisa gagal dimuat di klien email mana pun.
 */
export function isiEmailPengingat(isi: string): string {
  const pesan = isi.trim();
  return [
    pesan,
    "",
    "Email ini dikirim karena pengingat lewat email diaktifkan untuk akun PINDAI Anda.",
    "Pengingat ini diatur tim PINDAI. Hubungi tim PINDAI bila Anda tidak ingin menerimanya.",
  ].join("\n");
}
