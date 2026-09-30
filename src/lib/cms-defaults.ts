/**
 * Teks default CMS landing — satu sumber untuk client (nilai awal editor
 * & fallback render) selaras dengan fallback server di announcements.ts.
 */
export const CMS_DEFAULTS = {
  bar: {
    teks: "Pinjaman, gadai, dan alokasi dicatat di ledger internal — tanpa transfer eksternal.",
    tautan: "/auth",
  },
  popup: {
    judul: "Jelajahi PINDAI",
    isi: "Lihat perhitungan pinjaman dan gadai serta catatan status di dashboard. Angka dan aksi hanya memperbarui ledger internal: tidak ada transfer bank/e-wallet, pembayaran eksternal, verifikasi Pendana, atau penitipan fisik barang.",
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
    sub: "Jelajahi perhitungan pinjaman, gadai, dan alokasi pendanaan dalam ledger internal. Persetujuan, saldo, dan status bukan bukti transfer, pembayaran eksternal, verifikasi identitas, atau penitipan barang.",
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
      "Perhitungan harian: potongan admin 3% + platform 2%, bunga 30%, dan total kewajiban 130% dari pokok; plafon serta tenor mengikuti pengaturan aplikasi. Skema bulanan 1–6 bulan memakai DP 0%, biaya layanan 3% diamortisasi, dan bunga menurun 10%/8%/7,5% per bulan. Angka dihitung aplikasi dari data pengajuan dan dana tidak dikirim ke mana pun. Jadwal angsuran bulanan bersifat ilustrasi dan ledger mencatat pelunasan penuh sekaligus saat jatuh tempo.",
    pinjamanCta: "Ajukan sekarang",
    gadaiJudul: "Gadai Digital",
    gadaiIsi:
      "Catat informasi barang dan nilai taksiran untuk pengajuan gadai. Perhitungan sewa modal 5–10% per 30 hari menggunakan sisa pokok. Status dan pembayaran hanya tercatat di ledger internal; aplikasi tidak membuktikan pemeriksaan fisik, penitipan barang, transfer, atau pengembalian barang.",
    gadaiCta: "Gadaikan barang",
  },
} as const;
