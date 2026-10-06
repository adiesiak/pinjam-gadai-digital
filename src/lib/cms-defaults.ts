/**
 * Teks default CMS landing — satu sumber untuk client (nilai awal editor
 * & fallback render) selaras dengan fallback server di announcements.ts.
 */
export const CMS_DEFAULTS = {
  bar: {
    teks: "Pinjaman, gadai, dan cicilan dicatat di ledger internal PINDAI.",
    tautan: "/auth",
  },
  popup: {
    judul: "Jelajahi PINDAI",
    isi: "Lihat perhitungan pinjaman dan gadai serta catatan status di dashboard. Angka dan aksi memperbarui ledger internal PINDAI; perpindahan dana ditangani di luar aplikasi.",
    cta: "Lihat kalkulator",
  },
  float: {
    judul: "Pengajuan cepat",
    isi: "Catat informasi pengajuan dan pantau status internal melalui dashboard akun Anda.",
    cta: "Mulai pengajuan",
  },
  hero: {
    badge: "Pinjaman & ledger internal",
    judul1: "Pinjam & Gadai Digital",
    judul2: "Transparan",
    sub: "Jelajahi perhitungan pinjaman, gadai, dan cicilan dalam ledger internal. Persetujuan, status, dan pembayaran manual via QRIS/bank tercatat pada ledger internal PINDAI.",
    cta1: "Ajukan Pinjaman",
    cta2: "Gadaikan Barang",
  },
  chips: {
    chip1: { label: "Pinjaman tunai", nilai: "Tanpa agunan" },
    chip2: { label: "Barang gadai", nilai: "Catatan aplikasi" },
  },
  layanan: {
    judul: "Dua fitur, satu ledger internal",
    sub: "Semua nominal, skema biaya, dan status yang terlihat adalah pencatatan internal PINDAI.",
    pinjamanJudul: "Pinjaman Tunai Digital",
    pinjamanIsi:
      "Perhitungan harian: potongan di muka 2% (biaya admin; biaya platform dihapus), bunga 30%, dan total kewajiban 130% dari pokok; plafon serta tenor mengikuti pengaturan aplikasi. Skema bulanan 1–6 bulan memakai DP 0% dan potongan di muka 2% (biaya admin pada tenor 3/6, biaya layanan pada tenor 1) dari pokok, dan bunga flat dari pokok penuh — 30% per bulan (tenor 1 bulan), 25% (tenor 3 bulan), 20% (tenor 6 bulan). Angka dihitung aplikasi dari data pengajuan dan dana tidak dikirim ke mana pun. Jadwal angsuran bulanan bersifat ilustrasi dan ledger mencatat pelunasan penuh sekaligus saat jatuh tempo.",
    pinjamanCta: "Ajukan sekarang",
    gadaiJudul: "Gadai Digital",
    gadaiIsi:
      "Catat informasi barang dan nilai taksiran untuk pengajuan gadai. Perhitungan sewa modal 5–10% per 30 hari menggunakan sisa pokok. Status dan pembayaran tercatat di ledger internal; pemeriksaan fisik dan penitipan barang ditangani di luar aplikasi.",
    gadaiCta: "Gadaikan barang",
  },
} as const;
