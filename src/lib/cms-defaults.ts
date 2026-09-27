/**
 * Teks default CMS landing — satu sumber untuk client (nilai awal editor
 * & fallback render) selaras dengan fallback server di announcements.ts.
 */
export const CMS_DEFAULTS = {
  bar: {
    teks: "Ajukan pinjaman tunai atau gadai digital dari rumah. Daftar gratis dan mulai hari ini.",
    tautan: "/auth",
  },
  popup: {
    judul: "Ajukan dari Rumah",
    isi: "Ajukan pinjaman tanpa agunan atau gadai barang dalam beberapa menit. Barang gadai tersimpan di brankas custody, pengingat jatuh tempo berjalan otomatis.",
    cta: "Coba simulasi",
  },
  float: {
    judul: "Pengajuan cepat",
    isi: "Unggah dokumen dari rumah dan pantau status pengajuan langsung dari dashboard.",
    cta: "Mulai pengajuan",
  },
  hero: {
    badge: "Pinjaman & gadai digital — didanai Pendana terverifikasi",
    judul1: "Pinjam & Gadai Digital",
    judul2: "Transparan",
    sub: "Ajukan pinjaman tanpa agunan atau gadai barang dari rumah: taksiran resmi petugas, barang tersimpan di Brankas Custody, dan pengingat jatuh tempo otomatis.",
    cta1: "Ajukan Pinjaman",
    cta2: "Gadaikan Barang",
  },
  chips: {
    chip1: { label: "Pinjaman tunai", nilai: "Tanpa agunan" },
    chip2: { label: "Barang gadai", nilai: "Brankas custody" },
  },
  layanan: {
    judul: "Dua layanan, satu standar",
    sub: "Keduanya memakai mesin perhitungan dan jurnal audit yang sama.",
    pinjamanJudul: "Pinjaman Tunai Digital",
    pinjamanIsi:
      "Tanpa agunan, tenor 30/60/90 hari. Ajukan dari rumah, dana langsung ke rekening, dan pelunasan dipantau pengingat otomatis. Total pelunasan 130% dari pokok (Bunga 30% — hak Pendana).",
    pinjamanCta: "Ajukan sekarang",
    gadaiJudul: "Gadai Digital",
    gadaiIsi:
      "Elektronik, kendaraan, perhiasan, hingga properti. Petugas menaksir resmi di lokasi Anda, pantau lewat live location, dan barang tersimpan di Brankas Custody. Sewa modal 5–10% per 30 hari dari sisa pokok terbaru. Sisa pokok Rp0, barang siap diambil.",
    gadaiCta: "Gadaikan barang",
  },
} as const;
