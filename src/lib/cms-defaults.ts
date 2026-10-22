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
    isi: "Lihat perhitungan pinjaman dan gadai serta status di dashboard. Semua angka adalah catatan ledger internal PINDAI; perpindahan dana ditangani di luar aplikasi.",
    cta: "Lihat kalkulator",
  },
  float: {
    judul: "Pengajuan cepat",
    isi: "Catat pengajuan dan pantau statusnya di dashboard akun Anda.",
    cta: "Mulai pengajuan",
  },
  hero: {
    badge: "Pinjaman & ledger internal",
    judul1: "Pinjam & Gadai Digital",
    judul2: "Transparan",
    sub: "Lihat perhitungan pinjaman, gadai, dan cicilan di ledger internal PINDAI. Persetujuan dan status dicatat di aplikasi; perpindahan dana ditangani di luar aplikasi.",
    cta1: "Ajukan Pinjaman",
    cta2: "Gadaikan Barang",
  },
  chips: {
    chip1: { label: "Pinjaman tunai", nilai: "Tanpa agunan" },
    chip2: { label: "Barang gadai", nilai: "Catatan aplikasi" },
  },
  layanan: {
    judul: "Dua fitur, satu ledger internal",
    sub: "Semua nominal, biaya, dan status di halaman ini adalah catatan internal PINDAI.",
    pinjamanJudul: "Pinjaman Tunai Digital",
    pinjamanIsi:
      "Skema harian: potongan di muka 2% (biaya admin; platform 0%), bunga flat 26–40% sesuai nominal dan tenor, total kewajiban 126–140% dari pokok. Skema bulanan 1, 3, atau 6 bulan: DP 0%, potongan di muka 2% dari pokok (biaya admin pada tenor 3/6, biaya layanan pada tenor 1), bunga flat mengikuti tarif akun (bawaan 30%/35%/30% per bulan untuk tenor 1/3/6 bulan), dan biaya admin cicilan 2% dari nominal cicilan pada setiap pembayaran bulanan. Semua angka dihitung aplikasi dan dana tidak dikirim ke mana pun. Jadwal angsuran bersifat ilustrasi; ledger mencatat pelunasan penuh saat jatuh tempo.",
    pinjamanCta: "Ajukan sekarang",
    gadaiJudul: "Gadai Digital",
    gadaiIsi:
      "Catat data barang dan nilai taksiran untuk pengajuan gadai. Sewa modal 5–10% per 30 hari dihitung dari sisa pokok. Status tercatat di ledger internal; pemeriksaan fisik, penitipan barang, dan perpindahan dana ditangani di luar aplikasi.",
    gadaiCta: "Gadaikan barang",
  },
} as const;
